/**
 * A signing key for a test record.
 *
 * IT IS HERE AND NOT IN `src/` FOR THE SAME REASON `sqlite.ts` IS. `12 §6` puts the key hierarchy in
 * the host: the kernel makes the bytes a signature is over and something outside signs them, so the
 * kernel package cannot hold a private key and a test of the kernel has to bring its own. What the
 * self-host does with `vault_key(purpose = 'signing')` and its KEK, this does with a keypair it
 * generates and forgets.
 *
 * ONE KEY PER STORE, so two exports of one record carry the same `key_id` and the same signature —
 * which is the property `EXPORT · IMPORT · EXPORT` rests on. A fresh key per call would make every
 * file differ and the test would pass for the wrong reason.
 */

/* The WebCrypto type names are Node's, not the DOM's: `lib` is `es2024` with no `dom`, deliberately.
   This import erases to nothing. */
import type { webcrypto } from 'node:crypto';

import { b64url, keyIdOf, type Signature, type Signer } from '../src/index.ts';

/** Which of the two things `generateKey` returned this one is. */
function isPair(k: webcrypto.CryptoKeyPair | webcrypto.CryptoKey): k is webcrypto.CryptoKeyPair {
  return 'privateKey' in k && 'publicKey' in k;
}

/** The moment a test file says it was signed at. Fixed, so a file is a function of its rows. */
const SIGNED_AT = '2026-09-05T12:00:00.000Z';

export type TestSigner = Signer & { publicKey: Promise<Uint8Array> };

/**
 * A signer over a fresh Ed25519 keypair.
 *
 * Ed25519 IS DETERMINISTIC, so the same bytes under the same key give the same 64-byte signature —
 * which is why a signed export is still `diff`-able against an earlier one, but for `signed_at`.
 */
export function testSigner(signedAt = SIGNED_AT): TestSigner {
  /* NARROWED, NOT CAST. `generateKey` is typed as the union of both things it can return, because
     the same call makes a symmetric key for one algorithm name and a keypair for another — and a
     bare `in` keeps both arms, because a `CryptoKey` could structurally grow the property. */
  const pair = crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']).then((k) => {
    if (!isPair(k)) throw new Error('Ed25519 produced a single key where a keypair was asked for.');
    return k;
  });

  const raw = pair.then(async (k) => new Uint8Array(await crypto.subtle.exportKey('raw', k.publicKey)));

  const sign: Signer = async (bytes: Uint8Array): Promise<Signature> => {
    const { privateKey } = await pair;
    const key = await raw;
    const sig = new Uint8Array(await crypto.subtle.sign('Ed25519', privateKey, bytes));
    return { keyId: await keyIdOf(key), publicKey: b64url(key), sig: b64url(sig), signedAt };
  };

  return Object.assign(sign, { publicKey: raw });
}
