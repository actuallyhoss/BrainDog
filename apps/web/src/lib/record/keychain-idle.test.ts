/**
 * The Keychain screen's idle lock, driven by a clock moved by hand.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createIdle, lockAfterOf, type Timers } from './keychain-idle.ts';

function clock() {
  let now = 0;
  let next = 1;
  const pending = new Map<number, { at: number; fn: () => void }>();
  const timers: Timers = {
    set: (fn, ms) => {
      const id = next++;
      pending.set(id, { at: now + ms, fn });
      return id;
    },
    clear: (h) => void pending.delete(h as number),
  };
  const advance = (ms: number) => {
    now += ms;
    for (const [id, t] of [...pending]) {
      if (t.at <= now) {
        pending.delete(id);
        t.fn();
      }
    }
  };
  return { timers, advance, count: () => pending.size };
}

const MIN = 60_000;

test('THE LOCK TIME IS THE RECORD\'S WHEN IT IS ONE OF THE THREE, else fifteen minutes', () => {
  assert.equal(lockAfterOf(undefined), 15);
  assert.equal(lockAfterOf(5), 5);
  assert.equal(lockAfterOf('60'), 60);
  assert.equal(lockAfterOf(0), 15);
  assert.equal(lockAfterOf(7), 15);
  assert.equal(lockAfterOf(''), 15);
});

test('IT LOCKS AFTER THE TIME WITH NO INPUT, and any input starts the wait again', () => {
  const c = clock();
  let locks = 0;
  const idle = createIdle(15 * MIN, () => locks++, c.timers);
  c.advance(14 * MIN);
  idle.touch();
  c.advance(14 * MIN);
  assert.equal(idle.locked, false);
  assert.equal(locks, 0);
  c.advance(1 * MIN);
  assert.equal(idle.locked, true);
  assert.equal(locks, 1);
});

test('LOCKED STAYS LOCKED: input does not open it, only unlock does, and the wait starts again', () => {
  const c = clock();
  let locks = 0;
  const idle = createIdle(5 * MIN, () => locks++, c.timers);
  idle.lockNow();
  assert.equal(idle.locked, true);
  idle.lockNow();
  idle.touch();
  c.advance(60 * MIN);
  assert.equal(locks, 1, 'locking twice puts the values away once');
  assert.equal(idle.locked, true);
  idle.unlock();
  assert.equal(idle.locked, false);
  c.advance(4 * MIN);
  assert.equal(idle.locked, false);
  c.advance(1 * MIN);
  assert.equal(idle.locked, true);
  assert.equal(locks, 2);
});

test('LEAVING THE SCREEN LEAVES NO TIMER RUNNING', () => {
  const c = clock();
  const idle = createIdle(5 * MIN, () => assert.fail('locked after stop'), c.timers);
  idle.stop();
  assert.equal(c.count(), 0);
  c.advance(10 * MIN);
});
