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

import { build, HIGH_CONTRAST_PROFILE, HOUSE_PROFILE, type Seed } from './build.ts';

/**
 * The house seed.
 *
 * Where the brand red lives, settled: #F42A2A is oklch(0.623 0.233 27.4) and 28 §3 step 5 anchors
 * `danger` at 27. The mark and the alarm are the same hue by construction, so red in this product
 * always means *this is owed, this is late, this is wrong* — the most useful thing red could mean in
 * a record of what you owe. The dark `danger` chip generates to the mark's own colour.
 *
 * `accent` is therefore not red and could not be: `info` resolves to `accent`, so a red accent puts
 * two of the four intents on one hue and the generator refuses it.
 *
 * `neutralHue: 'from-accent'` — AND THIS IS A REVERSAL WORTH RECORDING. The first house seed put the
 * neutral hue on 27 as well, so that every surface and every ink carried a whisper of the brand. The
 * argument was good. The render was BROWN: at L 0.16 even 0.008 of chroma at that hue reads as dirt
 * rather than as warmth, the ink came out pink, and the one colour the whole system exists to
 * protect — the red — had nothing clean to sit against. The logo is red on white and red on black,
 * never red on brown. So the neutrals went cool and the brand stays where a brand belongs: on the
 * mark, and on the one intent that matters.
 */
export const HOUSE_SEED: Seed = {
  // L 0.60 is not a taste decision: it is the one band where the accent fill clears 3:1 against the
  // lightest LIGHT surface and the lightest DARK surface at the same time, so one seed serves both
  // schemes and a filled control has a legal boundary in each.
  accent: 'oklch(0.60 0.155 258)',
  neutralHue: 'from-accent',
  space: 4,
  radius: { sm: 4, md: 9, lg: 16 },
  density: 'comfortable',
};

export const HOUSE = build(HOUSE_SEED, HOUSE_PROFILE, 'house');
export const HIGH_CONTRAST = build(HOUSE_SEED, HIGH_CONTRAST_PROFILE, 'high-contrast');
