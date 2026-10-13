/**
 * `{{figure:parameter}}`: a hole that asks a figure with its parameter, answered keyed by the hole as written.
 *
 * WHAT IS HELD HERE: the bare hole is a path once the record answers it; the first colon separates, so a parameter
 * may hold a colon, a full stop or a space; a hole nobody answered stays the author's text, as `{{config:book}}`
 * always was; `icon` and `bad` are still their own forms; and a typed form takes the same words as its path.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { inline, text, type Resolve } from './inline.ts';

const values: Record<string, string> = { 'plan-left:Flat': '4', 'plan-left:C:\\Repos 2.0': '7', 'plan-owed:Flat': '1200 EGP' };
const resolve: Resolve = (path) => values[path];

test('a bare figure with its parameter is a path with the value the record answered', () => {
  assert.deepEqual(inline('{{plan-left:Flat}} left', { resolve })[0], { type: 'path', path: 'plan-left:Flat', resolved: '4' });
  assert.equal(text(inline('{{plan-left:Flat}} left', { resolve })), '4 left');
});

test('the first colon separates, and the hole is asked without the spaces round it', () => {
  assert.deepEqual(inline('{{plan-left:C:\\Repos 2.0}}', { resolve })[0], { type: 'path', path: 'plan-left:C:\\Repos 2.0', resolved: '7' });
  assert.deepEqual(inline('{{ plan-left:Flat }}', { resolve })[0], { type: 'path', path: 'plan-left:Flat', resolved: '4' });
});

test('words nobody answered stay the author’s text', () => {
  assert.deepEqual(inline('{{config:book}}', { resolve })[0], { type: 'unresolved', text: 'config:book' });
  assert.deepEqual(inline('{{plan-left:Flat}}')[0], { type: 'unresolved', text: 'plan-left:Flat' });
  assert.deepEqual(inline('{{plan-left:}}', { resolve })[0], { type: 'unresolved', text: 'plan-left:' });
});

test('icon and bad are still their own forms, and a typed form takes the figure as its path', () => {
  assert.equal(inline('{{icon:rocket}}', { resolve })[0]?.type, 'icon');
  assert.equal(inline('{{bad:late}}', { resolve })[0]?.type, 'bad');
  const typed = inline('{{money:plan-owed:Flat}}', { resolve })[0];
  assert.equal(typed?.type, 'typed');
});
