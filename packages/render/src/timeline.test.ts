/**
 * A ledger read newest first says each day once (`timeline.ts`), and a timeline whose days never repeat is left alone.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { timelineDays } from './timeline.ts';

const rows = (...days: string[]) => days.map((d) => ({ cells: [d, 'something'] }));

test('A DAY THAT REPEATS IS SAID ONCE, over the first of its rows', () => {
  assert.deepEqual(timelineDays(rows('1 Oct', '1 Oct', '30 Sep', '28 Sep', '28 Sep')), ['1 Oct', null, '30 Sep', '28 Sep', null]);
});

test('A TIMELINE WHOSE DAYS NEVER REPEAT IS NOT GROUPED, so no heading doubles its height', () => {
  assert.deepEqual(timelineDays(rows('3h ago', '2d ago', '5d ago')), [null, null, null]);
  assert.deepEqual(timelineDays(rows('1 Oct', '30 Sep', '1 Oct')), [null, null, null], 'the same day apart is not a run');
  assert.deepEqual(timelineDays([]), []);
});

test('A BLANK DAY STARTS NO GROUP and sits under the day above it; two blanks are not a run', () => {
  assert.deepEqual(timelineDays(rows('1 Oct', '1 Oct', '', '30 Sep')), ['1 Oct', null, null, '30 Sep']);
  assert.deepEqual(timelineDays(rows('', '', '1 Oct')), [null, null, null]);
  assert.deepEqual(timelineDays(rows('1 Oct', '', '1 Oct', '30 Sep')), ['1 Oct', null, null, '30 Sep'], 'a blank between two rows of a day does not say it again');
});

test('THE DAY IS COMPARED TRIMMED and said as the host wrote it, so `{{ago:}}` still goes through the inline renderer', () => {
  assert.deepEqual(timelineDays(rows('1 Oct ', '1 Oct')), ['1 Oct ', null]);
});
