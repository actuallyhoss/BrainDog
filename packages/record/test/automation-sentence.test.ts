/**
 * The words `automationSentence` answers with: how a look over the last days is said, and the id a sentence is given.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lookLine, slugOf } from '../src/methods/automation-sentence.ts';

test('a look that found rows names them and says how many', () => {
  assert.equal(lookLine(2, false, ['Rent', 'Phone']), 'It would have run 2 times in the last 30 days: Rent, Phone.');
  assert.equal(lookLine(1, false, ['Rent']), 'It would have run 1 time in the last 30 days: Rent.');
});

test('a look that read only part of the rows says at least, and more', () => {
  assert.equal(lookLine(9, true, ['a', 'b', 'c', 'd', 'e']), 'It would have run at least 9 times in the last 30 days: a, b, c, d, e, and more.');
});

test('a look that found nothing says it would not have run', () => {
  assert.equal(lookLine(0, false, []), 'It would not have run in the last 30 days.');
});

test('a sentence becomes an id in the declaration grammar', () => {
  const id = slugOf('When a bill is due in 3 days, tell me.');
  assert.match(id, /^[a-z][a-z0-9-]{0,31}$/u);
  assert.equal(id, 'when-a-bill-is-due-in-3-days-tel');
  assert.match(slugOf('3 days'), /^r-3-days$/u);
  assert.equal(slugOf('!!!'), 'automation');
});
