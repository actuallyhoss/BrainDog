/**
 * The keys sign-up's brakes count by (audit 34 finding 3): one /64 is one place, and one mailbox is one address
 * however it is spelt.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ipBucket, mailCanon } from '../src/signup-keys.ts';

test('EVERY SPELLING OF ONE IPv6 /64 IS ONE KEY: compressed, full, upper case, zone and brackets', () => {
  const forms = [
    '2001:db8:0:1::7',
    '2001:0db8:0000:0001:0000:0000:0000:0007',
    '2001:DB8:0:1:ffff:ffff:ffff:ffff',
    '2001:db8:0:1:a:b:c:d',
    '[2001:db8:0:1::1]',
    '2001:db8:0:1::1%eth0',
    ' 2001:db8:0:1:: ',
    '2001:db8:0:1::192.0.2.1',
  ];
  for (const f of forms) assert.equal(ipBucket(f), '2001:db8:0:1::/64', f);
});

test('A NEIGHBOURING /64 IS ITS OWN KEY', () => {
  assert.notEqual(ipBucket('2001:db8:0:1::1'), ipBucket('2001:db8:0:2::1'));
  assert.equal(ipBucket('2001:db8:0:2::1'), '2001:db8:0:2::/64');
});

test('ZEROS AT THE END OF THE PREFIX FOLD THE SAME WAY however they were typed', () => {
  assert.equal(ipBucket('2001:db8::1'), '2001:db8::/64');
  assert.equal(ipBucket('2001:0db8:0000:0000:1234::'), '2001:db8::/64');
  assert.equal(ipBucket('::1'), '::/64');
});

test('IPv4 STAYS WHOLE, and IPv4 written as IPv6 is that IPv4 address', () => {
  assert.equal(ipBucket('203.0.113.7'), '203.0.113.7');
  assert.notEqual(ipBucket('203.0.113.7'), ipBucket('203.0.113.8'));
  assert.equal(ipBucket('::ffff:203.0.113.7'), '203.0.113.7');
  assert.equal(ipBucket('::ffff:cb00:7107'), '203.0.113.7');
});

test('AN EMPTY ADDRESS STAYS EMPTY, so every caller without one shares one key; junk is kept as it came', () => {
  assert.equal(ipBucket(''), '');
  assert.equal(ipBucket('   '), '');
  assert.equal(ipBucket('Not An Address'), 'not an address');
  assert.equal(ipBucket('1:2:3'), '1:2:3');
  assert.equal(ipBucket('1::2::3'), '1::2::3');
});

test('CASE, DOTS AND A PLUS TAG FOLD to one Gmail mailbox, and googlemail is gmail', () => {
  const forms = ['ann.lee@gmail.com', 'AnnLee@Gmail.com', ' annlee+signup@gmail.com ', 'a.n.n.l.e.e+1+2@googlemail.com', 'ANN.LEE@GOOGLEMAIL.COM'];
  for (const f of forms) assert.equal(mailCanon(f), 'annlee@gmail.com', f);
});

test('A PLUS TAG IS DROPPED ON EVERY HOST, and case folds there too', () => {
  assert.equal(mailCanon('Ann+1@Example.com'), 'ann@example.com');
  assert.equal(mailCanon('ann+2@example.com'), mailCanon('ann@example.com'));
});

test('A DOT OFF GMAIL STAYS, because other hosts read it', () => {
  assert.equal(mailCanon('ann.lee@example.com'), 'ann.lee@example.com');
  assert.notEqual(mailCanon('ann.lee@example.com'), mailCanon('annlee@example.com'));
  assert.equal(mailCanon('ann.lee@mail.gmail.com.example'), 'ann.lee@mail.gmail.com.example');
});

test('A STRING WITH NO @ IS KEPT, trimmed and lower-cased', () => {
  assert.equal(mailCanon('  Someone '), 'someone');
  assert.equal(mailCanon(''), '');
});
