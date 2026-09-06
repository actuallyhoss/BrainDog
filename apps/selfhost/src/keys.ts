/**
 * The root key, and the three the record is wrapped with. `49 §4.4`, `12 §6`, `ADR-062`.
 *
 * THE VAULT CANNOT HOLD ITS OWN KEY. `12 §6` states it as the reason this file is in the host and
 * not in the kernel: reading the vault needs the KEK, so the safe cannot hold what opens it. The
 * record holds sealed bytes and the fingerprint of what wrapped them, and has no way to open
 * either — `vault.ts` performs no crypto at all, deliberately. `secret-grep` is red on a key that
 * reaches a log, and now on the names THIS file uses: it looked only for `plaintext`, `plainText`,
 * `decrypted` and `secretValue`, none of which appears here, so the claim in this header was true of
 * a vocabulary nothing in the repository speaks.
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
import { chmodSync, existsSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';

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
function keyBytes(file: string, say: (line: string) => void): Uint8Array {
  if (!existsSync(file)) mint(file);

  /* STAT BEFORE READ, AND IT MUST BE A FILE. `readFileSync` on a FIFO blocks for ever — `init`
     hangs with no output, no timeout and no sentence, which is the one failure mode worse than a
     refusal. A directory throws `EISDIR` from three frames down. Both are one `isFile()` away. */
  const stat = statSync(file);
  if (!stat.isFile())
    throw new Error(`${file} is not a regular file, and a key is ${KEK_BYTES} bytes in one.`);

  /* THE MODE IS CHECKED WHERE IT MEANS SOMETHING. On POSIX a group- or world-readable key file is
     the key being readable, and `49 §4.4` refuses to boot. On Windows the bit is advisory and the
     ACL is the real permission, so a refusal there would be about nothing — `49 §4.4` says the check
     is skipped AND LOGGED ONCE, and it used to claim that in a comment while printing nothing. */
  if (process.platform === 'win32') say(`  key file mode is not checked on Windows; ${file} is protected by its ACL`);
  else {
    const mode = stat.mode & 0o777;
    if ((mode & 0o077) !== 0)
      throw new Error(`${file} is mode ${mode.toString(8)} and a key is 0600. Anybody in your group can read it.`);
  }

  const held = readFileSync(file);
  if (held.length !== KEK_BYTES) {
    held.fill(0);
    throw new Error(
      `${file} is ${held.length} bytes and a key is ${KEK_BYTES}. Move it aside, or point at the right one.`,
    );
  }

  /* THE BUFFER THAT CAME OFF DISK IS THE ONE THAT HAS TO GO. `new Uint8Array(buffer)` COPIES, so
     zero-filling the copy left the original untouched — and `readFileSync` of a 32-byte file
     allocates out of Node's shared 8 KiB pool, so the root key stayed in memory that
     `Buffer.allocUnsafe` hands to the next caller. `49 §8`'s "read once" was true of the wrong
     array. */
  const out = new Uint8Array(held);
  held.fill(0);
  return out;
}

/**
 * Thirty-two bytes on disk, by a name nothing else can be holding.
 *
 * `wx` WAS NOT THE WHOLE OF THE RACE PROTECTION, because `O_CREAT|O_EXCL` makes the file EXIST
 * before the bytes are in it. The loser of the race re-read an empty file and refused "is 0 bytes";
 * worse, a process killed between the create and the write left that empty file behind for ever —
 * `wx` never rewrites it, so every later boot refused identically on a host where nothing had been
 * created yet.
 *
 * WRITE THEN RENAME. The temp file carries the bytes before it carries the name, and `rename` is
 * atomic: the loser still loses, and what it then reads is a whole key.
 */
function mint(file: string): void {
  const tmp = `${file}.${process.pid}.tmp`;
  const fresh = randomBytes(KEK_BYTES);
  try {
    writeFileSync(tmp, fresh, { mode: 0o600, flag: 'wx' });
    /* AND THE BYTES GO FROM HERE TOO. They were handed to `writeFileSync` and dropped, which leaves
       a freshly minted root key in the same shared pool as the read above. */
    fresh.fill(0);
    renameSync(tmp, file);
  } catch (e) {
    fresh.fill(0);
    try {
      rmSync(tmp, { force: true });
    } catch {
      /* A temp file we could not remove is litter, not a reason to refuse. */
    }
    /* Somebody else won, or made it first. Theirs is the key. */
    if ((e as { code?: string }).code !== 'EEXIST') throw e;
  }
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
export async function openKeyStore(file: string, say: (line: string) => void = () => {}): Promise<KeyStore> {
  const root = keyBytes(file, say);
  const kekId = await fingerprint(root);
  const key = await crypto.subtle.importKey('raw', root, 'AES-GCM', false, ['encrypt', 'decrypt']);

  /* AND THE ROOT BYTES GO. `49 §8`: read once, used once, zero-filled. The imported `CryptoKey` is
     not extractable, so what is left is a handle rather than a key.
   *
   * `k_code` AND `k_share` ARE NOT DERIVED HERE, and that is a decision rather than an omission.
   * `49 §4.4` derives both by HKDF-SHA-256 over this root with the info strings
   * `braindog/device-code` and `braindog/share`, and NOTHING IN THIS REPOSITORY SIGNS A DEVICE CODE
   * OR A SHARE TOKEN: `/auth/device/*` and `/s/<token>` are unbuilt. They were derived, held for the
   * life of the store, and read by nothing but their own test — which is the failure this codebase
   * keeps finding, performed on key material. Two lines the day either route exists. */
  root.fill(0);

  return {
    current: () => Promise.resolve({ kekId, key }),
    byId: (id) => Promise.resolve(id === kekId ? key : null),
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

/**
 * `0600` on a file SQLite or somebody else made. Advisory on Windows, and not worth refusing over.
 *
 * IT SWALLOWED EVERYTHING, INCLUDING THE CASES THAT ARE THIS COMMAND'S FAULT. Both call sites are
 * files `init` has just made, and a `chmod` that failed left `directory.sqlite` — every person on
 * the installation, by address — at `0666 & ~umask` with nothing said and exit 0. `EPERM` on a file
 * somebody else owns is theirs to permission; anything else is worth one line.
 */
export function lockDown(file: string, say: (line: string) => void = () => {}): void {
  try {
    chmodSync(file, 0o600);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code !== 'EPERM' && code !== 'ENOENT')
      say(`  could not set ${file} to 0600 (${code ?? 'unknown'}); check it by hand`);
  }
}
