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

/** How long a press waits for the screen to be live: past this, what it was pressed on is not what he is looking at. */
const KEPT_MS = 4_000;
/** What the waiting press wears, so it answers at once (`motion.css`). */
const KEPT_MARK = 'data-press-kept';

/** What a press was made on as it read then: pressed once the record has answered, only if it still reads so. */
const readsAs = (el: Element): string => `${el.getAttribute('aria-checked') ?? ''} ${el.getAttribute('aria-pressed') ?? ''} ${el.textContent ?? ''}`;

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
    /* A PRESS IN THE FIRST MOMENT IS KEPT, NOT REFUSED (fluid F5): it wears its mark at once and goes when the record has
       answered, the way a decision's card has always kept one. Only the last press is kept. */
    let kept: { el: HTMLElement; reads: string; at: number } | null = null;
    const press = (e: Event) => {
      const control = heldControl(e.target instanceof Element ? e.target : null, root);
      if (control === null) return;
      turn(e);
      kept?.el.removeAttribute(KEPT_MARK);
      kept = null;
      if (!(control instanceof HTMLElement)) return told();
      control.setAttribute(KEPT_MARK, '');
      kept = { el: control, reads: readsAs(control), at: performance.now() };
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
      const was = kept;
      kept = null;
      if (was === null) return;
      /* A FRAME ON, so what the answer changes has been drawn before it is compared. A screen that has gone takes it along. */
      requestAnimationFrame(() => {
        was.el.removeAttribute(KEPT_MARK);
        if (!root.isConnected) return;
        if (was.el.isConnected && readsAs(was.el) === was.reads && performance.now() - was.at < KEPT_MS && !was.el.hasAttribute('disabled')) was.el.click();
        else told();
      });
    };
  };
}
