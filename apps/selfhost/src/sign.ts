/**
 * The record's own signing key, opened. `03 §4`, `12 §6`, `49 §5.22` step 4.
 *
 * THE KERNEL MAKES THE BYTES AND SOMETHING OUT HERE SIGNS THEM. That is the whole shape, and it is
 * why this file exists rather than a `sign()` inside `brainl.ts`: reading the signing key needs the
 * KEK, `12 §6` puts the KEK in the host, and a kernel that could sign would be a kernel holding a
 * private key. `signBrainl` takes a callback; this is the callback.
 *
 * THE PUBLIC HALF IS DERIVED, NOT STORED. `vault_key` holds one wrapped blob per purpose and the
 * signing row is the PKCS#8 private half, which carries the public key inside it, so the record has
 * no column for one and needs none. `03 §4`'s `key_id` is a function of the public key, so both come
 * out of the same import.
 *
 * AND IT IS OPENED ONCE. Not for speed: a file is signed once per export. It is so the unwrapped
 * PKCS#8 bytes exist for the length of one function rather than once per export for the life of the
 * process.
 */

import { Buffer } from 'node:buffer';
/* `CryptoKey` is a DOM type name and `lib` is `es2024` with no `dom`, deliberately. Node declares
   it in `webcrypto`; this erases to nothing. */
import type { webcrypto } from 'node:crypto';

import { b64url, keyIdOf, type Signature, type Signer } from '@braindog/kernel';
import type { Sql } from '@braindog/ports';

import { unwrap, type KeyStore, type WrappedKey } from './keys.ts';

/** What `vault_key` holds for one purpose, as the row comes back. */
type Row = { wrapped: Uint8Array; nonce: Uint8Array; kek_id: string; wrapped_by: string };

/**
 * A signer for the record in this database, or `null` when it has no signing key.
 *
 * `null` RATHER THAN A THROW, AND RATHER THAN A SIGNER THAT FAILS LATER. A record restored from a
 * redacted export has no `vault_key` rows at all (`brainl.ts` drops them deliberately, because the
 * row is nothing but wrapped bytes and a salt) so "no signing key" is an ordinary state and not an
 * error. What it means is that this record's exports are unsigned and nothing will import them,
 * which is true, and is better said at export than at import.
 */
export async function signerFor(sql: Sql, store: KeyStore, recordId: string): Promise<Signer | null> {
  const row = sql.one<Row>("SELECT wrapped, nonce, kek_id, wrapped_by FROM vault_key WHERE purpose = 'signing'");
  if (!row) return null;

  /* A PASSPHRASE-WRAPPED KEY IS NOT THE KEK'S TO OPEN. `12 §6`: exactly one wrapping per key, and
     enabling the passphrase destroys the KEK copy in the same transaction. Trying anyway gives an
     `OperationError` out of `subtle.decrypt`, which reads as a corrupt file. */
  if (row.wrapped_by !== 'kek') return null;

  const sealed: WrappedKey = {
    wrapped: new Uint8Array(row.wrapped),
    nonce: new Uint8Array(row.nonce),
    kek_id: row.kek_id,
    wrapped_by: 'kek',
  };

  const pkcs8 = await unwrap(store, recordId, 'signing', sealed);
  if (!pkcs8) return null;

  let priv: webcrypto.CryptoKey;
  let publicKey: Uint8Array;
  try {
    /* TWICE FROM ONE BUFFER, AND THE EXTRACTABLE ONE IS THROWN AWAY. WebCrypto will not derive a
       public key from a private one, and Node's `exportKey('pkcs8')` writes a v1 encoding that does
       not carry the public half, so the only way to it without an ASN.1 parser in this file is a
       JWK round trip, whose `x` IS the public key. The key that signs is the non-extractable one. */
    const readable = await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, true, ['sign']);
    const jwk = (await crypto.subtle.exportKey('jwk', readable)) as { x?: string };
    if (!jwk.x) return null;
    publicKey = new Uint8Array(Buffer.from(jwk.x, 'base64url'));
    priv = await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, false, ['sign']);
  } catch {
    return null;
  } finally {
    pkcs8.fill(0);
  }

  const keyId = await keyIdOf(publicKey);
  const encoded = b64url(publicKey);

  return async (bytes: Uint8Array): Promise<Signature> => ({
    keyId,
    publicKey: encoded,
    sig: b64url(new Uint8Array(await crypto.subtle.sign('Ed25519', priv, bytes))),
    /* THE TIME IS ABOUT THE ACT, not the content, which is why it lives here and not in the
       manifest. Two exports of an unchanged record differ in this one field and nowhere else. */
    signedAt: new Date().toISOString(),
  });
}
