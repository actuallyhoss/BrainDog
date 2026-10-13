/**
 * Who filed the Ledger, in view (REC-B20 job 2): two figures over who MADE each Ledger entry, read from the record's
 * history (`events.<list>`, `packages/kernel/src/metrics.ts`). "Agents do the legwork in view" (DIRECTION, D2.17): who
 * wrote an entry was always in the history, and Money said none of it.
 *
 * BOTH ARE COUNTS OF WHAT WAS MADE, NEVER SUMS, so no two currencies meet in them. An entry counts once, under whoever
 * made it, whatever was done to it after: a person who edits what a bank add-on filed has filed nothing. The window is
 * the day an entry was MADE, not the day it is dated `on`: a message that files last month's payment today was filed
 * today. Each reading carries its parts by who, each by a name: a person, an agent, a bank add-on, a rule, a script, or
 * the record itself.
 *
 * NEITHER IS JUDGED: the target is nought or more. A person who types their own Ledger misses no mark, and a count that
 * is told and not marked needs no deeper red.
 *
 * `pack` NAMES THEIR HOME, as `nights-missed-30d` does: the source names no `register.<list>`, so the split would leave
 * them in no pack.
 *
 * THIS FILE REGISTERS NOTHING. The group joins Money with the version that spreads it into `figures/index.ts`.
 */

import type { SeedMetric } from '../../base.ts';

export const FILING_FIGURES: Record<string, SeedMetric> = {
  /**
   * HOW MANY LEDGER ENTRIES ANYTHING BUT A PERSON MADE IN 30 DAYS: an agent, a bank add-on's pattern, a rule, a script
   * or the record. `by is not person` is the one thing this source narrows by. Its parts say which of them, by name.
   */
  'filed-for-you-30d': {
    metric: 'filed-for-you-30d',
    pack: 'money-core',
    name: 'Filed for you, 30 days',
    source: 'events.transactions',
    where: 'by is not person',
    value: { count: 'made' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /**
   * HOW MANY LEDGER ENTRIES WERE MADE TODAY, BY WHO. Everybody, the person included: the parts are what a line under the
   * Ledger reads to say "The bank add-on filed 6 today".
   */
  'filed-today': {
    metric: 'filed-today',
    pack: 'money-core',
    name: 'Filed today',
    source: 'events.transactions',
    value: { count: 'made' },
    format: 'int',
    target: { gte: 0 },
    window: '1d',
    compare: 'none',
  },
};
