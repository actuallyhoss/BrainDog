/** Money's figures for the Accounts page and an account's own: what each holds by the bank's word and by its lines. */

import type { SeedMetric } from '../../base.ts';
import { ROLLED } from '../legs.ts';
import { MONEY } from './shared.ts';

/** The accounts Cash now adds up, as `cash.ts` holds them, so the two by-account figures read the same accounts. */
const HELD = 'liquid is true, state is not closed';

/**
 * THE LEDGER'S OWN ROLL: the balance a person typed, on the day they typed it, and every cleared line since. No statement
 * restarts it, so where it differs from Cash now's roll (which restarts at the bank's newest word) the difference is
 * money the bank counted and the Ledger holds no line for.
 */
const LINES_ONLY = { rolled: { balance: ROLLED.rolled.balance, as_of: ROLLED.rolled.as_of, moves: ROLLED.rolled.moves } } as const;

/** The months an account's page draws its money in and out over, the walk's six and the month it is in. */
const MONTHS = 'on after -7m';

/** The currencies a Stripe balance is read below zero in: a money comparison names its currency. */
const STRIPE_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'AED', 'EGP'] as const;
const STRIPE_BELOW_ZERO = {
  all: [
    { field: 'name', contains: 'stripe' },
    { field: 'liquid', is: true },
    { field: 'state', not: 'closed' },
    { any: STRIPE_CURRENCIES.map((currency) => ({ field: 'balance', lt: { amount: 0, currency } })) },
  ],
};

export const ACCOUNT_FIGURES: Record<string, SeedMetric> = {
  /**
   * WHAT ONE ACCOUNT HOLDS NOW, BY THE BANK'S NEWEST WORD: Cash now's own roll over the one account the page is about,
   * asked by its name (`account-now:{{name}}`), as a book's figures are asked by the book's. A figure's hole is a word, so
   * the name and not the row's number: two accounts called the same read as one here, as they do in `cash-by-account`.
   * Every account and not only cash: a card's page says what is on the card the same way.
   */
  'account-now': {
    metric: 'account-now',
    name: 'This account now',
    source: 'register.accounts',
    where: 'name is {{it}}',
    value: ROLLED,
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /** WHAT THE SAME ACCOUNT'S LINES ADD UP TO: the balance typed for it and every cleared line since, and no statement. */
  'account-lines': {
    metric: 'account-lines',
    name: 'This account by its lines',
    source: 'register.accounts',
    where: 'name is {{it}}',
    value: LINES_ONLY,
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /**
   * WHAT THE BANK COUNTED AND THE LEDGER HAS NO LINE FOR: the bank's newest word less what the lines add up to. Nought on
   * an account whose every movement is in the Ledger; anything else is a line still to find. Money either way, in the
   * account's own currency.
   */
  'account-gap': {
    metric: 'account-gap',
    name: 'Not in the ledger',
    source: 'register.accounts',
    value: { sum_of: [{ metric: 'account-now:{{it}}' }, { metric: 'account-lines:{{it}}', minus: true }] },
    format: MONEY,
    target: { lte: 0 },
    window: '30d',
    compare: 'none',
  },

  /** EACH ACCOUNT CASH NOW ADDS UP, BY ITS LINES ALONE, grouped by its name as `cash-by-account` is, for the two side by side. */
  'lines-by-account': {
    metric: 'lines-by-account',
    name: 'Cash by its lines, by account',
    source: 'register.accounts',
    where: HELD,
    value: LINES_ONLY,
    group_by: 'name',
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /** WHAT CAME INTO ONE ACCOUNT EACH MONTH, moves from your other accounts among it, since they change what it holds. */
  'account-in-by-month': {
    metric: 'account-in-by-month',
    name: 'Into this account, by month',
    source: 'register.transactions',
    where: `state is cleared, direction is in, account is {{it}}, ${MONTHS}`,
    value: { sum: 'amount' },
    group_by: 'on',
    bucket: 'month',
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /** WHAT LEFT ONE ACCOUNT EACH MONTH, the same way. */
  'account-out-by-month': {
    metric: 'account-out-by-month',
    name: 'Out of this account, by month',
    source: 'register.transactions',
    where: `state is cleared, direction is out, account is {{it}}, ${MONTHS}`,
    value: { sum: 'amount' },
    group_by: 'on',
    bucket: 'month',
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /**
   * A STRIPE BALANCE BELOW ZERO, SINCE money-core 3.31.0 (audit Z18, Q9): Stripe took fees, a refund or a dispute with no
   * payments in to cover them, and takes the difference from the bank if it stays there. The Accounts page says so in
   * one line, so "Stripe available −$9.61" is not a number left to guess at. The amount stays on the account's own
   * card, in its own currency, and is not converted into the line. An account counted as cash whose name says
   * Stripe, read in the currencies Stripe pays out in most: a money comparison names its currency, so each is a clause.
   */
  'stripe-below-zero-count': {
    metric: 'stripe-below-zero-count',
    name: 'Stripe balances below zero',
    source: 'register.accounts',
    where: STRIPE_BELOW_ZERO,
    value: { count: 'id' },
    format: 'int',
    target: { lte: 0 },
    window: '30d',
    compare: 'none',
  },
};
