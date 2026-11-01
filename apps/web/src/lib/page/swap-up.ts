/**
 * A NEW VIEW OR A NEW ANSWER, FADING UP WHERE THE OLD ONE STOOD (skills pass, 2 Nov). Table to Board, Cards to Table, a
 * quick slice or a filter pressed: the rows were there one frame and other rows the next, with nothing between (a change
 * of more than three rows is drawn still on purpose, `Table.svelte`, so thirty rows do not open and close together).
 * Now the new body comes up from nothing and 4px below over `--d-swap` (160ms) on the house `--ease-out`, so the eye
 * reads one change rather than a flicker. The old body is not kept for an exit: the view and the bars over it are what
 * the reader pressed, and holding the old rows on screen would hold the answer back.
 *
 * In only, and on transform and opacity alone; a 120ms fade and no rise under reduced motion. Never for a search being
 * typed or a column sorted: the caller keys it on the view and the chips alone (a sort already slides its rows,
 * `animate:flip`). The automations hub plays it when a tab is pressed.
 *
 * NOT HELD BY A SCREEN'S FIRST SECOND (`calm`), which the shell restarts on every navigation, a changed `?view=` or
 * `?tab=` too: the press is the change, and the caller never plays it for a first draw. Kept beside the page renderer
 * rather than in `$lib/motion` (the motion lane's), as the brief asks of a new primitive.
 */

import { ms, still } from '$lib/motion/index.ts';
import { FADE } from '$lib/ui/motion.ts';

export function swapUp(el: HTMLElement | null | undefined): void {
  if (!el || !el.isConnected || typeof el.animate !== 'function') return;
  if (still()) {
    el.animate({ opacity: [0, 1] }, { duration: FADE, easing: 'linear' });
    return;
  }
  const ease = getComputedStyle(el).getPropertyValue('--ease-out').trim() || 'cubic-bezier(0.16, 1, 0.3, 1)';
  el.animate({ opacity: [0, 1], transform: ['translateY(4px)', 'none'] }, { duration: ms('--d-swap', 160), easing: ease });
}
