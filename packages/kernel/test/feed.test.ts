/**
 * A record setting itself up is one line of the feed, and nothing else is folded into it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SETUP_KIND, setupCollapser, type FeedLine } from '../src/feed.ts';

type Line = FeedLine & { rowid: number; example?: boolean };
let n = 100;
const line = (over: Partial<Line>): Line => ({ rowid: n--, kind: 'create', target: 'entry:X', target_kind: 'entry', field: null, from: null, to: null, register: 'goals', seq: 1, title: 'x', ...over });
const created = (register: string) => line({ register, to: { what: 'Run', tags: ['example'] } });
const linked = (register: string) => line({ kind: 'edit', register, field: 'goal', from: null, to: 'ID', example: true });
const installed = (pack: string) => line({ kind: 'install', target: `pack:${pack}`, target_kind: 'pack', register: null, seq: null, title: null, to: '1.0.0' });

const collapse = (lines: Line[]): Line[] => {
  const c = setupCollapser<Line>((l) => l.example === true);
  return [...lines.flatMap((l) => c.push(l)), ...c.flush()];
};

test('A SETUP IS ONE LINE: the use case, and how many example rows it added', () => {
  const mine = line({ kind: 'create', register: 'people', to: { name: 'Sam' } });
  const out = collapse([mine, linked('goal_log'), linked('goal_log'), installed('usecase-personal'), created('goals'), created('goal_log'), created('goal_log'), installed('money-core'), created('accounts')]);
  assert.equal(out.length, 2);
  assert.equal(out[0], mine, 'a row the person wrote is its own line');
  assert.equal(out[1]!.kind, SETUP_KIND);
  assert.equal(out[1]!.target, 'pack:usecase-personal');
  assert.equal(out[1]!.to, 4);
  assert.equal(out[1]!.rowid, 99, 'the newest line of the setup, so a read mark covers all of it');
});

test('A PERSON EDITING AN EXAMPLE, OR ONE EXAMPLE WRITE, IS NOT A SETUP', () => {
  const edit = line({ kind: 'edit', register: 'goals', field: 'target', from: 3, to: 4, example: true });
  assert.deepEqual(collapse([edit, created('goals')]).map((l) => l.kind), ['edit', 'create']);
  assert.deepEqual(collapse([installed('work'), created('tasks')]).map((l) => l.kind), ['install', 'create']);
  const apart = collapse([created('goals'), line({ kind: 'edit', register: 'goals', field: 'what', from: 'a', to: 'b' }), created('goals')]);
  assert.deepEqual(apart.map((l) => l.kind), ['create', 'edit', 'create'], 'a write in between breaks the run');
});
