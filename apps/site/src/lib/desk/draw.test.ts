/**
 * The desk's drawings (`draw.ts`): a flat series still draws a line, the last month is the current one, and every
 * number in a path is rounded to one place.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { area, bars, BARS, spark } from './draw.ts';

const numbers = (d: string): string[] => d.match(/-?\d+(\.\d+)?/g) ?? [];

test('a flat series draws a flat line, not nothing', () => {
  for (const d of [spark([5, 5, 5, 5]).line, area([7, 7, 7]).line]) {
    assert.match(d, /^M0 [\d.]+( L[\d.]+ [\d.]+)+$/, d);
    assert.doesNotMatch(d, /NaN|Infinity/);
    const ys = new Set(d.split(' L').map((p) => p.split(' ').at(-1)));
    assert.equal(ys.size, 1, 'every point of a flat series sits at one height');
  }
  assert.doesNotMatch(spark([3]).line, /NaN/, 'one value draws a line across the box');
});

test('a rising series ends at the top of its box and starts at the bottom', () => {
  const d = spark([1, 2, 3], 84, 30).line;
  assert.equal(d, 'M0 27 L42 15 L84 3');
  assert.match(spark([1, 2, 3]).fill, /Z$/, 'the fill closes down to the floor');
});

test('numbers are rounded to one place', () => {
  for (const d of [spark([5.1, 5.4, 5.9, 6.3, 6.8, 7.2, 7.6, 7.9, 8.4]), area([52, 51, 49.5, 50.8, 48.2, 47.6, 46.9])]) {
    for (const n of [...numbers(d.line), ...numbers(d.fill)]) assert.match(n, /^-?\d+(\.\d)?$/, n);
  }
  for (const b of bars([{ label: 'Oct', value: 5.93 }, { label: 'Nov', value: 6.41 }])) {
    for (const n of [b.x, b.y, b.h]) assert.match(String(n), /^-?\d+(\.\d)?$/, String(n));
  }
});

test('the last bar is the current one, and the tallest stays under the top', () => {
  const months = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'].map((label, i) => ({ label, value: 5.9 + i / 2 }));
  const drawn = bars(months);
  assert.deepEqual(drawn.map((b) => b.now), [false, false, false, false, false, true]);
  assert.deepEqual(drawn.map((b) => b.label), ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar']);
  for (const b of drawn) {
    assert.ok(b.h > 0 && b.h < BARS.floor, `${b.label} is ${b.h} high`);
    assert.equal(Math.round((b.y + b.h) * 10) / 10, BARS.floor, `${b.label} stands on the floor`);
    assert.ok(b.x + b.w <= BARS.w, `${b.label} fits the box`);
  }
  assert.ok(drawn.at(-1)!.h > drawn[0]!.h, 'a taller month draws a taller bar');
});
