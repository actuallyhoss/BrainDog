/**
 * The day a row was finished, filled by the write path (`finished.ts`): on a move to done, on a row made done, kept when
 * the write says the day itself, emptied on reopening, and refused on a declaration that names no day field.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, stampFinished, type Declaration } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.parse('2026-09-17T10:00:00Z');
const TODAY = '2026-09-17';
const OWNER = { actor: 'p_1' };

const tasks = (finished: unknown = 'done_on'): Declaration => ({
  id: 'register.tasks',
  kind: 'register',
  body: {
    id: 'tasks',
    title: 'what',
    state: 'state',
    done: ['done', 'dropped'],
    finished,
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'doing', 'done', 'dropped'], required: true },
      { id: 'done_on', type: 'day' },
      { id: 'by', type: 'day' },
    ],
  } as never,
});

async function record() {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const put = await k.install([tasks()]);
  assert.ok(put.ok, JSON.stringify(put));
  return k;
}

const ok = <T>(r: { ok: boolean; value?: T }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.value as T;
};

test('A MOVE TO DONE FILLS THE DAY, and a reopening empties it', async () => {
  const k = await record();
  ok(k.create('tasks', { what: 'Problem set 3', state: 'open' }, OWNER));
  assert.equal(k.get('tasks#1')!.fields.done_on, undefined);

  ok(k.update('tasks', 'tasks#1', { state: 'done' }, OWNER));
  assert.equal(k.get('tasks#1')!.fields.done_on, TODAY);
  /* THE HISTORY NAMES WHOEVER MOVED IT, in the same write. */
  const filled = k.history(k.get('tasks#1')!.id).filter((e) => e.field === 'done_on');
  assert.deepEqual(filled.map((e) => e.actor), ['p_1']);

  ok(k.update('tasks', 'tasks#1', { state: 'doing' }, OWNER));
  assert.equal(k.get('tasks#1')!.fields.done_on, undefined, 'reopened, it is not finished');
});

test('A ROW MADE DONE IS DATED TODAY, and a day the write names is kept', async () => {
  const k = await record();
  ok(k.create('tasks', { what: 'Handed in', state: 'done' }, OWNER));
  assert.equal(k.get('tasks#1')!.fields.done_on, TODAY);
  ok(k.create('tasks', { what: 'Imported', state: 'done', done_on: '2026-09-01' }, OWNER));
  assert.equal(k.get('tasks#2')!.fields.done_on, '2026-09-01');

  ok(k.create('tasks', { what: 'Said on Monday', state: 'open' }, OWNER));
  ok(k.update('tasks', 'tasks#3', { state: 'done', done_on: '2026-09-14' }, OWNER));
  assert.equal(k.get('tasks#3')!.fields.done_on, '2026-09-14');
  /* AN EDIT OF A DONE ROW LEAVES ITS DAY ALONE, and a reopening that says a day keeps it. */
  ok(k.update('tasks', 'tasks#3', { by: '2026-09-20' }, OWNER));
  assert.equal(k.get('tasks#3')!.fields.done_on, '2026-09-14');
  ok(k.update('tasks', 'tasks#2', { state: 'open', done_on: '2026-09-02' }, OWNER));
  assert.equal(k.get('tasks#2')!.fields.done_on, '2026-09-02');
});

test('A REGISTER WITH NO FINISHED DAY IS LEFT ALONE, and one naming a field that is not a day is refused', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const bad = await k.install([tasks('by_what')]);
  assert.equal(bad.ok, false);
  assert.equal((bad as { refusal: { at?: string } }).refusal.at, 'finished');
  const notDay = await k.install([tasks('what')]);
  assert.equal(notDay.ok, false);

  const fields: Record<string, unknown> = { state: 'done' };
  assert.equal(stampFinished({ state: 'state', done: ['done'] }, null, fields, [], TODAY), null);
  assert.deepEqual(fields, { state: 'done' });
});
