/**
 * The ruling of `docs/04-PACKS.md` §9 that the money reader holds: a bare "$" (ruling 438).
 *
 * THE TABLE IS THE ONE `@braindog/record` WIRES: every code `Intl` knows, with its exponent and no symbol at all. That
 * is what reads "paid $12" typed on a record whose home is the Egyptian pound, and it read EGP 12 until this ruling.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { exponentOf } from '@braindog/kernel';

import { parseMoney, scanMoney, type CurrencyTable } from '../src/money.ts';

const TABLE: CurrencyTable = Object.fromEntries(Intl.supportedValuesOf('currency').map((code) => [code, { exponent: exponentOf(code) }]));

test('ruling 438: a bare "$" on a record whose home is not a dollar is asked, never read as home', () => {
  assert.equal(parseMoney('paid $12', TABLE, 'EGP'), undefined, '"$12" on an EGP record read as EGP');
  assert.equal(parseMoney('paid 12$', TABLE, 'EGP'), undefined, '"12$" on an EGP record read as EGP');
  assert.equal(parseMoney('paid $ 12.50', TABLE, 'GBP'), undefined);
  assert.equal(parseMoney('paid $12', TABLE), undefined, 'a bare "$" with no home was given a currency');
});

test('ruling 438: an amount with a written code is never made unsure by a "$" beside it', () => {
  for (const line of ['$12 EGP', 'EGP $12', 'EGP$12', '12$ EGP', '$12EGP'])
    assert.deepEqual(parseMoney(line, TABLE, 'EGP'), { amount: 1200, currency: 'EGP' }, line);
  assert.deepEqual(parseMoney('USD $12', TABLE, 'EGP'), { amount: 1200, currency: 'USD' });
  assert.deepEqual(parseMoney('MXN $100', TABLE, 'EGP'), { amount: 10000, currency: 'MXN' });
  /* A CODE THAT OPENS THE NEXT FIGURE IS THAT FIGURE'S, so the "$" amount is still asked and never EGP 5. */
  assert.deepEqual(scanMoney('$5.00 EGP 245.00', TABLE, 'EGP'), [{ amount: 24500, currency: 'EGP' }]);
  assert.deepEqual(scanMoney('$5.00 EGP 245.00', TABLE, 'USD'), [{ amount: 500, currency: 'USD' }, { amount: 24500, currency: 'EGP' }]);
  /* TWO CURRENCIES THAT DISAGREE STAY NO CANDIDATE, as "USD 12 EGP" always was. */
  assert.equal(parseMoney('US$12 EGP', TABLE, 'EGP'), undefined);
});

test('ruling 438: a bare "$" is the home currency when home is written with "$"', () => {
  assert.deepEqual(parseMoney('paid $12', TABLE, 'USD'), { amount: 1200, currency: 'USD' });
  assert.deepEqual(parseMoney('paid $12', TABLE, 'CAD'), { amount: 1200, currency: 'CAD' });
  assert.deepEqual(parseMoney('refund -$4.50', TABLE, 'AUD'), { amount: -450, currency: 'AUD' });
  assert.deepEqual(parseMoney('$12 USD', TABLE, 'EGP'), { amount: 1200, currency: 'USD' }, 'the code beside it said which dollar');
});

test('ruling 438: a "$" a country names is that dollar, whatever home is', () => {
  assert.deepEqual(parseMoney('paid US$12', TABLE, 'EGP'), { amount: 1200, currency: 'USD' });
  assert.deepEqual(parseMoney('paid C$ 12.50', TABLE, 'EGP'), { amount: 1250, currency: 'CAD' });
  assert.deepEqual(parseMoney('paid A$3', TABLE, 'EGP'), { amount: 300, currency: 'AUD' });
});

test('ruling 438: what has no "$" reads as it did, home filling a bare figure and a written code winning', () => {
  assert.deepEqual(parseMoney('paid 12', TABLE, 'EGP'), { amount: 1200, currency: 'EGP' });
  assert.deepEqual(parseMoney('paid EGP 12', TABLE, 'USD'), { amount: 1200, currency: 'EGP' });
  /* AND TWO AMOUNTS, ONE OF THEM UNSURE: the sure one is still read. */
  assert.deepEqual(scanMoney('EGP 5.00 and $3', TABLE, 'EGP'), [{ amount: 500, currency: 'EGP' }]);
  assert.deepEqual(scanMoney('$5 $6', TABLE, 'USD'), [{ amount: 500, currency: 'USD' }, { amount: 600, currency: 'USD' }]);
});
