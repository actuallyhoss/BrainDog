/**
 * The cloud copy's sealer, opened by a reader that shares none of its code (`test/age-open.ts`).
 *
 * WHAT THIS FILE HAS TO CATCH IS A COPY THAT WAS WRITTEN AND CANNOT BE OPENED. A sealer that throws
 * is noticed the same night. A sealer that writes bytes nobody can decrypt is noticed the day the
 * record is lost, which is the one day it matters, so every test below ends in a decrypt.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, randomBytes } from 'node:crypto';

import { chacha20poly1305, recipientOf, sealTo } from '../src/seal.ts';
import { ageOpen, identity } from './age-open.ts';

test('THE CIPHER AGREES WITH OPENSSL AT EVERY LENGTH THAT HAS AN EDGE', () => {
  // Workers' WebCrypto has no ChaCha20-Poly1305, so `seal.ts` carries its own. Its Poly1305 runs in
  // 13-bit limbs because a 26-bit limb product overflows a double's 53 bits, and the lengths below
  // are the ones where a limb or padding mistake would show: empty, one byte, either side of the
  // 16-byte block and the 64-byte keystream block, and one age chunk plus one.
  for (const n of [0, 1, 15, 16, 17, 63, 64, 65, 127, 128, 129, 1000, 65536, 65537]) {
    const key = randomBytes(32);
    const nonce = randomBytes(12);
    const plain = randomBytes(n);
    const c = createCipheriv('chacha20-poly1305', key, nonce, { authTagLength: 16 });
    const want = Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]);
    assert.deepEqual(Buffer.from(chacha20poly1305(key, nonce, plain)), want, `length ${String(n)}`);
  }
});

test('A RECIPIENT IS READ FROM ITS bech32, AND A PLACEHOLDER IS REFUSED BY NAME', () => {
  // The fixed vector is the recipient printed in age's own README. It is the one input here that
  // did not come from this build, so a checksum constant misremembered in both `seal.ts` and the
  // test's encoder is caught by it and by nothing else.
  const readme = recipientOf('age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p');
  assert.ok(readme instanceof Uint8Array, String(readme));
  assert.equal(readme.length, 32);

  const id = identity();
  assert.deepEqual(recipientOf(id.recipient), id.pub);

  /* The two strings `wrangler.jsonc` ships with, a one-character typo, and an identity pasted where
     the recipient goes, which is the mistake that would put the private key in a var. */
  /* THE TYPO IS A DIFFERENT LAST CHARACTER, NOT A FIXED ONE. It was always `q`, and one random recipient in
     thirty-two already ends in `q`, so the "typo" was the recipient itself and CI failed on a coin toss. */
  const typo = `${id.recipient.slice(0, -1)}${id.recipient.endsWith('q') ? 'p' : 'q'}`;
  for (const bad of ['age1<alpha-recipient>', 'age1<production-recipient>', typo, 'AGE-SECRET-KEY-1QQQQ']) {
    const said = recipientOf(bad);
    assert.equal(typeof said, 'string', `${bad} was accepted`);
    assert.match(String(said), /AGE_RECIPIENT/u);
  }
});

test('A SEALED FILE OPENS WITH THE IDENTITY, AT EVERY CHUNK BOUNDARY', async () => {
  // age's payload is 64 KiB chunks with the last one flagged, and the two lengths that break a
  // STREAM writer are the empty file and an exact multiple of the chunk: the final chunk must be
  // full and flagged rather than followed by an empty one.
  const id = identity();
  const seal = sealTo(recipientOf(id.recipient) as Uint8Array);
  for (const n of [0, 1, 65535, 65536, 65537, 3 * 65536, 200_000]) {
    const plain = randomBytes(n);
    const sealed = await seal(new Uint8Array(plain));
    assert.equal(Buffer.from(sealed.subarray(0, 22)).toString(), 'age-encryption.org/v1\n');
    assert.deepEqual(ageOpen(sealed, id), plain, `length ${String(n)}`);
  }
});

test('A SEALED FILE DOES NOT OPEN FOR ANOTHER IDENTITY, OR ONCE ONE BYTE OF IT CHANGES', async () => {
  const id = identity();
  const sealed = await sealTo(recipientOf(id.recipient) as Uint8Array)(new TextEncoder().encode('#dogl 1\n["row"]'));
  assert.throws(() => ageOpen(sealed, identity()));
  for (const at of [30, sealed.length - 1]) {
    const bent = new Uint8Array(sealed);
    bent[at] = (bent[at] ?? 0) ^ 1;
    assert.throws(() => ageOpen(bent, id), `a flipped byte at ${String(at)} opened`);
  }
});
