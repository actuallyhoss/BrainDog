/**
 * A money field's two currency keys at install: `currency_from`, a link of the same list and a money
 * field of the list it points at, and `currency_fixed`, a code that never changes once a row holds it.
 *
 * BEFORE: neither key existed, so a Ledger amount could not say its code is its account's, and the only lock a field
 * could declare was on the whole field. Now both install on a money field, and each way to declare them wrong is
 * refused in its own sentence: on a field that is not money, through a link that is not one, or onto a target that
 * holds no currency.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validate, type Known } from '../src/declare.ts';
import type { Declaration } from '../src/index.ts';

const ACCOUNTS = {
  id: 'accounts',
  name: 'Accounts',
  title: 'name',
  fields: [
    { id: 'name', type: 'text', required: true },
    { id: 'balance', type: 'money' },
    { id: 'note', type: 'text' },
  ],
};

const installed: Known = new Map([['register.accounts', ACCOUNTS as never]]);

const ledger = (amount: Record<string, unknown>, more: Record<string, unknown>[] = []): Declaration =>
  ({
    id: 'register.transactions',
    kind: 'register',
    body: {
      id: 'transactions',
      name: 'Ledger',
      title: 'what',
      fields: [
        { id: 'what', type: 'text', required: true },
        { id: 'account', type: 'ref', to: 'accounts' },
        { id: 'tags', type: 'list', of: 'ref', to: 'accounts' },
        { id: 'amount', type: 'money', ...amount },
        ...more,
      ],
    },
  }) as never;

test('BOTH KEYS INSTALL ON A MONEY FIELD, the link naming a money field of its list', () => {
  assert.equal(validate(ledger({ currency_from: 'account.balance', currency_fixed: true }), installed), null);
  assert.equal(validate(ledger({ currency_from: 'account.balance' }), installed), null);
  assert.equal(validate(ledger({ currency_fixed: true }), installed), null);
  /* A list the batch does not hold is checked when it is: the link is still a link. */
  assert.equal(validate(ledger({ currency_from: 'account.balance' })), null);
});

test('ON A FIELD THAT IS NOT MONEY, either key is refused, and the sentence names the key', () => {
  for (const key of [{ currency_from: 'account.balance' }, { currency_fixed: true }]) {
    const out = validate(ledger({}, [{ id: 'paid', type: 'int', ...key }]), installed);
    const name = Object.keys(key)[0]!;
    assert.equal(out?.code, 'DECLARATION_INVALID', name);
    assert.equal(out?.at, `paid.${name}`);
    assert.equal(out?.fix, `transactions.paid is an int, and ${name} is for a money field.`);
  }
});

test('CURRENCY_FIXED IS TRUE OR LEFT OUT', () => {
  const out = validate(ledger({ currency_fixed: 'yes' }), installed);
  assert.equal(out?.code, 'DECLARATION_INVALID');
  assert.equal(out?.fix, 'transactions.amount: currency_fixed is true or left out.');
});

test('A LINK THAT IS NOT ONE is refused: no such field, a field of another type, a list of links, or no dot', () => {
  const said = (from: unknown) => validate(ledger({ currency_from: from }), installed)?.fix;
  assert.equal(said('wallet.balance'), 'transactions.amount takes its currency from wallet, and transactions has no field called wallet.');
  assert.equal(said('what.balance'), 'transactions.amount takes its currency from what, and what is a text, not a link to one entry.');
  assert.equal(said('tags.balance'), 'transactions.amount takes its currency from tags, and tags is a list, not a link to one entry.');
  for (const shape of ['account', 'account.balance.amount', 7, 'Account.balance'])
    assert.equal(said(shape), 'transactions.amount: currency_from names a link of transactions and a money field of the list it points at, like account.balance.', String(shape));
});

test('A TARGET THAT IS NOT MONEY is refused, missing or holding no currency', () => {
  const said = (from: string) => validate(ledger({ currency_from: from }), installed);
  assert.equal(said('account.limit')?.fix, 'transactions.amount takes its currency from limit of accounts, and accounts has no such field.');
  assert.equal(said('account.note')?.fix, 'transactions.amount takes its currency from note of accounts, and note is a text, which holds no currency.');
  assert.equal(said('account.note')?.at, 'amount.currency_from');
});

test('A LIST POINTING AT ITSELF is checked against its own fields', () => {
  const self = (target: string): Declaration =>
    ({
      id: 'register.transactions',
      kind: 'register',
      body: {
        id: 'transactions',
        name: 'Ledger',
        title: 'what',
        fields: [
          { id: 'what', type: 'text', required: true },
          { id: 'parent', type: 'ref', to: 'transactions' },
          { id: 'total', type: 'money' },
          { id: 'amount', type: 'money', currency_from: `parent.${target}` },
        ],
      },
    }) as never;
  assert.equal(validate(self('total')), null);
  assert.equal(validate(self('what'))?.fix, 'transactions.amount takes its currency from what of transactions, and what is a text, which holds no currency.');
});
