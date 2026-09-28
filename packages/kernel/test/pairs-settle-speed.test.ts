/**
 * The install pass that settles a list under a new `pairs:` finishes inside one request, whatever the ledger's shape.
 *
 * `loop/research-batch-sixty-five-audit.md` finding 3 (probe A2). The pass was measured at 1.8 to 2.9 s on 10,000 rows of
 * fifty amounts, and it grew much faster than the ledger once most rows shared a size: 10,000 rows of three amounts in
 * one year took 80 to 146 s, and one amount did not finish in 20 minutes. A Durable Object request gets 30 s, so a pack
 * update changing `pairs:` on such a record was killed on every retry and could never be installed. Re-measured for this
 * repair: rows of one amount packed as densely took 23 s for 200, 279 s for 500 and 1,659 s for 2,000, and this file's
 * first case was stopped at its 120 s deadline. Each `settle` call walked the same 140 rows again for one new seed,
 * reading every window afresh, and asked `markPinned` 622,665 times for 200 rows. After it: 2.8 s for this file's first
 * case, 0.13 s for the 500 rows.
 *
 * RUN IN A WORKER THREAD WITH A DEADLINE, because the pass is synchronous and a test timeout cannot stop it: the red run
 * of this file would otherwise have sat for twenty minutes before saying anything.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';

import { openRecord, type Declaration, type Entry, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 30, 12);
const PERSON = { actor: 'p_1' };
/* MONEY-CORE 2.2.0'S CLAUSE, as the audit's probe installed it. */
const TIGHT = {
  on: ['abs(amount)'],
  opposite: 'direction',
  across: 'account',
  within: '4d',
  mark: 'transfer',
  where: { all: [{ field: 'state', is: 'cleared' }, { field: 'party', empty: true }] },
};

const LEDGER = (pairs?: unknown): Declaration => ({
  id: 'register.transactions',
  kind: 'register',
  body: {
    id: 'transactions',
    name: 'Transactions',
    title: 'what',
    ...(pairs === undefined ? {} : { pairs }),
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'on', type: 'day', index: true, required: true },
      { id: 'direction', type: 'enum', values: ['in', 'out'], required: true },
      { id: 'amount', type: 'money', required: true },
      { id: 'account', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['pending', 'cleared', 'void'], default: 'cleared', required: true },
      { id: 'party', type: 'text' },
      { id: 'transfer', type: 'bool', default: false },
    ],
  } as never,
});

const made = (r: unknown): Entry => {
  const x = r as { ok: boolean; value: Entry; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/**
 * The audit's ledger: a third of the rows the two legs of a move from CIB to HSBC a day or so apart, the rest single card
 * rows in any of four accounts, every amount one of `sizes` round ones. The same seed writes the same ledger every run.
 */
function fill(write: (fields: Record<string, unknown>) => void, rows: number, days: number, sizes: number): void {
  let seed = 3;
  const next = () => ((seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648), seed / 2_147_483_648);
  const day = (d: number) => new Date(Date.UTC(2025, 0, 1) + d * 86_400_000).toISOString().slice(0, 10);
  const size = () => ({ amount: (1 + Math.floor(next() * sizes)) * 50_000, currency: 'EGP' });
  const accounts = ['cib', 'hsbc', 'card', 'nbe'];
  for (let written = 0; written < rows; ) {
    const d = Math.floor(next() * days);
    if (next() < 0.33) {
      const amount = size();
      write({ what: 'Move', on: day(d), direction: 'out', amount, account: 'cib' });
      write({ what: 'Move', on: day(d + Math.floor(next() * 2)), direction: 'in', amount, account: 'hsbc' });
      written += 2;
    } else {
      write({ what: 'Card', on: day(d), direction: next() < 0.6 ? 'out' : 'in', amount: size(), account: accounts[Math.floor(next() * 4)]! });
      written += 1;
    }
  }
}

type Shape = { rows: number; days: number; sizes: number };
type Timed = { ms: number; paired: number };

/** One ledger written with no `pairs:`, then the install that gives it one, timed. */
async function installPass({ rows, days, sizes }: Shape): Promise<Timed> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([LEDGER()])).ok);
  k.transaction(() => fill((fields) => made(k.create('transactions', fields, PERSON)), rows, days, sizes));
  const t = performance.now();
  const out = await k.install([LEDGER(TIGHT)]);
  const ms = performance.now() - t;
  assert.ok(out.ok, JSON.stringify(out));
  const paired = sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM entry WHERE json_extract(fields, '$._pair') IS NOT NULL")!.n;
  sql.close();
  return { ms, paired };
}

if (!isMainThread) {
  installPass(workerData as Shape).then((timed) => parentPort!.postMessage(timed));
} else {
  /** `installPass` in a worker, stopped at `deadline` ms. */
  const inWorker = (shape: Shape, deadline: number): Promise<Timed | 'stopped'> =>
    new Promise((resolve, reject) => {
      const worker = new Worker(new URL(import.meta.url), { workerData: shape });
      const stop = setTimeout(() => void worker.terminate().then(() => resolve('stopped')), deadline);
      worker.once('message', (timed: Timed) => {
        clearTimeout(stop);
        void worker.terminate().then(() => resolve(timed));
      });
      worker.once('error', (e) => {
        clearTimeout(stop);
        reject(e);
      });
    });

  /* THE BOUND STARTED AT A THIRD OF THE REQUEST (10 s), so a CI runner two or three times slower than this machine
     still fit. Under the CHECK pass's `--workspace-concurrency=2`, many workspaces' tests run at once and this
     worker thread contends with them for CPU: the install pass measured 11.6 s against that 10 s bound, though it
     is still 2.8 s on an unloaded run. Doubled off that failure, so a CI runner under real contention still fits
     comfortably inside a request (30 s) while a return to the old O(n^2) walk (minutes, or 20 minutes unfinished)
     still trips it. The deadline adds the fill, which writes 10,000 rows through `create` before the clock starts. */
  const BOUND_MS = 20_000;

  test('10,000 ROWS OF ONE AMOUNT IN ONE YEAR, the shape that did not finish in 20 minutes, settle well inside a request', async () => {
    const timed = await inWorker({ rows: 10_000, days: 365, sizes: 1 }, 120_000);
    assert.notEqual(timed, 'stopped', 'the install pass did not finish in 120 s, fill included');
    const { ms } = timed as Timed;
    assert.ok(ms < BOUND_MS, `the install pass took ${(ms / 1000).toFixed(1)} s, against ${BOUND_MS / 1000} s`);
  });

  test('THE SAME LEDGER, SETTLED BY THE INSTALL, IS THE ONE PAIRING EACH ROW AS IT ARRIVED LEAVES, on a shape dense enough that no set is whole', async () => {
    /* 120 ROWS OF ONE AMOUNT IN 24 DAYS: about forty-five of a size in each nine-day window, so a set runs past
       `SET_MOST` and is answered leg by leg, which is the path the pass's shared windows and skipped rows change. */
    const shape = { rows: 120, days: 24, sizes: 1 };
    const records = await Promise.all([undefined, TIGHT].map(async (pairs) => {
      const sql = openSqlite();
      const k = await openRecord(sql, fixedClock(NOW));
      assert.ok((await k.install([LEDGER(pairs)])).ok);
      return { k, sql };
    }));
    const [later, always] = records as [{ k: Kernel; sql: ReturnType<typeof openSqlite> }, { k: Kernel; sql: ReturnType<typeof openSqlite> }];
    const ids: [string, string][] = [];
    fill((fields) => ids.push([made(later.k.create('transactions', fields, PERSON)).id, made(always.k.create('transactions', fields, PERSON)).id]), shape.rows, shape.days, shape.sizes);
    assert.ok((await later.k.install([LEDGER(TIGHT)])).ok);
    const partnerIn = (k: Kernel, id: string, other: Map<string, string>) => {
      const to = k.get(id)!.fields._pair;
      return typeof to === 'string' ? other.get(to)! : null;
    };
    const asLater = new Map(ids.map(([a], i) => [a, String(i)]));
    const asAlways = new Map(ids.map(([, b], i) => [b, String(i)]));
    const a = ids.map(([id]) => [partnerIn(later.k, id, asLater), later.k.get(id)!.fields.transfer]);
    const b = ids.map(([, id]) => [partnerIn(always.k, id, asAlways), always.k.get(id)!.fields.transfer]);
    assert.deepEqual(a, b);
    assert.ok(a.some(([to]) => to !== null), 'nothing paired on either record, so the two agreeing proves nothing');
    later.sql.close();
    always.sql.close();
  });
}
