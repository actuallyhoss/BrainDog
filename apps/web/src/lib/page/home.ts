/**
 * What a declared page does differently when it is a home: the blocks that hold nothing are not drawn, a long block is
 * folded in place, and the keys walk the rows of every block rather than the blocks.
 *
 * ONE RULE FOR EVERY HOME, AND NOT A LIST OF SOURCES. Home hid its figures when no pack pinned one and its runs when no
 * agent was working, by name (`lib/home/default-home.ts` `homeBlocks`). Today drawn as a declared page has more blocks
 * that are empty on most days, and a use case's home has its own, so the rule is said once about any block: a block
 * that holds nothing, and whose author wrote no sentence for that, is not drawn on a home. DIRECTION §35: an empty or
 * unused part is not drawn.
 *
 * PURE, AND NODE LOADS IT (type imports only), so `home.test.ts` holds each rule without a component.
 */

import type { LiveBlock } from '../record/page-live.ts';

/**
 * THE KINDS WHOSE EMPTINESS IS THE POINT, never hidden: a sentence, a heading, a field to type into, and the kinds whose
 * rows are written on the declaration rather than read from a list. A capture with nothing under it is the way to add
 * the first thing; a path with no steps is where the first step is added.
 */
const KEPT = new Set(['note', 'section', 'capture', 'inputs', 'steps', 'quote', 'code', 'tree', 'embed', 'link', 'gallery']);

/** A block the record refused, or this build cannot draw: it draws its own sentence and is never called empty. */
export const says = (b: LiveBlock): boolean => b.refusals.length > 0 || b.cannot !== undefined;

/**
 * Whether a block answered nothing at all: no row, figure, question, line of the feed, step of a walk or version.
 *
 * EVERY SHAPE AN ANSWER COMES IN IS ASKED, because a kind holds what it holds in its own field: a stat its `metrics`,
 * a queue its `queue`, a forecast its `walk`. A block a registered kind draws (`answer`) is never called empty here,
 * because only its own module can read what it holds.
 */
export function holdsNothing(b: LiveBlock): boolean {
  if (b.answer !== undefined) return false;
  /* A BLOCK WITH NO SOURCE IS DRAWN FROM ITS DECLARATION (its `body`), so it holds what its author wrote. */
  if (typeof b.body === 'string' && b.body.trim() !== '') return false;
  return (
    b.rows.length === 0 &&
    b.entries.length === 0 &&
    b.total === 0 &&
    (b.metrics?.length ?? 0) === 0 &&
    (b.measures?.length ?? 0) === 0 &&
    (b.queue?.length ?? 0) === 0 &&
    (b.feed?.length ?? 0) === 0 &&
    (b.actions?.length ?? 0) === 0 &&
    (b.history?.length ?? 0) === 0 &&
    (b.walks?.length ?? 0) === 0 &&
    b.walk == null &&
    b.bars == null &&
    b.parts == null
  );
}

/** Whether a block has nothing to draw but its `empty:` line: it holds nothing, and is not a kind whose emptiness is the point. */
export const bare = (b: LiveBlock): boolean => !says(b) && !KEPT.has(b.kind) && holdsNothing(b);

/**
 * Whether a page being read leaves the block out: it holds nothing and its author wrote no `empty:` line to say so, or
 * this build cannot draw it from the record yet.
 *
 * A BLOCK THIS BUILD CANNOT DRAW IS NOT THE READER'S TO FIX, so outside authoring it is not drawn: "This part of the
 * page cannot be drawn from the record yet" under "Working now" told a person about our build, not their record. A
 * block the record REFUSED is still drawn, because its sentence names the fix in the declaration and somebody has to
 * see it. While a page is arranged every block is drawn, `PageBody` does not ask this then.
 */
const hidden = (b: LiveBlock): boolean =>
  (b.cannot !== undefined && b.refusals.length === 0) || (bare(b) && !(typeof b.empty === 'string' && b.empty.trim() !== ''));

/**
 * THE BLOCKS AS A PAGE IS READ, a home or any other: the same list at the same indexes, a block that holds nothing or
 * cannot be drawn marked not drawn, as a block whose `when:` said no already is. The indexes stay, because every write and every id on the page is keyed by
 * the block's place in the declaration.
 *
 * A SECTION OVER NOTHING GOES WITH ITS BLOCKS: a heading whose every block, up to the next section, is not drawn
 * heads nothing. A section with no block after it at all is the author's own divider and stays.
 */
export function emptyHidden<B extends LiveBlock>(blocks: readonly B[]): B[] {
  const out = blocks.map((b) => (b.drawn && hidden(b) ? { ...b, drawn: false } : b));
  out.forEach((b, n) => {
    if (b.kind !== 'section' || !b.drawn || says(b)) return;
    const end = out.findIndex((x, m) => m > n && x.kind === 'section');
    const under = out.slice(n + 1, end === -1 ? undefined : end);
    if (under.length > 0 && under.every((x) => !x.drawn)) out[n] = { ...b, drawn: false };
  });
  return out;
}

/* ── the fold ──────────────────────────────────────────────────────────────── */

/** How many rows a block on a home draws before the rest fold under "N more", as Today folds its list. */
export const FOLD_AT = 8;

/** The kinds that are a list of rows, and so fold. A figure, a chart or a board is one picture and never cut. */
const FOLDS = new Set(['todo', 'timeline', 'feed', 'table', 'agents', 'list']);

/**
 * How many of `count` rows a block of `kind` draws, and how many are folded under it; `null` where nothing folds.
 *
 * NOT FOR ONE ROW: "1 more" under eight rows is a press that saves nobody any reading, so a block folds only when two or
 * more rows would go under the fold.
 */
export function foldOf(kind: string, count: number, open: boolean): { shown: number; more: number } | null {
  if (open || !FOLDS.has(kind) || count < FOLD_AT + 2) return null;
  return { shown: FOLD_AT, more: count - FOLD_AT };
}

/* ── the row cursor ────────────────────────────────────────────────────────── */

/**
 * The key the cursor holds each row by, in the order the page draws them: its block and its own id, or its place in the
 * block where it has none (`@n`).
 *
 * ONE KEY PER ROW, EVEN WHEN TWO LISTS IN ONE BLOCK NUMBER THEIR ROWS ALIKE. A prose block with two lists in it draws
 * `0 1 2` twice, and the cursor finds its row by key, so the fourth row read as the first and `j` went round the same
 * six rows of Kiln's notes for ever. A repeat is told apart by its place in the block, which no id can collide with.
 */
export function rowKeys(rows: readonly { slot: string; row: string | undefined }[]): string[] {
  const seen = new Set<string>();
  const n = new Map<string, number>();
  return rows.map(({ slot, row }) => {
    const at = n.get(slot) ?? 0;
    n.set(slot, at + 1);
    let key = `${slot}|${row ?? `@${at}`}`;
    if (seen.has(key)) key = `${slot}|@${at}`;
    seen.add(key);
    return key;
  });
}

/** The key of a block the cursor stops on as a whole, beside the rows' own (`rowKeys`). `@`, so no row id is it. */
export const wholeKey = (slot: string): string => `${slot}|@block`;

/**
 * The row `by` steps from `at` in a list of `count`, as Today moves: from nowhere, down is the first and up the last,
 * and the ends hold. `-1` is nowhere, and stays nowhere in an empty list.
 */
export function stepRow(count: number, at: number, by: number): number {
  if (count === 0) return -1;
  if (at < 0 || at >= count) return by > 0 ? 0 : count - 1;
  return Math.min(count - 1, Math.max(0, at + by));
}

/** The option a digit key answers, `1` to `9` as `0` to `8`, or `null` for any other key. */
export function optionOf(key: string): number | null {
  return /^[1-9]$/u.test(key) ? Number(key) - 1 : null;
}

/**
 * Where a row opens: the address it carries (`data-open`), else a row id of the shape `register#seq` or
 * `register:seq` as that row's own page, else nothing.
 */
export function openOf(open: string | undefined, row: string | undefined): string | null {
  if (open) return open;
  const m = row?.match(/^([a-z][\w-]*)[#:](\d+)$/u);
  return m ? `/r/${m[1]}/${m[2]}` : null;
}
