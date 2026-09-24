/**
 * A record whose search index is damaged opens, with its index rebuilt, and is not refused (audit sixty-four, finding 4).
 *
 * MEASURED BEFORE THE FIX, 24 September 2026, over the two damages the audit's B1 made to a real file: with
 * `entry_fts_config` dropped, the boot probe's `LIMIT 0` read threw `vtable constructor failed: entry_fts`, and with
 * the table's schema row removed it threw `no such table: entry_fts`. Neither is a missing module, so `applyMigrations`
 * rethrew both and `openRecord` threw: no method answered, not even `export`, and every row was intact. The build
 * before daef0898 opened both files, which is not the same as working: over the first damage it could read a row but
 * `export`, `search` and a write to a searchable list all threw the same driver sentence, and over the second only
 * `export` answered. So "open without search" was not enough for the owner to get their rows out, and the index is
 * rebuilt instead.
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

/** B1's two damages, statement for statement. */
const DAMAGES = {
  'the config shadow table dropped': ['DROP TABLE entry_fts_config'],
  'the index table gone from the schema': [
    'PRAGMA writable_schema = ON',
    "DELETE FROM sqlite_master WHERE name = 'entry_fts'",
    'PRAGMA writable_schema = OFF',
  ],
} as const;

/** A file with one searchable row, damaged, closed, and handed back unopened. */
async function damaged(statements: readonly string[]): Promise<{ file: string; id: string; done: () => void }> {
  const dir = mkdtempSync(join(tmpdir(), 'bd-damaged-index-'));
  const file = join(dir, 'r.brain');
  const sql = openSqlite(file);
  const k = await openRecord(sql, clock);
  assert.ok(k.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'studio', name: 'S', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  assert.ok((await k.install([OBLIGATIONS])).ok);
  const row = k.create('obligations', { what: 'Invoice 41', party: 'Halden' } as never, { actor: 'p_1' });
  assert.ok(row.ok);
  assert.equal(k.search('Halden').length, 1, 'the row was findable before the damage');
  for (const s of statements) sql.exec(s);
  sql.close();
  return { file, id: row.value.id, done: () => rmSync(dir, { recursive: true, force: true }) };
}

for (const [label, statements] of Object.entries(DAMAGES)) {
  test(`WITH ${label.toUpperCase()}, THE RECORD OPENS AND ITS SEARCH IS REBUILT`, async () => {
    const { file, id, done } = await damaged(statements);
    const sql: NodeSql = openSqlite(file);
    try {
      const { result, state } = await applyMigrations(sql, clock);
      assert.equal(state.refusal, null, `a damaged index is not a refusal: ${JSON.stringify(state.refusal)}`);
      assert.ok(result.ok);

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

test('AN INDEX THAT LOST ITS OWN LINES TOO STILL OPENS, AND FINDS WHAT IS WRITTEN NEXT', async () => {
  /* THE REFILL READS `entry_fts_content`, so with that gone as well there is nothing to refill from. The rows are the
     record and they still read and export; the index starts again empty rather than keep the record shut. */
  const { file, id, done } = await damaged(['DROP TABLE entry_fts_content', 'DROP TABLE entry_fts_config']);
  const sql = openSqlite(file);
  try {
    const k = await openRecord(sql, clock);
    assert.equal(k.get(id)?.fields.what, 'Invoice 41');
    assert.ok((await k.export()).ok);
    assert.deepEqual(k.search('Halden'), [], 'nothing was left to refill from');
    const next = k.create('obligations', { what: 'Invoice 42', party: 'Mirren' } as never, { actor: 'p_1' });
    assert.ok(next.ok);
    assert.deepEqual(k.search('Mirren').map((h) => h.id), [next.value.id]);
  } finally {
    sql.close();
    done();
  }
});

test('A REBUILT INDEX IS WHOLE, SO THE NEXT OPEN HAS NOTHING TO DO', async () => {
  const { file, done } = await damaged(DAMAGES['the config shadow table dropped']);
  const shape = (sql: NodeSql) =>
    sql.all<{ name: string; sql: string }>("SELECT name, sql FROM sqlite_master WHERE name LIKE 'entry_fts%' ORDER BY name");
  const first = openSqlite(file);
  await applyMigrations(first, clock);
  const repaired = shape(first);
  first.close();

  /* THE SAME FIVE SHADOW TABLES AND THE SAME DDL a fresh file gets, and not a second, different index beside them. */
  const fresh = openSqlite();
  await applyMigrations(fresh, clock);
  assert.deepEqual(repaired, shape(fresh));
  fresh.close();

  const second = openSqlite(file);
  assert.ok((await applyMigrations(second, clock)).result.ok);
  assert.deepEqual(shape(second), repaired);
  second.close();
  done();
});
