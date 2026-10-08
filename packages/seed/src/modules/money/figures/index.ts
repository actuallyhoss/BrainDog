/**
 * Money's figures, in the order a record has always held them. Each group is its own file, cut out of `money.ts` with no
 * change (REC-B01 job 1), and the order of the spreads here is the order of the document, which the pinned fingerprint
 * holds.
 */

import type { SeedMetric } from '../../base.ts';
import { withTargetSetting, type Decl } from '../settings.ts';
import { CASH_FIGURES } from './cash.ts';
import { DUE_FIGURES } from './due.ts';
import { FLOW_FIGURES } from './flow.ts';
import { INSTALMENTS_FIGURES } from './instalments.ts';
import { RUNWAY_FIGURES } from './runway.ts';
import { SPENDING_FIGURES } from './spending.ts';

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
};

/* EACH FIGURE WHOSE TARGET A PERSON CHANGES LATER NAMES ITS SETTING (`MONEY_TARGET_SETTINGS`), wherever Money is declared. */
export const MONEY_METRICS: Record<string, SeedMetric> = Object.fromEntries(
  Object.entries(DECLARED_METRICS).map(([id, m]) => [id, withTargetSetting(m as unknown as Decl) as unknown as SeedMetric]),
);
