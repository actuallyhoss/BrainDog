/**
 * The currency an amount is typed in, what the record would refuse about it, and the money it becomes, for the two
 * boxes that open on no value a row already holds: the new-row form, and the grid's editor over an empty money cell.
 *
 * THE FORM WROTE STERLING ON EVERY RECORD. Its chain was `currencyFor(register, f.id) ?? 'GBP'`, and `currencyFor`
 * reads `ROWS`, which nothing fills in a shipped tab, so every amount typed into a new row went in as GBP, on a record
 * kept in any other currency as much as on one kept in sterling; and the grid labelled the editor of an empty money
 * cell GBP the same way. The currency is now one somebody chose, and with none of them known
 * nothing is written and the box says why.
 *
 * THE AMOUNT ITSELF IS `field-draft.ts`'s. `wrongMoney` and `patchOf` are where the row page and the grid take a money
 * apart and put it back together by the currency's own places, so JPY 1250 is 1,250 yen and KWD 1.250 is one and a
 * quarter dinars; a third copy of that arithmetic here would be the first thing to drift.
 *
 * PLAIN TYPESCRIPT AND NOT PART OF THE COMPONENT, so `row-form-money.test.ts` can load it under `node --test`.
 */

import { copy } from '../copy.ts';
import { homeCurrency } from '../record/api.ts';
import { patchOf, wrongMoney } from '../record/field-draft.ts';
import { currencyOf } from '../record/money.ts';
import { isMoney, type FieldDecl, type MoneyValue } from '../record/schema.ts';

/**
 * WHAT A MONEY BOX SAYS WHEN NO CURRENCY IS KNOWN. The box takes digits alone and the record refuses an amount without
 * a currency, so the sentence names the two places a person can give it one, rather than the form guessing.
 */
export const NO_CURRENCY = "Say which currency, or set this record's currency in Settings.";

/**
 * The currency an amount typed into this field goes in: the value's own when the box opened on one, else the field's
 * declared currency (the one its default is in), else the one `currencyFor` finds on the list's rows, else the
 * record's own (`homeCurrency()`); `null` when nobody has chosen one. Never a literal.
 *
 * THE SAME ORDER `field-draft.ts` WRITES A CELL IN, so the unit drawn beside a box is the currency its save carries.
 */
export const currencyTypedIn = (f: FieldDecl, listed: string | null, held?: unknown): string | null =>
  currencyOf(held) ?? currencyOf(f.default) ?? listed ?? homeCurrency();

/**
 * What the record would refuse about an amount typed for a new row, said where it was typed rather than at submit: a
 * person who finds out at submit has typed a whole row first.
 *
 * A SHAPE THAT IS NOT A NUMBER IS SAID FIRST, whatever the currency, because it is the one thing the box itself can fix.
 * After it, a missing currency is said in this form's own words, and then a figure with more places than its currency.
 */
export function amountWrong(f: FieldDecl, typed: string, listed: string | null): string | null {
  const said = wrongMoney(f, typed, undefined, listed);
  if (said === null || said === copy.moneyShape) return said;
  return currencyTypedIn(f, listed) === null ? NO_CURRENCY : said;
}

/**
 * The money a new row carries for what was typed into one field, or `null` when there is nothing to write: an empty
 * box, a field that is not money, or an amount the record would refuse, the missing currency among them.
 */
export function moneyTyped(f: FieldDecl, typed: string, listed: string | null): MoneyValue | null {
  if (f.type !== 'money' || typed.trim() === '' || amountWrong(f, typed, listed) !== null) return null;
  const value = patchOf(f, typed, undefined, listed)[f.id];
  return isMoney(value) ? value : null;
}
