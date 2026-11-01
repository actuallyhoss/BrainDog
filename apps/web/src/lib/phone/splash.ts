/**
 * The iPhone launch pictures: what an iPhone shows while a BrainDog opened from the Home Screen starts, one per screen
 * size and one per scheme, so the app opens on its own ground with the mark and never on a white flash.
 *
 * AN IPHONE WANTS ONE PICTURE PER EXACT SCREEN, matched by `device-width`, `device-height` and the pixel ratio in the
 * link's `media`; a size with no match shows white. So the current iPhones are listed here by their screen in points,
 * newest first, and a size two phones share is drawn once.
 *
 * ONE LIST FOR THE DRAWING AND THE LINKS. `packages/skin/scripts/splash.mjs` draws `static/splash-<w>x<h>-<scheme>.png`
 * from it, and `links` below writes the `<link rel="apple-touch-startup-image">` lines from it, so a size can never be
 * drawn and not asked for, or asked for and not drawn.
 *
 * PLAIN TYPESCRIPT WITH NO IMPORT, so plain Node can read it from the script.
 */

/** One screen: its size in points, portrait, and how many pixels a point is. */
export type Screen = { w: number; h: number; ratio: 2 | 3 };

/** The phones this covers, by screen. Newest first; the comment names the phones that share it. */
export const SCREENS: readonly Screen[] = [
  { w: 440, h: 956, ratio: 3 }, // 17 Pro Max, 16 Pro Max
  { w: 420, h: 912, ratio: 3 }, // Air
  { w: 402, h: 874, ratio: 3 }, // 17, 17 Pro, 16 Pro
  { w: 430, h: 932, ratio: 3 }, // 16 Plus, 15 Plus, 15 Pro Max, 14 Pro Max
  { w: 393, h: 852, ratio: 3 }, // 16, 15, 15 Pro, 14 Pro
  { w: 390, h: 844, ratio: 3 }, // 16e, 14, 13, 13 Pro, 12, 12 Pro
  { w: 428, h: 926, ratio: 3 }, // 14 Plus, 13 Pro Max, 12 Pro Max
  { w: 375, h: 812, ratio: 3 }, // 13 mini, 12 mini, 11 Pro, XS, X
  { w: 414, h: 896, ratio: 3 }, // 11 Pro Max, XS Max
  { w: 414, h: 896, ratio: 2 }, // 11, XR
  { w: 375, h: 667, ratio: 2 }, // SE (2nd and 3rd), 8
];

export type Scheme = 'light' | 'dark';

/** The picture's file, at the app's root: its size in pixels and its scheme. */
export const fileOf = (s: Screen, scheme: Scheme): string => `splash-${s.w * s.ratio}x${s.h * s.ratio}-${scheme}.png`;

/** The media query an iPhone matches the picture by. */
export const mediaOf = (s: Screen, scheme: Scheme): string =>
  `(device-width: ${s.w}px) and (device-height: ${s.h}px) and (-webkit-device-pixel-ratio: ${s.ratio}) and (orientation: portrait) and (prefers-color-scheme: ${scheme})`;

/** Every link, as `{ href, media }`, under the app's `base`. */
export function links(base: string): { href: string; media: string }[] {
  const out: { href: string; media: string }[] = [];
  for (const s of SCREENS) for (const scheme of ['light', 'dark'] as const) out.push({ href: `${base}/${fileOf(s, scheme)}`, media: mediaOf(s, scheme) });
  return out;
}
