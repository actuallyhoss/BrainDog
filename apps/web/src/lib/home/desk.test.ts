/**
 * Working now: each agent by name with its project, what it is doing and since when, in the order `boot` sent them.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Working } from '../record/boot-live.ts';
import type { LiveRun, Thread } from '../record/instruct.ts';
import { LIVE_WORDS, forSaid, workingRows } from './desk.ts';
import { liveFolds, liveRows } from './desk-live.ts';

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

test('presence speaks over boot’s rows: the app, where, the last thing it did, when heard, and what it holds', () => {
  const drawn = workingRows([run()], new Map([['Larkspur', 210]]), NOW);
  const [r] = liveRows(drawn, [presence({ instruction: 'IN4', app: 'Claude Code', wrote: 3 })], [thread('IN4', 'Merge wave 1,\n then stop')]);
  assert.equal(r?.run, 'S82');
  assert.equal(r?.agent, 'Claude Code');
  assert.equal(r?.project, 'Larkspur', 'the project by the name and colour Today draws its card in');
  assert.equal(r?.slot, 'sky');
  assert.equal(r?.doing, 'Merging wave 1');
  assert.equal(r?.began, 'heard just now');
  assert.equal(r?.holds, 'Merge wave 1, then stop');
  assert.equal(r?.word, null);
});

test('a run is named by where it opened, says what it asked or wrote, and the runs left out are lines', () => {
  const asks = presence({ run: 'S1', project: null, doing: 'Claude Code run', app: 'Claude Code', cwd: '/Users/teo/Developer', wrote: 1, asked: 'Mark Wave 0 done?' });
  const idle = presence({ run: 'S2', project: null, doing: 'Claude run', cwd: '/Users/teo/Developer', wrote: 0 });
  const pc = presence({ run: 'S3', project: null, doing: 'Claude run', machine: 'Sam', cwd: 'D:\\work', wrote: 0, state: 'waiting', heard_s: 9 * 3600, quiet_s: 9 * 3600 });
  const look = presence({ run: 'S4', project: null, doing: 'Claude run', wrote: 0, looks: true });
  const rows = liveRows(workingRows([], new Map(), NOW), [asks, idle, pc, look], []);
  assert.deepEqual(rows.map((x) => [x.agent, x.project, x.doing]), [['Claude Code', 'the Developer folder', 'Asked you: “Mark Wave 0 done?”']]);
  assert.deepEqual(liveFolds([asks, idle, pc, look]), ['1 open, nothing written', 'Windows PC: 1 Claude session in the work folder, quiet', 'Not counted: one read-only look.']);
});

test('a paused or stopped run says so in the time’s place, a helper is no row, and a run gone is gone', () => {
  const drawn = workingRows([run()], new Map(), NOW);
  const rows = liveRows(drawn, [presence({ stopped: 'pause' }), presence({ run: 'S83', parent: 'S82' }), presence({ run: 'S84', state: 'gone' })], []);
  assert.deepEqual(rows.map((x) => x.run), ['S82']);
  assert.equal(rows[0]?.word, LIVE_WORDS.pause);
  assert.equal(rows[0]?.held, 'pause');
  assert.equal(rows[0]?.live, 'quiet');
  assert.equal(liveRows(drawn, [presence({ state: 'waiting' })], [])[0]?.word, 'heard just now', 'a run waiting on him says when it was heard');
});
