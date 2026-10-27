/**
 * A PAGE'S NAME TAKES FOCUS AFTER A MOVE, AND WEARS ITS RING ONLY FOR A KEYBOARD.
 *
 * The layout hands focus to the new page's `h1` after a link or a `goto`, so a keyboard and a screen reader carry on from
 * the page's name. Its ring was hidden by `:focus:not(:focus-visible)`, and that is the browser's guess, not the reader's:
 * focus given by script with no press before it counts as `:focus-visible`, so a page opened from a link pasted in, a
 * reload, or a `goto` drew a heavy black box round its name in both themes and at every width (`list-390-light.png`,
 * `id-390-light.png`). So the layout keeps what the reader last did, a key or a press, and a name focused while the last
 * thing was not a key is marked quiet (`data-quiet`) until it loses focus, and draws no ring. Tab still shows it.
 *
 * PURE, for `node --test`: the element is anything with a dataset, `focus` and `addEventListener`.
 */

/** Whether the last thing the reader did in this tab was a key. Nothing yet is not a key. */
let keyed = false;

/** What the layout hears on every key and every press, before anything else hears it. */
export function heard(e: { type: string }): void {
  keyed = e.type === 'keydown';
}

type Focusable = {
  dataset: Record<string, string | undefined>;
  focus(options?: { preventScroll?: boolean }): void;
  addEventListener(type: 'blur', listener: () => void, options?: { once?: boolean }): void;
};

/** Focus a page's name after a move: quiet unless the reader's last act was a key. */
export function quietFocus(el: Focusable, byKey: boolean = keyed): void {
  if (byKey) delete el.dataset.quiet;
  else {
    el.dataset.quiet = '';
    el.addEventListener('blur', () => delete el.dataset.quiet, { once: true });
  }
  el.focus({ preventScroll: true });
}
