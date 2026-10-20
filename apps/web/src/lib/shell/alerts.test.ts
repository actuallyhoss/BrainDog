import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handoffAlert, questionAlert, ring, sift } from './alerts.ts';

const q = (id: string) => questionAlert({ id, question: `Q ${id}` });

test('the first hearing seeds and rings nothing', () => {
  const out = sift(null, [q('a'), q('b')]);
  assert.deepEqual(out.fresh, []);
  assert.equal(out.seen.size, 2);
});

test('a new question rings once and never again', () => {
  const first = sift(null, [q('a')]).seen;
  const second = sift(first, [q('a'), q('b')]);
  assert.deepEqual(second.fresh.map((a) => a.id), ['q:b']);
  assert.deepEqual(sift(second.seen, [q('a'), q('b')]).fresh, []);
});

test('nothing rings while focused or switched off, but the item is still counted as seen', () => {
  const sent: string[] = [];
  const door = (on: boolean, focused: boolean) => ({ on: () => on, focused: () => focused, send: (t: string) => void sent.push(t) });
  const seen = sift(null, []).seen;
  const a = ring(seen, [q('a')], door(true, true));
  ring(a, [q('a')], door(true, false));
  ring(seen, [q('b')], door(false, false));
  assert.deepEqual(sent, []);
  ring(seen, [q('c')], door(true, false));
  assert.deepEqual(sent, ['Needs you']);
});

test('only a handoff line is a handoff', () => {
  assert.equal(handoffAlert({ id: '1', kind: 'note' }), null);
  assert.equal(handoffAlert({ id: '1', kind: 'state', to: 'active' }), null);
  assert.equal(handoffAlert({ id: '1', kind: 'state', to: 'handoff', note: 'Pick up the tests' })?.goto, '/app/p/agents');
});
