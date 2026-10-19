/**
 * Which automations put a line on Today: those with a notice carrying the Today tone, wherever the step sits.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { remindsToday } from '../src/methods/today-reminders.ts';

test('an inline rule with a Today notice reminds', () => {
  assert.equal(remindsToday({ rule: 'a', then: [{ tag: 'x' }, { notify: { say: 'Hi', tone: 'today' } }] }), true);
});

test('a notice inside a branch of a run still reminds', () => {
  assert.equal(remindsToday({ rule: 'a', steps: [{ if: 'x is y', then: [{ notify: { say: 'Hi', tone: 'today' } }] }] }), true);
});

test('a plain notice or another tone does not', () => {
  assert.equal(remindsToday({ then: [{ notify: { say: 'Hi' } }] }), false);
  assert.equal(remindsToday({ then: [{ notify: { say: 'Hi', tone: 'warm' } }] }), false);
  assert.equal(remindsToday(null), false);
});
