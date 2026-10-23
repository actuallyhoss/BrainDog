/**
 * Presses held while the screen is drawn from a saved copy (`held.ts` says the rule and which press is held).
 *
 * WHEN. While anything on screen was drawn from this browser's copy and the record has not answered it yet (the quiet
 * mark, `copy-mark.svelte.ts`), while a screen draws what this tab kept of it and reads it again (`holdPresses`), and
 * while the shell itself is the last copy (`boot-copy.ts`, which the root layout hands in). Offline over a copy the
 * mark stays up, so nothing is pressed that could not be sent.
 *
 * HOW. The root layout attaches `holdIn` to `#main`. While held it marks every control in it `aria-disabled` and quiet
 * (`data-held-press`, a mark it alone sets and takes back), marks the ones a screen draws while it is held, and turns
 * away every press on one before any handler hears it: a click, a key that acts as a click, a form's send, and Enter in
 * a box typed into, and says so once in a few seconds (`told`). Nothing is taken out or put in, so nothing moves when
 * the answer lands; a link still goes, and so does a control that keeps its own press (`data-keeps`).
 */

import type { Attachment } from 'svelte/attachments';

import { copy } from '../copy/frame.ts';
import { toasts } from '../ui/toast.svelte.ts';
import { copyMark } from './copy-mark.svelte.ts';
import { HELD_MARK, heldControl, heldKey } from './held.ts';

let holds = $state(0);

export const presses = {
  /** Whether a press on this screen is held now. */
  get held(): boolean {
    return holds > 0 || copyMark.on;
  },
};

/** Hold presses while a screen draws what it kept and asks again; call what comes back when the answer lands or it goes. */
export function holdPresses(): () => void {
  holds += 1;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    holds = Math.max(0, holds - 1);
  };
}

/** A PRESS TURNED AWAY IS SAID, once in a few seconds, so it is never a silence (fluid F5). */
let toldAt = -Infinity;
function told(): void {
  const at = performance.now();
  if (at - toldAt < 4_000) return;
  toldAt = at;
  toasts.push(copy.stillOpening);
}

/** Every element a press can act through, for the sweep; `heldControl` decides which of them is held. */
const CONTROLS = 'button, select, input, [role]';

/** Hold every press inside the element while `on()` says so. */
export function holdIn(on: () => boolean): Attachment<HTMLElement> {
  return (root) => {
    if (!on()) return;
    root.setAttribute('data-held', '');
    const mark = (el: Element) => {
      if (el.hasAttribute('aria-disabled') || heldControl(el, root) !== el) return;
      el.setAttribute('aria-disabled', 'true');
      el.setAttribute(HELD_MARK, '');
    };
    const sweep = (from: Element) => {
      if (from.matches(CONTROLS)) mark(from);
      for (const el of from.querySelectorAll(CONTROLS)) mark(el);
    };
    sweep(root);
    /* WHAT A SCREEN DRAWS WHILE HELD, AND A CONTROL WHOSE OWN HOLD ENDS WHILE THIS ONE STANDS: a question's card holds
       its answers itself while the shell is the copy, and lets them go when the live shell lands, before the page has. */
    const drawn = new MutationObserver((changes) => {
      for (const c of changes) {
        if (c.type === 'attributes') {
          if (c.target instanceof Element && !c.target.hasAttribute('aria-disabled')) mark(c.target);
          continue;
        }
        for (const n of c.addedNodes) if (n instanceof Element) sweep(n);
      }
    });
    drawn.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-disabled'] });
    const turn = (e: Event) => {
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    const press = (e: Event) => {
      if (heldControl(e.target instanceof Element ? e.target : null, root) === null) return;
      turn(e);
      told();
    };
    /* A SELECT OPENS ON THE POINTER GOING DOWN, before any click. */
    const down = (e: Event) => {
      if (heldControl(e.target instanceof Element ? e.target : null, root)?.nodeName === 'SELECT') turn(e);
    };
    const key = (e: KeyboardEvent) => {
      if (!heldKey({ key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey, target: e.target instanceof Element ? e.target : null }, root)) return;
      turn(e);
      told();
    };
    root.addEventListener('click', press, true);
    root.addEventListener('mousedown', down, true);
    root.addEventListener('keydown', key, true);
    root.addEventListener('submit', turn, true);
    return () => {
      drawn.disconnect();
      root.removeEventListener('click', press, true);
      root.removeEventListener('mousedown', down, true);
      root.removeEventListener('keydown', key, true);
      root.removeEventListener('submit', turn, true);
      root.removeAttribute('data-held');
      for (const el of root.querySelectorAll(`[${HELD_MARK}]`)) {
        el.removeAttribute(HELD_MARK);
        if (el.getAttribute('aria-disabled') === 'true') el.removeAttribute('aria-disabled');
      }
    };
  };
}
