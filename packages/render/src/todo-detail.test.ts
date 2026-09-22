/**
 * A `todo` row's third and fourth cells: one quiet line under the title, and nothing at all where
 * the row does not carry them.
 *
 * WORK'S WAITING ON YOU LOST TWO FACTS TO THIS KIND'S ARITY. At 1.5.0 it said when each task fell
 * due and who touched it last; moved onto a `todo`, which took two cells, both had nowhere to sit,
 * and a four-cell row written into a page was not drawn at all but degraded whole as DIALECT_ARITY.
 * What is pinned here is the way back: two more cells, drawn as one line, and a two-cell row that
 * draws exactly the markup it drew before, byte for byte, because every todo already on a page is
 * one of those.
 *
 * The Svelte side is held to the same tree in `parity.test.ts`, which is where the compiler hook is.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parse, type Block } from './parse.ts';
import { toHTML } from './html.ts';

const block = (src: string): Block => {
  const [seg] = parse(src);
  assert.equal(seg?.type, 'block', seg?.type === 'degraded' ? seg.fix : `nothing parsed from ${src}`);
  return seg as Block;
};

/** The markup a two-cell todo drew before this line existed, written out so it cannot drift with the code. */
const TWO_CELLS =
  '<figure class="block block-list" data-kind="todo" data-primitive="list"><ul class="list" data-kind="todo">' +
  '<li class="item"><span class="item-marker" data-done="no" role="img" aria-label="not done"></span><span class="item-title">Draft the September issue</span><span class="item-detail">waiting on copy</span></li>' +
  '<li class="item"><span class="item-marker" data-done="yes" role="img" aria-label="done">✓</span><span class="item-title">Send the quote</span><span class="item-detail"></span></li>' +
  '</ul></figure>';

test('A TODO ROW OF FOUR CELLS IS DRAWN, not degraded as too wide', () => {
  const b = block('```todo\n[ ] Check the export | blocked on the bank | due 24 Sep | Claude, 3h ago\n```');
  assert.deepEqual(b.rows[0]?.cells, ['Check the export', 'blocked on the bank', 'due 24 Sep', 'Claude, 3h ago']);
  assert.equal(b.rows[0]?.done, false);
});

test('and a fifth cell is still too wide, because one line under a title is not a table', () => {
  const [seg] = parse('```todo\n[ ] A | b | c | d | e\n```');
  assert.equal(seg?.type === 'degraded' && seg.code, 'DIALECT_ARITY');
});

test('THE THIRD AND FOURTH CELLS ARE ONE LINE, after the detail, joined by a dot', () => {
  const html = toHTML([block('```todo\n[ ] Check the export | blocked on the bank | due 24 Sep | Claude, 3h ago\n```')]);
  assert.match(
    html,
    /<span class="item-title">Check the export<\/span><span class="item-detail">blocked on the bank<\/span><span class="item-meta">due 24 Sep · Claude, 3h ago<\/span><\/li>/u,
  );
});

test('a third cell alone is the whole line, with no dot hanging off it', () => {
  const html = toHTML([block('```todo\n[ ] Check the export | blocked | due 24 Sep\n```')]);
  assert.match(html, /<span class="item-meta">due 24 Sep<\/span><\/li>/u);
});

test('a blank third cell leaves the fourth on its own, and never a leading dot', () => {
  const html = toHTML([block('```todo\n[ ] Check the export | blocked |  | Claude, 3h ago\n```')]);
  assert.match(html, /<span class="item-meta">Claude, 3h ago<\/span><\/li>/u);
});

test('THE LINE GOES THROUGH THE INLINE RENDERER like every other cell, so a link is a link', () => {
  const html = toHTML([block('```todo\n[ ] Check the export | blocked | **due today** | [Claude](/r/sessions/4)\n```')]);
  assert.match(html, /<span class="item-meta"><strong>due today<\/strong> · <a href="\/r\/sessions\/4">Claude<\/a><\/span>/u);
});

test('A TWO-CELL TODO DRAWS EXACTLY WHAT IT DREW BEFORE', () => {
  assert.equal(toHTML([block('```todo\n[ ] Draft the September issue | waiting on copy\n[x] Send the quote\n```')]), TWO_CELLS);
});

test('AND SO DOES ONE WHOSE EXTRA CELLS ARE BLANK, which is the row a page writes for a two-column todo', () => {
  /* `apps/web`'s projection pads every row to the kind's arity with empty strings, so once `todo` takes
     four, every two-column todo on every page arrives as `title | detail |  | `. A line drawn for two
     blanks would be an empty span on every task the product already shows. */
  assert.equal(toHTML([block('```todo\n[ ] Draft the September issue | waiting on copy |  | \n[x] Send the quote |  |  | \n```')]), TWO_CELLS);
});
