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
import { openRecord, type Declaration } from '../src/index.ts';
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
  assert.deepEqual(result.value, { kernel: 15, format: 1, applied: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] });

  const tables = sql
    .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .map((r) => r.name)
    .filter((n) => !n.startsWith('sqlite_') && !n.startsWith('entry_fts_'));
  // Thirty-one in `30-BLUEPRINT` §1, `invitation` from migration 6, `view` from migration 7, `pref` and `pack_removed` from 9.
  // Migration 10 adds a column and no table. Migration 14 adds `push_sub`.
  assert.equal(tables.length, 38, `tables: ${tables.join(', ')}`);
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
  assert.deepEqual(first.result.value.applied, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  assert.deepEqual(second.result.value.applied, [], 'a second run re-applied a migration');
  assert.equal(sql.all('SELECT version FROM migration').length, 15);
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
  sql.exec('DELETE FROM migration WHERE version >= 2');
  return sql;
}

test('A RECORD CREATED BEFORE MIGRATION 2 TAKES IT ON OPEN, and everything it held is untouched', async () => {
  const sql = await beforeMigration2();
  const before = snapshot(sql);

  const { result } = await applyMigrations(sql, fixedClock(NOW));
  assert.ok(result.ok, fixOf(result));
  assert.deepEqual(result.value.applied, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);

  const after = snapshot(sql);
  assert.deepEqual(after.entry, before.entry, 'a row changed');
  assert.deepEqual(after.event, before.event, 'the history changed');
  assert.deepEqual(after.counter, before.counter, 'a counter changed');
  assert.deepEqual(
    after.declaration.filter((d) => (d as { id: string }).id !== 'register.session'),
    before.declaration,
    'a declaration other than the kernel one changed',
  );
  const seated = sql.one<{ version: number; pack_id: string }>("SELECT version, pack_id FROM declaration WHERE id = 'register.session'");
  assert.deepEqual({ ...seated }, { version: 1, pack_id: 'kernel' });
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
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.pack_id, null);
  assert.ok(rows[0]?.superseded_at, 'the record’s own declaration is still active beside the kernel one');
  assert.deepEqual(
    { version: rows[1]?.version, pack_id: rows[1]?.pack_id, superseded_at: rows[1]?.superseded_at },
    { version: 2, pack_id: 'kernel', superseded_at: null },
  );
  assert.equal(sql.all("SELECT 1 FROM entry WHERE register = 'session'").length, 1, 'the record’s own session row was lost');
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
  assert.equal(rows.length, 38);
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
  sql.exec('DELETE FROM migration WHERE version >= 4');
  const row = ['fake-poll-id', 'fake-hash', 'denied', 'runner', 'old-box', null, null, 5, '2026-09-01T00:00:00.000Z', null, null, null];
  sql.exec(
    'INSERT INTO device_grant (id, code_hash, status, reach, label, ua, token_hash, tries, expires, approved_by, approved_at, last_used) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ...(row as (string | number | null)[]),
  );

  const { result } = await applyMigrations(sql, clock);
  assert.ok(result.ok, fixOf(result));
  assert.deepEqual(result.value.applied, [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  assert.deepEqual(
    { ...sql.one<Record<string, unknown>>('SELECT id, code_hash, status, reach, label, tries, scope FROM device_grant') },
    { id: 'fake-poll-id', code_hash: 'fake-hash', status: 'denied', reach: 'runner', label: 'old-box', tries: 5, scope: null },
  );
  sql.exec("INSERT INTO device_grant (id, code_hash, status, reach, scope, expires) VALUES ('v', 'h', 'pending', 'vault', '*', 'x')");
  assert.throws(() => sql.exec("INSERT INTO device_grant (id, code_hash, status, reach, expires) VALUES ('e', 'h', 'pending', 'eighth', 'x')"), /CHECK/);
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
  sql.exec('DELETE FROM migration WHERE version >= 13');
  sql.exec("INSERT INTO outbox (id, created, kind, payload, state, attempts) VALUES ('j1', '2026-09-01T00:00:00.000Z', 'script.run', '{}', 'failed', 3)");
  assert.throws(() => sql.exec("INSERT INTO outbox (id, created, kind, payload) VALUES ('j2', 'x', 'infer.ask', '{}')"), /CHECK/);

  const { result } = await applyMigrations(sql, clock);
  assert.ok(result.ok, fixOf(result));
  assert.deepEqual(result.value.applied, [13, 14, 15]);
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
