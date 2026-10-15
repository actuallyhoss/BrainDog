/**
 * A run keeping its own books is left out of what changed lately, and a person's edit to that same run is not.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { RUN_PREFIX, RUNS, bookKept } from './books-kept.ts';
import { recentOf, type Changed, type List } from './palette.ts';

const LISTS: List[] = [
  { id: RUNS, name: 'Agents', count: 3, icon: 'rows' },
  { id: 'tasks', name: 'Tasks', count: 4, icon: 'rows' },
];

const line = (over: Partial<Changed>): Changed => ({ ts: '2026-10-15T09:00:00Z', kind: 'update', register: RUNS, seq: 7, title: 'Tidy the kiln notes', ...over });

test("the app's runs list and handle are the kernel's", async () => {
  /* THE APP DOES NOT LOAD THE KERNEL AT RUN TIME, so it keeps both as literals; the test reads the kernel's own. */
  const kernel = await import('@braindog/kernel');
  assert.equal(RUNS, kernel.SESSION);
  assert.equal(RUN_PREFIX, kernel.SESSION_PREFIX);
});

test('a line on the runs list by the record or by that run is books kept', () => {
  assert.equal(bookKept({ register: RUNS, seq: 7, actor: 'system' }), true);
  assert.equal(bookKept({ register: RUNS, seq: 7, actor: 'S7' }), true);
  /* Another run writing on this one, a person, a line with no signer, and any other list are all kept. */
  assert.equal(bookKept({ register: RUNS, seq: 7, actor: 'S8' }), false);
  assert.equal(bookKept({ register: RUNS, seq: 7, actor: 'usr_wren' }), false);
  assert.equal(bookKept({ register: RUNS, seq: 7 }), false);
  assert.equal(bookKept({ register: 'tasks', seq: 7, actor: 'S7' }), false);
  assert.equal(bookKept({ register: RUNS, seq: null, actor: 'system' }), false);
});

test("changed lately drops a run's own lines and keeps a person's edit to it", () => {
  const events: Changed[] = [
    line({ ts: '2026-10-15T09:06:00Z', actor: 'S7', kind: 'state' }),
    line({ ts: '2026-10-15T09:05:00Z', actor: 'system' }),
    line({ ts: '2026-10-15T09:04:00Z', actor: 'S7' }),
    line({ ts: '2026-10-15T09:03:00Z', actor: 'usr_wren' }),
    line({ ts: '2026-10-15T09:02:00Z', seq: 9, title: 'Glaze test run', actor: 'S9' }),
  ];
  const out = recentOf(events, LISTS, 6);
  assert.deepEqual(
    out.map((r) => [r.target, r.at]),
    [[`${RUNS}#7`, '2026-10-15T09:03:00Z']],
  );
});

test('a line by an agent on another list is kept', () => {
  const events: Changed[] = [
    line({ ts: '2026-10-15T09:06:00Z', actor: 'S7' }),
    line({ ts: '2026-10-15T09:05:00Z', register: 'tasks', seq: 3, title: 'Order more clay', actor: 'S7' }),
    line({ ts: '2026-10-15T09:04:00Z', register: 'tasks', seq: 4, title: 'Fire the second batch', actor: 'system' }),
  ];
  const out = recentOf(events, LISTS, 6);
  assert.deepEqual(out.map((r) => r.title), ['Order more clay', 'Fire the second batch']);
});

test("a run's own removal still closes its page", () => {
  const events: Changed[] = [line({ ts: '2026-10-15T09:06:00Z', actor: 'system', kind: 'delete' }), line({ ts: '2026-10-15T09:03:00Z', actor: 'usr_wren' })];
  assert.deepEqual(recentOf(events, LISTS, 6), []);
});
