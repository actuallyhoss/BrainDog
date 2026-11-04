/**
 * The schema, and the ledger that keeps it honest.
 *
 * The failure this guards against is not a migration that errors — that one announces itself. It is
 * a migration whose TEXT changed after it was applied, so the code and the database disagree about
 * what version 1 said, and every read after it is subtly about a different schema. The runner
 * refuses instead of repairing, because the repair would be a guess about which of the two is right,
 * made without the data.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, refused } from '@braindog/ports';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { KERNEL_MIGRATION, MIGRATIONS, applyMigrations, assertNumbering, canon, checksum, statements } from '../src/migrate.ts';
import { openRecord, type Declaration, type SessionHints, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);
const open = async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const { result, state } = await applyMigrations(sql, clock);
  return { sql, clock, result, state };
};

/* ── it applies ──────────────────────────────────────────────────────────── */

test('an empty database becomes a record', async () => {
  const { sql, result } = await open();
  assert.ok(result.ok, fixOf(result));
  assert.deepEqual(result.value, { kernel: 48, format: 1, applied: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48] });

  const tables = sql
    .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .map((r) => r.name)
    .filter((n) => !n.startsWith('sqlite_') && !n.startsWith('entry_fts_'));
  // Thirty-one in `30-BLUEPRINT` §1, `invitation` from migration 6, `view` from migration 7, `pref` and `pack_removed` from 9.
  // Migration 10 adds a column and no table. Migration 14 adds `push_sub`, and 17 `automation_watch`. Migration 18
  // rebuilds two tables and adds none. Migrations 19 and 20 each add a column and no table, and 22 a declaration row.
  // Migration 23 adds `entity_key` and `entity_mention`, and 24 rebuilds `declaration` and adds none. Migration 25 rebuilds
  // `suggestion` and `token` and adds `ladder` and `undone`. Migration 26 adds a declaration row and no table, 27 adds
  // `sign_reading`, and 28 a declaration row and no table. Migration 29 adds `door_mark`, 30 `fault`, and 31 a column on
  // `suggestion` and `decision` and no table, 32 rebuilds `token` and adds none, and 33
  // rebuilds `device_grant` and adds none. Migration 34 adds `rule_stat`, and 35 writes history and adds none.
  // Migration 36 takes a field off some runs and 37 adds an index, and neither adds a table.
  // Migration 42 adds `instruction_seen` and `agent_profile`, and 43 adds six: `share`, `share_group`,
  // `share_group_member`, `token_lens`, `access_via`, `access_seen`. Migration 44 adds `job_place`, and 45 adds
  // `sealed_file` and `sealed_part`. Migration 46 adds `key_access` and `key_ask`, 47 `observation_who`, and 48 `rule_month`.
  assert.equal(tables.length, 63, `tables: ${tables.join(', ')}`);
  for (const wanted of ['record', 'declaration', 'migration', 'counter', 'entry', 'event', 'schedule', 'outbox'])
    assert.ok(tables.includes(wanted), `${wanted} is missing`);
  sql.close();
});

test('applying twice applies nothing twice', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const first = await applyMigrations(sql, clock);
  const second = await applyMigrations(sql, clock);
  assert.ok(first.result.ok && second.result.ok);
  assert.deepEqual(first.result.value.applied, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48]);
  assert.deepEqual(second.result.value.applied, [], 'a second run re-applied a migration');
  assert.equal(sql.all('SELECT version FROM migration').length, 48);
  sql.close();
});

/** Everything a migration could touch, so a run that changes nothing can be shown to. */
const snapshot = (sql: ReturnType<typeof openSqlite>) => ({
  schema: sql.all("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name"),
  declaration: sql.all('SELECT * FROM declaration ORDER BY id, version'),
  counter: sql.all('SELECT * FROM counter ORDER BY name'),
  entry: sql.all('SELECT * FROM entry ORDER BY id'),
  event: sql.all('SELECT * FROM event ORDER BY rowid'),
  migration: sql.all('SELECT * FROM migration ORDER BY version'),
});

test('and a second run changes nothing at all, not a row and not an index', async () => {
  const sql = openSqlite();
  await applyMigrations(sql, fixedClock(NOW));
  const before = snapshot(sql);
  await applyMigrations(sql, fixedClock(NOW + 60_000));
  assert.deepEqual(snapshot(sql), before);
  sql.close();
});

/* ── a record that already exists ────────────────────────────────────────── */

const NOTES: Declaration = {
  id: 'register.notes',
  kind: 'register',
  body: { id: 'notes', name: 'Notes', title: 'body', fields: [{ id: 'body', type: 'text' }] },
};

/** When migration 22 seats the session register's next version, and so when the version before it was superseded. */
const SEATED_22 = '2026-10-02T00:00:00.000Z';
/** And when migration 26 seats the one after, with when a run started. */
const SEATED_26 = '2026-10-07T00:00:00.000Z';
/** And when migration 28 seats the one after that, with how a run's work went. */
const SEATED_28 = '2026-10-08T00:00:00.000Z';
/** And when migration 42 seats the one after that, with what he told a run and whether it is open (agents and MCP plan). */
const SEATED_42 = '2026-10-21T00:00:00.000Z';
/** And when migration 44 seats the newest, with the profile a run is under, and the instructions list's next version. */
const SEATED_44 = '2026-10-22T00:00:00.000Z';

/** The session register's index names, which is what migration 2 adds besides its one row. */
const sessionIndexes = (sql: ReturnType<typeof openSqlite>): string[] =>
  sql
    .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'index'")
    .map((r) => r.name)
    .filter((name) => name.startsWith('entry_u_session__') || name.startsWith('entry_i_session__'));

/**
 * A record as this build first finds it on a host: migration 1 in its ledger, and registers, rows
 * and history of its own. Made by opening a record and taking migration 2's work away again.
 */
async function beforeMigration2() {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([NOTES])).ok);
  assert.ok(k.create('notes', { body: 'Call the bank' }, { actor: 'p_1' }).ok);
  sql.exec("DELETE FROM declaration WHERE id = 'register.session'");
  /* And the instructions list, which no record held before migration 42. */
  sql.exec("DELETE FROM declaration WHERE id = 'register.instructions'");
  for (const name of sessionIndexes(sql)) sql.exec(`DROP INDEX ${name}`);
  /* And migration 3's, since the runner applies only what is above the highest version it holds. */
  sql.exec('ALTER TABLE pack DROP COLUMN disabled_at');
  /* AND MIGRATION 10'S, for the same reason and one more: `ADD COLUMN` is the one shape that cannot
     be written `IF NOT EXISTS`, so a rewind that left the column behind would not be simulating an
     old record, it would be simulating a state no record can be in — ledger at 1, schema at 10 —
     and the duplicate-column error it raises is the runner being right. */
  sql.exec('ALTER TABLE grant DROP COLUMN sealed_under');
  /* And migration 15's column, for migration 10's reason. */
  sql.exec('ALTER TABLE token DROP COLUMN reach');
  /* And migration 19's and 20's columns, for the same reason. */
  sql.exec('ALTER TABLE member DROP COLUMN row_where');
  sql.exec('ALTER TABLE record DROP COLUMN quiet');
  sql.exec('DELETE FROM migration WHERE version >= 2');
  return sql;
}

test('A RECORD CREATED BEFORE MIGRATION 2 TAKES IT ON OPEN, and everything it held is untouched', async () => {
  const sql = await beforeMigration2();
  const before = snapshot(sql);

  const { result } = await applyMigrations(sql, fixedClock(NOW));
  assert.ok(result.ok, fixOf(result));
  assert.deepEqual(result.value.applied, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48]);

  const after = snapshot(sql);
  assert.deepEqual(after.entry, before.entry, 'a row changed');
  assert.deepEqual(after.event, before.event, 'the history changed');
  assert.deepEqual(after.counter, before.counter, 'a counter changed');
  assert.deepEqual(
    after.declaration.filter((d) => !['register.session', 'register.instructions'].includes((d as { id: string }).id)),
    before.declaration.filter((d) => (d as { id: string }).id !== 'register.instructions'),
    'a declaration other than the kernel ones changed',
  );
  /* Migration 2 seats the register, and migrations 22, 26, 28, 42 and 44 its next versions, so the kernel holds six and the last is live. */
  const seated = sql.all<{ version: number; pack_id: string; superseded_at: string | null }>(
    "SELECT version, pack_id, superseded_at FROM declaration WHERE id = 'register.session' ORDER BY version",
  );
  assert.deepEqual(seated.map((r) => ({ ...r })), [
    { version: 1, pack_id: 'kernel', superseded_at: SEATED_22 },
    { version: 2, pack_id: 'kernel', superseded_at: SEATED_26 },
    { version: 3, pack_id: 'kernel', superseded_at: SEATED_28 },
    { version: 4, pack_id: 'kernel', superseded_at: SEATED_42 },
    { version: 5, pack_id: 'kernel', superseded_at: SEATED_44 },
    { version: 6, pack_id: 'kernel', superseded_at: null },
  ]);
  /* AND MIGRATION 42 SEATS THE KERNEL'S SECOND REGISTER, the instructions, as its first version, and 44 its second. */
  assert.deepEqual(
    sql.all("SELECT version, pack_id, superseded_at FROM declaration WHERE id = 'register.instructions' ORDER BY version").map((r) => ({ ...r })),
    [
      { version: 1, pack_id: 'kernel', superseded_at: SEATED_44 },
      { version: 2, pack_id: 'kernel', superseded_at: null },
    ],
  );
  assert.equal(sessionIndexes(sql).length, 8, 'the session indexes were not built');

  /* AND THE RECORD OPENS ON IT: the register is live and its first row is spoken S1. */
  const k = await openRecord(sql, fixedClock(NOW));
  const run = k.create('session', { doing: 'First run' }, { actor: 'p_1' });
  assert.ok(run.ok, fixOf(run));
  assert.equal(k.get('S1')?.id, run.value.id);
  assert.equal(k.get('notes#1')?.fields.body, 'Call the bank');
  sql.close();
});

test('AND ONE THAT DECLARED A register.session OF ITS OWN KEEPS ITS ROWS, the kernel one arriving as its next version', async () => {
  /* A collision on the declaration's primary key would throw inside the migration, and the record
     would not open at all. */
  const sql = await beforeMigration2();
  sql.exec(
    `INSERT INTO declaration (id, version, kind, pack_id, body, checksum, retired, superseded_at, created_at)
     VALUES ('register.session', 1, 'register', NULL, ?, 'x', 0, NULL, '2026-09-01T00:00:00.000Z')`,
    JSON.stringify({ fields: [{ id: 'what', type: 'text' }], id: 'session', name: 'Mine', title: 'what' }),
  );
  sql.exec(
    `INSERT INTO entry (id, register, seq, fields, version, created_at, updated_at)
     VALUES ('01J00000000000000000000000', 'session', 1, ?, 1, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')`,
    JSON.stringify({ what: 'mine' }),
  );

  const { result } = await applyMigrations(sql, fixedClock(NOW));
  assert.ok(result.ok, fixOf(result));
  const rows = sql.all<{ version: number; pack_id: string | null; superseded_at: string | null }>(
    "SELECT version, pack_id, superseded_at FROM declaration WHERE id = 'register.session' ORDER BY version",
  );
  /* The record's own, then migration 2's, then migration 22's, then 26's, then 28's, then 42's, then 44's, which is the live one. */
  assert.equal(rows.length, 7);
  assert.equal(rows[0]?.pack_id, null);
  assert.ok(rows[0]?.superseded_at, 'the record’s own declaration is still active beside the kernel one');
  assert.deepEqual(
    rows.slice(1).map((r) => ({ version: r.version, pack_id: r.pack_id, superseded_at: r.superseded_at })),
    [
      { version: 2, pack_id: 'kernel', superseded_at: SEATED_22 },
      { version: 3, pack_id: 'kernel', superseded_at: SEATED_26 },
      { version: 4, pack_id: 'kernel', superseded_at: SEATED_28 },
      { version: 5, pack_id: 'kernel', superseded_at: SEATED_42 },
      { version: 6, pack_id: 'kernel', superseded_at: SEATED_44 },
      { version: 7, pack_id: 'kernel', superseded_at: null },
    ],
  );
  /* Its one row is kept with what it held, and is given when it started as every run already here is: when it was made. */
  assert.deepEqual(
    sql.all<{ fields: string }>("SELECT fields FROM entry WHERE register = 'session'").map((r) => JSON.parse(r.fields)),
    [{ what: 'mine', started: '2026-09-01T00:00:00.000Z' }],
    'the record’s own session row was lost',
  );
  sql.close();
});

/** A token's write, which the ladder signs with the run it opens or finds. */
const asToken = (token: string, session: SessionHints): WriteContext => ({ actor: 'p_1', principal: { kind: 'token', token }, session });

test('MIGRATION 22 GIVES A RECORD THAT RAN 21 THE NEXT session REGISTER, every run kept as it was, and the next run keeps its app', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([NOTES])).ok);
  for (const [token, client] of [['t_1', 'c-1'], ['t_2', 'c-2']] as const)
    assert.ok(k.create('notes', { body: `From ${token}` }, asToken(token, { client_id: client, host: 'mbp', repo: 'braindog' })).ok);
  /* Migration 22's work taken away, and the rows of 26, 28, 42 and 44 with it: every version after migration 2's, the
     stamp on that one, the instructions list, and their lines in the ledger. The runs keep when they started, so
     migration 26 has none to give. */
  sql.exec("DELETE FROM declaration WHERE id = 'register.session' AND version > 1");
  sql.exec("DELETE FROM declaration WHERE id = 'register.instructions'");
  sql.exec("UPDATE declaration SET superseded_at = NULL WHERE id = 'register.session'");
  sql.exec('DELETE FROM migration WHERE version >= 22');
  const before = snapshot(sql);

  const { result } = await applyMigrations(sql, fixedClock(NOW));
  assert.ok(result.ok, fixOf(result));
  assert.deepEqual(result.value.applied, [22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48]);
  const after = snapshot(sql);
  assert.deepEqual(after.entry, before.entry, 'a run changed');
  assert.deepEqual(after.event, before.event, 'the history changed');
  assert.deepEqual(after.counter, before.counter, 'a counter changed');
  assert.deepEqual(after.schema, before.schema, 'a table or an index changed');
  assert.deepEqual(
    sql.all<{ version: number; superseded_at: string | null }>("SELECT version, superseded_at FROM declaration WHERE id = 'register.session' ORDER BY version").map((r) => ({ ...r })),
    [
      { version: 1, superseded_at: SEATED_22 },
      { version: 2, superseded_at: SEATED_26 },
      { version: 3, superseded_at: SEATED_28 },
      { version: 4, superseded_at: SEATED_42 },
      { version: 5, superseded_at: SEATED_44 },
      { version: 6, superseded_at: null },
    ],
  );

  /* AND THE RECORD OPENS ON IT: a run opened now keeps the app it is in, and the runs from before have none. */
  const reopened = await openRecord(sql, fixedClock(NOW));
  assert.ok(reopened.create('notes', { body: 'From Gemini' }, asToken('t_3', { client: 'gemini-cli-mcp-client', client_version: '0.8.1' })).ok);
  const runs = ['S1', 'S2', 'S3'].map((s) => reopened.get(s) ?? assert.fail(`${s} is not a run`));
  assert.deepEqual(
    runs.map((r) => [r.fields.agent, r.fields.client, r.fields.client_version]),
    [
      ['other', undefined, undefined],
      ['other', undefined, undefined],
      ['gemini', 'gemini-cli-mcp-client', '0.8.1'],
    ],
  );
  sql.close();
});

test('MIGRATION 26 GIVES A RECORD THAT RAN 25 WHEN EACH RUN STARTED, from its own row, and changes nothing else about it', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  assert.ok((await k.install([NOTES])).ok);
  assert.ok(k.create('notes', { body: 'From the first' }, asToken('t_1', { client_id: 'c-1', host: 'mbp', repo: 'braindog' })).ok);
  clock.advance(3 * 60 * 60_000);
  assert.ok(k.create('notes', { body: 'From the second' }, asToken('t_2', { client_id: 'c-2', host: 'mbp', repo: 'braindog' })).ok);
  /* A run binned before the migration is still a run that started. */
  sql.exec("UPDATE entry SET deleted_at = ? WHERE register = 'session' AND seq = 2", new Date(clock.now()).toISOString());
  clock.advance(60_000);
  assert.ok(k.create('notes', { body: 'And again' }, asToken('t_1', { client_id: 'c-1' })).ok);

  /* Migration 26's work taken away, and the rows of 28, 42 and 44 with it: their rows and the stamp on the one 26
     superseded, the instructions list, what 26 gave each run, and their lines in the ledger. */
  sql.exec(
    "DELETE FROM declaration WHERE id = 'register.session' AND (superseded_at IS NULL OR superseded_at IN (?, ?, ?))",
    SEATED_28,
    SEATED_42,
    SEATED_44,
  );
  sql.exec("DELETE FROM declaration WHERE id = 'register.instructions'");
  sql.exec("UPDATE declaration SET superseded_at = NULL WHERE id = 'register.session' AND superseded_at = ?", SEATED_26);
  sql.exec("UPDATE entry SET fields = json_remove(fields, '$.started') WHERE register = 'session'");
  sql.exec('DELETE FROM migration WHERE version >= 26');
  const before = snapshot(sql);
  const runsOf = (rows: unknown[]) => (rows as { register: string; fields: string }[]).filter((r) => r.register === 'session');
  assert.equal(runsOf(before.entry).length, 2);
  assert.ok(runsOf(before.entry).every((r) => !('started' in JSON.parse(r.fields))));

  const { result } = await applyMigrations(sql, fixedClock(NOW + 86_400_000));
  assert.ok(result.ok, fixOf(result));
  assert.deepEqual(result.value.applied, [26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48]);
  const after = snapshot(sql);
  /* EACH RUN'S OWN START AND NOT THE DAY THE MIGRATION RAN: the instant its row was made, the live run and the binned. */
  const started = runsOf(after.entry).map((r) => JSON.parse(r.fields).started as string);
  assert.deepEqual(started.sort(), [new Date(NOW).toISOString(), new Date(NOW + 3 * 60 * 60_000).toISOString()]);
  for (const r of runsOf(after.entry) as unknown as { created_at: string; fields: string }[]) assert.equal(JSON.parse(r.fields).started, r.created_at);
  /* AND NOTHING ELSE: every other field, each run's version and when it last changed, the history and the counters. */
  const without = (rows: unknown[]) =>
    (rows as { fields: string }[]).map((r) => {
      const { started: _, ...fields } = JSON.parse(r.fields) as Record<string, unknown>;
      return { ...r, fields };
    });
  assert.deepEqual(without(after.entry), without(before.entry), 'a run changed beyond when it started');
  assert.deepEqual(after.event, before.event, 'the history changed');
  assert.deepEqual(after.counter, before.counter, 'a counter changed');
  assert.deepEqual(after.schema, before.schema, 'a table or an index changed');
  assert.deepEqual(
    sql.all<{ version: number; superseded_at: string | null }>("SELECT version, superseded_at FROM declaration WHERE id = 'register.session' ORDER BY version").map((r) => ({ ...r })),
    [
      { version: 1, superseded_at: SEATED_22 },
      { version: 2, superseded_at: SEATED_26 },
      { version: 3, superseded_at: SEATED_28 },
      { version: 4, superseded_at: SEATED_42 },
      { version: 5, superseded_at: SEATED_44 },
      { version: 6, superseded_at: null },
    ],
  );

  /* AND THE NEWEST SEAT APPLIED OVER ITSELF GIVES NOTHING AGAIN: the ledger rewound past it, as an import runs it after
     every file (`brainl.ts`), and not a row, a version or an index differs. Migration 44's seat carries 42's, which
     carries 28's, and with it 26's gift of a start, so it is the one an import runs. */
  sql.exec('DELETE FROM migration WHERE version >= 44');
  const again = await applyMigrations(sql, fixedClock(NOW + 2 * 86_400_000));
  assert.ok(again.result.ok, fixOf(again.result));
  assert.deepEqual(again.result.value.applied, [44, 45, 46, 47, 48]);
  const { migration: _then, ...second } = snapshot(sql);
  const { migration: _now, ...first } = after;
  assert.deepEqual(second, first, 'applying migration 44 a second time changed the record');

  /* AND THE RECORD OPENS ON IT: the run that comes back keeps the start it was given, and a run opened now has its own. */
  const later = fixedClock(NOW + 2 * 86_400_000);
  const reopened = await openRecord(sql, later);
  assert.ok(reopened.create('notes', { body: 'Back' }, asToken('t_1', { client_id: 'c-1' })).ok);
  assert.ok(reopened.create('notes', { body: 'New' }, asToken('t_3', { client_id: 'c-3' })).ok);
  assert.equal(reopened.get('S1')?.fields.started, new Date(NOW).toISOString());
  assert.equal(reopened.get('S3')?.fields.started, new Date(later.now()).toISOString());
  sql.close();
});

test('the format is written where an export will look for it', async () => {
  const { sql } = await open();
  assert.equal(sql.one<{ value: string }>("SELECT value FROM dog_meta WHERE key = 'format'")?.value, '1');
  assert.equal(sql.one<{ user_version: number }>('PRAGMA user_version')?.user_version, 1);
  sql.close();
});

test('every table is placed in a section, and every section holds tables', async () => {
  // The export reads this table and so does the import, which is why it is data rather than a list
  // in code: a table nobody placed would travel or not travel by accident.
  const { sql } = await open();
  const rows = sql.all<{ table_name: string; section: string }>('SELECT table_name, section FROM dog_section');
  assert.equal(rows.length, 63);
  /* FIVE, not four: `origin` is its own section because a `.brain` can be exported without the raw
     inbound material an ingest kept — an email body is a customer's mail, not their record. */
  assert.deepEqual(
    [...new Set(rows.map((r) => r.section))].sort(),
    ['data', 'governance', 'header', 'local', 'origin'],
  );

  const tables = new Set(
    sql
      .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .map((r) => r.name)
      .filter((n) => !n.startsWith('sqlite_') && !n.startsWith('entry_fts_')),
  );
  for (const r of rows) assert.ok(tables.has(r.table_name), `${r.table_name} is sectioned and does not exist`);
  for (const t of tables) assert.ok(rows.some((r) => r.table_name === t), `${t} exists and is in no section`);
  sql.close();
});

/* ── the ledger refuses ──────────────────────────────────────────────────── */

test('A MIGRATION WHOSE TEXT CHANGED AFTER IT WAS APPLIED IS REFUSED', async () => {
  const { sql, clock } = await open();
  sql.exec("UPDATE migration SET checksum = 'not the one that was applied' WHERE version = 1");
  const { result, state } = await applyMigrations(sql, clock);
  assert.ok(refused(result));
  assert.equal(result.refusal.code, 'SCHEMA_MISMATCH');
  assert.match(result.refusal.fix, /add a new migration/);
  assert.ok(state.refusal, 'the refusal has to stick, or half the record works');
  sql.close();
});

test('a record written by a newer build is refused, and says to deploy it', async () => {
  const { sql, clock } = await open();
  sql.exec("INSERT INTO migration (version, applied_at, checksum) VALUES (99, '2026-01-01T00:00:00.000Z', 'x')");
  const { result } = await applyMigrations(sql, clock);
  assert.ok(refused(result));
  assert.equal(result.refusal.code, 'SCHEMA_NEWER');
  assert.match(result.refusal.fix, /Deploy the newer build/);
  sql.close();
});

test('AND BOTH LEDGER REFUSALS NAME THE MIGRATION THEY ARE ABOUT', async () => {
  // The ledger is a list and a refusal about one row of it can say which row. Without an `at` the
  // operator is told a migration disagrees and has to read the fix sentence to find out which one,
  // which is prose where an address would do: `40 §6`'s import row has always specified
  // `migration[<n>]` and nothing has ever produced it, because no runner drives these fixtures.
  const changed = await open();
  changed.sql.exec("UPDATE migration SET checksum = 'not the one that was applied' WHERE version = 3");
  const mismatch = (await applyMigrations(changed.sql, changed.clock)).result;
  assert.ok(refused(mismatch));
  assert.equal(mismatch.refusal.at, 'migration[3]', 'SCHEMA_MISMATCH does not say which migration');
  changed.sql.close();

  const ahead = await open();
  ahead.sql.exec("INSERT INTO migration (version, applied_at, checksum) VALUES (99, '2026-01-01T00:00:00.000Z', 'x')");
  const newer = (await applyMigrations(ahead.sql, ahead.clock)).result;
  assert.ok(refused(newer));
  assert.equal(newer.refusal.at, 'migration[99]', 'SCHEMA_NEWER does not say which migration it lacks');
  ahead.sql.close();
});

test('a mis-numbered migration is a defect, not a refusal', () => {
  // A refusal is for a RECORD that disagrees with the code, and an operator can act on it. A list
  // that disagrees with itself is the code being wrong, and nobody should deploy past it.
  assert.throws(() => assertNumbering([{ version: 2, slug: 'wrong', sql: 'SELECT 1' }]), /numbered 2 and sits at 1/);
  assert.doesNotThrow(() => assertNumbering(MIGRATIONS));
  assert.equal(MIGRATIONS.length, KERNEL_MIGRATION);
});

test('AN APPLIED MIGRATION IS NEVER EDITED, so each checksum is pinned here', async () => {
  /* An edit to either text fails here, before any record refuses to open over it. The repair is a
     new migration, never a new constant. */
  assert.deepEqual(await Promise.all(MIGRATIONS.map((m) => checksum(m.sql))), [
    'fa653de2288f0aaeefa53cf1c0c19077f9842a76fb46f369d45707831290667d',
    '16c5b5dc98bfba0191673904850dad59761cfba49680b037aef9333dfc7dc676',
    '53e31fd7d2c5a0e3e356de5567f115d0ceec87b0d3fa80a18487a3a7e7ed4d74',
    'b80b1b26094c9f805a67446187ce6a947fd03511a3445db0c041ffc123d3b144',
    '1a851bda87fb1f20a5d1d2005feebad7efcd6d88b54f4f91e3e97a4aca6e1b4b',
    'a8e547ecac71bd29c0359924239c99a0414d8e893c0af70751f2a9950ea5d5b8',
    '9027fe08841cd4ec7b557552c2143c367c442bef231acfbdbdf7f7967a2948dc',
    'fdfaa4045a9f31b003ffc58c85376525be9c9f1628761c532ff970466296fdbd',
    'a9da736a33a1445d4b2de929273e7e8f48e974d3bd13343266127632d03aa092',
    '87bde4f4b6f80a93bf9c4e400e9e3c1cb89502f7a20195d096984e434ac438ae',
    '173a692f24bb00387fcfd6907d43a0c9fe1d3d9fbbfc9b3e4ef433a3738be87f',
    'a8d8837345552ba259423346f3cdbe109f6ca73f0d2d0da143e1ef8751f260b2',
    '4f26cd437a0d4d5e454477c5428f57e96b749cfecdf8c08822f3d798e57bd185',
    '5ed69b795dc9170533c90d3f49108bf0556c362db3524866ab411d7653a25a1a',
    'dcaf26214d1331d23aa3632432e4538e2361b7e6ec47c8d5a75e58810dbfada1',
    'ae2c2c8fbd2120ab152315c4290a22f763a4bf81f8d748e5ddb779523d50e2ee',
    'db601baac1f2aacb645e06bf6b4c7e38115f9989a68ed4667060900fee33cb9a',
    '2d37be52999866741056861e33ac6c4b3431837b5384e53824f236bc770213a4',
    '4d783603c20778c92773e360b2bd43de74a08e93b7eebc799da9cdb1089cadc8',
    '71399f1445217c57c48bb0aefa833b650e72cd45965a98249ce841bfd999237d',
    '45ce9ef61c6754bdaba142ec61837fe51bce8bea2ff3115d25a20e328d1333b0',
    '9bd9a5ee89a287bf610650aaffdce9c91a9b65288b3522f3d6af57d3b6c8b6fa',
    'e2d9dc7c4eb773be3ccbbd638b4076ac3dcc58a5d29eaf05a2f3b93672c4397b',
    '2f9dd1a6b5f618acf1c49731552c2dd366f9cde2c394d47e367b67d9c52e2bd2',
    'c02906c66c61d759b771fd0f8651322f4ac462a4235fde60bb81dc05e3d4c34b',
    '846d9d94c0a80c550408f89e3155a15423d0efedfe11adcd82afe4bfdd48b0a0',
    '8582e0e0ecc06b0c24ded6e7eddacd794cd40bfaeee34f82e13a9c4e8ceb6a3e',
    '895c5a8fe51d1d1c8836087aefc50cc6a73969db89f2d0a4eddc872cf78c8829',
    '139fd7ff809cc6d8000280a2612ea47527392fd55b17ec91d876b84138fe02dc',
    'adca34d6a4c1f33d6bb13d8cb275c6abcd7ccd509a5d33232f0e91eae158e825',
    '78298b303aa7c14bb4042ecc846df7a9f16454a5f7e6016d79e9d924cb5208a1',
    '9a2f20627150c0f18d1fe902db1e7ab22d6c4ba362a658b0ca5870364689d89d',
    '0ba95864c62726909bc71f0e6bde5c0123600512915bf8b2c14b05e859ea2257',
    'd23d2ca072a9e8327c9965ede160f26b6ad535f1ce073b101bb5b39fd5af2c48',
    '3a20ff1e7c457006847bbcf6c94d8b9098a28fb89dc03dd3fabf2f52c7bbc056',
    '79f2a5a10de5583e63aebab7c7177d4a15f842c6b242ed106e4e6076dc1af9df',
    '6100f6cabd9b9b2398f29baef4eb095d8b95085399d917a9e45cb5a006b35d39',
    '6a6292768d541c8e5f90e7fd963740ade6330b5fae8d30e83c302af039325fdf',
    '9d0617ace0339a272e2fb49f0b5ee7eba678c96821915f7dfc58826be5931814',
    '4bd3c2bd0ec090a5e4c00b39b66cdbc6b9038ae3d0d8507493e7846a33221732',
    'abad798381d8853a454c9a448f5a7cba70a4ae12055c24cd768c553650bc59eb',
    'c77b8b32f8e4edaf87bfe119734a1fab98cf43fb2b0431330291f7e693c11739',
    '5cbc45a76a0cd39f93608139ad71e01d81743950b52d57cc0529578ce0296e5c',
    'ca4c846cd796b620b1a62ddc8d32412fd55fe13a4032990af6094e097b307117',
    'f1ef4ba3b49675bb1f2282f2e2238e27ce2660cfd26b8be9dd93e108e9120393',
    '9e39c3b4eeb9e2487d0c19ba934ae3a942601b213e39f2709121e3caa6edb898',
    '0c35a6495cac2bb2545f1125b8c366b12f400d202f4902143a7293caf4841c0e',
    '92ae88639bfbd388e798170f8c371e5940c467d507e85e60f05be1f246fe2013',
  ]);
});

test('MIGRATION 4 REBUILDS device_grant: every row copied, a seventh reach, and a scope', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  await applyMigrations(sql, clock);
  /* Back to the table migration 1 made, with a row in it, so migration 4 runs over something. */
  const shipped = statements(MIGRATIONS[0]!.sql).find((s) => s.startsWith('CREATE TABLE device_grant'))!;
  sql.exec('DROP TABLE device_grant');
  sql.exec(shipped);
  sql.exec('ALTER TABLE grant DROP COLUMN sealed_under');
  sql.exec('ALTER TABLE token DROP COLUMN reach');
  /* And migration 19's and 20's columns, for the same reason. */
  sql.exec('ALTER TABLE member DROP COLUMN row_where');
  sql.exec('ALTER TABLE record DROP COLUMN quiet');
  sql.exec('DELETE FROM migration WHERE version >= 4');
  const row = ['fake-poll-id', 'fake-hash', 'denied', 'runner', 'old-box', null, null, 5, '2026-09-01T00:00:00.000Z', null, null, null];
  sql.exec(
    'INSERT INTO device_grant (id, code_hash, status, reach, label, ua, token_hash, tries, expires, approved_by, approved_at, last_used) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ...(row as (string | number | null)[]),
  );

  const { result } = await applyMigrations(sql, clock);
  assert.ok(result.ok, fixOf(result));
  assert.deepEqual(result.value.applied, [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48]);
  assert.deepEqual(
    { ...sql.one<Record<string, unknown>>('SELECT id, code_hash, status, reach, label, tries, scope FROM device_grant') },
    { id: 'fake-poll-id', code_hash: 'fake-hash', status: 'denied', reach: 'runner', label: 'old-box', tries: 5, scope: null },
  );
  sql.exec("INSERT INTO device_grant (id, code_hash, status, reach, scope, expires) VALUES ('v', 'h', 'pending', 'vault', '*', 'x')");
  assert.throws(() => sql.exec("INSERT INTO device_grant (id, code_hash, status, reach, expires) VALUES ('e', 'h', 'pending', 'eighth', 'x')"), /CHECK/);
  assert.equal(sql.all("SELECT name FROM sqlite_master WHERE name = 'device_grant_next'").length, 0);
  sql.close();
});

test('MIGRATION 33 REBUILDS device_grant: every row copied with its scope, and an eighth reach, shape', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  await applyMigrations(sql, clock);
  /* Back to the table migration 4 made, with a keychain row in it, so migration 33 runs over something. */
  const four = statements(MIGRATIONS[3]!.sql).find((s) => s.startsWith('CREATE TABLE device_grant_next'))!;
  sql.exec('DROP TABLE device_grant');
  sql.exec(four);
  sql.exec('ALTER TABLE device_grant_next RENAME TO device_grant');
  sql.exec('DELETE FROM migration WHERE version >= 33');
  sql.exec(
    "INSERT INTO device_grant (id, code_hash, status, reach, scope, label, tries, expires) VALUES ('poll', 'hash', 'active', 'vault', '*', 'laptop', 1, '2026-09-01T00:00:00.000Z')",
  );
  assert.throws(() => sql.exec("INSERT INTO device_grant (id, code_hash, status, reach, expires) VALUES ('s', 'h', 'pending', 'shape', 'x')"), /CHECK/);

  const { result } = await applyMigrations(sql, clock);
  assert.ok(result.ok, fixOf(result));
  assert.deepEqual(result.value.applied, [33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48]);
  assert.deepEqual(
    { ...sql.one<Record<string, unknown>>('SELECT id, code_hash, status, reach, scope, label, tries FROM device_grant') },
    { id: 'poll', code_hash: 'hash', status: 'active', reach: 'vault', scope: '*', label: 'laptop', tries: 1 },
  );
  sql.exec("INSERT INTO device_grant (id, code_hash, status, reach, expires) VALUES ('s', 'h', 'pending', 'shape', 'x')");
  assert.throws(() => sql.exec("INSERT INTO device_grant (id, code_hash, status, reach, expires) VALUES ('n', 'h', 'pending', 'ninth', 'x')"), /CHECK/);
  assert.equal(sql.all("SELECT name FROM sqlite_master WHERE name = 'device_grant_next'").length, 0);
  sql.close();
});

test('MIGRATION 13 REBUILDS outbox: every row copied, and infer.ask admitted', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  await applyMigrations(sql, clock);
  /* Back to the table migration 12 made, with a row in it, so migration 13 runs over something. */
  const twelve = statements(MIGRATIONS[11]!.sql);
  sql.exec('DROP TABLE outbox');
  sql.exec(twelve.find((s) => s.startsWith('CREATE TABLE outbox_next'))!);
  sql.exec('ALTER TABLE outbox_next RENAME TO outbox');
  sql.exec('CREATE INDEX outbox_ready ON outbox(state, created)');
  /* And migration 15's column, which `ADD COLUMN` cannot re-apply over itself. */
  sql.exec('ALTER TABLE token DROP COLUMN reach');
  /* And migration 19's and 20's columns, for the same reason. */
  sql.exec('ALTER TABLE member DROP COLUMN row_where');
  sql.exec('ALTER TABLE record DROP COLUMN quiet');
  /* And migration 21's, which no rebuild above 13 takes away. */
  sql.exec('ALTER TABLE suggestion DROP COLUMN drafted_by');
  sql.exec('DELETE FROM migration WHERE version >= 13');
  sql.exec("INSERT INTO outbox (id, created, kind, payload, state, attempts) VALUES ('j1', '2026-09-01T00:00:00.000Z', 'script.run', '{}', 'failed', 3)");
  assert.throws(() => sql.exec("INSERT INTO outbox (id, created, kind, payload) VALUES ('j2', 'x', 'infer.ask', '{}')"), /CHECK/);

  const { result } = await applyMigrations(sql, clock);
  assert.ok(result.ok, fixOf(result));
  assert.deepEqual(result.value.applied, [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48]);
  assert.deepEqual(
    { ...sql.one<Record<string, unknown>>('SELECT id, kind, state, attempts FROM outbox') },
    { id: 'j1', kind: 'script.run', state: 'failed', attempts: 3 },
  );
  sql.exec("INSERT INTO outbox (id, created, kind, payload) VALUES ('j2', 'x', 'infer.ask', '{}')");
  assert.throws(() => sql.exec("INSERT INTO outbox (id, created, kind, payload) VALUES ('j3', 'x', 'infer.guess', '{}')"), /CHECK/);
  assert.equal(sql.all("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'outbox_ready'").length, 1);
  sql.close();
});

test('MIGRATION 14 ADDS push_sub IN THE local SECTION, one row per person per endpoint', async () => {
  const { sql, result } = await open();
  assert.ok(result.ok, fixOf(result));
  /* `local` IS THE WHOLE PROMISE that an endpoint never leaves in a `.brain` file: `exportBrainl` reads this row and
     nothing else to decide, so a table placed anywhere else would travel. */
  assert.equal(sql.one<{ section: string }>("SELECT section FROM dog_section WHERE table_name = 'push_sub'")?.section, 'local');
  const add = (id: string, person: string) =>
    sql.exec("INSERT INTO push_sub (id, person_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, 'https://push.test/one', 'k', 'a', 'x')", id, person);
  add('s1', 'p_ada');
  add('s2', 'p_bo');
  assert.throws(() => add('s3', 'p_ada'), /UNIQUE/, 'one person saved one endpoint twice');
  sql.close();
});

/* ── the checksum ────────────────────────────────────────────────────────── */

test('the checksum ignores line endings and trailing whitespace, and nothing else', async () => {
  // The alternative is a schema mismatch every time an editor trims a line or a file crosses an
  // operating system. What must not vary is the SQL; how it was stored must be allowed to.
  const base = 'CREATE TABLE a (b TEXT);\nCREATE TABLE c (d TEXT);\n';
  assert.equal(await checksum(base), await checksum(base.replace(/\n/g, '\r\n')));
  assert.equal(await checksum(base), await checksum(base.replace(/;\n/g, ';   \n')));
  assert.notEqual(await checksum(base), await checksum(base.replace('TEXT', 'INTEGER')));
  assert.equal(canon('a  \r\nb\t\n'), 'a\nb\n');
});

/* ── the copy cannot drift from the document ─────────────────────────────── */

test('THE DDL IS THE ONE IN THE DOCUMENT, VERBATIM', async () => {
  // A schema written twice is a schema that disagrees with itself, and the disagreement shows up as
  // a column somebody added to the document and not to the database. So the document is read.
  const doc = readFileSync(fileURLToPath(new URL('../../../docs/30-BLUEPRINT.md', import.meta.url)), 'utf8');
  const section = doc.slice(doc.indexOf('## 1 · The kernel schema'), doc.indexOf('## 2 · The `event.kind` vocabulary'));
  const fenced = /```sql\n([\s\S]*?)```/.exec(section)?.[1];
  assert.ok(fenced, 'the blueprint no longer carries its DDL in one sql block');

  const shipped = MIGRATIONS[0]!.sql;
  const wanted = fenced.replace(/CREATE TABLE migration \([\s\S]*?\);\n/, '');
  for (const statement of statements(wanted))
    assert.ok(
      statements(shipped).includes(statement),
      `the document has a statement the migration does not:\n${statement.slice(0, 160)}`,
    );
});

test('and the migration adds nothing the document does not have, except its seed', async () => {
  const doc = readFileSync(fileURLToPath(new URL('../../../docs/30-BLUEPRINT.md', import.meta.url)), 'utf8');
  const section = doc.slice(doc.indexOf('## 1 · The kernel schema'), doc.indexOf('## 2 · The `event.kind` vocabulary'));
  const fenced = /```sql\n([\s\S]*?)```/.exec(section)?.[1] ?? '';
  const documented = new Set(statements(fenced));
  const extra = statements(MIGRATIONS[0]!.sql).filter((s) => !documented.has(s));
  // The seed of `41-SPEC-KERNEL` §5.2, and only that.
  for (const s of extra) assert.match(s, /^INSERT INTO (dog_meta|dog_section|counter)/, `unexpected: ${s.slice(0, 120)}`);
});

test('MIGRATION 34 COUNTS WHAT EACH RULE HAS DONE, from its runs and its writes, once', async () => {
  const { sql } = await open();
  const clock = fixedClock(NOW);
  const ev = (id: string, actor: string, kind: string, target: string, batch: string, ts: string, field: string | null = 'what') =>
    sql.exec(
      "INSERT INTO event (id, ts, actor, kind, target, target_kind, field, to_v, batch) VALUES (?, ?, ?, ?, ?, 'entry', ?, 'x', ?)",
      id, ts, actor, kind, target, field, batch,
    );
  /* AN INLINE RULE: one patch of two fields on one row is one firing, a second write on another row is two, and its
     note is none. */
  ev('E1', 'rule:payee', 'edit', 'entry:A', 'B1', '2026-09-01T00:00:00.000Z');
  ev('E2', 'rule:payee', 'edit', 'entry:A', 'B1', '2026-09-01T00:00:00.000Z', 'amount');
  ev('E3', 'rule:payee', 'edit', 'entry:B', 'B2', '2026-09-02T00:00:00.000Z');
  ev('E4', 'rule:payee', 'note', 'entry:B', 'B2', '2026-09-03T00:00:00.000Z', null);
  /* A RUN-PATH RULE: counted by its runs alone, though its steps write as it too. */
  const run = (id: string, at: string, entry: string) =>
    sql.exec(
      "INSERT INTO automation_run (id, rule, version, trigger, actor, started_at) VALUES (?, 'follow-up', 1, ?, 'p_1', ?)",
      id, JSON.stringify({ kind: 'written', entry }), at,
    );
  run('R1', '2026-09-01T00:00:00.000Z', 'C');
  run('R2', '2026-09-04T00:00:00.000Z', 'D');
  ev('E5', 'rule:follow-up', 'edit', 'entry:D', 'B3', '2026-09-04T00:00:00.000Z');
  sql.exec('DELETE FROM rule_stat');
  sql.exec('DELETE FROM migration WHERE version >= 34');
  const { result } = await applyMigrations(sql, clock);
  assert.ok(result.ok, fixOf(result));
  const stats = () => sql.all('SELECT rule, fired, last_at, last_row FROM rule_stat ORDER BY rule').map((r) => ({ ...r }));
  assert.deepEqual(stats(), [
    { rule: 'follow-up', fired: 2, last_at: '2026-09-04T00:00:00.000Z', last_row: 'D' },
    { rule: 'payee', fired: 2, last_at: '2026-09-02T00:00:00.000Z', last_row: 'B' },
  ]);
  /* AND A COUNT RAISED SINCE IS KEPT when the ledger is rewound over it. */
  sql.exec("UPDATE rule_stat SET fired = 9 WHERE rule = 'payee'");
  sql.exec('DELETE FROM migration WHERE version >= 34');
  assert.ok((await applyMigrations(sql, clock)).result.ok);
  assert.equal(sql.one<{ fired: number }>("SELECT fired FROM rule_stat WHERE rule = 'payee'")?.fired, 9);
  sql.close();
});

test('MIGRATION 37 FINDS A CLOSED QUESTION BY ITS CAUSE, and 36 and 37 rewound apply again and change nothing', async () => {
  const { sql } = await open();
  const index = sql.one<{ sql: string }>("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'suggestion_cause_closed'");
  assert.match(index?.sql ?? '', /ON suggestion\(cause, opened_at DESC\) WHERE cause IS NOT NULL AND status <> 'open'/);
  /* THE READ A DECLINE IS FOUND BY goes through it, and not through a walk of every question. */
  const plan = sql
    .all<{ detail: string }>(
      "EXPLAIN QUERY PLAN SELECT id FROM suggestion WHERE cause = ? AND cause IS NOT NULL AND status <> 'open' ORDER BY opened_at DESC LIMIT 1",
      'c',
    )
    .map((r) => r.detail)
    .join(' | ');
  assert.match(plan, /suggestion_cause_closed/, plan);

  const before = snapshot(sql);
  /* MIGRATION 44'S LISTS TAKEN AWAY FIRST and 42's made live again, as a ledger rewound past 42 would find them: 42's
     seat run over 44's lists would seat 42's again as newer versions, which is the rewind's doing and not 36's or 37's.
     44 then seats its lists again under the same versions, so the record is as it was. */
  sql.exec("DELETE FROM declaration WHERE id IN ('register.session', 'register.instructions') AND superseded_at IS NULL");
  sql.exec("UPDATE declaration SET superseded_at = NULL WHERE id IN ('register.session', 'register.instructions') AND superseded_at = ?", SEATED_44);
  sql.exec('DELETE FROM migration WHERE version >= 36');
  const { result } = await applyMigrations(sql, fixedClock(NOW + 86_400_000));
  assert.ok(result.ok, fixOf(result));
  assert.deepEqual(result.value.applied, [36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48]);
  const { migration: _then, ...after } = snapshot(sql);
  const { migration: _now, ...first } = before;
  assert.deepEqual(after, first, 'applying 36 and 37 a second time changed the record');
  sql.close();
});
