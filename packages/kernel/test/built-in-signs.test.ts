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

/* GREEN DAYS IS THE HOLD NOW (PRF-A18, `hold.ts`): its runs, the Auckland case among them, are in figures-health.test.ts. */
