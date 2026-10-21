/** `preload.ts`: which screens are read ahead of a press, and which are not. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DWELL_MS, warmFor } from './preload.ts';

const at = (path: string) => new URL(path, 'https://brain.dog');

test('A PAGE AND NEEDS YOU ARE READ AHEAD, under a record slug or none; every other screen is left to its own read', () => {
  assert.equal(typeof warmFor(at('/app/p/money')), 'function');
  assert.equal(typeof warmFor(at('/app/p/kiln?f.state=open')), 'function');
  assert.equal(typeof warmFor(at('/app/acme/p/kiln')), 'function');
  assert.equal(typeof warmFor(at('/app/decide')), 'function');
  assert.equal(typeof warmFor(at('/app/acme/decide')), 'function');
  assert.equal(warmFor(at('/app/decide?classic')), null, 'the kept classic screen reads as it always did');
  assert.equal(warmFor(at('/app/')), null);
  assert.equal(warmFor(at('/app/r/tasks')), null);
  assert.equal(warmFor(at('/app/decide/SG8')), null);
  assert.equal(warmFor(at('/app/settings/people')), null);
});

test('A POINTER PASSING OVER A LINK ASKS NOTHING: it has to rest a moment first', () => {
  assert.ok(DWELL_MS >= 50 && DWELL_MS <= 150, String(DWELL_MS));
});
