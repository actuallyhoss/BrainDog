/** Payees: who money goes to and comes from, the most first. */

import type { SeedPage } from '../../base.ts';
import { LEDGER_COLUMNS } from './parts/ledger.ts';

/**
 * THE LAST NINETY DAYS OF WHAT MOVED, as the payee figures read them (`figures/payees.ts`): cleared, not between a
 * person's own accounts, and nothing dated ahead.
 */
const LEDGER_90D = 'state is cleared, transfer is false, on after -90d, on before +1d';

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
      body: 'You paid {{payees-paid-90d}} payees in the last 90 days, {{spent-30d}} in the last 30. Pick one to see only theirs.',
    },
    {
      kind: 'note',
      lead: true,
      span: 12,
      when: { metric: 'payees-paid-90d', lt: 1 },
      body: 'No payee has been paid in the last 90 days. A payee is the name on an entry, and the bank lines that name one fill this page.',
    },
    {
      /* HOW MUCH EACH WAS PAID, THE MOST FIRST, added up where it is drawn, so two currencies are two amounts. */
      kind: 'bar',
      heading: 'Paid most, 90 days',
      icon: 'store',
      span: 12,
      source: 'register.transactions',
      where: `${LEDGER_90D}, direction is out`,
      columns: [{ field: 'payee' }, { field: 'amount' }],
      unset: 'No name yet',
      limit: 15,
      empty: 'Nobody was paid in the last 90 days.',
    },
    {
      /* HOW OFTEN EACH WAS PAID: a count, which has no currency, so a figure grouped by payee. */
      kind: 'bar',
      heading: 'How often, 90 days',
      icon: 'repeat',
      span: 12,
      source: 'metric.paid-times-by-payee-90d',
      unset: 'No name yet',
      /* THE TEN PAID MOST OFTEN, as Paid most is cut: uncut, a record with thirty payees drew thirty bars of ones and twos. */
      limit: 10,
      when: { metric: 'payees-paid-90d', gt: 0 },
      empty: 'Nobody was paid in the last 90 days.',
    },
    {
      /* UNDER WHICH CATEGORIES, IN THE SAME DAYS: with one payee picked, the category its money went under. */
      kind: 'split',
      heading: 'Under which category',
      donut: true,
      icon: 'chart-pie',
      span: 12,
      source: 'register.transactions',
      where: `${LEDGER_90D}, direction is out`,
      columns: [{ field: 'category' }, { field: 'amount' }],
      unset: 'No category yet',
      empty: 'Nothing went out in the last 90 days.',
    },
    {
      /* THE NEWEST ENTRIES, the day each was last paid among them, as the Ledger's own tile says them. */
      kind: 'timeline',
      heading: 'Last paid',
      icon: 'receipt',
      span: 12,
      source: 'register.transactions',
      where: 'state is not void, transfer is false',
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
      empty: 'No payee has a usual category yet. Set a category on an entry and the record offers one.',
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
      columns: [{ field: 'payee' }, { field: 'amount' }],
      unset: 'No name yet',
      limit: 10,
      empty: 'Nothing came in in the last 90 days.',
    },
  ],
};
