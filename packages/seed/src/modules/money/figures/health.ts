/** Money's health figures: how much of what comes in is kept, how many months the cash lasts, and how much is held in other currencies. */

import type { SeedMetric } from '../../base.ts';
import { MONEY } from './shared.ts';

/** What moved, as every figure of the Ledger counts it: cleared and not between a person's own accounts. */
const MOVED = 'state is cleared, transfer is false';

/**
 * HOW HEALTHY THE MONEY IS, SINCE money-core 3.29.0, and the month so far each way, which Reports opens on.
 *
 * KEPT, NINETY DAYS: of the money that came in, the share not spent again, over the same rows in one reading. The top
 * half is money in less money out, each amount signed by its own way (`sign`); the bottom half is money in alone, the
 * money out counted as nought (`in_only`). One source and one sentence, so the two halves cannot be read over two sets
 * of rows, and a quarter where more went out than came in reads below nought, which is what it is. Ninety days and not
 * thirty, because one pay day either side of a month's edge would swing a month's share from nought to most of it. A
 * quarter with nothing in reads nothing, never nought: a per-half of nought answers no value.
 *
 * A FIFTH OR MORE KEPT IS THE MARK, the share a household that saves aims at, and no currency is named by it.
 *
 * HOW MANY MONTHS THE CASH LASTS AND WHAT IS HELD IN OTHER CURRENCIES ARE NOT HERE YET. Each sets a figure of one list
 * against a figure of another (cash on accounts against spending on the Ledger, a currency against the home one), and
 * a figure in this build reads one list. Money's Lasts tile already says the day the cash lasts to with nothing coming
 * in (`lasts-no-income`), which is the first in days.
 *
 * THE MONTH SO FAR, EACH WAY: money in since the first, and money out, which is `spent-by-category-month`'s whole.
 */
export const HEALTH_FIGURES: Record<string, SeedMetric> = {
  'kept-share-90d': {
    metric: 'kept-share-90d',
    name: 'Kept of money in, 90 days',
    source: 'register.transactions',
    where: `${MOVED}, on after -90d, on before +1d`,
    value: {
      ratio: {
        of: { sum: { product: ['amount', { lookup: 'sign', by: 'direction' }] } },
        per: { sum: { product: ['amount', { lookup: 'in_only', by: 'direction' }] } },
      },
    },
    lookups: { sign: { in: 1, out: -1 }, in_only: { in: 1, out: 0 } },
    format: 'pct',
    target: { gte: 0.2 },
    window: '90d',
    compare: 'none',
  },

  'received-month': {
    metric: 'received-month',
    name: 'Money in this month',
    source: 'register.transactions',
    where: `${MOVED}, direction is in, on at least bom`,
    value: { sum: 'amount' },
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  'left-month': {
    metric: 'left-month',
    name: 'Left over this month',
    source: 'register.transactions',
    where: `${MOVED}, on at least bom`,
    value: { sum: { product: ['amount', { lookup: 'sign', by: 'direction' }] } },
    lookups: { sign: { in: 1, out: -1 } },
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
};
