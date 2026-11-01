/** Payees: who money goes to and comes from, the most first. */

import type { SeedPage } from '../../base.ts';

/**
 * THE LAST NINETY DAYS OF WHAT MOVED, as the payee figures read them (`figures/payees.ts`): cleared, not between a
 * person's own accounts, and nothing dated ahead.
 */
const LEDGER_90D = 'state is cleared, transfer is false, stays is not true, corrects is not true, on after -90d, on before +1d';

/**
 * WHERE THE PAYMENTS NAMING NOBODY OPEN: THE SAME LINES THE FIGURE COUNTS (audit 2 B5). It opened every line out with no
 * payee, a pending one and any age among them, so the Ledger said "11 of 36 match, £17,015.74" under a lead of 10 and
 * £14,515.74. Now it is the figure's own sentence as chips, `LEDGER_90D` and all: cleared, not between your accounts,
 * not a correction, the last ninety days, money out, and no name in either field.
 */
const NAME_THEM =
  '/r/transactions?f=state:in:cleared&f=transfer:in:false&f=stays:not-in:true&f=corrects:not-in:true&f=on:after:-90d&f=on:before:%2B1d&f=direction:in:out&f=payee:is:empty&f=counterparty_text:is:empty';

/**
 * ONE PAGE UNDER MONEY, SINCE money-core 3.29.0: who money goes to and comes from, ONE LINE A PAYEE.
 *
 * A LIST OF PAYEES, AND NOTHING THE LEDGER OR REPORTS ALREADY DRAW (audit of 31 October, 10): the page repeated
 * Reports' ring of categories and the Ledger's newest lines (Tallyard and Lowry Street twice), said how often in a
 * second chart, and said the payments nobody was named on twice in two wordings. Now each payee is one bar: how much
 * was paid, how many times and the day of the last (`tally:`), the most paid first, and the payments naming nobody are
 * said once, with the way to name them. A bar opens that payee's lines.
 *
 * A PAYEE'S OWN PAGE IS THIS PAGE WITH ONE PAYEE PICKED. The strip over it names every payee (`filters`, by "Paid to or
 * from"), and picking one narrows every block to that payee: how much, how often and when last, and the category it
 * usually goes under.
 *
 * THE CATEGORY A PAYEE USUALLY GOES UNDER IS A FILING RULE THAT READS THE PAYEE (`filing_rules`), the record's own
 * answer to "always file Talabat under Outing", so it is listed from the rules and changed there, and never guessed from
 * the entries.
 *
 * NO PICTURE IS FETCHED FOR A PAYEE: a payee is drawn by its name, and by its category's chip where it has one.
 */
export const MONEY_PAYEES_PAGE: SeedPage = {
  page: 'money-payees',
  title: 'Payees',
  nav: { section: 'Money', order: 17 },
  icon: 'store',
  requires: ['register.transactions', 'register.filing_rules', 'register.payee_names'],
  pack: 'money-core',
  filters: [{ field: 'payee', control: 'chips' }],
  blocks: [
    {
      /* THE PAYMENTS THAT NAME NOBODY, SAID ONCE AND ONLY WHILE THERE ARE ANY, with the way to name them (audit 2 B5). A
         line the bank named is a payee by those words, as the Ledger draws it, so what is left is a line with no name in
         either field; the bars below are who was paid, and their own empty line says when nobody was. The lead said
         "6 payees paid" over a bar of Paperhaus Supplies' seven lines counted as nobody. */
      kind: 'note',
      lead: true,
      span: 12,
      when: { metric: 'unnamed-paid-90d', gt: 0 },
      body: `In 90 days, {{unnamed-paid-90d}} payment(s) have no name yet. [Name them](${NAME_THEM})`,
    },
    {
      /* EVERY PAYEE, ONE BAR EACH, the most paid first: what was paid, added up where it is drawn so two currencies are two
         amounts, and beside it how many times and the day of the last (`tally:`). A line with no payee is the payee the
         bank named (`or:`, as the bank wrote it, said in words), so Paperhaus Supplies is a bar of its own. The payments
         that name nobody in either field are the bar's last line, "Not named yet", which opens them; how many they are
         is the lead's to say. */
      kind: 'bar',
      heading: 'Who you paid, 90 days',
      icon: 'store',
      span: 12,
      source: 'register.transactions',
      where: `${LEDGER_90D}, direction is out`,
      columns: [{ field: 'payee', or: 'counterparty_text' }, { field: 'amount' }],
      unset: 'Not named yet',
      tally: true,
      limit: 30,
      empty: 'Nobody paid in 90 days.',
    },
    {
      /* THE NAMES YOU GAVE, SINCE money-core 3.34.0 (next-money, M9): what a bank writes and the name read for it, so
         "GOOGLE *WORKSPACE" is Google Workspace on every line, the ones already there and every one after
         (`lists/payee-names.ts`). With none yet, one line says what a name does and where to give one. */
      kind: 'table',
      heading: 'Payee names',
      icon: 'tag',
      span: 12,
      source: 'register.payee_names',
      columns: [
        { field: 'match', label: 'When the bank writes', width: 'minmax(14ch,1fr)' },
        { field: 'name', label: 'Call it', width: 'minmax(14ch,1fr)' },
      ],
      order: [{ field: 'name', dir: 'asc' }],
      limit: 60,
      empty: 'No payee names yet. [Give one](/r/payee_names?new=1) to read "GOOGLE *WORKSPACE" as Google Workspace on every line.',
    },
    {
      /* THE CATEGORY EACH PAYEE GOES UNDER, as the rules that read the payee file it. */
      kind: 'table',
      heading: 'Usual category',
      icon: 'tag',
      span: 12,
      source: 'register.filing_rules',
      where: 'reads is payee, state is on',
      columns: [
        { field: 'match', label: 'Payee', width: 'minmax(14ch,1fr)' },
        /* NO "WHICH WAY" COLUMN, SINCE money-core 3.34.0 (next-money, M29): it said "Money out" on every row. */
        { field: 'category', label: 'Category', width: 'minmax(10ch,18ch)' },
      ],
      order: [{ field: 'match', dir: 'asc' }],
      limit: 60,
      empty: 'No usual categories yet.',
    },
    {
      /* WHO PAID IN, folded at the end. */
      kind: 'section',
      heading: 'Money in',
      icon: 'hand-coins',
      span: 12,
      fold: true,
      when: { metric: 'received-30d', gt: 0 },
    },
    {
      kind: 'bar',
      heading: 'Who paid you, 90 days',
      icon: 'hand-coins',
      span: 12,
      source: 'register.transactions',
      where: `${LEDGER_90D}, direction is in`,
      columns: [{ field: 'payee', or: 'counterparty_text' }, { field: 'amount' }],
      unset: 'Not named yet',
      tally: true,
      limit: 15,
      empty: 'Nothing in for 90 days.',
    },
  ],
};
