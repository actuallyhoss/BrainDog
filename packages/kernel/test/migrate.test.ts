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
  assert.deepEqual(result.value, { kernel: 1, format: 1, applied: [1] });

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
  assert.deepEqual(first.result.value.applied, [1]);
  assert.deepEqual(second.result.value.applied, [], 'a second run re-applied a migration');
  assert.equal(sql.all('SELECT version FROM migration').length, 1);
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
