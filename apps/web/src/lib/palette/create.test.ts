/**
 * The palette's one row that makes something: `Add to <list>: <text>`, read out of the query and written as the row the
 * list's own capture line would write.
 *
 * WHAT IT ANSWERS. Every row in the palette went somewhere or undid something, so the one surface reachable from every
 * screen could not take down the thing a person had just thought of: adding a task meant leaving the screen they were
 * on for `/r/tasks`, finding the line, and coming back. The row is admitted by `admits()` like every other
 * (`palette.test.ts` holds that half); this file holds the sentence it reads and the write it makes.
 *
 * THE WRITE AGAINST A REAL KERNEL over `node:sqlite`, as `field-write.test.ts` drives its fields: only the HTTP envelope
 * is written here, because `@braindog/record` is not a dependency of this app. The row that lands is read back off the
 * kernel, not off the answer the writer handed the palette, since the answer is the thing under test.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Kernel } from '@braindog/kernel';

/* A NAMESPACE, so a missing export fails one test and not the file. */
import * as create from './create.ts';
import { REGISTERS } from '../record/api.ts';
import { listsOf, type List } from '../record/palette.ts';
import { capturedFields } from '../record/rows-write.ts';
import type { Fetch } from '../record/row-live.ts';

const BASE = 'http://record.test';
const NOW = Date.parse('2026-09-24T10:00:00Z');
const OWNER = { actor: 'p_1' };

/** The sample's lists, which is what the palette holds with no record behind it. */
const registers: List[] = listsOf(false, []);

/* ── the sentence ─────────────────────────────────────────────────────────── */

test('a query of the form "add to <list>: <text>" names a list and a title', () => {
  assert.equal(typeof create.creation, 'function', 'create.ts exports no creation, so the palette reads no row out of a query');
  assert.deepEqual(create.creation('add to tasks: buy milk', registers), { register: 'tasks', title: 'buy milk' });
  /* BY THE NAME A PERSON READS AS WELL AS BY THE ID. `things` is drawn everywhere as Projects, and nobody types the
     id of a list they have only ever seen called something else. Case and spacing are the reader's own. */
  assert.deepEqual(create.creation('Add to Projects: Kiln', registers), { register: 'things', title: 'Kiln' });
  assert.deepEqual(create.creation('  ADD  TO  tasks :  buy milk  ', registers), { register: 'tasks', title: 'buy milk' });
  assert.deepEqual(create.creation('add to exchange rates: EUR', registers), { register: 'fx', title: 'EUR' });
  /* THE FIRST COLON ENDS THE LIST, so a title can carry one of its own. */
  assert.deepEqual(create.creation('add to tasks: call: the kiln people', registers), { register: 'tasks', title: 'call: the kiln people' });
});

test('anything short of the whole sentence is not a row to add, so the palette draws no half-made one', () => {
  for (const q of ['', 'add', 'add to', 'add to tasks', 'add to tasks:', 'add to tasks:   ', 'add to : buy milk', 'tasks: buy milk', 'add milk to tasks'])
    assert.equal(create.creation(q, registers), null, `"${q}" was read as a row to add`);
  /* A LIST THIS RECORD DOES NOT HOLD IS NOT GUESSED AT. The nearest name is the kind of help that files the rent under
     the wrong list with nobody told. */
  assert.equal(create.creation('add to groceries: milk', registers), null);
  assert.equal(create.creation('add to task: milk', registers), null);
});

test('only a list this build can title a row in is offered, the same rule a page capture keeps', () => {
  assert.equal(typeof create.addable, 'function');
  /* `capture.ts` answers null for a list with no declaration here, because the declaration is what names the title
     field, and a row with the words in no field is not the row somebody typed. A live record can hold such a list, and
     its name must not turn the sentence into a row that is then refused or written empty. */
  const held = [...registers, { id: 'kiln_firings', name: 'Firings', count: 3, icon: 'rows' as const }];
  const offered = create.addable(held).map((l) => l.id);
  assert.ok(!offered.includes('kiln_firings'), 'a list with no declaration in this build was offered');
  assert.ok(offered.includes('tasks'));
  assert.equal(create.creation('add to firings: bisque', create.addable(held)), null);
  /* AND NOTHING THE BUILD CAN WRITE WAS LOST ON THE WAY. */
  for (const l of registers) if (REGISTERS[l.id]?.title) assert.ok(offered.includes(l.id), `${l.id} can be written and was not offered`);
});

test('the row says the list by its name and the words as they were typed', () => {
  assert.equal(create.words.row('Tasks', 'buy milk'), 'Add to Tasks: buy milk');
  /* THE SAMPLE'S SENTENCE, which goes through `copy.notWritten` like every other write on the sample. */
  assert.match(create.words.would('Tasks', 'buy milk'), /buy milk/u);
  assert.match(create.words.would('Tasks', 'buy milk'), /Tasks/u);
});

/* ── the write, against a real kernel ─────────────────────────────────────── */

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

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

/** A record holding the build's own Tasks, word for word, less the links to lists this bare record does not hold. */
async function tasks(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  const { scopes: _scopes, pack: _pack, ...body } = JSON.parse(JSON.stringify(REGISTERS.tasks)) as Record<string, unknown>;
  const fields = (body.fields as { id: string; type: string }[]).filter((f) => f.type !== 'ref');
  const put = await k.install([{ id: 'register.tasks', kind: 'register', body: { ...body, fields } } as never]);
  assert.ok(put.ok, JSON.stringify(put));
  return k;
}

/** The kernel behind `/api/<method>`, for the four methods a create and its Put back reach. */
function served(k: Kernel): Fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const at = new URL(String(url));
    const method = at.pathname.slice('/api/'.length);
    const args = (init?.body ? JSON.parse(String(init.body)) : Object.fromEntries(at.searchParams)) as Record<string, unknown>;
    const register = String(args.register ?? '');
    const answer = (out: { ok: boolean }) => json(out.ok ? 200 : 'conflict' in out ? 409 : 400, out);
    if (method === 'list') return answer(k.list({ register, limit: Number(args.limit ?? 50) } as never) as { ok: boolean });
    if (method === 'get') return json(200, { ok: true, value: k.get({ register, seq: Number(args.seq) }) });
    if (method === 'create') return answer(k.create(register, args.fields as never, OWNER) as { ok: boolean });
    if (method === 'update') {
      const version = typeof args.version === 'number' ? { version: args.version } : {};
      return answer(k.update(register, `${register}#${Number(args.seq)}`, args.patch as never, { ...OWNER, ...version }) as { ok: boolean });
    }
    return json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no such method.' } });
  }) as Fetch;
}

test('THE ROW IT WRITES IS THE ROW THE CAPTURE LINE WOULD WRITE, and Put back takes it off the list', async () => {
  assert.equal(typeof create.addRow, 'function', 'create.ts exports no addRow, so the palette row writes nothing');
  const k = await tasks();
  const out = await create.addRow({ register: 'tasks', title: 'buy milk' }, NOW, BASE, served(k));
  assert.ok(out.ok, JSON.stringify(out));

  /* READ OFF THE KERNEL. `capturedFields` with no filter is the list's own line typed with nothing narrowed, so the
     palette's row and the list's row are one row: the title, and the state the declaration requires at its emptiest. */
  const row = k.get('tasks#1');
  assert.ok(row, 'no row reached the record');
  const expected = capturedFields('tasks', 'buy milk', [], NOW);
  for (const [key, value] of Object.entries(expected.fields)) assert.deepEqual(row.fields[key], value, `${key} is not what the capture line writes`);
  /* AND WHAT WAS FILLED ON THE READER'S BEHALF IS SAID, as the list says it. */
  assert.deepEqual(out.filled, expected.filled);
  assert.ok(out.filled.length > 0, 'tasks require a state, so the fill has something to say');

  /* PUT BACK IS AN ARCHIVE, the way back the list's own add offers: the record has no delete, so the row is left out of
     every list and `restore` can bring it back. */
  const back = await out.back();
  assert.ok(back.ok, JSON.stringify(back));
  const listed = k.list({ register: 'tasks', limit: 50 } as never) as { ok: boolean; value: { rows: unknown[] } };
  assert.ok(listed.ok);
  assert.equal(listed.value.rows.length, 0, 'the put back row is still on the list');
});

test('a refusal comes back in the record\'s own words and writes nothing', async () => {
  const k = await tasks();
  /* `obligations` is not on this record, so the record refuses it, and the sentence is the one the palette says. */
  const out = await create.addRow({ register: 'obligations', title: 'Rent' }, NOW, BASE, served(k));
  assert.equal(out.ok, false);
  assert.ok(!out.ok && out.fix.trim().length > 0, 'the refusal says nothing');
});
