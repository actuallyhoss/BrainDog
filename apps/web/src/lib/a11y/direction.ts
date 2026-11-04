/**
 * Which way the app reads: left to right, or right to left.
 *
 * NOTHING ELSE COULD PUT THE APP RIGHT TO LEFT. Every screen was built on logical properties and every panel had its
 * `:dir(rtl)` rule, and no control ever set the attribute they all wait for, so a person reading Arabic got none of it.
 * This is that control's half (Settings > Appearance), and the record's data keeps its own direction either way.
 *
 * ITS OWN COOKIE AND NOT A FIELD OF `pref.ts`, because it belongs to the device and the browser's language says nothing
 * about it: the words are still English, and a mirrored English screen is a choice a person makes, not one made for them.
 * Written on the first line of `+layout.ts`, before anything is drawn.
 */

export type Direction = 'ltr' | 'rtl';

const NAME = 'bd_dir';
const YEAR = 60 * 60 * 24 * 365;

export const direction = (cookie: string = typeof document === 'undefined' ? '' : document.cookie): Direction =>
  /(?:^|; )bd_dir=rtl(?:;|$)/u.test(cookie) ? 'rtl' : 'ltr';

/** Sets the document's direction, and keeps it on this device when `keep` says so. */
export function setDirection(to: Direction, keep = true): void {
  if (typeof document === 'undefined') return;
  if (to === 'rtl') document.documentElement.setAttribute('dir', 'rtl');
  else document.documentElement.removeAttribute('dir');
  if (keep) document.cookie = `${NAME}=${to}; path=/; max-age=${YEAR}; samesite=lax`;
}
