/** Money's figures for the Budgets page: what each category spent against the most a month it holds, its pace, and the limit last month's spending suggests. */

import type { SeedMetric } from '../../base.ts';
import { MONEY } from './shared.ts';

/**
 * WHAT A BUDGET COUNTS, SAID ONCE: cleared, not between a person's own accounts, money out, as every figure of spending
 * counts (`figures/spending.ts` says why each clause is there). The page's bars read `spent-by-category-month` over the
 * same sentence, so a total here and a bar there are one sum.
 */
const LEDGER_OUT = 'state is cleared, transfer is false, stays is not true, corrects is not true, direction is out';

/** The categories that hold a budget, as `budgets-set` counts them (`figures/budgets.ts`). */
const BUDGETED = 'state is live, direction is out, budget is set';

/* A BUDGET FOR A MONTH: one that says so, or one that says no period, as every budget set before periods were. */
export const A_MONTH = 'budget_period is not week, budget_period is not year';

/**
 * THE BUDGETS PAGE'S OWN FIGURES, SINCE money-core 3.29.0.
 *
 * WHAT IS ALL BUDGETED, AND WHAT CANNOT BE COUNTED AGAINST A BUDGET YET. The page says what the budgets add up to, and
 * the money this month that no category holds, which no budget can count until it is filed. The second is said as an
 * amount and as how many entries, so the line under it says what filing them is.
 *
 * WHAT HAS NO BUDGET YET, so the page offers one: the live categories money goes out on with no most a month typed.
 * A budget is offered from last month's spending (`spent-by-category-last-month`, `figures/spending.ts`) and kept only
 * when the person says so; nothing here sets one.
 *
 * ADDED UP IN THE RECORD'S HOME CURRENCY WHEN ONE IS SET, else one amount per currency, as every money figure is
 * (`figures/shared.ts`). Budgets in two currencies are never added into one.
 *
 * `compare: none` ON ALL OF THEM, as the month figures beside them: each is this month's, and a second reading moved by
 * a window would be a month nobody asked about.
 */
export const BUDGET_PAGE_FIGURES: Record<string, SeedMetric> = {
  /**
   * WHAT THE BUDGETS COME TO IN A MONTH, SINCE money-core 3.31.0 a budget for a week or a year is counted at its share of
   * a month (`budget_period`): a week at 52 in 12 of it, a year at a twelfth. Three parts added, so a budget kept before
   * there were periods, which says none, is a month as it always was.
   */
  'budgets-total': {
    metric: 'budgets-total',
    name: 'Budgeted a month',
    source: 'register.categories',
    value: { sum_of: [{ metric: 'budgets-monthly-total' }, { metric: 'budgets-weekly-total' }, { metric: 'budgets-yearly-total' }] },
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
  'budgets-monthly-total': {
    metric: 'budgets-monthly-total',
    name: 'Budgeted by the month',
    source: 'register.categories',
    where: `${BUDGETED}, ${A_MONTH}`,
    value: { sum: 'budget' },
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
  'budgets-weekly-total': {
    metric: 'budgets-weekly-total',
    name: 'Budgeted by the week, a month of it',
    source: 'register.categories',
    where: `${BUDGETED}, budget_period is week`,
    value: { sum: { product: ['budget', { lookup: 'a_month', by: 'budget_period' }] } },
    lookups: { a_month: { month: 1, week: 52 / 12, year: 1 / 12 } },
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
  'budgets-yearly-total': {
    metric: 'budgets-yearly-total',
    name: 'Budgeted by the year, a month of it',
    source: 'register.categories',
    where: `${BUDGETED}, budget_period is year`,
    value: { sum: { product: ['budget', { lookup: 'a_month', by: 'budget_period' }] } },
    lookups: { a_month: { month: 1, week: 52 / 12, year: 1 / 12 } },
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /* HOW MANY BUDGETS ARE FOR A WEEK, AND FOR A YEAR: what the Budgets page draws each period's bars on. */
  'budgets-weekly': {
    metric: 'budgets-weekly',
    name: 'Weekly budgets',
    source: 'register.categories',
    where: `${BUDGETED}, budget_period is week`,
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
  'budgets-yearly': {
    metric: 'budgets-yearly',
    name: 'Yearly budgets',
    source: 'register.categories',
    where: `${BUDGETED}, budget_period is year`,
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /* THIS WEEK AND THIS YEAR SO FAR, BY CATEGORY: what a weekly or a yearly budget's bar is set against, read as
     `spent-by-category-month` reads this month (`flow.ts`), from Monday and from 1 January. */
  'spent-by-category-week': {
    metric: 'spent-by-category-week',
    name: 'Spent this week, by category',
    source: 'register.transactions',
    where: `${LEDGER_OUT}, on at least bow`,
    value: { sum: 'amount' },
    group_by: 'category',
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
  'spent-by-category-year': {
    metric: 'spent-by-category-year',
    name: 'Spent this year, by category',
    source: 'register.transactions',
    where: `${LEDGER_OUT}, on at least boy`,
    value: { sum: 'amount' },
    group_by: 'category',
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  'budgets-unset': {
    metric: 'budgets-unset',
    name: 'Categories with no budget',
    source: 'register.categories',
    where: 'state is live, direction is out, budget is empty',
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /* THIS MONTH SO FAR WITH NO CATEGORY: the part of `spent-by-category-month`'s whole no part of it holds. */
  'unfiled-spent-month': {
    metric: 'unfiled-spent-month',
    name: 'Spent this month with no category',
    source: 'register.transactions',
    where: `${LEDGER_OUT}, category is empty, on at least bom`,
    value: { sum: 'amount' },
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /*
   * MONEY OUT STILL WAITING TO CLEAR THIS MONTH, SINCE money-core 3.32.0 (audit of 30 October, 22). One rule for a pending
   * line, the one every figure of spending already keeps: it is not counted until the bank settles it, in Spent, in a
   * budget and anywhere else. What changes is that it is said: Budgets names how much waits, and the Ledger lists it
   * apart as waiting to clear, where it stood among the cleared lines like any other while Production read £0 of £900.
   */
  'pending-out-month': {
    metric: 'pending-out-month',
    name: 'Waiting to clear this month',
    source: 'register.transactions',
    where: 'state is pending, transfer is false, stays is not true, corrects is not true, direction is out, on at least bom',
    value: { sum: 'amount' },
    format: MONEY,
    target: { lte: 0 },
    window: '30d',
    compare: 'none',
  },
  'pending-lines': {
    metric: 'pending-lines',
    name: 'Lines waiting to clear',
    source: 'register.transactions',
    where: 'state is pending',
    value: { count: 'id' },
    format: 'int',
    target: { lte: 0 },
    window: '30d',
    compare: 'none',
  },
  'pending-out-month-count': {
    metric: 'pending-out-month-count',
    name: 'Payments waiting to clear this month',
    source: 'register.transactions',
    where: 'state is pending, transfer is false, stays is not true, corrects is not true, direction is out, on at least bom',
    value: { count: 'id' },
    format: 'int',
    target: { lte: 0 },
    window: '30d',
    compare: 'none',
  },
  'unfiled-month': {
    metric: 'unfiled-month',
    name: 'Entries this month with no category',
    source: 'register.transactions',
    where: `${LEDGER_OUT}, category is empty, parts is empty, on at least bom`,
    value: { count: 'id' },
    format: 'int',
    target: { lte: 0 },
    window: '30d',
    compare: 'none',
  },
};
