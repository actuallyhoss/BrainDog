/** One plan's figures: how many parts are paid, what is left, and the days of the next part and the last. */

import type { SeedMetric } from '../../base.ts';
import { MONEY } from './shared.ts';

/**
 * WHICH PARTS ARE ONE PLAN'S: the parts whose `plan` is the plan's name, the text a plan's row is made from and found
 * by (`lists/plans.ts`) and the field Instalments indexes. Not `plan_row`, which the script writes a run after the
 * part is made, so a plan typed a minute ago would read no parts at all.
 */
const OF_PLAN = 'plan is {{it}}';

/* A CANCELLED PART IS IN NEITHER SIDE. Paid counts the parts paid and left counts the parts open, each by its own
   status, and "in all" leaves the cancelled out, so paid and left always add up to it. */
const COUNTED = `state is not cancelled, ${OF_PLAN}`;
const PAID = `state is paid, ${OF_PLAN}`;
const STILL_OPEN = `state is open, ${OF_PLAN}`;

/** What every figure here shares: nothing is compared with a month ago, because a plan only ever runs down. */
const ONCE = { window: '30d', compare: 'none' } as const;

/**
 * ONE PLAN, READ ONCE A PLAN as a book's figures are read once a book (`book-cash` in `cash.ts`): `plan-left:Flat`
 * fills `{{it}}` with the plan's name. SINCE REC-B12 (jobs 3 and 4), for the plan's own page (`pages/plan.ts`).
 *
 * EVERY ONE IS COUNTED FROM THE PARTS, never from a total kept on the plan, which holds no amount for that reason:
 * what is left is the open parts added up, so it is the figure Money's "Left to pay" says for all plans, cut to one.
 * Neither direction is named, because a plan runs one way and its page is about that plan whichever way it runs.
 *
 * EACH IS HELD TO NOUGHT OR MORE, as `book-cash` is. A figure must name a target, an empty one is refused when a money
 * figure is read ("target takes a number in the figure's own units"), and no ceiling on one plan is a setting anybody
 * would keep, so the line is the one a count or a sum of amounts cannot fall under.
 */
export const PLAN_FIGURES: Record<string, SeedMetric> = {
  'plan-parts-paid': {
    metric: 'plan-parts-paid',
    name: 'Parts paid of one plan',
    source: 'register.installments',
    where: PAID,
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    ...ONCE,
  },

  'plan-parts': {
    metric: 'plan-parts',
    name: 'Parts of one plan',
    source: 'register.installments',
    where: COUNTED,
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    ...ONCE,
  },

  'plan-paid': {
    metric: 'plan-paid',
    name: 'Paid so far on one plan',
    source: 'register.installments',
    where: PAID,
    value: { sum: 'amount' },
    format: MONEY,
    target: { gte: 0 },
    ...ONCE,
  },

  'plan-left': {
    metric: 'plan-left',
    name: 'Left to pay on one plan',
    source: 'register.installments',
    where: STILL_OPEN,
    value: { sum: 'amount' },
    format: MONEY,
    target: { gte: 0 },
    ...ONCE,
  },

  /* THE TWO DAYS ARE HELD AS WHOLE DAYS SINCE 1970, as `cash-as-of` is, so their format is a day. The next is the
     earliest part still open, which is a day already gone when a part is late; the last is the latest part that is
     not cancelled, paid or not, so a plan that is all paid still says the day it ended. */
  'plan-next-due': {
    metric: 'plan-next-due',
    name: 'Next part of one plan',
    source: 'register.installments',
    where: STILL_OPEN,
    value: { min: 'due' },
    format: 'day',
    target: { gte: 0 },
    ...ONCE,
  },

  'plan-last-due': {
    metric: 'plan-last-due',
    name: 'Last part of one plan',
    source: 'register.installments',
    where: COUNTED,
    value: { max: 'due' },
    format: 'day',
    target: { gte: 0 },
    ...ONCE,
  },
};

/**
 * EVERY PLAN AT ONCE, FOR MONEY'S INSTALMENTS TILE: the parts paid and the parts in all, one count a plan, by the names
 * the owner gave them ("installments-paid-by-plan / installments-total per plan"). Only what goes out, as the tile
 * draws only what goes out (`pages/parts/instalments.ts`), and a cancelled part in neither.
 */
export const PLANS_FIGURES: Record<string, SeedMetric> = {
  'installments-paid-by-plan': {
    metric: 'installments-paid-by-plan',
    name: 'Parts paid, by plan',
    source: 'register.installments',
    where: 'state is paid, direction is out',
    value: { count: 'id' },
    group_by: 'plan',
    format: 'int',
    target: { gte: 0 },
    ...ONCE,
  },

  'installments-total-by-plan': {
    metric: 'installments-total-by-plan',
    name: 'Parts in all, by plan',
    source: 'register.installments',
    where: 'state is not cancelled, direction is out',
    value: { count: 'id' },
    group_by: 'plan',
    format: 'int',
    target: { gte: 0 },
    ...ONCE,
  },
};
