/**
 * Migration 38 and what it is for: an add-on keeps the parts its plan held back (`when: { holds }`).
 *
 * A plan takes out a part that waits for something the record does not hold yet and names it in `waiting`. Before this
 * the plan was the only place that said so, and it is gone once the install lands, so nothing could plan the add-on
 * again when People arrived and its page could not say that a part waits. Each case here fails without the column.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import { applyMigrations, MIGRATIONS } from '../src/migrate.ts';
import { openRecord, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';
import { testSigner } from './signer.ts';

const NOW = Date.UTC(2026, 9, 13, 9);

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  return { k: await openRecord(sql, fixedClock(NOW)), sql };
}

/** An add-on's `pack` row as an install writes it, with whatever its plan held back. */
const addOn = (id: string, version: string, waiting?: { at: string; holds: string[] }[]) => ({
  id,
  version,
  source: 'paste',
  ref: null,
  manifest: JSON.stringify({ pack: id, version }),
  checksum: `sum-${id}-${version}`,
  ...(waiting === undefined ? {} : { waiting }),
});

const columns = (sql: NodeSql) => sql.all<{ name: string; type: string; notnull: number; pk: number }>("SELECT name, type, \"notnull\", pk FROM pragma_table_info('pack') ORDER BY cid").map((c) => ({ ...c }));
const indexes = (sql: NodeSql) => sql.all<{ name: string; sql: string | null }>("SELECT name, sql FROM sqlite_master WHERE type = 'index' ORDER BY name").map((i) => ({ ...i }));
const cell = (sql: NodeSql, id: string) => sql.one<{ waiting: string | null }>('SELECT waiting FROM pack WHERE id = ?', id)?.waiting;

const VISITS_OWNER = { at: 'register.visits.fields.owner', holds: ['people'] };
const VISITS_BLOCK = { at: 'page.visits.blocks.by-person', holds: ['people', 'role:clients'] };

test('MIGRATION 38 RUNS ONCE over a record at 37: one new column, every other column and index kept, and nothing waiting', async () => {
  const { k, sql } = await record();
  k.rememberPack(addOn('visits', '1.0.0'));
  const was = { columns: columns(sql).filter((c) => c.name !== 'waiting'), indexes: indexes(sql) };
  const row = { ...sql.one<Record<string, unknown>>('SELECT id, version, source, source_ref, manifest, installed_at, checksum, disabled_at FROM pack') };

  /* Back to what a record at 37 holds: no column, and no line for 38 in the ledger. */
  sql.exec('ALTER TABLE pack DROP COLUMN waiting');
  sql.exec('DELETE FROM migration WHERE version >= 38');
  assert.deepEqual(columns(sql), was.columns);

  const first = await applyMigrations(sql, fixedClock(NOW));
  assert.ok(first.result.ok, fixOf(first.result));
  assert.deepEqual(first.result.value.applied, [38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48]);
  assert.equal(first.result.value.kernel, MIGRATIONS.length);
  assert.equal(first.result.value.format, 1, 'a nullable column on pack is not a new file format');

  assert.deepEqual(columns(sql), [...was.columns, { name: 'waiting', type: 'TEXT', notnull: 0, pk: 0 }]);
  assert.deepEqual(indexes(sql), was.indexes);
  assert.deepEqual({ ...sql.one<Record<string, unknown>>('SELECT id, version, source, source_ref, manifest, installed_at, checksum, disabled_at FROM pack') }, row);
  assert.equal(cell(sql, 'visits'), null, 'an add-on installed before the migration has nothing waiting');

  /* A SECOND OPEN DOES NOT RUN IT AGAIN: `ADD COLUMN` twice would throw, and the ledger holds one line for 38. */
  const again = await applyMigrations(sql, fixedClock(NOW));
  assert.ok(again.result.ok, fixOf(again.result));
  assert.deepEqual(again.result.value.applied, []);
  const reopened = await openRecord(sql, fixedClock(NOW));
  assert.deepEqual(reopened.packsWaiting(), []);
  assert.equal(sql.all('SELECT version FROM migration WHERE version = 38').length, 1);
  sql.close();
});

test('MIGRATION 38 APPLIES AGAIN OVER ITSELF, as the tests that rewind the ledger need: every add-on kept, in place', async () => {
  const { k, sql } = await record();
  k.rememberPack(addOn('visits', '1.0.0', [VISITS_OWNER]));
  k.rememberPack(addOn('ledger', '2.1.0'));
  const shape = { columns: columns(sql), indexes: indexes(sql) };
  const rows = () => sql.all('SELECT rowid, id, version, source, source_ref, manifest, installed_at, checksum, disabled_at FROM pack ORDER BY rowid').map((r) => ({ ...r }));
  const was = rows();

  sql.exec('DELETE FROM migration WHERE version >= 38');
  const { result } = await applyMigrations(sql, fixedClock(NOW));
  assert.ok(result.ok, fixOf(result));
  assert.deepEqual(result.value.applied, [38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48]);
  assert.deepEqual({ columns: columns(sql), indexes: indexes(sql) }, shape);
  assert.deepEqual(rows(), was);
  assert.equal(sql.all("SELECT name FROM sqlite_master WHERE name = 'pack_next'").length, 0);
  /* What waited starts over, which the next install writes again: SQL cannot name a column that may not be there. */
  assert.equal(cell(sql, 'visits'), null);
  sql.close();
});

test('AN INSTALL WITH PARTS HELD BACK WRITES THEM, and the record reads which add-ons wait and for what', async () => {
  const { k, sql } = await record();
  k.rememberPack(addOn('visits', '1.0.0', [VISITS_OWNER, VISITS_BLOCK]));
  k.rememberPack(addOn('ledger', '2.1.0'));
  k.rememberPack(addOn('errands', '0.3.0', [{ at: 'register.errands.fields.for', holds: ['people'] }]));

  assert.deepEqual(JSON.parse(cell(sql, 'visits')!), [VISITS_OWNER, VISITS_BLOCK]);
  assert.equal(cell(sql, 'ledger'), null);
  /* In id order, and only the add-ons with something waiting: this is the list the record plans again from. */
  assert.deepEqual(k.packsWaiting(), [
    { id: 'errands', waiting: [{ at: 'register.errands.fields.for', holds: ['people'] }] },
    { id: 'visits', waiting: [VISITS_OWNER, VISITS_BLOCK] },
  ]);
  sql.close();
});

test('A REINSTALL WITH NOTHING HELD BACK WRITES NULL, never an empty list, and an upgrade writes what its own plan held', async () => {
  const { k, sql } = await record();
  k.rememberPack(addOn('visits', '1.0.0', [VISITS_OWNER, VISITS_BLOCK]));

  /* People arrived for one part: the next plan holds back only the other. */
  k.rememberPack(addOn('visits', '1.1.0', [VISITS_BLOCK]));
  assert.deepEqual(k.packsWaiting(), [{ id: 'visits', waiting: [VISITS_BLOCK] }]);

  /* And then for both. A plan that names no waiting parts and one that names none at all read the same. */
  k.rememberPack(addOn('visits', '1.1.0', []));
  assert.equal(cell(sql, 'visits'), null);
  assert.deepEqual(k.packsWaiting(), []);
  k.rememberPack(addOn('visits', '1.1.0', [VISITS_OWNER]));
  k.rememberPack(addOn('visits', '1.1.0'));
  assert.equal(cell(sql, 'visits'), null);
  assert.equal(sql.all('SELECT id FROM pack').length, 1);
  sql.close();
});

test('WHAT WAITS GOES WITH THE ADD-ON: gone when it is uninstalled, and a cell nothing here wrote reads as nothing waiting', async () => {
  const { k, sql } = await record();
  k.rememberPack(addOn('visits', '1.0.0', [VISITS_OWNER]));
  k.rememberPack(addOn('errands', '0.3.0', [VISITS_BLOCK]));
  k.forgetPack('visits');
  assert.deepEqual(k.packsWaiting(), [{ id: 'errands', waiting: [VISITS_BLOCK] }]);

  /* Only `rememberPack` writes the column. A cell from anywhere else must not take the add-ons page down. */
  sql.exec("UPDATE pack SET waiting = 'not json' WHERE id = 'errands'");
  assert.deepEqual(k.packsWaiting(), []);
  sql.exec(`UPDATE pack SET waiting = '[{"at":"register.errands.fields.for","holds":["people",7]},{"holds":["people"]},null]' WHERE id = 'errands'`);
  assert.deepEqual(k.packsWaiting(), [{ id: 'errands', waiting: [{ at: 'register.errands.fields.for', holds: ['people'] }] }]);
  sql.close();
});

test('WHAT WAITS TRAVELS IN THE FILE: an export read into a new record still says which add-ons wait and for what', async () => {
  const signer = testSigner();
  const from = openSqlite();
  const source = await openRecord(from, fixedClock(NOW), { sign: signer });
  source.rememberPack(addOn('visits', '1.0.0', [VISITS_OWNER, VISITS_BLOCK]));
  source.rememberPack(addOn('ledger', '2.1.0'));
  const file = await source.export();
  assert.ok(file.ok, fixOf(file));

  /* The file's columns are read from the schema, so nothing names `waiting` to carry it: this is what says it is carried. */
  const to = openSqlite();
  const target = await openRecord(to, fixedClock(NOW), { sign: signer });
  const report = await target.import(file.value);
  assert.ok(report.ok, fixOf(report));
  assert.deepEqual(target.packsWaiting(), [{ id: 'visits', waiting: [VISITS_OWNER, VISITS_BLOCK] }]);
  assert.equal(cell(to, 'ledger'), null);
  from.close();
  to.close();
});
