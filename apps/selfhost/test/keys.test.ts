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
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
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

    /* 0600 ON THE FILE ITSELF, which `49 §9`'s gate table requires and nothing asserted. The mode
       is what makes every other property of this file worth having. */
    if (process.platform !== 'win32') assert.equal(statSync(file).mode & 0o777, 0o600);
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

test('A KEY ANYBODY IN YOUR GROUP CAN READ IS A REFUSAL, and it names the mode', { skip: process.platform === 'win32' }, async () => {
  const dir = scratch();
  try {
    const file = join(dir, 'kek');
    await openKeyStore(file);
    chmodSync(file, 0o644);
    /* `49 §9`'s gate table has a row for this and nothing exercised it. CI is Linux, so the branch
       runs on every build — delete its body and the suite stayed green, which is the shape of every
       defect this repository keeps finding. */
    await assert.rejects(() => openKeyStore(file), /mode 644/);

    chmodSync(file, 0o604);
    await assert.rejects(() => openKeyStore(file), /mode 604/, 'world-readable passed');

    chmodSync(file, 0o600);
    assert.ok(await openKeyStore(file), '0600 was refused');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('AND ON WINDOWS THE SKIPPED CHECK IS SAID OUT LOUD', { skip: process.platform !== 'win32' }, async () => {
  const dir = scratch();
  try {
    const said: string[] = [];
    await openKeyStore(join(dir, 'kek'), (line) => said.push(line));
    /* `49 §4.4`: on Windows the bit is advisory and the ACL is the real permission, so the check is
       skipped AND LOGGED ONCE. It was skipped, and a comment claimed it was said. */
    assert.ok(
      said.some((l) => /not checked on Windows/.test(l)),
      `nothing was said about the skipped check: ${said.join(' / ') || '(silence)'}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('A PATH THAT IS NOT A FILE IS A SENTENCE, not a process that never returns', async () => {
  const dir = scratch();
  try {
    /* `readFileSync` on a FIFO blocks for ever: `init` hangs with no output, no timeout and nothing
       to act on, which is the one outcome worse than a refusal. A directory is the reachable case on
       every platform and takes the same branch. */
    mkdirSync(join(dir, 'kek'));
    await assert.rejects(() => openKeyStore(join(dir, 'kek')), /not a regular file/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('A HALF-WRITTEN KEY FILE IS NEVER LEFT BEHIND', async () => {
  const dir = scratch();
  try {
    const file = join(dir, 'kek');
    await openKeyStore(file);
    /* `wx` makes the file EXIST before the bytes are in it, so a process killed in that gap left an
       empty file `wx` would never rewrite — and every later boot refused "is 0 bytes" on a host
       where nothing had been created yet. Write-then-rename closes it: what carries the name always
       carries the key, and the temp file it was written to is gone. */
    assert.equal(readFileSync(file).length, 32);
    assert.deepEqual(readdirSync(dir), ['kek'], 'a temp file was left in the data directory');

    /* AND THE OLD FAILURE IS STILL A SENTENCE if somebody has one on disk from before. */
    const empty = join(dir, 'empty');
    writeFileSync(empty, '');
    await assert.rejects(() => openKeyStore(empty), /is 0 bytes and a key is 32/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
