/**
 * Working now: each agent by name with its project, what it is doing and since when, in the order `boot` sent them.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Working } from '../record/boot-live.ts';
import type { LiveRun, Thread } from '../record/instruct.ts';
import { LIVE_WORDS, forSaid, liveRows, workingRows } from './desk.ts';

const NOW = Date.parse('2026-10-19T10:00:00Z');
const run = (over: Partial<Working> = {}): Working => ({
  seq: 82,
  agent: 'claude',
  kind: 'claude',
  project: 'Larkspur',
  doing: ' Fixing the booking page ',
  since: '2026-10-19T09:28:00Z',
  quiet: false,
  ...over,
});

test('an agent is said by name, with its project, its words and how long', () => {
  const [r] = workingRows([run()], new Map([['Larkspur', 210]]), NOW);
  assert.equal(r?.agent, 'Claude');
  assert.equal(r?.run, 'S82');
  assert.equal(r?.project, 'Larkspur');
  assert.equal(r?.hue, 210);
  assert.equal(r?.slot, 'sky', 'the dot takes the slot the card is drawn in (SPEC 1.3), not the stored hue');
  assert.equal(r?.doing, 'Fixing the booking page');
  assert.match(r?.began ?? '', /min/u);
  assert.equal(r?.live, 'working');
});

test('a run with no project, words or number says none of them, and a quiet one is quiet', () => {
  const [r] = workingRows([run({ seq: null, project: null, doing: null, since: null, quiet: true })], new Map(), NOW);
  assert.equal(r?.project, null);
  assert.equal(r?.hue, null);
  assert.equal(r?.slot, null);
  assert.equal(r?.doing, null);
  assert.equal(r?.run, '');
  assert.equal(r?.began, '');
  assert.equal(r?.live, 'quiet');
});

test('a working run says how long, never the clock it began at', () => {
  assert.equal(forSaid('2026-10-19T09:28:00Z', NOW), 'for 32 min');
  assert.equal(forSaid('2026-10-19T07:55:00Z', NOW), 'for 2 h 5 min');
  assert.equal(forSaid('2026-10-19T07:00:00Z', NOW), 'for 3 h');
  assert.equal(forSaid('2026-10-18T20:00:00Z', NOW), 'for 14 h');
  assert.match(forSaid('2026-10-17T08:00:00Z', NOW), /^since 17 Oct$/u);
});

test('nobody working is no rows', () => {
  assert.deepEqual(workingRows([], new Map(), NOW), []);
});

const presence = (over: Partial<LiveRun> = {}): LiveRun => ({
  run: 'S82',
  name: null,
  agent: 'claude',
  machine: null,
  project: 'things#1',
  repo: null,
  worktree: null,
  branch: null,
  doing: 'Merging wave 1',
  state: 'working',
  instruction: null,
  task: null,
  stopped: null,
  helpers: [],
  parent: null,
  for_s: 600,
  heard_s: 10,
  reach: 'hooks',
  ...over,
});

const thread = (id: string, said: string) => ({ id, said }) as unknown as Thread;

test('presence speaks over boot’s rows: what it is doing, for how long, and what he told it that it holds', () => {
  const drawn = workingRows([run()], new Map([['Larkspur', 210]]), NOW);
  const [r] = liveRows(drawn, [presence({ instruction: 'IN4' })], [thread('IN4', 'Merge wave 1,\n then stop')], NOW);
  assert.equal(r?.run, 'S82');
  assert.equal(r?.agent, 'Claude');
  assert.equal(r?.project, 'Larkspur', 'the project by the name and colour Today draws its card in');
  assert.equal(r?.slot, 'sky');
  assert.equal(r?.doing, 'Merging wave 1');
  assert.equal(r?.began, 'for 10 min');
  assert.equal(r?.holds, 'Merge wave 1, then stop');
  assert.equal(r?.word, null);
});

test('a paused or stopped run says so in the time’s place, a helper is no row, and a run gone is gone', () => {
  const drawn = workingRows([run()], new Map(), NOW);
  const rows = liveRows(
    drawn,
    [presence({ stopped: 'pause' }), presence({ run: 'S83', parent: 'S82' }), presence({ run: 'S84', state: 'gone' }), presence({ run: 'S85', state: 'waiting' })],
    [],
    NOW,
  );
  assert.deepEqual(rows.map((x) => x.run), ['S82'], 'a waiting run boot does not count is not working');
  assert.equal(rows[0]?.word, LIVE_WORDS.pause);
  assert.equal(rows[0]?.held, 'pause');
  assert.equal(rows[0]?.live, 'quiet');
  assert.equal(liveRows(drawn, [presence({ state: 'waiting' })], [], NOW)[0]?.word, LIVE_WORDS.waiting, 'one boot counts says it waits');
});
