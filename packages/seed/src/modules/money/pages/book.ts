/** A book's page: Money's own layout over the rows filed in one book. */

import type { SeedPage } from '../../base.ts';
import { BOOK_FIGURES } from '../figures/books.ts';
import { CONFIRMED_COLUMN, CONFIRMED_STALE } from './parts/ages.ts';
import { BOOK_LEGS, DUE_30D, MOVED_COLUMNS } from './shared.ts';

/**
 * ONE PAGE A BOOK, UNDER MONEY, SINCE money-core 3.1.0: the Money page's own layout over the rows filed in that book.
 *
 * A TEMPLATE, as a project's page is: one declaration, one page for each row of `books`, every `{{name}}` filled from
 * the row. A record that keeps no book has none of these pages and loses nothing. What the book's rows cannot say is
 * left to the Money page: the questions and what agents did are read across the record by list, and a list is not a
 * book, and the figures that read every list (by month, every month, late) have no book to be asked about.
 *
 * A CAPTURE HERE FILES INTO THIS BOOK. A capture presets a link only where its sentence names the row by its spoken
 * id (`captureFills` in `packages/kernel/src/pages.ts`), because a title is a guess at a row, so the capture says
 * `{{spoken}}` where every other block says the name a person reads.
 *
 * THE MONEY PAGE'S TILES, SINCE money-core 3.3.0: the headline figure beside its walk, the month ahead as a calendar
 * beside its arithmetic, and what moved as a calm list. The accounts stay cards here, each with the day its balance was
 * true, because a book's few accounts are the page's subject and Cash now by account is a figure of the whole record.
 * SINCE money-core 3.4.0 the month ahead and what moved are folded under the accounts, as Money's are.
 *
 * SINCE money-core 3.35.0 This month is drawn only while something came in or went out, and Accounts and Add an account
 * each take the whole row.
 *
 * SINCE money-core 3.17.0 a book whose money never goes under in the year reads one line that it lasts (`lastsNote`),
 * and a record holding categories marked against how the Ledger books them says how many (`againstNotes`).
 *
 * A BLOCK IS ON THE PAGE ONCE EVERY FIGURE IT READS IS DECLARED (second half). What a book is owed and
 * its months are read from figures of one book (`figures/books.ts`), and those are declared by their own jobs: a cell
 * naming a figure nobody declared is refused where it is read, and a chart's `when:` naming one draws nothing for ever.
 * So the page is built over `declared`, and the one Money ships is built over the figures Money declares.
 */
export const bookPage = (declared: (figure: string) => boolean): SeedPage => ({
  page: 'money-book',
  title: '{{name}}',
  for: { register: 'books' },
  nav: { section: 'Money', order: 20 },
  icon: 'book',
  requires: ['register.books', 'register.accounts', 'register.obligations', 'register.transactions', 'register.recurring', 'register.installments'],
  pack: 'money-core',
  blocks: [
    ...againstNotes(),
    {
      /* A BOOK WITH NO ACCOUNT SAYS SO, AND WHAT ONE BRINGS, SINCE money-core 3.36.0 (empty states, 2 Nov): its Cash
         ahead waits for an account (below), and the page opened on "Nothing moved in Studio." with no word of the way in.
         Add an account is the tile under it. */
      kind: 'note',
      lead: true,
      span: 12,
      when: { metric: 'book-accounts:{{name}}', is: 0 },
      body: 'No account in {{name}} yet. Add one, and where its cash is heading is drawn here.',
    },
    /* NO "WHAT YOU HAVE" TILE, SINCE money-core 3.34.0 (next-money, M32): it said the book's cash, and Cash ahead beside
       it says the same from today, so "$6,830" stood three times in one row. Cash ahead is the book's hero now, the
       whole row. */
    {
      /* THIS BOOK'S WALK, FROM THIS BOOK'S CASH, over this book's bills, repeating lines, instalments and money on its
         way (`BOOK_LEGS`). No `sell`: what a record holds to sell is filed in no book. */
      kind: 'forecast',
      heading: 'Cash ahead',
      icon: 'chart-line',
      span: 12,
      source: 'forecast.runway',
      opening: { metric: 'book-cash:{{name}}' },
      from: BOOK_LEGS,
      /* TWELVE WEEKS FIRST, SINCE money-core 3.27.0, as Money's own Cash ahead (ten from 3.17.0): it opened on a
         year, a span nobody plans a book by. A year and every other length is one press away. */
      horizon: 84,
      /* FIVE YEARS AND TO THE END, SINCE money-core 3.10.0, as Money's own Cash ahead: a load walks two years and a
         longer length is walked when a reader picks it. */
      horizons: [84, 180, 365, 730, 1825, 'last'],
      axis: 'fit',
      knobs: ['horizon', 'late', 'spend', 'count', 'grow', 'drift'],
      late: 'days-late-in',
      under: 30,
      empty: 'Nothing dated ahead yet.',
      /* ONLY ONCE THE BOOK HOLDS AN ACCOUNT, SINCE money-core 3.36.0 (empty states, 2 Nov): with none the walk opened on
         nought and drew twelve weeks of £0 that "stays above zero to 25 Jan 2027". The Accounts tile under it says what
         an account brings, and Add an account under that is the way in. */
      when: { metric: 'book-accounts:{{name}}', gt: 0 },
    },
    {
      /* THIS BOOK'S MONTH IN ONE ROW: what came in, what went out and what is left, each read once a
         book as `book-cash` is (`figures/books.ts`). UNDER THE CASH AND ITS WALK AND NOT BETWEEN THEM: the two are one
         row of twelve, and a tile of twelve set between them would leave the cash alone on a line.

         ONLY WHILE THE MONTH HAS MONEY IN IT. A block's `when:` reads one figure, and `book-net-month` is read over the
         entries of both halves, so it holds an amount while either does, a net of nought in a currency among them. A
         book with nothing earned or spent this month would say three noughts, which is no news. */
      kind: 'stat',
      heading: 'This month',
      icon: 'coins',
      span: 12,
      cells: [
        { metric: 'book-in-month:{{name}}', label: 'In this month' },
        { metric: 'book-out-month:{{name}}', label: 'Out this month' },
        { metric: 'book-net-month:{{name}}', label: 'Net' },
      ],
      /* ONLY WHILE SOMETHING CAME IN OR WENT OUT, SINCE money-core 3.35.0 (leftovers 2 Nov, 2): `book-net-month` over no
         entries reads nought in the book's own currency, which is an amount, so a book with a currency and a quiet month
         said "$0, $0, $0", and one whose lines were filed in no book said the same under a month of spending. */
      when: { any: [{ metric: 'book-in-month:{{name}}', gt: 0 }, { metric: 'book-out-month:{{name}}', gt: 0 }] },
    },
    ...owedRow(declared),
    /* NO "LASTS THE YEAR ON WHAT IS DUE." TILE UNDER THE CHART, SINCE money-core 3.34.0 (next-money, M33): Cash ahead's
       own summary says how far it stays above nought, so the tile said it a second time. */
    ...monthsChart(declared),
    {
      /* THE WHOLE ROW, SINCE money-core 3.35.0 (leftovers 2 Nov, 1), with Add an account the quiet line under it: at eight
         twelfths beside a capture of four, the capture was laid on a row of its own under the chart, a field alone in a
         tile far from the accounts it adds to. */
      kind: 'cards',
      heading: 'Accounts',
      icon: 'landmark',
      span: 12,
      source: 'register.accounts',
      where: 'book is {{name}}, state is not closed',
      columns: [
        { field: 'name', as: 'title' },
        { field: 'balance', as: 'figure' },
        { field: 'kind', label: 'Type', as: 'fact' },
        CONFIRMED_COLUMN,
      ],
      order: [{ field: 'seq', dir: 'asc' }],
      /* A BALANCE OLDER THAN A WEEK IS SAID TO BE OUT OF DATE (25 §9). DATED BY THE BANK'S LAST WORD SINCE money-core
         3.16.0, the day `account-ages` says for the card's account, where it was the typed "As of" a bank
         message never writes (`parts/ages.ts`). */
      stale: CONFIRMED_STALE,
      empty: 'No accounts yet.',
    },
    {
      kind: 'capture',
      heading: 'Add an account',
      icon: 'plus',
      span: 12,
      register: 'accounts',
      where: 'book is {{spoken}}',
    },
    {
      /* THE MONTH AHEAD AND WHAT MOVED ARE FOLDED SHUT, SINCE money-core 3.4.0, as they are on Money: above the fold the
         book says what it has, how long it lasts and which accounts hold it. */
      kind: 'section',
      heading: 'Coming and going',
      /* `calendar`, AS ON MONEY, SINCE money-core 3.5.0: `arrow-up-down` drew nothing on a folded heading. */
      icon: 'calendar',
      span: 12,
      fold: true,
    },
    {
      /* WHAT THIS BOOK HAS DUE IN THE NEXT THIRTY DAYS, ON ITS DAYS, from the bills themselves, which say their book. */
      kind: 'calendar',
      heading: 'Due in the next 30 days',
      icon: 'calendar',
      span: 8,
      source: 'register.obligations',
      where: `${DUE_30D}, book is {{name}}`,
      columns: [{ field: 'what' }, { field: 'due' }],
      back: 0,
      ahead: 1,
      empty: 'Nothing due in 30 days.',
    },
    {
      kind: 'bridge',
      heading: 'The next 30 days',
      icon: 'scale',
      span: 4,
      source: 'forecast.runway',
      opening: { metric: 'book-cash:{{name}}' },
      from: BOOK_LEGS,
      horizon: 30,
      empty: 'Nothing in the next 30 days.',
    },
    {
      kind: 'split',
      heading: "Where this month's money went",
      donut: true,
      icon: 'chart-pie',
      span: 12,
      source: 'register.transactions',
      where: 'state is cleared, transfer is false, stays is not true, corrects is not true, direction is out, on at least bom, book is {{name}}',
      columns: [{ field: 'category' }, { field: 'amount' }],
      limit: 6,
      unset: 'Uncategorised',
      /* ONLY WHILE SOMETHING LEFT THE BOOK THIS MONTH, SINCE money-core 3.8.0, over the split's own clauses: a book whose
         last payment was last month drew a track with no parts under this heading. */
      when: { metric: 'book-spent-month:{{name}}', gt: 0 },
    },
    {
      kind: 'timeline',
      heading: 'What moved',
      icon: 'receipt',
      span: 12,
      source: 'register.transactions',
      where: 'state is not void, book is {{name}}',
      columns: MOVED_COLUMNS,
      order: [{ field: 'on', dir: 'desc' }],
      limit: 12,
      empty: 'Nothing has moved yet.',
    },
  ],
});

/**
 * What a book is owed, what it owes and the day its money lasts until, each by the words a person reads under it. THE
 * WORDS ARE MONEY'S OWN, "due to come in" and "due to go out" (`figures/flow.ts`): no word on a Money page says who owes
 * whom (`money.ts`, "MONEY IS A FINANCE PAGE").
 */
const OWED_CELLS: [figure: string, label: string][] = [
  ['book-owed-to', 'Due to come in'],
  ['book-owed-by', 'Due to go out'],
  ['book-lasts-until', 'Money lasts until'],
];

/**
 * WHAT THIS BOOK IS OWED AND OWES, AND HOW LONG ITS MONEY LASTS, IN ONE ROW under its month: the rest of the figures
 * read once a book. A ROW OF ITS OWN AND NOT THREE MORE CELLS OF THIS MONTH, because that row is drawn
 * only while the month has money in it and a bill is owed whatever moved this month.
 *
 * A CELL FOR EACH FIGURE DECLARED, in this order, and no row with none. NO `when:`, because a block's `when:` reads one
 * figure and no one of these three holds an amount whenever another does; and it needs none, since the record leaves
 * out a row whose every figure is empty, so a book with nothing due draws no row of noughts.
 */
function owedRow(declared: (figure: string) => boolean): Record<string, unknown>[] {
  const cells = OWED_CELLS.filter(([figure]) => declared(figure)).map(([figure, label]) => ({ metric: `${figure}:{{name}}`, label }));
  if (cells.length === 0) return [];
  return [{ kind: 'stat', heading: 'What is due', icon: 'scale', span: 12, cells }];
}


/** The figure the two lines below are drawn on, and the list they send a person to. */
const AGAINST = 'categories-against-direction';
const SEE_CATEGORIES = '[See Categories](/r/categories).';

/**
 * WHAT AN IMPORT LEFT, SAID WHERE A BOOK IS READ, SINCE THE UNRELEASED money-core 3.17.0 (REC-A13's visible half). A
 * category marked one way that the Ledger books money going the other way under leaves every figure by category wrong in
 * silence. Money's Heads up held the line, and it was taken off that page to keep it at twenty-four blocks
 * (`money.ts`), so no screen said the figure at all.
 *
 * TWO LINES, ONE A COUNT AND ONE "1 category", because only one of a pair on `is: 1` and `gt: 1` draws, as Health says
 * how many signs are red (`health.ts`). LEADS, the sentence under the book's name and over its cash: a line about the
 * record the book is kept in, said only while the figure is above nought, and never a tile, since the page is already
 * one tile over its fold (`calm-pages.test.ts`). FIRST AND NOT BETWEEN THE CASH AND ITS WALK, which stand as one row of
 * four twelfths and eight (`money.test.ts`), and a line of the whole width set between them would break the row. The count is of categories and never a sum of what is in them, so no two
 * currencies meet in it (`figures/direction.ts`).
 */
function againstNotes(): Record<string, unknown>[] {
  const note = (when: Record<string, unknown>, body: string) => ({ kind: 'note', lead: true, tone: 'warn', span: 12, when: { metric: AGAINST, ...when }, body });
  return [
    note({ is: 1 }, `1 category is marked the other way from how the Ledger books it. ${SEE_CATEGORIES}`),
    note({ gt: 1 }, `{{${AGAINST}}} categories are marked the other way from how the Ledger books them. ${SEE_CATEGORIES}`),
  ];
}

/** The figures the chart reads: its two lines, and what was left each month, which it is drawn on. */
const BY_MONTH = { in: 'book-in-by-month', out: 'book-out-by-month', net: 'book-net-by-month' };

/**
 * THIS BOOK'S MONTHS, IN AND OUT: Money's own chart (`parts/history.ts`) narrowed to the book, as a project's page
 * narrows it to the project. A line names its figure with this book as its parameter, as a cell does.
 *
 * WHAT MOVED AND NOTHING AHEAD. Money's chart draws three months to come from what is due and what repeats, and those
 * are read over the whole record with no book to be asked about, so this one stops at the month the clock is in.
 *
 * DRAWN ON WHAT WAS LEFT, as This month is drawn on its net: read over the entries of both lines, it holds an amount
 * while either does, so a book only paid into has its months and a book nothing moved in has no empty chart. ALL THREE
 * FIGURES OR NO CHART, because a chart with one line says a book earned and never spent.
 */
function monthsChart(declared: (figure: string) => boolean): Record<string, unknown>[] {
  if (!Object.values(BY_MONTH).every(declared)) return [];
  return [
    {
      kind: 'series',
      heading: 'In and out, by month',
      icon: 'chart-column',
      span: 12,
      series: [
        { metric: `${BY_MONTH.in}:{{name}}`, label: 'Money in' },
        { metric: `${BY_MONTH.out}:{{name}}`, label: 'Money out', dir: 'out' },
      ],
      back: 12,
      net: true,
      when: { metric: `${BY_MONTH.net}:{{name}}`, empty: false },
      empty: 'Nothing moved in {{name}}.',
    },
  ];
}

/** The page Money ships: a book's page over the figures of one book that Money declares. */
export const MONEY_BOOK_PAGE: SeedPage = bookPage((figure) => figure in BOOK_FIGURES);
