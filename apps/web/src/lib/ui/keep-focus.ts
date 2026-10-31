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
  const put = (): void => {
    const now = document.activeElement;
    if (now && now !== document.body && now !== was) return;
    if (was.isConnected) {
      if (now !== was) was.focus();
      return;
    }
    const css = (s: string): string => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/"/g, '\\"'));
    const at = label ? `${tag}[aria-label="${css(label)}"]` : name ? `${tag}[name="${css(name)}"]` : null;
    (at ? document.querySelector<HTMLElement>(at) : null)?.focus();
  };
  /* After the screen has drawn: a frame, then once more, since a page read again draws over two. */
  return () => void setTimeout(() => (put(), setTimeout(put, 120)), 0);
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
