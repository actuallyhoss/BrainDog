/**
 * A record whose search index is damaged opens, with its index rebuilt, and is not refused.
 *
 * MEASURED BEFORE THE FIX, over two damages made to a real file: with `entry_fts_config` dropped, the boot probe's
 * `LIMIT 0` read threw `vtable constructor failed: entry_fts`, and with the table's schema row removed it threw
 * `no such table: entry_fts`. Neither is a missing module, so `applyMigrations` rethrew both and `openRecord` threw: no
 * method answered, not even `export`, and every row was intact. The build before daef0898 opened both files, which is
 * not the same as working: over the first damage it could read a row but `export`, `search` and a write to a searchable
 * list all threw the same driver sentence, and over the second only `export` answered. So "open without search" was not
 * enough for the owner to get their rows out, and the index is rebuilt instead.
 *
 * NEITHER DAMAGE CAN HAPPEN ON A NORMAL PATH. A hand edit, a partial copy or a storage fault makes it, and the file
 * then has to be opened by a SQLite that still has FTS5, which is why these run over the kernel's own `openSqlite()`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { applyMigrations } from '../src/migrate.ts';
import { openRecord, type Declaration } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const clock = fixedClock(Date.UTC(2026, 8, 24, 12));

const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true, search: true },
      { id: 'party', type: 'text', search: true },
    ],
  } as never,
};

/**
 * The two damages above, statement for statement, and four more found past them.
 *
 * THE FOUR OPENED WITHOUT A REBUILD, because the boot probe's `LIMIT 0` read compiles against the config table and
 * nothing else, and then a write to a searchable list threw: `database disk image is malformed` with `data` or
 * `docsize` gone, `cannot rollback - no transaction is active` with `idx` gone, and `no such table:
 * main.entry_fts_content` with `content` gone. Every search threw the same.
 */
const DAMAGES = {
  'the config shadow table dropped': ['DROP TABLE entry_fts_config'],
  'the data shadow table dropped': ['DROP TABLE entry_fts_data'],
  'the idx shadow table dropped': ['DROP TABLE entry_fts_idx'],
  'the content shadow table dropped': ['DROP TABLE entry_fts_content'],
  'the docsize shadow table dropped': ['DROP TABLE entry_fts_docsize'],
  'the index table gone from the schema': [
    'PRAGMA writable_schema = ON',
    "DELETE FROM sqlite_master WHERE name = 'entry_fts'",
    'PRAGMA writable_schema = OFF',
  ],
} as const;

/** How many rows the record holds, which no repair of the index may change. */
const rows = (sql: NodeSql): number => sql.one<{ n: number }>('SELECT count(*) AS n FROM entry')!.n;

/** A file with one searchable row, damaged, closed, and handed back unopened. */
async function damaged(statements: readonly string[]): Promise<{ file: string; id: string; held: number; done: () => void }> {
  const dir = mkdtempSync(join(tmpdir(), 'bd-damaged-index-'));
  const file = join(dir, 'r.brain');
  const sql = openSqlite(file);
  const k = await openRecord(sql, clock);
  assert.ok(k.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'studio', name: 'S', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  assert.ok((await k.install([OBLIGATIONS])).ok);
  const row = k.create('obligations', { what: 'Invoice 41', party: 'Halden' } as never, { actor: 'p_1' });
  assert.ok(row.ok);
  assert.equal(k.search('Halden').length, 1, 'the row was findable before the damage');
  const held = rows(sql);
  for (const s of statements) sql.exec(s);
  sql.close();
  return { file, id: row.value.id, held, done: () => rmSync(dir, { recursive: true, force: true }) };
}

for (const [label, statements] of Object.entries(DAMAGES)) {
  test(`WITH ${label.toUpperCase()}, THE RECORD OPENS AND ITS SEARCH IS REBUILT`, async () => {
    const { file, id, held, done } = await damaged(statements);
    const sql: NodeSql = openSqlite(file);
    try {
      const { result, state } = await applyMigrations(sql, clock);
      assert.equal(state.refusal, null, `a damaged index is not a refusal: ${JSON.stringify(state.refusal)}`);
      assert.ok(result.ok);
      assert.equal(rows(sql), held, 'the repair touched the index and not one row');

      const k = await openRecord(sql, clock);
      assert.equal(k.get(id)?.fields.what, 'Invoice 41', 'the row reads');
      /* THE REBUILT INDEX FINDS WHAT THE DAMAGED ONE HELD, so a person's search answers the same as before. */
      assert.deepEqual(k.search('Halden').map((h) => h.id), [id]);

      const out = await k.export();
      assert.ok(out.ok, `the owner can take the rows out: ${JSON.stringify(out)}`);
      assert.ok(out.value.some((line) => line.includes('Invoice 41')));

      /* AND IT WRITES AGAIN: a write to a searchable list lands its index line in the same transaction as the row. */
      const next = k.create('obligations', { what: 'Invoice 42', party: 'Mirren' } as never, { actor: 'p_1' });
      assert.ok(next.ok, JSON.stringify(next));
      assert.deepEqual(k.search('Mirren').map((h) => h.id), [next.value.id]);
    } finally {
      sql.close();
      done();
    }
  });
}

test('AN INDEX THAT LOST ITS OWN LINES TOO OPENS AND STILL FINDS EVERY ROW WRITTEN BEFORE', async () => {
  /* THE INDEX IS PROJECTED FROM `entry`, NOT REFILLED FROM ITS OWN COPY. Before this fix the rebuild read
     `entry_fts_content`, so with that dropped beside the config it opened with an empty index and this search answered
     nothing for a row that was there (measured). */
  const { file, id, held, done } = await damaged(['DROP TABLE entry_fts_content', 'DROP TABLE entry_fts_config']);
  const sql = openSqlite(file);
  try {
    const k = await openRecord(sql, clock);
    assert.equal(rows(sql), held);
    assert.equal(k.get(id)?.fields.what, 'Invoice 41');
    assert.ok((await k.export()).ok);
    assert.deepEqual(k.search('Halden').map((h) => h.id), [id], 'the row written before the damage is found');
    const next = k.create('obligations', { what: 'Invoice 42', party: 'Mirren' } as never, { actor: 'p_1' });
    assert.ok(next.ok);
    assert.deepEqual(k.search('Mirren').map((h) => h.id), [next.value.id]);
  } finally {
    sql.close();
    done();
  }
});

/** Every statement `applyMigrations` ran that drops an `entry_fts` table, which only a rebuild does. */
async function drops(sql: NodeSql): Promise<string[]> {
  const ran: string[] = [];
  const exec = sql.exec.bind(sql);
  sql.exec = (text, ...params) => {
    if (/^DROP TABLE (IF EXISTS )?entry_fts/.test(text)) ran.push(text);
    exec(text, ...params);
  };
  assert.ok((await applyMigrations(sql, clock)).result.ok);
  sql.exec = exec;
  return ran;
}

const shape = (sql: NodeSql) =>
  sql.all<{ name: string; sql: string }>("SELECT name, sql FROM sqlite_master WHERE name LIKE 'entry_fts%' ORDER BY name");

for (const [label, statements] of Object.entries(DAMAGES)) {
  test(`WITH ${label.toUpperCase()}, THE REBUILT INDEX IS WHOLE, SO THE NEXT OPEN HAS NOTHING TO DO`, async () => {
    const { file, done } = await damaged(statements);
    const first = openSqlite(file);
    assert.notDeepEqual(await drops(first), [], 'the first open rebuilt');
    const repaired = shape(first);
    first.close();

    /* THE SAME FIVE SHADOW TABLES AND THE SAME DDL a fresh file gets, and not a second, different index beside them. */
    const fresh = openSqlite();
    await applyMigrations(fresh, clock);
    assert.deepEqual(repaired, shape(fresh));
    fresh.close();

    /* AND THE PROBE DOES NOT FIRE ON A WHOLE INDEX: it runs on every open, so a false alarm is a rebuild on every open. */
    const second = openSqlite(file);
    assert.deepEqual(await drops(second), []);
    assert.deepEqual(shape(second), repaired);
    second.close();
    done();
  });
}

test('A LIST THAT NAMES ITS SEARCHED FIELDS AT THE TOP IS FOUND BY THEM AFTER A REBUILD', async () => {
  /* `02 §1`'S OTHER SPELLING, `search: [field]` on the list and no flag on the field. The rebuild projects from the
     declarations before `makeKernel` folds that spelling in, so it folds it itself; without that the rebuilt line held
     the title alone and a search by the party answered nothing (checked by taking the fold out). */
  const dir = mkdtempSync(join(tmpdir(), 'bd-damaged-index-'));
  const file = join(dir, 'r.brain');
  const made = openSqlite(file);
  const k0 = await openRecord(made, clock);
  const declared: Declaration = {
    id: 'register.debts',
    kind: 'register',
    body: {
      id: 'debts',
      name: 'Debts',
      title: 'what',
      search: ['party'],
      fields: [
        { id: 'what', type: 'text', required: true },
        { id: 'party', type: 'text' },
      ],
    } as never,
  };
  assert.ok((await k0.install([declared])).ok);
  const row = k0.create('debts', { what: 'Loan', party: 'Halden' } as never, { actor: 'p_1' });
  assert.ok(row.ok);
  assert.deepEqual(k0.search('Halden').map((h) => h.id), [row.value.id], 'found by the party before the damage');
  made.exec('DROP TABLE entry_fts_content');
  made.close();

  const sql = openSqlite(file);
  try {
    const k = await openRecord(sql, clock);
    assert.deepEqual(k.search('Halden').map((h) => h.id), [row.value.id]);
  } finally {
    sql.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('A SERIES STAYS OUT OF A REBUILT INDEX, AS IT STAYS OUT OF A WRITTEN ONE', async () => {
  /* THE REBUILD READS THE SERIES FLAG FROM THE DECLARATION ITSELF, and the write path skips a series row (`reproject`).
     With that flag read as false, every test above still passed and the rebuilt index held the series row's line,
     so a search answered a point on a line that no write would ever have indexed (checked by forcing it false). */
  const dir = mkdtempSync(join(tmpdir(), 'bd-damaged-index-'));
  const file = join(dir, 'r.brain');
  const made = openSqlite(file);
  const k0 = await openRecord(made, clock);
  const points: Declaration = {
    id: 'register.points',
    kind: 'register',
    body: { id: 'points', name: 'Points', title: 'at', series: true, fields: [{ id: 'at', type: 'text', search: true }] } as never,
  };
  assert.ok((await k0.install([OBLIGATIONS, points])).ok);
  const kept = k0.create('obligations', { what: 'Invoice 41', party: 'Halden' } as never, { actor: 'p_1' });
  assert.ok(kept.ok);
  assert.ok(k0.create('points', { at: 'Halden reading' } as never, { actor: 'p_1' }).ok);
  assert.deepEqual(k0.search('Halden').map((h) => h.id), [kept.value.id], 'the series row was never indexed');
  made.exec('DROP TABLE entry_fts_content');
  made.close();

  const sql = openSqlite(file);
  try {
    const k = await openRecord(sql, clock);
    assert.deepEqual(k.search('Halden').map((h) => h.id), [kept.value.id]);
  } finally {
    sql.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
