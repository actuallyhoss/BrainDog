import { test } from 'node:test';
import assert from 'node:assert/strict';

import { moveTick, nextTicks, tickState } from './ticks.ts';

/* ── what the box shows ───────────────────────────────────────────────────── */

test('with nothing pressed, the box shows what the document says and claims no save', () => {
  assert.deepEqual(tickState(false, undefined), { done: false, unsaved: false });
  assert.deepEqual(tickState(true, undefined), { done: true, unsaved: false });
});

test('a row the author wrote with no box at all is not ticked', () => {
  // `Row.done` is `undefined` on every kind but `todo`, and on a `todo` line with no `[ ]`.
  // Absent is not ticked, and it must not be `undefined` on the way to `aria-checked`.
  assert.deepEqual(tickState(undefined, undefined), { done: false, unsaved: false });
});

test('a pressed box shows this session, and says so', () => {
  /* The mark is the whole of rule 4: there is no write path behind the box yet, so a tick that
     drew itself and said nothing would be the product claiming a save that did not happen. */
  assert.deepEqual(tickState(false, true), { done: true, unsaved: true });
  assert.deepEqual(tickState(true, false), { done: false, unsaved: true });
});

/* ── the ledger ───────────────────────────────────────────────────────────── */

test('a press records the answer that differs from the document', () => {
  const after = nextTicks(new Map(), 2, true, false);
  assert.equal(after.get(2), true);
  assert.equal(after.size, 1);
});

test('AND PRESSING IT BACK LEAVES NO MARK, because agreeing with the document is not a change', () => {
  /* The way back out of a mistake is the box itself, pressed again. If that left the entry
     standing, the row would sit there wearing "not saved" while matching the document exactly:
     an unsaved mark nobody can act on, indistinguishable from one somebody must. */
  const on = nextTicks(new Map(), 2, true, false);
  const off = nextTicks(on, 2, false, false);
  assert.equal(off.has(2), false);
  assert.equal(off.size, 0);

  // And the same from the other end: unticking an authored `[x]`, then ticking it back.
  const cleared = nextTicks(new Map(), 5, false, true);
  assert.equal(cleared.get(5), false);
  assert.equal(nextTicks(cleared, 5, true, true).has(5), false);
});

test('the ledger handed in is never touched', () => {
  // The component holds this in `$state` and a `Map` is not proxied, so a mutation in place is a
  // tick that happened and never drew.
  const before = new Map<number, boolean>([[1, true]]);
  const after = nextTicks(before, 3, true, false);
  assert.equal(before.size, 1);
  assert.equal(after.size, 2);
  assert.notEqual(before, after);
});

test('rows are held apart by position', () => {
  let ticks = new Map<number, boolean>();
  ticks = nextTicks(ticks, 0, true, false);
  ticks = nextTicks(ticks, 4, true, false);
  assert.deepEqual([...ticks.keys()], [0, 4]);
});

/* ── the one tab stop ─────────────────────────────────────────────────────── */

test('the arrows move the one tab stop, and clamp rather than wrap', () => {
  assert.equal(moveTick(0, 'ArrowDown', 4), 1);
  assert.equal(moveTick(2, 'ArrowUp', 4), 1);
  assert.equal(moveTick(3, 'ArrowDown', 4), 3);
  assert.equal(moveTick(0, 'ArrowUp', 4), 0);
});

test('Home and End are the ends of the LIST, because there is no second axis here', () => {
  assert.equal(moveTick(2, 'Home', 4), 0);
  assert.equal(moveTick(1, 'End', 4), 3);
});

test('a key that is not ours is left alone, so nothing bare is bound', () => {
  /* Returning `null` is what keeps the component from calling `preventDefault`. Tab must leave,
     Enter and Space must reach the button's own activation, and a bare letter must reach whatever
     page this block was drawn inside. */
  for (const key of ['Tab', 'Enter', ' ', 'j', 'k', 'x', 'Escape', 'PageDown', 'ArrowLeft'])
    assert.equal(moveTick(1, key, 4), null, key);
});

test('an empty list has nowhere to move to', () => {
  // A `todo` fence with no rows still renders, and an arrow in it must not resolve to index -1.
  assert.equal(moveTick(0, 'ArrowDown', 0), null);
  assert.equal(moveTick(0, 'End', 0), null);
});

test('a list of one is already at both ends', () => {
  assert.equal(moveTick(0, 'ArrowDown', 1), 0);
  assert.equal(moveTick(0, 'End', 1), 0);
});
