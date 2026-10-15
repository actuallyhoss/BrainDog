/**
 * A repeat that names its days: the 15th and the last of every month, or Tuesdays and Thursdays.
 *
 * Before this, `bymonthday` and `byday` were refused at install because the walk read neither (`repeat-keys.test.ts`),
 * so "paid on the 15th and the last day" had to be two rows, and a February with no 31st had nothing to clamp to.
 * Driven through `expandRepeat` and `remindersFor` from `schedule.ts` itself, because the kernel's index does not
 * export `REPEAT_READ` yet.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BYDAY, REPEAT_READ, expandRepeat, remindersFor, type Repeat } from '../src/schedule.ts';

const noon = (day: string): number => Date.parse(`${day}T12:00:00Z`);
const days = (anchor: string, repeat: Repeat, now = anchor, horizon = 400): string[] =>
  expandRepeat(noon(anchor), repeat, noon(now), horizon).map((ms) => new Date(ms).toISOString().slice(0, 10));

test('the 15th and the last day of every month, as one repeat', () => {
  assert.deepEqual(days('2026-09-15', { freq: 'monthly', bymonthday: [15, -1], count: 6 }), [
    '2026-09-15',
    '2026-09-30',
    '2026-10-15',
    '2026-10-31',
    '2026-11-15',
    '2026-11-30',
  ]);
  /* THE ORDER IT IS WRITTEN IN DOES NOT MATTER, and a day said twice is one day. */
  assert.deepEqual(days('2026-09-15', { freq: 'monthly', bymonthday: [-1, 15, 15], count: 2 }), ['2026-09-15', '2026-09-30']);
});

test('a row dated after the 15th first lands on the month’s last day, never on a 15th before it', () => {
  assert.deepEqual(days('2026-09-20', { freq: 'monthly', bymonthday: [15, -1], count: 3 }), ['2026-09-30', '2026-10-15', '2026-10-31']);
});

test('a 31st in February is clamped to its last day, in a leap year too', () => {
  assert.deepEqual(days('2027-01-31', { freq: 'monthly', bymonthday: [31], count: 3 }), ['2027-01-31', '2027-02-28', '2027-03-31']);
  assert.deepEqual(days('2028-01-31', { freq: 'monthly', bymonthday: [31], count: 2 }), ['2028-01-31', '2028-02-29']);
  /* AND THE 31st AND THE LAST ARE ONE DAY IN A SHORT MONTH, held once. */
  assert.deepEqual(days('2027-02-01', { freq: 'monthly', bymonthday: [31, -1], count: 2 }), ['2027-02-28', '2027-03-31']);
});

test('-2 is the day before the last, in a 30-day month and in February', () => {
  assert.deepEqual(days('2026-11-01', { freq: 'monthly', bymonthday: [-2], count: 3 }), ['2026-11-29', '2026-12-30', '2027-01-30']);
  assert.deepEqual(days('2027-02-01', { freq: 'monthly', bymonthday: [-3], count: 1 }), ['2027-02-26']);
});

test('Tuesdays and Thursdays, from a Tuesday and from the day between', () => {
  assert.deepEqual(days('2026-09-15', { freq: 'weekly', byday: ['TU', 'TH'], count: 4 }), ['2026-09-15', '2026-09-17', '2026-09-22', '2026-09-24']);
  assert.deepEqual(days('2026-09-16', { freq: 'weekly', byday: ['TH', 'TU'], count: 2 }), ['2026-09-17', '2026-09-22']);
  /* EVERY OTHER WEEK, counted in weeks that start on a Monday. */
  assert.deepEqual(days('2026-09-15', { freq: 'weekly', interval: 2, byday: ['TU', 'TH'], count: 4 }), [
    '2026-09-15',
    '2026-09-17',
    '2026-09-29',
    '2026-10-01',
  ]);
});

test('a 15th on a Saturday moves to the Friday with workday: previous, and stays with none', () => {
  const saturday = { freq: 'monthly', bymonthday: [15], count: 1 } as const;
  assert.equal(new Date(noon('2026-08-15')).getUTCDay(), 6);
  assert.deepEqual(days('2026-08-15', { ...saturday, workday: 'previous' }), ['2026-08-14']);
  assert.deepEqual(days('2026-08-15', { ...saturday, workday: 'next' }), ['2026-08-17']);
  assert.deepEqual(days('2026-08-15', { ...saturday, workday: 'none' }), ['2026-08-15']);
  assert.deepEqual(days('2026-08-15', saturday), ['2026-08-15'], 'none is the same as leaving it out');
  /* AND THE LAST DAY OF OCTOBER, A SATURDAY, BESIDE A 15th THAT IS A THURSDAY: only the rest day moves. */
  assert.deepEqual(days('2026-10-01', { freq: 'monthly', bymonthday: [15, -1], count: 2, workday: 'previous' }), ['2026-10-15', '2026-10-30']);
});

test('count and until still end it, counted in days and not in months', () => {
  assert.equal(days('2026-09-15', { freq: 'monthly', bymonthday: [15, -1], count: 3 }).length, 3);
  assert.deepEqual(days('2026-09-15', { freq: 'monthly', bymonthday: [15, -1], until: '2026-10-20' }), ['2026-09-15', '2026-09-30', '2026-10-15']);
  assert.deepEqual(days('2026-09-15', { freq: 'weekly', byday: ['TU', 'TH'], until: '2026-09-22' }), ['2026-09-15', '2026-09-17', '2026-09-22']);
});

test('a row set up years ago still finds this month’s days, not five hundred that already happened', () => {
  const now = '2026-10-01';
  const ahead = days('2019-03-15', { freq: 'monthly', bymonthday: [15, -1] }, now).filter((d) => d >= now);
  assert.deepEqual(ahead.slice(0, 3), ['2026-10-15', '2026-10-31', '2026-11-15']);
  const weekly = days('2019-03-12', { freq: 'weekly', byday: ['TU', 'TH'] }, now).filter((d) => d >= now);
  assert.deepEqual(weekly.slice(0, 2), ['2026-10-01', '2026-10-06']);
});

test('a key on the wrong frequency is not read: bymonthday on a weekly repeat walks the plain week', () => {
  assert.deepEqual(days('2026-09-15', { freq: 'weekly', bymonthday: [1], count: 2 }), ['2026-09-15', '2026-09-22']);
  assert.deepEqual(days('2026-09-15', { freq: 'monthly', byday: ['TH'], count: 2 }), ['2026-09-15', '2026-10-15']);
});

test('the reminders follow both days, one per occurrence', () => {
  const entry = { id: 'e_salary', register: 'bills', fields: { due: '2026-09-15' }, deleted: false };
  const field = { id: 'due', type: 'day', repeat: { freq: 'monthly', bymonthday: [15, -1], count: 4 } as Repeat };
  const at = remindersFor(entry, field, noon('2026-09-15') - 3_600_000).map((r) => r.dueAt.slice(0, 10));
  assert.deepEqual(at, ['2026-09-15', '2026-09-30', '2026-10-15', '2026-10-31']);
});

test('REPEAT_READ names every key the walk reads, and BYDAY the seven day words', () => {
  assert.deepEqual([...REPEAT_READ].sort(), ['byday', 'bymonthday', 'count', 'freq', 'interval', 'until', 'workday']);
  assert.deepEqual(Object.keys(BYDAY).sort(), ['FR', 'MO', 'SA', 'SU', 'TH', 'TU', 'WE']);
});
