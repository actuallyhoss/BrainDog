/**
 * When a repeating date comes round next, read without rolling the row.
 *
 * A repeating date keeps the day it was given (HD.72: "by itself", with nothing stored), and `nextRepeat` derives the
 * next one on or after now in the record's own zone. The risk the scope names is time zones: a day computed at UTC
 * lands a day early west of UTC, so a payday in Los Angeles at seven in the evening must still say today.
 * Imported from `schedule.ts` itself, because the kernel's index does not export it yet.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { nextRepeat, type Repeat } from '../src/schedule.ts';

const at = (text: string): number => Date.parse(text);
const paydays: Repeat = { freq: 'monthly', bymonthday: [15, -1] };

test('the next one after today', () => {
  assert.equal(nextRepeat('2026-09-15', paydays, at('2026-10-20T12:00:00Z'), 'UTC'), '2026-10-31');
  assert.equal(nextRepeat('2026-09-15', { freq: 'weekly', byday: ['TU', 'TH'] }, at('2026-10-16T12:00:00Z'), 'UTC'), '2026-10-20');
  /* A ROW SET UP YEARS AGO answers this month, and a two-yearly one reaches past the usual horizon. */
  assert.equal(nextRepeat('2019-03-15', paydays, at('2026-10-20T12:00:00Z'), 'UTC'), '2026-10-31');
  assert.equal(nextRepeat('2025-03-01', { freq: 'yearly', interval: 2 }, at('2026-01-01T12:00:00Z'), 'UTC'), '2027-03-01');
});

test('on the day itself, it is today, even late in the day', () => {
  assert.equal(nextRepeat('2026-09-15', paydays, at('2026-10-15T00:00:00Z'), 'UTC'), '2026-10-15');
  assert.equal(nextRepeat('2026-09-15', paydays, at('2026-10-15T23:59:00Z'), 'UTC'), '2026-10-15');
  /* THE ROW'S OWN DAY, when that is today, is next. */
  assert.equal(nextRepeat('2026-10-15', paydays, at('2026-10-15T08:00:00Z'), 'UTC'), '2026-10-15');
});

test('a rest day moved back to the Friday is next on the Friday, and gone by the Saturday', () => {
  const previous: Repeat = { ...paydays, workday: 'previous' };
  /* 15 August 2026 is a Saturday. */
  assert.equal(nextRepeat('2026-07-15', previous, at('2026-08-14T12:00:00Z'), 'UTC'), '2026-08-14');
  assert.equal(nextRepeat('2026-07-15', previous, at('2026-08-15T12:00:00Z'), 'UTC'), '2026-08-31');
  assert.equal(nextRepeat('2026-07-15', { ...paydays, workday: 'none' }, at('2026-08-15T12:00:00Z'), 'UTC'), '2026-08-15');
  /* THE RECORD'S OWN REST DAYS: in Cairo Friday and Saturday rest, so the Saturday 15th moves to Thursday. */
  assert.equal(nextRepeat('2026-07-15', previous, at('2026-08-10T12:00:00Z'), 'UTC', new Set([5, 6])), '2026-08-13');
});

test('none after until, and none once its count has run out', () => {
  assert.equal(nextRepeat('2026-09-15', { ...paydays, until: '2026-10-15' }, at('2026-10-14T12:00:00Z'), 'UTC'), '2026-10-15');
  assert.equal(nextRepeat('2026-09-15', { ...paydays, until: '2026-10-15' }, at('2026-10-20T12:00:00Z'), 'UTC'), null);
  assert.equal(nextRepeat('2026-09-15', { ...paydays, count: 2 }, at('2026-10-01T12:00:00Z'), 'UTC'), null);
  assert.equal(nextRepeat('2026-09-15', { ...paydays, count: 3 }, at('2026-10-01T12:00:00Z'), 'UTC'), '2026-10-15');
});

test('a time zone across midnight: the day is the record’s, not UTC’s', () => {
  /* 02:00 UTC on the 16th is 19:00 on the 15th in Los Angeles: the 15th is still today there. */
  const late = at('2026-10-16T02:00:00Z');
  assert.equal(nextRepeat('2026-09-15', { freq: 'monthly' }, late, 'UTC'), '2026-11-15');
  assert.equal(nextRepeat('2026-09-15', { freq: 'monthly' }, late, 'America/Los_Angeles'), '2026-10-15');
  /* 16:00 UTC on the 15th is 01:00 on the 16th in Tokyo: the 15th has gone there. */
  const early = at('2026-10-15T16:00:00Z');
  assert.equal(nextRepeat('2026-09-15', { freq: 'monthly' }, early, 'UTC'), '2026-10-15');
  assert.equal(nextRepeat('2026-09-15', { freq: 'monthly' }, early, 'Asia/Tokyo'), '2026-11-15');
});

test('an instant answers an instant, compared with now itself', () => {
  const weekly: Repeat = { freq: 'weekly' };
  assert.equal(nextRepeat('2026-09-15T09:00:00.000Z', weekly, at('2026-10-13T08:00:00Z'), 'UTC'), '2026-10-13T09:00:00.000Z');
  assert.equal(nextRepeat('2026-09-15T09:00:00.000Z', weekly, at('2026-10-13T10:00:00Z'), 'UTC'), '2026-10-20T09:00:00.000Z');
});

test('it never writes: the value and the repeat are what they were, and a non-date or unknown zone has no next', () => {
  const repeat = Object.freeze({ ...paydays, bymonthday: Object.freeze([15, -1]) }) as Repeat;
  const value = '2026-09-15';
  assert.equal(nextRepeat(value, repeat, at('2026-10-20T12:00:00Z'), 'UTC'), '2026-10-31');
  assert.equal(value, '2026-09-15');
  assert.deepEqual(repeat, { freq: 'monthly', bymonthday: [15, -1] });
  assert.equal(nextRepeat('soon', repeat, at('2026-10-20T12:00:00Z'), 'UTC'), null);
  assert.equal(nextRepeat(value, repeat, at('2026-10-20T12:00:00Z'), 'Nowhere/Atlantis'), null);
  assert.equal(nextRepeat(value, { freq: 'fortnightly' } as never, at('2026-10-20T12:00:00Z'), 'UTC'), null);
});
