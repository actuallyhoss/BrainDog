/** Categories: what money is for. */

import type { MoneyRegister } from './shared.ts';

/**
 * WHAT MONEY IS FOR. A ledger with no categories is a list of amounts, and a list of amounts cannot
 * answer the one question anybody asks of it. `budget` is what a person means by "no more than this
 * a month", held on the category rather than typed into a figure, so changing it is an edit to a row.
 */
export const CATEGORIES_REGISTER: MoneyRegister = {
  id: 'categories',
  name: 'Categories',
  icon: 'tag',
  one: 'category',
  holds: 'what money is for, so a ledger can be read by where it goes',
  title: 'name',
  mobile: ['name', 'direction', 'budget'],
  state: 'state',
  done: ['retired'],
  pack: 'money-core',
  fields: [
    /* UNIQUE, because two categories with one name is how a month's spending ends up split across
       two bars that a person reads as two different things. */
    { id: 'name', type: 'text', required: true, unique: true, search: true },
    /* WHICH WAY A CATEGORY IS FOR. `32-PARITY` §3.2's direction guard is this field: a rule pointing
       at an income category has no business on a payment out, and a person filing by hand is offered
       the ones that can be right. `both` is for the legs of a transfer, which are neither. */
    {
      id: 'direction',
      label: 'Which way',
      type: 'enum',
      values: ['in', 'out', 'both'],
      labels: { in: 'Money in', out: 'Money out', both: 'Either way' },
      index: true,
      required: true,
    },
    /* THE COUNTERPARTY AS THE BANK WRITES IT, which is what `txn-categorise` linked on until money-core 3.17.0. */
    { id: 'match', label: 'Matches', type: 'text', index: true },
    /**
     * HOW MUCH OF A DESCRIPTION `match` MUST BE, SINCE money-core 3.0.0: the whole of it, how it starts, or anywhere
     * in it. A bank writes one shop as `FENWICK CLOUD` on Monday and `FENWICK CLOUD LTD 4471` on Friday, and an
     * equality files the first and leaves the second for a person. `exact` is the default and what every category
     * before this meant, so nothing a record already files moves.
     *
     * `pattern`, SINCE money-core 3.17.0, is the ladder's fourth rung: `match` is then a regular expression, read
     * without regard to case, so `TALABAT|TLBT` is one shop. The filing itself reads `filing_rules` from that version
     * (`./filing-rules.ts`), and this field and `match` stay for one version so each can become a rule.
     */
    {
      id: 'match_by',
      label: 'How it matches',
      type: 'enum',
      values: ['exact', 'starts', 'contains', 'pattern'],
      labels: { exact: 'The whole description', starts: 'How it starts', contains: 'Anywhere in it', pattern: 'A pattern' },
      default: 'exact',
    },
    /* `Most a month`, AND IT WAS `No more than, a month`. A page prints its own `where:` back using
       each field's label, and the sentence grammar splits clauses on commas, so a label with a
       comma in it could not be typed or pasted back: `no more than: categories has no field called
       no`. The test that says every field is reachable by the name the screen shows caught it. */
    { id: 'budget', label: 'Most a month', type: 'money' },
    { id: 'state', label: 'Status', type: 'enum', values: ['live', 'retired'], default: 'live', index: true, required: true },
    { id: 'note', type: 'text' },
  ],
};
