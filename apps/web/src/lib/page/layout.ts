/**
 * A declared page's two regions, a main column and a side rail, and the boxed runs inside each (brief D4 of
 * `loop/research-dynamic-layouts.md`, primitive P1).
 *
 * THE DECLARATION IS STILL ONE LIST IN ONE ORDER. `layout: { rail: 4 }` on the page says the rail is four twelfths wide,
 * and a block that says `area: rail` sits in it; everything else is main. A layout is not a page in a page (`06 §7`):
 * nothing nests, nothing is placed by coordinates, and a phone reads the same list top to bottom with the rail after
 * the main column. So this file splits one list into two and never reorders either half.
 *
 * WHY A SPLIT AND NOT SPANS. Before this the only way to put blocks side by side was `span`, and a flow aligns rows: a
 * span-4 block beside a tall span-8 block leaves a hole under the short one, so three short blocks declared "beside"
 * one tall block were drawn under it (the survey's S1, measured). A rail is its own stack, so its height is its own.
 *
 * PURE, SO `node --test` READS IT WITH NO SVELTEKIT. `PageView.svelte` draws what this answers and decides nothing.
 */

import { COLUMNS, type Area } from '../record/arrange.ts';

export type { Area };

/** The page's layout as the kernel admits it: the rail's width in twelfths, and whether it stays in view. */
export type Layout = { rail: number; sticky: boolean };

/* THE KERNEL'S BOUNDS (`declare.ts`, RAIL_MIN and RAIL_MAX), repeated because the app cannot import the kernel's source
   and a rail it would refuse must not be drawn at a width nobody chose. */
const RAIL_FEWEST = 3;
const RAIL_MOST = 5;

/**
 * The page's `layout`, or `null` for a page drawn as one column.
 *
 * ANYTHING THE KERNEL WOULD REFUSE IS ONE COLUMN, never a guess at a width. The install refuses `rail: 13` and
 * `sticky: 'yes'`, so a body carrying either came from an older record or a hand-set declaration, and the page it has
 * always drawn is the right fallback. Only `true` keeps the rail in view, because `'yes'` is truthy wherever it is read.
 */
export function layoutOf(page: unknown): Layout | null {
  const layout = page !== null && typeof page === 'object' ? (page as { layout?: unknown }).layout : undefined;
  if (layout === null || typeof layout !== 'object') return null;
  const { rail, sticky } = layout as { rail?: unknown; sticky?: unknown };
  if (typeof rail !== 'number' || !Number.isInteger(rail) || rail < RAIL_FEWEST || rail > RAIL_MOST) return null;
  return { rail, sticky: sticky === true };
}

/** The twelfths the main column takes, which are what a main block's `span` is a share of. */
export const mainSpan = (layout: Layout): number => COLUMNS - layout.rail;

/** The area a block's own `area` names, where anything but `rail` is the main column. */
const named = (area: unknown): Area => (area === 'rail' ? 'rail' : 'main');

const areaIn = (area: unknown, layout: Layout | null): Area => (layout ? named(area) : 'main');

/** The area a drawn block sits in on this page. The app's block type does not name `area`; the page read carries it. */
export const areaOf = (block: object, layout: Layout | null): Area => areaIn((block as { area?: unknown }).area, layout);

/**
 * The blocks in each area, each in declared order.
 *
 * A PAGE WITH NO LAYOUT IS ALL MAIN, whatever its blocks say. The kernel refuses `area: rail` there, so a block that
 * carries it is from a body the install did not check, and drawing it in a rail nobody declared would put it in a
 * column the page does not have.
 *
 * `read` names where a drawn item keeps its area, because the page draws `{ slot, block }` pairs and the arrangement's
 * slot, not the declaration, is what says where a block is while somebody is moving it.
 */
export function splitAreas<T>(
  blocks: readonly T[],
  layout: Layout | null,
  read: (b: T) => unknown = (b) => (b as { area?: unknown }).area,
): { main: T[]; rail: T[] } {
  const main: T[] = [];
  const rail: T[] = [];
  for (const b of blocks) (areaIn(read(b), layout) === 'rail' ? rail : main).push(b);
  return { main, rail };
}

/** A run of blocks drawn together: on one surface when a boxed section opened it, loose otherwise. */
export type Run<T> = { box: boolean; items: T[] };

/**
 * The runs an area's blocks draw in: a `section` with `box: true` and the blocks after it up to the next section share
 * one surface; everything else is loose, as it always was.
 *
 * THE SECTION IS INSIDE ITS OWN BOX, as the box's heading. That is how a sentence and the three columns under it become
 * one block of the first screen without a page in a page: the surface is drawn round blocks that are still separate
 * blocks in the one list, each with its own query and its own failure.
 *
 * A BOX NEVER CROSSES AREAS, because this is called on one area at a time. A boxed section in the main column holds the
 * main blocks after it, and a rail block declared between them stays in the rail.
 *
 * ONLY `true` BOXES, for the reason only `true` makes a rail sticky. And a page with no boxed section comes back as one
 * loose run, which is the page as it was drawn before boxes existed.
 */
export function boxesOf<T>(blocks: readonly T[], read: (b: T) => { kind?: unknown; box?: unknown } = (b) => b as { kind?: unknown; box?: unknown }): Run<T>[] {
  const runs: Run<T>[] = [];
  for (const b of blocks) {
    const { kind, box } = read(b);
    const last = runs.at(-1);
    if (kind === 'section' && box === true) runs.push({ box: true, items: [b] });
    else if (kind === 'section' && last?.box) runs.push({ box: false, items: [b] });
    else if (last) last.items.push(b);
    else runs.push({ box: false, items: [b] });
  }
  return runs;
}

/**
 * Whether the rail stays in view while the main column scrolls: asked for, measured, and no taller than the room.
 *
 * A STICKY RAIL TALLER THAN THE WINDOW HIDES ITS OWN FOOT. It stays pinned while the main column scrolls, so the blocks
 * at its end cannot be reached until the main column runs out. So `sticky: true` is a request, honoured when the rail
 * fits; `rail` is its drawn height and `room` the height it would have under the page's sticky head. Nought is a rail
 * not yet measured, which is not sticky, so the first frame draws it in the flow like any other column.
 */
export const sticks = (layout: Layout | null, rail: number, room: number): boolean =>
  layout?.sticky === true && rail > 0 && rail <= room;
