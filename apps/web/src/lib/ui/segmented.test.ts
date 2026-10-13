/**
 * The segmented control's sliding selection (`Segmented.svelte`, DIRECTION 39): where the thumb sits is read from the
 * chosen segment's box and nothing else, and whether a move is drawn or jumped.
 *
 * The functions live in the component's module script, which Node cannot import, so this reads the lines between the
 * component's `thumb` marks, strips their types and runs them: the code under test is the code that ships.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type Box = { left: number; top: number; width: number; height: number };
type Thumb = { x: number; y: number; w: number; h: number };
type Kit = {
  thumbOf: (chosen: Box | null, trackWidth: number, rtl?: boolean) => Thumb | null;
  wraps: (tops: readonly number[]) => boolean;
  slides: (move: { had: boolean; changed: boolean; wrapped: boolean; reduced: boolean }) => boolean;
};

const FILE = process.env.SEGMENTED_SRC ?? join(dirname(fileURLToPath(import.meta.url)), 'Segmented.svelte');
const SOURCE = readFileSync(FILE, 'utf8');
const cut = /thumb:start[^\n]*\n([\s\S]*?)\n[^\n]*thumb:end/.exec(SOURCE);
assert.ok(cut, 'Segmented.svelte keeps its thumb marks');
const js = stripTypeScriptTypes(cut[1]!).replace(/^(\s*)export /gm, '$1');
const { thumbOf, wraps, slides } = new Function(`${js}\nreturn { thumbOf, wraps, slides };`)() as Kit;

/** Table, Board, Cards in a 240 track with 2 of padding and a gap of 2: the second is chosen. */
const BOARD: Box = { left: 72, top: 2, width: 76, height: 28 };

test('the thumb is the chosen segment: its left, its top, its width and its height', () => {
  assert.deepEqual(thumbOf(BOARD, 240), { x: 72, y: 2, w: 76, h: 28 });
});

test('a longer label is a wider thumb, with no number of its own', () => {
  assert.deepEqual(thumbOf({ ...BOARD, width: 131 }, 240), { x: 72, y: 2, w: 131, h: 28 });
});

test('nothing chosen is no thumb', () => {
  assert.equal(thumbOf(null, 240), null);
});

test('a segment with no box yet (the track is hidden) is no thumb', () => {
  assert.equal(thumbOf({ left: 0, top: 0, width: 0, height: 0 }, 0), null);
});

test('right to left, the thumb starts at the far edge and is moved back by what is left of the segment', () => {
  /* 240 wide, the segment's left at 72 and 76 wide: its right edge is 92 short of the track's. */
  assert.deepEqual(thumbOf(BOARD, 240, true), { x: -92, y: 2, w: 76, h: 28 });
});

test('one line does not wrap, two do, and a pixel of rounding is not a second line', () => {
  assert.equal(wraps([2, 2, 2]), false);
  assert.equal(wraps([2, 2.5, 2]), false);
  assert.equal(wraps([2, 2, 34]), true);
  assert.equal(wraps([]), false);
});

test('a new choice on one line slides', () => {
  assert.equal(slides({ had: true, changed: true, wrapped: false, reduced: false }), true);
});

test('two wrapped lines give no transition', () => {
  assert.equal(slides({ had: true, changed: true, wrapped: true, reduced: false }), false);
});

test('reduced motion gives no transition', () => {
  assert.equal(slides({ had: true, changed: true, wrapped: false, reduced: true }), false);
});

test('the first placing is not a move, and neither is the same choice at a new size', () => {
  assert.equal(slides({ had: false, changed: true, wrapped: false, reduced: false }), false);
  assert.equal(slides({ had: true, changed: false, wrapped: false, reduced: false }), false);
});
