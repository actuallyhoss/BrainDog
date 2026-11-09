/**
 * What more than one of Money's pages, or a use case's Home, reads: one book's walk, the week's bills, the thirty days'
 * sentence and the columns of what moved. Cut out of `money.ts` with no change.
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
 *
 * FROM TODAY, SINCE founder 2.6.0 (`DUE_WINDOW`). The window had no near edge, so a bill four days late was listed as
 * due this week with nothing but its day to say otherwise. What is already late is `LATE_MONEY`'s, under its own word.
 */
export const DUE_WINDOW = 'state is open or part, due after -1d, due before +8d';

/** THE COLUMNS OF A BILL OR AN INVOICE ON A HOME, one array for what is due and what is late, so the two read alike. */
const OWED_COLUMNS = [
  { field: 'what', label: 'Description', width: 'minmax(14ch,1fr)' },
  { field: 'party', label: 'Who', width: 'minmax(10ch,18ch)' },
  { field: 'amount', label: 'Amount', width: '15ch', align: 'end', sign: { field: 'direction', minus: 'owed_by_me' } },
  { field: 'due', label: 'Due', width: '13ch', align: 'end' },
];

export const DUE_THIS_WEEK: Readonly<Record<string, unknown>> = {
  kind: 'table',
  heading: 'Due this week',
  icon: 'calendar-clock',
  span: 12,
  source: 'register.obligations',
  where: DUE_WINDOW,
  columns: OWED_COLUMNS,
  order: [{ field: 'due', dir: 'asc' }],
  limit: 6,
  empty: 'Nothing is due this week.',
};

/**
 * WHAT IS ALREADY LATE, AS ONE BLOCK A USE CASE'S HOME TAKES BESIDE `DUE_THIS_WEEK`, SINCE founder 2.6.0: every bill
 * and invoice still open or part paid whose day has passed, the oldest first, since that one has waited longest. The
 * two windows meet at today and share no day, so nothing is listed twice and nothing falls between them. The heading
 * is the word that says it is late; no colour is asked to say so alone.
 */
export const LATE_WINDOW = 'state is open or part, due before today';

export const LATE_MONEY: Readonly<Record<string, unknown>> = {
  kind: 'table',
  heading: 'Late',
  icon: 'octagon-alert',
  span: 12,
  source: 'register.obligations',
  where: LATE_WINDOW,
  columns: OWED_COLUMNS,
  order: [{ field: 'due', dir: 'asc' }],
  limit: 6,
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
 *
 * THE SIGN IS HOW A ROW SAYS ITS WAY, AND IT IS THE ONLY PLACE IT CAN. A timeline draws three cells, the day, the name
 * and one detail, so a fourth column for the word would never be drawn: money out reads `−` before its amount and money
 * in reads `+`, from the Ledger's own Which way. `test/money-moved-way.test.ts` holds it on Money and on a book.
 */
export const MOVED_COLUMNS = [{ field: 'on' }, { field: 'what' }, { field: 'amount', sign: { field: 'direction', minus: 'out' } }];

/**
 * WHAT IS HELD BEYOND CASH, AND THE NET WORTH THAT COUNTS IT, WHERE A BALANCE IS READ, SINCE money-core 3.41.0 (9 Nov, the
 * owner: "can you make sure that my investments and stuff also show within my balances and stuff idk"). The gold, the
 * funds, the certificates and the policies an add-on keeps were in net worth (`figures/worth.ts`) and on no page a
 * balance is read on: Money opens on a book's page once there are two books, and net worth was drawn only on Money's
 * home. So the Accounts page and each book's page draw these two cells, one array, in the same words.
 *
 * MONEY'S OWN TWO FIGURES AND NO ADD-ON'S: what is held is read through `held-beyond-cash`, which counts each add-on's part
 * where the add-on is and nothing where it is not, so no cell names a figure nobody declared. DRAWN ONLY WHILE SOMETHING
 * IS HELD BEYOND CASH (`HOLDS_BEYOND_CASH`), so a record that keeps only accounts reads no tile of noughts. No word here
 * says who owes whom, as on every Money page (`money.ts`).
 */
export const HOLDS_BEYOND_CASH: Readonly<Record<string, unknown>> = { metric: 'held-beyond-cash', gt: 0 };
export const BEYOND_CASH_CELLS: readonly Readonly<Record<string, unknown>>[] = [
  { metric: 'held-beyond-cash', label: 'Held beyond cash', note: 'Gold, funds and policies, at what they are worth now' },
  { metric: 'net-worth', label: 'Net worth', note: 'What you have, less what you have to pay' },
];

/**
 * AND THE WAY TO EACH HOLDING, said only where the Holdings add-on holds one: its own count in a `when:`, which never holds
 * on a record without it, as a plan's page says its line to Property (`plan.ts`). No figure of Holdings' is drawn here;
 * what each holding cost and is worth is its page's, Investments and gold.
 */
export const TO_HOLDINGS: Readonly<Record<string, unknown>> = {
  kind: 'note',
  span: 12,
  when: { all: [HOLDS_BEYOND_CASH, { metric: 'holdings-count', gt: 0 }] },
  body: 'Each holding, with what it cost and what it is worth now, is on [Investments and gold](/p/holdings).',
};
