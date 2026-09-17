/**
 * A `stat` or `lines` over a register of readings is worked out in the record: one series a measure over the period and
 * the one before, a bucket's last reading, counted in the record's local day, and a year of readings answered as a few
 * hundred numbers.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { measureSeries, measureWindow, openRecord, type Declaration, type MeasureSeries } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 17, 12);
const DAY = 86_400_000;
const OWNER = { actor: 'p_1' };

const POINTS: Declaration = {
  id: 'register.points',
  kind: 'register',
  body: {
    id: 'points',
    name: 'Points',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true, index: true },
      { id: 'value', type: 'decimal', required: true },
      { id: 'unit', type: 'text' },
      { id: 'source', type: 'enum', values: ['reported', 'example'] },
      { id: 'at', type: 'instant', index: true },
    ],
  },
};

const OPEN: Declaration = {
  id: 'metric.points-count',
  kind: 'metric',
  body: { metric: 'points-count', name: 'Points', source: 'register.points', value: { count: 'id' }, format: 'int', target: { gte: 0 }, window: '30d', compare: 'none' },
};

const value = <T>(r: unknown): T => {
  const out = r as { ok: boolean; value?: T };
  assert.ok(out.ok, JSON.stringify(out));
  return out.value as T;
};

const COLUMNS = [{ field: 'at' }, { field: 'value' }, { field: 'name' }, { field: 'unit' }];
type Drawn = { rows: unknown[]; readings?: unknown; matched: number; measures?: MeasureSeries[]; refusals: { code: string }[] };

test('a stat over a register answers one series a measure, and one with cells still answers its figures', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  value(await k.install([POINTS, OPEN]));
  value(k.create('points', { name: 'Sign-ups', value: 12, at: '2026-09-16T08:00:00.000Z' }, OWNER));
  value(k.create('points', { name: 'Sign-ups', value: 14, at: '2026-09-17T07:00:00.000Z' }, OWNER));
  value(k.create('points', { name: 'Sign-ups', value: 15, at: '2026-09-17T08:00:00.000Z' }, OWNER));
  value(k.create('points', { name: 'Revenue', value: 90, unit: 'GBP', at: '2026-05-01T08:00:00.000Z' }, OWNER));
  value(k.create('points', { name: 'Example', value: 1, source: 'example', at: '2026-09-17T09:00:00.000Z' }, OWNER));

  const tiles = k.block({ kind: 'stat', source: 'register.points', columns: COLUMNS, where: 'source is not example', back: 7 }) as Drawn;
  assert.deepEqual(tiles.refusals, []);
  assert.equal(tiles.readings, undefined);
  assert.deepEqual(tiles.rows, []);
  assert.equal(tiles.matched, 3);
  assert.deepEqual(tiles.measures!.map((m) => m.name), ['Sign-ups', 'Revenue'], 'the example is not a measure');
  const [signups, revenue] = tiles.measures!;
  assert.equal(signups!.keys.at(-1), '2026-09-17');
  assert.deepEqual(signups!.now.slice(-2), [12, 15], 'the day keeps its last reading');
  /* A MEASURE THAT WENT QUIET still says when it last spoke, though nothing of it is in the window. */
  assert.equal(revenue!.unit, 'GBP');
  assert.deepEqual(revenue!.latest, { value: 90, at: '2026-05-01T08:00:00.000Z', day: '2026-05-01' });
  assert.ok(revenue!.now.every((v) => v === null));

  const lines = k.block({ kind: 'lines', source: 'register.points', columns: [{ field: 'at' }, { field: 'value' }], heading: 'All', where: 'name is Sign-ups' }) as Drawn;
  assert.equal(lines.measures?.[0]?.name, 'All');
  assert.equal(lines.measures?.[0]?.keys.length, 30);

  const wrong = k.block({ kind: 'lines', source: 'register.points', columns: [{ field: 'at' }, { field: 'nope' }] }) as Drawn;
  assert.equal(wrong.refusals[0]?.code, 'FIELD_UNKNOWN');
  const bucket = k.block({ kind: 'lines', source: 'register.points', columns: COLUMNS, bucket: 'fortnight' }) as Drawn;
  assert.equal(bucket.refusals[0]?.code, 'DECLARATION_INVALID');

  const figures = k.block({ kind: 'stat', cells: [{ metric: 'points-count' }] }) as { readings?: { reading: { value: number } | null }[] };
  assert.equal(figures.readings?.[0]?.reading?.value, 5);
  const bare = k.block({ kind: 'stat' }) as { readings?: unknown[] };
  assert.deepEqual(bare.readings, []);
});

test('A DAY IS THE RECORD’S LOCAL DAY: a reading at 23:30 in Auckland is that evening, not the UTC morning', () => {
  /* 11:30Z on the 16th is 23:30 on the 16th in Auckland (UTC+12); 12:30Z is 00:30 on the 17th there. In UTC both are the 16th. */
  const readings = [
    { at: '2026-09-16T11:30:00.000Z', value: 1, name: 'A' },
    { at: '2026-09-16T12:30:00.000Z', value: 2, name: 'A' },
  ];
  const utc = measureSeries(readings, { nowMs: NOW, back: 7, tz: 'UTC', fallback: '' })[0]!;
  assert.deepEqual(utc.now.slice(-2), [2, null]);
  const nz = measureSeries(readings, { nowMs: NOW, back: 7, tz: 'Pacific/Auckland', fallback: '' })[0]!;
  assert.equal(nz.keys.at(-1), '2026-09-18', 'noon UTC on the 17th is already the 18th in Auckland');
  assert.deepEqual(nz.now.slice(-3), [1, 2, null]);
  assert.equal(nz.latest?.day, '2026-09-17');
  /* A ZONE THIS RUNTIME CANNOT READ IS UTC, not a throw. */
  assert.deepEqual(measureSeries(readings, { nowMs: NOW, back: 7, tz: 'Mars/Olympus', fallback: '' })[0]!.now, utc.now);
});

test('a week bucket keys each week by its Monday, and the window reaches back a day for any zone', () => {
  const w = measureWindow(NOW, 28, 'week', 'UTC');
  assert.deepEqual(w.keys, ['2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14']);
  assert.equal(w.before[0], '2026-07-27');
  assert.equal(w.since, '2026-07-26');
  const [m] = measureSeries(
    [
      { at: '2026-09-14T09:00:00.000Z', value: 5 },
      { at: '2026-09-16T09:00:00.000Z', value: 7 },
    ],
    { nowMs: NOW, back: 28, bucket: 'week', fallback: 'Users' },
  );
  assert.deepEqual(m!.now, [null, null, null, 7]);
});

test('TWENTY THOUSAND READINGS, a year of polls, are answered as a few hundred numbers and quickly', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  value(await k.install([POINTS]));
  const names = ['Sign-ups', 'Revenue', 'Users', 'Installs'];
  k.transaction(() => {
    for (let i = 0; i < 20_000; i++)
      value(k.create('points', { name: names[i % 4]!, value: i, at: new Date(NOW - Math.floor(i / 4) * Math.floor((365 * DAY) / 5_000)).toISOString() }, { ...OWNER, cascade: false }));
  });
  for (const [kind, back, bucket] of [['lines', 30, 'day'], ['stat', 30, 'day'], ['lines', 366, 'week']] as const) {
    const started = performance.now();
    const drawn = k.block({ kind, source: 'register.points', columns: COLUMNS, back, bucket }) as Drawn;
    const ms = performance.now() - started;
    assert.deepEqual(drawn.refusals, []);
    assert.equal(drawn.measures?.length, 4);
    const numbers = drawn.measures!.reduce((n, m) => n + m.now.length + m.was.length, 0);
    assert.ok(numbers <= 4 * 2 * 53, `${numbers} numbers`);
    assert.ok(JSON.stringify(drawn).length < 30_000, 'the answer is small');
    assert.ok(ms < 1_500, `${kind} over ${back} days took ${Math.round(ms)}ms`);
    assert.equal(drawn.measures![0]!.name, 'Installs', 'four measures read at one moment, by name');
  }
});
