import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SLOT_HUES, initialOf, initialsOf, slotOf } from './face.ts';

test('a name gives its first letter, uppercased', () => {
  assert.equal(initialOf('Claude'), 'C');
  assert.equal(initialOf('you'), 'Y');
});

test('a leading "the" is not the name, so the two bare-word actors stop sharing a T', () => {
  assert.equal(initialOf('the assistant'), 'A');
  assert.equal(initialOf('the record itself'), 'R');
  assert.equal(initialOf('The assistant'), 'A');
});

test('an email gives the first letter before the @', () => {
  assert.equal(initialOf('sm@marchetti.example'), 'S');
});

test('leading space is ignored', () => {
  assert.equal(initialOf('  reply rule'), 'R');
});

test('an empty name still draws a mark', () => {
  assert.equal(initialOf(''), '?');
  assert.equal(initialOf('   '), '?');
});

test('a project or a record wears two initials at most, the first of its first two words', () => {
  assert.equal(initialsOf('Portage'), 'P');
  assert.equal(initialsOf('Marlow & Co'), 'MC');
  assert.equal(initialsOf('backup vendor review'), 'BV');
  assert.equal(initialsOf('The Fenwick Group'), 'FG');
  assert.equal(initialsOf('  '), '?');
});

test('a hue snaps to the nearest category slot round the wheel', () => {
  for (const [slot, hue] of Object.entries(SLOT_HUES)) assert.equal(slotOf(hue), slot);
  assert.equal(slotOf(250), 'blue');
  assert.equal(slotOf(214), 'sky');
  assert.equal(slotOf(176), 'teal');
  assert.equal(slotOf(5), 'pink');
  assert.equal(slotOf(-8), 'pink');
  assert.equal(slotOf(720 + 90), 'yellow');
});

test('no hue is the neutral slot, never a colour', () => {
  assert.equal(slotOf(null), 'slate');
  assert.equal(slotOf(undefined), 'slate');
  assert.equal(slotOf(Number.NaN), 'slate');
  assert.ok(!Object.hasOwn(SLOT_HUES, 'slate'));
});
