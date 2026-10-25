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
 * NO `Plaintext` BRAND HERE, for `sealing.ts`'s reason: the brand is held to the three files that answer with a value,
 * and this one only ever holds a key, which it zero-fills before it returns. NOTHING HERE LOGS.
 */

import type { Result } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import type { Handler } from './index.ts';
import { NONCE_BYTES, recordAad, type Bytes } from './sealing.ts';

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

/** One re-wrap of the record key, as a step makes it (`WrappingChange` in the kernel's `keychain.ts`). */
export type WrappingChange =
  | { to: 'passphrase'; wrapped: Uint8Array; nonce: Uint8Array; salt: Uint8Array }
  | { to: 'kek'; wrapped: Uint8Array; nonce: Uint8Array; kek_id: string };

/** What `setKeychainPassphrase` and `clearKeychainPassphrase` answer: whether the keychain is behind a passphrase now. */
export type KeychainPassphrase = { on: boolean };

/** The step the record's two methods are handed (`PassphraseRewrap` in the kernel's `api/keychain-passphrase.ts`). */
export type PassphraseRewrap = (held: RecordWrapping) => Promise<Result<WrappingChange>>;

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
const NOT_OPENED = 'This host key store does not open this record, so nothing was changed.';

/** The step for one change, holding the passphrase the request carried and asking the root key only when it runs. */
function rewrapFor(to: 'passphrase' | 'kek', said: unknown, root: () => Promise<RootKeys | null>): PassphraseRewrap {
  return async (held) => {
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
      try {
        return ok({ to: 'passphrase' as const, ...(await wrapUnderPassphrase(keys.record, key, passphrase.value)) });
      } finally {
        key.fill(0);
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
 * one: `null` when the keychain is on the root key and the host opens it as it always has.
 *
 * `ask` IS THE RECORD'S `unlockKeychain`, which puts the keychain gate first, counts the try, and calls the step this builds.
 * The key the step opens stays here, in the host, and the caller zero-fills it when its request is answered.
 */
export async function unlockedKey(
  body: Record<string, unknown>,
  record: string,
  ask: (unlock: PassphraseUnlock) => Promise<Result<KeychainPassphrase>>,
): Promise<Result<Uint8Array | null>> {
  const said = passphraseOf(body.passphrase, false);
  if (!said.ok) return said;
  const passphrase = said.value;
  /* A BOX AND NOT A `let`, because the step writes it from inside a closure the compiler cannot follow. */
  const box: { key: Uint8Array | null } = { key: null };
  let out: Result<KeychainPassphrase>;
  try {
    out = await ask(async (held) => {
      if (passphrase === null) return null;
      box.key?.fill(0);
      box.key = await openUnderPassphrase(record, held, passphrase);
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
  return box.key === null ? no('WRONG_KEY', 'That is not this keychain’s passphrase.', { at: 'passphrase' }) : ok(box.key);
}
