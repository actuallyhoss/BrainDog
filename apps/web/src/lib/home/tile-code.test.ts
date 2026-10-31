import { test } from 'node:test';
import assert from 'node:assert/strict';

import { askReads, tilesOf } from './tile-code.ts';
import { takeWorking, workingHeld } from './working-early.ts';

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

test('WORKING NOW’S FIRST READ IS ASKED ONCE TODAY IS READ, only where the tile has someone to show (speed-e SE3)', () => {
  const base = 'http://127.0.0.1:9/early';
  askReads([{ key: 'late', rows: [{ seq: 1 }] }], { base, owner: true });
  assert.equal(workingHeld(base), false, 'a Today with nobody working asked who is');
  askReads([{ key: 'working', entries: [{ seq: 3 }] }], { base, owner: true });
  assert.equal(workingHeld(base), true);
  /* AND THE TILE TAKES IT ONCE, so its next read is its own. */
  assert.ok(takeWorking(base));
  assert.equal(workingHeld(base), false);
});
