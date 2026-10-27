/** Forecast: the cash walk ahead, its lowest point and what moves it. */

import type { SeedPage } from '../../base.ts';
import { FORECAST } from './parts/forecast.ts';

/**
 * CASH AHEAD AS THE PAGE'S ONE ANSWER: the walk Money draws (`parts/forecast.ts`, the legs every walk reads), opening on
 * three months, with six months and a year a press away up front and To the end after them. The renderer says the cash
 * at the horizon, the lowest point and what took it there, and everyday spending at its three-month average over the
 * chart, marks every salary, premium and part of a plan on the line and lists them under it, and asks "If income
 * stopped" beside the lengths (`packages/render/src/forecast.ts`).
 *
 * NO `headline: under`: this page's line says how long the money lasts with nothing coming in, not when it runs out on
 * what is due, so the chart says its own sentence.
 */
const { headline: _headline, ...WALK } = FORECAST[0]!;

const CASH_AHEAD: Record<string, unknown> = {
  ...WALK,
  /* A QUARTER FIRST, then half a year and a year, the lengths a person plans by, and To the end for a plan that runs
     on for years. The record walks the longest of them within two years unasked, and further when To the end is asked. */
  horizon: 91,
  horizons: [91, 183, 365, 'last'],
};

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
    {
      /* THE LINE: what the walk counts, then how long the cash lasts if no money came in, and what falls due that day.
         A clause whose figure has no value is left out by the writer, so a record with nothing that runs it out reads
         the first sentence alone. */
      kind: 'note',
      lead: true,
      span: 12,
      body:
        'Cash ahead, with every pay, bill and part of a plan on its day and everyday spending at its three-month average. ' +
        'If all money in stopped, it lasts to {{lasts-no-income.on}}, when {{lasts-no-income.because}} is due.',
    },
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
      empty: 'Nothing is dated in the months ahead yet.',
    },
    {
      /* THE PARTS OF PLANS STILL TO PAY IN THE YEAR AHEAD, each on its day in its own currency: the drops the chart
         numbers, and the ones past its horizon. */
      kind: 'table',
      heading: 'Instalments, the year ahead',
      icon: 'credit-card',
      span: 12,
      source: 'register.installments',
      where: 'state is open, due before +366d',
      columns: [
        { field: 'what', label: 'Description', width: 'minmax(14ch,1fr)' },
        { field: 'due', label: 'Due', width: '12ch', align: 'end' },
        { field: 'amount', label: 'Amount', width: '15ch', align: 'end', sign: { field: 'direction', minus: 'out' } },
      ],
      order: [{ field: 'due', dir: 'asc' }],
      limit: 12,
      when: { metric: 'installments-left', gt: 0 },
      empty: 'No part of a plan falls due in the year ahead.',
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
        { field: 'next_due', label: 'Next', width: '12ch', align: 'end' },
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
