/** History: the months behind and what already moved, folded. */

import { MOVED_COLUMNS } from '../shared.ts';

export const HISTORY: Record<string, unknown>[] = [
  {
    /* WHAT ALREADY HAPPENED, FOLDED SHUT, SINCE money-core 3.11.0: the months behind and what moved, a tap away, so
       the page a person reads each morning is what there is, how long it lasts and what is coming. */
    kind: 'section',
    heading: 'History',
    /* A GLYPH THE APP DRAWS ON A FOLDED HEADING, as a project's History and notes wore. */
    icon: 'history',
    span: 12,
    fold: true,
    when: { metric: 'cash-accounts', gt: 0 },
  },
  /* ONE MONTHLY VIEW, SINCE money-core 3.4.0. Where this month's money went and Every month were two more splits of
     what goes out in a month beside the chart under, which draws the same month among its twelve; a person read
     monthly spending three times. What each category takes is on the categories' own list. */
  {
    /* MONTH BY MONTH: what moved in and out in the twelve months to now, read from `transactions`, and what is due in
       the three after, with what was left each month as a line. The current month is so far, and the months ahead
       are what is due once plus what repeats at its monthly share, in every one of them. */
    kind: 'series',
    heading: 'In and out, by month',
    icon: 'chart-column',
    span: 12,
    series: [
      { metric: 'in-by-month', then: 'in-due-by-month', each: 'every-month-in', label: 'Money in' },
      { metric: 'out-by-month', then: 'out-due-by-month', each: 'every-month-out', label: 'Money out', dir: 'out' },
    ],
    back: 12,
    ahead: 3,
    net: true,
    when: { metric: 'out-by-month', gt: 0 },
    empty: 'Nothing moved or due in these months.',
  },
  {
    /* WHAT MOVED, NEWEST FIRST, AS A CALM LIST (`MOVED_COLUMNS`). Twelve, so the page stays a page; the list holds the
       rest, and the block's own link opens it. Drawn once there is an account, whose first payment it waits for. */
    kind: 'timeline',
    heading: 'What moved',
    icon: 'receipt',
    span: 12,
    source: 'register.transactions',
    where: 'state is not void',
    columns: MOVED_COLUMNS,
    order: [{ field: 'on', dir: 'desc' }],
    limit: 12,
    when: { metric: 'cash-accounts', gt: 0 },
    empty: 'Nothing has moved yet. Add what left the bank and this page starts from it.',
  },
];
