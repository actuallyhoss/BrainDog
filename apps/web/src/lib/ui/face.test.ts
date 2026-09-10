import { test } from 'node:test';
import assert from 'node:assert/strict';

import { initialOf } from './face.ts';

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
