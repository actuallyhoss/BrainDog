import { test } from 'node:test';
import assert from 'node:assert/strict';

import { describeStacked, stack, STACK_GAP, stacked } from './stacked.ts';

const end = (parts: { x: number; w: number }[]): number => {
  const last = parts[parts.length - 1];
  return last ? last.x + last.w : 0;
};

test('the parts span the width exactly, 2px apart', () => {
  const s = stack([268400, 131900, 24000], 360);
  assert.equal(s.length, 3);
  assert.equal(s[0]?.x, 0);
  assert.ok(Math.abs(end(s) - 360) < 0.02);
  for (let k = 1; k < s.length; k++) {
    const a = s[k - 1]!;
    const b = s[k]!;
    assert.ok(Math.abs(b.x - (a.x + a.w) - STACK_GAP) < 0.02);
  }
});

test('shares are in proportion', () => {
  const s = stack([3, 1], 402);
  assert.ok(Math.abs((s[0]?.w ?? 0) - 300) < 0.01);
  assert.ok(Math.abs((s[1]?.w ?? 0) - 100) < 0.01);
});

test('zero and negative parts are left out, and keep their index for the rest', () => {
  const s = stack([5, 0, -2, 5], 102);
  assert.deepEqual(
    s.map((p) => p.i),
    [0, 3],
  );
});

test('a sliver is 2px and the widest part pays for it', () => {
  const s = stack([1000, 1], 202);
  assert.equal(s[1]?.w, 2);
  assert.ok(Math.abs(end(s) - 202) < 0.02);
});

test('nothing to stack is nothing drawn', () => {
  assert.deepEqual(stack([], 100), []);
  assert.deepEqual(stack([0, 0], 100), []);
});

test('a label is drawn only where it fits under its part', () => {
  const g = stacked(
    [
      { label: 'your pounds, about 4 months', value: 4 },
      { label: 'your dollars, about 10 months', value: 10 },
    ],
    876,
  );
  assert.equal(g.parts[0]?.labelX, 0);
  assert.notEqual(g.parts[1]?.labelX, null);
  assert.equal(g.height, 32);

  /* At a tile's width the narrow part's label drops, and the wide one's stays. */
  const tile = stacked(
    [
      { label: 'your pounds, about 4 months', value: 4 },
      { label: 'your dollars, about 10 months', value: 10 },
    ],
    420,
  );
  assert.equal(tile.parts[0]?.labelX, null);
  assert.notEqual(tile.parts[1]?.labelX, null);

  const crowded = stacked(
    [
      { label: 'tasks', value: 14 },
      { label: 'handoffs', value: 4 },
      { label: 'decisions', value: 3 },
      { label: 'figures', value: 3 },
      { label: 'dates', value: 2 },
    ],
    416,
  );
  assert.equal(crowded.parts[0]?.labelX, 0);
  assert.equal(crowded.parts[3]?.labelX, null);

  const narrow = stacked([{ label: 'a long label indeed', value: 1 }, { label: 'b', value: 99 }], 200);
  assert.equal(narrow.parts[0]?.labelX, null);
});

test('with no label drawn it is only the bar', () => {
  assert.equal(stacked([{ label: '', value: 1 }], 100, 12).height, 12);
});

test('it reads as a sentence', () => {
  assert.equal(
    describeStacked(
      [
        { label: 'HSBC current', value: 268400 },
        { label: 'CIB', value: 131900 },
        { label: 'empty', value: 0 },
      ],
      'Pounds by account',
    ),
    'Pounds by account: HSBC current 268,400, CIB 131,900',
  );
});
