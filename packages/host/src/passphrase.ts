/**
 * The keychain password, the half both hosts share: the key derived from it, the record key wrapped and opened under
 * that, and the two steps the record's methods are handed (`12 §6` "The optional
 * second factor").
 *
 * PBKDF2-SHA-256, `PASSPHRASE_ITERATIONS` ROUNDS, A FRESH 16-BYTE SALT EACH TIME ONE IS SET. HKDF is not a passphrase
 * KDF and WebCrypto has no Argon2, which is `12 §6`'s whole argument; the salt is held in `vault_key.salt` beside the
 * one wrapping it salts, so a record exported from one host opens on the other with the same passphrase. The record
 * key is wrapped with AES-256-GCM under the derived key, with the same additional data it has under the root key,
 * `record_id ‖ 0x1F ‖ "record"`, so a wrapping copied into another record or another purpose does not open.
 *
 * THE RECORD NEVER SEES THE PASSPHRASE OR A KEY. `withKeychainPassphrase` takes the passphrase off the arguments before
 * the record's method is called and hands the method a step that holds it; `unlockedKey` does the same for the key
 * doors. What the record is handed back is wrapped bytes and a salt, or whether the key opened.
 *
 * PUTTING THE PASSPHRASE ON MAKES A NEW RECORD KEY. A copy of the record taken before holds the old key under the root
 * key, so the old key must open nothing sealed afterwards: the step makes 32 fresh bytes, opens every value the record
 * hands it under the old key and seals each again under the new one with the same additional data, and wraps only the
 * new key under the passphrase. The record writes all of it in one transaction or none of it (`rewrapRecordKey` in the
 * kernel's `keychain.ts`). Taking the passphrase off keeps the key and wraps it under the root key again.
 *
 * NO `Plaintext` BRAND HERE, for `sealing.ts`'s reason: the brand is held to the three files that answer with a value,
 * and this one answers with none. It holds a key, and while the passphrase goes on each value for the moment between
 * opening it and sealing it again, and zero-fills both before it returns. NOTHING HERE LOGS.
 */

import type { Result } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import type { Handler } from './index.ts';
import { freshNonce, grantKey, NONCE_BYTES, openSealed, recordAad, seal, type Bytes } from './sealing.ts';

/**
 * PBKDF2's rounds, `12 §6`. The ceiling on the work one passphrase costs, and every compare pays all of it: a set, a
 * take-off and each key opened or put while the passphrase is on.
 */
export const PASSPHRASE_ITERATIONS = 600_000;

/** PBKDF2's salt: sixteen random bytes, as `vault_key.salt` holds it (`PASSPHRASE_SALT_BYTES` in the kernel's `keychain.ts`). */
export const PASSPHRASE_SALT_BYTES = 16;

/**
 * The shortest passphrase a keychain takes, in characters, and the longest any request may carry.
 *
 * THE SHORTEST IS ASKED ONLY WHEN ONE IS SET. A passphrase typed to open or take off is compared as it is, however
 * short, because a short one is simply wrong and is counted as that. The longest bounds the bytes one request hands
 * PBKDF2, which hashes a long passphrase down once before its rounds.
 */
export const PASSPHRASE_LEAST = 12;
export const PASSPHRASE_MOST = 1_024;

/**
 * How the record key is wrapped now, as the kernel hands it to a step (`RecordWrapping` in the kernel's `keychain.ts`).
 *
 * THE SAME SHAPE WRITTEN TWICE, because the kernel may not import this package. Each host hands `unlockedKey`'s step
 * to the record's `unlockKeychain`, which is typed from the kernel, so a field the kernel stops sending is a host key
 * module that stops compiling there.
 */
export type RecordWrapping = {
  wrapped: Uint8Array;
  nonce: Uint8Array;
  wrapped_by: 'kek' | 'passphrase';
  kek_id: string | null;
  salt: Uint8Array | null;
  beside: string | null;
};

/** One sealed value as the record would hand it out to be opened (`SealedValue` in the kernel's `keychain.ts`). */
export type SealedValue = { ciphertext: Uint8Array; nonce: Uint8Array; aad: string };

/**
 * One grant whose bytes the record key may have sealed, as the record hands it to a step that makes a new key
 * (`SealedUnderRecord` in the kernel's `keychain.ts`): its value when the record key sealed it, its prior version when
 * it has one. `label` names a key the old key does not open; `sealed_under` is the record's, for its compare.
 */
export type SealedUnderRecord = {
  id: string;
  label: string;
  version: number;
  sealed_under: 'record' | 'connector';
  current: SealedValue | null;
  prev: SealedValue | null;
};

/** One grant's bytes sealed again under the new key, each half `null` when it was left as it was (`Resealed` in the kernel). */
export type Resealed = {
  id: string;
  current: { ciphertext: Uint8Array; nonce: Uint8Array } | null;
  prev: { ciphertext: Uint8Array; nonce: Uint8Array } | null;
};

/**
 * One re-wrap of the record key, as a step makes it (`WrappingChange` in the kernel's `keychain.ts`): a new key under the
 * passphrase with every value sealed again under it, or the same key back under a root key.
 */
export type WrappingChange =
  | { to: 'passphrase'; wrapped: Uint8Array; nonce: Uint8Array; salt: Uint8Array; resealed?: readonly Resealed[] }
  | { to: 'kek'; wrapped: Uint8Array; nonce: Uint8Array; kek_id: string };

/** What `setKeychainPassphrase` and `clearKeychainPassphrase` answer: whether the keychain is behind a passphrase now. */
export type KeychainPassphrase = { on: boolean };

/**
 * The step the record's two methods are handed (`PassphraseRewrap` in the kernel's `api/keychain-passphrase.ts`): `sealed`
 * is every value the record key sealed when the passphrase goes on, and empty when it comes off.
 */
export type PassphraseRewrap = (held: RecordWrapping, sealed: readonly SealedUnderRecord[]) => Promise<Result<WrappingChange>>;

/**
 * The record key a passphrase opened for one request at a key door, and the nonce of the wrapping it was opened from.
 *
 * THE NONCE TRAVELS WITH THE KEY, because the door opens the key first and asks the record what to seal or open after:
 * a passphrase taken off and put on again in between is a new key (`rewrapFor`), and the record then hands the new
 * key's wrapping. `unlockedFor` gives the key only for the wrapping it came from.
 */
export type UnlockedKey = { key: Uint8Array; from: Uint8Array };

/** The step the record's `unlockKeychain` is handed: `null` when the request carried no passphrase. */
export type PassphraseUnlock = (held: RecordWrapping) => Promise<boolean | null>;

/**
 * A host's root key, over one record: the half the two hosts do not share, built by each from its own key store
 * (`rootKeysOf` in `apps/worker/src/keys.ts` and `apps/selfhost/src/keys.ts`).
 *
 * `close` WRAPS UNDER `under` WHILE THE STORE HOLDS IT, and under the current root key otherwise, so taking a passphrase
 * off during a root key rotation puts the record key beside the others rather than a rotation ahead of them.
 */
export type RootKeys = {
  /** The record these keys are for: the first half of every additional data. */
  record: string;
  /** The record key opened under the root key it names, or `null` when this store does not open it. */
  open(held: RecordWrapping): Promise<Uint8Array | null>;
  close(key: Uint8Array, under: string | null): Promise<{ wrapped: Uint8Array; nonce: Uint8Array; kek_id: string }>;
};

/**
 * The record's two methods as this file calls them, typed by shape as `RecordSurface` types the rest.
 *
 * `withKeychainPassphrase` TAKES THE RECORD AS ANY OBJECT AND LOOKS THESE UP WHEN IT IS CALLED, as `handlersFor` looks up a
 * row under `routes/`: a type whose every member is optional is one the compiler refuses a record without either
 * method for, and a record that has not got them is answered `NOT_IN_THIS_BUILD`, which is the truth.
 */
export type PassphraseMethods = {
  setKeychainPassphrase?(args: never, ctx: never, rewrap: PassphraseRewrap): Promise<Result<unknown>>;
  clearKeychainPassphrase?(args: never, ctx: never, rewrap: PassphraseRewrap): Promise<Result<unknown>>;
  setVaultPassphrase?(args: never, ctx: never, rewrap: PassphraseRewrap): Promise<Result<unknown>>;
  clearVaultPassphrase?(args: never, ctx: never, rewrap: PassphraseRewrap): Promise<Result<unknown>>;
};

/* ── the bytes ─────────────────────────────────────────────────────────── */

/**
 * A caller's bytes as WebCrypto takes them, for `sealing.ts`'s reason: a bare `Uint8Array` may be backed by a
 * `SharedArrayBuffer` in one runtime's types, and the Durable Object's SQLite hands a BLOB back as an `ArrayBuffer`,
 * which `Uint8Array.from` would read as empty.
 */
const view = (bytes: Uint8Array | ArrayBuffer): Bytes =>
  bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes.buffer instanceof ArrayBuffer ? (bytes as Bytes) : Uint8Array.from(bytes);

const utf8 = (text: string): Bytes => Uint8Array.from(new TextEncoder().encode(text));
const random = (n: number): Bytes => crypto.getRandomValues(new Uint8Array(n));

/** A record key's length: 32 random bytes, as each host's `recordKeys` makes one. */
const RECORD_KEY_BYTES = 32;

/** Two nonces, the same bytes. Either may be an `ArrayBuffer`, as the Durable Object's SQLite hands a BLOB back. */
function sameBytes(a: Uint8Array | ArrayBuffer, b: Uint8Array | ArrayBuffer): boolean {
  const x = view(a);
  const y = view(b);
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

type Key = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

/**
 * PBKDF2-HMAC-SHA-256 for one 32-byte block, written out over WebCrypto's HMAC: `U1 = HMAC(P, S ‖ INT(1))`,
 * `Uj = HMAC(P, Uj-1)`, and the key is every `Uj` XORed together (RFC 8018 §5.2). The same bytes `deriveBits` gives.
 *
 * THE FALLBACK, FOR A RUNTIME THAT REFUSES THE ROUNDS. Node's WebCrypto takes any count; the Workers runtime is
 * understood to refuse PBKDF2 above a hundred thousand rounds, which nobody here has run, so `derive` asks for the
 * real call first and comes here only when it throws. It is one HMAC a round, awaited, and it is slower for it: the
 * cost of a passphrase that opens on either host with the bytes its salt says.
 */
async function pbkdf2(secret: Bytes, salt: Bytes): Promise<Bytes> {
  const mac = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const first = new Uint8Array(salt.length + 4);
  first.set(salt, 0);
  first.set([0, 0, 0, 1], salt.length);
  let round = new Uint8Array(await crypto.subtle.sign('HMAC', mac, first));
  const out = round.slice();
  for (let i = 1; i < PASSPHRASE_ITERATIONS; i++) {
    const next = new Uint8Array(await crypto.subtle.sign('HMAC', mac, round));
    round.fill(0);
    round = next;
    for (let j = 0; j < out.length; j++) out[j] = (out[j] ?? 0) ^ (round[j] ?? 0);
  }
  round.fill(0);
  return out;
}

/**
 * The AES-256-GCM key a passphrase and a salt derive, never extractable.
 *
 * NFC FIRST, so a passphrase typed on one keyboard opens what it closed on another: "é" is one code point from one and
 * two from the other, and PBKDF2 hashes bytes.
 */
async function derive(passphrase: string, salt: Uint8Array | ArrayBuffer): Promise<Key> {
  const secret = utf8(passphrase.normalize('NFC'));
  let bits: Bytes;
  try {
    const base = await crypto.subtle.importKey('raw', secret, 'PBKDF2', false, ['deriveBits']);
    bits = new Uint8Array(
      await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: view(salt), iterations: PASSPHRASE_ITERATIONS }, base, 256),
    );
  } catch {
    bits = await pbkdf2(secret, view(salt));
  }
  try {
    return await crypto.subtle.importKey('raw', bits, 'AES-GCM', false, ['encrypt', 'decrypt']);
  } finally {
    bits.fill(0);
    secret.fill(0);
  }
}

/** The record key wrapped under a passphrase, with a fresh salt and a fresh nonce. */
export async function wrapUnderPassphrase(
  record: string,
  key: Uint8Array,
  passphrase: string,
): Promise<{ wrapped: Uint8Array; nonce: Uint8Array; salt: Uint8Array }> {
  const salt = random(PASSPHRASE_SALT_BYTES);
  const nonce = random(NONCE_BYTES);
  const derived = await derive(passphrase, salt);
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: utf8(recordAad(record, 'record')) }, derived, view(key));
  return { wrapped: new Uint8Array(sealed), nonce, salt };
}

/**
 * The record key opened under a passphrase, or `null`: a wrong passphrase, a wrapping that is not a passphrase's and a
 * tampered byte are one answer, for `sealing.ts`'s reason.
 */
export async function openUnderPassphrase(record: string, held: RecordWrapping, passphrase: string): Promise<Uint8Array | null> {
  if (held.wrapped_by !== 'passphrase' || held.salt === null) return null;
  const derived = await derive(passphrase, held.salt);
  try {
    const out = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: view(held.nonce), additionalData: utf8(recordAad(record, 'record')) },
      derived,
      view(held.wrapped),
    );
    return new Uint8Array(out);
  } catch {
    return null;
  }
}

/**
 * One value opened under the old key's grant key and sealed under the new one's, with a fresh nonce and the same
 * additional data, or `null` when the old key does not open it. What was opened is zero-filled before this returns.
 */
async function sealAgain(
  from: Awaited<ReturnType<typeof grantKey>>,
  to: Awaited<ReturnType<typeof grantKey>>,
  value: SealedValue,
): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array } | null> {
  const opened = await openSealed(from, value.nonce, value.aad, value.ciphertext);
  if (opened === null) return null;
  try {
    const nonce = freshNonce();
    return { ciphertext: await seal(to, nonce, value.aad, opened), nonce };
  } finally {
    opened.fill(0);
  }
}

/**
 * Every value the record handed, sealed again from the old record key to the new one.
 *
 * A VALUE IN USE THE OLD KEY DOES NOT OPEN STOPS THE WHOLE CHANGE, and the sentence names it: the new key would leave it
 * sealed under a key the record no longer holds. A PRIOR VERSION IT DOES NOT OPEN IS LEFT AS IT IS, because a key turned
 * into a connector's keeps the version before under the connector key, which this does not touch.
 */
async function sealAllAgain(old: Uint8Array, fresh: Uint8Array, sealed: readonly SealedUnderRecord[]): Promise<Result<Resealed[]>> {
  const out: Resealed[] = [];
  for (const one of sealed) {
    const from = await grantKey(old, one.id);
    const to = await grantKey(fresh, one.id);
    const current = one.current === null ? null : await sealAgain(from, to, one.current);
    if (one.current !== null && current === null)
      return no(
        'WRONG_KEY',
        `The key "${one.label}" does not open under this BrainDog's own key, so the passphrase was not put on and nothing changed. Replace its value or remove it on the Keys screen, then put the passphrase on again.`,
        { at: 'passphrase' },
      );
    const prev = one.prev === null ? null : await sealAgain(from, to, one.prev);
    if (current !== null || prev !== null) out.push({ id: one.id, current, prev });
  }
  return ok(out);
}

/* ── the steps ─────────────────────────────────────────────────────────── */

/**
 * The passphrase a request carries: `null` when it carries none, and a refusal when it carries something else.
 * `setting` asks for `PASSPHRASE_LEAST` characters, which only a new passphrase is held to.
 */
export function passphraseOf(said: unknown, setting: boolean): Result<string | null> {
  if (said === undefined || said === null || said === '') return ok(null);
  if (typeof said !== 'string') return no('VALUE_MALFORMED', 'A passphrase is text.', { at: 'passphrase' });
  const length = [...said].length;
  if (length > PASSPHRASE_MOST)
    return no('OUT_OF_BOUNDS', `A passphrase is at most ${PASSPHRASE_MOST.toLocaleString('en-GB')} characters.`, { at: 'passphrase' });
  if (setting && length < PASSPHRASE_LEAST)
    return no('OUT_OF_BOUNDS', `A keychain password is at least ${PASSPHRASE_LEAST} characters. A short sentence is easier to remember than a short password.`, {
      at: 'passphrase',
    });
  return ok(said);
}

/** The sentence a host with no key store gives, which is also the sentence for a record its root key does not open. */
const NO_STORE = 'This host holds no key store, so a keychain password cannot be set or taken off here.';
const NOT_OPENED = 'This host key store does not open this BrainDog, so nothing was changed.';

/**
 * The step for one change, holding the passphrase the request carried and asking the root key only when it runs.
 *
 * ON: THE OLD KEY OPENED UNDER THE ROOT KEY, A NEW ONE MADE, every value in `sealed` sealed again under the new one, and
 * the new one wrapped under the passphrase. Both keys are zero-filled before the step returns, whatever it answers.
 * OFF: the key the passphrase opens, wrapped under the root key again, and nothing sealed again.
 */
function rewrapFor(to: 'passphrase' | 'kek', said: unknown, root: () => Promise<RootKeys | null>): PassphraseRewrap {
  return async (held, sealed) => {
    const passphrase = passphraseOf(said, to === 'passphrase');
    if (!passphrase.ok) return passphrase;
    if (passphrase.value === null)
      return no(
        'REQUIRED_MISSING',
        to === 'passphrase' ? 'Type the passphrase to put on the keychain.' : 'Type the keychain’s passphrase to take it off.',
        { at: 'passphrase' },
      );
    const keys = await root();
    if (keys === null) return no('NOT_IN_THIS_BUILD', NO_STORE, { at: 'passphrase' });

    if (to === 'passphrase') {
      const key = await keys.open(held);
      if (key === null) return no('WRONG_KEY', NOT_OPENED, { at: 'kek_id' });
      const fresh = random(RECORD_KEY_BYTES);
      try {
        const resealed = await sealAllAgain(key, fresh, sealed ?? []);
        if (!resealed.ok) return resealed;
        return ok({ to: 'passphrase' as const, ...(await wrapUnderPassphrase(keys.record, fresh, passphrase.value)), resealed: resealed.value });
      } finally {
        key.fill(0);
        fresh.fill(0);
      }
    }
    const key = await openUnderPassphrase(keys.record, held, passphrase.value);
    if (key === null) return no('WRONG_KEY', 'That is not this keychain’s passphrase, so it stays on.', { at: 'passphrase' });
    try {
      return ok({ to: 'kek' as const, ...(await keys.close(key, held.beside)) });
    } finally {
      key.fill(0);
    }
  };
}

/**
 * The handlers with the two passphrase routes answered through the host's root key.
 *
 * THE RECORD'S METHOD STILL ANSWERS, AND ITS GATE STILL COMES FIRST. This hands the method the step and the caller's
 * context, and the method puts the keychain gate before the step is ever called, so nobody but an owner in a browser,
 * proved within fifteen minutes, reaches a root key or a derivation. What the method is handed as its arguments is an
 * empty object: the passphrase is in the step's closure and never on the record's side of the call.
 *
 * A ROUTE THAT IS NOT IN `handlers` IS LEFT OUT, so a host whose route table has not got the two rows is unchanged.
 */
export function withKeychainPassphrase(
  handlers: Record<string, Handler>,
  record: object,
  root: () => Promise<RootKeys | null>,
): Record<string, Handler> {
  const surface = record as PassphraseMethods;
  const answer =
    (name: 'setKeychainPassphrase' | 'clearKeychainPassphrase' | 'setVaultPassphrase' | 'clearVaultPassphrase', to: 'passphrase' | 'kek'): Handler =>
    async (args, ctx) => {
      const method = surface[name];
      if (typeof method !== 'function')
        return no('NOT_IN_THIS_BUILD', `This BrainDog cannot answer ${name} yet, so nothing was changed.`, { at: 'passphrase' });
      return method.call(surface, {} as never, ctx as never, rewrapFor(to, args.passphrase, root));
    };
  return {
    ...handlers,
    ...(handlers.setKeychainPassphrase === undefined ? {} : { setKeychainPassphrase: answer('setKeychainPassphrase', 'passphrase') }),
    ...(handlers.clearKeychainPassphrase === undefined ? {} : { clearKeychainPassphrase: answer('clearKeychainPassphrase', 'kek') }),
    ...(handlers.setVaultPassphrase === undefined ? {} : { setVaultPassphrase: answer('setVaultPassphrase', 'passphrase') }),
    ...(handlers.clearVaultPassphrase === undefined ? {} : { clearVaultPassphrase: answer('clearVaultPassphrase', 'kek') }),
  };
}

/**
 * The record key for one request at a key door, opened with the passphrase its body carries when the keychain is behind
 * one, with the nonce of the wrapping it was opened from: `null` when the keychain is on the root key and the host opens
 * it as it always has.
 *
 * `ask` IS THE RECORD'S `unlockKeychain`, which puts the keychain gate first, counts the try, and calls the step this builds.
 * The key the step opens stays here, in the host, and the caller zero-fills it when its request is answered.
 */
export async function unlockedKey(
  body: Record<string, unknown>,
  record: string,
  ask: (unlock: PassphraseUnlock) => Promise<Result<KeychainPassphrase>>,
): Promise<Result<UnlockedKey | null>> {
  const said = passphraseOf(body.passphrase, false);
  if (!said.ok) return said;
  const passphrase = said.value;
  /* A BOX AND NOT A `let`, because the step writes it from inside a closure the compiler cannot follow. */
  const box: { key: Uint8Array | null; from: Uint8Array | null } = { key: null, from: null };
  let out: Result<KeychainPassphrase>;
  try {
    out = await ask(async (held) => {
      if (passphrase === null) return null;
      box.key?.fill(0);
      box.key = await openUnderPassphrase(record, held, passphrase);
      box.from = Uint8Array.from(view(held.nonce));
      return box.key !== null;
    });
  } catch (e) {
    /* A KEY THE STEP OPENED BEFORE THE ASK FAILED IS ZERO-FILLED ALL THE SAME, because nobody is left to do it. */
    box.key?.fill(0);
    throw e;
  }
  if (!out.ok || !out.value.on) {
    box.key?.fill(0);
    return out.ok ? ok(null) : out;
  }
  return box.key === null || box.from === null ? no('WRONG_KEY', 'That is not this keychain’s passphrase.', { at: 'passphrase' }) : ok({ key: box.key, from: box.from });
}

/**
 * The record key a passphrase opened, for the wrapping the record handed a key door to seal under or open with, or
 * `null` when that wrapping is not the one it was opened from: the passphrase came off and went on again in between,
 * which is a new key, and the old one would seal bytes nothing the record holds opens. The door answers `WRONG_KEY`.
 */
export const unlockedFor = (unlocked: UnlockedKey | null, wrapping: { nonce: Uint8Array | ArrayBuffer }): Uint8Array | null =>
  unlocked !== null && sameBytes(unlocked.from, wrapping.nonce) ? unlocked.key : null;
