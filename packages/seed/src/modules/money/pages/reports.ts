/** Reports: money in and out by month, spending by category and who was paid most. */

import type { SeedPage } from '../../base.ts';

/** What moved, as every figure of the Ledger counts it: cleared and not between a person's own accounts. */
const MOVED = 'state is cleared, transfer is false';

/**
 * THE MONTHS A PERSON PICKS, as one strip over the page: this month, last month, three months or a year. Each is a
 * sentence over `on`, so it narrows every block over the Ledger and leaves the chart of months whole, which is already
 * month by month. "All" is the strip's own first choice and reads the thirteen months each block reads at most.
 */
const MONTH_PICKER = {
  field: 'months',
  control: 'segmented',
  options: [
    { value: 'this', label: 'This month', where: 'on at least bom' },
    { value: 'last', label: 'Last month', where: 'on at least bom-1m, on before bom' },
    { value: 'three', label: '3 months', where: 'on at least bom-2m' },
    { value: 'year', label: '12 months', where: 'on at least bom-11m' },
  ],
};

/** The most a block over the Ledger reads, with no month picked: the thirteen the chart of months reads. */
const BACK = 'on after -13m, on before +1d';

/**
 * ONE PAGE UNDER MONEY, SINCE money-core 3.29.0: where the money came from and where it went.
 *
 * MONTH BY MONTH FIRST: money in above the line and money out below it, twelve months back, with what was left each
 * month as a line (`in-by-month`, `out-by-month`, `figures/flow.ts`). Then how healthy the quarter was, then the month
 * picked: spending by category as shares of one track in each category's own colour, the payees paid most, and who
 * paid in.
 *
 * EVERY SUM OVER THE LEDGER IS ADDED UP WHERE IT IS DRAWN, so a part in two currencies is two amounts and never one, as
 * the bars on Money are.
 *
 * SPENDING STAYS INK: no part of a split or a bar of money out is drawn in the colour of a missed target, since spending
 * is not a fault. Green is for money in.
 */
export const MONEY_REPORTS_PAGE: SeedPage = {
  page: 'money-reports',
  title: 'Reports',
  nav: { section: 'Money', order: 16 },
  icon: 'chart-pie',
  requires: ['register.transactions', 'register.categories'],
  pack: 'money-core',
  filters: [MONTH_PICKER],
  blocks: [
    {
      /* THE MONTH SO FAR, EACH WAY, AND WHAT IS LEFT OF IT. */
      kind: 'note',
      lead: true,
      span: 12,
      when: { metric: 'out-by-month', gt: 0 },
      body: 'This month so far {{received-month}} came in and {{spent-by-category-month}} went out, so {{left-month}} is left over.',
    },
    {
      /* NOTHING MOVED YET: what the page will hold, in place of noughts. */
      kind: 'note',
      lead: true,
      span: 12,
      when: { metric: 'out-by-month', lt: 1 },
      body: 'Nothing has moved yet. Once the Ledger holds a month, this page reads it month by month.',
    },
    {
      /* TWELVE MONTHS, EACH WAY, AND WHAT WAS LEFT. No months ahead: Forecast is where the months ahead are read. */
      kind: 'series',
      heading: 'In and out, by month',
      icon: 'chart-column',
      span: 12,
      series: [
        { metric: 'in-by-month', label: 'Money in' },
        { metric: 'out-by-month', label: 'Money out', dir: 'out' },
      ],
      back: 12,
      net: true,
      when: { metric: 'out-by-month', gt: 0 },
      empty: 'Nothing moved in these months.',
    },
    {
      /* HOW THE QUARTER WENT: what was kept of what came in, and what went out against the month before; how long the
         cash lasts with nothing coming in, and how much of it is in other currencies. */
      kind: 'stat',
      heading: 'Health',
      icon: 'heart-pulse',
      span: 12,
      cells: [
        { metric: 'kept-share-90d', label: 'Kept of money in', note: 'The last 90 days, after everything that went out' },
        { metric: 'spent-30d', label: 'Spent, 30 days', note: 'Against the 30 days before' },
        { metric: 'received-30d', label: 'Came in, 30 days', note: 'Against the 30 days before' },
        { metric: 'lasts-no-income', label: 'Lasts with no income', note: 'Cash now, spent at the pace it goes out' },
        { metric: 'cash-foreign-share', label: 'In other currencies', note: 'Of cash now, at the rates you hold' },
      ],
      when: { metric: 'out-by-month', gt: 0 },
    },
    {
      /* SPENDING BY CATEGORY, IN THE MONTHS PICKED, one part a category in its own colour, with what nobody filed named
         and never left out. */
      kind: 'split',
      heading: 'Spending by category',
      donut: true,
      icon: 'chart-pie',
      span: 12,
      source: 'register.transactions',
      where: `${MOVED}, direction is out, ${BACK}`,
      columns: [{ field: 'category' }, { field: 'amount' }],
      unset: 'No category yet',
      when: { metric: 'out-by-month', gt: 0 },
      empty: 'Nothing went out in these months.',
    },
    {
      /* WHO WAS PAID MOST, IN THE MONTHS PICKED. Each bar opens that payee's entries. */
      kind: 'bar',
      heading: 'Paid most',
      icon: 'store',
      span: 12,
      source: 'register.transactions',
      where: `${MOVED}, direction is out, ${BACK}`,
      columns: [{ field: 'payee' }, { field: 'amount' }],
      unset: 'No name yet',
      limit: 10,
      when: { metric: 'out-by-month', gt: 0 },
      empty: 'Nobody was paid in these months.',
    },
    {
      /* WHERE THE MONEY CAME FROM, IN THE MONTHS PICKED, by who paid it in. */
      kind: 'bar',
      heading: 'Money in, by who paid',
      icon: 'hand-coins',
      span: 12,
      source: 'register.transactions',
      where: `${MOVED}, direction is in, ${BACK}`,
      columns: [{ field: 'payee' }, { field: 'amount' }],
      unset: 'No name yet',
      limit: 8,
      when: { metric: 'in-by-month', gt: 0 },
      empty: 'Nothing came in in these months.',
    },
    {
      /* THIS MONTH SO FAR AGAINST LAST MONTH TO THE SAME DAY, ONE BAR A CATEGORY: what moved, read from one figure that
         holds both months (`spent-vs-last-month`). Folded under its own heading, so the six tiles before it stay six. */
      kind: 'section',
      heading: 'Against last month',
      icon: 'history',
      span: 12,
      fold: true,
      when: { metric: 'spent-by-category-month', gt: 0 },
    },
    {
      kind: 'bar',
      heading: 'This month against last, by category',
      icon: 'chart-bar',
      span: 12,
      source: 'metric.spent-vs-last-month',
      unset: 'No category',
      when: { metric: 'spent-by-category-month', gt: 0 },
      empty: 'Nothing spent this month or last has a category yet.',
    },
  ],
};
