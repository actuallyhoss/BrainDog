/* A LONG NOTE FOLDS AT TWELVE LINES ON A PAGE, and nowhere else (`fold.ts`). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOLD_LINES, foldOf, foldWords, linesOf, mayFold } from './fold.ts';

test('thirteen lines of a note fold on a page and not in the panel', () => {
  assert.equal(foldOf('note', 13, 'page'), true);
  assert.equal(foldOf('note', 13, 'panel'), false);
  assert.equal(foldOf('note', 13, 'preview'), false);
  assert.equal(foldOf('note', 13, 'home'), false);
});

test('twelve lines never fold', () => {
  assert.equal(FOLD_LINES, 12);
  assert.equal(foldOf('note', 12, 'page'), false);
  assert.equal(foldOf('document', 12, 'page'), false);
  assert.equal(foldOf('document', 40, 'page'), true);
});

test('a chart never folds', () => {
  assert.equal(foldOf('series', 400, 'page'), false);
  assert.equal(foldOf('table', 400, 'page'), false);
  assert.equal(mayFold('series', 'page'), false);
});

test('lines are the prose height over the line height, and nought before a measure', () => {
  assert.equal(linesOf(23.25 * 13, 23.25), 13);
  assert.equal(linesOf(0, 23.25), 0);
  assert.equal(linesOf(300, 0), 0);
});

test('the button says what a press does, with no dash', () => {
  assert.deepEqual(foldWords, { open: 'Read all', shut: 'Show less' });
});
