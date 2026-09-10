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
import { HOUSE, HIGH_CONTRAST, HOUSE_SEED } from './index.ts';
import { ACCENTS } from './record.ts';
import {
  BRAND_RED,
  hueGap,
  INKS,
  INTENTS,
  SURFACES,
  build,
  buildScheme,
  HOUSE_PROFILE,
  nextAccentHue,
  INTENT_HUE,
  parseColour,
  type Built,
} from './build.ts';
import { checkElevation, checkScheme, refusals, validate } from './checks.ts';
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

test('the accent is not the mark, and the mark is still the brand red', () => {
  // The reversal, held. The controls moved to an indigo because a red primary on every screen read
  // as an alarm; the logo did not move, and `theme.mjs` still paints it from `BRAND_RED`. If the
  // accent drifts back to the mark's hue this fails, and so does the danger-versus-brand test above
  // in spirit: red is meant to mean one thing.
  const mark = rgbToLch(parseColour(BRAND_RED));
  for (const scheme of ['dark', 'light'] as const) {
    const accent = rgbToLch(parseColour(HOUSE.schemes[scheme].accent));
    assert.ok(hueGap(accent.H, mark.H) >= 90, `the ${scheme} accent is ${hueGap(accent.H, mark.H).toFixed(0)} degrees from the mark`);
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
