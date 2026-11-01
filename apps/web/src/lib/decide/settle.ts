/**
 * AN ANSWERED CARD SETTLES, IT DOES NOT JUMP ("no layout jump"). A press makes the card its one answered line at once
 * (`DecisionCard.svelte`), and what is under it used to leap up the height of the form it replaced, about 250px in one
 * frame. Undo plays the same the other way: the card opens out of the line.
 *
 * ON TRANSFORM AND OPACITY ONLY, SINCE 1 NOV (`lib/motion`'s rules: the one size that animates is a row's height closing,
 * `leave` below). It was the line's own height played from the card's to its own, which laid the page out every frame
 * and squeezed the line's words while it ran. Now the page takes its new shape at once and nothing under it is seen to
 * jump: what follows the card in its list is drawn where it stood and glides to its new place (FLIP), and the line, or
 * the card back from Undo, rises 6px and fades in, over `--d-rows`.
 *
 * A READER WHO ASKED FOR LESS MOTION sees the line where the card was, at once, as before. So does a tab nobody is
 * looking at, and a host with no `animate`.
 *
 * `rideOf` IS PURE, so `settle.test.ts` holds when a move plays and what it plays; `snapshot` and `settle` are the half
 * that touch the page.
 */

/** Under a pixel is no change of place at all: nothing plays. */
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
 * The frames that carry one thing under the card from where it stood (`dy` pixels from its new place) to its new place,
 * or `null` for none: less motion asked for, no time to play it in, or a move under a pixel.
 */
export function rideOf(dy: number, ms: number, less: boolean): Keyframe[] | null {
  if (less || ms <= 0 || !Number.isFinite(dy) || Math.abs(dy) < STILL) return null;
  return [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }];
}

/** Whether this reader asked for less motion. */
const still = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The row a card sits in on its page (`QueueAnswer.svelte`'s `[data-row]`), or the card's own parent. */
const rowOf = (el: Element): Element => el.closest('[data-row]') ?? el.parentElement ?? el;

/**
 * WHERE EVERYTHING AFTER THE CARD STANDS NOW: the rows after its own in the list, by their tops. Taken before the change,
 * so `settle` can draw each where it was and let it glide.
 */
export function snapshot(el: Element | null): Map<HTMLElement, number> {
  const at = new Map<HTMLElement, number>();
  if (!el) return at;
  for (let n = rowOf(el).nextElementSibling; n; n = n.nextElementSibling) if (n instanceof HTMLElement) at.set(n, n.getBoundingClientRect().top);
  return at;
}

/**
 * Plays the change: `el` (the line, or the card back from Undo) rises into place and fades in, and each thing `before`
 * held glides from where it stood to where it is now. Nothing plays for a reader who asked for less motion.
 */
export function settle(el: HTMLElement | null, before: ReadonlyMap<HTMLElement, number>): void {
  if (!el || typeof el.animate !== 'function') return;
  if (typeof document !== 'undefined' && document.hidden) return;
  const style = getComputedStyle(el);
  const ms = msOf(style.getPropertyValue('--d-rows'), 180);
  if (still() || ms <= 0) return;
  const easing = style.getPropertyValue('--ease-standard').trim() || 'ease-in-out';
  el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: ms, easing });
  for (const [n, top] of before) {
    if (!n.isConnected) continue;
    const frames = rideOf(top - n.getBoundingClientRect().top, ms, false);
    if (frames) n.animate(frames, { duration: ms, easing });
  }
}

/**
 * AN ANSWER SENT TAKES ITS ROW AWAY WITHOUT A JUMP. The line stayed where the card was until the page read itself again,
 * and then went in one frame, the row's height and the gap under it (84px on his record), and a click aimed at the next
 * card met the empty space it left. Now the row closes to nothing over `--d-rows`, the gap with it, so when the read
 * takes it out of the page nothing else moves; for a reader who asked for less motion it is gone at once, the same end.
 *
 * `leaveOf` IS PURE: the frames from the row's height and the gap after it to none at all, or `null` to go at once.
 */
export function leaveOf(height: number, gap: number, ms: number, less: boolean): Keyframe[] | null {
  if (less || ms <= 0 || !Number.isFinite(height) || height < STILL) return null;
  const g = Number.isFinite(gap) && gap > 0 ? gap : 0;
  return [
    { blockSize: `${height}px`, marginBlockEnd: '0px', opacity: 1 },
    { blockSize: '0px', marginBlockEnd: `${-g}px`, opacity: 0 },
  ];
}

/** The room a row ends in once it has gone: no height, no padding, and the gap after it taken back. */
function gone(el: HTMLElement, gap: number): void {
  el.style.boxSizing = 'border-box';
  el.style.overflow = 'clip';
  el.style.blockSize = '0px';
  el.style.minBlockSize = '0px';
  el.style.paddingBlock = '0px';
  el.style.borderBlockWidth = '0px';
  el.style.marginBlockEnd = `${-gap}px`;
  el.style.opacity = '0';
  el.style.visibility = 'hidden';
}

/**
 * Close `el` to nothing, the gap its parent puts after it as well, and answer once it has. It stays in the page at no
 * height until whoever drew it takes it out, so that taking it out moves nothing.
 */
export async function leave(el: HTMLElement | null): Promise<void> {
  if (!el) return;
  const parent = el.parentElement;
  const gap = parent ? Number.parseFloat(getComputedStyle(parent).rowGap) || 0 : 0;
  const style = getComputedStyle(el);
  const ms = msOf(style.getPropertyValue('--d-rows'), 180);
  const hidden = typeof document !== 'undefined' && document.hidden;
  const frames = typeof el.animate === 'function' && !hidden ? leaveOf(el.getBoundingClientRect().height, gap, ms, still()) : null;
  if (frames) {
    el.style.boxSizing = 'border-box';
    el.style.overflow = 'clip';
    const easing = style.getPropertyValue('--ease-standard').trim() || 'ease-in-out';
    const a = el.animate(
      [
        { ...frames[0], paddingBlock: style.paddingBlock || '0px' },
        { ...frames[1], paddingBlock: '0px' },
      ],
      { duration: ms, easing, fill: 'forwards' },
    );
    await a.finished.catch(() => undefined);
  }
  gone(el, gap);
}

/**
 * NOTHING MOVES UNDER THE POINTER: answers once a mouse is no longer over `el` (the queue the row is in), so the rows a
 * reader is aiming at stay where they are while they aim. At once on a touch screen, where no pointer rests, and when
 * the tab is put away.
 */
export function pointerOff(el: Element | null): Promise<void> {
  if (!el || typeof matchMedia !== 'function' || !matchMedia('(hover: hover)').matches || !el.matches(':hover')) return Promise.resolve();
  return new Promise((resolve) => {
    const away = () => {
      if (document.hidden) done();
    };
    const done = () => {
      el.removeEventListener('pointerleave', done);
      document.removeEventListener('visibilitychange', away);
      resolve();
    };
    el.addEventListener('pointerleave', done);
    document.addEventListener('visibilitychange', away);
  });
}
