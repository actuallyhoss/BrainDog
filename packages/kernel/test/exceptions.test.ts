/**
 * Exceptions: what a record says by itself has stopped. Each case here holds the rule about absence: a
 * silence is an exception only where the record was recording presence, so a list written to once, a door that took one
 * message and a record three days old all answer none. Nothing is stored: every case reads, writes, and reads again.
 *
 * The rows are planted as the kernel leaves them, on a record opened in memory, because the detectors read what the
 * tables hold and nothing else.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord } from '../src/index.ts';
import { LISTS_A_READ, openExceptions, type Exception, type Watched } from '../src/exceptions.ts';
import { lastPresence, presenceOf } from '../src/observe.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 12);
const DAY = 86_400_000;
const ago = (days: number, from = NOW): string => new Date(from - days * DAY).toISOString();
const dayAgo = (days: number): string => ago(days).slice(0, 10);

const NUMBERS: Watched = { id: 'numbers', name: 'Numbers' };

async function record(): Promise<NodeSql> {
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW));
  return sql;
}

let n = 0;
/** One row on a list, made `days` ago. */
function row(sql: NodeSql, list: string, days: number, fields: Record<string, unknown> = {}): string {
  const id = `01KQUIET${String(++n).padStart(18, '0')}`;
  sql.exec('INSERT INTO entry (id, register, seq, fields, version, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)', id, list, n, JSON.stringify(fields), ago(days), ago(days));
  return id;
}

/** A door, as the install leaves it: a pattern that takes messages in at a named door. */
function door(sql: NodeSql, id: string, name: string): void {
  sql.exec("INSERT INTO declaration (id, version, kind, body, checksum, created_at) VALUES (?, 1, 'ingest', ?, 'x', ?)", `ingest.${id}`, JSON.stringify({ ingest: id, name, channel: 'email', door: id }), ago(40));
}

/** One arrival a door's pattern took, `days` ago. */
function arrival(sql: NodeSql, ingest: string, days: number): void {
  const id = `r${++n}`;
  sql.exec("INSERT INTO ingest_receipt (id, raw_id, ingest_id, wrote, confidence, ts) VALUES (?, ?, ?, '[]', 'exact', ?)", id, `raw_${id}`, ingest, ago(days));
}

/** A thing on a clock, as the install leaves it: a declaration that says how often, and its clock. */
function scheduled(sql: NodeSql, id: string, every: string, declaredDaysAgo: number): void {
  sql.exec("INSERT INTO declaration (id, version, kind, body, checksum, created_at) VALUES (?, 1, 'script', ?, 'x', ?)", `script.${id}`, JSON.stringify({ script: id, name: 'Daily rates', runs: { every } }), ago(declaredDaysAgo));
  sql.exec("INSERT INTO schedule (id, due_at, kind, key, payload) VALUES (?, ?, 'script', ?, '{}')", `s_${id}`, ago(0), id);
}

function ran(sql: NodeSql, id: string, days: number, outcome = 'ok'): void {
  sql.exec("INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v) VALUES (?, ?, ?, 'pull', ?, 'declaration', ?)", `e${++n}`, ago(days), `script:${id}`, `declaration:script.${id}`, JSON.stringify({ outcome }));
}

const open = (sql: NodeSql, lists: readonly Watched[] = [NUMBERS], nowMs = NOW): Exception[] => openExceptions(sql, nowMs, lists);

test('A LIST THAT TOOK ROWS ON FIVE OF FOURTEEN DAYS AND NONE FOR THREE is one exception, with since and was', async () => {
  const sql = await record();
  for (const d of [19, 12, 9, 7, 5]) row(sql, 'numbers', d);
  const last = row(sql, 'numbers', 4);
  assert.deepEqual(open(sql), [
    { kind: 'list', subject: 'numbers', name: 'Numbers', since: dayAgo(4), was: { days: 5, of: 14 }, cause: 'quiet:list:numbers', row: last },
  ]);
  sql.close();
});

test('THE SAME LIST WRITTEN TO ONCE IN FOURTEEN DAYS IS NONE, and so is a busy one that went quiet two days ago', async () => {
  const sql = await record();
  row(sql, 'numbers', 6);
  assert.deepEqual(open(sql), []);
  for (const d of [12, 9, 7, 5, 2]) row(sql, 'numbers', d);
  assert.deepEqual(open(sql), [], 'two days of silence is a weekend');
  sql.close();
});

test('MANY ROWS ON ONE DAY ARE ONE DAY: a burst is not presence', async () => {
  const sql = await record();
  for (let i = 0; i < 30; i++) row(sql, 'numbers', 6);
  assert.deepEqual(open(sql), []);
  sql.close();
});

test('A DOOR THAT TOOK ARRIVALS ON FIVE OF FOURTEEN DAYS AND NONE FOR THREE is one, and a door that took one is none', async () => {
  const sql = await record();
  door(sql, 'post', 'Post');
  door(sql, 'forms', 'Forms');
  for (const d of [13, 11, 8, 6, 5]) arrival(sql, 'post', d);
  arrival(sql, 'forms', 9);
  assert.deepEqual(open(sql, []), [{ kind: 'door', subject: 'post', name: 'Post', since: dayAgo(5), was: { days: 5, of: 14 }, cause: 'quiet:door:post', row: null }]);
  sql.close();
});

test('A SCHEDULED THING WHOSE TIME PASSED BY MORE THAN ITS PERIOD WITH NO RUN is one; one that ran yesterday is none', async () => {
  const sql = await record();
  scheduled(sql, 'rates', '1d', 30);
  scheduled(sql, 'prices', '1d', 30);
  ran(sql, 'rates', 16);
  ran(sql, 'rates', 1, 'failed');
  ran(sql, 'prices', 1);
  assert.deepEqual(open(sql, []), [
    { kind: 'schedule', subject: 'script.rates', name: 'Daily rates', since: dayAgo(16), was: { everyMs: DAY }, cause: 'quiet:schedule:script.rates', row: null },
  ]);
  /* A FEED THAT NEVER RAN WELL WAS NEVER ARRIVING, so its silence is not one: the sign for feeds behind counts it. */
  scheduled(sql, 'never', '1d', 30);
  ran(sql, 'never', 2, 'failed');
  assert.equal(open(sql, []).length, 1);
  /* ONE PERIOD LATE IS A LATE RUN, NOT A STOPPED ONE. */
  ran(sql, 'rates', 1.5);
  assert.deepEqual(open(sql, []), []);
  sql.close();
});

test('A FEED THAT PULLS IS READ BY WHAT IT FILED, and it is a feed and never a door as well', async () => {
  const sql = await record();
  sql.exec("INSERT INTO declaration (id, version, kind, body, checksum, created_at) VALUES ('ingest.fx', 1, 'ingest', ?, 'x', ?)", JSON.stringify({ ingest: 'fx', name: 'Rates', channel: 'pull', every: '1d' }), ago(40));
  sql.exec("INSERT INTO schedule (id, due_at, kind, key, payload) VALUES ('s_fx', ?, 'pull', 'fx', '{}')", ago(0));
  for (const d of [22, 20, 19, 17, 16]) arrival(sql, 'fx', d);
  assert.deepEqual(open(sql, []), [
    { kind: 'schedule', subject: 'ingest.fx', name: 'Rates', since: dayAgo(16), was: { everyMs: DAY }, cause: 'quiet:schedule:ingest.fx', row: null },
  ]);
  arrival(sql, 'fx', 0);
  assert.deepEqual(open(sql, []), [], 'it filed again, so it is gone the same day');
  sql.close();
});

test('A LIST GIVES AT MOST FIVE ROWS OUT OF DATE, and a day that is not a day is not read', async () => {
  const sql = await record();
  for (let i = 1; i <= 8; i++) row(sql, 'holdings', 1, { as_of: `2026-09-0${i}` });
  for (const as_of of ['soon', 20260901, null]) row(sql, 'holdings', 1, { as_of });
  const cash = (field: string, after = '7d'): Watched => ({ id: 'holdings', name: 'Holdings', stale: { field, after } });
  assert.deepEqual(open(sql, [cash('as_of')]).map((e) => e.since), ['2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08']);
  assert.deepEqual(open(sql, [cash("as_of') OR 1=1 --")]), [], 'a field that is not a field id is not read');
  assert.deepEqual(open(sql, [cash('as_of', 'never')]), [], 'a window that is not a window is not read');
  sql.close();
});

test('A ROW PAST THE WINDOW ITS PAGE DECLARES is one, and the window is the one handed in', async () => {
  const sql = await record();
  const cash: Watched = { id: 'holdings', name: 'Holdings', stale: { field: 'as_of', after: '7d' } };
  const old = row(sql, 'holdings', 41, { as_of: '2026-09-03' });
  row(sql, 'holdings', 2, { as_of: dayAgo(2) });
  assert.deepEqual(open(sql, [cash]), [
    { kind: 'stale', subject: `holdings/${old}`, name: 'Holdings', since: '2026-09-03', was: { afterMs: 7 * DAY }, cause: `quiet:stale:holdings/${old}`, row: old },
  ]);
  assert.deepEqual(open(sql, [{ id: 'holdings', name: 'Holdings' }]), [], 'no window declared, so nothing is out of date');
  assert.deepEqual(open(sql, [{ ...cash, stale: { field: 'as_of', after: '60d' } }]), [], 'a longer window is the add-on to say');
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.as_of', ?) WHERE id = ?", dayAgo(0), old);
  assert.deepEqual(open(sql, [cash]), [], 'the day was written again, so it is gone');
  sql.close();
});

test('A FRESH RECORD THREE DAYS OLD ANSWERS NONE', async () => {
  const sql = await record();
  assert.deepEqual(open(sql), [], 'an empty record');
  for (const d of [3, 2, 1]) row(sql, 'numbers', d);
  row(sql, 'notes', 3);
  door(sql, 'post', 'Post');
  arrival(sql, 'post', 3);
  const lists = [NUMBERS, { id: 'notes', name: 'Notes' }];
  assert.deepEqual(open(sql, lists), []);
  /* AND A WEEK ON WITH NOTHING WRITTEN, it still says none: three days of rows was somebody trying it. */
  assert.deepEqual(open(sql, lists, NOW + 7 * DAY), []);
  sql.close();
});

test('WHEN A ROW ARRIVES THE EXCEPTION IS GONE ON THE NEXT READ, and so for a door and a run', async () => {
  const sql = await record();
  for (const d of [16, 12, 9, 7, 5]) row(sql, 'numbers', d);
  door(sql, 'post', 'Post');
  for (const d of [13, 11, 8, 6, 5]) arrival(sql, 'post', d);
  scheduled(sql, 'rates', '1d', 30);
  ran(sql, 'rates', 16);
  assert.deepEqual(open(sql).map((e) => e.cause).sort(), ['quiet:door:post', 'quiet:list:numbers', 'quiet:schedule:script.rates']);
  row(sql, 'numbers', 0);
  assert.deepEqual(open(sql).map((e) => e.cause).sort(), ['quiet:door:post', 'quiet:schedule:script.rates']);
  arrival(sql, 'post', 0);
  ran(sql, 'rates', 0);
  assert.deepEqual(open(sql), []);
  /* NOTHING WAS KEPT: the record holds no table of exceptions to go out of date. */
  assert.equal(sql.all("SELECT name FROM sqlite_master WHERE name LIKE '%exception%'").length, 0);
  sql.close();
});

test('A MODEL THAT DID NOT ANSWER IS NEVER AN EXCEPTION: only feeds on a clock are read', async () => {
  const sql = await record();
  sql.exec("INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES ('s_score', ?, 'score', 'night', '{}', 'failed', 8)", ago(20));
  sql.exec("INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES ('s_an', ?, 'analyse', 'week', '{}', 'pending', 0)", ago(20));
  assert.deepEqual(open(sql), []);
  sql.close();
});

test('A READ IS BOUNDED: the lists past the ceiling are not read', async () => {
  const sql = await record();
  const lists: Watched[] = [];
  for (let i = 0; i < LISTS_A_READ + 10; i++) {
    const id = `list_${String(i).padStart(2, '0')}`;
    lists.push({ id, name: `List ${i}` });
    for (const d of [12, 9, 7, 5, 4]) row(sql, id, d);
  }
  assert.equal(LISTS_A_READ, 50);
  assert.equal(open(sql, lists).length, LISTS_A_READ);
  sql.close();
});

test('THE SHARED READING OF PRESENCE counts days and marks in a window, and says when the last one was', async () => {
  const sql = await record();
  for (const d of [9, 9, 7]) row(sql, 'numbers', d);
  assert.deepEqual(presenceOf(sql, 'rows', 'numbers', dayAgo(14)), { days: 2, marks: 3 });
  assert.deepEqual(presenceOf(sql, 'rows', 'numbers', dayAgo(14), dayAgo(8)), { days: 1, marks: 2 }, 'the end of the window is not in it');
  assert.deepEqual(presenceOf(sql, 'rows', 'nothing', dayAgo(14)), { days: 0, marks: 0 });
  assert.equal(lastPresence(sql, 'rows', 'numbers'), ago(7));
  assert.equal(lastPresence(sql, 'rows', 'nothing'), null);
  sql.close();
});
