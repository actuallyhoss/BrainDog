/**
 * THE AGENTS PAGE IN TWO PARTS (`console.ts`): the page leads with the conversations, who is working and what is up
 * next, with one quiet link to the rest; Runs and setup holds the runs, the doors to what agents keep and every other
 * block, an add-on's among them. Known by what it draws, never by its slug.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { consoleOf, DOORS, isConsole, MORE_LINK } from './console.ts';

const section = (panel: string) => ({ kind: 'section', panel, refusals: [], rows: [] });
const page = [
  section('instruct'),
  section('presence'),
  section('kept'),
  section('left-steps'),
  section('run-list'),
  { kind: 'note', key: 'brain-link', body: '[Learnings](/r/learnings)', refusals: [], rows: [] },
  { kind: 'note', key: 'profiles', body: 'Profiles', refusals: [], rows: [] },
];
const panels = (blocks: readonly object[]) => blocks.map((b) => (b as { panel?: string; key?: string }).panel ?? (b as { key?: string }).key);

test('THE PAGE IS KNOWN BY WHAT IT DRAWS: the box to tell an agent and the list of runs', () => {
  assert.equal(isConsole(page), true);
  assert.equal(isConsole([section('instruct')]), false);
});

test('THE LEAD IS THE CONVERSATIONS, WITH WHO IS WORKING AND UP NEXT IN THE RAIL, and one quiet link to the rest', () => {
  const { blocks, layout } = consoleOf(page, 'lead', '/p/agents');
  assert.deepEqual(panels(blocks), ['instruct', 'presence', 'left-steps', 'agents-more']);
  assert.deepEqual(blocks.map((b) => (b as { area?: string }).area ?? 'main'), ['main', 'rail', 'rail', 'rail']);
  assert.deepEqual(layout, { rail: 4, sticky: false });
  assert.equal((blocks.at(-1) as { body?: string }).body, `[${MORE_LINK}](/p/agents?more)`);
  assert.deepEqual((blocks.at(-1) as { refusals?: unknown }).refusals, [], 'a block the page did not answer still has the shape of one it did');
});

test('RUNS AND SETUP HOLDS THE RUNS, THE DOORS, AND EVERY OTHER BLOCK, an add-on’s among them', () => {
  const { blocks, layout } = consoleOf(page, 'more', '/p/agents');
  assert.deepEqual(panels(blocks), ['run-list', 'agent-doors', 'kept', 'profiles']);
  assert.equal(layout, null);
  const doors = blocks[1] as { authored?: { cells: string[] }[] };
  assert.deepEqual(doors.authored?.map((r) => r.cells[0]), DOORS.map((d) => d[0]));
  assert.ok(DOORS.some((d) => d[1] === '/keychain') && DOORS.some((d) => d[1] === '/r/learnings'));
});
