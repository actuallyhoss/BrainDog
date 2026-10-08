/**
 * A figure over a kept line (REC-B01): `source: 'series.<figure>'` with `value: { count: 'missing' }` and a window
 * answers how many days of the window hold no point in that figure's line, by the record's own days. It is how Money
 * says its nights stopped: `snapshot` counted the days it could not write and kept the count nowhere.
 *
 * The points are written as `snapshot` writes them, a row a day under the figure's id.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Sql } from '@braindog/ports';

import { openRecord, type Declaration } from '../src/index.ts';
import { evaluateMetric, type EvalContext, type MetricDecl } from '../src/metrics.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const DAY = 86_400_000;

const MISSED: MetricDecl = {
  metric: 'nights-missed-30d',
  name: 'Nights the cash line missed',
  source: 'series.cash-now',
  value: { count: 'missing' } as never,
  target: { lte: 2 },
  window: '30d',
  compare: 'none',
  format: 'int',
};

/** The local date `n` days before `day`. */
const back = (day: string, n: number): string => new Date(Date.parse(`${day}T12:00:00Z`) - n * DAY).toISOString().slice(0, 10);

/** One point a day on each of `days`, as `snapshot` writes it. */
const points = (sql: NodeSql, days: readonly string[], series = 'cash-now'): void => {
  for (const at of days)
    sql.exec(
      "INSERT INTO metric_point (series, grain, at, value, unit, n, source, wrote_at) VALUES (?, 'day', ?, 100, 'EGP', 1, 'register.accounts', ?)",
      series,
      at,
      new Date(NOW).toISOString(),
    );
};

/** Every day from `n` days back to yesterday, leaving out `skip`. */
const run = (n: number, skip: readonly string[] = [], today = '2026-10-09'): string[] =>
  Array.from({ length: n }, (_, i) => back(today, i + 1)).filter((d) => !skip.includes(d));

/** A record's tables, opened as a record opens them. */
async function fresh(): Promise<NodeSql> {
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW));
  return sql;
}

const ctx = (more: Partial<EvalContext> = {}): EvalContext => ({ nowMs: NOW, tz: 'UTC', schemaOf: () => null, ...more });

const read = (sql: Sql, decl: MetricDecl = MISSED, more: Partial<EvalContext> = {}) => {
  const r = evaluateMetric(sql, decl, ctx(more));
  assert.ok(r.ok, JSON.stringify(r));
  return r.value;
};

test('A LINE WITH NO POINT SAYS NOTHING, never nought and never thirty', async () => {
  const sql = await fresh();
  const none = read(sql);
  assert.equal(none.value, null);
  assert.equal(none.met, null);
  points(sql, run(40), 'another-figure');
  assert.equal(read(sql).value, null, "another figure's line is not this one");
});

test('EVERY NIGHT KEPT IS NOUGHT, and each day of the window with no point is one, while today and days before it are not', async () => {
  const sql = await fresh();
  points(sql, run(45, ['2026-10-08', '2026-09-25', '2026-09-10', '2026-09-01']));
  const r = read(sql);
  assert.equal(r.value, 3, 'yesterday, the 25th and the 10th; the 1st is before the thirty days');
  assert.equal(r.held, 30);
  assert.equal(r.met, false);
  points(sql, ['2026-10-08', '2026-09-25']);
  assert.equal(read(sql).value, 1);
  assert.equal(read(sql).met, true);
  points(sql, ['2026-09-10']);
  assert.equal(read(sql).value, 0);
});

test('A LINE IS NOT MISSED BEFORE IT BEGAN: armed five days ago with two nights lost reads two, not twenty-seven', async () => {
  const sql = await fresh();
  points(sql, ['2026-10-04', '2026-10-06', '2026-10-08']);
  const r = read(sql);
  assert.equal(r.value, 2);
  assert.equal(r.held, 5);
});

test('THE WINDOW IS THE DECLARATION’S, and a week holds a week', async () => {
  const sql = await fresh();
  points(sql, run(30, ['2026-10-07', '2026-09-20']));
  assert.equal(read(sql, { ...MISSED, window: '7d' }).value, 1);
  assert.equal(read(sql, { ...MISSED, window: '4w' }).value, 2);
});

test("THE RECORD'S DAYS: late on the 8th in UTC it is the 9th in Auckland, so the 8th is in its window and missed", async () => {
  const sql = await fresh();
  points(sql, run(30, [], '2026-10-08'));
  const late = Date.UTC(2026, 9, 8, 13);
  assert.equal(read(sql, MISSED, { nowMs: late, tz: 'UTC' }).value, 0);
  assert.equal(read(sql, MISSED, { nowMs: late, tz: 'Pacific/Auckland' }).value, 1);
});

test('ON A PAST DAY the window ends the day before it', async () => {
  const sql = await fresh();
  points(sql, run(40, ['2026-10-01']));
  assert.equal(read(sql, MISSED, { asOfMs: Date.parse('2026-10-02T12:00:00Z') }).value, 1);
  assert.equal(read(sql, MISSED, { asOfMs: Date.parse('2026-10-01T12:00:00Z') }).value, 0);
});

test('ONE QUERY, NEVER ONE PER DAY, however long the window', async () => {
  const sql = await fresh();
  points(sql, run(100, ['2026-08-01']));
  let calls = 0;
  const counted = new Proxy(sql, {
    get(target, key, receiver) {
      const v = Reflect.get(target, key, receiver) as unknown;
      if (typeof v !== 'function') return v;
      return (...args: unknown[]) => {
        if (key === 'one' || key === 'all' || key === 'exec') calls++;
        return (v as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  assert.equal(read(counted as Sql, { ...MISSED, window: '90d' }).value, 1);
  assert.equal(calls, 1);
});

/** The refusal a read came back with, or `null` when it answered. */
const refusalOf = (r: ReturnType<typeof evaluateMetric>): { code: string; fix: string } | null => (!r.ok && 'refusal' in r ? r.refusal : null);

test('ANYTHING ELSE OVER A LINE IS STILL A SOURCE THIS BUILD DOES NOT READ, and a window is still required', async () => {
  const sql = await fresh();
  const summed = evaluateMetric(sql, { ...MISSED, value: { sum: 'value' } }, ctx());
  assert.equal(refusalOf(summed)?.code, 'SOURCE_UNKNOWN');
  assert.match(refusalOf(summed)?.fix ?? '', /read only as \{ count: missing \}/);
  const counted = evaluateMetric(sql, { ...MISSED, value: { count: 'id' } }, ctx());
  assert.equal(refusalOf(counted)?.code, 'SOURCE_UNKNOWN');
  const windowless = evaluateMetric(sql, { ...MISSED, window: undefined }, ctx());
  assert.equal(refusalOf(windowless)?.code, 'REQUIRED_MISSING');
});

test('A PACK DECLARES IT AND THE RECORD READS IT, as a page does', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const decl: Declaration = { id: 'metric.nights-missed-30d', kind: 'metric', body: MISSED as never };
  const installed = await k.install([decl]);
  assert.ok(installed.ok, JSON.stringify(installed));
  points(sql, run(30, ['2026-10-01', '2026-10-02']));
  const r = k.metric(k.metricDecl('nights-missed-30d')!);
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.value.value, 2);
});
