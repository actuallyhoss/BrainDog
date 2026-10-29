import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Fields } from '../src/pipeline.ts';
import { isDuplicate } from '../src/dedupe.ts';

const money = (amount: number, currency: string) => ({ amount, currency });

const a: Fields = {
  account: 'e1',
  amount: money(125000, 'EGP'),
  date: '2026-08-29',
  merchant: 'BEANS COFFEE CAIRO',
  ref: 'X1',
};

const near = { near: { on: ['account', 'amount'], day: 'date', prefix: { field: 'merchant' } } };

/* ── the field-list form ─────────────────────────────────────────────────── */

test('equal, differing and absent on one side', () => {
  assert.equal(isDuplicate(a, { ...a }, ['ref']), true);
  assert.equal(isDuplicate(a, { ...a, ref: 'X2' }, ['ref']), false);
  const { ref: _drop, ...noRef } = a;
  assert.equal(isDuplicate(a, noRef, ['ref']), false);
});

test('absent on both sides is false, not a match on nothing', () => {
  const { ref: _x, ...l } = a;
  const { ref: _y, ...r } = a;
  assert.equal(isDuplicate(l, r, ['ref']), false);
});

test('an empty key list is false', () => {
  assert.equal(isDuplicate(a, { ...a }, []), false);
  assert.equal(isDuplicate(a, { ...a }, { near: { on: [], day: 'date' } }), false);
});

test('money compares as a pair, whichever order it was built in', () => {
  const flipped = { ...a, amount: { currency: 'EGP', amount: 125000 } };
  assert.equal(isDuplicate(a, flipped, ['amount']), true);
  assert.equal(isDuplicate(a, { ...a, amount: money(125000, 'USD') }, ['amount']), false);
  assert.equal(isDuplicate(a, { ...a, amount: money(125001, 'EGP') }, ['amount']), false);
});

test('null is a value and compares as itself', () => {
  assert.equal(isDuplicate({ ref: null }, { ref: null }, ['ref']), true);
  assert.equal(isDuplicate({ ref: null }, { ref: '' }, ['ref']), false);
});

/* ── the near form, which is 43 §9.5's table ─────────────────────────────── */

test('a day apart with the merchant extended is the same event', () => {
  const b = { ...a, date: '2026-08-30', merchant: 'Beans Coffee Cairo Branch' };
  assert.equal(isDuplicate(a, b, near), true);
});

test('two days apart, a minor unit apart, another currency, another merchant: each false', () => {
  const b = { ...a, date: '2026-08-30', merchant: 'Beans Coffee Cairo Branch' };
  assert.equal(isDuplicate(a, { ...b, date: '2026-08-31' }, near), false);
  assert.equal(isDuplicate(a, { ...b, amount: money(125001, 'EGP') }, near), false);
  assert.equal(isDuplicate(a, { ...b, amount: money(125000, 'USD') }, near), false);
  assert.equal(isDuplicate(a, { ...b, merchant: 'BEANS CAFE' }, near), false);
});

test('the window is symmetric and inclusive at exactly one day', () => {
  assert.equal(isDuplicate({ ...a, date: '2026-08-30' }, a, near), true);
  assert.equal(isDuplicate({ ...a, date: '2026-08-28' }, a, near), true);
  assert.equal(isDuplicate({ ...a, date: '2026-08-27' }, a, near), false);
});

test('the window crosses a month and a year boundary, which is where a duplicate actually lands', () => {
  const l = { ...a, date: '2026-08-31' };
  assert.equal(isDuplicate(l, { ...a, date: '2026-09-01' }, near), true);
  assert.equal(isDuplicate({ ...a, date: '2026-12-31' }, { ...a, date: '2027-01-01' }, near), true);
  assert.equal(isDuplicate({ ...a, date: '2026-02-28' }, { ...a, date: '2026-03-01' }, near), true);
});

/* ── the day, which is where a silent drop would come from ───────────────── */

test('a day that is not on the calendar is false, never rolled forward', () => {
  /**
   * `Date.UTC(2026, 1, 30)` IS THE 2nd OF MARCH. Without the read-back check, 2026-02-30 would compare as a
   * real day one out from the 1st of March and answer true, which is a dropped transaction. False here
   * writes a row somebody can see.
   */
  assert.equal(isDuplicate({ ...a, date: '2026-02-30' }, { ...a, date: '2026-03-01' }, near), false);
  assert.equal(isDuplicate({ ...a, date: '2026-13-01' }, { ...a, date: '2026-13-01' }, near), false);
  assert.equal(isDuplicate({ ...a, date: '2025-02-29' }, { ...a, date: '2025-02-29' }, near), false);
  /* And the leap day that is real still works. */
  assert.equal(isDuplicate({ ...a, date: '2028-02-29' }, { ...a, date: '2028-02-29' }, near), true);
});

test('a day in the wrong shape is false rather than a guess', () => {
  for (const bad of ['29/08/26', '2026-8-29', '2026-08-29T00:00:00Z', '', 'yesterday', '2026-08-2x'])
    assert.equal(isDuplicate({ ...a, date: bad }, { ...a, date: bad }, near), false, bad);
});

test('a missing day on either side is false', () => {
  const { date: _d, ...noDay } = a;
  assert.equal(isDuplicate(a, noDay, near), false);
  assert.equal(isDuplicate(noDay, noDay, near), false);
});

/* ── the prefix ──────────────────────────────────────────────────────────── */

test('the prefix folds case, accents and the invisible characters normalise strips', () => {
  const b = { ...a, date: '2026-08-30' };
  assert.equal(isDuplicate({ ...a, merchant: 'CAFÉ BEANS CAIRO' }, { ...b, merchant: 'cafe beans cairo' }, near), true);
  assert.equal(isDuplicate({ ...a, merchant: 'BEANS​COFFEE CAIRO' }, { ...b, merchant: 'BEANSCOFFEE CAIRO' }, near), true);
  assert.equal(isDuplicate({ ...a, merchant: 'BEANS COFFEE CAIRO' }, { ...b, merchant: 'BEANS COFFEE CAIRO' }, near), true);
});

test('case folds past ASCII, because nothing here is an index', () => {
  const b = { ...a, date: '2026-08-30' };
  assert.equal(isDuplicate({ ...a, merchant: 'ØRSTED ENERGI A/S' }, { ...b, merchant: 'Ørsted Energi A/S' }, near), true);
  assert.equal(isDuplicate({ ...a, merchant: 'ÉCOLE DES BEAUX' }, { ...b, merchant: 'école des beaux' }, near), true);
});

test('the prefix absent on both is equal, on one side it is not', () => {
  const { merchant: _l, ...noL } = a;
  const dayLater: Fields = { ...a, date: '2026-08-30' };
  const { merchant: _r, ...noR } = dayLater;
  assert.equal(isDuplicate(noL, noR, near), true);
  assert.equal(isDuplicate(a, noR, near), false);
});

test('chars is configurable and twelve is the default', () => {
  const short = { near: { on: ['account'], day: 'date', prefix: { field: 'merchant', chars: 5 } } };
  assert.equal(isDuplicate(a, { ...a, merchant: 'BEANS CAFE' }, short), true);
  assert.equal(isDuplicate(a, { ...a, merchant: 'BEANS CAFE' }, near), false);
});

test('a prefix shorter than chars must match whole, not by being a prefix of the other', () => {
  /* 'BEANS' is a prefix of 'BEANS COFFEE CAIRO', and they are not the same merchant. */
  assert.equal(isDuplicate({ ...a, merchant: 'BEANS' }, a, near), false);
});

test('no prefix declared is allowed, and then the on fields and the day decide', () => {
  const noPrefix = { near: { on: ['account', 'amount'], day: 'date' } };
  assert.equal(isDuplicate(a, { ...a, date: '2026-08-30', merchant: 'SOMETHING ELSE' }, noPrefix), true);
});

test('near: a field one side never held is unknown, not different, so an older row without a reference is the same', () => {
  /* The live check of 30 October: four HSBC alerts written again beside the rows written before the add-on read a reference. */
  const key = { near: { on: ['amount', 'account', 'ref'], day: 'on', prefix: { field: 'what', chars: 12 } } };
  const old: Fields = { amount: 3462000, account: 'a', on: '2026-10-17', what: 'WOPLEK OFFICE FURNITURE' };
  const again: Fields = { ...old, ref: '40175f9b' };
  assert.equal(isDuplicate(again, old, key), true);
  assert.equal(isDuplicate(again, { ...old, ref: 'ffff0000' }, key), false, 'held by both, it must agree');
  assert.equal(isDuplicate({ ref: 'x', on: '2026-10-17', what: 'W' }, { on: '2026-10-17', what: 'W' }, key), false, 'nothing held by both is no match');
});
