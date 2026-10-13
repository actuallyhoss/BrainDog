/**
 * A page's tick and moved card are drawn before the record answers, taken back when it refuses, and offered back for six
 * seconds when it lands; a captured line is on its checklist before it is written; and a row that arrived since a block
 * was last drawn is marked.
 *
 * THE WRITES RUN FOR REAL over a `fetch` this file answers by hand, so what is checked is what the page would draw at
 * each moment: straight after the press, while the write is out, and once it has answered.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Row } from 'braindog-render';

import { arrivals } from '../data/optimistic.ts';
import type { LiveBlock } from '../record/page-live.ts';
import { heldNone, pageWrites, type Held } from './page-writes.ts';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const TASKS = {
  id: 'tasks',
  title: 'what',
  state: 'state',
  done: ['done'],
  fields: [
    { id: 'what', type: 'text' },
    { id: 'state', type: 'enum', values: ['open', 'doing', 'done'], default: 'open' },
  ],
};

const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise<void>((r) => setImmediate(r));
};

let bases = 0;

/**
 * A page with one checklist over `tasks`, its writes, and a `fetch` whose `/api/update` answers when the test says.
 * `live.now` is the clock of the live answer the page is drawn from, `null` while none is in.
 */
function page(kind: 'todo' | 'board' = 'todo', live: { now: number | null } = { now: Date.parse('2026-09-29T10:00:00Z') }) {
  const base = `https://page-writes-${++bases}.test`;
  const rows: Row[] =
    kind === 'todo'
      ? [
          { cells: ['Rent'], done: false, ref: { register: 'tasks', seq: 1, version: 1 } },
          { cells: ['Tax'], done: false, ref: { register: 'tasks', seq: 2, version: 1 } },
        ]
      : [
          { cells: ['open', 'Rent'], ref: { register: 'tasks', seq: 1, version: 1 } },
          { cells: ['doing', 'Tax'], ref: { register: 'tasks', seq: 2, version: 1 } },
        ];
  const block = {
    kind,
    register: 'tasks',
    raw: 'rows',
    rows,
    columns: [{ field: 'state' }],
    entries: [
      { seq: 1, version: 1, fields: { what: 'Rent', state: 'open' }, created: '', by: '' },
      { seq: 2, version: 1, fields: { what: 'Tax', state: 'doing' }, created: '', by: '' },
    ],
  } as unknown as LiveBlock & { rows: Row[]; raw: string };
  let held: Held = heldNone();
  const toasts: { text: string; intent?: string | undefined; life?: number | undefined; undo?: (() => void) | undefined }[] = [];
  let answer: (r: Response) => void = () => {};
  let rereads = 0;
  const updates: unknown[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/api/update')) {
      updates.push(JSON.parse(String(init?.body)));
      return new Promise<Response>((r) => (answer = r));
    }
    if (u.includes('/api/create')) return new Promise<Response>((r) => (answer = r));
    return json(200, { ok: true, value: TASKS });
  }) as typeof fetch;
  let t = 0;
  const writes = pageWrites({
    slug: () => 'work',
    now: () => live.now,
    blocks: () => [block],
    base: () => base,
    reread: async () => void rereads++,
    toasts: { push: (text, opts = {}) => (toasts.push({ text, ...opts }), toasts.length) },
    state: { get: () => held, set: (next) => (held = next) },
    arrivals: arrivals(() => t),
  });
  writes.forPage('work');
  return {
    block,
    writes,
    toasts,
    updates,
    drawn: () => writes.keptSegment(0, block, block),
    answer: (r: Response) => answer(r),
    rereads: () => rereads,
    clock: (to: number) => (t = to),
  };
}

test('a tick is drawn the moment it is pressed, and a refusal takes it back and says why', async () => {
  const p = page();
  p.writes.warm();
  await settle();
  p.writes.tickTask(p.block, p.block.rows[0]!, true, 0, p.block.rows);
  const pressed = p.drawn();
  assert.equal(pressed.rows[0]!.done, true, 'the box was not ticked before the record answered');
  assert.notEqual(pressed.raw, 'rows', 'the primitive keeps its own tick beside the hold unless raw moves');
  await settle();
  assert.equal(p.drawn().rows[0]!.done, true, 'the tick went while the write was out');
  p.answer(json(200, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'You can read tasks but not change them.' } }));
  await settle();
  assert.equal(p.drawn().rows[0]!.done, false, 'a refused tick stayed ticked');
  assert.equal(p.drawn().raw, 'rows');
  assert.deepEqual(p.toasts.map((x) => [x.text, x.intent]), [['You can read tasks but not change them.', 'warn']]);
});

test('a tick that lands offers Undo for six seconds, and Undo is drawn before it is sent', async () => {
  const p = page();
  p.writes.warm();
  await settle();
  p.writes.tickTask(p.block, p.block.rows[0]!, true, 0, p.block.rows);
  await settle();
  /* WHAT THE RE-READ WILL ANSWER, once the record has the tick. */
  (p.block.rows as Row[])[0] = { cells: ['Rent'], done: true, ref: { register: 'tasks', seq: 1, version: 2 } };
  p.answer(json(200, { ok: true, value: { id: 'e_1', seq: 1, version: 2 } }));
  await settle();
  assert.equal(p.rereads(), 1, 'the page was not read again once the tick landed');
  const receipt = p.toasts.at(-1)!;
  assert.equal(receipt.intent, 'good');
  assert.equal(receipt.life, 6_000);
  assert.equal(p.drawn().rows[0]!.done, true);
  receipt.undo!();
  await settle();
  assert.equal(p.drawn().rows[0]!.done, false, 'Undo waited for the record before it was drawn');
  assert.deepEqual(p.updates.at(-1), { register: 'tasks', seq: 1, patch: { state: 'open' }, version: 2 });
});

test('a card is in its new column the moment it is dropped, and back in its old one when the record refuses', async () => {
  const p = page('board');
  p.writes.warm();
  await settle();
  p.writes.moveCard(p.block, p.block.rows[0]!, 'done', 0, p.block.rows);
  assert.deepEqual(p.drawn().rows.map((r) => r.cells.join(' ')), ['doing Tax', 'done Rent']);
  await settle();
  p.answer(json(409, { ok: false, conflict: { current: {} } }));
  await settle();
  assert.deepEqual(p.drawn().rows.map((r) => r.cells.join(' ')), ['open Rent', 'doing Tax']);
});

test('a captured line is on its checklist before it is written, and goes once the page has read the row back', async () => {
  const p = page();
  const done = p.writes.captureLine('tasks', 'Call the bank', {});
  assert.deepEqual(p.drawn().rows.map((r) => r.cells[0]), ['Call the bank', 'Rent', 'Tax']);
  await settle();
  p.answer(json(200, { ok: true, value: { id: 'e_3', seq: 3, version: 1, fields: { what: 'Call the bank' } } }));
  await done;
  assert.deepEqual(p.drawn().rows.map((r) => r.cells[0]), ['Rent', 'Tax']);
});

test('a row the block did not draw last time is marked as arrived, and only for a moment', () => {
  const p = page();
  assert.equal(p.drawn().rows.some((r) => r.arrived), false, 'the first look is a baseline');
  (p.block.rows as Row[]).unshift({ cells: ['From an agent'], done: false, ref: { register: 'tasks', seq: 9, version: 1 } });
  p.clock(100);
  assert.deepEqual(p.drawn().rows.map((r) => Boolean(r.arrived)), [true, false, false]);
  p.clock(2_000);
  assert.equal(p.drawn().rows.some((r) => r.arrived), false);
});

const AGENT: Row = { cells: ['From an agent'], done: false, ref: { register: 'tasks', seq: 9, version: 1 } };

test('the first row into a list the record answered empty is marked as arrived', () => {
  const p = page();
  (p.block.rows as Row[]).length = 0;
  assert.deepEqual(p.drawn().rows, [], 'the list was answered empty');
  (p.block.rows as Row[]).push(AGENT);
  p.clock(100);
  assert.deepEqual(p.drawn().rows.map((r) => Boolean(r.arrived)), [true], 'the first row into an empty list came in unmarked');
  p.clock(2_000);
  assert.equal(p.drawn().rows.some((r) => r.arrived), false);
});

test('a look before the live answer is in is no baseline, so the answer marks nothing', () => {
  const live: { now: number | null } = { now: null };
  const p = page('todo', live);
  const answered = (p.block.rows as Row[]).splice(0);
  assert.deepEqual(p.drawn().rows, [], 'nothing is drawn before the answer');
  live.now = Date.parse('2026-09-29T10:00:00Z');
  (p.block.rows as Row[]).push(...answered);
  p.clock(100);
  assert.equal(p.drawn().rows.some((r) => r.arrived), false, 'the rows the answer brought were marked as arrived');
  (p.block.rows as Row[]).unshift(AGENT);
  p.clock(200);
  assert.deepEqual(p.drawn().rows.map((r) => Boolean(r.arrived)), [true, false, false], 'the answer was not taken as the baseline');
});

test('a block the record refused or this build cannot draw is no baseline either', () => {
  for (const unread of [{ refusals: ['You cannot read tasks.'] }, { cannot: 'Not drawn yet.' }, { drawn: false }, { stale_at: '' }]) {
    const p = page();
    const answered = (p.block.rows as Row[]).splice(0);
    const said = Object.keys(unread)[0]!;
    assert.deepEqual(p.writes.keptSegment(0, p.block, { ...p.block, ...unread } as LiveBlock).rows, []);
    (p.block.rows as Row[]).push(...answered);
    p.clock(100);
    assert.equal(p.drawn().rows.some((r) => r.arrived), false, `${said}: its first rows were marked as arrived`);
  }
});

test('a table answered empty marks its first row, and one drawn before the answer marks none', () => {
  const live: { now: number | null } = { now: null };
  const p = page('todo', live);
  const table = { ...p.block, kind: 'table' } as unknown as LiveBlock;
  const row = { key: 'tasks#1', cells: [] } as unknown as Parameters<typeof p.writes.arrivedTable>[1][number];
  assert.deepEqual(p.writes.arrivedTable(3, [], table), []);
  live.now = Date.parse('2026-09-29T10:00:00Z');
  assert.equal(p.writes.arrivedTable(3, [row], table).some((r) => r.arrived), false, 'the answer itself was marked');
  assert.deepEqual(p.writes.arrivedTable(4, [], table), []);
  p.clock(100);
  assert.deepEqual(p.writes.arrivedTable(4, [row], table).map((r) => Boolean(r.arrived)), [true]);
});
