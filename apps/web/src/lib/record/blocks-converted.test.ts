/**
 * A BAR WHOSE MONEY WAS CONVERTED SAYS WHAT IT WAS KEPT IN, on the bar itself.
 *
 * An account kept in dollars on a record whose home is pounds (or Egyptian pounds) drew in the home currency with no
 * word on its row: the amount was replaced by the converted one and the currency it was in was gone before the row was
 * written. The one line under the chart says the day's rates and not which bars they touched. So the row's note cell,
 * its third, now says `converted from USD`, and a bar that was in the home currency all along says nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Block } from 'braindog-render';

import './fixtures/fill.ts';
import { REGISTERS } from './api.ts';
import { toSegments } from './blocks.ts';
import { blockOf } from './page-live.ts';
import type { RegisterDecl } from './schema.ts';

const NOW = Date.UTC(2026, 8, 17, 12);
const DAY = new Date(Date.UTC(2026, 8, 1, 9)).toISOString();

const HOLDINGS = {
  id: 'holdings',
  name: 'Holdings',
  one: 'holding',
  title: 'name',
  fields: [
    { id: 'name', type: 'text' },
    { id: 'balance', type: 'money' },
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

const answered = (kind: string, source: string, columns: string[], rows: { id: string; fields: Record<string, unknown> }[]) => ({
  kind,
  source,
  columns: columns.map((field) => ({ field })),
  rows: rows.map((r, i) => ({ id: r.id, seq: i + 1, fields: r.fields, version: 1, created_at: DAY })),
  matched: rows.length,
  refusals: [],
});

const egp = [{ currency: 'USD', base: 'EGP', rate: 50, as_of: '2026-09-01' }];
const twoInto = [...egp, { currency: 'EUR', base: 'EGP', rate: 55, as_of: '2026-09-01' }];

/** Each drawn row as `label | figure | note`, with the figure's narrow spaces made plain. */
const rowsOf = (segments: ReturnType<typeof toSegments>): string[][] =>
  segments.filter((s): s is Block => s.type === 'block').flatMap((b) => b.rows.map((r) => r.cells.slice(0, 3).map((c) => (c ?? '').replace(/\s/gu, ' '))));

const holdings = (kind: string, rows: { id: string; fields: Record<string, unknown> }[]) => {
  REGISTERS.holdings = HOLDINGS;
  return blockOf(answered(kind, 'register.holdings', ['name', 'balance'], rows) as never, new Map(), NOW);
};

test('a dollar amount on a record kept in Egyptian pounds draws a bar whose note says converted from USD, and a home amount says nothing', () => {
  const read = holdings('bar', [
    { id: 'h1', fields: { name: 'Personal', balance: { amount: 70_231_800, currency: 'EGP' } } },
    { id: 'h2', fields: { name: 'Harbour', balance: { amount: 294_795, currency: 'USD' } } },
  ]);
  const rows = rowsOf(toSegments({ ...read, fx: { home: 'EGP', rates: egp } }));
  assert.deepEqual(rows, [
    ['Personal', 'EGP 702,318.00', ''],
    ['Harbour', 'EGP 147,397.50', 'converted from USD'],
  ]);
});

test('a split says it too, on the part that was converted', () => {
  const read = holdings('split', [
    { id: 'h1', fields: { name: 'Personal', balance: { amount: 70_231_800, currency: 'EGP' } } },
    { id: 'h2', fields: { name: 'Harbour', balance: { amount: 294_795, currency: 'USD' } } },
  ]);
  const notes = Object.fromEntries(rowsOf(toSegments({ ...read, fx: { home: 'EGP', rates: egp } })).map((r) => [r[0], r[2]]));
  assert.equal(notes.Harbour, 'converted from USD');
  assert.equal(notes.Personal, '');
});

test('one bar that adds up home money and two other currencies names both, once each', () => {
  const read = holdings('bar', [
    { id: 'h1', fields: { name: 'Harbour', balance: { amount: 100_000, currency: 'USD' } } },
    { id: 'h2', fields: { name: 'Harbour', balance: { amount: 200_000, currency: 'USD' } } },
    { id: 'h3', fields: { name: 'Harbour', balance: { amount: 100_000, currency: 'EUR' } } },
    { id: 'h4', fields: { name: 'Harbour', balance: { amount: 500_000, currency: 'EGP' } } },
  ]);
  const rows = rowsOf(toSegments({ ...read, fx: { home: 'EGP', rates: twoInto } }));
  assert.deepEqual(rows, [['Harbour', 'EGP 210,000.00', 'converted from EUR and USD']]);
});

test('bars cut to a limit keep the word on the bar that holds the rest', () => {
  const read = holdings('bar', [
    { id: 'h1', fields: { name: 'Personal', balance: { amount: 70_231_800, currency: 'EGP' } } },
    { id: 'h2', fields: { name: 'Savings', balance: { amount: 1_000_000, currency: 'EGP' } } },
    { id: 'h3', fields: { name: 'Harbour', balance: { amount: 1_000, currency: 'USD' } } },
  ]);
  const rows = rowsOf(toSegments({ ...read, limit: 2, fx: { home: 'EGP', rates: egp } }));
  assert.equal(rows.length, 2);
  assert.equal(rows[0]![2], '');
  assert.equal(rows[1]![2], 'converted from USD', 'the rest holds the dollars, so the rest says so');
});

test('with no home currency nothing is converted, and no bar says it was', () => {
  const read = holdings('bar', [
    { id: 'h1', fields: { name: 'Personal', balance: { amount: 70_231_800, currency: 'EGP' } } },
    { id: 'h2', fields: { name: 'Harbour', balance: { amount: 294_795, currency: 'USD' } } },
  ]);
  const rows = rowsOf(toSegments({ ...read, fx: { home: null, rates: [] } }));
  assert.deepEqual(rows.map((r) => r[2]), ['', '']);
  assert.doesNotMatch(JSON.stringify(rows), /converted/u);
});

test('a bar over a list of links says it of the linked money that was converted', () => {
  REGISTERS.organisations = ORGANISATIONS;
  const orgs = [
    { id: 'o1', fields: { name: 'Northwind Labs', accounts: ['acc1', 'acc2'] } },
    { id: 'o2', fields: { name: 'Harbour Studio', accounts: ['acc3'] } },
  ];
  const linked = {
    acc1: { amount: 2_000_000, currency: 'EGP' },
    acc2: { amount: 50_000, currency: 'USD' },
    acc3: { amount: 910_000, currency: 'EGP' },
  };
  const read = blockOf(answered('bar', 'register.organisations', ['name', 'accounts'], orgs) as never, new Map(), NOW);
  const rows = rowsOf(toSegments({ ...read, linked, fx: { home: 'EGP', rates: egp } }));
  assert.deepEqual(rows, [
    ['Northwind Labs', 'EGP 45,000.00', 'converted from USD'],
    ['Harbour Studio', 'EGP 9,100.00', ''],
  ]);
});
