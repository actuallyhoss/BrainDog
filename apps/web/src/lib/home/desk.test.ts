/**
 * Working now: each agent by name with its project, what it is doing and since when, in the order `boot` sent them.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Working } from '../record/boot-live.ts';
import { forSaid, workingRows } from './desk.ts';

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
