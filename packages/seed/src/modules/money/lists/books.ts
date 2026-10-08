/** Books: the sets of money a person keeps apart. */

import type { MoneyRegister } from './shared.ts';

/**
 * THE SETS OF MONEY A PERSON KEEPS APART, SINCE money-core 3.1.0: their own and a company's, a household's and a
 * club's. One row a set, and every list that holds money says which one a row is in (`BOOK`).
 *
 * MONEY-CORE'S OWN LIST AND NOT AN ORGANISATION, because a use case may add no field to another pack's list
 * (`usecases/founder.ts`), and a book is where money is kept, which is Money's to say. A founder's organisation may
 * name its book. EMPTY UNTIL SOMEBODY ADDS ONE: a record with one set of money needs none, and the Money page's
 * headline is what it was until a second book is there.
 *
 * `currency` IS THE ONE THE BOOK IS KEPT IN, as its owner says it, written as the three letters `fx` holds. It is a
 * statement about the book, and a figure about the book is read in it: a figure over one book, or each book's part
 * of a figure grouped by book, is added up in the book's currency, and every other figure in the record's home
 * currency.
 */
export const BOOKS_REGISTER: MoneyRegister = {
  id: 'books',
  name: 'Books',
  icon: 'book',
  one: 'book',
  holds: 'the sets of money you keep apart, such as your own and a company you run, each read on its own page',
  title: 'name',
  mobile: ['name', 'currency', 'note'],
  /* A BOOK THAT ROWS ARE FILED IN IS NOT DELETED OUT FROM UNDER THEM, as an account is not: each would be left in a
     book that is no longer there, and drawn on no book's page. */
  delete: 'refuse_while_referenced',
  pack: 'money-core',
  fields: [
    /* UNIQUE, because a book's page is found by its name, and two books with one name are one page. */
    { id: 'name', type: 'text', required: true, unique: true, search: true },
    { id: 'currency', label: 'Currency', type: 'text' },
    { id: 'note', type: 'text' },
  ],
};
