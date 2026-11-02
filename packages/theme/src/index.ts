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

import { BRAND_RED, build, HIGH_CONTRAST_PROFILE, HOUSE_NEUTRAL_HUE, HOUSE_PROFILE, type Seed } from './build.ts';

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
 * FOUR · 2026-09-16, THE LAVENDER AND THE MINT GO. An indigo accent and a
 * tinted ground were the two things that made the app read as a theme rather than a product: indigo
 * is the colour every generated dashboard reaches for, and hue 165 put a mint cast on every
 * surface. The ground is now a barely warm grey (hue 75, chroma capped at 0.004 in the profile).
 *
 * FIVE · THE ACCENT IS THE BRAND'S FAMILY AGAIN, BUT NOT ITS ALARM. Production is BrainDog, and
 * BrainDog is red, so the accent is a red at hue 6, cooler than `danger` at 27, and under the chroma
 * of the `danger` chip, which is the distance between a brand colour and a warning. It is spent
 * sparingly: focus, selection, links, checked controls, the record's tile and the place you are.
 * Primary actions are drawn in ink. Alpha derives its own accent from this one, so the two
 * deployments stay apart at a glance.
 *
 * SIX · THE LOGO WEARS THE ACCENT. The owner asked for the mark to match this tone, so `--brand` and
 * both favicons are the house accent, as alpha's already were its own. `BRAND_RED` remains the hue
 * the alpha accent is steered away from.
 *
 * THREE · THE ACCENT'S POINT IS STILL A WINDOW. A white label on the fill needs 4.5:1, which caps
 * its luminance, and the fill needs 3:1 against the lightest surface and the darkest. At
 * `oklch(0.565 0.18 278)` it is #6164DC with a white label at 4.81:1. It is 14 degrees from
 * `info`'s anchor, which the intent floor does not govern because the accent is not an intent:
 * `info` is only ever a glyphed word, and the accent is a control.
 *
 * SEVEN · 2026-09-20, THE CHROMA GOES BACK IN. The colours read pale, and the
 * accent "is not gonna be persistent". That was right, and the cause was in this file. §FIVE solved
 * "must not read as a warning" by draining saturation, and the test below it capped the accent at
 * the mark's chroma, so what shipped was 0.150, quieter than `danger` at 0.160. The brand colour
 * was the palest thing on the screen and the palest thing on a 16 pixel favicon, where half the
 * glyph is antialiased edge and a low chroma blends into the browser chrome.
 *
 * CHROMA WAS NEVER THE LEVER. The references he named, PostHog and FirstLook, both run a red at
 * 0.20 to 0.21 and neither reads as an error. What stops it is hue distance, the rule that primary
 * actions are drawn in ink rather than in the accent (§FIVE already has it), an error state that
 * differs by FORM and not by hue (a filled chip with a glyph, which `blocks.css` already does), and
 * rarity: saturation reads as identity when it is rare and consistent. So the accent is hue 6 at
 * L 0.575 and C 0.215, which is where chroma peaks inside the red family while the fill still
 * clears 3:1 on the darkest surface (it never did before, at 2.83) and a white label keeps 4.90:1.
 * Twenty-one degrees from `danger`, up from seventeen, so it is further from the alarm than the
 * pale one was, not nearer.
 *
 * AND THE INK RAMP GOES WITH IT, because "how readable everything is" was the other half of what he
 * asked for. `HOUSE_PROFILE.ink` was `[12, 8, 6, 4.5]` and is now `[14, 9, 6.5, 4.5]`, the most the
 * validator will accept. Body text lands at 15.4:1 in light and 17.6:1 in dark, which is a bigger
 * readability gain than the accent and the one that shows on every screen rather than on the few
 * things the accent touches.
 *
 * `against PostHog's 17.6` WAS ON THAT LAST LINE AND IT WAS NOT A MEASUREMENT.
 *
 * The single figure corresponds to neither of PostHog's schemes. Read from their source on
 * 2026-09-21 and computed against each scheme's own page ground
 * (`github.com/PostHog/posthog.com`, `src/styles/global.css`):
 *
 *   light   `--text-primary: 17 17 17` (#111111) on `--bg: 253 253 248` (#FDFDF8)   18.51:1
 *   dark    `--text-primary: 250 250 250` (#FAFAFA) on `--bg: 30 31 35` (#1E1F23)   15.77:1
 *
 * So the honest comparison is that the two products cross over: they are brighter than us in
 * light (18.51 to 15.4) and we are brighter than them in dark (17.6 to 15.77). Both pairs are far
 * above the 7:1 AAA floor and the difference is not one a reader can see, which is the real reason
 * this line should never have been a scoreboard.
 *
 * EIGHT · 2026-09-25, THE GROUND GOES COOL. Hue 75 made the dark
 * ground a brown-black and the light one a cream, and the product asks for a near-black cool
 * ground. `neutralHue` moves to 260, a slate, under the same 0.004 chroma cap
 * `HOUSE_PROFILE.groundC` already holds: the cap is what keeps a cool ground from turning into the
 * mint §FOUR removed. Solved when it was chosen, dark `bg` is #121314 and `sunk` #0B0C0E, light
 * `bg` #F4F6F8. The seed's accent does not move. The roles solved against the ground move by about
 * one code value a channel (dark `danger` #E5665B to #E5675C), and the accent fill at its worst,
 * on dark `s3`, went from 3.05:1 to 3.03:1, still over check R's floor of 3.
 *
 * AND §FIVE AND §SEVEN SAY HUE 6, WHICH IS NOT THE SEED. The accent has been hue 27, the mark's own,
 * since 2026-09-21 (`theme.test.ts` holds it within two degrees of the mark). The lightness and
 * chroma argument in §SEVEN is unchanged by that.
 *
 * NINE · 2026-09-29, THE DESIGN SYSTEM. The seed does not move: the accent is the mark and stays the mark,
 * and 260 is already the design system's slate, whose surfaces and inks measure 254 to 263. What moved is the profile
 * (`HOUSE_PROFILE` in `build.ts`), which now carries the design system's ground, tile, inks, line, intents and `live` as aims,
 * and the radius, which is the design system's: key caps 6, fields and menus 12, tiles and the rail 22 (`tokens.css`).
 *
 * TEN · 2026-10-07, ONE WORKING ACCENT BESIDE THE MARK ("keep BrainDog red as the brand and the late
 * colour; add one working accent for selection, primary buttons, links and charts"). The accent stays the mark's red,
 * and the house pins its working colour beside it. It was the design's own blue, in light and in dark, until ELEVEN.
 * The pin holds only beside this accent (`Seed.action`), so a record, a look or an environment that brings its own
 * colour has its working accent solved from that colour instead.
 *
 * ELEVEN · 2026-10-08, THE WORKING ACCENT IS RED ("stick with red as the working accent color"). The
 * earlier "one blue working accent" is "one red working accent" now. BrainDog red (`BRAND_RED`, #CF413A) is the fill in light,
 * and the pressed red, #B3322C, is its hover. The mark keeps its own red (#DB2527) for the logo and nothing else.
 *
 * DARK IS #E05148, THE NEAREST RED OF THAT HUE THAT PASSES, found by walking #CF413A up its lightness at its own hue and
 * chroma. #CF413A itself clears 3:1 on every dark ground with a white label at 4.70:1, but a white-labelled fill can only
 * press darker, and darker sinks into the dark board: the generator's first step, #BD2F2B, is 2.55:1 on the field, and
 * the light scheme's pressed red, #B3322C, 2.83:1 on the tile. From L 0.627 the dark tile clears 4.5:1 as its label,
 * so the hover steps lighter, away from the label, and every state clears every floor. The steps between are reds
 * neither white nor the tile can label at AA.
 *
 * LATE AND "NEEDS YOU" TAKE THE DEEPER RED, #B3322C in light as a mark and as words (`SYSTEM_AIM`); dark's late red stays
 * #FF5A55, lighter and more saturated than the working one. The working and the late red are close by design and are
 * never told apart by colour alone: a late thing carries its word or its dot, a late bar its hatch
 * (`--chart-late-hatch`), and check K measures the working accent's words beside red words without refusing them
 * (`K_EXEMPT`, `separation.test.ts`).
 *
 * MEASURED, normal and high contrast, light then dark. Label on the fill and on the hover: 4.70 and 6.16 in light in both
 * profiles; 4.52 and 5.51 in dark in both. The fill on the board, the tile and the field: light 4.27, 4.70, 4.01 (high
 * contrast 4.27, 4.70, 4.38); dark 4.94, 4.52, 3.84 (high contrast 4.94, 4.52, 4.23); the hover clears more on each. The
 * accent as words (`action-text`) on the board and the tile: light #BB2C29 at 5.44 and 5.99 (high contrast #B22321 at
 * 6.05 and 6.66); dark #F6665B at 6.33 and 5.80 (high contrast #FF6F63 at 7.00 and 6.41), and at 4.51 or more on its
 * own stronger tint. Selection: the first tint stands 6.98 ΔE off the light tile and 10.72 off the dark one, with body
 * text on it at 16.18 and 13.89 and quiet text at 5.34 and 4.99. Focus: the ring's inner tone is the ink, 15.71 or more
 * on the board and the tile in every profile and scheme (the dark tile is the least), and 3.96 (light) and 3.47 (dark)
 * against the red fill itself. Late as words: 5.60 on the light board, 6.16 on the light tile; 6.22 and 5.69 in dark.
 * Dark's label at 4.52 is the tightest number here, and check S holds it.
 */
const HOUSE_ACCENT = 'oklch(0.575 0.215 27)';

export const HOUSE_SEED: Seed = {
  accent: HOUSE_ACCENT,
  neutralHue: HOUSE_NEUTRAL_HUE,
  space: 4,
  radius: { sm: 6, md: 12, lg: 22 },
  density: 'comfortable',
  action: { accent: HOUSE_ACCENT, light: BRAND_RED, dark: '#E05148', pressed: { light: '#B3322C' } },
};

/**
 * BUILT ON FIRST USE, NOT AT LOAD (2 Nov): the four palettes are solved by a search, and solving all four when the
 * module loads put the Worker over Cloudflare's startup CPU limit (deploy refused, code 10021). Each is now solved the
 * first time anything reads it, once, and kept; reading it looks exactly like reading the object it was.
 */
function lazy<T extends object>(make: () => T): T {
  let made: T | undefined;
  const real = (): T => (made ??= make());
  return new Proxy({} as T, {
    get: (_, k) => Reflect.get(real(), k),
    has: (_, k) => Reflect.has(real(), k),
    ownKeys: () => Reflect.ownKeys(real()),
    getOwnPropertyDescriptor: (_, k) => {
      const d = Reflect.getOwnPropertyDescriptor(real(), k);
      return d === undefined ? undefined : { ...d, configurable: true };
    },
    getPrototypeOf: () => Reflect.getPrototypeOf(real()),
    set: (_, k, v) => Reflect.set(real(), k, v),
  });
}

export const HOUSE = lazy(() => build(HOUSE_SEED, HOUSE_PROFILE, 'house'));
export const HIGH_CONTRAST = lazy(() => build(HOUSE_SEED, HIGH_CONTRAST_PROFILE, 'high-contrast'));

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
export const ALPHA_SEED = lazy(() => environmentSeed(HOUSE_SEED));
export const ALPHA = lazy(() => build(ALPHA_SEED, HOUSE_PROFILE, 'alpha'));
export const ALPHA_HIGH_CONTRAST = lazy(() => build(ALPHA_SEED, HIGH_CONTRAST_PROFILE, 'alpha-high-contrast'));
