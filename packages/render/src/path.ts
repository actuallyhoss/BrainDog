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
 *   short | label             first and at most once: the name of the short view, when the block declares `short:`
 *   title | detail | mark     a stone, the mark `done`, `next` or nothing (later), then `short` when it is in that view
 *   more  | N                 last and at most once: how many open steps the short view left out
 *
 * A PATH MAY HAVE A SHORT VIEW OF ITSELF: the few steps that matter now, named ("This week"), with the rest there
 * for when there is room. The record says which stones are in it (`short_now`), and the writer marks each with a
 * second word, `done short`, `next short` or `short`. The drawer shows the short view first, says how many more there
 * are, and the Svelte drawer adds a two-way switch to everything; `toHTML` has no switch and draws the short view.
 * A path whose short view holds every stone, or none, has nothing to switch between and draws every stone.
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
/** Under a short view: how many stones it left out, which the switch to every stone brings back. */
export const pathRest = (n: number): string => `${n} more for when there's room`;
/** The switch's other half, and what the switch as a whole is called. */
export const PATH_EVERYTHING = 'Everything';
export const PATH_VIEWS = 'Steps shown';
/** The name of a stone's toggle whose step has no title. A control is never unnamed. */
export const PATH_STEP = 'Step';

const cell = (cells: readonly string[], i: number): string => (cells[i] ?? '').trim();

/** Whether a row is the count of the rest: `more | N`, exactly two cells. */
const isCount = (cells: readonly string[]): boolean => cells.length === 2 && cell(cells, 0) === 'more';

/** Whether a row names the short view: `short | label`, exactly two cells, as a count is. */
const isName = (cells: readonly string[]): boolean => cells.length === 2 && cell(cells, 0) === 'short';

/**
 * A mark cell read: the stone's mark and whether it is in the short view, or null for words that are neither.
 *
 * THE MARK FIRST AND `short` AFTER IT, OR `short` ALONE, and nothing else: `short done` would be the same fact in a
 * second spelling, and a second spelling is how a writer and a drawer come to disagree.
 */
function markOf(word: string): { mark: PathMark; short: boolean } | null {
  const [first = '', second, ...rest] = word.split(/\s+/u).filter(Boolean);
  if (rest.length > 0) return null;
  if (second !== undefined && second !== 'short') return null;
  const short = second === 'short';
  if (first === 'short' && second === undefined) return { mark: 'later', short: true };
  const mark: PathMark | null = first === 'done' ? 'done' : first === 'next' ? 'next' : first === '' ? 'later' : null;
  return mark === null ? null : { mark, short };
}

/**
 * What is wrong with a path's rows, in words, or null when nothing is.
 *
 * The parser degrades the block with this, because a mark it does not know would otherwise be drawn as later, and a
 * step somebody marked `doing` quietly losing its place is the drawer deciding what the author meant.
 */
export function pathFault(rows: readonly (readonly string[])[]): string | null {
  let ended = false;
  let nexts = 0;
  for (const [i, cells] of rows.entries()) {
    if (ended) return 'a step after the count of the rest';
    /* THE NAME COMES FIRST OR NOT AT ALL, so a reader of the fence knows what the marks below it mean before reading
       them, and a second name would be two short views where the switch has room for one. */
    if (isName(cells)) {
      if (i > 0) return 'a name for the short view that is not its first row';
      if (cell(cells, 1) === '') return 'a short view with no name';
      continue;
    }
    if (isCount(cells)) {
      if (!/^\d+$/u.test(cell(cells, 1))) return 'a count of the rest that is not a whole number';
      ended = true;
      continue;
    }
    const word = cell(cells, 2);
    const read = markOf(word);
    if (read === null) return `a mark "${word}" where done, next or nothing goes`;
    if (read.mark === 'next' && ++nexts > 1) return 'two steps marked next';
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
export function pathPlan<R extends { cells: readonly string[] }>(
  rows: readonly R[],
): { stones: { row: R; mark: PathMark; short: boolean }[]; more: number; name: string | null } {
  const stones: { row: R; mark: PathMark; short: boolean }[] = [];
  let more = 0;
  let name: string | null = null;
  for (const row of rows) {
    if (isName(row.cells)) {
      name ??= cell(row.cells, 1) || null;
      continue;
    }
    if (isCount(row.cells)) {
      const n = Number(cell(row.cells, 1));
      more = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
      continue;
    }
    const read = markOf(cell(row.cells, 2)) ?? { mark: 'later' as const, short: false };
    stones.push({ row, mark: read.mark, short: read.short });
  }
  return { stones, more, name };
}

/**
 * Whether a path draws its short view: it names one, and the view holds some of its stones and not all of them.
 *
 * A view of every stone or of none is not a view of anything, so there is nothing to switch between: every stone is
 * drawn and no switch is offered.
 */
export function pathShort(plan: { stones: readonly { short: boolean }[]; name: string | null }): boolean {
  const held = plan.stones.filter((s) => s.short).length;
  return plan.name !== null && held > 0 && held < plan.stones.length;
}
