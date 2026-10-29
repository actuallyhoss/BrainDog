import { test } from 'node:test';
import assert from 'node:assert/strict';

import { accountLook, categoryLook, glyphByName } from './category-look.ts';

test("a category with no glyph of its own is drawn by its name, and its own glyph and colour win", () => {
  assert.equal(glyphByName('Groceries'), 'shopping-cart');
  assert.equal(glyphByName('Outing'), 'utensils');
  assert.equal(glyphByName('Transfers'), 'repeat');
  assert.equal(glyphByName('Zebra'), 'tag');
  assert.deepEqual(categoryLook('Car', { icon: 'plane', colour: 'pink' }), { glyph: 'plane', slot: 'pink' });
  assert.equal(categoryLook('Car').glyph, 'car');
});

test('an account is drawn by its type, else by its name', () => {
  assert.equal(accountLook('Anything', 'card').glyph, 'credit-card');
  assert.equal(accountLook('Cash (EGP)', null).glyph, 'wallet');
  assert.equal(accountLook('HSBC (USD)', 'bank').glyph, 'landmark');
});

test('MONEY THAT COMES IN, under a name no word here knows, is drawn as earnings; its own glyph and the words still win', () => {
  assert.equal(glyphByName('Monthly pay slip', true), 'briefcase');
  assert.equal(glyphByName('Monthly pay slip'), 'tag');
  assert.equal(glyphByName('Rent', true), 'house');
  assert.equal(categoryLook('Monthly pay slip', { income: true }).glyph, 'briefcase');
  assert.equal(categoryLook('Monthly pay slip', { icon: 'gift', income: true }).glyph, 'gift');
});
