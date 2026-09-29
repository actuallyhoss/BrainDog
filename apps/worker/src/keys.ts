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
 * 64 hex characters or as base64url, or two such keys separated by a space while a rotation is under way, and each is
 * decoded once, imported as a key that cannot be exported, and its bytes zero-filled. With no binding there is no
 * store, and every door and every provisioning behaves as it did before.
 *
 * NOTHING HERE LOGS, and nothing here is a place a value leaves. The one sentence this file throws names no byte.
 * Every unwrapped value goes by one of `secret-grep`'s own names, `kek`, `root`, `dek`, `pkcs8` or `plain`, so a
 * line that ever sends one to a log, an error or a response is a line that gate sees.
 */

import type { RecordWrapping, RootKeys } from '@braindog/host';

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
 * The most root keys one secret holds: the current one, and the one it replaced while records still hold rows wrapped
 * under it (`53 §5.6`). A third would be a rotation begun before the last one's old key was retired (step 7), which
 * leaves two old keys and one slot the runbook keeps for them.
 */
export const ROOT_KEYS = 2;

/**
 * The Worker's store over `env.KEK`, or `null` when nothing is bound.
 *
 * A BOUND VALUE THAT IS NOT 32 BYTES IS A REFUSAL, NEVER AN ABSENT STORE. Treating it as unbound would provision
 * records without keys while the owner believes the key store is on, and those records stay keyless for good.
 *
 * ONE KEY, OR TWO SEPARATED BY A SPACE, AND THE FIRST IS CURRENT. During a rotation the
 * secret holds the new key and then the old one, so `current` wraps under the new key at once while `byId` still opens
 * every row wrapped under the old, until the nightly walk has re-wrapped each record (`rewrap.ts`). One secret rather
 * than a second binding, so none of this function's callers changes and a Secrets Store binding carries the pair as
 * easily as a Worker secret does. A row wrapped under a key the secret no longer holds still answers `WRONG_KEY`,
 * rather than a store claiming to hold a key it does not have.
 */
export async function keyStoreOf(bound: KekBinding | undefined): Promise<KeyStore | null> {
  if (!isBound(bound)) return null;
  const kek = typeof bound === 'string' ? bound : await bound.get();
  if (kek.trim() === '') return null;
  const roots = kek.trim().split(/\s+/).map(decode);
  try {
    /* A VALUE THAT IS NOT KEYS IS REFUSED AS THAT FIRST, so a sentence pasted with spaces in it is called what it is
       rather than counted as keys; only a value of whole keys is counted. */
    if (roots.some((root) => root === null || root.length !== KEY_BYTES))
      throw new Error('The key store secret is not 32 bytes written as hex or base64url, so no key was made, sealed or opened.');
    if (roots.length > ROOT_KEYS)
      throw new Error('The key store secret holds more than two keys, where it takes the current one and the one before it separated by a space, so no key was made, sealed or opened.');
    const held: { kekId: string; key: Key }[] = [];
    for (const root of roots) {
      if (root === null) continue;
      const kekId = await fingerprint(root);
      if (held.some((h) => h.kekId === kekId)) continue;
      held.push({ kekId, key: await crypto.subtle.importKey('raw', root, 'AES-GCM', false, ['encrypt', 'decrypt']) });
    }
    const [current] = held;
    /* The split of a value that is not blank is never empty, so this is the compiler's question and not a case. */
    if (current === undefined) return null;
    return {
      current: () => Promise.resolve(current),
      byId: (id) => Promise.resolve(held.find((h) => h.kekId === id)?.key ?? null),
    };
  } finally {
    for (const root of roots) root?.fill(0);
  }
}

/**
 * The key id to offer a record's `openGrant` and `openForGrant`: the one its `vault_key` rows are wrapped under while
 * this store holds it, and the current one otherwise.
 *
 * WHY NOT ALWAYS THE CURRENT ONE. The record refuses `WRONG_KEY` when the id offered is not the id its rows name
 * (`packages/kernel/src/vault.ts`, `openGrant`), and a record keeps the old id from a rotation until its night. Offering
 * the current id in that window refused every stored credential on the Cloud, although `byId` could open them all.
 * A record wrapped under a key this store does not hold is offered the current id, so its refusal names both.
 */
export async function offeredId(store: KeyStore, wrapping: string | null): Promise<string> {
  if (wrapping !== null && (await store.byId(wrapping)) !== null) return wrapping;
  return (await store.current()).kekId;
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

/**
 * This store over one record, as the vault passphrase's steps take it (`RootKeys` in `packages/host/src/passphrase.ts`).
 *
 * `open` OPENS ONLY A KEY THE ROOT KEY WRAPPED. A record key behind a passphrase names no root key, and this store has
 * nothing to open it with, which is the point of the passphrase. `close` wraps under `under`, the root key the record's
 * other keys are under, while this store still holds it, and under the current one otherwise, so taking a passphrase
 * off between a rotation and the record's night leaves the record naming one root key and not two.
 */
export function rootKeysOf(store: KeyStore, record: string): RootKeys {
  return {
    record,
    open: (held: RecordWrapping) =>
      held.wrapped_by !== 'kek' || held.kek_id === null
        ? Promise.resolve(null)
        : unwrap(store, record, 'record', { wrapped: held.wrapped, nonce: held.nonce, kek_id: held.kek_id, wrapped_by: 'kek' }),
    close: async (recordKey, under) => {
      const held = under === null ? null : await store.byId(under);
      if (under === null || held === null) {
        const fresh = await wrap(store, record, 'record', recordKey);
        return { wrapped: fresh.wrapped, nonce: fresh.nonce, kek_id: fresh.kek_id };
      }
      const nonce = random(NONCE_BYTES);
      const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad(record, 'record') }, held, recordKey);
      return { wrapped: new Uint8Array(sealed), nonce, kek_id: under };
    },
  };
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
