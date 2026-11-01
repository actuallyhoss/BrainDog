/** Filing rules' page: each rule, what it files under, how many entries it filed, and what it filed last. */

import type { SeedPage } from '../../base.ts';
import { LEDGER_LINE_COLUMNS } from './ledger.ts';

/** Drawn only once a rule has filed something, ever. */
const HAS_FILED = { metric: 'rule-filed', gte: 1 };

/** Drawn only once there is a rule, on or off. */
const HAS_RULES = { metric: 'filing-rules', gte: 1 };

/** The box that writes a new rule: the list's own form, opened by the address (`?new=1`). */
const ADD_RULE = '/r/filing_rules?new=1';

/**
 * ONE PAGE, UNDER MONEY, SINCE money-core 3.17.0: what the record has learnt to file by itself, rule by
 * rule: a page Filing rules under Money, with each rule, its category, how many rows it filed and the day of the
 * last. It is where a person sees the rules work, and turns a wrong one off from the rule it opens.
 *
 * EVERY COUNT IS OF ENTRIES, NEVER OF THEIR MONEY (`figures/filing.ts`), so a rule that files pounds and dollars counts
 * both and adds neither. The counts are read off the Ledger's `filed_by`, which the step that files the category writes,
 * so the page cannot disagree with the Ledger.
 *
 * FOUR LEAD SENTENCES AND ONE DRAWN: no rule yet, which says what one does and how to add one; rules that have filed
 * nothing; something filed in the last thirty days, which says how much; and rules that filed before and not lately,
 * which says so and the count in all.
 *
 * EVERY RULE IS A CARD WITH WHAT IT FILED, SINCE THE AUDIT OF 31 OCTOBER (11): the page said "No rule has filed anything
 * yet." over a record with no rules, listed none, and had no way to add one, while the Ledger said "Filed for you 2" (lines
 * a bank's statement brought in, which the Ledger now says as added). Now a record with no rule is told so with the way to
 * add one, and each rule that is on is a card: its text, the category it files under, how it matches and how many lines it
 * filed (`filing-rule-filed`, read once a card). One switched off is listed apart. THE DAY OF THE LAST is said by the
 * lines rules filed lately, each beside the rule that filed it, the newest first.
 */
export const MONEY_RULES_PAGE: SeedPage = {
  page: 'money-rules',
  title: 'Filing rules',
  /* AFTER A PLAN'S PAGES, which are 30: the books, the plans, and then how the Ledger files itself. */
  nav: { section: 'Money', order: 40 },
  icon: 'tag',
  requires: ['register.filing_rules', 'register.transactions'],
  pack: 'money-core',
  /* ADD A RULE IS THE HEAD'S ONE BUTTON, SINCE money-core 3.34.0 (next-money, M31): it was an underlined link alone in a
     tile of its own under the rules. The head's Add opens the list's form for a filing rule (`PageView.svelte`). */
  header: { action: { verb: 'row.create', label: 'Add a rule' } },
  blocks: [
    {
      /* NO RULE YET: what one does, and the way to add one, in place of a count of nought. */
      kind: 'note',
      lead: true,
      span: 12,
      when: { metric: 'filing-rules', lt: 1 },
      body: `No filing rules yet. A rule puts a line under a category as it comes in. [Add a rule](${ADD_RULE})`,
    },
    {
      /* RULES, AND NONE HAS FILED A LINE: said, never "0 rules filed 0". */
      kind: 'note',
      lead: true,
      span: 12,
      when: { all: [HAS_RULES, { metric: 'rule-filed', lt: 1 }] },
      body: 'No rule has filed a line yet.',
    },
    {
      /* WHAT THE RULES DID THIS MONTH, as one line: how many rules, and how many entries between them. */
      kind: 'note',
      lead: true,
      span: 12,
      when: { metric: 'filed-by-rule-30d', gte: 1 },
      body: '{{rules-filing-30d}} rule(s) filed {{filed-by-rule-30d}} line(s) in 30 days.',
    },
    {
      /* RULES THAT FILED BEFORE AND NOTHING LATELY: said in words, and never "0 rules filed 0". */
      kind: 'note',
      lead: true,
      span: 12,
      when: { all: [HAS_FILED, { metric: 'filed-by-rule-30d', lt: 1 }] },
      body: 'Nothing filed in 30 days. {{rule-filed}} before that.',
    },
    {
      /* FILE OLD ENTRIES, SINCE money-core 3.20.0 (B24 of 24 October): a rule files what is written after it, and the
         entries already there with no category wait for a rule made later. The link opens the filing rule's Run again,
         which says how many it would file before anything is written, and files them as one change one Undo takes back. */
      kind: 'note',
      span: 12,
      when: { metric: 'txn-uncategorised', gt: 0 },
      body: '{{txn-uncategorised}} line(s) with no category. [File them](/automations/txn-categorise?again=1)',
    },
    {
      /* EVERY RULE THAT IS ON, A CARD EACH, in the person's own order and then by its text: what it matches, the
         category it files under, how it matches, and how many lines it filed. A rule opens from its card, where it is
         changed or switched off. */
      kind: 'cards',
      heading: 'Rules',
      icon: 'tag',
      span: 12,
      source: 'register.filing_rules',
      where: 'state is on',
      /* THE TEXT AND WHERE IT FILES, SINCE money-core 3.34.0 (next-money, M30): "Matches How it starts" read as a field's
         name over its value, and "Lines filed 0" stood on every card under a line that says no rule has filed one. How a
         rule matches is on its own page, a press away, and what the rules filed is the line's. */
      columns: [
        { field: 'match', as: 'title' },
        { field: 'category', label: 'Files under', as: 'fact' },
      ],
      order: [
        { field: 'rank', dir: 'asc' },
        { field: 'match', dir: 'asc' },
      ],
      limit: 120,
    },
    /* NO "ADD A RULE" TILE UNDER THE RULES, SINCE money-core 3.34.0: the head's button adds one. */
    {
      /* RULES SWITCHED OFF, APART: kept with what they filed, and filing nothing new. */
      kind: 'table',
      heading: 'Switched off',
      icon: 'tag',
      span: 12,
      source: 'register.filing_rules',
      where: 'state is off',
      columns: [
        { field: 'match', label: 'Matches', width: 'minmax(14ch,1fr)' },
        { field: 'category', label: 'Files under', width: 'minmax(10ch,18ch)' },
      ],
      order: [{ field: 'match', dir: 'asc' }],
      limit: 120,
    },
    {
      /* WHAT THE RULES FILED LAST, as the Ledger draws its lines, the newest first, so the day a rule last filed is the
         day over its line. As a table it said each rule's text twice, as the rule and as the line's description. */
      kind: 'timeline',
      heading: 'Filed lately',
      icon: 'history',
      span: 12,
      source: 'register.transactions',
      where: 'filed_by is set, state is not void',
      columns: LEDGER_LINE_COLUMNS,
      order: [{ field: 'on', dir: 'desc' }],
      limit: 6,
      when: HAS_FILED,
    },
  ],
};
