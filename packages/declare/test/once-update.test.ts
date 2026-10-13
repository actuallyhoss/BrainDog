/**
 * An add-on's update goes over the rows it planted, and a field written once keeps what the row holds (SHL-A09).
 *
 * NO UPDATE TOUCHED A PLANTED ROW. An install planted a list's example rows once and every later version left them
 * alone, so `once` had nothing to be obeyed by, and the day an update did write them a category a person had renamed
 * would have gone back to the file's word. The install remembers each row it plants by the seed's `key`, with the
 * fields as the file said them, and an update writes only what the file changed since, as the add-on's own write. The
 * kernel leaves a `once` field as the row holds it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, plantedOf, type Applied, type Host, type Installed, type Pack } from '../src/index.ts';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 13, 12);

type Row = { id: string; version?: number; deleted_at?: string | null; fields: Record<string, unknown> };
type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

const FIELDS = [
  { id: 'name', type: 'text' },
  { id: 'hint', type: 'text' },
  { id: 'tags', type: 'list', of: 'text' },
];

/** Categories say their name is written once. Shelves say nothing of the kind. */
const DOC = (version: string, food: Record<string, unknown>, shelf: Record<string, unknown>): Record<string, unknown> => ({
  pack: 'sample-larder',
  version,
  summary: 'A made-up larder add-on for tests.',
  author: 'Test Author',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  declarations: [
    { register: 'categories', name: 'Categories', one: 'category', title: 'name', fields: FIELDS, once: ['name'] },
    { register: 'shelves', name: 'Shelves', one: 'shelf', title: 'name', fields: FIELDS },
  ],
  seeds: [
    { register: 'categories', key: 'food', fields: { ...food, tags: ['example'] } },
    { register: 'shelves', key: 'top', fields: { ...shelf, tags: ['example'] } },
  ],
});

const FIRST = DOC('1.0.0', { name: 'Food', hint: 'Meals' }, { name: 'Top shelf', hint: 'Jars' });
const SECOND = DOC('1.1.0', { name: 'Food and drink', hint: 'Meals and drinks' }, { name: 'Upper shelf', hint: 'Jars' });

const remembered = (sql: NodeSql, pack: string): unknown => {
  const row = sql.one<{ manifest: string }>('SELECT manifest FROM pack WHERE id = ?', pack);
  return row === undefined ? undefined : (JSON.parse(row.manifest) as { planted?: unknown }).planted;
};

/** The record's host as it will be: an update of a planted row is the kernel's update with `pack: true`. */
const hostFor = (k: Kernel, sql: NodeSql, over: string[] | null): Host => ({
  count: (register) => k.count(register),
  stage: (batch) => k.stageInstall(batch as never),
  transaction: (fn) => k.transaction(fn),
  reload: () => k.reload(),
  retire: (ids) => k.retire(ids),
  seed: (register, fields) => k.create(register, fields as never, { actor: 'p_seed', cascade: false, pack: true }) as never,
  planted: (pack) => remembered(sql, pack),
  ...(over === null
    ? {}
    : {
        reseed: (register: string, row: string, fields: Record<string, unknown>) => {
          const held = k.get(row) as unknown as Row | null;
          if (!held || (held.deleted_at ?? null) !== null) return { ok: true, value: null } as never;
          over.push(`${register}: ${Object.keys(fields).sort().join(', ')}`);
          return k.update(register, row, fields as never, { actor: 'p_seed', cascade: false, pack: true }) as never;
        },
      }),
  remember: (row) => k.rememberPack(row),
  forget: (id) => k.forgetPack(id),
  claimed: (pack) => k.packClaims(pack),
  today: () => '2026-10-13',
});

const stateOf = (k: Kernel): Installed => ({
  format: 1,
  primitives: 1,
  record_version: k.version(),
  packs: k.packs(),
  declarations: k.declarations() as Installed['declarations'],
  rows: k.census(),
  config: k.packSettings(),
});

type Record_ = { k: Kernel; sql: NodeSql; over: string[] };
const put = async (r: { k: Kernel; sql: NodeSql }, doc: Record<string, unknown>, over: string[] | null): Promise<Applied> => {
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  const diff = await plan(pack, stateOf(r.k));
  return value<Applied>(await install(pack, diff, hostFor(r.k, r.sql, over), diff.planHash));
};
const fresh = async (): Promise<Record_> => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const over: string[] = [];
  await put({ k, sql }, FIRST, over);
  return { k, sql, over };
};
const only = (k: Kernel, register: string): Row => {
  const rows = value<{ rows: Row[] }>(k.list({ register })).rows;
  assert.equal(rows.length, 1, `${register} holds ${rows.length}`);
  return rows[0]!;
};

test('RENAME, THEN UPDATE: the category keeps the name a person gave it, and takes the rest of what the file changed', async () => {
  const r = await fresh();
  const food = only(r.k, 'categories');
  value(r.k.update('categories', food.id, { name: 'Groceries' }, { actor: 'p_1' }));

  const applied = await put(r, SECOND, r.over);
  const after = only(r.k, 'categories');
  assert.equal(after.id, food.id, 'the update wrote the row it planted and made no second one');
  assert.equal(after.fields.name, 'Groceries');
  assert.equal(after.fields.hint, 'Meals and drinks');
  assert.equal(applied.refreshed, 2);
  assert.equal(applied.seeds, 0);
});

test('A LIST THAT SAYS NO ONCE takes the name the file changed, and keeps a hint a person corrected that the file did not', async () => {
  const r = await fresh();
  const top = only(r.k, 'shelves');
  value(r.k.update('shelves', top.id, { hint: 'Jars and tins' }, { actor: 'p_1' }));

  await put(r, SECOND, r.over);
  const after = only(r.k, 'shelves');
  assert.equal(after.fields.name, 'Upper shelf');
  assert.equal(after.fields.hint, 'Jars and tins');
  /* ONLY WHAT THE FILE CHANGED WAS SENT, and never the tag. */
  assert.deepEqual(r.over, ['categories: hint, name', 'shelves: name']);
});

test('AN UPDATE THAT CHANGES NO EXAMPLE writes no row, and still remembers them', async () => {
  const r = await fresh();
  await put(r, SECOND, r.over);
  const versions = [only(r.k, 'categories').version, only(r.k, 'shelves').version];
  r.over.length = 0;

  const applied = await put(r, { ...SECOND, version: '1.2.0' }, r.over);
  assert.deepEqual(r.over, []);
  assert.equal(applied.refreshed, undefined);
  assert.deepEqual([only(r.k, 'categories').version, only(r.k, 'shelves').version], versions);
  const kept = plantedOf(remembered(r.sql, 'sample-larder'));
  assert.deepEqual([...kept.keys()].sort(), ['food', 'top']);
  assert.equal(kept.get('food')!.fields.hint, 'Meals and drinks');
});

test('A ROW SOMEBODY REMOVED STAYS REMOVED: the update goes through, writes nothing to it and forgets it', async () => {
  const r = await fresh();
  const food = only(r.k, 'categories');
  value(r.k.update('categories', food.id, { deleted_at: '2026-10-13' }, { actor: 'p_1' }));

  const applied = await put(r, SECOND, r.over);
  assert.equal(applied.refreshed, 1);
  assert.equal(value<{ rows: Row[] }>(r.k.list({ register: 'categories' })).rows.length, 0);
  assert.deepEqual([...plantedOf(remembered(r.sql, 'sample-larder')).keys()], ['top']);
});

test('A HOST THAT CANNOT GO OVER A ROW writes none, and keeps what was remembered for the one that can', async () => {
  const r = await fresh();
  await put(r, SECOND, null);
  assert.equal(only(r.k, 'categories').fields.name, 'Food');
  assert.equal(plantedOf(remembered(r.sql, 'sample-larder')).get('food')!.fields.name, 'Food');

  /* THE NEXT UPDATE, BY A HOST THAT CAN, WRITES WHAT THE FILE HAS CHANGED SINCE THE ROW WAS PLANTED. */
  await put(r, { ...SECOND, version: '1.2.0' }, r.over);
  assert.equal(only(r.k, 'shelves').fields.name, 'Upper shelf');
  /* AND THE CATEGORY'S NAME IS WRITTEN ONCE, so it is still the one it was planted with. */
  assert.equal(only(r.k, 'categories').fields.name, 'Food');
  assert.equal(only(r.k, 'categories').fields.hint, 'Meals and drinks');
});
