/**
 * The look fails on text that crosses text (the plan of 20 October, batch 3b): two runs whose boxes share more than a
 * sliver are a fault, two that only touch are not, and a run wrapping over two lines is never said to cross itself.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { crossings } from '../capture.mjs';

const box = (node, text, x, y, w, h = 16) => ({ node, text, x, y, w, h });

test('TWO LABELS DRAWN OVER EACH OTHER CROSS, as the roadmap drew "Proofing press 5 of 8Invoice 2026-049"', () => {
  const found = crossings([box(1, 'Proofing press, 5 of 8', 100, 40, 140), box(2, 'Invoice 2026-049', 220, 42, 120)]);
  assert.equal(found.length, 1);
  assert.deepEqual(found[0], { a: 'Proofing press, 5 of 8', b: 'Invoice 2026-049', at: [220, 42] });
});

test('TEXT SIDE BY SIDE, ON LINES THAT ONLY TOUCH, OR ONE RUN ON TWO LINES DOES NOT CROSS', () => {
  assert.deepEqual(crossings([box(1, 'Kiln', 0, 0, 40), box(2, 'Earning', 42, 0, 50)]), [], 'side by side');
  assert.deepEqual(crossings([box(1, 'Kiln', 0, 0, 40, 40), box(2, 'A variable type family', 0, 36, 160)]), [], 'a tall title whose ascent meets the line under it');
  assert.deepEqual(crossings([box(1, 'a long line', 0, 0, 200), box(1, 'a long line', 0, 10, 200)]), [], 'one run');
});

test('EACH PAIR IS SAID ONCE, however many boxes it has', () => {
  const found = crossings([box(1, 'A', 0, 0, 50), box(2, 'B', 10, 0, 50), box(2, 'B', 10, 0, 50)]);
  assert.equal(found.length, 1);
});
