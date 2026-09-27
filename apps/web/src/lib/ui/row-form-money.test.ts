/**
 * The new-row form writes a typed amount in a currency somebody chose, and in none when nobody has.
 *
 * IT WROTE STERLING ON EVERY RECORD. `RowForm.svelte` ended its chain in `'GBP'` after `currencyFor`, which reads rows no
 * shipped tab holds, so "120" typed into a new row on a record kept in EGP went in as GBP 120.00 (`loop/finish/defects.md`
 * M1, DEF-2). The component does not mount under `node --test`, so these cases hold `money-typed.ts`, the module it
 * reads the currency and the amount from.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { copy } from '../copy.ts';
import { learnHome } from '../record/api.ts';
import type { FieldDecl } from '../record/schema.ts';
/* A NAMESPACE AND NOT A NAMED IMPORT, so a missing export is one failing test rather than a file that will not load. */
import * as typed from './money-typed.ts';

const AMOUNT: FieldDecl = { id: 'amount', type: 'money' };

test("AN AMOUNT TYPED INTO A FIELD WITH NO DECLARED CURRENCY GOES IN THE RECORD'S OWN, by that currency's places", () => {
  assert.equal(typeof typed.moneyTyped, 'function', 'money-typed.ts exports no moneyTyped');
  learnHome('EGP');
  try {
    assert.deepEqual(typed.moneyTyped(AMOUNT, '120', null), { amount: 12000, currency: 'EGP' });
    assert.equal(typed.currencyTypedIn(AMOUNT, null), 'EGP', 'the box is labelled in a currency it does not write');
    /* THE PLACES ARE THE CURRENCY'S: yen have none, so 1250 is 1,250 of them and a decimal is refused. */
    learnHome('JPY');
    assert.deepEqual(typed.moneyTyped(AMOUNT, '1250', null), { amount: 1250, currency: 'JPY' });
    assert.equal(typed.moneyTyped(AMOUNT, '12.5', null), null, 'a fraction of a yen was written');
    assert.equal(typed.amountWrong(AMOUNT, '12.5', null), copy.moneyPlaces(0));
  } finally {
    learnHome(null);
  }
});

test("THE FIELD'S DECLARED CURRENCY COMES FIRST, then the list's rows, then the record's", () => {
  const owed: FieldDecl = { ...AMOUNT, default: { amount: 0, currency: 'KWD' } };
  learnHome('EGP');
  try {
    assert.deepEqual(typed.moneyTyped(owed, '1.25', 'USD'), { amount: 1250, currency: 'KWD' }, "the field's own currency was passed over");
    assert.deepEqual(typed.moneyTyped(AMOUNT, '4800', 'USD'), { amount: 480000, currency: 'USD' }, "the list's currency was passed over");
    /* AN EMPTY CELL IN THE GRID IS LABELLED BY THE SAME ORDER, after the currency the row itself holds. */
    assert.equal(typed.currencyTypedIn(owed, 'USD', { amount: 100, currency: 'GBP' }), 'GBP', "the row's own currency was passed over");
  } finally {
    learnHome(null);
  }
});

test('WITH NO CURRENCY KNOWN NOTHING IS WRITTEN, and the box says how to give it one', () => {
  learnHome(null);
  assert.equal(typed.currencyTypedIn(AMOUNT, null), null, 'a currency nobody chose was drawn');
  assert.equal(typed.moneyTyped(AMOUNT, '120', null), null, 'an amount in no currency was written');
  assert.equal(typed.amountWrong(AMOUNT, '120', null), typed.NO_CURRENCY);
  /* WHAT IS NOT A NUMBER IS SAID FIRST, because it is what the box itself can fix. */
  assert.equal(typed.amountWrong(AMOUNT, '12abc', null), copy.moneyShape);
  /* AN EMPTY BOX IS NOTHING TO WRITE AND NOTHING TO SAY. */
  assert.equal(typed.amountWrong(AMOUNT, '', null), null);
  assert.equal(typed.moneyTyped(AMOUNT, '  ', null), null);
});
