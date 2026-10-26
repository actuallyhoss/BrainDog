/**
 * Work's row in the sidebar says what Work's own Open says: every task taken on, neither done nor kept for later. It
 * once said every row the tasks list holds, the finished ones among them, and then every row not done, the ones kept
 * for later counted in, beside a smaller Open on the page. While the count is read it says the number last drawn.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { laterOf, openOf } from './side-read.ts';

test('Work’s row says the tasks taken on, never the done ones nor those kept for later', () => {
  /* A LIST OF 59: 17 done or dropped, 12 kept for later, 30 taken on. */
  const counted = { counts: [{ value: 'open', n: 22 }, { value: 'doing', n: 6 }, { value: 'blocked', n: 2 }, { value: 'done', n: 15 }, { value: 'backlog', n: 12 }, { value: 'dropped', n: 2 }], matched: 59 };
  assert.equal(openOf(counted, ['done', 'dropped', 'backlog']), 30);
  assert.equal(openOf(counted, ['done', 'dropped']), 42, 'a list that keeps nothing for later counts every row not done');
  assert.equal(openOf({ ...counted, capped: true }, ['done', 'dropped']), null, 'a capped count is no count');
});

test('the states kept for later are read off the declaration: the live ones listed before the one a new row starts in', () => {
  const field = { id: 'state', values: ['someday', 'next', 'open', 'doing', 'done', 'dropped'], default: 'open' };
  assert.deepEqual(laterOf({ state: 'state', done: ['done', 'dropped'], fields: [field] }), ['someday', 'next']);
  assert.deepEqual(laterOf({ state: 'state', done: ['done'], fields: [{ ...field, default: 'someday' }] }), [], 'a list that starts at its first state keeps nothing for later');
  assert.deepEqual(laterOf({ state: 'state', fields: [{ id: 'state', values: ['a', 'b'] }] }), [], 'no starting state, nothing kept for later');
});

test('the sidebar reads each place’s count by what its list declares, and draws the kept number while it reads', () => {
  const bar = readFileSync(new URL('./SideBar.svelte', import.meta.url), 'utf8');
  const read = readFileSync(new URL('./side-read.ts', import.meta.url), 'utf8');
  assert.match(bar, /folk \? await readFolk\(b, list\) : await readOpenWork\(b, list\)/u);
  assert.match(bar, /counts\[p\.key\] \?\? p\.count/u, 'a place says its read count, else the shell’s');
  assert.match(bar, /counts = untrack\(\(\) => keptCounts\(base\)\)/u, 'the kept count is drawn before any read');
  assert.match(read, /openOf\(out\.value, \[\.\.\.\(d\.done \?\? \[\]\), \.\.\.laterOf\(d\)\]\)/u, 'Work’s count leaves out the done and the later');
});
