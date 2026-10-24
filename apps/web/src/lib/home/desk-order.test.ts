/**
 * The desk's document order is its picture's order (`desk-order.ts`): the page's tiles in the order they are seen, and
 * Home's own parts standing among them where they are seen.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DESK_KEYS } from './default-home.ts';
import { anchorsFor, inPicture, rankOf } from './desk-order.ts';

const b = (key?: string, drawn = true) => ({ key, drawn });
const keysOf = (list: readonly { key?: string | undefined }[]) => list.map((x) => x.key ?? '-');

test("THE PAGE'S TILES ARE PUT IN THE PICTURE'S ORDER, and what the desk folds keeps the order it was declared in", () => {
  const declared = [b('week-due'), b('week-money'), b('numbers'), b('needs-you'), b(), b('working'), b('cash'), b('coming-up'), b('faces'), b()];
  assert.deepEqual(keysOf(inPicture(declared)), ['needs-you', 'working', 'cash', 'numbers', 'week-due', 'week-money', 'coming-up', 'faces', '-', '-']);
  assert.deepEqual(keysOf(inPicture([b('x1'), b('needs-you'), b('x2')])), ['needs-you', 'x1', 'x2']);
});

test('EVERY KEY THE DESK SHOWS AT REST HAS A PLACE IN THE ORDER', () => {
  for (const key of DESK_KEYS) assert.ok(rankOf({ key }) < 30, key);
});

test('THE FOOT OF NEEDS YOU STANDS BEFORE CASH, AND WHAT LANDED AFTER THE PROJECTS AND BEFORE WHAT IS COMING UP', () => {
  const blocks = inPicture([b('needs-you'), b('cash'), b('week-due'), b('projects'), b('coming-up'), b('faces'), b(), b()]);
  assert.deepEqual(keysOf(blocks), ['needs-you', 'cash', 'week-due', 'projects', 'coming-up', 'faces', '-', '-']);
  const { at, tail } = anchorsFor(blocks, true);
  assert.deepEqual(
    [...at],
    [
      [1, ['needs']],
      [4, ['landed']],
    ],
  );
  assert.deepEqual(tail, []);
});

test('WHAT IS LATE LEADS THE DESK, whatever key it is declared under, and who is working comes after Needs you', () => {
  const late = { key: 'overdue', drawn: true, desk: { kind: 'late' } };
  assert.deepEqual(keysOf(inPicture([b('cash'), b('working'), b('needs-you'), late])), ['overdue', 'needs-you', 'working', 'cash']);
});

test('A PART WITH NOTHING AFTER IT FOLLOWS THE READER, and an undrawn block is never what a part stands before', () => {
  const blocks = inPicture([b('needs-you'), b('cash', false), b('coming-up'), b('x', false)]);
  const { at, tail } = anchorsFor(blocks, true);
  assert.deepEqual([...at], [[2, ['needs', 'landed']]]);
  assert.deepEqual(tail, []);
});

test("WITHOUT A READER EVERY PART FOLLOWS IT, in the picture's order", () => {
  assert.deepEqual(anchorsFor([b('needs-you')], false).tail, ['needs', 'landed']);
});

test('THE FEW KEY NUMBERS ARE A ROW OF THEIR OWN AFTER CASH: the foot of Needs you stands before them, what landed after', () => {
  assert.ok(rankOf({ key: 'cash' }) < rankOf({ key: 'numbers' }) && rankOf({ key: 'numbers' }) < rankOf({ key: 'week-due' }));
  const blocks = inPicture([b('coming-up'), b('numbers'), b('needs-you'), b('cash')]);
  assert.deepEqual(keysOf(blocks), ['needs-you', 'cash', 'numbers', 'coming-up']);
  const { at, tail } = anchorsFor(blocks, true);
  assert.deepEqual(
    [...at],
    [
      [1, ['needs']],
      [3, ['landed']],
    ],
  );
  assert.deepEqual(tail, []);
  /* WITH NO KEY NUMBER DRAWN, what landed still stands after cash and before what is coming up. */
  const none = anchorsFor(inPicture([b('needs-you'), b('cash'), b('numbers', false), b('coming-up')]), true);
  assert.deepEqual([...none.at], [[1, ['needs']], [3, ['landed']]]);
});
