/**
 * `/usage`'s reader, run over the answer the Directory itself builds.
 *
 * WHY THIS EXISTS. `actions.ts` writes the ledger's shape out by hand, because the web does not depend on
 * `@braindog/record`, and the copy drifted: it read Slash as `included`, `used` and `packs` while the Directory answered
 * `asks`, `neurons` and `days`. Every test of the reader passed, because every test handed it the reader's own idea of
 * the answer, and his `/usage` said "BrainDog could not reach this record" over a `toLocaleString` on nothing.
 *
 * SO THE ANSWER HERE IS NEVER WRITTEN BY HAND. A real Directory, on the same in-memory SQLite its own tests use, counts
 * runs and Slash's asks for a record and answers `usage` exactly as `GET /account/usage` does; the answer goes through
 * JSON, as it does on the wire, and the reader draws the month from it. A second pass hands the reader the same answer
 * behind a proxy that notes every key it asks for that the answer does not hold. The day the two shapes part, by a key
 * renamed on either side, this goes red here rather than on a screen.
 *
 * THE DIRECTORY IS LOADED BY ITS FILE'S URL, at run time, and only here. A static relative import from `apps/web` into
 * `packages/record` is a cross-package edge the graph gate refuses (31 §3 layer 3), and rightly for anything the web
 * ships; this is a test driving the core, as a pack's tests do, and nothing it loads reaches the bundle.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readUsage, usageFromLedger, words, type AccountUsage, type Fetch } from './actions.ts';

const ROOT = new URL('../../../../../', import.meta.url);

type Answered<T> = { ok: true; value: T } | { ok: false; refusal: { code: string; fix: string } };

/** The part of `createDirectory`'s answer this test calls, as `packages/record/src/directory.ts` declares it. */
type Directory = {
  person$(email: string, name: string): Answered<unknown>;
  provision(o: { slug: string; email: string; plan?: string }): Answered<{ record: string }>;
  meter(record: string, run: { event: string; at: string; ingest: string; scope: string; usage: Record<string, number> }): Answered<string>;
  meterSlash(record: string, days: { day: string; asks: number; neurons: number }[]): Answered<unknown>;
  usage(person: string, range: { from: string; to: string }): Answered<unknown>;
};
type Sql = { one<T>(q: string, ...args: unknown[]): T | undefined; close(): void };

const value = <T>(r: Answered<T>): T => {
  assert.ok(r.ok, r.ok ? '' : `${r.refusal.code}: ${r.refusal.fix}`);
  return r.value;
};

const SEPT = Date.UTC(2026, 8, 15, 12);

/**
 * The Directory's answer for one person's month: two records, one on Cloud with runs in two projects and Slash's asks
 * over two days, one on Free with nothing run. Through JSON, as the wire carries it.
 */
async function answered(): Promise<{ wire: unknown; sql: Sql }> {
  const { createDirectory } = (await import(new URL('packages/record/src/directory.ts', ROOT).href)) as {
    createDirectory: (sql: Sql, clock: { now(): number }) => Directory;
  };
  const { openSqlite } = (await import(new URL('packages/kernel/test/sqlite.ts', ROOT).href)) as { openSqlite: () => Sql };
  const sql = openSqlite();
  const d = createDirectory(sql, { now: () => SEPT });
  value(d.person$('ada@example.com', 'Ada'));
  const studio = value(d.provision({ slug: 'the-studio', email: 'ada@example.com' })).record;
  value(d.provision({ slug: 'side-thing', email: 'ada@example.com', plan: 'free' }));
  const usage = { runs: 1, requests: 3, bytes: 900, ms: 40, failures: 0, held: 0 };
  let n = 0;
  for (const [scope, ingest, at] of [
    ['kiln', 'stripe-balance', '2026-09-02T10:00:00.000Z'],
    ['kiln', 'stripe-balance', '2026-09-09T10:00:00.000Z'],
    ['global', 'rates', '2026-09-15T11:00:00.000Z'],
  ] as const)
    assert.equal(value(d.meter(studio, { event: `ev_${++n}`, at, ingest, scope, usage })), 'counted');
  value(d.meterSlash(studio, [{ day: '2026-09-14', asks: 40, neurons: 12_000 }, { day: '2026-09-15', asks: 1, neurons: 300 }]));
  const person = sql.one<{ owner: string }>('SELECT owner FROM dir_record WHERE id = ?', studio)!.owner;
  const said = value(d.usage(person, { from: '2026-09-01', to: '2026-09-15' }));
  return { wire: JSON.parse(JSON.stringify(said)), sql };
}

/**
 * The answer behind a proxy that writes down every key the reader asks for and the answer does not hold, as a path with
 * each list's place said `[]`: `records[].slash.cap`.
 */
function watched<T>(answer: T): { answer: T; missing: Set<string> } {
  const missing = new Set<string>();
  const wrap = (v: unknown, path: string): unknown => {
    if (typeof v !== 'object' || v === null) return v;
    return new Proxy(v, {
      get(target, key, receiver) {
        const got: unknown = Reflect.get(target, key, receiver);
        if (typeof key === 'symbol') return got;
        const index = Array.isArray(target) && /^\d+$/u.test(key);
        if (!(key in target) && !index) missing.add(`${path}${path ? '.' : ''}${key}`);
        return wrap(got, index ? `${path}[]` : `${path}${path ? '.' : ''}${key}`);
      },
    });
  };
  return { answer: wrap(answer, '') as T, missing };
}

/**
 * The keys the reader may ask for that the Directory never sends, and why each is allowed to be absent. Anything else
 * the reader asks for and does not find is the two shapes parting.
 */
const NOT_SENT = new Map([
  ['records[].slash.cap', "an allowance of Slash's asks, the record's own `ask_cap`, which the Directory never reads; absent, the line says none"],
]);

test("THE READER DRAWS THE DIRECTORY'S OWN ANSWER: the plan line and the Slash line, and no key it asks for is missing", async () => {
  const { wire, sql } = await answered();
  const { answer, missing } = watched(wire as AccountUsage);
  const view = usageFromLedger(answer, '2026-09', '2026-09-15');
  const past = usageFromLedger(answer, '2026-09', undefined, undefined, false);
  sql.close();

  const strays = [...missing].filter((k) => !NOT_SENT.has(k));
  assert.deepEqual(strays, [], `the reader asked for keys the Directory does not answer: ${strays.join(', ')}`);
  assert.equal(past.records.length, 2);

  const [studio, side] = view.records;
  assert.equal(studio?.name, 'the-studio');
  assert.equal(studio?.plan, 'Cloud');
  assert.equal(studio?.planLine, 'On Cloud: 15,000 runs, 150,000 requests, 1.00 GB fetched and 50 hours of run time a month.');
  assert.equal(studio?.slash, 'Slash was asked 41 times this month, and the model did 12,300 units of work answering.');
  assert.deepEqual(studio?.asks, { asks: 41, neurons: 12_300, cap: null });
  assert.equal(studio?.meters[0]?.line, 'Runs 3 of 15,000');
  assert.equal(view.totals.runs, 3);
  assert.deepEqual(view.days, [{ day: '2026-09-02', runs: 1 }, { day: '2026-09-09', runs: 1 }, { day: '2026-09-15', runs: 1 }]);
  assert.deepEqual(
    view.groups.map((g) => [g.name, g.totals.runs]),
    [['the-studio · Kiln', 2], [words.everywhereUsage, 1]],
  );
  assert.equal(side?.plan, 'Free');
  assert.equal(side?.slash, 'Slash has no questions counted this month.');
});

test('THE WHOLE READ, OVER THE WIRE: the Directory\'s answer from `/account/usage` draws a month, never a fault', async () => {
  const { wire, sql } = await answered();
  sql.close();
  const io: Fetch = async (url) => {
    const path = url.split('?')[0];
    if (path === '/account/usage') return new Response(JSON.stringify({ ok: true, value: wire }), { status: 200, headers: { 'content-type': 'application/json' } });
    throw new TypeError('fetch failed');
  };
  const read = await readUsage(io, SEPT);
  assert.equal(read.ok, true, JSON.stringify(read));
  assert.ok(read.ok === true && read.view.from === 'ledger' && read.view.records[0]?.slash?.startsWith('Slash was asked 41 times'));
});

test('THE ALLOWED ABSENCES ARE STILL ABSENT: the day the Directory sends one, it leaves this list', async () => {
  const { wire, sql } = await answered();
  sql.close();
  const r = (wire as AccountUsage).records[0] as Record<string, unknown> & { slash: Record<string, unknown> };
  assert.ok('extra' in r, 'the Directory answers extra usage, and the reader draws it');
  assert.ok(!('cap' in r.slash), "the Directory answers an allowance of Slash's asks now: take it out of NOT_SENT");
});
