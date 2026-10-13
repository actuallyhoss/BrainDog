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
 * A BLOCK IS ON THE PAGE ONCE EVERY FIGURE IT READS IS DECLARED (REC-A09 step 3, second half). What a book is owed and
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
    {
      kind: 'stat',
      lead: true,
      heading: 'What you have',
      icon: 'wallet',
      span: 4,
      cells: [{ metric: 'book-cash:{{name}}', label: 'Cash now' }],
    },
    {
      /* THIS BOOK'S WALK, FROM THIS BOOK'S CASH, over this book's bills, repeating lines, instalments and money on its
         way (`BOOK_LEGS`). No `sell`: what a record holds to sell is filed in no book. */
      kind: 'forecast',
      heading: 'Cash ahead',
      icon: 'chart-line',
      span: 8,
      source: 'forecast.runway',
      opening: { metric: 'book-cash:{{name}}' },
      from: BOOK_LEGS,
      horizon: 365,
      /* FIVE YEARS AND TO THE END, SINCE money-core 3.10.0, as Money's own Cash ahead: a load walks two years and a
         longer length is walked when a reader picks it. */
      horizons: [90, 180, 365, 730, 1825, 'last'],
      knobs: ['horizon', 'late', 'spend', 'count', 'grow', 'drift'],
      late: 'days-late-in',
      under: 30,
      empty: 'Nothing in {{name}} is dated in the next twelve months.',
    },
    {
      /* THIS BOOK'S MONTH IN ONE ROW (REC-A09 step 3): what came in, what went out and what is left, each read once a
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
      when: { metric: 'book-net-month:{{name}}', empty: false },
    },
    ...owedRow(declared),
    ...monthsChart(declared),
    {
      kind: 'cards',
      heading: 'Accounts',
      icon: 'landmark',
      span: 8,
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
         3.16.0 (REC-B03), the day `account-ages` says for the card's account, where it was the typed "As of" a bank
         message never writes (`parts/ages.ts`). */
      stale: CONFIRMED_STALE,
      empty: 'No account is in {{name}} yet. Add one here and it is filed in this book.',
    },
    {
      kind: 'capture',
      heading: 'Add an account',
      icon: 'plus',
      span: 4,
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
      empty: 'Nothing in {{name}} falls due in the next 30 days.',
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
      empty: 'Nothing in {{name}} is dated in the next 30 days.',
    },
    {
      kind: 'split',
      heading: "Where this month's money went",
      icon: 'chart-pie',
      span: 12,
      source: 'register.transactions',
      where: 'state is cleared, transfer is false, direction is out, on at least bom, book is {{name}}',
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
      empty: 'Nothing has moved in {{name}} yet.',
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
 * read once a book (REC-A09 step 2). A ROW OF ITS OWN AND NOT THREE MORE CELLS OF THIS MONTH, because that row is drawn
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
      empty: 'Nothing moved in {{name}} in these months.',
    },
  ];
}

/** The page Money ships: a book's page over the figures of one book that Money declares. */
export const MONEY_BOOK_PAGE: SeedPage = bookPage((figure) => figure in BOOK_FIGURES);
