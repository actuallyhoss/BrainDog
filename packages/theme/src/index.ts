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
 * The house seed, and the two sentences behind it.
 *
 * `neutralHue: 27` is the BrainDog red's own hue. Every surface and every ink in the product
 * therefore carries a whisper of it — a warm near-black in dark, warm paper in light — which is how
 * the brand reaches every pixel without ever raising its voice. Measured: #F42A2A is
 * oklch(0.618 0.221 27.4), and 28 §3 step 5 anchors `danger` at 27. The mark and the alarm are the
 * same hue by construction, not by coincidence, so red in this product always means *this is owed,
 * this is late, this is wrong* — which in a record of what you owe is the most useful thing red
 * could mean.
 *
 * `accent` is therefore NOT red, and could not be: `info` resolves to `accent`, so a red accent
 * would put the four intents at delta-E 0 and check F would refuse the theme. It is an ink blue —
 * the pen beside the red ledger line. Restrained on purpose; the only loud colours on a BrainDog
 * screen are the ones that mean something.
 */
export const HOUSE_SEED: Seed = {
  // L 0.60 is not a taste decision: it is the one band where the accent fill clears 3:1 against the
  // lightest LIGHT surface and the lightest DARK surface at the same time, so one seed serves both
  // schemes and a filled control has a legal boundary in each.
  accent: 'oklch(0.60 0.155 258)',
  neutralHue: 27,
  space: 4,
  radius: { sm: 4, md: 9, lg: 16 },
  density: 'comfortable',
};

export const HOUSE = build(HOUSE_SEED, HOUSE_PROFILE, 'house');
export const HIGH_CONTRAST = build(HOUSE_SEED, HIGH_CONTRAST_PROFILE, 'high-contrast');
