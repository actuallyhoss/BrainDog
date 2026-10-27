/**
 * THE PAGES CENSUS: one page's answer counted, so a daily read says which pages draw a refused block, print
 * a path that named nothing, or show a dash. Read off the answer: a block not drawn counts in `blocks` and nowhere else.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { censusOf } from '../src/census.ts';
import type { BlockResult, PageResult } from '../src/pages.ts';

const block = (more: Partial<BlockResult>): BlockResult => ({ kind: 'note', rows: [], matched: 0, refusals: [], ...more }) as BlockResult;

const PROJECT: PageResult = {
  page: 'braindog',
  title: 'BrainDog',
  param: { register: 'things', seq: 1, title: 'BrainDog' },
  blocks: [
    block({ kind: 'stat', icon: 'flag', unnamed: ['next_step', 'owner'] }),
    block({ kind: 'table', icon: 'no-such-glyph', refusals: [{ code: 'FIELD_UNKNOWN', fix: 'No field called colour.', at: 'columns' }], unnamed: ['owner'] }),
    block({ kind: 'note', icon: 'no-such-glyph', unnamed: ['hidden'], refusals: [{ code: 'FORBIDDEN', fix: 'x', at: 'source' }], drawn: false, why: 'empty' }),
  ],
};

test('A PAGE MADE FOR A ROW is counted whole: its refused block, each path that named nothing once, and its dashes', () => {
  assert.deepEqual(censusOf(PROJECT, 3), {
    slug: 'braindog',
    held: 'generated',
    blocks: 3,
    drawn: 2,
    refused: [{ n: 1, code: 'FIELD_UNKNOWN' }],
    unresolved: ['next_step', 'owner'],
    glyphs_unknown: [],
    dashes: 3,
  });
});

test('A GLYPH NO HOST DRAWS is named once, only when the host hands its glyphs, and only on a drawn block', () => {
  assert.deepEqual(censusOf(PROJECT, 0, { glyphs: new Set(['flag']) }).glyphs_unknown, ['no-such-glyph']);
  assert.deepEqual(censusOf(PROJECT, 0, { glyphs: new Set(['flag', 'no-such-glyph']) }).glyphs_unknown, []);
});

test('A DECLARED PAGE is stored; a page written in the app is held where the caller says', () => {
  const health: PageResult = { page: 'health', title: 'Health', blocks: [block({ kind: 'table' })] };
  const read = censusOf(health, 0);
  assert.equal(read.held, 'stored');
  assert.deepEqual([read.blocks, read.drawn, read.refused, read.unresolved, read.dashes], [1, 1, [], [], 0]);
  assert.equal(censusOf(health, 0, { held: 'web' }).held, 'web');
});

test('A DASH COUNT OUT OF SHAPE reads as nought, never a negative or a fraction', () => {
  const empty: PageResult = { page: 'empty', title: 'Empty', blocks: [] };
  assert.equal(censusOf(empty, -2).dashes, 0);
  assert.equal(censusOf(empty, Number.NaN).dashes, 0);
  assert.equal(censusOf(empty, 2.7).dashes, 2);
});
