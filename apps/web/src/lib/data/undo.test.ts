/**
 * The stack ⌘Z reaches back through: sixty deep, newest first, one batch held once.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { history, undoStack, UNDO_DEPTH } from './undo.ts';

test('sixty-one changes keep the newest sixty, and they come back newest first', () => {
  assert.equal(UNDO_DEPTH, 60);
  const stack = undoStack();
  for (let i = 1; i <= 61; i++) stack.push({ batch: `b${i}`, said: `Marked Errand ${i} done.` });
  assert.equal(stack.size, 60);
  const out: string[] = [];
  for (let held = stack.pop(); held !== null; held = stack.pop()) out.push(held.batch);
  assert.equal(out.length, 60);
  assert.equal(out[0], 'b61');
  assert.equal(out.at(-1), 'b2', 'the first change went past sixty');
  assert.equal(stack.size, 0);
  assert.equal(stack.pop(), null);
});

test('a pop gives the batch and the sentence it was said with', () => {
  const stack = undoStack(3);
  stack.push({ batch: 'a', said: 'Archived Garden fence.' });
  stack.push({ batch: 'b', said: 'Moved Window paint to Later.' });
  assert.deepEqual(stack.pop(), { batch: 'b', said: 'Moved Window paint to Later.' });
  assert.deepEqual(stack.pop(), { batch: 'a', said: 'Archived Garden fence.' });
});

test('spend lets go of one batch wherever it is held, and says whether it was', () => {
  const stack = undoStack();
  for (const batch of ['a', 'b', 'c']) stack.push({ batch, said: '' });
  assert.equal(stack.spend('b'), true);
  assert.equal(stack.spend('b'), false, 'spent once is spent');
  assert.equal(stack.spend('z'), false);
  assert.equal(stack.size, 2);
  assert.equal(stack.pop()?.batch, 'c');
  assert.equal(stack.pop()?.batch, 'a');
});

test('a batch pushed twice is held once, on top, with its newer sentence', () => {
  const stack = undoStack();
  stack.push({ batch: 'a', said: 'Saved Boat trip.' });
  stack.push({ batch: 'b', said: 'Saved Tent.' });
  stack.push({ batch: 'a', said: 'Saved Boat trip again.' });
  assert.equal(stack.size, 2);
  assert.deepEqual(stack.pop(), { batch: 'a', said: 'Saved Boat trip again.' });
  assert.equal(stack.pop()?.batch, 'b');
  assert.equal(stack.pop(), null);
});

test('the tab has one stack, sixty deep', () => {
  for (let i = 0; i < 70; i++) history.push({ batch: `t${i}`, said: '' });
  assert.equal(history.size, UNDO_DEPTH);
  while (history.pop() !== null);
});
