/**
 * A card's line typed on in place (PGS-C15): which line may be, and what a pause in the typing sends.
 *
 * A column that says `edit: true` (`kernel/src/declare.ts` checks the shape at install) is drawn by
 * `svelte/Cards.svelte` as a box that looks like the text it replaces, where the host hands the card a writer. The rule
 * is here and pure, so it is tested without a browser and the drawer only asks it. `html.ts`, the mirror, never asks:
 * it draws every line as text, as a reader who cannot write sees it.
 */

/** How long a person stops typing before what they typed is written. */
export const CARD_EDIT_PAUSE = 700;

/** The lines a card draws as words, the only ones typed on, as `declare.ts`'s `CARD_EDIT_ROLES` says. No role is a fact. */
export const CARD_EDIT_ROLES: readonly string[] = ['title', 'fact', 'reply', 'next'];

/** A page's column as the read hands it, with the keys this rule reads. */
export type EditColumn = { field?: string; or?: string; metric?: string; as?: string; edit?: boolean };

/** The field the column names as its list declares it, or nothing where the list is not in hand. */
export type EditField = { type?: string; max?: number } | null | undefined;

/** What a card's drawer is told about one column it may draw as a box: the field written and its own ceiling. */
export type CardEdit = { field: string; max?: number };

/**
 * Whether a column is drawn as a box on this page.
 *
 * ONLY WHERE THE PAGE CAN WRITE, ONLY A LINE OF TEXT, AND ONLY THE ONE FIELD IT NAMES. A field the list does not hold,
 * or holds as anything but text, draws as text: a money or a day typed into a line that looks like words would be
 * written as words. An `or:` is two fields and a `metric:` is none, so neither is ever a box, whatever the column says.
 */
export function editable(column: EditColumn, field: EditField, canWrite: boolean): boolean {
  if (!canWrite || column.edit !== true) return false;
  if (typeof column.field !== 'string' || column.field === '' || column.or !== undefined || column.metric !== undefined) return false;
  if (!CARD_EDIT_ROLES.includes(column.as ?? 'fact')) return false;
  return field?.type === 'text';
}

/** What a card's drawer hands its box for a column, or null where the line is text. */
export function cardEdit(column: EditColumn, field: EditField, canWrite: boolean): CardEdit | null {
  if (!editable(column, field, canWrite)) return null;
  const max = field?.max;
  return typeof max === 'number' && Number.isInteger(max) && max > 0 ? { field: column.field!, max } : { field: column.field! };
}

const BYTES = new TextEncoder();

/** What a box sends now: the value to write, or nothing, and how much longer to wait before asking again. */
export type EditStep = { send: string | null; wait: number };

/**
 * What a box holding `next`, over a line that said `prev`, sends once `ms` have passed since the last keystroke.
 *
 * NOTHING BEFORE THE PAUSE, and the rest of it to wait. Leaving the box or pressing Enter is asked with `Infinity`, so
 * it sends at once. TRIMMED, so a space typed at the end is not a change. NOTHING WHEN IT SAYS WHAT THE LINE SAID, so a
 * box opened and left writes no event and offers no Undo. THE FIELD'S OWN `max` HELD, in the bytes the record bounds
 * text by (`declare.ts` `BY_BYTES`), cut whole characters at a time, so a line pasted past it is cut where the record
 * would refuse it and never inside a letter.
 */
export function editAfter(prev: string, next: string, ms: number, max?: number): EditStep {
  if (ms < CARD_EDIT_PAUSE) return { send: null, wait: CARD_EDIT_PAUSE - ms };
  let value = next.trim();
  if (max !== undefined && max > 0 && BYTES.encode(value).length > max) {
    let kept = '';
    let size = 0;
    for (const ch of value) {
      size += BYTES.encode(ch).length;
      if (size > max) break;
      kept += ch;
    }
    value = kept.trimEnd();
  }
  return { send: value === prev.trim() ? null : value, wait: 0 };
}
