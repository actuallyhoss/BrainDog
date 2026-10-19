/**
 * A payee's name where the bank's text holds a web address, a card or terminal reference, or a cash machine: the five
 * texts a ledger read badly. The key is cut at the same words (`bankKey`), so a name joins no other payee than its text.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bankKey, payeeName } from '../src/identity-keys.ts';

/** The five texts, each with the name it should read as. */
const WANTED: [string, string][] = [
  ['WWW.TALABAT.COM', 'Talabat'],
  ['APPLE.COM/BILL', 'Apple'],
  ['ATM CASH WITHDRAWAL', 'ATM Cash Withdrawal'],
  ['HSBC CARD 7731 POS 55 KFC', 'KFC'],
  ['SPOTIFY P1234 STOCKHOLM', 'Spotify'],
];


test('A CASH MACHINE IS INITIALS: ATM stays capitals wherever it stands in a bank text', () => {
  assert.equal(payeeName('ATM CASH WITHDRAWAL'), 'ATM Cash Withdrawal');
  assert.equal(payeeName('ATM'), 'ATM');
  assert.equal(payeeName('atm cash withdrawal'), 'ATM Cash Withdrawal');
  assert.equal(payeeName('CIB ATM MAADI'), 'CIB ATM');
  assert.equal(payeeName('BANQUE MISR ATM 0042 CAIRO EG'), 'Banque Misr ATM');
  /* A MARK BESIDE IT DOES NOT HIDE IT: brackets, a hyphen and a slash leave it initials. */
  assert.equal(payeeName('NBE (ATM) WDL'), 'NBE (ATM) WDL');
  assert.equal(payeeName('ATM-CAIRO'), 'ATM-Cairo');
  assert.equal(payeeName('ATM/CASH'), 'ATM/Cash');
  /* A NAME SOMEBODY WROTE IS STILL KEPT AS WRITTEN, and a longer word that starts the same is a word. */
  assert.equal(payeeName('Atm Fees'), 'Atm Fees');
  assert.equal(payeeName('ATMOSPHERE CAFE'), 'Atmosphere Cafe');
});

test('A LEADING www. AND THE WEB SUFFIX ARE CUT: WWW.TALABAT.COM reads Talabat', () => {
  assert.equal(payeeName('WWW.TALABAT.COM'), 'Talabat');
});

test('A PAGE AFTER THE ADDRESS IS CUT WITH IT: APPLE.COM/BILL reads Apple', () => {
  assert.equal(payeeName('APPLE.COM/BILL'), 'Apple');
});

test('THE CARD AND THE TERMINAL BEFORE THE NAME ARE CUT: HSBC CARD 7731 POS 55 KFC reads KFC', () => {
  assert.equal(payeeName('HSBC CARD 7731 POS 55 KFC'), 'KFC');
});

test('A REFERENCE IN THE MIDDLE IS CUT, and the place after it: SPOTIFY P1234 STOCKHOLM reads Spotify', () => {
  assert.equal(payeeName('SPOTIFY P1234 STOCKHOLM'), 'Spotify');
});

test('THE KEY OF EACH NAME IS THE KEY ITS TEXT HAS, so no payee joins another', () => {
  for (const [said] of WANTED) {
    assert.notEqual(bankKey(said), null, said);
    assert.equal(bankKey(payeeName(said)), bankKey(said), `${said} read as ${payeeName(said)}`);
  }
  for (const said of ['NBE (ATM) WDL', 'ATM-CAIRO', 'ATM/CASH', 'ATM', 'atm cash withdrawal', 'CIB ATM MAADI', 'BANQUE MISR ATM 0042 CAIRO EG', 'Atm Fees', 'ATMOSPHERE CAFE'])
    assert.equal(bankKey(payeeName(said)), bankKey(said), `${said} read as ${payeeName(said)}`);
});

test('THE FOUR WEB AND CARD TEXTS HAVE THE KEY OF THE NAME THEY READ AS', () => {
  const held: [string, string][] = [
    ['WWW.TALABAT.COM', 'bank:talabat'],
    ['APPLE.COM/BILL', 'bank:apple'],
    ['ATM CASH WITHDRAWAL', 'bank:atmcashwithdrawal'],
    ['HSBC CARD 7731 POS 55 KFC', 'bank:kfc'],
    ['SPOTIFY P1234 STOCKHOLM', 'bank:spotify'],
    ['TALABAT', 'bank:talabat'],
    ['KFC', 'bank:kfc'],
    ['SPOTIFY', 'bank:spotify'],
  ];
  for (const [said, key] of held) assert.equal(bankKey(said), key, said);
});

test('EVERY WANTED NAME IS SHOWN, never empty', () => {
  for (const [said, wanted] of WANTED) {
    const name = payeeName(said);
    assert.match(name, /\p{L}/u, said);
    if (name !== wanted) assert.notEqual(bankKey(wanted), bankKey(said), `${said} could already read ${wanted}`);
  }
});
