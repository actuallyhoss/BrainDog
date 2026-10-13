/** A book's page: Money's own layout over the rows filed in one book. */

import type { SeedPage } from '../../base.ts';
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
 */
export const MONEY_BOOK_PAGE: SeedPage = {
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
};
