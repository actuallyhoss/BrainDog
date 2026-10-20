/**
 * Coming and going: the next thirty days, as a calendar. The walk of them as arithmetic stays here, but Money places
 * only the heading and the calendar since REC-B23 (money-every-month-92, `money.ts` filters the bridge off): it said
 * again what Cash ahead says.
 */

import { CASH_LEGS } from '../../legs.ts';
import { DUE_30D } from '../shared.ts';

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
       something falls due (`due-items-30d`, the same sentence); what is already late is the two notes above. */
    kind: 'calendar',
    heading: 'Due in the next 30 days',
    icon: 'calendar',
    span: 12,
    source: 'register.obligations',
    where: DUE_30D,
    columns: [{ field: 'what' }, { field: 'due' }, { field: 'amount' }],
    back: 0,
    ahead: 1,
    when: { metric: 'due-items-30d', gt: 0 },
    empty: 'Nothing falls due in the next 30 days.',
  },
];
