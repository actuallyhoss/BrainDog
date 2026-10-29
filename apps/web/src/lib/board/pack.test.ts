import assert from 'node:assert/strict';
import { test } from 'node:test';

import { areaOf, dropIndex, filled, moved, pack } from './pack.ts';

test('a board lays row by row, and a hole is filled by the first widget after it that fits', () => {
  const p = pack(
    [
      { key: 'late', size: 'large' },
      { key: 'work', size: 'wide' },
      { key: 'num', size: 'full' },
      { key: 'one', size: 'small' },
    ],
    4,
  );
  assert.deepEqual(
    p.laid.map((l) => [l.key, l.x, l.y]),
    [
      ['late', 0, 0],
      ['work', 2, 0],
      ['one', 2, 1],
      ['num', 0, 2],
    ],
  );
  assert.equal(p.rows, 3);
});

test('on a phone a full is a wide, and nothing is wider than the board', () => {
  const p = pack([{ key: 'a', size: 'full' }, { key: 'b', size: 'small' }, { key: 'c', size: 'small' }], 2);
  assert.deepEqual(p.laid.map((l) => [l.key, l.x, l.y, l.w]), [['a', 0, 0, 2], ['b', 0, 1, 1], ['c', 1, 1, 1]]);
  assert.equal(areaOf(p.laid[0]!), '1 / 1 / 2 / 3');
});

test('a drop names the place in the order, and a move keeps the rest in theirs', () => {
  const p = pack([{ key: 'a', size: 'small' }, { key: 'b', size: 'small' }, { key: 'c', size: 'small' }], 4);
  assert.equal(dropIndex(p, 'c', 0, 0), 0);
  assert.deepEqual(moved(['a', 'b', 'c'], 'c', 0), ['c', 'a', 'b']);
});

test('at rest no hole is drawn: the widget beside one is drawn across it, and its size stays', () => {
  /* Cash made Small beside Working now: its fourth column was a hole nothing after it fits. */
  const p = pack(
    [
      { key: 'work', size: 'wide' },
      { key: 'cash', size: 'small' },
      { key: 'num', size: 'full' },
    ],
    4,
  );
  assert.deepEqual(p.laid.map((l) => [l.key, l.x, l.y, l.w]), [['work', 0, 0, 2], ['cash', 2, 0, 1], ['num', 0, 1, 4]]);
  const f = filled(p, 4);
  assert.deepEqual(f.map((l) => [l.key, l.x, l.y, l.w, l.h, l.size]), [['work', 0, 0, 2, 1, 'wide'], ['cash', 2, 0, 2, 1, 'small'], ['num', 0, 1, 4, 1, 'full']]);
  /* And a last row left half empty is closed by the widget in it. */
  const end = filled(pack([{ key: 'a', size: 'full' }, { key: 'b', size: 'wide' }], 4), 4);
  assert.deepEqual(end.map((l) => [l.key, l.w]), [['a', 4], ['b', 4]]);
});
