/**
 * The numbers a project reports, drawn as tiles and lines, and an organisation's balance as the money in the accounts
 * it names.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parse, type Block } from 'braindog-render';

import './fixtures/fill.ts';
import { REGISTERS } from './api.ts';
import { toSegments } from './blocks.ts';
import { allStale, changeLine, figureOf, linesText, measuresOf, periodOf, staleTilesText, tileRows } from './measures.ts';
import { blockOf } from './page-live.ts';
import type { RegisterDecl } from './schema.ts';

const NOW = Date.UTC(2026, 8, 17, 12);
const FIELDS = ['at', 'value', 'name', 'unit'];
const day = (d: number, h = 9) => new Date(Date.UTC(2026, 8, d, h)).toISOString();
const point = (name: string, value: number, at: string, unit = '') => ({ fields: { name, value, at, unit } });

test('one reading a day, the last; the period and the one before; newest measure first', () => {
  const rows = [
    point('Sign-ups', 10, day(17, 8)),
    point('Sign-ups', 12, day(17, 20)),
    point('Sign-ups', 9, day(10)),
    point('Monthly recurring revenue', 4000, day(16), 'GBP'),
    point('Monthly recurring revenue', 3600, new Date(Date.UTC(2026, 7, 17, 9)).toISOString(), 'GBP'),
  ];
  const [signups, revenue] = measuresOf(rows, FIELDS, NOW, 7, 'Numbers', { tz: 'UTC' });
  assert.equal(signups!.name, 'Sign-ups');
  assert.deepEqual(signups!.keys, ['2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17']);
  assert.deepEqual(signups!.now, [null, null, null, null, null, null, 12], 'the later reading of the 17th wins, and a gap is null');
  assert.deepEqual(signups!.was, [null, null, null, null, null, null, 9], 'the 10th is the last day of the week before, beside the 17th');
  assert.equal(revenue!.unit, 'GBP');
  assert.equal(periodOf(1), 30, 'a period of one day draws no line, so the fallback');
  assert.equal(periodOf(90), 90);
});

/* THE FIFTH COLUMN IS THE MONEY SLOT (money-readings, batch 40): the web read four columns and never passed `amount`, so a
   block worked out here ignored a reading kept as money though the kernel reads it. */
test('a reading kept as money is read from the fifth column, in major units and its own currency', () => {
  const rows = [{ fields: { name: 'Revenue', at: day(17), value: null, unit: '', amount: { amount: 412_550, currency: 'GBP' } } }];
  const [revenue] = measuresOf(rows, [...FIELDS, 'amount'], NOW, 7, 'Numbers', { tz: 'UTC' });
  assert.equal(revenue!.unit, 'GBP');
  assert.equal(revenue!.now.at(-1), 4125.5);
  assert.deepEqual(measuresOf(rows, FIELDS, NOW, 7, 'Numbers', { tz: 'UTC' }).flatMap((m) => m.now.filter((v) => v !== null)), [], 'four columns leave the money unread');
});

test('a tile says the newest figure, the change against the period before, and draws the period as its line', () => {
  const rows = [point('Revenue', 4200, day(17), 'GBP'), point('Revenue', 3900, day(10), 'GBP')];
  const [m] = measuresOf(rows, FIELDS, NOW, 7, 'Numbers', { tz: 'UTC' });
  assert.equal(changeLine(m!), '+7.7% on the previous 7 days');
  const [row] = tileRows([m!]);
  assert.equal(row, 'Revenue | GBP 4,200.00 | +7.7% on the previous 7 days | - - - - - - 4200');
  assert.equal(figureOf(1204, 'users'), '1,204 users');
  const [alone] = measuresOf([point('Installs', 3, day(17))], FIELDS, NOW, 7, 'Numbers', { tz: 'UTC' });
  assert.equal(changeLine(alone!), 'Nothing reported in the 7 days before');
  const [old] = measuresOf([point('Installs', 3, day(1))], FIELDS, NOW, 7, 'Numbers', { tz: 'UTC' });
  assert.equal(changeLine(old!), 'Last reported 1 Sep');
});

test('a chart a measure, each a lines fence the renderer draws, headed by the measure', () => {
  const rows = [point('Revenue', 4200, day(17), 'GBP'), point('Revenue', 3900, day(10), 'GBP'), point('Users', 120, day(16))];
  const text = linesText(measuresOf(rows, FIELDS, NOW, 7, 'Numbers', { tz: 'UTC' }));
  const drawn = parse(text, { page: true }).filter((s): s is Block => s.type === 'block');
  assert.deepEqual(drawn.map((b) => [b.kind, b.heading]), [['lines', 'Revenue'], ['lines', 'Users']]);
  assert.equal(drawn[0]!.rows[0]!.cells.join(' | '), 'Day | Revenue | was: Previous 7 days');
  assert.equal(drawn[0]!.rows[7]!.cells.join(' | '), '17 Sep | GBP 4,200.00 | GBP 3,900.00');
});

const DATAPOINTS = {
  id: 'datapoints',
  name: 'Datapoints',
  one: 'datapoint',
  title: 'name',
  fields: [
    { id: 'name', type: 'text' },
    { id: 'value', type: 'decimal' },
    { id: 'unit', type: 'text' },
    { id: 'at', type: 'instant' },
  ],
} as unknown as RegisterDecl;

const ORGANISATIONS = {
  id: 'organisations',
  name: 'Organisations',
  one: 'organisation',
  title: 'name',
  fields: [
    { id: 'name', type: 'text' },
    { id: 'accounts', type: 'list', of: 'ref', to: 'accounts' },
  ],
} as unknown as RegisterDecl;

const answered = (kind: string, source: string, columns: string[], rows: { id: string; fields: Record<string, unknown> }[], extra: Record<string, unknown> = {}) => ({
  kind,
  source,
  columns: columns.map((field) => ({ field })),
  rows: rows.map((r, i) => ({ id: r.id, seq: i + 1, fields: r.fields, version: 1, created_at: day(1) })),
  matched: rows.length,
  refusals: [],
  ...extra,
});

test('a live stat and a live lines block over a register draw tiles and charts, not figures', () => {
  REGISTERS.datapoints = DATAPOINTS;
  const rows = [
    { id: 'a', fields: { name: 'Revenue', value: 4200, unit: 'GBP', at: day(17) } },
    { id: 'b', fields: { name: 'Revenue', value: 3900, unit: 'GBP', at: day(10) } },
  ];
  const stat = blockOf(answered('stat', 'register.datapoints', FIELDS, rows, { back: 7 }) as never, new Map(), NOW);
  assert.equal(stat.metrics, undefined);
  const [tiles] = toSegments(stat).filter((s): s is Block => s.type === 'block');
  assert.equal(tiles!.kind, 'stat');
  assert.equal(tiles!.rows[0]!.cells[0], 'Revenue');
  assert.equal(tiles!.rows[0]!.ref, undefined, 'a tile is a measure, not one row to open');

  /* A LINE IS TWO POINTS IN THE PERIOD, as the record counts them (`measureLines`): one on the 17th and one before the
     period is a reading said once, in a list and not as a chart. */
  const once = blockOf(answered('lines', 'register.datapoints', FIELDS, rows, { back: 7 }) as never, new Map(), NOW);
  const [said] = toSegments(once).filter((s): s is Block => s.type === 'block');
  assert.equal(said!.kind, 'spec');
  assert.deepEqual(said!.rows.map((r) => r.cells.join(' | ')), ['Revenue | GBP 4,200.00 | 17 Sep']);
  assert.equal(said!.heading, undefined, 'a list with no lines over it needs no heading of its own');

  const lines = blockOf(answered('lines', 'register.datapoints', FIELDS, [...rows, { id: 'c', fields: { name: 'Revenue', value: 4100, unit: 'GBP', at: day(15) } }], { back: 7 }) as never, new Map(), NOW);
  const charts = toSegments(lines).filter((s): s is Block => s.type === 'block');
  assert.equal(charts.length, 1);
  assert.equal(charts[0]!.kind, 'lines');
});

test('A RECORD THAT SENDS THE MEASURES READ ONCE BESIDE ITS LINES DRAWS THEM AS ONE LIST, under the lines and named', () => {
  REGISTERS.datapoints = DATAPOINTS;
  const keys = ['2026-08-31', '2026-09-07', '2026-09-14'];
  const series = { name: 'Users', unit: '', bucket: 'week', keys, now: [100, null, 140], was: [80, 90, 95], latest: { value: 140, at: day(16), day: '2026-09-16' } };
  const latest = [
    { measure: 'Aov, Oxbow.gg', value: 24.1, unit: 'GBP', at: day(16), day: '2026-09-16' },
    { measure: 'Accounts, Pinwheel', value: 4, unit: '', at: day(15), day: '2026-09-15' },
    { measure: 'broken', value: 'four' },
  ];
  const block = blockOf(answered('lines', 'register.datapoints', FIELDS, [], { measures: [series], latest }) as never, new Map(), NOW);
  assert.equal(block.readOnce?.length, 2, 'a reading in a shape this cannot read is left off');
  assert.equal(block.total, 3);
  const drawn = toSegments(block).filter((s): s is Block => s.type === 'block');
  assert.deepEqual(drawn.map((b) => [b.kind, b.heading]), [['lines', 'Users'], ['spec', 'Reported once']]);
  assert.deepEqual(drawn[1]!.rows.map((r) => r.cells.join(' | ')), ['Aov, Oxbow.gg | GBP 24.10 | 16 Sep', 'Accounts, Pinwheel | 4 | 15 Sep']);

  /* AND A STAT TAKES NONE: its tiles are each a measure's newest reading already. */
  const stat = blockOf(answered('stat', 'register.datapoints', FIELDS, [], { measures: [series], latest }) as never, new Map(), NOW);
  assert.equal(stat.readOnce, undefined);
});

test('a live block the record answered with series draws them, and never its own copy of the rows', () => {
  REGISTERS.datapoints = DATAPOINTS;
  const keys = ['2026-08-31', '2026-09-07', '2026-09-14'];
  const series = { name: 'Users', unit: '', bucket: 'week', keys, now: [100, null, 140], was: [80, 90, 95], latest: { value: 140, at: day(16), day: '2026-09-16' } };
  const lines = blockOf(answered('lines', 'register.datapoints', FIELDS, [], { measures: [series, { name: 'broken' }] }) as never, new Map(), NOW);
  assert.equal(lines.measures?.length, 1, 'a series in a shape this cannot read is left off');
  assert.equal(lines.total, lines.shown, "every measure is drawn, so no \"showing some of\" line");
  const [chart] = toSegments(lines).filter((s): s is Block => s.type === 'block');
  assert.equal(chart!.heading, 'Users');
  assert.equal(chart!.rows[0]!.cells.join(' | '), 'Week | Users | was: Previous 3 weeks');
  assert.equal(chart!.rows[3]!.cells.join(' | '), '14 Sep | 140 | 95');
  const stat = blockOf(answered('stat', 'register.datapoints', FIELDS, [], { measures: [series] }) as never, new Map(), NOW);
  const [tiles] = toSegments(stat).filter((s): s is Block => s.type === 'block');
  assert.equal(tiles!.rows[0]!.cells.slice(0, 3).join(' | '), 'Users | 140 | +47.4% on the previous 3 weeks');
});

test('a bar over a list of links adds up the money in the rows each row names', () => {
  REGISTERS.organisations = ORGANISATIONS;
  const orgs = [
    { id: 'o1', fields: { name: 'Northwind Labs', accounts: ['acc1', 'acc2'] } },
    { id: 'o2', fields: { name: 'Harbour Studio', accounts: ['acc3'] } },
    { id: 'o3', fields: { name: 'Nothing linked' } },
  ];
  const block = {
    ...blockOf(answered('bar', 'register.organisations', ['name', 'accounts'], orgs) as never, new Map(), NOW),
    linked: {
      acc1: { amount: 2_000_000, currency: 'GBP' },
      acc2: { amount: 480_000, currency: 'GBP' },
      acc3: { amount: 910_000, currency: 'GBP' },
    },
  };
  const [bar] = toSegments(block).filter((s): s is Block => s.type === 'block');
  assert.deepEqual(
    bar!.rows.map((r) => r.cells.slice(0, 2)),
    [
      ['Northwind Labs', 'GBP 24,800.00'],
      ['Harbour Studio', 'GBP 9,100.00'],
    ],
    'an organisation that names no account has no bar, rather than a zero',
  );
});

test('a bar over a list of links in two currencies is one bar chart a currency, or converted into the home currency', () => {
  REGISTERS.organisations = ORGANISATIONS;
  const orgs = [
    { id: 'o1', fields: { name: 'Northwind Labs', accounts: ['acc1', 'acc2'] } },
    { id: 'o2', fields: { name: 'Harbour Studio', accounts: ['acc3'] } },
  ];
  const linked = {
    acc1: { amount: 2_000_000, currency: 'GBP' },
    acc2: { amount: 50_000, currency: 'USD' },
    acc3: { amount: 910_000, currency: 'GBP' },
  };
  const read = blockOf(answered('bar', 'register.organisations', ['name', 'accounts'], orgs) as never, new Map(), NOW);
  const cells = (segments: ReturnType<typeof toSegments>) =>
    segments.filter((s): s is Block => s.type === 'block').map((b) => b.rows.map((r) => r.cells.slice(0, 2).join(' | ').replace(/\s/gu, ' ')));
  const apart = toSegments({ ...read, linked, fx: { home: null, rates: [] } });
  assert.deepEqual(cells(apart), [['Northwind Labs | GBP 20,000.00', 'Harbour Studio | GBP 9,100.00'], ['Northwind Labs | USD 500.00']], 'never pounds and dollars added as they are');
  assert.match(JSON.stringify(apart), /In GBP/u);
  const rates = [{ currency: 'USD', base: 'GBP', rate: 0.8, as_of: '2026-09-01' }];
  const one = toSegments({ ...read, linked, fx: { home: 'GBP', rates } });
  assert.deepEqual(cells(one), [['Northwind Labs | GBP 20,400.00', 'Harbour Studio | GBP 9,100.00']], 'the dollars converted at the latest rate');
  assert.match(JSON.stringify(one), /1 Sep 2026/u);
});

test('NUMBERS THAT STOPPED A WEEK AGO OR MORE ARE TILES THAT SAY THEIR AGE, never a month of chart drawn as this one', () => {
  const rows = [point('Players', 40, day(2)), point('Players', 52, day(3)), point('Servers', 7, day(2)), point('Servers', 9, day(3))];
  const late = Date.UTC(2026, 8, 28, 12);
  const old = measuresOf(rows, FIELDS, late, 30, 'Numbers', { tz: 'UTC' });
  assert.ok(allStale(old, late), 'both stopped 25 days ago');
  assert.ok(!allStale(measuresOf(rows, FIELDS, Date.UTC(2026, 8, 4, 12), 30, 'Numbers', { tz: 'UTC' }), Date.UTC(2026, 8, 4, 12)), 'a reading from yesterday is not stale');
  const text = staleTilesText(old, () => '25 days ago');
  const tiles = parse(text, { page: true }).filter((s): s is Block => s.type === 'block');
  assert.deepEqual(tiles.map((b) => b.kind), ['stat']);
  assert.deepEqual(
    tiles[0]!.rows.map((r) => r.cells.slice(0, 3).join(' | ')),
    ['Players | 52 | 25 days ago', 'Servers | 9 | 25 days ago'],
  );
  const many = measuresOf(
    /* From one up: a measure that has only ever said nought is left off (daad6def5). */
    Array.from({ length: 8 }, (_, i) => point(`Measure ${i + 1}`, i + 1, day(3))),
    FIELDS,
    late,
    30,
    'Numbers',
  );
  assert.deepEqual(parse(staleTilesText(many, () => 'ago'), { page: true }).filter((s): s is Block => s.type === 'block').map((b) => b.rows.length), [6, 2], 'six tiles a fence');
});

test('A GROUPED BLOCK OF STALE TILES HEADS EVERY GROUP WITH ITS PROJECT, the first one too', () => {
  const late = Date.UTC(2026, 8, 28, 12);
  const grouped = (name: string, group: string | undefined) => ({
    ...measuresOf([point(name, 3, day(2)), point(name, 4, day(3))], FIELDS, late, 30, 'Numbers', { tz: 'UTC' })[0]!,
    ...(group ? { group } : {}),
  });
  const tiles = [grouped('Players', 'Kiln'), grouped('Servers', 'Kiln'), grouped('Orders', 'Marlow'), grouped('Loose', undefined)];
  const drawn = parse(staleTilesText(tiles, () => 'ago'), { page: true }).filter((s): s is Block => s.type === 'block');
  assert.deepEqual(drawn.map((b) => [b.kind, b.heading]), [['stat', 'Kiln'], ['stat', 'Marlow'], ['stat', 'Everything else']]);
  assert.deepEqual(drawn[0]!.rows.map((r) => r.cells[0]), ['Players', 'Servers']);
  const one = parse(staleTilesText([grouped('Players', 'Kiln')], () => 'ago'), { page: true }).filter((s): s is Block => s.type === 'block');
  assert.equal(one[0]!.heading, undefined, "one group is the page's own and is not headed by the name over it");
});
