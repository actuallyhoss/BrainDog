/**
 * AUDIT Z8 (today-1512-light.png, work-390-light-full.png): the sidebar's Work said 59, every row the tasks list holds
 * with the finished ones among them, while Tasks said "42 open" and Work's project chips added up to 42. Work's row
 * says the record's open count, the one figure Work's head and its chips say, or no number until it lands.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as side from './side.ts';
import { OPEN_WORK } from './side-read.ts';

const WORK = '/?work';
const places = [
  { href: WORK, label: 'Work', icon: 'task', count: 59 },
  { href: '/people', label: 'People', icon: 'people', count: 7 },
];

test('Work’s row in the sidebar says how many are open, as Work and its chips do (audit Z8)', () => {
  const withOpenWork = (side as Record<string, unknown>).withOpenWork as ((p: typeof places, w: string, n: number | null) => typeof places) | undefined;
  assert.equal(typeof withOpenWork, 'function', 'Work’s row still says every task ever filed');
  assert.deepEqual(withOpenWork!(places, WORK, 42).map((p) => p.count), [42, 7]);
  assert.deepEqual(withOpenWork!(places, WORK, null).map((p) => p.count), [undefined, 7], 'no open count, no number');
  assert.equal(OPEN_WORK, 'tasks-in-play', 'the figure Work’s head counts (`modules/work.ts` header)');
  const work = readFileSync(new URL('../../../../../packages/seed/src/modules/work.ts', import.meta.url), 'utf8');
  assert.match(work, /header: \{\s*count: \{ metric: 'tasks-in-play' \}/u);
  const bar = readFileSync(new URL('./SideBar.svelte', import.meta.url), 'utf8');
  assert.match(bar, /groupsOf\(withOpenWork\(places, WORK, openWork\)/u);
});
