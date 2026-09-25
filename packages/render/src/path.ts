/**
 * What `steps path` decides, as functions both drawers call.
 *
 * Kept out of the markup for the reason `queue.ts` and `capture.ts` are: an answer here can be tested without a DOM,
 * and two drawers that each worked it out would be two answers.
 *
 * WHAT IT IS FOR. A path is an ordered list drawn as where somebody is on it: what is done, the one step that is next,
 * and what comes later. A plain `steps` block draws the same rows with a free-text state, and "next" there is a word
 * the author typed; on a path it is a fact the record answered (`done_now` and `next` on a `steps` block over a list
 * that declares `steps:`), so the drawer can mark it and a reader can find it without reading every row.
 *
 * THE ROWS ARE WHAT A PAGE'S EVALUATOR WRITES:
 *
 *   title | detail | mark     a stone, the mark `done`, `next` or nothing (later)
 *   more  | N                 last and at most once: how many open steps the short view left out
 *
 * THE COUNT IS TWO CELLS AND A STONE IS THREE, which is how a step somebody called "more" stays a step. The first cut
 * keyed the count on the word alone and a step titled "more" with a number in its detail would have become a count
 * and left the path; the evaluator writes every stone with its mark cell, blank or not, so the width is the tell.
 *
 * ONE STEP IS NEXT, OR NONE IS. Two stones marked next is two answers to "what do I do now", which is the one
 * question the form exists to answer once, so it degrades rather than drawing the first and dropping the second.
 */

/** A stone's mark, as the drawer names it. `later` is the blank cell. */
export type PathMark = 'done' | 'next' | 'later';

/** The words a path draws that its author did not write, here because this package cannot import the app's copy. */
export const PATH_DONE = 'done';
export const PATH_NEXT = 'Next';
export const pathMore = (n: number): string => `${n} more`;

const cell = (cells: readonly string[], i: number): string => (cells[i] ?? '').trim();

/** Whether a row is the count of the rest: `more | N`, exactly two cells. */
const isCount = (cells: readonly string[]): boolean => cells.length === 2 && cell(cells, 0) === 'more';

const markOf = (word: string): PathMark | null => (word === 'done' ? 'done' : word === 'next' ? 'next' : word === '' ? 'later' : null);

/**
 * What is wrong with a path's rows, in words, or null when nothing is.
 *
 * The parser degrades the block with this, because a mark it does not know would otherwise be drawn as later, and a
 * step somebody marked `doing` quietly losing its place is the drawer deciding what the author meant.
 */
export function pathFault(rows: readonly (readonly string[])[]): string | null {
  let ended = false;
  let nexts = 0;
  for (const cells of rows) {
    if (ended) return 'a step after the count of the rest';
    if (isCount(cells)) {
      if (!/^\d+$/u.test(cell(cells, 1))) return 'a count of the rest that is not a whole number';
      ended = true;
      continue;
    }
    const word = cell(cells, 2);
    const mark = markOf(word);
    if (mark === null) return `a mark "${word}" where done, next or nothing goes`;
    if (mark === 'next' && ++nexts > 1) return 'two steps marked next';
  }
  return null;
}

/**
 * The stones with their marks, and how many open steps are left out.
 *
 * Lenient where `pathFault` is strict, for the reason `queuePlan` is: `Block` is a public type a host can build by
 * hand, so a mark this does not know is read as later rather than thrown. The order is the evaluator's, which is the
 * order the list declares, and this never reorders.
 */
export function pathPlan<R extends { cells: readonly string[] }>(rows: readonly R[]): { stones: { row: R; mark: PathMark }[]; more: number } {
  const stones: { row: R; mark: PathMark }[] = [];
  let more = 0;
  for (const row of rows) {
    if (isCount(row.cells)) {
      const n = Number(cell(row.cells, 1));
      more = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
      continue;
    }
    stones.push({ row, mark: markOf(cell(row.cells, 2)) ?? 'later' });
  }
  return { stones, more };
}
