/**
 * One field's value as a box holds it, what the record would refuse about what was typed, and the patch it goes back as.
 *
 * TWO SCREENS EDIT A VALUE AND ONLY ONE OF THEM COULD DO IT PROPERLY. The row page edited every type but `secret`
 * through three closures over its own state, and the grid kept a list of five types (`text enum day int decimal`) and
 * sent everything else to the row, saying a money was "an amount and a currency" as though that were unsolved. It was
 * solved, fifty lines away, where nothing else could call it. These are those closures with their state passed in:
 * the field, what was typed, the value the row held and the currency the list mostly holds. The row page calls them
 * unchanged in behaviour, and a cell save now goes through the same three, so a money cell keeps its currency and
 * refuses a third decimal on EGP exactly as the row page does (`field-draft.test.ts`).
 *
 * THE CURRENCY THE ROW HOLDS WINS, AND THE ONE PASSED IN IS THE FALLBACK. A list of pounds can hold one row in dinars,
 * and correcting that row's amount must not quietly move it into pounds. `GBP` is last because the row page has always
 * said it last, for a money field on a list where no row says any currency at all.
 */

import { exponentOf } from 'braindog-render';

import { copy } from '../copy.ts';
import { amountOf, currencyOf } from './money.ts';
import type { FieldDecl, Fields } from './schema.ts';
import { listFromDraft, listLine } from './tags.ts';

/**
 * Whether a field's value can be changed where it is drawn.
 *
 * EVERY TYPE BUT FOUR, ON BOTH SCREENS, and one predicate so the two cannot drift again. A secret is never drawn and
 * never edited: a credential does not go in a row, the vault is a different surface with different rules, and
 * `readableFields` has already left it out.
 *
 * `quantity`, `file` AND `json` ARE HELD AS OBJECTS THAT NO BOX HERE TAKES APART. The first version of this answered
 * yes to them, and `draftOf` handed the box `String` of the value: a `json` cell holding `{ a: 1 }` opened as
 * `[object Object]`, and one character typed after it went back as that string, which the record's `json` coercion
 * accepts as it comes (`field-draft.test.ts`). None of the three is declared by a register this app draws today, so
 * leaving them out takes nothing away from anybody; they come back when something here can type one.
 */
const UNBOXED: ReadonlySet<string> = new Set(['secret', 'quantity', 'file', 'json']);
export const editable = (f: Pick<FieldDecl, 'type'>): boolean => !UNBOXED.has(f.type);

/** The currency a money box is typed in: the row's own, else the list's, else the one the row page has always used. */
const currencyIn = (held: unknown, currency: string | null | undefined): string => currencyOf(held) ?? currency ?? 'GBP';

/**
 * What a `duration`'s declared unit is worth in the seconds the record stores.
 *
 * THE SAME TABLE `api.ts` `display` DRAWS A DURATION WITH, and it has to be: the box opens on what the cell says, and
 * a cell that reads `2 h` and a box that opens on `7200` are two answers to one question. That was the checker's
 * first refusal of this module (`field-draft.test.ts`). `display`'s copy is private to `api.ts`, which is another
 * brief's file, so this one is a second copy of five numbers rather than an edit to it; an unknown unit is worth one
 * second in both, which is what `display` prints beside it.
 */
const SECONDS: Readonly<Record<string, number>> = { s: 1, m: 60, h: 3_600, d: 86_400, w: 604_800 };

/** The unit a duration is typed and said in: the field's own, else seconds, which is the unit the record stores. */
export const unitOf = (f: FieldDecl): string => f.unit ?? 's';
const secondsIn = (f: FieldDecl): number => SECONDS[unitOf(f)] ?? 1;

/**
 * A stored duration as the number a box holds, in the field's unit.
 *
 * THE SHORTEST DECIMAL THAT COMES BACK AS THE SAME SECONDS. `100` seconds in hours is `0.027777777777777776` as
 * `String` writes it; three places, which is what `display` shows, is `0.028`, and that goes back as 101 seconds, so
 * opening the box and saving it would move the value. The loop stops at the first number of places that survives the
 * trip through `patchOf`, which for every value in the test's sweep is twelve characters or fewer.
 */
function durationDraft(f: FieldDecl, held: unknown): string {
  const seconds = Number(held);
  const per = secondsIn(f);
  if (!Number.isFinite(seconds) || per === 1) return String(held);
  for (let places = 0; places <= 15; places++) {
    const said = String(Number((seconds / per).toFixed(places)));
    if (Math.round(Number(said) * per) === seconds) return said;
  }
  return String(seconds / per);
}

/** The value as a box holds it: money in major units, a duration in its unit, a list as its tags, the rest as stored. */
export function draftOf(f: FieldDecl, held: unknown, currency: string | null | undefined): string {
  if (held === null || held === undefined) return '';
  /* A LIST IS TYPED AS ITS TAGS WITH COMMAS, and the tags the record keeps for itself are not in the box (`tags.ts`). */
  if (Array.isArray(held)) return listLine(held) ?? '';
  if (f.type === 'duration') return durationDraft(f, held);
  if (f.type !== 'money') return String(held);
  const minor = amountOf(held);
  if (minor === null) return '';
  return String(minor / 10 ** exponentOf(currencyIn(held, currency)));
}

/**
 * What the record would refuse about a money box, said where it was typed rather than at the save.
 *
 * THE EXPONENT IS THE CURRENCY'S: two decimals is most currencies and not all of them, and a field that assumed two
 * would refuse `KWD 1.250` and quietly mangle `JPY 1250`.
 */
export function wrongMoney(f: FieldDecl, typed: string, held: unknown, currency: string | null | undefined): string | null {
  if (f.type !== 'money') return null;
  const raw = typed.trim();
  if (raw === '') return null;
  if (!/^-?\d+(\.\d+)?$/u.test(raw)) return copy.moneyShape;
  const exp = exponentOf(currencyIn(held, currency));
  const places = raw.includes('.') ? raw.length - raw.indexOf('.') - 1 : 0;
  return places > exp ? copy.moneyPlaces(exp) : null;
}

/**
 * The one field, in the shape the record stores.
 *
 * A YES OR NO IS TICKED, so `typed` is a boolean for a `bool` and the text in the box for everything else.
 *
 * A MONEY IS AN AMOUNT AND A CURRENCY and the box holds only the amount, so it is put back together here, beside the
 * exponent that took it apart. Everything else goes as it was typed and `outbound` converts it: an empty box is `null`,
 * which is how the record is told the row no longer carries that field.
 *
 * THE `Array.isArray` BESIDE THE `list` CHECK is about the ROW rather than the declaration: a list that has since
 * stopped declaring a field as a list still has rows holding an array in it, and the record's own tags are kept.
 *
 * A DURATION IS TYPED IN ITS UNIT AND STORED IN SECONDS, so `3` in a field said in hours is 10,800. It went as typed
 * before, and the record read `3` as three seconds. In any unit bigger than a second the product is rounded to a
 * whole second, a precision the unit never showed; in seconds it goes as typed, so `1.5` meets the record's sentence
 * about whole numbers instead of quietly becoming `2`. What is not a number goes as typed, for the same sentence.
 */
export function patchOf(f: FieldDecl, typed: string | boolean, held: unknown, currency: string | null | undefined): Fields {
  if (f.type === 'bool') return { [f.id]: typed === true };
  const raw = String(typed).trim();
  if (f.type === 'list' || Array.isArray(held)) return { [f.id]: listFromDraft(raw, held) };
  if (f.type === 'duration') {
    if (!/^-?\d+(\.\d+)?$/u.test(raw)) return { [f.id]: raw };
    const per = secondsIn(f);
    return { [f.id]: per === 1 ? Number(raw) : Math.round(Number(raw) * per) };
  }
  if (f.type !== 'money') return { [f.id]: raw };
  if (raw === '') return { [f.id]: null };
  const code = currencyIn(held, currency);
  return { [f.id]: { amount: Math.round(Number(raw) * 10 ** exponentOf(code)), currency: code } };
}

/**
 * Whether what was typed is what the row already holds, so that a save sends nothing.
 *
 * A SAVE THAT CHANGES NOTHING IS NOT A WRITE: it would put a line in the row's history saying a field went from a value
 * to the same value, which is a fact about a press. Compared as the box would draw the held value, which is the row
 * page's own test, and a toggle as a toggle.
 */
export function unchanged(f: FieldDecl, typed: string | boolean, held: unknown, currency: string | null | undefined): boolean {
  if (f.type === 'bool') return typed === (held === true);
  return String(typed).trim() === draftOf(f, held, currency).trim();
}
