/**
 * The block editor's patch, for the part a person can now set from the sheet that only the text could say before: how a
 * block's rows are sorted (`order`).
 *
 * WHAT WOULD BE SILENTLY WRONG is a patch that rewrites a sort nobody touched (a stored `{ field }` respelled with its
 * `dir`), one that drops a sort of several fields the sheet cannot draw, or one that does not read back as it was set.
 * The round trip is the one the sheet makes: the stored block (`sourceOf`) is read into a draft, the patch is laid over
 * the stored block (`withPatch`, the arrangement write's own), and the next opening reads that block again.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sourceOf } from '../dog/read.ts';
import { draftOf, patchOf, sortSaid } from './block-edit.ts';
import { withPatch } from './page-write.ts';
import type { BlockBody, PageBody } from './pages-live.ts';

const table = (more: Record<string, unknown> = {}): BlockBody => ({
  kind: 'table',
  heading: 'Bills',
  source: 'register.obligations',
  columns: [{ field: 'name' }, { field: 'due' }],
  empty: 'Nothing owed.',
  ...more,
});

test('a block with no sort reads as the order the list keeps, and an untouched draft patches nothing', () => {
  const block = table();
  const draft = draftOf(block);
  assert.equal(draft.sortField, '');
  assert.equal(draft.sortDir, 'asc');
  assert.equal(draft.sortKept, false);
  assert.deepEqual(patchOf(block, draft), {});
});

test('choosing a field and a way writes one order term', () => {
  const block = table();
  const draft = draftOf(block);
  draft.sortField = 'due';
  draft.sortDir = 'desc';
  assert.deepEqual(patchOf(block, draft), { order: [{ field: 'due', dir: 'desc' }] });
});

test('a stored sort reads into the sheet, and the same sort goes back as it was written', () => {
  const bare = table({ order: [{ field: 'due' }] });
  const draft = draftOf(bare);
  assert.equal(draft.sortField, 'due');
  assert.equal(draft.sortDir, 'desc', 'a term with no dir runs highest first, as the kernel sorts it');
  assert.deepEqual(patchOf(bare, draft), {}, 'and saved that way it is not respelled');

  const spelled = table({ order: [{ field: 'due', dir: 'asc' }] });
  assert.equal(draftOf(spelled).sortDir, 'asc');
  assert.deepEqual(patchOf(spelled, draftOf(spelled)), {});
});

test('turning the way round, or the field, rewrites the term', () => {
  const block = table({ order: [{ field: 'due' }] });
  const draft = draftOf(block);
  draft.sortDir = 'asc';
  assert.deepEqual(patchOf(block, draft), { order: [{ field: 'due', dir: 'asc' }] });
  draft.sortField = 'name';
  draft.sortDir = 'asc';
  assert.deepEqual(patchOf(block, draft), { order: [{ field: 'name', dir: 'asc' }] });
});

test('going back to the order the list keeps takes the key off', () => {
  const block = table({ order: [{ field: 'due', dir: 'desc' }] });
  const draft = draftOf(block);
  draft.sortField = '';
  assert.deepEqual(patchOf(block, draft), { order: null });
});

test('a sort of several fields is kept as written, whatever the draft says', () => {
  const order = [{ field: 'due' }, { field: 'name', dir: 'desc' }];
  const block = table({ order });
  const draft = draftOf(block);
  assert.equal(draft.sortKept, true);
  assert.equal(draft.sortField, '');
  draft.sortField = 'name';
  assert.deepEqual(patchOf(block, draft), {});
  /* ANOTHER LIST CHOSEN: the sheet lets the kept sort go (`BlockEditor` `showList`), and the key comes off. */
  assert.deepEqual(patchOf(block, { ...draft, sortKept: false, sortField: '' }), { order: null });
  const odd = table({ order: [{ field: 'due', dir: 'up' }] });
  assert.equal(draftOf(odd).sortKept, true, 'a term the kernel would refuse is not redrawn as a choice');
});

test('the sort round-trips through the stored block', () => {
  const stored = table();
  const draft = draftOf(stored);
  draft.sortField = 'due';
  draft.sortDir = 'desc';
  const next = withPatch(stored, patchOf(stored, draft));
  assert.deepEqual(next.order, [{ field: 'due', dir: 'desc' }]);
  const again = draftOf(next);
  assert.equal(again.sortField, 'due');
  assert.equal(again.sortDir, 'desc');
  assert.deepEqual(patchOf(next, again), {}, 'reopened and saved unchanged, it writes nothing');

  again.sortField = '';
  const cleared = withPatch(next, patchOf(next, again));
  assert.equal('order' in cleared, false);
  assert.equal(draftOf(cleared).sortField, '');
});

test('the sort round-trips through the read the sheet opens on (`sourceOf`)', async () => {
  /* THE RECORD AS A STUB: `arrangement` answers the page as stored, and the next read answers what was laid over it. */
  let page: PageBody = { page: 'bills', title: 'Bills', blocks: [table()] };
  const io = async () =>
    new Response(JSON.stringify({ ok: true, value: { id: 'page.bills', version: 1, pack: null, body: page } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  const read = async (): Promise<BlockBody> => {
    const got = await sourceOf('http://record.test', 'bills', io);
    assert.ok(!('fix' in got));
    return (got.body as unknown as PageBody).blocks[0]!;
  };

  const stored = await read();
  const draft = draftOf(stored);
  draft.sortField = 'due';
  draft.sortDir = 'asc';
  page = { ...page, blocks: [withPatch(stored, patchOf(stored, draft))] };

  const again = draftOf(await read());
  assert.equal(again.sortField, 'due');
  assert.equal(again.sortDir, 'asc');
  assert.deepEqual(patchOf(await read(), again), {});
});

test('a sort kept as written is said in words, each field and which way', () => {
  assert.equal(sortSaid([{ field: 'due_on', dir: 'asc' }, { field: 'name' }]), 'due on, lowest first, then name, highest first');
});

test('the sort travels with the other keys an edit changes', () => {
  const block = table({ order: [{ field: 'due' }] });
  const draft = draftOf(block);
  draft.heading = 'What we owe';
  draft.sortDir = 'asc';
  assert.deepEqual(patchOf(block, draft), { heading: 'What we owe', order: [{ field: 'due', dir: 'asc' }] });
});
