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
 * ITS OWN FILE, free of `cloudflare:`, so the doors are tested in Node. It is one of the three files the `Plaintext`
 * brand lives in (`tools/gates/secret-grep.mjs`). Nothing here logs.
 */

import { serveVault, servesVault, VAULT_HEADERS, vaultReply, type SessionHints, type VaultAsk, type VaultGrantSeen } from '@braindog/host';
import type { Deposited, OpenedForGrant, SealTarget, Sealed } from '@braindog/record';
import { no, ok, type Result } from '@braindog/ports';

import { unwrap, type KeyStore } from './keys.ts';
import { recordOf } from './route.ts';

export { servesVault };

/** A value in the clear. Named in this file and never passed out of it but to the one answer that asked. */
type Plaintext = Uint8Array & { readonly brand: 'Plaintext' };

/** The record's half of the doors, over RPC: every call names the record the grant was checked against. */
export type KeyDeps = {
  /** `env.KEK`'s store, opened after the grant is checked, or `null` when the secret is empty. */
  store(): Promise<KeyStore | null>;
  /** The fingerprint the record's vault is wrapped by, or `null` for a record made before the store was bound. */
  wrappingKey(record: string): Promise<string | null>;
  depositGrant(
    record: string,
    args: { label?: unknown; opens?: unknown; kind?: unknown },
    grant: VaultGrantSeen,
    hints: SessionHints,
    seal: (target: SealTarget) => Promise<Result<Sealed>>,
  ): Promise<Result<Deposited>>;
  openForGrant(
    record: string,
    args: { label?: unknown; credential?: unknown },
    grant: VaultGrantSeen,
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
const NONCE_BYTES = 12;

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
    const base = await crypto.subtle.importKey('raw', dek, 'HKDF', false, ['deriveKey']);
    return await crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: utf8(grant) },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
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
  try {
    const plain = new Uint8Array(
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.nonce, additionalData: utf8(sealed.aad) }, key, sealed.ciphertext),
    ) as Plaintext;
    const said = new TextDecoder().decode(plain);
    plain.fill(0);
    return said;
  } catch {
    return null;
  }
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

/** Both doors over one record, whose grant `serveVault` has already checked. */
function doors(keys: KeyDeps, record: () => string | null) {
  const deposit = async (ask: VaultAsk): Promise<Result<unknown>> => {
    const id = record();
    if (id === null) return UNKNOWN;
    const said = ask.body.value;
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
        const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: utf8(target.aad) }, key, value);
        return ok({ ciphertext: new Uint8Array(sealed), nonce, kdf: 'hkdf-sha256', kek_id: target.key.kek_id, bytes: value.length, hint });
      };
      return await keys.depositGrant(id, { label: ask.body.label, opens: ask.body.opens, kind: ask.body.kind }, ask.grant, ask.hints, seal);
    } finally {
      value.fill(0);
    }
  };

  const open = async (ask: VaultAsk): Promise<Response> => {
    const id = record();
    if (id === null) return vaultReply(UNKNOWN);
    const opened = await ready(keys, id);
    if (!opened.ok) return vaultReply(opened);
    const store = opened.value;
    const { kekId } = await store.current();
    const out = await keys.openForGrant(id, { label: text(ask.body.label), credential: text(ask.body.credential) }, ask.grant, ask.hints, kekId);
    if (!out.ok) return vaultReply(out);
    const sealed = out.value;
    const key = await grantKey(store, id, sealed.key, sealed.id);
    if (!key) return vaultReply(no('WRONG_KEY', WRONG_KEY, { at: 'kek_id' }));
    let decrypted: ArrayBuffer;
    try {
      decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.nonce, additionalData: utf8(sealed.aad) }, key, sealed.ciphertext);
    } catch {
      /* A failed decrypt says only that these bytes do not open under this key. */
      return vaultReply(no('WRONG_KEY', 'The sealed value did not open under this host key store.', { at: 'kek_id' }));
    }
    return answerOpen(sealed.credential, sealed.label, new Uint8Array(decrypted) as Plaintext);
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
  return serveVault(request, {
    grant: async (bearer) => {
      const record = recordOf(`Bearer ${bearer}`);
      if (record === null || !(await deps.knows(record))) return UNKNOWN;
      const out = await deps.vaultGrant(record, bearer);
      if (out.ok) checked = record;
      return out;
    },
    keys: deps.keys ? doors(deps.keys, () => checked) : undefined,
  });
}
