/**
 * `signs-red` and `green-days` (PRF-A05): how many vital signs read red now, and how many days in a row, in the record's
 * zone, the kept readings held a sign green and none red. Both say nothing, never nought, with no reading at all: an
 * empty record has no red sign and is not well, and it has no good days either.
 *
 * The readings are made through `fileSignReading`, the verb the host and the record file theirs with, on the days they
 * are about. `signs-red` reads the signs now through `EvalContext.signs`, which the record hands `readSigns`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Kernel, type Reading } from '../src/index.ts';
import { builtInFigure } from '../src/built-in-figures.ts';
import { evaluateMetric, type EvalContext } from '../src/metrics.ts';
import { fileSignReading, readSigns, type SignState } from '../src/signs.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);

/** Files one of the signs the host files, on the day `day` in UTC. */
const file = (sql: NodeSql, sign: string, state: SignState, day: string): void => {
  const r = fileSignReading(sql, sign, { state, value: null, said: `Filed ${state}.` }, Date.parse(`${day}T12:00:00Z`), 'UTC');
  assert.ok(r.ok, JSON.stringify(r));
};

const ctxOf = (sql: NodeSql, more: Partial<EvalContext> = {}): EvalContext => ({
  nowMs: NOW,
  tz: 'UTC',
  schemaOf: () => null,
  signs: () => readSigns(sql, more.nowMs ?? NOW, more.tz ?? 'UTC'),
  ...more,
});

const read = (sql: NodeSql, id: 'signs-red' | 'green-days', more: Partial<EvalContext> = {}): Reading => {
  const r = evaluateMetric(sql, builtInFigure(id)!, ctxOf(sql, more));
  assert.ok(r.ok, JSON.stringify(r));
  return r.value;
};

/** Through the record's own `metric`, as a page reads it. */
const viaRecord = (k: Kernel, id: string): Reading => {
  const decl = k.metricDecl(id);
  assert.ok(decl, `${id} is not a figure this record answers`);
  const r = k.metric(decl);
  assert.ok(r.ok, JSON.stringify(r));
  return r.value;
};

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  return { k, sql };
}

test('AN EMPTY RECORD SAYS NOTHING ON BOTH, never nought', async () => {
  const { k, sql } = await record();
  assert.equal(read(sql, 'signs-red').value, null);
  assert.equal(read(sql, 'signs-red').met, null);
  assert.equal(viaRecord(k, 'green-days').value, null);
  assert.equal(viaRecord(k, 'green-days').met, null);
});

test('SIGNS RED counts the signs that read red now, and a sign that reads none is counted neither way', async () => {
  const { sql } = await record();
  file(sql, 'model-answers', 'red', '2026-10-09');
  file(sql, 'tools-listed', 'green', '2026-10-09');
  const red = read(sql, 'signs-red');
  assert.equal(red.value, 1);
  assert.equal(red.met, false);
  file(sql, 'model-answers', 'green', '2026-10-09');
  file(sql, 'pages-clean', 'red', '2026-10-09');
  file(sql, 'briefing-true', 'red', '2026-10-09');
  assert.equal(read(sql, 'signs-red').value, 2);
  file(sql, 'pages-clean', 'green', '2026-10-09');
  file(sql, 'briefing-true', 'green', '2026-10-09');
  const none = read(sql, 'signs-red');
  assert.equal(none.value, 0);
  assert.equal(none.met, true);
});

test('SIGNS RED with no signs handed to the reader says nothing rather than guess', async () => {
  const { sql } = await record();
  file(sql, 'model-answers', 'red', '2026-10-09');
  assert.equal(read(sql, 'signs-red', { signs: undefined }).value, null);
});

test("SIGNS RED ON A PAST DAY is that day's kept readings, and a day with none kept says nothing", async () => {
  const { sql } = await record();
  file(sql, 'model-answers', 'red', '2026-10-05');
  file(sql, 'tools-listed', 'green', '2026-10-05');
  file(sql, 'pages-clean', 'none', '2026-10-04');
  assert.equal(read(sql, 'signs-red', { asOfMs: Date.parse('2026-10-05T12:00:00Z') }).value, 1);
  assert.equal(read(sql, 'signs-red', { asOfMs: Date.parse('2026-10-04T12:00:00Z') }).value, null);
});

test('GREEN DAYS counts back from yesterday through days with a sign green and none red; today is not over', async () => {
  const { k, sql } = await record();
  file(sql, 'model-answers', 'red', '2026-10-05');
  file(sql, 'model-answers', 'green', '2026-10-06');
  file(sql, 'tools-listed', 'red', '2026-10-06');
  file(sql, 'model-answers', 'green', '2026-10-07');
  file(sql, 'model-answers', 'green', '2026-10-08');
  file(sql, 'tools-listed', 'none', '2026-10-08');
  file(sql, 'model-answers', 'red', '2026-10-09');
  const run = viaRecord(k, 'green-days');
  assert.equal(run.value, 2);
  assert.equal(run.met, true);
});

test('A DAY WITH NO READING, OR ONLY NONE, ENDS THE RUN: a night that stopped reads nought, not the run before it', async () => {
  const gap = await record();
  for (const day of ['2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07']) file(gap.sql, 'model-answers', 'green', day);
  const stopped = viaRecord(gap.k, 'green-days');
  assert.equal(stopped.value, 0);
  assert.equal(stopped.met, false);
  file(gap.sql, 'model-answers', 'green', '2026-10-08');
  assert.equal(viaRecord(gap.k, 'green-days').value, 6);

  const blank = await record();
  file(blank.sql, 'model-answers', 'green', '2026-10-07');
  file(blank.sql, 'model-answers', 'none', '2026-10-08');
  assert.equal(viaRecord(blank.k, 'green-days').value, 0);
});

test("GREEN DAYS COUNTS THE RECORD'S DAYS: late on the 8th in UTC, Auckland's yesterday is already the 8th", async () => {
  const { sql } = await record();
  file(sql, 'model-answers', 'red', '2026-10-06');
  file(sql, 'model-answers', 'green', '2026-10-07');
  file(sql, 'model-answers', 'green', '2026-10-08');
  const late = Date.UTC(2026, 9, 8, 13);
  assert.equal(read(sql, 'green-days', { nowMs: late, tz: 'UTC' }).value, 1);
  assert.equal(read(sql, 'green-days', { nowMs: late, tz: 'Pacific/Auckland' }).value, 2);
});
