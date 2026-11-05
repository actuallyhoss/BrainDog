/**
 * The six digits Apple's reviewer signs in with (`AuthConfig.review`), and the count on letters asked for from an app,
 * which has no bot check in front of it.
 */

import { createHash } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createDirectory } from '../src/directory.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 10, 5, 12);
const CODE = '314159';
const VERIFIER = 'v'.repeat(43);
const APP = createHash('sha256').update(VERIFIER).digest('base64url');

function setup(review = true) {
  const d = createDirectory(openSqlite(), fixedClock(NOW), {
    mac: new Uint8Array(32).fill(7),
    magic: true,
    ...(review ? { review: { email: 'review@brain.dog', code: CODE } } : {}),
  });
  assert.ok(d.person$('review@brain.dog', 'App Review').ok);
  assert.ok(d.person$('ada@example.com', 'Ada').ok);
  return d;
}

test('THE REVIEWER SIGNS IN WITH THE SET DIGITS, AND NO LETTER GOES OUT', async () => {
  const d = setup();
  const sent = await d.auth({ flow: 'magic.start', email: 'Review@brain.dog', app: APP, ip: '203.0.113.1' });
  assert.equal(sent.status, 200);
  assert.equal(sent.status === 200 ? sent.mail : 'refused', undefined);
  assert.equal((await d.auth({ flow: 'app.code', code: CODE, verifier: VERIFIER, ip: '203.0.113.1' })).status, 200);
});

test('THE DIGITS NEED THE VERIFIER, AND SPEND ONCE', async () => {
  const d = setup();
  await d.auth({ flow: 'magic.start', email: 'review@brain.dog', app: APP, ip: '203.0.113.1' });
  assert.notEqual((await d.auth({ flow: 'app.code', code: CODE, verifier: 'w'.repeat(43), ip: '203.0.113.1' })).status, 200);
  assert.equal((await d.auth({ flow: 'app.code', code: CODE, verifier: VERIFIER, ip: '203.0.113.1' })).status, 200);
  assert.notEqual((await d.auth({ flow: 'app.code', code: CODE, verifier: VERIFIER, ip: '203.0.113.1' })).status, 200);
});

test('NOBODY ELSE GETS THE DIGITS, AND NOTHING SIGNS IN WITH THEM UNSET', async () => {
  const on = setup();
  const ada = await on.auth({ flow: 'magic.start', email: 'ada@example.com', app: APP, ip: '203.0.113.1' });
  const mailed = ada.status === 200 && ada.mail && 'appCode' in ada.mail ? ada.mail.appCode : assert.fail('no code');
  if (mailed !== CODE) assert.notEqual((await on.auth({ flow: 'app.code', code: CODE, verifier: VERIFIER, ip: '203.0.113.1' })).status, 200);

  const off = setup(false);
  const sent = await off.auth({ flow: 'magic.start', email: 'review@brain.dog', app: APP, ip: '203.0.113.1' });
  assert.ok(sent.status === 200 && sent.mail, 'with the secret unset the reviewer is an address like any other');
});

test('A WEB REQUEST FOR THE REVIEWER IS ONLY A LINK, NEVER THE DIGITS', async () => {
  const d = setup();
  const sent = await d.auth({ flow: 'magic.start', email: 'review@brain.dog', ip: '203.0.113.1' });
  assert.ok(sent.status === 200 && sent.mail && 'linkToken' in sent.mail && !('appCode' in sent.mail));
});

test('ONE MAILBOX GETS SIX LETTERS AN HOUR FROM AN APP', async () => {
  const d = setup();
  let letters = 0;
  for (let i = 0; i < 9; i += 1) {
    const sent = await d.auth({ flow: 'magic.start', email: 'ada@example.com', app: APP, ip: `203.0.113.${i + 1}` });
    assert.equal(sent.status, 200, 'a full mailbox answers as a sent letter does');
    if (sent.status === 200 && sent.mail) letters += 1;
  }
  assert.equal(letters, 6);
});
