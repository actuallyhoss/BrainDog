/**
 * A ledger read newest first says each day once (`timeline.ts`), and a timeline whose days never repeat is left alone.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dayThisYear, rowsCell, timelineCell, timelineDays } from './timeline.ts';

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

test('A DAY THIS YEAR DROPS ITS YEAR, and any other year, or a day inside words, is left as written', () => {
  const now = Date.UTC(2026, 9, 2, 12);
  assert.equal(dayThisYear('1 Jul 2026', now), '1 Jul');
  assert.equal(dayThisYear('30 Aug 2026', now), '30 Aug');
  assert.equal(dayThisYear('28 Dec 2025', now), '28 Dec 2025');
  assert.equal(dayThisYear('Aiming for 20 Sep 2026', now), 'Aiming for 20 Sep 2026');
  assert.equal(dayThisYear('3h ago', now), '3h ago');
});

test('AN AMOUNT OF NOTHING IS NOT SAID on a timeline, and on rows only where it moves, since a balance of nothing is a fact', () => {
  const now = Date.UTC(2026, 9, 2, 12);
  for (const zero of ['−GBP 0.00', '+GBP 0.00', '−£0', '£0.00', 'GBP 0', 'JPY 0']) assert.equal(timelineCell(zero, now), '', zero);
  for (const said of ['−GBP 9,190.00', '−£0.01', '0', 'Wildcard certificate', '']) assert.equal(timelineCell(said, now), said, said);
  assert.equal(timelineCell(undefined, now), '');
  assert.equal(rowsCell('−£0', now), '');
  assert.equal(rowsCell('+GBP 0.00', now), '');
  assert.equal(rowsCell('£0', now), '£0', 'a balance of nothing stays');
  assert.equal(rowsCell('1 Jul 2026', now), '1 Jul');
});
