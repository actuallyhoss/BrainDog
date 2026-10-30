import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Fields } from '../src/pipeline.ts';
import { bankless, isDuplicate, nearMatch } from '../src/dedupe.ts';

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

/* ── one payment seen by two roads (live check of 30 October, 11) ───────── */

test('bankless takes off the day stamp, the words before the payee, a processor and Purchase', () => {
  assert.equal(bankless('IPN outward transfer to AHMED EMAD SAIED ABDELAZIZ'), 'ahmed emad saied abdelaziz');
  assert.equal(bankless('05OCT26 PAYMOB*UNITRADE Purchase'), 'unitrade');
  assert.equal(bankless('CHILLOUT *CHILLOUT ELO'), 'chillout elo');
  assert.equal(bankless('Woplek Office Furniture.'), 'woplek office furniture');
  assert.equal(bankless('Purchase'), 'purchase', 'never empty');
});

const IPN = { near: { on: ['amount', 'account', 'hsbc_reference'], day: 'on', prefix: { field: 'what', chars: 12 } } };
const CARD = { near: { on: ['amount', 'account', 'available'], day: 'on', prefix: { field: 'what', chars: 12 } } };
const egp = (amount: number) => money(amount, 'EGP');

test('a statement line and an alert for one transfer are one payment, two days apart', () => {
  const line: Fields = { what: 'IPN outward transfer to AHMED EMAD SAIED ABDELAZIZ', amount: egp(150_150), account: 'hsbc', on: '2026-10-21', direction: 'out' };
  const alert: Fields = { what: 'AHMED EMAD SAIED ABDELAZIZ', amount: egp(150_150), account: 'hsbc', on: '2026-10-19', direction: 'out', hsbc_reference: 'a72eba6b' };
  assert.equal(nearMatch(alert, line, IPN), 'across');
  assert.equal(isDuplicate(line, alert, IPN), true);
  assert.equal(isDuplicate({ ...line, on: '2026-10-23' }, alert, IPN), false, 'four days is another payment');
  assert.equal(isDuplicate({ ...line, amount: egp(150_100) }, alert, IPN), false, 'another amount');
});

test('a card line from a statement and the card alert are one charge, though only the alert says what was left', () => {
  const line: Fields = { what: '05OCT26 PAYMOB*UNITRADE Purchase', amount: egp(27_747), account: 'card', on: '2026-10-07', direction: 'out' };
  const alert: Fields = { what: 'UNITRADE', amount: egp(27_747), account: 'card', on: '2026-10-05', direction: 'out', available: egp(1_425_697) };
  assert.equal(nearMatch(alert, line, CARD), 'across');
});

test('two alerts that both say what was left, and say it differently, are two charges', () => {
  /* ALMOKHTBR, EGP 1,750 twice on 21 October: the limit left fell by the charge, so the shop charged twice. */
  const one: Fields = { what: 'ALMOKHTBR', amount: egp(175_000), account: 'card', on: '2026-10-21', available: egp(3_070_281) };
  assert.equal(isDuplicate(one, { ...one, available: egp(2_895_281) }, CARD), false);
  assert.equal(nearMatch(one, { ...one }, CARD), 'strong');
});

test('rows that hold the same fields keep the one day, and only a pair by two roads gets three', () => {
  const alert: Fields = { what: 'WOPLEK OFFICE FURNITURE', amount: egp(3_462_000), account: 'hsbc', on: '2026-10-17', hsbc_reference: '40175f9b' };
  assert.equal(isDuplicate(alert, { ...alert, on: '2026-10-19' }, IPN), false);
  const { hsbc_reference: _r, ...old } = alert;
  assert.equal(isDuplicate(alert, { ...old, on: '2026-10-20' }, IPN), true);
});

test('one payment never goes both ways, even when the words read alike once the bank is taken off', () => {
  const out: Fields = { what: 'IPN outward transfer to LAYLA AHMED', amount: egp(50_050), account: 'hsbc', on: '2026-10-03', direction: 'out' };
  const back: Fields = { what: 'LAYLA AHMED', amount: egp(50_050), account: 'hsbc', on: '2026-10-03', direction: 'in', hsbc_reference: 'ffff' };
  assert.equal(isDuplicate(out, back, IPN), false);
  assert.equal(isDuplicate(out, { ...back, direction: 'out' }, IPN), true);
});

test('an amount is never unknown: a row with none is not the same as one with an amount', () => {
  const key = { near: { on: ['amount', 'account'], day: 'on' } };
  assert.equal(isDuplicate({ amount: egp(100), account: 'a', on: '2026-10-01' }, { account: 'a', on: '2026-10-01' }, key), false);
});

test('the payee key reads past a place at the end, so TALABAT CAIRO EG and Talabat are one shop', () => {
  const line: Fields = { what: '28OCT26 TALABAT CAIRO EG Purchase', amount: egp(101_587), account: 'card', on: '2026-10-29' };
  const alert: Fields = { what: 'Talabat', amount: egp(101_587), account: 'card', on: '2026-10-28', available: egp(8_530_227) };
  assert.equal(isDuplicate(alert, line, CARD), true);
  assert.equal(isDuplicate(alert, { ...line, what: '28OCT26 BREADFAST CAIRO EG Purchase' }, CARD), false, 'another shop');
});

test('two day stamps that differ are two days, though the balance after them is one', () => {
  /* A withdrawal, a deposit of the same and a second withdrawal: one balance after, two days in the bank's words. */
  const key = { near: { on: ['amount', 'account', 'balance_after'], day: 'on', prefix: { field: 'what', chars: 12 } } };
  const first: Fields = { what: '16AUG26 ATM Cash Withdrawal', amount: egp(250_000), account: 'hsbc', on: '2026-08-16', balance_after: egp(3_104_025) };
  assert.equal(isDuplicate({ ...first, what: '17AUG26 ATM Cash Withdrawal', on: '2026-08-17' }, first, key), false);
  assert.equal(isDuplicate({ ...first, what: 'ATM Cash Withdrawal' }, first, key), true, 'a stamp on one side only is no day');
});
