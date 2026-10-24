/** An account's page and a bill's: one thing, said first, with its rows one press under it. */

import type { SeedPage } from '../../base.ts';
import { CONFIRMED_COLUMN, CONFIRMED_STALE } from './parts/ages.ts';
import { LEDGER_COLUMNS } from './parts/ledger.ts';

/**
 * ONE PAGE AN ACCOUNT, SINCE money-core 3.19.0 (things, not rows, 24 October): an account from Money opened its row's
 * fields, a form of nine boxes. Now it opens on what it holds, the day the bank or a check last said so, and the last
 * things that moved through it; its fields are "Show the data", one press under the page.
 *
 * A TEMPLATE, as a book's page is (`book.ts`), with NO `nav`: a rail with a line for every account is a rail nobody reads,
 * and Money's cards are where an account is found. FLEETING (`for.fleeting`), so an account's page takes its address only
 * after every project, book and plan has had its pick: an account called what a project is called never moves the
 * project's page to a numbered address.
 *
 * ITS OWN ROW BY NUMBER (`seq is {{seq}}`), never by name: two accounts may share one.
 */
export const MONEY_ACCOUNT_PAGE: SeedPage = {
  page: 'money-account',
  title: '{{name}}',
  for: { register: 'accounts', fleeting: true },
  icon: 'landmark',
  requires: ['register.accounts', 'register.transactions'],
  pack: 'money-core',
  blocks: [
    {
      /* WHAT IT HOLDS AND HOW OLD THAT IS, as Money's own card says it: the balance, its kind and the day it was last
         confirmed, marked out of date past a week (`CONFIRMED_STALE`). */
      kind: 'cards',
      lead: true,
      span: 12,
      source: 'register.accounts',
      where: 'seq is {{seq}}',
      columns: [{ field: 'name', as: 'title' }, { field: 'balance', as: 'figure' }, { field: 'kind', label: 'Type', as: 'fact' }, CONFIRMED_COLUMN],
      stale: CONFIRMED_STALE,
      limit: 1,
    },
    {
      /* THE LAST THINGS THAT MOVED THROUGH IT, newest first, as the Ledger's own tile says them: the day, who was paid and
         the amount signed by the way it went. Ten, so the page stays a page; the Ledger holds the rest. */
      kind: 'timeline',
      heading: 'Last moves',
      icon: 'receipt',
      span: 12,
      source: 'register.transactions',
      where: 'account is {{spoken}}, state is not void',
      columns: LEDGER_COLUMNS,
      order: [{ field: 'on', dir: 'desc' }],
      limit: 10,
      empty: 'Nothing has moved through {{name}} yet.',
    },
  ],
};

/**
 * ONE PAGE A BILL OR AN INVOICE, SINCE money-core 3.19.0 (things, not rows): what it is for, how much, who, and the day it
 * falls due, then what is still to pay, Mark paid at its head, and the payments that settled part of it. A part still to pay
 * past its day is drawn in the late red, as every list draws a row past its deadline.
 *
 * FLEETING AND WITH NO `nav`, as an account's page is: bills come and go by the month, and a page for each never takes
 * the address of anything steadier.
 */
export const MONEY_BILL_PAGE: SeedPage = {
  page: 'money-bill',
  title: '{{what}}',
  for: { register: 'obligations', fleeting: true },
  icon: 'obligation',
  requires: ['register.obligations', 'register.transactions'],
  pack: 'money-core',
  blocks: [
    {
      /* THE BILL, AS ONE CARD: what for, the amount, who it is with, its status and the day it falls due. */
      kind: 'cards',
      lead: true,
      span: 12,
      source: 'register.obligations',
      where: 'seq is {{seq}}',
      columns: [
        { field: 'what', as: 'title' },
        { field: 'amount', as: 'figure' },
        { field: 'party', label: 'Who', as: 'fact' },
        { field: 'state', label: 'Status', as: 'fact' },
        { field: 'due', label: 'Due', as: 'when' },
      ],
      limit: 1,
    },
    {
      /* WHAT IS STILL TO PAY. Drawn only while it is open or part paid: a paid bill has nothing to pay, and the block is
         left out. Its due day is the list's deadline, so a part past it is red. Mark paid is the page's one primary
         button, the list's own finishing word, which the app draws on every page about a row that can be finished. */
      kind: 'table',
      heading: 'Still to pay',
      icon: 'calendar-clock',
      span: 12,
      source: 'register.obligations',
      where: 'seq is {{seq}}, state is open or part',
      columns: [
        { field: 'due', label: 'Due', width: '13ch' },
        { field: 'amount', label: 'Amount', width: '15ch', align: 'end' },
        { field: 'paid_so_far', label: 'Paid so far', width: '15ch', align: 'end' },
        { field: 'state', label: 'Status', width: '11ch' },
      ],
      limit: 1,
    },
    {
      /* THE PARTS PAID, the payments on the Ledger that say they settle it, newest first. */
      kind: 'timeline',
      heading: 'Parts paid',
      icon: 'receipt',
      span: 12,
      source: 'register.transactions',
      where: 'settles is {{spoken}}, state is not void',
      columns: LEDGER_COLUMNS,
      order: [{ field: 'on', dir: 'desc' }],
      limit: 12,
    },
  ],
};
