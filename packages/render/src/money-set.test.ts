/**
 * Amounts that stand together are written alike: a whole set shows no pence, a set with pence shows two places
 * on every amount, a display figure is whole. And bank capitals read as a person writes them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AMOUNT_SPACE, moneySet, moneyWhole, readable } from './index.ts';

const texts = (minors: number[], currency = 'GBP', home: string | null = 'GBP') => moneySet(minors, currency, home).written.map((w) => w.text);

test('A WHOLE SET SHOWS NO PENCE, and one with pence shows two places on every amount', () => {
  assert.deepEqual(texts([919000, 614000]), ['£9,190', '£6,140']);
  assert.deepEqual(texts([247333, 614000]), ['£2,473.33', '£6,140.00']);
  assert.equal(moneySet([247333, 614000], 'GBP').pence, true);
  assert.equal(moneySet([919000], 'GBP').pence, false);
});

test('A SINGLE AMOUNT SHOWS PENCE ONLY WHEN THEY ARE NOT .00', () => {
  assert.deepEqual(texts([3900]), ['£39']);
  assert.deepEqual(texts([3950]), ['£39.50']);
});

test('THE HOME CURRENCY NEVER PRINTS ITS CODE; another puts its code after; minus is U+2212', () => {
  assert.deepEqual(texts([480000], 'USD', 'GBP'), [`$4,800${AMOUNT_SPACE}USD`]);
  assert.deepEqual(texts([-3900]), ['−£39']);
  assert.deepEqual(texts([125000], 'JPY', 'GBP'), [`¥125,000${AMOUNT_SPACE}JPY`]);
});

test('A DISPLAY FIGURE IS WHOLE, rounded half away from nought', () => {
  assert.equal(moneyWhole(3385049, 'GBP', 'GBP')?.text, '£33,850');
  assert.equal(moneyWhole(3385050, 'GBP', 'GBP')?.text, '£33,851');
  assert.equal(moneyWhole(-3385050, 'GBP', 'GBP')?.text, '−£33,851');
  assert.equal(moneyWhole(0.5, 'GBP', 'GBP'), null);
});

test('BANK CAPITALS READ AS A PERSON WRITES THEM, and nothing else is touched', () => {
  assert.equal(readable('KILN STOREFRONT PAYOUT'), 'Kiln Storefront Payout');
  assert.equal(readable('TALLYARD'), 'Tallyard');
  assert.equal(readable('HMRC VAT Q3'), 'HMRC VAT Q3');
  assert.equal(readable('TRANSFER TO TAX RESERVE'), 'Transfer to Tax Reserve');
  assert.equal(readable('PELL & VINE, HALF THE YEAR-END FEE'), 'Pell & Vine, Half the Year-End Fee');
  assert.equal(readable('VAT'), 'VAT');
  assert.equal(readable('S'), 'S');
  assert.equal(readable('Rent, October'), 'Rent, October');
  assert.equal(readable('iPad CASE'), 'iPad CASE');
  assert.equal(readable("O'NEILL-SMITH LTD"), "O'neill-Smith Ltd");
});
