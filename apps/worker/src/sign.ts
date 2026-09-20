/**
 * The hosted record's own signing key, opened. `03 §4`, `12 §6`, `51 §5.12` step 4.
 *
 * THE SAME SHAPE AS `apps/selfhost/src/sign.ts`, over WebCrypto and nothing else. The kernel makes
 * the bytes and something out here signs them, because reading the signing key needs the KEK and
 * `12 §6` puts the KEK in the host. What differs from the self-host's copy is two lines and both
 * are the runtime: there is no `node:buffer` in workerd, so base64url is decoded here, and
 * `CryptoKey` is named structurally because `lib` is `es2024` with no `dom`.
 *
 * MEASURED BEFORE THIS FILE EXISTED: the Worker called `createRecordApi` without `sign`, so every
 * `.brain` a hosted record exported carried a `dog_sig` header and no row under it. `checkBrainl`
 * refuses an unsigned file outright (`41 §5.11` step 3, and it is deliberate: strip the signature,
 * edit a row, recompute the manifest, and an importer that forgave unsigned files would take it),
 * so the hosted export was a file nothing this product ships would import. A nightly backup nobody
 * can restore is not a backup, which is why the signer lands in the same change as the backup.
 *
 * IT RESOLVES ONCE, LAZILY. Not for speed, a file is signed once per export: it is so the unwrapped
 * PKCS#8 bytes exist for the length of one function rather than for the life of the object, and so
 * that a record which never exports never materialises its private key at all.
 */

import { b64url, keyIdOf, type Signature, type Signer } from '@braindog/kernel';
import type { Sql } from '@braindog/ports';

import { unwrap, type KeyStore, type WrappedKey } from './keys.ts';

/** What `vault_key` holds for one purpose, as the row comes back from the object's own SQLite. */
type Row = { wrapped: Uint8Array; nonce: Uint8Array; kek_id: string; wrapped_by: string };

/** A WebCrypto key, named without the DOM library, exactly as `keys.ts` names it. */
type Key = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

/** base64url to bytes. `b64url` in the kernel goes the other way, and this is the only place that needs the inverse. */
function unb64url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '='));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/**
 * The signer for the record in this object's storage, or `null` when it has no signing key.
 *
 * `null` RATHER THAN A THROW. A record provisioned before `KEK` was bound has no `vault_key` rows at
 * all, and so does one restored from a redacted export. "This record's exports are unsigned" is an
 * ordinary state of a hosted record, and it is better said at export than at import.
 */
async function openSigner(sql: Sql, store: KeyStore, record: string): Promise<Signer | null> {
  const row = sql.one<Row>("SELECT wrapped, nonce, kek_id, wrapped_by FROM vault_key WHERE purpose = 'signing'");
  if (!row) return null;

  /* A PASSPHRASE-WRAPPED KEY IS NOT THE KEK'S TO OPEN. `12 §6`: exactly one wrapping per key, and
     enabling the passphrase destroys the KEK copy in the same transaction. Trying anyway gives an
     `OperationError` out of `subtle.decrypt`, which reads as a corrupt record. */
  if (row.wrapped_by !== 'kek') return null;

  const sealed: WrappedKey = {
    wrapped: new Uint8Array(row.wrapped),
    nonce: new Uint8Array(row.nonce),
    kek_id: row.kek_id,
    wrapped_by: 'kek',
  };

  const pkcs8 = await unwrap(store, record, 'signing', sealed);
  if (!pkcs8) return null;

  let priv: Key;
  let publicKey: Uint8Array;
  try {
    /* TWICE FROM ONE BUFFER, AND THE EXTRACTABLE ONE IS THROWN AWAY. WebCrypto will not derive a
       public key from a private one and `exportKey('pkcs8')` writes a v1 encoding that does not
       carry the public half, so the only way to it without an ASN.1 parser here is a JWK round
       trip, whose `x` IS the public key. The key that signs is the non-extractable one. */
    const readable = await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, true, ['sign']);
    const jwk = (await crypto.subtle.exportKey('jwk', readable)) as { x?: string };
    if (!jwk.x) return null;
    publicKey = unb64url(jwk.x);
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
    /* THE TIME IS ABOUT THE ACT and not the content, which is why it lives here and not in the
       manifest. Two exports of an unchanged record differ in this one field and nowhere else. */
    signedAt: new Date().toISOString(),
  });
}

/**
 * `createRecordApi`'s `sign`, for a record whose id and key store are known only after it is open.
 *
 * THE ID IS A CALLBACK BECAUSE THE RECORD TABLE DOES NOT EXIST YET when the Worker builds this: the
 * migration that makes it runs inside `createRecordApi`, and reading the id first threw
 * `no such table: record` on every object this Worker was the first to open.
 *
 * AND SO IS THE STORE, FOR A DIFFERENT REASON. `keyStoreOf` throws on a `KEK` that is bound and is
 * not 32 bytes. Opening it while the object opens would turn one mistyped secret into every record
 * on the deployment refusing to open at all; opening it here makes the same mistake one failed
 * export, with the sentence, on the one record that asked.
 */
export function workerSigner(sql: Sql, store: () => Promise<KeyStore | null>, record: () => string | null): Signer {
  let resolved: Signer | null | undefined;
  return async (bytes: Uint8Array): Promise<Signature | null> => {
    if (resolved === undefined) {
      const id = record();
      const held = id ? await store() : null;
      resolved = held && id ? await openSigner(sql, held, id) : null;
    }
    return resolved ? resolved(bytes) : null;
  };
}
