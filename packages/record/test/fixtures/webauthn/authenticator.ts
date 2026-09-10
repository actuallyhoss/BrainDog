/**
 * A software authenticator: what a phone does in a WebAuthn ceremony, in WebCrypto, with a throwaway key.
 *
 * IT BUILDS THE BYTES THE VERIFIER READS, AND NOTHING THE VERIFIER WROTE. Authenticator data, the CBOR
 * attestation object and the signature are assembled here from the specification's layout, so a green test is
 * a claim that `webauthn.ts` reads what an authenticator writes, not that it agrees with itself.
 *
 * `keys.json` BESIDE IT IS A TEST KEY AND NOTHING ELSE. It was generated once by `make.ts`, it opens nothing,
 * and it is committed so that the vectors it signed can be regenerated and checked by anybody.
 */

import { readFileSync } from 'node:fs';

import type { AssertionJSON, RegistrationJSON } from '@braindog/ports';

import { b64url } from '../../../src/webauthn.ts';

/** A throwaway key as `keys.json` holds it: the credential id it answers to and its private JWK. */
export type TestKey = { alg: -7 | -257; id: string; jwk: Record<string, unknown> };

export const KEYS_URL = new URL('./keys.json', import.meta.url);

/** The committed test keys, or `null` before `make.ts` has written them. */
export function testKeys(): { es256: TestKey; rs256: TestKey } | null {
  try {
    return JSON.parse(readFileSync(KEYS_URL, 'utf8')) as { es256: TestKey; rs256: TestKey };
  } catch {
    return null;
  }
}

/* ── a CBOR writer, for building what the reader reads ─────────────────── */

/** `raw` splices bytes in unchanged, which is how a test writes CBOR the writer would refuse to. */
export type CborIn = number | string | boolean | null | Uint8Array | CborIn[] | Map<number | string, CborIn> | { raw: Uint8Array };

function headOf(major: number, n: number): number[] {
  const m = major << 5;
  if (n < 24) return [m | n];
  if (n < 0x100) return [m | 24, n];
  if (n < 0x10000) return [m | 25, n >> 8, n & 255];
  if (n < 0x100000000) return [m | 26, (n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const hi = Math.floor(n / 0x100000000);
  const lo = n >>> 0;
  return [m | 27, (hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255, (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255];
}

export function encode(v: CborIn): Uint8Array {
  const out: number[] = [];
  const put = (x: CborIn): void => {
    if (typeof x === 'number') out.push(...(x >= 0 ? headOf(0, x) : headOf(1, -1 - x)));
    else if (typeof x === 'string') {
      const b = new TextEncoder().encode(x);
      out.push(...headOf(3, b.length), ...b);
    } else if (typeof x === 'boolean') out.push(x ? 0xf5 : 0xf4);
    else if (x === null) out.push(0xf6);
    else if (x instanceof Uint8Array) out.push(...headOf(2, x.length), ...x);
    else if (Array.isArray(x)) {
      out.push(...headOf(4, x.length));
      for (const e of x) put(e);
    } else if (x instanceof Map) {
      out.push(...headOf(5, x.size));
      for (const [k, e] of x) {
        put(k);
        put(e);
      }
    } else out.push(...x.raw);
  };
  put(v);
  return new Uint8Array(out);
}

/* ── keys ─────────────────────────────────────────────────────────────── */

export const fromB64url = (s: string): Uint8Array => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

/** The COSE form of the key's public half, as an authenticator writes it into authenticator data. */
export function coseOf(key: TestKey): Map<number, CborIn> {
  const j = key.jwk as Record<string, string>;
  return key.alg === -7
    ? new Map<number, CborIn>([[1, 2], [3, -7], [-1, 1], [-2, fromB64url(j.x!)], [-3, fromB64url(j.y!)]])
    : new Map<number, CborIn>([[1, 3], [3, -257], [-1, fromB64url(j.n!)], [-2, fromB64url(j.e!)]]);
}

async function signWith(key: TestKey, bytes: Uint8Array): Promise<Uint8Array> {
  const usable = await crypto.subtle.importKey(
    'jwk',
    key.jwk as never,
    key.alg === -7 ? { name: 'ECDSA', namedCurve: 'P-256' } : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign(key.alg === -7 ? { name: 'ECDSA', hash: 'SHA-256' } : 'RSASSA-PKCS1-v1_5', usable, new Uint8Array(bytes)),
  );
  /* WebCrypto signs ECDSA as raw `r ‖ s`; an authenticator sends DER, so this does what the phone does. */
  return key.alg === -7 ? rawToDer(sig) : sig;
}

/** Raw `r ‖ s` to DER, the minimal encoding: leading zeros off, one zero on when the top bit is set. */
export function rawToDer(raw: Uint8Array): Uint8Array {
  const int = (b: Uint8Array): number[] => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    const v = [...b.subarray(i)];
    return v[0]! & 0x80 ? [0x02, v.length + 1, 0, ...v] : [0x02, v.length, ...v];
  };
  const body = [...int(raw.subarray(0, 32)), ...int(raw.subarray(32))];
  return new Uint8Array([0x30, body.length, ...body]);
}

/* ── the bytes of a ceremony ──────────────────────────────────────────── */

export const FLAG = { UP: 0x01, UV: 0x04, BE: 0x08, BS: 0x10, AT: 0x40, ED: 0x80 } as const;

const sha256 = async (b: Uint8Array): Promise<Uint8Array> => new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(b)));

/** Authenticator data: RP ID hash, flags, a big-endian count, then (when AT) the credential and its key. */
export async function authData(o: {
  rpId: string;
  flags: number;
  signCount: number;
  attested?: { id: Uint8Array; cose: Uint8Array };
  tail?: Uint8Array;
}): Promise<Uint8Array> {
  const out = [
    ...(await sha256(new TextEncoder().encode(o.rpId))),
    o.flags,
    (o.signCount >>> 24) & 255,
    (o.signCount >>> 16) & 255,
    (o.signCount >>> 8) & 255,
    o.signCount & 255,
  ];
  if (o.attested) out.push(...new Uint8Array(16), o.attested.id.length >> 8, o.attested.id.length & 255, ...o.attested.id, ...o.attested.cose);
  if (o.tail) out.push(...o.tail);
  return new Uint8Array(out);
}

/** `clientDataJSON` as a browser writes it, with any field a test wants to change. */
export const clientJSON = (fields: Record<string, unknown>): Uint8Array => new TextEncoder().encode(JSON.stringify(fields));

export type Made = { id: string; clientDataJSON: Uint8Array; attestationObject: Uint8Array };

/** `navigator.credentials.create()`. Every part can be overridden, because every negative is one part wrong. */
export async function register(
  key: TestKey,
  o: {
    rpId: string;
    origin: string;
    challenge: string;
    flags?: number;
    signCount?: number;
    fmt?: string;
    attStmt?: CborIn;
    client?: Record<string, unknown>;
    cose?: CborIn;
    tail?: Uint8Array;
    attestation?: (authData: Uint8Array) => Uint8Array;
  },
): Promise<Made> {
  const data = await authData({
    rpId: o.rpId,
    flags: o.flags ?? FLAG.UP | FLAG.UV | FLAG.AT,
    signCount: o.signCount ?? 0,
    attested: { id: fromB64url(key.id), cose: encode(o.cose ?? coseOf(key)) },
    ...(o.tail ? { tail: o.tail } : {}),
  });
  const attestationObject = o.attestation
    ? o.attestation(data)
    : encode(new Map<string, CborIn>([['fmt', o.fmt ?? 'none'], ['attStmt', o.attStmt ?? new Map()], ['authData', data]]));
  return {
    id: key.id,
    clientDataJSON: clientJSON({ type: 'webauthn.create', challenge: o.challenge, origin: o.origin, crossOrigin: false, ...o.client }),
    attestationObject,
  };
}

export type Asserted = { id: string; clientDataJSON: Uint8Array; authenticatorData: Uint8Array; signature: Uint8Array; userHandle: Uint8Array | null };

/** `navigator.credentials.get()`: authenticator data, then a signature over it and the client data's hash. */
export async function assert(
  key: TestKey,
  o: { rpId: string; origin: string; challenge: string; signCount: number; person: string | null; flags?: number; client?: Record<string, unknown> },
): Promise<Asserted> {
  const authenticatorData = await authData({ rpId: o.rpId, flags: o.flags ?? FLAG.UP | FLAG.UV, signCount: o.signCount });
  const clientDataJSON = clientJSON({ type: 'webauthn.get', challenge: o.challenge, origin: o.origin, crossOrigin: false, ...o.client });
  const signed = new Uint8Array([...authenticatorData, ...(await sha256(clientDataJSON))]);
  return {
    id: key.id,
    clientDataJSON,
    authenticatorData,
    signature: await signWith(key, signed),
    userHandle: o.person === null ? null : new TextEncoder().encode(o.person),
  };
}

/** The same two ceremonies in the JSON shape a browser posts, which is what the Directory takes. */
export const asJSON = {
  registration: (m: Made): RegistrationJSON => ({
    id: m.id,
    response: { clientDataJSON: b64url(m.clientDataJSON), attestationObject: b64url(m.attestationObject) },
  }),
  assertion: (a: Asserted): AssertionJSON => ({
    id: a.id,
    response: {
      clientDataJSON: b64url(a.clientDataJSON),
      authenticatorData: b64url(a.authenticatorData),
      signature: b64url(a.signature),
      userHandle: a.userHandle === null ? null : b64url(a.userHandle),
    },
  }),
};
