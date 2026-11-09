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
 *
 * SINCE 1 NOVEMBER THE THREE RIDE THE RECORD FORMING'S SPRING AND STEPS (`$lib/motion`, `--form-in`, `--form-out`,
 * `--form-settle`), so a line arriving in any list is the same satisfying motion as a card or a widget arriving.
 */

import { tick } from 'svelte';
import { cubicOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';

import { spring } from '../motion/spring.ts';
import { washIfGrown } from '../motion/grow.ts';

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
 * A SCREEN STILL DRAWING ITS FIRST ANSWER MOVES NO ROW (speed6, 2 Nov): before the work says it has drawn (`data-screen`
 * on `#main`), a row that arrives or leaves is the screen settling, not the record changing, as `calm` in `lib/motion`
 * reads it. Each one measured its own height to open or close, and between them the page was laid out again, once a
 * row: about 40 ms of a cold Work on a throttled phone, for motion that ended where it began.
 */
const settling = (): boolean => {
  if (typeof document === 'undefined') return false;
  const main = document.getElementById('main');
  return main !== null && !main.hasAttribute('data-screen');
};

/**
 * A PLACE'S FIRST DRAW ARRIVES IN ORDER (fluid F6): its first tiles rise one after another, `gap` apart
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

/**
 * THE GAP A ROW'S LIST PUTS BESIDE IT, and which side it is on (T19, 1 Nov). A row closing to nothing left its list's
 * `gap` (12px on Needs you) standing until the row was taken out, and then it went in one frame. The gap closes with the
 * height: a negative margin on the side the gap sits, after the row while one follows it, before it for the last.
 */
export function gapOf(node: Element): { px: number; side: 'margin-block-end' | 'margin-block-start' } | null {
  const parent = node.parentElement;
  if (!parent || typeof getComputedStyle !== 'function') return null;
  const px = Number.parseFloat(getComputedStyle(parent).rowGap);
  if (!Number.isFinite(px) || px <= 0) return null;
  const alone = node.previousElementSibling === null && node.nextElementSibling === null;
  if (alone) return null;
  return { px, side: node.nextElementSibling !== null ? 'margin-block-end' : 'margin-block-start' };
}

/** The margin that takes back `part` (0 to 1) of the gap, as CSS, or nothing where there is no gap. */
const gapCss = (gap: ReturnType<typeof gapOf>, part: number): string => (gap ? `;${gap.side}:${(-gap.px * part).toFixed(1)}px` : '');

/** Whether `a` is a glide Svelte's `animate:flip` laid on a row that carries it straight down. */
function glidesDown(a: Animation): boolean {
  if (a.id !== '' || !(a.effect instanceof KeyframeEffect)) return false;
  const first = a.effect.getKeyframes()[0]?.['transform'];
  const m = typeof first === 'string' ? /translate\((-?[\d.]+(?:e-?\d+)?)px, (-?[\d.]+(?:e-?\d+)?)px\)/u.exec(first) : null;
  return m !== null && Math.abs(Number(m[1])) < 1 && Number(m[2]) <= -1;
}

/**
 * THE ROWS UNDER AN ARRIVING ROW MOVE ONCE, AS ITS ROOM OPENS (9 Nov). A list that also glides its rows (`animate:flip`)
 * measures where they went before Svelte lays the new row's first frame on it (a microtask later, Svelte 5.57), so it
 * measured them a whole row lower and glided them down to there while the room opening under them carried them down
 * as well: they jumped up over the new row and fell two rows. Their glides straight down are let go as soon as they are
 * laid on, so they ride the room alone, as in a list with no glide. A glide sideways or up, a row trading places, stays.
 * One read of the list's animations, so the page's style is worked out once and not once a row.
 */
function unglideBelow(row: Element): void {
  const drop = (): void => {
    const list = row.parentElement;
    if (!list || !row.isConnected) return;
    for (const a of list.getAnimations({ subtree: true })) {
      const at = a.effect instanceof KeyframeEffect ? a.effect.target : null;
      if (at?.parentElement === list && row.compareDocumentPosition(at) & Node.DOCUMENT_POSITION_FOLLOWING && glidesDown(a)) a.cancel();
    }
  };
  /* Svelte lays a glide on in the microtask after the one that measured it, which is after this one: so one more. */
  queueMicrotask(() => queueMicrotask(drop));
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(drop);
}

/**
 * A ROW ARRIVING (the record forming of 1 November): its height opens on the even curve, so the rows under it glide down
 * to make room, while it rises 8px into place on the spring (`--ease-spring`) and fades in, over `--form-in`. One the
 * record grew while he looked wears the arrival wash as it lands (`motion/grow.ts`).
 */
export function rowIn(node: Element): TransitionConfig {
  if (swapping || settling()) return { duration: 0 };
  washIfGrown(node);
  if (still()) return { duration: FADE, css: (t) => `opacity:${t}` };
  const h = (node as HTMLElement).offsetHeight;
  const gap = gapOf(node);
  unglideBelow(node);
  return {
    duration: ms('--form-in', 320),
    css: (p) => {
      const open = cubicOut(Math.min(1, p / 0.6));
      return `opacity:${Math.min(1, p * 3).toFixed(3)};transform:translateY(${((1 - spring(p)) * 8).toFixed(2)}px);block-size:${(h * open).toFixed(1)}px;overflow:clip${gapCss(gap, 1 - open)}`;
    },
  };
}

/**
 * A ROW LEAVING: it lets go first, sinking a little and fading, and then the room it held closes on the spring, so the
 * rows under it rise into place. Over `--form-out` and half of `--form-settle`.
 */
export function rowOut(node: Element): TransitionConfig {
  if (swapping || settling()) return { duration: 0 };
  if (still()) return { duration: FADE, css: (t) => `opacity:${t}` };
  const h = (node as HTMLElement).offsetHeight;
  const gap = gapOf(node);
  return {
    duration: ms('--form-out', 180) + ms('--form-settle', 380) / 2,
    css: (t) => {
      const u = 1 - t;
      const gone = Math.min(1, u / 0.45);
      const close = spring(Math.max(0, (u - 0.3) / 0.7));
      /* THE GAP GOES WITH THE HEIGHT, so taking the row out at the end moves nothing (T19). The spring overshoots past 1,
         so the height stops at nought: below it the browser refused the keyframe and warned on every row taken out. */
      return `opacity:${(1 - cubicOut(gone)).toFixed(3)};transform:scale(${(1 - 0.03 * gone).toFixed(4)});block-size:${Math.max(0, h * (1 - close)).toFixed(1)}px;overflow:clip${gapCss(gap, Math.min(1, close))}`;
    },
  };
}

/** Neighbours closing the gap, on the spring over `--form-settle`: pass to `animate:flip`. Instant under reduced motion. */
export const settle = (): { duration: number; easing: (t: number) => number } => ({ duration: swapping || still() ? 0 : ms('--form-settle', 380), easing: spring });
