/**
 * A row's lead says its tone in words and labels its age.
 *
 * The page draws these beside the tone's dot, so what is held here is the wording and the day count, never the tone:
 * the colour stays `toneOf`'s. Every clock below is 25 September 2026, at the hour the case needs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addedSaid, agoSaid, daySaid, daysOf, daysTo, dueSaid, importKeysOnly, sentenceOf } from './said.ts';

/* THE AUDIT OF 25 OCTOBER, Z23 (`row-390-light.png`): Tags "kilnnotes:servicereading:oracle-a1:cpu:2026-09-28" listed as
   a fact. An import's keys are not a person's tags; a tag a person wrote is. */
test('TAGS THAT ARE ONLY AN IMPORT\'S KEYS ARE NOT LISTED, and a person\'s tags are', () => {
  assert.equal(importKeysOnly(['kilnnotes:servicereading:oracle-a1:cpu:2026-09-28']), true);
  assert.equal(importKeysOnly('kilnnotes:servicereading:oracle-a1:cpu:2026-09-28'), true);
  assert.equal(importKeysOnly(['kilnnotes:servicereading:oracle-a1:cpu:2026-09-28', 'urgent']), false);
  assert.equal(importKeysOnly(['client: Halden']), false);
  assert.equal(importKeysOnly([]), false);
  assert.equal(importKeysOnly(undefined), false);
});

const MORNING = Date.UTC(2026, 8, 25, 8);
const LATE = Date.UTC(2026, 8, 25, 23, 30);

test('A DEADLINE IS SAID IN CALENDAR DAYS, the unit the list dates its rows in', () => {
  assert.equal(dueSaid('2026-08-18', MORNING), '38 days late');
  assert.equal(dueSaid('2026-09-24', MORNING), '1 day late');
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
  assert.equal(addedSaid('2026-07-31T10:00:00.000Z', MORNING), 'added 7 weeks ago');
  assert.equal(addedSaid('2026-09-25T07:59:40.000Z', MORNING), 'added just now');
});

test('THE AGE SAYS ITS UNIT IN WORDS, never "7w" or "12h"', () => {
  assert.equal(agoSaid('2026-09-25T07:55:00.000Z', MORNING), '5 minutes ago');
  assert.equal(agoSaid('2026-09-24T20:00:00.000Z', MORNING), '12 hours ago');
  assert.equal(agoSaid('2026-09-24T07:00:00.000Z', MORNING), 'yesterday');
  assert.equal(agoSaid('2026-09-22T08:00:00.000Z', MORNING), '3 days ago');
  assert.equal(agoSaid('2026-05-25T08:00:00.000Z', MORNING), '4 months ago');
  assert.equal(agoSaid('2024-09-25T08:00:00.000Z', MORNING), '2 years ago');
  assert.equal(agoSaid('not a time', MORNING), '');
});

test('THE TITLE ROW SAYS WHERE THE ROW STANDS, WHEN IT IS DUE AND HOW OLD IT IS, in one sentence', () => {
  const said = (p: Partial<Parameters<typeof sentenceOf>[0]>) =>
    sentenceOf({ archived: false, state: true, finished: null, late: null, due: null, added: 'added 8w ago', ...p })
      .map((x) => (x.kind === 'state' ? '<Open>' : x.kind === 'late' ? `[${x.text}]` : x.text))
      .join('');
  assert.equal(said({ late: { text: '38 days late', tone: 'bad' } }), '<Open>, [38 days late], added 8w ago.');
  assert.equal(said({ due: { label: 'Due', day: '3 Oct' } }), '<Open>, due 3 Oct, added 8w ago.');
  assert.equal(said({ finished: '2 Sep' }), '<Open> 2 Sep, added 8w ago.');
  assert.equal(said({ state: false }), 'Added 8w ago.');
  assert.equal(said({ state: false, late: { text: 'Due today', tone: 'warn' } }), '[Due today], added 8w ago.');
  assert.equal(said({ archived: true }), 'Archived. <Open>, added 8w ago.');
});

test('ONLY THE LATE PHRASE IS A PIECE OF ITS OWN, so it is the only one coloured, and words run together', () => {
  const pieces = sentenceOf({ archived: false, state: false, finished: null, late: null, due: { label: 'Renews', day: '28 Feb' }, added: 'added 2d ago' });
  assert.deepEqual(pieces, [{ kind: 'words', text: 'Renews 28 Feb, added 2d ago.' }]);
  const late = sentenceOf({ archived: false, state: true, finished: null, late: { text: 'Due in 3 days', tone: 'warn' }, due: null, added: 'added 2d ago' });
  assert.deepEqual(late, [{ kind: 'state' }, { kind: 'words', text: ', ' }, { kind: 'late', text: 'due in 3 days', tone: 'warn' }, { kind: 'words', text: ', added 2d ago.' }]);
});

test('THE HISTORY IS GROUPED BY DAY, newest first as it came, as Today, Yesterday and then the day', () => {
  const at = (days: number, hour = 12) => new Date(MORNING - days * 86_400_000 + (hour - 8) * 3_600_000).toISOString();
  const lines = [{ at: at(0, 12) }, { at: at(0, 11) }, { at: at(1) }, { at: at(1, 11) }, { at: 'not a time' }, { at: at(23) }];
  const days = daysOf(lines, MORNING + 4 * 3_600_000);
  assert.deepEqual(
    days.map((d) => [d.said, d.lines.length]),
    [
      ['Today', 2],
      ['Yesterday', 3],
      ['2 Sep', 1],
    ],
  );
  assert.deepEqual(daysOf([], MORNING), []);
});
