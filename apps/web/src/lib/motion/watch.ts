/**
 * FIGURES COUNT AND BARS GROW WHEN THE RECORD CHANGES THEM, everywhere at once, from one watcher on the work rather than
 * a line in every chart and every tile (`$lib/motion`).
 *
 * A FIGURE is the text of anything drawn as a number (`.num`, or `[data-count]`). When the record changes it in place, a
 * payment landing or a count going down as a question is answered, it counts from what it said to what it says now
 * (`count.ts`). Not inside a live region, which would read every number on the way, nor in anything being typed in.
 *
 * A BAR is a chart's mark that grows along its length (`.viz-grow-x`, whose `width` the chart writes) or up its height
 * (`.viz-grow-y`), or any element marked `data-grow` whose share is written as `--fill`, `inline-size` or `width` in its
 * style, as Today's progress bars and a project card's share are. When its share changes it grows, or shrinks, from the
 * old one to the new on transform alone. A chart drawn again at another width (a resize, the first measure) changes its
 * `viewBox` with it and moves nothing.
 *
 * ONLY A CHANGE: a figure or a bar drawn for the first time is a new element and is not watched for; nothing moves in a
 * screen's first second (`calm`), and nothing under reduced motion.
 *
 * A FIGURE THAT COUNTS WEARS THE ARRIVAL WASH (`countText`, 9 Nov), and under reduced motion it still does, held and let
 * go in one step, because that is the fact that it changed.
 */

import { calm, ms, play, still } from './index.ts';
import { countText, wrote } from './count.ts';

const FIGURE_AT = '.num, [data-count]';
const SKIP_AT = '[aria-live], [role="status"], [role="alert"], [role="log"], [contenteditable], input, textarea, [data-leaving]';
const SHARE = /(?:--fill|inline-size|(?<![\w-])width)\s*:\s*([\d.]+)(%?)/u;

/** The share a bar's style gives it, as a number to compare, or `null` where it says none. */
export function shareOf(style: string | null): number | null {
  if (!style) return null;
  const m = SHARE.exec(style);
  if (!m) return null;
  const n = Number.parseFloat(m[1]!);
  return Number.isFinite(n) ? n : null;
}

/** The element a bar's change is drawn on: a progress track's fill, else the bar itself. */
const barOf = (el: Element): HTMLElement | SVGElement | null => {
  if (/--fill\s*:/u.test(el.getAttribute('style') ?? '')) return el.querySelector<HTMLElement>('.progress-fill') ?? (el as HTMLElement);
  return el as HTMLElement | SVGElement;
};

function grow(el: HTMLElement | SVGElement, axis: 'x' | 'y', from: number): void {
  const rtl = axis === 'x' && getComputedStyle(el).direction === 'rtl';
  const origin = axis === 'x' ? (rtl ? 'right center' : 'left center') : 'center bottom';
  const scale = axis === 'x' ? `scaleX(${from})` : `scaleY(${from})`;
  if (el instanceof SVGElement) el.style.transformBox = 'fill-box';
  el.style.transformOrigin = origin;
  play(el as HTMLElement, { transform: [scale, 'none'] }, { duration: ms('--form-count', 300) });
}

/** Starts the watcher on `root` (the document's body by default); the function it returns stops it. */
export function watchChanges(root: Node | null = typeof document !== 'undefined' ? document.body : null): () => void {
  if (!root || typeof MutationObserver === 'undefined') return () => {};
  const seen = new MutationObserver((records) => {
    /* UNDER REDUCED MOTION A FIGURE STILL WEARS ITS WASH, held and let go (`countText`), and nothing counts or grows. */
    if (calm()) return;
    const less = still();
    /* A CHART DRAWN AGAIN AT ANOTHER SIZE is not a change to what it says. */
    const redrawn = new Set<Node>();
    for (const r of records) if (r.type === 'attributes' && r.attributeName === 'viewBox') redrawn.add(r.target);
    for (const r of records) {
      if (r.type === 'characterData') {
        const text = r.target as Text;
        const now = text.nodeValue ?? '';
        const from = r.oldValue ?? '';
        /* ITS OWN WRITE, or the record's write of what it is already counting to. */
        if (wrote.get(text) === now) continue;
        const host = text.parentElement;
        if (!host || !host.closest(FIGURE_AT) || host.closest(SKIP_AT)) continue;
        countText(text, wrote.get(text) ?? from, now);
        continue;
      }
      if (less || r.type !== 'attributes' || r.oldValue === null) continue;
      const el = r.target as Element;
      if (r.attributeName === 'width' || r.attributeName === 'height') {
        const axis = r.attributeName === 'width' ? 'x' : 'y';
        if (!el.classList.contains(axis === 'x' ? 'viz-grow-x' : 'viz-grow-y')) continue;
        const svg = (el as SVGElement).ownerSVGElement;
        if (svg && redrawn.has(svg)) continue;
        const a = Number.parseFloat(r.oldValue);
        const b = Number.parseFloat(el.getAttribute(r.attributeName) ?? '');
        if (!(a >= 0 && b > 0) || Math.abs(a - b) < 0.5) continue;
        grow(el as SVGElement, axis, a / b);
        continue;
      }
      if (r.attributeName === 'style' && (el.hasAttribute('data-grow') || el.classList.contains('progress-track')) && !el.closest('[data-leaving]')) {
        const a = shareOf(r.oldValue);
        const b = shareOf(el.getAttribute('style'));
        if (a === null || b === null || b <= 0 || Math.abs(a - b) < 0.001) continue;
        const bar = barOf(el);
        if (bar) grow(bar, 'x', a / b);
      }
    }
  });
  seen.observe(root, {
    subtree: true,
    characterData: true,
    characterDataOldValue: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: ['width', 'height', 'style', 'viewBox'],
  });
  return () => seen.disconnect();
}
