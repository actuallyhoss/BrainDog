/**
 * A project's note on its page: the row's own document, drawn with the blocks written in it, or the block's `empty:`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { page } from './fixtures/readers.ts';
import { toSegments } from './blocks.ts';

test('A PROJECT PAGE DRAWS THE PROJECT’S NOTE AS A DOCUMENT, blocks and all, and a placeholder draws nothing', () => {
  const kiln = page('kiln');
  assert.ok(kiln, 'the sample has a page for Kiln');
  const note = kiln.blocks.find((b) => b.kind === 'note' && b.document);
  assert.ok(note, 'the project page has a note block');
  const segments = toSegments(note);
  assert.ok(segments.some((s) => s.type === 'markdown'), 'the note’s prose is drawn');
  assert.ok(segments.some((s) => s.type === 'block' && s.kind === 'note'), 'the blocks written in the note are drawn as blocks');
  assert.deepEqual(toSegments({ ...note, body: '{{note}}' }), [], 'a project with no note draws nothing, so its empty sentence is said');
});
