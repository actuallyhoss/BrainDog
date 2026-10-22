/**
 * What a page's answer may have cut short in a row, so that nothing written back from a page carries the cut.
 *
 * A PAGE CUTS EVERY LONG TEXT IN ITS ROWS, AND SAYS SO. The Projects page answered 760 KB, 723 KB of it notes nothing
 * drew, so the kernel now sends each text past `ROW_TEXT_MOST` characters as its first `ROW_TEXT_MOST` and marks the row
 * `clipped` (`leanRows` in `packages/kernel/src/pages.ts`). A row's own page and `get` still answer it whole. So a
 * page's row is the whole row unless it says `clipped`, and then a text in it exactly that long may be the first part of
 * a longer one: every cut text is that long, and a text of any other length was never cut.
 *
 * THE DOCKED PANEL OPENED ON THE CUT. A project opened beside its page showed its note's first 280 characters, and Save
 * wrote those and the edit over the whole note. Two rules hold every write a page makes:
 * - what a person changes is read whole first (`wholeOf` here, `RowHost.whole`), so no box opens on a cut;
 * - a way back worked out from a page's row never puts back a value that may be cut (`cutIn`): a tick's Undo, a moved
 *   card's, a stone's and the panel's own.
 *
 * PURE, AND NODE LOADS IT, so `clipped.test.ts` holds both rules against a real kernel.
 */

import { ROW_TEXT_MOST } from '@braindog/kernel/constants';

import type { Entry, Fields } from '../record/schema.ts';

/** Whether one value is a text exactly as long as a cut leaves one, in code points, as the kernel counts its cut. */
const atCut = (v: unknown): boolean => typeof v === 'string' && v.length >= ROW_TEXT_MOST && [...v].length === ROW_TEXT_MOST;

/** Whether `field` of `e` may hold only the first part of a longer text: the row says `clipped`, and the text is that long. */
export function mayBeCut(e: Pick<Entry, 'fields' | 'clipped'>, field: string): boolean {
  if (e.clipped !== true) return false;
  const v = e.fields[field];
  return Array.isArray(v) ? v.some(atCut) : atCut(v);
}

/** Whether a patch worked out from `e` names a field of it that may be cut, so sending it would save a cut over the whole. */
export const cutIn = (e: Pick<Entry, 'fields' | 'clipped'>, patch: Readonly<Record<string, unknown>>): boolean =>
  Object.keys(patch).some((field) => mayBeCut(e, field));

/**
 * A page's cut row made whole from the record's `get` of it, or `null` when the two are not the same version.
 *
 * ONLY WHAT MAY BE CUT IS TAKEN FROM `got`, and the rest stays as the page read it. A text is never a ref, so nothing
 * taken needs the walk that turns a ref into the number a person says: the page's row has had that walk already, and
 * `get` answers a ref as the id the record stores. At another version the row has moved on since the page read it, and
 * none of that read is the row now.
 */
export function wholeOf(cut: Entry, got: { version: number; fields: Readonly<Record<string, unknown>> }): Entry | null {
  if (got.version !== cut.version) return null;
  const fields: Fields = { ...cut.fields };
  for (const field of Object.keys(cut.fields)) if (mayBeCut(cut, field)) fields[field] = (got.fields[field] ?? null) as Fields[string];
  const { clipped: _cut, ...rest } = cut;
  return { ...rest, fields };
}
