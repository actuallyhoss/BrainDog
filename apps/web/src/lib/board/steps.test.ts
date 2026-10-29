import assert from 'node:assert/strict';
import { test } from 'node:test';

import { stepsBetween } from './steps.ts';

test('nothing changed is no step; a size, a removal and a new order each say themselves', () => {
  const from = { order: ['a', 'b', 'c'], sizes: { a: 'small', b: 'wide', c: 'tall' } as const, phone: null };
  assert.deepEqual(stepsBetween(from, from), []);
  const to = { order: ['c', 'a'], sizes: { a: 'wide', c: 'tall' } as const, phone: null };
  assert.deepEqual(stepsBetween(from, to), [{ remove: 'b' }, { size: 'a', to: 'wide' }, { move: 'a', before: null }, { move: 'c', before: 'a' }]);
});
