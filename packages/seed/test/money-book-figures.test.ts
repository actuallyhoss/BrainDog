/**
 * A book's own month, read through the kernel on a record that installed Money the way a person does
 * and then kept two books.
 *
 * The clock is 18 September 2026. A book's month is the cleared entries of the Ledger filed in it since the first, a
 * transfer left out: what came in, what went out, and the one less the other. Each is read once per book, as `book-cash`
 * is, the page filling `{{it}}` with the book's name. And four counts over the whole record say what is filed in no
 * book, one for each list that holds money.
 *
 * RED FIRST: with `figures/books.ts` out of `figures/index.ts`, the first test fails on `METRICS`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { fill, openRecord, type Entry, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { METRICS, firstPartyDocument } from '../src/index.ts';
import { BOOK_FIGURES } from '../src/modules/money/figures/books.ts';
import { ACCOUNT_FIGURES } from '../src/modules/money/figures/accounts.ts';
import { PLAN_PAGE_FIGURES } from '../src/modules/money/figures/plans.ts';
import { MONEY_METRICS } from '../src/modules/money/figures/index.ts';
import { MONEY_BOOK_PAGE } from '../src/modules/money/pages/book.ts';

const OWNER = { actor: 'p_1' };
/** Noon on 18 September 2026. */
const TODAY = Date.UTC(2026, 8, 18, 12);
const MONTH = ['book-in-month', 'book-out-month', 'book-net-month'] as const;
/** What is filed in no book, by the list it is in. */
const UNFILED = { 'ledger-in-no-book': 'transactions', 'bills-in-no-book': 'obligations', 'repeating-in-no-book': 'recurring', 'instalments-in-no-book': 'installments' } as const;
/** What one book is owed and what it owes, by the way its bills and invoices go (book-owed-figures-73). */
const OWED = { 'book-owed-to': 'owed to me', 'book-owed-by': 'owed by me' } as const;
/** The three a book's chart reads, a month to a point (book-page-months-73), declared after the two above. */
const BY_MONTH = ['book-in-by-month', 'book-out-by-month', 'book-net-by-month'] as const;
/** And the day one book's money runs out (book-lasts-until-76), declared last of all. */
const ALL = [...MONTH, ...Object.keys(UNFILED), ...Object.keys(OWED), ...BY_MONTH, 'book-lasts-until'];

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
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

type Kept = { k: Kernel; studio: Entry; home: Entry; current: Entry; own: Entry };

/** A fresh record holding Money as a person installs it, and two books with an account each, at `now`. */
async function fresh(now = TODAY): Promise<Kept> {
  const k = await openRecord(openSqlite(), fixedClock(now));
  for (const id of ['portfolio', 'people', 'money-core']) {
    const pack = value<Pack>(await normalise(firstPartyDocument(id, { seeds: [] }), { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  const studio = value<Entry>(k.create('books', { name: 'Studio' }, OWNER));
  const home = value<Entry>(k.create('books', { name: 'Household' }, OWNER));
  const account = (name: string, book: Entry): Entry =>
    value<Entry>(k.create('accounts', { name, kind: 'bank', balance: { amount: 5_000_000, currency: 'EGP' }, as_of: '2026-07-01', book: book.id }, OWNER));
  return { k, studio, home, current: account('Studio current', studio), own: account('Own current', home) };
}

/** One Ledger entry on a day. What a test does not say is a cleared entry in piastres, filed in the Studio book, that is no transfer. */
const moved = (r: Kept, direction: 'in' | 'out', on: string, amount: number, more: Record<string, unknown> = {}): Entry => {
  const fields = { what: `${direction} ${on}`, on, direction, amount: { amount, currency: 'EGP' }, account: r.current.id, state: 'cleared', transfer: false, book: r.studio.id, ...more };
  /* `book: undefined` is an entry filed in no book: the field is left out, as a person leaves it empty. */
  return value<Entry>(r.k.create('transactions', Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)), OWNER));
};

type Read = { value: number | null; unit: string | null; rows: number; held: number; met: boolean | null; parts?: { currency: string; amount: number }[] };

/** One figure as the record reads it now, a figure of one book asked about the book called `book` the way its page asks. */
const read = (k: Kernel, id: string, book = 'Studio'): Read => {
  const decl = METRICS[id]!;
  const r = k.metric((JSON.stringify(decl).includes('{{it}}') ? fill(decl, null, book) : decl) as never);
  assert.ok(r.ok, `${id}: ${sayOf(r)}`);
  return r.value as unknown as Read;
};

/** September in the Studio book as the record holds it on the 18th, and the entries no figure of its month may count. */
function september(r: Kept): void {
  moved(r, 'in', '2026-09-01', 900_000); // the first day of the month
  moved(r, 'in', '2026-09-18', 100_000); // today
  moved(r, 'out', '2026-09-02', 400_000);
  moved(r, 'out', '2026-09-10', 50_000);
  moved(r, 'out', '2026-09-15', 25_000);

  moved(r, 'in', '2026-08-31', 70_000); // the day before the month began
  moved(r, 'out', '2026-08-31', 30_000);
  moved(r, 'in', '2026-09-05', 250_000, { transfer: true }); // moved between his own accounts
  moved(r, 'out', '2026-09-05', 250_000, { transfer: true });
  moved(r, 'in', '2026-09-06', 60_000, { state: 'pending' }); // not yet settled
  moved(r, 'out', '2026-09-06', 60_000, { state: 'void' }); // never happened
  moved(r, 'in', '2026-09-07', 800_000, { book: r.home.id, account: r.own.id }); // the other book's
  moved(r, 'out', '2026-09-07', 300_000, { book: r.home.id, account: r.own.id });
  moved(r, 'out', '2026-09-08', 11_000, { book: undefined }); // filed in no book
}

test('MONEY DECLARES THEM, after every figure it already held, and a fresh record installs them', async () => {
  for (const id of ALL) assert.ok(METRICS[id], `Money no longer declares ${id}`);
  assert.deepEqual(Object.keys(BOOK_FIGURES), ALL);
  for (const id of MONTH) assert.equal(METRICS[id]!.format, 'money', `${id} names a currency or is no money figure`);
  for (const id of MONTH) assert.match(String(METRICS[id]!.where), /book is \{\{it\}\}$/, `${id} is not read a book at a time`);
  /* LAST IN THE DOCUMENT, in this order, so no figure a record already holds moves; but for the three of the next unpaid part of
     each plan and the parts late (money-core 3.18.0), which came after them for the same reason,
     and the eleven of the Budgets, Payees and Reports pages (money-core 3.29.0), and twenty-two more by money-core 3.31.0 and
     3.32.0 (week and year budgets, pending and unfiled lines, payees, net worth, by week); a plan's page's own (3.29.0) are left
     out as an account's are. */
  /* SO THEY STAND TOGETHER, IN THIS ORDER, WITH FIGURES AFTER THEM AND NONE AMONG THEM; how many came after is no matter. */
  const declared = Object.keys(MONEY_METRICS).filter((id) => !(id in ACCOUNT_FIGURES) && !(id in PLAN_PAGE_FIGURES));
  const first = declared.indexOf(ALL[0]!);
  assert.deepEqual(declared.slice(first, first + ALL.length), ALL);
  assert.ok(declared.length - (first + ALL.length) >= 37, 'a figure declared before them moved after them');
  const { k } = await fresh();
  for (const id of ALL) assert.ok(k.declarations().some((d) => d.id === `metric.${id}`), `money-core installed without ${id}`);
});

test("IN AND OUT ARE THE BOOK'S CLEARED ENTRIES SINCE THE FIRST, by the way the money went, and no transfer", async () => {
  const r = await fresh();
  september(r);
  const came = read(r.k, 'book-in-month');
  const went = read(r.k, 'book-out-month');
  /* E£10,000.00 in over two entries and E£4,750.00 out over three. */
  assert.equal(came.value, 1_000_000);
  assert.equal(came.rows, 2, 'last month, a transfer, a pending entry or the other book was counted as money in');
  assert.equal(went.value, 475_000);
  assert.equal(went.rows, 3, 'last month, a transfer, a void entry, the other book or an entry in no book was counted as money out');
  assert.equal(came.unit, 'EGP');
  assert.equal(went.unit, 'EGP');
  /* AND THE OTHER BOOK READS ITS OWN, from the same declaration. */
  assert.equal(read(r.k, 'book-in-month', 'Household').value, 800_000);
  assert.equal(read(r.k, 'book-out-month', 'Household').value, 300_000);
});

test('NET IS THE ONE LESS THE OTHER, over the same entries, and a month that lost money reads below nought', async () => {
  const r = await fresh();
  september(r);
  const net = read(r.k, 'book-net-month');
  assert.equal(net.value, read(r.k, 'book-in-month').value! - read(r.k, 'book-out-month').value!);
  assert.equal(net.value, 525_000);
  assert.equal(net.rows, 5, 'net reads other entries than in and out do');
  assert.equal(net.unit, 'EGP');
  moved(r, 'out', '2026-09-17', 700_000);
  assert.equal(read(r.k, 'book-net-month').value, -175_000);
});

test('ACROSS TWO CURRENCIES NET SAYS NOTHING: one amount a currency, and never the two added', async () => {
  const r = await fresh();
  moved(r, 'in', '2026-09-03', 900_000);
  moved(r, 'out', '2026-09-04', 400_000);
  moved(r, 'out', '2026-09-05', 20_000, { amount: { amount: 20_000, currency: 'USD' } });
  for (const id of MONTH) {
    const got = read(r.k, id);
    if (id === 'book-in-month') continue; // every entry in is in pounds, so it is one amount
    assert.equal(got.value, null, `${id} added Egyptian pounds to dollars`);
    assert.equal(got.unit, null);
  }
  const amount = (id: string, currency: string): number | undefined => read(r.k, id).parts?.find((p) => p.currency === currency)?.amount;
  assert.equal(amount('book-net-month', 'EGP'), 500_000);
  assert.equal(amount('book-net-month', 'USD'), -20_000);
  assert.equal(amount('book-out-month', 'USD'), 20_000);
  assert.equal(read(r.k, 'book-in-month').value, 900_000);
});

/* NO VALUE IS `held: 0` ON THIS RECORD. A sum of nothing is written 0, and what tells it from a month that came to
   nought is how many entries the book holds at all: a page draws no figure over nothing held (`drawn.ts`, `idle`). */
test('A BOOK WITH NOTHING IN IT READS NO VALUE, never a nought that is news', async () => {
  const r = await fresh();
  moved(r, 'out', '2026-09-07', 300_000, { book: r.home.id, account: r.own.id });
  for (const id of MONTH) {
    const got = read(r.k, id);
    assert.equal(got.rows, 0);
    assert.equal(got.held, 0, `${id} counts another book's entries, or the whole Ledger, as this book's`);
    assert.notEqual(got.met, false, `${id} gives a book with nothing in it a missed target`);
    assert.equal(got.parts, undefined);
  }
});

test('AND A BOOK WHOSE ENTRIES ARE ALL BEFORE THE FIRST READS A MONTH OF NOUGHT, over what it holds', async () => {
  const r = await fresh();
  moved(r, 'in', '2026-08-20', 70_000);
  moved(r, 'out', '2026-08-21', 30_000);
  for (const id of MONTH) {
    const got = read(r.k, id);
    assert.equal(got.rows, 0, `${id} counts last month`);
    assert.equal(got.value, 0);
    assert.equal(got.held, 2, `${id} is held to something other than the book's own entries`);
  }
});

test('WHAT IS FILED IN NO BOOK IS COUNTED A LIST AT A TIME: the live ones, and none that is over', async () => {
  const r = await fresh();
  const make = (list: string, fields: Record<string, unknown>): Entry => value<Entry>(r.k.create(list, fields, OWNER));
  const egp = (amount: number) => ({ amount, currency: 'EGP' });
  const read4 = (): Record<string, number | null> => Object.fromEntries(Object.keys(UNFILED).map((id) => [id, read(r.k, id).value]));
  assert.deepEqual(read4(), { 'ledger-in-no-book': 0, 'bills-in-no-book': 0, 'repeating-in-no-book': 0, 'instalments-in-no-book': 0 }, 'a count of nothing is nought, which is the good answer');

  /* THE LEDGER: every entry that happened or may yet, whatever its day, and a transfer too. A void one never happened. */
  moved(r, 'out', '2026-03-08', 11_000, { book: undefined });
  moved(r, 'in', '2026-09-08', 11_000, { book: undefined, state: 'pending' });
  moved(r, 'out', '2026-09-09', 11_000, { book: undefined, transfer: true });
  moved(r, 'out', '2026-09-10', 11_000, { book: undefined, state: 'void' });
  moved(r, 'out', '2026-09-11', 11_000); // filed in Studio

  /* BILLS AND INVOICES: open or part paid. */
  make('obligations', { what: 'Open bill', direction: 'owed_by_me', amount: egp(2_000), due: '2026-09-25', state: 'open' });
  make('obligations', { what: 'Part paid invoice', direction: 'owed_to_me', amount: egp(4_000), due: '2026-09-25', state: 'part' });
  make('obligations', { what: 'Paid bill', direction: 'owed_by_me', amount: egp(900), due: '2026-08-01', settled: '2026-08-02', state: 'paid' });
  make('obligations', { what: 'Bill in a book', direction: 'owed_by_me', amount: egp(900), due: '2026-09-25', state: 'open', book: r.studio.id });

  /* REPEATING: live or paused. */
  make('recurring', { what: 'Rent', direction: 'out', amount: egp(40_000), every: 'monthly', next_due: '2026-10-01', state: 'live' });
  make('recurring', { what: 'Paused', direction: 'out', amount: egp(1_000), every: 'monthly', next_due: '2026-10-01', state: 'paused' });
  make('recurring', { what: 'Ended', direction: 'out', amount: egp(1_000), every: 'monthly', next_due: '2026-10-01', state: 'ended' });

  /* INSTALMENTS: the parts still to pay. */
  make('installments', { what: 'Laptop, part 2', plan: 'Laptop', direction: 'out', amount: egp(1_200), due: '2026-10-08', state: 'open' });
  make('installments', { what: 'Laptop, part 1', plan: 'Laptop', direction: 'out', amount: egp(1_200), due: '2026-09-08', state: 'paid' });
  make('installments', { what: 'Dropped', plan: 'Dropped', direction: 'out', amount: egp(1_200), due: '2026-10-08', state: 'cancelled' });

  assert.deepEqual(read4(), { 'ledger-in-no-book': 3, 'bills-in-no-book': 2, 'repeating-in-no-book': 2, 'instalments-in-no-book': 1 });
  for (const [id, list] of Object.entries(UNFILED)) assert.equal(METRICS[id]!.source, `register.${list}`);
});

test('NO NAME A PERSON READS SAYS ROW, and each count names its own list', () => {
  for (const id of ALL) assert.doesNotMatch(METRICS[id]!.name, /\brows?\b|\bentit|—/i, `${id} is named in the product's words and not the person's`);
  assert.equal(METRICS['ledger-in-no-book']!.name, 'Ledger entries in no book');
  assert.equal(METRICS['bills-in-no-book']!.name, 'Bills and invoices in no book');
});

/** One bill or invoice. What a test does not say is open, in piastres, due on the 25th and filed in the Studio book. */
const owed = (r: Kept, direction: 'owed_to_me' | 'owed_by_me', amount: number, more: Record<string, unknown> = {}): Entry => {
  const fields = { what: `${direction} ${amount}`, direction, amount: { amount, currency: 'EGP' }, due: '2026-09-25', state: 'open', book: r.studio.id, ...more };
  return value<Entry>(r.k.create('obligations', Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)), OWNER));
};

/* RED FIRST (book-owed-figures-73): with the two out of `BOOK_FIGURES`, the first test of the file fails on `METRICS`
   and each of these on the figure it reads. */
test("OWED TO A BOOK AND OWED BY IT ARE THE BOOK'S OPEN BILLS AND INVOICES, by the way they go, each read once per book", async () => {
  const r = await fresh();
  owed(r, 'owed_to_me', 600_000);
  owed(r, 'owed_to_me', 150_000, { state: 'part', due: '2026-08-01' }); // part paid and already late: still owed
  owed(r, 'owed_by_me', 90_000);
  owed(r, 'owed_by_me', 40_000, { due: '2027-03-01' }); // months ahead: still owed

  owed(r, 'owed_to_me', 70_000, { state: 'paid', settled: '2026-09-02' }); // paid, so owed by nobody
  owed(r, 'owed_by_me', 30_000, { state: 'paid', settled: '2026-09-02' });
  owed(r, 'owed_to_me', 800_000, { book: r.home.id }); // the other book's
  owed(r, 'owed_by_me', 300_000, { book: r.home.id });
  owed(r, 'owed_to_me', 11_000, { book: undefined }); // filed in no book
  owed(r, 'owed_by_me', 12_000, { book: undefined });

  const to = read(r.k, 'book-owed-to');
  const by = read(r.k, 'book-owed-by');
  /* E£7,500.00 over two invoices and E£1,300.00 over two bills. */
  assert.equal(to.value, 750_000);
  assert.equal(to.rows, 2, 'a paid invoice, a bill, the other book or one in no book was counted as owed to this book');
  assert.equal(by.value, 130_000);
  assert.equal(by.rows, 2, 'a paid bill, an invoice, the other book or one in no book was counted as owed by this book');
  assert.equal(to.unit, 'EGP');
  assert.equal(by.unit, 'EGP');
  /* HELD TO THE BOOK'S OWN, and never to every bill of the record. */
  assert.equal(to.held, 6);
  /* AND THE OTHER BOOK READS ITS OWN, from the same declaration. */
  assert.equal(read(r.k, 'book-owed-to', 'Household').value, 800_000);
  assert.equal(read(r.k, 'book-owed-by', 'Household').value, 300_000);
});

test('EACH IS ITS WHOLE-RECORD FIGURE CUT TO ONE BOOK, and names no field of another list', async () => {
  const { k } = await fresh();
  const list = k.declarations().find((d) => d.id === 'register.obligations');
  const fields = new Set(((JSON.parse(String(list?.body ?? '{}')) as { fields?: { id: string }[] }).fields ?? []).map((f) => f.id));
  assert.ok(fields.has('book') && fields.has('direction'), 'Bills and invoices no longer holds a book or a direction');
  for (const [id, way] of Object.entries(OWED)) {
    const decl = METRICS[id]!;
    assert.equal(decl.source, 'register.obligations');
    assert.deepEqual(decl.value, { sum: 'amount' });
    assert.equal(decl.format, 'money', `${id} names a currency or is no money figure`);
    const whole = METRICS[id === 'book-owed-to' ? 'owed-to-you' : 'owed-by-you']!;
    assert.equal(decl.where, `${String(whole.where)}, book is {{it}}`, `${id} counts other bills than ${whole.metric} does`);
    assert.match(String(decl.where), new RegExp(`direction is ${way},`));
    /* EVERY CLAUSE STARTS WITH A FIELD BILLS AND INVOICES HOLDS: no account, no category, no `on`. */
    for (const clause of String(decl.where).split(',')) assert.ok(fields.has(clause.trim().split(' ')[0]!), `${id} reads ${clause.trim()}, which is no field of Bills and invoices`);
    for (const key of ['legs', 'opening', 'lookups', 'group_by', 'pack']) assert.equal((decl as unknown as Record<string, unknown>)[key], undefined, `${id} reads more than its one list`);
  }
});

test('ACROSS TWO CURRENCIES WHAT A BOOK IS OWED IS ONE AMOUNT A CURRENCY, and never the two added', async () => {
  const r = await fresh();
  owed(r, 'owed_to_me', 600_000);
  owed(r, 'owed_to_me', 20_000, { amount: { amount: 20_000, currency: 'USD' } });
  owed(r, 'owed_by_me', 90_000);
  const to = read(r.k, 'book-owed-to');
  assert.equal(to.value, null, 'Egyptian pounds were added to dollars');
  assert.equal(to.unit, null);
  assert.deepEqual([...(to.parts ?? [])].sort((a, b) => a.currency.localeCompare(b.currency)), [{ currency: 'EGP', amount: 600_000 }, { currency: 'USD', amount: 20_000 }]);
  /* WHAT IT OWES IS ALL IN POUNDS, so it is one amount. */
  assert.deepEqual([read(r.k, 'book-owed-by').value, read(r.k, 'book-owed-by').unit], [90_000, 'EGP']);
});

test("A BOOK THAT SAYS ITS CURRENCY IS READ IN IT: a dollar book's invoices in pounds are said in dollars", async () => {
  const r = await fresh();
  assert.ok(r.k.setPackConfig('money-core', { home_currency: 'EGP' }, OWNER).ok);
  value(r.k.create('fx', { currency: 'USD', base: 'EGP', rate: 50, as_of: '2026-09-01' }, OWNER));
  const harbour = value<Entry>(r.k.create('books', { name: 'Harbour', currency: 'USD' }, OWNER));
  owed(r, 'owed_to_me', 400_000, { book: harbour.id, amount: { amount: 400_000, currency: 'USD' } });
  owed(r, 'owed_to_me', 5_000_000, { book: harbour.id }); // E£50,000.00 at fifty pounds a dollar is $1,000.00
  owed(r, 'owed_by_me', 2_500_000, { book: harbour.id });
  owed(r, 'owed_to_me', 20_000, { amount: { amount: 20_000, currency: 'USD' } }); // Studio says no currency
  assert.deepEqual([read(r.k, 'book-owed-to', 'Harbour').value, read(r.k, 'book-owed-to', 'Harbour').unit], [500_000, 'USD']);
  assert.deepEqual([read(r.k, 'book-owed-by', 'Harbour').value, read(r.k, 'book-owed-by', 'Harbour').unit], [50_000, 'USD']);
  /* A BOOK THAT SAYS NOTHING is read as every figure is, in the home currency: $200.00 is E£10,000.00. */
  assert.deepEqual([read(r.k, 'book-owed-to').value, read(r.k, 'book-owed-to').unit], [1_000_000, 'EGP']);
});

test('A BOOK THAT IS OWED NOTHING AND OWES NOTHING READS NO VALUE, and a book whose bills are all paid reads nought', async () => {
  const r = await fresh();
  owed(r, 'owed_to_me', 800_000, { book: r.home.id });
  owed(r, 'owed_by_me', 300_000, { book: undefined });
  for (const id of Object.keys(OWED)) {
    const got = read(r.k, id);
    assert.equal(got.rows, 0);
    assert.equal(got.held, 0, `${id} counts another book's bills, or every bill, as this book's`);
    assert.notEqual(got.met, false, `${id} gives a book with no bills a missed target`);
    assert.equal(got.parts, undefined);
  }
  owed(r, 'owed_by_me', 30_000, { state: 'paid', settled: '2026-09-02' });
  for (const id of Object.keys(OWED)) {
    const got = read(r.k, id);
    assert.deepEqual([got.rows, got.value, got.held], [0, 0, 1], id);
    assert.notEqual(got.met, false, `${id} calls a book that owes nothing a miss`);
  }
});

/* "LASTS UNTIL" FOR ONE BOOK (REC-A09 step 2 names it `book-lasts-until`; book-lasts-until-76). It waited on the reader:
   a walk named its opening by a bare id and read that figure as it is stored (`readWalk` in
   `packages/kernel/src/money-figures.ts`), so a walk filled for one book opened from `book-cash` asked about a book
   called `{{it}}` and was refused. The opening now carries the hole, `book-cash:{{it}}`, and is filled before it is
   looked up (book-walk-opening-76).

   RED FIRST: with the figure out of `BOOK_FIGURES`, the first test of the file fails on `METRICS` and these on the
   figure they read. */
const LASTS = 'book-lasts-until';
/** A day as the record holds one for `format: day`: whole days since 1970. */
const dayOf = (iso: string): number => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

test("THE DAY ONE BOOK'S MONEY RUNS OUT IS A FIGURE, walked from that book's cash over that book's bills", async () => {
  const r = await fresh();
  /* E£50,000.00 IN THE STUDIO'S ACCOUNT. E£20,000.00 out on the 25th leaves 30,000.00, 5,000.00 in on 5 October makes
     35,000.00, and 40,000.00 out on 20 October is the day it goes under. */
  owed(r, 'owed_by_me', 2_000_000);
  owed(r, 'owed_to_me', 500_000, { due: '2026-10-05' });
  assert.equal(read(r.k, LASTS).value, null, 'a book with money left after every bill was given a day it runs out');
  assert.notEqual(read(r.k, LASTS).met, false, 'a book whose money lasts the year is called a miss');
  owed(r, 'owed_by_me', 4_000_000, { due: '2026-10-20' });
  /* WHAT IS NOT THIS BOOK'S MOVES NOTHING: the other book's bill, past all the Studio holds, and one filed in no book. */
  owed(r, 'owed_by_me', 9_000_000, { due: '2026-09-20', book: r.home.id });
  owed(r, 'owed_by_me', 9_000_000, { due: '2026-09-19', book: undefined });
  owed(r, 'owed_by_me', 9_000_000, { due: '2026-09-21', state: 'paid', settled: '2026-09-17' }); // already paid

  const studio = read(r.k, LASTS);
  assert.equal(studio.value, dayOf('2026-10-20'), "the Studio's last day is not the day its own bills take its own cash under");
  assert.equal(studio.met, false, 'a day the money runs out inside the year is not said as a miss');
  /* AND THE OTHER BOOK READS ITS OWN, from the same declaration: E£90,000.00 out of E£50,000.00 on the 20th. */
  assert.equal(read(r.k, LASTS, 'Household').value, dayOf('2026-09-20'));
});

test("IT OPENS FROM THE BOOK'S OWN CASH, so money put into the book moves its last day and money put into another does not", async () => {
  const r = await fresh();
  owed(r, 'owed_by_me', 6_000_000, { due: '2026-10-01' });
  owed(r, 'owed_by_me', 3_000_000, { due: '2026-11-01' });
  assert.equal(read(r.k, LASTS).value, dayOf('2026-10-01'));
  /* E£500,000.00 MORE IN THE OTHER BOOK is the other book's. */
  value(r.k.create('accounts', { name: 'Own savings', kind: 'bank', balance: { amount: 50_000_000, currency: 'EGP' }, as_of: '2026-09-01', book: r.home.id }, OWNER));
  assert.equal(read(r.k, LASTS).value, dayOf('2026-10-01'), "another book's account was walked as this book's cash");
  /* E£20,000.00 MORE IN THE STUDIO carries it past the first bill to the second. */
  value(r.k.create('accounts', { name: 'Studio savings', kind: 'bank', balance: { amount: 2_000_000, currency: 'EGP' }, as_of: '2026-09-01', book: r.studio.id }, OWNER));
  assert.equal(read(r.k, LASTS).value, dayOf('2026-11-01'));
  assert.equal(read(r.k, 'book-cash').value, 7_000_000, 'the walk opens from a figure other than the cash the page leads with');
});

test("IT WALKS THE LEGS THE BOOK'S OWN CASH AHEAD WALKS, held to the book it is asked about, and says a day", () => {
  const figure = METRICS[LASTS] as unknown as { name: string; pack: string; source: string; format: string; opening: { metric: string }; value: unknown; legs: { register: string; where: string }[] };
  assert.equal(figure.source, 'forecast.runway');
  assert.equal(figure.pack, 'money-core', 'a figure over the walk reads no one list, so it is filed in no pack unless it names one');
  assert.deepEqual(figure.opening, { metric: 'book-cash:{{it}}' });
  assert.deepEqual(figure.value, { walk: 'zero_on', within: '365d' });
  assert.equal(figure.format, 'day');
  /* THE PAGE'S LEGS, with the page's hole renamed to the figure's and nothing else changed. */
  const page = (MONEY_BOOK_PAGE.blocks as { kind: string; from?: { register: string; where: string }[] }[]).find((b) => b.kind === 'forecast')!.from!;
  assert.deepEqual(figure.legs, page.map((leg) => ({ ...leg, where: leg.where.replace('{{name}}', '{{it}}') })));
  for (const leg of figure.legs) assert.match(leg.where, /book is \{\{it\}\}$/u, `${leg.register} is walked over every book`);
  assert.doesNotMatch(JSON.stringify(figure.legs), /\{\{name\}\}/u);
  /* AND THE CELL THAT READS IT IS ON THE PAGE, under the words a person reads. */
  const cells = (MONEY_BOOK_PAGE.blocks as { cells?: { metric: string; label: string }[] }[]).flatMap((b) => b.cells ?? []);
  assert.deepEqual(cells.find((c) => c.metric.startsWith(`${LASTS}:`)), { metric: `${LASTS}:{{name}}`, label: 'Runs out' });
  assert.doesNotMatch(figure.name, /\brows?\b|\bentit|\u2014/iu);
});

/* ONE COUNT OVER THE FOUR LISTS (REC-A09 step 2 names it `rows-in-no-book`) is not a figure a pack can declare: a figure
   reads one list (`packages/kernel/src/metrics.ts`, `register.<list>`). Until the record reads a figure over the lists that
   hold a field, the four counts above are the whole of it, and a page says each by its own list's name. */
test.todo('ONE FIGURE COUNTS WHAT IS IN NO BOOK OVER EVERY LIST THAT HOLDS MONEY');
