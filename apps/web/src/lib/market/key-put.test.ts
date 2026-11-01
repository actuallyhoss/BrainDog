/**
 * RF3: A KEY PUT IN FROM THE PLAN SHEET ON A SIGN-IN TOO OLD FOR THE KEYCHAIN IS PROVED AGAIN IN PLACE AND SENT ONCE
 * MORE, where a passkey can prove it, and offers the sign-in page where none can. Any other refusal is said as it was.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { keyPut } from './key-put.ts';

const STALE = { ok: false as const, refusal: { code: 'NEEDS_BROWSER_SESSION', fix: 'Sign in again to open the keychain.', at: 'proof' } };
const auth = (passkey: boolean, proves = true) => ({
  support: () => ({ webauthn: true, secure: true }),
  methods: async () => ({ ok: true as const, value: { passkey } }),
  passkeySignIn: async () => ({ ok: proves }),
});
/** A door that answers each put in turn, and counts them. */
const door = (...answers: unknown[]) => {
  let n = 0;
  const send = async () => answers[Math.min(n++, answers.length - 1)] as never;
  return { send, sent: () => n };
};

test('A STALE SIGN-IN PROVED BY A PASSKEY SENDS THE SAME KEY ONCE MORE, and it goes in', async () => {
  const d = door(STALE, { ok: true, value: { label: 'stripe' } });
  assert.deepEqual(await keyPut(d.send, auth(true), 'raced'), { ok: true });
  assert.equal(d.sent(), 2);
});

test('WITH NO PASSKEY THE SHEET IS HANDED THE SIGN-IN PAGE, and nothing is sent again', async () => {
  const d = door(STALE);
  const before = globalThis.location;
  (globalThis as { location?: unknown }).location = { pathname: '/app/addons/stripe', search: '' };
  try {
    const out = await keyPut(d.send, auth(false), 'raced');
    assert.equal(out.ok, false);
    assert.equal(!out.ok && out.fix, 'Sign in again to open the keychain.');
    assert.match((!out.ok && out.signin) || '', /\/signin\?next=%2Fapp%2Faddons%2Fstripe$/u);
  } finally {
    (globalThis as { location?: unknown }).location = before;
  }
  assert.equal(d.sent(), 1);
});

test('A PASSKEY PROMPT SHUT SENDS NOTHING AGAIN, and one still stale after proving is said, not looped', async () => {
  const shut = door(STALE);
  assert.equal((await keyPut(shut.send, auth(true, false), 'raced')).ok, false);
  assert.equal(shut.sent(), 1);
  const still = door(STALE, STALE);
  const out = await keyPut(still.send, auth(true), 'raced');
  assert.equal(out.ok, false);
  assert.equal(still.sent(), 2);
});

test('ANY OTHER REFUSAL IS SAID AS IT WAS: a password wanted, a wrong one, and a request that answered nothing', async () => {
  const pass = door({ ok: false, refusal: { code: 'REQUIRED_MISSING', fix: 'Type the Keychain password.', at: 'passphrase' } });
  assert.deepEqual(await keyPut(pass.send, auth(true), 'raced'), { ok: false, fix: 'Type the Keychain password.', pass: true });
  const wrong = door({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'That password is not it.', at: 'passphrase' } });
  assert.deepEqual(await keyPut(wrong.send, auth(true), 'raced'), { ok: false, fix: 'That password is not it.' });
  const none = door(null);
  assert.deepEqual(await keyPut(none.send, auth(true), 'raced'), { ok: false, fix: 'raced' });
});
