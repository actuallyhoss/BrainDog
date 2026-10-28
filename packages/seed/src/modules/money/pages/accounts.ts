/** Accounts: every account, grouped by kind, each with what it holds and how old that is. */

import type { SeedPage } from '../../base.ts';
import { MONEY_METRICS } from '../figures/index.ts';
import { CONFIRMED_COLUMN, CONFIRMED_STALE } from './parts/ages.ts';

/** The figure that cuts Cash now into its accounts by their lines alone, beside the bank's own (`cash-by-account`). */
const BY_LINES = 'lines-by-account';

/** An account's card on this page: its name, the digits the bank prints, its book, whether it is cash, and its age. */
const ACCOUNT_CARD = [
  { field: 'name', as: 'title' },
  { field: 'last4', label: 'Digits', as: 'fact' },
  { field: 'book', label: 'Book', as: 'fact' },
  { field: 'liquid', label: 'Counts as cash', as: 'fact' },
  CONFIRMED_COLUMN,
];

/**
 * ONE PAGE UNDER MONEY, SINCE money-core 3.29.0: Money is a section with a page per job, and this one is where an account
 * is found, opened and kept current.
 *
 * WHAT IT SAYS, TOP TO BOTTOM: one sentence of what the accounts hold together, each currency apart; the four numbers
 * that say whether the balances can be trusted (Cash now, what is on the card, the oldest balance and how many are past a
 * week); what each account holds by the bank's newest word, and beside it what its lines add up to, so an account whose
 * two disagree is seen at once and its own page says by how much; then every account as a card, grouped Bank, Cash and
 * Card, each opening its page, with the day its balance was last confirmed and the out-of-date mark past a week.
 *
 * NO BALANCE ON THE CARDS. A card's money column is the balance somebody typed, while its day is the bank's newest word
 * (`CONFIRMED_STALE`), so an account the bank had printed a newer balance for read the old amount beside the new day.
 * What each holds now is the bar above, rolled forward from that same newest word; a card says which account and how old.
 *
 * EVERY CURRENCY IN ITS OWN: a dollar account's bar is in dollars, and nothing on this page adds two currencies.
 * Closed accounts are folded at the foot, and the box to add one is last.
 */
export const accountsPage = (declared: (figure: string) => boolean): SeedPage => {
  const twoWays = declared(BY_LINES);
  return {
    page: 'money-accounts',
    title: 'Accounts',
    nav: { section: 'Money', order: 11 },
    icon: 'wallet',
    requires: ['register.accounts', 'register.balances', 'register.transactions'],
    pack: 'money-core',
    blocks: [
      {
        /* THE ACCOUNTS IN ONE SENTENCE, from the figures the tiles below draw, so the line and the tiles cannot differ. */
        kind: 'note',
        lead: true,
        span: 12,
        body: '{{cash-now.apart}} in {{cash-by-account.groups}} account(s).',
      },
      {
        /* WHETHER THE BALANCES CAN BE TRUSTED, IN THREE NUMBERS: what the card asks, the oldest balance among them and
           how many are older than a week. What they hold is the line above, so it is not said twice. */
        kind: 'stat',
        heading: 'All accounts',
        icon: 'landmark',
        span: 12,
        cells: [
          { metric: 'card-to-pay', label: 'To pay on the card' },
          { metric: 'cash-as-of', label: 'Oldest balance' },
          { metric: 'balances-stale', label: 'Older than a week' },
        ],
      },
      {
        /* WHAT EACH HOLDS NOW, by the bank's newest word and every line after it, each in its own currency. */
        kind: 'bar',
        heading: 'Balance',
        icon: 'wallet',
        span: twoWays ? 6 : 12,
        source: 'metric.cash-by-account',
        limit: 12,
        when: { metric: 'cash-accounts', gt: 0 },
      },
      ...(twoWays
        ? [
            {
              /* AND WHAT ITS LINES ADD UP TO, from the balance typed for it: where a bar here is not the bar beside it, the
                 bank counted money the Ledger has no line for, and the account's own page says how much. */
              kind: 'bar',
              heading: 'Ledger total',
              icon: 'receipt',
              span: 6,
              source: `metric.${BY_LINES}`,
              limit: 12,
              when: { metric: 'cash-accounts', gt: 0 },
            },
          ]
        : []),
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
