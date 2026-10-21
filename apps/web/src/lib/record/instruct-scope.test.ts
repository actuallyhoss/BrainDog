/**
 * THE CONTROL ROOM ON ANOTHER SCREEN (agents and MCP plan §7.2): a project's page tells agents on that project and no
 * other, Today's run sheet is one run, and each lists only what it is about.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PICK_FIRST, composerOf, instructArgs, scopedLeads, scopedThreads, type LiveRun, type Project, type Thread } from './instruct.ts';

const run = (over: Partial<LiveRun>): LiveRun => ({
  run: 'S1',
  name: null,
  agent: 'claude',
  machine: null,
  project: 'things#1',
  repo: null,
  worktree: null,
  branch: null,
  doing: 'Variable axis QA',
  state: 'working',
  instruction: null,
  task: null,
  stopped: null,
  helpers: [],
  parent: null,
  for_s: 600,
  heard_s: 30,
  reach: 'hooks',
  ...over,
});

const KILN = run({});
const PORTAGE = run({ run: 'S2', agent: 'codex', project: 'things#3', reach: 'next_call' });
const HELPER = run({ run: 'S9', parent: 'S1' });
const ROWS = [KILN, PORTAGE, HELPER];
const PROJECTS = new Map<string, Project>([
  ['things#1', { key: 'things#1', name: 'Kiln', hue: 265 }],
  ['things#3', { key: 'things#3', name: 'Portage', hue: 185 }],
]);

const thread = (over: Partial<Thread>): Thread => ({ id: 'IN1', said: 'x', kind: 'tell', when: 'now', to: 'anyone', to_run: null, to_agent: null, project: null, task: null, state: 'sent', seen_by: null, seen_how: null, seen_at: null, taken_by: null, taken_at: null, reply: null, replied_at: null, expires_at: null, at: '2026-09-03T10:00:00Z', updated_at: '2026-09-03T10:00:00Z', seen: [], receipts: null, ...over });

test('ON A PROJECT’S PAGE "ON" IS THAT PROJECT ALONE, and "To" offers only the runs working there', () => {
  const view = composerOf({ ...PICK_FIRST, on: 'things#1' }, ROWS, PROJECTS, 'things#1');
  assert.equal(view.onFixed, true);
  assert.deepEqual(view.on.map((c) => c.label), ['Kiln']);
  assert.ok(view.to.some((c) => c.key === 'run:S1'));
  assert.ok(!view.to.some((c) => c.key === 'run:S2'), 'a run on Portage is not offered on Kiln’s page');
  assert.deepEqual(view.when, ['now', 'next'], 'now, while a run there is working');
  assert.deepEqual(instructArgs(view, ' Check the kerning '), { said: 'Check the kerning', to: 'anyone', project: 'things#1', when: 'now' });
});

test('A PROJECT NOBODY IS ON TELLS THE NEXT RUN THERE, and says so', () => {
  const view = composerOf({ ...PICK_FIRST, on: 'things#3' }, [KILN], PROJECTS, 'things#3');
  assert.deepEqual(view.when, ['next']);
  assert.match(view.next, /^The next agent on Portage gets this when it starts/u);
  assert.equal(composerOf(PICK_FIRST, [], new Map(), 'things#3').on[0]?.key, 'things#3', 'the project stands before the projects are read');
});

test('A PANEL ON ONE RUN OR ONE PROJECT DRAWS THAT, a helper folded and never its own row', () => {
  assert.deepEqual(scopedLeads(ROWS, { run: 'S2' }).map((r) => r.run), ['S2']);
  assert.deepEqual(scopedLeads(ROWS, { project: 'things#1' }).map((r) => r.run), ['S1']);
  assert.deepEqual(scopedLeads(ROWS).map((r) => r.run), ['S1', 'S2']);
});

test('AND LISTS WHAT HE TOLD ABOUT IT: to that run, seen or taken by it, or on that project', () => {
  const told = [
    thread({ id: 'IN1', to: 'run', to_run: 'S1', project: 'things#1' }),
    thread({ id: 'IN2', project: 'things#3', taken_by: 'S2' }),
    thread({ id: 'IN3', seen: [{ run: 'S1', how: 'prompt', at: '2026-09-03T10:01:00Z' }] }),
  ];
  assert.deepEqual(scopedThreads(told, { run: 'S1' }).map((t) => t.id), ['IN1', 'IN3']);
  assert.deepEqual(scopedThreads(told, { project: 'things#3' }).map((t) => t.id), ['IN2']);
  assert.equal(scopedThreads(told).length, 3);
});
