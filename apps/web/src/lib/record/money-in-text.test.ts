/**
 * `moneyInText`: a sentence the record stored, drawn with its amounts as a screen draws money (design DSN-4; contracts
 * §8.3, "how money is written").
 *
 * THE RECORD WRITES MONEY CODE FIRST, "GBP 2,400.00", and a screen draws "£2,400.00" in the record's currency and
 * "$4,800.00 USD" in another. A sentence a rule filled before the kernel grouped its figures holds "GBP 2400.00" and
 * "GBP -39.00", and a record keeps what it wrote, so both spellings are held here to one drawing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { learnHome } from './api.ts';
import { moneyInText } from './money.ts';

test('THE HOME CURRENCY IS DRAWN BY ITS SYMBOL, as the kernel writes it now and as it wrote it before', () => {
  assert.equal(moneyInText('Pay GBP 2,400.00 to the landlord?', 'GBP'), 'Pay £2,400.00 to the landlord?');
  assert.equal(moneyInText('Pay GBP 2400.00 to the landlord?', 'GBP'), 'Pay £2,400.00 to the landlord?');
  assert.equal(moneyInText('GBP 1234567.50', 'GBP'), '£1,234,567.50');
});

test('ANOTHER CURRENCY KEEPS ITS CODE AFTER THE FIGURE, and one with no symbol keeps it in front', () => {
  const foreign = moneyInText('Invoice for USD 4800.00 is due', 'GBP');
  assert.match(foreign, /\$4,800\.00\s?USD/u);
  assert.ok(!foreign.includes('USD 4'), foreign);
  assert.equal(moneyInText('EGP 58185.54 in the bank', 'EGP'), 'EGP 58,185.54 in the bank');
});

test('A NEGATIVE HAS A TRUE MINUS IN FRONT OF THE SYMBOL, whichever minus the sentence was stored with', () => {
  assert.equal(moneyInText('paid GBP −39.00', 'GBP'), 'paid −£39.00');
  assert.equal(moneyInText('paid GBP -39.00', 'GBP'), 'paid −£39.00');
});

test('THE CURRENCY’S OWN DECIMALS ARE KEPT, and a whole with none is grouped all the same', () => {
  assert.match(moneyInText('JPY 129900', 'GBP'), /^¥129,900\s?JPY$/u);
  assert.equal(moneyInText('KWD 1.500', 'KWD'), 'KWD 1.500');
});

test('THREE CAPITALS AND A NUMBER ARE NOT MONEY UNLESS THE CODE IS TENDER', () => {
  assert.equal(moneyInText('Follows ISO 4217 since 2019', 'GBP'), 'Follows ISO 4217 since 2019');
  assert.equal(moneyInText('No money here', 'GBP'), 'No money here');
});

test('WITH NO CURRENCY NAMED, THE RECORD’S OWN IS READ', () => {
  learnHome('GBP');
  assert.equal(moneyInText('Pay GBP 2400.00?'), 'Pay £2,400.00?');
  learnHome(null);
  assert.match(moneyInText('Pay GBP 2400.00?'), /^Pay £2,400\.00\s?GBP\?$/u);
});
