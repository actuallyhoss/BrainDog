/** Reports: money in and out by month, spending by category and who was paid most. */

import type { SeedPage } from '../../base.ts';
import { WHERE_IT_WENT } from './parts/where-it-went.ts';

/** What moved, as every figure of the Ledger counts it: cleared and not between a person's own accounts. */
const MOVED = 'state is cleared, transfer is false, stays is not true, corrects is not true';

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

/** What every figure here leaves out and the Ledger lists, said under the money out (finish F55). */
const MOVES_APART = 'Moves between your accounts left out';

/** The most a block over the Ledger reads, with no month picked: the thirteen the chart of months reads. */
const BACK = 'on after -13m, on before +1d';

/** Reports' Health tile, drawn with its "In other currencies" cell only while some cash is in another currency. */
const HEALTH = { kind: 'stat', heading: 'Health', icon: 'heart-pulse', span: 12 };
/**
 * HOW LONG IT LASTS AND WHAT WAS KEPT, SINCE money-core 3.34.0 (next-money, M25, M26): four figures in a grid, two of them
 * the 30 days spent and received that the Ledger heads its page with, and the kept rate's "At least 20%" in grey under a
 * −43.9% drawn in amber. Now the two figures this page alone says, the kept rate's line said as a sentence, and below
 * nought the kept rate is red: the tile's tone is bad only while it is, so a rate between nought and a fifth stays amber.
 */
const KEPT = { metric: 'kept-share-90d', label: 'Kept, 90 days', note: 'Keep at least a fifth of what comes in' };
const LASTS_CELL = { metric: 'lasts-no-income', label: 'Lasts with no income' };
const HEALTH_CELLS = [KEPT, LASTS_CELL];
const KEPT_BELOW_NOUGHT = { metric: 'kept-share-90d', lt: 0 };
const KEPT_NOUGHT_OR_MORE = { any: [{ metric: 'kept-share-90d', gte: 0 }, { metric: 'kept-share-90d', empty: true }] };

/**
 * THE MONTHS PICKED IN THREE FIGURES, SINCE money-core 3.38.4 (moneyseed, 3 Nov): the page opened on a sentence of them
 * ("Since 8 Jun: £10,966 in, £18,605 out, £7,639 more out than in. Moves between your own accounts are left out."). Now
 * a tile: In, Out, and Left, or More out than in when more went out (3.37.0's words, so no minus to work out). The strip
 * above names the months picked, so the tile does not say them again; with none picked the In cell says the day the lines
 * start (`moved-since`, finish F55). Each range's figures are `REPORT_RANGES`' (`figures/health.ts`). A range with
 * nothing in drops its "£0" cell on its own (`noughtOverNone`). Ten tiles, one drawn: a range and which way it went.
 */
const RANGES = [
  { picked: 'this', inn: 'received-month', out: 'spent-by-category-month', left: 'left-month', over: 'over-month' },
  { picked: 'last', inn: 'received-last', out: 'spent-last', left: 'left-last', over: 'over-last' },
  { picked: '', inn: 'received-all', out: 'spent-all', left: 'left-all', over: 'over-all', since: true },
  { picked: 'three', inn: 'received-three', out: 'spent-three', left: 'left-three', over: 'over-three' },
  { picked: 'year', inn: 'received-year', out: 'spent-year', left: 'left-year', over: 'over-year' },
] as const;

const RANGE_TOTALS: Record<string, unknown>[] = RANGES.flatMap((r) => {
  const picked = { picked: 'months', is: r.picked === '' ? [''] : r.picked };
  const cells = [
    { metric: r.inn, label: 'In', ...('since' in r ? { note: 'Since {{moved-since}}' } : {}) },
    { metric: r.out, label: 'Out', note: MOVES_APART },
  ];
  const tile = { kind: 'stat', heading: 'Totals', icon: 'coins', span: 12 };
  return [
    { ...tile, cells: [...cells, { metric: r.left, label: 'Left' }], when: { all: [{ metric: 'out-by-month', gt: 0 }, picked, { any: [{ metric: r.left, gte: 0 }, { metric: r.left, empty: true }] }] } },
    { ...tile, cells: [...cells, { metric: r.over, label: 'More out than in' }], when: { all: [{ metric: 'out-by-month', gt: 0 }, picked, { metric: r.left, lt: 0 }] } },
  ];
});

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
    ...RANGE_TOTALS,
    {
      /* NOTHING MOVED YET: what the page will hold, in place of noughts. */
      kind: 'note',
      lead: true,
      span: 12,
      when: { metric: 'out-by-month', lt: 1 },
      /* AND HOW IT FILLS, SINCE money-core 3.36.0 (empty states, 2 Nov): "Nothing has moved yet." said what was missing
         and not what would come, over a strip of noughts. */
      says: [
        { when: { metric: 'cash-accounts', is: 0 }, body: 'Where your money goes, month by month, shows here once an account brings payments in. [Add an account](/p/money).' },
        { body: 'Nothing has moved yet. Where your money goes, month by month, shows here as payments reach the [Ledger](/p/money-ledger).' },
      ],
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
      empty: 'Nothing moved.',
    },
    {
      /* HOW THE QUARTER WENT: what was kept of what came in, and the last thirty days in and out; how long the cash lasts
         with nothing coming in, and how much of it is in other currencies. No note says "against the 30 days before": a
         tile draws no change, so it named a comparison the tile never showed. */
      ...HEALTH,
      cells: [...HEALTH_CELLS, { metric: 'cash-foreign-share', label: 'In other currencies' }],
      when: { all: [{ metric: 'out-by-month', gt: 0 }, { metric: 'cash-foreign-share', gt: 0 }] },
    },
    {
      /* AND KEPT BELOW NOUGHT, IN THE DANGER COLOUR (next-money, M25): more went out than came in over the quarter. */
      ...HEALTH,
      tone: 'bad',
      cells: HEALTH_CELLS,
      when: { all: [{ metric: 'out-by-month', gt: 0 }, { any: [{ metric: 'cash-foreign-share', lte: 0 }, { metric: 'cash-foreign-share', empty: true }] }, KEPT_BELOW_NOUGHT] },
    },
    {
      /* AND WITH NOTHING IN ANOTHER CURRENCY, NO "In other currencies 0%", BEFORE money-core 3.33.0 SHIPPED (design pass
         of 1 November, M24): a share of nothing is no figure. The same tile, its last cell left off. */
      ...HEALTH,
      cells: HEALTH_CELLS,
      when: { all: [{ metric: 'out-by-month', gt: 0 }, { any: [{ metric: 'cash-foreign-share', lte: 0 }, { metric: 'cash-foreign-share', empty: true }] }, KEPT_NOUGHT_OR_MORE] },
    },
    {
      /* WHAT IS ALREADY PROMISED A MONTH, AS FIGURES, SINCE money-core 3.38.4 (moneyseed, 3 Nov): it was a sentence of four
         amounts under Health ("Repeating bills (£10,692) and instalments (£625) come to £11,317 a month, more than the
         £3,655 a month that came in"). Now a tile: what repeating bills and instalments take a month together, what came in
         a month over the last three, and the share, amber past half (`spoken-for-share`'s mark). NOT SAID UNTIL THE THREE
         MONTHS ARE THERE (`received-three-months-back`), so a new Ledger is not told a share of one month read as three. */
      kind: 'stat',
      heading: 'Promised each month',
      icon: 'calendar-clock',
      span: 12,
      cells: [
        { metric: 'spoken-for-month', label: 'Bills and instalments', note: 'Repeating, a month' },
        { metric: 'received-a-month', label: 'Came in', note: 'A month, over the last 3' },
        { metric: 'spoken-for-share', label: 'Share of what comes in', note: 'Half or less is safe' },
      ],
      when: { all: [{ metric: 'spoken-for-share', gt: 0 }, { metric: 'received-three-months-back', gt: 0 }] },
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
      /* SIX PARTS AND EVERYTHING ELSE, SINCE money-core 3.38.0 (ui2 money, F9): thirteen categories drew thirteen hues
         round one ring, past the seven a ring keeps apart. The six largest, the rest as one part, as Paid most does.
         SEVEN PARTS, SINCE money-core 3.38.1 (verify5, 2 Nov): `limit` counts Everything else among its parts, so 6 drew
         five categories and the rest. */
      limit: 7,
      when: { metric: 'out-by-month', gt: 0 },
      empty: 'Nothing went out.',
    },
    {
      /* WHO WAS PAID MOST, IN THE MONTHS PICKED. Each bar opens that payee's entries. EVERY LINE TO THEM (live check of
         30 October, 10): a line no payee was put on counts under the payee its bank line names (`or: what`), so Ahmed
         Emad is the sum of his lines, not the one line that named him. */
      kind: 'bar',
      heading: 'Paid most',
      icon: 'store',
      span: 12,
      source: 'register.transactions',
      where: `${MOVED}, direction is out, ${BACK}`,
      columns: [{ field: 'payee', or: 'what' }, { field: 'amount' }],
      unset: 'Not named yet',
      limit: 10,
      when: { metric: 'out-by-month', gt: 0 },
      empty: 'Nobody was paid.',
    },
    {
      /* WHERE THE MONEY CAME FROM, IN THE MONTHS PICKED, by who paid it in. */
      kind: 'bar',
      heading: 'Money in, by who paid',
      icon: 'hand-coins',
      span: 12,
      source: 'register.transactions',
      where: `${MOVED}, direction is in, ${BACK}`,
      columns: [{ field: 'payee', or: 'what' }, { field: 'amount' }],
      unset: 'Not named yet',
      limit: 8,
      when: { metric: 'in-by-month', gt: 0 },
      empty: 'Nothing came in.',
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
      empty: 'No categories yet.',
    },
    /* WHERE IT WENT, FOLDED AT THE END since money-core 3.29.0 gave Money's home a board of tiles: this month by category,
       and who was paid in what nobody has filed, the bar that says where filing starts. */
    ...WHERE_IT_WENT,
  ],
};
