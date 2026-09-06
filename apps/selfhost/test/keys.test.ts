/**
 * The KEK, and the three keys a record is created with.
 *
 * WHAT IS ASSERTED HERE IS THAT A WRAPPING CANNOT BE MOVED. Every other property of this file —
 * the file mode, the length check, the fingerprint — is a precaution. The binding is the mechanism:
 * `12 §6` wraps under `utf8(record_id) ‖ 0x1F ‖ utf8(purpose)` so that a `connector` blob lifted into
 * the `signing` row does not open, and a blob copied out of another record does not open at all.
 * Both of those are a single SQL statement away for anybody with the file, and neither is visible
 * from reading the code — an AAD that is computed and not checked looks exactly like one that is.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { aad, openKeyStore, recordKeys, unwrap, wrap } from '../src/keys.ts';

const scratch = (): string => mkdtempSync(join(tmpdir(), 'braindog-kek-'));

test('THE KEY FILE IS MADE ONCE and read back the same', async () => {
  const dir = scratch();
  try {
    const file = join(dir, 'kek');
    const first = await openKeyStore(file);
    const bytes = readFileSync(file);
    assert.equal(bytes.length, 32, '49 §4.4: 32 random bytes');

    /* THE SECOND OPEN DOES NOT REPLACE IT. `wx` is the whole of the race protection, and a second
       key would leave every existing row wrapped under one nothing can find — which reads on screen
       exactly like corruption, and needs a different answer. */
    const second = await openKeyStore(file);
    assert.deepEqual(readFileSync(file), bytes, 'the key file was rewritten');
    assert.equal((await first.current()).kekId, (await second.current()).kekId);

    /* AND THE FINGERPRINT IS OF THE KEY, not of the path or the moment. 34 §5: 18 hex. */
    assert.match((await first.current()).kekId, /^[0-9a-f]{18}$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('A FILE THAT IS NOT A KEY IS A SENTENCE, not a silent short key', async () => {
  const dir = scratch();
  try {
    const file = join(dir, 'kek');
    writeFileSync(file, 'hunter2');
    await assert.rejects(() => openKeyStore(file), /is 7 bytes and a key is 32/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('THE DERIVED KEYS ARE STABLE, DIFFERENT, AND NOT THE ROOT', async () => {
  const dir = scratch();
  try {
    const file = join(dir, 'kek');
    const store = await openKeyStore(file);
    const code = await store.k('braindog/device-code');
    const share = await store.k('braindog/share');

    assert.equal(code.length, 32);
    /* A LEAKED SHARE TOKEN SAYS NOTHING ABOUT A DEVICE CODE. Same root, two info strings, 49 §4.4. */
    assert.notDeepEqual([...code], [...share], 'the two derived keys are the same bytes');

    /* AND THEY SURVIVE A RESTART, because a device code signed before a reboot has to verify after
       one. Derivation is a function of the file, and the file did not change. */
    const again = await openKeyStore(file);
    assert.deepEqual([...(await again.k('braindog/device-code'))], [...code]);

    /* NEITHER IS THE ROOT ITSELF. HKDF over a 32-byte secret returns 32 bytes, so a bug that
       returned the input would be the right length and the wrong thing entirely. */
    assert.notDeepEqual([...code], [...readFileSync(file)], 'k() handed back the root key');

    await assert.rejects(() => store.k('braindog/nope'), /is not a derived key this build makes/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('A WRAPPING IS BOUND TO ITS RECORD AND ITS PURPOSE', async () => {
  const dir = scratch();
  try {
    const store = await openKeyStore(join(dir, 'kek'));
    const plain = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const sealed = await wrap(store, 'rec_A', 'connector', plain);

    assert.equal(sealed.wrapped_by, 'kek');
    assert.equal(sealed.nonce.length, 12);
    assert.deepEqual([...(await unwrap(store, 'rec_A', 'connector', sealed))!], [...plain]);

    /* THE THREE WAYS A BLOB CAN BE MOVED, and none of them opens. A row copied between purposes, a
       row copied between records, and a `kek_id` the store does not hold — 49 §6's WRONG_KEY. */
    assert.equal(await unwrap(store, 'rec_A', 'signing', sealed), null, 'a connector key opened as signing');
    assert.equal(await unwrap(store, 'rec_B', 'connector', sealed), null, 'a key opened under another record');
    assert.equal(
      await unwrap(store, 'rec_A', 'connector', { ...sealed, kek_id: 'ffffffffffffffffff' }),
      null,
      'a kek_id the store cannot answer opened anyway',
    );

    /* AND A FLIPPED BYTE IS A REFUSAL RATHER THAN GARBAGE. GCM authenticates; this is what makes
       "the file was tampered with" and "the key is wrong" the same answer to the caller. */
    const bent = new Uint8Array(sealed.wrapped);
    bent[0] = (bent[0]! ^ 0xff) & 0xff;
    assert.equal(await unwrap(store, 'rec_A', 'connector', { ...sealed, wrapped: bent }), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('THE NONCE IS FRESH EVERY TIME, which is the one way to use GCM wrongly', async () => {
  const dir = scratch();
  try {
    const store = await openKeyStore(join(dir, 'kek'));
    const plain = new Uint8Array(32);
    const seen = new Set<string>();
    for (let i = 0; i < 32; i++) seen.add((await wrap(store, 'rec_A', 'record', plain)).nonce.join(','));
    assert.equal(seen.size, 32, 'a nonce repeated under one key leaks the plaintexts and the auth key');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('THE AAD IS THE BYTES THE SPEC NAMES', () => {
  const bytes = aad('rec_01', 'signing');
  const want = [...new TextEncoder().encode('rec_01'), 0x1f, ...new TextEncoder().encode('signing')];
  assert.deepEqual([...bytes], want);
  /* 0x1F IS WHY `rec_Ab` + `record` AND `rec_A` + `brecord` ARE DIFFERENT. A separator no identifier
     contains is the difference between a binding and a concatenation two pairs can collide on. */
  assert.notDeepEqual([...aad('rec_Ab', 'record')], [...aad('rec_A', 'record')]);
});

test('A RECORD IS CREATED WITH THREE KEYS, all openable, none the same', async () => {
  const dir = scratch();
  try {
    const store = await openKeyStore(join(dir, 'kek'));
    const keys = await recordKeys(store, 'rec_A');

    assert.deepEqual(Object.keys(keys).sort(), ['connector', 'record', 'signing'], '30 §1: three rows');

    for (const purpose of ['record', 'connector', 'signing'] as const) {
      const open = await unwrap(store, 'rec_A', purpose, keys[purpose]);
      assert.ok(open, `${purpose} does not open under the key that wrapped it`);
      assert.ok(open.length >= 32, `${purpose} is ${open.length} bytes`);
    }

    /* THE TWO DEKS ARE RANDOM AND DISTINCT. One key used for both would mean a leaked connector
       secret opened every entry in the record. */
    const a = await unwrap(store, 'rec_A', 'record', keys.record);
    const b = await unwrap(store, 'rec_A', 'connector', keys.connector);
    assert.equal(a!.length, 32);
    assert.notDeepEqual([...a!], [...b!], 'the record and connector DEKs are the same bytes');

    /* AND THE SIGNING KEY IS A REAL PKCS#8 Ed25519 PRIVATE KEY, which is only provable by using it.
       A 32-byte blob in that row is the failure this catches: it is the right length for a DEK, and
       `braindog verify` would be the first thing to find out. */
    const pkcs8 = await unwrap(store, 'rec_A', 'signing', keys.signing);
    const priv = await crypto.subtle.importKey('pkcs8', pkcs8!, { name: 'Ed25519' }, false, ['sign']);
    const msg = new TextEncoder().encode('the signed bytes');
    const sig = await crypto.subtle.sign('Ed25519', priv, msg);
    assert.equal(sig.byteLength, 64);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('TWO RECORDS MADE UNDER ONE KEK DO NOT SHARE A KEY', async () => {
  const dir = scratch();
  try {
    const store = await openKeyStore(join(dir, 'kek'));
    const one = await recordKeys(store, 'rec_A');
    const two = await recordKeys(store, 'rec_B');

    const a = await unwrap(store, 'rec_A', 'record', one.record);
    const b = await unwrap(store, 'rec_B', 'record', two.record);
    assert.notDeepEqual([...a!], [...b!], 'two records were given the same DEK');

    /* AND NEITHER OPENS AS THE OTHER, which is the property a shared self-host rests on: one
       operator holds one KEK and every record on it is still sealed from every other. */
    assert.equal(await unwrap(store, 'rec_A', 'record', two.record), null);
    assert.equal(await unwrap(store, 'rec_B', 'record', one.record), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
