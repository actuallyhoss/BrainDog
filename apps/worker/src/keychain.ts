/**
 * The Worker's keychain step: `/api/vault/deposit` and `/api/vault/open`. `12 §6` rule 9,
 * ADR-062.
 *
 * WITHOUT `env.KEK` BOTH DOORS CHECK THE KEYCHAIN GRANT AND THEN ANSWER `NOT_IN_THIS_BUILD`. The grant is checked first,
 * with the record's `keychainGrant` and never `verifyToken`, so a login token is refused here exactly as on the
 * self-host, and the gap says so only to a grant holder.
 *
 * WITH IT, THE DOORS SEAL AND OPEN AS THE SELF-HOST'S DO, through `packages/host/src/keychain.ts`. A deposit's value
 * arrives in the body, is sealed here under a key derived from the record's own, and is dropped; the record, over
 * RPC, is handed sealed bytes. A read runs the other way and answers once, from `answerOpen`, with `no-store`.
 * The bytes are `47 §4.6`'s: the record's DEK is unwrapped under the root key with `record ‖ 0x1F ‖ "record"`, the
 * grant key is HKDF-SHA-256 over it with an empty salt and the grant id as info, and the value is AES-256-GCM under
 * that, with a fresh nonce and the additional data the record names.
 *
 * A RECORD MADE BEFORE THE KEY STORE WAS BOUND HAS NO WRAPPED KEY, and it answers one sentence saying so.
 *
 * A RECORD KEY BEHIND THE KEYCHAIN PASSPHRASE IS OPENED WITH THE PASSPHRASE THE BODY CARRIES, and never with the root key,
 * which opens nothing there (`12 §6`, "The optional second factor"). The record's `unlockKeychain` is asked first, over RPC:
 * it puts the keychain gate before anything, counts the try against the passphrase's limit, and calls back the step
 * `unlockedKey` builds, so the key it opens stays in this Worker for the one request and is zero-filled after it. An
 * agent's keychain grant carries no passphrase and opens nothing behind one.
 *
 * THE BYTES ARE `@braindog/host`'S `sealing.ts`, shared with the self-host: `47 §13` D9's key hierarchy, held
 * in one place so a credential deposited in one host opens in the other. They were written out in both, byte for
 * byte the same, with nothing enforcing it. What stays here is where a DEK comes from, which is this host's
 * binding. `openSealed` below is the higher-level one the reveal route reuses and it stays too, because it takes
 * a `KeyStore` and that is the part the two hosts do not share.
 *
 * ITS OWN FILE, free of `cloudflare:`, so the doors are tested in Node. It is one of the three files the `Plaintext`
 * brand lives in (`tools/gates/secret-grep.mjs`). Nothing here logs.
 */

import {
  grantKey as deriveGrantKey, NONCE_BYTES, openSealed as openBytes, purposeOf, seal as sealBytes, sealedUnderOf,
  serveKeys, serveKeychain, servesKeys, servesKeychain, unlockedFor, unlockedKey, KEYCHAIN_HEADERS, keychainReply,
  type KeysDoor, type PassphraseUnlock, type RootKeys, type SealedUnder, type SessionHints, type KeychainGrantSeen, type KeychainPassphrase,
  type UnlockedKey,
} from '@braindog/host';
import type { CallContext, Deposited, OpenedForGrant, SealTarget, Sealed } from '@braindog/record';
import { no, ok, type Result } from '@braindog/ports';

import { keyStoreOf, offeredId, rootKeysOf, unwrap, type KekBinding, type KeyStore } from './keys.ts';
import { recordOf } from './route.ts';

export { servesKeys, servesKeychain };

/** A value in the clear. Named in this file and never passed out of it but to the one answer that asked. */
type Plaintext = Uint8Array & { readonly brand: 'Plaintext' };

/** Who a deposit or a read is by: an agent's checked keychain grant, or a person's browser session. */
export type By = KeychainGrantSeen | CallContext;

/** The record's half of the doors, over RPC: every call names the record the caller was checked against. */
export type KeyDeps = {
  /** `env.KEK`'s store, opened after the caller is checked, or `null` when the secret is empty. */
  store(): Promise<KeyStore | null>;
  /** The fingerprint the record's keychain is wrapped by, or `null` for a record made before the store was bound. */
  wrappingKey(record: string): Promise<string | null>;
  depositGrant(
    record: string,
    /* `sealed_under` IS THE HOST'S READING OF THE BODY (`sealedUnderOf`), so the record binds what this host sealed. */
    args: { label?: unknown; opens?: unknown; kind?: unknown; project?: unknown; credential?: unknown; sealed_under?: SealedUnder; everywhere?: unknown },
    by: By,
    hints: SessionHints,
    seal: (target: SealTarget) => Promise<Result<Sealed>>,
    /* SET BY THE DEPOSIT DOOR ALONE, for a login token it checked itself. */
    opts?: { agentDeposit?: true | undefined },
  ): Promise<Result<Deposited>>;
  openForGrant(
    record: string,
    args: { label?: unknown; credential?: unknown },
    by: By,
    hints: SessionHints,
    kekId: string,
  ): Promise<Result<OpenedForGrant>>;
  /**
   * The record's `unlockKeychain`, over RPC: the keychain gate, the count of wrong passphrases, and `unlock` called when the
   * record key is behind a passphrase. `unlock` runs here in the Worker when the record calls it back, so the key it
   * opens never reaches the record.
   *
   * OPTIONAL, BECAUSE THE RECORD'S HALF LANDS BESIDE IT. Without it a record behind a passphrase opens nothing here, and
   * says `WRONG_KEY`, which is true of this host until it can ask.
   */
  unlockKeychain?: ((record: string, by: By, unlock: PassphraseUnlock) => Promise<Result<KeychainPassphrase>>) | undefined;
};

/** What the Worker needs: whether the Directory holds the record, the record's answer, and its keys when bound. */
export type GrantDeps = {
  knows(record: string): Promise<boolean>;
  keychainGrant(record: string, bearer: string): Promise<Result<KeychainGrantSeen>>;
  /** An agent's login token at the deposit door: the record it names and the context /api builds for it. */
  token?: ((request: Request) => Promise<Result<{ record: string; ctx: CallContext }>>) | undefined;
  keys?: KeyDeps | undefined;
};

/* The sentence `keychainGrant` gives for every bearer it does not know, so a record this Worker does not hold reads
   the same as a bearer that record does not know. */
const UNKNOWN: Result<KeychainGrantSeen> = {
  ok: false,
  refusal: { code: 'FORBIDDEN', fix: 'That keychain grant is not known here.', at: 'vault' },
};

/** 64 KiB, which is more than a private key or an env file of keys. */
const VALUE_LIMIT = 65_536;

const NO_STORE = 'This host holds no key store yet, so it keeps no keys for agents.';
export const OLD_RECORD = 'Keys need a BrainDog made after this host key store was bound, and this one is older than that.';
const WRONG_KEY = 'This host key store does not open this BrainDog, so no key was sealed or opened.';
const CONNECTOR_SEAL = 'This BrainDog cannot seal a key for a scheduled connector yet, so nothing was added. Add it for you to use, or try again after the next update.';

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
const text = (x: unknown): string => (typeof x === 'string' ? x : '');

/**
 * The grant's own key, or `null` when this key store does not open the record's.
 *
 * `unlocked` IS THE RECORD KEY A PASSPHRASE OPENED FOR THIS REQUEST (`unlockedKey`), and behind a passphrase it is the
 * only way in: the root key opens nothing there. It is used only for the wrapping it was opened from (`unlockedFor`),
 * since a passphrase taken off and put on again is a new key. The caller zero-fills it when its request is answered.
 */
async function grantKey(
  store: KeyStore,
  record: string,
  key: SealTarget['key'],
  grant: string,
  unlocked: UnlockedKey | null = null,
  purpose: SealedUnder = 'record',
) {
  /* A CONNECTOR KEY IS NEVER BEHIND THE PASSPHRASE (ADR-052): a scheduled run has no person to type it, so only the
     record key can be, and the key a passphrase opened is that one and no other. */
  if (key.wrapped_by === 'passphrase') {
    const opened = unlockedFor(unlocked, key);
    return opened === null || purpose !== 'record' ? null : await deriveGrantKey(opened, grant);
  }
  if (key.kek_id === null) return null;
  /* THE PURPOSE IS HALF THE WRAPPING'S ADDITIONAL DATA, so the connector key unwraps only when asked for as itself. */
  const dek = await unwrap(store, record, purpose, { wrapped: key.wrapped, nonce: key.nonce, kek_id: key.kek_id, wrapped_by: 'kek' });
  if (!dek) return null;
  try {
    /* AWAITED INSIDE THE `try`, so the derivation is done before the `finally` zeroes the DEK. Dropping the
       `await` happens to work where `importKey` copies the key material eagerly, and nothing in the
       WebCrypto specification promises it does. */
    return await deriveGrantKey(dek, grant);
  } finally {
    dek.fill(0);
  }
}

/**
 * A scheduled action's key, opened for one request, or `null` when it does not open under this store.
 *
 * HERE AND NOT IN `actions.ts`, because this is one of the three files the `Plaintext` brand lives in: the bytes are
 * the read door's, and the value leaves as the one string the executor puts in one `Authorization` header.
 */
export async function openSealed(
  store: KeyStore,
  record: string,
  sealed: { id: string; key: SealTarget['key']; nonce: Uint8Array; aad: string; ciphertext: Uint8Array },
): Promise<string | null> {
  const key = await grantKey(store, record, sealed.key, sealed.id, null, purposeOf(sealed));
  if (!key) return null;
  const opened = await openBytes(key, sealed.nonce, sealed.aad, sealed.ciphertext);
  if (opened === null) return null;
  const plain = opened as Plaintext;
  const said = new TextDecoder().decode(plain);
  plain.fill(0);
  return said;
}

/** The one answer a value leaves in. */
function answerOpen(credential: string, label: string, plain: Plaintext): Response {
  const body = JSON.stringify({ ok: true, value: { credential, label, value: new TextDecoder().decode(plain) } });
  plain.fill(0);
  const headers = new Headers();
  for (const [k, v] of KEYCHAIN_HEADERS) headers.append(k, v);
  return new Response(body, { status: 200, headers });
}

/**
 * The store, and the record key when a passphrase opened it, once the record is known to have a wrapped key to open.
 *
 * THE PASSPHRASE IS TRIED AFTER THE STORE AND BEFORE THE RECORD IS ASKED WHAT IT IS WRAPPED BY. The record's
 * `unlockKeychain` puts the keychain gate first and counts the try, and a record key behind a passphrase names no root key,
 * so it would otherwise read as a record made before the store was bound. `recordKey` is the caller's to zero-fill.
 */
async function ready(keys: KeyDeps, record: string, by: By, body: Record<string, unknown>): Promise<Result<{ store: KeyStore; recordKey: UnlockedKey | null }>> {
  const store = await keys.store();
  if (!store) return no('NOT_IN_THIS_BUILD', NO_STORE, { at: 'keys' });
  const ask = keys.unlockKeychain;
  const unlocked = ask === undefined ? ok(null) : await unlockedKey(body, record, (unlock) => ask(record, by, unlock));
  if (!unlocked.ok) return unlocked;
  const recordKey = unlocked.value;
  if (recordKey === null && (await keys.wrappingKey(record)) === null) return no('NOT_IN_THIS_BUILD', OLD_RECORD, { at: 'keys' });
  return ok({ store, recordKey });
}

/** Both steps over one record, whose caller a door has already checked. */
function doors(keys: KeyDeps, record: () => string | null) {
  const deposit = async (by: By, body: Record<string, unknown>, hints: SessionHints, opts?: { agentDeposit?: true | undefined }): Promise<Result<unknown>> => {
    const id = record();
    if (id === null) return UNKNOWN;
    const said = body.value;
    if (typeof said !== 'string' || said.length === 0) return no('REQUIRED_MISSING', 'A deposit carries the value, as a string.', { at: 'value' });
    const value = utf8(said) as Plaintext;
    try {
      if (value.length > VALUE_LIMIT) return no('OUT_OF_BOUNDS', 'A key is at most 64 KiB.', { at: 'value' });
      /* WHICH KEY SEALS IT, asked before any key is unwrapped, so a deposit that could not be sealed as asked touches none. */
      const under = sealedUnderOf(body, opts?.agentDeposit === true);
      if (!under.ok) return under;
      const sealedUnder = under.value;
      const opened = await ready(keys, id, by, body);
      if (!opened.ok) return opened;
      const { store, recordKey } = opened.value;
      try {
        /* What it is, unopened: a length, never a character of it. */
        const hint = `a ${String(said.length)}-character value`;
        const seal = async (target: SealTarget): Promise<Result<Sealed>> => {
          /* SEALED UNDER THE KEY THAT WAS ASKED FOR OR NOT AT ALL. A record that handed back its own key for a connector's
             deposit would bind a key a scheduled run is refused, under a sentence saying it was added for the connector. */
          if (purposeOf(target) !== sealedUnder) return no('NOT_IN_THIS_BUILD', CONNECTOR_SEAL, { at: 'sealed_under' });
          const key = await grantKey(store, id, target.key, target.grant, recordKey, sealedUnder);
          /* BEHIND A PASSPHRASE THE RECORD KEY NAMES NO ROOT KEY, and a grant row names one all the same: the one the
             record's other keys are under, which is the one a later rotation renames with them (`rewrapKeys`). */
          const kekId = target.key.kek_id ?? (recordKey === null ? null : await offeredId(store, await keys.wrappingKey(id)));
          if (!key || kekId === null) return no('WRONG_KEY', WRONG_KEY, { at: 'kek_id' });
          const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
          const sealed = await sealBytes(key, nonce, target.aad, value);
          return ok({ ciphertext: sealed, nonce, kdf: 'hkdf-sha256', kek_id: kekId, bytes: value.length, hint });
        };
        /* A PERSON MAY NAME THE ROW AND THE PROJECT AND AN AGENT MAY NOT. A keychain grant already carries its
           project, and reading a second one out of its body would be a way to put a key out of its reach. */
        const args =
          'principal' in by
            ? { label: body.label, opens: body.opens, kind: body.kind, project: body.project, credential: body.credential, sealed_under: sealedUnder, everywhere: body.everywhere }
            : { label: body.label, opens: body.opens, kind: body.kind, sealed_under: sealedUnder, everywhere: body.everywhere };
        return await keys.depositGrant(id, args, by, hints, seal, opts);
      } finally {
        recordKey?.key.fill(0);
      }
    } finally {
      value.fill(0);
    }
  };

  const open = async (by: By, body: Record<string, unknown>, hints: SessionHints): Promise<Response> => {
    const id = record();
    if (id === null) return keychainReply(UNKNOWN);
    const opened = await ready(keys, id, by, body);
    if (!opened.ok) return keychainReply(opened);
    const { store, recordKey } = opened.value;
    try {
      /* THE ID THE RECORD'S KEYS ARE WRAPPED UNDER, while the store still holds it, so a key opens between a rotation and
         this record's night (`offeredId`). Behind a passphrase the record does not compare it. */
      const kekId = await offeredId(store, await keys.wrappingKey(id));
      const out = await keys.openForGrant(id, { label: text(body.label), credential: text(body.credential) }, by, hints, kekId);
      if (!out.ok) return keychainReply(out);
      const sealed = out.value;
      const key = await grantKey(store, id, sealed.key, sealed.id, recordKey, purposeOf(sealed));
      if (!key) return keychainReply(no('WRONG_KEY', WRONG_KEY, { at: 'kek_id' }));
      const decrypted = await openBytes(key, sealed.nonce, sealed.aad, sealed.ciphertext);
      /* A failed decrypt says only that these bytes do not open under this key. */
      if (decrypted === null)
        return keychainReply(no('WRONG_KEY', 'The sealed value did not open under this host key store.', { at: 'kek_id' }));
      return answerOpen(sealed.credential, sealed.label, decrypted as Plaintext);
    } finally {
      recordKey?.key.fill(0);
    }
  };

  return { deposit, open };
}

/**
 * Answer a key door. The bearer names its record in front of the dot, as every bearer here does; the Directory is
 * asked before the record is addressed, because naming an object that does not exist creates it.
 *
 * THE RECORD THE KEYS ARE SEALED FOR IS THE ONE WHOSE GRANT WAS CHECKED, held from that check rather than read from
 * the request a second time.
 */
export function serveWorkerKeychain(request: Request, deps: GrantDeps): Promise<Response> {
  let checked: string | null = null;
  const steps = deps.keys ? doors(deps.keys, () => checked) : null;
  const token = deps.token;
  return serveKeychain<CallContext>(request, {
    grant: async (bearer) => {
      const record = recordOf(`Bearer ${bearer}`);
      if (record === null || !(await deps.knows(record))) return UNKNOWN;
      const out = await deps.keychainGrant(record, bearer);
      if (out.ok) checked = record;
      return out;
    },
    /* A LOGIN TOKEN'S RECORD IS THE ONE ITS OWN CHECK NAMED, held as a grant's is, so the key is sealed for that record
       and no other. */
    ...(token === undefined
      ? {}
      : {
          token: async (asked: Request) => {
            const out = await token(asked);
            if (!out.ok) return out;
            checked = out.value.record;
            return ok(out.value.ctx);
          },
        }),
    keys: steps
      ? {
          deposit: (ask) => steps.deposit(ask.grant, ask.body, ask.hints),
          open: (ask) => steps.open(ask.grant, ask.body, ask.hints),
          depositByToken: (ask) => steps.deposit(ask.ctx, ask.body, ask.hints, { agentDeposit: true }),
        }
      : undefined,
  });
}

/**
 * The root key the keychain password's two routes are answered through, inside the record's own object: `env.KEK`'s
 * store over the record that object holds, or `null` with no store bound or no identity yet
 * (`withKeychainPassphrase` in `packages/host/src/passphrase.ts`).
 *
 * OPENED WHEN A STEP RUNS AND NOT BEFORE, so the store is read only for an owner the record's keychain gate has already
 * let through. A bound value that is not a key still throws, as it does at every other door, rather than reading as a
 * host with no store.
 */
export function passphraseRoot(bound: KekBinding | undefined, record: () => string | null): () => Promise<RootKeys | null> {
  return async () => {
    const id = record();
    if (id === null) return null;
    const store = await keyStoreOf(bound);
    return store === null ? null : rootKeysOf(store, id);
  };
}

/** What the app's own key doors need: the origins this Worker answers for, the record the session names, and the keys. */
export type SessionKeyDeps = { origins: ReadonlySet<string>; record: string; keys?: KeyDeps | undefined };

/**
 * Answer one of the app's own key doors, `/api/keys/*`, for a browser session the Worker has already resolved.
 *
 * THE RECORD IS THE SESSION'S, not the request's. `doorOf` decided which record this person's cookie names, and
 * that is what is passed in: nothing in the body may name a second one, for the reason the keychain door holds the
 * record its grant was checked against rather than reading it twice.
 */
export function serveWorkerKeys(request: Request, ctx: CallContext, deps: SessionKeyDeps): Promise<Response> {
  const steps = deps.keys ? doors(deps.keys, () => deps.record) : null;
  const door: KeysDoor<CallContext> = {
    origins: deps.origins,
    ...(steps
      ? {
          keys: {
            put: (ask) => steps.deposit(ask.ctx, ask.body, ask.hints),
            open: (ask) => steps.open(ask.ctx, ask.body, ask.hints),
          },
        }
      : {}),
  };
  return serveKeys(request, door, ctx);
}
