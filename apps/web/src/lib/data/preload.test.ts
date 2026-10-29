/** `preload.ts`: which screens are read ahead of a press, and which are not. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DWELL_MS, warmFor } from './preload.ts';

const at = (path: string) => new URL(path, 'https://brain.dog');

test('A PAGE AND NEEDS YOU ARE READ AHEAD, under a record slug or none; every other screen is left to its own read', () => {
  assert.equal(typeof warmFor(at('/p/money')), 'function');
  assert.equal(typeof warmFor(at('/p/kiln?f.state=open')), 'function');
  assert.equal(typeof warmFor(at('/acme/p/kiln')), 'function');
  assert.equal(typeof warmFor(at('/decide')), 'function');
  assert.equal(typeof warmFor(at('/acme/decide')), 'function');
  assert.equal(typeof warmFor(at('/decide?classic')), 'function', 'a kept address of the old screen opens Decide, read ahead as it is');
  assert.equal(warmFor(at('/')), null);
  assert.equal(warmFor(at('/r/tasks')), null);
  assert.equal(warmFor(at('/decide/SG8')), null);
  assert.equal(warmFor(at('/settings/people')), null);
});

test('A POINTER PASSING OVER A LINK ASKS NOTHING: it has to rest a moment first', () => {
  assert.ok(DWELL_MS >= 50 && DWELL_MS <= 150, String(DWELL_MS));
});
