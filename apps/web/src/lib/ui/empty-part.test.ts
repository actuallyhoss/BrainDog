/**
 * `screenSays`: a compact `Empty` is a part inside a section and never settles the screen as empty; a refusal still
 * does, compact or not; a whole-screen `Empty` says what it said before.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { screenSays } from './empty-part.ts';

test('A WHOLE-SCREEN EMPTY says `empty`, for every kind that is not a refusal', () => {
  for (const kind of ['no-data-yet', 'no-results', 'cleared', 'no-permission']) assert.equal(screenSays(kind, false), 'empty', kind);
});

test('A WHOLE-SCREEN REFUSAL says `refused`', () => {
  assert.equal(screenSays('error', false), 'refused');
});

test('A COMPACT EMPTY, a part inside a section, says nothing to the screen', () => {
  for (const kind of ['no-data-yet', 'no-results', 'cleared', 'no-permission']) assert.equal(screenSays(kind, true), null, kind);
});

test('A COMPACT REFUSAL still says `refused`', () => {
  assert.equal(screenSays('error', true), 'refused');
});
