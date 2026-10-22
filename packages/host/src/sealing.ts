/**
 * `47 §13` D9's bytes, in one place. `12 §6`, ADR-062.
 *
 * ITS OWN FILE AND NOT `vault.ts`. D9 says these live in this package, and the door next door says in its
 * own header that no value is named in it: the body is parsed and handed whole to the host's vault module.
 * That sentence is worth keeping true, so the HTTP door and the bytes sit side by side rather than in one
 * file, and only this one ever holds a value in the clear.
 *
 * NO `Plaintext` BRAND HERE, DELIBERATELY. `52 §5.2` and `tools/gates/secret-grep.mjs` hold the brand to
 * three modules, and a fourth would be a plaintext that escaped. The brand's job is to follow a value
 * inside the file that answers with it, so this one takes and returns plain bytes and each host brands at
 * its own boundary, which is where the answer is built and where the gate is watching. The two hosts had them twice, identically, and identical is not the
 * same as guaranteed to stay identical: a credential sealed by the self-host has to open in the Worker and
 * back, for as long as both exist, and nothing enforced that except the two files happening to match.
 *
 * WEBCRYPTO AND NOTHING ELSE, which is what lets this be shared at all: `crypto.subtle` is in Node and in
 * the Worker runtime, so the steps need no adapter and no branch.
 *
 * WHAT IS NOT HERE: where a DEK comes from. That is the self-host's key store on disk and the Worker's
 * binding, and it is the half that genuinely differs. Only the bytes are shared.
 */

/**
 * THE KEY TYPE IS TAKEN FROM THE CALL AND NEVER NAMED. `CryptoKey` is ambient under the Worker's types and
 * is not under Node's, so writing it here compiles in one host and fails in the other; `@braindog/connect`
 * shipped that exact fault for as long as only one runtime imported it, because `TextEncoder.encode` is
 * declared to return a different array type by each. Reading the type off `deriveKey` resolves to whatever
 * the importing package's own lib says it is.
 */
export type DerivedKey = Awaited<ReturnType<typeof crypto.subtle.deriveKey>>;

/**
 * AND THE SAME HAZARD ON THE OTHER SIDE OF THE CALL, which the paragraph above missed and the gate caught.
 *
 * `BufferSource` is `ArrayBufferView<ArrayBuffer>`, and a bare `Uint8Array` is `Uint8Array<ArrayBufferLike>`:
 * wide enough to be backed by a `SharedArrayBuffer`, which WebCrypto will not take. Node's lib lets the wide
 * one through where the DOM's does not, so `pnpm -F @braindog/host typecheck` was clean and `apps/web`'s
 * `svelte-check`, reading these same sources through its own `lib`, was six errors. Two runtimes, one file,
 * and only the full gate asks both.
 *
 * SPELLED ONCE, because the fix that annotates the one line the compiler pointed at leaves the other five
 * to be found one at a time. It is what this module RETURNS and what `view` below produces; the
 * parameters stay wide, for the reason written there.
 */
export type Bytes = Uint8Array<ArrayBuffer>;

/**
 * A CALLER'S BYTES, NARROWED BY PROOF RATHER THAN BY ASSERTION.
 *
 * The parameters stay plain `Uint8Array`, because narrowing them instead would push the same annotation into
 * both apps' `keys.ts`, both `Plaintext` brands and `@braindog/record`'s `Sealed` and `SealTarget`: a type
 * change across four packages to describe bytes that are already an `ArrayBuffer`'s everywhere they are made.
 * So the check happens here, once, and it is a real check: `buffer instanceof ArrayBuffer` is the thing the
 * DOM's `BufferSource` is asking about, and the cast sits inside the branch that has just proved it.
 *
 * THE COPYING BRANCH IS UNREACHABLE IN BOTH HOSTS, since neither allocates over a `SharedArrayBuffer`. It is
 * a copy rather than a throw because the argument may be key material and a refusal mid-unseal strands a
 * credential, where a copy merely fails to be zeroed on a path nothing takes.
 *
 * AND A BARE `ArrayBuffer` IS WRAPPED, NOT COPIED, because that is what the Durable Object's SQLite hands back
 * for a BLOB. Before this branch it fell into `Uint8Array.from`, which makes an `ArrayBuffer` an EMPTY array:
 * the nonce was zero bytes long, and no value sealed on the Worker ever opened again, every read answering
 * `WRONG_KEY` (measured on the Worker). The self-host's
 * `node:sqlite` hands back a `Uint8Array`, which is why only the Worker lost its keys.
 */
const view = (bytes: Uint8Array | ArrayBuffer): Bytes =>
  bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes.buffer instanceof ArrayBuffer ? (bytes as Bytes) : Uint8Array.from(bytes);

const UNIT = '\u001f';
/* `Uint8Array.from`, AND NOT `encode` ALONE: `TextEncoder.encode` is declared to return the wide array under
   Node and the narrow one under the DOM, which is the `@braindog/connect` fault the paragraph above names,
   in the place it actually bites. The copy is a short label's bytes and never key material. */
const utf8 = (text: string): Bytes => Uint8Array.from(new TextEncoder().encode(text));

/** `record_id ‖ 0x1F ‖ purpose`: the DEK wrap's AAD. */
export const recordAad = (record: string, purpose: string): string => `${record}${UNIT}${purpose}`;

/** `record_id ‖ 0x1F ‖ grant_id ‖ 0x1F ‖ version`: a sealed value's AAD. */
export const grantAad = (record: string, grant: string, version: string): string =>
  `${record}${UNIT}${grant}${UNIT}${version}`;

/** D9: HKDF-SHA-256 over the DEK, empty salt, `info = grant_id`, out to AES-256-GCM. */
export async function grantKey(dek: Uint8Array, grant: string): Promise<DerivedKey> {
  const base = await crypto.subtle.importKey('raw', view(dek), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: utf8(grant) },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Twelve bytes, because that is what D9 says and what every sealed row already carries. */
export const NONCE_BYTES = 12;
export const freshNonce = (): Bytes => crypto.getRandomValues(new Uint8Array(NONCE_BYTES));

export async function seal(key: DerivedKey, nonce: Uint8Array, aad: string, value: Uint8Array): Promise<Bytes> {
  const out = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: view(nonce), additionalData: utf8(aad) }, key, view(value));
  return new Uint8Array(out);
}

/**
 * `null` when these bytes do not open under this key, and never a reason.
 *
 * A FAILED DECRYPT SAYS ONE THING. Both hosts already wrote that comment beside their own `catch`, and it
 * is the rule worth carrying across: the difference between a wrong key, a wrong AAD and a tampered tag is
 * information about the key hierarchy, and the caller has no use for it that an attacker does not share.
 */
export async function openSealed(
  key: DerivedKey,
  nonce: Uint8Array,
  aad: string,
  ciphertext: Uint8Array,
): Promise<Bytes | null> {
  try {
    const out = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: view(nonce), additionalData: utf8(aad) }, key, view(ciphertext));
    return new Uint8Array(out);
  } catch {
    return null;
  }
}
