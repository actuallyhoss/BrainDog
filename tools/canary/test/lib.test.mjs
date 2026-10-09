/**
 * What every part of the canary shares (`../lib.mjs`): where it is, the session it reads, and the passkey's one shape.
 */

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { readCredential } from '../../gates/signin-live.mjs';
import { cookieFor, endSession, LIVE_ORIGIN, packCredential, sessionPath, unpackCredential, where } from '../lib.mjs';

const CREDENTIAL = { credentialId: 'Y3JlZA', isResidentCredential: true, rpId: 'brain.dog', privateKey: 'cHJpdmF0ZS1rZXktbm90LXJlYWw', userHandle: 'cF9vd25lcg', signCount: 4, extra: 'dropped' };

test('the canary is self-host only until SMOKE_SLUG names it, and then only on https', () => {
  assert.deepEqual(where({}), { live: false });
  assert.deepEqual(where({ SMOKE_SLUG: ' ' }), { live: false });
  assert.deepEqual(where({ SMOKE_SLUG: 'ops' }), { live: true, origin: LIVE_ORIGIN, slug: 'ops' });
  assert.deepEqual(where({ SMOKE_SLUG: 'ops', CANARY_ORIGIN: 'https://alpha.brain.dog/x' }), { live: true, origin: 'https://alpha.brain.dog', slug: 'ops' });
  assert.throws(() => where({ SMOKE_SLUG: 'Ops!' }), /not a record's name/u);
  assert.throws(() => where({ SMOKE_SLUG: 'ops', CANARY_ORIGIN: 'http://brain.dog' }), /not https/u);
});

test('a kept session gives the cookie for the canary’s own host, and nothing for another, a deeper path or a lapsed one', () => {
  const now = Date.parse('2026-10-09T12:00:00Z');
  const state = {
    cookies: [
      { name: 'bd_s', value: 'live', domain: 'brain.dog', path: '/', expires: now / 1000 + 3600 },
      { name: 'other', value: 'x', domain: 'example.com', path: '/' },
      { name: 'deep', value: 'x', domain: 'brain.dog', path: '/app' },
      { name: 'old', value: 'x', domain: '.brain.dog', path: '/', expires: now / 1000 - 1 },
    ],
  };
  assert.equal(cookieFor(state, 'https://brain.dog', now), 'bd_s=live');
  assert.equal(cookieFor(state, 'https://example.org', now), null);
  assert.equal(cookieFor({}, 'https://brain.dog', now), null);
});

test('the passkey keeps only what addCredential takes, comes back whole, and signin-live reads it', () => {
  const packed = packCredential(CREDENTIAL);
  assert.doesNotMatch(packed, /[+/=]/u, 'base64url, so it survives a secret store and a shell');
  const back = unpackCredential(packed);
  assert.deepEqual(back, { credentialId: 'Y3JlZA', isResidentCredential: true, rpId: 'brain.dog', privateKey: 'cHJpdmF0ZS1rZXktbm90LXJlYWw', userHandle: 'cF9vd25lcg', signCount: 4 });
  const read = readCredential(packed);
  assert.equal(read.ok, true, read.why);
  assert.equal(read.value.credentialId, CREDENTIAL.credentialId);
  assert.equal(read.value.rpId, 'brain.dog');
  for (const f of ['credentialId', 'rpId', 'privateKey', 'userHandle']) assert.throws(() => packCredential({ ...CREDENTIAL, [f]: '' }), new RegExp(f, 'u'));
  assert.throws(
    () => unpackCredential('bm90LWEta2V5'),
    (e) => !e.message.includes('bm90') && /enrol\.mjs/u.test(e.message),
    'a refusal never quotes the value',
  );
});

test('the lane keeps the session in the runner’s temporary folder, never under LANE_OUT', () => {
  assert.equal(sessionPath({ CANARY_SESSION: '/x/s.json', LANE_OUT: '/out' }), '/x/s.json');
  const kept = sessionPath({ RUNNER_TEMP: '/runner/tmp', LANE_OUT: '/runner/tmp/lane' });
  assert.equal(kept, join('/runner/tmp', 'braindog-canary', 'session.json'));
  assert.ok(!kept.startsWith('/runner/tmp/lane'));
  assert.ok(sessionPath({}).startsWith(tmpdir()));
});

test('a session is ended through the product’s door and its file removed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'canary-lib-'));
  try {
    const file = join(dir, 'session.json');
    writeFileSync(file, '{}');
    const sent = [];
    const ended = await endSession('https://brain.dog', 'bd_s=live', file, async (url, init) => {
      sent.push({ url, init });
      return { status: 200 };
    });
    assert.equal(ended, true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].url, 'https://brain.dog/auth/logout');
    assert.equal(sent[0].init.method, 'POST');
    assert.equal(sent[0].init.headers.cookie, 'bd_s=live');
    assert.equal(sent[0].init.headers.origin, 'https://brain.dog');
    assert.equal(existsSync(file), false);
    assert.equal(await endSession('https://brain.dog', null, file, async () => assert.fail('nothing to end')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
