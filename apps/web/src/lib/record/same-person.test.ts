/**
 * Adding somebody a person already here answers to asks first (audit 31 Oct m, AM18).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sameAsked, samePerson } from './same-person.ts';

test('"Salma Fathy" beside Salma is asked about, with her fuller name to keep', () => {
  assert.deepEqual(samePerson('Salma Fathy', [{ seq: 2, name: 'Nadia' }, { seq: 3, name: 'Salma' }]), { seq: 3, name: 'Salma', longer: true });
  assert.deepEqual(samePerson('salma', [{ seq: 3, name: 'Salma Fathy' }]), { seq: 3, name: 'Salma Fathy', longer: false });
  assert.equal(sameAsked('Salma', 'Client'), 'Is this Salma, the client already here?');
  assert.equal(sameAsked('Salma', null), 'Is this the Salma already here?');
});

test('two surnames are two people, and two Salmas already here is no one-line question', () => {
  assert.equal(samePerson('Salma Fathy', [{ seq: 3, name: 'Salma Samir' }]), null);
  assert.equal(samePerson('Salma Fathy', [{ seq: 3, name: 'Salma' }, { seq: 4, name: 'Salma' }]), null);
  assert.equal(samePerson('Omar', [{ seq: 3, name: 'Salma' }]), null);
});
