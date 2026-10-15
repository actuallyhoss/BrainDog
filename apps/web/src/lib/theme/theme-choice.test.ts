/**
 * The looks Appearance offers and the other scheme's preview (`theme-choice.ts`, PGS-A21).
 *
 * Every look is listed with one press, the one drawn now is marked by the record's own rule, and the preview is the
 * other scheme's solved tokens, never a colour the record would not draw. The names are invented here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { choicesOf, pickIn, previewOf, styleOf } from './theme-choice.ts';

const LIGHT = { tile: '#FFFFFF', ink: '#14161A', action: '#C8322B', 'r-lg': '12px' };
const DARK = { tile: '#1B1D22', ink: '#F1F2F4', action: '#E5554D', 'r-lg': '12px' };

/* A BOOT WITH TWO ADD-ON LOOKS and no look of the record's own, as `looksOf` would answer it. */
const boot = (pick?: string) => ({
  me: { prefs: pick === undefined ? {} : { 'look.theme': pick } },
  theme: { light: LIGHT, dark: DARK },
  looks: [
    { id: 'theme.fernhollow', name: 'Fern hollow', from: 'pack', pack: 'fernhollow' },
    { id: 'theme.quillmoor', name: 'Quillmoor', from: 'pack', pack: 'quillmoor' },
  ],
});

const names = (b: unknown, contrast = false) => choicesOf(b, contrast).map((c) => `${c.name}${c.on ? ' (on)' : ''}`);

test('House and High contrast come first, then every look the record holds, the picked one marked', () => {
  assert.deepEqual(names(boot('theme.quillmoor')), ['House', 'High contrast', 'Fern hollow', 'Quillmoor (on)']);
  assert.deepEqual(names(boot('house')), ['House (on)', 'High contrast', 'Fern hollow', 'Quillmoor']);
  assert.equal(pickIn(boot('theme.quillmoor')), 'theme.quillmoor');
});

test('no pick, or one the record no longer holds, marks the first look, as the record draws it', () => {
  assert.deepEqual(names(boot()), ['House', 'High contrast', 'Fern hollow (on)', 'Quillmoor']);
  assert.deepEqual(names(boot('theme.gone')), ['House', 'High contrast', 'Fern hollow (on)', 'Quillmoor']);
  assert.deepEqual(names({ me: {} }), ['House (on)', 'High contrast']);
});

test('High contrast is marked whenever it is on, whatever look is picked', () => {
  assert.deepEqual(names(boot('theme.quillmoor'), true), ['House', 'High contrast (on)', 'Fern hollow', 'Quillmoor']);
});

test('a stray look in the answer is no button', () => {
  const b = { ...boot(), looks: [{ id: 'theme.fernhollow', name: '', from: 'pack' }, { id: 'house', name: 'House', from: 'own' }, 7] };
  assert.deepEqual(names(b), ['House (on)', 'High contrast']);
});

test("the preview reads the other scheme's solved tokens from the record's look", () => {
  assert.deepEqual(previewOf(boot(), 'light'), DARK);
  assert.deepEqual(previewOf(boot(), 'dark'), LIGHT);
});

test('with no record look the preview is the fallback’s other scheme, and with neither it is nothing', () => {
  const house = { light: { tile: '#FAFAFA' }, dark: { tile: '#101114' } };
  assert.deepEqual(previewOf({ theme: null }, 'light', house), { tile: '#101114' });
  assert.equal(previewOf({ theme: null }, 'dark'), null);
});

test('a token that is not a colour or a pixel size never reaches the style attribute', () => {
  const b = { theme: { light: LIGHT, dark: { tile: '#1B1D22', ink: 'red; } body { x: y', 'Bad Name': '#000000' } } };
  assert.deepEqual(previewOf(b, 'light'), { tile: '#1B1D22' });
  assert.equal(styleOf({ tile: '#1B1D22', 'r-lg': '12px' }), '--tile: #1B1D22; --r-lg: 12px;');
  assert.equal(styleOf(null), '');
});
