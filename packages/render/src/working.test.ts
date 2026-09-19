/**
 * `takeWorking` is the reading half of one convention and `apps/web/src/lib/record/blocks.ts` is the
 * writing half. It imports `WORKING_MARK` from here rather than typing it out, so what is pinned below
 * is the string itself: a change to these characters is a change to what every drawn row already says,
 * and it should cost a failing test rather than pass silently.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { takeWorking, workingCell, WORKING_GLYPH, WORKING_MARK } from './working.ts';

test('THE MARK IS THE GLYPH AND ONE SPACE, nothing else', () => {
  assert.equal(WORKING_MARK, `${WORKING_GLYPH} `);
  assert.equal(WORKING_GLYPH, '●︎');
});

test('A MARKED CELL COMES BACK WITHOUT THE MARK, AND SAYS SO', () => {
  const { text, working } = takeWorking(`${WORKING_MARK}Draft the September issue`);
  assert.equal(working, true);
  assert.equal(text, 'Draft the September issue');
});

test('AN ORDINARY CELL COMES BACK EXACTLY AS IT WAS', () => {
  assert.deepEqual(takeWorking('Draft the September issue'), { text: 'Draft the September issue', working: false });
});

test('null AND EMPTY STAY THEMSELVES', () => {
  assert.deepEqual(takeWorking(null), { text: null, working: false });
  assert.deepEqual(takeWorking(''), { text: '', working: false });
});

test('THE GLYPH ALONE, WITH NO SPACE AFTER IT, IS NOT THE MARK', () => {
  /* The space is part of the convention, not decoration: a cell that happens to start with the bare
     glyph and no space is an ordinary cell that starts with an unusual character, not a marked one. */
  assert.deepEqual(takeWorking(`${WORKING_GLYPH}Draft the September issue`), { text: `${WORKING_GLYPH}Draft the September issue`, working: false });
});

test('THE DOT GOES ON THE CELL THE KIND CALLS THE ROW BY, which is not always the first', () => {
  /* A board's first cell is the column the card sits in and a timeline's is its date, so on neither
     of those is the first cell the row's name. A steps numbers itself from the list, so its is. */
  assert.equal(workingCell('board'), 1);
  assert.equal(workingCell('timeline'), 1);
  assert.equal(workingCell('steps'), 0);
  assert.equal(workingCell('todo'), 0);
  assert.equal(workingCell('table'), 0);
  assert.equal(workingCell('nothing of the sort'), 0);
});
