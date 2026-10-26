/** Each add-on wears the glyph of the place it brings, as the rail draws it. */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { glyphOf } from './glyph.ts';

const nav = [
  { id: 'money', icon: 'money' as const },
  { id: 'kiln', icon: 'thing' as const, row: true },
  { id: 'portfolio', icon: 'thing' as const },
  { id: 'work', icon: 'task' as const },
];

test('an add-on wears its first page the rail draws, and the add-ons glyph without one', () => {
  assert.equal(glyphOf(['money', 'cash'], nav), 'money');
  assert.equal(glyphOf(['cash', 'work'], nav), 'task', 'a page the rail does not draw is passed over');
  assert.equal(glyphOf(['kiln'], nav), 'packs', 'a page about one thing is not the add-on\'s place');
  assert.equal(glyphOf([], nav), 'packs');
  assert.equal(glyphOf(undefined, nav), 'packs');
});
