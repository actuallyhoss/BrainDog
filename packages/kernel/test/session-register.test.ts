/**
 * The kernel's one register, and the spoken prefix that makes its rows `S1`, `S2`.
 *
 * Migrations 2, 22, 26, 28 and 42 write the `register.session` rows by hand, because a migration's text cannot call the code that
 * installs declarations. So each row is held here to what `installDeclarations` writes for the same body: the canonical
 * bytes `jcs` makes, the checksum `digest` takes of them, the next version stamped at the instant the one before is
 * superseded, and the indexes `indexesFor` implies. A hand-written copy that drifts from the code path fails here.
 *
 * THE OLDER ROWS ARE WORKED OUT FROM THOSE FUNCTIONS, NOT BY INSTALLING. `validate` lets `register.session` through
 * only as the kernel's newest bytes, because an older body installed over the newest would be written back as a newer
 * version. Migration 42's row is installed by code too, over a record with 42's work taken away, and compared whole.
 * `session.test.ts` installs the kernel's own declaration over a record and checks that nothing changes.
 *
 * AND WHEN A RUN STARTED, which migration 26 adds: stamped as the run's row is made, never moved, and given to a run
 * that has none from its own row.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { installDeclarations } from '../src/declare.ts';
import { execScript } from '../src/migrate.ts';
import { SESSION_BODY as MIGRATION_2_BODY } from '../src/migrations/0002_session.ts';
import { SESSION_BODY as MIGRATION_22_BODY } from '../src/migrations/0022_session_client.ts';
import { SESSION_BODY as MIGRATION_26_BODY } from '../src/migrations/0026_session_started.ts';
import { SESSION_BODY as MIGRATION_28_BODY } from '../src/migrations/0028_runs.ts';
import { SEAT_AGENTS as SEAT_SESSION, SESSION_BODY } from '../src/migrations/0042_agents.ts';
import {
  digest, indexesFor, jcs, openRecord, sessionDeclaration, validateDeclaration,
  type Declaration, type Entry, type Kernel, type SessionHints, type WriteContext,
} from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 11, 12);

/** The instants migrations 2, 22, 26, 28 and 42 seat their versions at; each is also when the one before was superseded. */
const DECLARED_2 = '2026-09-11T00:00:00.000Z';
const SEATED_22 = '2026-10-02T00:00:00.000Z';
const SEATED_26 = '2026-10-07T00:00:00.000Z';
const SEATED_28 = '2026-10-08T00:00:00.000Z';
const SEATED = '2026-10-21T00:00:00.000Z';
const MIN = 60_000;
const HOUR = 60 * MIN;
const iso = (ms: number): string => new Date(ms).toISOString();

async function record(): Promise<{ k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock> }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  return { k: await openRecord(sql, clock), sql, clock };
}

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const refusal = (r: unknown): { code: string; fix: string; at?: string } => {
  const x = r as { ok: boolean; refusal?: { code: string; fix: string; at?: string } };
  assert.equal(x.ok, false, 'the call went through');
  return x.refusal!;
};

const VERSIONS =
  "SELECT id, version, kind, pack_id, body, checksum, retired, superseded_at, created_at FROM declaration WHERE id = 'register.session' ORDER BY version";
/** Every version of the register, oldest first, with when each was written, as plain objects. */
const versions = (sql: NodeSql) => sql.all<Record<string, unknown>>(VERSIONS).map((r) => ({ ...r }));
/** The session register's indexes, by name and statement, as plain objects. */
const indexes = (sql: NodeSql) =>
  sql
    .all<{ name: string; sql: string }>("SELECT name, sql FROM sqlite_master WHERE type = 'index' ORDER BY name")
    .filter((r) => r.name.startsWith('entry_u_session__') || r.name.startsWith('entry_i_session__'))
    .map((r) => ({ name: r.name, sql: r.sql }));

/** The indexes installDeclarations builds for a body, as SQLite keeps them: by name, without `IF NOT EXISTS`. */
const implied = (body: string) =>
  indexesFor('session', JSON.parse(body).fields)
    .map((statement) => ({ name: /INDEX IF NOT EXISTS (\S+)/.exec(statement)![1]!, sql: statement.replace(' IF NOT EXISTS', '') }))
    .sort((a, b) => a.name.localeCompare(b.name));

/** A version of the register as installDeclarations writes it: the canonical bytes, and the checksum of exactly those. */
const written = async (version: number, body: string, created_at: string, superseded_at: string | null) => ({
  id: 'register.session',
  version,
  kind: 'register',
  pack_id: 'kernel',
  body: jcs(JSON.parse(body)),
  checksum: await digest(jcs(JSON.parse(body))),
  retired: 0,
  superseded_at,
  created_at,
});

/** Migration 42's row taken away again: the register as migration 41 left it, with migration 28's row the live one. */
function before42(sql: NodeSql): void {
  sql.exec("DELETE FROM declaration WHERE id = 'register.session' AND superseded_at IS NULL");
  sql.exec("UPDATE declaration SET superseded_at = NULL WHERE id = 'register.session' AND superseded_at = ?", SEATED);
}

/* ── the rows the migrations write ───────────────────────────────────────── */

test('every body is canonical, and each is a shape the kernel accepts as a register', () => {
  for (const body of [MIGRATION_2_BODY, MIGRATION_22_BODY, MIGRATION_26_BODY, MIGRATION_28_BODY, SESSION_BODY]) {
    assert.equal(jcs(JSON.parse(body)), body, 'the stored bytes are not the canonical form of themselves');
    /* UNDER ANOTHER NAME, because the arm of `validate` that names `register.session` is about who may declare it and
       which bytes are the kernel's own, not about its shape: everything else a register is checked for is checked. */
    const runs: Declaration = { id: 'register.runs', kind: 'register', body: { ...JSON.parse(body), id: 'runs', seq_prefix: 'RN' }, pack: 'kernel' };
    assert.equal(validateDeclaration(runs), null);
  }
});

test('MIGRATIONS 2, 22, 26, 28 AND 42 WRITE WHAT installDeclarations WRITES: each version in turn, superseded at one instant, and the indexes its body implies', async () => {
  const { sql } = await record();
  assert.deepEqual(versions(sql), [
    await written(1, MIGRATION_2_BODY, DECLARED_2, SEATED_22),
    await written(2, MIGRATION_22_BODY, SEATED_22, SEATED_26),
    await written(3, MIGRATION_26_BODY, SEATED_26, SEATED_28),
    await written(4, MIGRATION_28_BODY, SEATED_28, SEATED),
    await written(5, SESSION_BODY, SEATED, null),
  ]);
  /* THE SAME EIGHT INDEXES FOR ALL FIVE BODIES, because no field migration 22, 26, 28 or 42 added is indexed, so none
     builds one. Eight is the most a list may index, so `started`, the nine of 28 and the six of 42 could not be a
     ninth: migration 42's `pulse_at` index is its own, by hand, and not a field's. */
  assert.equal(indexes(sql).length, 8);
  assert.deepEqual(indexes(sql), implied(MIGRATION_2_BODY));
  assert.deepEqual(indexes(sql), implied(MIGRATION_22_BODY));
  assert.deepEqual(indexes(sql), implied(MIGRATION_26_BODY));
  assert.deepEqual(indexes(sql), implied(MIGRATION_28_BODY));
  assert.deepEqual(indexes(sql), implied(SESSION_BODY));
  sql.close();
});

test('AND INSTALLED BY CODE, the kernel’s declaration writes what migration 42 wrote, and the older bytes are no longer the kernel’s', async () => {
  const migrated = await record();
  const byHand = versions(migrated.sql);
  const byHandIndexes = indexes(migrated.sql);

  /* The same record with migration 42's row and the indexes taken away, then the kernel's declaration installed by
     code at 42's instant. */
  const fresh = await record();
  before42(fresh.sql);
  for (const { name } of indexes(fresh.sql)) fresh.sql.exec(`DROP INDEX ${name}`);
  value(await installDeclarations(fresh.sql, Date.parse(SEATED), [sessionDeclaration()], (fn) => fresh.sql.transactionSync(fn)));
  assert.deepEqual(versions(fresh.sql), byHand);
  assert.deepEqual(indexes(fresh.sql), byHandIndexes);

  /* THE OLDER BYTES ARE REFUSED NOW, even as the kernel's: over 42's they would be the newest version, and every run
     opened after would lose what it was told, under 28's how its work went, under 26's when it started too, and under
     migration 2's its app. */
  for (const [was, body] of [['2', MIGRATION_2_BODY], ['22', MIGRATION_22_BODY], ['26', MIGRATION_26_BODY], ['28', MIGRATION_28_BODY]] as const) {
    const older = await installDeclarations(fresh.sql, NOW, [{ ...sessionDeclaration(), body: JSON.parse(body) }], (fn) =>
      fresh.sql.transactionSync(fn),
    );
    assert.equal(refusal(older).code, 'PROVIDES_CONFLICT');
    assert.deepEqual(versions(fresh.sql), byHand, `migration ${was}’s bytes were written over 42’s`);
  }
  migrated.sql.close();
  fresh.sql.close();
});

test('THE SEAT AN IMPORT RUNS writes migration 42’s row where an older one is live, and nothing where it is already', async () => {
  const { sql } = await record();
  const seated = versions(sql);
  execScript(sql, SEAT_SESSION);
  assert.deepEqual(versions(sql), seated, 'seating it a second time wrote a version');

  /* A file written before migration 42 carries migration 28's row as the live one. */
  before42(sql);
  execScript(sql, SEAT_SESSION);
  assert.deepEqual(versions(sql), seated, 'the seat did not write what migration 42 writes');

  /* One written before migration 26 carries 22's, and this body is the version after it. */
  sql.exec("DELETE FROM declaration WHERE id = 'register.session' AND version > 2");
  sql.exec("UPDATE declaration SET superseded_at = NULL WHERE id = 'register.session' AND version = 2");
  execScript(sql, SEAT_SESSION);
  assert.deepEqual(versions(sql), [seated[0], { ...seated[1], superseded_at: SEATED }, { ...seated[4], version: 3 }]);

  /* One written before migration 22 carries migration 2's. */
  sql.exec("DELETE FROM declaration WHERE id = 'register.session' AND version > 1");
  sql.exec("UPDATE declaration SET superseded_at = NULL WHERE id = 'register.session'");
  execScript(sql, SEAT_SESSION);
  assert.deepEqual(versions(sql), [{ ...seated[0], superseded_at: SEATED }, { ...seated[4], version: 2 }]);

  /* And a file older than migration 2 carries none at all, so this body is its first version. */
  sql.exec("DELETE FROM declaration WHERE id = 'register.session'");
  execScript(sql, SEAT_SESSION);
  assert.deepEqual(versions(sql), [{ ...seated[4], version: 1 }]);

  /* AND THE INSTRUCTIONS LIST, which a file written before migration 42 does not carry, is seated as its first version. */
  const told = sql.all("SELECT version, pack_id, superseded_at FROM declaration WHERE id = 'register.instructions'").map((r) => ({ ...r }));
  sql.exec("DELETE FROM declaration WHERE id = 'register.instructions'");
  execScript(sql, SEAT_SESSION);
  assert.deepEqual(sql.all("SELECT version, pack_id, superseded_at FROM declaration WHERE id = 'register.instructions'").map((r) => ({ ...r })), told);
  assert.deepEqual(told, [{ version: 1, pack_id: 'kernel', superseded_at: null }]);
  sql.close();
});

test('a new record holds the register, owned by the kernel and named as the seed names it', async () => {
  const { k, sql } = await record();
  assert.equal(k.register('session')?.name, 'Agent runs');
  assert.equal(k.register('session')?.seq_prefix, 'S');
  assert.equal(k.declarations().find((d) => d.id === 'register.session')?.pack_id, 'kernel');
  sql.close();
});

/* ── what a run keeps ────────────────────────────────────────────────────── */

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] },
};

const as = (token: string, session: SessionHints): WriteContext => ({ actor: 'p_1', principal: { kind: 'token', token }, session });

test('A RUN KEEPS THE APP IT IS IN and its version, and a Gemini, Copilot or Windsurf run is one', async () => {
  const { k, sql } = await record();
  value(await k.install([TASKS]));
  const said: [string, SessionHints][] = [
    ['t_1', { client: 'claude-code', client_version: '2.1.4' }],
    ['t_2', { client: 'gemini-cli-mcp-client', client_version: '0.8.1' }],
    ['t_3', { agent: 'copilot', client: 'GitHub Copilot' }],
    ['t_4', { agent: 'windsurf' }],
  ];
  for (const [token, session] of said) value(k.create('tasks', { what: token }, as(token, session)));
  assert.deepEqual(
    said.map((_, i) => {
      const run = k.get(`S${i + 1}`) ?? assert.fail(`S${i + 1} was not opened`);
      return [run.fields.agent, run.fields.client, run.fields.client_version];
    }),
    [
      ['claude', 'claude-code', '2.1.4'],
      ['gemini', 'gemini-cli-mcp-client', '0.8.1'],
      ['copilot', 'GitHub Copilot', undefined],
      ['windsurf', undefined, undefined],
    ],
  );
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM observation WHERE kind = 'write.refused'")?.n ?? 0, 0, 'a run failed to open');
  sql.close();
});

/* ── when a run started ──────────────────────────────────────────────────── */

/** A run's row as it is stored, since a heartbeat moves no version and a read through the kernel shows only fields. */
const stored = (sql: NodeSql, seq: number) => ({
  ...sql.one<{ started: string | null; last_seen: string | null; created_at: string; updated_at: string; version: number; state: string | null }>(
    `SELECT json_extract(fields, '$.started') AS started, json_extract(fields, '$.last_seen') AS last_seen, created_at, updated_at, version, state
     FROM entry WHERE register = 'session' AND seq = ?`,
    seq,
  )!,
});

test('A NEW RUN CARRIES WHEN IT STARTED: the instant its row is made, for a run the ladder opens and one made by hand', async () => {
  const { k, sql, clock } = await record();
  value(await k.install([TASKS]));
  assert.ok(k.register('session')?.fields.some((f) => f.id === 'started' && f.type === 'instant' && f.label === 'Started'));

  value(k.create('tasks', { what: 'first' }, as('t_1', { client_id: 'c-1' })));
  clock.advance(7 * MIN);
  const byHand = value<Entry>(k.create('session', { doing: 'Carried over' }, { actor: 'p_1' }));
  clock.advance(MIN);
  const byKey = value<Entry>(k.create('session', { doing: 'A key’s own' }, as('t_2', {})));

  assert.equal(k.get('S1')?.fields.started, iso(NOW));
  assert.equal(byHand.fields.started, iso(NOW + 7 * MIN));
  assert.equal(byKey.fields.started, iso(NOW + 8 * MIN));
  for (const seq of [1, 2, 3]) assert.equal(stored(sql, seq).started, stored(sql, seq).created_at, `S${seq} did not start when its row was made`);

  /* AND IT IS THE RECORD'S TO WRITE: no person and no run names it, as a row is made or after. */
  for (const out of [
    k.create('session', { doing: 'Backdated', started: iso(NOW - HOUR) }, { actor: 'p_1' }),
    k.update('session', 'S1', { started: iso(NOW - HOUR) }, { actor: 'p_1', version: k.get('S1')!.version }),
    k.update('session', 'S1', { started: iso(NOW - HOUR) }, as('t_1', { spoken: 'S1' })),
  ]) {
    const r = refusal(out);
    assert.deepEqual([r.code, r.at], ['IMMUTABLE_FIELD', 'started']);
  }
  assert.equal(k.get('S1')?.fields.started, iso(NOW));
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM observation WHERE kind = 'write.refused' AND subject LIKE 'session.-%'")?.n ?? 0, 0, 'a run failed to open');
  sql.close();
});

test('A RUN PLANTED WITH ITS START KEEPS IT: the record’s own stamp, which a sample’s runs come through, is not written over', async () => {
  const { k, sql } = await record();
  /* The in-process channel the seed plants a run through, with the fields only the record writes: no request carries one. */
  const planted = value<Entry>(
    k.create('session', { doing: 'Planted this morning' }, { actor: 'p_seed', stamp: { started: iso(NOW - 5 * HOUR), last_seen: iso(NOW - 2 * HOUR) } }),
  );
  assert.equal(planted.fields.started, iso(NOW - 5 * HOUR));
  assert.deepEqual([stored(sql, 1).started, stored(sql, 1).last_seen, stored(sql, 1).created_at], [iso(NOW - 5 * HOUR), iso(NOW - 2 * HOUR), iso(NOW)]);
  sql.close();
});

test('A RESUMED RUN KEEPS ITS FIRST START: through its heartbeat, its own writes, being finished, and coming back the next day', async () => {
  const { k, sql, clock } = await record();
  value(await k.install([TASKS]));
  const said = as('t_1', { client_id: 'c-1', host: 'mbp', repo: 'braindog' });
  value(k.create('tasks', { what: 'first' }, said));
  const first = iso(NOW);
  assert.equal(stored(sql, 1).started, first);

  /* The heartbeat moves the other end and not this one. */
  clock.advance(20 * MIN);
  value(k.create('tasks', { what: 'second' }, said));
  assert.deepEqual([stored(sql, 1).started, stored(sql, 1).last_seen], [first, iso(NOW + 20 * MIN)]);

  /* A write to its own row, by the run and by a person. */
  clock.advance(5 * MIN);
  value(k.update('session', 'S1', { doing: 'Wire the device routes' }, { ...said, version: k.get('S1')!.version }));
  value(k.update('session', 'S1', { next: 'Then the self-host' }, { actor: 'p_1', version: k.get('S1')!.version }));
  assert.equal(stored(sql, 1).started, first);

  /* Finished, then back a day later by its client id: the same run, revived, started when it first was. */
  value(k.update('session', 'S1', { state: 'done' }, { actor: 'p_1', version: k.get('S1')!.version }));
  clock.advance(26 * HOUR);
  value(k.create('tasks', { what: 'third' }, said));
  const back = stored(sql, 1);
  assert.deepEqual([back.state, back.started, back.last_seen], ['active', first, iso(clock.now())]);
  assert.equal(sql.all("SELECT 1 FROM entry WHERE register = 'session'").length, 1, 'coming back opened another run');
  sql.close();
});

test('AN OLD RUN IS GIVEN ITS START FROM ITS OWN ROW, in place, and giving it again changes nothing', async () => {
  const { k, sql, clock } = await record();
  value(await k.install([TASKS]));
  value(k.create('tasks', { what: 'first' }, as('t_1', { client_id: 'c-1' })));
  clock.advance(2 * HOUR);
  value(k.create('tasks', { what: 'second' }, as('t_2', { client_id: 'c-2' })));
  clock.advance(HOUR);
  value(k.create('tasks', { what: 'third' }, as('t_1', { client_id: 'c-1' })));

  /* Two runs as a record held them before migration 26, the second binned since, and a third that already has a start
     of its own, which is not its row's. */
  value(k.create('session', { doing: 'Has one' }, { actor: 'p_1' }));
  sql.exec("UPDATE entry SET fields = json_remove(fields, '$.started') WHERE register = 'session' AND seq IN (1, 2)");
  sql.exec("UPDATE entry SET deleted_at = ? WHERE register = 'session' AND seq = 2", iso(clock.now()));
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.started', ?) WHERE register = 'session' AND seq = 3", iso(NOW - HOUR));
  const all = () => sql.all('SELECT * FROM entry ORDER BY id').map((r) => ({ ...r }));
  const history = () => sql.all('SELECT * FROM event ORDER BY rowid').map((r) => ({ ...r }));
  const before = [1, 2, 3].map((seq) => stored(sql, seq));
  const events = history();

  execScript(sql, SEAT_SESSION);
  const after = [1, 2, 3].map((seq) => stored(sql, seq));
  assert.deepEqual(after.map((r) => r.started), [iso(NOW), iso(NOW + 2 * HOUR), iso(NOW - HOUR)]);
  /* NOT AN EDIT ANYBODY MADE: no version, no `updated_at`, no line in the history, and the heartbeat where it was. */
  assert.deepEqual(after.map(({ started: _, ...rest }) => rest), before.map(({ started: _, ...rest }) => rest));
  assert.deepEqual(history(), events);
  assert.equal(k.get('S1')?.fields.started, iso(NOW));

  const given = all();
  const seated = versions(sql);
  execScript(sql, SEAT_SESSION);
  execScript(sql, SEAT_SESSION);
  assert.deepEqual(all(), given, 'giving it a second time changed a run');
  assert.deepEqual(versions(sql), seated, 'seating it a second time wrote a version');
  assert.deepEqual(history(), events);
  sql.close();
});

/* ── and the prefix it speaks ────────────────────────────────────────────── */

test('`S1` RESOLVES to the first session, as `session#1` does', async () => {
  const { k, sql } = await record();
  const first = value<Entry>(k.create('session', { doing: 'Wire the device routes' }, { actor: 'p_1' }));
  assert.equal(first.seq, 1);

  assert.equal(k.get('S1')?.id, first.id);
  assert.equal(k.get('session#1')?.id, first.id);
  for (const nothing of ['S2', 'S0', 'S01', 'D1', 'SG1', 's1', '#1'])
    assert.equal(k.get(nothing), null, `${nothing} resolved to a row`);

  /* The write path addresses a row through the same lookup, so a session can be updated by what a
     person says. */
  const moved = value<Entry>(k.update('session', 'S1', { next: 'Wire the self-host' }, { actor: 'p_1', version: first.version }));
  assert.equal(moved.fields.next, 'Wire the self-host');
  sql.close();
});

test('AND `S12` IS ROW 12, which the spoken pattern alone reads as the prefix `S1` and row 2', async () => {
  const { k, sql } = await record();
  const made = Array.from({ length: 12 }, (_, i) => value<Entry>(k.create('session', { doing: `run ${i + 1}` }, { actor: 'p_1' })));
  assert.equal(k.get('S12')?.id, made[11]!.id);
  assert.equal(k.get('S2')?.id, made[1]!.id);
  sql.close();
});

test('a register with its own prefix is spoken beside the session register', async () => {
  const { k, sql } = await record();
  value(
    await k.install([
      {
        id: 'register.learnings',
        kind: 'register',
        body: { id: 'learnings', name: 'Learnings', title: 'lesson', seq_prefix: 'LN', fields: [{ id: 'lesson', type: 'text' }] },
      },
    ]),
  );
  const lesson = value<Entry>(k.create('learnings', { lesson: 'Run the gates one at a time.' }, { actor: 'p_1' }));
  const run = value<Entry>(k.create('session', { doing: 'Gates' }, { actor: 'p_1' }));
  assert.equal(k.get('LN1')?.id, lesson.id);
  assert.equal(k.get('S1')?.id, run.id);
  assert.equal(k.get('learnings#1')?.id, lesson.id);
  sql.close();
});
