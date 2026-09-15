/**
 * The Worker's key store: where the root key comes from, and that a wrapping opens only for its own record and purpose.
 *
 * EVERY ROOT KEY HERE IS MADE IN MEMORY FOR ONE TEST AND DROPPED. None is a real key, none is written anywhere.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { aad, isBound, keyStoreOf, recordKeys, unwrap, wrap } from '../src/keys.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const OTHER = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAE';

/** 32 random bytes, per call. */
const bytes = (): Uint8Array => crypto.getRandomValues(new Uint8Array(32));
const hex = (b: Uint8Array): string => Buffer.from(b).toString('hex');

test('NOTHING BOUND IS NO STORE, and an empty secret is nothing bound', async () => {
  assert.equal(await keyStoreOf(undefined), null);
  assert.equal(await keyStoreOf(''), null);
  assert.equal(await keyStoreOf({ get: async () => '  ' }), null);
  assert.equal(isBound(undefined), false);
  assert.equal(isBound(''), false);
  assert.equal(isBound('x'), true);
});

test('ONE ROOT KEY, ONE FINGERPRINT, whether it arrives as hex, base64url, base64 or through a Secrets Store binding', async () => {
  const b = bytes();
  const ids = new Set<string>();
  for (const said of [hex(b), hex(b).toUpperCase(), Buffer.from(b).toString('base64url'), Buffer.from(b).toString('base64'), `${hex(b)}\n`]) {
    const store = await keyStoreOf(said);
    assert.ok(store, said.length.toString());
    ids.add((await store.current()).kekId);
    const bound = await keyStoreOf({ get: async () => said });
    assert.ok(bound);
    ids.add((await bound.current()).kekId);
  }
  assert.equal(ids.size, 1);
  const [id] = [...ids];
  assert.match(id ?? '', /^[0-9a-f]{18}$/);
  assert.equal(id, Buffer.from(await crypto.subtle.digest('SHA-256', b)).toString('hex').slice(0, 18));
});

test('A BOUND VALUE THAT IS NOT A KEY IS REFUSED, and the sentence carries none of it', async () => {
  const b = bytes();
  for (const said of [hex(b).slice(0, 62), `${hex(b)}00`, 'not a key at all', Buffer.from(b.slice(0, 31)).toString('base64url')]) {
    await assert.rejects(keyStoreOf(said), (e: Error) => {
      assert.match(e.message, /not 32 bytes/);
      assert.ok(!e.message.includes(said.trim()), 'the refusal quoted the secret');
      return true;
    });
  }
});

test('A WRAPPING OPENS FOR ITS OWN RECORD, PURPOSE AND ROOT KEY, and for nothing else', async () => {
  const store = await keyStoreOf(hex(bytes()));
  const stranger = await keyStoreOf(hex(bytes()));
  assert.ok(store && stranger);
  const inner = bytes();
  const sealed = await wrap(store, REC, 'record', inner);
  assert.equal(sealed.wrapped_by, 'kek');
  assert.equal(sealed.kek_id, (await store.current()).kekId);
  assert.equal(sealed.nonce.length, 12);

  assert.deepEqual(await unwrap(store, REC, 'record', sealed), inner);
  assert.equal(await unwrap(store, REC, 'connector', sealed), null);
  assert.equal(await unwrap(store, OTHER, 'record', sealed), null);
  assert.equal(await unwrap(stranger, REC, 'record', sealed), null);
  assert.equal(await unwrap(stranger, REC, 'record', { ...sealed, kek_id: (await stranger.current()).kekId }), null);

  const again = await wrap(store, REC, 'record', inner);
  assert.notDeepEqual(again.nonce, sealed.nonce, 'a nonce was repeated');
  assert.deepEqual([...aad(REC, 'signing')].slice(REC.length), [0x1f, ...new TextEncoder().encode('signing')]);
});

test('A RECORD IS MADE WITH THREE KEYS, and the signing one is an Ed25519 private key that signs', async () => {
  const store = await keyStoreOf(Buffer.from(bytes()).toString('base64url'));
  assert.ok(store);
  const keys = await recordKeys(store, REC);
  const { kekId } = await store.current();
  assert.deepEqual(Object.keys(keys).sort(), ['connector', 'record', 'signing']);
  for (const k of Object.values(keys)) assert.equal(k.kek_id, kekId);

  const record = await unwrap(store, REC, 'record', keys.record);
  const connector = await unwrap(store, REC, 'connector', keys.connector);
  assert.equal(record?.length, 32);
  assert.equal(connector?.length, 32);
  assert.notDeepEqual(record, connector);

  const pkcs8 = await unwrap(store, REC, 'signing', keys.signing);
  assert.ok(pkcs8);
  const key = await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, false, ['sign']);
  assert.equal((await crypto.subtle.sign('Ed25519', key, new TextEncoder().encode('a .dog file'))).byteLength, 64);
});
