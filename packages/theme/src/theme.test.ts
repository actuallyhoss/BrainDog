import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  apcaLc,
  contrast,
  deltaE2000,
  fromHex,
  gamutMap,
  inGamut,
  lchToRgb,
  relLuminance,
  rgbToCielab,
  rgbToLch,
  separation,
  simulate,
  solveL,
  toHex,
} from './color.ts';
import { ALPHA, ALPHA_SEED, HOUSE, HIGH_CONTRAST, HOUSE_SEED } from './index.ts';
import { ACCENTS, recordTheme } from './record.ts';
import {
  BRAND_RED,
  hueGap,
  INKS,
  INTENTS,
  SURFACES,
  build,
  buildScheme,
  HOUSE_PROFILE,
  HIGH_CONTRAST_PROFILE,
  nextAccentHue,
  INTENT_HUE,
  parseColour,
  type Built,
  type Palette,
} from './build.ts';
import { checkElevation, checkForcedColors, checkScheme, refusals, validate } from './checks.ts';
import { toCSS, forcedColors } from './css.ts';

/* THE CLASSES THE RENDERER ACTUALLY EMITS, handed in rather than imported: the theme package
   has no workspace dependencies, and that is what makes it a seam. */
const FORCED = forcedColors(['panel', 'grid', 'rows', 'prop', 'inline', 'list', 'table', 'media']);

/* ── the arithmetic ───────────────────────────────────────────────────────── */

test('OKLCH round-trips through sRGB', () => {
  for (const hex of ['#F42A2A', '#407FDB', '#FFFFFF', '#000000', '#73D678']) {
    const back = toHex(lchToRgb(rgbToLch(fromHex(hex))));
    assert.equal(back, hex, `${hex} did not round-trip`);
  }
});

test('the BrainDog red sits on the danger hue anchor', () => {
  // The coincidence the whole palette is built on, and it survived the mark being toned down:
  // #F42A2A and #CF413A are the same hue, one is simply louder.
  for (const red of [BRAND_RED, '#F42A2A']) {
    const c = rgbToLch(fromHex(red));
    assert.ok(Math.abs(c.H - INTENT_HUE.danger) < 1.5, `${red} is hue ${c.H.toFixed(1)}, not 27`);
    assert.ok(c.C > 0.15, `${red} should still be a saturated colour`);
  }
});

test('contrast matches the WCAG definition at the extremes', () => {
  assert.equal(Math.round(contrast(fromHex('#FFFFFF'), fromHex('#000000'))), 21);
  assert.equal(contrast(fromHex('#777777'), fromHex('#777777')), 1);
});

test('gamut mapping brings an unrepresentable colour inside sRGB', () => {
  // Measured in Chrome 152: oklch(0.70 0.30 30), 0.40 and 0.50 all paint as rgb(255,0,0), and the
  // CSSOM returns the authored string at every chroma. The generator must map, never let the
  // browser clip (28 §2.1).
  const wild = { L: 0.7, C: 0.5, H: 30 };
  assert.equal(inGamut(lchToRgb(wild)), false);
  const mapped = gamutMap(wild);
  assert.equal(inGamut(lchToRgb(mapped)), true);
  assert.ok(mapped.C < wild.C && mapped.C > 0.1, 'chroma should be reduced, not discarded');
  assert.equal(mapped.L, wild.L, 'lightness is preserved — clipping is what does not preserve it');
});

test('solveL hits its contrast target on the quantised colour', () => {
  const ground = fromHex('#241F1E');
  for (const target of [3, 4.5, 7, 12]) {
    const got = contrast(fromHex(toHex(lchToRgb(solveL(target, 0.018, 27, ground, 'up')))), ground);
    assert.ok(got >= target - 0.02, `asked ${target}, got ${got.toFixed(2)}`);
    assert.ok(got <= target + 0.25, `asked ${target}, overshot to ${got.toFixed(2)}`);
  }
});

test('delta-E 2000 is zero for a colour against itself and grows with distance', () => {
  const a = rgbToCielab(fromHex('#F42A2A'));
  const b = rgbToCielab(fromHex('#F42A2C'));
  const c = rgbToCielab(fromHex('#00A32B'));
  assert.equal(deltaE2000(a, a), 0);
  assert.ok(deltaE2000(a, b) < 1, 'two adjacent reds are below a just-noticeable difference');
  assert.ok(deltaE2000(a, c) > 40, 'red and green are far apart to a trichromat');
});

test('Brettel simulation collapses red and green for a deuteranope', () => {
  const red = fromHex('#F42A2A');
  const green = fromHex('#00A32B');
  assert.ok(
    separation(red, green, 'deutan') < deltaE2000(rgbToCielab(red), rgbToCielab(green)),
    'simulation must reduce the distance, not preserve it',
  );
  // The measurement 13 §2.3 was built on: to a deuteranope these are close to the same olive.
  assert.ok(simulate(red, 'deutan').g > red.g, 'red gains green under deuteranope simulation');
});

test('APCA reports a polarity-aware score and WCAG does not', () => {
  const light = fromHex('#FFFFFF');
  const dark = fromHex('#111111');
  assert.equal(contrast(light, dark), contrast(dark, light));
  assert.notEqual(apcaLc(light, dark), apcaLc(dark, light));
});

/* ── the generated themes ─────────────────────────────────────────────────── */

for (const built of [HOUSE, HIGH_CONTRAST]) {
  test(`theme.${built.id} passes its own sixteen checks`, () => {
    const bad = refusals(validate(built, toCSS(HOUSE, HIGH_CONTRAST) + FORCED));
    assert.deepEqual(
      bad.map((f) => f.fix),
      [],
    );
  });

  for (const scheme of ['dark', 'light'] as const) {
    test(`theme.${built.id} ${scheme}: the surface ladder only goes up`, () => {
      const lum = SURFACES.map((s) => relLuminance(parseColour(built.schemes[scheme][s])));
      for (let i = 1; i < lum.length; i++)
        assert.ok(lum[i]! > lum[i - 1]!, `${SURFACES[i]} is not above ${SURFACES[i - 1]}`);
    });

    test(`theme.${built.id} ${scheme}: no intent is achromatic`, () => {
      for (const intent of INTENTS)
        assert.ok(
          rgbToLch(parseColour(built.schemes[scheme][intent])).C >= 0.045,
          `${intent} has no hue left — it is ink, not an intent`,
        );
    });

    test(`theme.${built.id} ${scheme}: every ink clears AA on every surface`, () => {
      for (const ink of INKS)
        for (const surface of SURFACES) {
          const got = contrast(parseColour(built.schemes[scheme][ink]), parseColour(built.schemes[scheme][surface]));
          assert.ok(got >= 4.5, `${ink} on ${surface} is ${got.toFixed(2)}:1`);
        }
    });
  }
}

test('the alarm is louder than the brand it shares a hue with', () => {
  // The mark and `danger` are the same hue on purpose, so the ONE thing that has to stay true is
  // that the overdue chip out-shouts the accent. It is arranged in the profile (`fillChroma` sits
  // above the seed's chroma), not hoped for, and this is where that arrangement is held.
  for (const scheme of ['dark', 'light'] as const) {
    const chip = rgbToLch(parseColour(HOUSE.schemes[scheme]['danger-fill']));
    const mark = rgbToLch(parseColour(BRAND_RED));
    assert.ok(chip.C > mark.C, `in ${scheme} the chip is ${chip.C.toFixed(3)} chroma, the mark ${mark.C.toFixed(3)}`);
  }
  // And in dark it lands on the product's original fire-engine red, which is where that value went.
  assert.ok(
    deltaE2000(rgbToCielab(parseColour(HOUSE.schemes.dark['danger-fill'])), rgbToCielab(fromHex('#F42A2A'))) < 1,
    `the dark chip is ${HOUSE.schemes.dark['danger-fill']}`,
  );
});

/* ── the refusals, which are the point ────────────────────────────────────── */

test('an achromatic seed is refused, not silently substituted', () => {
  assert.throws(
    () => buildScheme({ ...HOUSE_SEED, accent: '#808080' }, HOUSE_PROFILE, 'dark'),
    /almost grey/,
  );
});

test('the accent is in the brand red family, and is not the alarm', () => {
  // 2026-09-16, the owner's call, reversing the indigo: production's accent is reddish again. What
  // keeps it from reading as a warning is held here. It sits within 45 degrees of the mark, at least
  // 15 degrees cooler than `danger`, and under the chroma of the `danger` chip, so the alarm stays a
  // step more insistent than the brand it shares a family with. Neither is ever colour alone.
  //
  // THE CEILING USED TO BE `mark.C` AND IT WAS THE REASON THE BRAND WAS THE PALEST THING ON SCREEN.
  // `BRAND_RED` is a constant that paints nothing: since the September ruling the mark IS the accent
  // (`theme.mjs` emits `brand(HOUSE.schemes.light.accent)`), so this compared the accent to a colour
  // no longer in the product and capped it at 0.180. What shipped under that cap was 0.150, quieter
  // than `danger` at 0.160, which is the opposite of what the paragraph above says it is for. The
  // `danger` chip is 0.233 by construction (`fillChroma`), so it is the ceiling the sentence meant.
  // The hue gap to the mark still uses `BRAND_RED`, which is correct: that is the angle alpha steers
  // away from, and it is a direction rather than a colour anybody draws.
  const mark = rgbToLch(parseColour(BRAND_RED));
  for (const scheme of ['dark', 'light'] as const) {
    const accent = rgbToLch(parseColour(HOUSE.schemes[scheme].accent));
    const danger = rgbToLch(parseColour(HOUSE.schemes[scheme].danger));
    assert.ok(hueGap(accent.H, mark.H) <= 45, `the ${scheme} accent is ${hueGap(accent.H, mark.H).toFixed(0)} degrees from the mark`);
    assert.ok(hueGap(accent.H, danger.H) >= 15, `the ${scheme} accent is ${hueGap(accent.H, danger.H).toFixed(0)} degrees from danger`);
    const fill = rgbToLch(parseColour(HOUSE.schemes[scheme]['danger-fill']));
    assert.ok(accent.C < fill.C, `the ${scheme} accent is as saturated as the danger chip`);
  }
});

test('the four intent words stay separable with a red accent beside them', () => {
  // The accent is NOT one of the four — it is chrome, and never a row's verdict — so what has to
  // hold is that the four words are separable among themselves, `info` included.
  for (const scheme of ['dark', 'light'] as const) {
    const p = HOUSE.schemes[scheme];
    const four = INTENTS.map((k) => p[k]);
    for (let i = 0; i < four.length; i++)
      for (let j = i + 1; j < four.length; j++)
        for (const d of ['protan', 'deutan', 'tritan'] as const) {
          const de = separation(parseColour(four[i]!), parseColour(four[j]!), d);
          assert.ok(de >= 10, `${INTENTS[i]} and ${INTENTS[j]} are ${de.toFixed(1)} apart to a ${d}ope in ${scheme}`);
        }
  }
});

test('a value outside the dialect grammar is refused', () => {
  assert.throws(() => parseColour('rgb(1 2 3)'), /THEME_VALUE_INVALID/);
  assert.throws(() => parseColour('var(--x)'), /THEME_VALUE_INVALID/);
});

/* ── identity accents ─────────────────────────────────────────────────────── */

test('an identity hue never lands within 20 degrees of an intent', () => {
  const hues: number[] = [];
  for (let i = 0; i < 8; i++) hues.push(nextAccentHue(hues));
  const gap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
  for (const h of hues)
    for (const anchor of Object.values(INTENT_HUE))
      assert.ok(gap(h, anchor) >= 20, `hue ${h} is ${gap(h, anchor).toFixed(0)} from an intent anchor`);
});

test('the first four identity hues stay apart under every simulation', () => {
  const hues: number[] = [];
  for (let i = 0; i < 4; i++) hues.push(nextAccentHue(hues));
  const marks = hues.map((h) => parseColour(`oklch(${HOUSE.mark.dark.L} ${HOUSE.mark.dark.C} ${h})`));
  for (let i = 0; i < marks.length; i++)
    for (let j = i + 1; j < marks.length; j++)
      for (const d of ['protan', 'deutan', 'tritan'] as const)
        assert.ok(separation(marks[i]!, marks[j]!, d) >= 4, `marks ${i} and ${j} collapse for a ${d}ope`);
});

/* ── the emitted stylesheet ───────────────────────────────────────────────── */

test('the stylesheet emits both schemes and cannot reach the a11y layer', () => {
  const css = toCSS(HOUSE, HIGH_CONTRAST);
  assert.match(css, /@layer theme \{/);
  assert.match(css, /prefers-color-scheme: dark/);
  assert.match(css, /prefers-contrast: more/);
  assert.doesNotMatch(css, /@layer a11y/);
  assert.doesNotMatch(css, /:focus-visible/);
  for (const banned of ['url(', '@import', 'expression(']) assert.ok(!css.includes(banned));
});

test('the forced-colors block restores every boundary the ladder loses', () => {
  // Under forced-colors the five surfaces all become Canvas and box-shadow computes to none, so a
  // five-level ladder becomes one level and every block boundary disappears (28 §2.5).
  assert.match(FORCED, /CanvasText/);
  assert.match(FORCED, /forced-color-adjust: none/);
});

/* ── a control is a component, in every state it has ─────────────────────── */

test('THE BOUNDARY OF A FILLED CONTROL CLEARS 3:1 ON EVERY SURFACE', () => {
  // The button's own comment said a border is what makes an accent fill legal under SC 1.4.11, and
  // then drew that border as `color-mix(in srgb, var(--accent) 72%, var(--sunk))` — one formula
  // doing opposite things in the two schemes. Measured: 1.91:1 against `s3` in dark at rest and
  // 1.33:1 on hover, while the fill it was meant to rescue was 2.88:1. The boundary was the
  // failing part.
  for (const built of [HOUSE, HIGH_CONTRAST])
    for (const scheme of ['dark', 'light'] as const) {
      const p = built.schemes[scheme];
      for (const surface of SURFACES) {
        const c = contrast(fromHex(p['accent-edge']), fromHex(p[surface]));
        assert.ok(c >= 3, `${built.id} ${scheme}: accent-edge is ${c.toFixed(2)}:1 on ${surface}`);
      }
    }
});

test('and it stays in the accent’s hue, so a primary control is one shape', () => {
  // The fallback is the neutral `edge`, which is legal and grey. Taking it silently would turn every
  // primary button into a fill inside a grey outline, so the test says which one was used.
  for (const scheme of ['dark', 'light'] as const) {
    const p = HOUSE.schemes[scheme];
    const gap = Math.abs(rgbToLch(fromHex(p['accent-edge'])).H - rgbToLch(fromHex(p.accent)).H);
    assert.ok(Math.min(gap, 360 - gap) < 5, `${scheme}: the accent edge fell back to the neutral one`);
  }
});

test('every accent state clears 4.5:1 against its own label', () => {
  // Solved in the generator and, until check Q, never checked afterwards — which is how the version
  // before it measured 4.16:1 at the moment somebody presses the control, in one scheme only.
  for (const built of [HOUSE, HIGH_CONTRAST])
    for (const scheme of ['dark', 'light'] as const) {
      const p = built.schemes[scheme];
      for (const role of ['accent', 'accent-hover', 'accent-press'] as const) {
        const c = contrast(fromHex(p[role]), fromHex(p['accent-ink']));
        assert.ok(c >= 4.5, `${built.id} ${scheme}: ${role} is ${c.toFixed(2)}:1 against its label`);
      }
    }
});

test('and the checks would SAY so — a floor nothing measures is not a floor', () => {
  // Both roles poked below their floor, so the two new assertions are held by the gate and not only
  // by this file. `accent-edge` answers to D, the interaction states to Q.
  const css = toCSS(HOUSE, HIGH_CONTRAST) + FORCED;
  assert.equal(refusals(validate(HOUSE, css)).length, 0, 'the house theme does not pass its own checks');

  const broken = {
    ...HOUSE,
    schemes: {
      ...HOUSE.schemes,
      dark: { ...HOUSE.schemes.dark, 'accent-edge': HOUSE.schemes.dark.s3, 'accent-press': HOUSE.schemes.dark['accent-ink'] },
    },
  };
  const found = refusals(validate(broken, css));
  assert.ok(found.some((f) => f.check === 'D'), 'an invisible control boundary was not refused');
  assert.ok(found.some((f) => f.check === 'Q'), 'a control that matches its own label was not refused');
});

/* ── the shape of the result, and not only its refusals ─────────────────── */

test('EVERY CHECK REPORTS, PASS OR FAIL: 104 rows per scheme, counted here and nowhere quoted', () => {
  /**
   * 39 §6.1 SPECIFIED 90 RESULTS PER SCHEME AND THE CODE RETURNED 6 IN DARK AND 4 IN LIGHT.
   *
   * Nothing asserted either number, which is the whole of how they came to sit that far apart: the
   * checks pushed a row only when something failed, so a passing theme produced an almost empty
   * result and a deleted check produced the same almost empty result. A validator silent on a
   * passing check cannot report that the check stopped running.
   *
   * SO THE NUMBER IS COUNTED RATHER THAN COPIED. 90 was never implemented and therefore has no
   * authority; the arithmetic below is the eighteen checks as they are written, and it lands on
   * 104. The table is spelled out per letter so that a change to any one check has to be argued for
   * here, in the same commit, instead of quietly moving a total.
   */
  const PER_CHECK: Record<string, number> = {
    A: 15, // three inks that are not `faint`, each on five surfaces
    B: 5, //  `accent-text` on five surfaces
    C: 5, //  `faint` on five surfaces
    D: 30, // `edge` and `accent-edge` and four `-fill` roles, each on five surfaces
    E: 6, //  the two ring tones against each other, then `focus-in` on five surfaces
    F: 1, //  one summary row carrying the worst separation over the six intent pairs
    G: 20, // four intents as text, each on five surfaces
    H: 4, //  four rungs of the five-surface ladder
    J: 1, //  one row for the palette: the most chroma any role gave up to the gamut
    K: 2, //  a link against body ink, and against `danger`
    M: 1, //  `line` against `edge`
    N: 4, //  the APCA advisory, one row per ink
    O: 1, //  one row for the palette: every value is shaped like a colour
    P: 1, //  one row for the palette: no value holds a banned token
    Q: 3, //  the control fill against its own label, at rest and on hover and on press
    R: 5, //  the accent fill against the five surfaces it can be painted on
  };
  const PER_SCHEME = Object.values(PER_CHECK).reduce((a, b) => a + b, 0);
  assert.equal(PER_SCHEME, 104, 'the per-letter table no longer sums to the number the checks report');

  for (const built of [HOUSE, HIGH_CONTRAST])
    for (const scheme of ['dark', 'light'] as const) {
      const found = checkScheme(built, scheme);
      const byCheck: Record<string, number> = {};
      for (const f of found) byCheck[f.check] = (byCheck[f.check] ?? 0) + 1;
      assert.deepEqual(byCheck, PER_CHECK, `${built.id} ${scheme} did not report the checks it ran`);
      assert.equal(found.length, PER_SCHEME, `${built.id} ${scheme} returned ${found.length} results, not ${PER_SCHEME}`);
      assert.equal(refusals(found).length, 0, `${built.id} ${scheme} refuses a theme this package ships`);
    }

  /* AND THE WHOLE VALIDATOR IS THE TWO SCHEMES PLUS THREE. `checkElevation` answers once per
     scheme and `checkForcedColors` once for the document, so `validate` is 99 + 99 + 2 + 1. */
  const whole = validate(HOUSE, toCSS(HOUSE, HIGH_CONTRAST) + FORCED);
  assert.equal(whole.length, PER_SCHEME * 2 + 3, `validate returned ${whole.length} results`);

  /* THE POINT OF ALL OF IT: a letter that goes missing is now visible in the output. */
  const spoke = new Set(whole.map((f) => f.check));
  for (const letter of 'ABCDEFGHIJKLMNOPQR')
    assert.ok(spoke.has(letter), `check ${letter} said nothing at all, so nothing can tell it apart from a deleted check`);
});

/* ── the checks that could not fail ──────────────────────────────────────── */

test('CHECK I MEASURES THE LADDER THAT VARIES, which is the alpha and not the pixels', () => {
  /* It took the largest `\d+px` of each shadow, and those are literals in the generator — 2, 14, 40,
     the same three in every theme there will ever be — so it compared `2 < 14 < 40` and could not
     fail. Inverting the light scheme's opacities visibly turns the ladder back on itself. */
  const inverted: Built = {
    ...HOUSE,
    elevation: {
      ...HOUSE.elevation,
      light: ['0 1px 2px rgb(0 0 0 / 0.9)', '0 2px 4px rgb(0 0 0 / 0.5)', '0 4px 8px rgb(0 0 0 / 0.01)'],
    },
  };
  const found = refusals(checkElevation(inverted));
  assert.equal(found.length, 2, 'a ladder that goes down was reported as going up');
  assert.match(found[0]?.fix ?? '', /not above/);
});

test('and the house ladder still goes up, in both schemes', () => {
  assert.deepEqual(refusals(checkElevation(HOUSE)), []);
});

test('CHECK F KNOWS THE HUE FLOOR, which only the generator knew', () => {
  /* Two intents within twenty degrees are the same colour to a reader whatever their delta-E says,
     because delta-E 2000 counts lightness and a pale tint of a hue measures far from it. The
     generator refuses that palette and the validator accepted it — so a third-party theme was
     installable on exactly the palette this package will not produce. */
  const built = build({ ...HOUSE.seed }, HOUSE_PROFILE, 'twins');
  const twinned: Built = {
    ...built,
    schemes: {
      ...built.schemes,
      dark: { ...built.schemes.dark, info: built.schemes.dark.danger },
    },
  };
  const found = refusals(checkScheme(twinned, 'dark')).filter((f) => f.check === 'F');
  assert.ok(found.length > 0, 'two intents of one hue passed the separability check');
  assert.match(found[0]?.fix ?? '', /of hue apart/);
});

test('CHECK L IS ABOUT THE DOCUMENT, and the caller cannot hand in the thing being looked for', () => {
  // `validate` took `css` optionally, and the only validation CI ran passed none — so L was skipped
  // entirely. `''` is falsy, which meant an empty stylesheet passed too.
  const bare = refusals(validate(HOUSE, toCSS(HOUSE, HIGH_CONTRAST)));
  assert.ok(bare.some((f) => f.check === 'L'), 'a stylesheet with no forced-colors block passed');
  assert.ok(refusals(validate(HOUSE, '')).some((f) => f.check === 'L'), 'an empty stylesheet passed');
});

test('AND THE HIGH-CONTRAST PROFILE IS CHECKED AT ITS OWN FLOORS', () => {
  /* `Built.profile` was a string id, so the validator structurally could not read them — and every
     floor was hard-coded at the house's AA value. A regression dropping high-contrast `edge` from
     4.5 to 3.1 was refused by nothing, in the one theme that exists for readers who need the most
     help. */
  assert.equal(HIGH_CONTRAST.profile.edge, 4.5);
  assert.equal(HIGH_CONTRAST.profile.ink[0], 16);
  assert.equal(HOUSE.profile.edge, 3);

  const weakened: Built = {
    ...HIGH_CONTRAST,
    schemes: { ...HIGH_CONTRAST.schemes, dark: { ...HIGH_CONTRAST.schemes.dark, edge: HOUSE.schemes.dark.edge } },
  };
  const found = refusals(checkScheme(weakened, 'dark')).filter((f) => f.check === 'D');
  assert.ok(found.length > 0, 'the house edge passed the high-contrast floor');
});

test('CHECK J CAN FAIL, which is more than either of its previous forms could', () => {
  /* It asked whether a hex was inside sRGB — `quantise` clamps and `fromHex` divides by 255, so the
     answer is yes for all 65,536 of them. Then it asked whether the hex round-tripped through OKLab,
     which is an exact analytic inverse: yes again. The question with an answer is how much chroma
     the gamut mapper had to take off, and only the mapper knows, at the moment it does it. */
  const built = build(HOUSE_SEED, HOUSE_PROFILE, 'clipped');
  const wild: Built = {
    ...built,
    schemes: { ...built.schemes, dark: { ...built.schemes.dark, accent: '#FF0000' } },
    clipped: { ...built.clipped, dark: { ...built.clipped.dark, accent: 0.09 } },
  };
  const found = refusals(checkScheme(wild, 'dark')).filter((f) => f.check === 'J');
  assert.equal(found.length, 1, 'a role that lost most of its chroma passed');
  assert.match(found[0]?.fix ?? '', /gave up 0\.090 of chroma/);
});

test('and a near-white surface giving up almost all of its chroma does NOT fail', () => {
  // L 0.999 carries 0.014 and keeps 0.004: 72% lost and correctly so, because near white there is
  // almost no chroma to have. As a fraction that reads as a catastrophe; as an amount it is 0.010.
  assert.deepEqual(refusals(checkScheme(HOUSE, 'light')).filter((f) => f.check === 'J'), []);
  assert.ok((HOUSE.clipped.light.s3 ?? 0) > 0, 'the fixture must actually clip there for this to mean anything');
});

/* ── the address the check already knew ──────────────────────────────────── */

/**
 * `39 §6.2` gives all four theme codes an `at` and `checks.ts` carried none, so three fixtures named
 * an address the validator had no concept of. Every one of these checks knows the token at the
 * moment it fails and was flattening it into a sentence.
 *
 * THE RULE IS 39 §6.2'S: the address is `theme.<id>.roles.<scheme>.<the role the fix moves>`, which
 * is a real path into the document a theme author sends (`declare.ts`'s `themeBody` reads `seed`
 * and `roles`), and a check with no such token carries none rather than inventing one.
 */
const ADDRESS = /^theme\.[a-z0-9-]+\.roles\.(dark|light)\.[a-z0-9-]+$/;

test('A CONTRAST FLOOR POINTS AT THE ROLE THAT MOVES, not at the ground it sits on', () => {
  const broken: Built = {
    ...HOUSE,
    schemes: { ...HOUSE.schemes, dark: { ...HOUSE.schemes.dark, ink: HOUSE.schemes.dark.bg } },
  };
  const found = refusals(checkScheme(broken, 'dark')).filter((f) => f.check === 'A');
  assert.ok(found.length > 0, 'ink painted onto the page was not refused');
  assert.deepEqual([...new Set(found.map((f) => f.at))], [`theme.${HOUSE.id}.roles.dark.ink`]);
});

test('AN INSEPARABLE PAIR POINTS AT THE FIRST OF IT, because one `at` cannot hold two', () => {
  const built = build({ ...HOUSE.seed }, HOUSE_PROFILE, 'twins');
  const twinned: Built = {
    ...built,
    schemes: { ...built.schemes, dark: { ...built.schemes.dark, info: built.schemes.dark.danger } },
  };
  const found = refusals(checkScheme(twinned, 'dark')).filter((f) => f.check === 'F');
  assert.ok(found.length > 0, 'two intents of one hue passed the separability check');
  assert.deepEqual([...new Set(found.map((f) => f.at))], ['theme.twins.roles.dark.danger']);
});

test('A LADDER THAT TURNS BACK POINTS AT THE RUNG IT TURNS AT', () => {
  const flat: Built = {
    ...HOUSE,
    schemes: { ...HOUSE.schemes, dark: { ...HOUSE.schemes.dark, s2: HOUSE.schemes.dark.s1 } },
  };
  const found = refusals(checkScheme(flat, 'dark')).filter((f) => f.check === 'H');
  assert.equal(found.length, 1, 'a ladder that stops climbing produced the wrong number of findings');
  assert.equal(found[0]?.at, `theme.${HOUSE.id}.roles.dark.s2`);
});

test('AND THE TWO CHECKS WITH NOWHERE TO POINT CARRY NO ADDRESS AT ALL', () => {
  /* Elevation is generated and the dialect has no `shadow` or `elevation` key (39 §13 D9), so I is
     about a ladder the caller never sent. L is about the stylesheet as a whole document. `41 §6`
     makes carrying none legal, and inventing one here is what the fixture format used to compel. */
  const inverted: Built = {
    ...HOUSE,
    elevation: {
      ...HOUSE.elevation,
      light: ['0 1px 2px rgb(0 0 0 / 0.9)', '0 2px 4px rgb(0 0 0 / 0.5)', '0 4px 8px rgb(0 0 0 / 0.01)'],
    },
  };
  const ladder = refusals(checkElevation(inverted));
  assert.ok(ladder.length > 0, 'the inverted ladder was not refused');
  for (const f of ladder) assert.equal(f.at, undefined, 'check I addressed a key the dialect has not got');
  for (const f of refusals(checkForcedColors(''))) assert.equal(f.at, undefined, 'check L addressed a role');
});

test('AND NO CHECK OVER A PALETTE FLATTENS ITS TOKEN AWAY', () => {
  /* Every role in turn painted the colour of the page, which is the cheapest way to make a check
     fail without choosing which check. Whatever refuses must say where. */
  const roles = Object.keys(HOUSE.schemes.dark);
  const provoked = new Set<string>();
  for (const role of roles) {
    const broken: Built = {
      ...HOUSE,
      schemes: { ...HOUSE.schemes, dark: { ...HOUSE.schemes.dark, [role]: HOUSE.schemes.dark.bg } as Palette },
    };
    for (const f of refusals(checkScheme(broken, 'dark'))) {
      provoked.add(f.check);
      assert.match(f.at ?? '', ADDRESS, `check ${f.check} refused over ${role} and pointed at nothing`);
      assert.ok(f.at?.includes(`.roles.${f.scheme}.`), `${f.at} names a scheme the finding is not about`);
      assert.ok(roles.includes(f.at?.split('.').pop() ?? ''), `${f.at} is not a role of the palette`);
    }
  }
  assert.ok(provoked.size >= 4, `only ${[...provoked].join(', ')} were provoked, which is too few to mean much`);
});

/* ── a suggested colour is a suggestion ──────────────────────────────────── */

test('no suggested accent is the house colour, and none is a duplicate of another', () => {
  /**
   * `ACCENTS[0]` WAS `#CF413A` AND SO IS `BRAND_RED`.
   *
   * Seven controls in a row, of which two were one choice, at opposite ends, with two different
   * toasts — and the one calling itself "Brick" reported *"Brick is this record's colour"*, wrote the
   * preference, built an adopted stylesheet, and produced **zero pixels of difference**: a diff of
   * 25 palette tokens across a register found every one identical but for hex casing.
   *
   * A control that reports success and changes nothing is this codebase's signature defect, and it
   * had reached the one screen whose entire subject is visible change. The House control beside the
   * swatches is how somebody chooses the house colour; a suggestion that is already the default is
   * not a suggestion.
   */
  const house = BRAND_RED.toUpperCase();
  for (const a of ACCENTS)
    assert.notEqual(a.hex.toUpperCase(), house, `${a.name} is the house colour, so choosing it changes nothing`);

  const seen = new Set(ACCENTS.map((a) => a.hex.toUpperCase()));
  assert.equal(seen.size, ACCENTS.length, 'two suggested accents are the same colour');
  assert.ok(ACCENTS.length >= 4, 'too few suggestions to be a row of choices');
});

test('A SUGGESTED ACCENT CAN BE SEEN AGAINST THE SURFACE IT IS PAINTED ON, IN BOTH SCHEMES', () => {
  /**
   * `ACCENTS`' OWN NOTE SAID THE WINDOW HAD BEEN WORKED THROUGH, AND ONLY HALF OF IT HAD.
   *
   * The sentence was "dark enough to hold a 3:1 boundary against cream", and cream is the LIGHT
   * scheme. Nobody measured the other one. `--accent` is painted as an opaque colour a reader has
   * to see against a surface in 20 declarations, 14 of them a control's own fill or a border in
   * the accent's own colour, the checked switch track among them (`controls.css` sets `background`
   * and `border-color` to it in one rule), so SC 1.4.11 asks 3:1 of the fill itself against
   * whichever surface it lands on. `ACCENTS`' own note carries the recount. Measured on the record
   * ladder before this test existed, against the worst of the five surfaces over both profiles and
   * both schemes: Ink blue 1.92, Plum 2.15, Teal 2.41, Moss 2.47. Four of the five suggestions the
   * product offers a customer produced a checked switch, a selected tile and a chosen cell that
   * are invisible in the dark scheme, and every one of them was accepted by `recordTheme` with
   * zero refusals, because no check in this package measured `accent` against a surface at all:
   * check D read `edge` and `accent-edge`, check B read `accent-text`, check Q read the accent
   * against its own label, and the fill itself was measured by nothing. Check R is that
   * measurement, and the test below is the one that holds it for a colour nobody wrote down.
   *
   * THE HOUSE ACCENT IS IN THE LIST BECAUSE IT IS THE PROOF THE WINDOW EXISTS. #D72065 measures
   * 3.04 at its worst, which is the whole of the headroom there is: one colour has to clear 3:1
   * against a near-black at L 0.244 and against a near-white at L 0.999, and the band that does
   * both is narrow and centred near L 0.57. A suggestion under it is not a taste call.
   */
  const worstFill = (accent: string, neutralHue: number) => {
    let worst = Infinity;
    let where = '';
    for (const profile of [HOUSE_PROFILE, HIGH_CONTRAST_PROFILE])
      for (const scheme of ['dark', 'light'] as const) {
        const p = buildScheme({ ...HOUSE_SEED, accent, neutralHue }, profile, scheme);
        for (const surface of SURFACES) {
          const got = contrast(parseColour(p.accent), parseColour(p[surface]));
          if (got < worst) {
            worst = got;
            where = `${profile.id} ${scheme} on ${surface}`;
          }
        }
      }
    return { worst, where };
  };

  /* The house seed's own neutral hue for the house accent, and `recordTheme`'s default of 110 for
     the suggestions, because that is the ladder each is actually solved against.

     AND THE ALPHA ACCENT, WHICH IS THE ONE ACCENT IN THIS TREE NOBODY TYPED. `ALPHA_SEED` moves the
     house hue to whatever `nextAccentHue` scores farthest (`environment.ts` calls it DETERMINISTIC
     AND COMPUTED, NOT PINNED, so that improving the scorer moves it), and `alpha.brain.dog` is
     painted with the result. A list of written-down constants cannot hold a value that is derived:
     it measured 3.140 the day this line was added, 0.14 above the floor, and the next change to the
     scorer is free to spend that without anybody reading a diff of colours. */
  const cases: [string, string, number][] = [
    ['the house accent', HOUSE.schemes.light.accent, HOUSE_SEED.neutralHue as number],
    ['the alpha accent', ALPHA.schemes.light.accent, ALPHA_SEED.neutralHue as number],
    ...ACCENTS.map((a) => [a.name, a.hex, 110] as [string, string, number]),
  ];
  for (const [name, accent, neutralHue] of cases) {
    const { worst, where } = worstFill(accent, neutralHue);
    assert.ok(worst >= 3, `${name} (${accent}) is ${worst.toFixed(2)}:1 as a fill, ${where}. A component boundary needs 3:1.`);
  }
});

test('AND THE VALIDATOR REFUSES ONE, because a floor asserted over five constants is a fact about five constants', () => {
  /**
   * THE FIVE SUGGESTIONS WERE MOVED AND `recordTheme` WAS LEFT EXACTLY AS IT WAS FOUND.
   *
   * Measured the day after that shipped, before check R existed: `recordTheme('#1B4FA8')`,
   * `('#8A3E7A')`, `('#0F6C77')` and `('#2F6F4E')` each came back `ok: true` with an empty refusal
   * list, at 1.92, 2.15, 2.41 and 2.47 against `house dark s3`. Those are the same four ratios the
   * suggestion list was rewritten to escape. The test above held the five colours somebody had
   * already fixed by hand; nothing held a sixth colour, and the reachable surface is not the five:
   * `apply()` in `apps/web/src/lib/accent.ts` is exported and takes any hex, and `restore()`
   * re-applies whatever the preference holds without re-deriving it from the list.
   *
   * SO THE FLOOR MOVED INTO THE VALIDATOR AND THIS TEST WATCHES IT FROM OUTSIDE. `recordTheme` is
   * the door every customer colour comes through, and it is the answer that has to change, not a
   * list of literals.
   */
  for (const [name, hex, was, way] of [
    ['Ink blue', '#1B4FA8', '1.92:1 in the dark', 'lighter'],
    ['Plum', '#8A3E7A', '2.15:1 in the dark', 'lighter'],
    ['Teal', '#0F6C77', '2.41:1 in the dark', 'lighter'],
    ['Moss', '#2F6F4E', '2.47:1 in the dark', 'lighter'],
    /* AND ONE FROM THE OTHER SIDE OF THE WINDOW, because a direction asserted only over colours
       that are all too dark is not a direction. This colour is the first thing in this file that
       fails check R and nothing else: `recordTheme('#7FD4FF')` comes back with ten sentences, all
       of them R's, at 1.38:1 against `house light sunk`. Measured: with the `>` in check R's own
       `goLighter` line flipped to `<`, the four above still refuse, still carry the code and still
       name a way to move, and the whole suite stayed green at 52 passes. So a `/lighter|darker/`
       match accepted advice that walks the colour further into the surface it vanished against,
       which is the one instruction this refusal exists to give. */
    ['a pale sky blue', '#7FD4FF', '1.38:1 in the light', 'darker'],
  ] as const) {
    const got = recordTheme(hex);
    assert.equal(got.ok, false, `${name} (${hex}) measures ${was} as a fill and was accepted anyway`);
    if (got.ok) continue;
    assert.ok(got.codes.includes('CONTRAST_FLOOR'), `${name} was refused without a code a caller can switch on`);
    /* AND THE SENTENCE HAS TO NAME THE MOVE, AND NAME IT THE RIGHT WAY ROUND, which is the whole
       reason this one is allowed to refuse at all. Every other refusal in `checks.ts` instructs a
       theme author; this one is read by somebody holding a colour picker, so "a lighter shade" is
       the difference between a refusal and a dead end, and the wrong one of the two is worse than
       silence. A colour outside the window is outside it on one side only, so every fill sentence
       a single colour produces has to point the same way. */
    const fill = got.refusals.filter((s) => s.includes('as a fill'));
    assert.ok(fill.length > 0, `${name}'s refusal never mentions the fill: ${got.refusals.join(' | ')}`);
    for (const said of fill)
      assert.ok(said.includes(`Pick a ${way} shade`), `${name} needs a ${way} shade and its refusal says otherwise: ${said}`);
  }

  /* AND EVERYTHING THIS PRODUCT ACTUALLY PAINTS STILL GOES IN. A check that refuses the shipped
     palettes is a check that will be deleted by the first person it inconveniences. */
  for (const a of ACCENTS) assert.equal(recordTheme(a.hex).ok, true, `${a.name} is a suggestion this product offers`);
  assert.equal(recordTheme(HOUSE.schemes.light.accent).ok, true, 'the house accent was refused by its own package');
  assert.equal(recordTheme(ALPHA.schemes.light.accent).ok, true, 'the alpha accent was refused');
});

/* ── the grammar's own rule ──────────────────────────────────────────────── */

test('THE COLOUR GRAMMAR REFUSES WHAT ITS OWN SENTENCE SAYS IT REFUSES', () => {
  /**
   * `parseColour`'s doc says `#RRGGBB`, `#RGB` or `oklch(L C H)`, and "No alpha (28 §1)". The `#`
   * branch tested the first character and handed the rest to a reader that slices at fixed
   * offsets, so `#ff0000ff` came back with the alpha silently dropped and `#12345` came back read
   * off the wrong boundaries. The sentence was the only place the rule existed.
   *
   * IT IS REACHABLE. The accent preference is re-applied from storage on every load, so a value
   * stored once by a looser build is a colour nobody chose, on every screen, for ever. And the
   * theme's own output check cannot see it: it reads the RE-SERIALISED colour, which is six clean
   * digits whatever went in.
   */
  for (const bad of ['#ff0000ff', '#12345', '#', '#zzzzzz', '#1234', '#f'])
    assert.throws(() => parseColour(bad), /THEME_VALUE_INVALID/u, `${bad} was accepted`);

  /* AND THE THREE SHAPES THE SENTENCE PUBLISHES STILL PARSE, so the check is about the rule rather
     than about being strict. */
  assert.deepEqual(parseColour('#ff0000'), parseColour('#f00'));
  assert.equal(typeof parseColour('oklch(0.5 0.1 200)').r, 'number');
});
