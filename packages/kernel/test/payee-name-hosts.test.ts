/**
 * A payee's name where the bank's text holds a web address, a card or terminal reference, or a cash machine: the five
 * texts a ledger read badly. ONE OF THE FIVE READS RIGHT WITH NO KEY MOVED (`ATM CASH WITHDRAWAL`). The other four
 * want a name whose key is not the key their text has today (`Talabat` is `bank:talabat` and `WWW.TALABAT.COM` is
 * `bank:wwwtalabat`), and a name never joins another payee than its text, so each waits on the key being cut at the
 * same words. Those four are written here as they are wanted and marked as waiting, and what holds today is held
 * beside them: no key moved, and every name still folds to the key its text had.
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

/** Why four of them wait: the cut has to be made in the key first, and a key that moves is his to rule. */
const WAITS = 'the key is cut at the same words first (bankKey), which moves keys already stored';

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

test('A LEADING www. AND THE WEB SUFFIX ARE CUT: WWW.TALABAT.COM reads Talabat', { todo: WAITS }, () => {
  assert.equal(payeeName('WWW.TALABAT.COM'), 'Talabat');
});

test('A PAGE AFTER THE ADDRESS IS CUT WITH IT: APPLE.COM/BILL reads Apple', { todo: WAITS }, () => {
  assert.equal(payeeName('APPLE.COM/BILL'), 'Apple');
});

test('THE CARD AND THE TERMINAL BEFORE THE NAME ARE CUT: HSBC CARD 7731 POS 55 KFC reads KFC', { todo: WAITS }, () => {
  assert.equal(payeeName('HSBC CARD 7731 POS 55 KFC'), 'KFC');
});

test('A REFERENCE IN THE MIDDLE IS CUT, and the place after it: SPOTIFY P1234 STOCKHOLM reads Spotify', { todo: WAITS }, () => {
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

test('NO KEY MOVED: the five texts hold the keys they held before this file', () => {
  const held: [string, string][] = [
    ['WWW.TALABAT.COM', 'bank:wwwtalabat'],
    ['APPLE.COM/BILL', 'bank:applecombill'],
    ['ATM CASH WITHDRAWAL', 'bank:atmcashwithdrawal'],
    ['HSBC CARD 7731 POS 55 KFC', 'bank:hsbccard7731pos55kfc'],
    ['SPOTIFY P1234 STOCKHOLM', 'bank:spotifyp1234stockholm'],
    ['TALABAT', 'bank:talabat'],
    ['KFC', 'bank:kfc'],
    ['SPOTIFY', 'bank:spotify'],
  ];
  for (const [said, key] of held) assert.equal(bankKey(said), key, said);
});

test('A WANTED NAME THAT WOULD JOIN ANOTHER PAYEE IS NOT SHOWN YET: the four that wait read as a name, never empty', () => {
  for (const [said, wanted] of WANTED) {
    const name = payeeName(said);
    assert.match(name, /\p{L}/u, said);
    if (name !== wanted) assert.notEqual(bankKey(wanted), bankKey(said), `${said} could already read ${wanted}`);
  }
});
