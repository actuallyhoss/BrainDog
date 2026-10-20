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
  const declared = [b('week-due'), b('week-money'), b('needs-you'), b(), b('working'), b('cash'), b('coming-up'), b('faces'), b()];
  assert.deepEqual(keysOf(inPicture(declared)), ['needs-you', 'working', 'cash', 'week-due', 'week-money', 'coming-up', 'faces', '-', '-']);
  assert.deepEqual(keysOf(inPicture([b('x1'), b('needs-you'), b('x2')])), ['needs-you', 'x1', 'x2']);
});

test('EVERY KEY THE DESK SHOWS AT REST HAS A PLACE IN THE ORDER', () => {
  for (const key of DESK_KEYS) assert.ok(rankOf({ key }) < 30, key);
});

test('THE FOOT OF NEEDS YOU AND WHO IS WORKING STAND BEFORE CASH, THE PROJECTS AND WHAT LANDED BEFORE WHAT IS COMING UP, AND MORE BEFORE WHAT IT OPENS', () => {
  const blocks = inPicture([b('needs-you'), b('cash'), b('week-due'), b('coming-up'), b('faces'), b(), b()]);
  const { at, tail } = anchorsFor(blocks, true);
  assert.deepEqual(
    [...at],
    [
      [1, ['needs', 'working']],
      [3, ['projects', 'landed']],
      [5, ['more']],
    ],
  );
  assert.deepEqual(tail, []);
});

test('A PART WITH NOTHING AFTER IT FOLLOWS THE READER, and an undrawn block is never what a part stands before', () => {
  const blocks = inPicture([b('needs-you'), b('cash', false), b('coming-up'), b('x', false)]);
  const { at, tail } = anchorsFor(blocks, true);
  assert.deepEqual([...at], [[2, ['needs', 'working', 'projects', 'landed']]]);
  assert.deepEqual(tail, ['more']);
});

test("WITHOUT A READER EVERY PART FOLLOWS IT, in the picture's order", () => {
  assert.deepEqual(anchorsFor([b('needs-you')], false).tail, ['needs', 'working', 'projects', 'landed', 'more']);
});
