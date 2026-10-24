/**
 * A script's Save waits for code (24 October, U-B18): an installed script whose code is not kept here opened with an
 * empty box and a live "Save and turn on", which would have filed a script of no code.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { canSave } from './script-draft.ts';

const idle = { sending: false, waiting: false };

test('SAVE IS HELD WHILE THE CODE BOX IS EMPTY, or holds only space', () => {
  assert.equal(canSave({ source: '' }, idle), false);
  assert.equal(canSave({ source: '  \n\t' }, idle), false);
  assert.equal(canSave({ source: 'export default () => 1;' }, idle), true);
});

test('AND WHILE IT IS SENDING, or once it is filed and waits on the owner', () => {
  const code = { source: 'export default () => 1;' };
  assert.equal(canSave(code, { sending: true, waiting: false }), false);
  assert.equal(canSave(code, { sending: false, waiting: true }), false);
});
