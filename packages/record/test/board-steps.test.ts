/**
 * A board's edits land on the page as it stands (`src/board-steps.ts`): a move, a size, an add, a remove, a draft kept
 * and the phone's arrangement, and a step whose widget is gone is the one refusal.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { boardStepsOn, stepsOf } from '../src/board-steps.ts';

const body = () => ({
  page: 'home',
  title: 'Today',
  board: true,
  requires: ['register.tasks'],
  phone: { order: ['a', 'b', 'c'], hidden: ['c'] },
  blocks: [
    { kind: 'note', lead: true, body: 'Hi' },
    { kind: 'stat', key: 'a', size: 'small' },
    { kind: 'todo', key: 'b', size: 'tall', source: 'register.tasks' },
    { kind: 'stat', key: 'c', size: 'wide', draft: { by: 'Slash', why: 'You asked' } },
  ],
});

test('a move, a size, a kept draft and a removal land in one body', () => {
  const out = boardStepsOn(body(), [{ move: 'c', before: 'a' }, { size: 'a', to: 'wide' }, { keep: 'c' }, { remove: 'b' }]);
  assert.ok(out.ok);
  if (!out.ok) return;
  assert.deepEqual(out.body.blocks.map((b) => b.key ?? null), [null, 'c', 'a']);
  assert.equal(out.body.blocks[2]!.size, 'wide');
  assert.equal(out.body.blocks[1]!.draft, undefined);
  assert.deepEqual(out.body.phone, { order: ['a', 'c'], hidden: ['c'] });
});

test('an add takes a fresh key, its list joins requires, and a size its kind cannot take is refused', () => {
  const out = boardStepsOn(body(), [{ add: { kind: 'table', source: 'register.bills', key: 'a' }, before: null }]);
  assert.ok(out.ok);
  if (out.ok) {
    const added = out.body.blocks.at(-1)!;
    assert.match(String(added.key), /^w-/);
    assert.equal(added.size, 'wide');
    assert.deepEqual(out.body.requires, ['register.tasks', 'register.bills']);
  }
  const small = boardStepsOn(body(), [{ size: 'b', to: 'full' }]);
  assert.ok(small.ok, 'a todo can be full');
  assert.equal(boardStepsOn({ ...body(), blocks: [{ kind: 'cards', key: 'p', size: 'wide' }] }, [{ size: 'p', to: 'small' }]).ok, false);
});

test('a step on a widget that is gone is refused, and a malformed list is not steps', () => {
  const out = boardStepsOn(body(), [{ move: 'zz', before: null }]);
  assert.equal(out.ok, false);
  assert.equal(stepsOf([{ move: 'a' }]), null);
  assert.deepEqual(stepsOf([{ remove: 'a' }]), [{ remove: 'a' }]);
});

test('a widget set anew keeps its key, its place and its size, and reads what the new block reads', () => {
  const out = boardStepsOn(body(), [{ set: 'a', block: { kind: 'todo', heading: 'Blocked', source: 'register.things' } }]);
  assert.ok(out.ok);
  if (!out.ok) return;
  assert.deepEqual(out.body.blocks[1], { kind: 'todo', heading: 'Blocked', source: 'register.things', key: 'a', size: 'small' });
  assert.ok((out.body.requires as string[]).includes('register.things'));
  assert.ok(stepsOf([{ set: 'a', block: { kind: 'stat' } }]));
});
