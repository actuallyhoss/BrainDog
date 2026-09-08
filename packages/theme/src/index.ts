/**
 * `@braindog/theme` — the generator, the validator, the two shipped themes.
 *
 * Two themes ship, each in both schemes, as CONSTANTS in this package rather than as declarations:
 * HOUSE, and HOUSE through the HIGH_CONTRAST profile (28 §1, 39 D17). A `theme` declaration row
 * exists only for an installed third-party theme.
 */

export * from './color.ts';
export * from './build.ts';
export * from './checks.ts';
export * from './css.ts';
export * from './record.ts';

import { BRAND_RED, build, HIGH_CONTRAST_PROFILE, HOUSE_PROFILE, type Seed } from './build.ts';

/**
 * The house seed. Three decisions, and two of them were arrived at the hard way.
 *
 * ONE · THE ACCENT IS THE MARK. A product should be painted in its own colour, and this one is.
 * That cost something: `info` used to resolve to `accent` (28 §3 step 5), so a red accent put two
 * of the four intent words on hue 27 and the generator refused the theme outright. The right
 * response was to fix the constraint rather than the brand — `info` is a generated role now, which
 * costs one colour and one -fill and buys back the identity.
 *
 * TWO · THE RED IS A THIRD QUIETER THAN IT WAS, and this is the reversal. The first house red was
 * #F42A2A, chroma 0.233, the most saturated red sRGB has at that lightness. Painted across a rail,
 * a primary button, every link and every selected row, it did not read as a brand; it read as an
 * alarm going off on a screen where nothing was wrong. Toning it to chroma 0.18 keeps the hue
 * exactly — the identity does not move — and leaves the loud red free to mean the one thing it
 * should. That old value is still in the system: it is the band the `danger` chip is struck from,
 * so the alarm is always a step louder than the brand it echoes.
 *
 * THREE · THE NEUTRALS ARE OLIVE, NOT THE ACCENT'S HUE. The first seed set `neutralHue:
 * 'from-accent'` so every surface and every ink carried a whisper of the brand. The render was
 * BROWN: at L 0.16 even 0.008 of chroma at hue 27 reads as dirt rather than as warmth, the ink came
 * out pink, and the one colour the whole system exists to protect had nothing clean to sit against.
 * 110 is the hue of paper left in the sun — cream in light, warm olive-black in dark — and it is
 * the cheapest thing this product does to stop looking like every other dashboard.
 */
export const HOUSE_SEED: Seed = {
  /**
   * The mark itself, referenced rather than re-typed, so the brand and the accent cannot come
   * apart in a later edit. `#CF413A` is `oklch(0.58 0.18 27)`.
   *
   * The (L, C) is not a taste call. Three floors meet here and only a narrow band satisfies all
   * three: a white label on the fill needs 4.5:1, which caps the colour's luminance, while the fill
   * against the lightest surface and against the darkest each need 3:1 under 1.4.11, and those pull
   * opposite ways. The window is Y ∈ [0.151, 0.183]. Measured at this point: white label 4.70:1,
   * 3.92:1 on light `sunk`, 3.28:1 on dark `s3`.
   *
   * It also settles what "paler" could mean. Lighter is not available — a coral at Y 0.38 has no
   * 3:1 boundary against cream, so the button loses its edge on the one scheme that needs it most.
   * Less saturated is available, and that is what was spent.
   */
  accent: BRAND_RED,
  neutralHue: 110,
  space: 4,
  radius: { sm: 4, md: 6, lg: 8 },
  density: 'comfortable',
};

export const HOUSE = build(HOUSE_SEED, HOUSE_PROFILE, 'house');
export const HIGH_CONTRAST = build(HOUSE_SEED, HIGH_CONTRAST_PROFILE, 'high-contrast');

/**
 * The environment palettes, re-exported so a build has one place to ask.
 *
 * `environment.ts` needs `HOUSE_SEED` and `HOUSE_PROFILE`, which are declared above, so it imports
 * from here and this line closes the loop rather than opening a cycle: the module is loaded on
 * demand by whoever asks for a alpha palette, and nothing in the house build depends on it.
 */
import { environmentSeed } from './environment.ts';

export { ENVIRONMENTS, environmentHue, environmentSeed, environmentTheme, intentGaps } from './environment.ts';
export type { Environment } from './environment.ts';

/**
 * The alpha palette, solved from the house seed rather than written down.
 *
 * `environmentSeed` keeps every field of `HOUSE_SEED` and moves ONE: the accent, to the hue
 * `nextAccentHue` returns as farthest from the brand's own. Every non-accent role therefore comes
 * out byte-identical to `HOUSE`, which is what keeps a alpha screenshot comparable to a
 * production one — the two differ in exactly the places the accent is, and nowhere else.
 *
 * IT IS NOT ORANGE, AND THAT WAS MEASURED. Four orange candidates were solved and every one of them
 * put the MARK within 2.1 ΔE of the brand's after dichromat simulation, against `28 §3.2`'s floor of
 * 4 — red and orange are the same colour to a protanope, so the alpha logo and the production
 * logo would be indistinguishable to the reader the floor exists for. The window the 20° intent-hue
 * rule leaves for orange is hues 47–55, and the mark separation is ≤1.4 across all of it.
 */
export const ALPHA_SEED = environmentSeed(HOUSE_SEED);
export const ALPHA = build(ALPHA_SEED, HOUSE_PROFILE, 'alpha');
export const ALPHA_HIGH_CONTRAST = build(ALPHA_SEED, HIGH_CONTRAST_PROFILE, 'alpha-high-contrast');
