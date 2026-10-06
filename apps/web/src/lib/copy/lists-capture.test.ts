/**
 * The capture line keeps a name's case and says the article a person says before it: "Add an HSBC card", never
 * "Add a hsbc card".
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lists } from './lists.ts';

test('A NAME IN CAPITALS KEEPS ITS CASE, and the article follows the first letter as it is said', () => {
  assert.equal(lists.captureIn('HSBC card'), 'Add an HSBC card');
  assert.equal(lists.captureIn('SMS'), 'Add an SMS', 'S is said "ess"');
  assert.equal(lists.captureIn('NHS letter'), 'Add an NHS letter');
  assert.equal(lists.captureIn('FX trade'), 'Add an FX trade');
  assert.equal(lists.captureIn('BBC licence'), 'Add a BBC licence', 'B is said "bee"');
  assert.equal(lists.captureIn('UK address'), 'Add a UK address', 'U is said "you"');
  assert.equal(lists.captureIn('EU grant'), 'Add an EU grant');
});

test('A WORD IN CAPITALS THAT IS SAID AS A WORD TAKES THE WORD’S ARTICLE', () => {
  assert.equal(lists.captureIn('SIM card'), 'Add a SIM card');
  assert.equal(lists.captureIn('PIN'), 'Add a PIN');
  assert.equal(lists.captureIn('ISA'), 'Add an ISA');
});

test('A NAME WITH A CAPITAL INSIDE IT, OR AFTER THE FIRST WORD, KEEPS ITS CASE', () => {
  assert.equal(lists.captureIn('GitHub repo'), 'Add a GitHub repo');
  assert.equal(lists.captureIn('eBay order'), 'Add an eBay order');
  assert.equal(lists.captureIn('card from Monzo'), 'Add a card from Monzo');
});

test('A FIRST WORD CAPITALISED AS A SENTENCE OPENS IS LOWERED, and a common noun reads as it did', () => {
  assert.equal(lists.captureIn('Item'), 'Add an item');
  assert.equal(lists.captureIn('Bank card'), 'Add a bank card');
  assert.equal(lists.captureIn('invoice'), 'Add an invoice');
  assert.equal(lists.captureIn('user'), 'Add a user');
  assert.equal(lists.captureIn('hour'), 'Add an hour');
});

test('A CAPITAL U IS SAID "YOU", spelled or said as a word', () => {
  assert.equal(lists.captureIn('URL'), 'Add a URL');
  assert.equal(lists.captureIn('USB stick'), 'Add a USB stick');
});
