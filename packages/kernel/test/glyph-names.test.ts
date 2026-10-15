/**
 * An `icon:` that names no glyph is answered with the three nearest (PGS-A19), so `icon: rokcet` is told `rocket`
 * rather than installing and drawing an empty well.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { GLYPH_LIST, GLYPH_UNKNOWN, editDistance, glyphFault, isGlyphName, nearestGlyphs } from '../src/glyph-names.ts';

test('a real name and an alias both answer', () => {
  assert.equal(glyphFault('rocket'), null);
  assert.equal(glyphFault('invoice'), null, 'an alias of receipt-text');
  assert.equal(glyphFault('home'), null, "the shell's own name");
  assert.ok(isGlyphName('gift'));
});

test('a misspelt real name answers that name first, and the fix names three', () => {
  assert.ok(GLYPH_LIST.includes('rocket'));
  const fault = glyphFault('rokcet');
  assert.ok(fault);
  assert.equal(fault.code, GLYPH_UNKNOWN);
  assert.equal(fault.at, 'icon');
  assert.equal(fault.allowed.length, 3);
  assert.equal(fault.allowed[0], 'rocket');
  assert.match(fault.fix, /^There is no glyph called rokcet\. The nearest are rocket, [a-z0-9-]+ and [a-z0-9-]+\.$/u);
  for (const name of fault.allowed) assert.ok(fault.fix.includes(name), `${name} is not said`);
});

test('a word off the prototype is no glyph', () => {
  assert.ok(glyphFault('constructor'));
  assert.ok(glyphFault('tostring'));
});

test('a swap of two letters is one edit, and a tie keeps the list order', () => {
  assert.equal(editDistance('rokcet', 'rocket'), 1);
  assert.equal(editDistance('', 'abc'), 3);
  assert.equal(editDistance('same', 'same'), 0);
  const near = nearestGlyphs('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzz', 5);
  assert.equal(near.length, 5);
  const far = near.map((n) => editDistance('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzz', n));
  for (let i = 1; i < near.length; i++) {
    assert.ok(far[i - 1]! <= far[i]!, 'nearest first');
    if (far[i - 1] === far[i]) assert.ok(GLYPH_LIST.indexOf(near[i - 1]!) < GLYPH_LIST.indexOf(near[i]!), 'a tie in list order');
  }
});

test('nothing offered is a name an icon cannot be written as', () => {
  for (const word of ['arrowup', 'chevrondown', 'rokcet', 'calender']) {
    for (const name of nearestGlyphs(word)) assert.match(name, /^[a-z][a-z0-9-]*$/u);
  }
});
