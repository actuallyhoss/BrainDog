/**
 * The thread's agent lanes, held without a browser: a run's span is its row's two instants, clipped to the day; an
 * agent's time is counted once however many of its runs overlap; and the line under the lanes says only what the rows
 * say.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { durationSaid, lanesOf, lanesSaid, type Run } from './lanes.ts';

const NOW = Date.parse('2026-09-30T10:00:00Z');
const ago = (min: number): string => new Date(NOW - min * 60_000).toISOString();
const run = (agent: string, from: number, to: number, working = false): Run => ({ agent, created: ago(from), lastSeen: ago(to), working });

test('a run is its row written to its last word, and a run working now reaches now', () => {
  const l = lanesOf([run('claude', 90, 48), run('claude', 30, 2, true)], NOW);
  assert.equal(l.lanes.length, 1);
  assert.deepEqual(
    l.lanes[0]?.spans.map((s) => [(NOW - s.from) / 60_000, (NOW - s.to) / 60_000, s.live]),
    [
      [90, 48, false],
      [30, 0, true],
    ],
  );
  assert.equal(l.start, NOW - 24 * 60 * 60_000);
  assert.equal(l.end, NOW);
});

test('a run from before the day is clipped to it, and one that ended before it is left out', () => {
  const l = lanesOf([run('codex', 30 * 60, 20 * 60), run('claude', 26 * 60, 25 * 60)], NOW);
  assert.deepEqual(l.lanes.map((x) => x.label), ['codex']);
  assert.equal(l.lanes[0]?.spans[0]?.from, l.start);
});

test('two runs of one agent at once are its time once', () => {
  const l = lanesOf([run('claude', 60, 0), run('claude', 40, 10)], NOW);
  assert.equal(l.worked[0]?.ms, 60 * 60_000);
});

test('a run whose instants cannot be read is not drawn anywhere', () => {
  const l = lanesOf([{ agent: 'claude', created: 'soon', lastSeen: ago(1), working: false }], NOW);
  assert.deepEqual(l.lanes, []);
});

test('the line names one agent, or the one who put in the most and how many are at it now', () => {
  assert.equal(lanesSaid(lanesOf([], NOW), 'Kiln'), 'No agent has worked on Kiln in the last day.');
  assert.equal(lanesSaid(lanesOf([run('claude', 42, 0, true)], NOW), 'Kiln'), 'claude has worked on it for 42 minutes in the last day, and is working now.');
  assert.equal(lanesSaid(lanesOf([run('claude', 68, 0)], NOW), 'Kiln'), 'claude has worked on it for 1 hour 8 minutes in the last day.');
  assert.equal(
    lanesSaid(lanesOf([run('claude', 120, 60), run('codex', 20, 0, true)], NOW), 'Kiln'),
    'Two agents worked on it in the last day, claude the longest at 1 hour. One is working now.',
  );
});

test('a stretch of time is said the way a sentence says it', () => {
  assert.equal(durationSaid(20_000), 'under a minute');
  assert.equal(durationSaid(60_000), '1 minute');
  assert.equal(durationSaid(2 * 60 * 60_000), '2 hours');
  assert.equal(durationSaid(61 * 60_000), '1 hour 1 minute');
});
