/**
 * `working: true`: a live-session dot beside a row.
 *
 * `Table`, `Grid` and `List` draw a cell from a plain string and know nothing about a declaration, a
 * register or a session — that is the app's to decide, and it writes its answer into the very cell
 * the dot belongs to, the way `sign` writes a `+` or `−` into a money cell before any primitive ever
 * sees it (`apps/web/src/lib/record/blocks.ts`, `projectRows`). This file is where the primitives read
 * that answer back out, so a table, a board and a list agree on what the mark looks like without any
 * one of them knowing about the others.
 *
 * IT LIVES IN `src/` AND NOT BESIDE THE DRAWERS, because the writing half is in the app and the reading
 * half is here: typing the same three characters out on both sides is exactly the kind of agreement
 * that drifts, and the rule about this package's independence is that nothing here reaches INTO the app
 * — the app importing `braindog-render` is what every other file in it already does. One constant, one
 * place, imported by both.
 */

/**
 * U+25CF BLACK CIRCLE with the text-presentation selector, so it stays a plain mark rather than
 * turning into a colour emoji no theme chose — `kinds.ts`'s own reason for the same suffix on every
 * `TONES` glyph.
 */
export const WORKING_GLYPH = '●︎';

/** The glyph plus the space that separates it from the row's own text: what gets written onto the
    front of a cell, and what gets read back off it. */
export const WORKING_MARK = `${WORKING_GLYPH} `;

export const WORKING_LABEL = 'Working now';

/** A cell with the mark taken off its front, and whether it was there. A cell with none comes back unchanged. */
export function takeWorking(cell: string | null): { text: string | null; working: boolean } {
  if (typeof cell !== 'string' || !cell.startsWith(WORKING_MARK)) return { text: cell, working: false };
  return { text: cell.slice(WORKING_MARK.length), working: true };
}

/**
 * Which cell a kind puts its own name in, and so which cell the mark goes on.
 *
 * NOT ALWAYS THE FIRST. A `board`'s first cell is the column the card sits in and a `timeline`'s is its
 * date, so on both of those the dot would land on something that is not the row's name at all. A
 * `steps` numbers itself from the list rather than from a cell, so its name is its first cell like
 * everything else. Anything not named here titles with its first cell.
 */
const TITLE_CELL: Readonly<Record<string, number>> = { board: 1, timeline: 1 };

export const workingCell = (kind: string): number => TITLE_CELL[kind] ?? 0;
