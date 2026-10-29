/** Money's figures for the Payees page: who money went to and came from, how often and how much. */

import type { SeedMetric } from '../../base.ts';

/**
 * THE LAST NINETY DAYS OF WHAT MOVED, either way, by the name a person reads (`payee`, "Paid to or from"). Ninety and
 * not thirty, because a shop paid once a month is a payee and thirty days would have it some months and not others.
 * `after` leaves out its own day, as `spent-30d` says, and `before +1d` leaves out an entry dated ahead.
 */
const LEDGER_90D = 'state is cleared, transfer is false, stays is not true, on after -90d, on before +1d';

/**
 * THE PAYEES PAGE'S OWN FIGURES, SINCE money-core 3.29.0.
 *
 * HOW MANY WERE PAID, AND HOW OFTEN EACH. The page's bars of how much each was paid add up the entries where they are
 * drawn (a `bar` over the Ledger), so a payee paid in two currencies is two amounts and never one; how often is a
 * count, which has no currency, so it is a figure grouped by payee. An entry no payee was read for is one part of its
 * own, which the page names.
 *
 * THE DAY EACH WAS LAST PAID, so a payee not paid for weeks reads as such: the newest `on` of each payee's entries.
 *
 * NO GOOD OR BAD NUMBER, so `target: { gte: 0 }` on the counts and the sums, and `compare: none`, as the month figures
 * beside them.
 */
export const PAYEE_FIGURES: Record<string, SeedMetric> = {
  'payees-paid-90d': {
    metric: 'payees-paid-90d',
    name: 'Payees paid, 90 days',
    source: 'register.transactions',
    where: `${LEDGER_90D}, direction is out, payee is set`,
    value: { distinct: 'payee' },
    format: 'int',
    target: { gte: 0 },
    window: '90d',
    compare: 'none',
  },

  /* HOW MANY PAYMENTS OUT IN NINETY DAYS NAME NOBODY (Q15 of 29 October), so Payees asks once to name them while any do. */
  'unnamed-paid-90d': {
    metric: 'unnamed-paid-90d',
    name: 'Paid to nobody named, 90 days',
    source: 'register.transactions',
    where: `${LEDGER_90D}, direction is out, payee is empty`,
    value: { count: 'id' },
    format: 'int',
    target: { lte: 0 },
    window: '90d',
    compare: 'none',
  },

  'paid-times-by-payee-90d': {
    metric: 'paid-times-by-payee-90d',
    name: 'Times paid, by payee, 90 days',
    source: 'register.transactions',
    where: `${LEDGER_90D}, direction is out`,
    value: { count: 'id' },
    group_by: 'payee',
    format: 'int',
    target: { gte: 0 },
    window: '90d',
    compare: 'none',
  },

  'paid-last-by-payee': {
    metric: 'paid-last-by-payee',
    name: 'Last paid, by payee',
    source: 'register.transactions',
    where: `${LEDGER_90D}, direction is out`,
    value: { max: 'on' },
    group_by: 'payee',
    format: 'day',
    target: { gte: 0 },
    window: '90d',
    compare: 'none',
  },
};
