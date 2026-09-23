/**
 * An enum sorts in the order it was declared, in the browser as in the record.
 *
 * `compareRows` sorted a labelled enum by its label and an unlabelled one by the stored word, which was the
 * record's rule and was wrong in both engines the same way: `priority` ascending answered High, Low, Normal,
 * Urgent. The rows below are `packages/kernel/test/enum-order.test.ts`'s, in the same order, so the two engines
 * are held to one answer, newest first on a tie as the record breaks one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ROWS, sortRows } from './api.ts';
import type { Entry } from './schema.ts';

const rows = (...fields: Record<string, unknown>[]): Entry[] => fields.map((f, i) => ({ seq: i + 1, fields: f }) as Entry);

const GIVEN = rows(
  { what: 'a', priority: 'normal', state: 'open' },
  { what: 'b', priority: 'urgent', state: 'done' },
  { what: 'c', state: 'backlog' },
  { what: 'd', priority: 'low', state: 'review' },
  { what: 'e', priority: 'high', state: 'doing' },
  { what: 'f', priority: 'urgent', state: 'blocked' },
  { what: 'g', priority: 'normal', state: 'dropped' },
);

test('PRIORITY ASCENDING IS URGENT, HIGH, NORMAL, LOW, as the record sorts it, and empty is last both ways', () => {
  const whats = (dir: 'asc' | 'desc') => sortRows('tasks', GIVEN, 'priority', dir).map((e) => e.fields.what);
  /* Red at 07ba6dbd: e, d, g, a, f, b, c, which is High, Low, Normal, Normal, Urgent, Urgent, then the empty one. */
  assert.deepEqual(whats('asc'), ['f', 'b', 'e', 'g', 'a', 'd', 'c']);
  assert.deepEqual(whats('desc'), ['d', 'g', 'a', 'e', 'f', 'b', 'c']);
});

test('A WORD THE ENUM DOES NOT DECLARE SORTS AFTER EVERY DECLARED ONE AND BEFORE THE EMPTY, as the record puts it', () => {
  /* `indexOf` answers -1 for a word outside `values`, so without the guard in `compareRows` the stray word led the list
     ascending, ahead of Urgent, while the record's `CASE ... ELSE` puts it after Low. Checked by mutation: returning the
     bare index turned this red and left the two tests around it green. */
  const given = rows({ what: 'a', priority: 'someday' }, { what: 'b', priority: 'low' }, { what: 'c' }, { what: 'd', priority: 'urgent' });
  const words = (dir: 'asc' | 'desc') => sortRows('tasks', given, 'priority', dir).map((e) => e.fields.priority ?? null);
  assert.deepEqual(words('asc'), ['urgent', 'low', 'someday', null]);
  assert.deepEqual(words('desc'), ['someday', 'low', 'urgent', null]);
});

test("THE SAMPLE'S TASKS SORT BY STATE IN ITS DECLARED ORDER, where two of seven values carry a label", () => {
  /* The sample's tasks hold no priority, so the sample is sorted by `state`, which labels `backlog` Later and `review`
     To check. Red at 07ba6dbd it answered blocked, doing, done, dropped, then Later among the stored words. */
  const tasks = ROWS.tasks ?? [];
  assert.ok(tasks.length > 0, 'the sample holds tasks');
  const declared = ['backlog', 'open', 'doing', 'review', 'blocked', 'done', 'dropped'];
  const states = sortRows('tasks', tasks, 'state', 'asc').map((e) => String(e.fields.state));
  const seen = states.filter((s, i) => states[i - 1] !== s);
  assert.deepEqual(seen, declared.filter((s) => states.includes(s)), 'each state once, in the declared order');
  assert.deepEqual(sortRows('tasks', GIVEN, 'state', 'asc').map((e) => e.fields.state), declared);
});
