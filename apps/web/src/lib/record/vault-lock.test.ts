/**
 * The vault passphrase as `/vault` reads it (`vault.ts` `lockOf`, `turnLock`, `wantsPassphrase`, `withPassphrase`).
 *
 * EVERY REFUSAL BELOW IS ONE THE RECORD GIVES, by code and field: `kernel/src/api/vault-passphrase.ts` for
 * `ALREADY_KNOWN`, `RATE_LIMITED` and `NOT_IN_THIS_BUILD`, `host/src/passphrase.ts` for `REQUIRED_MISSING` at
 * `passphrase` and for a passphrase too short, and the vault gate for a sign-in older than fifteen minutes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { confirmed, lockOf, turnLock, wantsPassphrase, withPassphrase, type Locker, type Told } from './vault.ts';

const refused = (code: string, fix: string, at?: string): Told<unknown> => ({ ok: false, refusal: at ? { code, fix, at } : { code, fix } });

/** A client whose two methods answer what it was handed, and which remembers every passphrase it was sent. */
function stub(answer: Told<unknown>): Locker & { sent: string[] } {
  const sent: string[] = [];
  return {
    sent,
    async setVaultPassphrase(p) {
      sent.push(p);
      return answer;
    },
    async clearVaultPassphrase(p) {
      sent.push(p);
      return answer;
    },
  };
}

test('the probe asks with no passphrase and reads each answer the record gives as the state it means', async () => {
  const off = stub(refused('ALREADY_KNOWN', 'This vault has no passphrase to take off.', 'passphrase'));
  assert.deepEqual(await lockOf(off), { state: 'off' });
  assert.deepEqual(off.sent, [''], 'nothing a person typed is ever sent by the probe');

  assert.deepEqual(await lockOf(stub(refused('REQUIRED_MISSING', 'Type the vault’s passphrase to take it off.', 'passphrase'))), { state: 'on' });
  assert.deepEqual(await lockOf(stub(refused('RATE_LIMITED', 'Too many wrong passphrases. Wait a while, then try again.', 'passphrase'))), { state: 'on' });

  const none = 'This record has no key of its own yet, so there is nothing to put a passphrase on.';
  assert.deepEqual(await lockOf(stub(refused('NOT_IN_THIS_BUILD', none, 'passphrase'))), { state: 'none', fix: none });

  const stale = 'Sign in again to change the vault.';
  assert.deepEqual(await lockOf(stub(refused('UNAUTHORIZED', stale))), { state: 'unknown', fix: stale }, 'the gate leaves the switch saying why it cannot tell');
});

test('a change answers the vault after it, and a refusal keeps the record sentence', async () => {
  assert.deepEqual(await turnLock(stub({ ok: true, value: { on: true } }), 'on', 'a long sentence to remember'), { ok: true, lock: { state: 'on' } });
  assert.deepEqual(await turnLock(stub({ ok: true, value: { on: false } }), 'off', 'a long sentence to remember'), { ok: true, lock: { state: 'off' } });

  const short = 'A vault passphrase is at least 12 characters. A short sentence is easier to remember than a short password.';
  assert.deepEqual(await turnLock(stub(refused('OUT_OF_BOUNDS', short, 'passphrase')), 'on', 'short'), { ok: false, fix: short, lock: null });

  const wrong = 'That is not this vault’s passphrase.';
  assert.deepEqual(await turnLock(stub(refused('WRONG_KEY', wrong, 'passphrase')), 'off', 'not it'), { ok: false, fix: wrong, lock: null });
});

test('a change to where the vault already is moves the switch to match', async () => {
  const already = 'This vault already has a passphrase. Take it off with that passphrase, then set the new one.';
  assert.deepEqual(await turnLock(stub(refused('ALREADY_KNOWN', already, 'passphrase')), 'on', 'a long sentence to remember'), {
    ok: false,
    fix: already,
    lock: { state: 'on' },
  });
});

test('only a missing passphrase asks for one, and it is sent only while the vault is behind one', () => {
  assert.equal(wantsPassphrase(refused('REQUIRED_MISSING', 'Type it.', 'passphrase')), true);
  assert.equal(wantsPassphrase(refused('REQUIRED_MISSING', 'A key needs a value.', 'value')), false, 'another missing field is not the passphrase');
  assert.equal(wantsPassphrase(refused('WRONG_KEY', 'That is not this vault’s passphrase.', 'passphrase')), false);
  assert.equal(wantsPassphrase({ ok: true, value: {} }), false);

  assert.deepEqual(withPassphrase({ state: 'on' }, 'open sesame please'), { passphrase: 'open sesame please' });
  assert.deepEqual(withPassphrase({ state: 'off' }, 'open sesame please'), {}, 'a vault without one is sent the body it always was');
  assert.deepEqual(withPassphrase({ state: 'on' }, ''), {});
});

test('the confirmation is two passphrases typed the same', () => {
  assert.equal(confirmed('', ''), false);
  assert.equal(confirmed('a long sentence', 'a long sentence'), true);
  assert.equal(confirmed('a long sentence', 'a long sentance'), false);
});
