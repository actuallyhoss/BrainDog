import assert from 'node:assert/strict';
import { test } from 'node:test';

import { areaOf, dropIndex, filled, heldAt, moved, pack } from './pack.ts';

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

test('a hole goes to the widget in its row that holds the most, where the board says how much each holds', () => {
  const p = pack(
    [
      { key: 'coming-up', size: 'tall' },
      { key: 'work-due', size: 'tall' },
      { key: 'people', size: 'tall' },
    ],
    4,
  );
  /* As the record lays Today out: Coming up nine deep, People four faces. Coming up takes the room, the rest move along. */
  const weighed = filled(p, 4, new Set(), new Map([['coming-up', 9], ['work-due', 2], ['people', 4]]));
  assert.deepEqual(weighed.map((l) => [l.key, l.x, l.w]), [['coming-up', 0, 2], ['work-due', 2, 1], ['people', 3, 1]]);
  /* A board he arranged gives no weights, and the widget beside the hole takes it as before. */
  assert.deepEqual(filled(p, 4).map((l) => [l.key, l.x, l.w]), [['coming-up', 0, 1], ['work-due', 1, 1], ['people', 2, 2]]);
  /* On a tie the widget beside the hole keeps it. */
  assert.deepEqual(filled(p, 4, new Set(), new Map([['coming-up', 3], ['people', 3]])).map((l) => [l.key, l.w]), [['coming-up', 1], ['work-due', 1], ['people', 2]]);
});

test('a widget picked up keeps the same share of it under the pointer when its frame shrinks to its own size', () => {
  /* At rest drawn across a hole, 600 wide; held, its own 290. Pressed at 450 across, three quarters of the way. */
  const was = { left: 100, top: 200, width: 600, height: 140 };
  const now = { left: 100, top: 200, width: 290, height: 140 };
  assert.deepEqual(heldAt(was, now, 550, 270), { dx: 217.5, dy: 70 });
  /* A frame that did not change keeps the grip where the pointer is. */
  assert.deepEqual(heldAt(was, was, 550, 270), { dx: 450, dy: 70 });
  /* A press just outside the frame is kept on the widget's edge. */
  assert.deepEqual(heldAt({ left: 0, top: 0, width: 100, height: 100 }, { left: 0, top: 0, width: 200, height: 100 }, 120, -5), { dx: 200, dy: 0 });
});
