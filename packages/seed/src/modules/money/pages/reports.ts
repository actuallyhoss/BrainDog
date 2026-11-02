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

/** What every figure here leaves out and the Ledger lists, said after the line's figures (finish F55). */
const MOVES_APART = 'Moves between your own accounts are left out.';

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
      /* THE MONTHS PICKED, EACH WAY, AND WHAT IS LEFT OF THEM (live check of 30 October, 20): the line said "This month"
         over a year's donut with All picked, so it says the months the strip picked, All being the thirteen every block
         reads with none picked (`BACK`). Each range's figures are `REPORT_RANGES`' (`figures/health.ts`). */
      kind: 'note',
      lead: true,
      span: 12,
      /* TWO NOTES, ONE FOR THE MONTHS AT HAND AND ONE FOR THE LONGER RANGES, SINCE money-core 3.37.0: each range says it
         plainly when more went out than came in, and a note holds six sentences at most (`SAYS_MOST`). */
      when: { all: [{ metric: 'out-by-month', gt: 0 }, { picked: 'months', is: ['this', 'last', ''] }] },
      /* WITH NONE PICKED, FROM THE DAY THE LINES START (finish F55): "The last 13 months" stood over three months of
         lines, so the line says the first day money moved inside the thirteen (`moved-since`). AND THAT MOVES BETWEEN HIS
         OWN ACCOUNTS ARE LEFT OUT, as every figure here leaves them: the strip's "Last month 9" stood beside the Ledger's
         "Last month 12", which lists them, and neither said why. A RANGE THAT SPENT MORE THAN CAME IN SAYS BY HOW MUCH,
         SINCE money-core 3.37.0 (verify3, 2 Nov): "−$12,536 left" was a minus to work out; it is "$12,536 more out than
         in" (`over-` in `figures/health.ts`). */
      says: [
        { when: { all: [{ picked: 'months', is: 'this' }, { metric: 'left-month', lt: 0 }] }, body: `This month: {{received-month}} in, {{spent-by-category-month}} out, {{over-month}} more out than in. ${MOVES_APART}` },
        { when: { picked: 'months', is: 'this' }, body: `This month: {{received-month}} in, {{spent-by-category-month}} out, {{left-month}} left. ${MOVES_APART}` },
        { when: { all: [{ picked: 'months', is: 'last' }, { metric: 'left-last', lt: 0 }] }, body: `Last month: {{received-last}} in, {{spent-last}} out, {{over-last}} more out than in. ${MOVES_APART}` },
        { when: { picked: 'months', is: 'last' }, body: `Last month: {{received-last}} in, {{spent-last}} out, {{left-last}} left. ${MOVES_APART}` },
        { when: { metric: 'left-all', lt: 0 }, body: `Since {{moved-since}}: {{received-all}} in, {{spent-all}} out, {{over-all}} more out than in. ${MOVES_APART}` },
        { body: `Since {{moved-since}}: {{received-all}} in, {{spent-all}} out, {{left-all}} left. ${MOVES_APART}` },
      ],
    },
    {
      /* THE LONGER RANGES, 3 AND 12 MONTHS, SAID THE SAME WAY. */
      kind: 'note',
      lead: true,
      span: 12,
      when: { all: [{ metric: 'out-by-month', gt: 0 }, { picked: 'months', is: ['three', 'year'] }] },
      says: [
        { when: { all: [{ picked: 'months', is: 'three' }, { metric: 'left-three', lt: 0 }] }, body: `The last 3 months: {{received-three}} in, {{spent-three}} out, {{over-three}} more out than in. ${MOVES_APART}` },
        { when: { picked: 'months', is: 'three' }, body: `The last 3 months: {{received-three}} in, {{spent-three}} out, {{left-three}} left. ${MOVES_APART}` },
        { when: { all: [{ picked: 'months', is: 'year' }, { metric: 'left-year', lt: 0 }] }, body: `The last 12 months: {{received-year}} in, {{spent-year}} out, {{over-year}} more out than in. ${MOVES_APART}` },
        { body: `The last 12 months: {{received-year}} in, {{spent-year}} out, {{left-year}} left. ${MOVES_APART}` },
      ],
    },
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
      /* WHAT IS ALREADY PROMISED, IN ONE PLAIN LINE UNDER HEALTH (round 1030): repeating bills and instalments as a share
         of what comes in each month, with what it means past half, where one missed pay day leaves a month short. EACH PART
         NAMED, SINCE money-core 3.32.0 (recheck of 30 October, N7): the sum read £11,317 beside Coming up's repeating out
         of £10,692, which is the bills alone, with nothing saying the instalments were the difference. */
      kind: 'note',
      span: 12,
      says: [
        {
          /* PAST ALL OF IT THE TWO AMOUNTS SAY IT, and not a share past a hundred. */
          when: { metric: 'spoken-for-share', gt: 1 },
          body: 'Repeating bills ({{every-month-out}}) and instalments ({{installments-a-month}}) come to {{spoken-for-month}} a month, more than the {{received-a-month}} a month that came in over the last three months.',
        },
        {
          when: { metric: 'spoken-for-share', gt: 0.5 },
          body: 'Repeating bills and instalments take {{spoken-for-share}} of what comes in each month, more than half, so one missed pay day leaves a month short.',
        },
        { body: 'Repeating bills and instalments take {{spoken-for-share}} of what comes in each month.' },
      ],
      /* NOT SAID UNTIL THE THREE MONTHS ARE THERE (`received-three-months-back`), so a new Ledger is not told a share of
         one month read as three. */
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
