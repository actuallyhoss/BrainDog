/**
 * The environment palette, and the numbers that made orange the wrong answer.
 *
 * Every assertion here is a sentence from `environment.ts`'s own argument, held to a number. The
 * two that carry the design are the last two: an environment accent has to be far from the
 * production accent to a DICHROMAT, not to whoever picked it, and orange is not.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fromHex, rgbToLch, quantise, toHex, separation, contrast, rgbToCielab, deltaE2000, type Deficiency } from './color.ts';
import {
  BRAND_RED,
  HIGH_CONTRAST_PROFILE,
  HOUSE_PROFILE,
  INKS,
  INTENTS,
  INTENT_HUE,
  SURFACES,
  hueGap,
  type Scheme,
} from './build.ts';
import { refusals, validate } from './checks.ts';
import { forcedColors, toCSS } from './css.ts';
import { HOUSE, HOUSE_SEED, ALPHA, ALPHA_HIGH_CONTRAST, ALPHA_SEED } from './index.ts';
import { ENVIRONMENTS, environmentHue, environmentSeed, intentGaps } from './environment.ts';

const FORCED = forcedColors(['panel', 'grid', 'rows', 'prop', 'inline', 'list', 'table', 'media']);
const DEFS: Deficiency[] = ['protan', 'deutan', 'tritan'];
const SCHEMES: Scheme[] = ['light', 'dark'];

/** The worst a dichromat sees it, which is the only figure a separation claim may be made on. */
const worstDE = (a: string, b: string) => Math.min(...DEFS.map((d) => separation(fromHex(a), fromHex(b), d)));
const mark = (hue: number, scheme: Scheme) =>
  toHex(quantise({ L: HOUSE_PROFILE.mark[scheme].L, C: HOUSE_PROFILE.mark[scheme].C, H: hue }));
const BRAND_HUE = rgbToLch(fromHex(BRAND_RED)).H;

/* -- the hue is derived, not chosen ---------------------------------------- */

test('the environment hue is the farthest legal point from the accent and the brand, and it is 286', () => {
  /* PINNED IN THE TEST AND COMPUTED IN THE SOURCE. `nextAccentHue` is the derivation; this number
     is the answer it gives today. If somebody improves the scorer, this line goes red naming the
     degree it moved to - which is a review, not a silent repaint of a deployed environment. */
  assert.equal(environmentHue(HOUSE_SEED), 286);
  /* 0.575 AND NOT 0.576 SINCE 2026-09-21: alpha takes the house accent's lightness and chroma and only
     its hue is derived, so moving the house accent onto the mark's own hue (27, the owner's red) moved
     this by a thousandth. The hue it steers to is unmoved at 286, which is the point of the pin: the
     derivation did not change, the colour it derives from did. */
  assert.equal(ALPHA_SEED.accent, 'oklch(0.575 0.215 286)');
});

test('the environment seed changes the hue and nothing else', () => {
  const house = rgbToLch(fromHex(HOUSE.schemes.light.accent));
  const env = rgbToLch(fromHex(ALPHA.schemes.light.accent));
  assert.ok(Math.abs(house.L - env.L) < 0.02, `L moved: ${house.L} to ${env.L}`);
  assert.ok(Math.abs(house.C - env.C) < 0.02, `C moved: ${house.C} to ${env.C}`);
  assert.equal(ALPHA_SEED.neutralHue, HOUSE_SEED.neutralHue);
  assert.equal(ALPHA_SEED.density, HOUSE_SEED.density);
  assert.deepEqual(ALPHA_SEED.radius, HOUSE_SEED.radius);
});

test('it is at least the intent floor away from every intent anchor', () => {
  /* 28 section 3.2: nothing within 20 degrees of an intent, "because a hue seven degrees from
     `earn` is an intent, not a mark". The house accent is not governed by it, because it is not an
     intent (`index.ts`, THREE); an environment accent is held to it all the same. */
  const gaps = intentGaps(environmentHue(HOUSE_SEED));
  for (const [name, gap] of Object.entries(gaps))
    assert.ok(gap >= 20, `the environment accent is ${gap.toFixed(1)} degrees from ${name}, and 20 is the floor`);
  assert.deepEqual(gaps, { earn: 141, warn: 149, danger: 101, info: 22 });
});

/* -- what it costs the rest of the palette: nothing ------------------------- */

test('every role that is not the accent is byte-identical to the house palette', () => {
  /* THE PROPERTY THAT MAKES A ALPHA SCREENSHOT COMPARABLE TO A PRODUCTION ONE. The intents solve
     at fixed hue anchors against a ground whose chroma is capped below any seed's, so a rotation of
     the accent cannot move them - and this asserts it rather than assuming it. */
  const same = [
    ...SURFACES,
    ...INKS,
    'line',
    'edge',
    ...INTENTS,
    'earn-fill',
    'warn-fill',
    'danger-fill',
    'info-fill',
    'focus-in',
    'focus-out',
  ] as const;
  for (const scheme of SCHEMES)
    for (const role of same)
      assert.equal(ALPHA.schemes[scheme][role], HOUSE.schemes[scheme][role], `${role} moved in ${scheme}`);
});

test('and every role that IS the accent has moved', () => {
  for (const scheme of SCHEMES)
    for (const role of ['accent', 'accent-text', 'accent-edge', 'accent-hover', 'accent-press'] as const)
      assert.notEqual(ALPHA.schemes[scheme][role], HOUSE.schemes[scheme][role], `${role} did not move in ${scheme}`);
});

test('the environment palette is refused by none of the sixteen checks, at both profiles', () => {
  const css = toCSS(ALPHA, ALPHA_HIGH_CONTRAST) + FORCED;
  assert.deepEqual(refusals(validate(ALPHA, css)).map((f) => f.fix), []);
  assert.deepEqual(refusals(validate(ALPHA_HIGH_CONTRAST, css)).map((f) => f.fix), []);
});

test('a control still clears its own label in every state', () => {
  /* Check Q, restated here because it is the floor an environment accent is most likely to break:
     the fill moves and the label is solved against it, so a rotation that gained lightness would
     take a primary button under 4.5:1 at exactly the moment somebody presses it. */
  for (const scheme of SCHEMES)
    for (const role of ['accent', 'accent-hover', 'accent-press'] as const) {
      const got = contrast(fromHex(ALPHA.schemes[scheme][role]), fromHex(ALPHA.schemes[scheme]['accent-ink']));
      assert.ok(got >= 4.5, `${role} is ${got.toFixed(2)}:1 against its own label in ${scheme}`);
    }
});

/* -- the finding: orange is the production red, to one reader in twelve ----- */

test('the environment accent is far from the production accent where the accent is painted', () => {
  /* 28 section 4.4 check F's band is the bar one spent colour allows, and there are two now. The
     house accent left the mark for an indigo, so an environment has to sit away from a red AND an
     indigo, and no hue that holds the accent's lightness and chroma inside sRGB clears F's refusal
     floor of 10 against both for all three dichromats: the best, 334, measures 6.6 to 8.2 after
     Brettel. So the claim is split and each half is held to the number measured when it was made.
     For normal vision the fills, links and marks are 18.8 to 23.1 apart, which is F's pass line or
     within a point of it. For a dichromat the deployment's label says which one it is, as text, and
     the colour is the second channel there rather than the only one. */
  for (const scheme of SCHEMES) {
    const pairs: Record<string, [string, string]> = {
      fill: [ALPHA.schemes[scheme].accent, HOUSE.schemes[scheme].accent],
      link: [ALPHA.schemes[scheme]['accent-text'], HOUSE.schemes[scheme]['accent-text']],
      mark: [mark(environmentHue(HOUSE_SEED), scheme), mark(BRAND_HUE, scheme)],
    };
    for (const [what, [a, b]] of Object.entries(pairs)) {
      const plain = deltaE2000(rgbToCielab(fromHex(a)), rgbToCielab(fromHex(b)));
      assert.ok(plain >= 18, `${scheme}: the two ${what}s are delta-E ${plain.toFixed(1)} apart`);
      const worst = worstDE(a, b);
      assert.ok(worst >= 6, `${scheme}: the two ${what}s are delta-E ${worst.toFixed(1)} apart to a dichromat`);
    }
  }
});

test('an orange environment accent is the production red to a protanope, at every orange', () => {
  /* THE MEASUREMENT THAT SETTLED IT, kept as a test so nobody re-proposes it from taste.
     Four oranges: two popular ones, the most saturated colour in the only hue window the 20-degree
     intent floor leaves open (47 to 55), and a lighter one inside that window. The FILL is
     arguably far enough in one case. The MARK is never - and the mark is the accent's most
     repeated painting, on the logo and on every identity swatch in the rail. */
  for (const hex of ['#F97316', '#FF8C00', '#E8590C', '#E37725']) {
    const hue = rgbToLch(fromHex(hex)).H;
    const worstMark = Math.min(...SCHEMES.map((s) => worstDE(mark(hue, s), mark(BRAND_HUE, s))));
    assert.ok(
      worstMark < 4,
      `${hex} would give a mark delta-E ${worstMark.toFixed(1)} from the brand's. If this is now above 4 the finding has changed and the argument in environment.ts needs re-reading.`,
    );
  }
});

test('the two popular oranges also sit inside the intent hue floor', () => {
  /* One collides with `warn`, one with `danger`, and it is not a coincidence: the arc between
     `danger` at 27 and `warn` at 75 is 48 degrees wide, so a 20-degree floor on both sides leaves a
     nine-degree window - and no colour a person would call orange is inside it. */
  assert.ok(hueGap(rgbToLch(fromHex('#FF8C00')).H, INTENT_HUE.warn) < 20);
  assert.ok(hueGap(rgbToLch(fromHex('#E8590C')).H, INTENT_HUE.danger) < 20);
});

/* -- the closed list ------------------------------------------------------- */

test('every environment in the list has a palette, and production is not in it', () => {
  assert.deepEqual([...ENVIRONMENTS], ['alpha']);
  assert.ok(!(ENVIRONMENTS as readonly string[]).includes(''));
  assert.equal(ALPHA.id, 'alpha');
  assert.equal(ALPHA.profile, HOUSE_PROFILE);
  assert.equal(ALPHA_HIGH_CONTRAST.profile, HIGH_CONTRAST_PROFILE);
});

test('the derived seed is stable, and a link still clears check K', () => {
  assert.deepEqual(environmentSeed(HOUSE_SEED), environmentSeed(HOUSE_SEED));
  /* Check K: a link must differ from body ink and from an overdue figure in LIGHTNESS, because hue
     alone may never encode meaning. It is the floor the accent's own hue is most able to break. */
  for (const scheme of SCHEMES) {
    const p = ALPHA.schemes[scheme];
    for (const against of [p.ink, p.danger]) {
      const dL = Math.abs(rgbToCielab(fromHex(p['accent-text'])).L - rgbToCielab(fromHex(against)).L);
      assert.ok(dL >= 8, `a link is ${dL.toFixed(1)} L* from ${against} in ${scheme}`);
    }
  }
});
