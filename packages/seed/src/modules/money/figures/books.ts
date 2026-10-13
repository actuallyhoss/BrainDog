/** Money's figures of one book's month, and of what is filed in no book (REC-A09 step 2). */

import { LOOKUPS, OPEN, type SeedMetric } from '../../base.ts';
import { MONEY } from './shared.ts';

/**
 * A BOOK'S MONTH IS ITS CLEARED LEDGER ENTRIES SINCE THE FIRST, AND NO TRANSFER, the clauses `book-spent-month` counts
 * by and every figure over the Ledger holds (`spending.ts`). Money moved between two accounts is in neither half, though
 * `book-cash` counts it: it is cash that moved and nothing earned or spent.
 */
const BOOK_MONTH = 'state is cleared, transfer is false, on at least bom';

export const BOOK_FIGURES: Record<string, SeedMetric> = {
  /**
   * WHAT CAME INTO ONE BOOK THIS MONTH AND WHAT WENT OUT, read once per book as `book-cash` is: `book-in-month:Personal`
   * fills `{{it}}` with the book's name. A sum in the book's own currency, and one amount a currency where its entries
   * are in two, never the two added.
   *
   * NO TARGET A SUM OF PAYMENTS COULD MISS, as `out-due-by-month` says it: a ceiling is a sum in a currency a pack cannot
   * know. `compare: none`, because the month before is its own question and thirty days back is not a month.
   */
  'book-in-month': {
    metric: 'book-in-month',
    name: 'Money into one book this month',
    source: 'register.transactions',
    where: `${BOOK_MONTH}, direction is in, book is {{it}}`,
    value: { sum: 'amount' },
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  'book-out-month': {
    metric: 'book-out-month',
    name: 'Money out of one book this month',
    source: 'register.transactions',
    where: `${BOOK_MONTH}, direction is out, book is {{it}}`,
    value: { sum: 'amount' },
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /**
   * WHAT ONE BOOK HAS LEFT OF THIS MONTH: money in less money out over the same entries, the amount signed by its
   * direction as `net-by-month` signs it, so the two halves are one reading and cannot be read over two sets. The target
   * is a month that did not lose money.
   */
  'book-net-month': {
    metric: 'book-net-month',
    name: 'Left over in one book this month',
    source: 'register.transactions',
    where: `${BOOK_MONTH}, book is {{it}}`,
    value: { sum: { product: ['amount', { lookup: 'sign', by: 'direction' }] } },
    lookups: { sign: LOOKUPS.sign! },
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /**
   * WHAT IS FILED IN NO BOOK, A LIST AT A TIME, over the whole record: the four lists a book's page reads its money
   * from. A record that keeps books and has entries in none of them reads short on every book's page, and these say by
   * how many. A COUNT AND NOT A SUM, because the question is how many there are to file, and a sum over two currencies
   * is two amounts.
   *
   * FOUR FIGURES AND NOT ONE, because a figure reads one list, and because a person is told "12 Ledger entries are in no
   * book", each list by its own name. ONLY WHAT IS STILL LIVE: a void entry never happened, and a bill paid, a repeating
   * item ended or an instalment paid or cancelled is on no page of what is due. The Ledger's count has no month in it
   * and no `transfer is false`: an old entry and a transfer both belong to a book's cash.
   *
   * NOUGHT IS THE TARGET, and on a record that keeps no book a page does not draw them (`books-held`).
   */
  'ledger-in-no-book': {
    metric: 'ledger-in-no-book',
    name: 'Ledger entries in no book',
    source: 'register.transactions',
    where: 'state is not void, book is empty',
    value: { count: 'id' },
    format: 'int',
    target: { lte: 0 },
    window: '30d',
    compare: 'none',
  },

  'bills-in-no-book': {
    metric: 'bills-in-no-book',
    name: 'Bills and invoices in no book',
    source: 'register.obligations',
    where: `${OPEN}, book is empty`,
    value: { count: 'id' },
    format: 'int',
    target: { lte: 0 },
    window: '30d',
    compare: 'none',
  },

  'repeating-in-no-book': {
    metric: 'repeating-in-no-book',
    name: 'Repeating items in no book',
    source: 'register.recurring',
    where: 'state is not ended, book is empty',
    value: { count: 'id' },
    format: 'int',
    target: { lte: 0 },
    window: '30d',
    compare: 'none',
  },

  'instalments-in-no-book': {
    metric: 'instalments-in-no-book',
    name: 'Instalments in no book',
    source: 'register.installments',
    where: 'state is open, book is empty',
    value: { count: 'id' },
    format: 'int',
    target: { lte: 0 },
    window: '30d',
    compare: 'none',
  },
};
