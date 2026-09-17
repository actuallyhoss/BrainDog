/**
 * The numbers a project reports, drawn as tiles and lines, and an organisation's balance as the money in the accounts
 * it names.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parse, type Block } from 'braindog-render';

import { REGISTERS } from './api.ts';
import { toSegments } from './blocks.ts';
import { changeLine, figureOf, linesText, measuresOf, periodOf, tileRows } from './measures.ts';
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
  const [signups, revenue] = measuresOf(rows, FIELDS, NOW, 7, 'Numbers');
  assert.equal(signups!.name, 'Sign-ups');
  assert.deepEqual(signups!.days, ['2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17']);
  assert.deepEqual(signups!.now, [null, null, null, null, null, null, 12], 'the later reading of the 17th wins, and a gap is null');
  assert.deepEqual(signups!.was, [null, null, null, null, null, null, 9], 'the 10th is the last day of the week before, beside the 17th');
  assert.equal(revenue!.unit, 'GBP');
  assert.equal(periodOf(1), 30, 'a period of one day draws no line, so the fallback');
  assert.equal(periodOf(90), 90);
});

test('a tile says the newest figure, the change against the period before, and draws the period as its line', () => {
  const rows = [point('Revenue', 4200, day(17), 'GBP'), point('Revenue', 3900, day(10), 'GBP')];
  const [m] = measuresOf(rows, FIELDS, NOW, 7, 'Numbers');
  assert.equal(changeLine(m!), '+7.7% on the previous 7 days');
  const [row] = tileRows([m!]);
  assert.equal(row, 'Revenue | GBP 4,200.00 | +7.7% on the previous 7 days | - - - - - - 4200');
  assert.equal(figureOf(1204, 'users'), '1,204 users');
  const [alone] = measuresOf([point('Installs', 3, day(17))], FIELDS, NOW, 7, 'Numbers');
  assert.equal(changeLine(alone!), 'Nothing reported in the 7 days before');
  const [old] = measuresOf([point('Installs', 3, day(1))], FIELDS, NOW, 7, 'Numbers');
  assert.equal(changeLine(old!), 'Last reported 1 Sep');
});

test('a chart a measure, each a lines fence the renderer draws, headed by the measure', () => {
  const rows = [point('Revenue', 4200, day(17), 'GBP'), point('Revenue', 3900, day(10), 'GBP'), point('Users', 120, day(16))];
  const text = linesText(measuresOf(rows, FIELDS, NOW, 7, 'Numbers'));
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

  const lines = blockOf(answered('lines', 'register.datapoints', FIELDS, rows, { back: 7 }) as never, new Map(), NOW);
  const charts = toSegments(lines).filter((s): s is Block => s.type === 'block');
  assert.equal(charts.length, 1);
  assert.equal(charts[0]!.kind, 'lines');
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
