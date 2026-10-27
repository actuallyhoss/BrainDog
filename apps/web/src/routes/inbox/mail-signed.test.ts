/**
 * Whether the newest mail was signed, said on the Inbox's Mail well. The kernel stores mail it could not
 * check with its `UNVERIFIED` reason and never matches it, so that reason is the whole of the answer.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UNVERIFIED } from '@braindog/kernel';
import { mailSignedOf, signedWords, sourcesOf } from './sources.ts';

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
