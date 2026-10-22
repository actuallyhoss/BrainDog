/**
 * The sealer setup sync seals with: AES-256-GCM over `node:crypto`, so a file is sealed on the machine it left and the
 * host only ever keeps bytes it cannot open (`docs/48-SPEC-CLI.md` §5.20, and the sealed files the record keeps).
 *
 * ONE SYNC KEY, 32 random bytes, made on the first machine that joins and kept in each machine's own secret store
 * (`secret-store.ts`). A COPY OF IT UNDER HIS SYNC PASSPHRASE is kept in the record at `sync/key`, so a new machine can
 * join: `{ v: 1, kdf: "pbkdf2-sha256", rounds: 600000, salt, iv, ct }`, each of the last three base64, `ct` the
 * ciphertext with its 16-byte tag after it, sealed under the key PBKDF2-SHA-256 derives from the passphrase in NFC and
 * the salt, with `braindog-sync-key:<record>` as its additional data. The rounds and the salt are the vault's
 * (`packages/host/src/passphrase.ts`, `12 §6`). The passphrase and the key never leave his machines.
 *
 * EACH FILE: `BDS1`, a fresh 12-byte IV, then the ciphertext and its tag, sealed under the sync key with the file's own
 * sealed key (`carry/<n>/<version>`, `bundle/<id>/manifest`) as its additional data. So a sealed file moved to another
 * key, another thing carried or another version, does not open there.
 *
 * SYMMETRIC ON PURPOSE. With a public-key seal anyone holding the public half, a compromised host included, could seal a
 * forged file for his machines to place. Here only a machine that holds the key can make a file another machine opens.
 *
 * A VERSION BY A KEYED HASH. What a thing carried holds is named by an HMAC-SHA-256 under a key derived from the sync
 * key, so the same bytes are the same version on every machine and nothing is sent twice, and the host, which holds no
 * key, cannot learn what a version holds by guessing at it.
 *
 * NOTHING HERE PRINTS OR KEEPS WHAT IT OPENS. Every function hands bytes back to its caller, and no sentence it throws
 * quotes a key, a passphrase or a byte of what was sealed.
 */

import { createCipheriv, createDecipheriv, createHmac, hkdfSync, pbkdf2Sync, randomBytes } from 'node:crypto';

/** The four bytes every sealed file starts with. */
export const MAGIC = Buffer.from('BDS1', 'latin1');
/** The sync key's length, an IV's and a tag's, in bytes. */
export const KEY_BYTES = 32;
export const IV_BYTES = 12;
export const TAG_BYTES = 16;
/** PBKDF2's rounds and salt, the vault's own (`PASSPHRASE_ITERATIONS`, `PASSPHRASE_SALT_BYTES`). */
export const ROUNDS = 600_000;
export const SALT_BYTES = 16;
/** The shortest new sync passphrase and the longest any is, in characters, as the vault's (`PASSPHRASE_LEAST`). */
export const PASSPHRASE_LEAST = 12;
export const PASSPHRASE_MOST = 1_024;
/**
 * The rounds a kept copy may ask for. The record could hand back any number, and a huge one would hold this command
 * for hours, so a copy outside these is no copy. A smaller one opens nothing a host could use: the tag still has to
 * hold under his passphrase.
 */
const ROUNDS_LEAST = 100_000;
const ROUNDS_MOST = 10_000_000;

/** The copy of the sync key kept in the record, sealed under his sync passphrase. */
export type WrappedKey = { v: 1; kdf: 'pbkdf2-sha256'; rounds: number; salt: string; iv: string; ct: string };

/** A new sync key: 32 random bytes. */
export const newSyncKey = (): Buffer => randomBytes(KEY_BYTES);

/** The additional data the key's copy is sealed with, naming the record it belongs to. */
export const keyAad = (record: string): string => `braindog-sync-key:${record}`;

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

/** Bytes read from base64, or `null` for text that is not that. */
function fromB64(text: unknown): Buffer | null {
  if (typeof text !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/u.test(text) || text.length % 4 !== 0) return null;
  return Buffer.from(text, 'base64');
}

/** AES-256-GCM over `bytes` with `aad`: the IV, then the ciphertext and its tag. */
function gcm(key: Uint8Array, aad: string, bytes: Uint8Array): { iv: Buffer; body: Buffer } {
  const iv = randomBytes(IV_BYTES);
  const c = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
  c.setAAD(Buffer.from(aad, 'utf8'));
  return { iv, body: Buffer.concat([c.update(bytes), c.final(), c.getAuthTag()]) };
}

/** The bytes under a ciphertext and its tag, or `null` when the key, the IV or the additional data is not theirs. */
function ungcm(key: Uint8Array, aad: string, iv: Uint8Array, body: Uint8Array): Buffer | null {
  if (key.length !== KEY_BYTES || iv.length !== IV_BYTES || body.length < TAG_BYTES) return null;
  try {
    const d = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
    d.setAAD(Buffer.from(aad, 'utf8'));
    d.setAuthTag(body.subarray(body.length - TAG_BYTES));
    return Buffer.concat([d.update(body.subarray(0, body.length - TAG_BYTES)), d.final()]);
  } catch {
    /* A tag that does not hold: another key, another place, or bytes changed on the way. */
    return null;
  }
}

/**
 * One file sealed under the sync key, with the sealed key it is kept at as its additional data: `BDS1`, the IV, the
 * ciphertext and its tag. THROWS ONE SENTENCE for a key that is not 32 bytes, which is a fault here and never his.
 */
export function seal(key: Uint8Array, aad: string, bytes: Uint8Array): Buffer {
  if (key.length !== KEY_BYTES) throw new Error('The sync key is not 32 bytes long, so nothing was sealed.');
  const { iv, body } = gcm(key, aad, bytes);
  return Buffer.concat([MAGIC, iv, body]);
}

/** A sealed file opened, or `null` when it is not one, or does not open under this key at this place. */
export function open(key: Uint8Array, aad: string, sealed: Uint8Array): Buffer | null {
  const all = Buffer.from(sealed.buffer, sealed.byteOffset, sealed.byteLength);
  if (all.length < MAGIC.length + IV_BYTES + TAG_BYTES || !all.subarray(0, MAGIC.length).equals(MAGIC)) return null;
  return ungcm(key, aad, all.subarray(MAGIC.length, MAGIC.length + IV_BYTES), all.subarray(MAGIC.length + IV_BYTES));
}

/** The key PBKDF2-SHA-256 derives from a passphrase in NFC and a salt. */
const derive = (passphrase: string, salt: Uint8Array, rounds: number): Buffer => pbkdf2Sync(Buffer.from(passphrase.normalize('NFC'), 'utf8'), salt, rounds, KEY_BYTES, 'sha256');

/** Why a new sync passphrase will not do, in a sentence, or `null` when it will. */
export function passphraseFault(passphrase: string): string | null {
  const n = [...passphrase.normalize('NFC')].length;
  if (n < PASSPHRASE_LEAST) return `A sync passphrase is at least ${String(PASSPHRASE_LEAST)} characters. A short sentence you will remember is better than a short password.`;
  if (n > PASSPHRASE_MOST) return `A sync passphrase is at most ${String(PASSPHRASE_MOST)} characters.`;
  return null;
}

/** The sync key sealed under his passphrase, with a fresh salt, as the record keeps it at `sync/key`. */
export function wrapKey(syncKey: Uint8Array, passphrase: string, record: string): WrappedKey {
  if (syncKey.length !== KEY_BYTES) throw new Error('The sync key is not 32 bytes long, so it was not sealed.');
  const salt = randomBytes(SALT_BYTES);
  const { iv, body } = gcm(derive(passphrase, salt, ROUNDS), keyAad(record), syncKey);
  return { v: 1, kdf: 'pbkdf2-sha256', rounds: ROUNDS, salt: b64(salt), iv: b64(iv), ct: b64(body) };
}

/** A kept copy read as one, or `null` for anything else: another version, another derivation, a field out of shape. */
export function readWrapped(x: unknown): WrappedKey | null {
  if (!isObject(x) || x.v !== 1 || x.kdf !== 'pbkdf2-sha256') return null;
  const { rounds } = x;
  if (typeof rounds !== 'number' || !Number.isInteger(rounds) || rounds < ROUNDS_LEAST || rounds > ROUNDS_MOST) return null;
  const salt = fromB64(x.salt);
  const iv = fromB64(x.iv);
  const ct = fromB64(x.ct);
  if (salt === null || salt.length < SALT_BYTES || iv === null || iv.length !== IV_BYTES || ct === null || ct.length !== KEY_BYTES + TAG_BYTES) return null;
  return { v: 1, kdf: 'pbkdf2-sha256', rounds, salt: x.salt as string, iv: x.iv as string, ct: x.ct as string };
}

/**
 * The sync key out of its copy, or `null` when the passphrase does not open it: a wrong passphrase, another record's
 * copy, or one changed on the way are all one answer, so nothing here says which.
 */
export function unwrapKey(wrapped: WrappedKey, passphrase: string, record: string): Buffer | null {
  const salt = fromB64(wrapped.salt);
  const iv = fromB64(wrapped.iv);
  const ct = fromB64(wrapped.ct);
  if (salt === null || iv === null || ct === null) return null;
  const key = ungcm(derive(passphrase, salt, wrapped.rounds), keyAad(record), iv, ct);
  return key !== null && key.length === KEY_BYTES ? key : null;
}

/** The sync key as a secret store keeps it: 64 lower-case hex characters, which every store reads back as written. */
export const keyText = (key: Uint8Array): string => Buffer.from(key).toString('hex');

/** The sync key from what a secret store gave back, or `null` for anything that is not 32 bytes in hex. */
export function keyFromText(text: string | null): Buffer | null {
  const t = (text ?? '').trim();
  return /^[0-9a-f]{64}$/u.test(t) ? Buffer.from(t, 'hex') : null;
}

/**
 * The version a thing carried is kept under: 24 hex characters of an HMAC-SHA-256 of its bytes, under a key derived
 * from the sync key for this and nothing else, so it is never the key that seals. `label` says what is versioned.
 */
export function versionOf(key: Uint8Array, label: string, bytes: Uint8Array): string {
  const versions = Buffer.from(hkdfSync('sha256', key, Buffer.alloc(0), 'braindog sync versions', KEY_BYTES));
  return createHmac('sha256', versions).update(label, 'utf8').update(Buffer.from([0])).update(bytes).digest('hex').slice(0, 24);
}
