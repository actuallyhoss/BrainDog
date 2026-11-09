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

  /* HOW MANY PARTS ARE STILL OPEN, SINCE BATCH 72: what the lead sentence about what is left waits for
     (`pages/plan.ts`). `plan-left` cannot be asked that, because open parts added up to nought and no open part at
     all are the same nought to a test. WITH `plan-parts` IT IS ALSO WHAT TELLS A PLAN ALL PAID FROM A PLAN WITH NO PART, SINCE BATCH
     74: parts stand and none is open. A share of the plan's money said that in batch 72 (`plan-share-left`,
     gone); it read once a currency and had no value when the parts added up to nought. */
  'plan-parts-open': {
    metric: 'plan-parts-open',
    name: 'Parts still open on one plan',
    source: 'register.installments',
    where: STILL_OPEN,
    value: { count: 'id' },
    format: 'int',
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
 * WHAT A PLAN'S PAGE SUMS UP, SINCE money-core 3.29.0: what is late, the parts cancelled, the plan's track with its next
 * part, and what was paid each quarter, each read once a plan as the figures above are. Their own export, declared last in Money
 * (`figures/index.ts`), so every figure a record already holds keeps its place in the document.
 */
export const PLAN_PAGE_FIGURES: Record<string, SeedMetric> = {
  /* WHAT IS LATE ON ONE PLAN: the open parts whose day has gone, added up. Held to nought, so a late amount is drawn in
     the late red, and with no part late it has no value and its cell is not drawn. */
  'plan-late': {
    metric: 'plan-late',
    name: 'Late on one plan',
    source: 'register.installments',
    where: `due before today, ${STILL_OPEN}`,
    value: { sum: 'amount' },
    format: MONEY,
    target: { lte: 0 },
    ...ONCE,
  },

  /* HOW MANY PARTS ARE CANCELLED, which the list of them under the fold waits for. */
  'plan-parts-cancelled': {
    metric: 'plan-parts-cancelled',
    name: 'Parts cancelled on one plan',
    source: 'register.installments',
    where: `state is cancelled, ${OF_PLAN}`,
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    ...ONCE,
  },

  /* THE TRACK OF ONE PLAN, AS MONEY'S INSTALMENTS TILE DRAWS EACH PLAN'S (`installments-*-by-plan` below): the parts
     paid against the parts that stand, then the day of the next part, what is left and what is left once it is paid,
     which the app says under the bar as "Next EGP 120,000 on 28 Nov", or the part late in red. Grouped by the plan
     and read once a plan, so the one plan's page draws one track. Either way the money goes, as the rest of the page. */
  'plan-parts-paid-by-plan': {
    metric: 'plan-parts-paid-by-plan',
    name: 'Parts paid of one plan, as a track',
    source: 'register.installments',
    where: PAID,
    value: { count: 'id' },
    group_by: 'plan',
    format: 'int',
    target: { gte: 0 },
    ...ONCE,
  },

  'plan-parts-by-plan': {
    metric: 'plan-parts-by-plan',
    name: 'Parts of one plan, as a track',
    source: 'register.installments',
    where: COUNTED,
    value: { count: 'id' },
    group_by: 'plan',
    format: 'int',
    target: { gte: 0 },
    ...ONCE,
  },

  'plan-next-due-by-plan': {
    metric: 'plan-next-due-by-plan',
    name: 'Next part of one plan, as a track',
    source: 'register.installments',
    where: STILL_OPEN,
    value: { min: 'due' },
    group_by: 'plan',
    format: 'day',
    target: { gte: 0 },
    ...ONCE,
  },

  'plan-left-by-plan': {
    metric: 'plan-left-by-plan',
    name: 'Left to pay on one plan, as a track',
    source: 'register.installments',
    where: STILL_OPEN,
    value: { sum: 'amount' },
    group_by: 'plan',
    format: MONEY,
    target: { gte: 0 },
    ...ONCE,
  },

  'plan-after-next-by-plan': {
    metric: 'plan-after-next-by-plan',
    name: 'Left on one plan once the next part is paid, as a track',
    source: 'register.installments',
    where: STILL_OPEN,
    value: { max: 'left_after' },
    group_by: 'plan',
    format: MONEY,
    target: { gte: 0 },
    ...ONCE,
  },

  /* WHAT WAS PAID EACH QUARTER, by the day each part fell due, which the page's chart adds up as it goes ("Paid in all,
     over time", a running line). By the due day as the Property add-on's chart is, so the two say the same quarters. */
  'plan-paid-by-quarter': {
    metric: 'plan-paid-by-quarter',
    name: 'Paid on one plan, by quarter',
    source: 'register.installments',
    where: PAID,
    value: { sum: 'amount' },
    group_by: 'due',
    bucket: 'quarter',
    format: MONEY,
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

/**
 * THE NEXT UNPAID PART OF EVERY PLAN, FOR THE SAME TILE ("Next £1,875 on 3 Sep"): three figures by plan that the tile
 * reads together, because no figure here reads one row's amount by another row's day. Their own export, declared last
 * in Money (`figures/index.ts`), so every figure a record already holds keeps its place in the document.
 */
export const NEXT_PART_FIGURES: Record<string, SeedMetric> = {
  /* THE DAY is the earliest part still open, as `plan-next-due` is, so it is a day already gone when that part is late.

     THE AMOUNT is what is left to pay, less what is left once the next part is paid. `left_after` of a part is the
     plan's open parts due after it (`lists/installments.ts`), so it falls as the parts go and the greatest of the open
     parts' is the earliest one's. Added up beside the sum of the open parts, the two leave that part's own amount without
     a figure that reads one row by another. Only what goes out, as the rest of the tile. */
  'installments-next-due-by-plan': {
    metric: 'installments-next-due-by-plan',
    name: 'Next part due, by plan',
    source: 'register.installments',
    where: 'state is open, direction is out',
    value: { min: 'due' },
    group_by: 'plan',
    format: 'day',
    target: { gte: 0 },
    ...ONCE,
  },

  'installments-left-by-plan': {
    metric: 'installments-left-by-plan',
    name: 'Left to pay, by plan',
    source: 'register.installments',
    where: 'state is open, direction is out',
    value: { sum: 'amount' },
    group_by: 'plan',
    format: MONEY,
    target: { gte: 0 },
    ...ONCE,
  },

  'installments-after-next-by-plan': {
    metric: 'installments-after-next-by-plan',
    name: 'Left once the next part is paid, by plan',
    source: 'register.installments',
    where: 'state is open, direction is out',
    value: { max: 'left_after' },
    group_by: 'plan',
    format: MONEY,
    target: { gte: 0 },
    ...ONCE,
  },
};

/**
 * THE DAY EACH PLAN ENDS, SINCE money-core 3.40.0 (1 Nov, M23: "say one row per plan ... last 9 Jul 2027"): the latest day
 * among its parts still open, which Instalments says beside what is next, so a plan's one track says when it is paid
 * off. Only what goes out, as the rest of the tile. Its own export, declared last in Money (`figures/index.ts`), so every
 * figure a record already holds keeps its place in the document.
 */
export const LAST_PART_FIGURES: Record<string, SeedMetric> = {
  'installments-last-due-by-plan': {
    metric: 'installments-last-due-by-plan',
    name: 'Last part due, by plan',
    source: 'register.installments',
    where: 'state is open, direction is out',
    value: { max: 'due' },
    group_by: 'plan',
    format: 'day',
    target: { gte: 0 },
    ...ONCE,
  },
};
