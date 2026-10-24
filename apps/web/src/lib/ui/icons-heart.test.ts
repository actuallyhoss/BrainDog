/**
 * Settings' Health row draws its heart at once (audit 25 October, Y7). `heart-pulse` was a glyph only the late set held,
 * and the index's well, drawn once inside a page's text, stayed empty at both widths. It is drawn by hand now, as the
 * people glyphs Settings leads with are, so it needs nothing that arrives later.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { HAND, parseShapes, pathOf, shapesOf } from './icons.ts';

test('THE HEART DRAWS BEFORE THE SET ARRIVES, as one path the renderer reads and as shapes the icon draws', () => {
  const shapes = shapesOf('heart-pulse', undefined);
  assert.ok(shapes && shapes.length > 0, 'no shape before the set arrived');
  assert.deepEqual(shapes, parseShapes(HAND['heart-pulse']));
  const d = pathOf('heart-pulse', undefined)!;
  assert.equal(d[0], 'M');
  assert.doesNotMatch(d, /NaN|undefined|</u);
});
