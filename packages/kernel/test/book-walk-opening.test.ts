/**
 * A walk read once per book opens from that book's cash: `opening: { metric: 'book-cash:{{it}}' }`.
 *
 * A walk named its opening by a bare id and read that figure as it is stored, so a walk filled for one book opened
 * from `book-cash` asked about a book called `{{it}}` (`REF_UNKNOWN`), and one that named `book-cash:{{it}}` was
 * refused at install and, past it, `METRIC_UNKNOWN` on every read. The opening now carries a parameter after the first
 * colon, as a stat cell and a forecast block's opening already do, and the reader fills it before it looks the figure up.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fill, jcs, openRecord, type Declaration, type Kernel, type Reading } from '../src/index.ts';
import { figureLists } from '../src/money-figures.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

/* Noon UTC on 20 September. The record has no zone, so its day is the UTC day. */
const NOW = Date.UTC(2026, 8, 20, 12);

const register = (id: string, name: string, title: string, fields: unknown[]): Declaration =>
  ({ id: `register.${id}`, kind: 'register', body: { id, name, title, fields } }) as never;

const BOOKS = register('books', 'Books', 'name', [{ id: 'name', type: 'text', required: true }]);

const ACCOUNTS = register('accounts', 'Accounts', 'name', [
  { id: 'name', type: 'text', required: true },
  { id: 'book', type: 'ref', to: 'books', index: true },
  { id: 'balance', type: 'money' },
  { id: 'as_of', type: 'day', index: true },
]);

const TRANSACTIONS = register('transactions', 'Transactions', 'what', [
  { id: 'what', type: 'text', required: true },
  { id: 'account', type: 'ref', to: 'accounts', index: true },
  { id: 'on', type: 'day', index: true },
  { id: 'amount', type: 'money', required: true },
  { id: 'direction', type: 'enum', values: ['in', 'out'], index: true },
]);

const BILLS = register('bills', 'Bills', 'what', [
  { id: 'what', type: 'text', required: true },
  { id: 'book', type: 'ref', to: 'books', index: true },
  { id: 'direction', type: 'enum', values: ['in', 'out'], index: true },
  { id: 'amount', type: 'money', required: true },
  { id: 'due', type: 'day', index: true },
]);

const metric = (body: Record<string, unknown>): Declaration => ({ id: `metric.${String(body.metric)}`, kind: 'metric', body }) as never;

const ROLLED = { rolled: { balance: 'balance', as_of: 'as_of', moves: { register: 'transactions', by: 'account', on: 'on', amount: 'amount', direction: 'direction', out: 'out' } } };

const figure = (id: string, extra: Record<string, unknown>) => ({ metric: id, name: id, format: 'money', target: { gte: 0 }, window: '30d', compare: 'none', ...extra });

/** Cash in one book, read once a book: `book-cash:Personal`. */
const BOOK_CASH = figure('book-cash', { source: 'register.accounts', where: 'book is {{it}}', value: ROLLED });

const LEGS = [{ register: 'bills', on: 'due', amount: 'amount', incoming: { field: 'direction', is: 'in' }, where: 'book is {{it}}' }];

const walk = (id: string, how: 'zero_on' | 'days_to_zero', opening: unknown, legs: unknown = LEGS) =>
  figure(id, { source: 'forecast.runway', legs, value: { walk: how, within: '365d' }, format: how === 'zero_on' ? 'day' : 'days', opening });

/** The day one book's money runs out, walked from that book's cash over that book's bills. */
const LASTS = walk('book-lasts-until', 'zero_on', { metric: 'book-cash:{{it}}' });
const DAYS = walk('book-days-left', 'days_to_zero', { metric: 'book-cash:{{it}}' });

const money = (amount: number, currency = 'EGP') => ({ amount, currency });
const dayNumber = (iso: string): number => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

/** Two books: Personal holds 1,000.00 and owes 1,500.00 on 1 October; Shop holds 50.00 and owes 80.00 tomorrow. */
async function record(more: Declaration[] = []): Promise<{ k: Kernel; personal: string }> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const installed = await k.install([BOOKS, ACCOUNTS, TRANSACTIONS, BILLS, metric(BOOK_CASH), ...more]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const made = (list: string, fields: Record<string, unknown>): string => {
    const r = k.create(list, fields, { actor: 'p_1' });
    assert.ok(r.ok, JSON.stringify(r));
    return r.value.id;
  };
  const personal = made('books', { name: 'Personal' });
  const shop = made('books', { name: 'Shop' });
  made('accounts', { name: 'Current', book: personal, balance: money(100_000), as_of: '2026-09-20' });
  made('accounts', { name: 'Till', book: shop, balance: money(5_000), as_of: '2026-09-20' });
  made('bills', { what: 'Rent', book: personal, direction: 'out', amount: money(150_000), due: '2026-10-01' });
  made('bills', { what: 'Stock', book: shop, direction: 'out', amount: money(8_000), due: '2026-09-21' });
  return { k, personal };
}

/** One figure read about one book, filled as a page fills a stat cell's `book-lasts-until:Personal`. */
const about = (k: Kernel, decl: Record<string, unknown>, book: string) => k.metric(fill(decl, null, book) as never);

function read(k: Kernel, decl: Record<string, unknown>, book: string): Reading {
  const r = about(k, decl, book);
  assert.ok(r.ok, r.ok ? '' : JSON.stringify(r));
  return r.value;
}

test("THE DAY ONE BOOK'S MONEY RUNS OUT IS A FIGURE, walked from that book's cash over that book's bills", async () => {
  const { k, personal } = await record();
  const installed = await k.install([metric(LASTS), metric(DAYS)]);
  assert.ok(installed.ok, `a walk that opens from book-cash:{{it}} declares: ${JSON.stringify(installed)}`);

  /* Each book goes under on its own bill's day, from its own cash: neither reads the other's account or bill. */
  assert.equal(read(k, LASTS, 'Personal').value, dayNumber('2026-10-01'));
  assert.equal(read(k, LASTS, 'Shop').value, dayNumber('2026-09-21'));
  assert.equal(read(k, DAYS, 'Personal').value, 11);
  assert.equal(read(k, DAYS, 'Shop').value, 1);

  /* What the book holds is the opening, so a book that can pay its bill does not run out. */
  const rich = k.create('accounts', { name: 'Savings', book: personal, balance: money(900_000), as_of: '2026-09-20' }, { actor: 'p_1' });
  assert.ok(rich.ok, JSON.stringify(rich));
  assert.equal(read(k, LASTS, 'Personal').value, null);
  assert.equal(read(k, LASTS, 'Shop').value, dayNumber('2026-09-21'), "another book's savings do not pay this book's bill");
});

test('A WALK STILL NAMES A FIGURE THAT IS THERE AND IS NOT ITSELF A WALK, with a parameter or without', async () => {
  const { k } = await record([metric(LASTS)]);
  const refused = async (id: string, opening: unknown) => {
    const r = await k.install([metric(walk(id, 'zero_on', opening))]);
    assert.ok(!r.ok && 'refusal' in r, `${id} installed`);
    return r.refusal;
  };
  /* The figure is looked up without its parameter, and one that is not there is still refused by its own name. */
  const unknown = await refused('from-nothing', { metric: 'book-savings:{{it}}' });
  assert.deepEqual([unknown.code, unknown.at], ['METRIC_UNKNOWN', 'opening']);
  assert.match(unknown.fix, /no metric called book-savings\./);
  assert.equal((await refused('from-nothing-bare', { metric: 'book-savings' })).code, 'METRIC_UNKNOWN');
  /* One step deep: a walk never opens from a walk, whatever follows the colon. */
  const deep = await refused('from-a-walk', { metric: 'book-lasts-until:{{it}}' });
  assert.deepEqual([deep.code, deep.at], ['DECLARATION_INVALID', 'opening']);
  assert.match(deep.fix, /book-lasts-until is itself a walk/);
  /* And what is no id is no opening: a colon with nothing after it, nothing before it, or no figure at all. */
  for (const metricId of ['book-cash:', ':{{it}}', '{{it}}', 'Book Cash:{{it}}', ''])
    assert.equal((await refused('malformed', { metric: metricId })).code, 'DECLARATION_INVALID', JSON.stringify(metricId));
  /* And the one hole a figure's parameter fills is {{it}}: a row's field is filled into a page, never into a figure, so
     this installed and was refused on every read with "ask for it by name". */
  const stray = await refused('from-a-field', { metric: 'book-cash:{{name}}' });
  assert.deepEqual([stray.code, stray.at], ['DECLARATION_INVALID', 'opening']);
  assert.match(stray.fix, /read about \{\{name\}\}.*book-cash:\{\{it\}\}/);
});

test('THE READER REFUSES THE SAME THREE, for a figure handed to it without an install', async () => {
  const { k } = await record([metric(LASTS)]);
  const refusal = (decl: Record<string, unknown>, book: string) => {
    const r = about(k, decl, book);
    assert.ok(!r.ok && 'refusal' in r, JSON.stringify(r));
    return r.refusal;
  };
  assert.equal(refusal(walk('a', 'zero_on', { metric: 'book-savings:{{it}}' }), 'Personal').code, 'METRIC_UNKNOWN');
  assert.match(refusal(walk('a', 'zero_on', { metric: 'book-savings:{{it}}' }), 'Personal').fix, /no metric called book-savings /);
  assert.equal(refusal(walk('b', 'zero_on', { metric: 'book-lasts-until:{{it}}' }), 'Personal').code, 'DECLARATION_INVALID');
  /* A book nobody keeps is the opening figure's own refusal, by the name asked for and never by a hole. */
  const nobody = refusal(LASTS, 'Nowhere');
  assert.equal(nobody.code, 'REF_UNKNOWN');
  assert.doesNotMatch(JSON.stringify(nobody), /\{\{/);

  /* READ BARE, WITH NO BOOK NAMED, the walk says how to ask and names no book called {{it}}. */
  const bare = k.metric(LASTS as never);
  assert.ok(!bare.ok && 'refusal' in bare);
  assert.deepEqual([bare.refusal.code, bare.refusal.at], ['REQUIRED_MISSING', 'opening']);
  assert.match(bare.refusal.fix, /book-lasts-until:<name>/);
});

test('A BOOK WHOSE NAME HOLDS A COLON OR A COMMA IS STILL ONE BOOK, and a walk with no parameter reads as it did', async () => {
  const { k } = await record([metric(LASTS), metric(figure('cash', { source: 'register.accounts', value: ROLLED }))]);
  const made = k.create('books', { name: 'Flat: rent, bills' }, { actor: 'p_1' });
  assert.ok(made.ok, JSON.stringify(made));
  assert.ok(k.create('accounts', { name: 'Joint', book: made.value.id, balance: money(20_000), as_of: '2026-09-20' }, { actor: 'p_1' }).ok);
  assert.ok(k.create('bills', { what: 'Gas', book: made.value.id, direction: 'out', amount: money(30_000), due: '2026-09-25' }, { actor: 'p_1' }).ok);
  assert.equal(read(k, LASTS, 'Flat: rent, bills').value, dayNumber('2026-09-25'));

  /* Every book's cash against every book's bills: 1,250.00 held, 80.00 out tomorrow, 300.00 on the 25th, 1,500.00 on 1 October. */
  const every = [{ register: 'bills', on: 'due', amount: 'amount', incoming: { field: 'direction', is: 'in' } }];
  const whole = k.metric(walk('runs-out', 'zero_on', { metric: 'cash' }, every) as never);
  assert.ok(whole.ok, JSON.stringify(whole));
  assert.equal(whole.value.value, dayNumber('2026-10-01'));
});

test('A WALK THAT OPENS FROM A FIGURE OF EACH BOOK READS THE LISTS THAT FIGURE READS', () => {
  const lists = figureLists(LASTS as never, (id) => (id === 'book-cash' ? (BOOK_CASH as never) : null));
  assert.deepEqual(lists.sort(), ['accounts', 'bills', 'transactions']);
});

test('A USD BOOK ON AN EGP-HOME RECORD IS WALKED IN USD, with a leg in another currency converted into it', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const FX = register('fx', 'Rates', 'currency', [
    { id: 'currency', type: 'text', required: true },
    { id: 'base', type: 'text', required: true },
    { id: 'rate', type: 'decimal', required: true },
    { id: 'as_of', type: 'day', index: true, required: true },
  ]);
  assert.ok((await k.install([BOOKS, ACCOUNTS, TRANSACTIONS, BILLS, FX, metric(BOOK_CASH), metric(LASTS)])).ok);
  k.rememberPack({ id: 'money-core', version: '1.0.0', source: 'local', ref: null, manifest: jcs({ pack: 'money-core', version: '1.0.0', config: { home_currency: { type: 'text' } } }), checksum: 'x' });
  assert.ok(k.setPackConfig('money-core', { home_currency: 'EGP' }, { actor: 'p_1' }).ok);
  const made = (list: string, fields: Record<string, unknown>): string => {
    const r = k.create(list, fields, { actor: 'p_1' });
    assert.ok(r.ok, JSON.stringify(r));
    return r.value.id;
  };
  made('fx', { currency: 'USD', base: 'EGP', rate: 50, as_of: '2026-09-15' });
  const quartz = made('books', { name: 'Quartz' });
  made('accounts', { name: 'Mercury', book: quartz, balance: money(100_000, 'USD'), as_of: '2026-09-20' });
  made('bills', { what: 'Tools', book: quartz, direction: 'out', amount: money(150_000, 'USD'), due: '2026-10-01' });
  assert.equal(read(k, LASTS, 'Quartz').value, dayNumber('2026-10-01'));
  /* A bill in EGP is converted into the book's USD: EGP 25,000.00 is USD 500.00 at 50, and 1,000.00 less 500.00 holds. */
  made('bills', { what: 'Local', book: quartz, direction: 'out', amount: money(2_500_000, 'EGP'), due: '2026-09-25' });
  assert.equal(read(k, LASTS, 'Quartz').value, dayNumber('2026-10-01'));
});
