import { test } from 'node:test';
import assert from 'node:assert/strict';

import { describeSparkline, labelBelow, sparkline } from './sparkline.ts';

const TAKINGS = [138, 142, 136, 145, 141, 128, 97, 95, 96];

test('the series spans the box inside the dot padding, highest at the top', () => {
  const g = sparkline(TAKINGS, { width: 120, height: 32 });
  assert.equal(g.points.length, 9);
  assert.equal(g.points[0]?.x, 4);
  assert.equal(g.points[8]?.x, 116);
  assert.equal(g.high?.v, 145);
  assert.equal(g.high?.y, 4);
  assert.equal(g.low?.v, 95);
  assert.equal(g.low?.y, 28);
  assert.equal(g.last?.v, 96);
});

test('the low and the high are the first of a tie', () => {
  const g = sparkline([5, 1, 9, 1, 9], { width: 100, height: 20 });
  assert.equal(g.low?.i, 1);
  assert.equal(g.high?.i, 2);
});

test('a flat series sits in the middle, and one value sits at the right', () => {
  const flat = sparkline([3, 3, 3], { width: 100, height: 40 });
  assert.ok(flat.points.every((p) => p.y === 20));
  const one = sparkline([7], { width: 100, height: 40 });
  assert.equal(one.points[0]?.x, 96);
  assert.equal(one.area, '');
});

test('nothing to draw is nothing drawn', () => {
  const g = sparkline([], { width: 100, height: 40 });
  assert.equal(g.line, '');
  assert.equal(g.last, null);
  assert.equal(g.threshold, null);
});

test('a value that is not a number is left out, and the others keep their places', () => {
  const g = sparkline([1, Number.NaN, 3], { width: 104, height: 20 });
  assert.deepEqual(
    g.points.map((p) => p.x),
    [4, 100],
  );
});

test('a threshold widens the scale so its rule is on the chart', () => {
  const g = sparkline([10, 20], { width: 100, height: 40, threshold: 0 });
  assert.equal(g.threshold, 36);
  assert.equal(g.points[1]?.y, 4);
});

test('the area closes down to the foot of the plot', () => {
  const g = sparkline([1, 2], { width: 100, height: 40 });
  assert.equal(g.area, '4,36 4,36 96,4 96,36');
});

test('a projection is dashed from its index on, sharing the joining point', () => {
  const g = sparkline([1, 2, 3, 4], { width: 100, height: 20, projectFrom: 2 });
  assert.equal(g.line.split(' ').length, 3);
  assert.equal(g.projection.split(' ').length, 2);
  assert.equal(g.line.split(' ')[2], g.projection.split(' ')[0]);
  assert.equal(sparkline([1, 2], { width: 100, height: 20, projectFrom: 5 }).projection, '');
});

test('a mark label takes a line of room on its side and stays inside the box', () => {
  assert.equal(labelBelow(TAKINGS, 'low'), true);
  assert.equal(labelBelow(TAKINGS, 'high'), false);
  assert.equal(labelBelow([1, 2], 'last'), false);
  assert.equal(labelBelow([2, 1], 'last'), true);

  const g = sparkline(TAKINGS, { width: 182, height: 48, mark: 'low', markLabel: 'low 95' });
  assert.equal(g.low?.y, 28);
  assert.ok(g.label && g.label.y <= 48 && g.label.y > (g.low?.y ?? 0));
  assert.equal(g.label?.anchor, 'end');
});

test('it reads as a sentence from its data', () => {
  assert.equal(
    describeSparkline(TAKINGS, 'acme.example takings a day, 9 weeks', 'low'),
    'acme.example takings a day, 9 weeks, from 138 to 96, low 95',
  );
  assert.equal(describeSparkline([1, 3, 2], undefined), 'From 1 to 2, low 1, high 3');
  assert.equal(describeSparkline([], 'Takings'), 'Takings, no figures yet');
  assert.equal(describeSparkline([4], 'Takings', 'last', (n) => `$${n}`), 'Takings, $4');
});
