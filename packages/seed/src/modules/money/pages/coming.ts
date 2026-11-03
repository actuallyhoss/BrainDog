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
 * What falls due in one table by stretch (late first), the next 30 days in two figures, what repeats a month, and what
 * is paused folded at the foot.
 *
 * MARK PAID IS ON THE BILL'S PAGE: every row of the stretches opens its own page, where a bill's one press is Mark paid.
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
      /* NOTHING KEPT THAT FALLS DUE, SINCE money-core 3.36.0 (empty states, 2 Nov): the line below has no figure to say
         then, and the page said "Nothing in Coming up yet. What you add or mention lands here." */
      kind: 'note',
      lead: true,
      span: 12,
      when: { all: [{ metric: 'bills-held', is: 0 }, { metric: 'repeating-held', is: 0 }] },
      body: 'Bills, invoices and payments that repeat are listed here by the day each falls due. [Add a bill](/r/obligations).',
    },
    /* WHAT IS ALREADY LATE, ONCE AND AT THE TOP, BEFORE money-core 3.33.0 SHIPPED (design pass of 1 November, M25): the
       late bills were listed twice, in Bills and invoices and again in Late. Now Late is the first list under the line,
       in the late red, drawn only while something is, and Bills and invoices holds what falls due from today. A late
       row opens its own page, where a bill's one press is Mark paid. SINCE money-core 3.34.0 Late is the first stretch
       of the one table of what falls due (`DUE`). */
    DUE,
    /* NO SECOND LIST OF THE BILLS, SINCE money-core 3.38.4 (moneyseed, 3 Nov): "Bills and invoices" listed every open bill
       and invoice again under What falls due, the same names, days and amounts, with pence in one list and not the other.
       What falls due is the one list; each row opens its page, where a bill's one press is Mark paid. */
    {
      /* THE NEXT 30 DAYS AS FIGURES, SINCE money-core 3.38.4 (moneyseed, 3 Nov): it was the page's line, "Next 30 days:
         £11,490 to come in, £43,047 out in bills and usual spending.", two amounts in a sentence. What comes in and goes out
         in the next thirty days, as Cash ahead counts it; the out is bills and the usual spending (live check of 30
         October, 9), never the repeating bills under it. UNDER
         THE LIST, BESIDE WHAT REPEATS: the page's look leads with what is late (`composeLook` in the kernel), so a tile
         above the list stood over it on a calm day and under it on a late one; at the foot it is in one place. */
      kind: 'stat',
      heading: 'Next 30 days',
      icon: 'calendar-range',
      span: 12,
      cells: [
        { metric: 'arriving-30d', label: 'To come in' },
        { metric: 'leaving-30d', label: 'To go out', note: 'Bills and usual spending' },
      ],
      when: { any: [{ metric: 'bills-held', gt: 0 }, { metric: 'repeating-held', gt: 0 }] },
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
