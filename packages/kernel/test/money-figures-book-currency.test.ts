/**
 * A book that says which currency it is kept in is read in that currency: its cash, its part of Cash now by book, and
 * any figure about it alone. Only what is added up across books is converted into the home currency.
 *
 * MEASURED ON THE OWNER'S RECORD: Quartz says `currency: USD`, and its page led with its cash in pounds Egyptian,
 * converted, while its part of "What you have, by book" was a bar in EGP beside the others
 * (`loop/research-real-record.md`, Today 2). A book's currency is its owner's own statement about it, so a figure about
 * that book takes it at its word. Two currencies are never added, and parts in two are never ranked on one axis.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Predicate, Schema } from '@braindog/where';

import { fill, jcs, openRecord, type Declaration, type Kernel, type MetricDecl, type Reading } from '../src/index.ts';
import { scopeCurrency } from '../src/metrics.ts';
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
]);

const TRANSACTIONS = register('transactions', 'Transactions', 'what', [
  { id: 'what', type: 'text', required: true },
  { id: 'account', type: 'ref', to: 'accounts' },
  { id: 'on', type: 'day' },
  { id: 'amount', type: 'money', required: true },
  { id: 'direction', type: 'enum', values: ['in', 'out'] },
]);

const FX = register('fx', 'Rates', 'currency', [
  { id: 'currency', type: 'text', required: true },
  { id: 'base', type: 'text', required: true },
  { id: 'rate', type: 'decimal', required: true },
  { id: 'as_of', type: 'day', required: true },
]);

const ROLLED = { rolled: { balance: 'balance', as_of: 'as_of', moves: { register: 'transactions', by: 'account', on: 'on', amount: 'amount', direction: 'direction', out: 'out' } } };
const MONEY = { format: 'money', target: { gte: 0 }, window: '30d', compare: 'none' };

const CASH_NOW = { metric: 'cash-now', name: 'Cash now', source: 'register.accounts', where: 'liquid is true', value: ROLLED, ...MONEY };
const CASH_BY_BOOK = { ...CASH_NOW, metric: 'cash-by-book', name: 'Cash now, by book', group_by: 'book' };
/** Cash in one book, read once per book: `book-cash:Quartz` fills `{{it}}`, and its `within` is the book. */
const BOOK_CASH = { ...CASH_NOW, metric: 'book-cash', name: 'Cash now in one book', where: 'liquid is true, book is {{it}}' };
/** The same money added up as a plain sum, so the figures every list declares are held to the rule too. */
const HELD_BY_BOOK = { metric: 'held-by-book', name: 'Held, by book', source: 'register.accounts', value: { sum: 'balance' }, group_by: 'book', ...MONEY };
const BOOK_HELD = { metric: 'book-held', name: 'Held in one book', source: 'register.accounts', where: 'book is {{it}}', value: { sum: 'balance' }, ...MONEY };

const money = (amount: number, currency: string) => ({ amount, currency });

async function record(): Promise<{ k: Kernel; sql: NodeSql; books: Record<string, string> }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([BOOKS, ACCOUNTS, TRANSACTIONS, FX]);
  assert.ok(installed.ok, JSON.stringify(installed));
  k.rememberPack({
    id: 'money-core',
    version: '1.0.0',
    source: 'local',
    ref: null,
    manifest: jcs({ pack: 'money-core', version: '1.0.0', config: { home_currency: { type: 'text' } } }),
    checksum: 'not-a-real-checksum',
  });
  assert.ok(k.setPackConfig('money-core', { home_currency: 'EGP' }, OWNER).ok);
  assert.ok(k.create('fx', { currency: 'USD', base: 'EGP', rate: 50, as_of: '2026-09-01' }, OWNER).ok);
  const books: Record<string, string> = {};
  /* A BOOK IN DOLLARS, said in small letters as a person types it; one in pounds Egyptian; one that says nothing. */
  for (const [name, currency] of [['Quartz', 'usd'], ['Personal', 'EGP'], ['Studio', null]] as const) {
    const made = k.create('books', { name, ...(currency ? { currency } : {}) }, OWNER);
    assert.ok(made.ok, JSON.stringify(made));
    books[name] = made.value.id;
  }
  for (const row of [
    { name: 'Mercury', balance: money(400_000, 'USD'), as_of: '2026-09-30', liquid: true, book: books.Quartz! },
    /* AN ACCOUNT IN POUNDS IN THE DOLLAR BOOK is converted into the book's dollars, never the other way round. */
    { name: 'Quartz Cairo', balance: money(5_000_000, 'EGP'), as_of: '2026-09-30', liquid: true, book: books.Quartz! },
    { name: 'HSBC current', balance: money(7_000_000, 'EGP'), as_of: '2026-09-30', liquid: true, book: books.Personal! },
    { name: 'Studio account', balance: money(100_000, 'USD'), as_of: '2026-09-30', liquid: true, book: books.Studio! },
  ])
    assert.ok(k.create('accounts', row, OWNER).ok);
  return { k, sql, books };
}

const read = (k: Kernel, decl: object, reads?: (register: string) => boolean): Reading => {
  const out = k.metric(decl as never, reads === undefined ? {} : { reads });
  assert.ok(out.ok, out.ok ? '' : JSON.stringify(out));
  return out.value;
};

const oneBook = (decl: object, book: string): MetricDecl => fill(decl, null, book) as MetricDecl;

test('A BOOK THAT SAYS ITS CURRENCY IS READ IN IT: Quartz’s cash is dollars, and pounds in it are converted into dollars', async () => {
  const { k, sql } = await record();
  const quartz = read(k, oneBook(BOOK_CASH, 'Quartz'));
  /* $4,000.00 held, and E£50,000.00 at fifty pounds a dollar is $1,000.00. */
  assert.deepEqual([quartz.value, quartz.unit], [400_000 + 100_000, 'USD']);
  assert.equal(quartz.fx?.into, 'USD');
  assert.equal(quartz.fx?.home, 'EGP', 'the home currency is still said beside it');

  /* A BOOK IN THE HOME CURRENCY, AND ONE THAT SAYS NOTHING, are read as every figure is: in the home currency. */
  assert.deepEqual([read(k, oneBook(BOOK_CASH, 'Personal')).value, read(k, oneBook(BOOK_CASH, 'Personal')).unit], [7_000_000, 'EGP']);
  const studio = read(k, oneBook(BOOK_CASH, 'Studio'));
  assert.deepEqual([studio.value, studio.unit], [100_000 * 50, 'EGP']);

  /* A PLAIN SUM ABOUT ONE BOOK IS HELD TO THE SAME RULE. */
  const held = read(k, oneBook(BOOK_HELD, 'Quartz'));
  assert.deepEqual([held.value, held.unit], [500_000, 'USD']);

  /* WHAT IS ADDED UP ACROSS THE BOOKS IS STILL THE HOME CURRENCY'S: E£120,000.00 and $5,000.00 at fifty. */
  const all = read(k, CASH_NOW);
  assert.deepEqual([all.value, all.unit], [5_000_000 + 7_000_000 + 500_000 * 50, 'EGP']);
  sql.close();
});

test('EACH BOOK’S PART OF CASH NOW BY BOOK IS IN THE BOOK’S CURRENCY, so no part is ranked across two', async () => {
  const { k, sql, books } = await record();
  for (const decl of [CASH_BY_BOOK, HELD_BY_BOOK]) {
    const by = read(k, decl);
    const parts = Object.fromEntries((by.groups ?? []).map((g) => [g.label, { value: g.value, parts: g.parts }]));
    assert.deepEqual(
      parts,
      {
        Quartz: { value: null, parts: [{ currency: 'USD', amount: 500_000 }] },
        Personal: { value: null, parts: [{ currency: 'EGP', amount: 7_000_000 }] },
        Studio: { value: null, parts: [{ currency: 'EGP', amount: 5_000_000 }] },
      },
      decl.metric,
    );
    assert.deepEqual((by.groups ?? []).find((g) => g.label === 'Quartz')?.key, books.Quartz);
    /* THE WHOLE IS ADDED UP ACROSS THE BOOKS, SO IN THE HOME CURRENCY: E£120,000.00 and $5,000.00 at fifty. */
    assert.deepEqual([by.value, by.unit], [5_000_000 + 7_000_000 + 500_000 * 50, 'EGP'], decl.metric);
  }
  sql.close();
});

test('A BOOK THE READER MAY NOT OPEN DOES NOT CHOOSE THE CURRENCY, and one that names no real currency says nothing', async () => {
  const { k, sql, books } = await record();
  /* A MEMBER INVITED TO ACCOUNTS ALONE cannot name a book by its title at all, so `book-held:Quartz` reads nothing for
     her. Asked of the stored id, the book's own statement is still a row she cannot open, and it chooses nothing. */
  const decl = k.register('accounts')!;
  const schema = { register: 'accounts', fields: Object.fromEntries(decl.fields.map((f) => [f.id, f])) } as Schema;
  const scope = { field: 'book', is: books.Quartz! } as Predicate;
  assert.equal(scopeCurrency(sql, schema, scope, {}), 'USD');
  assert.equal(scopeCurrency(sql, schema, scope, { reads: (list) => list !== 'books' }), null);
  /* TWO BOOKS ARE NOT ONE BOOK, and a clause that is not an equality names no row. */
  assert.equal(scopeCurrency(sql, schema, { field: 'book', in: [books.Quartz!, books.Personal!] } as Predicate, {}), null);
  assert.equal(scopeCurrency(sql, schema, { all: [{ field: 'liquid', is: true }, scope] } as Predicate, {}), 'USD');
  assert.equal(read(k, oneBook(BOOK_HELD, 'Quartz'), (list) => list !== 'books').rows, 0, 'a hidden book was named by its title');
  sql.close();

  const again = await record();
  assert.ok(again.k.update('books', 'books#1', { currency: 'dollars' }, OWNER).ok);
  const said = read(again.k, oneBook(BOOK_CASH, 'Quartz'));
  assert.deepEqual([said.value, said.unit], [400_000 * 50 + 5_000_000, 'EGP']);
  again.sql.close();
});

test('A BOOK’S WALK IS IN THE BOOK’S CURRENCY: its dollars walk as dollars, never refused as pounds, and a bill in pounds is walked in dollars with them', async () => {
  const { k, sql } = await record();
  const BILLS = register('bills', 'Bills', 'what', [
    { id: 'what', type: 'text', required: true },
    { id: 'amount', type: 'money', required: true },
    { id: 'due', type: 'day' },
    { id: 'book', type: 'ref', to: 'books' },
  ]);
  assert.ok((await k.install([BILLS, { id: 'metric.book-cash', kind: 'metric', body: BOOK_CASH } as never])).ok);
  assert.ok(k.create('bills', { what: 'Hosting', amount: money(50_000, 'USD'), due: '2026-10-10', book: k.get('books#1')!.id }, OWNER).ok);
  /* QUARTZ'S PAGE, AS money-core DECLARES IT: the walk opens from the book's cash and reads the book's own bills. */
  const walk = () =>
    k.block({ kind: 'forecast', source: 'forecast.runway', opening: { metric: 'book-cash:Quartz' }, from: [{ register: 'bills', on: 'due', amount: 'amount', where: 'book is Quartz' }], horizon: 30 } as never);
  /* EVERY WALK THE BLOCK DRAWS, the one or the one a currency, as currency, opening and steps. */
  const walked = (b: ReturnType<typeof walk>) => (b.walk ? [b.walk] : (b.walks ?? [])).map((w) => [w.currency, w.from, w.steps.map((s) => s.delta)]);
  const dollars = walk();
  assert.deepEqual(dollars.refusals, [], 'a book holding pounds beside its dollars was refused its walk');
  assert.deepEqual(walked(dollars), [['USD', 500_000, [-50_000]]], 'one walk, in dollars, from what the book holds, with no empty walk in pounds beside it');

  /* A BILL IN POUNDS IN THE DOLLAR BOOK is converted into the book's dollars, as the pounds it holds are in its cash:
     E£10,000.00 at fifty pounds a dollar is $200.00, one step of the one walk, and nothing is walked in pounds. */
  assert.ok(k.create('bills', { what: 'Cairo rent', amount: money(1_000_000, 'EGP'), due: '2026-10-12', book: k.get('books#1')!.id }, OWNER).ok);
  const both = walk();
  assert.deepEqual(both.refusals, []);
  assert.deepEqual(walked(both), [['USD', 500_000, [-50_000, -20_000]]]);
  sql.close();
});
