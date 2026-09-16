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

import { build, HIGH_CONTRAST_PROFILE, HOUSE_PROFILE, type Seed } from './build.ts';

/**
 * The house seed. Three decisions, and the first two are reversals.
 *
 * ONE · THE ACCENT IS NOT THE MARK ANY MORE. It used to be the logo's red, on the argument that a
 * product should be painted in its own colour, and `info` became a generated role so that the
 * generator would allow it. Painted across every primary button, link and selected row, a red read
 * as an alarm on screens where nothing was wrong, and toning it down by a third did not change the
 * verdict, which was "a corporate tool". The logo keeps the red: `BRAND_RED` is emitted as
 * `--brand` outside `toCSS`, so no theme can reach it. The controls take an indigo, the colour of
 * the product BrainDog is measured against, and red is left to mean one thing.
 *
 * TWO · THE NEUTRALS ARE A COOL GREEN-GREY, NOT OLIVE. Hue 110 was chosen as paper left in the sun:
 * cream in light, warm olive-black in dark. On a screen it read as khaki, the colour of a form.
 * Hue 165 at the same capped chroma is near-black glass in dark and a clean pale grey in light.
 *
 * FOUR · 2026-09-16, THE LAVENDER AND THE MINT GO (loop/DESIGN-BRIEF.md 4.1). An indigo accent and a
 * tinted ground were the two things that made the app read as a theme rather than a product: indigo
 * is the colour every generated dashboard reaches for, and hue 165 put a mint cast on every
 * surface. The ground is now a barely warm grey (hue 75, chroma capped at 0.004 in the profile).
 *
 * FIVE · THE ACCENT IS THE BRAND'S FAMILY AGAIN, BUT NOT ITS ALARM. Production is BrainDog, and
 * BrainDog is red, so the accent is a berry rose at hue 5: 22 degrees cooler than `danger` at 27 and
 * lower in chroma than the mark, which is the distance between a brand colour and a warning. It is
 * spent sparingly: focus, selection, links, checked controls, the record's tile and the place you
 * are. Primary actions are drawn in ink. Alpha derives its own accent from this one, so the two
 * deployments stay apart at a glance.
 *
 * THREE · THE ACCENT'S POINT IS STILL A WINDOW. A white label on the fill needs 4.5:1, which caps
 * its luminance, and the fill needs 3:1 against the lightest surface and the darkest. At
 * `oklch(0.565 0.18 278)` it is #6164DC with a white label at 4.81:1. It is 14 degrees from
 * `info`'s anchor, which the intent floor does not govern because the accent is not an intent:
 * `info` is only ever a glyphed word, and the accent is a control.
 */
export const HOUSE_SEED: Seed = {
  accent: 'oklch(0.55 0.14 5)',
  neutralHue: 75,
  space: 4,
  radius: { sm: 6, md: 8, lg: 12 },
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
