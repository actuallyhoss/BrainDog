/**
 * Ruling 341: Money seeds a starter set of categories, in and out, each once by name.
 *
 * THE SET IS HELD HERE THREE WAYS: as it is written, as a pack's seeds planted on a record through the path every
 * install takes, and as what Money's own document carries, which `packDocument()` (`src/index.ts`) reads the set
 * into where it seeds every other list one row.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, SEEDS_PER_REGISTER, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, firstPartyDocument } from '../src/index.ts';
import { CATEGORIES_REGISTER, STARTER_CATEGORIES } from '../src/modules/money/lists/categories.ts';
import { CATEGORIES } from '../src/modules/money/sample.ts';

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T };
  assert.ok(x.ok, sayOf(r as never));
  return x.value;
};
const hostFor = (k: Kernel): Host => ({
  count: (register) => k.count(register),
  stage: (batch) => k.stageInstall(batch as never),
  transaction: (fn) => k.transaction(fn),
  reload: () => k.reload(),
  retire: (ids) => k.retire(ids),
  seed: (register, fields) => k.create(register, { ...fields, tags: ['example'] }, { actor: 'p_seed', cascade: false }) as never,
  remember: (row) => k.rememberPack(row),
  forget: (id) => k.forgetPack(id),
  claimed: (pack) => k.packClaims(pack),
});
const said = (name: string) => name.trim().toLowerCase();
const starterSeeds = () => STARTER_CATEGORIES.map((fields) => ({ register: 'categories', fields: { ...fields } }));

test('the starter set is at least six categories, in and out, each once by name', () => {
  assert.ok(STARTER_CATEGORIES.length >= 6, `the starter set holds ${STARTER_CATEGORIES.length} categories`);
  assert.ok(STARTER_CATEGORIES.length <= SEEDS_PER_REGISTER, `a pack seeds one list at most ${SEEDS_PER_REGISTER} times`);
  assert.ok(STARTER_CATEGORIES.some((c) => c.direction === 'in'), 'nothing for money in');
  assert.ok(STARTER_CATEGORIES.some((c) => c.direction === 'out'), 'nothing for money out');
  const names = STARTER_CATEGORIES.map((c) => said(c.name));
  assert.deepEqual(names.filter((n, i) => names.indexOf(n) !== i), [], 'a category is in the set twice');
});

test('every starter category is one the list takes, and none guesses a shop or a limit', () => {
  const fields = new Map(CATEGORIES_REGISTER.fields.map((f) => [f.id, f as { id: string; values?: readonly string[] }]));
  for (const category of STARTER_CATEGORIES) {
    for (const [key, held] of Object.entries(category)) {
      const field = fields.get(key);
      assert.ok(field, `${category.name} carries ${key}, which Categories does not hold`);
      if (field.values) assert.ok(field.values.includes(held), `${category.name}: ${key} cannot be ${held}`);
    }
    assert.equal(category.state, 'live');
    assert.ok(!('match' in category) && !('budget' in category), `${category.name} guesses a shop or a limit`);
    assert.doesNotMatch(category.name, /[—–]/, `${category.name} has a dash in it`);
  }
});

test('no starter category takes a name the sample studio uses, since a name is held once', () => {
  const sample = new Set(CATEGORIES.map((c) => said(String(c.name))));
  assert.deepEqual(STARTER_CATEGORIES.filter((c) => sample.has(said(c.name))).map((c) => c.name), []);
});

test('planted as a pack\'s seeds, the whole set arrives live, and a person still adds one of their own', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, { now: () => NOW });
  value(k.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAE', slug: 'the-flat', name: 'The Flat', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  /* THE LIST ALONE, out of Money's document: the seeds are what is under test, and Money's pages are other tests'. */
  const money = firstPartyDocument('money-core', { seeds: [] }) as { declarations: { register?: string }[] };
  const doc = { pack: 'starter-categories', version: '1.0.0', summary: 'What money is for.', author: 'BrainDog', license: 'MIT', requires: { format: 1, primitives: 1, packs: {} }, declarations: money.declarations.filter((d) => d.register === 'categories'), seeds: starterSeeds() };
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
  const diff = await plan(pack, state);
  value(await install(pack, diff, hostFor(k), diff.planHash));
  assert.equal(k.count('categories'), STARTER_CATEGORIES.length);
  const held = STARTER_CATEGORIES.map((_, i) => k.get(`categories#${i + 1}`)!.fields);
  assert.deepEqual(held.map((f) => [f.name, f.direction, f.state]), STARTER_CATEGORIES.map((c) => [c.name, c.direction, c.state]));
  value(k.create('categories', { name: 'Childcare', direction: 'out', state: 'live' }, { actor: 'p_1' }));
  assert.equal(k.count('categories'), STARTER_CATEGORIES.length + 1);
  sql.close();
});

test('Money\'s own document carries the starter set', () => {
  const seeds = ((firstPartyDocument('money-core') as { seeds?: { register: string; fields: { name?: string } }[] }).seeds ?? []).filter((s) => s.register === 'categories');
  assert.deepEqual(seeds.map((s) => s.fields.name), STARTER_CATEGORIES.map((c) => c.name));
});
