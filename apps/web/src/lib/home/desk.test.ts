/**
 * Working now: each agent by name with its project, what it is doing and since when, in the order `boot` sent them.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Working } from '../record/boot-live.ts';
import { workingRows } from './desk.ts';

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
  assert.equal(r?.doing, 'Fixing the booking page');
  assert.match(r?.began ?? '', /min/u);
  assert.equal(r?.live, 'working');
});

test('a run with no project, words or number says none of them, and a quiet one is quiet', () => {
  const [r] = workingRows([run({ seq: null, project: null, doing: null, since: null, quiet: true })], new Map(), NOW);
  assert.equal(r?.project, null);
  assert.equal(r?.hue, null);
  assert.equal(r?.doing, null);
  assert.equal(r?.run, '');
  assert.equal(r?.began, '');
  assert.equal(r?.live, 'quiet');
});

test('nobody working is no rows', () => {
  assert.deepEqual(workingRows([], new Map(), NOW), []);
});
