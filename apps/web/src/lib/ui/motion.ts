/**
 * The one place list motion lives (the motion system of 20 October, section 3): a row arriving, a row leaving, and
 * the rows beside it closing the gap. Every list that adds or takes away a row uses these three, so nothing picks its
 * own duration or curve.
 *
 *   {#each rows as row (row.seq)}
 *     <div role="row" in:rowIn out:rowOut animate:flip={settle()}>…</div>
 *   {/each}
 *
 * `in:` plays only for a row added after the list first drew (Svelte's default, no `|global`), so a page opening does
 * not ripple. The durations are read from the skin's tokens, so a skin or `a11y.css` that changes the scale changes
 * these too; the numbers beside them are what the tokens say today.
 *
 * ROW HEIGHT IS THE ONE LAYOUT PROPERTY THAT ANIMATES ANYWHERE: a row opening is the point of the motion, and the row
 * is the only thing laid out. Under reduced motion it is a 120ms fade and nothing moves.
 */

import { tick } from 'svelte';
import { cubicIn, quartOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';

/** Whether the reader asked for less motion. */
export const still = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A ROW THAT TAKES ANOTHER'S PLACE CHANGES WHERE IT STANDS (fluid F9): a typed line and the record's row that lands for it
 * are one row, and one leaving while the other arrived drew two rows over each other for a fifth of a second. The screen
 * says so just before it swaps them, and the change that follows is drawn still: nothing leaves, nothing opens, nothing
 * slides. Lifted once that change has been drawn, so the next row added or taken away moves as ever.
 */
let swapping = false;
export function swapInPlace(): void {
  swapping = true;
  void tick().then(() => void (swapping = false));
}

/**
 * A PLACE'S FIRST DRAW ARRIVES IN ORDER (fluid F6, scope E39): its first tiles rise one after another, `gap` apart
 * (`--d-stagger`), `most` of them, each over a page's `--d-page`, so the last is still by `by`. The rest are simply
 * there. Never on a way back, and never under reduced motion. Home's sheet writes the same numbers as `nth-child` delays.
 */
export const ARRIVAL = { gap: 40, most: 6, page: 200, by: 450 } as const;

/** When the tile at `index` starts to rise, in milliseconds, or `null` for one past the first `most`, which is simply there. */
export const arrivalDelay = (index: number): number | null => (index >= 0 && index < ARRIVAL.most ? index * ARRIVAL.gap : null);

/** The fade that stands in for every move under reduced motion. */
export const FADE = 120;

/**
 * A duration as CSS writes it, in milliseconds: `180ms` is 180 and `.18s` is 180. The build minifies the skin's tokens
 * to seconds, so reading the number alone made every row move last 0.18ms (VERIFY H1). Anything unreadable is the
 * fallback.
 */
export const msIn = (raw: string, fallback: number): number => {
  const s = raw.trim();
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n)) return fallback;
  return s.endsWith('ms') ? n : s.endsWith('s') ? n * 1000 : n;
};

/** A token's milliseconds from the skin, or the fallback where there is no document (a test, the server). */
export const ms = (name: string, fallback: number): number => {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return fallback;
  return msIn(getComputedStyle(document.documentElement).getPropertyValue(name), fallback);
};

/** A row arriving: its height opens and it fades in. `quartOut` stands for `--ease-out`. */
export function rowIn(node: Element): TransitionConfig {
  if (swapping) return { duration: 0 };
  if (still()) return { duration: FADE, css: (t) => `opacity:${t}` };
  const h = (node as HTMLElement).offsetHeight;
  return { duration: ms('--d-rows', 180), easing: quartOut, css: (t) => `opacity:${t};block-size:${t * h}px;overflow:clip` };
}

/** A row leaving: the same height closing, accelerating away (`cubicIn` stands for `--ease-in`). */
export function rowOut(node: Element): TransitionConfig {
  if (swapping) return { duration: 0 };
  if (still()) return { duration: FADE, css: (t) => `opacity:${t}` };
  const h = (node as HTMLElement).offsetHeight;
  return { duration: ms('--d-rows', 180), easing: cubicIn, css: (t) => `opacity:${t};block-size:${t * h}px;overflow:clip` };
}

/** Neighbours closing the gap: pass to `animate:flip`. Instant under reduced motion. */
export const settle = (): { duration: number; easing: (t: number) => number } => ({ duration: swapping || still() ? 0 : ms('--d-rows', 180), easing: quartOut });
