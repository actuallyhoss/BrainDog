/** Money's health figures: how much of what comes in is kept, how many months the cash lasts, and how much is held in other currencies. */

import type { SeedMetric } from '../../base.ts';
import { ROLLED } from '../legs.ts';
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
 * HOW LONG THE CASH LASTS IS NOT A FIGURE HERE: `lasts-no-income` (`figures/runway.ts`) already walks Cash now down
 * by everything that goes out with nothing coming in, in days, and Reports' Health reads that one.
 *
 * WHAT IS HELD IN OTHER CURRENCIES, SINCE money-core 3.29.0: of Cash now, the share in a currency other than the home
 * one, both halves converted at the rates held (`read: 'foreign'`, `foreignShare` in
 * `packages/kernel/src/money-figures.ts`). The same accounts and the same roll as Cash now. Two currencies and no home
 * one, or a rate missing, reads nothing rather than a share of a part; one currency and no home one reads nought. No target a share could miss: holding dollars is a choice.
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

  'cash-foreign-share': {
    metric: 'cash-foreign-share',
    name: 'Cash in other currencies',
    source: 'register.accounts',
    /* CASH NOW'S OWN ACCOUNTS (`figures/cash.ts`). */
    where: 'liquid is true, state is not closed',
    value: { rolled: { ...ROLLED.rolled, read: 'foreign' } },
    format: 'pct',
    target: { gte: 0 },
    window: '30d',
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
