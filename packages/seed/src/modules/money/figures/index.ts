/**
 * Money's figures, in the order a record has always held them. Each group is its own file, cut out of `money.ts` with no
 * change, the signs of life added after them, and the order of the spreads here is the order of
 * the document, which the pinned fingerprint holds.
 */

import type { SeedMetric } from '../../base.ts';
import { withTargetSetting, type Decl } from '../settings.ts';
import { ACCOUNT_FIGURES } from './accounts.ts';
import { CASH_FIGURES } from './cash.ts';
import { DIRECTION_FIGURES } from './direction.ts';
import { DUE_FIGURES } from './due.ts';
import { FILING_FIGURES } from './filing.ts';
import { FLOW_FIGURES } from './flow.ts';
import { BOOK_FIGURES } from './books.ts';
import { BUDGET_FIGURES } from './budgets.ts';
import { BUDGET_PAGE_FIGURES } from './budgets2.ts';
import { HEALTH_FIGURES } from './health.ts';
import { INSTALMENTS_FIGURES, LATE_PART_FIGURES } from './instalments.ts';
import { PAYEE_FIGURES } from './payees.ts';
import { LAST_PART_FIGURES, NEXT_PART_FIGURES, PLAN_FIGURES, PLAN_PAGE_FIGURES, PLANS_FIGURES } from './plans.ts';
import { RUNWAY_FIGURES } from './runway.ts';
import { SIGNS_FIGURES } from './signs.ts';
import { SPEND_VS_LAST_FIGURES, SPENDING_FIGURES } from './spending.ts';
import { WORTH_FIGURES } from './worth.ts';
import { WEEKLY_FIGURES } from './weekly.ts';

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
     Whether Money is being kept at all, since money-core 3.15.0. Last, so every figure above keeps its
     place in the document. */

  ...SIGNS_FIGURES,

  /* ── which way a category is for ─────────────────────────────────────────
     The categories an entry going the other way points at, since money-core 3.16.0. After the signs,
     so every figure above keeps its place in the document. */

  ...DIRECTION_FIGURES,
  /* WHO FILED THE LEDGER, SINCE money-core 3.17.0 (filing-figures-61): two counts of the entries made, by
     who made them, read from the Ledger's own history. LAST, so every figure above keeps its place in the document. */
  ...FILING_FIGURES,

  /* ── this month against last ─────────────────────────────────────────────
     Where the money went last month, and this month so far against it, by category (spend-figures-63).
     They read the Ledger as `SPENDING_FIGURES` does and are NOT spread with it: LAST, so every figure above keeps its
     place in the document. */

  ...SPEND_VS_LAST_FIGURES,

  /* THE DAY A CATEGORY PASSED ITS BUDGET, SINCE money-core 3.17.0 (budget-passed-on-68): one running
     total with a stop. After the spend figures, so every figure above keeps its place in the document. */
  ...BUDGET_FIGURES,

  /* A PLAN'S OWN FIGURES AND THE TWO BY PLAN, SINCE money-core 3.17.0 (plan-page-68): what the page of one plan
     reads. LAST, so every figure above keeps its place in the document. */
  ...PLAN_FIGURES,
  ...PLANS_FIGURES,

  /* A BOOK'S OWN MONTH, AND WHAT IS FILED IN NO BOOK (book-figures-71): money in, money out and what is
     left, read once per book, and a count a list of what no book holds. LAST, so every figure above keeps its place in
     the document. */
  ...BOOK_FIGURES,

  /* THE NEXT UNPAID PART OF EACH PLAN, SINCE money-core 3.17.0 (money F5): the day, what is left
     and what is left once that part is paid, which Instalments says under each bar. LAST, so every figure above keeps its
     place in the document. */
  ...NEXT_PART_FIGURES,

  /* THE PARTS LATE, SINCE money-core 3.18.0: what Money's first line and Heads up name when
     a part's day has gone. LAST, so every figure above keeps its place in the document. */
  ...LATE_PART_FIGURES,

  /* THE FIGURES OF MONEY'S OWN PAGES, SINCE money-core 3.29.0: Budgets, Payees, and how healthy the money is. LAST, so
     every figure above keeps its place in the document. */
  ...BUDGET_PAGE_FIGURES,
  ...PAYEE_FIGURES,
  ...HEALTH_FIGURES,
  ...ACCOUNT_FIGURES,

  /* WHAT A PLAN'S PAGE SUMS UP, SINCE money-core 3.29.0: what is late, the parts cancelled, the plan's track with
     its next part, and what was paid each quarter. LAST, so every figure above keeps its place in the document. */
  ...PLAN_PAGE_FIGURES,

  /* NET WORTH WITH WHAT THE ADD-ONS HOLD, SINCE money-core 3.31.0: what is held beyond cash, what is owed over time, and
     the two with cash and the bills, remembered each night. LAST, so every figure above keeps its place in the document. */
  ...WORTH_FIGURES,

  /* ONE CATEGORY OR ONE PAYEE BY WEEK, SINCE money-core 3.32.0: what a widget made by saying "by week" draws. LAST, so
     every figure above keeps its place in the document. */
  ...WEEKLY_FIGURES,

  /* THE DAY EACH PLAN ENDS, SINCE money-core 3.40.0: what Instalments says beside a plan's next part. LAST, so every
     figure above keeps its place in the document. */
  ...LAST_PART_FIGURES,
};

/* EACH FIGURE WHOSE TARGET A PERSON CHANGES LATER NAMES ITS SETTING (`MONEY_TARGET_SETTINGS`), wherever Money is declared. */
export const MONEY_METRICS: Record<string, SeedMetric> = Object.fromEntries(
  Object.entries(DECLARED_METRICS).map(([id, m]) => [id, withTargetSetting(m as unknown as Decl) as unknown as SeedMetric]),
);
