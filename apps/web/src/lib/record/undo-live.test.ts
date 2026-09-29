/**
 * Put back after every live write on a list, and the seen strip only where its numbers are true.
 *
 * FOUR OF THE FIVE WRITES A LIVE LIST MAKES CAME BACK WITH NO WAY BACK. Archive was the one that carried `Put back`;
 * adding a row, moving one row's state, editing a cell and moving a selection's state each landed a green chip and
 * nothing else, measured with `grep -n "intent: 'good'"` over the screen. The rule is the
 * inverse of every write, pushed only once the write has landed, because an undo offered for a write that never
 * happened is a second write nobody asked for.
 *
 * THE SEEN STRIP READ A FIXTURE ON A LIVE RECORD. `noticed()` reads `OBSERVED`, the sample's twelve rejected saves, so
 * a live list with no refusals at all could say twelve of its saves had been rejected. The record keeps its real
 * findings (`observe.ts`) and no method serves them yet, so until one does the strip is the sample's alone.
 *
 * TWO OF THE FOUR RECEIPTS SIT IN AN AWAITED LOOP OR IN `addLanded`, not in a `.then`, so the sweep reads every
 * `receipt(` call whole rather than keying on the promise that happens to surround it.
 *
 * AND THE FIRST PUT BACK LOST WHAT THE RECORD HAD WRITTEN ALONGSIDE IT. On a list that declares `finished` (tasks, and
 * `done_on`), a state move also fills or empties the finished day, and an inverse built from the patch alone sent the
 * state back and nothing else. Measured against a real kernel below: a task done on 1 September, reopened, then put
 * back, came back done on the day of the put back. The record re-stamps a move into done with today, because the write
 * did not say a day. The other direction happens to come out right, since leaving done empties the day, so it is kept
 * as a case to prove the repair did not break it.
 *
 * AND ITS PUT BACK WAS TWO WRITES FOR TWO PRESSES. The chip kept its `Put back` until the answer came back, so a second
 * press in that window sent the inverse again, at a version the first had already spent.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Kernel } from '@braindog/kernel';

/* A NAMESPACE AND NOT A NAMED IMPORT, so a missing export is one failing test rather than a file that will not load
   and takes the two sweeps below down with it. */
import './fixtures/fill.ts';
import * as rows from './rows-write.ts';
import { outbound } from './rows-write.ts';
import type { Entry, Fields } from './schema.ts';

const SCREEN = readFileSync(new URL('../../routes/r/[register]/+page.svelte', import.meta.url), 'utf8');

/** A list with a state and no finished day, which is `obligations` and every list the first attempt was written for. */
const UNDATED = { state: 'state' };

const entry = (seq: number, fields: Fields, version = 7): Entry => ({ seq, version, created: '2026-09-01T09:00:00.000Z', by: 'you', fields });

/** Every call of `name(` in `src`, argument list whole, with the line it starts on. Parentheses are counted, not parsed. */
function callsOf(src: string, name: string): { line: number; args: string }[] {
  const out: { line: number; args: string }[] = [];
  const re = new RegExp(`(?<![\\w.$])${name}\\(`, 'gu');
  for (const m of src.matchAll(re)) {
    const open = (m.index ?? 0) + m[0].length;
    let depth = 1;
    let i = open;
    while (i < src.length && depth > 0) {
      if (src[i] === '(') depth += 1;
      else if (src[i] === ')') depth -= 1;
      i += 1;
    }
    out.push({ line: src.slice(0, m.index).split('\n').length, args: src.slice(open, i - 1) });
  }
  return out;
}

test('the inverse of a change is the values the row held, field for field', () => {
  assert.equal(typeof rows.inverseOf, 'function', 'rows-write.ts exports no inverseOf, so no live write can be put back');
  const before = entry(3, { what: 'Rent', state: 'open', due: null });
  assert.deepEqual(rows.inverseOf(before, { state: 'done', due: '2026-10-01' }, UNDATED), { state: 'open', due: null });

  /* A FIELD THE ROW NEVER HELD GOES BACK TO NOTHING. The record leaves an unset field out of the row altogether, so
     reading `undefined` as "leave it alone" would keep the value the write put there and call that putting it back. */
  assert.deepEqual(rows.inverseOf(entry(3, { what: 'Rent' }), { note: 'chased' }, UNDATED), { note: null });

  /* ONLY THE FIELDS THE WRITE TOUCHED. A put back that sent the whole row would overwrite every field somebody else
     changed since, which is the conflict the version exists to catch, spent on fields this screen never wrote. */
  assert.deepEqual(Object.keys(rows.inverseOf(before, { state: 'done' }, UNDATED)), ['state']);
});

test('the inverse is in the screen spelling, so it goes out through the same path as the write it undoes', () => {
  assert.equal(typeof rows.inverseOf, 'function');
  /* `party` is a ref the screen holds as the number a person says; `outbound` turns it back into the row id, exactly
     as it did for the write. An inverse built in the record spelling would be turned a second time. */
  const PERSON = '01JPERSON00000000000000003';
  const refs = new Map([['people', { idOf: new Map([[3, PERSON]]), seqOf: new Map([[PERSON, 3]]) }]]);
  const back = rows.inverseOf(entry(2, { what: 'Rent', party: 3, direction: 'owed to me' }), { party: 5, direction: 'owed_by_me' }, UNDATED);
  assert.deepEqual(outbound('obligations', back, refs as never), { party: PERSON, direction: 'owed_to_me' });
});

test('every live write that lands on the list carries its way back', () => {
  const landed = callsOf(SCREEN, 'receipt').filter((c) => /intent:\s*'good'/u.test(c.args));
  /* NOT VACUOUS: the add, the state, the cell, the bulk state and the restore were five when this was written. */
  assert.ok(landed.length >= 5, `found ${landed.length} landed receipts, so the sweep is no longer reading the screen`);
  /* A RESTORED ROW IS ITSELF THE WAY BACK, and offering to undo the undo is a loop with no floor. */
  const bare = landed.filter((c) => !/\bundo:/u.test(c.args) && !/mark:\s*copy\.writeMarkRestored\b/u.test(c.args));
  assert.deepEqual(
    bare.map((c) => `:${c.line} receipt(${c.args.replace(/\s+/gu, ' ').slice(0, 70)})`),
    [],
    'these receipts say a write landed and offer no Put back',
  );
});

test('the seen strip went with the sample: nothing on the list reads noticed()', () => {
  assert.equal(callsOf(SCREEN, 'noticed').length, 0, 'noticed() reads the fixture OBSERVED, so on a live record it draws rejected saves nobody made');
});

/* ── a list that declares the day a row was finished ─────────────────────────────────────────────────────────────── */

const NOW = Date.parse('2026-09-24T10:00:00Z');
const TODAY = '2026-09-24';
const OWNER = { actor: 'p_1' };

/** Tasks as the kernel's own `finished.test.ts` declares them: a state, two done states, and `done_on` as the day. */
const TASKS = {
  id: 'tasks',
  title: 'what',
  state: 'state',
  done: ['done', 'dropped'],
  finished: 'done_on',
  fields: [
    { id: 'what', type: 'text', required: true },
    { id: 'state', type: 'enum', values: ['open', 'doing', 'done', 'dropped'], required: true },
    { id: 'done_on', type: 'day' },
    { id: 'by', type: 'day' },
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

async function tasks(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  const put = await k.install([{ id: 'register.tasks', kind: 'register', body: TASKS } as never]);
  assert.ok(put.ok, JSON.stringify(put));
  return k;
}

/** The row as the screen holds it: `tasks` has no ref and no enum respelt, so the record's fields are the screen's. */
function held(k: Kernel, seq: number): Entry {
  const row = k.get(`tasks#${seq}`);
  assert.ok(row, `tasks#${seq} is not on the record`);
  return { seq, version: row.version, created: row.created_at, by: 'you', fields: row.fields as Fields };
}

/**
 * The screen's gesture and then its Put back, both as real writes: `patch` at the version the screen held, and the
 * inverse at the version that write answered with, which is what `putBack` sends. Answers the row as it ends.
 */
function changeThenPutBack(k: Kernel, seq: number, patch: Fields): Record<string, unknown> {
  const before = held(k, seq);
  const wrote = k.update('tasks', `tasks#${seq}`, patch, { ...OWNER, version: before.version });
  assert.ok(wrote.ok, JSON.stringify(wrote));
  const back = k.update('tasks', `tasks#${seq}`, rows.inverseOf(before, patch, TASKS), { ...OWNER, version: wrote.value.version });
  assert.ok(back.ok, JSON.stringify(back));
  return k.get(`tasks#${seq}`)!.fields;
}

test('a finished task reopened and put back is finished on the day it was, not on the day of the put back', async () => {
  const k = await tasks();
  assert.ok(k.create('tasks', { what: 'Problem set 3', state: 'done', done_on: '2026-09-01' }, OWNER).ok);
  const after = changeThenPutBack(k, 1, { state: 'open' });
  assert.equal(after.state, 'done');
  assert.equal(after.done_on, '2026-09-01', `put back dated it ${String(after.done_on)}, and ${TODAY} is today`);
});

test('an open task finished and put back is open with no finished day', async () => {
  const k = await tasks();
  assert.ok(k.create('tasks', { what: 'Problem set 4', state: 'open' }, OWNER).ok);
  const after = changeThenPutBack(k, 1, { state: 'done' });
  assert.equal(after.state, 'open');
  assert.equal(after.done_on, undefined, 'the put back left the day the move to done had filled');
});

test('the inverse names the finished day only when the change moved the state', () => {
  const done = entry(4, { what: 'Handed in', state: 'done', done_on: '2026-09-01', by: '2026-09-02' });
  assert.deepEqual(rows.inverseOf(done, { state: 'open' }, TASKS), { state: 'done', done_on: '2026-09-01' });
  assert.deepEqual(rows.inverseOf(entry(5, { what: 'Not yet', state: 'open' }), { state: 'done' }, TASKS), { state: 'open', done_on: null });
  /* AN EDIT THAT LEAVES THE STATE ALONE LEAVES THE DAY ALONE, because the record did not touch it either, and naming it
     would be a write over a field this screen never changed. */
  assert.deepEqual(rows.inverseOf(done, { by: '2026-09-09' }, TASKS), { by: '2026-09-02' });
});

/** The body of `async function name(` in `src`, braces counted, or '' when there is no such function. */
function bodyOf(src: string, name: string): string {
  const head = src.indexOf(`async function ${name}(`);
  if (head < 0) return '';
  const open = src.indexOf('{', src.indexOf(')', head));
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1);
  }
  return '';
}

test('a Put back says Saving before it writes, so the chip has no second press to offer', () => {
  /* BOTH WAYS BACK ON THE LIST: the inverse of a state or a cell, and the restore of an archived row. Each is pressed
     from a chip that stays up until the answer comes back, so without the mark a second press is a second write. */
  for (const name of ['putBack', 'restoreOnRecord']) {
    const body = bodyOf(SCREEN, name);
    assert.ok(body !== '', `the screen has no ${name}, so this sweep proves nothing`);
    const saving = body.search(/receipt\([^;]*copy\.writeMarkSaving/u);
    const write = body.indexOf('writes()');
    assert.ok(write >= 0, `${name} no longer writes, so this sweep proves nothing`);
    assert.ok(saving >= 0 && saving < write, `${name} writes before the row says Saving, so its Put back can be pressed twice`);
  }
});
