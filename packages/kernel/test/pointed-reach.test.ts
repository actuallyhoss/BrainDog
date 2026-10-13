/**
 * A block whose `where:` hops into another list is held by that list too (audit 49-50, finding 5).
 *
 * `where: { pointed: { register, by } }` keeps the rows something in another list points at. A figure that hops was
 * already named by every list it reads (`money-figures.ts` `figureLists`), and a page block was not: `registersOf`
 * read a block's source, its figures and its paths, and never its `where:`. So a table over Categories kept to the
 * ones a transaction points at was held by Categories alone, and a member who may not open Transactions read which
 * categories have entries.
 *
 * THE LAST TESTS DRIVE THE RECORD'S OWN DOOR, because the hold is the record's and the list of names is the kernel's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pointedIn, registersOf, registersOfBlock, type PageBlock } from '../src/pages.ts';
import { createRecordApi, type CallContext } from '../../record/src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 17, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

const HOP = { pointed: { register: 'transactions', by: 'category' } };
const USED = { kind: 'table', heading: 'Categories in use', source: 'register.categories', where: HOP, columns: [{ field: 'name' }] };
const ALL = { kind: 'table', heading: 'Every category', source: 'register.categories', columns: [{ field: 'name' }] };
/** A block as a pack writes one, which is JSON: its `where:` may be a predicate where the type says a sentence. */
const block = (b: unknown): PageBlock => b as PageBlock;

test('A WHERE THAT HOPS NAMES THE LIST IT HOPS INTO, beside the block\'s own', () => {
  assert.deepEqual(registersOfBlock(block(USED)).sort(), ['categories', 'transactions']);
  assert.deepEqual(registersOfBlock(block(ALL)), ['categories']);
  assert.deepEqual(registersOf({ page: 'spend', title: 'Spend', blocks: [block(ALL), block(USED)] }).sort(), ['categories', 'transactions']);
});

test('however deep the hop sits: inside a group, inside another hop, and in a ring\'s of:', () => {
  const nested = { all: [{ field: 'name', is: 'Rent' }, { none: [{ pointed: { register: 'transactions', by: 'category', where: { pointed: { register: 'receipts', by: 'movement' } } } }] }] };
  assert.deepEqual(pointedIn(nested), ['transactions', 'receipts']);
  assert.deepEqual(registersOfBlock(block({ ...ALL, where: nested })).sort(), ['categories', 'receipts', 'transactions']);
  assert.deepEqual(registersOfBlock(block({ kind: 'ring', source: 'register.categories', of: HOP })).sort(), ['categories', 'transactions']);
  /* A SENTENCE HOPS NOWHERE, and neither does anything that is not a predicate. */
  assert.deepEqual(pointedIn('name is Rent'), []);
  assert.deepEqual(pointedIn(undefined), []);
  assert.deepEqual(pointedIn([HOP]), []);
});

const reg = (id: string, name: string, title: string, fields: unknown[]) => ({ id: `register.${id}`, kind: 'register' as const, body: { id, name, title, fields } as never });

const DECLS = [
  reg('categories', 'Categories', 'name', [{ id: 'name', type: 'text', required: true }]),
  reg('transactions', 'Transactions', 'what', [
    { id: 'what', type: 'text', required: true },
    { id: 'category', type: 'ref', to: 'categories' },
    { id: 'amount', type: 'money' },
  ]),
  { id: 'page.spend', kind: 'page', body: { page: 'spend', title: 'Spend', blocks: [ALL, USED] } } as never,
];

type Block = { heading?: string; rows?: { fields: Record<string, unknown> }[]; matched?: number; refusals: { code: string }[] };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record() {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(NOW) });
  const put = await api.kernel.install(DECLS);
  assert.ok(put.ok, JSON.stringify(put));
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const rent = value<{ id: string }>(await api.create({ register: 'categories', fields: { name: 'Rent' } }, owner));
  value(await api.create({ register: 'categories', fields: { name: 'Travel' } }, owner));
  value(await api.create({ register: 'transactions', fields: { what: 'October rent', category: rent.id, amount: { amount: 600_000, currency: 'EGP' } } }, owner));
  /* WREN READS CATEGORIES AND NOT TRANSACTIONS. */
  value(await api.invite({ person: 'p_9', name: 'Wren', registers: { categories: 'read' } }, owner));
  const held = api.kernel.access('p_9')!;
  const wren: CallContext = { principal: { kind: 'person', id: 'p_9', level: held.level }, registers: held.registers ?? '*', levels: held.levels };
  return { api, wren };
}

const names = (b: Block): unknown[] => (b.rows ?? []).map((r) => r.fields.name);

test('THE OWNER READS THE CATEGORIES SOMETHING POINTS AT, which is one of the two', async () => {
  const { api } = await record();
  const page = value<{ blocks: Block[] }>(await api.page({ slug: 'spend' }, owner));
  const [all, used] = page.blocks;
  assert.deepEqual(used?.refusals, []);
  assert.deepEqual(names(used!), ['Rent']);
  assert.deepEqual(names(all!).sort(), ['Rent', 'Travel']);
});

test('A MEMBER WHO MAY NOT READ TRANSACTIONS IS HELD FROM THE TABLE THAT HOPS INTO IT, and still reads the plain one', async () => {
  const { api, wren } = await record();
  const page = value<{ blocks: Block[] }>(await api.page({ slug: 'spend' }, wren));
  const [all, used] = page.blocks;
  assert.deepEqual(all?.refusals, []);
  assert.deepEqual(names(all!).sort(), ['Rent', 'Travel'], 'she reads Categories, so the plain table is hers');
  assert.equal(used?.refusals[0]?.code, 'FORBIDDEN', `the table that hops into Transactions was drawn for her: ${JSON.stringify(used)}`);
  assert.deepEqual(used?.rows ?? [], [], 'the held block handed her which categories have entries');
  assert.equal(used?.matched ?? 0, 0, 'the held block said how many categories have entries');
});
