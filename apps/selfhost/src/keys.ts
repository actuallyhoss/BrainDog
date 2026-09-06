/**
 * The root key, and the three the record is wrapped with. `49 §4.4`, `12 §6`, `ADR-062`.
 *
 * THE VAULT CANNOT HOLD ITS OWN KEY. `12 §6` states it as the reason this file is in the host and
 * not in the kernel: reading the vault needs the KEK, so the safe cannot hold what opens it. The
 * record holds sealed bytes and the fingerprint of what wrapped them, and has no way to open
 * either — `vault.ts` performs no crypto at all, deliberately, and `secret-grep` is red on a
 * plaintext that reaches a log.
 *
 * ONE FILE, 32 BYTES, `0600`, CREATED `wx`. Not an env var carrying the value: a key in the
 * environment is a key in every `ps`, every crash dump and every process that inherits it, and
 * `49 §4.4` puts it on disk with a mode check for exactly that reason. `BRAINDOG_KEK_FILE` names
 * the path and never the bytes.
 *
 * READ ONCE, DERIVED TWICE, ZERO-FILLED. `49 §8`: the raw buffer does not outlive the three
 * derivations. It cannot be made to disappear from a garbage-collected heap, and overwriting the one
 * view we hold is the difference between a key that is in memory for a moment and one that is in a
 * heap snapshot for the life of the process.
 *
 * AND THE WRAPPING IS BOUND TO WHAT IT WRAPS. AES-256-GCM with the record id and the purpose as
 * additional data — `utf8(record_id) ‖ 0x1F ‖ utf8(purpose)`, `12 §6` and `47 §4.6` byte for byte —
 * so a `connector` key lifted into the `signing` row does not open, and a key copied from another
 * record does not open at all. A wrapping that is not bound is a wrapping that can be moved.
 */

import { randomBytes } from 'node:crypto';
/* THE TYPE NAMES COME FROM NODE, NOT FROM THE DOM. `tsconfig.base.json` sets `lib: ["es2024"]` and no
   `dom`, deliberately — a package that can name `document` is a package that can reach for it. So
   `crypto.subtle` is there as a value on `globalThis` while `CryptoKey` and `CryptoKeyPair` are types
   only `node:crypto` declares, and this is a type-only import that erases to nothing. */
import type { webcrypto } from 'node:crypto';
import { chmodSync, readFileSync, statSync, writeFileSync } from 'node:fs';

/** What a record stores about one wrapped key. The kernel writes it and never reads inside it. */
export type WrappedKey = {
  wrapped: Uint8Array;
  nonce: Uint8Array;
  kek_id: string;
  wrapped_by: 'kek';
};

/** The three `vault_key.purpose` admits. A fourth is a migration. */
export type Purpose = 'record' | 'connector' | 'signing';

/** `33 §1` port 8. The host has it; the record does not. */
export type KeyStore = {
  current(): Promise<{ kekId: string; key: webcrypto.CryptoKey }>;
  byId(kekId: string): Promise<webcrypto.CryptoKey | null>;
};

const KEK_BYTES = 32;
const NONCE_BYTES = 12;

/** `0x1F`, the unit separator — a byte no identifier contains, so the two halves cannot run together. */
const SEP = 0x1f;

/**
 * The bytes on disk, made on first run.
 *
 * `wx` IS THE WHOLE OF THE RACE PROTECTION. Two processes starting together both find no file; the
 * loser's write fails rather than overwriting the winner's key with a second one — which would leave
 * every row wrapped under a key nothing can find, indistinguishable from corruption on the one
 * screen where "the data is gone" and "the key changed" need different answers (`12 §6.1`).
 */
function keyBytes(file: string): Uint8Array {
  let raw: Buffer;
  try {
    raw = readFileSync(file);
  } catch (e) {
    if ((e as { code?: string }).code !== 'ENOENT') throw e;
    try {
      writeFileSync(file, randomBytes(KEK_BYTES), { mode: 0o600, flag: 'wx' });
    } catch (again) {
      /* Somebody else won. Theirs is the key. */
      if ((again as { code?: string }).code !== 'EEXIST') throw again;
    }
    raw = readFileSync(file);
  }

  if (raw.length !== KEK_BYTES)
    throw new Error(`${file} is ${raw.length} bytes and a key is ${KEK_BYTES}. Move it aside, or point at the right one.`);

  /* THE MODE IS CHECKED WHERE IT MEANS SOMETHING. On POSIX a group- or world-readable key file is
     the key being readable, and `49 §4.4` refuses to boot. On Windows the bit is advisory and the
     ACL is the real permission, so checking it there would be a refusal about nothing — the check is
     skipped and said out loud rather than passed silently. */
  if (process.platform !== 'win32') {
    const mode = statSync(file).mode & 0o777;
    if ((mode & 0o077) !== 0)
      throw new Error(`${file} is mode ${mode.toString(8)} and a key is 0600. Anybody in your group can read it.`);
  }

  return new Uint8Array(raw);
}

/** The first 18 hex of SHA-256 — `34 §5`, and 72 bits is a fingerprint rather than a name. */
async function fingerprint(raw: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', raw);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 18);
}

/**
 * The host's key store, over one file.
 *
 * `byId` KNOWS ONE ID, and that is the honest state rather than a limitation hidden behind an
 * interface: `49 §10` says rotation is a second file and a `kek_id → file` map, and neither exists.
 * A `byId` that answered for any id would be a store claiming to hold keys it does not have.
 */
export async function openKeyStore(file: string): Promise<KeyStore & { k(name: string): Promise<Uint8Array> }> {
  const raw = keyBytes(file);
  const kekId = await fingerprint(raw);
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);

  /* THE TWO DERIVED KEYS, TAKEN BEFORE THE BYTES GO. `49 §4.4`: `k_code` signs a device code and
     `k_share` signs a share token, both HKDF-SHA-256 over the same root with their own info string —
     so a leaked share token says nothing about a device code, and neither says anything about the
     vault. */
  const derived = new Map<string, Uint8Array>();
  const hkdf = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveBits']);
  for (const info of ['braindog/device-code', 'braindog/share']) {
    const bits = await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode(info) },
      hkdf,
      256,
    );
    derived.set(info, new Uint8Array(bits));
  }

  /* AND THE RAW BYTES GO. `49 §8`: read once, derived twice, zero-filled. The imported `CryptoKey`
     is not extractable, so what is left is a handle rather than the key. */
  raw.fill(0);

  return {
    current: () => Promise.resolve({ kekId, key }),
    byId: (id) => Promise.resolve(id === kekId ? key : null),
    /* IT REJECTS RATHER THAN THROWS. The signature says `Promise`, so a caller writing
       `store.k(n).catch(...)` is entitled to catch this — a synchronous throw from a function that
       returns a promise escapes that handler entirely and lands as an unhandled exception. */
    k: (name) => {
      const held = derived.get(name);
      return held
        ? Promise.resolve(held)
        : Promise.reject(new Error(`${name} is not a derived key this build makes.`));
    },
  };
}

/** `utf8(record_id) ‖ 0x1F ‖ utf8(purpose)` — `12 §6`, `47 §4.6`. */
export function aad(record: string, purpose: Purpose): Uint8Array {
  const id = new TextEncoder().encode(record);
  const what = new TextEncoder().encode(purpose);
  const out = new Uint8Array(id.length + 1 + what.length);
  out.set(id, 0);
  out[id.length] = SEP;
  out.set(what, id.length + 1);
  return out;
}

/**
 * Wrap one key for one record and one purpose.
 *
 * A FRESH NONCE EVERY TIME. AES-GCM with a repeated nonce under one key leaks the XOR of the two
 * plaintexts and the authentication key with it — it is the one way to use this cipher that is worse
 * than not using it, and twelve random bytes per wrap is what stops it.
 */
export async function wrap(store: KeyStore, record: string, purpose: Purpose, plain: Uint8Array): Promise<WrappedKey> {
  const { kekId, key } = await store.current();
  const nonce = new Uint8Array(randomBytes(NONCE_BYTES));
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: aad(record, purpose) },
    key,
    plain,
  );
  return { wrapped: new Uint8Array(sealed), nonce, kek_id: kekId, wrapped_by: 'kek' };
}

/**
 * And back. `null` rather than a throw, because every way this fails is one fact — these bytes do
 * not open under this key — and the caller's answer to all of them is the same refusal.
 */
export async function unwrap(store: KeyStore, record: string, purpose: Purpose, sealed: WrappedKey): Promise<Uint8Array | null> {
  const key = await store.byId(sealed.kek_id);
  if (!key) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: sealed.nonce, additionalData: aad(record, purpose) },
      key,
      sealed.wrapped,
    );
    return new Uint8Array(plain);
  } catch {
    return null;
  }
}

/**
 * Which of the two things `generateKey` returns this one is.
 *
 * NARROWED, NOT CAST. The same call makes a symmetric key for one algorithm name and a keypair for
 * another, so its type is the union of both and `Ed25519` is the caller's knowledge rather than the
 * compiler's. A cast would be telling the compiler; this is showing it — and if a future Node ever
 * returns something else for this name, the refusal is a sentence rather than a `TypeError` three
 * frames away in `exportKey`.
 */
function isPair(k: webcrypto.CryptoKeyPair | webcrypto.CryptoKey): k is webcrypto.CryptoKeyPair {
  return 'privateKey' in k && 'publicKey' in k;
}

/**
 * The three a record is created with. `49 §5.22` step 4, `12 §6`, `03 §4`.
 *
 * TWO RANDOM AND ONE GENERATED. The record and connector DEKs are 32 random bytes — they encrypt
 * and nothing verifies them, so there is nothing to generate. The signing key is Ed25519 and is a
 * KEYPAIR, of which only the private half is stored: `03 §4` computes `key_id` from the public half
 * and `dog_sig` carries it in the file, and both are derivable from PKCS#8 at the moment of signing.
 * Returning it here would be handing back a value with nowhere to go — the record has no column for
 * it and nothing signs yet — and a returned value nobody stores is the shape of a thing that looks
 * finished and is not.
 *
 * ALL THREE AT CREATION, not on first use. `12 §6`: "sign-up generates all three keys". A key made
 * lazily is a key made under whatever conditions the first use happens in, and a record that has
 * been exported before its signing key existed is a record nobody can verify.
 */
export async function recordKeys(
  store: KeyStore,
  record: string,
): Promise<Record<Purpose, WrappedKey>> {
  const generated: webcrypto.CryptoKeyPair | webcrypto.CryptoKey = await crypto.subtle.generateKey(
    { name: 'Ed25519' },
    true,
    ['sign', 'verify'],
  );
  if (!isPair(generated))
    throw new Error('Ed25519 produced a single key where a keypair was asked for. This build cannot sign.');
  const pair = generated;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));

  /* THE TWO DEKS ARE ZERO-FILLED TOO. They are wrapped and then nothing here needs them again — the
     record opens them through the vault, under the KEK, when it has something to seal. */
  const dekRecord = new Uint8Array(randomBytes(KEK_BYTES));
  const dekConnector = new Uint8Array(randomBytes(KEK_BYTES));

  const keys = {
    record: await wrap(store, record, 'record', dekRecord),
    connector: await wrap(store, record, 'connector', dekConnector),
    signing: await wrap(store, record, 'signing', pkcs8),
  };
  dekRecord.fill(0);
  dekConnector.fill(0);
  pkcs8.fill(0);
  return keys;
}

/** `0600` on a file SQLite or somebody else made. Advisory on Windows, and not worth refusing over. */
export function lockDown(file: string): void {
  try {
    chmodSync(file, 0o600);
  } catch {
    /* A file somebody else owns is theirs to permission. */
  }
}
