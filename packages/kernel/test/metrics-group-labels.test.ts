/**
 * A figure's parts are named in a person's words: a part grouped by a link carries the title of the row it points at,
 * an enum's part its declared label, a yes or no the word, and every part keeps its key.
 *
 * MEASURED ON THE OWNER'S RECORD: Today's "What you have, by book" drew "Book #01M3VMPSHV07AM4S51WDTFM5XG" for every
 * part. Cash now by book groups by `accounts.book`, a ref, so each key is the ULID the row stores, and nothing between
 * the figure and the screen named it; an agent's `get cash-by-book` was handed the same ids
 * (`loop/research-real-record.md`, Today 1). The record names the parts now, once, for every reader.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Group, type Kernel, type Reading } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 2, 12);
const OWNER = { actor: 'p_1' };

const register = (id: string, name: string, title: string, fields: unknown[]): Declaration =>
  ({ id: `register.${id}`, kind: 'register', body: { id, name, title, fields } }) as never;

const BOOKS = register('books', 'Books', 'name', [
  { id: 'name', type: 'text', required: true },
  { id: 'currency', type: 'text' },
]);

const ACCOUNTS = register('accounts', 'Accounts', 'name', [
  { id: 'name', type: 'text', required: true },
  { id: 'balance', type: 'money' },
  { id: 'as_of', type: 'day' },
  { id: 'liquid', type: 'bool' },
  { id: 'book', type: 'ref', to: 'books' },
  { id: 'kind', type: 'enum', values: ['current', 'savings', 'owed_to_me'], labels: { current: 'Current account' } },
]);

const TRANSACTIONS = register('transactions', 'Transactions', 'what', [
  { id: 'what', type: 'text', required: true },
  { id: 'account', type: 'ref', to: 'accounts' },
  { id: 'on', type: 'day' },
  { id: 'amount', type: 'money', required: true },
  { id: 'direction', type: 'enum', values: ['in', 'out'] },
]);

const figure = (by: string) => ({
  metric: `held-by-${by}`,
  name: `Held, by ${by}`,
  source: 'register.accounts',
  value: { sum: 'balance' },
  group_by: by,
  format: 'money',
  target: { gte: 0 },
  window: '30d',
  compare: 'none',
});

/** Cash rolled forward from each account's balance, grouped by its book, as money-core declares it. */
const CASH_BY_BOOK = {
  metric: 'cash-by-book',
  name: 'Cash now, by book',
  source: 'register.accounts',
  where: 'liquid is true',
  value: { rolled: { balance: 'balance', as_of: 'as_of', moves: { register: 'transactions', by: 'account', on: 'on', amount: 'amount', direction: 'direction', out: 'out' } } },
  group_by: 'book',
  format: 'money',
  target: { gte: 0 },
  window: '30d',
  compare: 'none',
};

const egp = (amount: number) => ({ amount, currency: 'EGP' });

async function record(): Promise<{ k: Kernel; sql: NodeSql; books: Record<string, string> }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([BOOKS, ACCOUNTS, TRANSACTIONS, { id: 'metric.cash-by-book', kind: 'metric', body: CASH_BY_BOOK } as never]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const books: Record<string, string> = {};
  for (const name of ['Personal', 'Studio']) {
    const made = k.create('books', { name }, OWNER);
    assert.ok(made.ok, JSON.stringify(made));
    books[name] = made.value.id;
  }
  for (const row of [
    { name: 'HSBC current', balance: egp(5_000_000), as_of: '2026-09-30', liquid: true, book: books.Personal!, kind: 'current' },
    { name: 'Tax reserve', balance: egp(2_000_000), as_of: '2026-09-30', liquid: true, book: books.Personal!, kind: 'savings' },
    { name: 'Studio account', balance: egp(9_000_000), as_of: '2026-09-30', liquid: true, book: books.Studio!, kind: 'owed_to_me' },
  ])
    assert.ok(k.create('accounts', row, OWNER).ok);
  return { k, sql, books };
}

const read = (k: Kernel, decl: object, reads?: (register: string) => boolean): Reading => {
  const out = k.metric(decl as never, reads === undefined ? {} : { reads });
  assert.ok(out.ok, out.ok ? '' : JSON.stringify(out));
  return out.value;
};

const named = (groups: readonly Group[] | undefined): [string, string | undefined, number | null][] => (groups ?? []).map((g) => [g.key, g.label, g.value]);

test('A PART GROUPED BY A LINK IS NAMED BY THE ROW IT POINTS AT, and keeps the key a link and a filter are made from', async () => {
  const { k, sql, books } = await record();
  const held = read(k, figure('book'));
  assert.deepEqual(named(held.groups), [
    [books.Studio!, 'Studio', 9_000_000],
    [books.Personal!, 'Personal', 7_000_000],
  ]);

  /* A ROW SINCE ARCHIVED STILL NAMES THE PARTS THAT POINT AT IT, and a link to a row that was never there names nothing. */
  sql.exec("UPDATE entry SET deleted_at = ? WHERE register = 'books' AND json_extract(fields, '$.name') = 'Studio'", new Date(NOW).toISOString());
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.book', 'nosuch') WHERE register = 'accounts' AND json_extract(fields, '$.name') = 'Tax reserve'");
  assert.deepEqual(named(read(k, figure('book')).groups), [
    [books.Studio!, 'Studio', 9_000_000],
    [books.Personal!, 'Personal', 5_000_000],
    ['nosuch', undefined, 2_000_000],
  ]);
  sql.close();
});

test('AN ENUM PART IS ITS DECLARED LABEL, or its value in words; a yes or no is the word; a part of words needs no name', async () => {
  const { k, sql } = await record();
  assert.deepEqual(named(read(k, figure('kind')).groups), [
    ['owed_to_me', 'Owed to me', 9_000_000],
    ['current', 'Current account', 5_000_000],
    ['savings', 'Savings', 2_000_000],
  ]);
  assert.ok(k.update('accounts', 'accounts#3', { liquid: false }, OWNER).ok);
  assert.deepEqual(
    (read(k, figure('liquid')).groups ?? []).map((g) => [g.label, g.value]),
    [['No', 9_000_000], ['Yes', 7_000_000]],
  );
  /* THE NAME IS THE KEY ALREADY, so it carries no second copy of itself. */
  assert.deepEqual((read(k, figure('name')).groups ?? []).map((g) => 'label' in g), [false, false, false]);
  sql.close();
});

test('CASH NOW BY BOOK NAMES EACH BOOK, rolled forward as it is, and every reader is handed the same names', async () => {
  const { k, sql, books } = await record();
  assert.ok(k.create('transactions', { what: 'Rent', account: k.get('accounts#1')!.id, on: '2026-10-01', amount: egp(1_000_000), direction: 'out' }, OWNER).ok);
  const cash = read(k, CASH_BY_BOOK);
  assert.deepEqual(named(cash.groups), [
    [books.Studio!, 'Studio', 9_000_000],
    [books.Personal!, 'Personal', 6_000_000],
  ]);
  /* A PAGE DRAWS THE SAME PARTS, from the same answer. */
  const bar = k.block({ kind: 'bar', heading: 'What you have, by book', source: 'metric.cash-by-book', unset: 'In no book' } as never);
  assert.deepEqual(bar.refusals, []);
  assert.deepEqual(named(bar.readings?.[0]?.reading?.groups), named(cash.groups));
  assert.ok(!JSON.stringify(bar).includes('Book #'));
  sql.close();
});

test('A LIST THE READER MAY NOT OPEN NAMES NOTHING, and a page drawing the parts is held as one over that list', async () => {
  const { k, sql, books } = await record();
  /* A MEMBER INVITED TO ACCOUNTS ALONE is not handed the books' names through the parts of a figure over accounts. */
  const theirs = read(k, figure('book'), (list) => list === 'accounts');
  assert.deepEqual(named(theirs.groups), [
    [books.Studio!, undefined, 9_000_000],
    [books.Personal!, undefined, 7_000_000],
  ]);
  assert.ok(!JSON.stringify(theirs).includes('Studio'));
  /* AND A BLOCK DRAWING THEM NAMES BOOKS AMONG THE LISTS IT READS, which is what the record holds a block back by. */
  assert.deepEqual(k.blockRegisters({ kind: 'bar', source: 'metric.cash-by-book' } as never).sort(), ['accounts', 'books', 'transactions']);
  sql.close();
});

test('A LIST TITLED BY WHAT IS NOT WORDS NAMES NO PART: its title links to another row, and that row’s id is no name', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([
    register('people', 'People', 'name', [{ id: 'name', type: 'text', required: true }]),
    register('desks', 'Desks', 'lead', [{ id: 'lead', type: 'ref', to: 'people' }, { id: 'floor', type: 'int' }]),
    register('seats', 'Seats', 'what', [{ id: 'what', type: 'text', required: true }, { id: 'desk', type: 'ref', to: 'desks' }, { id: 'cost', type: 'money' }]),
  ]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const ana = k.create('people', { name: 'Ana' }, OWNER);
  assert.ok(ana.ok, JSON.stringify(ana));
  const desk = k.create('desks', { lead: ana.value.id, floor: 2 }, OWNER);
  assert.ok(desk.ok, JSON.stringify(desk));
  assert.ok(k.create('seats', { what: 'By the window', desk: desk.value.id, cost: egp(500_000) }, OWNER).ok);
  const by = read(k, { metric: 'cost-by-desk', name: 'Cost, by desk', source: 'register.seats', value: { sum: 'cost' }, group_by: 'desk', format: 'money', target: { gte: 0 }, window: '30d', compare: 'none' });
  assert.deepEqual(named(by.groups), [[desk.value.id, undefined, 500_000]]);
  assert.ok(!JSON.stringify(by).includes(ana.value.id), 'a part was named by the id of the row its title links to');
  sql.close();
});

/* THE RECORD'S `metric` AND `figures` HOLD A FIGURE BACK BY `kernel.figureLists` and then read it with no `reads`, so the
   parts are named in full. Asked of the figure's own lists alone, a member invited to Accounts asked `metric
   held-by-book` and was answered `label: 'Secret Venture'`, the title of a book she may not open (measured through
   `packages/record`). */
test('THE LISTS A FIGURE READS NAME THE ONE ITS PARTS ARE NAMED FROM, so the record holds it back as a page does', async () => {
  const { k, sql } = await record();
  assert.deepEqual(k.figureLists(figure('book') as never).sort(), ['accounts', 'books']);
  assert.deepEqual(k.figureLists(CASH_BY_BOOK as never).sort(), ['accounts', 'books', 'transactions']);
  /* A PART NAMED BY ITS OWN LIST'S WORDS READS NOTHING MORE. */
  assert.deepEqual(k.figureLists(figure('kind') as never), ['accounts']);
  sql.close();
});

/* A KEPT LINE NAMES THE LISTS ITS FIGURE READS (roll-ages, batch 40): `series.<figure>` named none, so the record showed
   a member invited to Accounts alone how many nights Cash now missed, a line over lists she cannot read. A line of a
   figure this record does not hold names the whole record. */
test('A FIGURE OVER A KEPT LINE NAMES THE LISTS ITS FIGURE READS, and a line of no figure here names the whole record', async () => {
  const { k, sql } = await record();
  const missed = (of: string) => ({ metric: 'nights-missed', name: 'Nights missed', source: `series.${of}`, value: { count: 'missing' }, format: 'int', target: { lte: 2 }, window: '30d', compare: 'none' });
  assert.deepEqual(k.figureLists(missed('cash-by-book') as never).sort(), ['accounts', 'books', 'transactions']);
  assert.deepEqual(k.figureLists(missed('nowhere') as never), ['*']);
  sql.close();
});
