/**
 * A WIDGET THE PERSON PUT ON TODAY SAYS ITS OWN EMPTY LINE, rather than going or drawing "£0".
 *
 * Today is calm by rule: a block with nothing in it is not drawn, even where its author wrote what empty means
 * (`hollow` in `default-home.ts`, `emptyHidden` in the kernel), because the line at the top says the quiet half for
 * Today's own tiles. A widget somebody chose from the sheet is not one of those. The Weather widget on a record with
 * no town went from the board, and Subscriptions with nothing tracked drew "A month £0" (add-ons pass 3, 2 Nov).
 *
 * So on the board a widget from the sheet (its key is `w-…`, `add-today.ts`) that declares an `empty:` line draws that
 * line in its frame when it has nothing to show: the record or Home left it out for holding nothing (`why` `empty` or
 * `unsaid`), or every figure it reads added up no row (`readNone`). A widget its `when:` or its last day turned off,
 * one held from the reader, or one the record refused keeps what it had. Today's own tiles keep the calm rule.
 */

import { KEEP, says } from '../page/home.ts';
import type { LiveBlock } from '../record/page-live.ts';

/** Whether the block is a widget the person put on the board from the sheet: Today's own tiles have names of their own. */
export const fromSheet = (b: { key?: string | undefined }): boolean => typeof b.key === 'string' && b.key.startsWith('w-');

/** The widget's own empty line, or `null` where it wrote none (or keeps its noughts). */
const lineOf = (b: LiveBlock): string | null => {
  const e = (b as { empty?: unknown }).empty;
  return typeof e === 'string' && e.trim() !== '' && e !== KEEP ? e.trim() : null;
};

/** Kinds that never say an empty line: a sentence, a field to type into, a heading, and a widget that draws itself. */
const NEVER = new Set(['note', 'capture', 'inputs', 'section', 'drawn']);

/** Whether every figure of a row of figures added up no row, so the row says nothing a nought would not. */
const figuresNone = (b: LiveBlock): boolean => {
  const metrics = b.metrics ?? [];
  return metrics.length > 0 && metrics.every((m) => m.readNone === true || m.nothingHeld === true || m.unsaid === true);
};

/**
 * The widget as it draws its empty line, or `null` where it draws as it was. The block keeps its key, place, size and
 * heading; its rows and figures go, so the drawer's own empty state says the widget's `empty:` (`blocks.ts` `nothing`).
 */
export function emptySaid(b: LiveBlock): LiveBlock | null {
  if (!fromSheet(b) || NEVER.has(b.kind) || says(b)) return null;
  const line = lineOf(b);
  if (line === null) return null;
  const why = (b as { why?: unknown }).why;
  /* LEFT OUT FOR HOLDING NOTHING: by the record or the kernel (`why`), or by Home's own calm (`hollow`, no `why`). A
     widget the phone did not ask for (`phone-ask.ts`) is one its board gives no cell, so it stays out there all the same. */
  const left = b.drawn === false && (why === 'empty' || why === 'unsaid' || why === undefined);
  const none = b.drawn !== false && b.kind === 'stat' && figuresNone(b);
  if (!left && !none) return null;
  return { ...b, drawn: true, why: undefined, metrics: [], rows: [], entries: [], matched: [], total: 0, shown: 0, empty: line, saysEmpty: true } as LiveBlock;
}
