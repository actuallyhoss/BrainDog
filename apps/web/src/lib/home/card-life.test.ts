/**
 * Every project card says one live thing (the audit of 22 October, U5): who is on it, else who worked on it last from
 * the runs, else how long since its work moved, else since when it has been quiet. And each project takes its newest
 * run, named by its spoken id, its row id or its name.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { lastRunsOf } from './card-life.ts';
import { lifeOf } from './project-cards.ts';

const NOW = Date.parse('2026-10-23T12:00:00Z');
const cards = [
  { seq: 1, id: 'r_lantern', name: 'Lanternfish' },
  { seq: 2, id: null, name: 'Copperleaf' },
  { seq: 3, id: null, name: 'Harbourview' },
];

test('each project takes its newest run, by its spoken id, its row id or its name, and says it in words', () => {
  const runs = [
    { fields: { project: 'things#2', agent: 'claude', last_seen: '2026-10-23T10:00:00Z' } },
    { fields: { project: 'r_lantern', agent: 'codex', last_seen: '2026-10-21T09:00:00Z' } },
    { fields: { project: 'things#2', agent: 'codex', last_seen: '2026-10-20T09:00:00Z' } },
    { fields: { project: 'harbourview', agent: 'claude', last_seen: '2026-09-28T09:00:00Z' } },
    { fields: { project: 'things#9', agent: 'claude', last_seen: '2026-10-23T11:00:00Z' } },
    { fields: { project: '', agent: 'claude', last_seen: '2026-10-23T11:30:00Z' } },
  ];
  const got = lastRunsOf(runs, 'project', 'things', cards, NOW);
  assert.deepEqual([...got.keys()].sort(), [1, 2, 3]);
  assert.equal(got.get(2)?.agent, 'claude', 'the newest run on it, not an older one');
  assert.equal(got.get(2)?.said, '2 hours ago');
  assert.equal(got.get(1)?.said, '2 days ago');
  assert.match(got.get(3)?.said ?? '', /^\d+ weeks? ago$/u, 'a long time is said in words too, never "4w ago"');
});

test('a card says one live line: who is on it, else the last run, else its work, else since when it is quiet', () => {
  const quiet = { worked: null, last: null, moved: '2026-09-28' };
  assert.deepEqual(lifeOf(quiet, []), { kind: 'quiet', said: 'Nothing changed since 28 Sep' });
  assert.deepEqual(lifeOf({ ...quiet, worked: { said: '2 days', quiet: false } }, []), { kind: 'worked', said: 'Worked on 2 days ago', quiet: false });
  assert.deepEqual(lifeOf({ ...quiet, worked: { said: '2 days', quiet: false }, last: { agent: 'claude', name: 'Claude', said: '2 hours ago' } }, []), {
    kind: 'run',
    said: 'Worked on 2 hours ago',
    agent: 'claude',
  });
  assert.deepEqual(lifeOf(quiet, [{ name: 'Claude' }, { name: 'Codex' }]), { kind: 'working', said: 'Claude and Codex working' });
  assert.equal(lifeOf({ worked: null, last: null, moved: null }, []), null, 'nothing to say is nothing drawn, never a made-up line');
});
