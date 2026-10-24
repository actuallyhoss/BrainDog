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

import { COLUMNS } from './arrange.ts';
import { slotOf, widened } from '../page/layout.ts';
import { page } from './fixtures/readers.ts';
import { pages } from './fixtures/readers.ts';

/* `pages()`, NOT `PAGES`. The declared set holds a TEMPLATE, and `page('project')` is null — so the
   moment the project pages became one declaration this whole file iterated four pages and asserted
   nothing about the three that multiply per row. A guard over the wrong list is not a guard. */

/** The spans a page really lays out with, in order. */
/** The spans each drawn block is clamped to, before any row is widened: what a declaration survives. */
const clamped = (slug: string): { heading: string; declared: number | undefined; span: number }[] =>
  (page(slug)?.blocks ?? []).filter((b) => b.drawn !== false).map((b) => ({ heading: b.heading ?? b.kind, declared: b.span, span: slotOf(b, 0, null).span }));

const effective = (slug: string): { heading: string; declared: number | undefined; span: number }[] => {
  /* AS THE PAGE DRAWS IT (`PageBody`'s `widened`): a half whose partner the record did not draw takes the whole row the
     author declared whole, so a parked project with no runs is not a hole beside What changed. */
  const all = page(slug)?.blocks ?? [];
  const slots = all.map((b) => slotOf(b, 0, null).span);
  const wide = widened(all.map((b, n) => ({ span: slots[n]!, drawn: b.drawn !== false })));
  return all.flatMap((b, n) => (b.drawn === false ? [] : [{ heading: b.heading ?? b.kind, declared: b.span, span: wide[n]! }]));
};

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
  for (const slug of Object.keys(pages())) {
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
  for (const slug of Object.keys(pages()))
    for (const b of clamped(slug))
      if (b.declared !== undefined)
        assert.equal(b.span, b.declared, `${slug}: ${b.heading} declares ${b.declared} and is drawn at ${b.span}`);
});
