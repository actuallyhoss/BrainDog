/**
 * WHERE YOU ARE, MOVING (ui pass 1 Nov): the rail's lit row and the tab bar's lit tab slide from the place you left to
 * the place you opened, instead of one switching off and another on. As an attachment on the list that holds them:
 *
 *   <nav {@attach litSlide()}>…<a aria-current={here ? 'page' : undefined}>…</a>…</nav>
 *
 * HOW. The lit element draws its own fill as ever; when `aria-current` moves from A to B inside the box, a plain
 * rectangle in B's fill and radius is laid where A was, under the rows, and glides to B over `--d-swap` on the even
 * curve, while B's own fill waits (`data-lit-moving`) and takes over when it lands. Transform and size of one
 * rectangle only, nothing laid out. Nothing when either end is out of sight (a closed group, another scroller), on a
 * jump longer than the box (a Menu sheet opening), or under reduced motion. NOT HELD BY A SCREEN'S FIRST SECOND
 * (`calm`), since the move is the navigation itself.
 */

import { ms, still } from './index.ts';

const LIT = '[aria-current="page"]';

export const litSlide =
  (match: string = LIT, { fill: given }: { fill?: string } = {}) =>
  (box: HTMLElement): (() => void) | void => {
    if (typeof MutationObserver === 'undefined') return;
    let was: HTMLElement | null = box.querySelector<HTMLElement>(match);
    let ghost: HTMLElement | null = null;

    const seen = new MutationObserver(() => {
      const now = box.querySelector<HTMLElement>(match);
      const from = was;
      was = now;
      if (!now || !from || now === from || !from.isConnected) return;
      slide(from, now);
    });
    seen.observe(box, { subtree: true, attributes: true, attributeFilter: ['aria-current'], childList: true });

    /* A, MEASURED BEFORE IT GOES DARK: the change has already been applied when the observer runs, so A's rectangle is
       where it still stands and B's fill is read from B. */
    function slide(from: HTMLElement, to: HTMLElement): void {
      if (still() || typeof box.animate !== 'function') return;
      const a = from.getBoundingClientRect();
      const b = to.getBoundingClientRect();
      const frame = box.getBoundingClientRect();
      if (a.width === 0 || b.width === 0 || a.height === 0) return;
      if (Math.abs(a.top - b.top) > frame.height || a.bottom < frame.top || a.top > frame.bottom) return;
      const cs = getComputedStyle(to);
      /* THE FILL BY NAME where the owner gives it (`var(--nav-selected)`), since B's own may still be easing in. */
      const fill = given ?? cs.backgroundColor;
      if (!fill || fill === 'transparent' || fill === 'rgba(0, 0, 0, 0)') return;

      ghost?.remove();
      if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
      box.style.isolation = 'isolate';
      const g = document.createElement('span');
      g.setAttribute('aria-hidden', 'true');
      const left = b.left - frame.left + box.scrollLeft;
      const top = b.top - frame.top + box.scrollTop;
      Object.assign(g.style, {
        position: 'absolute',
        left: `${left}px`,
        top: `${top}px`,
        width: `${b.width}px`,
        height: `${b.height}px`,
        background: fill,
        borderRadius: cs.borderRadius,
        zIndex: '-1',
        pointerEvents: 'none',
        transformOrigin: '0 0',
        willChange: 'transform',
      });
      box.prepend(g);
      ghost = g;
      to.setAttribute('data-lit-moving', '');
      const dx = a.left - b.left;
      const dy = a.top - b.top;
      const sx = a.width / b.width;
      const sy = a.height / b.height;
      const run = g.animate(
        { transform: [`translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, 'none'] },
        { duration: ms('--d-swap', 160), easing: 'cubic-bezier(0.2, 0, 0, 1)' },
      );
      const done = () => {
        to.removeAttribute('data-lit-moving');
        if (ghost === g) ghost = null;
        g.remove();
      };
      void run.finished.then(done, done);
    }

    return () => {
      seen.disconnect();
      ghost?.remove();
    };
  };
