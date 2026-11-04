/**
 * A book's page says its month: one row of In this month, Out this month and Net, one test an effect.
 *
 * ON A RECORD HOLDING MONEY AS ITS PACK DOCUMENT SAYS IT, as `money-book-figures.test.ts` measures the figures: the
 * three packs installed with no example entries, two books with an account each, Ledger entries written as a person
 * writes them, and the page read as the app reads it (`k.page`). So a cell whose figure the record refuses, or a block
 * the page checker refuses, fails here and not on a screen.
 *
 * RED FIRST: with no row on `pages/book.ts` the page has no block called This month.
 *
 * AND ITS MONTHS AND WHAT IT IS OWED (second half): a chart of the book's in and out by month, and a row
 * of owed to, owed by and lasts until. A BLOCK IS ON THE PAGE ONCE EVERY FIGURE IT READS IS DECLARED (`bookPage`), so
 * the page is held here both ways: with every figure, and with the figures the tree has today.
 *
 * THE THREE FIGURES BY MONTH ARE NOT THIS JOB'S TO DECLARE (`figures/books.ts`). Until the tree holds them `fresh` adds
 * them to Money's document as `BY_MONTH` spells them, and the chart with them, so the kernel reads the chart today and
 * not on a screen later. Once they are declared `fresh` adds nothing, and `BY_MONTH` can go.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Entry, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { firstPartyDocument } from '../src/index.ts';
import { MONEY_BOOK_PAGE, bookPage } from '../src/modules/money/pages/book.ts';

type Reading = { value: number | null; unit: string | null; rows: number; held?: number; parts?: { currency: string; amount: number }[] };
type Cell = { metric: string; label?: string; reading: Reading | null; refusal?: unknown };
type Bars = { keys: string[]; values: (number | null)[][]; unit: string | null; split?: { unit: string; values: (number | null)[][] }[] };
type Block = { kind: string; heading?: string; body?: string; lead?: boolean; drawn?: boolean; why?: string; span?: number; readings?: Cell[]; refusals?: unknown[]; bars?: Bars };
type Line = { metric: string; then?: string; each?: string; label?: string; dir?: string };
type Declared = {
  kind: string;
  heading?: string;
  body?: string;
  span?: number;
  lead?: boolean;
  cells?: { metric: string; label?: string }[];
  when?: Record<string, unknown>;
  series?: Line[];
  back?: number;
  ahead?: number;
  net?: boolean;
  empty?: string;
};

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

const CHART = 'In and out, by month';
const OWED = 'What is due';
/** The owed row's figures in the order they are read across, each by the words under it. */
const OWED_CELLS = [
  ['book-owed-to', 'Due to come in'],
  ['book-owed-by', 'Due to go out'],
  ['book-lasts-until', 'Runs out'],
] as const;
/** The line that stood under What is due on a book whose money never goes under, until money-core 3.34.0. */
const LASTS = 'Lasts the year on what is due.';

/** One book's cleared entries of the last thirteen months, and no transfer: `in-by-month`'s clauses, narrowed to a book. */
const MONTHS = 'state is cleared, transfer is false, on after -13m';
const byMonth = (metric: string, name: string, more: Record<string, unknown>): Record<string, unknown> => ({
  metric,
  name,
  source: 'register.transactions',
  value: { sum: 'amount' },
  ...more,
  group_by: 'on',
  bucket: 'month',
  format: 'money',
  target: { gte: 0 },
  window: '30d',
  compare: 'none',
});
/** The three figures the chart reads, as this job's report asks for them in `figures/books.ts`. */
const BY_MONTH: Record<string, unknown>[] = [
  byMonth('book-in-by-month', 'Money into one book, by month', { where: `${MONTHS}, direction is in, book is {{it}}` }),
  byMonth('book-out-by-month', 'Money out of one book, by month', { where: `${MONTHS}, direction is out, book is {{it}}` }),
  byMonth('book-net-by-month', 'Left over in one book, by month', {
    where: `${MONTHS}, book is {{it}}`,
    value: { sum: { product: ['amount', { lookup: 'sign', by: 'direction' }] } },
    lookups: { sign: { in: 1, out: -1 } },
  }),
];
const EVERY = [...CELLS, ...OWED_CELLS].map(([id]) => id as string).concat(BY_MONTH.map((f) => String(f.metric)));
/** The figures the tree declares today, by Money's own document. */
const IN_TREE = new Set(
  ((firstPartyDocument('money-core', { seeds: [] }) as { declarations: Record<string, unknown>[] }).declarations ?? [])
    .map((d) => d.metric)
    .filter((id): id is string => typeof id === 'string'),
);
const OWED_IN_TREE = OWED_CELLS.filter(([id]) => IN_TREE.has(id));

/**
 * Money's document with the chart's figures in it. WHERE THE TREE DECLARES THEM IT IS THE TREE'S OWN, UNCHANGED. Where
 * it does not, the missing ones are added and the page gains the blocks `bookPage` holds for them, set after This month
 * as `bookPage` sets them, every other block left as the document had it.
 */
function withMonths(doc: Record<string, unknown>): Record<string, unknown> {
  const missing = BY_MONTH.filter((f) => !IN_TREE.has(String(f.metric)));
  if (missing.length === 0) return doc;
  const held = new Set([...IN_TREE, ...missing.map((f) => String(f.metric))]);
  const full = bookPage((id) => held.has(id)).blocks as Declared[];
  const declarations = (doc.declarations as Record<string, unknown>[]).flatMap((d) => {
    if (d.page !== MONEY_BOOK_PAGE.page) return [d];
    const mine = d.blocks as Declared[];
    const added = full.filter((b) => !mine.some((m) => m.heading === b.heading));
    const at = mine.findIndex((b) => b.heading === ROW) + 1;
    return [{ ...d, blocks: [...mine.slice(0, at), ...added, ...mine.slice(at)] }];
  });
  return { ...doc, declarations: [...declarations, ...missing] };
}

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
    const doc = firstPartyDocument(id, { seeds: [] })!;
    const pack = value<Pack>(await normalise(id === 'money-core' ? withMonths(doc) : doc, { kind: 'local' }));
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
  /* THE WHOLE WIDTH, so the three stand in one row under the walk. */
  assert.equal(row.span, 12);
  /* NO WHAT YOU HAVE TILE SINCE money-core 3.34.0: Cash ahead said the same cash from today beside it, so Cash ahead is
     the book's hero, the whole row. */
  assert.deepEqual(
    blocks.filter((b) => !(b.kind === 'note' && b.lead === true)).slice(0, 2).map((b) => b.heading),
    ['Cash ahead', ROW],
  );
  /* AND WITH NO OTHER FIGURE OF A BOOK DECLARED THE ACCOUNTS COME NEXT, as they did. */
  const bare = bookPage((id) => CELLS.some(([had]) => had === id)).blocks as Declared[];
  assert.deepEqual(
    bare.filter((b) => !(b.kind === 'note' && b.lead === true)).slice(0, 3).map((b) => b.heading),
    ['Cash ahead', ROW, 'Accounts'],
  );
  /* NO TILE LEADS BUT THE LINES ON CATEGORIES: the walk is first, and is not a lead. */
  assert.deepEqual(blocks.filter((b) => b.lead === true && b.kind !== 'note').map((b) => b.heading), []);
  /* DRAWN ON THE FIGURES OF THIS BOOK, WHILE MONEY CAME IN OR WENT OUT SINCE 3.35.0 (24fd3a8d4), never three noughts: the
     page fills the name in, as every cell does. */
  const asked = (row.when as unknown as { any: { metric: string; gt: number }[] }).any;
  assert.ok(asked.length >= 2 && asked.every((w) => /^book-(in|out)-month:\{\{name\}\}$/.test(w.metric) && w.gt === 0), JSON.stringify(row.when));
});

test('THE PAGE STAYS WITHIN THE CEILING OF 24 BLOCKS, with nothing folded away to make room', () => {
  const blocks = MONEY_BOOK_PAGE.blocks as unknown as Declared[];
  assert.ok(blocks.length <= 24, `${blocks.length} blocks`);
  /* TWELVE BARE, WITH THE TWO LINES ON CATEGORIES MARKED AGAINST THE LEDGER, AND FOURTEEN WITH ITS OWED ROW AND ITS
     MONTHS, whatever the tree declares: well under the ceiling. One fewer each since money-core 3.34.0 took What you
     have off, and the line that its money lasts went from the full page; one more each since 3.36.0 (fc63fdc5e) says
     what a book with no account yet holds. */
  const full = bookPage(() => true).blocks as Declared[];
  assert.equal((bookPage(() => false).blocks as Declared[]).length, 12);
  assert.equal(full.length, 14);
  assert.ok(blocks.length >= 12 && blocks.length <= full.length, `${blocks.length} blocks`);
  for (const heading of ['Accounts', 'Add an account', 'Coming and going', 'Due in the next 30 days', 'The next 30 days', "Where this month's money went", 'What moved'])
    for (const page of [blocks, full]) assert.ok(page.some((b) => b.heading === heading), `${heading} was taken off the page to make room`);
});

test('WITH ITS FIGURES DECLARED THE PAGE HOLDS WHAT IS OWED AND ITS MONTHS, under This month and above the accounts', () => {
  const blocks = bookPage(() => true).blocks as Declared[];
  assert.deepEqual(
    blocks.filter((b) => !(b.kind === 'note' && b.lead === true)).slice(0, 5).map((b) => b.heading ?? b.body),
    ['Cash ahead', ROW, OWED, CHART, 'Accounts'],
  );
  const owed = blocks.find((b) => b.heading === OWED)!;
  assert.equal(owed.kind, 'stat');
  assert.equal(owed.span, 12);
  assert.deepEqual(
    owed.cells,
    OWED_CELLS.map(([id, label]) => ({ metric: `${id}:{{name}}`, label })),
  );
  /* THE CHART IS MONEY'S OWN, NARROWED TO THIS BOOK: two lines, money out hung under the rule, what was left as a line. */
  const chart = blocks.find((b) => b.heading === CHART)!;
  assert.equal(chart.kind, 'series');
  assert.equal(chart.span, 12);
  assert.deepEqual(chart.series, [
    { metric: 'book-in-by-month:{{name}}', label: 'Money in' },
    { metric: 'book-out-by-month:{{name}}', label: 'Money out', dir: 'out' },
  ]);
  assert.equal(chart.back, 12);
  assert.equal(chart.net, true);
  /* NO MONTHS AHEAD: what is due and what repeats are read over the whole record, and a book has no such figure. */
  assert.equal(chart.ahead, undefined);
  for (const line of chart.series as Line[]) assert.deepEqual([line.then, line.each], [undefined, undefined]);
  /* DRAWN ON THE BOOK'S OWN MONTHS, in or out. */
  assert.deepEqual(chart.when, { metric: 'book-net-by-month:{{name}}', empty: false });
  assert.match(String(chart.empty), /\{\{name\}\}/u);
  /* NOTHING A PERSON READS HOLDS A DASH OR AN ADDRESS. */
  for (const b of blocks) for (const said of [b.heading, b.body, b.empty, ...(b.cells ?? []).map((c) => c.label)]) assert.doesNotMatch(String(said ?? ''), /\u2014|register\.|book-/u);
});

test('A BLOCK WAITS FOR ITS FIGURES: a cell with no figure is left out, and a chart short of one is not drawn', () => {
  const page = (...ids: string[]): Declared[] => bookPage((id) => ids.includes(id)).blocks as Declared[];
  const none = page();
  assert.equal(none.some((b) => b.heading === OWED || b.heading === CHART), false);
  /* ONE OWED FIGURE IS A ROW OF ONE, and a second joins it in its place. */
  assert.deepEqual(page('book-owed-by').find((b) => b.heading === OWED)?.cells, [{ metric: 'book-owed-by:{{name}}', label: 'Due to go out' }]);
  assert.deepEqual(
    page('book-lasts-until', 'book-owed-to').find((b) => b.heading === OWED)?.cells?.map((c) => c.label),
    ['Due to come in', 'Runs out'],
  );
  /* THE CHART READS THREE, AND TWO OF THEM DRAW NOTHING: a line or its `when:` would name a figure nobody declared. */
  const three = BY_MONTH.map((f) => String(f.metric));
  for (const gone of three) assert.equal(page(...three.filter((id) => id !== gone)).some((b) => b.heading === CHART), false, `drawn without ${gone}`);
  assert.equal(page(...three).some((b) => b.heading === CHART), true);
  /* EVERY FIGURE THE FULL PAGE NAMES IS ONE THIS TEST KNOWS, so a new one cannot slip onto the page unheld. */
  const named = (bookPage(() => true).blocks as Declared[]).flatMap((b) => [...(b.cells ?? []).map((c) => c.metric), ...(b.series ?? []).map((l) => l.metric), ...(b.when ? [String(b.when.metric)] : [])]);
  for (const id of named.map((m) => m.split(':')[0]!).filter((id) => id.startsWith('book-') && id !== 'book-cash' && id !== 'book-spent-month' && id !== 'book-accounts')) assert.ok(EVERY.includes(id), id);
  /* AND THE PAGE MONEY SHIPS IS THAT PAGE OVER THE FIGURES MONEY DECLARES, no more and no fewer. */
  assert.deepEqual(MONEY_BOOK_PAGE, bookPage((id) => IN_TREE.has(id)));
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

/** A block of a book's page by its heading, drawn or not. */
function blockOf(k: Kernel, heading: string, name = 'Studio'): Block {
  const got = pageOf(k, name).find((b) => b.heading === heading);
  assert.ok(got, `${name}'s page has no ${heading}`);
  return got;
}
/** A chart's months as a person reads them: each month that holds an amount, with money in and money out. */
function months(chart: Block): Record<string, [number | null, number | null]> {
  const bars = chart.bars;
  assert.ok(bars, 'the chart has no months');
  const out: Record<string, [number | null, number | null]> = {};
  bars.keys.forEach((key, i) => {
    const pair: [number | null, number | null] = [bars.values[0]?.[i] ?? null, bars.values[1]?.[i] ?? null];
    if (pair[0] !== null || pair[1] !== null) out[key.slice(0, 7)] = pair;
  });
  return out;
}

test("A BOOK'S MONTHS ARE ITS OWN: in and out, month by month, from its cleared entries and no other book's", async () => {
  const r = await fresh();
  moved(r, 'in', '2026-07-03', 500_000);
  moved(r, 'out', '2026-07-20', 200_000);
  moved(r, 'in', '2026-08-04', 650_000);
  moved(r, 'out', '2026-08-05', 300_000);
  moved(r, 'out', '2026-08-25', 50_000);
  moved(r, 'in', '2026-09-01', 900_000);
  moved(r, 'out', '2026-09-02', 400_000);
  /* NO PART OF A MONTH: a transfer, an entry not yet settled, one that never happened, and the other book's. */
  moved(r, 'out', '2026-08-09', 990_000, { transfer: true });
  moved(r, 'in', '2026-08-10', 990_000, { state: 'pending' });
  moved(r, 'out', '2026-08-11', 990_000, { state: 'void' });
  moved(r, 'in', '2026-08-12', 70_000, { book: r.home.id, account: r.own.id });
  const chart = blockOf(r.k, CHART);
  assert.notEqual(chart.drawn, false, `the chart is not drawn: ${chart.why}`);
  assert.equal(chart.bars?.unit, 'EGP');
  assert.deepEqual(months(chart), { '2026-07': [500_000, 200_000], '2026-08': [650_000, 350_000], '2026-09': [900_000, 400_000] });
  /* AND THE OTHER BOOK'S PAGE DRAWS ITS ONE MONTH, from the same declaration. */
  assert.deepEqual(months(blockOf(r.k, CHART, 'Household')), { '2026-08': [70_000, null] });
});

test('THE CHART IS DRAWN ON MONEY IN ALONE AND ON MONEY OUT ALONE, and a book with no months draws none', async () => {
  const came = await fresh();
  moved(came, 'in', '2026-08-03', 120_000);
  assert.notEqual(blockOf(came.k, CHART).drawn, false, 'a book that was only paid into draws no months');
  assert.equal(blockOf(came.k, CHART, 'Household').drawn, false, "another book's month drew a chart here");

  const went = await fresh();
  moved(went, 'out', '2026-08-03', 120_000);
  assert.notEqual(blockOf(went.k, CHART).drawn, false, 'a book that only paid out draws no months');

  const bare = await fresh();
  assert.equal(blockOf(bare.k, CHART).drawn, false, 'a book with nothing in it draws an empty chart');
  /* A TRANSFER AND AN ENTRY THAT NEVER HAPPENED ARE NO MONTH. */
  moved(bare, 'out', '2026-08-05', 250_000, { transfer: true });
  moved(bare, 'out', '2026-08-06', 60_000, { state: 'void' });
  assert.equal(blockOf(bare.k, CHART).drawn, false);
});

test('IN TWO CURRENCIES THE CHART IS DRAWN ONCE A CURRENCY, and nothing is added', async () => {
  const r = await fresh();
  moved(r, 'in', '2026-08-03', 900_000);
  moved(r, 'out', '2026-08-04', 20_000, { amount: { amount: 20_000, currency: 'USD' } });
  const chart = blockOf(r.k, CHART);
  assert.notEqual(chart.drawn, false);
  assert.deepEqual((chart.bars?.split ?? []).map((s) => s.unit).sort(), ['EGP', 'USD']);
});

/* WHAT IS OWED IS READ ONCE ITS FIGURES ARE IN THE TREE (`figures/books.ts`, another job's): until one is, the page has
   no such row and there is nothing to read. What each figure says is held where it is declared
   (`money-book-figures.test.ts`); here, that the page asks each about this book and none is refused. THE WORDS ARE
   "DUE", as Money's own are: no word on a Money page says who owes whom (`money.test.ts`). */
test('WHAT IS DUE IS READ ABOUT THIS BOOK, each cell by its own words and none refused, and a book with nothing due draws no row', { skip: OWED_IN_TREE.length === 0 && 'no figure of what a book is due is declared yet' }, async () => {
  const r = await fresh();
  moved(r, 'in', '2026-09-01', 900_000);
  /* NOTHING DUE IS NO ROW OF NOUGHTS, whatever moved: the record leaves out a row whose every figure is empty. */
  assert.equal(blockOf(r.k, OWED).drawn, false, 'a book with nothing due draws a row of noughts');
  value<Entry>(r.k.create('obligations', { what: 'Studio rent', direction: 'owed_by_me', amount: { amount: 300_000, currency: 'EGP' }, due: '2026-09-25', state: 'open', book: r.studio.id }, OWNER));
  const row = blockOf(r.k, OWED);
  assert.notEqual(row.drawn, false, `the row is not drawn: ${row.why}`);
  assert.deepEqual((row.readings ?? []).map((c) => [c.metric, c.label]), OWED_IN_TREE.map(([id, label]) => [`${id}:Studio`, label]));
  for (const c of row.readings ?? []) assert.equal(c.refusal, undefined, `${c.metric}: ${JSON.stringify(c.refusal)}`);
  if (IN_TREE.has('book-owed-by')) assert.deepEqual([cell(row, 'book-owed-by').value, cell(row, 'book-owed-by').unit], [300_000, 'EGP']);
  /* AND THE OTHER BOOK'S PAGE IS ASKED ABOUT ITS OWN, where nothing is due. */
  assert.equal(blockOf(r.k, OWED, 'Household').drawn, false, "another book's bill drew a row here");
});

/* THAT A BOOK'S MONEY LASTS THE YEAR WAS SAID IN A LINE UNDER WHAT IS DUE (book-lasts-year-78), drawn on the walk never
   going under. SINCE money-core 3.34.0 IT IS NOT: Cash ahead's own summary says how far the book stays above nought, so
   the line said it a second time. The cell Money lasts until stays, a day only while the walk goes under. */
test('THE PAGE DECLARES NO LINE THAT THE MONEY LASTS, and keeps the cell of the day it runs out', () => {
  const blocks = bookPage(() => true).blocks as Declared[];
  assert.deepEqual(blocks.filter((b) => b.kind === 'note' && b.lead !== true), [], 'a line under What is due says the money lasts again');
  assert.equal(blocks.some((b) => b.body === LASTS), false);
  assert.ok(blocks.find((b) => b.heading === OWED)?.cells?.some((c) => c.metric === 'book-lasts-until:{{name}}'), 'the day the book runs out is not a cell');
  assert.equal((bookPage((id) => id === 'book-lasts-until').blocks as Declared[]).filter((b) => b.kind === 'note' && b.lead !== true).length, 0);
});

const LASTS_IN_TREE = IN_TREE.has('book-lasts-until');
/** That a book's page holds no line that its money lasts, since money-core 3.34.0. */
function noLasts(k: Kernel, name = 'Studio'): void {
  assert.equal(pageOf(k, name).some((b) => b.kind === 'note' && b.body === LASTS), false, `${name}'s page says its money lasts in a line again`);
}
/** The cell Money lasts until as a book's page read it, or nothing where the row has no such cell. */
const untilOf = (k: Kernel, name = 'Studio'): Reading | null => (blockOf(k, OWED, name).readings ?? []).find((c) => c.metric.startsWith('book-lasts-until:'))?.reading ?? null;
const bill = (r: Kept, what: string, amount: number, due: string, book = r.studio): Entry =>
  value<Entry>(r.k.create('obligations', { what, direction: 'owed_by_me', amount: { amount, currency: 'EGP' }, due, state: 'open', book: book.id }, OWNER));

test('A BOOK WHOSE MONEY NEVER GOES UNDER IS GIVEN NO DAY IT RUNS OUT, with a bill it can pay and with none, and no line', { skip: !LASTS_IN_TREE && 'the day a book runs out is not declared' }, async () => {
  const r = await fresh();
  /* MONEY HELD AND NOTHING DUE: the row of what is due is not drawn, and since money-core 3.34.0 no line is either. */
  assert.equal(blockOf(r.k, OWED).drawn, false);
  noLasts(r.k);
  /* A BILL THE BOOK CAN PAY: the row is drawn, and its cell of the day holds none. */
  bill(r, 'Studio rent', 300_000, '2026-09-25');
  assert.notEqual(blockOf(r.k, OWED).drawn, false);
  assert.equal(untilOf(r.k)?.value ?? null, null, 'a book that pays its bill was given a day it runs out');
  noLasts(r.k);
  noLasts(r.k, 'Household');
});

test('A BOOK THAT GOES UNDER DRAWS THE DAY AND NO LINE, and the book beside it keeps its own', { skip: !LASTS_IN_TREE && 'the day a book runs out is not declared' }, async () => {
  const r = await fresh();
  bill(r, 'Studio fit-out', 6_000_000, '2026-10-10');
  const until = untilOf(r.k);
  assert.ok(until && until.value !== null, 'a book that cannot pay its bill has no day it runs out');
  assert.equal(new Date(until.value * 86_400_000).toISOString().slice(0, 10), '2026-10-10');
  noLasts(r.k);
  /* THE OTHER BOOK'S BILL IS NOT THIS BOOK'S. */
  assert.equal(untilOf(r.k, 'Household')?.value ?? null, null, "another book's bill gave this book a day it runs out");
});

test('A BOOK NOBODY PUT MONEY IN DRAWS NEITHER: no day, and no word that nothing lasts a year', { skip: !LASTS_IN_TREE && 'the day a book runs out is not declared' }, async () => {
  const r = await fresh();
  value<Entry>(r.k.create('books', { name: 'Spare' }, OWNER));
  assert.equal(blockOf(r.k, OWED, 'Spare').drawn, false);
  noLasts(r.k, 'Spare');
});
