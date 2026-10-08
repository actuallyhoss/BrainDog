/** Money's figures of the cash there is: in all, by book, by account, and how old each balance is. */

import type { SeedMetric } from '../../base.ts';
import { ROLLED } from '../legs.ts';
import { MONEY } from './shared.ts';

export const CASH_FIGURES: Record<string, SeedMetric> = {
  /**
   * WHAT IS IN THE BANK, the headline the owner asked for: "the money i have, not the money im
   * due/owed". Liquid accounts only, and remembered daily so the page can draw how it has moved.
   *
   * ROLLED FORWARD, SINCE money-core 3.0.0, AND IT WAS A SUM OF WHAT WAS TYPED. An account's `balance` is what somebody
   * said it held on its `as_of`, and every payment since was a row in `transactions` this figure never read, so it
   * stood still while the money moved. Now each account starts from the newest thing anybody said it held (its own
   * balance, a balance check, or a movement that printed the balance after it) and adds every cleared move dated after
   * that day (`packages/kernel/src/money-figures.ts`, `readRolled`). A transfer moves cash between accounts, so it is
   * counted here though no figure of spending counts it. The reading's `as_of` is the oldest start it used.
   */
  'cash-now': {
    metric: 'cash-now',
    name: 'Cash now',
    source: 'register.accounts',
    where: 'liquid is true',
    value: ROLLED,
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
    snapshot: { grain: 'day', into: 'series.cash-now' },
    home: 1,
  },

  /**
   * CASH NOW, ONE FIGURE A BOOK, SINCE money-core 3.1.0: the same roll, grouped by the book each account is in.
   *
   * THE HEADLINE OF A RECORD THAT KEEPS TWO BOOKS. Cash now over both added a company's money to a person's own, and
   * neither of them has that much to spend. The Money page draws this in place of the one figure once a second book
   * is there (`books-held`); an account in no book is its own part, so nothing held drops out of the sum.
   */
  'cash-by-book': {
    metric: 'cash-by-book',
    name: 'Cash now, by book',
    source: 'register.accounts',
    where: 'liquid is true',
    value: ROLLED,
    group_by: 'book',
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /**
   * CASH NOW, ONE PART AN ACCOUNT, SINCE money-core 3.3.0: the same roll, grouped by the name each account is called, so
   * the Money page's Accounts tile cuts Cash now into the accounts it is held in and its parts add up to the headline.
   *
   * DRAWN WHATEVER THE NUMBER OF BOOKS: one book with three accounts still wants to see where its money sits, which the
   * by-book bar could never say. The name is the record's own ("HSBC current", "Tax reserve"), never a word of ours.
   */
  'cash-by-account': {
    metric: 'cash-by-account',
    name: 'Cash now, by account',
    source: 'register.accounts',
    where: 'liquid is true',
    value: ROLLED,
    group_by: 'name',
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /**
   * CASH NOW IN ONE BOOK, read once per book as a project's figures are read once per project: `book-cash:Personal`
   * fills `{{it}}` with the book's name. The figure a book's page leads with and its walk starts from.
   */
  'book-cash': {
    metric: 'book-cash',
    name: 'Cash now in one book',
    source: 'register.accounts',
    where: 'liquid is true, book is {{it}}',
    value: ROLLED,
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /**
   * HOW MANY PAYMENTS LEFT ONE BOOK THIS MONTH, SINCE money-core 3.8.0, read once per book as `book-cash` is: what a
   * book's Where this month's money went is drawn on, over its own clauses, so a book with nothing spent this month
   * draws no split with no parts in it. A count and not a sum, because a sum over two currencies is two amounts and the
   * question is only whether there is anything to cut.
   */
  'book-spent-month': {
    metric: 'book-spent-month',
    name: 'Paid out of one book this month',
    source: 'register.transactions',
    where: 'state is cleared, transfer is false, direction is out, on at least bom, book is {{it}}',
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /* HOW MANY BOOKS THE RECORD KEEPS, so the Money page can tell one set of money from several. */
  'books-held': {
    metric: 'books-held',
    name: 'Books',
    source: 'register.books',
    value: { count: 'id' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /* HOW MANY ACCOUNTS CASH NOW ADDS UP, AND THE OLDEST DAY ONE OF THEM WAS TRUE: the line under the
     hero figure, so a reader knows what it is a sum of and how old the weakest part of it is. */
  'cash-accounts': {
    metric: 'cash-accounts',
    name: 'Accounts counted as cash',
    source: 'register.accounts',
    where: 'liquid is true',
    value: { count: 'id' },
    format: 'int',
    target: { gte: 1 },
    window: '30d',
    compare: 'none',
  },

  'cash-as-of': {
    metric: 'cash-as-of',
    name: 'Oldest balance',
    source: 'register.accounts',
    where: 'liquid is true',
    value: { min: 'as_of' },
    format: 'day',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /**
   * HOW MANY OF CASH NOW'S BALANCES ARE MORE THAN A WEEK OLD, SINCE money-core 3.3.0: the week `cash-stale` tells about,
   * over the accounts Cash now reads. What the Money page's "Out of date" note is drawn under (`when:`).
   */
  'balances-stale': {
    metric: 'balances-stale',
    name: 'Balances over a week old',
    source: 'register.accounts',
    where: 'liquid is true, as_of before -7d',
    value: { count: 'id' },
    format: 'int',
    target: { lte: 0 },
    window: '30d',
    compare: 'none',
  },
};
