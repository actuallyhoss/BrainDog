/**
 * What a declared page does differently when it is a home: a long block is folded in place, and the keys walk the rows
 * of every block rather than the blocks. And the rule for what a page draws, which is the record's.
 *
 * THE RULE IS THE RECORD'S (`packages/kernel/src/drawn.ts`, DIRECTION §35: an empty or unused part is not drawn; §37:
 * one empty line a page). The record marks each block it leaves out `drawn: false` with `why`, so an agent reading a
 * page, a shared page and an export draw what the screen draws. Every caller here reads that flag: `emptyHidden` keeps
 * a block the record left out as it came and judges only what the record drew, which is also what a record on an older
 * kernel sends, and what this build alone knows (a block it `cannot` draw, a figure over a field nobody filled).
 *
 * ONE RULE, NOT A COPY. This file held `drawn.ts` word for word until the kernel exported it (batch 39); it is now this
 * one line, so the screen cannot drift from the record. The web's `registered` (a block that keeps its `answer` whole)
 * is the kernel's own first test, beside the kind registry it asks as well. `home.test.ts` holds the same cases as the
 * kernel's `drawn.test.ts`, through this file.
 *
 * NODE LOADS IT, so `home.test.ts` holds each rule without a component.
 */

export { KEEP, WHY, arranged, bare, emptyHidden, gone, holdsNothing, keeps, leadOf, markDrawn, says, unsaid, type Drawable, type Why } from '@braindog/kernel';

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
