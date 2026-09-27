/**
 * The slot a declared block is laid out in (`layout.ts` `slotOf`), which the page body lays blocks out with and the
 * arrange controls begin and add with: the two must agree, so the rule is one function and these cases hold it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { spanOf } from '../record/arrange.ts';
import { slotOf, type Layout } from './layout.ts';

const RAIL: Layout = { rail: 4, sticky: false };

test('A MAIN BLOCK HAS NO `area` KEY, so a page with no layout makes the slots it always made', () => {
  assert.deepEqual(slotOf({ kind: 'note', span: 6, columns: [] }, 2, null), { i: 2, span: 6 });
  assert.deepEqual(slotOf({ kind: 'note', span: 6, columns: [] }, 2, RAIL), { i: 2, span: 6 });
});

test('A RAIL BLOCK SAYS SO, and only on a page that has a rail', () => {
  const block = { kind: 'note', span: 12, area: 'rail', columns: [] };
  assert.deepEqual(slotOf(block, 0, RAIL), { i: 0, span: 12, area: 'rail' });
  assert.deepEqual(slotOf(block, 0, null), { i: 0, span: 12 });
});

test('THE SPAN IS THE ONE THE KIND SURVIVES, through the clamp the arrange control shares', () => {
  const table = { kind: 'table', span: 1, columns: [{}, {}, {}, {}, {}, {}] };
  assert.equal(slotOf(table, 0, null).span, spanOf('table', 1, 6));
});
