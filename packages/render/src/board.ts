/**
 * The board's arithmetic, in a plain module because none of it is markup.
 *
 * A `board` used to be four stacks of `div`s: `[draggable="true"]` was 0 on `/p/work`, 14 cards
 * across 4 state columns, none draggable, none clickable, none focusable: a kanban board with no
 * way to move a card, which is the fourth most expensive thing the friction pass measured. The card
 * moves now, and the four questions that decide where it lands are the ones with wrong answers that
 * look right on screen:
 *
 *   - a keyboard move that WRAPS, so one press past `Done` puts the card back in `Todo`;
 *   - a drop onto the column the card is already in, reported as a write nobody asked for;
 *   - a drop carrying a column this board does not have, which would invent a fifth stack;
 *   - a moved card inserted into the MIDDLE of its new column, where you have to hunt for it.
 *
 * None of those are visible in a rendered tree, so testing the component would not find them and
 * they live here instead (22 §10).
 */

import type { Row } from './parse.ts';

/**
 * Moves made in one sitting: the row's index in the block, against the column it now sits in.
 *
 * BY INDEX, because the dialect is text and a row has no id. `Table` says the same thing about its
 * `key` and can demand one from its caller; a block's rows are in the order its cells named them,
 * and that order is the only handle a board has.
 */
export type Moves = Readonly<Record<number, string>>;

export type Card = {
  row: Row;
  /** Its index in `block.rows`, which is what a move is keyed by and what focus is held as. */
  at: number;
  /** Moved in this sitting and not yet written anywhere. The card draws a mark saying so. */
  moved: boolean;
};

export type Lane = { name: string; cards: Card[] };

/** Cell 0 IS the state. Grouping by it is the whole of what the `board` kind declares. */
export const columnOf = (row: Row): string => row.cells[0] ?? '';

/**
 * THE COLUMNS ARE THE ROWS' ORDER, and a move never changes them.
 *
 * A board is read by comparing four stacks that stay in the same places. If the column list were
 * derived from where the cards are NOW, emptying `Doing` would delete the column, and the reader
 * would watch the board reflow under the card they just dropped, into a shape with no `Doing` in it
 * and nowhere to put the next one. An empty column is information; a vanished one is a bug.
 */
export function columnsOf(rows: readonly Row[]): string[] {
  return [...new Set(rows.map(columnOf))];
}

/** Where a card is NOW: its declared column, unless a move in this sitting put it elsewhere. */
export function columnAt(rows: readonly Row[], at: number, moved: Moves = {}): string {
  const row = rows[at];
  if (!row) return '';
  return moved[at] ?? columnOf(row);
}

/**
 * The cards, grouped, with the moved ones at the FOOT of the column they were moved into.
 *
 * In row order otherwise, because that is the order the author wrote and the only one the dialect
 * carries. A moved card appended rather than slotted in by its index is the one placement the
 * reader can predict without counting: you let go over a column and the card is at the bottom of
 * it, which is also where the pointer was. Slotted by index it would appear somewhere in the middle
 * of a stack of six and the drop would read as a card that went missing.
 */
export function lanes(rows: readonly Row[], moved: Moves = {}): Lane[] {
  const out: Lane[] = columnsOf(rows).map((name) => ({ name, cards: [] }));
  const byName = new Map(out.map((lane) => [lane.name, lane]));

  const placed = rows.map((row, at) => {
    const home = columnOf(row);
    const to = moved[at];
    /* A move naming a column this board does not have is not a move. `dropTarget` refuses those at
       the edge; this is the second latch, because `moved` is state a host could also be handed. */
    const away = to !== undefined && to !== home && byName.has(to);
    return { card: { row, at, moved: away }, where: away ? (to as string) : home };
  });

  for (const p of placed) if (!p.card.moved) byName.get(p.where)?.cards.push(p.card);
  for (const p of placed) if (p.card.moved) byName.get(p.where)?.cards.push(p.card);

  return out;
}

/**
 * The column `step` places along from `from`, or `null` when there is none.
 *
 * IT DOES NOT WRAP, and that is the whole reason this is a function. Under wrapping, the cheapest
 * possible slip (one press too many) becomes the largest possible move: from the last column all
 * the way back to the first. A board's columns are a sequence of states, not a ring. `null` is what
 * a key with nowhere to go returns, and the caller draws nothing.
 */
export function moveTarget(columns: readonly string[], from: string, step: number): string | null {
  const at = columns.indexOf(from);
  if (at < 0) return null;
  return columns[at + step] ?? null;
}

/**
 * The column a drop lands in, or `null` when the drop is refused.
 *
 * TWO REFUSALS, AND THE SECOND IS THE ONE THAT MATTERS. A column this board does not have comes
 * from a drag that started somewhere else, and honouring it would put a card in a stack nobody can
 * see. A drop onto the card's own column changes nothing, and a move that changes nothing must not
 * call `onmove`, because the callback is a WRITE and the card would wear a "not saved" mark for a
 * write with nothing in it. Both are the same rule: report a move, never a gesture.
 */
export function dropTarget(columns: readonly string[], from: string, to: string): string | null {
  if (!columns.includes(to)) return null;
  if (to === from) return null;
  return to;
}
