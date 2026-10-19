import { test } from 'node:test';
import assert from 'node:assert/strict';

import { describeRing, ring } from './ring.ts';

test('a 140px ring, as in Needs you: 8px stroke, radius 66, and 53 of 58 as its dash', () => {
  const g = ring(53, 58, 140);
  assert.equal(g.stroke, 8);
  assert.equal(g.r, 66);
  assert.equal(g.c, 70);
  const len = 2 * Math.PI * 66;
  assert.equal(g.dash, `${Math.round((53 / 58) * len * 100) / 100} ${Math.round(len * 100) / 100}`);
  assert.equal(g.roomy, true);
  assert.equal(g.captioned, true);
});

test('the stroke thins with the size and never goes under 3px', () => {
  assert.equal(ring(1, 2, 48).stroke, 4);
  assert.equal(ring(1, 2, 20).stroke, 3);
  assert.equal(ring(1, 2, 48).roomy, false);
  assert.equal(ring(1, 2, 80).captioned, false);
});

test('the share is kept between none and all, and none draws no arc', () => {
  assert.equal(ring(0, 10, 96).dash, null);
  assert.equal(ring(5, 0, 96).dash, null);
  assert.equal(ring(20, 10, 96).share, 1);
  assert.equal(ring(-3, 10, 96).dash, null);
  const full = ring(10, 10, 96);
  const [on, all] = (full.dash ?? '').split(' ');
  assert.equal(on, all);
});

test('it reads as a sentence', () => {
  assert.equal(describeRing(53, 58, 'Filed by your rules'), 'Filed by your rules: 53 of 58');
  assert.equal(describeRing(3, 4, undefined, 'shards up'), '3 of 4, shards up');
});
