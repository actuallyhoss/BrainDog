import { test } from 'node:test';
import assert from 'node:assert/strict';

import { describeSegments, segments } from './segments.ts';

test('cells share the width 3px apart, done first, then the current, then the rest', () => {
  const s = segments(5, 4, 102, true);
  assert.equal(s.length, 5);
  assert.equal(s[0]?.w, 18);
  assert.equal(s[1]?.x, 21);
  assert.deepEqual(
    s.map((c) => c.state),
    ['done', 'done', 'done', 'done', 'current'],
  );
  assert.ok(Math.abs((s[4]?.x ?? 0) + (s[4]?.w ?? 0) - 102) < 0.02);
});

test('with no current step the next one is simply the rest', () => {
  assert.deepEqual(
    segments(4, 2, 81).map((c) => c.state),
    ['done', 'done', 'rest', 'rest'],
  );
});

test('done is kept between none and all', () => {
  assert.equal(segments(3, 9, 90, true).filter((c) => c.state === 'done').length, 3);
  assert.equal(segments(3, 9, 90, true).some((c) => c.state === 'current'), false);
  assert.equal(segments(3, -1, 90).filter((c) => c.state === 'done').length, 0);
});

test('many steps close the gap rather than thin the cells past it', () => {
  const tight = segments(40, 2, 200);
  assert.equal((tight[1]?.x ?? 0) - (tight[0]?.w ?? 0), 1);
  const crowded = segments(200, 2, 300);
  assert.equal(crowded[1]?.x, crowded[0]?.w);
  assert.ok(crowded.every((c) => c.rx <= c.w / 2));
});

test('no steps, or no room, draws nothing', () => {
  assert.deepEqual(segments(0, 0, 100), []);
  assert.deepEqual(segments(5, 1, 0), []);
  assert.deepEqual(segments(Number.NaN, 1, 100), []);
});

test('it reads as a sentence', () => {
  assert.equal(describeSegments(23, 10, 'Nile, parts paid', true), 'Nile, parts paid: 10 of 23 done, the 11th current');
  assert.equal(describeSegments(4, 2, undefined), '2 of 4 done');
  assert.equal(describeSegments(4, 4, undefined, true), '4 of 4 done');
});
