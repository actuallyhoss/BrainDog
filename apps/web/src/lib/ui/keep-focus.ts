/**
 * The focus a press started from, put back once the screen has drawn what the press changed (first-hour audit AH20):
 * an add box read again after its row landed was drawn anew, and the focus fell to the page, so somebody on a keyboard
 * started again from the top.
 *
 * ONLY WHERE IT FELL. Where something else took the focus on purpose in the meantime (a sheet that opened, a field the
 * person moved to), it stays there. A field drawn anew is found by what it is called, its `aria-label` or `name`.
 */

/** Call before the press's work; call what it answers after, and the focus is back in the field it left. */
export function holdFocus(): () => void {
  if (typeof document === 'undefined') return () => {};
  const was = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  if (!was) return () => {};
  const tag = was.tagName.toLowerCase();
  const label = was.getAttribute('aria-label');
  const name = was.getAttribute('name');
  const css = (s: string): string => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/"/g, '\\"'));
  const at = label ? `${tag}[aria-label="${css(label)}"]` : name ? `${tag}[name="${css(name)}"]` : null;
  const find = (): HTMLElement | null => (was.isConnected ? was : at ? document.querySelector<HTMLElement>(at) : null);
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
 * Once the person puts it somewhere else it stays there, and the watch ends.
 */
export function focusOnceDrawn(find: () => HTMLElement | null | undefined, opts: { from?: Element | null; within?: number } = {}): void {
  if (typeof document === 'undefined') return;
  const from = opts.from ?? null;
  let done = false;
  const free = (): boolean => {
    const now = document.activeElement;
    return !now || now === document.body || !now.isConnected || now === from;
  };
  const put = (): void => {
    if (done) return;
    const el = find();
    if (el && el.isConnected && document.activeElement === el) return;
    if (!free()) return stop();
    if (el && el.isConnected) el.focus();
  };
  const watch = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => queueMicrotask(put));
  const stop = (): void => {
    done = true;
    watch?.disconnect();
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
