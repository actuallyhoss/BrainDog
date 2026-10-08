/**
 * THE THREE WORDS MONEY'S SIGNS WAITED ON (batch 38's money-signs B1 to B3): `age` of the newest day, how many
 * `currencies` a money field is kept in, and how many rows leave a field `empty`. Each reads nothing it cannot read:
 * no row is no age, and install refuses an age off a non-day and currencies off a non-money field.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type MetricDecl, type Reading } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);

const BOOK: Declaration = {
  id: 'register.book',
  kind: 'register',
  body: {
    id: 'book',
    name: 'Book',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'on', type: 'day', index: true },
      { id: 'balance', type: 'money' },
      { id: 'category', type: 'text' },
    ],
  } as never,
};

const fig = (metric: string, value: unknown, format = 'int'): MetricDecl =>
  ({ metric, name: metric, source: 'register.book', value, format, target: { gte: 0 }, window: '30d', compare: 'none' }) as MetricDecl;

const reading = (r: unknown): Reading => {
  const x = r as { ok: boolean; value: Reading; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

test('AGE, CURRENCIES AND EMPTY read the book as a person would say it', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  assert.ok((await k.install([BOOK])).ok);
  const age = fig('newest-days', { age: 'on' }, 'days');
  assert.equal(reading(k.metric(age)).value, null, 'no row is no age, never nought');
  const make = (what: string, on: string, currency: string, category?: string) =>
    assert.ok(k.create('book', { what, on, balance: { amount: 100, currency }, ...(category ? { category } : {}) }, { actor: 'p_1' }).ok);
  make('a', '2026-09-28', 'GBP', 'Rent');
  make('b', '2026-10-04', 'GBP');
  make('c', '2026-10-01', 'EGP', '');
  assert.equal(reading(k.metric(age)).value, 5, 'the newest day is the 4th, five days before the 9th');
  assert.equal(reading(k.metric(fig('held-in', { currencies: 'balance' }))).value, 2, 'two currencies, however many balances');
  assert.equal(reading(k.metric(fig('no-category', { empty: 'category' }))).value, 2, 'unset and blank are both empty');
  const share = reading(k.metric(fig('share', { ratio: { of: { empty: 'category' }, per: { count: 'id' } } }, 'pct')));
  assert.ok(Math.abs((share.value ?? 0) - 2 / 3) < 1e-9, `two of three have no category, read ${share.value}`);
});

test('INSTALL REFUSES AN AGE OFF A NON-DAY AND CURRENCIES OFF A NON-MONEY FIELD', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  assert.ok((await k.install([BOOK])).ok);
  for (const [value, word] of [[{ age: 'what' }, /age reads a day/], [{ currencies: 'on' }, /currencies reads money/]] as const) {
    const out = k.metric(fig('bad', value)) as { ok: boolean; refusal?: { fix: string } };
    assert.equal(out.ok, false, JSON.stringify(value));
    assert.match(out.refusal?.fix ?? '', word);
  }
});
