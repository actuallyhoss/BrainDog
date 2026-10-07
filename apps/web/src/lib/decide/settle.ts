/**
 * AN ANSWERED CARD SETTLES, IT DOES NOT JUMP (DIRECTION §36, "no layout jump"). A press makes the card its one answered
 * line at once (`DecisionCard.svelte`), and the next question used to leap up the height of the form it replaced, about
 * 250px in one frame. Now the line opens at the height the card had and closes to its own over `--d-rows`, the step the
 * scale names for rows settling after one is taken away, and every card and tile under it rides up with it. Undo plays
 * the same the other way: the card opens out of the line.
 *
 * THE HEIGHT, NOT A TRANSFORM. `recompose.ts` slides blocks on transform alone because a block keeps its size and only
 * changes place; here the size is what changes, and a card shrunk on transform would squash its words while its tile's
 * ground snapped shorter under it. One element's height over 180ms is the change itself, and everything after it follows
 * in the flow, so the tile's ground, the cards under it and the blocks under the queue all move as one.
 *
 * A READER WHO ASKED FOR LESS MOTION sees the line where the card was, at once, as before. So does a tab nobody is
 * looking at, and a host with no `animate`.
 *
 * `settleOf` IS PURE, so `settle.test.ts` holds when a change plays and what it plays; `settle` is the half that touches
 * the page.
 */

/** Under a pixel is no change of height at all: nothing plays. */
const STILL = 1;

/** The longest a settle may take, whatever the skin says: rows settle under 300ms, as every move on the scale does. */
export const SETTLE_MOST = 280;

/** A duration token in milliseconds, whichever unit it is written in, held under `SETTLE_MOST`. */
export function msOf(raw: string, fallback: number): number {
  const s = raw.trim();
  const n = Number.parseFloat(s);
  const got = Number.isFinite(n) ? (s.endsWith('ms') ? n : n * 1000) : fallback;
  return Math.min(SETTLE_MOST, Math.max(0, got));
}

/**
 * The frames one settle plays, from the height the card held to the height it holds now, or `null` for none: less
 * motion asked for, no time to play it in, a height that is not a number, or one that did not change.
 */
export function settleOf(from: number, to: number, ms: number, less: boolean): Keyframe[] | null {
  if (less || ms <= 0 || !Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to < 0) return null;
  if (Math.abs(from - to) < STILL) return null;
  return [{ blockSize: `${from}px` }, { blockSize: `${to}px` }];
}

/** Whether this reader asked for less motion. */
const still = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * HOW MUCH ROOM A CARD TAKES IN ITS HOST: from its own top to the foot of the last thing drawn after it in the same
 * parent (the lead's preview of what it would put on the screen, a note's line), since all of it goes or comes with the
 * card. `0` for nothing drawn.
 */
export function footprint(el: Element | null): number {
  if (!el) return 0;
  const box = el.getBoundingClientRect();
  let bottom = box.bottom;
  for (let n = el.nextElementSibling; n; n = n.nextElementSibling) bottom = Math.max(bottom, n.getBoundingClientRect().bottom);
  return Math.max(0, bottom - box.top);
}

/**
 * Plays `el` from the room the card it replaced took (`from`, its `footprint` before the change) to its own height, with
 * what overflows the closing box clipped for the length of it. Nothing plays for a reader who asked for less motion.
 */
export function settle(el: HTMLElement | null, from: number): Animation | null {
  if (!el || typeof el.animate !== 'function') return null;
  if (typeof document !== 'undefined' && document.hidden) return null;
  const style = getComputedStyle(el);
  const frames = settleOf(from, el.getBoundingClientRect().height, msOf(style.getPropertyValue('--d-rows'), 180), still());
  if (!frames) return null;
  const easing = style.getPropertyValue('--ease-standard').trim() || 'ease-in-out';
  const was = el.style.overflow;
  el.style.overflow = 'clip';
  const a = el.animate(frames, { duration: msOf(style.getPropertyValue('--d-rows'), 180), easing });
  const done = () => {
    el.style.overflow = was;
  };
  void a.finished.then(done, done);
  return a;
}
