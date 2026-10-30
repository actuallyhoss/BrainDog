/** Payees: who money goes to and comes from, the most first. */

import type { SeedPage } from '../../base.ts';
import { LEDGER_COLUMNS } from './parts/ledger.ts';

/**
 * THE LAST NINETY DAYS OF WHAT MOVED, as the payee figures read them (`figures/payees.ts`): cleared, not between a
 * person's own accounts, and nothing dated ahead.
 */
const LEDGER_90D = 'state is cleared, transfer is false, stays is not true, on after -90d, on before +1d';

/**
 * ONE PAGE UNDER MONEY, SINCE money-core 3.29.0: one bar a payee, the most paid first, how often each was paid and the
 * day of the last, the category each usually goes under, and the newest entries.
 *
 * A PAYEE'S OWN PAGE IS THIS PAGE WITH ONE PAYEE PICKED. The strip over it names every payee (`filters`, by "Paid to or
 * from"), and picking one narrows every block over the Ledger to that payee's entries: how much and under which
 * categories, who it was, and its lines newest first, so a page a payee is one press and no page a payee is made.
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
      kind: 'note',
      lead: true,
      span: 12,
      when: { metric: 'payees-paid-90d', gt: 0 },
      body: '{{payees-paid-90d}} payee(s) paid in 90 days.',
    },
    {
      /* AND WHEN EVERY PAYMENT OUT NAMES NOBODY, the page still opens on its line: with the lead above and the one
         below both held back, Payees opened on no line at all (round 1030's recheck left this case without one). */
      kind: 'note',
      lead: true,
      span: 12,
      when: { all: [{ metric: 'payees-paid-90d', lt: 1 }, { metric: 'unnamed-paid-90d', gt: 0 }] },
      body: 'No payee named yet on {{unnamed-paid-90d}} payment(s) in 90 days.',
    },
    {
      /* WHAT NAMES NOBODY, WITH ITS ONE WAY TO NAME IT (Q15 of 29 October): the lines open with the name box first. */
      kind: 'note',
      span: 12,
      when: { metric: 'unnamed-paid-90d', gt: 0 },
      body: 'Not named yet: {{unnamed-paid-90d}} payment(s) in 90 days. [Name them](/r/transactions?f=payee:empty&f=direction:is:out&f=transfer:is:false)',
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
      /* HOW MUCH EACH WAS PAID, THE MOST FIRST, added up where it is drawn, so two currencies are two amounts. */
      kind: 'bar',
      heading: 'Paid most, 90 days',
      icon: 'store',
      span: 12,
      source: 'register.transactions',
      where: `${LEDGER_90D}, direction is out`,
      columns: [{ field: 'payee', or: 'what' }, { field: 'amount' }],
      unset: 'Not named yet',
      limit: 15,
      empty: 'Nobody paid in 90 days.',
    },
    {
      /* HOW OFTEN EACH WAS PAID: a count, which has no currency, so a figure grouped by payee. */
      kind: 'bar',
      heading: 'How often, 90 days',
      icon: 'repeat',
      span: 12,
      source: 'metric.paid-times-by-payee-90d',
      unset: 'Not named yet',
      /* THE TEN PAID MOST OFTEN, as Paid most is cut: uncut, a record with thirty payees drew thirty bars of ones and twos. */
      limit: 10,
      when: { metric: 'payees-paid-90d', gt: 0 },
      empty: 'Nobody paid in 90 days.',
    },
    {
      /* UNDER WHICH CATEGORIES, IN THE SAME DAYS: with one payee picked, the category its money went under. */
      kind: 'split',
      heading: 'By category, 90 days',
      donut: true,
      icon: 'chart-pie',
      span: 12,
      source: 'register.transactions',
      where: `${LEDGER_90D}, direction is out`,
      columns: [{ field: 'category' }, { field: 'amount' }],
      unset: 'No category yet',
      empty: 'Nothing out in 90 days.',
    },
    {
      /* THE NEWEST ENTRIES, the day each was last paid among them, as the Ledger's own tile says them. */
      kind: 'timeline',
      heading: 'Last paid',
      icon: 'receipt',
      span: 12,
      source: 'register.transactions',
      /* PAID, SO MONEY OUT: a payout coming in is under Money in, never under Last paid. */
      where: 'state is not void, transfer is false, stays is not true, direction is out',
      columns: LEDGER_COLUMNS,
      order: [{ field: 'on', dir: 'desc' }],
      limit: 10,
      empty: 'Nothing has moved yet.',
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
      heading: 'Who paid in, 90 days',
      icon: 'hand-coins',
      span: 12,
      source: 'register.transactions',
      where: `${LEDGER_90D}, direction is in`,
      columns: [{ field: 'payee', or: 'what' }, { field: 'amount' }],
      unset: 'Not named yet',
      limit: 10,
      empty: 'Nothing in for 90 days.',
    },
  ],
};
