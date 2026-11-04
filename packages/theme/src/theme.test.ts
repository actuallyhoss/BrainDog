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
  type Rgb,
} from './color.ts';
import { ALPHA, ALPHA_SEED, HOUSE, HIGH_CONTRAST, HOUSE_SEED } from './index.ts';
import { ACCENTS, recordTheme } from './record.ts';
import {
  BRAND_RED,
  FRAME_PAIRS,
  HOUSE_FRAME,
  type FrameRole,
  hueGap,
  INKS,
  INTENT_TEXT,
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
    /* The design system's shape: the ground is the lowest surface, the tile sits above it, and the
       steps inside a tile go away from the tile, up in dark and down in light, where the tile is white. */
    test(`theme.${built.id} ${scheme}: the ground is lowest and the steps inside a tile go one way`, () => {
      const lum = SURFACES.map((s) => relLuminance(parseColour(built.schemes[scheme][s])));
      for (let i = 1; i < lum.length; i++) assert.ok(lum[i]! > lum[0]!, `${SURFACES[i]} is not above the ground`);
      const away = scheme === 'dark' ? 1 : -1;
      for (let i = 2; i < lum.length; i++)
        assert.ok((lum[i]! - lum[i - 1]!) * away > 0, `${SURFACES[i]} does not step away from ${SURFACES[i - 1]}`);
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
    /**
     * THE FIFTEEN DEGREES ARE GONE, AT THE OWNER'S WORD ON 2026-09-21: *bring back our red accent, no
     * more of that purple color*. They were the reason the accent could not be red.
     *
     * `danger` is anchored on the mark's own hue, 27, so a floor of fifteen degrees put the accent at
     * hue 6 and hue 6 at this chroma is `#D72065`, a crimson that reads pink beside the logo. The rule
     * was solving the right problem in the wrong dimension, which this file's own §SIX already argues:
     * what keeps a red accent from reading as an alarm is that primary actions are drawn in ink, that an
     * error is a FILLED CHIP WITH A GLYPH rather than a hue, and that the accent is spent rarely. The
     * two references he named both run a red at 0.20 to 0.21 and neither reads as an error.
     *
     * WHAT IS ASSERTED INSTEAD IS THE THING THAT STILL HAS TO BE TRUE: the alarm stays a step more
     * insistent than the brand it shares a family with, which is the chroma line below, and neither is
     * ever colour alone, which `blocks.css` holds with a glyph. The accent is now the mark's own hue.
     */
    assert.ok(hueGap(accent.H, mark.H) <= 2, `the ${scheme} accent is ${hueGap(accent.H, mark.H).toFixed(0)} degrees off the mark, and it is meant to BE the mark`);
    const fill = rgbToLch(parseColour(HOUSE.schemes[scheme]['danger-fill']));
    assert.ok(accent.C < fill.C, `the ${scheme} accent is as saturated as the danger chip`);
  }
});

test('the four intent words stay separable with a red accent beside them', () => {
  // The accent is NOT one of the four — it is chrome, and never a row's verdict — so what has to
  // hold is that the four words are separable among themselves, `info` included. Words, so red is
  // read as `danger-text` (`INTENT_TEXT`).
  for (const scheme of ['dark', 'light'] as const) {
    const p = HOUSE.schemes[scheme];
    const four = INTENTS.map((k) => p[INTENT_TEXT[k]]);
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

test('EVERY CHECK REPORTS, PASS OR FAIL: 324 rows per scheme, counted here and nowhere quoted', () => {
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
   * 119. The table is spelled out per letter so that a change to any one check has to be argued for
   * here, in the same commit, instead of quietly moving a total.
   *
   * 104 UNTIL 2026-09-29, when the design system's `live` arrived: `live-fill` is a mark and joins the four fills in D, and
   * `live` is read as text and joins the four intents in G. Five surfaces each, ten rows.
   *
   * 114 UNTIL 2026-10-02, when red split in two (`INTENT_TEXT`): its words became `danger-text`, which takes `danger`'s
   * place in F, G and K, and `danger` became red as a mark, which joins the fills in D. Five surfaces, five rows.
   *
   * 119 UNTIL 2026-10-07, when the board arrived: every pair measured on the five rungs is measured on
   * the board, the tile and the field too (`GROUNDS`), eight grounds where there were five, and check S holds the
   * working accent's twenty-five pairs.
   *
   * 204 UNTIL 2026-10-08, when the working accent went red: its words are a link too, so check K measures
   * `action-text` against body ink and red words as it does `accent-text`. Two rows; the second is the one pair K
   * reports and does not refuse (`K_EXEMPT`).
   *
   * 206 UNTIL 2026-10-20, when the frame arrived (the UI pass, SPEC 1): check T holds every name the stylesheet paints
   * with, one row for their shape, one per pair in `FRAME_PAIRS` and one for red words beside body ink.
   *
   * 292 UNTIL 2 NOV, when bars filled in their own colours and the chosen and the link got roles of their own
   * (`23213b002`, `fa3f844df`): eighteen rows for the eight slots' fills and warn's on the tile and the track, and
   * fourteen for the words on a chosen thing, a selection's words, a link on six grounds and the ticked box.
   */
  const PER_CHECK: Record<string, number> = {
    A: 24, // three inks that are not `faint`, each on eight grounds
    B: 8, //  `accent-text` on eight grounds
    C: 8, //  `faint` on eight grounds
    D: 64, // `edge`, `accent-edge`, five `-fill` roles (the four intents' and `live-fill`) and `danger`, each on eight grounds
    E: 9, //  the two ring tones against each other, then `focus-in` on eight grounds
    F: 1, //  one summary row carrying the worst separation over the six intent pairs
    G: 40, // the four intents as words (red's are `danger-text`) and `live`, each on eight grounds
    H: 4, //  four rungs of the five-surface ladder
    J: 1, //  one row for the palette: the most chroma any role gave up to the gamut
    K: 4, //  each link (`accent-text`, `action-text`) against body ink, and against red words, `danger-text`
    M: 1, //  `line` against `edge`
    N: 4, //  the APCA advisory, one row per ink
    O: 1, //  one row for the palette: every value is shaped like a colour
    P: 1, //  one row for the palette: no value holds a banned token
    Q: 3, //  the control fill against its own label, at rest and on hover and on press
    R: 8, //  the accent fill against the eight grounds it can be painted on
    S: 25, // the working accent: its label at rest and on hover, the fill on three grounds, its words on eight grounds
    //        and two tints, three inks and five state words on the first tint, and two inks on the second
    T: 118, // the frame: one row for the shape of its names, then its pairs (body text on nine grounds and a selection;
    //        second text on eight and a selection; quiet text on eight; good, warn and info each on five grounds, the
    //        red tint and their own tint; red as words on six and as a mark; the eight slots on the tile and their tint;
    //        the eight slots' fills and warn's on the tile and the track; three words on a chosen thing and two on a
    //        selection of one; a link on six grounds; the ticked box on two and its tick; the toast; the label on three fills; the fill on two grounds; the running dot on two; the ring on two; the
    //        off switch and its knob; the floating edge), then red words beside body ink
  };
  const PER_SCHEME = Object.values(PER_CHECK).reduce((a, b) => a + b, 0);
  assert.equal(PER_SCHEME, 324, 'the per-letter table no longer sums to the number the checks report');
  assert.equal(FRAME_PAIRS.length, 116, 'the frame holds a different number of pairs than the table above says');

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
     scheme and `checkForcedColors` once for the document, so `validate` is 204 + 204 + 2 + 1. */
  const whole = validate(HOUSE, toCSS(HOUSE, HIGH_CONTRAST) + FORCED);
  assert.equal(whole.length, PER_SCHEME * 2 + 3, `validate returned ${whole.length} results`);

  /* THE POINT OF ALL OF IT: a letter that goes missing is now visible in the output. */
  const spoke = new Set(whole.map((f) => f.check));
  for (const letter of 'ABCDEFGHIJKLMNOPQRST')
    assert.ok(spoke.has(letter), `check ${letter} said nothing at all, so nothing can tell it apart from a deleted check`);
});

/* ── the checks that could not fail ──────────────────────────────────────── */

test('CHECK I REFUSES A SHADOW, because nothing in the product casts one (SPEC 1.9)', () => {
  /* It held a ladder of shadows that only went up. There is no ladder now: every level is `none`, and a theme that
     brings a drop back is refused at each level that casts one. */
  const lifted: Built = {
    ...HOUSE,
    elevation: {
      ...HOUSE.elevation,
      light: ['none', '0 16px 40px -16px rgb(16 24 40 / 0.22)', '0 16px 40px -16px rgb(16 24 40 / 0.22)'],
    },
  };
  const found = refusals(checkElevation(lifted));
  assert.equal(found.length, 2, 'a level that casts a shadow was let through');
  assert.match(found[0]?.fix ?? '', /casts "0 16px/);
});

test('and the house casts nothing, in both schemes', () => {
  assert.deepEqual(refusals(checkElevation(HOUSE)), []);
  for (const scheme of ['dark', 'light'] as const) assert.deepEqual(HOUSE.elevation[scheme], ['none', 'none', 'none']);
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
      dark: { ...built.schemes.dark, info: built.schemes.dark['danger-text'] },
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
  // White carries none of the chroma it is asked for: all of it lost, and correctly so, because at white there is
  // no chroma to have. As a fraction that reads as a catastrophe; as an amount it is 0.005. The design system's house tile asks
  // for none, so the fixture is high contrast's, whose white tile asks for its ladder's 0.005.
  assert.deepEqual(refusals(checkScheme(HIGH_CONTRAST, 'light')).filter((f) => f.check === 'J'), []);
  assert.ok((HIGH_CONTRAST.clipped.light.bg ?? 0) > 0, 'the fixture must actually clip there for this to mean anything');
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
  /* Check F reads the four intents as words, so red is `danger-text`, and the address is that role: the one a theme
     author would move to tell the words apart. */
  const built = build({ ...HOUSE.seed }, HOUSE_PROFILE, 'twins');
  const twinned: Built = {
    ...built,
    schemes: { ...built.schemes, dark: { ...built.schemes.dark, info: built.schemes.dark['danger-text'] } },
  };
  const found = refusals(checkScheme(twinned, 'dark')).filter((f) => f.check === 'F');
  assert.ok(found.length > 0, 'two intents of one hue passed the separability check');
  assert.deepEqual([...new Set(found.map((f) => f.at))], ['theme.twins.roles.dark.danger-text']);
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
   * to see against a surface in the declarations `grep 'var(--accent' apps/web/src packages/skin`
   * finds, most of them a control's own fill or a border in the accent's own colour, so SC 1.4.11
   * asks 3:1 of the fill itself against
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
   * THE HOUSE ACCENT IS IN THE LIST BECAUSE IT IS THE PROOF THE WINDOW EXISTS. The shipped accent,
   * `oklch(0.575 0.215 27)`, which is `#DB2527`, measures 3.05 at its worst, on `s3` in dark, and
   * that is the whole of the headroom there is: one colour has to clear 3:1 against a near-black at
   * L 0.244 and against a near-white at L 0.999, and the band that does both is narrow and centred
   * near L 0.57. A suggestion under it is not a taste call.
   *
   * THIS PARAGRAPH NAMED `#D72065` UNTIL 21 SEPTEMBER, which was the accent until midday and is a
   * colour the product no longer holds. It measures 3.04 here, so the argument never moved, but a
   * comment that proves a window with a colour nobody ships is a comment a reader cannot check.
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
    /* `recordTheme`'s default is the house's own neutral hue since 2026-09-29, when it stopped being 110. */
    ...ACCENTS.map((a) => [a.name, a.hex, HOUSE_SEED.neutralHue as number] as [string, string, number]),
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

/* ── the design system's colours, as the generator lands them ─────────────── */

test('THE DESIGN SYSTEM LANDS EXACTLY WHEREVER THE FLOORS ALLOW IT', () => {
  /* Every exact value here is one no floor had to move. What is not here moved, and says why below.

     2026-10-02: light's ink-3 and red words aim where AA has room, and red's mark aims at the house mark (`SYSTEM_AIM`),
     so all three land exactly. Dark's ground, tile and the steps inside a tile are the product's own ladder now, widened
     under the design system's ceiling (`HOUSE_PROFILE.ladder`), and are pinned here as that.

     2026-10-06: light's ladder widened too, under the white tile, and its ground came down for room. Ink-2, ink-3, red
     words and green each aim a step darker to keep the room they had on the old ground (`SYSTEM_AIM`).

     2026-10-08: light red, as a mark and as words, is the deeper red #B3322C, a step under the working
     accent #CF413A, and it lands exactly. */
  const exact: Record<'light' | 'dark', Partial<Record<keyof Palette, string>>> = {
    light: {
      sunk: '#E4E6EB',
      bg: '#FFFFFF',
      s1: '#F2F4F7',
      s2: '#EBEDF1',
      s3: '#E4E7EB',
      ink: '#101114',
      ink2: '#3B4048',
      dim: '#626870',
      line: '#E3E5E9',
      earn: '#257548',
      'danger-text': '#B3322C',
      danger: '#B3322C',
      live: '#00773D',
    },
    dark: {
      sunk: '#030405',
      bg: '#141619',
      s1: '#1A1E25',
      s2: '#1F232A',
      s3: '#24282F',
      ink: '#EEF1F4',
      ink2: '#C3C8CF',
      dim: '#8F96A0',
      line: '#242A31',
      'danger-text': '#FF5A55',
      danger: '#FF5A55',
      live: '#31A15E',
    },
  };
  for (const scheme of ['light', 'dark'] as const)
    for (const [role, hex] of Object.entries(exact[scheme]))
      assert.equal(HOUSE.schemes[scheme][role as keyof Palette], hex, `${scheme} ${role}`);
});

test('AND WHERE IT CANNOT, THE ROLE SITS ON ITS FLOOR RATHER THAN UNDER IT', () => {
  /* High contrast starts from the same colours under higher floors, so its light ink-3 is darkened to its own floor on
     the ground, 9.5, and no further.

     2026-10-08: ITS RED MARK USED TO BE THE SECOND, darkened from the logo's #DB2527 to 4.5:1. The mark is the deeper red
     now, which clears high contrast's 4.5 on its ground as it is, so it lands on its aim instead. */
  const sunk = fromHex(HIGH_CONTRAST.schemes.light.sunk);
  assert.equal(HIGH_CONTRAST.schemes.light.danger, '#B3322C', 'high-contrast light red moved off an aim that clears its floor');
  assert.ok(contrast(fromHex(HIGH_CONTRAST.schemes.light.danger), sunk) >= HIGH_CONTRAST_PROFILE.intentFill);
  for (const [role, floor] of [['dim', HIGH_CONTRAST_PROFILE.ink[2]]] as const) {
    const c = contrast(fromHex(HIGH_CONTRAST.schemes.light[role]), sunk);
    assert.ok(c >= floor && c < floor + 0.1, `high-contrast light ${role} is ${c.toFixed(2)}:1 on the ground, not on its floor of ${floor}`);
  }
  /* The design system's amber and red words cannot be told apart by a deuteranope in light, so the amber text walks
     darker until the four words clear check F; the red, the dearest to move, holds at its aim. */
  const four = INTENTS.map((k) => fromHex(HOUSE.schemes.light[INTENT_TEXT[k]]));
  for (let i = 0; i < 4; i++)
    for (let j = i + 1; j < 4; j++)
      for (const d of ['protan', 'deutan', 'tritan'] as const) assert.ok(separation(four[i]!, four[j]!, d) >= 10);
  assert.ok(rgbToLch(fromHex(HOUSE.schemes.light.warn)).L < 0.5198, 'the light amber text did not walk away from red');
});

test('RED HAS TWO JOBS, AND EACH IS ONE VALUE', () => {
  /* As words (a late date, the phrase that needs him) red owes 4.5:1 and is `danger-text`; as a mark (a late dot, the
     count on Decide, a badge) it owes 3:1 and is `danger`. Checks G and D hold the floors. What is held here is the
     identity: in light the words sit 5:1 on the ground, a step deeper than the mark, and the mark IS the logo, which
     `theme.mjs` paints from the light accent, where a badge and the logo used to be two reds a hair apart. In dark
     the words already clear AA in the mark's own red, so the two jobs share it.

     2026-10-08, THE BADGE LEAVES THE LOGO. BrainDog red is the working accent now, so late and "needs
     you" take the deeper red, #B3322C, as a mark and as words, one value in light as in dark. The logo keeps the mark's
     red, and a badge is no longer it: beside red buttons, a badge in the logo's red would be a third red a hair off the
     other two.

     AND ITS 5:1 IS MEASURED ON THE BOARD AND THE TILE NOW, where words sit since the one-board look: 5.60:1 and 6.16:1. On
     the old ground, `sunk`, the deeper red is 4.93:1, which is short of the 5 this line used to ask there by less than
     a code value would buy, and a second red two code values deeper for words alone would be the hair-apart pair this
     test was written to end. The ground still owes AA, which check G holds, and a slip toward its edge fails here. */
  const light = HOUSE.schemes.light;
  for (const ground of ['board', 'tile'] as const)
    assert.ok(contrast(fromHex(light['danger-text']), fromHex(light[ground])) >= 5, `light red words are back at the edge of AA on the ${ground}`);
  assert.ok(contrast(fromHex(light['danger-text']), fromHex(light.sunk)) >= 4.9, 'light red words are back at the edge of AA on the ground');
  assert.equal(light.danger, '#B3322C', 'a late mark is not the deeper red');
  assert.equal(light.danger, light['danger-text'], 'light red has two values for one red');
  assert.notEqual(light.danger, light.accent, 'a badge is the logo’s red again, beside red buttons');
  assert.equal(light.accent, '#DB2527', 'the mark left its red');
  assert.equal(HOUSE.schemes.dark.danger, HOUSE.schemes.dark['danger-text'], 'dark red has two values for one red');
});

/** A generated `rgb(r g b / a)` or hex, painted over an opaque hex. */
const over = (paint: string, under: string) => {
  const u = fromHex(under);
  const m = /^rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)$/.exec(paint);
  if (!m) return fromHex(paint);
  const a = Number(m[4]);
  const mix = (top: number, bottom: number) => (top / 255) * a + bottom * (1 - a);
  return { r: mix(Number(m[1]), u.r), g: mix(Number(m[2]), u.g), b: mix(Number(m[3]), u.b) };
};

test('TEXT ON THE WASHES CLEARS THE SAME FLOORS AS TEXT ON A SURFACE', () => {
  /* A hovered row on the board or in a tile, and the arrival tint, are things a word sits on, and none of them is one
     of the grounds the checks walk. Each is held here against every ink's own floor.

     2026-10-07, THE WASH IS IN NOW, AND IT WAS THE OPEN QUESTION. The old light wash was white over a grey ground and
     took ink-3 under AA on a chosen row; the wash is the ink at 5% (`chromeOf`) and a chosen row the accent's first
     tint, which check S proves, so the question has an answer and this asserts it.

     A HOVER IS HELD TO THE HOUSE'S FLOORS IN HIGH CONTRAST, and the arrival tint to its own. A row under the pointer is
     a moment, and high contrast's 12.5:1 second text measures 11.75:1 under the light wash: far past AA, and short of a
     floor set for text a reader lives on. */
  for (const built of [HOUSE, HIGH_CONTRAST])
    for (const scheme of ['light', 'dark'] as const) {
      const p = built.schemes[scheme];
      const c = built.chrome[scheme];
      const grounds: [Rgb, number[]][] = [
        [over(c['hover-wash'], p.board), HOUSE_PROFILE.ink],
        [over(c['hover-wash'], p.tile), HOUSE_PROFILE.ink],
        [fromHex(c['arrived-wash']), built.profile.ink],
      ];
      for (const [i, ink] of (['ink', 'ink2', 'dim'] as const).entries())
        for (const [g, floors] of grounds) {
          const got = contrast(fromHex(p[ink]), g);
          assert.ok(got >= floors[i]! - 0.01, `${built.id} ${scheme}: ${ink} is ${got.toFixed(2)}:1 on a wash`);
        }
    }
});

test('THE BOARD: exact colours, no glass, no light, a flat tile', () => {
  /* 2026-10-08: the working accent is BrainDog red, #CF413A in light with #B3322C under the pointer, and
     in dark #E05148, the nearest red of that hue whose label and hover both clear (ELEVEN in `index.ts`). */
  assert.deepEqual(
    (['board', 'tile', 'action', 'action-hover'] as const).map((r) => HOUSE.schemes.light[r]),
    ['#F3F4F6', '#FFFFFF', '#CF413A', '#B3322C'],
  );
  assert.deepEqual(
    (['board', 'tile', 'action'] as const).map((r) => HOUSE.schemes.dark[r]),
    ['#0D1014', '#161A20', '#E05148'],
  );
  /* The same pair in high contrast: the pin is the seed's, and its floors are proven there by check S. */
  assert.equal(HIGH_CONTRAST.schemes.light.action, '#CF413A');
  assert.equal(HIGH_CONTRAST.schemes.dark.action, '#E05148');
  /* AND THE BUTTON UNDER THE POINTER IS STILL A BUTTON. Check S holds the label on the hover; this holds the hover fill
     itself to 3:1 on the three grounds a button stands on, which is what chose dark's red (ELEVEN in `index.ts`): a
     white-labelled #CF413A could only press darker, and that step, #BD2F2B, is 2.55:1 on the dark field. */
  for (const built of [HOUSE, HIGH_CONTRAST])
    for (const scheme of ['light', 'dark'] as const) {
      const p = built.schemes[scheme];
      for (const ground of ['board', 'tile', 'field'] as const)
        for (const fill of ['action', 'action-hover'] as const) {
          const got = contrast(fromHex(p[fill]), fromHex(p[ground]));
          assert.ok(got >= 3, `${built.id} ${scheme}: ${fill} is ${got.toFixed(2)}:1 on the ${ground}`);
        }
    }
  /* The brand stays red: the working accent is beside the mark, never instead of it. */
  assert.equal(HOUSE.schemes.light.accent, '#DB2527');
  assert.equal(HOUSE.chrome.light['hover-wash'], 'rgb(16 17 20 / 0.05)');
  assert.equal(HOUSE.chrome.light.selected, HOUSE.schemes.light['action-tint-1']);
  assert.equal(HOUSE.chrome.light['arrived-wash'], '#EEF0FF');
  /* 2026-10-20 (SPEC 1.9): nothing casts a shadow, a resting tile, a menu or a sheet. */
  for (const scheme of ['light', 'dark'] as const) assert.deepEqual(HOUSE.elevation[scheme], ['none', 'none', 'none']);
  const css = toCSS(HOUSE, HIGH_CONTRAST);
  for (const name of ['glass', 'glass-strong', 'glass-rim', 'glass-hair', 'glass-sat', 'ground-glow'])
    assert.equal(css.split(`--${name}:`).length - 1, 0, `--${name} is still emitted`);
  /* 2026-10-20 (SPEC 1): the stylesheet writes the frame's names, in every scheme block, and none of the dialect's,
     which `tokens.css` aliases to the frame so a name written here would hold its old value over the alias. */
  for (const name of ['board', 'tile', 'tile-2', 'hover', 'nav', 'red-fill', 'red-fill-hover', 'red-tint', 'red', 'on-red', 'live', 'arrived', 'scrim', 'cat-blue', 'cat-slate-tint'])
    assert.equal(css.split(`--${name}:`).length - 1, 12, `--${name} is not in every scheme block`);
  for (const name of ['bg', 'sunk', 's1', 'field', 'action', 'action-text', 'on-action', 'danger-text', 'hover-wash', 'selected', 'arrived-wash', 'edge', 'dim'])
    assert.equal(css.split(`--${name}:`).length - 1, 0, `--${name} is still written, over its alias`);
});

test('THE FRAME (UI pass, 20 Oct): his values exactly, the two reds as decided, and high contrast re-solved', () => {
  /* SPEC 1.1: frame 3.1's surfaces, inks and status, the reds as decided (fill #CF413A light, always a white label; red
     as words and marks #C2362F light, C1). IN DARK A TOUCH QUIETER SINCE 2 NOV (`fa3f844df`): fill #BA4239, words #E16C63. */
  for (const scheme of ['light', 'dark'] as const)
    for (const [role, value] of Object.entries(HOUSE_FRAME[scheme])) assert.equal(HOUSE.frame[scheme][role as FrameRole] ?? HOUSE.frame[scheme].scrim, value, `house ${scheme} ${role}`);
  assert.deepEqual(
    (['red-fill', 'red-fill-hover', 'red-fill-press', 'on-red', 'red'] as const).map((r) => HOUSE.frame.light[r]),
    ['#CF413A', '#B3322C', '#A12A25', '#FFFFFF', '#C2362F'],
  );
  assert.deepEqual(
    (['red-fill', 'red-fill-hover', 'red-fill-press', 'on-red', 'red'] as const).map((r) => HOUSE.frame.dark[r]),
    ['#BA4239', '#C64A41', '#A83A32', '#FFFFFF', '#E16C63'],
  );
  /* Dark red as words on the tile: at least 4.5 (the plan's own check). */
  assert.ok(contrast(fromHex(HOUSE.frame.dark.red), fromHex(HOUSE.frame.dark.tile)) >= 4.5);
  /* High contrast moves the words, never the reds' fills or their label, and holds its own floors. */
  for (const scheme of ['light', 'dark'] as const) {
    assert.equal(HIGH_CONTRAST.frame[scheme]['red-fill'], HOUSE.frame[scheme]['red-fill']);
    assert.equal(HIGH_CONTRAST.frame[scheme]['on-red'], '#FFFFFF');
    for (const ground of ['board', 'tile', 'tile-2'] as const)
      assert.ok(contrast(fromHex(HIGH_CONTRAST.frame[scheme].ink), fromHex(HIGH_CONTRAST.frame[scheme][ground])) >= 16, `high contrast ${scheme} ink on ${ground}`);
  }
  /* The dark grounds come down together, so they keep their order. */
  const lum = (hex: string) => relLuminance(fromHex(hex));
  const d = HIGH_CONTRAST.frame.dark;
  assert.ok(lum(d.board) < lum(d.tile) && lum(d.tile) < lum(d.hover) && lum(d.hover) < lum(d['tile-2']), 'the high-contrast dark grounds lost their order');
  /* A record's colour moves the fill and the selection, never red as words. */
  const moss = recordTheme('#41815F');
  assert.ok(moss.ok);
  if (moss.ok) {
    assert.equal(moss.value.built.frame.light['red-fill'], '#41815F');
    assert.equal(moss.value.built.frame.light.red, HOUSE.frame.light.red);
    assert.equal(moss.value.built.frame.dark.red, HOUSE.frame.dark.red);
  }
  /* And the refusal names the pair: his red as words in light, on the board, is the C1 pair that fails. */
  const his: Built = { ...HOUSE, frame: { ...HOUSE.frame, light: { ...HOUSE.frame.light, red: '#CF413A' } } };
  const found = refusals(checkScheme(his, 'light')).filter((f) => f.check === 'T');
  assert.deepEqual(
    found.map((f) => f.fix?.match(/\(red on ([a-z0-9-]+)\)/u)?.[1]),
    ['board', 'tile-2', 'hover', 'red-tint'],
  );
});

test('A RECORD’S COLOUR DRIVES THE WORKING ACCENT, and the house pin holds only beside the house red', () => {
  for (const { name, hex } of ACCENTS) {
    const got = recordTheme(hex);
    assert.ok(got.ok, `${name} was refused`);
    if (!got.ok) continue;
    const p = got.value.built.schemes;
    /* In light the buttons are the colour the person picked, exactly. */
    assert.equal(p.light.action, hex.toUpperCase(), `${name}'s buttons are not ${name}`);
    /* In dark a lighter step of the same hue, never the house red. */
    const dh = rgbToLch(fromHex(p.dark.action)).H;
    const ph = rgbToLch(fromHex(hex)).H;
    assert.ok(Math.min(Math.abs(dh - ph), 360 - Math.abs(dh - ph)) < 8, `${name}'s dark buttons left its hue`);
    assert.notEqual(p.dark.action, HOUSE.schemes.dark.action);
  }
  /* A seed spread from the house with another accent does not keep the house red, nor its pressed step. */
  const spread = build({ ...HOUSE_SEED, accent: '#2B7F8A' }, HOUSE_PROFILE, 'spread');
  assert.equal(spread.schemes.light.action, '#2B7F8A');
  assert.notEqual(spread.schemes.light['action-hover'], '#B3322C');
});

test('THE DARK LADDER: TILES, WELLS AND CHROME STAND APART FROM THE GROUND', () => {
  /* 2026-10-02. Under the ceiling at `s3` the design system's dark rungs put tile-2, `s2` and `s3` under one delta-E
     apart, so a hover inside a tile drew nothing, and a tile sat 3.6 over the ground. The ladder widened downward
     instead (`HOUSE_PROFILE.ladder`), and these are the distances that made it worth doing. */
  const p = HOUSE.schemes.dark;
  const apart = (a: Rgb, b: Rgb) => deltaE2000(rgbToCielab(a), rgbToCielab(b));
  const dE = (a: string, b: string) => apart(fromHex(a), fromHex(b));
  assert.ok(dE(p.sunk, p.bg) >= 4, `a tile is ${dE(p.sunk, p.bg).toFixed(2)} from the ground`);
  for (const [a, b] of [['bg', 's1'], ['s1', 's2'], ['s2', 's3']] as const)
    assert.ok(dE(p[a], p[b]) >= 1.5, `${b} is ${dE(p[a], p[b]).toFixed(2)} from ${a}, which a hover cannot show`);
  /* Evenly: the two steps above tile-2 are one step, to within a code value. */
  const L = (hex: string) => rgbToLch(fromHex(hex)).L;
  assert.ok(Math.abs(L(p.s2) - L(p.s1) - (L(p.s3) - L(p.s2))) < 0.003, 's1, s2 and s3 do not step evenly');
  /* And the tile stands off the board it sits on, by its colour alone (no border, no shadow). */
  assert.ok(dE(p.board, p.tile) >= 2.5, `a tile is ${dE(p.board, p.tile).toFixed(2)} from the board`);
  assert.deepEqual(refusals(checkElevation(HOUSE)), []);
});

test('THE LIGHT LADDER: TILES, WELLS AND CHROME STAND APART AS THEY DO IN DARK', () => {
  /* 2026-10-06. Light's steps inside a tile sat 0.8 and 0.95 delta-E apart, so a hover, a focused question and a chosen
     segment drew next to nothing in light while dark showed each. They step down from the white tile toward the ground
     now, held to dark's distances, and never onto the ground (check H). */
  const p = HOUSE.schemes.light;
  const apart = (a: Rgb, b: Rgb) => deltaE2000(rgbToCielab(a), rgbToCielab(b));
  const dE = (a: string, b: string) => apart(fromHex(a), fromHex(b));
  assert.ok(dE(p.sunk, p.bg) >= 4, `a tile is ${dE(p.sunk, p.bg).toFixed(2)} from the ground`);
  assert.ok(dE(p.bg, p.s1) >= 2.5, `a well is ${dE(p.bg, p.s1).toFixed(2)} from its tile`);
  /* 1.4 and not dark's 1.5: the steps share the room between a white tile and a ground the words must still clear
     4.5:1 on, and the second step measures 1.42. */
  for (const [a, b] of [['s1', 's2'], ['s2', 's3']] as const)
    assert.ok(dE(p[a], p[b]) >= 1.4, `${b} is ${dE(p[a], p[b]).toFixed(2)} from ${a}, which a hover cannot show`);
  const L = (hex: string) => rgbToLch(fromHex(hex)).L;
  assert.ok(Math.abs(L(p.s1) - L(p.s2) - (L(p.s2) - L(p.s3))) < 0.003, 's1, s2 and s3 do not step evenly');
  assert.ok(L(p.s3) > L(p.sunk), 'the last step inside a tile went down onto the ground');
  /* And the white tile stands off the board it sits on, as dark's does, at the design's own pair (2.47). */
  assert.ok(dE(p.board, p.tile) >= 2.4, `a tile is ${dE(p.board, p.tile).toFixed(2)} from the board`);
});

test('CHECK H AND CHECK I HOLD THE DESIGN SYSTEM’S SHAPE, and still refuse the wrong one', () => {
  /* A light tile-2 above the white tile is a ladder turned back on itself. */
  const turned: Built = { ...HOUSE, schemes: { ...HOUSE.schemes, light: { ...HOUSE.schemes.light, s2: '#FFFFFF' } } };
  assert.ok(refusals(checkScheme(turned, 'light')).some((f) => f.check === 'H'));
  /* A resting tile that casts anything is refused (SPEC 1.9): there are no levels now. */
  const raised: Built = { ...HOUSE, elevation: { ...HOUSE.elevation, light: ['0 1px 2px rgb(16 24 40 / 0.06)', 'none', 'none'] } };
  assert.equal(refusals(checkElevation(raised)).length, 1);
});
