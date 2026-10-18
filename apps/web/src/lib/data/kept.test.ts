/** `kept.ts`: an answer kept by the record's version, drawn at once, never a refusal, never past five minutes or midnight. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { forgetKept, keep, keptAnswer, KEPT_MOST, KEPT_MS } from './kept.ts';

const NOON = new Date(2026, 9, 18, 12).getTime();
const ok = (value: unknown) => ({ ok: true as const, value });

test('THE SAME NAME, KEY AND VERSION IS FRESH; a moved version is drawn but not fresh', () => {
  forgetKept();
  keep('work', 'https://a', 7, ok([1, 2]), NOON);
  assert.deepEqual(keptAnswer('work', 'https://a', 7, NOON + 1_000), { got: ok([1, 2]), fresh: true });
  assert.deepEqual(keptAnswer('work', 'https://a', 8, NOON + 1_000), { got: ok([1, 2]), fresh: false });
  assert.equal(keptAnswer('work', 'https://b', 7, NOON), null, 'another record is another key');
  assert.equal(keptAnswer('page', 'https://a', 7, NOON), null, 'another screen is another name');
});

test('A REFUSAL IS NOT KEPT AND DROPS WHAT WAS; five minutes, midnight and forget drop it too', () => {
  forgetKept();
  keep('work', 'k', 1, ok('a'), NOON);
  keep('work', 'k', 1, { ok: false, refusal: { code: 'REGISTER_UNKNOWN', fix: 'This record holds no tasks list.' } }, NOON);
  assert.equal(keptAnswer('work', 'k', 1, NOON), null);

  keep('work', 'k', 1, ok('a'), NOON);
  assert.equal(keptAnswer('work', 'k', 1, NOON + KEPT_MS), null);
  const late = new Date(2026, 9, 18, 23, 58).getTime();
  keep('work', 'k', 1, ok('a'), late);
  assert.equal(keptAnswer('work', 'k', 1, late + 3 * 60_000), null, 'past the reader’s midnight');

  keep('work', 'k', 1, ok('a'), NOON);
  forgetKept();
  assert.equal(keptAnswer('work', 'k', 1, NOON), null);
});

test('AT MOST KEPT_MOST ANSWERS, the oldest dropped first', () => {
  forgetKept();
  for (let i = 0; i <= KEPT_MOST; i += 1) keep('page', `p${i}`, 1, ok(i), NOON);
  assert.equal(keptAnswer('page', 'p0', 1, NOON), null);
  assert.notEqual(keptAnswer('page', `p${KEPT_MOST}`, 1, NOON), null);
});
