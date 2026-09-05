/**
 * Reminders, derived from the dates the record already holds.
 *
 * The failure every one of these is about: a reminder that is a separate object from the date it is
 * about. The invoice slips a week, the reminder does not, and it fires about a date that is no longer
 * true. Nobody sets a reminder here — a field declares one, and moving the date moves them with it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { atMs, expandRepeat, offsetMs, openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);
const DAY = 86_400_000;

const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    state: 'state',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'due', type: 'day', remind: ['-7d', '0d'] },
      { id: 'quiet', type: 'day' },
      { id: 'state', type: 'enum', values: ['open', 'paid'] },
    ],
  } as never,
};

const SERVICES: Declaration = {
  id: 'register.services',
  kind: 'register',
  body: {
    id: 'services',
    name: 'Services',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'renews', type: 'day', remind: ['-3d'], repeat: { freq: 'month' } },
    ],
  } as never,
};

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([OBLIGATIONS, SERVICES])).ok);
  return { k, sql };
}

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const pending = (sql: NodeSql) =>
  sql.all<{ key: string; due_at: string; state: string }>("SELECT key, due_at, state FROM schedule WHERE state = 'pending' ORDER BY due_at");

const day = (offsetDays: number) => new Date(NOW + offsetDays * DAY).toISOString().slice(0, 10);

/* ── the offsets ─────────────────────────────────────────────────────────── */

test('an offset is a signed span, and anything else is not one', () => {
  assert.equal(offsetMs('-7d'), -7 * DAY);
  assert.equal(offsetMs('0d'), 0);
  assert.equal(offsetMs('+2w'), 14 * DAY);
  assert.equal(offsetMs('a week before'), null);
  assert.equal(atMs('2026-09-05'), Date.UTC(2026, 8, 5, 12), 'a day is measured at noon, so no timezone moves it');
});

/* ── the derivation ──────────────────────────────────────────────────────── */

test('A DATE THAT MOVES TAKES ITS REMINDERS WITH IT', async () => {
  const { k, sql } = await record();
  value(k.create('obligations', { what: 'Invoice 41', due: day(30) }, { actor: 'p_1' }));

  const first = pending(sql);
  assert.equal(first.length, 2, 'two offsets, two reminders');
  assert.deepEqual(first.map((r) => r.due_at.slice(0, 10)), [day(23), day(30)]);

  value(k.update('obligations', 'obligations#1', { due: day(60) }, { actor: 'p_1' }));
  const moved = pending(sql);
  assert.equal(moved.length, 2, 'the old reminders were left behind');
  assert.deepEqual(moved.map((r) => r.due_at.slice(0, 10)), [day(53), day(60)]);
  sql.close();
});

test('a field with no `remind:` gets none, however many dates it holds', async () => {
  const { k, sql } = await record();
  value(k.create('obligations', { what: 'a', quiet: day(10) }, { actor: 'p_1' }));
  assert.equal(pending(sql).length, 0);
  sql.close();
});

test('clearing the date clears the reminders', async () => {
  const { k, sql } = await record();
  value(k.create('obligations', { what: 'a', due: day(10) }, { actor: 'p_1' }));
  assert.equal(pending(sql).length, 2);
  value(k.update('obligations', 'obligations#1', { due: null }, { actor: 'p_1' }));
  assert.equal(pending(sql).length, 0, 'a reminder outlived the date it was about');
  sql.close();
});

test('deleting the row cancels them, and restoring it brings them back', async () => {
  const { k, sql } = await record();
  value(k.create('obligations', { what: 'a', due: day(10) }, { actor: 'p_1' }));
  value(k.update('obligations', 'obligations#1', { deleted_at: day(0) }, { actor: 'p_1' }));
  assert.equal(pending(sql).length, 0, 'a deleted row is still going to be reminded about');
  value(k.update('obligations', 'obligations#1', { deleted_at: null }, { actor: 'p_1' }));
  assert.equal(pending(sql).length, 2);
  sql.close();
});

test('A REMINDER ALREADY PAST IS NOT DERIVED', async () => {
  // Otherwise every import and every restore fires a year of reminders at once, which is the failure
  // of every scheduler that reads "due" as "should have fired".
  const { k, sql } = await record();
  value(k.create('obligations', { what: 'overdue', due: day(-30) }, { actor: 'p_1' }));
  assert.equal(pending(sql).length, 0);

  // And one whose date is past but whose reminder is not still lands.
  value(k.create('obligations', { what: 'soon', due: day(3) }, { actor: 'p_1' }));
  const rows = pending(sql);
  assert.equal(rows.length, 1, 'the -7d reminder for a date three days away is in the past');
  assert.equal(rows[0]?.due_at.slice(0, 10), day(3));
  sql.close();
});

/* ── repeats ─────────────────────────────────────────────────────────────── */

test('a monthly repeat lands in every month, and clamps rather than overflowing', () => {
  // Adding to the month number rolls 31 January into 3 March, which is not what anybody means by
  // monthly — the last day of the month they named is.
  const jan31 = Date.UTC(2026, 0, 31, 12);
  const months = expandRepeat(jan31, { freq: 'month' }, jan31, 120).map((ms) => new Date(ms).toISOString().slice(0, 10));
  assert.deepEqual(months.slice(0, 4), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
});

test('a repeat stops at its horizon, its count and its until', () => {
  const at = Date.UTC(2026, 0, 1, 12);
  assert.equal(expandRepeat(at, { freq: 'day' }, at, 10).length, 11, 'the horizon is inclusive of today');
  assert.equal(expandRepeat(at, { freq: 'day', count: 3 }, at, 400).length, 3);
  assert.equal(expandRepeat(at, { freq: 'day', until: '2026-01-05' }, at, 400).length, 5);
  // A yearly repeat with no `until` is an infinite series; the horizon is what makes it finite.
  assert.ok(expandRepeat(at, { freq: 'year' }, at, 400).length <= 2);
});

test('a weekend can be moved to the working day either side', () => {
  const saturday = Date.UTC(2026, 0, 3, 12);
  assert.equal(new Date(saturday).getUTCDay(), 6);
  const previous = expandRepeat(saturday, { freq: 'week', count: 1, workday: 'previous' }, saturday)[0]!;
  const next = expandRepeat(saturday, { freq: 'week', count: 1, workday: 'next' }, saturday)[0]!;
  assert.equal(new Date(previous).toISOString().slice(0, 10), '2026-01-02');
  assert.equal(new Date(next).toISOString().slice(0, 10), '2026-01-05');
});

test('a repeating field derives a reminder per occurrence', async () => {
  const { k, sql } = await record();
  value(k.create('services', { name: 'Hosting', renews: day(10) }, { actor: 'p_1' }));
  const rows = pending(sql);
  assert.ok(rows.length > 10, `a monthly renewal over 400 days produced ${rows.length} reminders`);
  const row = k.get('services#1')!;
  for (const r of rows) assert.ok(r.key.startsWith(`${row.id}:renews:`), `${r.key} came from somewhere else`);
  // Each is three days before its occurrence.
  assert.equal(rows[0]?.due_at.slice(0, 10), day(7));
  sql.close();
});

/* ── the key is the derivation ───────────────────────────────────────────── */

test('THE KEY ENCODES THE DERIVATION, so re-deriving is a range and not a diff', async () => {
  const { k, sql } = await record();
  value(k.create('obligations', { what: 'a', due: day(30) }, { actor: 'p_1' }));
  const row = k.get('obligations#1')!;
  for (const r of pending(sql)) {
    assert.ok(r.key.startsWith(`${row.id}:due:`), `${r.key} does not name the row and field it came from`);
    assert.ok(r.key.endsWith('d'), 'the key does not carry its offset');
  }
  sql.close();
});

test('a date moved away and back does not fire twice', async () => {
  // A `done` row keeps its key, which is `once_per: [entry, field]` as a unique index rather than a
  // rule somebody has to remember.
  const { k, sql } = await record();
  value(k.create('obligations', { what: 'a', due: day(30) }, { actor: 'p_1' }));
  const key = pending(sql)[0]!.key;

  sql.exec("UPDATE schedule SET state = 'done' WHERE key = ?", key);
  value(k.update('obligations', 'obligations#1', { due: day(60) }, { actor: 'p_1' }));
  value(k.update('obligations', 'obligations#1', { due: day(30) }, { actor: 'p_1' }));

  const back = sql.all<{ state: string }>('SELECT state FROM schedule WHERE key = ?', key);
  assert.equal(back.length, 1, 'the key was written twice');
  assert.equal(back[0]?.state, 'done', 'a reminder that already fired was re-armed');
  sql.close();
});

/* ── one alarm ───────────────────────────────────────────────────────────── */

test('the record says when it next has something to do, which is one alarm per customer', async () => {
  // The alternative is a cron worker fanning out across every tenant, waking records that have
  // nothing to do in order to ask them.
  const { k, sql } = await record();
  assert.deepEqual(k.pending(), { nextDueMs: null, outboxPending: false });

  value(k.create('obligations', { what: 'a', due: day(30) }, { actor: 'p_1' }));
  const at = k.pending().nextDueMs;
  assert.ok(at !== null);
  assert.equal(new Date(at).toISOString().slice(0, 10), day(23), 'the alarm is set for the wrong reminder');

  assert.equal(k.due().length, 0, 'a reminder in the future is due now');
  assert.equal(k.due().length, 0);
  sql.close();
});

test('and hands over what is due when the time comes', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  assert.ok((await k.install([OBLIGATIONS])).ok);
  value(k.create('obligations', { what: 'Invoice 41', due: day(10) }, { actor: 'p_1' }));

  clock.set(NOW + 4 * DAY);
  assert.equal(k.due().length, 1, 'the -7d reminder for a date ten days out should be due on day three');
  const [first] = k.due();
  const payload = JSON.parse(first!.payload) as { register: string; field: string; offset: string };
  assert.deepEqual(
    { register: payload.register, field: payload.field, offset: payload.offset },
    { register: 'obligations', field: 'due', offset: '-7d' },
    'the payload does not say what to remind somebody about',
  );

  clock.set(NOW + 11 * DAY);
  assert.equal(k.due().length, 2);
  sql.close();
});
