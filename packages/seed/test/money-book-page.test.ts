/**
 * A book's page says its month: one row of In this month, Out this month and Net (REC-A09 step 3), one test an effect.
 *
 * ON A RECORD HOLDING MONEY AS ITS PACK DOCUMENT SAYS IT, as `money-book-figures.test.ts` measures the figures: the
 * three packs installed with no example entries, two books with an account each, Ledger entries written as a person
 * writes them, and the page read as the app reads it (`k.page`). So a cell whose figure the record refuses, or a block
 * the page checker refuses, fails here and not on a screen.
 *
 * RED FIRST: with no row on `pages/book.ts` the page has no block called This month.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Entry, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { firstPartyDocument } from '../src/index.ts';
import { MONEY_BOOK_PAGE } from '../src/modules/money/pages/book.ts';

type Reading = { value: number | null; unit: string | null; rows: number; held?: number; parts?: { currency: string; amount: number }[] };
type Cell = { metric: string; label?: string; reading: Reading | null; refusal?: unknown };
type Block = { kind: string; heading?: string; lead?: boolean; drawn?: boolean; why?: string; span?: number; readings?: Cell[]; refusals?: unknown[] };
type Declared = { kind: string; heading?: string; span?: number; lead?: boolean; cells?: { metric: string; label?: string }[]; when?: Record<string, unknown> };

const OWNER = { actor: 'p_1' };
/** Noon on 18 September 2026. */
const TODAY = Date.UTC(2026, 8, 18, 12);
const ROW = 'This month';
/** The row's three figures in the order they are read across, each by the words under it. */
const CELLS = [
  ['book-in-month', 'In this month'],
  ['book-out-month', 'Out this month'],
  ['book-net-month', 'Net'],
] as const;

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

/** A fresh record holding Money as a person installs it, and two books with an account each. */
async function fresh(): Promise<Kept> {
  const k = await openRecord(openSqlite(), fixedClock(TODAY));
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
const moved = (r: Kept, direction: 'in' | 'out', on: string, amount: number, more: Record<string, unknown> = {}): Entry =>
  value<Entry>(
    r.k.create('transactions', { what: `${direction} ${on}`, on, direction, amount: { amount, currency: 'EGP' }, account: r.current.id, state: 'cleared', transfer: false, book: r.studio.id, ...more }, OWNER),
  );

/** A book's page as the app reads it, found by the name a person reads and never by an address typed here. */
function pageOf(k: Kernel, name: string): Block[] {
  const listed = k.pages() as unknown as { slug: string; title: string; template: string | null }[];
  const found = listed.find((p) => p.template === MONEY_BOOK_PAGE.page && p.title === name);
  assert.ok(found, `${name} has a page of its own`);
  const blocks = value<{ blocks: Block[] }>(k.page(found.slug)).blocks;
  for (const b of blocks) assert.deepEqual(b.refusals ?? [], [], `${b.heading ?? b.kind} is read`);
  return blocks;
}
/** The row on a book's page, drawn or not. */
function rowOf(k: Kernel, name = 'Studio'): Block {
  const row = pageOf(k, name).find((b) => b.heading === ROW);
  assert.ok(row, `${name}'s page has no ${ROW}`);
  return row;
}
/** One figure of the row as its cell read it, by the figure's id. */
function cell(row: Block, id: string): Reading {
  const got = (row.readings ?? []).find((c) => c.metric.startsWith(`${id}:`));
  assert.ok(got, `${id} is not in the row`);
  assert.equal(got.refusal, undefined, JSON.stringify(got.refusal));
  return got.reading!;
}

test('THE PAGE DECLARES ONE ROW OF THREE, under what the book has and its walk, each figure asked about {{name}}', () => {
  const blocks = MONEY_BOOK_PAGE.blocks as unknown as Declared[];
  const rows = blocks.filter((b) => b.heading === ROW);
  assert.equal(rows.length, 1, 'one row, and no second');
  const row = rows[0]!;
  assert.equal(row.kind, 'stat');
  assert.deepEqual(
    row.cells,
    CELLS.map(([id, label]) => ({ metric: `${id}:{{name}}`, label })),
  );
  /* THE WHOLE WIDTH, so the three stand in one row and the tile of cash keeps its walk beside it. */
  assert.equal(row.span, 12);
  assert.deepEqual(
    blocks.slice(0, 4).map((b) => b.heading),
    ['What you have', 'Cash ahead', ROW, 'Accounts'],
  );
  /* CASH STILL LEADS, and nothing else does. */
  assert.deepEqual(blocks.filter((b) => b.lead === true).map((b) => b.heading), ['What you have']);
  /* DRAWN ON A FIGURE OF THIS BOOK: the page fills the name in, as every cell does. */
  assert.match(String(row.when?.metric), /^book-(in|out|net)-month:\{\{name\}\}$/);
});

test('THE PAGE STAYS WITHIN THE CEILING OF 24 BLOCKS, with nothing folded away to make room', () => {
  const blocks = MONEY_BOOK_PAGE.blocks as unknown as Declared[];
  assert.ok(blocks.length <= 24, `${blocks.length} blocks`);
  assert.equal(blocks.length, 10);
  for (const heading of ['Accounts', 'Add an account', 'Coming and going', 'Due in the next 30 days', 'The next 30 days', "Where this month's money went", 'What moved'])
    assert.ok(blocks.some((b) => b.heading === heading), `${heading} was taken off the page to make room`);
});

test("A BOOK WITH A MONTH READS IT ACROSS: in, out and what is left, from the book's own entries", async () => {
  const r = await fresh();
  moved(r, 'in', '2026-09-01', 900_000);
  moved(r, 'in', '2026-09-18', 100_000);
  moved(r, 'out', '2026-09-02', 400_000);
  moved(r, 'out', '2026-09-10', 75_000);
  moved(r, 'in', '2026-09-07', 800_000, { book: r.home.id, account: r.own.id }); // the other book's
  const row = rowOf(r.k);
  assert.notEqual(row.drawn, false, `the row is not drawn: ${row.why}`);
  assert.deepEqual((row.readings ?? []).map((c) => [c.metric, c.label]), CELLS.map(([id, label]) => [`${id}:Studio`, label]));
  assert.equal(cell(row, 'book-in-month').value, 1_000_000);
  assert.equal(cell(row, 'book-out-month').value, 475_000);
  assert.equal(cell(row, 'book-net-month').value, 525_000);
  for (const [id] of CELLS) assert.equal(cell(row, id).unit, 'EGP');
  /* AND THE OTHER BOOK'S PAGE READS ITS OWN, from the same declaration. */
  const other = rowOf(r.k, 'Household');
  assert.notEqual(other.drawn, false);
  assert.equal(cell(other, 'book-in-month').value, 800_000);
  assert.equal(cell(other, 'book-net-month').value, 800_000);
});

test('MONEY IN ALONE DRAWS THE ROW, AND SO DOES MONEY OUT ALONE', async () => {
  const came = await fresh();
  moved(came, 'in', '2026-09-03', 120_000);
  assert.notEqual(rowOf(came.k).drawn, false, 'a book that was only paid into draws no row');
  assert.equal(cell(rowOf(came.k), 'book-net-month').value, 120_000);

  const went = await fresh();
  moved(went, 'out', '2026-09-03', 120_000);
  assert.notEqual(rowOf(went.k).drawn, false, 'a book that only paid out draws no row');
  assert.equal(cell(rowOf(went.k), 'book-net-month').value, -120_000);
});

test('A MONTH THAT CAME TO NOUGHT IS STILL A MONTH: as much in as out draws the row', async () => {
  const r = await fresh();
  moved(r, 'in', '2026-09-03', 120_000);
  moved(r, 'out', '2026-09-04', 120_000);
  const row = rowOf(r.k);
  assert.notEqual(row.drawn, false, 'a net of nought hid a month that had money in it');
  assert.equal(cell(row, 'book-net-month').value, 0);
});

test('A BOOK WITH NOTHING IN IT DRAWS NO ROW, and neither does one whose entries are all before the first', async () => {
  const r = await fresh();
  assert.equal(rowOf(r.k).drawn, false, 'a book with no entries draws three noughts');
  /* LAST MONTH, A TRANSFER, AN ENTRY NOT YET SETTLED AND ONE THAT NEVER HAPPENED are no part of this month. */
  moved(r, 'in', '2026-08-20', 70_000);
  moved(r, 'out', '2026-08-21', 30_000);
  moved(r, 'out', '2026-09-05', 250_000, { transfer: true });
  moved(r, 'in', '2026-09-06', 60_000, { state: 'pending' });
  moved(r, 'out', '2026-09-06', 60_000, { state: 'void' });
  assert.equal(rowOf(r.k).drawn, false, 'a month with nothing earned or spent in it draws three noughts');
  /* AND ANOTHER BOOK'S MONTH DRAWS NOTHING HERE. */
  moved(r, 'out', '2026-09-07', 300_000, { book: r.home.id, account: r.own.id });
  assert.equal(rowOf(r.k).drawn, false);
  assert.notEqual(rowOf(r.k, 'Household').drawn, false);
});

test('IN TWO CURRENCIES THE ROW IS DRAWN AND NOTHING IS ADDED: one amount a currency', async () => {
  const r = await fresh();
  moved(r, 'in', '2026-09-03', 900_000);
  moved(r, 'out', '2026-09-04', 20_000, { amount: { amount: 20_000, currency: 'USD' } });
  const row = rowOf(r.k);
  assert.notEqual(row.drawn, false);
  const net = cell(row, 'book-net-month');
  assert.equal(net.value, null, 'pounds were added to dollars');
  assert.deepEqual([...(net.parts ?? [])].sort((a, b) => a.currency.localeCompare(b.currency)), [
    { currency: 'EGP', amount: 900_000 },
    { currency: 'USD', amount: -20_000 },
  ]);
});
