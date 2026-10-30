/** Payees: who money goes to and comes from, the most first. */

import type { SeedPage } from '../../base.ts';

/**
 * THE LAST NINETY DAYS OF WHAT MOVED, as the payee figures read them (`figures/payees.ts`): cleared, not between a
 * person's own accounts, and nothing dated ahead.
 */
const LEDGER_90D = 'state is cleared, transfer is false, stays is not true, corrects is not true, on after -90d, on before +1d';

/** Where the lines no payee was put on open, the name box first. */
const NAME_THEM = '/r/transactions?f=payee:empty&f=direction:is:out&f=transfer:is:false';

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
  requires: ['register.transactions', 'register.filing_rules'],
  pack: 'money-core',
  filters: [{ field: 'payee', control: 'chips' }],
  blocks: [
    {
      /* THE PAYEES, AND THE PAYMENTS NAMING NOBODY IN THE SAME LINE while there are any, so that count is said once. */
      kind: 'note',
      lead: true,
      span: 12,
      when: { all: [{ metric: 'payees-paid-90d', gt: 0 }, { metric: 'unnamed-paid-90d', lt: 1 }] },
      body: '{{payees-paid-90d}} payee(s) paid in 90 days.',
    },
    {
      kind: 'note',
      lead: true,
      span: 12,
      when: { all: [{ metric: 'payees-paid-90d', gt: 0 }, { metric: 'unnamed-paid-90d', gt: 0 }] },
      body: `{{payees-paid-90d}} payee(s) paid in 90 days, and {{unnamed-paid-90d}} payment(s) name nobody yet. [Name them](${NAME_THEM})`,
    },
    {
      /* AND WHEN EVERY PAYMENT OUT NAMES NOBODY, the page opens on that, with the way to name them, in one line. */
      kind: 'note',
      lead: true,
      span: 12,
      when: { all: [{ metric: 'payees-paid-90d', lt: 1 }, { metric: 'unnamed-paid-90d', gt: 0 }] },
      body: `No payee named yet on {{unnamed-paid-90d}} payment(s) in 90 days. [Name them](${NAME_THEM})`,
    },
    {
      kind: 'note',
      lead: true,
      span: 12,
      /* ONLY WHEN NOTHING WENT OUT AT ALL (recheck of 30 October, N5): payments naming nobody are still payments, and
         "No payees paid" over a list of them said the page was empty while it was not. The line above asks to name them. */
      when: { all: [{ metric: 'payees-paid-90d', lt: 1 }, { metric: 'unnamed-paid-90d', lt: 1 }] },
      body: 'Nothing paid out in 90 days.',
    },
    {
      /* EVERY PAYEE, ONE BAR EACH, the most paid first: what was paid, added up where it is drawn so two currencies are two
         amounts, and beside it how many times and the day of the last (`tally:`). The payments that name nobody are the
         bar's last line, "Not named yet", which opens them; how many they are is the lead's to say. */
      kind: 'bar',
      heading: 'Who you paid, 90 days',
      icon: 'store',
      span: 12,
      source: 'register.transactions',
      where: `${LEDGER_90D}, direction is out`,
      columns: [{ field: 'payee', or: 'what' }, { field: 'amount' }],
      unset: 'Not named yet',
      tally: true,
      limit: 30,
      empty: 'Nobody paid in 90 days.',
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
        { field: 'category', label: 'Category', width: 'minmax(10ch,18ch)' },
        { field: 'direction', label: 'Which way', width: '12ch' },
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
      columns: [{ field: 'payee', or: 'what' }, { field: 'amount' }],
      unset: 'Not named yet',
      tally: true,
      limit: 15,
      empty: 'Nothing in for 90 days.',
    },
  ],
};
