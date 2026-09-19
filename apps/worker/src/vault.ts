/**
 * The Worker's vault step: `/api/vault/deposit` and `/api/vault/open`. `loop/research-agent-path.md` §5.7,
 * `12 §6` rule 9, ADR-062.
 *
 * WITHOUT `env.KEK` BOTH DOORS CHECK THE VAULT GRANT AND THEN ANSWER `NOT_IN_THIS_BUILD`. The grant is checked first,
 * with the record's `vaultGrant` and never `verifyToken`, so a login token is refused here exactly as on the
 * self-host, and the gap says so only to a grant holder.
 *
 * WITH IT, THE DOORS SEAL AND OPEN AS THE SELF-HOST'S DO, through `packages/host/src/vault.ts`. A deposit's value
 * arrives in the body, is sealed here under a key derived from the record's own, and is dropped; the record, over
 * RPC, is handed sealed bytes. A read runs the other way and answers once, from `answerOpen`, with `no-store`.
 * The bytes are `47 §4.6`'s: the record's DEK is unwrapped under the root key with `record ‖ 0x1F ‖ "record"`, the
 * grant key is HKDF-SHA-256 over it with an empty salt and the grant id as info, and the value is AES-256-GCM under
 * that, with a fresh nonce and the additional data the record names.
 *
 * A RECORD MADE BEFORE THE KEY STORE WAS BOUND HAS NO WRAPPED KEY, and it answers one sentence saying so.
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
  grantKey as deriveGrantKey, NONCE_BYTES, openSealed as openBytes, seal as sealBytes,
  serveKeys, serveVault, servesKeys, servesVault, VAULT_HEADERS, vaultReply,
  type KeysDoor, type SessionHints, type VaultGrantSeen,
} from '@braindog/host';
import type { CallContext, Deposited, OpenedForGrant, SealTarget, Sealed } from '@braindog/record';
import { no, ok, type Result } from '@braindog/ports';

import { unwrap, type KeyStore } from './keys.ts';
import { recordOf } from './route.ts';

export { servesKeys, servesVault };

/** A value in the clear. Named in this file and never passed out of it but to the one answer that asked. */
type Plaintext = Uint8Array & { readonly brand: 'Plaintext' };

/** Who a deposit or a read is by: an agent's checked vault grant, or a person's browser session. */
export type By = VaultGrantSeen | CallContext;

/** The record's half of the doors, over RPC: every call names the record the caller was checked against. */
export type KeyDeps = {
  /** `env.KEK`'s store, opened after the caller is checked, or `null` when the secret is empty. */
  store(): Promise<KeyStore | null>;
  /** The fingerprint the record's vault is wrapped by, or `null` for a record made before the store was bound. */
  wrappingKey(record: string): Promise<string | null>;
  depositGrant(
    record: string,
    args: { label?: unknown; opens?: unknown; kind?: unknown; project?: unknown; credential?: unknown },
    by: By,
    hints: SessionHints,
    seal: (target: SealTarget) => Promise<Result<Sealed>>,
  ): Promise<Result<Deposited>>;
  openForGrant(
    record: string,
    args: { label?: unknown; credential?: unknown },
    by: By,
    hints: SessionHints,
    kekId: string,
  ): Promise<Result<OpenedForGrant>>;
};

/** What the Worker needs: whether the Directory holds the record, the record's answer, and its keys when bound. */
export type GrantDeps = {
  knows(record: string): Promise<boolean>;
  vaultGrant(record: string, bearer: string): Promise<Result<VaultGrantSeen>>;
  keys?: KeyDeps | undefined;
};

/* The sentence `vaultGrant` gives for every bearer it does not know, so a record this Worker does not hold reads
   the same as a bearer that record does not know. */
const UNKNOWN: Result<VaultGrantSeen> = {
  ok: false,
  refusal: { code: 'FORBIDDEN', fix: 'That vault grant is not one this record knows.', at: 'vault' },
};

/** 64 KiB, which is more than a private key or an env file of keys. */
const VALUE_LIMIT = 65_536;

const NO_STORE = 'This host holds no key store yet, so it keeps no keys for agents.';
export const OLD_RECORD = 'Keys need a record created after this host key store was bound, and this record is older than that.';
const WRONG_KEY = 'This host key store does not open this record, so no key was sealed or opened.';

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
const text = (x: unknown): string => (typeof x === 'string' ? x : '');

/** The grant's own key, or `null` when this key store does not open the record's. */
async function grantKey(store: KeyStore, record: string, key: SealTarget['key'], grant: string) {
  if (key.kek_id === null) return null;
  const dek = await unwrap(store, record, 'record', { wrapped: key.wrapped, nonce: key.nonce, kek_id: key.kek_id, wrapped_by: 'kek' });
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
  const key = await grantKey(store, record, sealed.key, sealed.id);
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
  for (const [k, v] of VAULT_HEADERS) headers.append(k, v);
  return new Response(body, { status: 200, headers });
}

/** The store, once the record is known to have a wrapped key for it to open. */
async function ready(keys: KeyDeps, record: string): Promise<Result<KeyStore>> {
  const store = await keys.store();
  if (!store) return no('NOT_IN_THIS_BUILD', NO_STORE, { at: 'keys' });
  if ((await keys.wrappingKey(record)) === null) return no('NOT_IN_THIS_BUILD', OLD_RECORD, { at: 'keys' });
  return ok(store);
}

/** Both steps over one record, whose caller a door has already checked. */
function doors(keys: KeyDeps, record: () => string | null) {
  const deposit = async (by: By, body: Record<string, unknown>, hints: SessionHints): Promise<Result<unknown>> => {
    const id = record();
    if (id === null) return UNKNOWN;
    const said = body.value;
    if (typeof said !== 'string' || said.length === 0) return no('REQUIRED_MISSING', 'A deposit carries the value, as a string.', { at: 'value' });
    const value = utf8(said) as Plaintext;
    try {
      if (value.length > VALUE_LIMIT) return no('OUT_OF_BOUNDS', 'A key is at most 64 KiB.', { at: 'value' });
      const opened = await ready(keys, id);
      if (!opened.ok) return opened;
      const store = opened.value;
      /* What it is, unopened: a length, never a character of it. */
      const hint = `a ${String(said.length)}-character value`;
      const seal = async (target: SealTarget): Promise<Result<Sealed>> => {
        const key = await grantKey(store, id, target.key, target.grant);
        if (!key || target.key.kek_id === null) return no('WRONG_KEY', WRONG_KEY, { at: 'kek_id' });
        const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
        const sealed = await sealBytes(key, nonce, target.aad, value);
        return ok({ ciphertext: sealed, nonce, kdf: 'hkdf-sha256', kek_id: target.key.kek_id, bytes: value.length, hint });
      };
      /* A PERSON MAY NAME THE ROW AND THE PROJECT AND AN AGENT MAY NOT. A vault grant already carries its
         project, and reading a second one out of its body would be a way to put a key out of its reach. */
      const args =
        'principal' in by
          ? { label: body.label, opens: body.opens, kind: body.kind, project: body.project, credential: body.credential }
          : { label: body.label, opens: body.opens, kind: body.kind };
      return await keys.depositGrant(id, args, by, hints, seal);
    } finally {
      value.fill(0);
    }
  };

  const open = async (by: By, body: Record<string, unknown>, hints: SessionHints): Promise<Response> => {
    const id = record();
    if (id === null) return vaultReply(UNKNOWN);
    const opened = await ready(keys, id);
    if (!opened.ok) return vaultReply(opened);
    const store = opened.value;
    const { kekId } = await store.current();
    const out = await keys.openForGrant(id, { label: text(body.label), credential: text(body.credential) }, by, hints, kekId);
    if (!out.ok) return vaultReply(out);
    const sealed = out.value;
    const key = await grantKey(store, id, sealed.key, sealed.id);
    if (!key) return vaultReply(no('WRONG_KEY', WRONG_KEY, { at: 'kek_id' }));
    const decrypted = await openBytes(key, sealed.nonce, sealed.aad, sealed.ciphertext);
    /* A failed decrypt says only that these bytes do not open under this key. */
    if (decrypted === null)
      return vaultReply(no('WRONG_KEY', 'The sealed value did not open under this host key store.', { at: 'kek_id' }));
    return answerOpen(sealed.credential, sealed.label, decrypted as Plaintext);
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
export function serveWorkerVault(request: Request, deps: GrantDeps): Promise<Response> {
  let checked: string | null = null;
  const steps = deps.keys ? doors(deps.keys, () => checked) : null;
  return serveVault(request, {
    grant: async (bearer) => {
      const record = recordOf(`Bearer ${bearer}`);
      if (record === null || !(await deps.knows(record))) return UNKNOWN;
      const out = await deps.vaultGrant(record, bearer);
      if (out.ok) checked = record;
      return out;
    },
    keys: steps
      ? {
          deposit: (ask) => steps.deposit(ask.grant, ask.body, ask.hints),
          open: (ask) => steps.open(ask.grant, ask.body, ask.hints),
        }
      : undefined,
  });
}

/** What the app's own key doors need: the origins this Worker answers for, the record the session names, and the keys. */
export type SessionKeyDeps = { origins: ReadonlySet<string>; record: string; keys?: KeyDeps | undefined };

/**
 * Answer one of the app's own key doors, `/api/keys/*`, for a browser session the Worker has already resolved.
 *
 * THE RECORD IS THE SESSION'S, not the request's. `doorOf` decided which record this person's cookie names, and
 * that is what is passed in: nothing in the body may name a second one, for the reason the vault door holds the
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
