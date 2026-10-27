/**
 * A new amount filed against an account is in that account's currency, and the form says so.
 *
 * THE ADD FORM IGNORED THE ACCOUNT. The record already gives an amount sent with no code the code of the account its
 * `currency_from` link names, but `RowForm.svelte` drew its box in the currency of the list's other rows, so an entry
 * filed against an account kept in EGP showed a $ box and sent USD, which the record then corrected or refused. The
 * component does not mount under `node --test`, so these hold `money-typed.ts`, which it reads the code from.
 * Invented names only.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { learnHome } from '../record/api.ts';
import { ROWS } from '../record/held.ts';
import type { FieldDecl } from '../record/schema.ts';
import * as typed from './money-typed.ts';

const AMOUNT: FieldDecl = { id: 'amount', type: 'money', currency_from: 'account.balance' };
const FIXED: FieldDecl = { ...AMOUNT, currency_fixed: true };
const PLAIN: FieldDecl = { id: 'amount', type: 'money' };

const QUAYSIDE = { fields: { name: 'Quayside current', balance: { amount: 50000, currency: 'EGP' } } };
const BARE = { fields: { name: 'Marrow tin' } };
/* The accounts list holds `balance` as money; anything else it is asked for it does not. */
const moneyFieldOf = (named: string): string | null => (named === 'balance' ? named : null);

test('AN AMOUNT FILED AGAINST AN ACCOUNT KEPT IN EGP IS IN EGP, drawn and sent, whatever the list rows are in', () => {
  learnHome('USD');
  try {
    const code = typed.currencyOfLink(AMOUNT, QUAYSIDE, moneyFieldOf);
    assert.equal(code, 'EGP');
    assert.equal(typed.currencyTypedIn(AMOUNT, 'USD', undefined, code), 'EGP', 'the box was drawn in the rows currency');
    assert.deepEqual(typed.moneyTyped(AMOUNT, '120', 'USD', code), { amount: 12000, currency: 'EGP' });
    assert.equal(typed.amountWrong(AMOUNT, '120', 'USD', code), null);
    assert.equal(typed.linkSaid('EGP', 'Quayside current'), 'In EGP, the currency of Quayside current.');
  } finally {
    learnHome(null);
  }
});

test('A CODE THE ROW ALREADY HOLDS WINS over the account, as a fixed currency never moves off it', () => {
  const code = typed.currencyOfLink(FIXED, QUAYSIDE, moneyFieldOf);
  assert.equal(typed.currencyTypedIn(FIXED, null, { amount: 900, currency: 'KWD' }, code), 'KWD');
});

test("NO LINK GIVES TODAY'S ANSWER: the field's own, then the list's rows, then the record's", () => {
  learnHome('GBP');
  try {
    assert.equal(typed.currencyOfLink(PLAIN, QUAYSIDE, moneyFieldOf), null, 'a field that declares no link took a code');
    assert.equal(typed.currencyOfLink(AMOUNT, null, moneyFieldOf), null, 'no account picked took a code');
    assert.equal(typed.currencyTypedIn(AMOUNT, 'USD', undefined, null), 'USD');
    assert.equal(typed.currencyTypedIn(AMOUNT, null, undefined, null), 'GBP');
    assert.deepEqual(typed.moneyTyped(AMOUNT, '5', null, null), { amount: 500, currency: 'GBP' });
  } finally {
    learnHome(null);
  }
});

test("AN ACCOUNT WITH NO MONEY FIELD THERE GIVES TODAY'S ANSWER, and so does one holding no value in it", () => {
  const retired: FieldDecl = { ...AMOUNT, currency_from: 'account.opening' };
  assert.equal(typed.currencyOfLink(retired, QUAYSIDE, moneyFieldOf), null, 'a field the account does not hold as money was read');
  assert.equal(typed.currencyOfLink(AMOUNT, BARE, moneyFieldOf), null);
  assert.equal(typed.currencyTypedIn(AMOUNT, 'USD', undefined, null), 'USD');
  /* A declaration that is not `<link>.<field>` names no link at all. */
  assert.equal(typed.linkOf({ ...AMOUNT, currency_from: 'account' }), null);
  assert.equal(typed.linkOf({ id: 'note', type: 'text', currency_from: 'account.balance' }), null);
});

test('THE LINKED ACCOUNT IS READ FROM WHAT THE TAB HOLDS, by its number, so a pick sends no request', () => {
  const had = ROWS['accounts'];
  ROWS['accounts'] = [{ seq: 3, fields: QUAYSIDE.fields } as unknown as NonNullable<typeof had>[number]];
  try {
    assert.equal(typed.currencyOfLink(AMOUNT, typed.linkedRow('accounts', 3), moneyFieldOf), 'EGP');
    assert.equal(typed.linkedRow('accounts', 4), null);
    assert.equal(typed.linkedRow('accounts', null), null);
    assert.equal(typed.linkedRow('ledger', 3), null);
  } finally {
    if (had === undefined) delete ROWS['accounts'];
    else ROWS['accounts'] = had;
  }
});
