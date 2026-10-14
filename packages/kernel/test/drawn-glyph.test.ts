/**
 * No tile draws one glyph twice (`unechoed` in `src/drawn.ts`, applied by `markDrawn`): a block inside a boxed section
 * that names the box's own glyph is answered without its `icon`, so the drawer gives it its kind's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { arranged, markDrawn, unechoed } from '../src/drawn.ts';
import type { BlockResult, PageRow } from '../src/pages.ts';

const block = (over: Partial<BlockResult> & { kind: string }): BlockResult => ({ rows: [], matched: 0, refusals: [], ...over });
const row = (title: string): PageRow => ({ id: title, register: 'things', title, fields: { title } } as unknown as PageRow);
const iconOf = (b: object): unknown => (b as { icon?: unknown }).icon;

const BOX = block({ kind: 'section', heading: 'More about Copperleaf', icon: 'notebook-pen', box: true, panel: 'actions' } as never);
const NOTES = block({ kind: 'note', heading: 'Notes', icon: 'notebook-pen', body: 'The plan is written here.' } as never);
const FEED = block({ kind: 'feed', heading: 'What changed', icon: 'activity', rows: [row('Moved hosts')], matched: 1 } as never);
const NEXT = block({ kind: 'section', heading: 'Runs on', icon: 'settings' } as never);

test('A NOTES BLOCK UNDER A BOX OF ITS OWN GLYPH LOSES ITS ICON; a feed with another keeps it', () => {
  const out = unechoed([BOX, NOTES, FEED]);
  assert.equal(out.length, 3);
  assert.equal(iconOf(out[0]!), 'notebook-pen', 'the box keeps its own glyph');
  assert.equal(iconOf(out[1]!), undefined);
  assert.ok(!('icon' in out[1]!), 'the key is left out, so the drawer takes the kind\'s');
  assert.equal(iconOf(out[2]!), 'activity');
  /* EVERY OTHER KEY STAYS, at the same index. */
  assert.equal((out[1] as unknown as { heading: string }).heading, 'Notes');
  assert.equal((out[1] as unknown as { body: string }).body, 'The plan is written here.');
  assert.equal(out[2], FEED);
});

test('THE SAME BLOCK PAST THE BOX\'S RUN, or under a heading that is not a box, keeps its glyph', () => {
  const after = unechoed([BOX, FEED, NEXT, NOTES]);
  assert.equal(iconOf(after[3]!), 'notebook-pen');
  const open = block({ kind: 'section', heading: 'Notes', icon: 'notebook-pen' } as never);
  assert.equal(iconOf(unechoed([open, NOTES])[1]!), 'notebook-pen', 'a section that is not boxed is no tile of its own');
});

test('A RAIL BLOCK IS NOT HEADED BY A MAIN BOX', () => {
  const rail = { ...NOTES, area: 'rail' } as BlockResult;
  const out = unechoed([BOX, rail, NOTES]);
  assert.equal(iconOf(out[1]!), 'notebook-pen');
  assert.equal(iconOf(out[2]!), undefined, 'the main block after the rail one is still under the box');
});

test('THE RECORD\'S ANSWER SAYS IT: markDrawn answers the Notes block with no glyph, at the same indexes', () => {
  const blocks = [BOX, NOTES, FEED, NEXT, block({ kind: 'note', body: 'Keys and tools.' } as never)];
  const out = markDrawn(blocks);
  assert.equal(out.length, blocks.length);
  assert.deepEqual(out.map((b) => b.kind), blocks.map((b) => b.kind));
  assert.deepEqual(out.map((b) => b.drawn !== false), [true, true, true, true, true]);
  assert.equal(iconOf(out[1]!), undefined);
  assert.equal(iconOf(out[2]!), 'activity');
  /* ARRANGING STILL DRAWS EVERY BLOCK. */
  assert.deepEqual(arranged(markDrawn([BOX, block({ kind: 'table' }), NOTES])).map((b) => b.drawn !== false), [true, true, true]);
});
