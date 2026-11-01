/**
 * The usage ledger, per account, in the Directory.
 *
 * WHAT IS HELD HERE IS WHAT BILLING WOULD STAND ON. A run counted twice is a bill somebody disputes, a run
 * never counted is a meter that lies, and a limit reached in silence is an action that stopped with no
 * reason anyone can find. Each of those is a test. The last one runs the kernel's runner against the
 * Directory the way a host wires them, and holds the record's own events equal to the ledger.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Execute } from '@braindog/kernel';

import { createRecordApi } from '../src/index.ts';
import { ALLOWANCE, DIRECTORY_VERSION, createDirectory, type AccountUsage, type Directory, type Named, type RunUsage } from '../src/directory.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

const SEPT = Date.UTC(2026, 8, 15, 12);

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};
const refusal = (r: unknown) => {
  const x = r as { ok: boolean; refusal: { code: string; fix: string; at?: string } };
  assert.equal(x.ok, false, 'this was supposed to be refused');
  return x.refusal;
};

function ledger(start = SEPT): { d: Directory; sql: NodeSql; clock: { now: () => number; set: (ms: number) => void }; record: string } {
  let now = start;
  const clock = { now: () => now, set: (ms: number) => void (now = ms) };
  const sql = openSqlite();
  const d = createDirectory(sql, clock, undefined, { sells: false });
  value(d.person$('ada@example.com', 'Ada'));
  const made = value<Named>(d.provision({ slug: 'the-studio', email: 'ada@example.com' }));
  return { d, sql, clock, record: made.record };
}

const zero = { runs: 0, requests: 0, bytes: 0, ms: 0, failures: 0, held: 0 };
let seq = 0;
const run = (over: Partial<RunUsage> & { at: string }, usage: Partial<RunUsage['usage']> = {}): RunUsage => ({
  event: `ev_${++seq}`,
  ingest: 'npm-downloads',
  scope: 'global',
  ...over,
  usage: { ...zero, runs: 1, requests: 1, bytes: 100, ms: 20, ...usage },
});

/* ── the migration ───────────────────────────────────────────────────────── */

test('A VERSION-3 DIRECTORY IS BROUGHT FORWARD in one open: every record is hosted, and the ledger exists', async () => {
  const sql = openSqlite();
  sql.exec(`
    CREATE TABLE dir_person (id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT, created_at TEXT NOT NULL, suspended_at TEXT);
    CREATE TABLE dir_record (id TEXT PRIMARY KEY, owner TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, closed_at TEXT);
    CREATE TABLE dir_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO dir_meta (key, value) VALUES ('version', '3');
    PRAGMA user_version = 3;
  `);
  sql.exec("INSERT INTO dir_person (id, email, created_at) VALUES ('p_ada', 'ada@example.com', '2026-01-01T00:00:00.000Z')");
  sql.exec("INSERT INTO dir_record (id, owner, created_at) VALUES ('rec_old', 'p_ada', '2026-01-01T00:00:00.000Z')");

  const d = createDirectory(sql, { now: () => SEPT });
  assert.equal(DIRECTORY_VERSION, 4);
  assert.equal(sql.one<{ value: string }>("SELECT value FROM dir_meta WHERE key = 'version'")?.value, '4');
  assert.equal(sql.one<{ plan: string }>("SELECT plan FROM dir_record WHERE id = 'rec_old'")?.plan, 'hosted');
  assert.equal(value(d.meter('rec_old', run({ at: '2026-09-15T11:00:00.000Z' }))), 'counted');

  /* And opening it again runs no migration: an `ADD COLUMN` run twice would throw out of `createDirectory`. */
  assert.doesNotThrow(() => createDirectory(sql, { now: () => SEPT }));
  sql.close();
});

/* ── counting ────────────────────────────────────────────────────────────── */

test('THE SAME RUN REPORTED TWICE IS COUNTED ONCE, and a run too old to check is not counted at all', async () => {
  const { d, sql, record } = ledger();
  const once = run({ at: '2026-09-15T11:00:00.000Z' }, { requests: 3, bytes: 900, ms: 40 });

  assert.equal(value(d.meter(record, once)), 'counted');
  assert.equal(value(d.meter(record, once)), 'already counted');
  assert.equal(value(d.meter(record, { ...once })), 'already counted');

  const u = value<AccountUsage>(d.usage('p_nobody', { from: '2026-09-01', to: '2026-09-30' }));
  assert.equal(u.records.length, 0, 'somebody who owns nothing saw a record');
  const person = sql.one<{ owner: string }>('SELECT owner FROM dir_record WHERE id = ?', record)!.owner;
  const mine = value<AccountUsage>(d.usage(person, { from: '2026-09-01', to: '2026-09-30' }));
  assert.deepEqual(mine.totals, { runs: 1, requests: 3, bytes: 900, ms: 40, failures: 0, held: 0 });

  assert.equal(value(d.meter(record, run({ at: '2026-08-01T00:00:00.000Z' }))), 'too old');
  assert.equal(refusal(d.meter(record, { ...run({ at: 'yesterday' }) })).code, 'VALUE_MALFORMED');
  assert.equal(refusal(d.meter(record, run({ at: '2026-09-15T11:00:00.000Z' }, { runs: -1 }))).code, 'VALUE_MALFORMED');
  assert.equal(refusal(d.meter('rec_nobody', run({ at: '2026-09-15T11:00:00.000Z' }))).code, 'OUT_OF_BOUNDS');
  sql.close();
});

/* ── limits ──────────────────────────────────────────────────────────────── */

test('AT THE LIMIT AN ACTION WAITS UNTIL THE FIRST OF NEXT MONTH, UTC, and the sentence says which limit', async () => {
  const { d, sql, clock, record } = ledger();
  assert.equal(d.mayRun(record, 'npm downloads'), null);

  const limit = ALLOWANCE.hosted!.runs;
  sql.exec("INSERT INTO dir_usage_day (record, day, scope, action, runs) VALUES (?, '2026-09-02', 'global', 'backfill', ?)", record, limit - 1);
  assert.equal(d.mayRun(record, 'npm downloads'), null, 'the last run of the allowance was held');

  value(d.meter(record, run({ at: '2026-09-15T11:00:00.000Z' })));
  assert.deepEqual(d.mayRun(record, 'npm downloads'), {
    until: Date.UTC(2026, 9, 1),
    say: 'npm downloads is waiting until 1 October. This BrainDog has used its 15,000 runs for September. Nothing you made is touched, and Settings > Billing has more.',
  });

  /* A new month is a new allowance, and December's turns into January of the next year. */
  clock.set(Date.UTC(2026, 9, 1));
  assert.equal(d.mayRun(record, 'npm downloads'), null);

  clock.set(Date.UTC(2026, 11, 20));
  sql.exec("INSERT INTO dir_usage_day (record, day, scope, action, requests) VALUES (?, '2026-12-03', 'studio', 'backfill', ?)", record, ALLOWANCE.hosted!.requests);
  assert.deepEqual(d.mayRun(record, 'stripe balance'), {
    until: Date.UTC(2027, 0, 1),
    say: 'stripe balance is waiting until 1 January. This BrainDog has used its 150,000 requests for December.',
  });

  /* A self-host is counted and never limited. */
  value(d.setPlan(record, 'selfhost'));
  assert.equal(d.mayRun(record, 'stripe balance'), null);
  assert.equal(refusal(d.setPlan(record, 'gold' as never)).code, 'ENUM_VALUE_UNKNOWN');
  assert.equal(d.mayRun('rec_nobody', 'x'), null);
  sql.close();
});

/* ── reading it ──────────────────────────────────────────────────────────── */

test('USAGE IS PER PROJECT, PER ACTION AND PER DAY, the month is the sum of its days, and only the owner’s records show', async () => {
  const { d, sql, record } = ledger();
  const owner = sql.one<{ owner: string }>('SELECT owner FROM dir_record WHERE id = ?', record)!.owner;
  value(d.meter(record, run({ at: '2026-09-14T09:00:00.000Z', scope: 'studio', ingest: 'ping' })));
  value(d.meter(record, run({ at: '2026-09-14T10:00:00.000Z', scope: 'studio', ingest: 'ping' }, { failures: 1 })));
  value(d.meter(record, run({ at: '2026-09-15T09:00:00.000Z', scope: 'global', ingest: 'npm-downloads' })));
  value(d.meter(record, run({ at: '2026-09-15T10:00:00.000Z', scope: 'studio', ingest: 'ping' }, { runs: 0, requests: 0, bytes: 0, ms: 0, held: 1 })));

  /* Somebody else's record, which Ada is a member of and does not own. */
  value(d.person$('bo@example.com'));
  const theirs = value<Named>(d.provision({ slug: 'bo-books', email: 'bo@example.com' }));
  value(d.join(theirs.record, owner));
  value(d.meter(theirs.record, run({ at: '2026-09-15T09:00:00.000Z' })));

  const u = value<AccountUsage>(d.usage(owner, { from: '2026-09-01', to: '2026-09-30' }));
  assert.deepEqual(u.records.map((r) => r.record), [record], 'a record Ada does not own showed in her usage');
  const mine = u.records[0]!;
  assert.equal(mine.slug, 'the-studio');
  assert.equal(mine.plan, 'hosted');
  /* THE DAY THE RECORD WAS MADE, so `/usage` offers no month from before it. */
  const made = sql.one<{ created_at: string }>('SELECT created_at FROM dir_record WHERE id = ?', record)!.created_at;
  assert.equal(mine.since, made.slice(0, 10));
  assert.match(mine.since, /^\d{4}-\d{2}-\d{2}$/u);
  assert.deepEqual(mine.totals, { runs: 3, requests: 3, bytes: 300, ms: 60, failures: 1, held: 1 });
  assert.deepEqual(u.totals, mine.totals);
  assert.deepEqual(mine.projects.map((p) => [p.scope, p.runs]), [['global', 1], ['studio', 2]]);
  assert.deepEqual(mine.actions.map((a) => [a.scope, a.action, a.runs, a.failures, a.held]), [['global', 'npm-downloads', 1, 0, 0], ['studio', 'ping', 2, 1, 1]]);
  assert.deepEqual(mine.days.map((x) => [x.day, x.runs]), [['2026-09-14', 2], ['2026-09-15', 1]]);

  const summed = mine.days.reduce((n, x) => n + x.runs, 0);
  assert.deepEqual([mine.month.month, mine.month.used.runs, summed, mine.month.resets], ['2026-09', 3, 3, '2026-10-01']);
  assert.deepEqual(mine.month.allowance, ALLOWANCE.hosted);

  /* A narrower range is a narrower answer. */
  const one = value<AccountUsage>(d.usage(owner, { from: '2026-09-15', to: '2026-09-15' }));
  assert.equal(one.totals.runs, 1);

  assert.deepEqual([refusal(d.usage(owner, { from: 'last week', to: '2026-09-30' })).at], ['from']);
  assert.equal(refusal(d.usage(owner, { from: '2026-09-30', to: '2026-09-01' })).code, 'OUT_OF_BOUNDS');
  assert.equal(refusal(d.usage(owner, { from: '2025-01-01', to: '2026-09-01' })).code, 'OUT_OF_BOUNDS');
  sql.close();
});

/* ── the runner and the ledger, wired the way a host wires them ──────────── */

const CALL = {
  id: 'ingest.ping',
  kind: 'ingest' as const,
  body: { ingest: 'ping', channel: 'call', url: 'https://hooks.example.test/in', every: '15m', grant: 'hook key', project: 'studio', body: { text: 'hello' } } as never,
};

test('THE LEDGER AGREES WITH THE RECORD’S OWN EVENTS, and a record at its limit waits with a sentence', async () => {
  const clock = fixedClock(SEPT);
  const dirSql = openSqlite();
  const d = createDirectory(dirSql, clock, undefined, { sells: false });
  value(d.person$('ada@example.com'));
  const { record } = value<Named>(d.provision({ slug: 'the-studio', email: 'ada@example.com' }));

  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock });
  assert.ok(
    api.kernel.bindGrant(
      { label: 'hook key', opens: 'hooks.example.test', kind: 'api_token', ciphertext: new Uint8Array([1, 2, 3]), nonce: new Uint8Array([9, 8, 7]), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_2f' },
      'p_1',
    ).ok,
  );
  assert.ok((await api.kernel.install([CALL])).ok);

  /* THE HOST'S TWO CALLS: ask before sending, and count every run the pass hands back. */
  let sent = 0;
  const execute: Execute = async (request) => {
    const hold = d.mayRun(record, request.ingest);
    if (hold) return { status: 0, body: '', bytes: 0, ms: 0, requests: 0, held: hold };
    sent++;
    return { status: 200, body: 'ok', bytes: 2, ms: 4, requests: 1 };
  };
  const pass = async () => {
    const out = await api.kernel.runActions(execute);
    for (const m of out.usage) value(d.meter(record, m));
    return out;
  };

  for (let i = 0; i < 3; i++) {
    await pass();
    clock.advance(20 * 60_000);
  }
  const events = sql
    .all<{ id: string; to_v: string }>("SELECT id, to_v FROM event WHERE kind = 'pull' AND to_v IS NOT NULL")
    .map((e) => ({ id: e.id, runs: (JSON.parse(e.to_v) as { usage: { runs: number } }).usage.runs }));
  const owner = dirSql.one<{ owner: string }>('SELECT owner FROM dir_record WHERE id = ?', record)!.owner;
  const month = () => value<AccountUsage>(d.usage(owner, { from: '2026-09-01', to: '2026-09-30' })).records[0]!;
  assert.equal(sent, 3);
  assert.equal(month().totals.runs, events.reduce((n, e) => n + e.runs, 0), 'the ledger and the record disagree about how many runs there were');
  assert.deepEqual(month().actions.map((a) => [a.scope, a.action, a.runs, a.bytes]), [['studio', 'ping', 3, 6]]);

  /* A host that reports the same events again moves nothing. */
  for (const e of events) assert.equal(value(d.meter(record, { event: e.id, at: new Date(SEPT).toISOString(), ingest: 'ping', scope: 'studio', usage: { ...zero, runs: 1 } })), 'already counted');
  assert.equal(month().totals.runs, 3);

  /* At the limit, the next run is held: nothing sent, the sentence on the record's event, one hold counted. */
  dirSql.exec("INSERT INTO dir_usage_day (record, day, scope, action, runs) VALUES (?, '2026-09-01', 'global', 'backfill', ?)", record, ALLOWANCE.hosted!.runs - 3);
  const held = await pass();
  assert.deepEqual([held.held, sent], [1, 3]);
  const note = sql.one<{ note: string }>("SELECT note FROM event WHERE kind = 'pull' AND to_v IS NOT NULL ORDER BY rowid DESC LIMIT 1")?.note;
  assert.equal(note, 'ping is waiting until 1 October. This BrainDog has used its 15,000 runs for September. Nothing you made is touched, and Settings > Billing has more.');
  assert.deepEqual([month().totals.held, month().month.used.runs], [1, ALLOWANCE.hosted!.runs]);

  /* When the month turns it runs again, on its own. */
  clock.advance(Date.UTC(2026, 9, 1) - clock.now());
  await pass();
  assert.equal(sent, 4);
  sql.close();
  dirSql.close();
});

test('A PASS DOES NOT RUN PAST THE ALLOWANCE: runs already let through this pass count before they are metered', async () => {
  const { d, sql, record } = ledger();
  const limit = ALLOWANCE.hosted!.runs;
  sql.exec("INSERT INTO dir_usage_day (record, day, scope, action, runs) VALUES (?, '2026-09-02', 'global', 'backfill', ?)", record, limit - 2);
  assert.equal(d.mayRun(record, 'npm downloads', 1), null, 'the last run of the allowance was held');
  assert.notEqual(d.mayRun(record, 'npm downloads', 2), null, 'two runs already let through this pass were not counted');
  sql.close();
});
