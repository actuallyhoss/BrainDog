/** Filing rules: which text files a Ledger entry under which category. */

import type { MoneyRegister } from './shared.ts';

/**
 * A TEXT, HOW MUCH OF IT MUST BE THERE, AND THE CATEGORY IT FILES UNDER, SINCE money-core 3.17.0 (REC-B10).
 * "Categorising rules: prefix, contains, regex, ranked, dry run" (the owner's words).
 *
 * A LIST OF ITS OWN, AND IT WAS ONE FIELD ON A CATEGORY. A category held one "Matches", so a shop a bank writes two
 * ways needed two categories or a person, and nothing said which way the money had to be going. Here one category has
 * as many rules as it has spellings, each rule says which way it files, and switching one off keeps it and its count.
 *
 * `txn-categorise` (`../rules.ts`) READS THIS LIST AND NOTHING ELSE DOES THE FILING. It finds the one rule whose text
 * fits the entry, by the record's ladder (the whole text, how it starts, anywhere in it, a pattern, and on one rung the
 * longest text), among the rules that are on, go the entry's way and name its account or none. Two rules that fit
 * equally file nothing: "no category is better than a wrong one" (the owner's words).
 */
export const FILING_RULES_REGISTER: MoneyRegister = {
  id: 'filing_rules',
  name: 'Filing rules',
  icon: 'tag',
  one: 'filing rule',
  holds: 'which text on a ledger entry files it under which category',
  title: 'match',
  mobile: ['match', 'category', 'state'],
  state: 'state',
  done: ['off'],
  pack: 'money-core',
  fields: [
    /* THE TEXT AS THE BANK WRITES IT, or a pattern when `match_by` says so. Indexed, since the first rung of the ladder
       is an equality on it. Not unique: one text may file money out under one category and money in under another. */
    { id: 'match', label: 'Matches', type: 'text', required: true, index: true, search: true },
    /**
     * HOW MUCH OF THE TEXT `match` MUST BE. The name and the first three values are the ones the record's ladder reads
     * beside a `match` (`match_by`; `linkOf` in `packages/kernel/src/rules.ts`), as on a category.
     *
     * A PATTERN IS A REGULAR EXPRESSION, read without regard to case and tried on the first 512 characters, so
     * `TALABAT|TLBT` files both spellings of one shop. The record refuses one it could not run safely as it is written:
     * longer than 120 characters, one that does not compile, or more than two of `*` and `+`.
     */
    {
      id: 'match_by',
      label: 'How it matches',
      type: 'enum',
      values: ['exact', 'starts', 'contains', 'pattern'],
      labels: { exact: 'The whole of it', starts: 'How it starts', contains: 'Anywhere in it', pattern: 'A pattern' },
      default: 'starts',
      required: true,
    },
    /* WHICH TEXT OF THE ENTRY IS READ. A bank message names the shop in "Paid to or from" and puts a reference in the
       description, and an entry typed by hand often has the description alone. A rule that reads "Paid to or from" is
       tried first, and one that reads the description files only where none of those fits. */
    {
      id: 'reads',
      label: 'Reads',
      type: 'enum',
      values: ['payee', 'description'],
      labels: { payee: 'Paid to or from', description: 'The description' },
      default: 'payee',
      required: true,
    },
    /* WHICH WAY THE MONEY MUST BE GOING. "a rule pointing at an income category is skipped on a debit" (the owner's
       words): a rule for money in never files money out, whatever the text says. Either way is for a text that means
       one thing both ways, such as a refund from the shop that was paid. */
    {
      id: 'direction',
      label: 'Which way',
      type: 'enum',
      values: ['in', 'out', 'either'],
      labels: { in: 'Money in', out: 'Money out', either: 'Either way' },
      default: 'out',
      index: true,
      required: true,
    },
    { id: 'category', type: 'ref', to: 'categories', index: true, required: true },
    /* OPTIONAL: empty means every account. With an account, the rule files entries on that account alone, for a text
       that means one thing on a business card and another on a personal one. */
    { id: 'account', label: 'Only on', type: 'ref', to: 'accounts' },
    /* A PERSON'S OWN ORDER FOR THE PAGE. The ladder does not read it: the rung and then the longer text decide. */
    { id: 'rank', label: 'Order', type: 'int', min: 1 },
    { id: 'state', label: 'Status', type: 'enum', values: ['on', 'off'], labels: { on: 'On', off: 'Off' }, default: 'on', index: true, required: true },
    { id: 'note', type: 'text' },
  ],
};
