/**
 * A page the owner changed takes the words an update changed, and nothing else (`reworded.ts`, UP1). Invented pages only.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { reworded } from '../src/reworded.ts';

const note = (body: string) => ({ kind: 'note', body });
const table = (heading: string, empty: string) => ({ kind: 'table', heading, empty, source: 'register.put_by', columns: [{ field: 'what', label: 'What' }] });

const START = { page: 'goals', title: 'Goals', blocks: [note('{{saved}} put by so far'), table('Put by lately', 'Nothing put by yet.')] };
const NEXT = { page: 'goals', title: 'Goals', blocks: [note('{{saved}} saved so far'), { kind: 'capture', heading: 'Add a goal', register: 'goals' }, table('Saved lately', 'Nothing saved yet.')] };

test('a page with its blocks moved takes the new words and keeps its order', () => {
  const mine = { ...START, blocks: [START.blocks[1], START.blocks[0]] };
  assert.deepEqual(reworded(START, mine, NEXT), { ...START, blocks: [table('Saved lately', 'Nothing saved yet.'), note('{{saved}} saved so far')] });
});

test('a word the owner typed stays theirs', () => {
  const mine = { ...START, blocks: [START.blocks[0], table('My savings', 'Nothing put by yet.')] };
  assert.deepEqual(reworded(START, mine, NEXT), { ...START, blocks: [note('{{saved}} saved so far'), table('My savings', 'Nothing saved yet.')] });
});

test('nothing but words moves: an id or a list read is never changed, and no word to carry is null', () => {
  const next = { ...START, blocks: [START.blocks[0], { ...table('Put by lately', 'Nothing put by yet.'), source: 'register.saved' }] };
  assert.equal(reworded(START, START, next), null);
  assert.equal(reworded(START, { ...START, blocks: [note('Mine'), table('Mine too', 'Mine as well')] }, NEXT), null);
});
