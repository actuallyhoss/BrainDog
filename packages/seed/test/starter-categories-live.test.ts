/**
 * Ruling 341, the half a stranger never got (audit 76 claim 3): Money's starter categories reach a record as the
 * person's own, not as examples.
 *
 * HELD HERE AT THE TWO PLACES THAT DROPPED THEM: `moduleDocument`, which carried no row unless it was asked for
 * examples, and `withoutRows` under `carriedDocument`, which took every row off. Asked for with `starters: true` they
 * come through both with no tag on them, and planted by a host that writes them as they are, nothing on the record
 * counts as an example. Left out, every document is what it was, so an install whose host tags its seeds plants none.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, SEEDS_PER_REGISTER, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, FIRST_PARTY, firstPartyDocument } from '../src/index.ts';
import { STARTER_CATEGORIES } from '../src/modules/money/lists/categories.ts';
import { USE_CASES } from '../src/usecases/index.ts';
import { carriedDocument, isStarter, moduleDocument, plantedRows, starterRows, withoutRows } from '../src/usecases/install.ts';

type Seed = { register: string; fields: Record<string, unknown> };
const TODAY = '2026-10-14';
const NAMES = STARTER_CATEGORIES.map((c) => c.name);
const seedsOf = (doc: Record<string, unknown> | null): Seed[] => ((doc?.seeds ?? []) as Seed[]);
const categoriesOf = (doc: Record<string, unknown> | null): Seed[] => seedsOf(doc).filter((s) => s.register === 'categories');
const tagged = (s: Seed): boolean => Array.isArray(s.fields.tags) && s.fields.tags.includes('example');

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T };
  assert.ok(x.ok, sayOf(r as never));
  return x.value;
};
/** A host that plants a starter as it is and tags every other seed, which is what telling the two apart means. */
const hostFor = (k: Kernel): Host => ({
  count: (register) => k.count(register),
  stage: (batch) => k.stageInstall(batch as never),
  transaction: (fn) => k.transaction(fn),
  reload: () => k.reload(),
  retire: (ids) => k.retire(ids),
  seed: (register, fields) => k.create(register, isStarter(register, fields) ? fields : { ...fields, tags: ['example'] }, { actor: 'p_seed', cascade: false }) as never,
  remember: (row) => k.rememberPack(row),
  forget: (id) => k.forgetPack(id),
  claimed: (pack) => k.packClaims(pack),
});

test('a module brings its starter rows, untagged, and only Money brings any', () => {
  assert.deepEqual(starterRows('money-core').map((r) => [r.register, r.fields.name, r.fields.direction, r.fields.state]), STARTER_CATEGORIES.map((c) => ['categories', c.name, c.direction, c.state]));
  for (const row of starterRows('money-core')) assert.ok(!('tags' in row.fields), `${String(row.fields.name)} carries tags`);
  for (const id of FIRST_PARTY) if (id !== 'money-core') assert.deepEqual(starterRows(id), [], `${id} brings starter rows`);
  assert.deepEqual(starterRows('agents'), []);
  assert.deepEqual(starterRows('no-such-module'), []);
  /* A CALLER'S COPY: changing a row handed out does not change the set. */
  starterRows('money-core')[0]!.fields.name = 'Mine';
  assert.equal(starterRows('money-core')[0]!.fields.name, NAMES[0]);
});

test('the set still has somewhere for the first pay to go', () => {
  assert.ok(NAMES.includes('Pay'), `the starter set is ${NAMES.join(', ')}`);
});

test('a starter is told from an example by its name and by carrying no example tag', () => {
  assert.ok(isStarter('categories', { name: 'Rent', direction: 'out', state: 'live' }));
  assert.ok(isStarter('categories', { name: ' rent ' }), 'a name is held once whatever its case');
  assert.ok(!isStarter('categories', { name: 'Rent', tags: ['example'] }), 'an example that shares a name is still an example');
  assert.ok(!isStarter('categories', { name: 'Client work' }));
  assert.ok(!isStarter('tasks', { name: 'Rent' }), 'a list with no starter set has no starters');
});

test('asked for, a module carries its starter set whether or not it carries examples', () => {
  const alone = moduleDocument(null, 'money-core', { today: TODAY, starters: true });
  assert.deepEqual(seedsOf(alone).map((s) => [s.register, s.fields.name]), NAMES.map((n) => ['categories', n]), 'only the starter set, and all of it');
  assert.deepEqual(seedsOf(alone).filter(tagged), []);
  for (const u of USE_CASES) {
    const doc = moduleDocument(u, 'money-core', { today: TODAY, starters: true });
    assert.deepEqual(seedsOf(doc).map((s) => s.fields.name), NAMES, `${u.usecase}'s Money carries something else`);
    assert.deepEqual(seedsOf(doc).filter(tagged), [], `${u.usecase}'s Money tags a starter`);
  }
  /* THE SAME ROWS Money's own document carries, field for field, so what goes in is what the pack was checked with. */
  assert.deepEqual(categoriesOf(alone), categoriesOf(firstPartyDocument('money-core')));
  for (const id of FIRST_PARTY) if (id !== 'money-core') assert.deepEqual(seedsOf(moduleDocument(null, id, { today: TODAY, starters: true })), [], `${id} carries rows`);
});

test('beside examples, no list is seeded past what a pack may seed it with', () => {
  for (const u of [null, ...USE_CASES]) {
    const doc = moduleDocument(u, 'money-core', { today: TODAY, examples: true, starters: true });
    const by = new Map<string, number>();
    for (const s of seedsOf(doc)) by.set(s.register, (by.get(s.register) ?? 0) + 1);
    for (const [register, n] of by) assert.ok(n <= SEEDS_PER_REGISTER, `${u?.usecase ?? 'no use case'}: ${register} is seeded ${n} times`);
    assert.ok(categoriesOf(doc).length > 0, `${u?.usecase ?? 'no use case'}: Money with examples and starters holds no category`);
    const names = categoriesOf(doc).map((s) => String(s.fields.name).toLowerCase());
    assert.deepEqual(names.filter((n, i) => names.indexOf(n) !== i), [], 'a category is carried twice');
  }
});

test('left out, every document is what it was, so an install that tags its seeds plants none', () => {
  for (const id of FIRST_PARTY) {
    assert.deepEqual(seedsOf(moduleDocument(null, id, { today: TODAY })), [], `${id} carries rows nobody asked for`);
    for (const u of USE_CASES) {
      assert.deepEqual(seedsOf(moduleDocument(u, id, { today: TODAY })), [], `${u.usecase}'s ${id} carries rows nobody asked for`);
      assert.deepEqual(moduleDocument(u, id, { today: TODAY, examples: true, starters: false }), moduleDocument(u, id, { today: TODAY, examples: true }));
    }
  }
  for (const u of USE_CASES) {
    assert.deepEqual(seedsOf(carriedDocument(u, TODAY)), [], `${u.usecase} carries its examples`);
    assert.deepEqual(plantedRows(u, TODAY, null).rows, [], `${u.usecase} plants rows with nothing said`);
  }
});

test('a pack with its rows taken off keeps a starter set it carries, and nothing else', () => {
  const doc = {
    pack: 'usecase-household',
    seeds: [
      { register: 'categories', fields: { name: 'Rent', direction: 'out', state: 'live' } },
      { register: 'categories', fields: { name: 'Halden retainer', direction: 'in', state: 'live', tags: ['example'] } },
      { register: 'categories', fields: { name: 'Food', direction: 'out', state: 'live', tags: ['example'] } },
      { register: 'tasks', fields: { what: 'Pay the rent' } },
    ],
  };
  assert.deepEqual(withoutRows(doc), { pack: 'usecase-household' });
  assert.deepEqual(seedsOf(withoutRows(doc, { starters: true })), [doc.seeds[0]]);
  assert.ok(!('seeds' in withoutRows({ pack: 'p', seeds: [doc.seeds[3]] }, { starters: true })), 'a pack with no starter keeps an empty seeds');
  /* NO USE CASE SHIPS A STARTER SET OF ITS OWN TODAY, so asked or not, what each carries is the same. */
  for (const u of USE_CASES) {
    assert.deepEqual(carriedDocument(u, TODAY, null, { starters: true }), carriedDocument(u, TODAY));
    const said = 'I want to start a podcast';
    assert.deepEqual(carriedDocument(u, TODAY, said, { starters: true }), carriedDocument(u, TODAY, said));
  }
});

test('planted through an install, the set is the person\'s: eight categories, none an example, and never twice', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, { now: () => NOW });
  value(k.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAE', slug: 'the-flat', name: 'The Flat', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  /* THE LIST ALONE, out of the document a record would be given: the rows are what is under test. */
  const money = moduleDocument(null, 'money-core', { today: TODAY, starters: true }) as { declarations: { register?: string }[]; seeds: Seed[] };
  const doc = { pack: 'starter-categories', version: '1.0.0', summary: 'What money is for.', author: 'BrainDog', license: 'MIT', requires: { format: 1, primitives: 1, packs: {} }, declarations: money.declarations.filter((d) => d.register === 'categories'), seeds: money.seeds };
  const put = async (version: string) => {
    const pack = value<Pack>(await normalise({ ...doc, version }, { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  };
  await put('1.0.0');
  assert.equal(k.count('categories'), STARTER_CATEGORIES.length);
  const held = STARTER_CATEGORIES.map((_, i) => k.get(`categories#${i + 1}`)!.fields);
  assert.deepEqual(held.map((f) => [f.name, f.direction, f.state]), STARTER_CATEGORIES.map((c) => [c.name, c.direction, c.state]));
  assert.deepEqual(held.filter((f) => Array.isArray(f.tags) && (f.tags as unknown[]).includes('example')), [], 'a starter category was written as an example');
  const examples = k.examples();
  assert.equal(examples.untouched + examples.touched, 0, 'the record counts a starter category as an example');
  assert.deepEqual(examples.registers, {});
  /* A LATER VERSION OF THE SAME FILE PLANTS NOTHING, since the list is not new and holds rows. */
  value(k.update('categories', 'categories#1', { name: 'Shop sales' }, { actor: 'p_1' }));
  await put('1.0.1');
  assert.equal(k.count('categories'), STARTER_CATEGORIES.length);
  assert.equal(k.get('categories#1')!.fields.name, 'Shop sales');
  sql.close();
});
