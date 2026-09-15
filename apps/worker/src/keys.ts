/**
 * The Worker's key store: the root key from a secret binding, and the three keys a record is wrapped with.
 * `12 §6`, ADR-062, `51 §8` rule 3.
 *
 * THE SAME CONTRACT AS THE SELF-HOST'S `apps/selfhost/src/keys.ts`, over WebCrypto and nothing else. `current` and
 * `byId` are the store; `wrap` and `unwrap` bind a wrapping to one record and one purpose with AES-256-GCM and the
 * additional data `utf8(record_id) ‖ 0x1F ‖ utf8(purpose)`; `recordKeys` makes the three a record is created with.
 * The fingerprint is the first 18 hex of SHA-256 over the root bytes on both hosts, so one root key names itself the
 * same way wherever it is held.
 *
 * THE ROOT KEY COMES ONLY FROM `env.KEK`. A secret put with `wrangler secret put KEK --env <environment>` arrives as a
 * string; a Secrets Store binding of the same name is read with `get()`. Either way the value is 32 bytes written as
 * 64 hex characters or as base64url, it is decoded once, imported as a key that cannot be exported, and the bytes are
 * zero-filled. With no binding there is no store, and every door and every provisioning behaves as it did before.
 *
 * NOTHING HERE LOGS, and nothing here is a place a value leaves. The one sentence this file throws names no byte.
 * Every unwrapped value goes by one of `secret-grep`'s own names, `kek`, `root`, `dek`, `pkcs8` or `plain`, so a
 * line that ever sends one to a log, an error or a response is a line that gate sees.
 */

/** What a record stores about one wrapped key. The kernel writes it and never reads inside it. */
export type WrappedKey = {
  wrapped: Uint8Array;
  nonce: Uint8Array;
  kek_id: string;
  wrapped_by: 'kek';
};

/** The three `vault_key.purpose` admits. */
export type Purpose = 'record' | 'connector' | 'signing';

/** A WebCrypto key, named without the DOM library or `node:crypto`, so this file compiles for workerd and for Node. */
type Key = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

/** `33 §1` port 8. The host has it; the record does not. */
export type KeyStore = {
  current(): Promise<{ kekId: string; key: Key }>;
  byId(kekId: string): Promise<Key | null>;
};

/** `env.KEK`: a Worker secret, which is a string, or a Secrets Store binding, which is read with `get()`. */
export type KekBinding = string | { get(): Promise<string> };

const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const SEP = 0x1f;

const random = (n: number): Uint8Array => crypto.getRandomValues(new Uint8Array(n));

/** Whether `env.KEK` is bound at all. An empty string is a secret nobody set. */
export const isBound = (bound: KekBinding | undefined): bound is KekBinding => bound !== undefined && bound !== '';

/** 64 hex characters, or 32 bytes of base64url or base64 with or without its padding. Anything else is `null`. */
function decode(kek: string): Uint8Array | null {
  const text = kek.trim();
  if (/^[0-9a-fA-F]{64}$/.test(text)) return Uint8Array.from(text.match(/../g) ?? [], (h) => parseInt(h, 16));
  if (!/^[A-Za-z0-9+/_-]{43}=?$/.test(text)) return null;
  const binary = atob(text.slice(0, 43).replace(/-/g, '+').replace(/_/g, '/') + '=');
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** The first 18 hex of SHA-256, `34 §5`: a fingerprint rather than a name. */
async function fingerprint(root: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', root);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 18);
}

/**
 * The Worker's store over `env.KEK`, or `null` when nothing is bound.
 *
 * A BOUND VALUE THAT IS NOT 32 BYTES IS A REFUSAL, NEVER AN ABSENT STORE. Treating it as unbound would provision
 * records without keys while the owner believes the key store is on, and those records stay keyless for good.
 *
 * `byId` KNOWS ONE ID, as the self-host's does: `KEK_PREV` is not read yet, so a record wrapped under another root
 * key answers `WRONG_KEY` rather than a store claiming to hold a key it does not have.
 */
export async function keyStoreOf(bound: KekBinding | undefined): Promise<KeyStore | null> {
  if (!isBound(bound)) return null;
  const kek = typeof bound === 'string' ? bound : await bound.get();
  if (kek.trim() === '') return null;
  const root = decode(kek);
  if (root === null || root.length !== KEY_BYTES)
    throw new Error('The key store secret is not 32 bytes written as hex or base64url, so no key was made, sealed or opened.');
  try {
    const kekId = await fingerprint(root);
    const key = await crypto.subtle.importKey('raw', root, 'AES-GCM', false, ['encrypt', 'decrypt']);
    return {
      current: () => Promise.resolve({ kekId, key }),
      byId: (id) => Promise.resolve(id === kekId ? key : null),
    };
  } finally {
    root.fill(0);
  }
}

/** `utf8(record_id) ‖ 0x1F ‖ utf8(purpose)`, `12 §6` and `47 §4.6`. */
export function aad(record: string, purpose: Purpose): Uint8Array {
  const id = new TextEncoder().encode(record);
  const what = new TextEncoder().encode(purpose);
  const out = new Uint8Array(id.length + 1 + what.length);
  out.set(id, 0);
  out[id.length] = SEP;
  out.set(what, id.length + 1);
  return out;
}

/** Wrap one key for one record and one purpose, with a fresh nonce every time. */
export async function wrap(store: KeyStore, record: string, purpose: Purpose, plain: Uint8Array): Promise<WrappedKey> {
  const { kekId, key } = await store.current();
  const nonce = random(NONCE_BYTES);
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad(record, purpose) }, key, plain);
  return { wrapped: new Uint8Array(sealed), nonce, kek_id: kekId, wrapped_by: 'kek' };
}

/** And back, or `null`: every way this fails is the one fact that these bytes do not open under this key. */
export async function unwrap(store: KeyStore, record: string, purpose: Purpose, sealed: WrappedKey): Promise<Uint8Array | null> {
  const key = await store.byId(sealed.kek_id);
  if (!key) return null;
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.nonce, additionalData: aad(record, purpose) }, key, sealed.wrapped);
    return new Uint8Array(plain);
  } catch {
    return null;
  }
}

/** Which of the two things `generateKey` returns this one is: narrowed, not cast, as the self-host does. */
const isPair = (k: unknown): k is { privateKey: Key; publicKey: Key } => typeof k === 'object' && k !== null && 'privateKey' in k && 'publicKey' in k;

/** A fresh 32-byte data key, wrapped for one purpose and zero-filled. */
async function wrapDek(store: KeyStore, record: string, purpose: 'record' | 'connector'): Promise<WrappedKey> {
  const dek = random(KEY_BYTES);
  try {
    return await wrap(store, record, purpose, dek);
  } finally {
    dek.fill(0);
  }
}

/**
 * The three keys a record is created with, `12 §6`: two random data keys and the private half of an Ed25519 pair,
 * each wrapped for its purpose, and every unwrapped byte zero-filled before this returns.
 */
export async function recordKeys(store: KeyStore, record: string): Promise<Record<Purpose, WrappedKey>> {
  const generated: unknown = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  if (!isPair(generated))
    throw new Error('Ed25519 produced a single key where a keypair was asked for. This build cannot sign.');
  const pkcs8 = new Uint8Array((await crypto.subtle.exportKey('pkcs8', generated.privateKey)) as ArrayBuffer);
  try {
    return {
      record: await wrapDek(store, record, 'record'),
      connector: await wrapDek(store, record, 'connector'),
      signing: await wrap(store, record, 'signing', pkcs8),
    };
  } finally {
    pkcs8.fill(0);
  }
}
