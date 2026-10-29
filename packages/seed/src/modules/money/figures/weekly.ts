/**
 * WHAT WENT OUT EACH WEEK IN ONE CATEGORY, OR TO ONE PAYEE, SINCE money-core 3.32.0 (the validator's audit of 30
 * October, 13): "my software spending by week" is a line of weekly totals, and a widget could only list the single
 * payments. `{{it}}` is the category's or the payee's name, as a widget made by saying it names one
 * (`composeWidget` in `braindog-render`). Twelve weeks, from Monday, read as Spending reads the Ledger.
 */

import type { SeedMetric } from '../../base.ts';
import { MONEY } from './shared.ts';

const LEDGER_OUT = 'state is cleared, transfer is false, stays is not true, direction is out';
const WEEKS = 'on after -84d';

export const WEEKLY_FIGURES: Record<string, SeedMetric> = {
  'spent-in-category-by-week': {
    metric: 'spent-in-category-by-week',
    name: 'Spent in one category, by week',
    source: 'register.transactions',
    where: `${LEDGER_OUT}, category is {{it}}, ${WEEKS}`,
    value: { sum: 'amount' },
    group_by: 'on',
    bucket: 'week',
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
  'paid-to-by-week': {
    metric: 'paid-to-by-week',
    name: 'Paid to one payee, by week',
    source: 'register.transactions',
    where: `${LEDGER_OUT}, party is {{it}}, ${WEEKS}`,
    value: { sum: 'amount' },
    group_by: 'on',
    bucket: 'week',
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
};
