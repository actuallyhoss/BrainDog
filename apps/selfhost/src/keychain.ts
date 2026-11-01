/**
 * The self-host's key step: where a key put in is sealed, and where one read back is opened.
 * `12 §6`, ADR-062.
 *
 * ONE OF THE THREE FILES THE `Plaintext` BRAND LIVES IN (`tools/gates/secret-grep.mjs`). A value arrives in a
 * body, is sealed here under a key derived from the record's own, and is dropped; the record is handed sealed
 * bytes. A read runs the other way and answers once, from `answerOpen`, with `no-store`, which is the gate's
 * recorded exemption for this file. Nothing here logs.
 *
 * TWO DOORS AND ONE STEP. `keychainDoor` is `/api/vault/*`, whose credential is a keychain grant on an agent's machine
 * and which refuses any request carrying an `Origin`. `keysDoor` is `/api/keys/*`, the app's own, whose
 * credential is a browser session and which requires one. They share the sealing and opening below and nothing
 * else, so the second is a door beside the first rather than a hole in it: what decides whether a session may do
 * this is the record's `keychain(ctx)` gate, which wants an owner, no token, and a proof under fifteen minutes old.
 *
 * THE BYTES ARE `47 §4.6`'S AND THEY ARE NOT IN THIS FILE. The record's DEK is unwrapped under the KEK with
 * `record ‖ 0x1F ‖ "record"`; the grant key is HKDF-SHA-256 over it with an empty salt and the grant id as info;
 * the value is AES-256-GCM under that, with a fresh nonce and `record ‖ 0x1F ‖ grant ‖ 0x1F ‖ version` as
 * additional data, which the record names. Those steps are `@braindog/host`'s `sealing.ts`, shared with the
 * Worker, because a credential deposited here has to open there and back for as long as both exist. They were
 * written out twice and were byte-identical, which is not the same as guaranteed to stay so, and nothing
 * enforced it except the two files happening to match. What stays here is where a DEK comes from: this host's
 * key store on disk, which is the half that genuinely differs.
 */

import { randomBytes } from 'node:crypto';
import type { webcrypto } from 'node:crypto';

import {
  grantKey as deriveGrantKey,
  NONCE_BYTES,
  openSealed as openBytes,
  purposeOf,
  seal as sealBytes,
  sealedUnderOf,
  KEYCHAIN_HEADERS,
  keychainReply,
  type KeysDoor,
  type SealedUnder,
  type SessionHints,
  type KeychainDoor,
  type KeychainGrantSeen,
} from '@braindog/host';
import type { CallContext, RecordApi, SealTarget, Sealed } from '@braindog/record';
import { no, ok, type Result } from '@braindog/ports';
import { unlockedKey } from '@braindog/host';

import { offeredId, unwrap, type KeyStore } from './keys.ts';

/** A value in the clear. Named in this file and never passed out of it but to the one answer that asked. */
type Plaintext = Uint8Array & { readonly brand: 'Plaintext' };

/** Who a deposit or a read is by: an agent's checked keychain grant, or a person's browser session. */
type By = KeychainGrantSeen | CallContext;

/** 64 KiB, which is more than a private key or an env file of keys. */
const VALUE_LIMIT = 65_536;

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
const text = (x: unknown): string => (typeof x === 'string' ? x : '');

/**
 * The grant's own key, or `null` when this host's key store does not open the record's.
 *
 * `unlocked` IS THE RECORD KEY A PASSPHRASE OPENED FOR THIS REQUEST (`unlockedKey`), and behind a passphrase it is the
 * only way in: the root key opens nothing there. The caller zero-fills it when its request is answered.
 */
async function grantKey(
  store: KeyStore,
  record: string,
  key: SealTarget['key'],
  grant: string,
  unlocked: Uint8Array | null = null,
  purpose: SealedUnder = 'record',
): Promise<webcrypto.CryptoKey | null> {
  /* A CONNECTOR KEY IS NEVER BEHIND THE PASSPHRASE (ADR-052): a scheduled run has no person to type it, so only the
     record key can be, and the key a passphrase opened is that one and no other. */
  if (key.wrapped_by === 'passphrase') return unlocked === null || purpose !== 'record' ? null : await deriveGrantKey(unlocked, grant);
  if (key.kek_id === null) return null;
  /* THE PURPOSE IS HALF THE WRAPPING'S ADDITIONAL DATA, so the connector key unwraps only when asked for as itself. */
  const dek = await unwrap(store, record, purpose, { wrapped: key.wrapped, nonce: key.nonce, kek_id: key.kek_id, wrapped_by: 'kek' });
  if (!dek) return null;
  try {
    /* AWAITED INSIDE THE `try`, so the derivation is done before the `finally` zeroes the DEK. Node's
       `importKey` copies the key material eagerly and dropping the `await` happens to work, but nothing in
       the WebCrypto specification promises that copy and the Worker is a different implementation. */
    return await deriveGrantKey(dek, grant);
  } finally {
    dek.fill(0);
  }
}

const WRONG_KEY = 'This host key store does not open this BrainDog, so no key was sealed or opened.';
const CONNECTOR_SEAL = 'This BrainDog cannot seal a key for a scheduled connector yet, so nothing was added. Add it for you to use, or try again after the next update.';
const NO_IDENTITY = 'This BrainDog has no identity yet, so it keeps no keys.';

/** The one answer a value leaves in. */
function answerOpen(credential: string, label: string, plain: Plaintext): Response {
  const body = JSON.stringify({ ok: true, value: { credential, label, value: new TextDecoder().decode(plain) } });
  plain.fill(0);
  const headers = new Headers();
  for (const [k, v] of KEYCHAIN_HEADERS) headers.append(k, v);
  return new Response(body, { status: 200, headers });
}

/**
 * The two steps, over the record in this process, for whoever a door has already checked.
 *
 * `by` GOES STRAIGHT THROUGH TO THE RECORD, unread. Which caller it is decides what the record will allow, and
 * that decision is the record's: a host that reasoned about it here would be a second ladder next to the one
 * `30 §10` says must be the only one.
 */
function steps(api: RecordApi, store: KeyStore) {
  const recordId = (): string | null => api.kernel.identity()?.id ?? null;
  /* THE RECORD KEY A PASSPHRASE OPENS FOR ONE REQUEST, or `null` while the keychain is on the root key. The record's
     `unlockKeychain` puts the keychain gate first and counts the try; the caller zero-fills what comes back. */
  const unlocked = (record: string, by: By, body: Record<string, unknown>) =>
    unlockedKey(body, record, (unlock) => api.unlockKeychain(unlock, by));

  /* `opts` IS SET ON THE LOGIN-TOKEN DEPOSIT ALONE (`depositByToken` below), and never from anything in a request. */
  const deposit = async (
    by: By,
    body: Record<string, unknown>,
    hints: SessionHints,
    opts?: { agentDeposit?: true | undefined },
  ): Promise<Result<unknown>> => {
    const record = recordId();
    if (record === null) return no('NOT_IN_THIS_BUILD', NO_IDENTITY, { at: 'record' });
    const said = body.value;
    if (typeof said !== 'string' || said.length === 0) return no('REQUIRED_MISSING', 'A deposit carries the value, as a string.', { at: 'value' });
    const value = utf8(said) as Plaintext;
    if (value.length > VALUE_LIMIT) {
      value.fill(0);
      return no('OUT_OF_BOUNDS', 'A key is at most 64 KiB.', { at: 'value' });
    }
    /* WHICH KEY SEALS IT, asked before any key is unwrapped, so a deposit that could not be sealed as asked touches none. */
    const under = sealedUnderOf(body, opts?.agentDeposit === true);
    if (!under.ok) {
      value.fill(0);
      return under;
    }
    const sealedUnder = under.value;
    const door = await unlocked(record, by, body);
    if (!door.ok) {
      value.fill(0);
      return door;
    }
    const recordKey = door.value;
    /* What it is, unopened: a length, never a character of it. */
    const hint = `a ${String(said.length)}-character value`;
    const seal = async (target: SealTarget): Promise<Result<Sealed>> => {
      /* SEALED UNDER THE KEY THAT WAS ASKED FOR OR NOT AT ALL. A record that handed back its own key for a connector's
         deposit would bind a key a scheduled run is refused, under a sentence saying it was added for the connector. */
      if (purposeOf(target) !== sealedUnder) return no('NOT_IN_THIS_BUILD', CONNECTOR_SEAL, { at: 'sealed_under' });
      const key = await grantKey(store, record, target.key, target.grant, recordKey, sealedUnder);
      /* BEHIND A PASSPHRASE THE RECORD KEY NAMES NO ROOT KEY, and a grant row names one all the same: the one the
         record's other keys are under, which a later rotation renames with them. */
      const kekId = target.key.kek_id ?? (recordKey === null ? null : await offeredId(store, api.kernel.wrappingKey()));
      if (!key || kekId === null) return no('WRONG_KEY', WRONG_KEY, { at: 'kek_id' });
      const nonce = new Uint8Array(randomBytes(NONCE_BYTES));
      const sealed = await sealBytes(key, nonce, target.aad, value);
      return ok({ ciphertext: sealed, nonce, kdf: 'hkdf-sha256', kek_id: kekId, bytes: value.length, hint });
    };
    /* A PERSON MAY NAME THE ROW AND THE PROJECT AND AN AGENT MAY NOT, which is why this is two shapes rather than
       one spread. A keychain grant already carries its project, and reading a second one out of its body would be a
       way to put a key somewhere the grant does not reach. */
    const args =
      'principal' in by
        ? { label: body.label, opens: body.opens, kind: body.kind, project: body.project, credential: body.credential, sealed_under: sealedUnder, everywhere: body.everywhere }
        : { label: body.label, opens: body.opens, kind: body.kind, sealed_under: sealedUnder, everywhere: body.everywhere };
    try {
      return await api.depositGrant(args, by, hints, seal, opts);
    } finally {
      value.fill(0);
      recordKey?.fill(0);
    }
  };

  const open = async (by: By, body: Record<string, unknown>, hints: SessionHints): Promise<Response> => {
    const record = recordId();
    if (record === null) return keychainReply(no('NOT_IN_THIS_BUILD', NO_IDENTITY, { at: 'record' }));
    const door = await unlocked(record, by, body);
    if (!door.ok) return keychainReply(door);
    const recordKey = door.value;
    try {
      /* THE ID THE RECORD'S KEYS ARE WRAPPED UNDER, while the store still holds it, so a key opens between a new key file
         and the re-wrap this process makes as it starts (`offeredId`). */
      const kekId = await offeredId(store, api.kernel.wrappingKey());
      const out = await api.openForGrant({ label: text(body.label), credential: text(body.credential) }, by, hints, kekId);
      if (!out.ok) return keychainReply(out);
      const sealed = out.value;
      const key = await grantKey(store, record, sealed.key, sealed.id, recordKey, purposeOf(sealed));
      if (!key) return keychainReply(no('WRONG_KEY', WRONG_KEY, { at: 'kek_id' }));
      const opened = await openBytes(key, sealed.nonce, sealed.aad, sealed.ciphertext);
      /* A failed decrypt says only that these bytes do not open under this key. */
      if (opened === null)
        return keychainReply(no('WRONG_KEY', 'The sealed value did not open under this host key store.', { at: 'kek_id' }));
      return answerOpen(sealed.credential, sealed.label, opened as Plaintext);
    } finally {
      recordKey?.fill(0);
    }
  };

  return { deposit, open };
}

/**
 * An agent's door, `/api/vault/*`. Without a key store both halves answer `NOT_IN_THIS_BUILD`.
 *
 * `token` IS THE HOST'S OWN `/api` BEARER CHECK, and with it the deposit door takes an agent's login token as well as a
 * keychain grant: the record adds that key as new, in the token's run's project, or refuses.
 * The open door still takes a keychain grant only (`serveKeychain` in `@braindog/host`).
 */
export function keychainDoor(
  api: RecordApi,
  store: KeyStore | undefined,
  token?: (request: Request) => Promise<Result<CallContext>>,
): KeychainDoor<CallContext> {
  const grant = (bearer: string) => api.keychainGrant(bearer);
  if (!store) return { grant };
  const { deposit, open } = steps(api, store);
  return {
    grant,
    ...(token === undefined ? {} : { token }),
    keys: {
      deposit: (ask) => deposit(ask.grant, ask.body, ask.hints),
      open: (ask) => open(ask.grant, ask.body, ask.hints),
      depositByToken: (ask) => deposit(ask.ctx, ask.body, ask.hints, { agentDeposit: true }),
    },
  };
}

/** The app's own door, `/api/keys/*`, for a browser session. Without a key store both halves answer the same. */
export function keysDoor(api: RecordApi, store: KeyStore | undefined, origins: ReadonlySet<string>): KeysDoor<CallContext> {
  if (!store) return { origins };
  const { deposit, open } = steps(api, store);
  return {
    origins,
    keys: {
      put: (ask) => deposit(ask.ctx, ask.body, ask.hints),
      open: (ask) => open(ask.ctx, ask.body, ask.hints),
    },
  };
}
