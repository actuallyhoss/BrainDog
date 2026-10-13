/**
 * Money's figures, in the order a record has always held them. Each group is its own file, cut out of `money.ts` with no
 * change (REC-B01 job 1), the signs of life added after them (job 3), and the order of the spreads here is the order of
 * the document, which the pinned fingerprint holds.
 */

import type { SeedMetric } from '../../base.ts';
import { withTargetSetting, type Decl } from '../settings.ts';
import { CASH_FIGURES } from './cash.ts';
import { DIRECTION_FIGURES } from './direction.ts';
import { DUE_FIGURES } from './due.ts';
import { FILING_FIGURES } from './filing.ts';
import { FLOW_FIGURES } from './flow.ts';
import { BUDGET_FIGURES } from './budgets.ts';
import { INSTALMENTS_FIGURES } from './instalments.ts';
import { PLAN_FIGURES, PLANS_FIGURES } from './plans.ts';
import { RUNWAY_FIGURES } from './runway.ts';
import { SIGNS_FIGURES } from './signs.ts';
import { SPEND_VS_LAST_FIGURES, SPENDING_FIGURES } from './spending.ts';

const DECLARED_METRICS: Record<string, SeedMetric> = {
  ...CASH_FIGURES,
  ...RUNWAY_FIGURES,
  ...FLOW_FIGURES,
  ...DUE_FIGURES,
  ...SPENDING_FIGURES,

  /* ── what comes round ────────────────────────────────────────────────────
     ONE NAME PER READING. `every-month-out` and `every-month-in` read `recurring`, the list a repeating item lives in,
     and there is no second pair over the same rows; the ids are the ones the page, the target settings and the
     personal use case already name. */

  ...INSTALMENTS_FIGURES,

  /* ── signs of life ───────────────────────────────────────────────────────
     Whether Money is being kept at all, since money-core 3.15.0 (REC-B01 job 3). Last, so every figure above keeps its
     place in the document. */

  ...SIGNS_FIGURES,

  /* ── which way a category is for ─────────────────────────────────────────
     The categories an entry going the other way points at, since money-core 3.16.0 (REC-A13 job 2). After the signs,
     so every figure above keeps its place in the document. */

  ...DIRECTION_FIGURES,
  /* WHO FILED THE LEDGER, SINCE money-core 3.17.0 (REC-B20 job 2, filing-figures-61): two counts of the entries made, by
     who made them, read from the Ledger's own history. LAST, so every figure above keeps its place in the document. */
  ...FILING_FIGURES,

  /* ── this month against last ─────────────────────────────────────────────
     Where the money went last month, and this month so far against it, by category (REC-B19 job 2, spend-figures-63).
     They read the Ledger as `SPENDING_FIGURES` does and are NOT spread with it: LAST, so every figure above keeps its
     place in the document. */

  ...SPEND_VS_LAST_FIGURES,

  /* THE DAY A CATEGORY PASSED ITS BUDGET, SINCE money-core 3.17.0 (REC-B19 step 4, budget-passed-on-68): one running
     total with a stop. After the spend figures, so every figure above keeps its place in the document. */
  ...BUDGET_FIGURES,

  /* A PLAN'S OWN FIGURES AND THE TWO BY PLAN, SINCE money-core 3.17.0 (REC-B12, plan-page-68): what the page of one plan
     reads. LAST, so every figure above keeps its place in the document. */
  ...PLAN_FIGURES,
  ...PLANS_FIGURES,
};

/* EACH FIGURE WHOSE TARGET A PERSON CHANGES LATER NAMES ITS SETTING (`MONEY_TARGET_SETTINGS`), wherever Money is declared. */
export const MONEY_METRICS: Record<string, SeedMetric> = Object.fromEntries(
  Object.entries(DECLARED_METRICS).map(([id, m]) => [id, withTargetSetting(m as unknown as Decl) as unknown as SeedMetric]),
);
