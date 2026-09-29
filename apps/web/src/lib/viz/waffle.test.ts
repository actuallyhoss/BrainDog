import { test } from 'node:test';
import assert from 'node:assert/strict';

import { describeWaffle, MOST_CELLS, waffle, waffleUnits } from './waffle.ts';

const TIERS = [1, 6, 11, 5];

test('one square a thing, filled part by part in reading order', () => {
  const g = waffle(TIERS, 296);
  assert.equal(g.cells.length, 23);
  assert.equal(g.per, 1);
  assert.equal(g.size, 10);
  assert.equal(g.columns, 23);
  assert.equal(g.cells[0]?.part, 0);
  assert.equal(g.cells[1]?.part, 1);
  assert.equal(g.cells[7]?.part, 2);
  assert.equal(g.cells[1]?.x, 13);
  assert.equal(g.height, 10);
});

test('a narrow box wraps the squares onto more rows', () => {
  const g = waffle(TIERS, 128);
  assert.equal(g.columns, 10);
  assert.equal(g.cells[10]?.x, 0);
  assert.equal(g.cells[10]?.y, 13);
  assert.equal(g.height, 3 * 13 - 3);
});

test('fixed columns grow the squares to fill the width, up to 16px', () => {
  const g = waffle(TIERS, 400, 10);
  assert.equal(g.columns, 10);
  assert.equal(g.size, 16);
  const tight = waffle(TIERS, 100, 10);
  assert.equal(tight.size, 7);
});

test('past 200 things each square is a share, and the squares still add up', () => {
  const { units, per } = waffleUnits([700, 250, 49, 1]);
  assert.equal(
    units.reduce((s, u) => s + u, 0),
    MOST_CELLS,
  );
  assert.equal(per, 5);
  /* 140, 50 and 9.8 round to 140, 50 and 10; the 0.2 keeps its square and the largest part gives it up. */
  assert.deepEqual(units, [139, 50, 10, 1]);
});

test('a part with any share keeps a square', () => {
  const { units } = waffleUnits([10_000, 1]);
  assert.equal(units[1], 1);
  assert.equal(
    units.reduce((s, u) => s + u, 0),
    MOST_CELLS,
  );
});

test('fractions are shares too, never half a square', () => {
  const { units } = waffleUnits([0.5, 0.25, 0.25], 100);
  assert.ok(units.every(Number.isInteger));
});

test('it reads as a sentence with the real counts', () => {
  assert.equal(
    describeWaffle(
      [
        { label: 'urgent', value: 1 },
        { label: 'high', value: 6 },
        { label: 'medium', value: 11 },
        { label: 'low', value: 5 },
      ],
      'open tasks',
    ),
    '23 open tasks: 1 urgent, 6 high, 11 medium and 5 low',
  );
  assert.equal(describeWaffle([], 'open tasks'), 'No open tasks');
});
