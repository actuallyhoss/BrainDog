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
 * WHAT FALLS DUE, ONE TABLE IN FOUR STRETCHES, SINCE money-core 3.34.0 (next-money, M17): Late, the next 7 days, the 7
 * days after them and later were four tables, each saying "What When Amount" over its own rows. Now they are one table
 * grouped by the stretch each day is in (`group: when`, `sources/deadlines.ts`), a heading each, in that order, and a
 * stretch with nothing in it has no heading. Sixty-one days ahead at most. THE STRETCHES ARE COUNTED FROM TODAY, as
 * since money-core 3.32.0, so the next fourteen days are the ones Money's home and Today call Coming up
 * (`COMING_UP_WHERE`, `parts/next30.ts`). What is late is red in its row, and comes first.
 */
const DUE: Record<string, unknown> = {
  kind: 'table',
  heading: 'What falls due',
  icon: 'calendar-days',
  span: 12,
  source: 'deadlines',
  horizon: 61,
  where: DUE_WITH_MONEY,
  group: 'when',
  columns: DUE_COLUMNS,
  limit: 60,
  empty: 'Nothing falls due in 60 days.',
};

/**
 * ONE PAGE UNDER MONEY, SINCE money-core 3.29.0: Money is a section with a page per job, and this is what comes next.
 * The line, what falls due in one table by stretch (late first), the bills to tick off as paid, what repeats a month, and
 * what is paused folded at the foot.
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
       row opens its own page, where a bill's one press is Mark paid. SINCE money-core 3.34.0 Late is the first stretch
       of the one table of what falls due (`DUE`). */
    DUE,
    {
      /* THE BILLS AND INVOICES STILL OPEN FROM TODAY TO SIXTY DAYS ON: a `todo`, so a tick marks one paid where it is
         read. What is already late is the first stretch above, and not listed here again. */
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
    {
      /* WHAT REPEATS AT ITS MONTHLY SHARE, in, out and what is left, AT THE FOOT SINCE money-core 3.34.0 (next-money,
         M16): it stood between what is late and the bills, three figures about a month in the middle of a list by day.
         Below nought "Left over" is red: the block's tone is bad, so a figure off its line (`every-month-net` keeps to
         nought or more) is drawn in the danger colour, with its minus. */
      kind: 'stat',
      heading: 'Repeating, a month',
      icon: 'calendar',
      span: 12,
      tone: 'bad',
      cells: [
        /* NAMED FOR WHAT EACH HOLDS (live check of 30 October, 9): "Out" read as the hero's thirty days out. */
        { metric: 'every-month-in', label: 'Repeating in' },
        { metric: 'every-month-out', label: 'Repeating bills' },
        { metric: 'every-month-net', label: 'Left over' },
      ],
      when: { metric: 'cash-accounts', gt: 0 },
    },
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
