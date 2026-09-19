/**
 * `pull`: a scheduled fetch of something you already own.
 *
 * THE RECORD NEVER MAKES THE CALL, and almost everything here is a consequence of that. What a fire
 * produces is one outbox row naming the ingest, its cursor and the id of a grant — never its bytes.
 * What comes back is a page and a verdict. And a rejected credential pauses rather than retrying,
 * because eight exponential retries against a bank's auth endpoint is how an account gets locked.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, refused } from '@braindog/ports';

import { FLOOR_MS, applyPull, checkInterval, jitterMs, openRecord, type Declaration, type GrantRow, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const b = (n: number) => new Uint8Array([n, n + 1, 2, 3]);

const CONNECTOR = (over: Record<string, unknown> = {}): Declaration => ({
  id: `ingest.${String(over.ingest ?? 'npm-downloads')}`,
  kind: 'ingest',
  body: {
    ingest: 'npm-downloads',
    channel: 'pull',
    every: '1h',
    extract: {},
    writes: { register: 'notes' },
    ...over,
  } as never,
});

const NOTES: Declaration = {
  id: 'register.notes',
  kind: 'register',
  body: { id: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

type Clockish = ReturnType<typeof fixedClock>;

async function record(decl = CONNECTOR(), withGrant = false): Promise<{ k: Kernel; sql: NodeSql; clock: Clockish; grant?: string }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  assert.ok(
    k.createRecord({ id: ID, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok,
  );

  let grant: string | undefined;
  if (withGrant) {
    const made = k.bindGrant(
      { label: 'npm, read', opens: 'registry.npmjs.example', kind: 'api_token', ciphertext: b(1), nonce: b(9), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_2f' },
      'p_1',
    );
    assert.ok(made.ok, fixOf(made));
    grant = (made.value as GrantRow).id;
  }

  const body = grant ? CONNECTOR({ ...(decl.body as Record<string, unknown>), grant }) : decl;
  assert.ok((await k.install([NOTES, body])).ok);
  return { k, sql, clock, ...(grant === undefined ? {} : { grant }) };
}

/**
 * The connector's own row, moved to a time these tests can reach.
 *
 * AN UPSERT, BECAUSE THE INSTALL ARMS IT NOW. It did not — nothing in any path wrote a `pull` row,
 * so the reader, the handler and the drain dispatcher were all complete and all unreachable, and
 * this helper inserting one is the only reason the suite was ever green. 25 §9: "its first `due_at`
 * at install is `now`."
 */
const arm = (sql: NodeSql, ingest = 'npm-downloads', atMs = NOW, cursor?: string) =>
  sql.exec(
    `INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES ('s_1', ?, 'pull', ?, ?, 'pending', 0)
     ON CONFLICT (kind, key) DO UPDATE SET due_at = excluded.due_at, payload = excluded.payload, state = 'pending', attempts = 0`,
    new Date(atMs).toISOString(),
    ingest,
    JSON.stringify({ ingest, ...(cursor === undefined ? {} : { cursor }) }),
  );

const outbox = (sql: NodeSql) => sql.all<{ kind: string; payload: string }>('SELECT kind, payload FROM outbox');
const row = (sql: NodeSql) => sql.one<{ state: string; due_at: string; payload: string }>("SELECT state, due_at, payload FROM schedule WHERE kind = 'pull'")!;

/* ── the record never makes the call ─────────────────────────────────────── */

test('A FIRE IS ONE OUTBOX ROW, and it carries the grant’s ID and never its bytes', async () => {
  const { k, sql, clock, grant } = await record(CONNECTOR(), true);
  arm(sql, 'npm-downloads', NOW, 'page-2');
  clock.set(NOW + 1000);

  const drained = await k.drain();
  assert.equal(drained.done, 1);
  assert.equal(drained.dead, 0, '`pull` is a kind nothing handles');

  const queued = outbox(sql);
  assert.equal(queued.length, 1);
  assert.equal(queued[0]?.kind, 'pull.fetch');
  const payload = JSON.parse(queued[0]!.payload) as Record<string, unknown>;
  assert.deepEqual(payload, { ingest: 'npm-downloads', cursor: 'page-2', grant });

  /* THE SEALED BYTES ARE NOT IN IT. The runner opens the grant through the record's own vault, under
     a `grant.read` event — so a fetch that reads a credential is a fetch that is on the record. */
  assert.ok(!queued[0]!.payload.includes('ciphertext'));
  assert.ok(!queued[0]!.payload.includes('npm, read'), 'the label rode along with it');
  sql.close();
});

test('and it comes back due an hour later, plus a jitter that is the same every time', async () => {
  const { k, sql, clock } = await record();
  arm(sql);
  clock.set(NOW + 1000);
  await k.drain();

  const after = row(sql);
  assert.equal(after.state, 'pending');
  const gap = Date.parse(after.due_at) - (NOW + 1000);
  assert.ok(gap >= 3_600_000 && gap <= 3_600_000 + 6 * 60_000, `the next run is ${gap}ms away`);
  sql.close();
});

test('JITTER IS DETERMINISTIC, because a gap somebody asks about has to have a reason', () => {
  /* Twenty connectors declaring `every: 1h` become due at the same instant, and one wake then runs
     twenty fetches in one invocation — at fifty pages each that is a thousand subrequests, exactly
     the paid ceiling. Random jitter spreads them and makes "why was there a gap at four"
     unanswerable. */
  const a = jitterMs(ID, 'npm-downloads', 3_600_000);
  assert.equal(jitterMs(ID, 'npm-downloads', 3_600_000), a, 'the same connector jittered differently twice');
  assert.notEqual(jitterMs(ID, 'stripe-charges', 3_600_000), a, 'two connectors landed on the same offset');
  assert.notEqual(jitterMs('rec_other', 'npm-downloads', 3_600_000), a, 'two records landed on the same offset');

  // The window is a tenth of the interval, clamped between thirty seconds and fifteen minutes.
  const spread = Array.from({ length: 40 }, (_, i) => jitterMs(ID, `c${i}`, 3_600_000));
  assert.ok(Math.max(...spread) <= 6 * 60_000);
  assert.ok(new Set(spread).size > 30, 'the offsets are not well spread');
  assert.ok(jitterMs(ID, 'x', 60_000) <= 30_000, 'a short interval still gets at least a thirty-second window');
});

/* ── the floor ───────────────────────────────────────────────────────────── */

test('A MINIMUM INTERVAL, REFUSED BEFORE IT IS INSTALLED', () => {
  // A floor enforced at fire time is a floor somebody finds out about after writing the declaration
  // and waiting for the first run.
  assert.equal(checkInterval({ ingest: 'x', every: '1h' }).ok, true);
  assert.equal(checkInterval({ ingest: 'x', every: '15m' }).ok, true);

  const tooOften = checkInterval({ ingest: 'x', every: '5m' });
  assert.equal(tooOften.ok, false);
  assert.match(fixOf(tooOften), /fifteen minutes/);

  /* A PROVIDER'S OWN FLOOR WINS WHEN IT IS HIGHER. Banks are hard-floored at six hours by law, and a
     connector that polled one every minute would be closed by the bank rather than by us. */
  const bank = checkInterval({ ingest: 'bank', every: '1h', floor: '6h' });
  assert.equal(bank.ok, false);
  assert.match(fixOf(bank), /provider's own floor/);
  assert.equal(checkInterval({ ingest: 'bank', every: '6h', floor: '6h' }).ok, true);

  assert.equal(checkInterval({ ingest: 'x', every: 'hourly' }).ok, false);
  assert.equal(FLOOR_MS, 15 * 60_000);
});

/* ── what comes back ─────────────────────────────────────────────────────── */

test('A PAGE COMES BACK AND THE CURSOR MOVES WITH IT', async () => {
  const { k, sql } = await record();
  arm(sql, 'npm-downloads', NOW, 'page-1');
  assert.ok(k.applyPull({ ingest: 'npm-downloads', outcome: 'ok', cursor: 'page-2' }).ok);

  const after = row(sql);
  assert.equal(after.state, 'pending');
  assert.equal((JSON.parse(after.payload) as { cursor: string }).cursor, 'page-2');
  sql.close();
});

test('and the RUNNER’S `due_at` wins, because a provider that says "come back at four" knows something', async () => {
  // A rate limit, a nightly window, a batch that is not ready. The record's interval is the fallback.
  const { k, sql } = await record();
  arm(sql);
  const at = NOW + 4 * 3_600_000;
  assert.ok(k.applyPull({ ingest: 'npm-downloads', outcome: 'ok', dueAtMs: at }).ok);
  assert.equal(Date.parse(row(sql).due_at), at);
  sql.close();
});

test('A REJECTED CREDENTIAL PAUSES AND IS NEVER RETRIED', async () => {
  /* A 401 is a fact about the key rather than a transient failure, and eight exponential retries
     against a bank's auth endpoint is how an account gets locked. */
  const { k, sql, grant } = await record(CONNECTOR(), true);
  arm(sql);
  sql.exec("UPDATE schedule SET payload = ? WHERE kind = 'pull'", JSON.stringify({ ingest: 'npm-downloads', grant }));

  assert.ok(k.applyPull({ ingest: 'npm-downloads', outcome: 'paused', error: 'the token was rejected' }).ok);

  assert.equal(row(sql).state, 'paused');
  assert.ok(k.grant(grant!)?.stale_at, 'the credential was not marked stale');

  const note = sql.one<{ actor: string; note: string; target: string }>("SELECT actor, note, target FROM event WHERE kind = 'pull'")!;
  assert.equal(note.actor, 'ingest:npm-downloads');
  assert.match(note.note, /the token was rejected/);
  assert.match(note.note, /will not retry until somebody rebinds it/);
  assert.equal(note.target, `grant:${grant}`);
  sql.close();
});

test('and a paused row is never claimed, so it costs nothing until somebody rebinds it', async () => {
  const { k, sql, clock } = await record();
  arm(sql);
  sql.exec("UPDATE schedule SET state = 'paused' WHERE kind = 'pull'");
  clock.set(NOW + 3 * 3_600_000);

  await k.drain();
  assert.equal(row(sql).state, 'paused', 'a paused connector was claimed anyway');
  assert.equal(outbox(sql).length, 0, 'a paused connector queued a fetch');
  sql.close();
});

test('a connector whose CREDENTIAL is gone pauses rather than fetching without one', async () => {
  const { k, sql, clock, grant } = await record(CONNECTOR(), true);
  arm(sql);
  assert.ok(k.revokeGrant(grant!, 'p_1').ok);
  clock.set(NOW + 1000);

  const drained = await k.drain();
  assert.equal(drained.failed, 0, 'a revoked credential was a failure rather than a pause');
  assert.equal(row(sql).state, 'paused');
  assert.equal(outbox(sql).length, 0, 'it queued a fetch it cannot authenticate');
  assert.match(sql.one<{ note: string }>("SELECT note FROM event WHERE kind = 'note' AND actor = 'ingest:npm-downloads'")?.note ?? '', /credential it uses is gone/);
  sql.close();
});

test('and a connector whose declaration is gone is dropped rather than fired', async () => {
  const { k, sql, clock } = await record();
  arm(sql);
  assert.ok((await k.retire(['ingest.npm-downloads'])).ok);
  clock.set(NOW + 1000);

  const drained = await k.drain();
  assert.equal(drained.dead, 0, 'a retired connector was a failure rather than a drop');
  assert.equal(outbox(sql).length, 0);
  sql.close();
});

test('applyPull on a connector nobody has is a refusal, not a silent nothing', async () => {
  const { k, sql } = await record();
  const out = k.applyPull({ ingest: 'nonesuch', outcome: 'ok' });
  assert.ok(refused(out));
  assert.equal(out.refusal.code, 'OUT_OF_BOUNDS');
  sql.close();
});

test('the function is a function, and it reads the record it was handed', async () => {
  const { k, sql } = await record();
  arm(sql);
  const out = applyPull({ sql, recordId: ID, nowMs: NOW, mint: () => '01ABCDEFGHJKMNPQRSTVWXYZ01', outbox: () => 'x' }, {
    ingest: 'npm-downloads',
    outcome: 'ok',
    cursor: 'page-9',
  });
  assert.ok(out.ok);
  assert.equal((JSON.parse(row(sql).payload) as { cursor: string }).cursor, 'page-9');
  void k;
  sql.close();
});

/* ── the row that fired, and no other ─────────────────────────── */

test('A PAUSE STOPS THE CONNECTOR THAT FIRED, and does not strand it at `firing`', async () => {
  /* It paused by the payload's ingest name while the drain had claimed a ROW. After a rename those
     are two different rows: a connector not due for another half hour was paused, and the one that
     actually fired was left at `firing` — never claimable again, no ladder, no failure, and `done`
     reported to whoever asked. */
  const { k, sql, clock } = await record(CONNECTOR({ grant: 'g_gone' }));
  arm(sql, 'npm-downloads', NOW);
  /* The install armed this row, so its id is the record's rather than this file's. */
  const fired = sql.one<{ id: string }>("SELECT id FROM schedule WHERE kind = 'pull'")!.id;
  sql.exec("UPDATE schedule SET key = 'npm-dl-old' WHERE kind = 'pull'");
  sql.exec(
    "INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES ('s_2', ?, 'pull', 'npm-downloads', ?, 'pending', 0)",
    new Date(NOW + 30 * 60_000).toISOString(),
    JSON.stringify({ ingest: 'npm-downloads' }),
  );

  clock.set(NOW + 1000);
  const drained = await k.drain();
  assert.equal(drained.claimed, 1);
  assert.equal(drained.failed, 0);

  const states = Object.fromEntries(
    sql.all<{ id: string; state: string }>("SELECT id, state FROM schedule WHERE kind = 'pull'").map((r) => [r.id, r.state]),
  );
  assert.equal(states[fired], 'paused', 'the row that fired was left at firing');
  assert.equal(states.s_2, 'pending', 'a connector not due for half an hour was paused');
  sql.close();
});

test('and a payload that is not JSON is a refusal, not an exception', async () => {
  const { k, sql } = await record();
  arm(sql);
  sql.exec("UPDATE schedule SET payload = 'not json' WHERE kind = 'pull'");
  const out = k.applyPull({ ingest: 'npm-downloads', outcome: 'ok' });
  assert.equal(out.ok, false);
  assert.equal((out as { refusal: { code: string } }).refusal.code, 'VALUE_MALFORMED');
  sql.close();
});

test('A CONNECTOR IS ARMED WHEN IT IS DECLARED, and its first run is now', async () => {
  /* Nothing wrote a `pull` row, in any path. `applyPull` reads one, `firePull` fires one and
     `drainSchedule` dispatches one — three complete pieces with no writer, so a bank feed installed,
     printed itself in the install diff's CALLS OUT line, and never fetched anything. Only this
     file's own helper made the suite look green. 25 §9: "its first `due_at` at install is `now`." */
  const { sql, clock } = await record();
  const armed = sql.one<{ key: string; state: string; due_at: string; payload: string }>(
    "SELECT key, state, due_at, payload FROM schedule WHERE kind = 'pull'",
  );
  assert.ok(armed, 'a declared connector was never armed, so it could never run');
  assert.equal(armed.key, 'npm-downloads');
  assert.equal(armed.state, 'pending');
  assert.equal(Date.parse(armed.due_at), clock.now(), 'the first run is not now');
  assert.deepEqual(JSON.parse(armed.payload), { ingest: 'npm-downloads' });
  sql.close();
});

test('AND AN INTERVAL UNDER THE FLOOR DOES NOT INSTALL', async () => {
  /* `checkInterval` has existed with no production caller, so `every: '1m'` against a bank installed
     cleanly. 25 §9 puts the floor at install precisely because one enforced at fire time is one
     somebody finds out about after writing the declaration and waiting for the first run. */
  const { k, sql } = await record();
  const refuse = async (over: Record<string, unknown>) => {
    const out = await k.install([CONNECTOR({ ingest: 'other', ...over })]);
    assert.equal(out.ok, false, `${JSON.stringify(over)} installed`);
    return (out as { refusal: { fix: string; at?: string } }).refusal;
  };

  assert.match((await refuse({ every: '1m' })).fix, /no more often than every fifteen minutes/);
  assert.match((await refuse({ every: 'often' })).fix, /is not an interval/);
  /* AND A PROVIDER'S OWN FLOOR IS HIGHER THAN OURS. Banks are six hours by law. */
  assert.match((await refuse({ every: '1h', floor: '6h' })).fix, /the provider's own floor/);
  assert.ok((await k.install([CONNECTOR({ ingest: 'other', every: '6h', floor: '6h' })])).ok);
  sql.close();
});

test('A CONNECTOR WHOSE LAST RUN IS STILL GOING IS NOT RUN AGAIN, and its cadence is kept', async () => {
  /* `call` AND `poll` HAVE CHECKED THIS SINCE THEY WERE WRITTEN and `pull` never did. An hour that
     comes round while the last hour is still leased queued a second row: two runs of one window,
     against one provider, paid for twice. Each row carries its own lease, so the write-side fence
     cannot see the other one. */
  const { k, sql, clock } = await record(CONNECTOR(), true);
  arm(sql, 'npm-downloads', NOW);
  clock.set(NOW + 1000);
  await k.drain();
  assert.equal(outbox(sql).length, 1);

  /* THE FIRST RUN IS STILL OUT. */
  sql.exec("UPDATE outbox SET state = 'leased' WHERE kind = 'pull.fetch'");
  arm(sql, 'npm-downloads', NOW + 3_600_000);
  clock.set(NOW + 3_601_000);
  await k.drain();

  assert.equal(outbox(sql).length, 1, 'the same connector was queued twice with one run still out');
  /* AND SKIPPING THE QUEUE IS NOT SKIPPING THE SCHEDULE: a run that overruns its interval resumes
     its cadence rather than stopping. */
  assert.ok(Date.parse(row(sql).due_at) > NOW + 3_601_000, 'the connector stopped being scheduled');

  /* ONCE IT IS DONE, THE NEXT TURN QUEUES AGAIN. */
  sql.exec("UPDATE outbox SET state = 'done' WHERE kind = 'pull.fetch'");
  arm(sql, 'npm-downloads', NOW + 7_200_000);
  clock.set(NOW + 7_201_000);
  await k.drain();
  assert.equal(outbox(sql).length, 2);
  sql.close();
});
