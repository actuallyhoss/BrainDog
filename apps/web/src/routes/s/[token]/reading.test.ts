/**
 * A shared figure's trend and the line under it, held without a browser. Every number in a line is one the series
 * carried; a series too short to be a trend says nothing at all.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { spanSaid, trendOf, trendSaid } from './reading.ts';

const plain = (n: number): string => n.toLocaleString('en');

test('a reading with no trend, or a trend of one figure, draws no chart', () => {
  assert.equal(trendOf({ metric: 'mrr', value: 4, unit: null }), null);
  assert.equal(trendOf({ trend: 'up' }), null);
  assert.equal(trendOf({ trend: [null, 4, null] }), null);
});

test('a day with no reading keeps its place as NaN, so the line is not squeezed', () => {
  const t = trendOf({ trend: [3, null, 5] });
  assert.ok(t);
  assert.equal(t.length, 3);
  assert.equal(t[0], 3);
  assert.ok(Number.isNaN(t[1]));
  assert.equal(t[2], 5);
});

test('the line says which way, by how much, from where to where, over how long', () => {
  const weeks = [4100, ...Array.from({ length: 82 }, () => Number.NaN), 4600];
  assert.equal(weeks.length, 84);
  assert.equal(trendSaid(weeks, plain), 'Up 12% over the last 12 weeks, from 4,100 to 4,600.');
  assert.equal(trendSaid([200, 150, 150], plain), 'Down 25% over the last 3 days, from 200 to 150.');
});

test('a series that ends where it began held, and one from zero names its two ends', () => {
  assert.equal(trendSaid([10, 12, 10], plain), 'Held at 10 over the last 3 days.');
  assert.equal(trendSaid([0, 3, 7], plain), 'From 0 to 7 over the last 3 days.');
  assert.equal(trendSaid([0, 0], plain), 'Held at 0 over the last 2 days.');
});

test('too little to be a trend says nothing', () => {
  assert.equal(trendSaid([Number.NaN, 4], plain), null);
  assert.equal(trendSaid([], plain), null);
});

test('a span is counted in weeks only when it is whole weeks', () => {
  assert.equal(spanSaid(14), '2 weeks');
  assert.equal(spanSaid(90), '90 days');
  assert.equal(spanSaid(7), '7 days');
  assert.equal(spanSaid(1), '1 day');
});
