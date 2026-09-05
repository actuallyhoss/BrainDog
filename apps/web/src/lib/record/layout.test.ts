/**
 * The rows a declared page actually lays out in, which is not always the rows it declares.
 *
 * `spanOf` clamps a declared span UP to what the block can survive — a `rows` primitive needs about
 * two twelfths per column, measured, or its cells truncate. That clamp is right and it is silent,
 * so a page written as 5 + 7 becomes 6 + 7, wraps, and leaves two holes on the row above and a
 * five-twelfth gap on the row below. Nothing in the product said so: the layout gate looks for
 * horizontal overflow, and a hole is not overflow.
 *
 * The invariant is per PAGE, not per block: every row before the last is full. A trailing gap is a
 * page that ends, which is ordinary; a gap in the middle is a declaration that did not survive.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { COLUMNS, spanOf } from './arrange.ts';
import { page } from './api.ts';
import { PAGES } from './data.ts';

/** The spans a page really lays out with, in order. */
const effective = (slug: string): { heading: string; declared: number | undefined; span: number }[] =>
  (page(slug)?.blocks ?? [])
    .filter((b) => b.drawn !== false)
    .map((b) => ({
      heading: b.heading ?? b.kind,
      declared: b.span,
      span: spanOf(b.kind, b.span, b.columns.length),
    }));

/** Greedy fill, the same one the page does: a block that does not fit starts a new row. */
const rows = (spans: number[]): number[] => {
  const out: number[] = [];
  let width = 0;
  for (const span of spans) {
    if (width + span > COLUMNS) {
      out.push(width);
      width = 0;
    }
    width += span;
  }
  if (width) out.push(width);
  return out;
};

test('EVERY DECLARED PAGE TILES, WITH NO HOLE ABOVE THE LAST ROW', () => {
  for (const slug of Object.keys(PAGES)) {
    const laid = effective(slug);
    const filled = rows(laid.map((b) => b.span));
    for (let i = 0; i < filled.length - 1; i++)
      assert.equal(
        filled[i],
        COLUMNS,
        `${slug}: row ${i + 1} is ${filled[i]} of ${COLUMNS} wide. Spans: ${laid.map((b) => `${b.heading} ${b.span}`).join(', ')}`,
      );
  }
});

test('and no page declares a span the block cannot survive', () => {
  // The clamp stays, because a pack is written by a stranger. What must not happen is OUR pages
  // relying on it: a declaration that is silently widened is a declaration that is wrong.
  for (const slug of Object.keys(PAGES))
    for (const b of effective(slug))
      if (b.declared !== undefined)
        assert.equal(b.span, b.declared, `${slug}: ${b.heading} declares ${b.declared} and is drawn at ${b.span}`);
});
