/**
 * A row's lead says its tone in words and labels its age (design.md DSN-14, SYS-10).
 *
 * The page draws these beside the tone's dot, so what is held here is the wording and the day count, never the tone:
 * the colour stays `toneOf`'s. Every clock below is 25 September 2026, at the hour the case needs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addedSaid, daySaid, daysTo, dueSaid } from './said.ts';

const MORNING = Date.UTC(2026, 8, 25, 8);
const LATE = Date.UTC(2026, 8, 25, 23, 30);

test('A DEADLINE IS SAID IN CALENDAR DAYS, the unit the list dates its rows in', () => {
  assert.equal(dueSaid('2026-08-18', MORNING), 'Overdue by 38 days');
  assert.equal(dueSaid('2026-09-24', MORNING), 'Overdue by 1 day');
  assert.equal(dueSaid('2026-09-26', MORNING), 'Due tomorrow');
  assert.equal(dueSaid('2026-09-28', MORNING), 'Due in 3 days');
});

test('TODAY IS TODAY AT EVERY HOUR OF IT, never overdue by a day that has not ended', () => {
  assert.equal(dueSaid('2026-09-25', MORNING), 'Due today');
  assert.equal(dueSaid('2026-09-25', LATE), 'Due today');
  assert.equal(daysTo('2026-09-25', LATE), 0);
});

test('A VALUE THAT IS NOT A DAY IS SAID AS NOTHING, never as a guessed distance', () => {
  assert.equal(dueSaid('soon', MORNING), null);
  assert.equal(dueSaid('2026-09-25T10:00:00.000Z', MORNING), null);
  assert.equal(daySaid('soon', MORNING), 'soon');
});

test('A DAY INSIDE THE YEAR DROPS ITS YEAR, and one outside keeps it', () => {
  assert.equal(daySaid('2026-09-02', MORNING), '2 Sep');
  assert.equal(daySaid('2025-09-02', MORNING), '2 Sep 2025');
  assert.equal(daySaid('2027-01-04', MORNING), '4 Jan 2027');
});

test('THE AGE CARRIES ITS LABEL, so it is never read as the date beside it', () => {
  assert.equal(addedSaid('2026-07-31T10:00:00.000Z', MORNING), 'added 8w ago');
  assert.equal(addedSaid('2026-09-25T07:59:40.000Z', MORNING), 'added just now');
});
