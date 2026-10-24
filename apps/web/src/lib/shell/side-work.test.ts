/**
 * AUDIT Z8 (today-1512-light.png, work-390-light-full.png): the sidebar's Work said 59, every row the tasks list holds
 * with the finished ones among them, while Tasks said "42 open" and Work's project chips added up to 42. Work's row
 * says how many are open, every row not in a state the list declares done, or no number until that lands.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as side from './side.ts';
import * as read from './side-read.ts';

const WORK = '/?work';
const places = [
  { href: WORK, label: 'Work', icon: 'task', count: 59 },
  { href: '/people', label: 'People', icon: 'people', count: 7 },
];

test('Work’s row in the sidebar says how many are open, as Work and its chips do (audit Z8)', () => {
  const withOpenWork = (side as Record<string, unknown>).withOpenWork as ((p: typeof places, w: string, n: number | null) => typeof places) | undefined;
  const openOf = (read as Record<string, unknown>).openOf as ((c: { counts: { value: unknown; n: number }[]; matched: number; capped?: true }, done: string[]) => number | null) | undefined;
  assert.equal(typeof withOpenWork, 'function', 'Work’s row still says every task ever filed');
  assert.equal(typeof openOf, 'function');
  /* HIS RECORD: 59 rows, 17 of them done or dropped, 42 open. */
  const counted = { counts: [{ value: 'open', n: 30 }, { value: 'done', n: 15 }, { value: 'backlog', n: 12 }, { value: 'dropped', n: 2 }], matched: 59 };
  assert.equal(openOf!(counted, ['done', 'dropped']), 42);
  assert.equal(openOf!({ ...counted, capped: true }, ['done', 'dropped']), null, 'a capped count is no count');
  assert.deepEqual(withOpenWork!(places, WORK, 42).map((p) => p.count), [42, 7]);
  assert.deepEqual(withOpenWork!(places, WORK, null).map((p) => p.count), [undefined, 7], 'no open count, no number');
  const bar = readFileSync(new URL('./SideBar.svelte', import.meta.url), 'utf8');
  assert.match(bar, /groupsOf\(withOpenWork\(places, WORK, openWork\)/u);
});
