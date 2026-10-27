/**
 * Coming and going: the next thirty days, as a calendar. The walk of them as arithmetic stays here, but Money places
 * only the heading and the calendar since REC-B23 (money-every-month-92, `money.ts` filters the bridge off): it said
 * again what Cash ahead says.
 */

import { CASH_LEGS } from '../../legs.ts';

export const NEXT_30: Record<string, unknown>[] = [
  {
    /* WHAT COMES IN AND GOES OUT, OPEN, SINCE money-core 3.11.0: the month ahead, what is paid in parts and what is
       being chased are what a person plans the next weeks by, so they are on the page. From 3.4.0 to 3.10.0
       everything after Accounts was folded shut ("i dont want a very 'busy' looking ui", October 2nd), and a page
       whose walk said when the money runs out hid the bills that make it run out. What already happened is still
       folded, under History.

       ONE TILE, its blocks parts of one surface under its heading (`box`), as Heads up is, so an open section is not
       a heading drawn as a tile of its own over four more. */
    kind: 'section',
    heading: 'Coming and going',
    icon: 'calendar',
    span: 12,
    box: true,
    /* ONCE THERE IS AN ACCOUNT, as every walk and list under it is: a fresh record reads no heading over nothing. */
    when: { metric: 'cash-accounts', gt: 0 },
  },
  {
    /* THE NEXT THIRTY DAYS AS ARITHMETIC: cash now, plus what arrives, less what leaves, and where that lands. It
       walks what Cash ahead walks, over a shorter horizon, and it is the same array, so a leg in one and not the
       other cannot become two answers about the same thirty days.

       NO HEADING OF ITS OWN, SINCE money-core 3.13.0 (the second design review's fix 8). It is the first thing under
       Coming and going, so the tile opened on two headings, each with its glyph, one straight over the other. The
       walk says what it is in its own rows, Coming in, Going out and In 30 days, under the one heading that names
       them.

       NOT PLACED ON MONEY SINCE REC-B23 (money-every-month-92): `money.ts` filters it off, and the calendar opens
       Coming and going. */
    kind: 'bridge',
    span: 12,
    source: 'forecast.runway',
    opening: { metric: 'cash-now' },
    from: CASH_LEGS,
    horizon: 30,
    when: { metric: 'cash-accounts', gt: 0 },
    empty: 'Nothing dated in the next 30 days.',
  },
  {
    /* WHAT FALLS DUE IN THE NEXT THIRTY DAYS, ON THE DAYS IT FALLS, SINCE money-core 3.3.0: a calendar of the month
       ahead where a table of twelve rows was, each bill and invoice named as the record names it on its day, and an
       agenda of the days under it. This month and the next, because thirty days from today cross into it. Only while
       something falls due (`due-items-30d`, the same sentence); what is already late is the two notes above.

       NO HEADING OF ITS OWN, SINCE money-core 3.21.0 (the audit of 25 October, Z18), for the reason the walk above lost
       its own in 3.13.0: on Money it opens Coming and going, and the tile read two headings, each with its glyph, one
       straight over the other. The month it draws says which days it is.

       EVERY LIST'S MONEY, SINCE money-core 3.21.0 (the audit of 25 October, Z14): it read Bills and invoices alone, so on
       his record it marked one premium while Today's Due soon named the premium and a salary coming in. Now it reads what
       falls due across every list, as Due soon does (`source: deadlines`), with money on it, and what the cash walk
       moves: a repeating line and a part of a plan as well as a bill, a bill that repeats once, on its line. Drawn
       once there is an account, as the box round it is, and a month with nothing in it is not drawn. */
    kind: 'calendar',
    span: 12,
    source: 'deadlines',
    where: 'amount is set, day after yesterday, day before +31d',
    /* THE AMOUNT SIGNED BY THE WAY IT GOES, as the Ledger beside it says it: "−£19,100.00" for a bill, "+£960.00" for an invoice. */
    columns: [{ field: 'title' }, { field: 'day' }, { field: 'amount', sign: { field: 'direction', minus: 'out' } }],
    back: 0,
    ahead: 1,
    when: { metric: 'cash-accounts', gt: 0 },
    empty: 'Nothing falls due in the next 30 days.',
  },
];

/** How far ahead Money's home looks for what falls due: the month ahead and the next, so a plan's next part is in reach. */
export const COMING_UP_DAYS = 60;

/** How many things the home's Coming up draws. The Coming up page holds the rest. */
export const COMING_UP_LINES = 6;

/**
 * COMING UP, ON MONEY'S HOME SINCE money-core 3.29.0: the next few things that move money, a bill, a repeating line, a
 * part of a plan or money owed in, late first and then by day, each with its amount signed by the way it goes. It takes
 * the place of the month's calendar, which with every month after it is the Coming up page's, so the home reads the
 * next six things and not a grid of thirty days. A phone reads it first under the hero, so a late bill is the first thing
 * under the cash.
 *
 * EVERY LIST'S MONEY, as the calendar read it (`source: deadlines`, overdue first): only what carries an amount, so a
 * task with a day is not money coming up. Late by a month at most: what is later than that is Heads up's to say, as a
 * total with its way to act, and six bills months old would fill the tile with nothing coming. Two months ahead, so a
 * plan whose next part is six weeks off is still named.
 * Once there is an account, as everything under the hero is; a record with nothing dated draws no tile.
 */
export const COMING_UP: Record<string, unknown>[] = [
  {
    kind: 'timeline',
    heading: 'Coming up',
    icon: 'calendar',
    source: 'deadlines',
    where: 'amount is set, day after -31d',
    horizon: COMING_UP_DAYS,
    columns: [{ field: 'day' }, { field: 'title' }, { field: 'amount', sign: { field: 'direction', minus: 'out' } }],
    limit: COMING_UP_LINES,
    when: { metric: 'cash-accounts', gt: 0 },
    empty: 'Nothing falls due in the next two months.',
  },
];
