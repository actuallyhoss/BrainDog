/**
 * The self-host's own action pass and a script trial, over a Directory with one run of the month left: whichever starts
 * first runs, the other is held, and the month closes at 15,000 (`loop/research-batch-thirty-nine-audit.md` finding 4).
 *
 * TWO DOORS ASKED ONE LEDGER, AND NEITHER SAW THE OTHER'S RUN IN HAND. `scriptTrial` reserves its run in the runtime's
 * `IN_FLIGHT` while its sandbox works, and the pass built `pass()` with no count, so it neither reserved its run there
 * nor saw a trial's. The audit measured both orders with the pass assembled by hand as `server.ts` assembled it: one run
 * left, both ran, and the month closed at 15,001 of 15,000. This drives the pass `server.ts` builds itself
 * (`running.poll()`), and the trial through the record's own `scriptTry`, so what is held is the wiring and not a copy.
 *
 * A SELF-HOST IS NEVER HELD IN USE, AND THE TEST SAYS SO. `act` puts its record on `selfhost`, which has no allowance,
 * at the first pass (`actions.test.ts`, "A SELF-HOST IS NEVER HELD"), so on a real self-host neither door is ever
 * refused and the race cannot overspend anything. The record is put back on `hosted` after that first pass, which is
 * the one way to give this host a last run, because the property is the shared count and the Worker runs the same
 * `pass(IN_FLIGHT)` over records that are on `hosted`.
 *
 * THE TWO REQUESTS ARE HELD OPEN BY THE TEST. `send` stands for the socket, and each host's request waits on a gate
 * until the other door has been asked, so "while the first is in flight" is a fact of the test and not a timing guess.
 *
 * AND THE PASS IS AWAITED BY WHAT IT COUNTED, NOT BY `poll()`. Traced: with the trial in its sandbox, the pass that ran
 * the balance poll was one the kernel's doorbell had started (`tail` to `wake` to `poll`), and the test's own `poll()`
 * found it busy and returned at once. Read then, the month missed the pass's run in four runs of five, so each case waits
 * until the Directory has counted the balance poll, run or held, before it reads anything.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ALLOWANCE } from '@braindog/record/directory';

import { IN_FLIGHT, type Send } from '../src/actions.ts';
import { start } from '../src/server.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const NOW = Date.UTC(2026, 8, 22, 12);
const BALANCE = 'https://api.example.test';
const RATES = 'https://rates.example.test';
const RUNS = ALLOWANCE.hosted?.runs ?? 0;

const NOTES = { id: 'register.notes', kind: 'register' as const, body: { id: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never };
const BALANCE_POLL = {
  id: 'ingest.balance',
  kind: 'ingest' as const,
  body: { ingest: 'balance', channel: 'poll', url: `${BALANCE}/v1/balance`, every: '1h', extract: { what: { after: 'balance ' } }, writes: { register: 'notes' } } as never,
};

/** A draft an agent brings to `script_try`: one fetch to a host the scheduled pass does not call, and nothing written. */
const DRAFT = {
  script: 'fx-rate',
  runs: { every: '1d' },
  egress: [RATES],
  keys: [],
  reads: [],
  writes: [],
  source: `export default async function run(ctx) {
  await ctx.fetch('${RATES}/usd');
}`,
};

/** A gate a request waits on, opened by the test. */
function gate() {
  let open!: () => void;
  const shut = new Promise<void>((resolve) => (open = resolve));
  return { shut, open };
}

async function stack() {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-pass-inflight-'));
  const gates = new Map<string, ReturnType<typeof gate>>();
  const reached = new Map<string, ReturnType<typeof gate>>();
  const sent: string[] = [];
  const send: Send = async (url) => {
    sent.push(url.host);
    reached.get(url.host)?.open();
    await gates.get(url.host)?.shut;
    return new Response(url.host === 'api.example.test' ? 'balance 120' : '{"usd":1}');
  };
  const running = await start({
    file: join(dir, 'record.brain'),
    directory: join(dir, 'directory.sqlite'),
    port: 0,
    host: '127.0.0.1',
    now: () => NOW,
    pollMs: 0,
    actions: { send, resolve: async () => [{ address: '203.0.113.10', family: 4 }] },
  });
  const person = running.directory.person$('ada@example.com', 'Ada');
  assert.ok(person.ok);
  const owner = person.value.id;
  assert.ok((await running.api.createRecord({ id: REC, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: owner, email: 'ada@example.com', name: 'Ada' } })).ok);
  assert.ok(running.directory.provision({ slug: 'the-studio', email: 'ada@example.com', record: REC }).ok);

  /* THE FIRST PASS, WITH NOTHING DUE, puts the record on `selfhost` once for the life of the process. It goes back on
     `hosted`, and the month is filled to one run short of the allowance. */
  await running.poll();
  assert.ok(running.directory.setPlan(REC, 'hosted').ok);
  const month = () => {
    const usage = running.directory.usage(owner, { from: '2026-09-01', to: '2026-09-30' });
    assert.ok(usage.ok);
    return usage.value.records[0]?.month.used.runs ?? 0;
  };
  const short = RUNS - 1 - month();
  assert.ok(running.directory.meter(REC, { event: 'e_month', at: new Date(NOW - 3_600_000).toISOString(), ingest: 'earlier', scope: 'global', usage: { runs: short, requests: 0, bytes: 0, ms: 0, failures: 0, held: 0 } }).ok);
  assert.equal(month(), RUNS - 1);
  assert.equal(running.directory.mayRun(REC, 'balance'), null, 'the record has no run left before the race starts');
  assert.ok((await running.api.kernel.install([NOTES, BALANCE_POLL])).ok);

  return {
    running,
    sent,
    month,
    /** The request to `host` waits until the test opens it; `reached` resolves the moment it is sent. */
    hold(host: string) {
      const g = gate();
      const r = gate();
      gates.set(host, g);
      reached.set(host, r);
      return { reached: r.shut, release: g.open };
    },
    /** Until the Directory has counted `action`, run or held, whichever pass ran it. */
    async counted(action: string) {
      for (let tries = 0; tries < 500; tries++) {
        const usage = running.directory.usage(owner, { from: '2026-09-01', to: '2026-09-30' });
        if (usage.ok && usage.value.records[0]?.actions.some((a) => a.action === action)) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.fail(`${action} was never counted`);
    },
    trial: () => running.api.scriptTry({ body: DRAFT }, { principal: { kind: 'person', id: owner, level: 'owner' } }),
    /** What the pass did with the balance poll: the last `pull` event's outcome. */
    polled: () => {
      const row = running.sql.one<{ to_v: string }>("SELECT to_v FROM event WHERE kind = 'pull' ORDER BY ts DESC, id DESC LIMIT 1");
      return (JSON.parse(row?.to_v ?? '{}') as { outcome?: string }).outcome;
    },
    async close() {
      await running.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const outcome = (v: unknown): string => (v !== null && typeof v === 'object' ? ('held' in v ? 'held' : 'refused' in v ? 'refused' : 'ran') : String(v));

test('THE PASS FIRST: its run is in hand while it sends, so the trial is held and the month closes at the allowance', async () => {
  const s = await stack();
  try {
    const balance = s.hold('api.example.test');
    const passing = s.running.poll();
    await balance.reached;
    const tried = await s.trial();
    assert.ok(tried.ok, JSON.stringify(tried));
    balance.release();
    await passing;
    await s.counted('balance');

    assert.deepEqual({ sent: s.sent, month: s.month() }, { sent: ['api.example.test'], month: RUNS }, 'the trial was sent beside a pass that held the last run');
    assert.equal(outcome(tried.value), 'held', JSON.stringify(tried.value));
    /* AND THE PASS GAVE ITS PLACE BACK, or the record would be one run short for the life of the process. */
    assert.equal(IN_FLIGHT.count(REC), 0);
  } finally {
    await s.close();
  }
});

test('THE TRIAL FIRST: its run is in hand while its sandbox works, so the pass is held and the month closes at the allowance', async () => {
  const s = await stack();
  try {
    const rates = s.hold('rates.example.test');
    const trying = s.trial();
    /* OR THE TRIAL ENDS WITHOUT SENDING, which is a held trial and a failure below rather than a test that never ends. */
    await Promise.race([rates.reached, trying]);
    await s.running.poll();
    await s.counted('balance');
    rates.release();
    const tried = await trying;
    assert.ok(tried.ok, JSON.stringify(tried));

    assert.deepEqual({ sent: s.sent, month: s.month() }, { sent: ['rates.example.test'], month: RUNS }, 'the pass was sent beside a trial that held the last run');
    assert.equal(outcome(tried.value), 'ran', JSON.stringify(tried.value));
    assert.equal(s.polled(), 'held');
    assert.equal(IN_FLIGHT.count(REC), 0);
  } finally {
    await s.close();
  }
});
