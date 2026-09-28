/**
 * What a list or a row says in the place of the controls a colleague's level does not reach (COL-13).
 *
 * ONE SENTENCE WHERE THE CONTROLS STOOD. `may()` takes the capture line off a list, and Edit, Archive and the note box
 * off a row, for somebody who holds Reads there; a screen that only lost them reads as broken, or as a list nobody can
 * add to, so the place they stood says why. Nothing on the ladder can read a list and not change it except Reads (an
 * appender reads nothing, and Edits adds too), so one sentence covers every screen that draws it.
 *
 * Kept beside the two screens that say it rather than in `copy.ts`, which no builder in this wave owns.
 */
export const reachWords = {
  readOnly: (list: string) => `You can read ${list} but not add to it or change it.`,
} as const;
