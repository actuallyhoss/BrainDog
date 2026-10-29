/**
 * `restates:` on a list of prices: the night's net worth said again over the newest price in use, into the night field
 * the list names, and the kernel naming no list, field or unit of its own (`packages/kernel/src/restates.ts`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import type { Sql } from '@braindog/ports';

import { restatedWorth, restatesFault } from '../src/restates.ts';

/** A table with the columns the reader asks, and nothing else of the record. */
function entries(rows: { register: string; seq: number; fields: Record<string, unknown>; deleted?: boolean }[]): Sql {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE entry (register TEXT, seq INTEGER, fields TEXT, deleted_at TEXT)');
  const put = db.prepare('INSERT INTO entry VALUES (?, ?, ?, ?)');
  for (const r of rows) put.run(r.register, r.seq, JSON.stringify(r.fields), r.deleted ? '2026-01-01' : null);
  return { one: (text: string, ...params: unknown[]) => db.prepare(text).get(...(params as never[])) } as unknown as Sql;
}

const FIELDS = [
  { id: 'grade', type: 'enum' },
  { id: 'per_unit', type: 'money' },
  { id: 'on', type: 'day' },
  { id: 'live', type: 'bool' },
];
const SAID = { night: 'worth_units', unit: 'per_unit', day: 'on', match: { grade: 'pure', live: true } };
const NIGHT = new Map([['worth_units', 'decimal']]);
const same = (amount: number, from: string, to: string): number | null => (from === to ? amount : null);

test('A LIST OF PRICES RESTATES THE NIGHT by its newest price in use, into the field it names', () => {
  const sql = entries([
    { register: 'prices', seq: 1, fields: { grade: 'pure', per_unit: { amount: 5_000, currency: 'GBP' }, on: '2026-10-01', live: true } },
    { register: 'prices', seq: 2, fields: { grade: 'pure', per_unit: { amount: 8_000, currency: 'GBP' }, on: '2026-10-20', live: true } },
    { register: 'prices', seq: 3, fields: { grade: 'pure', per_unit: { amount: 1_000, currency: 'GBP' }, on: '2026-10-25', live: false } },
    { register: 'prices', seq: 4, fields: { grade: 'mixed', per_unit: { amount: 2_000, currency: 'GBP' }, on: '2026-10-28', live: true } },
    { register: 'prices', seq: 5, fields: { grade: 'pure', per_unit: { amount: 100, currency: 'GBP' }, on: '2026-10-29', live: true }, deleted: true },
  ]);
  const out = restatedWorth(sql, [{ id: 'prices', body: { restates: SAID } }], NIGHT, 100_000, 'GBP', same);
  assert.deepEqual(out, { worth_units: 12.5 });
});

test('NOTHING IS WRITTEN where the night does not declare the field, no price reads, or none converts', () => {
  const sql = entries([{ register: 'prices', seq: 1, fields: { grade: 'pure', per_unit: { amount: 5_000, currency: 'USD' }, on: '2026-10-01', live: true } }]);
  const lists = [{ id: 'prices', body: { restates: SAID } }];
  assert.deepEqual(restatedWorth(sql, lists, new Map(), 100_000, 'USD', same), {});
  assert.deepEqual(restatedWorth(sql, lists, new Map([['worth_units', 'money']]), 100_000, 'USD', same), {});
  assert.deepEqual(restatedWorth(sql, lists, NIGHT, 100_000, 'GBP', same), {});
  assert.deepEqual(restatedWorth(sql, [{ id: 'prices', body: {} }], NIGHT, 100_000, 'USD', same), {});
  assert.deepEqual(restatedWorth(entries([]), lists, NIGHT, 100_000, 'USD', same), {});
});

test('A DECLARED RESTATES NAMES THIS LIST\'S MONEY AND DAY FIELDS, and what it matches on', () => {
  assert.equal(restatesFault('register.prices', FIELDS, SAID), null);
  assert.equal(restatesFault('register.prices', FIELDS, { night: 'worth_units', unit: 'per_unit', day: 'on' }), null);
  assert.equal(restatesFault('register.prices', FIELDS, { ...SAID, unit: 'grade' })?.at, 'restates.unit');
  assert.equal(restatesFault('register.prices', FIELDS, { ...SAID, day: 'per_unit' })?.at, 'restates.day');
  assert.equal(restatesFault('register.prices', FIELDS, { ...SAID, night: 'Worth Units' })?.at, 'restates.night');
  assert.equal(restatesFault('register.prices', FIELDS, { ...SAID, match: { karat: 'pure' } })?.at, 'restates.match.karat');
  assert.equal(restatesFault('register.prices', FIELDS, { ...SAID, match: { grade: ['pure'] } })?.at, 'restates.match.grade');
  assert.equal(restatesFault('register.prices', FIELDS, { ...SAID, by: 'x' })?.at, 'restates');
  assert.equal(restatesFault('register.prices', FIELDS, 'per_unit')?.code, 'DECLARATION_INVALID');
});
