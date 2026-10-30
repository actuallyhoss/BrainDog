/**
 * When a task falls due, as Work says it: late in the red phrase, today, tomorrow, the weekday and its day within six days, and the
 * day without its year in the reader's own year (the verifier's H10).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { todoDay, todoLines } from './todo.ts';

const NOW = Date.parse('2026-09-03T09:00:00Z');

test('A DAY GONE BY IS SAID AS HOW LATE, in the red phrase', () => {
  assert.equal(todoDay('30 Aug 2026', NOW), '{{bad:4 days late}}');
  assert.equal(todoDay('2 Sep 2026', NOW), '{{bad:1 day late}}');
});

test('today, tomorrow, the weekday and its day within six days, and the day without its year after that', () => {
  assert.equal(todoDay('3 Sep 2026', NOW), 'Today');
  assert.equal(todoDay('4 Sep 2026', NOW), 'Tomorrow');
  assert.equal(todoDay('7 Sep 2026', NOW), 'Mon 7 Sep');
  assert.equal(todoDay('9 Sep 2026', NOW), 'Wed 9 Sep');
  assert.equal(todoDay('21 Sep 2026', NOW), '21 Sep');
  assert.equal(todoDay('4 Jan 2027', NOW), '4 Jan 2027');
});

test('A TASK THAT IS DONE IS NEVER LATE, and a cell that is not a day is left as written', () => {
  assert.equal(todoDay('30 Aug 2026', NOW, true), '30 Aug');
  assert.equal(todoDay('Claude', NOW), 'Claude');
  assert.equal(todoDay('due 24 Sep', NOW), 'due 24 Sep');
});

test('A DAY IN THE SECOND CELL LEADS THE QUIET LINE, so a task reads "4 days late · Kiln" on one line', () => {
  assert.deepEqual(todoLines(['Turn auto-renew back on', '30 Aug 2026', 'Kiln', ''], NOW), { detail: '', meta: ['{{bad:4 days late}}', 'Kiln'] });
  assert.deepEqual(todoLines(['Variable axis QA', 'Claude', '6 Sep 2026', 'Kiln'], NOW), { detail: 'Claude', meta: ['Sun 6 Sep', 'Kiln'] });
  assert.deepEqual(todoLines(['Draft', 'waiting on copy', '', ''], NOW), { detail: 'waiting on copy', meta: [] });
});
