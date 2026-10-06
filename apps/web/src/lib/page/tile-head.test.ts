/**
 * Every tile on the board starts the same way: an icon, the name, and how many it holds where it is a list.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { headCount, headIcon } from './tile-head.ts';

const drawn = new Set(['ask', 'rows', 'task', 'grid', 'activity', 'money', 'doc', 'bell', 'calendar']);
const draws = (n: string) => drawn.has(n);

test('A TILE KEEPS THE GLYPH IT NAMES, and one that names none takes its kind’s', () => {
  assert.equal(headIcon('table', 'bell', draws), 'bell');
  assert.equal(headIcon('queue', undefined, draws), 'ask');
  assert.equal(headIcon('forecast', undefined, draws), 'money');
  assert.equal(headIcon('series', 'not-a-glyph', draws), 'activity', 'a glyph the app cannot draw is no glyph');
  assert.equal(headIcon('block.custom', undefined, draws), 'doc', 'a pack’s own kind is a page of its own');
  assert.equal(headIcon('agents', undefined, draws), null, 'a glyph the app does not draw leaves the slot out, never a blank well');
});

test('A COUNT IS SAID ONLY ON A LIST A PERSON COUNTS, and never on a figure, a chart or nothing', () => {
  assert.equal(headCount({ kind: 'queue', total: 8 }), 8);
  assert.equal(headCount({ kind: 'table', total: 3 }), 3);
  assert.equal(headCount({ kind: 'table', total: 0 }), null);
  assert.equal(headCount({ kind: 'stat', total: 4 }), null);
  assert.equal(headCount({ kind: 'series', total: 12 }), null);
  assert.equal(headCount({ kind: 'note', total: 1 }), null);
  assert.equal(headCount({ kind: 'table', total: 5, refused: true }), null);
});
