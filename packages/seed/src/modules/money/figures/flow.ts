/** Money's figures of what comes in and goes out: thirty days, every month, late, and by month. */

import { LOOKUPS, OPEN, type SeedMetric } from '../../base.ts';
import { LIVE_LINES } from '../legs.ts';
import { MONEY } from './shared.ts';

export const FLOW_FIGURES: Record<string, SeedMetric> = {
  /**
   * WHAT BILLS AND INVOICES ALONE BRING IN AND TAKE OUT OVER THIRTY DAYS. Not on the Money page since money-core 3.0.0,
   * where the walk figures above count every list; kept, because use cases' pages draw them and a figure id is for ever.
   * The name says which part of the money it counts, so it never wears the walk's words. `before` is exclusive, so the
   * thirtieth day is `before +31d`.
   */
  'in-30d': {
    metric: 'in-30d',
    name: 'Receivables, 30 days',
    source: 'register.obligations',
    where: `${OPEN}, direction is owed to me, due before +31d`,
    value: { sum: 'amount' },
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /**
   * THE OTHER SIDE OF `in-30d`, AND THE COMMENT ABOVE IT IS THIS ONE'S TOO.
   *
   * A SETTING IS FOUND BY ITS KEY, NOT BY THE WORDS IT WAS SAVED UNDER. A saved value is written under `most_out_30d`,
   * the key this figure names in `target.setting`, and the label is text the settings screen prints beside the box, so
   * the words follow the figure and a ceiling saved under older words is kept (`test/money.test.ts`).
   */
  'out-30d': {
    metric: 'out-30d',
    name: 'Payables, 30 days',
    source: 'register.obligations',
    where: `${OPEN}, direction is owed by me, due before +31d`,
    value: { sum: 'amount' },
    format: MONEY,
    target: {},
    window: '30d',
    compare: 'none',
  },

  /**
   * WHAT GOES OUT EVERY MONTH WITHOUT ANYBODY DECIDING AGAIN: each repeating cost at its monthly
   * share, so a yearly insurance is a twelfth, a quarterly VAT bill a third and a weekly cleaner 52/12.
   *
   * IT READS `recurring`, SINCE money-core 3.0.0, AND IT READ `obligations.repeats`. The case for `recurring` was
   * always good (a repeating item has `next_due` that moves and `ends` that stops it, and the importer writes that
   * list) and it was held back because no use case seeded `recurring`, so the figure answered zero on every demo
   * record. Nothing is written as an example any more, so a demo record is not a reason,
   * and the walk reads `recurring` too: the figure, the split under it and Cash ahead now read one list.
   *
   * A LINE THAT HAS ENDED IS OUT, ON ITS OWN DAY AND NOT ONLY WHEN THE SWEEP MOVES IT (`LIVE_LINES`).
   *
   * THE IDS STAY, and that is deliberate: `MONEY_TARGET_SETTINGS` holds a person's ceiling under
   * this name, the personal use case overrides its target under this name, and the series on the Money page
   * names it. Changing what a figure reads is a change to the figure; changing its id is a
   * change to everything pointing at it.
   */
  'every-month-out': {
    metric: 'every-month-out',
    name: 'Repeating out, a month',
    source: 'register.recurring',
    where: LIVE_LINES('out'),
    value: { sum: { product: ['amount', { lookup: 'per_month', by: 'every' }] } },
    lookups: { per_month: LOOKUPS.per_month! },
    format: MONEY,
    target: {},
    window: '30d',
    compare: 'none',
  },

  /* WHAT COMES IN EVERY MONTH, the other side of `every-month-out`: a pay day, a retainer, each at its monthly share.
     The series counts it in every month ahead, as it counts what goes out, and it ends where that one does. */
  'every-month-in': {
    metric: 'every-month-in',
    name: 'Repeating in, a month',
    source: 'register.recurring',
    where: LIVE_LINES('in'),
    value: { sum: { product: ['amount', { lookup: 'per_month', by: 'every' }] } },
    lookups: { per_month: LOOKUPS.per_month! },
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /* WHAT IS LEFT EVERY MONTH OF WHAT REPEATS: what comes in less what goes out, the two figures above added, so the
     three on Coming up cannot disagree. */
  'every-month-net': {
    metric: 'every-month-net',
    name: 'Repeating, left over a month',
    source: 'register.recurring',
    value: { sum_of: [{ metric: 'every-month-in' }, { metric: 'every-month-out', minus: true }] },
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /* MONEY YOU ARE OWED THAT IS PAST ITS DATE, the other side of `overdue`. */
  'late-in': {
    metric: 'late-in',
    name: 'Late receivables',
    source: 'register.obligations',
    where: `${OPEN}, direction is owed to me, due before today`,
    value: { sum: 'amount' },
    format: MONEY,
    target: { lte: 0 },
    window: '30d',
    compare: 'none',
  },

  /* HOW MANY INVOICES SOMEBODY CHOSE TO CHASE AND STILL WAIT ON (`chased`, stamped from Decide), so the Money page
     draws what is being chased only while something is. */
  chasing: {
    metric: 'chasing',
    name: 'Being chased',
    source: 'register.obligations',
    where: `${OPEN}, direction is owed to me, chased is set`,
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /* HOW LATE MONEY COMES IN, ON AVERAGE: the day it arrived less the day it was due, over the last year's
     paid rows. A fact about what happened, which the forecast's late knob marks, never a prediction. */
  'days-late-in': {
    metric: 'days-late-in',
    name: 'Money in arrives late by',
    source: 'register.obligations',
    where: 'state is paid, direction is owed to me, settled is set, settled after -12m',
    value: { diff: { of: { avg: 'settled' }, per: { avg: 'due' } } },
    format: 'days',
    target: { lte: 14 },
    window: '365d',
    compare: 'none',
  },

  /* WHAT GOES OUT EVERY MONTH, BY WHAT IT IS FOR: each repeating cost at its monthly share, grouped by category, over
     the list `every-month-out` reads, so the parts and the whole are one set of rows. */
  'every-month-by-category': {
    metric: 'every-month-by-category',
    name: 'Repeating out a month, by category',
    source: 'register.recurring',
    where: LIVE_LINES('out'),
    value: { sum: { product: ['amount', { lookup: 'per_month', by: 'every' }] } },
    lookups: { per_month: LOOKUPS.per_month! },
    group_by: 'category',
    format: MONEY,
    target: {},
    window: '30d',
    compare: 'none',
  },

  /**
   * MONEY THAT MOVED, MONTH BY MONTH, READ FROM WHAT MOVED, SINCE money-core 3.0.0.
   *
   * THESE READ PAID BILLS BY THEIR `settled` DAY, AND NOTHING WROTE THAT DAY. `obligations` declared no `finished:`, so
   * `settled` was a field only the sample's rows held and a live record's history was empty however much money it had
   * moved. What moved is `transactions`, cleared and not between your own accounts, the same two clauses every figure of
   * spending counts by. Thirteen months back, so the twelve the series draws are whole and the current one is so far.
   */
  'in-by-month': {
    metric: 'in-by-month',
    name: 'Money in, by month',
    source: 'register.transactions',
    where: 'state is cleared, transfer is false, stays is not true, corrects is not true, direction is in, on after -13m',
    value: { sum: 'amount' },
    group_by: 'on',
    bucket: 'month',
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  'out-by-month': {
    metric: 'out-by-month',
    name: 'Money out, by month',
    source: 'register.transactions',
    where: 'state is cleared, transfer is false, stays is not true, corrects is not true, direction is out, on after -13m',
    value: { sum: 'amount' },
    group_by: 'on',
    bucket: 'month',
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /* WHAT WAS LEFT EACH MONTH: money in less money out over the same rows, the amount signed by its direction
     (`LOOKUPS.sign`), so the two halves are one reading and cannot be read over two different sets. */
  'net-by-month': {
    metric: 'net-by-month',
    name: 'Left over, by month',
    source: 'register.transactions',
    where: 'state is cleared, transfer is false, stays is not true, corrects is not true, on after -13m',
    value: { sum: { product: ['amount', { lookup: 'sign', by: 'direction' }] } },
    lookups: { sign: LOOKUPS.sign! },
    group_by: 'on',
    bucket: 'month',
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /* WHERE THIS MONTH'S MONEY WENT, BY WHAT IT WAS FOR: spending since the first of the month, grouped by category. A
     ceiling is the most a person means to spend on any one thing in a month. */
  'spent-by-category-month': {
    metric: 'spent-by-category-month',
    name: 'Spent this month, by category',
    source: 'register.transactions',
    where: 'state is cleared, transfer is false, stays is not true, corrects is not true, direction is out, on at least bom',
    value: { sum: 'amount' },
    group_by: 'category',
    format: MONEY,
    target: {},
    window: '30d',
    compare: 'none',
  },

  'in-due-by-month': {
    metric: 'in-due-by-month',
    name: 'Due to come in, by month',
    source: 'register.obligations',
    /* ONE-OFF ROWS ONLY: a repeating row is counted in every month ahead at its monthly share (`every-month-in`), not
       only in the month its next due day falls in. */
    where: `${OPEN}, direction is owed to me, repeats is not monthly or quarterly or yearly, due after yesterday, due before +4m`,
    value: { sum: 'amount' },
    group_by: 'due',
    bucket: 'month',
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  'out-due-by-month': {
    metric: 'out-due-by-month',
    name: 'Due to go out, by month',
    source: 'register.obligations',
    where: `${OPEN}, direction is owed by me, repeats is not monthly or quarterly or yearly, due after yesterday, due before +4m`,
    value: { sum: 'amount' },
    group_by: 'due',
    bucket: 'month',
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
};
