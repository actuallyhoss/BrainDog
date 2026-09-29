/**
 * A roadmap bar dropped on a page, as the write it becomes and the undo its receipt offers.
 *
 * AT HEAD A ROADMAP DREW EVERY BAR AND NONE OF THEM MOVED. `dragPatch` had its arithmetic and its test, and nothing in
 * `apps` called it. The owner's old tool drags a roadmap bar by its
 * window, its first day or its last, and he moves dates that way; so the gesture has to end in a write.
 *
 * WHAT IS HELD HERE: the drop is ONE update carrying every field it changes, named by the fields the block's own
 * columns say, never `by` and `effort` by name, so a pack that keeps its dates under other words is dragged the same.
 * Its undo sends what the row held, and a field the row did not hold goes back as `null`. The round trips at the end
 * are real writes against a kernel on an in-memory SQLite, because what an undo is worth is what the record keeps.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Kernel } from '@braindog/kernel';
import type { Row } from 'braindog-render';

import type { Entry, Fields } from './schema.ts';
import type { Drop } from './roadmap-write.ts';

/** Loaded per test so a missing module fails each test on its own line rather than the whole file. */
const write = async () => import('./roadmap-write.ts');

const DAY = 86_400;
const NOW = Date.parse('2026-09-24T10:00:00Z');
const OWNER = { actor: 'p_1' };

/** A roadmap block's columns as a page answer carries them: title, the due day, the effort. */
const COLUMNS = [{ field: 'what' }, { field: 'by' }, { field: 'effort' }];

const entry = (seq: number, fields: Fields, version = 3): Entry => ({ seq, version, created: '2026-09-01T00:00:00Z', by: 'you', fields });
const rowOf = (e: Entry, register = 'tasks'): Row => ({ cells: [String(e.fields.what ?? ''), '', ''], ref: { register, seq: e.seq, version: e.version } });

/**
 * A drop as `Roadmap.svelte` hands one, with the patch its `dragPatch` would answer STATED rather than worked out.
 *
 * NOT THE DRAWER'S OWN `dropOf`. This file imported it by path at first, and the graph gate refused it: a relative
 * import from `apps/web` into `packages/render` is the cross-package edge 31 §3 layer 3 forbids, and `braindog-render`
 * exports neither `dropOf` nor `dragPatch`. What `dragPatch` answers for each shape is proved beside it
 * (`packages/render/svelte/p/roadmap-drag.test.ts`); what is proved here is what the host does with the answer, and
 * what it hands the patch to work from, which `seen` keeps.
 */
const seen: unknown[] = [];
const drop = (mode: Drop['mode'], days: number, patch: { by?: string; effort?: number } | null): Drop => ({
  mode,
  days,
  patch: (row) => {
    seen.push(row);
    return patch;
  },
});

test('a window moved is one patch on its due day, and the undo is the day it held', async () => {
  const { reschedule } = await write();
  const e = entry(4, { what: 'Build the kiln page', by: '2026-09-10', effort: 10 * DAY });
  const c = reschedule({ columns: COLUMNS, entries: [e] }, rowOf(e), drop('move', 5, { by: '2026-09-15' }));
  assert.deepEqual(c, {
    title: 'Build the kiln page',
    patch: { by: '2026-09-15' },
    back: { by: '2026-09-10' },
    said: 'Moved Build the kiln page to 15 Sep 2026.',
  });
});

test('an end dragged is ONE patch on both fields, so the window never draws half moved between two writes', async () => {
  const { reschedule } = await write();
  const e = entry(4, { what: 'Glaze', by: '2026-09-10', effort: 1.5 * DAY });
  const c = reschedule({ columns: COLUMNS, entries: [e] }, rowOf(e), drop('end', 2, { by: '2026-09-12', effort: 3.5 * DAY }));
  assert.deepEqual(c?.patch, { by: '2026-09-12', effort: 3.5 * DAY });
  assert.deepEqual(c?.back, { by: '2026-09-10', effort: 1.5 * DAY });
  /* The start holds the end, so only the effort is written and only the effort goes back. */
  const s = reschedule({ columns: COLUMNS, entries: [e] }, rowOf(e), drop('start', -1, { effort: 2.5 * DAY }));
  assert.deepEqual([s?.patch, s?.back], [{ effort: 2.5 * DAY }, { effort: 1.5 * DAY }]);
});

test('THE FIELDS ARE THE BLOCK\'S: a list that keeps its dates as `due` and `days` is dragged the same', async () => {
  const { reschedule } = await write();
  const e = entry(2, { name: 'Print run', due: '2026-10-01', days: 3 * DAY });
  const columns = [{ field: 'name' }, { field: 'due' }, { field: 'days' }];
  const c = reschedule({ columns, entries: [e] }, { cells: ['Print run', '', ''], ref: { register: 'jobs', seq: 2, version: 3 } }, drop('end', -1, { by: '2026-09-30', effort: 2 * DAY }));
  assert.deepEqual(c, {
    title: 'Print run',
    patch: { due: '2026-09-30', days: 2 * DAY },
    back: { due: '2026-10-01', days: 3 * DAY },
    said: 'Print run is now due 30 Sep 2026.',
  });
});

test('a date moved whole on a list with no effort column, and the day goes back', async () => {
  const { reschedule } = await write();
  const e = entry(7, { what: 'Launch', by: '2026-09-30' });
  const c = reschedule({ columns: COLUMNS.slice(0, 2), entries: [e] }, rowOf(e), drop('move', -3, { by: '2026-09-27' }));
  assert.deepEqual([c?.patch, c?.back], [{ by: '2026-09-27' }, { by: '2026-09-30' }]);
});

test('a field the row did not hold goes back as null, so the undo clears it rather than leaving the drop\'s value', async () => {
  /* NO DROP THE DRAWER MAKES TODAY WRITES AN UNSET FIELD: `dragPatch` answers an effort only for a window, which has
     one. The rule is held anyway, with the patch stated, because dropping `?? null` from `back` passed every other
     test in this file (measured by mutation), and an undo that silently kept the drop's effort would be the lie the
     header describes. */
  const { reschedule } = await write();
  const e = entry(7, { what: 'Launch', by: '2026-09-30' });
  const c = reschedule({ columns: COLUMNS, entries: [e] }, rowOf(e), drop('end', 1, { by: '2026-10-01', effort: DAY }));
  assert.deepEqual(c?.back, { by: '2026-09-30', effort: null });
});

test('THE PATCH IS WORKED OUT FROM THE ROW AS STORED: an effort in seconds, and a date with no effort as none', async () => {
  const { reschedule } = await write();
  seen.length = 0;
  const glaze = entry(4, { what: 'Glaze', by: '2026-09-10', effort: 1.5 * DAY });
  const launch = entry(7, { what: 'Launch', by: '2026-09-30' });
  reschedule({ columns: COLUMNS, entries: [glaze] }, rowOf(glaze), drop('end', 2, null));
  reschedule({ columns: COLUMNS, entries: [launch] }, rowOf(launch), drop('move', 1, null));
  /* Not `1.5 d`, which is what the drawer drew, and not the `10 Sep 2026` the page's cell said. */
  assert.deepEqual(seen, [
    { by: '2026-09-10', effort: 1.5 * DAY },
    { by: '2026-09-30', effort: null },
  ]);
});

test('a drop that means no write, a row the page no longer holds, or one changed since it was drawn is no write at all', async () => {
  const { reschedule } = await write();
  const e = entry(4, { what: 'Glaze', by: '2026-09-10', effort: DAY });
  const block = { columns: COLUMNS, entries: [e] };
  /* One day long already: the start cannot go later. `dragPatch` says null and the host writes nothing. */
  assert.equal(reschedule(block, rowOf(e), drop('start', 3, null)), null);
  /* No ref: a row the page drew from text, which names no row to write. */
  assert.equal(reschedule(block, { cells: ['Glaze', '', ''] }, drop('move', 1, { by: '2026-09-11' })), null);
  /* THE VERSION THE ROW WAS DRAWN AT, NOT ANOTHER. A drop on a row that has moved on is worked out from values the
     record no longer holds, so it is not sent; the re-read draws the row as it is. */
  assert.equal(reschedule(block, { cells: ['Glaze', '', ''], ref: { register: 'tasks', seq: 4, version: 9 } }, drop('move', 1, { by: '2026-09-11' })), null);
  /* A due day that is not a day on the record is a row the roadmap skipped, which cannot have been dropped. */
  const bad = entry(5, { what: 'Someday', by: 'soon' });
  assert.equal(reschedule({ columns: COLUMNS, entries: [bad] }, rowOf(bad), drop('move', 1, { by: '2026-09-11' })), null);
});

test('the drop goes to the record as one update at the version the page read, and its undo at the version the write made', async () => {
  const { reschedule, rescheduleRow } = await write();
  const e = entry(4, { what: 'Glaze', by: '2026-09-10', effort: 1.5 * DAY }, 3);
  const change = reschedule({ columns: COLUMNS, entries: [e] }, rowOf(e), drop('end', 2, { by: '2026-09-12', effort: 3.5 * DAY }))!;
  const sent: unknown[] = [];
  const io = async (url: string, init?: RequestInit): Promise<Response> => {
    sent.push({ url, body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ ok: true, value: { version: sent.length + 3 } }), { status: 200 });
  };
  const { out, undo } = await rescheduleRow('/api-base', rowOf(e).ref!, change, io);
  assert.deepEqual(out, { from: 'written', version: 4 });
  assert.ok(undo, 'a write that landed offered no way back');
  assert.deepEqual(await undo(), { from: 'written', version: 5 });
  assert.deepEqual(sent, [
    { url: '/api-base/api/update', body: { register: 'tasks', seq: 4, version: 3, patch: { by: '2026-09-12', effort: 3.5 * DAY } } },
    { url: '/api-base/api/update', body: { register: 'tasks', seq: 4, version: 4, patch: { by: '2026-09-10', effort: 1.5 * DAY } } },
  ]);
});

test('a write the record refused offers no undo, because there is nothing to put back', async () => {
  const { reschedule, rescheduleRow } = await write();
  const e = entry(4, { what: 'Glaze', by: '2026-09-10', effort: DAY });
  const change = reschedule({ columns: COLUMNS, entries: [e] }, rowOf(e), drop('move', 1, { by: '2026-09-11' }))!;
  const io = async (): Promise<Response> => new Response(JSON.stringify({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'You can read this list.' } }), { status: 200 });
  const { out, undo } = await rescheduleRow('', rowOf(e).ref!, change, io);
  assert.deepEqual(out, { from: 'refused', fix: 'You can read this list.' });
  assert.equal(undo, null);
});

test('the receipt says what moved in the words a person uses: a move to a day, a new due day, a new start', async () => {
  const { reschedule } = await write();
  const e = entry(4, { what: 'Glaze', by: '2026-10-10', effort: 3 * DAY });
  const said = (d: Drop) => reschedule({ columns: COLUMNS, entries: [e] }, rowOf(e), d)?.said;
  assert.equal(said(drop('move', 2, { by: '2026-10-12' })), 'Moved Glaze to 12 Oct 2026.');
  assert.equal(said(drop('end', 2, { by: '2026-10-12', effort: 5 * DAY })), 'Glaze is now due 12 Oct 2026.');
  assert.equal(said(drop('start', 1, { effort: 2 * DAY })), 'Glaze now starts a day later.');
  assert.equal(said(drop('start', -3, { effort: 6 * DAY })), 'Glaze now starts 3 days earlier.');
});

/* ── against a record ────────────────────────────────────────────────────── */

/** Work's tasks as far as a roadmap reads them: a title, a due day, and an effort kept in seconds and shown in days. */
const TASKS = {
  id: 'tasks',
  title: 'what',
  fields: [
    { id: 'what', type: 'text', required: true },
    { id: 'by', type: 'day' },
    { id: 'effort', type: 'duration', unit: 'd' },
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

/** The row as a page's block holds it: the record's own fields, at the version it was read at. */
function held(k: Kernel, seq: number): Entry {
  const row = k.get(`tasks#${seq}`);
  assert.ok(row, `tasks#${seq} is not on the record`);
  return { seq, version: row.version, created: row.created_at, by: 'you', fields: row.fields as Fields };
}

/** The drop and then the receipt's undo, both real writes, the undo at the version the drop answered with. */
async function dropThenUndo(k: Kernel, seq: number, dropped: Drop) {
  const { reschedule } = await write();
  const before = held(k, seq);
  const c = reschedule({ columns: COLUMNS, entries: [before] }, rowOf(before), dropped);
  assert.ok(c, 'the drop meant no write');
  const wrote = k.update('tasks', `tasks#${seq}`, c.patch as Fields, { ...OWNER, version: before.version });
  assert.ok(wrote.ok, JSON.stringify(wrote));
  const moved = k.get(`tasks#${seq}`)!.fields;
  const undone = k.update('tasks', `tasks#${seq}`, c.back as Fields, { ...OWNER, version: wrote.value.version });
  assert.ok(undone.ok, JSON.stringify(undone));
  return { before: before.fields, moved, after: k.get(`tasks#${seq}`)!.fields };
}

test('against a record: every mode lands as the drag said, and the undo leaves the row as it was', async () => {
  const k = await record();
  assert.ok(k.create('tasks', { what: 'Glaze', by: '2026-09-10', effort: 1.5 * DAY }, OWNER).ok);
  for (const [mode, days, patch, want] of [
    ['move', 4, { by: '2026-09-14' }, { by: '2026-09-14', effort: 1.5 * DAY }],
    ['start', -2, { effort: 3.5 * DAY }, { by: '2026-09-10', effort: 3.5 * DAY }],
    ['end', 3, { by: '2026-09-13', effort: 4.5 * DAY }, { by: '2026-09-13', effort: 4.5 * DAY }],
  ] as const) {
    const { before, moved, after } = await dropThenUndo(k, 1, drop(mode, days, patch));
    assert.deepEqual({ by: moved.by, effort: moved.effort }, want, `${mode} ${days}`);
    assert.deepEqual(after, before, `${mode} ${days} was not undone`);
  }
});

test('against a record: a date given no effort, moved and undone, holds no effort it never had', async () => {
  const k = await record();
  assert.ok(k.create('tasks', { what: 'Launch', by: '2026-09-30' }, OWNER).ok);
  const { moved, after } = await dropThenUndo(k, 1, drop('move', -3, { by: '2026-09-27' }));
  assert.equal(moved.by, '2026-09-27');
  assert.deepEqual(after, { what: 'Launch', by: '2026-09-30' });
});
