/**
 * A country a bank text writes after the merchant is dropped from the payee's key whichever country it is, read from the
 * runtime's region names rather than a list in the core (`tools/gates/shell-words.mjs`), and a name of two words keeps
 * both, since a country's name is also a surname.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { keyOf } from '../src/identity-keys.ts';

test('A COUNTRY AFTER THE MERCHANT IS NOT THE PAYEE, whichever country', () => {
  const cases: [string, string][] = [
    ['XO TELECOM EGYPT', 'bank:xotelecom'],
    ['VELLUM ASSURANCE GERMANY', 'bank:vellumassurance'],
    ['HARBOUR CAFE UNITED KINGDOM', 'bank:harbourcafe'],
    ['CHILLOUT CAIRO EG', 'bank:chillout'],
  ];
  for (const [said, key] of cases)
    assert.equal(keyOf('bank', said), key, said);
});

test('A NAME OF TWO WORDS KEEPS BOTH, since a country is a surname too', () => {
  assert.equal(keyOf('bank', 'MICHAEL JORDAN'), 'bank:michaeljordan');
  assert.equal(keyOf('bank', 'CAFE FRANCE'), 'bank:cafefrance');
});

test('A COUNTRY JOINED TO THE NAME IS THE NAME’S OWN, so two banks named for two countries stay two', () => {
  assert.equal(keyOf('bank', 'BANK OF IRELAND'), 'bank:bankofireland');
  assert.notEqual(keyOf('bank', 'BANK OF IRELAND'), keyOf('bank', 'BANK OF GEORGIA'));
  assert.equal(keyOf('bank', 'ROYAL BANK OF CANADA'), 'bank:royalbankofcanada');
});
