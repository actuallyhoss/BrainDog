/**
 * A figure counts to its new value only when it is one number before and after, in the same words (`count.ts`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { between, counts, shapeOf } from './count.ts';

test('a figure is read with what surrounds it', () => {
  assert.deepEqual(shapeOf('£1,240.50'), { pre: '£', n: 1240.5, post: '', places: 2, grouped: true });
  assert.deepEqual(shapeOf('12 late'), { pre: '', n: 12, post: ' late', places: 0, grouped: false });
  assert.equal(shapeOf('12 of 20'), null, 'two numbers are not one figure');
  assert.equal(shapeOf('Tuesday'), null);
  assert.equal(shapeOf('1,24,0'), null, 'digits grouped wrongly are not a figure');
});

test('it counts only in the same currency, sign and unit', () => {
  assert.ok(counts('£1,240', '£1,310'));
  assert.equal(counts('£1,240', '€1,310'), null);
  assert.equal(counts('−£40', '£40'), null, 'a sign that flipped rolls');
  assert.equal(counts('3 days', '2 day'), null);
  assert.equal(counts('£40', '£40'), null, 'nothing to count');
});

test('the way between is written as the new figure is', () => {
  const pair = counts('£1,000.00', '£2,000.00');
  assert.ok(pair);
  assert.equal(between(pair[0], pair[1], 0.5), '£1,500.00');
  assert.equal(between(pair[0], pair[1], 1), '£2,000.00');
  const plain = counts('8', '12');
  assert.ok(plain);
  assert.equal(between(plain[0], plain[1], 0.5), '10');
});
