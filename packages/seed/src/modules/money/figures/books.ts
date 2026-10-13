/** Money's figures of one book's month, and of what is filed in no book (REC-A09 step 2). */

import { LOOKUPS, OPEN, type SeedMetric } from '../../base.ts';
import { MONEY } from './shared.ts';

/**
 * A BOOK'S MONTH IS ITS CLEARED LEDGER ENTRIES SINCE THE FIRST, AND NO TRANSFER, the clauses `book-spent-month` counts
 * by and every figure over the Ledger holds (`spending.ts`). Money moved between two accounts is in neither half, though
 * `book-cash` counts it: it is cash that moved and nothing earned or spent.
 */
const BOOK_MONTH = 'state is cleared, transfer is false, on at least bom';
/** The same entries over the thirteen months a book's chart reads, a month to a point. */
const BOOK_MONTHS = 'state is cleared, transfer is false, on after -13m';

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

  /**
   * WHAT ONE BOOK IS OWED AND WHAT IT OWES, read once per book as `book-cash` is: `book-owed-to:Personal` fills
   * `{{it}}` with the book's name. EACH IS ITS WHOLE-RECORD FIGURE'S CLAUSE WITH THE BOOK ADDED, word for word
   * (`owed-to-you` and `owed-by-you` in `due.ts`, which share `OPEN`), so the books of a record whose bills are all
   * filed add up to the two figures Money leads with, and no two of them disagree about which bills are still live.
   * Late or months ahead, a bill still open is owed.
   *
   * IN THE BOOK'S OWN CURRENCY where the book says one, else the record's, and one amount a currency where neither can
   * add them (`MONEY`). They read Bills and invoices and nothing else: a repeating line and an instalment are money
   * that will fall due, and what falls due is the walk's to say.
   *
   * NOUGHT OR MORE, as `book-in-month` is held: the ceiling on what a record owes is a setting (`owed-by-you`), and no
   * ceiling on one book is one anybody would keep. AFTER THE COUNTS, so every figure above keeps its place.
   */
  'book-owed-to': {
    metric: 'book-owed-to',
    name: 'Due to come into one book',
    source: 'register.obligations',
    where: `${OPEN}, direction is owed to me, book is {{it}}`,
    value: { sum: 'amount' },
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  'book-owed-by': {
    metric: 'book-owed-by',
    name: 'Due to go out of one book',
    source: 'register.obligations',
    where: `${OPEN}, direction is owed by me, book is {{it}}`,
    value: { sum: 'amount' },
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  /**
   * THE SAME THREE, A MONTH AT A TIME, for the chart on a book's page (In and out, by month; `pages/book.ts` draws it
   * once all three are declared): thirteen months back of one book's cleared entries, no transfer, grouped by the month
   * each was on. The net is the amount signed by its direction over the same entries, as `book-net-month` is, and the
   * chart is drawn only where it holds a reading. LAST, so every figure above keeps its place.
   */
  'book-in-by-month': {
    metric: 'book-in-by-month',
    name: 'Money into one book, by month',
    source: 'register.transactions',
    where: `${BOOK_MONTHS}, direction is in, book is {{it}}`,
    value: { sum: 'amount' },
    group_by: 'on',
    bucket: 'month',
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  'book-out-by-month': {
    metric: 'book-out-by-month',
    name: 'Money out of one book, by month',
    source: 'register.transactions',
    where: `${BOOK_MONTHS}, direction is out, book is {{it}}`,
    value: { sum: 'amount' },
    group_by: 'on',
    bucket: 'month',
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },

  'book-net-by-month': {
    metric: 'book-net-by-month',
    name: 'Left over in one book, by month',
    source: 'register.transactions',
    where: `${BOOK_MONTHS}, book is {{it}}`,
    value: { sum: { product: ['amount', { lookup: 'sign', by: 'direction' }] } },
    lookups: { sign: LOOKUPS.sign! },
    group_by: 'on',
    bucket: 'month',
    format: MONEY,
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
  },
};
