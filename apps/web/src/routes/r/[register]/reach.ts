/**
 * What a list or a row says in the place of the controls a colleague's level does not reach.
 *
 * ONE SENTENCE WHERE THE CONTROLS STOOD. `may()` takes the capture line off a list, and Edit, Archive and the note box
 * off a row, for somebody who holds Reads there; a screen that only lost them reads as broken, or as a list nobody can
 * add to, so the place they stood says why. Nothing on the ladder can read a list and not change it except Reads (an
 * appender reads nothing, and Edits adds too), so one sentence covers every screen that draws it.
 *
 * Kept beside the two screens that say it rather than in `copy.ts`, so the words stay with their screens.
 */
export const reachWords = {
  readOnly: (list: string) => `You can read ${list} but not add to it or change it.`,
} as const;

/**
 * The receipts a list's optimistic writes raise in a toast, with their six-second Undo (`lib/data/optimistic.ts`).
 *
 * Past tense and the row named, as every receipt in the product is. Kept here for `reachWords`' reason.
 */
export const writeWords = {
  state: (row: string, state: string) => `Set ${row} to ${state}.`,
  edited: (field: string, row: string) => `Changed ${field} on ${row}.`,
} as const;
