/**
 * What kind of phone this is, read from the browser, and the small things a phone app does that a web page does not:
 * the status bar's colour, the iPhone's launch pictures, and a tap the hand can feel.
 *
 * EVERY BROWSER GLOBAL IS READ INSIDE A FUNCTION, so the module loads anywhere and asks only when called.
 */

import { links } from './splash.ts';

type Nav = Navigator & { standalone?: boolean; vibrate?(p: number | number[]): boolean };

const nav = (): Nav | null => (typeof navigator === 'undefined' ? null : (navigator as Nav));
const mq = (q: string): boolean => typeof matchMedia === 'function' && matchMedia(q).matches;

/** An iPhone or iPad, whichever browser on it (they are all Safari underneath). An iPad says it is a Mac with touch. */
export function isIOS(): boolean {
  const n = nav();
  if (!n) return false;
  return /iPhone|iPad|iPod/u.test(n.userAgent) || (/Macintosh/u.test(n.userAgent) && n.maxTouchPoints > 1);
}

export const isAndroid = (): boolean => /Android/u.test(nav()?.userAgent ?? '');

/** Opened from the Home Screen as an app, with no browser around it. */
export const standalone = (): boolean => mq('(display-mode: standalone)') || nav()?.standalone === true;

/** A phone in the hand: a finger for a pointer and the phone's shape of the app (under 900px). */
export const onPhone = (): boolean => mq('(pointer: coarse)') && mq('(width < 900px)');

/* ─── the status bar ─── */

/**
 * The status bar takes the colour of the bar under it (`--nav`: white in light, the crimson in dark), so the phone's
 * own bar and the app's read as one strip. `app.html` names both for the device's own scheme before anything runs;
 * this follows a scheme or palette chosen in Settings, which the device's scheme does not know about.
 */
let probe: HTMLElement | null = null;

export function syncThemeColor(): void {
  if (typeof document === 'undefined' || !document.body) return;
  /* READ AS THE BROWSER DRAWS IT, through an element coloured with the token: the token itself may be a `color-mix()`
     or another token, which a `theme-color` cannot be. */
  if (probe === null || !probe.isConnected) {
    probe = document.createElement('i');
    probe.ariaHidden = 'true';
    probe.style.cssText = 'position:absolute;inline-size:0;block-size:0;overflow:hidden;color:var(--nav)';
    document.body.appendChild(probe);
  }
  const colour = getComputedStyle(probe).color.trim();
  if (colour === '') return;
  const metas = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
  /* ONE META AND NO MEDIA, once the page knows the colour it draws: two with media would follow the device's scheme
     and not the one he chose. */
  const [first, ...rest] = metas;
  for (const m of rest) m.remove();
  const meta = first ?? document.head.appendChild(Object.assign(document.createElement('meta'), { name: 'theme-color' }));
  meta.removeAttribute('media');
  if (meta.content !== colour) meta.content = colour;
}

/** Follow the scheme and palette as they change: the device's own, a choice in Settings, the high-contrast palette. */
export function watchThemeColor(): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {};
  /* A FRAME LATER, so the stylesheet a change swapped in has been applied before the colour is read. */
  const later = () => requestAnimationFrame(() => syncThemeColor());
  later();
  const seen = new MutationObserver(later);
  seen.observe(document.documentElement, { attributes: true, attributeFilter: ['data-scheme', 'data-theme', 'class', 'style'] });
  const dark = matchMedia('(prefers-color-scheme: dark)');
  dark.addEventListener('change', later);
  document.addEventListener('visibilitychange', later);
  return () => {
    seen.disconnect();
    dark.removeEventListener('change', later);
    document.removeEventListener('visibilitychange', later);
  };
}

/* ─── the iPhone's launch pictures ─── */

/**
 * The `apple-touch-startup-image` links, written into the head on an iPhone only (`splash.ts` holds the sizes): an
 * iPhone reads them when the app is added to the Home Screen, and no other browser reads them at all, so nobody else
 * downloads a line of them with every page.
 */
export function startupImages(base: string): void {
  if (typeof document === 'undefined' || !isIOS() || document.querySelector('link[rel="apple-touch-startup-image"]')) return;
  for (const { href, media } of links(base)) {
    const link = document.createElement('link');
    link.rel = 'apple-touch-startup-image';
    link.href = href;
    link.media = media;
    document.head.appendChild(link);
  }
}

/* ─── a tap the hand can feel ─── */

let iosSwitch: HTMLLabelElement | null = null;

/**
 * A short tap of the phone's motor, where the platform lets a page have one: `navigator.vibrate` on Android. Safari has
 * no vibrate, but since iOS 18 a switch control clicks the Taptic Engine when it turns, so on an iPhone a hidden one is
 * turned, inside the press that asked for it. Nothing anywhere else, and never on a mouse.
 *
 * `light` for a step (a pull let go, a sheet let go), `done` for something saved, `warn` for something refused.
 */
export function haptic(kind: 'light' | 'done' | 'warn' = 'light'): void {
  const n = nav();
  if (!n || !mq('(pointer: coarse)')) return;
  if (typeof n.vibrate === 'function') {
    n.vibrate(kind === 'light' ? 8 : kind === 'done' ? [10, 60, 10] : [24, 80, 24]);
    return;
  }
  if (!isIOS() || typeof document === 'undefined') return;
  try {
    if (iosSwitch === null || !iosSwitch.isConnected) {
      iosSwitch = document.createElement('label');
      iosSwitch.ariaHidden = 'true';
      iosSwitch.style.display = 'none';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.tabIndex = -1;
      iosSwitch.appendChild(input);
      document.body.appendChild(iosSwitch);
    }
    iosSwitch.click();
  } catch {
    /* No tap this time; nothing depends on it. */
  }
}

/* ─── the field being typed in stays above the keyboard ─── */

/**
 * When the keyboard comes up, or the field moves, and the field being typed in (Tell, a form, Slash's question) is under
 * the keys, scroll it to the middle of what is left. Safari keeps the caret in sight itself only in the page's own
 * scroll, and the app scrolls one panel inside a page that does not, so a field low on Today could sit under the keys.
 */
export function keepFieldInView(): () => void {
  const view = typeof visualViewport === 'undefined' ? null : visualViewport;
  if (!view) return () => {};
  const check = () => {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement) || !el.matches('input:not([type=checkbox]):not([type=radio]):not([type=button]), textarea, [contenteditable="true"]')) return;
    const r = el.getBoundingClientRect();
    if (r.bottom > view.offsetTop + view.height - 8 || r.top < view.offsetTop) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  let frame = 0;
  const soon = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(check);
  };
  view.addEventListener('resize', soon);
  document.addEventListener('focusin', soon);
  return () => {
    cancelAnimationFrame(frame);
    view.removeEventListener('resize', soon);
    document.removeEventListener('focusin', soon);
  };
}
