/**
 * What more than one of Money's lists declares: the bank's available figure, the widened register type, and the link
 * to a book. Cut out of `money.ts` with no change (REC-B01 job 1).
 */

import type { RatesFields, RegisterDecl } from '@braindog/kernel';

import type { SeedRegister } from '../../base.ts';

/**
 * WHAT THE BANK SAID WAS LEFT AFTER THIS MOVED, as its alert printed it: a card's available limit, an account's
 * available balance. Optional, because most ways a row arrives never say, and nothing sums it.
 *
 * IT IS THE ONE THING THAT TELLS A SECOND CHARGE FROM A RESEND. Two card alerts in a hundred real bank texts
 * carried the same amount, merchant and day a few minutes apart, and the near rule skipped the second as already
 * said, although the limits they print differ by exactly the charge. The same alert
 * sent again prints the same figure, so a pattern that reads this and names it in its `dedupe:` files two charges
 * and still files one resend once (the bank pack's own test under `packs/`). Not indexed: the register is at the ceiling of
 * eight, and the dedupe that reads it has already narrowed to one account, one amount and three days.
 *
 * A CONSTANT, BECAUSE TWO PLACES DECLARE IT. `register.transactions` carries it from money-core 2.1.0, and a bank pack under
 * `packs/` lays the same field through `extends` for a record still on 1.8.0 or 2.0.0, which its range admits. Written twice, the
 * two could disagree about a type, and a record would then hold whichever arrived first.
 */
export const AVAILABLE = { id: 'available', label: 'Available after', type: 'money' } as const;

/**
 * A register as Money declares it: a seed register that may also say how its rows pair, or that it holds the rates.
 *
 * WIDENED HERE AND NOT IN `base.ts`, because `transactions` is the one register any module pairs and `fx` the one that
 * holds rates, and the kernel's own types carry both shapes, so neither can drift from what `pairs.ts` and `roles.ts`
 * check.
 */
export type MoneyRegister = SeedRegister & {
  pairs?: RegisterDecl['pairs'];
  rates?: RatesFields;
  /**
   * `refuse_while_referenced`, the one value the kernel keeps (`packages/kernel/src/referenced.ts`, `DELETE_RULES`):
   * deleting a row other live rows point at is refused, naming the lists and how many rows. Written as its one word
   * rather than read off the kernel's list, because `RegisterDecl` does not carry the key and the check at install
   * (`declare.ts`) is what holds it to that list.
   */
  delete?: 'refuse_while_referenced';
};

/**
 * WHICH BOOK A ROW IS IN, SINCE money-core 3.1.0: an optional link to `books` on every list that holds money.
 *
 * OPTIONAL, because a record that keeps one set of money has no book at all, and every row it already holds stays
 * valid through the update. A CONSTANT, BECAUSE EVERY SUCH LIST DECLARES IT, so none of them can call it something
 * else or point it somewhere else. A pack that files into a book fills it on every row it writes (`{{config:book}}`),
 * because a book page reads the field on each list and the grammar of `where` cannot follow
 * a transaction to its account's book.
 */
export const BOOK = { id: 'book', label: 'Book', type: 'ref', to: 'books' } as const;
