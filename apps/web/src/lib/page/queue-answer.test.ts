/**
 * What a question card says without a DOM (`queue-answer.ts`): here, the one quiet line a question put off carries.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { laterLine } from './queue-answer.ts';

const now = Date.parse('2026-10-02T09:00:00Z');

test('A QUESTION PUT OFF SAYS WHEN IT COMES BACK, and why, and any other question says nothing', () => {
  const soon = laterLine({ until: '2026-10-05', until_why: 'Until the quote lands' }, now);
  assert.ok(soon?.startsWith('Comes back '), soon ?? 'no line');
  assert.ok(soon?.endsWith(' · Until the quote lands'), soon ?? 'no line');
  assert.equal(soon, 'Comes back in 3d · Until the quote lands', 'inside a week the day is said relative to today');

  assert.equal(laterLine({ until: '2026-11-20', until_why: '' }, now), 'Comes back on 20 Nov');
  assert.equal(laterLine({ until: '2026-11-20', until_why: '  ' }, now), 'Comes back on 20 Nov', 'a blank why is no why');
  assert.equal(laterLine({}, now), null, 'an open question carries no day');
  assert.equal(laterLine({ until: 'someday' }, now), null, 'a day that does not read draws no line');
});
