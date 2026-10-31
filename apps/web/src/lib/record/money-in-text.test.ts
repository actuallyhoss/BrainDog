/**
 * `moneyInText`: a sentence the record stored, drawn with its amounts as a screen draws money (the design system's
 * rule for how money is written).
 *
 * THE RECORD WRITES MONEY CODE FIRST, "GBP 2,400.00", and a screen draws "£2,400.00" in the record's currency and
 * "$4,800.00" in another, by its own sign (AM15), with the code after only where that sign is the home's. A sentence a rule filled before the kernel grouped its figures holds "GBP 2400.00" and
 * "GBP -39.00", and a record keeps what it wrote, so both spellings are held here to one drawing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { learnHome } from './api.ts';
import { moneyInText } from './money.ts';

test('THE HOME CURRENCY IS DRAWN BY ITS SYMBOL, as the kernel writes it now and as it wrote it before', () => {
  assert.equal(moneyInText('Pay GBP 2,400.00 to the landlord?', 'GBP'), 'Pay £2,400 to the landlord?');
  assert.equal(moneyInText('Pay GBP 2400.00 to the landlord?', 'GBP'), 'Pay £2,400 to the landlord?');
  assert.equal(moneyInText('GBP 1234567.50', 'GBP'), '£1,234,567.50');
});

test('ANOTHER CURRENCY IS SAID BY ITS OWN SIGN, its code after only where the sign is the home one, and one with no symbol keeps it in front', () => {
  const foreign = moneyInText('Invoice for USD 4800.00 is due', 'GBP');
  assert.equal(foreign, 'Invoice for $4,800 is due');
  assert.match(moneyInText('Invoice for USD 4800.00 is due', 'CAD'), /\$4,800\s?USD/u);
  assert.equal(moneyInText('EGP 58185.54 in the bank', 'EGP'), 'EGP\u00a058,185.54 in the bank');
});

test('A NEGATIVE HAS A TRUE MINUS IN FRONT OF THE SYMBOL, whichever minus the sentence was stored with', () => {
  assert.equal(moneyInText('paid GBP −39.00', 'GBP'), 'paid −£39');
  assert.equal(moneyInText('paid GBP -39.00', 'GBP'), 'paid −£39');
});

test('THE CURRENCY’S OWN DECIMALS ARE KEPT, and a whole with none is grouped all the same', () => {
  assert.equal(moneyInText('JPY 129900', 'GBP'), '¥129,900');
  assert.equal(moneyInText('KWD 1.500', 'KWD'), 'KWD\u00a01.500');
});

test('THREE CAPITALS AND A NUMBER ARE NOT MONEY UNLESS THE CODE IS TENDER', () => {
  assert.equal(moneyInText('Follows ISO 4217 since 2019', 'GBP'), 'Follows ISO 4217 since 2019');
  assert.equal(moneyInText('No money here', 'GBP'), 'No money here');
});

test('WITH NO CURRENCY NAMED, THE RECORD’S OWN IS READ', () => {
  learnHome('GBP');
  assert.equal(moneyInText('Pay GBP 2400.00?'), 'Pay £2,400?');
  learnHome(null);
  assert.equal(moneyInText('Pay GBP 2400.00?'), 'Pay £2,400?', 'no home: by its own sign all the same');
});

test('A SENTENCE SAYS A ROUND AMOUNT WITHOUT ITS PENCE, and a ledger that asks keeps them', () => {
  assert.equal(moneyInText('Ledger Post, sending plan was due 4 days ago, GBP 39.00. Did it go through?', 'GBP'), 'Ledger Post, sending plan was due 4 days ago, £39. Did it go through?');
  assert.equal(moneyInText('GBP -9190.00', 'GBP'), '−£9,190');
  assert.equal(moneyInText('GBP 0.00 left', 'GBP'), '£0 left');
  assert.equal(moneyInText('GBP 12.50', 'GBP'), '£12.50', 'pence that are not round are part of the amount');
  assert.equal(moneyInText('GBP -9190.00', 'GBP', 'exact'), '−£9,190.00');
  assert.equal(moneyInText('USD 4800.00 owed', 'GBP', 'exact'), '$4,800.00 owed');
});
