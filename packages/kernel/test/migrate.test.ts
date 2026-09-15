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
  assert.deepEqual(result.value, { kernel: 3, format: 1, applied: [1, 2, 3] });

  const tables = sql
    .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .map((r) => r.name)
    .filter((n) => !n.startsWith('sqlite_') && !n.startsWith('entry_fts_'));
  // Thirty-one in `30-BLUEPRINT` §1, counted there and counted here.
  assert.equal(tables.length, 31, `tables: ${tables.join(', ')}`);
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
  assert.deepEqual(first.result.value.applied, [1, 2, 3]);
  assert.deepEqual(second.result.value.applied, [], 'a second run re-applied a migration');
  assert.equal(sql.all('SELECT version FROM migration').length, 3);
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
  sql.exec('DELETE FROM migration WHERE version >= 2');
  return sql;
}

test('A RECORD CREATED BEFORE MIGRATION 2 TAKES IT ON OPEN, and everything it held is untouched', async () => {
  const sql = await beforeMigration2();
  const before = snapshot(sql);

  const { result } = await applyMigrations(sql, fixedClock(NOW));
  assert.ok(result.ok, fixOf(result));
  assert.deepEqual(result.value.applied, [2, 3]);

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
  assert.equal(rows.length, 31);
  /* FIVE, not four: `origin` is its own section because a `.dog` can be exported without the raw
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
  ]);
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
