/**
 * The focus a press started from, put back once the screen has drawn what the press changed (first-hour audit AH20):
 * an add box read again after its row landed was drawn anew, and the focus fell to the page, so somebody on a keyboard
 * started again from the top.
 *
 * ONLY WHERE IT FELL. Where something else took the focus on purpose in the meantime (a sheet that opened, a field the
 * person moved to), it stays there. A field drawn anew is found by what it is called, its `aria-label` or `name`.
 */

/**
 * Call before the press's work; call what it answers after, and the focus is back in the field it left.
 *
 * `orElse` IS WHERE IT GOES WHEN THE FIELD IS GONE FOR GOOD (AL9): the Dashboard's "Name your first project" is drawn only
 * while no project is, so its first add takes the box away with the empty state, and the focus fell to the page.
 */
export function holdFocus(orElse?: () => HTMLElement | null | undefined): () => void {
  if (typeof document === 'undefined') return () => {};
  const was = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  if (!was) return () => {};
  const tag = was.tagName.toLowerCase();
  const label = was.getAttribute('aria-label');
  const name = was.getAttribute('name');
  const css = (s: string): string => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/"/g, '\\"'));
  const at = label ? `${tag}[aria-label="${css(label)}"]` : name ? `${tag}[name="${css(name)}"]` : null;
  const find = (): HTMLElement | null => (was.isConnected ? was : ((at ? document.querySelector<HTMLElement>(at) : null) ?? orElse?.() ?? null));
  return () => focusOnceDrawn(find, { from: was });
}

/**
 * HOW LONG A FIELD IS WATCHED FOR, after the press that may draw it anew. A first add from an empty place draws the page
 * twice over: once when the row lands, and again when the counts read after it turn the empty place into a list and the
 * line moves under the page's sentence (AJ7). Two tries at 0 and 120ms were over before the second, so the focus fell
 * to the page on the first add and held on every one after.
 */
export const WATCH_MS = 2000;

/**
 * Puts the focus in the element `find` answers, now and each time the screen is drawn again for `WATCH_MS`, while the
 * focus is nowhere: on the page, on an element that is gone, or still on `from`, the control the press started from.
 *
 * ONCE IT IS IN THE FIELD, ONLY A REDRAW BRINGS IT BACK (review i, RI2): the field it was put in gone and the focus fallen
 * to the page with it. Any other way it leaves is the person moving it, a tap on blank space to close the keyboard or a
 * Shift+Tab back to the button, and the watch ends there, whatever it left to. `from` counts as nowhere only until then.
 */
export function focusOnceDrawn(find: () => HTMLElement | null | undefined, opts: { from?: Element | null; within?: number } = {}): void {
  if (typeof document === 'undefined') return;
  const from = opts.from ?? null;
  let done = false;
  /* THE FIELD THE FOCUS WAS LAST PUT IN, or found in. */
  let placed: HTMLElement | null = null;
  const fallen = (): boolean => {
    const now = document.activeElement;
    return !now || now === document.body || !now.isConnected;
  };
  const free = (): boolean => (placed === null ? fallen() || document.activeElement === from : !placed.isConnected && fallen());
  /* A FIELD STILL ON THE PAGE THAT LOSES THE FOCUS lost it to the person; one drawn away loses it with no say. */
  const left = (e: FocusEvent): void => {
    if (e.target instanceof Node && e.target.isConnected) stop();
  };
  const place = (el: HTMLElement): void => {
    if (placed === el) return;
    placed?.removeEventListener('focusout', left);
    placed = el;
    el.addEventListener('focusout', left);
  };
  const put = (): void => {
    if (done) return;
    const el = find();
    if (el && el.isConnected && document.activeElement === el) return place(el);
    if (!free()) return stop();
    if (!el || !el.isConnected) return;
    el.focus();
    if (document.activeElement === el) place(el);
  };
  const watch = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => queueMicrotask(put));
  const stop = (): void => {
    done = true;
    watch?.disconnect();
    placed?.removeEventListener('focusout', left);
  };
  watch?.observe(document.body, { childList: true, subtree: true });
  setTimeout(put, 0);
  setTimeout(stop, opts.within ?? WATCH_MS);
}

/**
 * Moves the focus to an element once it is drawn, where the press that showed it left the focus on the page, or on the
 * control pressed (`from`): Next in a setup moves on to the next step's heading, never back to the top.
 */
export function focusWhenDrawn(find: () => HTMLElement | null | undefined, from: Element | null = null): void {
  if (typeof document === 'undefined') return;
  setTimeout(() => {
    const now = document.activeElement;
    if (now && now !== document.body && now.isConnected && now !== from) return;
    const el = find();
    if (!el) return;
    if (!el.hasAttribute('tabindex') && !/^(?:a|button|input|select|textarea)$/i.test(el.tagName)) el.setAttribute('tabindex', '-1');
    el.focus();
  }, 0);
}
