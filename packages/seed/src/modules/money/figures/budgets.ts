/** Money's figures over a category's budget: how many are set, and the day this month's spending on one reached the most a month. */

import type { SeedMetric } from '../../base.ts';
import { MONEY } from './shared.ts';

/**
 * THE DAY A CATEGORY PASSED ITS BUDGET, SINCE money-core 3.17.0. It is what the line "Outing passed its
 * budget on 19 Oct." is written from, and it is declared with no tile of its own: Money's page is at its ceiling of
 * blocks, so the budget block that reads it is a later job.
 *
 * ONE CATEGORY A READING, NAMED BY THE PAGE. `category is {{it}}` is filled with a category's name, as
 * `budget-passed-on:Outing`, so the figure is about that category's spending and no other's.
 *
 * THE SAME MONEY `spent-by-category-month` ADDS UP, IN THE ORDER IT WAS SPENT. Cleared, no transfer, money out, since
 * the first of the month (`figures/spending.ts` says why each clause is there), added up a day at a time by `on`. So
 * the total a budget block draws and the total this stops at are one sum, and a void or pending payment, a refund or
 * money moved between a person's own accounts reaches no line.
 *
 * THE LINE IS THE CATEGORY'S OWN `budget`, READ FROM THE CATEGORY AND NEVER TYPED HERE. `until: { gte: { field: 'budget',
 * of: 'category' } }` is the most a month of the category the entries point at, which is the one the parameter named.
 * A sum of money is in a currency a pack cannot know, and a person changes a budget by editing the category
 * (`lists/categories.ts`), so a number in this declaration would be wrong on every record but one. `gte`, because the
 * most a month is the line itself: a payment that lands exactly on it has used the budget up.
 *
 * WHAT IT ANSWERS. The total at the stop and `crossed: { id, at, value }`, the entry that reached the line, the day it
 * was made on and the total on that day. Under the budget there is no `crossed` and the total is what was spent. A
 * category that holds no budget has no line, so it has no `crossed` either, whatever went on it.
 *
 * A BUDGET IN ONE CURRENCY AND SPENDING IN ANOTHER IS NOT COMPARED BY THIS DECLARATION. Two currencies follow the rule
 * every sum follows (`figures/shared.ts`), and the reader answers for the line it is handed.
 *
 * `target: { gte: 0 }` AND `compare: none`, as the month figures beside it: the good state is a day that is not there,
 * which no bound on a sum of money says, and a second reading moved by a window would be last month's budget.
 */
export const BUDGET_FIGURES: Record<string, SeedMetric> = {
  'budget-passed-on': {
    metric: 'budget-passed-on',
    name: 'The day a category passed its budget',
    source: 'register.transactions',
    where: 'state is cleared, transfer is false, stays is not true, direction is out, on at least bom, category is {{it}}',
    value: { running: { sum: 'amount', order: 'on', until: { gte: { field: 'budget', of: 'category' } } } },
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /* HOW MANY BUDGETS ARE SET, WHICH IS WHAT MONEY'S OWN BUDGETS TILE IS DRAWN ON (budgets-set-73).
     `pages/parts/budget.ts` draws the tile `when: { metric: 'budgets-set', gt: 0 }`, and until now only the Personal use
     case declared that count (`usecases/personal.ts`), so a record with Money and no Personal drew no tile and was told
     nothing. The figure a Money block reads is Money's to declare.

     WORD FOR WORD AS PERSONAL COUNTS IT, so the two are one declaration under one name and a record that holds both
     reads one number: the live categories money goes out on that hold a most a month, which is the sentence the tile
     and the line are drawn over (`BUDGETED`). A count, with no good or bad number, so `target: { gte: 0 }`.

     AFTER `budget-passed-on`, so that figure keeps its place among the budget figures. */
  'budgets-set': {
    metric: 'budgets-set',
    name: 'Budgets set',
    source: 'register.categories',
    where: 'state is live, direction is out, budget is set',
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
};
