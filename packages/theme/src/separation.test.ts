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
 * and `--accent-text` as a colour beside `--danger` text. Each is read in both schemes of the house and
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

import { deltaE2000, fromHex, rgbToCielab, separation, type Deficiency } from './color.ts';
import type { Built, Role, Scheme } from './build.ts';
import { ALPHA, HOUSE } from './index.ts';

/** Normal vision, from the 2.54 reading of the tightest pair. */
const FLOOR = 2.5;

/** Each simulated dichromat, under the hand readings of about 1.7 and 2.0 by more than the arithmetic's error. */
const FLOOR_SIMULATED = 1.5;

type Vision = 'normal' | Deficiency;

const VISIONS: Vision[] = ['normal', 'protan', 'deutan', 'tritan'];
const SCHEMES: Scheme[] = ['light', 'dark'];
const THEMES: Built[] = [HOUSE, ALPHA];

/** The accent as a fill beside the danger chip, and the accent as text beside danger text. */
const PAIRS: [Role, Role][] = [
  ['accent', 'danger-fill'],
  ['accent-text', 'danger'],
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
