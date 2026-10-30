/**
 * THE PUBLISHER'S KEY IS MADE ONCE AND NEVER SHOWN. One key is made at the first call and reused after; what it signs
 * verifies with `verifySignature`, over the same text `signVersion` signs; and nothing it answers holds the private half.
 * Node's own WebCrypto and a store in memory stand in for the browser's.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fileChecksum, verifySignature } from '@braindog/declare/catalogue';

import { authorKey, memoryStore, signatureFor, signFor, type KeptKey, type KeyStore } from './author-key.ts';

const NOW = (): Date => new Date('2026-10-15T09:00:00Z');

const lantern = (version: string): string =>
  JSON.stringify(
    {
      pack: 'lantern-notes',
      version,
      title: 'Lantern notes',
      summary: 'Notes kept by lamplight.',
      author: 'Orla Penhallow',
      license: 'MIT',
      declarations: [{ register: 'lantern', name: 'Lanterns', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] }],
    },
    null,
    2,
  );

/** A store that counts how often a key is kept, and lets a test look at what it holds. */
function counted(): KeyStore & { keeps: number; held: () => KeptKey | null } {
  const inner = memoryStore();
  let held: KeptKey | null = null;
  const store = {
    keeps: 0,
    held: () => held,
    read: () => inner.read(),
    keep: async (key: KeptKey) => {
      store.keeps++;
      held = await inner.keep(key);
      return held;
    },
  };
  return store;
}

test('one key is made once and reused, across presses that race', async () => {
  const store = counted();
  const [a, b] = await Promise.all([authorKey(store, NOW), authorKey(store, NOW)]);
  const c = await authorKey(store, NOW);
  assert.ok(a && b && c);
  assert.equal(store.keeps, 1);
  assert.equal(a.key_id, b.key_id);
  assert.equal(a.key_id, c.key_id);
  assert.match(a.key_id, /^[0-9a-f]{16}$/u);
});

test('the private half is kept non-extractable, and cannot be exported', async () => {
  const store = counted();
  await authorKey(store, NOW);
  const kept = store.held();
  assert.ok(kept);
  assert.equal(kept.privateKey.extractable, false);
  await assert.rejects(crypto.subtle.exportKey('pkcs8', kept.privateKey));
});

test('a signature verifies with verifySignature, over kind, id, version and checksum', async () => {
  const store = memoryStore();
  const checksum = await fileChecksum(lantern('1.0.0'));
  const sig = await signFor('pack', 'lantern-notes', '1.0.0', checksum, store);
  assert.ok(sig);
  assert.equal((await verifySignature(sig, 'pack', 'lantern-notes', '1.0.0', checksum)).ok, true);
  /* Held to the version it names: the same signature over another version does not verify. */
  assert.equal((await verifySignature(sig, 'pack', 'lantern-notes', '1.0.1', checksum)).ok, false);
  const key = await authorKey(store);
  assert.equal(sig.key_id, key?.key_id);
});

test('a file is signed by what the Kennel reads from it', async () => {
  const store = memoryStore();
  const text = lantern('2.1.0');
  const sig = await signatureFor(text, store);
  assert.ok(sig);
  assert.equal((await verifySignature(sig, 'pack', 'lantern-notes', '2.1.0', await fileChecksum(text))).ok, true);
  assert.equal(await signatureFor('not a file', store), null);
});

test('nothing returned holds the private key', async () => {
  const store = counted();
  const key = await authorKey(store, NOW);
  assert.ok(key);
  const sig = await key.sign('pack', 'lantern-notes', '1.0.0', await fileChecksum(lantern('1.0.0')));
  assert.ok(sig);
  for (const value of [key, sig]) {
    const json = JSON.stringify(value);
    assert.doesNotMatch(json, /private|pkcs8|privateKey/iu);
    assert.deepEqual(Object.keys(JSON.parse(json) as object).sort(), value === key ? ['created_at', 'key_id', 'public_key'] : ['alg', 'key_id', 'public_key', 'sig', 'signed_at']);
  }
  /* The store holds the browser's own key object, whose JSON is empty: no bytes are in it to leak. */
  assert.equal(JSON.stringify(store.held()?.privateKey), '{}');
});

test('a browser with nowhere to keep a key answers no key, and nothing throws', async () => {
  assert.equal(await authorKey(null), null);
  assert.equal(await signFor('pack', 'lantern-notes', '1.0.0', 'abc', null), null);
  const broken: KeyStore = { read: () => Promise.reject(new Error('blocked')), keep: () => Promise.reject(new Error('blocked')) };
  assert.equal(await authorKey(broken), null);
  /* Node has no IndexedDB, so the default store is none. */
  assert.equal(await signFor('pack', 'lantern-notes', '1.0.0', 'abc'), null);
});

test('a kept key whose id is not its public half signs nothing', async () => {
  const good = counted();
  await authorKey(good, NOW);
  const kept = good.held();
  assert.ok(kept);
  const edited = memoryStore();
  await edited.keep({ ...kept, key_id: '0000000000000000' });
  assert.equal(await authorKey(edited), null);
});

/* THE KEY IS THE PERSON'S, NOT THE BROWSER'S. One slot outlived sign-out, so whoever signed in next published or took
   back the last person's add-ons as them. Each person reaches their own key, and nobody signed in reaches none. */
test('each person signed in reaches their own key, and nobody signed in reaches none', async () => {
  const { personStores, slotOf } = await import('./author-key.ts');
  let now: string | null = 'p_ana';
  const made: string[] = [];
  const stores = personStores(
    async () => now,
    (person) => {
      made.push(person);
      return memoryStore();
    },
  );
  const ana = await authorKey(await stores(), NOW);
  now = 'p_ben';
  const ben = await authorKey(await stores(), NOW);
  assert.ok(ana && ben);
  assert.notEqual(ana.key_id, ben.key_id, 'the next person signed with the last one’s key');
  now = 'p_ana';
  assert.equal((await authorKey(await stores(), NOW))?.key_id, ana.key_id, 'a person lost their own key');
  assert.deepEqual(made, ['p_ana', 'p_ben']);
  now = null;
  assert.equal(await stores(), null);
  assert.equal(slotOf('p_ana'), 'publisher:p_ana');
});

/* RD13: AN OPEN SELF-HOST HOLDS NO SESSIONS, so `/auth/session` answered nobody, no key was made, and every add-on went
   out unsigned. Its one person keeps a key now, and only where the host says it is open. */
test('RD13: AN OPEN SELF-HOST KEEPS ITS ONE PERSON A KEY; A HOST THAT IS NOT OPEN STILL KEEPS NOBODY SIGNED OUT ONE', async () => {
  const { signedInNow, OPEN_PERSON } = await import('./author-key.ts');
  const host = (session: { status: number; body?: unknown }, methods: { status: number; body?: unknown }) =>
    (async (path: string) => {
      const said = path === '/auth/session' ? session : methods;
      return new Response(JSON.stringify(said.body ?? {}), { status: said.status, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
  assert.equal(await signedInNow(host({ status: 200, body: { ok: true, value: { person: 'p_ada' } } }, { status: 200 })), 'p_ada');
  assert.equal(await signedInNow(host({ status: 404 }, { status: 200, body: { ok: true, value: { open: true } } })), OPEN_PERSON);
  assert.equal(await signedInNow(host({ status: 401 }, { status: 200, body: { ok: true, value: { open: false } } })), null, 'a signed-out browser on the Cloud kept a key');
  assert.equal(await signedInNow(host({ status: 401 }, { status: 503 })), null);
});
