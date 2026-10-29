/** Net worth: everything held less everything owed, add-ons' holdings included, remembered night by night. */

import type { SeedMetric } from '../../base.ts';
import { MONEY } from './shared.ts';

/**
 * NET WORTH, SINCE money-core 3.31.0 (money parity, "Left": net worth over time with assets).
 *
 * Until now the night kept cash and what was owed either way, and nothing a person owns beyond the bank: gold, a fund,
 * a flat being paid off, a certificate, a policy's fund. Those live in add-ons (Holdings, Property, Certificates,
 * Insurance, Debts), so the parts that read them are `optional`: a record without the add-on adds nothing for it, and
 * one that takes it later adds it from that night on (`SumOf` in `packages/kernel/src/metrics.ts`).
 *
 * A PROPERTY IS ADDED AT WHAT IT IS WORTH, AND ITS PARTS STILL TO PAY ARE TAKEN AWAY WITH EVERY OTHER INSTALMENT. Equity is
 * worth less what is left on the plan, so adding equity and taking away every instalment left would take the flat's
 * parts away twice.
 */
export const WORTH_FIGURES: Record<string, SeedMetric> = {
  /* WHAT IS HELD BEYOND THE BANK, AT WHAT IT IS WORTH NOW. Each part is an add-on's own figure, read as its page reads it. */
  'held-beyond-cash': {
    metric: 'held-beyond-cash',
    name: 'Held beyond cash',
    source: 'register.accounts',
    value: {
      sum_of: [
        { metric: 'holdings-value', optional: true },
        { metric: 'property-value', optional: true },
        { metric: 'certificates-principal', optional: true },
        { metric: 'certificates-accrued', optional: true },
        { metric: 'policies-fund', optional: true },
      ],
    },
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /* WHAT IS OWED OVER TIME: the instalments left on every plan, and the Debts add-on's balances when it is there.
     A CARD IS COUNTED ONCE: its balance is in Cash now when it counts as cash, so `debts-left` (Debts 2.1.0) leaves out a
     debt whose account counts as cash (`in_cash`, read through its account), and counts one on no account or on one
     that does not. */
  'owed-over-time': {
    metric: 'owed-over-time',
    name: 'Still to pay over time',
    source: 'register.installments',
    value: { sum_of: [{ metric: 'installments-left' }, { metric: 'debts-left', optional: true }] },
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /**
   * NET WORTH: cash, what you are owed and what you hold, less what you owe now and over time. REMEMBERED EACH NIGHT
   * into `series.net-worth`, the way Cash now keeps `series.cash-now`, so a stat cell with `trend: 12w` draws its line.
   * The nightly Snapshots row carries it too, with the same night restated in dollars and in grams of gold.
   */
  'net-worth': {
    metric: 'net-worth',
    name: 'Net worth',
    source: 'register.accounts',
    value: {
      sum_of: [
        { metric: 'cash-now' },
        { metric: 'owed-to-you' },
        { metric: 'held-beyond-cash' },
        { metric: 'owed-by-you', minus: true },
        { metric: 'owed-over-time', minus: true },
      ],
    },
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
    snapshot: { grain: 'day', into: 'series.net-worth' },
  },

  /**
   * THE NIGHTS NET WORTH HAS BEEN KEPT WHOLE, SINCE money-core 3.32.0 (recheck of 30 October, N2): Snapshots' nights that
   * carry net worth (`worth`), each written the same night net worth's own point is. Over time draws Cash's line until
   * there are a week of them and net worth's from then, so its line is never drawn from a few points, nor lent nights of
   * cash and bills only, which would read as a real drop.
   */
  'net-worth-nights': {
    metric: 'net-worth-nights',
    name: 'Nights net worth was kept',
    source: 'register.snapshots',
    where: 'worth is set',
    value: { count: 'id' },
    format: 'int',
    target: { gte: 7 },
    window: '30d',
    compare: 'none',
  },
};
