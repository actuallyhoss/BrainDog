/**
 * A `stat` or `lines` over a register of readings is worked out in the record: one series a measure over the period and
 * the one before, a bucket's last reading, counted in the record's local day, and a year of readings answered as a few
 * hundred numbers.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { measureSeries, measureWindow, openRecord, type Declaration, type MeasureSeries } from '../src/index.ts';
import { measureLines, type MeasureLatest } from '../src/measures.ts';
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
type Drawn = { rows: unknown[]; readings?: unknown; matched: number; measures?: MeasureSeries[]; latest?: MeasureLatest[]; refusals: { code: string }[] };

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
    /* FOUR MEASURES READ AT ONE MOMENT ARE RANKED BY HOW MUCH EACH MOVED, and Sign-ups fell the whole way to nought. */
    assert.equal(drawn.measures![0]!.name, 'Sign-ups', 'the measure that moved most leads');
    assert.deepEqual(drawn.latest ?? [], []);
  }
});

test('A LINE OF ONE POINT IS A DOT: a lines block draws the measures with two points, ranked by how much each moved, and says the rest once', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  value(await k.install([POINTS]));
  /* Users doubled, Revenue moved by a tenth, Steady did not move; Balance and Churn were read once in the period, and
     Old once, long before it. */
  for (const [name, values] of [['Revenue', [100, 110]], ['Users', [10, 20]], ['Steady', [5, 5]]] as const)
    values.forEach((v, i) => value(k.create('points', { name, value: v, at: new Date(NOW - (3 - i) * DAY).toISOString() }, OWNER)));
  value(k.create('points', { name: 'Churn', value: 3, unit: '%', at: '2026-09-15T09:00:00.000Z' }, OWNER));
  value(k.create('points', { name: 'Balance', value: 70, at: '2026-09-17T09:00:00.000Z' }, OWNER));
  value(k.create('points', { name: 'Old', value: 1, at: '2026-03-01T09:00:00.000Z' }, OWNER));

  const lines = k.block({ kind: 'lines', source: 'register.points', columns: COLUMNS, back: 30 }) as Drawn;
  assert.deepEqual(lines.refusals, []);
  assert.deepEqual(
    lines.measures!.map((m) => m.name),
    ['Users', 'Revenue', 'Steady'],
    'a line for each measure with two points, the one that moved most first',
  );
  assert.deepEqual(
    lines.latest,
    [
      { measure: 'Balance', value: 70, unit: '', at: '2026-09-17T09:00:00.000Z', day: '2026-09-17' },
      { measure: 'Churn', value: 3, unit: '%', at: '2026-09-15T09:00:00.000Z', day: '2026-09-15' },
    ],
    'one reading in the period is said once, newest first, and a measure quiet all period is neither',
  );
  assert.equal(lines.matched, 8);

  /* A TILE OF ONE READING IS STILL A FIGURE, so a stat draws every measure and has no `latest` beside them. */
  const tiles = k.block({ kind: 'stat', source: 'register.points', columns: COLUMNS, back: 30 }) as Drawn;
  assert.equal(tiles.latest, undefined);
  assert.deepEqual(
    tiles.measures!.map((m) => m.name),
    ['Users', 'Revenue', 'Steady', 'Balance', 'Churn', 'Old'],
  );

  /* `limit:` IS HOW MANY MEASURES of each, and never more than the twelve a block is handed. */
  const two = k.block({ kind: 'lines', source: 'register.points', columns: COLUMNS, back: 30, limit: 2 }) as Drawn;
  assert.deepEqual(two.measures!.map((m) => m.name), ['Users', 'Revenue']);
  assert.deepEqual(two.latest!.map((m) => m.measure), ['Balance', 'Churn']);
  const none = k.block({ kind: 'stat', source: 'register.points', columns: COLUMNS, back: 30, limit: 0 }) as Drawn;
  assert.deepEqual(none.measures, []);
});

test('A MEASURE MOVES BY A SHARE, so a doubling outranks EGP 4,000 more on EGP 400,000, and nought to nought does not move', () => {
  const at = (d: number) => new Date(NOW - d * DAY).toISOString();
  const readings = [
    { at: at(2), value: 400_000, name: 'Cash', unit: 'EGP' },
    { at: at(1), value: 404_000, name: 'Cash', unit: 'EGP' },
    { at: at(2), value: 40, name: 'Sign-ups' },
    { at: at(1), value: 80, name: 'Sign-ups' },
    { at: at(2), value: 0, name: 'Refunds' },
    { at: at(1), value: 0, name: 'Refunds' },
    { at: at(2), value: 0, name: 'Trials' },
    { at: at(1), value: 3, name: 'Trials' },
    { at: at(1), value: 9, name: 'Once' },
  ];
  const { lines, latest } = measureLines(readings, { nowMs: NOW, back: 7, fallback: '' });
  /* REFUNDS HAS ONLY EVER SAID NOUGHT, so it draws no line at all (`spoke`); nought to nought ranks nothing either way. */
  assert.deepEqual(lines.map((m) => m.name), ['Trials', 'Sign-ups', 'Cash']);
  assert.deepEqual(latest.map((m) => [m.measure, m.value]), [['Once', 9]]);
  /* A STAT KEEPS THE ONE READING AS A TILE, after the measures that moved. */
  assert.deepEqual(measureSeries(readings, { nowMs: NOW, back: 7, fallback: '' }).map((m) => m.name), ['Trials', 'Sign-ups', 'Cash', 'Once']);
});

test('TWO PROJECTS’ MEASURES OF ONE NAME ARE TWO MEASURES, each named for its project, and the newest before the period is each one’s', async () => {
  /* MEASURED ON THE OWNER'S RECORD: two shops' "AOV" drawn as one line through both shops' numbers, so the importer glued
     the project onto the name to tell them apart ("Aov, Oxbow.gg"). The project is the list's pointer to the projects. */
  const PROJECTS: Declaration = {
    id: 'register.things',
    kind: 'register',
    body: { id: 'things', name: 'Projects', title: 'name', scopes: { repos: 'repos' }, fields: [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }] } as never,
  };
  const NUMBERS: Declaration = {
    id: 'register.numbers',
    kind: 'register',
    body: {
      id: 'numbers',
      name: 'Numbers',
      title: 'name',
      fields: [
        { id: 'name', type: 'text', required: true, index: true },
        { id: 'value', type: 'decimal', required: true },
        { id: 'unit', type: 'text' },
        { id: 'thing', type: 'ref', to: 'things', index: true },
        { id: 'at', type: 'instant', index: true },
      ],
    } as never,
  };
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  value(await k.install([PROJECTS, NUMBERS]));
  const oxbow = value<{ id: string }>(k.create('things', { name: 'Oxbow' }, OWNER)).id;
  const kiln = value<{ id: string }>(k.create('things', { name: 'Kiln' }, OWNER)).id;
  value(k.create('numbers', { name: 'AOV', value: 40, thing: oxbow, at: '2026-09-15T08:00:00.000Z' }, OWNER));
  value(k.create('numbers', { name: 'AOV', value: 44, thing: oxbow, at: '2026-09-17T08:00:00.000Z' }, OWNER));
  value(k.create('numbers', { name: 'AOV', value: 900, thing: kiln, at: '2026-09-16T08:00:00.000Z' }, OWNER));
  value(k.create('numbers', { name: 'AOV', value: 910, thing: kiln, at: '2026-09-17T09:00:00.000Z' }, OWNER));
  /* Before the period: one quiet reading each, and only the newest of each project's is kept. */
  value(k.create('numbers', { name: 'Stock', value: 5, thing: oxbow, at: '2026-05-01T08:00:00.000Z' }, OWNER));
  value(k.create('numbers', { name: 'Stock', value: 70, thing: kiln, at: '2026-04-01T08:00:00.000Z' }, OWNER));
  value(k.create('numbers', { name: 'Stock', value: 1, at: '2026-03-01T08:00:00.000Z' }, OWNER));

  const tiles = k.block({ kind: 'stat', source: 'register.numbers', columns: COLUMNS, back: 7 }) as Drawn;
  assert.deepEqual(tiles.refusals, []);
  const said = tiles.measures!.map((m) => [m.name, m.of ?? null, m.latest?.value ?? null]);
  assert.deepEqual(
    said.filter(([name]) => name === 'AOV').sort(),
    [['AOV', 'Kiln', 910], ['AOV', 'Oxbow', 44]],
    'two projects’ measures were one line',
  );
  assert.deepEqual(said.filter(([name]) => name === 'Stock').sort(), [['Stock', null, 1], ['Stock', 'Kiln', 70], ['Stock', 'Oxbow', 5]]);
  const kilnAov = tiles.measures!.find((m) => m.name === 'AOV' && m.of === 'Kiln')!;
  assert.deepEqual(kilnAov.now.slice(-2), [900, 910], 'the other project’s readings were drawn on this one’s line');
  /* NAMES, NEVER IDS: the project is said by its title. */
  assert.doesNotMatch(JSON.stringify(tiles.measures), new RegExp(`${oxbow}|${kiln}`));

  /* A `lines` block keeps the one-reading measures beside it, each with its project. */
  value(k.create('numbers', { name: 'Orders', value: 3, thing: oxbow, at: '2026-09-16T08:00:00.000Z' }, OWNER));
  value(k.create('numbers', { name: 'Orders', value: 8, thing: kiln, at: '2026-09-17T08:00:00.000Z' }, OWNER));
  const lines = k.block({ kind: 'lines', source: 'register.numbers', columns: COLUMNS, back: 7, where: 'name is Orders' }) as Drawn;
  assert.deepEqual(lines.refusals, []);
  assert.deepEqual(lines.measures, []);
  assert.deepEqual(lines.latest?.map((m) => [m.measure, m.of ?? null, m.value]), [['Orders', 'Kiln', 8], ['Orders', 'Oxbow', 3]]);

  /* A LIST THAT NAMES NO PROJECT is grouped by name alone, as it was. */
  const plain = measureSeries(
    [
      { at: '2026-09-16T08:00:00.000Z', value: 1, name: 'AOV' },
      { at: '2026-09-17T08:00:00.000Z', value: 2, name: 'AOV' },
    ],
    { nowMs: NOW, back: 7, fallback: '' },
  );
  assert.deepEqual(plain.map((m) => [m.name, m.of]), [['AOV', undefined]]);
});

test('TWO UNTITLED PROJECTS’ MEASURES OF ONE NAME ARE STILL TWO MEASURES, kept apart by the project and named by neither', () => {
  /* A project with no title has no name to draw, so `of` is left out, and before this the two were one line. */
  const readings = [
    { name: 'Orders', value: 3, at: '2026-09-16T08:00:00.000Z', project: 'P_ONE' },
    { name: 'Orders', value: 4, at: '2026-09-17T08:00:00.000Z', project: 'P_ONE' },
    { name: 'Orders', value: 80, at: '2026-09-16T09:00:00.000Z', project: 'P_TWO' },
    { name: 'Orders', value: 90, at: '2026-09-17T09:00:00.000Z', project: 'P_TWO' },
  ];
  const series = measureSeries(readings, { nowMs: NOW, back: 7, fallback: '' });
  assert.deepEqual(series.map((m) => [m.name, m.of ?? null, m.latest?.value]).sort(), [['Orders', null, 4], ['Orders', null, 90]]);
  assert.doesNotMatch(JSON.stringify(series), /P_ONE|P_TWO/, 'the project id was drawn');
});
