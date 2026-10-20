/**
 * A row's currency comes from its account, and stays (REC-B04 job 2).
 *
 * BEFORE: a money value had to carry its own code, so `{ amount: 97999 }` from an agent filing against an account kept
 * in EGP was refused, and the only lock a field could declare was on the whole field. Now a field declaring
 * `currency_from` takes the linked account's code when an amount comes without one (`Lookups.currencyOf`), is refused
 * in the brief's sentence when there is none to give, and keeps a code that was sent as written. `currencyFixed` is
 * the `CURRENCY_FIXED` answer to a later write that would change a stored code, and leaves the number free.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { REFUSAL_CODES } from '@braindog/ports';
import { coerce, currencyFixed, CURRENCY_FIXED_SENTENCE, NO_CURRENCY_TO_GIVE, type FieldDecl } from '../src/coerce.ts';
import { openRecord, type Declaration } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const AMOUNT: FieldDecl = { id: 'amount', type: 'money', currency_from: 'account.balance', currency_fixed: true };
const egp = { currencyOf: () => 'EGP' };

test('AN AMOUNT WITH NO CODE TAKES ITS ACCOUNT’S, and reads EGP 979.99', () => {
  assert.deepEqual(coerce(AMOUNT, { amount: 97999 }, egp), { ok: true, value: { amount: 97999, currency: 'EGP' } });
  for (const unsaid of [null, ''])
    assert.deepEqual(coerce(AMOUNT, { amount: 97999, currency: unsaid }, egp), { ok: true, value: { amount: 97999, currency: 'EGP' } });
});

test('A CODE THAT WAS SENT IS KEPT AS WRITTEN, and the account is not asked', () => {
  let asked = 0;
  const look = { currencyOf: () => (asked++, 'EGP') };
  assert.deepEqual(coerce(AMOUNT, { amount: 2000, currency: 'usd' }, look), { ok: true, value: { amount: 2000, currency: 'USD' } });
  assert.equal(asked, 0);
  /* A wrong code is still refused: the account does not paper over it. */
  assert.equal(coerce(AMOUNT, { amount: 2000, currency: 'GPB' }, egp).ok, false);
});

test('NO ACCOUNT, OR AN ACCOUNT WITH NO VALUE, is refused in one sentence', () => {
  for (const look of [{ currencyOf: () => null }, {}]) {
    const out = coerce(AMOUNT, { amount: 97999 }, look);
    assert.equal(out.ok, false);
    if (!out.ok) {
      assert.equal(out.refusal.code, 'VALUE_MALFORMED');
      assert.equal(out.refusal.fix, NO_CURRENCY_TO_GIVE);
      assert.equal(out.refusal.fix, 'This amount has no currency, and its account has none to give.');
      assert.equal(out.refusal.at, 'amount');
    }
  }
});

test('A FIELD WITHOUT THE KEY still wants its own code, whatever the lookups hold', () => {
  const out = coerce({ id: 'amount', type: 'money' }, { amount: 97999 }, egp);
  assert.equal(out.ok, false);
  if (!out.ok) assert.match(out.refusal.fix, /every money value carries its own/);
});

test('A STORED CODE DOES NOT CHANGE: CURRENCY_FIXED, and the number stays free', () => {
  const stored = { amount: 2000, currency: 'USD' };
  const out = currencyFixed(AMOUNT, stored, { amount: 2000, currency: 'EGP' });
  assert.equal(out?.code, 'CURRENCY_FIXED');
  assert.equal(out?.fix, CURRENCY_FIXED_SENTENCE);
  assert.equal(out?.fix, "A row keeps its currency, so delete this row and add it again in the other currency.");
  assert.equal(out?.at, 'amount');
  assert.deepEqual(out?.allowed, ['USD']);
  assert.equal(currencyFixed(AMOUNT, stored, { amount: 2500, currency: 'USD' }), null, 'a corrected number is a write');
  assert.equal(currencyFixed(AMOUNT, stored, { amount: 2000, currency: 'usd' }), null, 'one code in two cases');
  assert.equal(currencyFixed(AMOUNT, undefined, { amount: 2000, currency: 'EGP' }), null, 'a first value is not a change');
  assert.equal(currencyFixed(AMOUNT, stored, null), null, 'clearing is not a change of code');
  assert.equal(currencyFixed({ id: 'amount', type: 'money', currency_from: 'account.balance' }, stored, { amount: 1, currency: 'EGP' }), null);
  assert.equal(currencyFixed({ id: 'note', type: 'text', currency_fixed: true }, stored, { amount: 1, currency: 'EGP' }), null);
});

test('CURRENCY_FIXED IS A CODE THE RECORD PUBLISHES', () => {
  assert.ok((REFUSAL_CODES as readonly string[]).includes('CURRENCY_FIXED'));
  assert.equal(REFUSAL_CODES.length, 131);
});

const ACCOUNTS: Declaration = {
  id: 'register.accounts',
  kind: 'register',
  body: { id: 'accounts', name: 'Accounts', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'balance', type: 'money' }, { id: 'kind', type: 'text' }] } as never,
};
const LEDGER = (from: string): Declaration => ({
  id: 'register.transactions',
  kind: 'register',
  body: {
    id: 'transactions',
    name: 'Ledger',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'account', type: 'ref', to: 'accounts' },
      { id: 'amount', type: 'money', currency_from: from, currency_fixed: true },
    ],
  } as never,
});

test('THROUGH THE RECORD: the keys install with their account in the batch, a target that is not money does not', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(Date.UTC(2026, 9, 9, 12)));
  const wrong = await k.install([ACCOUNTS, LEDGER('account.kind')]);
  assert.equal(wrong.ok, false);
  if (!wrong.ok && 'refusal' in wrong) assert.equal(wrong.refusal.fix, 'transactions.amount takes its currency from kind of accounts, and kind is a text, which holds no currency.');
  const right = await k.install([ACCOUNTS, LEDGER('account.balance')]);
  assert.equal(right.ok, true, JSON.stringify(right));
  /* A code that was sent is kept as written, through the whole write path. */
  const kept = await k.create('transactions', { what: 'Dollar payment', amount: { amount: 2000, currency: 'USD' } }, { actor: 'p_1' });
  assert.equal(kept.ok, true, JSON.stringify(kept));
  sql.close();
});
