/** Money's figures for the Budgets page: what each category spent against the most a month it holds, its pace, and the limit last month's spending suggests. */

import type { SeedMetric } from '../../base.ts';
import { MONEY } from './shared.ts';

/**
 * WHAT A BUDGET COUNTS, SAID ONCE: cleared, not between a person's own accounts, money out, as every figure of spending
 * counts (`figures/spending.ts` says why each clause is there). The page's bars read `spent-by-category-month` over the
 * same sentence, so a total here and a bar there are one sum.
 */
const LEDGER_OUT = 'state is cleared, transfer is false, direction is out';

/** The categories that hold a budget, as `budgets-set` counts them (`figures/budgets.ts`). */
const BUDGETED = 'state is live, direction is out, budget is set';

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
  'budgets-total': {
    metric: 'budgets-total',
    name: 'Budgeted a month',
    source: 'register.categories',
    where: BUDGETED,
    value: { sum: 'budget' },
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

  'unfiled-month': {
    metric: 'unfiled-month',
    name: 'Entries this month with no category',
    source: 'register.transactions',
    where: `${LEDGER_OUT}, category is empty, on at least bom`,
    value: { count: 'id' },
    format: 'int',
    target: { lte: 0 },
    window: '30d',
    compare: 'none',
  },
};
