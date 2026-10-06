/**
 * A page recomposing in place: which block moves, which comes and which goes, between two answers.
 *
 * WHAT WOULD BE SILENTLY WRONG: a block followed by its place rather than by what it is (a block put in at the top
 * slides every tile under it into the wrong one's place), two blocks alike sharing one name (one of them never moves),
 * and a re-read that changed nothing playing a move anyway.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { blockKeys, planOf, type Box } from './recompose.ts';

const at = (x: number, y: number, w = 100, h = 40): Box => ({ x, y, w, h });

test('a block is named by what it is, so one put in at the top leaves the others their names', () => {
  const was = blockKeys([
    { kind: 'todo', source: 'register.tasks', heading: 'Late' },
    { kind: 'feed', source: 'activity', heading: 'Since you were away' },
  ]);
  const now = blockKeys([
    { kind: 'note', lead: true },
    { kind: 'todo', source: 'register.tasks', heading: 'Late' },
    { kind: 'feed', source: 'activity', heading: 'Since you were away' },
  ]);
  assert.deepEqual(now.slice(1), was);
  assert.notEqual(now[0], was[0]);
});

test('two blocks alike are told apart by their order, and a list named by its register is that list', () => {
  const keys = blockKeys([
    { kind: 'note', body: 'One' } as never,
    { kind: 'note', body: 'Two' } as never,
    { kind: 'capture', register: 'tasks' },
  ]);
  assert.equal(new Set(keys).size, 3);
  assert.ok(keys[2]!.includes('tasks'));
});

test('a block that moved plays from where it was, a new one comes in, one that left goes from where it stood', () => {
  const before = new Map([
    ['a', at(0, 0)],
    ['b', at(0, 60)],
    ['gone', at(0, 120)],
  ]);
  const after = new Map([
    ['new', at(0, 0)],
    ['a', at(0, 60)],
    ['b', at(0, 60.2)],
  ]);
  const plan = planOf(before, after);
  assert.deepEqual(plan.moves, [{ key: 'a', dx: 0, dy: -60 }]);
  assert.deepEqual(plan.enters, ['new']);
  assert.deepEqual(plan.leaves, [{ key: 'gone', box: at(0, 120) }]);
});

test('a re-read that changed nothing plays nothing', () => {
  const page = new Map([
    ['a', at(0, 0)],
    ['b', at(620, 0)],
  ]);
  assert.deepEqual(planOf(page, new Map(page)), { moves: [], enters: [], leaves: [] });
});
