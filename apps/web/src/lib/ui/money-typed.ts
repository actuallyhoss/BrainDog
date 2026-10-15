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
import { MONEY_HELD, ROWS } from '../record/held.ts';
import { currencyOf } from '../record/money.ts';
import { isMoney, type FieldDecl, type MoneyValue } from '../record/schema.ts';

/**
 * WHAT A MONEY BOX SAYS WHEN NO CURRENCY IS KNOWN. The box takes digits alone and the record refuses an amount without
 * a currency, so the sentence names the two places a person can give it one, rather than the form guessing.
 */
export const NO_CURRENCY = "Say which currency, or set this record's currency in Settings.";

/**
 * The currency an amount typed into this field goes in: the value's own when the box opened on one (a `currency_fixed`
 * field's code never moves off it), else the code of the account its link names (`linked`, from `currencyOfLink`), else
 * the field's declared currency (the one its default is in), else the one `currencyFor` finds on the list's rows, else
 * the record's own (`homeCurrency()`); `null` when nobody has chosen one. Never a literal.
 *
 * THE SAME ORDER `field-draft.ts` WRITES A CELL IN, so the unit drawn beside a box is the currency its save carries. The
 * account's code comes before the field's own because the record gives it before anything else to an amount sent bare.
 */
export const currencyTypedIn = (f: FieldDecl, listed: string | null, held?: unknown, linked: string | null = null): string | null =>
  currencyOf(held) ?? linked ?? currencyOf(f.default) ?? listed ?? homeCurrency();

/**
 * The link a `currency_from` field takes its code through, and the field of the linked list it reads, or `null` for a
 * field that declares none: `'account.balance'` is the row's `account`, and that account's `balance`.
 */
export function linkOf(f: FieldDecl): { link: string; field: string } | null {
  if (f.type !== 'money' || typeof f.currency_from !== 'string') return null;
  const [link, field, ...rest] = f.currency_from.split('.');
  return link && field && rest.length === 0 ? { link, field } : null;
}

/**
 * The code a `currency_from` field takes from the row its link names: the one that row's money field holds, as the
 * record's `coerce.ts` gives it to an amount sent with none. `null` with no link, no linked row, a field the linked list
 * does not hold as money (`moneyFieldOf` answers `null` for it), or a linked row holding no value there.
 *
 * `moneyFieldOf` IS ASKED THE FIELD THE DECLARATION NAMES, and answers it back when the linked list holds it as money,
 * so a field renamed or retired on the account is not read as if it still held a currency.
 */
export function currencyOfLink(
  f: FieldDecl,
  linkedRow: { fields: Record<string, unknown> } | null,
  moneyFieldOf: (named: string) => string | null,
): string | null {
  const from = linkOf(f);
  if (from === null || linkedRow === null) return null;
  const field = moneyFieldOf(from.field);
  if (field === null) return null;
  const code = currencyOf(linkedRow.fields[field]);
  return code === null || code === '' ? null : code.toUpperCase();
}

/**
 * The row numbered `seq` of `list`, as this tab holds it, or `null`: read from what the tab already holds, as a ref's
 * choices are, so picking an account sends no request.
 */
export function linkedRow(list: string, seq: number | null): { fields: Record<string, unknown> } | null {
  if (seq === null || !Number.isInteger(seq)) return null;
  /* A LIVE TAB HOLDS THE ACCOUNT'S MONEY FROM ITS WALK (`refMapOf`); the sample's `ROWS` only fills in the tests. */
  const kept = MONEY_HELD.get(list)?.get(seq);
  if (kept) return { fields: { ...kept } };
  return ROWS[list]?.find((r) => r.seq === seq) ?? null;
}

/** The line under an amount box whose currency came from the account it is filed against. */
export const linkSaid = (code: string, name: string): string => `In ${code}, the currency of ${name}.`;

/**
 * What the record would refuse about an amount typed for a new row, said where it was typed rather than at submit: a
 * person who finds out at submit has typed a whole row first.
 *
 * A SHAPE THAT IS NOT A NUMBER IS SAID FIRST, whatever the currency, because it is the one thing the box itself can fix.
 * After it, a missing currency is said in this form's own words, and then a figure with more places than its currency.
 */
export function amountWrong(f: FieldDecl, typed: string, listed: string | null, linked: string | null = null): string | null {
  const said = wrongMoney(f, typed, standIn(linked), listed);
  if (said === null || said === copy.moneyShape) return said;
  return currencyTypedIn(f, listed, undefined, linked) === null ? NO_CURRENCY : said;
}

/**
 * THE LINKED CODE GOES TO `field-draft.ts` AS IF THE ROW HELD IT, because that is the one place its chain lets a code
 * come before the field's declared one: a new row holds nothing, and the amount is then counted in the account's places.
 */
const standIn = (linked: string | null): MoneyValue | undefined => (linked === null ? undefined : { amount: 0, currency: linked });

/**
 * The money a new row carries for what was typed into one field, or `null` when there is nothing to write: an empty
 * box, a field that is not money, or an amount the record would refuse, the missing currency among them.
 */
export function moneyTyped(f: FieldDecl, typed: string, listed: string | null, linked: string | null = null): MoneyValue | null {
  if (f.type !== 'money' || typed.trim() === '' || amountWrong(f, typed, listed, linked) !== null) return null;
  const value = patchOf(f, typed, standIn(linked), listed)[f.id];
  return isMoney(value) ? value : null;
}
