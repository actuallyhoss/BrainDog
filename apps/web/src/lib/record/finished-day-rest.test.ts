/**
 * The finished day a put back leaves on the board and on the row page: the day the row was finished, not today.
 *
 * THE REPAIR REACHED TWO OF FOUR UNDOS. A state change moves the finished day in the same write (the kernel's
 * `finished.ts`), so an undo that sends the state alone dates a done row with the day of the undo. `inverseOf` in
 * `rows-write.ts` carried the day for the list (b935a4df) and `tickBackOf` took it for a tick (6fa38569), but the board's
 * moved card was put back with `movePatch(ref, field, from)` and the row page's edit with `putBackOf(before, patch)`, both
 * the state alone (audit sixty-five, section 2, probe B1). Measured before this change against a kernel whose clock read
 * 24 September: a task done on 1 September, moved to `doing` on a board and put back, was sent `{"state":"done"}` and read
 * `done on 2026-09-24`; the same task edited to `open` on its row page and put back read the same.
 *
 * EVERY CASE BELOW IS A REAL WRITE against a kernel on an in-memory SQLite, the gesture at the version the screen read and
 * the put back at the version the gesture answered with, because what a put back is worth is decided by what the record
 * keeps. The board's put back is loaded as `PageView.svelte` loads it, on the press.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Kernel } from '@braindog/kernel';

import { putBackOf } from './field-write.ts';
import { movePatch } from './page-write.ts';
import type { Entry, Fields } from './schema.ts';

const VIEW = readFileSync(new URL('../page/PageView.svelte', import.meta.url), 'utf8');

const NOW = Date.parse('2026-09-24T10:00:00Z');
const OWNER = { actor: 'p_1' };

/**
 * Work's tasks as the record declares them, with `done_on` as the day the record fills when a row is finished, and a
 * `lane` a board can be drawn over that is not the state, so a move that leaves the state alone can be told apart.
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
    { id: 'lane', type: 'enum', values: ['home', 'work'] },
    { id: 'done_on', type: 'day' },
  ],
};

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
  const put = await k.install([{ id: 'register.tasks', kind: 'register', body: TASKS } as never]);
  assert.ok(put.ok, JSON.stringify(put));
  return k;
}

/** The row as a page's block holds it in `entries`: the record's own fields, since the list has no ref to respell. */
function held(k: Kernel, seq: number): Entry {
  const row = k.get(`tasks#${seq}`);
  assert.ok(row, `tasks#${seq} is not on the record`);
  return { seq, version: row.version, created: row.created_at, by: 'you', fields: row.fields as Fields };
}

/**
 * A card moved on a board and put back from the receipt, as `moveCard` and `putBack` in `PageView.svelte` send them: the
 * move at the version the page read, and the way back at the version the move answered with. `row` is what the block
 * held, or `undefined` for a card the page is holding in place after a re-read left it out.
 */
async function moveThenPutBack(k: Kernel, seq: number, field: string, to: string, row: 'held' | 'lost' = 'held') {
  const { moveBackOf } = await import('../page/move-undo.ts');
  const before = held(k, seq);
  const ref = { register: 'tasks', seq, version: before.version };
  const from = String(before.fields[field] ?? '');
  const moved = k.update('tasks', `tasks#${seq}`, movePatch(ref, field, to, TASKS) as Fields, { ...OWNER, version: before.version });
  assert.ok(moved.ok, JSON.stringify(moved));
  const back = moveBackOf({ ...ref, version: moved.value.version }, field, to, from, TASKS, row === 'held' ? before : undefined);
  assert.ok(back, 'the receipt offered no way back');
  const undone = k.update('tasks', `tasks#${seq}`, back as Fields, { ...OWNER, version: moved.value.version });
  assert.ok(undone.ok, JSON.stringify(undone));
  return { after: k.get(`tasks#${seq}`)!.fields, back };
}

/** An edit saved on the row page and put back from its toast, as `saveEdit` and `putBack` on `/r/[register]/[seq]` send them. */
function editThenPutBack(k: Kernel, seq: number, patch: Fields) {
  const before = held(k, seq);
  const edited = k.update('tasks', `tasks#${seq}`, patch, { ...OWNER, version: before.version });
  assert.ok(edited.ok, JSON.stringify(edited));
  const back = putBackOf({ ...before.fields }, patch, TASKS);
  const undone = k.update('tasks', `tasks#${seq}`, back, { ...OWNER, version: edited.value.version });
  assert.ok(undone.ok, JSON.stringify(undone));
  return { after: k.get(`tasks#${seq}`)!.fields, back };
}

/* ── the board ── */

test('a done card moved to doing on a board and put back is done on the day it was finished', async () => {
  const k = await record();
  assert.ok(k.create('tasks', { what: 'Problem set 3', state: 'done', done_on: '2026-09-01' }, OWNER).ok);
  const { after, back } = await moveThenPutBack(k, 1, 'state', 'doing');
  assert.equal(after.state, 'done');
  assert.equal(after.done_on, '2026-09-01', `the put back dated the card ${String(after.done_on)}, sent ${JSON.stringify(back)}, and 2026-09-24 is today`);
});

test('an open card moved to done and put back is open with no finished day', async () => {
  const k = await record();
  assert.ok(k.create('tasks', { what: 'Chase the deposit', state: 'open' }, OWNER).ok);
  const { after, back } = await moveThenPutBack(k, 1, 'state', 'done');
  assert.equal(after.state, 'open');
  /* THE DAY THE MOVE FILLED GOES WITH IT, because a task that was never finished has no day it was finished on. */
  assert.equal(after.done_on, undefined, `the put back left the day the move filled: ${String(after.done_on)}, sent ${JSON.stringify(back)}`);
});

test('a card moved across a column that is not the state is put back by that field alone', async () => {
  const k = await record();
  assert.ok(k.create('tasks', { what: 'Problem set 3', state: 'done', done_on: '2026-09-01', lane: 'home' }, OWNER).ok);
  const { after, back } = await moveThenPutBack(k, 1, 'lane', 'work');
  assert.deepEqual(back, { lane: 'home' });
  assert.equal(after.done_on, '2026-09-01');
});

test('a card the page no longer holds is put back by the column it came from, which is all the page still knows', async () => {
  /* THE ONE CASE THE DAY CANNOT BE NAMED: the row is on the board only because `keepInPlace` is holding it, and the
     re-read that left it out took its fields with it. It sends what every move sent before, and says so here so a
     later change to it is a decision rather than an accident. */
  const k = await record();
  assert.ok(k.create('tasks', { what: 'Problem set 3', state: 'done', done_on: '2026-09-01' }, OWNER).ok);
  const { back } = await moveThenPutBack(k, 1, 'state', 'doing', 'lost');
  assert.deepEqual(back, { state: 'done' });
});

test('a put back pressed after somebody else moved the card is a conflict and not a write over their move', async () => {
  const { moveBackOf } = await import('../page/move-undo.ts');
  const k = await record();
  assert.ok(k.create('tasks', { what: 'Problem set 3', state: 'done', done_on: '2026-09-01' }, OWNER).ok);
  const before = held(k, 1);
  const ref = { register: 'tasks', seq: 1, version: before.version };
  const moved = k.update('tasks', 'tasks#1', movePatch(ref, 'state', 'doing', TASKS) as Fields, { ...OWNER, version: before.version });
  assert.ok(moved.ok, JSON.stringify(moved));
  assert.ok(k.update('tasks', 'tasks#1', { state: 'blocked' }, { ...OWNER, version: moved.value.version }).ok);
  const back = moveBackOf({ ...ref, version: moved.value.version }, 'state', 'doing', 'done', TASKS, before);
  const undone = k.update('tasks', 'tasks#1', back as Fields, { ...OWNER, version: moved.value.version });
  assert.equal(undone.ok, false, `the put back landed over the later move: ${JSON.stringify(undone)}`);
  assert.equal(k.get('tasks#1')!.fields.state, 'blocked');
});

test("the board's receipt builds its put back from the row the page held, through moveBackOf", () => {
  const at = VIEW.indexOf('function moveCard(');
  assert.ok(at >= 0, 'PageView has no moveCard, so this sweep proves nothing');
  const body = VIEW.slice(at, VIEW.indexOf('\n  }\n', at));
  /* THE OLD PUT BACK, which is the column alone and dates a done card today. */
  assert.doesNotMatch(body, /back: \([^)]*\) => \(field && from \? m\.movePatch\(ref, field, from/u, 'the move still puts back by the column alone');
  /* THE ROW READ OFF `entries` HAS TO REACH moveBackOf, for the reason `tick-undo.test.ts` gives: a lookup that is there
     and unused keeps a sweep for the lookup green while every put back goes out without the day. */
  const read = /const (\w+) = block\.entries\.find\(/u.exec(body);
  assert.ok(read, "the move does not read the row it held from the block's entries");
  assert.match(body, new RegExp(`moveBackOf\\(ref, field, to, from, decl, ${read[1]}\\)`, 'u'), 'the row read off entries is not the one the put back is built from');
});

/* ── the row page ── */

test('a done task edited to open on its row page and put back is done on the day it was finished', async () => {
  const k = await record();
  assert.ok(k.create('tasks', { what: 'Problem set 3', state: 'done', done_on: '2026-09-01' }, OWNER).ok);
  const { after, back } = editThenPutBack(k, 1, { state: 'open' });
  assert.equal(after.state, 'done');
  assert.equal(after.done_on, '2026-09-01', `the put back dated the task ${String(after.done_on)}, sent ${JSON.stringify(back)}`);
});

test('an open task edited to done on its row page and put back is open with no finished day', async () => {
  const k = await record();
  assert.ok(k.create('tasks', { what: 'Chase the deposit', state: 'open' }, OWNER).ok);
  const { after, back } = editThenPutBack(k, 1, { state: 'done' });
  assert.equal(after.state, 'open');
  assert.equal(after.done_on, undefined, `the put back left the day the edit filled: ${String(after.done_on)}, sent ${JSON.stringify(back)}`);
});

test('an edit that left the state alone is put back without naming the finished day', () => {
  /* A CHANGE THAT LEFT THE STATE ALONE LEFT THE DAY ALONE TOO, so naming it would be a second field written back over
     whatever somebody else has set it to since. */
  assert.deepEqual(putBackOf({ what: 'Problem set 3', state: 'done', done_on: '2026-09-01' }, { what: 'Problem set 4' }, TASKS), { what: 'Problem set 3' });
});
