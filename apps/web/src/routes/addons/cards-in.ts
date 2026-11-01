/**
 * CARDS A SHELF OPENS COME UP IN ORDER (skills pass, 2 Nov). "Show all" put eight more cards under the first four in one
 * frame, so the eye could not tell the new from the old. As an attachment on the shelf's list: a card added after the
 * list first drew fades up from 4px below over `--d-swap` (160ms) on the house `--ease-out`, each 30ms after the one
 * before and the fifth and on together, so the last starts by 120ms and nothing waits on it. A card going (Show fewer)
 * simply goes: the reader asked for fewer, and holding them back would delay the answer.
 *
 * Not while a search is being typed (`when`), where cards come and go with every key. Nothing in a screen's first second
 * (`calm`) and nothing for the cards a list is drawn with (a shelf a chip opens is a new list, and the store's `Swap`
 * already fades it up). A 120ms fade, no rise and no stagger, under reduced motion.
 */

import { calm, ms, still } from '$lib/motion/index.ts';
import { FADE } from '$lib/ui/motion.ts';

const STEP = 30;
const MOST = 4;

export const cardsIn =
  (when: () => boolean = () => true, match = 'li') =>
  (box: HTMLElement): (() => void) | void => {
    if (typeof MutationObserver === 'undefined') return;
    const seen = new MutationObserver((records) => {
      if (calm() || !when()) return;
      const added = records.flatMap((r) => [...r.addedNodes]).filter((n): n is HTMLElement => n instanceof HTMLElement && n.matches(match) && n.isConnected);
      const ease = getComputedStyle(box).getPropertyValue('--ease-out').trim() || 'cubic-bezier(0.16, 1, 0.3, 1)';
      added.forEach((el, i) => {
        if (typeof el.animate !== 'function') return;
        if (still()) return void el.animate({ opacity: [0, 1] }, { duration: FADE });
        el.animate(
          { opacity: [0, 1], transform: ['translateY(4px)', 'none'] },
          { duration: ms('--d-swap', 160), delay: Math.min(i, MOST) * STEP, easing: ease, fill: 'backwards' },
        );
      });
    });
    seen.observe(box, { childList: true });
    return () => seen.disconnect();
  };
