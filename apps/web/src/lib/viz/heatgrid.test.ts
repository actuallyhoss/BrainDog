import { test } from 'node:test';
import assert from 'node:assert/strict';

import { describeHeat, heatgrid, heatLevel } from './heatgrid.ts';

const DAYS = ['Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue'];
const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));
const grid = (fill: (r: number, c: number) => number): number[][] => DAYS.map((_, r) => HOURS.map((__, c) => fill(r, c)));

test('nothing is level 0, then a level a quarter of the busiest cell', () => {
  assert.equal(heatLevel(0, 8), 0);
  assert.equal(heatLevel(-1, 8), 0);
  assert.equal(heatLevel(Number.NaN, 8), 0);
  assert.equal(heatLevel(1, 8), 1);
  assert.equal(heatLevel(2, 8), 1);
  assert.equal(heatLevel(3, 8), 2);
  assert.equal(heatLevel(6, 8), 3);
  assert.equal(heatLevel(8, 8), 4);
  assert.equal(heatLevel(3, 0), 0);
});

test('the activity grid: 12px squares 3 apart after a gutter for the day names', () => {
  const g = heatgrid(DAYS, HOURS, grid(() => 1), 393);
  assert.equal(g.cells.length, 7 * 24);
  assert.equal(g.size, 12);
  const [a, b] = g.cells;
  assert.ok(a && b);
  assert.equal(b.x - a.x, 15);
  assert.equal(g.height, 18 + 7 * 15 - 3);
  assert.ok(g.gridW <= 393);
});

test('the squares are kept between 6px and 18px', () => {
  assert.equal(heatgrid(DAYS, HOURS, [], 120).size, 6);
  assert.equal(heatgrid(DAYS, HOURS, [], 2000).size, 18);
});

test('a row is never shorter than its name, so a phone gets upright bars', () => {
  const g = heatgrid(DAYS, HOURS, [], 200);
  assert.equal(g.size, 6);
  assert.equal(g.tall, 11);
  const [a, b] = g.rowLabels;
  assert.ok(a && b && b.y - a.y >= 14);
  assert.equal(heatgrid(DAYS, HOURS, [], 393).tall, 12);
});

test('column labels thin out so they never touch', () => {
  const g = heatgrid(DAYS, HOURS, [], 393);
  assert.deepEqual(
    g.colLabels.map((l) => l.text),
    ['00', '02', '04', '06', '08', '10', '12', '14', '16', '18', '20', '22'],
  );
  const phone = heatgrid(DAYS, HOURS, [], 200);
  assert.ok(phone.colLabels.length < 12);
  const [p, q] = phone.colLabels;
  assert.ok(p && q && q.x - p.x >= 20);
});

test('a missing value is nothing, not an error', () => {
  const g = heatgrid(DAYS, HOURS, [[4]], 393);
  assert.equal(g.cells[0]?.level, 4);
  assert.equal(g.cells[1]?.level, 0);
});

test('it reads as the busiest and quietest cells', () => {
  const values = grid((r, c) => (r === 6 && c === 9 ? 14 : c === 3 ? 0 : 2));
  assert.equal(describeHeat(DAYS, HOURS, values, 'Changes by hour'), 'Changes by hour: busiest Tue 09 (14), quietest Wed 03 (0)');
  assert.equal(describeHeat(DAYS, HOURS, []), 'Nothing yet');
});
