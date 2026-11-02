/** Money's figures of what is paid in parts: what is left, and what falls due inside the month. */

import type { SeedMetric } from '../../base.ts';
import { MONEY } from './shared.ts';

export const INSTALMENTS_FIGURES: Record<string, SeedMetric> = {
  /* ── paid in parts ───────────────────────────────────────────────────────
     What is left of every plan, and what falls due inside the month. Both are sums of the rows, never
     a plan's total less what has gone, so a cancelled part is out of both by its status alone. */

  'installments-left': {
    metric: 'installments-left',
    name: 'Left to pay',
    source: 'register.installments',
    where: 'state is open, direction is out',
    value: { sum: 'amount' },
    format: MONEY,
    target: {},
    window: '30d',
    compare: 'none',
  },

  /* HOW MANY PLANS STILL HAVE PARTS TO PAY, SINCE money-core 3.38.0 (ui2 money, F5): Forecast draws "Left to pay, by
     plan" as bars only from two plans; one plan was a one-bar chart, its figure stopped in the middle of the tile. */
  'plans-paying': {
    metric: 'plans-paying',
    name: 'Plans still being paid',
    source: 'register.installments',
    where: 'state is open, direction is out',
    value: { distinct: 'plan' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  'installments-due-30d': {
    metric: 'installments-due-30d',
    name: 'Instalments due, 30 days',
    source: 'register.installments',
    /* `direction is out` WAS MISSING AND THE FIGURE ADDED THE TWO DIRECTIONS TOGETHER. A plan runs
       both ways: the proofing press goes out in eight parts and the Halden licence comes in in four,
       and on this record one part of each falls due today, so the figure read 615000 where 375000 is
       leaving. A number that is a payment plus a receipt is about nothing, and the figure above it
       carried the clause already. */
    where: 'state is open, direction is out, due before +31d',
    value: { sum: 'amount' },
    format: MONEY,
    target: {},
    window: '30d',
    compare: 'none',
  },
};

/**
 * THE PARTS LATE, SINCE money-core 3.18.0: a part still open whose day has gone, going out.
 * A part was called "next", in grey, nine days after its day, while a late bill was red in Heads up and on Today. Its
 * rows name the part Money's first line says (`{{installments-late.first}}`, the one late longest), with its amount and
 * its day, and Heads up's line says the same. Its own export, declared last in Money (`figures/index.ts`), so every
 * figure a record already holds keeps its place in the document.
 */
export const LATE_PART_FIGURES: Record<string, SeedMetric> = {
  'installments-late': {
    metric: 'installments-late',
    name: 'Instalments late',
    source: 'register.installments',
    where: 'state is open, direction is out, due before today',
    value: { count: 'id' },
    format: 'int',
    target: { lte: 0 },
    window: '30d',
    compare: 'none',
  },
};
