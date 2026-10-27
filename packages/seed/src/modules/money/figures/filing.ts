/**
 * Who filed the Ledger, in view (REC-B20 job 2): two figures over who MADE each Ledger entry, read from the record's
 * history (`events.<list>`, `packages/kernel/src/metrics.ts`). Agents do the legwork in view: who
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
 * AND FOUR OVER WHICH RULE FILED EACH ENTRY, SINCE REC-B10 job 10: read from the Ledger's own `filed_by`, counts again,
 * for the page Filing rules (`pages/rules.ts`). Judged by nothing either: a rule that files nothing is not late.
 *
 * THIS FILE REGISTERS NOTHING. The group joins Money with the version that spreads it into `figures/index.ts`.
 */

import type { SeedMetric } from '../../base.ts';

export const FILING_FIGURES: Record<string, SeedMetric> = {
  /**
   * HOW MANY LEDGER ENTRIES WERE FILED FOR A PERSON IN 30 DAYS: by an agent, a bank add-on's pattern or a rule somebody
   * declared. Its parts say which of them, by name.
   *
   * THE THREE ARE NAMED, NOT "anything but a person". The record's own hand and a script are not
   * legwork done for anybody, and a record brought in from a file is signed by the record: read as `by is not person`,
   * the day of an import said every line it copied had been filed for you.
   *
   * WHAT THIS CANNOT YET LEAVE OUT is `braindog import`, which writes as a run of its own and so reads as an agent. The
   * source narrows by `by` alone, and telling that run apart is the kernel's (`makerOf`).
   */
  'filed-for-you-30d': {
    metric: 'filed-for-you-30d',
    pack: 'money-core',
    name: 'Filed for you, 30 days',
    source: 'events.transactions',
    where: 'by is agent or door or rule',
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

  /**
   * HOW MANY LEDGER ENTRIES EACH FILING RULE FILED, SINCE money-core 3.17.0 (REC-B10 job 10): every entry whose
   * `filed_by` names a rule, in parts by that rule, each part called by the rule's own text (`label`). The page Filing
   * rules draws the parts (`pages/rules.ts`), so a person sees which rules work and which file nothing.
   *
   * READ FROM THE LEDGER AND NOT ITS HISTORY, as the two above are: `txn-categorise` writes the rule into `filed_by` in
   * the step that writes the category, so the entry says which rule filed it for as long as it stands. An entry a person
   * filed again by hand keeps the rule that filed it first; one deleted is in no part.
   *
   * A COUNT, NEVER A SUM, so no two currencies meet in it, and ALL TIME, so a rule switched off keeps its count.
   */
  'rule-filed': {
    metric: 'rule-filed',
    pack: 'money-core',
    name: 'Filed by each rule',
    source: 'register.transactions',
    where: 'filed_by is set',
    value: { count: 'id' },
    group_by: 'filed_by',
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /**
   * THE SAME, OVER THE ENTRIES MADE IN THE LAST THIRTY DAYS: the day an entry was made, as `filed-for-you-30d` reads
   * it, and not the day it is dated, so a message that files last month's payment today counts today. The page's lead
   * sentence reads it whole ("2 rules filed 5 of your entries in the last 30 days").
   */
  'filed-by-rule-30d': {
    metric: 'filed-by-rule-30d',
    pack: 'money-core',
    name: 'Filed by a rule, 30 days',
    source: 'register.transactions',
    where: 'filed_by is set, created_at after -30d',
    value: { count: 'id' },
    group_by: 'filed_by',
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /** HOW MANY RULES FILED ANYTHING IN THOSE THIRTY DAYS: the first count of the same sentence, over the same entries. */
  'rules-filing-30d': {
    metric: 'rules-filing-30d',
    pack: 'money-core',
    name: 'Rules that filed, 30 days',
    source: 'register.transactions',
    where: 'filed_by is set, created_at after -30d',
    value: { distinct: 'filed_by' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /** HOW MANY RULES HAVE EVER FILED ANYTHING, so the parts of `rule-filed` are drawn as bars only from two of them. */
  'rules-filing': {
    metric: 'rules-filing',
    pack: 'money-core',
    name: 'Rules that filed',
    source: 'register.transactions',
    where: 'filed_by is set',
    value: { distinct: 'filed_by' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
};
