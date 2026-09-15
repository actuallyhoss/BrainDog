/**
 * The self-host's vault step: where a key an agent deposits is sealed, and where one it reads is opened.
 * `12 §6`, ADR-062, `loop/research-agent-path.md` §5.7.
 *
 * ONE OF THE THREE FILES THE `Plaintext` BRAND LIVES IN (`tools/gates/secret-grep.mjs`). A value arrives in a
 * deposit's body, is sealed here under a key derived from the record's own, and is dropped; the record is handed
 * sealed bytes. A read runs the other way and answers once, from `answerOpen`, with `no-store`, which is the
 * gate's recorded exemption for this file. Nothing here logs.
 *
 * THE BYTES ARE `47 §4.6`'S. The record's DEK is unwrapped under the KEK with `record ‖ 0x1F ‖ "record"`; the
 * grant key is HKDF-SHA-256 over it with an empty salt and the grant id as info; the value is AES-256-GCM under
 * that, with a fresh nonce and `record ‖ 0x1F ‖ grant ‖ 0x1F ‖ version` as additional data, which the record names.
 */

import { randomBytes } from 'node:crypto';
import type { webcrypto } from 'node:crypto';

import { VAULT_HEADERS, vaultReply, type VaultAsk, type VaultDoor } from '@braindog/host';
import type { RecordApi, SealTarget, Sealed } from '@braindog/record';
import { no, ok, type Result } from '@braindog/ports';

import { unwrap, type KeyStore } from './keys.ts';

/** A value in the clear. Named in this file and never passed out of it but to the one answer that asked. */
type Plaintext = Uint8Array & { readonly brand: 'Plaintext' };

/** 64 KiB, which is more than a private key or an env file of keys. */
const VALUE_LIMIT = 65_536;
const NONCE_BYTES = 12;

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
const text = (x: unknown): string => (typeof x === 'string' ? x : '');

/** The grant's own key, or `null` when this host's key store does not open the record's. */
async function grantKey(store: KeyStore, record: string, key: SealTarget['key'], grant: string): Promise<webcrypto.CryptoKey | null> {
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

const WRONG_KEY = 'This host key store does not open this record, so no key was sealed or opened.';

/** The one answer a value leaves in. */
function answerOpen(credential: string, label: string, plain: Plaintext): Response {
  const body = JSON.stringify({ ok: true, value: { credential, label, value: new TextDecoder().decode(plain) } });
  plain.fill(0);
  const headers = new Headers();
  for (const [k, v] of VAULT_HEADERS) headers.append(k, v);
  return new Response(body, { status: 200, headers });
}

/** The self-host's door, over the record in this process. Without a key store both doors answer `NOT_IN_THIS_BUILD`. */
export function vaultDoor(api: RecordApi, store: KeyStore | undefined): VaultDoor {
  const grant = (bearer: string) => api.vaultGrant(bearer);
  if (!store) return { grant };
  const recordId = (): string | null => api.kernel.identity()?.id ?? null;

  const deposit = async (ask: VaultAsk): Promise<Result<unknown>> => {
    const record = recordId();
    if (record === null) return no('NOT_IN_THIS_BUILD', 'This record has no identity yet, so it keeps no keys.', { at: 'record' });
    const said = ask.body.value;
    if (typeof said !== 'string' || said.length === 0) return no('REQUIRED_MISSING', 'A deposit carries the value, as a string.', { at: 'value' });
    const value = utf8(said) as Plaintext;
    if (value.length > VALUE_LIMIT) {
      value.fill(0);
      return no('OUT_OF_BOUNDS', 'A key is at most 64 KiB.', { at: 'value' });
    }
    /* What it is, unopened: a length, never a character of it. */
    const hint = `a ${String(said.length)}-character value`;
    const seal = async (target: SealTarget): Promise<Result<Sealed>> => {
      const key = await grantKey(store, record, target.key, target.grant);
      if (!key || target.key.kek_id === null) return no('WRONG_KEY', WRONG_KEY, { at: 'kek_id' });
      const nonce = new Uint8Array(randomBytes(NONCE_BYTES));
      const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: utf8(target.aad) }, key, value);
      return ok({ ciphertext: new Uint8Array(sealed), nonce, kdf: 'hkdf-sha256', kek_id: target.key.kek_id, bytes: value.length, hint });
    };
    try {
      return await api.depositGrant({ label: ask.body.label, opens: ask.body.opens, kind: ask.body.kind }, ask.grant, ask.hints, seal);
    } finally {
      value.fill(0);
    }
  };

  const open = async (ask: VaultAsk): Promise<Response> => {
    const record = recordId();
    if (record === null) return vaultReply(no('NOT_IN_THIS_BUILD', 'This record has no identity yet, so it keeps no keys.', { at: 'record' }));
    const { kekId } = await store.current();
    const out = await api.openForGrant({ label: text(ask.body.label), credential: text(ask.body.credential) }, ask.grant, ask.hints, kekId);
    if (!out.ok) return vaultReply(out);
    const sealed = out.value;
    const key = await grantKey(store, record, sealed.key, sealed.id);
    if (!key) return vaultReply(no('WRONG_KEY', WRONG_KEY, { at: 'kek_id' }));
    let opened: ArrayBuffer;
    try {
      opened = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.nonce, additionalData: utf8(sealed.aad) }, key, sealed.ciphertext);
    } catch {
      /* A failed decrypt says only that these bytes do not open under this key. */
      return vaultReply(no('WRONG_KEY', 'The sealed value did not open under this host key store.', { at: 'kek_id' }));
    }
    return answerOpen(sealed.credential, sealed.label, new Uint8Array(opened) as Plaintext);
  };

  return { grant, keys: { deposit, open } };
}
