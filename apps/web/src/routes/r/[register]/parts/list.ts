/**
 * The list screen's pure half: what its page and its parts work out from what they are handed, holding no state and
 * writing nothing.
 *
 * OUT OF THE COMPONENT BECAUSE A SVELTE PAGE DOES NOT MOUNT UNDER `node --test`, and nothing inside one can be reached
 * by a test at all. The page keeps the address, the read, the state and every write; the parts beside this file draw
 * what the page hands them; and what is left, the arithmetic and the words that turn on nothing but their arguments,
 * lives here, loadable by plain Node the way `put-back.ts` beside the page is: relative `.ts` imports, no `$lib`, no
 * runes.
 */

import type { Tone } from 'braindog-render';
import { copy } from '../../../../lib/copy.ts';
import { seqWidth } from '../../../../lib/record/api.ts';
import { declaredValue } from '../../../../lib/record/where.ts';
import type { Entry, FieldDecl, Filter, RegisterDecl } from '../../../../lib/record/schema.ts';

/**
 * WHAT JUST HAPPENED TO A ROW, DRAWN WHERE THE ROW WAS.
 *
 * IT WAS A SET OF ARCHIVED SEQUENCES AND THE ROW LEFT THE SCREEN. That is the single change with
 * the most evidence behind it in `loop/REWORK.md`: of eighty-five human writes over thirteen days
 * in the record this product is modelled on, **thirteen reversed the write immediately before
 * them, and twelve of those landed inside five seconds**, across four different verbs. They had
 * one cause. The row vanished, so the only way to check you had hit the right one was to do the
 * opposite and look.
 *
 * A ROW IN THE PAGE'S `receipts` IS DRAWN WHERE IT ALREADY WAS, whatever its state now is, wearing a
 * chip that says what happened and offering the inverse. It stays until the QUESTION changes, because
 * the next question is a new screen and a receipt for a row that is no longer in the answer is a row
 * the reader did not ask for.
 *
 * A DESTRUCTIVE ACTION IS UNDONE, NEVER CONFIRMED. A confirmation dialog asks its question before
 * anything has happened, when the reader knows the least they ever will about it, and the answer
 * is always yes, which is why people stop reading them. The receipt gives back the one thing a
 * dialog cannot: the row, named in the past tense, still where it was.
 *
 * THE TYPE IS HERE, AND NOT IN THE PAGE, because the grid and the cards both draw it.
 */
export type Receipt = {
  /** One or two words in the past tense. `Archived`, `Restored`, `Undone`. */
  mark: string;
  /* `Tone` FROM THE RENDERER, not a fifth vocabulary written here. `13 §5.1` is that meaning may
     not live in styling alone, and `Chip` enforces it: there is no way to draw a tone in this
     app without its glyph, so the word and the glyph carry the meaning and the hue agrees. */
  intent?: Tone | undefined;
  /**
   * THE SAME FACT IN THE WIDTH THE GRID HAS, and it is absent for most receipts because most of
   * them already fit.
   *
   * The `act` column is `11ch` and `truncate: 'never'`, sized for two icon verbs or for
   * `Put back` beside a two-word mark. `markNeeds` is a sentence: on obligations it reads
   * "Needs which way, amount, due, status" and came out of the cell as "Needs whic", clipped,
   * immediately after the most common write in the product.
   *
   * IT IS NOT A TRUNCATION, IT IS A DIFFERENT SENTENCE FOR A SURFACE THAT ALREADY SAYS THE REST.
   * The grid draws every declared field as a column and leaves an unfilled one empty, so which
   * fields a row still wants is on the row four times over. The card draws three `mobile:`
   * fields and cannot say it, which is why the card gets the long form and this one does not.
   */
  short?: string | undefined;
  /**
   * The inverse. Absent when there is nothing to put back, which a receipt still records.
   *
   * `undefined` IS ALLOWED AS WELL AS ABSENT because a live change builds its inverse from the row as the
   * screen held it, and a row the screen was not holding has no values to go back to: `putBackOf` answers
   * `undefined` then, and the chip draws without `Put back` rather than with one that writes nothing.
   */
  undo?: (() => void) | undefined;
};

/**
 * THE FREE SPACE GOES WHERE THE WORDS ARE, and it went to the title whatever the title held.
 *
 * Every flexible column took `1fr` and the title `3fr`, so Skills gave a name column of
 * `review-pr` 530px and cut "Before merging a bran…" at 200px beside it, and Keys cut "What it
 * opens" the same way. A flexible track now takes an `fr` for every ten characters of the longest
 * value in the rows in hand, from one to four, and the title never less than three. Still a
 * DECLARED track list, which `Table` needs for `content-visibility`: the rows decide the numbers
 * once, and layout never measures a cell.
 */
export function weighed<C extends { field: string; width: string }>(c: C, isTitle: boolean, entries: readonly Entry[]): C {
  /* THE SPOKEN ID GIVES WAY. On Keys an 11ch column held `#6` in 102px while "Fenwick Cloud
     recovery codes" was cut beside it. It takes the digits the rows in hand have (`seqWidth`). */
  if (c.field === 'seq') return { ...c, width: seqWidth(entries) };
  const track = /^minmax\(([^,]+),\s*[\d.]+fr\)$/.exec(c.width);
  if (!track) return c;
  let longest = 0;
  for (const e of entries.slice(0, 200)) {
    const v = e.fields[c.field];
    if (typeof v === 'string' && v.length > longest) longest = v.length;
  }
  const fr = Math.min(4, Math.max(isTitle ? 3 : 1, Math.ceil(longest / 10)));
  /* And a title that fits is not cut to feed a column that will be cut anyway: its floor is its
     longest value, up to thirty characters. A `ch` here is wider than an average letter, so the
     floor is a little generous, which is the side to be wrong on. */
  const floor = isTitle && longest > 0 ? `max(${track[1]}, ${Math.min(30, longest)}ch)` : track[1];
  return { ...c, width: `minmax(${floor}, ${fr}fr)` };
}

/**
 * WHAT EACH DIRECTION OF AN ORDER IS CALLED, in the field's own terms.
 *
 * A column header can get away with an arrow because the arrow sits on the thing it orders; a chip
 * in a sheet is read on its own, and "Due ↑ lowest first" is a sentence about a date that nobody
 * says. `19 §9`'s rule is that the product speaks the reader's words, and the reader's word for an
 * ascending day is *oldest*.
 */
export const wayOf = (field: string, decl: RegisterDecl | undefined): readonly [string, string] => {
  if (field === 'seq') return [copy.firstAdded, copy.lastAdded];
  const type = decl?.fields.find((f) => f.id === field)?.type;
  if (type === 'day' || type === 'instant') return [copy.oldestFirst, copy.newestFirst];
  if (type === 'money' || type === 'int' || type === 'decimal' || type === 'duration')
    return [copy.lowestFirst, copy.highestFirst];
  return [copy.aToZ, copy.zToA];
};

/**
 * The `sort` parameter a press on `field` writes: ascending on a new field, and the other way on the
 * field already sorted ascending.
 *
 * ONE TOGGLE FOR THE HEADER AND FOR DISPLAY, so a sort set by clicking a column and one set in the
 * sheet are the same fact, written the same way into the same parameter (`19 §5`: which rows you are
 * looking at, and in what order, is shareable).
 */
export const nextSort = (sort: { field: string; dir: 'asc' | 'desc' } | undefined, field: string): string =>
  `${field}:${sort?.field === field && sort.dir === 'asc' ? 'desc' : 'asc'}`;

/**
 * The offer itself, read by the bar and by the pills' counts, so the two are one list.
 *
 * Only INDEXED fields are offered, in declaration order, at most eight. A filter on an unindexed
 * field is a promise the storage cannot keep at 5,000 rows.
 */
export function filterableOf(fields: RegisterDecl['fields']): RegisterDecl['fields'] {
  return fields.filter((f) => f.index).slice(0, 8);
}

/**
 * A value is SELECTED when the filter includes it, and a `not-in` filter includes nothing.
 *
 * The test used to be `values.includes(value)` with no regard for the operator, so the URL a
 * declared metric hands the reader, `?f=state:not-in:cancelled`, the one that opens "Cost per
 * year", drew `cancelled` as the value being shown. Fifteen live rows on screen, and the control
 * above them saying the one word none of them held.
 */
export const chipOn = (register: string, filters: readonly Filter[], field: string, value: string): boolean => {
  const f = filters.find((x) => x.field === field);
  if (!f) return false;
  /* A SEGMENT SAYS WHAT YOU ARE LOOKING AT, so under a `not-in` filter it is on when the value is
     NOT excluded, which is what the grid underneath it shows. */
  /* COMPARED AS THE FIELD DECLARES IT, so a link written before there was one canonical spelling
     still lights the control it named. Every URL this build writes carries the declared value; a
     bookmark from before does not, and a bookmark is exactly the thing that outlives a fix. */
  const held = f.values.map((v) => declaredValue(register, field, v));
  const want = declaredValue(register, field, value);
  return f.op === 'not-in' ? !held.includes(want) : held.includes(want);
};

/**
 * One pill pressed, written into the address.
 *
 * Toggling KEEPS THE OPERATOR. It always wrote `:in:`, so one press on a neighbouring segment of a
 * `not-in` filter turned exclusion into inclusion and pulled the excluded rows back in, silently,
 * and in the direction that adds rows to a figure somebody had just clicked through to check.
 */
export function toggleChip(p: URLSearchParams, filters: readonly Filter[], field: string, value: string): void {
  const existing = p.getAll('f').filter((v) => !v.startsWith(`${field}:`));
  const at = filters.find((f) => f.field === field);
  const op = at?.op ?? 'in';
  const current = at?.values ?? [];
  const values = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  p.delete('f');
  for (const v of existing) p.append('f', v);
  if (values.length) p.append('f', `${field}:${op}:${values.join(',')}`);
}

/** A list clause the bar draws as its own chip: the filter, where it sits in the address, and the field it narrows. */
export type Listed = { f: Filter; at: number; field: FieldDecl | undefined };

/**
 * The clauses a pill cannot draw: `has` and `lacks` on a list field, which has no declared set of values to light.
 *
 * THE INDEX RATHER THAN THE TEXT, so taking one off is exact. Rebuilding the chip from the parsed
 * filter would have to spell the value back the way the URL held it, and `chipsOf` deliberately
 * keeps a value's colons: `handles:has:git:jokonkwo` rebuilt and compared would match, and a
 * value the encoder had spelled differently would not, leaving a chip that cannot be pressed off.
 */
export const listedOf = (filters: readonly Filter[], decl: RegisterDecl | undefined): Listed[] =>
  filters
    .map((f, at) => ({ f, at, field: decl?.fields.find((d) => d.id === f.field) }))
    .filter((c) => (c.f.op === 'has' || c.f.op === 'lacks') && c.field?.type === 'list');

/** The address without the clause at `at`, every other clause kept in its order. */
export function dropChip(p: URLSearchParams, at: number): void {
  const rest = p.getAll('f').filter((_, i) => i !== at);
  p.delete('f');
  for (const v of rest) p.append('f', v);
}

/**
 * WHICH BOX A TYPE TAKES IN A CELL. The types this grid already edited keep the boxes they had; the ones it gains
 * take the row page's, so a value new to the grid is typed here the way it is typed there.
 *
 * A MONEY AND A DURATION ARE TEXT WITH A DECIMAL KEYPAD, not `number`, because a number box hands back an empty
 * string for anything it cannot parse and `wrongMoney` would then be judging nothing. A ref is the number a person
 * says, so a numeric keypad. A url and an email take the browser's own box for the keyboard it brings, where the
 * row page types both as plain text; the value either box hands back is the text as typed, so the patch is the same.
 */
export function boxOf(type: string | undefined): { type: string; inputmode: 'decimal' | 'numeric' | undefined } {
  if (type === 'day') return { type: 'date', inputmode: undefined };
  if (type === 'int' || type === 'decimal') return { type: 'number', inputmode: undefined };
  if (type === 'money' || type === 'duration') return { type: 'text', inputmode: 'decimal' };
  if (type === 'ref') return { type: 'text', inputmode: 'numeric' };
  if (type === 'url' || type === 'email') return { type, inputmode: undefined };
  return { type: 'text', inputmode: undefined };
}
