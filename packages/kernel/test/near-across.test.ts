/**
 * `existingRow` under a near key, for one payment seen by two roads: an alert that reads the bank's reference and a line
 * written without one (a statement, or the alert itself before its add-on read references).
 *
 * THE LIVE CHECK OF 30 OCTOBER, 11: the HSBC Ledger held four payments twice, the second copy of each written by the
 * alert door beside a row that held no reference. These hold what the record now does: a row that never held the
 * reference is a candidate, a few days apart; a money field it never held is unknown, not different; and such a row is
 * one arrival's other sighting only while no other row has claimed it, so two real payments stay two.
 *
 * `duplicate` IS A SMALL STAND-IN FOR `@braindog/extract`'s `nearMatch`, which this package cannot import: the amount
 * held by both and equal, a field held by both equal, a field held by neither no match, and a day apart, or three when
 * one side never held a field.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { existingRow, type Dedupe } from '../src/ingest.ts';
import { openSqlite } from './sqlite.ts';

/* The two keys HSBC's add-on declares: an InstaPay text by its reference, a card text by what is available after it. */
const BY_REF: Dedupe = { near: { on: ['amount', 'account', 'ref'], day: 'on', prefix: { field: 'what', chars: 12 } } };
const BY_AVAILABLE: Dedupe = { near: { on: ['amount', 'account', 'available'], day: 'on', prefix: { field: 'what', chars: 12 } } };

const TYPES: Record<string, { type: string }> = {
  amount: { type: 'money' },
  available: { type: 'money' },
  account: { type: 'ref' },
  ref: { type: 'text' },
  on: { type: 'day' },
  what: { type: 'text' },
};

type F = Record<string, unknown>;

const held = (x: F, f: string): boolean => x[f] !== undefined && x[f] !== null;
const days = (a: F, b: F): number => Math.abs(Date.parse(`${String(a.on)}T00:00:00Z`) - Date.parse(`${String(b.on)}T00:00:00Z`)) / 86_400_000;

function duplicate(a: F, b: F, key: Dedupe): boolean {
  let across = false;
  for (const f of (key as { near: { on: string[] } }).near.on) {
    if (held(a, f) !== held(b, f)) {
      if (f === 'amount') return false;
      across = true;
      continue;
    }
    if (!held(a, f)) return false;
    if (JSON.stringify(a[f]) !== JSON.stringify(b[f])) return false;
  }
  return days(a, b) <= (across ? 3 : 1) && String(a.what).toLowerCase().slice(0, 12) === String(b.what).toLowerCase().slice(0, 12);
}

function ledger(rows: [string, F, string?][], key: Dedupe = BY_REF) {
  const sql = openSqlite();
  sql.exec('CREATE TABLE entry (id TEXT PRIMARY KEY, register TEXT NOT NULL, seq INTEGER, fields TEXT NOT NULL, deleted_at TEXT)');
  rows.forEach(([id, fields, archived], i) =>
    sql.exec('INSERT INTO entry (id, register, seq, fields, deleted_at) VALUES (?, ?, ?, ?, ?)', id, 'transactions', i + 1, JSON.stringify(fields), archived ?? null),
  );
  const deps = { sql, schemaOf: () => ({ fields: TYPES }), duplicate } as never;
  return (extracted: F) => existingRow(deps, 'transactions', key, extracted)?.id;
}

const egp = (amount: number) => ({ amount, currency: 'EGP' });
const WOPLEK: F = { what: 'WOPLEK OFFICE FURNITURE', amount: egp(3_462_000), account: 'hsbc', on: '2026-10-17' };

test('a row that never held the reference is the same payment, up to three days apart', () => {
  const find = ledger([['old', WOPLEK]]);
  assert.equal(find({ ...WOPLEK, ref: '40175f9b' }), 'old');
  assert.equal(find({ ...WOPLEK, ref: '40175f9b', on: '2026-10-20' }), 'old', 'posted three days later');
  assert.equal(find({ ...WOPLEK, ref: '40175f9b', on: '2026-10-21' }), undefined, 'four days is another payment');
});

test('a money field one side never held is unknown, not different', () => {
  /* A card alert reads what is available after it; a statement line never says. */
  const find = ledger([['line', { what: 'TALABAT', amount: egp(86_278), account: 'card', on: '2026-10-28' }]], BY_AVAILABLE);
  assert.equal(find({ what: 'TALABAT', amount: egp(86_278), account: 'card', on: '2026-10-30', available: egp(7_925_321) }), 'line');
  assert.equal(find({ what: 'TALABAT', amount: egp(86_279), account: 'card', on: '2026-10-30', available: egp(7_925_321) }), undefined, 'another amount');
});

test('two rows that hold the same fields keep the one day', () => {
  const find = ledger([['a1', { ...WOPLEK, ref: 'aaaa' }]]);
  assert.equal(find({ ...WOPLEK, ref: 'aaaa', on: '2026-10-18' }), 'a1');
  assert.equal(find({ ...WOPLEK, ref: 'aaaa', on: '2026-10-19' }), undefined);
});

test('a row matched by the same fields is taken before one matched across two roads', () => {
  const find = ledger([
    ['line', WOPLEK],
    ['alert', { ...WOPLEK, ref: 'aaaa' }],
  ]);
  assert.equal(find({ ...WOPLEK, ref: 'aaaa' }), 'alert');
});

test('one to one: a line another alert already met is not this alert, so two real payments stay two', () => {
  /* The statement line for the first payment and that payment's alert are both here; a second payment of the same
     amount to the same shop the next day arrives with its own reference. It is written, not dropped. */
  const find = ledger([
    ['line', WOPLEK],
    ['first', { ...WOPLEK, ref: 'aaaa' }],
  ]);
  assert.equal(find({ ...WOPLEK, ref: 'bbbb', on: '2026-10-18' }), undefined);
});

test('one to one: two lines and one alert, the alert takes the nearer line and leaves the other', () => {
  const find = ledger([
    ['far', { ...WOPLEK, on: '2026-10-15' }],
    ['near', { ...WOPLEK, on: '2026-10-17' }],
  ]);
  assert.equal(find({ ...WOPLEK, ref: 'aaaa', on: '2026-10-17' }), 'near');
});

test('an archived row is never a candidate, nor does it claim a line', () => {
  assert.equal(ledger([['old', WOPLEK, '2026-10-29T10:00:00Z']])({ ...WOPLEK, ref: '40175f9b' }), undefined);
  const find = ledger([
    ['line', WOPLEK],
    ['gone', { ...WOPLEK, ref: 'aaaa' }, '2026-10-29T10:00:00Z'],
  ]);
  assert.equal(find({ ...WOPLEK, ref: 'bbbb' }), 'line');
});
