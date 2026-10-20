/** `timing.ts`: off unless the flag is set, one line per screen and way in, and each line says its target. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { firsts, timingLine, timingOn, TIMING_FLAG } from './timing.ts';

const store = (v: string | null) => ({ getItem: (k: string) => (k === TIMING_FLAG ? v : null) });

test('the flag is off by default, on only for 1, and off when storage throws', () => {
  assert.equal(timingOn(store(null)), false);
  assert.equal(timingOn(store('0')), false);
  assert.equal(timingOn(store('1')), true);
  assert.equal(timingOn(null), false);
  assert.equal(timingOn({ getItem: () => { throw new Error('blocked'); } }), false);
});

test('a line names the screen, the way in and whether it met its target', () => {
  assert.equal(timingLine('list', '/r/tasks', 'copy', 120.4), '[timing] list /r/tasks from copy: 120 ms (within 300 ms)');
  assert.equal(timingLine('list', '/r/tasks', 'network', 1_250), '[timing] list /r/tasks from network: 1250 ms (over 1000 ms)');
  assert.equal(timingLine('page', '/p/people', 'memory', 100), '[timing] page /p/people from memory: 100 ms (within 100 ms)');
});

test('only the first paint of each screen and way in is logged, until the next open', () => {
  const f = firsts();
  assert.equal(f.first('list', 'copy'), true);
  assert.equal(f.first('list', 'copy'), false);
  assert.equal(f.first('list', 'network'), true);
  f.reset();
  assert.equal(f.first('list', 'copy'), true);
});
