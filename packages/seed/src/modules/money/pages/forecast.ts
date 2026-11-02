/** Forecast: the cash walk ahead, its lowest point and what moves it. */

import type { SeedPage } from '../../base.ts';
import { FORECAST } from './parts/forecast.ts';
import { INSTALMENTS } from './parts/instalments.ts';

/**
 * CASH AHEAD AS THE PAGE'S ONE ANSWER: the walk Money draws (`parts/forecast.ts`, the legs every walk reads), opening on
 * the same twelve weeks Money and Today read their lowest over, with six months and a year a press away up front and To
 * the end after them. The renderer says the cash at the horizon, the lowest point and what took it there, and everyday
 * spending at its three-month average over the chart, marks every salary, premium and part of a plan on the line and
 * lists them under it, and asks "If income stopped" beside the lengths (`packages/render/src/forecast.ts`).
 *
 * TWELVE WEEKS FIRST (finish F50): the page opened on three months and said "Lowest −£22,628 on 1 Dec" while Money and
 * Today said "Lowest in the next 12 weeks: −£16,213 on 7 Nov", two lowests of one walk. One window, one lowest.
 *
 * `headline: under` KEPT (finish F50): the page's line now says the day the chart goes under, as Money's Lasts does, so
 * the chart does not say it again. The line said only how long the money lasts with nothing coming in, "22 Sep", over a
 * chart that says income comes in and goes under on "30 Oct".
 */
const CASH_AHEAD: Record<string, unknown> = {
  ...FORECAST[0]!,
  horizon: 84,
  horizons: [84, 183, 365, 'last'],
};

/**
 * THE PAGE'S LINE LEADS WITH THE CASE THE CHART DRAWS (finish F50): what is due and expected, the day it goes under, as
 * Money's hero says it ("Lasts 30 Oct"), then how long it lasts with nothing coming in. While it lasts the year on what is
 * due, the line says so, as Money's does (`HEADLINE_LASTS`). Below nought the chart opens under, and Money's Runs out says
 * that, so the line says only how long it would last with nothing coming in, which reads nothing there.
 */
const NOTHING_IN = 'With nothing coming in it lasts to {{lasts-no-income.on}}.';
const LINES: Record<string, unknown>[] = [
  {
    /* NO ACCOUNT, NO WALK, SINCE money-core 3.36.0 (empty states, 2 Nov): Cash ahead waits for one (`cash-accounts`), and
       the page said "Nothing in Forecast yet. What you add or mention lands here." */
    kind: 'note',
    lead: true,
    span: 12,
    when: { metric: 'cash-accounts', is: 0 },
    body: 'Where your cash is heading is drawn here, week by week, once Money has an account. [Add an account](/p/money).',
  },
  {
    kind: 'note',
    lead: true,
    span: 12,
    when: { all: [{ metric: 'cash-now', gte: 0 }, { metric: 'runway-days', beyond: false }] },
    body: `Cash lasts to {{runs-out-on}} on what is due and expected. ${NOTHING_IN}`,
  },
  {
    kind: 'note',
    lead: true,
    span: 12,
    when: { all: [{ metric: 'cash-now', gte: 0 }, { metric: 'runway-days', beyond: true }] },
    body: `Cash lasts the year on what is due and expected. ${NOTHING_IN}`,
  },
];

/**
 * ONE PAGE UNDER MONEY, SINCE money-core 3.29.0: Money is a section with a page per job, and this is the walk ahead.
 * The line, the walk, then what it is made of: each month ahead in and out, the parts of plans still to pay, and the
 * lines that repeat. Every figure is the one walk's (`metric.in-ahead-by-month`, `metric.out-ahead-by-month`,
 * `metric.lasts-no-income`), so the chart, the months and the line cannot say two things.
 */
export const MONEY_FORECAST_PAGE: SeedPage = {
  page: 'money-forecast',
  title: 'Forecast',
  nav: { section: 'Money', order: 15 },
  icon: 'chart-line',
  requires: ['register.accounts', 'register.obligations', 'register.transactions', 'register.recurring', 'register.installments'],
  pack: 'money-core',
  blocks: [
    ...LINES,
    CASH_AHEAD,
    {
      /* EACH MONTH AHEAD, IN AND OUT, AS THE WALK MOVES IT: this month so far and what the walk still moves in it, then
         the three after, with what is left each month as a line. The months ahead are `in-ahead-by-month` and
         `out-ahead-by-month`, the steps of the chart above cut by month, so a part of a plan is in its month's bar. */
      kind: 'series',
      heading: 'In and out, by month ahead',
      icon: 'chart-column',
      span: 12,
      series: [
        { metric: 'in-by-month', then: 'in-ahead-by-month', label: 'Money in' },
        { metric: 'out-by-month', then: 'out-ahead-by-month', label: 'Money out', dir: 'out' },
      ],
      back: 1,
      ahead: 3,
      net: true,
      when: { metric: 'cash-accounts', gt: 0 },
      empty: 'Nothing dated ahead yet.',
    },
    {
      /* WHAT IS BEING PAID IN PARTS, ONE ROW A PLAN, SINCE money-core 3.34.0 (next-money, M23): nine rows of "Laptop for
         Pocketlab, 4 of 12" to "12 of 12", each the same plan on another month. Now each plan is one track, as Money's
         Instalments tile draws it (`parts/instalments.ts`): the parts paid of all of them, what is next and on which day,
         and the plan's name opens its own page, where every part is listed. */
      ...INSTALMENTS[0]!,
      span: 12,
    },
    {
      /* WHAT REPEATS, EACH LINE ONCE WITH HOW OFTEN AND WHEN IT NEXT LANDS: the dots on the chart that come round. A
         paused line is not walked, so it is not here either. THE WHOLE ROW, as the instalments are: four columns need
         two thirds of it, and a list with something late in it is read first, so two halves would not stay paired. */
      kind: 'table',
      heading: 'What repeats',
      icon: 'refresh',
      span: 12,
      source: 'register.recurring',
      where: 'state is live',
      columns: [
        { field: 'what', label: 'Description', width: 'minmax(14ch,1fr)' },
        { field: 'every', label: 'Every', width: '12ch' },
        /* AS WIDE AS ITS WORDS, SINCE money-core 3.34.0 (next-money, M22): at 12ch "Due in 11 days" was cut to "Due in
           11 da…" at every desk width. The description takes what is left. */
        { field: 'next_due', label: 'Next', width: 'max-content', align: 'end' },
        /* SIGNED BY THE WAY IT GOES, as Coming up says the same lines: a salary and the rent read alike without it. */
        { field: 'amount', label: 'Amount', width: '15ch', align: 'end', sign: { field: 'direction', minus: 'out' } },
      ],
      order: [{ field: 'next_due', dir: 'asc' }],
      limit: 12,
      empty: 'Nothing repeats yet.',
    },
    {
      /* WHAT IS LEFT TO PAY ON EACH PLAN, one part a plan, so the scale of the drops is read beside the line. */
      kind: 'bar',
      heading: 'Left to pay, by plan',
      icon: 'chart-bar',
      span: 12,
      source: 'metric.installments-left-by-plan',
      when: { metric: 'installments-left', gt: 0 },
      empty: 'Nothing is being paid in parts.',
    },
  ],
};
