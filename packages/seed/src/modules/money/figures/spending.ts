/** Money's figures over the ledger: what was spent and received, and what has no category. */

import type { SeedMetric } from '../../base.ts';
import { MONEY } from './shared.ts';

export const SPENDING_FIGURES: Record<string, SeedMetric> = {
  /* ── what actually moved ─────────────────────────────────────────────────
     Every figure over the ledger says `transfer is false` and `state is cleared`. The first leaves out
     money moved between your own accounts, which is not spending; the second leaves out a payment the
     bank has taken and not yet settled, which is not a fact yet. A figure that omitted either would be
     a number about the same money counted twice, or about money that has not moved.

     THIRTY DAYS IN THE SENTENCE BECAUSE THE WINDOW IS THIRTY. `window: 30d` is how far the comparison moves
     the clock, and the window before is cut where this one starts, so it is thirty days whatever the
     sentence says. `after` does not include its own day, and these said `on after -31d`: today and the
     thirty before it, thirty-one days, compared with thirty and named "30 days". Measured in
     `test/money-bank.test.ts`: a cleared payment dated day -30 was counted. Now the two windows are the
     same length, abut, and share no day. */

  'spent-30d': {
    metric: 'spent-30d',
    name: 'Spent, 30 days',
    source: 'register.transactions',
    where: 'state is cleared, transfer is false, direction is out, on after -30d',
    value: { sum: 'amount' },
    format: MONEY,
    target: {},
    window: '30d',
    compare: 'previous',
  },

  'received-30d': {
    metric: 'received-30d',
    name: 'Received, 30 days',
    source: 'register.transactions',
    where: 'state is cleared, transfer is false, direction is in, on after -30d',
    value: { sum: 'amount' },
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'previous',
  },

  /**
   * MONEY IN OVER THE LAST SEVEN DAYS, SINCE money-core 3.16.0: the Ledger's half of Today's "Money this week". The same
   * sentence as `received-30d` over today and the six days before it (`after` leaves out its own day, as
   * `ledger-rows-7d` says), and `on before +1d` leaves out a payment dated ahead, which has not come in yet.
   *
   * ONLY THE LEDGER, AND ONLY WHAT SETTLES NOTHING. Money paid to somebody who keeps no account is a paid bill or
   * invoice, and `settled-in-7d` reads it; a page puts the two side by side and never adds them into one number. A
   * Ledger entry reconciled to an invoice (`settles`, `lists/transactions.ts`) is the same payment as that invoice
   * marked paid, as the sample's two paid invoices are, so this half leaves it to `settled-in-7d` and no payment is
   * read twice (`test/money-week.test.ts`). The cost, said: a part payment reconciled to an invoice still part paid is
   * in neither half until the invoice is paid.
   */
  'received-7d': {
    metric: 'received-7d',
    name: 'Received, 7 days',
    source: 'register.transactions',
    where: 'state is cleared, transfer is false, direction is in, settles is empty, on after -7d, on before +1d',
    value: { sum: 'amount' },
    format: MONEY,
    target: { gte: 0 },
    window: '7d',
    compare: 'none',
  },

  /* WHAT NOBODY HAS SAID THE PURPOSE OF. The one figure over what moved that is a job rather than a
     fact, and the reason `txn-categorise` is worth declaring: it is what is left after the rule ran. */
  'txn-uncategorised': {
    metric: 'txn-uncategorised',
    name: 'Without a category',
    source: 'register.transactions',
    where: 'state is cleared, transfer is false, category is empty, on after -91d',
    value: { count: 'id' },
    format: 'int',
    target: { lte: 0 },
    window: '30d',
    compare: 'none',
  },
};

/**
 * THIS MONTH AGAINST LAST, BY WHAT IT WAS FOR (REC-B19 job 2). Spread LAST in `figures/index.ts`, so every figure a
 * record already holds keeps its place in the document.
 *
 * THREE WINDOWS, IN THE GRAMMAR'S OWN DAY WORDS. `bom-1m` is the first day of last month and `bom` the first of this
 * one, so `on at least bom-1m, on before bom` is the whole of last calendar month whatever its length. `-1m` is today's
 * day number a month back, clamped to the last day that month has: on the 18th it is the 18th, and on 31 October it is
 * 30 September, so last month to date never runs into this month.
 *
 * TO DATE IS WHAT A CHANGE IS MEASURED AGAINST, AND THE WHOLE MONTH IS WHAT A PERSON IS TOLD. In the first week of a
 * month every category reads far below the whole of last month, which looks like good news and is the calendar.
 *
 * NO CEILING, SO THE TARGET IS THE ONE EVERY SUM OF PAYMENTS MEETS, as `out-due-by-month` says it: a ceiling is a sum in
 * a currency a pack cannot know, and the one a person sets for a category is `spent-by-category-month`'s.
 *
 * `compare: none` ON ALL OF THEM: each is one half of a comparison already, and a second one moved by a window would
 * be a third month nobody asked about.
 */
const LEDGER_OUT = 'state is cleared, transfer is false, direction is out';

export const SPEND_VS_LAST_FIGURES: Record<string, SeedMetric> = {
  'spent-last-month': {
    metric: 'spent-last-month',
    name: 'Spent last month',
    source: 'register.transactions',
    where: `${LEDGER_OUT}, on at least bom-1m, on before bom`,
    value: { sum: 'amount' },
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  'spent-by-category-last-month': {
    metric: 'spent-by-category-last-month',
    name: 'Spent last month, by category',
    source: 'register.transactions',
    where: `${LEDGER_OUT}, on at least bom-1m, on before bom`,
    value: { sum: 'amount' },
    group_by: 'category',
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  'spent-by-category-to-date-last-month': {
    metric: 'spent-by-category-to-date-last-month',
    name: 'Spent last month to this day, by category',
    source: 'register.transactions',
    where: `${LEDGER_OUT}, on at least bom-1m, on at most -1m`,
    value: { sum: 'amount' },
    group_by: 'category',
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /**
   * THIS MONTH SO FAR LESS LAST MONTH TO THE SAME DAY, ONE ANSWER A CATEGORY. One sentence, `on at least bom`, read
   * twice: now, and with the clock a month back and the window ended on that day (`before: month_ago`), which is the
   * same entries `spent-by-category-to-date-last-month` adds up. A category spent on in one month only counts the other
   * as nought.
   *
   * A CATEGORY'S CHANGE IS SAID ONLY WHERE THE RECORD LETS IT BE: each part carries its two halves, and a `delta` that
   * is `null` with a `why` when either month is empty or one has under half the other's entries. A page marks the
   * category that moved most among the parts that have a `delta`, and never one that has none.
   *
   * THE TARGET IS NO MORE THAN LAST MONTH TO THIS DAY, which is the only bound a difference of two months has that
   * names no currency.
   */
  'spent-vs-last-month': {
    metric: 'spent-vs-last-month',
    name: 'Spent this month against last, by category',
    source: 'register.transactions',
    where: `${LEDGER_OUT}, on at least bom`,
    value: { diff: { of: { sum: 'amount' }, per: { sum: 'amount' }, before: 'month_ago' } },
    group_by: 'category',
    format: MONEY,
    target: { lte: 0 },
    window: '30d',
    compare: 'none',
  },
};
