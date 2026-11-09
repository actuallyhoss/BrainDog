/** Accounts: every account, grouped by kind, each with what it holds and how old that is. */

import type { SeedPage } from '../../base.ts';
import { MONEY_METRICS } from '../figures/index.ts';
import { CONFIRMED_COLUMN, CONFIRMED_STALE } from './parts/ages.ts';
import { BEYOND_CASH_CELLS, HOLDS_BEYOND_CASH, TO_HOLDINGS } from './shared.ts';

/**
 * An account's card on this page: its name, the digits the bank prints, its book and its age. The digits read "Ending in
 * 2044" where they read "Digits 2044", and "Counts as cash yes" is gone (audit of 30 October, 20): the field showed
 * through, and which accounts count as cash is the Balance bar's list above.
 */
const ACCOUNT_CARD = [
  { field: 'name', as: 'title' },
  /* WHAT IT HOLDS, ON ITS OWN CARD, SINCE money-core 3.34.0 (next-money, M12): the balances were one tile and these cards,
     with no balance, another, so the same three accounts were listed twice. The card says its balance, its last four and
     the day the bank last said it, as a book's account card does (`book.ts`). */
  { field: 'balance', as: 'figure' },
  { field: 'last4', label: 'Ending in', as: 'fact' },
  { field: 'book', label: 'Book', as: 'fact' },
  CONFIRMED_COLUMN,
];

/**
 * ONE PAGE UNDER MONEY, SINCE money-core 3.29.0: Money is a section with a page per job, and this one is where an account
 * is found, opened and kept current.
 *
 * WHAT IT SAYS, TOP TO BOTTOM: every account as a card, grouped Bank, Cash and Card, each opening its page, with what it
 * holds, the day its balance was last confirmed and the out-of-date mark past a week. SINCE money-core 3.41.0, under them,
 * what is held beyond cash and the net worth that counts it, while anything is (`shared.ts` `BEYOND_CASH_CELLS`).
 *
 * NO BALANCE ON THE CARDS. A card's money column is the balance somebody typed, while its day is the bank's newest word
 * (`CONFIRMED_STALE`), so an account the bank had printed a newer balance for read the old amount beside the new day.
 * What each holds now is the bar above, rolled forward from that same newest word; a card says which account and how old.
 *
 * EVERY CURRENCY IN ITS OWN: a dollar account's bar is in dollars, and nothing on this page adds two currencies.
 * Closed accounts are folded at the foot, and the box to add one is last.
 */
export const accountsPage = (_declared: (figure: string) => boolean): SeedPage => {
  return {
    page: 'money-accounts',
    title: 'Accounts',
    nav: { section: 'Money', order: 11 },
    icon: 'wallet',
    requires: ['register.accounts', 'register.balances', 'register.transactions'],
    pack: 'money-core',
    blocks: [
      /* NO LINE OVER THE CARDS, SINCE money-core 3.38.4 (moneyseed, 3 Nov): it said "3 open accounts, with £33,850 in
         cash. £1,240 to pay on the card, as of 1 Sep.", figures in a sentence over cards that each say their balance, the
         card's too. Cash now is Money's hero. */
      {
        /* A STRIPE BALANCE BELOW ZERO, SAID (audit Z18): what it is and what happens to it, one line, only while one is. */
        kind: 'note',
        tone: 'warn',
        icon: 'circle-alert',
        span: 12,
        when: { metric: 'stripe-below-zero-count', gt: 0 },
        body: 'Stripe is below zero: fees or refunds Stripe took with no payments in to cover them. If it stays there, Stripe takes it from your bank.',
      },
      /* NO "ALL ACCOUNTS" TILE OF AGES, SINCE money-core 3.38.4 (moneyseed, 3 Nov): "Out of date 1" and "Oldest balance
         25 Aug" at figure size said again what the cards below say, each with its day and the out-of-date mark. */
      /* NO "BALANCE" BAR, SINCE money-core 3.34.0 (next-money, M12): each account's card says what it holds. */
      {
        /* EVERY OPEN ACCOUNT, BY KIND: Bank, Cash and Card, each card opening the account's own page. */
        kind: 'cards',
        heading: 'Your accounts',
        icon: 'landmark',
        span: 12,
        source: 'register.accounts',
        where: 'state is not closed',
        group: 'kind',
        columns: ACCOUNT_CARD,
        order: [{ field: 'seq', dir: 'asc' }],
        stale: CONFIRMED_STALE,
        empty: 'No account yet.',
      },
      {
        kind: 'capture',
        heading: 'Add an account',
        icon: 'plus',
        span: 12,
        register: 'accounts',
      },
      {
        /* WHAT IS HELD BEYOND THESE ACCOUNTS, AND THE NET WORTH THAT COUNTS IT, SINCE money-core 3.41.0 (9 Nov, the owner:
           "can you make sure that my investments and stuff also show within my balances"): under the accounts and the box
           to add one, so the cash the cards hold and what is held beyond it are read on one page. Both are the whole
           record's, as this page is. Only while something is held beyond cash, then the way to each holding. */
        kind: 'stat',
        heading: 'Beyond your accounts',
        icon: 'hand-coins',
        span: 12,
        cells: BEYOND_CASH_CELLS,
        when: HOLDS_BEYOND_CASH,
      },
      TO_HOLDINGS,
      {
        /* CLOSED ACCOUNTS, FOLDED AND LAST: kept for the lines that moved through them, and counted in nothing. A
           section over no card is not drawn, so a record that never closed one reads no word about it. */
        kind: 'section',
        heading: 'Closed',
        icon: 'archive',
        span: 12,
        fold: true,
      },
      {
        kind: 'cards',
        span: 12,
        source: 'register.accounts',
        where: 'state is closed',
        columns: ACCOUNT_CARD,
        order: [{ field: 'seq', dir: 'asc' }],
      },
    ],
  };
};

/** The page Money ships: the Accounts page over the figures Money declares. */
export const MONEY_ACCOUNTS_PAGE: SeedPage = accountsPage((figure) => figure in MONEY_METRICS);
