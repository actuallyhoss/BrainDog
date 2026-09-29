/**
 * A row's lead says its tone in words and labels its age (design.md DSN-14, SYS-10).
 *
 * The page draws these beside the tone's dot, so what is held here is the wording and the day count, never the tone:
 * the colour stays `toneOf`'s. Every clock below is 25 September 2026, at the hour the case needs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addedSaid, daySaid, daysOf, daysTo, dueSaid, sentenceOf } from './said.ts';

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

test('THE TITLE ROW SAYS WHERE THE ROW STANDS, WHEN IT IS DUE AND HOW OLD IT IS, in one sentence', () => {
  const said = (p: Partial<Parameters<typeof sentenceOf>[0]>) =>
    sentenceOf({ archived: false, state: true, finished: null, late: null, due: null, added: 'added 8w ago', ...p })
      .map((x) => (x.kind === 'state' ? '<Open>' : x.kind === 'late' ? `[${x.text}]` : x.text))
      .join('');
  assert.equal(said({ late: { text: 'Overdue by 38 days', tone: 'bad' } }), '<Open>, [overdue by 38 days], added 8w ago.');
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
