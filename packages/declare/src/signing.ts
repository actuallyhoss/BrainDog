/**
 * Author keys and signatures for a catalogue.
 *
 * AN AUTHOR SIGNS WHAT A CATALOGUE LISTS, NOT THE BYTES OF A FILE. The signed text names the kind, the id, the version and
 * the checksum of the file's canonical JSON, so the index cannot be edited to point a signed version at another file, and
 * a file cannot change under its checksum. Ed25519 through WebCrypto, which Node and the browsers this app supports have.
 *
 * THE PRIVATE KEY LIVES IN A FILE THE AUTHOR CREATES ON THEIR OWN MACHINE (`braindog pack key`), and nothing here writes one.
 * A signature carries the public key, so anybody can verify it without a key server; whether that key is the author's is a
 * matter of trust on first use: the first key seen for an entry is remembered where the reader keeps such things, and a
 * later version signed by a different one is said plainly.
 *
 * A KEY MOVES ON ONLY BY ITS OWN WORD. An author who makes a new key publishes a rotation statement signed by the old key
 * naming the new one, and a reader who trusted the old key trusts the new one because of it, and for no other reason. An
 * author whose key is lost or leaked publishes a revocation signed by that key: every version it signed is then said as
 * untrusted, and a rotation from it counts only when the revocation names that successor, so whoever took the key cannot
 * rotate it to their own. Statements live in the catalogue's index beside the entries (`KeyStatements`).
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

/* ── rotation and revocation ────────────────────────────────────────────── */

export const ROTATION_FORMAT = 'braindog-key-rotation-1';
export const REVOCATION_FORMAT = 'braindog-key-revocation-1';

/** An author's word, signed by their old key, that a new key speaks for them from now on. */
export type KeyRotation = {
  format: typeof ROTATION_FORMAT;
  author: string;
  from_key_id: string;
  from_public_key: string;
  to_key_id: string;
  to_public_key: string;
  stated_at: string;
  /** By the old key, base64url. */
  sig: string;
};

/** An author's word, signed by the key itself, that it is no longer to be trusted. */
export type KeyRevocation = {
  format: typeof REVOCATION_FORMAT;
  author: string;
  key_id: string;
  public_key: string;
  /** The one key a rotation from this key may still name, or `null` for none. */
  successor: string | null;
  /** Why, in the author's words, shown to readers as written. */
  reason: string;
  stated_at: string;
  sig: string;
};

export type KeyStatements = { rotations: KeyRotation[]; revocations: KeyRevocation[] };

export const noStatements = (): KeyStatements => ({ rotations: [], revocations: [] });

export const REASON_MOST = 280;

/** The text an old key signs to name its successor. */
export const rotationText = (r: Pick<KeyRotation, 'author' | 'from_key_id' | 'to_key_id' | 'to_public_key'>): string =>
  [ROTATION_FORMAT, r.author, r.from_key_id, r.to_key_id, r.to_public_key].join('\n');

/** The text a key signs to revoke itself. */
export const revocationText = (r: Pick<KeyRevocation, 'author' | 'key_id' | 'successor' | 'reason'>): string =>
  [REVOCATION_FORMAT, r.author, r.key_id, r.successor ?? '', r.reason].join('\n');

async function signText(key: AuthorKey, text: string): Promise<Result<string>> {
  try {
    const priv = await crypto.subtle.importKey('pkcs8', fromB64(key.private_key), ALG, false, ['sign']);
    return ok(toB64(await crypto.subtle.sign(ALG, priv, new TextEncoder().encode(text))));
  } catch {
    return no('VALUE_MALFORMED', 'The private key in this author key file does not read as an Ed25519 key.', { at: 'key' });
  }
}

async function verifyText(publicKey: string, keyId: string, sig: string, text: string): Promise<boolean> {
  try {
    if ((await keyIdOf(publicKey)) !== keyId) return false;
    const pub = await crypto.subtle.importKey('raw', fromB64(publicKey), ALG, false, ['verify']);
    return await crypto.subtle.verify(ALG, pub, fromB64(sig), new TextEncoder().encode(text));
  } catch {
    return false;
  }
}

/** A rotation from `from` to `to`, signed by `from`. Both keys are the same author's, and never the same key. */
export async function rotateKey(from: AuthorKey, to: Pick<AuthorKey, 'author' | 'key_id' | 'public_key'>, now: Date = new Date()): Promise<Result<KeyRotation>> {
  if (from.author !== to.author)
    return no('VALUE_MALFORMED', `The old key is for ${from.author} and the new one is for ${to.author}. A key is rotated only to a key of the same author.`, { at: 'key' });
  if (from.key_id === to.key_id) return no('VALUE_MALFORMED', 'The old key and the new key are the same key. Make a new key first.', { at: 'key' });
  if ((await keyIdOf(to.public_key)) !== to.key_id) return no('VALUE_MALFORMED', 'The new key file names a key id that is not its public key. Make a new one.', { at: 'key' });
  const body = { format: ROTATION_FORMAT, author: from.author, from_key_id: from.key_id, from_public_key: from.public_key, to_key_id: to.key_id, to_public_key: to.public_key, stated_at: now.toISOString() } as const;
  const sig = await signText(from, rotationText(body));
  if (!sig.ok) return sig as Result<KeyRotation>;
  const statement: KeyRotation = { ...body, sig: sig.value };
  return (await verifyRotation(statement)) ? ok(statement) : no('VALUE_MALFORMED', 'The two halves of the old key file do not belong together.', { at: 'key' });
}

/** A revocation of `key`, signed by it, naming the one successor a rotation from it may still reach, if any. */
export async function revokeKey(key: AuthorKey, reason: string, successor: string | null = null, now: Date = new Date()): Promise<Result<KeyRevocation>> {
  const said = reason.trim();
  if (said === '' || said.length > REASON_MOST) return no('VALUE_MALFORMED', `Say why the key is revoked, in at most ${REASON_MOST} characters. Readers see it as written.`, { at: 'reason' });
  if (successor !== null && (!KEY_ID.test(successor) || successor === key.key_id)) return no('VALUE_MALFORMED', 'The successor is another key id: sixteen hex characters.', { at: 'successor' });
  const body = { format: REVOCATION_FORMAT, author: key.author, key_id: key.key_id, public_key: key.public_key, successor, reason: said, stated_at: now.toISOString() } as const;
  const sig = await signText(key, revocationText(body));
  if (!sig.ok) return sig as Result<KeyRevocation>;
  const statement: KeyRevocation = { ...body, sig: sig.value };
  return (await verifyRevocation(statement)) ? ok(statement) : no('VALUE_MALFORMED', 'The two halves of this author key file do not belong together.', { at: 'key' });
}

export const isRotation = (v: unknown): v is KeyRotation =>
  isMap(v) &&
  v.format === ROTATION_FORMAT &&
  typeof v.author === 'string' &&
  KEY_ID.test(String(v.from_key_id)) &&
  KEY_ID.test(String(v.to_key_id)) &&
  B64URL.test(String(v.from_public_key)) &&
  B64URL.test(String(v.to_public_key)) &&
  B64URL.test(String(v.sig)) &&
  typeof v.stated_at === 'string';

export const isRevocation = (v: unknown): v is KeyRevocation =>
  isMap(v) &&
  v.format === REVOCATION_FORMAT &&
  typeof v.author === 'string' &&
  KEY_ID.test(String(v.key_id)) &&
  B64URL.test(String(v.public_key)) &&
  (v.successor === null || KEY_ID.test(String(v.successor))) &&
  typeof v.reason === 'string' &&
  v.reason.length <= REASON_MOST &&
  B64URL.test(String(v.sig)) &&
  typeof v.stated_at === 'string';

/** Whether a rotation is signed by the key it moves from, and names a new key by that key's own id. */
export async function verifyRotation(r: unknown): Promise<boolean> {
  if (!isRotation(r) || r.from_key_id === r.to_key_id) return false;
  if ((await keyIdOf(r.to_public_key)) !== r.to_key_id) return false;
  return verifyText(r.from_public_key, r.from_key_id, r.sig, rotationText(r));
}

/** Whether a revocation is signed by the key it revokes. */
export const verifyRevocation = async (r: unknown): Promise<boolean> => isRevocation(r) && (await verifyText(r.public_key, r.key_id, r.sig, revocationText(r)));

/** Only the statements that verify, from anywhere. One that does not is dropped and counts for nothing. */
export async function verifiedStatements(doc: unknown): Promise<KeyStatements> {
  const m = isMap(doc) ? doc : {};
  const out = noStatements();
  for (const r of Array.isArray(m.rotations) ? m.rotations : []) if (await verifyRotation(r)) out.rotations.push(r as KeyRotation);
  for (const r of Array.isArray(m.revocations) ? m.revocations : []) if (await verifyRevocation(r)) out.revocations.push(r as KeyRevocation);
  return out;
}

/** An author's revocation of a key, among verified statements, or `null`. */
export const revocationOf = (statements: KeyStatements, keyId: string): KeyRevocation | null => statements.revocations.find((r) => r.key_id === keyId) ?? null;

/**
 * The key in `trusted` that verified statements lead from to `keyId`, one rotation at a time, or `null`. A rotation from a
 * revoked key counts only when the revocation names its target as the successor.
 *
 * KEYS ARE MATCHED BY ID, NOT BY THE AUTHOR NAME A STATEMENT CARRIES: a key id is its public key's hash, and a statement
 * counts because that key signed it, whatever name its file gives.
 */
export function rotatedFrom(statements: KeyStatements, trusted: readonly string[], keyId: string): string | null {
  for (const start of trusted) {
    const seen = new Set([start]);
    let frontier = [start];
    while (frontier.length > 0) {
      const next: string[] = [];
      for (const from of frontier) {
        const revoked = revocationOf(statements, from);
        for (const r of statements.rotations) {
          if (r.from_key_id !== from || seen.has(r.to_key_id)) continue;
          if (revoked && revoked.successor !== r.to_key_id) continue;
          if (r.to_key_id === keyId) return start;
          seen.add(r.to_key_id);
          next.push(r.to_key_id);
        }
      }
      frontier = next;
    }
  }
  return null;
}

/* ── trust on first use ─────────────────────────────────────────────────── */

/**
 * The key ids a reader has seen for each entry, first seen first, by `trustSubject`.
 *
 * KEPT BY WHAT A SIGNATURE COVERS, THE ENTRY'S KIND AND ID, never by the author name an index carries: that name is not
 * signed, so an edited index could rename the author and be heard as a first use.
 */
export type KnownKeys = Record<string, string[]>;

/** What a reader keeps a key under: the entry's kind and id, which the signature covers. */
export const trustSubject = (entry: { kind: string; id: string }): string => `${entry.kind}:${entry.id}`;

export type Trust =
  | { kind: 'unsigned' }
  /** Unsigned, where a key was seen for this entry or its earlier versions were signed: untrusted, and never offered. */
  | { kind: 'stripped'; before: string[] }
  /** Signed, and no key was seen for this author on this reader before. */
  | { kind: 'first'; key_id: string }
  /** Signed by a key this reader already holds for this author. */
  | { kind: 'known'; key_id: string }
  /** Signed by a key other than the one this reader holds for this author, with nothing from that key naming it. */
  | { kind: 'changed'; key_id: string; before: string[] }
  /** Signed by a new key that a key this reader holds for this author named in a rotation statement. */
  | { kind: 'rotated'; key_id: string; from: string }
  /** Signed by a key its author revoked: untrusted, whatever this reader saw before. */
  | { kind: 'revoked'; key_id: string; reason: string };

/**
 * How far a reader trusts a signature. `subject` is `trustSubject` of the entry. `statements` are the verified rotations
 * and revocations the catalogue carries (`verifiedStatements`). `signedBefore` are the keys that verifiably signed the
 * entry's earlier versions in the index (`keysSignedBefore`). A revoked key is untrusted before anything else is asked.
 *
 * A MISSING SIGNATURE IS LOUD WHEN A KEY IS KNOWN: a catalogue refuses to publish an unsigned version after a signed one,
 * so one that arrives that way was not published by the author's hand.
 */
export function trustOf(known: KnownKeys, subject: string, signature: Signature | null | undefined, statements: KeyStatements = noStatements(), signedBefore: readonly string[] = []): Trust {
  const seen = Object.hasOwn(known, subject) && Array.isArray(known[subject]) ? known[subject] : [];
  if (!signature) {
    const before = [...new Set([...seen, ...signedBefore])];
    return before.length > 0 ? { kind: 'stripped', before } : { kind: 'unsigned' };
  }
  const revoked = revocationOf(statements, signature.key_id);
  if (revoked) return { kind: 'revoked', key_id: signature.key_id, reason: revoked.reason };
  if (seen.length === 0) {
    const listed = [...new Set(signedBefore)];
    if (listed.length > 0 && !listed.includes(signature.key_id) && rotatedFrom(statements, listed, signature.key_id) === null) return { kind: 'changed', key_id: signature.key_id, before: listed };
    return { kind: 'first', key_id: signature.key_id };
  }
  if (seen.includes(signature.key_id)) return { kind: 'known', key_id: signature.key_id };
  const from = rotatedFrom(statements, seen, signature.key_id);
  return from !== null ? { kind: 'rotated', key_id: signature.key_id, from } : { kind: 'changed', key_id: signature.key_id, before: [...seen] };
}

/** The key a reader keeps after trusting a signature: a first key, or one a trusted key rotated to. Never a changed or revoked one. */
export const keyToKeep = (trust: Trust): string | null => (trust.kind === 'first' || trust.kind === 'rotated' ? trust.key_id : null);

/** The keys known after trusting one, and nothing changed for a key already held. */
export function rememberKey(known: KnownKeys, subject: string, keyId: string): KnownKeys {
  const seen = Object.hasOwn(known, subject) && Array.isArray(known[subject]) ? known[subject] : [];
  return seen.includes(keyId) ? known : { ...known, [subject]: [...seen, keyId] };
}

/** Known keys read from anywhere, keeping only well-formed ids. */
export function readKnownKeys(doc: unknown): KnownKeys {
  if (!isMap(doc)) return {};
  const out: KnownKeys = {};
  for (const [subject, ids] of Object.entries(doc)) if (Array.isArray(ids)) out[subject] = ids.filter((x): x is string => typeof x === 'string' && KEY_ID.test(x));
  return out;
}
