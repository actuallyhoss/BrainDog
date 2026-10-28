/**
 * EACH ACCOUNT'S OWN AMOUNT: Cash now by account reads a dollar account in dollars beside the pound
 * accounts, never converted into pounds. Only what is added up across accounts, Cash now itself, is converted.
 *
 * THE HEADLINES ARE THE MONEY HELD, not the money due or owed, and each amount is drawn as it is kept
 * The Accounts tile grouped by `name`, a text
 * field that names no currency, so every account was turned into the home currency and "Cash (USD)" read in pounds.
 * Two currencies are never added, and parts in two are never ranked on one axis.
 *
 * RED FIRST, against money-figures.ts before this change: the dollar account read as a converted pound part.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { jcs, openRecord, type Declaration, type Kernel, type Reading } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';
import { BANKS, COMPANIES } from '../../../fixtures/names.ts';

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
const CASH_BY_ACCOUNT = { ...CASH_NOW, metric: 'cash-by-account', name: 'Cash now, by account', group_by: 'name' };
const CASH_BY_BOOK = { ...CASH_NOW, metric: 'cash-by-book', name: 'Cash now, by book', group_by: 'book' };

const CURRENT = `${BANKS[0]} current`;
const SAVINGS = `${BANKS[1]} savings`;
const DOLLARS = `${BANKS[2]} dollars`;

const money = (amount: number, currency: string) => ({ amount, currency });

/** A record in pounds, with a rate for dollars of eighty pence, and the three accounts in the currencies asked for. */
async function record(dollars: 'USD' | 'GBP'): Promise<{ k: Kernel; sql: NodeSql; accounts: Record<string, string> }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([BOOKS, ACCOUNTS, TRANSACTIONS, FX])).ok);
  k.rememberPack({
    id: 'money-core',
    version: '1.0.0',
    source: 'local',
    ref: null,
    manifest: jcs({ pack: 'money-core', version: '1.0.0', config: { home_currency: { type: 'text' } } }),
    checksum: 'not-a-real-checksum',
  });
  assert.ok(k.setPackConfig('money-core', { home_currency: 'GBP' }, OWNER).ok);
  assert.ok(k.create('fx', { currency: 'USD', base: 'GBP', rate: 0.8, as_of: '2026-09-01' }, OWNER).ok);
  const book = k.create('books', { name: COMPANIES[0], currency: 'USD' }, OWNER);
  assert.ok(book.ok, JSON.stringify(book));
  const accounts: Record<string, string> = {};
  for (const row of [
    { name: CURRENT, balance: money(300_000, 'GBP'), as_of: '2026-09-30', liquid: true },
    { name: SAVINGS, balance: money(120_000, 'GBP'), as_of: '2026-09-30', liquid: true },
    { name: DOLLARS, balance: money(294_795, dollars), as_of: '2026-09-30', liquid: true, book: book.value.id },
  ]) {
    const made = k.create('accounts', row, OWNER);
    assert.ok(made.ok, JSON.stringify(made));
    accounts[row.name] = made.value.id;
  }
  return { k, sql, accounts };
}

const read = (k: Kernel, decl: object): Reading => {
  const out = k.metric(decl as never);
  assert.ok(out.ok, out.ok ? '' : JSON.stringify(out));
  return out.value;
};

const byName = (r: Reading) => Object.fromEntries((r.groups ?? []).map((g) => [g.label ?? g.key, { value: g.value, parts: g.parts }]));

test('A DOLLAR ACCOUNT READS IN DOLLARS beside the pound accounts, so every account is a part and none is ranked across two', async () => {
  const { k, sql } = await record('USD');
  const by = read(k, CASH_BY_ACCOUNT);
  assert.deepEqual(byName(by), {
    [CURRENT]: { value: null, parts: [{ currency: 'GBP', amount: 300_000 }] },
    [SAVINGS]: { value: null, parts: [{ currency: 'GBP', amount: 120_000 }] },
    [DOLLARS]: { value: null, parts: [{ currency: 'USD', amount: 294_795 }] },
  });
  /* THE WHOLE IS ADDED UP ACROSS THE ACCOUNTS, SO IN POUNDS: $2,947.95 at eighty pence is £2,358.36. */
  assert.deepEqual([by.value, by.unit], [300_000 + 120_000 + 235_836, 'GBP']);
  sql.close();
});

test('ALL IN THE HOME CURRENCY, every account keeps a plain value, largest first, exactly as before', async () => {
  const { k, sql } = await record('GBP');
  const by = read(k, CASH_BY_ACCOUNT);
  assert.deepEqual(
    (by.groups ?? []).map((g) => [g.key, g.value, g.parts]),
    [
      [CURRENT, 300_000, undefined],
      [DOLLARS, 294_795, undefined],
      [SAVINGS, 120_000, undefined],
    ],
  );
  assert.deepEqual([by.value, by.unit], [714_795, 'GBP']);
  sql.close();
});

test('AN ACCOUNT HOLDING POUNDS AND DOLLARS says each, never one turned into the other and added', async () => {
  const { k, sql, accounts } = await record('USD');
  /* $100.00 OUT OF THE POUND ACCOUNT after its balance was stated: the pounds it holds and the dollars that left it. */
  assert.ok(k.create('transactions', { what: 'Hosting', account: accounts[CURRENT]!, on: '2026-10-01', amount: money(10_000, 'USD'), direction: 'out' }, OWNER).ok);
  const by = byName(read(k, CASH_BY_ACCOUNT));
  assert.deepEqual(by[CURRENT], { value: null, parts: [{ currency: 'GBP', amount: 300_000 }, { currency: 'USD', amount: -10_000 }] });
  assert.deepEqual(by[DOLLARS], { value: null, parts: [{ currency: 'USD', amount: 294_795 }] });
  sql.close();
});

test('CASH NOW IS STILL ONE CONVERTED FIGURE, and a book that says USD still reads in USD', async () => {
  const { k, sql } = await record('USD');
  const now = read(k, CASH_NOW);
  assert.deepEqual([now.value, now.unit, now.parts], [300_000 + 120_000 + 235_836, 'GBP', undefined]);
  assert.equal(read(k, CASH_BY_ACCOUNT).value, now.value, 'the parts no longer add up to the headline they cut');
  /* THE BOOK NAMES ITS CURRENCY, so its one part is its own dollars, never the £2,358.36 they convert to. The accounts
     no book holds are in no part of it. */
  const books = read(k, CASH_BY_BOOK);
  assert.deepEqual(byName(books), { [COMPANIES[0]]: { value: 294_795, parts: undefined } });
  assert.deepEqual([books.value, books.unit], [now.value, 'GBP']);
  sql.close();
});
