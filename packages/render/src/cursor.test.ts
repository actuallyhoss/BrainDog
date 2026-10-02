/**
 * The row cursor's contract (`cursor.ts`): a row's key, the row a key names, and what a number key answers.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CHOICE_KEYS, choiceOf, rowAt, rowKey } from './cursor.ts';

const typed = { cells: ['Draft the issue'] };
const kept = { cells: ['Send the quote'], ref: { register: 'tasks', seq: 12, version: 3 } };

test('A ROW THE RECORD HOLDS IS KEYED BY ITS LIST AND NUMBER, and a typed row by its place', () => {
  assert.equal(rowKey(kept, 4), 'tasks#12', 'the same wherever the block sorts it');
  assert.equal(rowKey(typed, 0), '0');
  assert.equal(rowAt([typed, kept], 'tasks#12'), kept);
  assert.equal(rowAt([typed, kept], '0'), typed);
  assert.equal(rowAt([typed, kept], '1'), undefined, 'a kept row is not found by its place');
});

test('A NUMBER KEY ANSWERS THE QUESTION UNDER THE CURSOR, or the first, and nothing past 9', () => {
  const a = { cells: ['q', 'a'] };
  const b = { cells: ['q', 'b'], ref: { register: 'governance', seq: 7, version: 1 } };
  const items = [
    { row: a, options: ['yes', 'no'] },
    { row: b, options: ['raise', 'leave', 'ask'] },
  ];
  const rows = [a, { cells: ['opt'] }, b];
  assert.deepEqual(choiceOf(rows, items, 1, 'governance#7'), { row: b, option: 'leave' });
  assert.deepEqual(choiceOf(rows, items, 0, null), { row: a, option: 'yes' }, 'no cursor answers the first question');
  assert.deepEqual(choiceOf(rows, items, 0, '0'), { row: a, option: 'yes' });
  assert.equal(choiceOf(rows, items, 2, '0'), null, 'the first question has two options');
  assert.equal(choiceOf(rows, items, 0, '1'), null, 'a key that names no question answers nothing');
  assert.equal(choiceOf(rows, items, -1, null), null);
  assert.equal(choiceOf(rows, items, CHOICE_KEYS, null), null);
  assert.equal(choiceOf(rows, [], 0, null), null);
});
