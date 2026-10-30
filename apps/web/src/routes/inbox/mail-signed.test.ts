/**
 * Whether the newest mail was signed, said on the Inbox's Mail well. The kernel stores mail it could not
 * check with its `UNVERIFIED` reason and never matches it, so that reason is the whole of the answer.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UNVERIFIED } from '@braindog/kernel';
import { mailSignedOf, signedWords, sourcesOf, unsignedOf } from './sources.ts';

const NOW = Date.parse('2026-10-15T12:00:00Z');

test('a mail with the kernel reason is said unsigned, and one without it signed', () => {
  assert.equal(mailSignedOf({ reason: UNVERIFIED }), 'The last mail was not signed, so it cannot be matched. Check the forwarding.');
  assert.equal(mailSignedOf({ reason: null }), 'The sender signed the last mail');
  assert.equal(mailSignedOf({ reason: 'a rule archived it' }), signedWords.signed);
});

test('no mail, or a read that did not carry the reason, says nothing', () => {
  assert.equal(mailSignedOf(null), null);
  assert.equal(mailSignedOf({}), null);
});

test('the Mail well says it of the newest mail, whatever order the read came in', () => {
  const ways = sourcesOf(
    [
      { channel: 'email', ts: '2026-10-14T09:00:00Z', reason: null },
      { channel: 'email', ts: '2026-10-15T08:00:00Z', reason: UNVERIFIED },
      { channel: 'webhook', ts: '2026-10-15T10:00:00Z', reason: UNVERIFIED },
      { channel: 'email', ts: '2026-10-13T09:00:00Z', reason: null },
    ],
    NOW,
  );
  const mail = ways.find((w) => w.channel === 'email');
  assert.equal(mail?.signed, signedWords.unsigned);
  assert.equal(ways.find((w) => w.channel === 'webhook')?.signed, undefined, 'only Mail says it');
});

test('a signed newest mail says so; an unsigned older one does not count', () => {
  const ways = sourcesOf(
    [
      { channel: 'email', ts: '2026-10-12T09:00:00Z', reason: UNVERIFIED },
      { channel: 'email', ts: '2026-10-15T07:00:00Z', reason: null },
    ],
    NOW,
  );
  assert.equal(ways.find((w) => w.channel === 'email')?.signed, signedWords.signed);
});

test('arrivals read without their reason, and a Mail well nothing came by, say nothing', () => {
  const read = sourcesOf([{ channel: 'email', ts: '2026-10-15T07:00:00Z' }], NOW);
  assert.equal(read.find((w) => w.channel === 'email')?.signed, undefined);
  const quiet = sourcesOf([], NOW);
  assert.equal(quiet.find((w) => w.channel === 'email')?.signed, undefined);
});

test('neither line has an em dash', () => {
  for (const line of Object.values(signedWords)) assert.doesNotMatch(line, /—/u);
});

test('each sender whose newest mail came unsigned is named once, in one sentence (sec-follow M2)', () => {
  const ways = sourcesOf(
    [
      { channel: 'email', ts: '2026-10-15T09:00:00Z', reason: UNVERIFIED, from: '"HSBC Alerts" <alerts@hsbc.example>' },
      { channel: 'email', ts: '2026-10-15T08:00:00Z', reason: UNVERIFIED, from: 'alerts@hsbc.example' },
      { channel: 'email', ts: '2026-10-15T10:00:00Z', reason: null, from: 'Sara <sara@acme.example>' },
      /* A SENDER WHOSE NEWEST MAIL WAS SIGNED IS NOT NAMED, whatever came before it. */
      { channel: 'email', ts: '2026-10-14T08:00:00Z', reason: UNVERIFIED, from: 'bills@power.example' },
      { channel: 'email', ts: '2026-10-15T07:00:00Z', reason: null, from: 'bills@power.example' },
    ],
    NOW,
  );
  const mail = ways.find((w) => w.channel === 'email');
  const said = "Mail from HSBC Alerts isn't signed as it arrives, so it waits here to be filed by hand.";
  assert.equal(mail?.unsigned, said);
  assert.equal(mail?.signed, said, 'said once, in place of the line about the last mail');
});

test('no unsigned sender says nothing new, and several are named two at a time', () => {
  const ways = sourcesOf([{ channel: 'email', ts: '2026-10-15T07:00:00Z', reason: null, from: 'sara@acme.example' }], NOW);
  assert.equal(ways.find((w) => w.channel === 'email')?.unsigned, undefined);
  assert.equal(unsignedOf([]), null);
  assert.equal(unsignedOf(['a@x.example', 'b@y.example']), "Mail from a@x.example and b@y.example isn't signed as it arrives, so it waits here to be filed by hand.");
  assert.equal(unsignedOf(['A', 'B', 'C', 'D']), "Mail from A, B and 2 more isn't signed as it arrives, so it waits here to be filed by hand.");
});
