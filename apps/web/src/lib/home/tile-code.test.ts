import { test } from 'node:test';
import assert from 'node:assert/strict';

import { tilesOf } from './tile-code.ts';

test('the tiles whose code is asked are the ones Today’s answer has something to show in (speed-d SD1)', () => {
  const blocks = [
    { key: 'needs-you', queue: [{ id: 'q1' }] },
    { key: 'late', rows: [{ seq: 1 }] },
    { key: 'working', rows: [] },
    { key: 'cash', rows: [{ seq: 2 }] },
  ];
  assert.deepEqual(tilesOf(blocks), ['late', 'card']);
  assert.deepEqual(tilesOf([{ key: 'working', entries: [{ seq: 3 }] }, { key: 'needs-you', queue: [] }]), ['working']);
  assert.deepEqual(tilesOf(null), []);
  assert.deepEqual(tilesOf('not blocks'), []);
});
