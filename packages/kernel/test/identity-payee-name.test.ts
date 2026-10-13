/**
 * A payee's name as a person reads it: the bank's text with the same cuts its key makes (the processor's prefix, the
 * place, the reference numbers, the web suffix) and the bank's capitals turned to plain case. The key is what joins two
 * spellings and the name is what is shown, so the name always folds back to the key the text had, and no key changes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bankKey, keyOf, payeeName } from '../src/identity-keys.ts';

/** The payees `packs/bank-hsbc-eg`'s own test charges and transfers to, as that bank prints them. */
const HSBC = [
  'CHILLOUT', 'GEIDEA*CHILLOUT', 'PAYMOB-CHILLOUT', 'FAWRY*Chillout', 'KASHIER*CHILLOUT', 'TALABAT', 'talabat.com',
  'MARLOW JOINERY', 'GRANARY MARKET', 'CEDAR LANE BAKERY', 'FAWRY*Vodafone', 'HARBOUR BOOKS', 'NOURA SAMIR ABDEL HAMID',
];

/** Every other shape the key's own tests fold, so the name is held to the same cuts. */
const SHAPES = [
  'GEIDEA*CHILLOUT 0418 CAIRO EG', 'Chill Out', 'PAYMOB-Chillout New Cairo', 'POS CHILLOUT 12', 'FAWRY*Chillout*',
  'KASHIER*Vodafone Cash', 'PHARMACY CAIRO EG', 'Pharmacy Giza', 'CAFE 22', 'SUPERMARKET 0423 NEW CAIRO EG',
  'The Coffee Shop 4', 'SQ *BRIDGE STREET COFFEE LONDON GB', 'SP * Cedar Lane Bakery', 'CAFE', 'XO TELECOM EGYPT',
  'VELLUM ASSURANCE GERMANY', 'HARBOUR CAFE UNITED KINGDOM', 'MICHAEL JORDAN', 'CAFE FRANCE', 'BANK OF IRELAND',
  'ROYAL BANK OF CANADA', 'TALABAT CAIRO 4471 EG', "MCDONALD'S 114 GIZA", 'COCA-COLA CAIRO EG',
];

test('A TRAILING PROCESSOR REFERENCE AND THE PLACE ARE CUT, and the capitals read as a name', () => {
  assert.equal(payeeName('TALABAT CAIRO 4471 EG'), 'Talabat');
  assert.equal(payeeName('GEIDEA*CHILLOUT 0418 CAIRO EG'), 'Chillout');
  assert.equal(payeeName('talabat.com'), 'Talabat');
  assert.equal(payeeName('SQ *BRIDGE STREET COFFEE LONDON GB'), 'Bridge Street Coffee');
  assert.equal(payeeName('NOURA SAMIR ABDEL HAMID'), 'Noura Samir Abdel Hamid');
  assert.equal(payeeName('ROYAL BANK OF CANADA'), 'Royal Bank of Canada');
  assert.equal(payeeName('COCA-COLA CAIRO EG'), 'Coca-Cola');
  assert.equal(payeeName('FAWRY*Chillout*'), 'Chillout');
});

test('A NAME KEEPS THE WORD THAT SAYS WHICH SHOP, as its key does', () => {
  assert.equal(payeeName('CAFE 22'), 'Cafe 22');
  assert.equal(payeeName('PHARMACY CAIRO EG'), 'Pharmacy Cairo');
  assert.equal(payeeName('SUPERMARKET 0423 NEW CAIRO EG'), 'Supermarket 0423');
});

test('A NAME A PERSON WROTE IS KEPT AS WRITTEN, and initials stay capitals', () => {
  assert.equal(payeeName('KASHIER*Vodafone Cash'), 'Vodafone Cash');
  assert.equal(payeeName('SP * Cedar Lane Bakery'), 'Cedar Lane Bakery');
  assert.equal(payeeName('PayPal *iHerb'), 'iHerb');
  assert.equal(payeeName('POS KFC 0091 MAADI'), 'KFC');
  assert.equal(payeeName('HSBC BANK EGYPT'), 'HSBC Bank');
});

test('A NAME IS NEVER EMPTY: what cannot be cut to a name is the text itself', () => {
  assert.equal(payeeName('  4471  '), '4471');
  assert.equal(payeeName('***'), '***');
  assert.equal(payeeName('GEIDEA*'), 'GEIDEA*');
  assert.equal(payeeName('  '), '');
});

test('THE NAME FOLDS TO THE KEY ITS TEXT HAD, for every payee the bank pack reads and every shape the key folds', () => {
  for (const said of [...HSBC, ...SHAPES]) {
    const key = keyOf('bank', said);
    assert.notEqual(key, null, said);
    assert.equal(keyOf('bank', payeeName(said)), key, `${said} read as ${payeeName(said)}`);
    assert.equal(bankKey(said), key, said);
  }
});

test('NO KEY CHANGED: the keys the bank pack and the key tests hold are the ones still returned', () => {
  const held: [string, string][] = [
    ['CHILLOUT', 'bank:chillout'], ['GEIDEA*CHILLOUT', 'bank:chillout'], ['PAYMOB-CHILLOUT', 'bank:chillout'],
    ['FAWRY*Chillout', 'bank:chillout'], ['KASHIER*CHILLOUT', 'bank:chillout'], ['TALABAT', 'bank:talabat'],
    ['talabat.com', 'bank:talabat'], ['MARLOW JOINERY', 'bank:marlowjoinery'], ['GRANARY MARKET', 'bank:granarymarket'],
    ['CEDAR LANE BAKERY', 'bank:cedarlanebakery'], ['FAWRY*Vodafone', 'bank:vodafone'], ['HARBOUR BOOKS', 'bank:harbourbooks'],
    ['NOURA SAMIR ABDEL HAMID', 'bank:nourasamirabdelhamid'], ['TALABAT CAIRO 4471 EG', 'bank:talabat'],
    ['SUPERMARKET 0423 NEW CAIRO EG', 'bank:supermarket0423'], ['BANK OF IRELAND', 'bank:bankofireland'],
  ];
  for (const [said, key] of held) assert.equal(bankKey(said), key, said);
  assert.equal(bankKey('   '), null);
});
