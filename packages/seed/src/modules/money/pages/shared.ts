/**
 * What more than one of Money's pages, or a use case's Home, reads: one book's walk, the week's bills, the thirty days'
 * sentence and the columns of what moved. Cut out of `money.ts` with no change (REC-B01 job 1).
 */

import type { Leg } from '@braindog/kernel';

import { OPEN } from '../../base.ts';
import { CASH_LEGS } from '../legs.ts';

/** The lists of Money's cash walk that say which book a row is in (`BOOK`). */
const BOOKED: ReadonlySet<string> = new Set(['obligations', 'recurring', 'installments', 'accounts']);

/**
 * ONE BOOK'S CASH WALK: `CASH_LEGS`, each leg held to the rows filed in the book a page is about, SINCE money-core 3.1.0.
 *
 * DERIVED AND NOT WRITTEN AGAIN, so a leg the Money page's walk gains over a list in `BOOKED` reaches every book's walk
 * with it, and the two cannot come to read one list two ways. A leg over a list that holds no book (a subscription in
 * Services) is left out, because a clause naming a field the list does not have is refused. `{{name}}` is the book's,
 * filled when the page is drawn. ONE ARRAY for the walk and the bridge, as on the Money page.
 */
export const BOOK_LEGS: Leg[] = CASH_LEGS.filter((leg) => BOOKED.has(leg.register)).map((leg) => ({
  ...leg,
  where: leg.where === undefined ? 'book is {{name}}' : `${leg.where}, book is {{name}}`,
}));

/**
 * WHAT FALLS DUE THIS WEEK, AS ONE BLOCK A USE CASE'S HOME TAKES, SINCE money-core 3.0.0.
 *
 * It was the second block of money-core's own `home` page, which retired with the house Home: a record's Home is its
 * use case's `home-<id>` page, else the default Home, which names no list. The founder's
 * Home takes this block by reference (`usecases/founder.ts`), so the window, the columns and the order stay one
 * declaration and cannot drift from each other.
 */
export const DUE_THIS_WEEK: Readonly<Record<string, unknown>> = {
  kind: 'table',
  heading: 'Due this week',
  icon: 'calendar-clock',
  span: 12,
  source: 'register.obligations',
  where: 'state is open or part, due before +8d',
  columns: [
    { field: 'what', label: 'Description', width: 'minmax(14ch,1fr)' },
    { field: 'party', label: 'Who', width: 'minmax(10ch,18ch)' },
    { field: 'amount', label: 'Amount', width: '15ch', align: 'end', sign: { field: 'direction', minus: 'owed_by_me' } },
    { field: 'due', label: 'Due', width: '13ch', align: 'end' },
  ],
  order: [{ field: 'due', dir: 'asc' }],
  limit: 6,
  empty: 'Nothing is due this week.',
};

/**
 * THE SENTENCE A MONEY TILE GOES UNDER: open bills and invoices due in the next thirty days, either way, as the calendar
 * reads them and `due-items-30d` counts them. ONE STRING, so the tile and the figure it is drawn under cannot drift.
 */
export const DUE_30D = `${OPEN}, due after yesterday, due before +31d`;

/**
 * WHAT MOVED, AS A CALM LIST BY DAY, SINCE money-core 3.3.0: the day, what the bank called it, and the amount signed
 * by its own direction, newest first. It was a table of five columns, which is a spreadsheet on the one page everybody
 * reads; which account and what it was for are on the row, a tap away. THE AMOUNT KEEPS EVERY MINOR UNIT, because this
 * is the ledger and a ledger is exact: only a headline drops `.00`.
 */
export const MOVED_COLUMNS = [{ field: 'on' }, { field: 'what' }, { field: 'amount', sign: { field: 'direction', minus: 'out' } }];
