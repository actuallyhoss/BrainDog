/**
 * A PROJECT'S WHAT CHANGED READS AS SENTENCES.
 *
 * WHAT WAS WRONG, on BrainDog's page (`-more/row-braindog-390-light.png`): a stray "8" before the second line, both
 * lines "Claude Code Added the visu…", a capital verb after the name, and "You Put back by an undo." for an undo.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { feedTable, noteAfterWho, type FeedRow } from './api.ts';

const NOW = Date.parse('2026-10-24T09:00:00.000Z');
const RUN = { run: 'S904', agent: 'claude', client: 'claude-code', parent: null };

const ROWS: FeedRow[] = [
  { by: 'agent', who: 'S904', count: 1, kind: 'edit', target: 'things#21', note: 'Added the visuals plan to the note.', at: '2026-10-23T19:00:00.000Z', run_by: RUN },
  { by: 'agent', who: 'S904', count: 8, kind: 'edit', target: 'things#21', note: 'Added the visuals plan to the note.', at: '2026-10-23T18:00:00.000Z', run_by: RUN },
  { by: 'you', who: 'p_me', count: 1, kind: 'edit', target: 'things#21', note: 'Put back by an undo.', at: '2026-10-23T18:30:00.000Z', thing: 'BrainDog' },
];

test('a burst says its lines alike in words after it, and no number stands in front of it', () => {
  const { rows } = feedTable(ROWS, false, null, NOW, 'p_me', new Map(), 'UTC');
  assert.equal(rows[1]!.cells[2], '1', 'a bare 8 still stands in front of the line');
  assert.equal(rows[1]!.cells[5], 'and 7 more like this');
  assert.equal(rows[0]!.cells.length, 5, 'a line of one says nothing more');
});

test('a note after its writer’s name reads on from it, and an undo says what was undone', () => {
  const { rows } = feedTable(ROWS, false, null, NOW, 'p_me', new Map(), 'UTC');
  assert.equal(rows[0]!.cells[3], 'added the visuals plan to the note.');
  assert.equal(rows[2]!.cells[1], 'You');
  assert.equal(rows[2]!.cells[3], 'undid a change to BrainDog');
  /* A note that opens on a name keeps it. */
  assert.equal(noteAfterWho('BrainDog moved to Earning.', null), 'BrainDog moved to Earning.');
  assert.equal(noteAfterWho('Put back by an undo.', null), 'undid a change');
});

test('a line wraps to a second line before it is cut, so its verb and its fold are read', () => {
  const css = readFileSync(new URL('../../../../../packages/skin/kinds/feed.css', import.meta.url), 'utf8');
  const what = /\.feed-what \{([^}]*)\}/u.exec(css)?.[1] ?? '';
  assert.match(what, /-webkit-line-clamp: 2;/u);
  assert.doesNotMatch(what, /white-space: nowrap;/u);
});
