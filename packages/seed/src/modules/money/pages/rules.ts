/** Filing rules' page: each rule, what it files under, how many entries it filed, and what it filed last. */

import type { SeedPage } from '../../base.ts';

/** Drawn only once a rule has filed something, ever. */
const HAS_FILED = { metric: 'rule-filed', gte: 1 };

/**
 * ONE PAGE, UNDER MONEY, SINCE money-core 3.17.0: what the record has learnt to file by itself, rule by
 * rule: a page Filing rules under Money, with each rule, its category, how many rows it filed and the day of the
 * last. It is where a person sees the rules work, and turns a wrong one off from the rule it opens.
 *
 * EVERY COUNT IS OF ENTRIES, NEVER OF THEIR MONEY (`figures/filing.ts`), so a rule that files pounds and dollars counts
 * both and adds neither. The counts are read off the Ledger's `filed_by`, which the step that files the category writes,
 * so the page cannot disagree with the Ledger.
 *
 * THREE LEAD SENTENCES AND ONE DRAWN: nothing filed yet, which says how a rule comes to be; something filed in the last
 * thirty days, which says how much; and rules that filed before and not lately, which says so and the count in all.
 *
 * THE BARS WAIT FOR TWO RULES, as Money's bars by book wait for two books: one rule's count is the lead's own number,
 * and a bar of one part says nothing a sentence does not. THE DAY OF THE LAST is said by the entries rules filed lately,
 * each beside the rule that filed it, the newest first: a part of a figure carries one number, its count, and no day.
 */
export const MONEY_RULES_PAGE: SeedPage = {
  page: 'money-rules',
  title: 'Filing rules',
  /* AFTER A PLAN'S PAGES, which are 30: the books, the plans, and then how the Ledger files itself. */
  nav: { section: 'Money', order: 40 },
  icon: 'tag',
  requires: ['register.filing_rules', 'register.transactions'],
  pack: 'money-core',
  blocks: [
    {
      /* NOTHING FILED YET: what a rule is for, and where one comes from, in place of a count of nought. */
      kind: 'note',
      lead: true,
      span: 12,
      when: { metric: 'rule-filed', lt: 1 },
      body: 'No rule has filed anything yet.',
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
      body: '{{txn-uncategorised}} entries with no category. [File them](/automations/txn-categorise?again=1)',
    },
    {
      /* EVERY RULE, ON OR OFF, in the person's own order and then by its text. A rule opens from its line, where it
         is switched off; one that is off keeps its count below. */
      kind: 'table',
      heading: 'Rules',
      icon: 'tag',
      span: 12,
      source: 'register.filing_rules',
      columns: [
        { field: 'match', label: 'Matches', width: 'minmax(14ch,1fr)' },
        { field: 'match_by', label: 'How it matches', width: '16ch' },
        { field: 'category', label: 'Category', width: 'minmax(10ch,18ch)' },
        { field: 'state', label: 'Status', width: '8ch' },
      ],
      order: [
        { field: 'rank', dir: 'asc' },
        { field: 'match', dir: 'asc' },
      ],
      limit: 120,
      empty: 'No filing rules yet.',
    },
    {
      /* HOW MANY ENTRIES EACH RULE FILED, ALL TIME, the most first, each by the rule's own text. */
      kind: 'bar',
      heading: 'Entries each rule filed',
      icon: 'chart-bar',
      span: 12,
      source: 'metric.rule-filed',
      when: { metric: 'rules-filing', gte: 2 },
      empty: 'No rule has filed anything yet.',
    },
    {
      /* WHAT THE RULES FILED LAST, the newest first, so the day each rule last filed is on the line beside it. */
      kind: 'table',
      heading: 'Filed lately',
      icon: 'history',
      span: 12,
      source: 'register.transactions',
      where: 'filed_by is set',
      columns: [
        { field: 'filed_by', label: 'Rule', width: 'minmax(12ch,18ch)' },
        { field: 'what', label: 'Description', width: 'minmax(14ch,1fr)' },
        { field: 'category', label: 'Category', width: 'minmax(10ch,18ch)' },
        { field: 'on', label: 'Date', width: '13ch', align: 'end' },
      ],
      order: [{ field: 'created_at', dir: 'desc' }],
      limit: 6,
      when: HAS_FILED,
    },
  ],
};
