/** An account's page and a bill's: one thing, said first, with its rows one press under it. */

import type { SeedPage } from '../../base.ts';
import { MONEY_METRICS } from '../figures/index.ts';
import { LEDGER_LINE_COLUMNS, MONTH_FILTER, SHOW_FILTER } from './ledger.ts';
import { CONFIRMED_COLUMN, CONFIRMED_STALE } from './parts/ages.ts';
import { LEDGER_COLUMNS } from './parts/ledger.ts';

/** The figures of one account, by its name (`{{name}}`) or its spoken id (`{{spoken}}`). */
const NOW = 'account-now:{{name}}';
const LINES = 'account-lines:{{name}}';
const GAP = 'account-gap:{{name}}';
const IN_BY_MONTH = 'account-in-by-month:{{spoken}}';
const OUT_BY_MONTH = 'account-out-by-month:{{spoken}}';

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
 *
 * WHAT THE BANK SAYS AND WHAT THE LINES ADD UP TO, SIDE BY SIDE, SINCE money-core 3.29.0. The card's figure was the
 * balance somebody typed, dated by the bank's newest word on the account, so an account whose bank had printed a newer
 * balance read the old amount beside the new day. Now the card names the account and how old its balance is, and the
 * money is two figures under it: the bank's newest word rolled forward, and the typed balance with every line since.
 * Where the two differ the difference is said on its own, in words: money the bank counted that the Ledger has no line
 * for. Then a box to say what it holds today, its months in and out, and what moved as a table with what the bank said
 * after each line. A block that reads one of the account's figures is placed once that figure is declared (`declared`),
 * as on a book's page, and until then the card keeps the typed balance as it did.
 */
export const accountPage = (declared: (figure: string) => boolean): SeedPage => {
  const has = (...figures: string[]): boolean => figures.every((f) => declared(f.split(':')[0]!));
  const both = has(NOW, LINES);
  return {
    page: 'money-account',
    title: '{{name}}',
    for: { register: 'accounts', fleeting: true },
    icon: 'landmark',
    requires: ['register.accounts', 'register.transactions', 'register.balances', 'register.categories'],
    pack: 'money-core',
    /* THE ACCOUNT'S LINES NARROWED AS THE LEDGER'S ARE: by what each was for, by month and by kind of line. */
    filters: [{ field: 'category', control: 'chips' }, MONTH_FILTER, SHOW_FILTER],
    blocks: [
      {
        /* WHICH ACCOUNT, AND HOW OLD WHAT IT HOLDS IS: its name, its kind, the digits the bank prints and its book, and
           the day the bank or a check last said what it held, marked out of date past a week (`CONFIRMED_STALE`). */
        kind: 'cards',
        lead: true,
        span: 12,
        source: 'register.accounts',
        where: 'seq is {{seq}}',
        columns: [
          { field: 'name', as: 'title' },
          ...(both ? [] : [{ field: 'balance', as: 'figure' }]),
          { field: 'kind', label: 'Type', as: 'fact' },
          { field: 'last4', label: 'Digits', as: 'fact' },
          { field: 'book', label: 'Book', as: 'fact' },
          CONFIRMED_COLUMN,
        ],
        stale: CONFIRMED_STALE,
        limit: 1,
      },
      ...(both
        ? [
            {
              /* WHAT IT HOLDS, TWO WAYS, IN ITS OWN CURRENCY: by the bank's newest word, and by its lines alone. */
              kind: 'stat',
              heading: 'Balance',
              icon: 'wallet',
              span: 12,
              cells: [
                { metric: NOW, label: 'The bank says' },
                { metric: LINES, label: 'The lines add up to' },
              ],
            },
          ]
        : []),
      ...(has(GAP)
        ? [
            {
              /* THE GAP, SAID PLAINLY AND ONLY WHILE THERE IS ONE, over or under (`not: 0`). The words say what is wrong,
                 so the colour is never the only mark; amber, as a thing to look at and not a loss. */
              kind: 'stat',
              heading: 'Not in the ledger',
              icon: 'alert',
              span: 12,
              tone: 'warn',
              cells: [
                {
                  metric: GAP,
                  label: 'Counted by the bank, with no line here',
                  note: 'Missing from the Ledger',
                },
              ],
              when: { metric: GAP, not: 0 },
            },
          ]
        : []),
      {
        /* WHAT IT HOLDS TODAY WRITES A BALANCE CHECK FOR THIS ACCOUNT, never the account itself (`parts/ages.ts`). The
           account is preset by its spoken id, as a book's capture presets its book. */
        kind: 'capture',
        heading: 'What it holds today',
        icon: 'check',
        span: 12,
        register: 'balances',
        where: 'account is {{spoken}}',
      },
      ...(has(IN_BY_MONTH, OUT_BY_MONTH)
        ? [
            {
              /* ITS MONTHS: what came in and went out, moves from your other accounts among them, six months back. */
              kind: 'series',
              heading: 'In and out, by month',
              icon: 'chart-column',
              span: 12,
              series: [
                { metric: IN_BY_MONTH, label: 'Money in' },
                { metric: OUT_BY_MONTH, label: 'Money out', dir: 'out' },
              ],
              back: 6,
              net: true,
              when: { metric: OUT_BY_MONTH, empty: false },
              empty: 'Nothing moved.',
            },
          ]
        : []),
      {
        /* WHAT MOVED THROUGH IT, AS A TABLE, newest first: the day, who it was, what it was for, the amount signed by the
           way it went, and the balance the bank printed after it where it printed one. Fifty, so the page stays a page;
           the Ledger holds the rest. */
        kind: 'table',
        heading: 'What moved',
        icon: 'receipt',
        span: 12,
        source: 'register.transactions',
        where: 'account is {{spoken}}, state is not void',
        columns: [
          { field: 'on', label: 'Date', width: '11ch' },
          { ...LEDGER_LINE_COLUMNS[1]!, label: 'Who', width: 'minmax(14ch,1fr)' },
          { field: 'category', label: 'For', width: 'minmax(10ch,16ch)' },
          { ...LEDGER_LINE_COLUMNS[2]!, label: 'Amount', width: '15ch', align: 'end' },
          { field: 'balance_after', label: 'Bank says', width: '15ch', align: 'end' },
        ],
        order: [{ field: 'on', dir: 'desc' }],
        limit: 50,
        empty: 'Nothing has moved yet.',
      },
    ],
  };
};

/** The page Money ships: an account's page over the figures Money declares. */
export const MONEY_ACCOUNT_PAGE: SeedPage = accountPage((figure) => figure in MONEY_METRICS);

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
