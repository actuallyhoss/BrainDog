/** An account's page and a bill's: one thing, said first, with its rows one press under it. */

import type { SeedPage } from '../../base.ts';
import { MONEY_METRICS } from '../figures/index.ts';
import { LEDGER_LINE_COLUMNS, MONTH_FILTER, SHOW_FILTER } from './ledger.ts';
import { CONFIRMED_STALE } from './parts/ages.ts';
import { LEDGER_COLUMNS } from './parts/ledger.ts';

/** The figures of one account, by its name (`{{name}}`) or its spoken id (`{{spoken}}`). */
const NOW = 'account-now:{{name}}';
const LINES = 'account-lines:{{name}}';
const GAP = 'account-gap:{{name}}';
const IN_BY_MONTH = 'account-in-by-month:{{spoken}}';
const OUT_BY_MONTH = 'account-out-by-month:{{spoken}}';

/**
 * AN ACCOUNT'S OWN LINES, AS THE LEDGER SAYS THEM, LESS THE ACCOUNT (audit of 31 October, 26): on the account's own page
 * every line read "Software · Company card" under a title that already says Company card. The project a line is for
 * takes the account's place under the name, "Software · Portage", and where a line is for none the category stands alone.
 * The chip stays the sixth cell, as every ledger line's is.
 */
export const ACCOUNT_LINE_COLUMNS = LEDGER_LINE_COLUMNS.map((c) => (c.field === 'account' ? { field: 'thing' } : c));

/**
 * THE DAY THE BANK OR A CHECK LAST SAID WHAT IT HOLDS, AS A FACT WITH ITS NAME (audit of 31 October, 26): as a card's
 * `when` it was drawn as a bare "1 Sep" beside the card's mark, a day of nothing. Marked out of date past a week, as
 * every column the block's `stale:` names is.
 */
const CONFIRMED_FACT = { field: 'as_of', label: 'Last confirmed', as: 'fact' } as const;

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
    /* A WALLET AND NOT A BANK (audit of 31 October, 26): a card's page wore the bank's building. A page's mark is one for
       every account, so it is the one that is true of a bank, a card and cash alike; the card under it wears the kind. */
    icon: 'wallet',
    requires: ['register.accounts', 'register.transactions', 'register.balances', 'register.categories'],
    pack: 'money-core',
    /* THE ACCOUNT'S LINES NARROWED AS THE LEDGER'S ARE: by what each was for, by month and by kind of line. */
    filters: [{ field: 'category', control: 'chips' }, MONTH_FILTER, SHOW_FILTER],
    blocks: [
      ...(both && has(GAP)
        ? [
            {
              /* ONE FIGURE WHILE THE TWO AGREE, SINCE money-core 3.34.0 (next-money, M14): "The bank says $41,380" beside
                 "The lines add up to $41,380" said one amount twice on most days. While the gap is nought the hero is the
                 balance once, with "Matches the bank" under it; the two figures come back the day they differ. */
              kind: 'stat',
              heading: '{{name}}',
              icon: 'wallet',
              span: 12,
              cells: [{ metric: NOW, label: 'Balance', note: 'Matches the bank' }],
              when: { metric: GAP, is: 0 },
            },
          ]
        : []),
      ...(both
        ? [
            {
              /* THE ACCOUNT AND WHAT IT HOLDS, FIRST, SINCE money-core 3.32.0 (audit of 30 October, 19): the head was a card
                 whose name the page hides (the title above says it) and whose balance had moved to a tile under it, so it
                 read "2 Sep · Type Bank · Ending in 2044" and nothing else. The account's name heads its two figures now:
                 by the bank's newest word, and by its lines alone, in its own currency. */
              kind: 'stat',
              heading: '{{name}}',
              icon: 'wallet',
              span: 12,
              cells: [
                { metric: NOW, label: 'The bank says' },
                { metric: LINES, label: 'The lines add up to' },
              ],
              ...(has(GAP) ? { when: { any: [{ metric: GAP, not: 0 }, { metric: GAP, empty: true }] } } : {}),
            },
          ]
        : []),
      {
        /* WHAT IT HOLDS TODAY WRITES A BALANCE CHECK FOR THIS ACCOUNT, never the account itself (`parts/ages.ts`). The
           account is preset by its spoken id, as a book's capture presets its book.

           THE HERO'S QUIET ACTION, SINCE money-core 3.34.0 (next-money, M15): straight under the balance it checks, where
           it stood as a tile of its own under About this account. The app draws a box that follows a page's first
           figure as that tile's foot (Money's look, `look.css`). */
        kind: 'capture',
        /* SAID AS WHAT TO TYPE (live check of 30 October, 14): the heading is the box's own words, and "What it holds
           today" in a grey box read as a bar stuck loading. */
        heading: 'Type what the bank says it holds today',
        icon: 'check',
        span: 12,
        register: 'balances',
        where: 'account is {{spoken}}',
      },
      {
        /* WHICH ACCOUNT, AND HOW OLD WHAT IT HOLDS IS: the digits the bank prints, its book, and the day the bank or a
           check last said what it held, marked out of date past a week (`CONFIRMED_STALE`). The head while the two
           figures are not declared, with the typed balance; under them otherwise, as what the account is.

           ITS KIND IS THE CARD'S MARK, a card, a bank or cash, and no longer a fact as well: a card holds three facts, and
           the day it was last confirmed is the one a person needs in words. */
        kind: 'cards',
        ...(both ? { heading: 'About this account', icon: 'info' } : { lead: true }),
        span: 12,
        source: 'register.accounts',
        where: 'seq is {{seq}}',
        columns: [
          { field: 'name', as: 'title' },
          ...(both ? [] : [{ field: 'balance', as: 'figure' }]),
          { field: 'last4', label: 'Ending in', as: 'fact' },
          { field: 'book', label: 'Book', as: 'fact' },
          CONFIRMED_FACT,
        ],
        stale: CONFIRMED_STALE,
        limit: 1,
      },
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
        /* WHAT MOVED THROUGH IT, AS THE LEDGER DRAWS IT, SINCE money-core 3.32.0, newest first, a day at a time: the same
           kind and the same columns as the Ledger's Every line (`LEDGER_LINE_COLUMNS`), so a line reads the same name and
           the same money on both. As a table it showed the bank's own words and the currency's code ("GRANGEMOOR EVENTS,
           STAND DEPOSIT −GBP 2,500.00") where the Ledger said "Grangemoor Events, Stand Deposit −£2,500.00". What the
           bank printed after each line is on the line's own page. Fifty, so the page stays a page; the Ledger holds the
           rest. */
        kind: 'timeline',
        heading: 'What moved',
        icon: 'receipt',
        span: 12,
        source: 'register.transactions',
        where: 'account is {{spoken}}, state is not void',
        columns: ACCOUNT_LINE_COLUMNS,
        order: [{ field: 'on', dir: 'desc' }],
        limit: 50,
        empty: 'Nothing has moved yet.',
      },
    ],
  };
};

/** A bill's open part, as its Still to pay (or Still to come in) table draws it. */
const BILL_PARTS_COLUMNS = [
  { field: 'due', label: 'Due', width: '13ch' },
  { field: 'amount', label: 'Amount', width: '15ch', align: 'end' as const },
  { field: 'paid_so_far', label: 'Paid so far', width: '15ch', align: 'end' as const },
  { field: 'state', label: 'Status', width: '11ch' },
];

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
        /* SIGNED BY WHICH WAY IT IS OWED, SINCE money-core 3.38.0 (ui2 money, F6): an invoice owed to you read "$3,200"
           here and "+$3,200" in Bills and invoices. */
        { field: 'amount', as: 'figure', sign: { field: 'direction', minus: 'owed_by_me' } },
        { field: 'party', label: 'Who', as: 'fact' },
        { field: 'state', label: 'Status', as: 'fact' },
        /* THE DAY NAMED, SINCE money-core 3.34.0 (next-money, M34): as a card's `when` it was a bare "30 Jul" beside the
           status, a day of nothing. "Due 30 Jul", beside its status, which says whether it is paid. */
        { field: 'due', label: 'Due', as: 'fact' },
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
      /* WHAT YOU OWE ONLY, SINCE money-core 3.38.3: an invoice owed to you headed its parts "Still to pay", which is
         somebody else's job. It has the block after this one. */
      where: 'seq is {{seq}}, state is open or part, direction is owed by me',
      columns: BILL_PARTS_COLUMNS,
      limit: 1,
    },
    {
      /* WHAT IS STILL TO COME IN, SINCE money-core 3.38.3: the same part on an invoice owed to you, in its own words. */
      kind: 'table',
      heading: 'Still to come in',
      icon: 'calendar-clock',
      span: 12,
      source: 'register.obligations',
      where: 'seq is {{seq}}, state is open or part, direction is owed to me',
      columns: BILL_PARTS_COLUMNS,
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
