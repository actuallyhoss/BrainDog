/**
 * The accent and the alarm, held apart by a number.
 *
 * THE ACCENT SHARES DANGER'S HUE BY DESIGN, SO THE DISTANCE BETWEEN THEM IS A MEASUREMENT AND NOT A
 * FEELING. The accent sits on the mark's own hue, 27, which is where `danger` is
 * anchored, and what keeps the two apart is the alarm a step richer in chroma, an error a filled
 * chip with a glyph, primary actions in ink, and the accent spent rarely. `theme.test.ts` holds the
 * chroma half. This file holds the distance, so it cannot shrink without a red line naming the pair.
 *
 * Two pairs, because the accent appears two ways: `--accent` as a fill beside the `--danger-fill` chip,
 * and `--accent-text` as a colour beside red words, `--danger-text`. Each is read in both schemes of the house and
 * alpha themes, as a reader with normal vision sees it and as each of the three dichromats does
 * (Brettel 1997, the simulation check F already uses).
 *
 * TWO FLOORS, AND THE SECOND IS WHY THIS FILE EXISTS. The first is 2.5 for normal vision: the tightest
 * pair reads 2.54 ΔE2000, the light house `--accent` against the light `--danger-fill`, worked by hand from
 * this package's own formulas. The same pair, worked the same way through the deuteranope's simulation, came
 * to about 1.7, and through the tritanope's to about 2.0, so a 2.5 floor on every reading would be red on its
 * first run for a fact no palette value can move today, given the window the light chip has to sit in. The
 * simulated floor is therefore 1.5, under the hand reading by more than the arithmetic's error, and it still
 * goes red if the chip and the accent drift toward each other.
 *
 * THE READINGS ARE PRINTED, NOT ONLY CHECKED. Each one is a diagnostic line in the test output, so the
 * CI run gives a measured table, and the hand figures above can be replaced by measured ones.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { deltaE2000, fromHex, rgbToCielab, separation, type Deficiency } from './color.ts';
import type { Built, Role, Scheme } from './build.ts';
import { checkScheme, K_EXEMPT, refusals } from './checks.ts';
import { ALPHA, HIGH_CONTRAST, HOUSE } from './index.ts';

/** Normal vision, from the 2.54 reading of the tightest pair. */
const FLOOR = 2.5;

/** Each simulated dichromat, under the hand readings of about 1.7 and 2.0 by more than the arithmetic's error. */
const FLOOR_SIMULATED = 1.5;

type Vision = 'normal' | Deficiency;

const VISIONS: Vision[] = ['normal', 'protan', 'deutan', 'tritan'];
const SCHEMES: Scheme[] = ['light', 'dark'];
const THEMES: Built[] = [HOUSE, ALPHA];

/**
 * The accent as a fill beside the danger chip, and the accent as text beside red words. `danger` itself is red as a
 * mark, and in light it is the mark, so the accent beside it is the logo beside a badge: one red on purpose.
 */
const PAIRS: [Role, Role][] = [
  ['accent', 'danger-fill'],
  ['accent-text', 'danger-text'],
];

/**
 * Delta-E 2000 as the reader sees it. Normal vision compares the two colours as they ship; a dichromat
 * compares them after simulation, which is exactly what `separation` does for check F.
 */
const distance = (a: string, b: string, vision: Vision): number =>
  vision === 'normal'
    ? deltaE2000(rgbToCielab(fromHex(a)), rgbToCielab(fromHex(b)))
    : separation(fromHex(a), fromHex(b), vision);

for (const built of THEMES)
  for (const scheme of SCHEMES)
    for (const [a, b] of PAIRS)
      test(`theme.${built.id} ${scheme}: --${a} stays apart from --${b}, to every reader`, (t) => {
        const p = built.schemes[scheme];
        for (const vision of VISIONS) {
          const got = distance(p[a], p[b], vision);
          const floor = vision === 'normal' ? FLOOR : FLOOR_SIMULATED;
          t.diagnostic(`${built.id} ${scheme} ${a}/${b} ${vision} ${got.toFixed(2)}`);
          assert.ok(
            got >= floor,
            `in ${built.id} ${scheme}, --${a} ${p[a]} and --${b} ${p[b]} are ${got.toFixed(2)} apart ` +
              `(${vision} vision), under the floor of ${floor}. The accent has moved toward the alarm.`,
          );
        }
      });

/* ── the working red and the late red (DIRECTION §42) ───────────────────── */

/**
 * BrainDog red is the working accent now, and late and "needs you" are a deeper red of the same hue. The owner's word is
 * that the two stand apart "with a mark or a word, never the colour alone", so the distance between them is not a floor
 * this file holds: it is printed, and what does the separating is held instead. Check K lets exactly one pair through
 * (`K_EXEMPT`, the working accent's words beside red words), and a late series in `blocks-charts.css` always carries its
 * hatch.
 */
test('CHECK K LETS THROUGH THE WORKING RED BESIDE THE LATE RED, AND NOTHING ELSE', (t) => {
  const L = (hex: string) => rgbToCielab(fromHex(hex)).L;
  for (const built of [HOUSE, HIGH_CONTRAST])
    for (const scheme of SCHEMES) {
      const p = built.schemes[scheme];
      const words = Math.abs(L(p['action-text']) - L(p['danger-text']));
      const fills = deltaE2000(rgbToCielab(fromHex(p.action)), rgbToCielab(fromHex(p.danger)));
      t.diagnostic(`${built.id} ${scheme} action-text/danger-text ${words.toFixed(2)} L*, action/danger ${fills.toFixed(2)} ΔE`);
      assert.deepEqual(
        refusals(checkScheme(built, scheme)).filter((f) => f.check === 'K'),
        [],
        `${built.id} ${scheme}: check K refuses the house`,
      );
    }
  /* THE EXEMPTION IS USED, which is why it exists: in light no link can be 8 L* off the late red and still clear AA. */
  const light = HOUSE.schemes.light;
  assert.ok(Math.abs(L(light['action-text']) - L(light['danger-text'])) < 8, 'the exemption is no longer needed; take it out');
  assert.deepEqual(K_EXEMPT, ['action-text', 'danger-text']);

  /* AND EVERY OTHER PAIR STILL REFUSES. A link the colour of body text, and the mark's words the colour of red words. */
  const k = (patch: Partial<Built['schemes']['light']>) =>
    refusals(checkScheme({ ...HOUSE, schemes: { ...HOUSE.schemes, light: { ...light, ...patch } } }, 'light')).filter(
      (f) => f.check === 'K',
    );
  assert.equal(k({ 'action-text': light.ink })[0]?.at, 'theme.house.roles.light.action-text', 'a link the colour of body text passed');
  assert.equal(k({ 'accent-text': light['danger-text'] })[0]?.at, 'theme.house.roles.light.accent-text', 'the mark’s words the colour of late passed');
});

/**
 * Every place `css` paints late without its stripes, as `selector: declaration`.
 *
 * A LATE PAINT is a background, fill or stroke naming `--chart-late`, `--status-late` or `--danger`, or any background on
 * a rule that picks a late thing out (`[data-intent='bad']`, `[data-key='bad']`). Each must be the hatch
 * (`--chart-late-hatch`, or a `repeating-linear-gradient`). Rules are read innermost-first, so a rule inside `@layer` or
 * `@media` is read like any other.
 */
const unstriped = (css: string, allowed: ReadonlySet<string> = new Set()): string[] => {
  const out: string[] = [];
  const plain = css.replace(/\/\*[\s\S]*?\*\//gu, '');
  for (const [, prelude, body] of plain.matchAll(/([^{};]+)\{([^{}]*)\}/gu)) {
    const selector = prelude!.trim().replace(/\s+/gu, ' ');
    if (allowed.has(selector)) continue;
    const picksLate = /\[data-(?:intent|key)='bad'\]/u.test(selector);
    for (const decl of body!.split(';')) {
      const m = /^\s*(background(?:-color|-image)?|fill|stroke)\s*:\s*([\s\S]+?)\s*$/u.exec(decl);
      if (!m) continue;
      const value = m[2]!;
      const late = /var\(--(?:chart-late|status-late|danger)\)/u.test(value) || (picksLate && m[1]!.startsWith('background'));
      const striped = value.includes('--chart-late-hatch') || value.includes('repeating-linear-gradient');
      if (late && !striped) out.push(`${selector}: ${m[1]}: ${value}`);
    }
  }
  return out;
};

test('A LATE SERIES ALWAYS CARRIES ITS HATCH (blocks-charts.css)', () => {
  const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
  /* ONE LET THROUGH, AND IT IS NOT A SERIES: the wash under the forecast's zero line is an SVG area at 8%, named by the
     zero tick beside it, and an SVG fill cannot take a CSS stripe. */
  const allowed = new Set(['.forecast-area[data-below]']);
  assert.deepEqual(unstriped(read('../../skin/blocks-charts.css'), allowed), [], 'a late mark is red by colour alone');

  /* The hatch is the late red, striped, and nothing else. */
  const hatch = /--chart-late-hatch:\s*([^;]+);/u.exec(read('../../skin/blocks-charts.css'))?.[1] ?? '';
  assert.match(hatch, /^repeating-linear-gradient\(/u, 'the late hatch is not a stripe');
  assert.match(hatch, /var\(--chart-late\) 0 3px/u, 'the late hatch is not the late red');

  /* AND THE TEST FAILS BY ITSELF: the bar this file striped, put back as it was. */
  assert.equal(unstriped(".roadmap-item[data-intent='bad'] .roadmap-bar { background: var(--chart-late); }").length, 1);
  assert.equal(unstriped('.thing { fill: var(--danger); }').length, 1);
  assert.equal(unstriped(".roadmap-key[data-key='bad']::before { background: var(--chart-late-hatch); }").length, 0);
});
