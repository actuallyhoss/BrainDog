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

/** One block's arrangement. `i` indexes the DECLARED order, so a draft can be diffed against it. */
export type Slot = { i: number; span: number };

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

export const removeAt = (slots: readonly Slot[], at: number): Slot[] => slots.filter((_, n) => n !== at);

export const setSpanAt = (slots: readonly Slot[], at: number, span: number): Slot[] =>
  slots.map((s, n) => (n === at ? { ...s, span } : s));

/** True once one list says something different from the other. Drives Done's behaviour. */
export const differs = (a: readonly Slot[], b: readonly Slot[]): boolean =>
  a.length !== b.length || a.some((s, n) => s.i !== b[n]?.i || s.span !== b[n]?.span);

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
  if (primitive !== 'table' || columns === 0) return base;
  return Math.min(COLUMNS, Math.max(base, columns * 2));
};

/** A declared span, clamped to what the block can survive. Packs are written by strangers. */
export const spanOf = (kind: string, declared: number | undefined, columns = 0): number =>
  Math.min(COLUMNS, Math.max(floorFor(kind, columns), declared ?? COLUMNS));
