/**
 * THE REWRITE OF A NOTE LOSES NO TEXT (REC-A13 step 4). An arrangement that lifts a project's one line, its plan and what
 * is in the way out of its note, and writes the note again, keeps every character of the old note: in the new note, or
 * in a field it was lifted into. The check is on lengths, which is what a session can work out before it files and what
 * the record can work out before it takes the yes: the old note is no longer than the new note and everything lifted out
 * of it, put together.
 *
 * COUNTED WITHOUT SPACE, so a note whose blank lines and indents go, as a rewrite tidies them, is not short by those; and
 * BY CHARACTER, not by UTF-16 unit, so a note in a script outside the Latin one is measured as a reader would. A heading
 * the rewrite drops ("Blockers:" over what moved into In the way) counts against it, so a rewrite keeps such a word in
 * the field or in the note, never neither.
 *
 * PURE, AND THE RECORD'S: `@braindog/seed`'s after-an-import skill states the same rule in words for the session, and the
 * record holds every arrangement to it (`notesKept`), whoever filed it.
 */

/** How many characters a text holds, leaving out space of every kind. */
const counted = (text: string): number => [...text.replace(/\s+/gu, '')].length;

/** Every text in a value: a string, the strings of a list, the strings of a map's values, at any depth. */
function textsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(textsIn);
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(textsIn);
  return [];
}

/**
 * Whether a note written again kept its text: `before` is no longer than `after` and every value in `moved` put together.
 * `moved` is what was lifted out of it, each a text, a list of texts, or a map of them (a plan step's `what` and `gain`).
 */
export function textKept(before: string, after: string, moved: readonly unknown[]): boolean {
  return counted(before) <= counted(after) + moved.flatMap(textsIn).reduce((n, t) => n + counted(t), 0);
}

/** How many characters short a rewrite falls, or 0 when it kept the text. */
export function textShort(before: string, after: string, moved: readonly unknown[]): number {
  return Math.max(0, counted(before) - counted(after) - moved.flatMap(textsIn).reduce((n, t) => n + counted(t), 0));
}

/** A change to an entry, and a new entry, as an arrangement's `rows` carry them once checked (`rowsOf` in `arrange.ts`). */
export type KeptRow = {
  register: string;
  at?: string;
  patch?: Record<string, unknown>;
  before?: Record<string, unknown>;
  fields?: Record<string, unknown>;
};

/** The words a field is kept in: a document, a line of text, or a list of them. Anything else lifts no text. */
const WORDS = new Set(['document', 'text', 'list']);

/**
 * THE FIRST CHANGE IN AN ARRANGEMENT THAT REWRITES A DOCUMENT AND LOSES TEXT, by its place in `rows` and said in a
 * sentence, or `null` when none does. A change rewrites a document when its patch gives a field of the `document` type a
 * new text and its `before` held one. What it lifted out is every other text or list the same patch writes, and every
 * text of a new entry in the same arrangement that points at it (`pointsAt`: a plan step whose `thing` is the project).
 * A lane, a day or a health is no text and lifts nothing, so a status moved beside a rewrite does not pay for words lost.
 *
 * `types(register)` is each field's type by its id, `pointsAt(row, at)` whether a new entry's ref fields name the entry
 * `at`, and `named(row)` the entry as its owner knows it ("Kiln in Projects").
 */
export function notesKept(
  rows: readonly KeptRow[],
  types: (register: string) => ReadonlyMap<string, string>,
  pointsAt: (row: KeptRow, at: string) => boolean,
  named: (row: KeptRow) => string,
): { at: number; fix: string } | null {
  for (const [i, row] of rows.entries()) {
    if (typeof row.at !== 'string' || !row.patch || !row.before) continue;
    const typed = types(row.register);
    for (const [field, type] of typed) {
      if (type !== 'document' || !(field in row.patch)) continue;
      const was = row.before[field];
      if (typeof was !== 'string' || was.trim() === '') continue;
      const now = row.patch[field];
      const words = (r: string, id: string) => WORDS.has(types(r).get(id) ?? '') && types(r).get(id) !== 'document';
      const lifted = [
        ...Object.entries(row.patch).filter(([id]) => words(row.register, id)).map(([, v]) => v),
        ...rows
          .filter((r) => r.fields !== undefined && pointsAt(r, row.at!))
          .flatMap((r) => Object.entries(r.fields!).filter(([id]) => words(r.register, id)).map(([, v]) => v)),
      ];
      const short = textShort(was, typeof now === 'string' ? now : '', lifted);
      if (short > 0)
        return {
          at: i,
          fix: `The new text of ${named(row)} leaves out ${short === 1 ? 'a character' : `${short} characters`} of the old one that no field here takes. Keep every word of the old text, in the text or in the fields it moves to.`,
        };
    }
  }
  return null;
}
