/**
 * A task ticked on a page, and then put back from the receipt, is where it was before the tick.
 *
 * THE UNDO WROTE A STATE THE ROW NEVER HAD. The receipt a tick raises offered `tickPatch(ref, !done)`, and "not done" is
 * the list's default state, never the one the row held (audit sixty-four, section 3). Over Work's states a task in
 * `doing`, ticked and undone, was written `{"state":"open"}`, and so were `blocked` and `review`, while the receipt had
 * said the task was merely marked not done. The board already did this right: its undo writes the column the card came
 * from. The tick now follows the row page's `putBackOf` rule through `inverseOf`, which is the same rule with the
 * finished day added, so the values sent back are the ones the row held.
 *
 * EVERY CASE BELOW IS A REAL WRITE against a kernel on an in-memory SQLite, the tick at the version the page read and the
 * undo at the version the tick answered with, because what a put back is worth is decided by what the record keeps.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Kernel } from '@braindog/kernel';

import { tickPatch } from '../record/page-write.ts';
import type { Entry, Fields } from '../record/schema.ts';
import { tickBackOf } from './tick-undo.ts';

/* THE PAGE'S WRITES, which `PageView.svelte` held until it was split and `page-writes.ts` holds now. */
const VIEW = readFileSync(new URL('./page-writes.ts', import.meta.url), 'utf8');

const NOW = Date.parse('2026-09-24T10:00:00Z');
const OWNER = { actor: 'p_1' };

/**
 * Work's tasks as the record declares them: `backlog` first so the board draws Later first, `open` as the default a new
 * row starts in, two terminal states, and `done_on` as the day the record fills when a row is finished.
 */
const TASKS = {
  id: 'tasks',
  title: 'what',
  state: 'state',
  done: ['done', 'dropped'],
  finished: 'done_on',
  fields: [
    { id: 'what', type: 'text', required: true },
    { id: 'state', type: 'enum', values: ['backlog', 'open', 'doing', 'blocked', 'review', 'done', 'dropped'], default: 'open' },
    { id: 'done_on', type: 'day' },
  ],
};

/** The same states on a list that declares no finished day, which is every list a pack brings without one. */
const CHORES = { ...TASKS, id: 'chores', finished: undefined, fields: TASKS.fields.filter((f) => f.id !== 'done_on') };

function openSqlite(): Parameters<typeof openRecord>[0] {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  const sql = {
    exec: (text: string, ...params: unknown[]) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: (text: string, ...params: unknown[]) => db.prepare(text).all(...(params as never[])),
    one: (text: string, ...params: unknown[]) => db.prepare(text).get(...(params as never[])),
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
  return sql as unknown as Parameters<typeof openRecord>[0];
}

async function record(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  const { finished: _none, ...chores } = CHORES;
  const put = await k.install([
    { id: 'register.tasks', kind: 'register', body: TASKS } as never,
    { id: 'register.chores', kind: 'register', body: chores } as never,
  ]);
  assert.ok(put.ok, JSON.stringify(put));
  return k;
}

/** The row as a page's block holds it in `entries`: the record's own fields, since neither list has a ref to respell. */
function held(k: Kernel, register: string, seq: number): Entry {
  const row = k.get(`${register}#${seq}`);
  assert.ok(row, `${register}#${seq} is not on the record`);
  return { seq, version: row.version, created: row.created_at, by: 'you', fields: row.fields as Fields };
}

/**
 * The page's gesture and then the receipt's undo, both as real writes: the tick at the version the page read, and the
 * way back at the version the tick answered with, which is what `putBack` in `page-writes.ts` sends. Answers the row as
 * it ends and the patch the undo sent.
 */
function tickThenUndo(k: Kernel, register: string, decl: typeof TASKS | typeof CHORES, seq: number, done: boolean) {
  const before = held(k, register, seq);
  const ref = { register, seq, version: before.version };
  const tick = tickPatch(ref, done, decl);
  assert.ok(tick, 'the list declares no state to tick with');
  const wrote = k.update(register, `${register}#${seq}`, tick as Fields, { ...OWNER, version: before.version });
  assert.ok(wrote.ok, JSON.stringify(wrote));
  const back = tickBackOf({ ...ref, version: wrote.value.version }, done, decl, before);
  assert.ok(back, 'the receipt offered no way back');
  const undone = k.update(register, `${register}#${seq}`, back as Fields, { ...OWNER, version: wrote.value.version });
  assert.ok(undone.ok, JSON.stringify(undone));
  return { after: k.get(`${register}#${seq}`)!.fields, back };
}

test('a task in doing, blocked or review, ticked done and undone from the receipt, is back where it was', async () => {
  const k = await record();
  for (const [i, was] of ['doing', 'blocked', 'review'].entries()) {
    assert.ok(k.create('tasks', { what: `Task ${i + 1}`, state: was }, OWNER).ok);
    const { after, back } = tickThenUndo(k, 'tasks', TASKS, i + 1, true);
    assert.equal(after.state, was, `a task in ${was}, ticked and undone, was written ${JSON.stringify(back)}`);
    /* THE DAY THE TICK FILLED GOES WITH IT, because a task that was never finished has no day it was finished on. */
    assert.equal(after.done_on, undefined, `the undo left the finished day the tick filled: ${String(after.done_on)}`);
  }
});

test('a done task un-ticked and undone is done on the day it was finished, not on the day of the undo', async () => {
  const k = await record();
  assert.ok(k.create('tasks', { what: 'Problem set 3', state: 'done', done_on: '2026-09-01' }, OWNER).ok);
  const { after } = tickThenUndo(k, 'tasks', TASKS, 1, false);
  assert.equal(after.state, 'done');
  assert.equal(after.done_on, '2026-09-01', `the undo dated it ${String(after.done_on)}, and 2026-09-24 is today`);
});

test('on a list with no finished day the undo sends the state it held and names no other field', async () => {
  const k = await record();
  assert.ok(k.create('chores', { what: 'Descale the kettle', state: 'blocked' }, OWNER).ok);
  const { after, back } = tickThenUndo(k, 'chores', CHORES, 1, true);
  assert.equal(after.state, 'blocked', `a chore in blocked, ticked and undone, was written ${JSON.stringify(back)}`);
  assert.deepEqual(back, { state: 'blocked' });
});

test('an undo pressed after somebody else changed the task is a conflict and not a write over their change', async () => {
  const k = await record();
  assert.ok(k.create('tasks', { what: 'Ship the invoice run', state: 'review' }, OWNER).ok);
  const before = held(k, 'tasks', 1);
  const ref = { register: 'tasks', seq: 1, version: before.version };
  const wrote = k.update('tasks', 'tasks#1', tickPatch(ref, true, TASKS) as Fields, { ...OWNER, version: before.version });
  assert.ok(wrote.ok, JSON.stringify(wrote));
  /* SOMEBODY REOPENS IT TO DOING between the tick and the press, which is the change a quiet undo would erase. */
  const later = k.update('tasks', 'tasks#1', { state: 'doing' }, { ...OWNER, version: wrote.value.version });
  assert.ok(later.ok, JSON.stringify(later));
  const back = tickBackOf({ ...ref, version: wrote.value.version }, true, TASKS, before);
  const undone = k.update('tasks', 'tasks#1', back as Fields, { ...OWNER, version: wrote.value.version });
  assert.equal(undone.ok, false, `the undo landed over the later change: ${JSON.stringify(undone)}`);
  assert.equal(k.get('tasks#1')!.fields.state, 'doing');
});

test("the tick's receipt builds its undo from the row the page held, through tickBackOf", () => {
  const at = VIEW.indexOf('function tickTask(');
  assert.ok(at >= 0, 'the page writes have no tickTask, so this sweep proves nothing');
  const body = VIEW.slice(at, VIEW.indexOf('\n  }\n', at));
  /* THE OLD UNDO, which is the list's default state and never the row's own. */
  assert.doesNotMatch(body, /tickPatch\(ref, !done/u, 'the tick still undoes with the default not-done state');
  assert.match(body, /tickBackOf\(/u, 'the tick does not build its undo through tickBackOf');
  /* THE ROW READ OFF `entries` HAS TO REACH tickBackOf. Checked by mutation: with `tickBackOf(ref, done, decl, undefined)`
     in the page's writes, a sweep that only looked for `.entries` and `tickBackOf(` stayed green while every undo went back to
     the default state, because the lookup was still there and simply unused. */
  const read = /const (\w+) = block\.entries\.find\(/u.exec(body);
  assert.ok(read, "the tick does not read the row it held from the block's entries");
  assert.match(body, new RegExp(`tickBackOf\\(ref, done, decl, ${read[1]}\\)`, 'u'), 'the row read off entries is not the one the undo is built from');
});
