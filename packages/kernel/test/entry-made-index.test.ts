/**
 * Migration 39's `entry_made` is what a list read in its default order walks.
 *
 * MEASURED BEFORE: a list that declares no order reads `ORDER BY created_at DESC, id DESC`, and the one index it had
 * was `entry_live (register, updated_at DESC)`. The plan found the list's rows and then said `USE TEMP B-TREE FOR ORDER
 * BY`: every row of the list sorted to hand back the first page.
 *
 * THE STATEMENT IS THE KERNEL'S OWN, caught on its way to SQLite and planned as it was sent, so a change to how `list`
 * spells its read is planned here too and this cannot pass on a query nobody runs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyMigrations } from '../src/migrate.ts';
import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 13, 12);

const list = (id: string, order?: { field: string; dir: 'asc' | 'desc' }): Declaration => ({
  id: `register.${id}`,
  kind: 'register',
  body: {
    id,
    name: id,
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'n', type: 'int' },
    ],
    ...(order ? { order } : {}),
  } as never,
});

type Sent = { text: string; params: unknown[] };

/** A record with two lists, one with an order of its own, and every page read `list` sends kept in `sent`. */
async function record(): Promise<{ k: Kernel; sql: NodeSql; sent: Sent[] }> {
  const sql = openSqlite();
  const sent: Sent[] = [];
  const all = sql.all.bind(sql);
  sql.all = ((text: string, ...params: unknown[]) => {
    if (/FROM entry WHERE register = (?:\?|'\w+')/.test(text) && /\bLIMIT \?/.test(text)) sent.push({ text, params });
    return all(text, ...(params as never[]));
  }) as typeof sql.all;
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  assert.ok((await k.install([list('notes'), list('ranked', { field: 'n', dir: 'desc' })])).ok);
  for (let i = 0; i < 40; i++) {
    clock.advance(60_000);
    assert.ok(k.create('notes', { what: `Note ${String(i)}`, n: i }, { actor: 'p_1' }).ok);
    assert.ok(k.create('ranked', { what: `Ranked ${String(i)}`, n: i % 7 }, { actor: 'p_1' }).ok);
  }
  sent.length = 0;
  return { k, sql, sent };
}

const plan = (sql: NodeSql, s: Sent): string =>
  sql.db
    .prepare(`EXPLAIN QUERY PLAN ${s.text}`)
    .all(...(s.params as never[]))
    .map((r) => String((r as { detail: unknown }).detail))
    .join(' | ');

test('a list read in its default order walks entry_made and sorts nothing', async () => {
  const { k, sql, sent } = await record();
  const first = k.list({ register: 'notes', limit: 10 });
  assert.ok(first.ok);
  assert.equal(first.value.rows[0]!.fields.what, 'Note 39', 'the default order is newest made first');
  assert.equal(sent.length, 1);
  const said = plan(sql, sent[0]!);
  assert.match(said, /USING INDEX entry_made\b/, said);
  assert.doesNotMatch(said, /TEMP B-TREE/, said);

  /* AND THE NEXT PAGE, which is keyset on the same two columns and so starts where the index left off. */
  sent.length = 0;
  const next = k.list({ register: 'notes', limit: 10, cursor: first.value.cursor! });
  assert.ok(next.ok);
  assert.equal(next.value.rows[0]!.fields.what, 'Note 29');
  const then = plan(sql, sent[0]!);
  assert.match(then, /USING INDEX entry_made\b/, then);
  assert.doesNotMatch(then, /TEMP B-TREE/, then);
});

test('a list with an order of its own, and a read that names one, are planned as they were', async () => {
  const { k, sql, sent } = await record();
  const own = k.list({ register: 'ranked', limit: 10 });
  assert.ok(own.ok);
  assert.deepEqual(own.value.rows.slice(0, 3).map((r) => r.fields.n), [6, 6, 6], 'the list still comes back in its declared order');
  const asked = k.list({ register: 'notes', limit: 10, order: [{ field: 'n', dir: 'asc' }] });
  assert.ok(asked.ok);
  assert.deepEqual(asked.value.rows.slice(0, 3).map((r) => r.fields.n), [0, 1, 2]);
  assert.equal(sent.length, 2);

  /* Planned again with the index gone: the same plan to the word, so migration 39 changed neither read. */
  const withIndex = sent.map((s) => plan(sql, s));
  for (const said of withIndex) assert.doesNotMatch(said, /entry_made/, said);
  sql.exec('DROP INDEX entry_made');
  assert.deepEqual(sent.map((s) => plan(sql, s)), withIndex);
});

test('migration 39 applied again over itself leaves one entry_made and every row', async () => {
  const { k, sql } = await record();
  const before = sql.one<{ n: number }>('SELECT count(*) AS n FROM entry')!.n;
  sql.exec('DELETE FROM migration WHERE version >= 39');
  const { result } = await applyMigrations(sql, fixedClock(NOW));
  assert.ok(result.ok);
  assert.deepEqual(result.value.applied, [39, 40, 41, 42, 43, 44, 45, 46, 47, 48]);
  const made = sql.all<{ sql: string }>("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'entry_made'");
  assert.equal(made.length, 1);
  assert.match(made[0]!.sql, /ON entry\(register, created_at DESC, id DESC\) WHERE deleted_at IS NULL/);
  assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM entry')!.n, before, 'rows kept');
  assert.equal(k.list({ register: 'notes', limit: 100 }).ok, true);
});
