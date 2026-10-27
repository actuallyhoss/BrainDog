/** Coming up: what repeats, the bills and the parts of plans, one list by date. */

import type { SeedPage } from '../../base.ts';

/**
 * WHAT FALLS DUE WITH MONEY ON IT, ACROSS EVERY LIST: a bill, a part of a plan, a repeating line on its next day, a
 * renewal where Estate is held. It is what Due soon reads (`source: deadlines`), so this page and Today name the same
 * things, each in its own currency to the cent, signed by the way it goes, and a day already gone says how late it is.
 */
const DUE_WITH_MONEY = 'amount is set';
const DUE_COLUMNS = [
  { field: 'title', label: 'What', width: 'minmax(14ch,1fr)' },
  { field: 'day', label: 'When', width: '14ch' },
  { field: 'amount', label: 'Amount', width: '16ch', align: 'end', sign: { field: 'direction', minus: 'out' } },
];

/**
 * One week of what falls due, the whole row, from the first day to the day before the last, both said from this week's Monday
 * (`bow`). Sixty-one days ahead at most, so the weeks reach as far as the page says.
 */
const week = (heading: string, where: string, empty: string): Record<string, unknown> => ({
  kind: 'table',
  heading,
  icon: 'calendar-days',
  span: 12,
  source: 'deadlines',
  horizon: 61,
  where: `${DUE_WITH_MONEY}, ${where}`,
  columns: DUE_COLUMNS,
  limit: 20,
  empty,
});

/**
 * ONE PAGE UNDER MONEY, SINCE money-core 3.29.0: Money is a section with a page per job, and this is what comes next.
 * The line and the month's figures, the bills to tick off as paid, then the next sixty days, this week, next week and later, and what is
 * paused folded at the foot.
 *
 * MARK PAID IS THE TICK ON A BILL. The bills are a `todo` over the list, so a tick marks one paid where it is read,
 * with its Undo, as a task is finished on Work; every row of the weeks opens its own page, where a bill's one press is
 * Mark paid too.
 */
export const MONEY_COMING_PAGE: SeedPage = {
  page: 'money-coming',
  title: 'Coming up',
  nav: { section: 'Money', order: 14 },
  icon: 'calendar-clock',
  requires: ['register.accounts', 'register.transactions', 'register.recurring', 'register.obligations', 'register.installments'],
  pack: 'money-core',
  blocks: [
    {
      /* THE LINE, FROM THE WALK'S OWN FIGURES: what comes in and goes out in the next thirty days, as Cash ahead counts it. */
      kind: 'note',
      lead: true,
      span: 12,
      body: 'What comes in and goes out next, this week, next week and later, each in its own currency. In the next 30 days {{arriving-30d}} comes in and {{leaving-30d}} goes out.',
    },
    {
      /* WHAT REPEATS AT ITS MONTHLY SHARE, in and out, beside the line's next thirty days. */
      kind: 'stat',
      heading: 'What repeats, a month',
      icon: 'calendar',
      span: 12,
      cells: [
        { metric: 'every-month-in', label: 'Repeats in, a month' },
        { metric: 'every-month-out', label: 'Repeats out, a month' },
      ],
      when: { metric: 'cash-accounts', gt: 0 },
    },
    {
      /* THE BILLS AND INVOICES STILL OPEN IN THE NEXT SIXTY DAYS, A LATE ONE FIRST AND IN THE LATE RED: a `todo`, so a
         tick marks one paid where it is read. */
      kind: 'todo',
      heading: 'Bills and invoices to settle',
      icon: 'receipt',
      span: 12,
      source: 'register.obligations',
      where: 'state is open or part, due before +61d',
      columns: [{ field: 'what' }, { field: 'amount' }, { field: 'due' }, { field: 'party' }],
      order: [{ field: 'due', dir: 'asc' }],
      limit: 12,
      empty: 'No bill or invoice falls due in the next 60 days.',
    },
    /* THE WEEKS, MONDAY TO SUNDAY, EACH THE WHOLE ROW. This week holds what is already late, first and in the late red,
       since the record reads what is overdue before the rest, and a list with something late in it is drawn above the
       figures: two weeks side by side would be parted by it and leave half a row empty. */
    week('This week', 'day before bow+7d', 'Nothing falls due this week.'),
    week('Next week', 'day after bow+6d, day before bow+14d', 'Nothing falls due next week.'),
    week('Later, to 60 days', 'day after bow+13d', 'Nothing else falls due in the next 60 days.'),
    {
      /* WHAT IS PAUSED, FOLDED: a paused line is walked by nothing, so it is nowhere above, and still a line to start again. */
      kind: 'section',
      heading: 'Paused',
      icon: 'pause',
      span: 12,
      fold: true,
    },
    {
      kind: 'table',
      heading: 'Paused lines',
      icon: 'refresh',
      span: 12,
      source: 'register.recurring',
      where: 'state is paused',
      columns: [
        { field: 'what', label: 'Description', width: 'minmax(14ch,1fr)' },
        { field: 'every', label: 'Every', width: '14ch' },
        { field: 'amount', label: 'Amount', width: '16ch', align: 'end' },
      ],
      order: [{ field: 'what', dir: 'asc' }],
      limit: 20,
      empty: 'Nothing that repeats is paused.',
    },
  ],
};
