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
 * One stretch of what falls due, the whole row. Sixty-one days ahead at most, so the stretches reach as far as the page
 * says. SINCE money-core 3.32.0 THE STRETCHES ARE COUNTED FROM TODAY, not from Monday: the next seven days and the seven
 * after them are the fourteen Money's home and Today call Coming up (`COMING_UP_WHERE`, `parts/next30.ts`), so the two
 * add up to the count those say, and what is already late is its own list first.
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
 * The line, what is late, the month's figures, the bills to tick off as paid, then the next sixty days, this week, next week and later, and what is
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
      /* AND WHAT THE OUT HOLDS (live check of 30 October, 9): bills and the usual spending, never the repeating bills below. */
      body: 'Next 30 days: {{arriving-30d}} to come in, {{leaving-30d}} out in bills and usual spending.',
    },
    /* WHAT IS ALREADY LATE, ONCE AND AT THE TOP, BEFORE money-core 3.33.0 SHIPPED (design pass of 1 November, M25): the
       late bills were listed twice, in Bills and invoices and again in Late. Now Late is the first list under the line,
       in the late red, drawn only while something is, and Bills and invoices holds what falls due from today. A late
       row opens its own page, where a bill's one press is Mark paid. */
    week('Late', 'day before today', 'Nothing is late.'),
    {
      /* WHAT REPEATS AT ITS MONTHLY SHARE, in, out and what is left, beside the line's next thirty days. */
      kind: 'stat',
      heading: 'Repeating, a month',
      icon: 'calendar',
      span: 12,
      cells: [
        /* NAMED FOR WHAT EACH HOLDS (live check of 30 October, 9): "Out" read as the hero's thirty days out. */
        { metric: 'every-month-in', label: 'Repeating in' },
        { metric: 'every-month-out', label: 'Repeating bills' },
        { metric: 'every-month-net', label: 'Left over' },
      ],
      when: { metric: 'cash-accounts', gt: 0 },
    },
    {
      /* THE BILLS AND INVOICES STILL OPEN FROM TODAY TO SIXTY DAYS ON: a `todo`, so a tick marks one paid where it is
         read. What is already late is Late's, above, and not listed here again. */
      kind: 'todo',
      heading: 'Bills and invoices',
      icon: 'receipt',
      span: 12,
      source: 'register.obligations',
      where: 'state is open or part, due after -1d, due before +61d',
      /* SIGNED BY THE WAY IT GOES (30 October), as every money line in the Money look: a bill you pay is "−", an invoice
         you are owed "+". */
      columns: [{ field: 'what' }, { field: 'amount', sign: { field: 'direction', minus: 'owed_by_me' } }, { field: 'due' }, { field: 'party' }],
      order: [{ field: 'due', dir: 'asc' }],
      limit: 12,
      empty: 'Nothing due in 60 days.',
    },
    week('Next 7 days', 'day after -1d, day before +7d', 'Nothing falls due in the next 7 days.'),
    week('The 7 days after', 'day after +6d, day before +14d', 'Nothing falls due in the 7 days after.'),
    week('Later', 'day after +13d', 'Nothing else due in 60 days.'),
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
      empty: 'Nothing paused.',
    },
  ],
};
