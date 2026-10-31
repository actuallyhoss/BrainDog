/**
 * A fact kept on somebody's note replaces the one it updates and is never written twice (RP2).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { noteWith } from './kept-note.ts';

test('a birthday kept on a note replaces an older one, and one already there writes nothing (RP2)', () => {
  assert.equal(noteWith('', 'Birthday 14 Nov'), 'Birthday 14 Nov');
  assert.equal(noteWith('Loves tulips', 'Birthday 14 Nov'), 'Loves tulips. Birthday 14 Nov');
  assert.equal(noteWith('Birthday 14 Nov', 'Birthday 15 Nov'), 'Birthday 15 Nov');
  assert.equal(noteWith('Loves tulips. Birthday 14 Nov. Lives in Cairo', 'Birthday 3 Mar'), 'Loves tulips. Birthday 3 Mar. Lives in Cairo');
  assert.equal(noteWith('Birthday 14 Nov', 'Birthday 14 Nov'), null);
  assert.equal(noteWith('  Birthday 14 Nov  ', 'Birthday 14 Nov'), null);
});
