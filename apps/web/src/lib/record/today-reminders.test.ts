/**
 * The reminder lines on Today, read from the record's answer: only whole lines count, and a record that cannot say has none.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { remindersOf } from './today-live.ts';

test('whole lines are kept in the order sent and the rest are left out', () => {
  const got = remindersOf({
    lines: [
      { text: 'Rent is coming up.', at: '2026-10-20T08:00:00.000Z', rule: 'a' },
      { text: '   ', at: '2026-10-20T07:00:00.000Z' },
      { at: '2026-10-20T06:00:00.000Z' },
      { text: 'Phone is coming up.', at: '2026-10-19T08:00:00.000Z' },
    ],
  });
  assert.deepEqual(got, [
    { text: 'Rent is coming up.', at: '2026-10-20T08:00:00.000Z' },
    { text: 'Phone is coming up.', at: '2026-10-19T08:00:00.000Z' },
  ]);
});

test('an answer that is not a list of lines is no reminders', () => {
  assert.deepEqual(remindersOf(null), []);
  assert.deepEqual(remindersOf({ lines: 'x' }), []);
  assert.deepEqual(remindersOf(undefined), []);
});
