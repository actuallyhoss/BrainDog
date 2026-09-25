/**
 * The arithmetic of arranging: pure, and therefore testable.
 *
 * Split from `arrange.svelte.ts` for one reason and it is a good one — a `.svelte.ts` file uses the
 * `$state` rune, which only exists after the Svelte compiler has run, so `node --test` cannot
 * import it. The reactive class is four lines of assignment around these functions; the functions
 * are where a bug would actually live, and they are the half that can be checked.
 *
 * It is also the better shape. Reordering a page is `splice`, resizing is a bounds check, and
 * neither has anything to do with reactivity.
 */

import { KINDS, isKind } from 'braindog-render';

/** Which of a page's two columns a block sits in, on a page that declares `layout` (brief D4). */
export type Area = 'main' | 'rail';

/**
 * One block's arrangement. `i` indexes the DECLARED order, so a draft can be diffed against it.
 *
 * `area` IS ABSENT ON A PAGE WITH NO RAIL, and absent means main, as it does in the declaration. So every slot a page
 * with no `layout` has ever made is still a slot, and compares equal to the same slot with `area: 'main'`.
 */
export type Slot = { i: number; span: number; area?: Area };

/** 12 · 6 · 4 — full, half, third. 21 §3.1's steps, and Home Assistant's multiplier of 3. */
export const STEPS = [12, 6, 4] as const;

export const COLUMNS = 12;

/**
 * Move one slot to another index.
 *
 * Clamped rather than refused, because the caller is a drag: a pointer released past the last block
 * means "put it last", and a `move` that returned unchanged for an out-of-range index would make a
 * drag to the bottom of a page silently do nothing.
 */
export function moveAt(slots: readonly Slot[], from: number, to: number): Slot[] {
  if (from < 0 || from >= slots.length) return [...slots];
  const at = Math.max(0, Math.min(slots.length - 1, to));
  if (at === from) return [...slots];
  const next = [...slots];
  const [held] = next.splice(from, 1);
  if (held) next.splice(at, 0, held);
  return next;
}

/**
 * Where a drop actually lands, given what you picked up and which edge you released it on.
 *
 * THE OFF-BY-ONE HERE IS THE WHOLE FUNCTION. `moveAt` splices the held block out before it splices
 * it back in, so every index after the one you took shifts down by one — and "drop it after block
 * four", when block four is below where you started, means index four rather than five. Getting
 * this wrong does not throw. It puts the block one place from where the reader let go of it, which
 * they will read as the drag being imprecise rather than as arithmetic.
 *
 * Dropping either side of the block you are already holding is a no-op, and `moveAt` treats it as
 * one.
 */
export const dropIndex = (from: number, at: number, edge: 'before' | 'after'): number => {
  const to = edge === 'after' ? at + 1 : at;
  return from < to ? to - 1 : to;
};

export const removeAt = (slots: readonly Slot[], at: number): Slot[] => slots.filter((_, n) => n !== at);

export const setSpanAt = (slots: readonly Slot[], at: number, span: number): Slot[] =>
  slots.map((s, n) => (n === at ? { ...s, span } : s));

/** The area a slot is in, reading an absent one as the main column the declaration means by leaving it out. */
const areaOf = (s: Slot | undefined): Area => s?.area ?? 'main';

/**
 * True once one list says something different from the other. Drives Done's behaviour.
 *
 * THE AREA COUNTS. It compared order and span only, so a draft whose one change was a block moved to the rail read as
 * the page unchanged, and Done closed the mode with "Nothing moved." over a block sitting in the rail on screen
 * (measured: `differs` answered false for exactly that pair before the area was compared).
 */
export const differs = (a: readonly Slot[], b: readonly Slot[]): boolean =>
  a.length !== b.length || a.some((s, n) => s.i !== b[n]?.i || s.span !== b[n]?.span || areaOf(s) !== areaOf(b[n]));

export const setAreaAt = (slots: readonly Slot[], at: number, area: Area): Slot[] =>
  slots.map((s, n) => (n === at ? { ...s, area } : s));

/**
 * The index a block one step up or down lands at, counting only the blocks in its own area.
 *
 * THE LIST IS ONE ORDER AND THE SCREEN DRAWS IT AS TWO COLUMNS. Rail and main blocks interleave in the declaration, so
 * `at - 1` can be a block in the other column: the move is a real splice that the reader cannot see, and Move up looks
 * like a button that does nothing. The neighbour in the same area is the block drawn above or below it. With no rail
 * every block is main, and this is `at - 1` and `at + 1` as it always was. `at` itself when there is nowhere to go.
 */
export function nearestInArea(slots: readonly Slot[], at: number, step: -1 | 1): number {
  const area = areaOf(slots[at]);
  for (let n = at + step; n >= 0 && n < slots.length; n += step) if (areaOf(slots[n]) === area) return n;
  return at;
}

/**
 * A drag released on the `edge` of block `at`: the held block takes that block's area, then its place.
 *
 * DROPPING ON THE OTHER COLUMN IS HOW A POINTER MOVES A BLOCK THERE, which is what the reader meant by letting go over
 * it. The area is set only when it differs, so on a page with no rail no slot gains an `area` it did not have and the
 * drag is exactly `moveAt` at `dropIndex`, as before.
 */
export function dropInto(slots: readonly Slot[], from: number, at: number, edge: 'before' | 'after'): Slot[] {
  const target = areaOf(slots[at]);
  const joined = areaOf(slots[from]) === target ? [...slots] : setAreaAt(slots, from, target);
  return moveAt(joined, from, dropIndex(from, at, edge));
}

/**
 * The narrowest span a kind survives, and the steps that are therefore offered.
 *
 * REFUSED, NOT CLAMPED. 21 §11: caps are counters, not discoveries, and a closed list's control
 * cannot express a non-member. A `Third` button that silently gives you a half is a button that has
 * taught you the wrong thing about your own page.
 */
export const stepsFor = (kind: string, columns = 0): number[] => {
  const floor = floorFor(kind, columns);
  return STEPS.filter((s) => s >= floor);
};

/**
 * `Full · Half · Third`, and the raw fraction for anything else.
 *
 * Precise is INFERRED from the value, never stored — 21 §3.1, adopting Home Assistant's trick. No
 * extra state to keep in sync, and a span a pack wrote as 5 shows its own number rather than being
 * rounded to the nearest button.
 */
export const spanLabel = (span: number): string =>
  span === 12 ? 'Full' : span === 6 ? 'Half' : span === 4 ? 'Third' : `${span}/12`;

/**
 * The narrowest span a block survives, which for a table is a function of its own column count.
 *
 * `minSpan` on the kind is a floor for the KIND. It is not enough for a `table`, because a table's
 * width requirement is a property of the block: three columns at span 6 is comfortable and five
 * columns at span 6 truncates every one of them — measured on the estate page, where `Renews`
 * disappeared entirely and `Nordhaven Registry` became `Nordhave…` in a 6-column slot.
 *
 * Two of twelve per declared column is the rule, floored at the kind's own minimum. It is a
 * heuristic and it is written down as one: a column is about 14ch of content plus padding, and a
 * twelfth of the 1180px page is about 90px. Better than a constant, and honest about being a guess.
 */
export const floorFor = (kind: string, columns = 0): number => {
  const base = isKind(kind) ? KINDS[kind].minSpan : 4;
  const primitive = isKind(kind) ? KINDS[kind].primitive : undefined;
  /* `table` and `rows` lay their cells out as HORIZONTAL TRACKS, so their width requirement is a
     function of how many. Every other primitive stacks or wraps its cells and does not care: a
     `todo` with three columns is three things on one line that can reflow, not three tracks that
     have to fit side by side. Measured on the Kiln page, where a three-cell `spec` at span 4 broke
     `GBP 14.00` across two lines. */
  if ((primitive !== 'table' && primitive !== 'rows') || columns === 0) return base;
  return Math.min(COLUMNS, Math.max(base, columns * 2));
};

/** A declared span, clamped to what the block can survive. Packs are written by strangers. */
export const spanOf = (kind: string, declared: number | undefined, columns = 0): number =>
  Math.min(COLUMNS, Math.max(floorFor(kind, columns), declared ?? COLUMNS));
