/**
 * Money out reads as out: on a phone the ledger's amounts carried no sign, so a bill, a
 * shop and a salary paid in read alike. A list's amount says which way it went as Money's page says it, "−EGP 279.03"
 * and "+EGP 600.00", from the field that says which way.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { signedSaid, wayField, wayOf } from './money-way.ts';
import type { RegisterDecl } from './schema.ts';

const TILL = {
  id: 'till',
  name: 'Till',
  one: 'line',
  title: 'what',
  state: 'state',
  mobile: ['what', 'amount', 'on'],
  fields: [
    { id: 'what', type: 'text' },
    { id: 'on', type: 'day' },
    { id: 'direction', type: 'enum', values: ['in', 'out'], required: true },
    { id: 'amount', type: 'money' },
    { id: 'kept', type: 'money' },
    { id: 'state', type: 'enum', values: ['pending', 'cleared'], required: true },
  ],
} as unknown as RegisterDecl;

const OWED = {
  ...TILL,
  id: 'owed',
  fields: [
    { id: 'what', type: 'text' },
    { id: 'direction', type: 'enum', values: ['owed_to_me', 'owed_by_me'], required: true },
    { id: 'amount', type: 'money' },
  ],
} as unknown as RegisterDecl;

const PLAIN = { ...TILL, id: 'plain', fields: [{ id: 'what', type: 'text' }, { id: 'amount', type: 'money' }] } as unknown as RegisterDecl;

test('THE FIELD THAT SAYS WHICH WAY IS READ FROM THE DECLARATION, for the amount the list leads with', () => {
  assert.equal(wayField(TILL)?.id, 'direction');
  assert.equal(wayField(PLAIN), undefined, 'a list that says no way has no sign');
});

test('A ROW GOES OUT OR COMES IN BY ITS OWN WORD, and a row that says neither has no way', () => {
  assert.equal(wayOf(TILL, { direction: 'out' }), 'out');
  assert.equal(wayOf(TILL, { direction: 'in' }), 'in');
  assert.equal(wayOf(OWED, { direction: 'owed_by_me' }), 'out');
  assert.equal(wayOf(OWED, { direction: 'owed_to_me' }), 'in');
  assert.equal(wayOf(TILL, {}), null);
  assert.equal(wayOf(PLAIN, { direction: 'out' }), null);
});

test('THE AMOUNT CARRIES THE SIGN, as Money says it, and never twice', () => {
  assert.equal(signedSaid('EGP 279.03', 'out'), '−EGP 279.03');
  assert.equal(signedSaid('EGP 600.00', 'in'), '+EGP 600.00');
  assert.equal(signedSaid('−EGP 5.00', 'out'), '−EGP 5.00', 'an amount already signed is not signed again');
  assert.equal(signedSaid('EGP 5.00', null), 'EGP 5.00');
});

test('THE LIST AND THE PHONE CARDS BOTH SAY THE WAY', () => {
  const list = readFileSync(new URL('../../routes/r/[register]/+page.svelte', import.meta.url), 'utf8');
  assert.match(list, /signedSaid\(/u);
  const cards = readFileSync(new URL('../ui/RowCards.svelte', import.meta.url), 'utf8');
  assert.match(cards, /wayOf\(/u);
});
