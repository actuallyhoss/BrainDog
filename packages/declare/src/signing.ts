/**
 * Author keys and signatures for a catalogue (`loop/research-marketplace.md` §2, "Integrity").
 *
 * AN AUTHOR SIGNS WHAT A CATALOGUE LISTS, NOT THE BYTES OF A FILE. The signed text names the kind, the id, the version and
 * the checksum of the file's canonical JSON, so the index cannot be edited to point a signed version at another file, and
 * a file cannot change under its checksum. Ed25519 through WebCrypto, which Node and the browsers this app supports have.
 *
 * THE PRIVATE KEY LIVES IN A FILE THE AUTHOR CREATES ON THEIR OWN MACHINE (`braindog pack key`), and nothing here writes one.
 * A signature carries the public key, so anybody can verify it without a key server; whether that key is the author's is a
 * matter of trust on first use: the first key seen for an author is remembered where the reader keeps such things, and a
 * later version signed by a different one is said plainly.
 */

import type { Result } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

export const AUTHOR_KEY_FORMAT = 'braindog-author-key-1';
const SIGNED_PREFIX = 'braindog-catalogue-1';
const ALG = { name: 'Ed25519' } as const;

export type Signature = {
  alg: 'ed25519';
  /** The first sixteen hex characters of SHA-256 over the raw public key. */
  key_id: string;
  /** The raw 32-byte public key, base64url. */
  public_key: string;
  /** base64url. */
  sig: string;
  signed_at: string;
};

export type AuthorKey = {
  format: typeof AUTHOR_KEY_FORMAT;
  alg: 'ed25519';
  author: string;
  key_id: string;
  public_key: string;
  /** PKCS#8, base64url. The one secret in the file. */
  private_key: string;
  created_at: string;
};

const B64URL = /^[A-Za-z0-9_-]{1,200}$/u;
const KEY_ID = /^[0-9a-f]{16}$/u;

const toB64 = (bytes: ArrayBuffer | Uint8Array): string => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of view) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
};

const fromB64 = (text: string): Uint8Array<ArrayBuffer> => {
  const s = atob(text.replace(/-/gu, '+').replace(/_/gu, '/'));
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
};

const isMap = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The text an author signs for one version. */
export const signedText = (kind: string, id: string, version: string, checksum: string): string => `${SIGNED_PREFIX}\n${kind}\n${id}\n${version}\n${checksum}`;

/** A public key's id: SHA-256 over its raw bytes, the first sixteen hex characters. */
export async function keyIdOf(publicKey: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', fromB64(publicKey)));
  return [...hash.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A new key pair for an author, as the file they keep. The caller writes it where the author chose. */
export async function newAuthorKey(author: string, now: Date = new Date()): Promise<AuthorKey> {
  const pair = (await crypto.subtle.generateKey(ALG, true, ['sign', 'verify'])) as { publicKey: Parameters<typeof crypto.subtle.exportKey>[1]; privateKey: Parameters<typeof crypto.subtle.exportKey>[1] };
  const public_key = toB64((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);
  const private_key = toB64((await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer);
  return { format: AUTHOR_KEY_FORMAT, alg: 'ed25519', author, key_id: await keyIdOf(public_key), public_key, private_key, created_at: now.toISOString() };
}

/** An author key file, checked: its format, and a key id that is its public key's. */
export async function readAuthorKey(doc: unknown): Promise<Result<AuthorKey>> {
  const bad = (fix: string) => no('VALUE_MALFORMED', fix, { at: 'key' }) as Result<AuthorKey>;
  if (!isMap(doc) || doc.format !== AUTHOR_KEY_FORMAT || doc.alg !== 'ed25519') return bad(`This is not an author key file: it needs format ${AUTHOR_KEY_FORMAT}. Make one with braindog pack key.`);
  for (const k of ['public_key', 'private_key'] as const) if (typeof doc[k] !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(doc[k] as string)) return bad(`This author key file has no ${k}.`);
  if (typeof doc.author !== 'string' || typeof doc.key_id !== 'string') return bad('This author key file names no author or key id.');
  if ((await keyIdOf(doc.public_key as string)) !== doc.key_id) return bad('This author key file names a key id that is not its public key. It was edited; make a new one.');
  return ok(doc as unknown as AuthorKey);
}

/** A signature over one version. The key is tried against its own public half first, so a mismatched file is refused. */
export async function signVersion(key: AuthorKey, kind: string, id: string, version: string, checksum: string, now: Date = new Date()): Promise<Result<Signature>> {
  let sig: string;
  try {
    const priv = await crypto.subtle.importKey('pkcs8', fromB64(key.private_key), ALG, false, ['sign']);
    sig = toB64(await crypto.subtle.sign(ALG, priv, new TextEncoder().encode(signedText(kind, id, version, checksum))));
  } catch {
    return no('VALUE_MALFORMED', 'The private key in this author key file does not read as an Ed25519 key.', { at: 'key' });
  }
  const signature: Signature = { alg: 'ed25519', key_id: key.key_id, public_key: key.public_key, sig, signed_at: now.toISOString() };
  const back = await verifySignature(signature, kind, id, version, checksum);
  return back.ok ? ok(signature) : no('VALUE_MALFORMED', 'The two halves of this author key file do not belong together. Make a new one.', { at: 'key' });
}

/** Whether a value has a signature's shape, before anything is verified. */
export const isSignature = (v: unknown): v is Signature =>
  isMap(v) && v.alg === 'ed25519' && KEY_ID.test(String(v.key_id)) && B64URL.test(String(v.public_key)) && B64URL.test(String(v.sig)) && typeof v.signed_at === 'string';

/** A signature held to the version it is listed against, and to its own key id. */
export async function verifySignature(signature: Signature, kind: string, id: string, version: string, checksum: string): Promise<Result<true>> {
  const refuse = (): Result<true> => no<true>('SIGNATURE_INVALID', `The signature on ${id} ${version} does not verify, so this catalogue was changed after it was signed. Nothing was installed.`, { at: 'signature' });
  if (!isSignature(signature)) return refuse();
  try {
    if ((await keyIdOf(signature.public_key)) !== signature.key_id) return refuse();
    const pub = await crypto.subtle.importKey('raw', fromB64(signature.public_key), ALG, false, ['verify']);
    const good = await crypto.subtle.verify(ALG, pub, fromB64(signature.sig), new TextEncoder().encode(signedText(kind, id, version, checksum)));
    return good ? ok(true) : refuse();
  } catch {
    return refuse();
  }
}

/* ── trust on first use ─────────────────────────────────────────────────── */

/** The key ids a reader has seen for each author, first seen first. */
export type KnownKeys = Record<string, string[]>;

export type Trust =
  | { kind: 'unsigned' }
  /** Signed, and no key was seen for this author on this reader before. */
  | { kind: 'first'; key_id: string }
  /** Signed by a key this reader already holds for this author. */
  | { kind: 'known'; key_id: string }
  /** Signed by a key other than the one this reader holds for this author. */
  | { kind: 'changed'; key_id: string; before: string[] };

export function trustOf(known: KnownKeys, author: string, signature: Signature | null | undefined): Trust {
  if (!signature) return { kind: 'unsigned' };
  const seen = Object.hasOwn(known, author) && Array.isArray(known[author]) ? known[author] : [];
  if (seen.length === 0) return { kind: 'first', key_id: signature.key_id };
  return seen.includes(signature.key_id) ? { kind: 'known', key_id: signature.key_id } : { kind: 'changed', key_id: signature.key_id, before: [...seen] };
}

/** The keys known after trusting one, and nothing changed for a key already held. */
export function rememberKey(known: KnownKeys, author: string, keyId: string): KnownKeys {
  const seen = Object.hasOwn(known, author) && Array.isArray(known[author]) ? known[author] : [];
  return seen.includes(keyId) ? known : { ...known, [author]: [...seen, keyId] };
}

/** Known keys read from anywhere, keeping only well-formed ids. */
export function readKnownKeys(doc: unknown): KnownKeys {
  if (!isMap(doc)) return {};
  const out: KnownKeys = {};
  for (const [author, ids] of Object.entries(doc)) if (Array.isArray(ids)) out[author] = ids.filter((x): x is string => typeof x === 'string' && KEY_ID.test(x));
  return out;
}
