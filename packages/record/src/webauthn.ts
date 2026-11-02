/**
 * WebAuthn, verified in WebCrypto and nothing else. `49 §5.10`, `12 §8`.
 *
 * NO LIBRARY, AND THE REASON IS WHAT A LIBRARY IS MOSTLY FOR. `@simplewebauthn/server` brings ten runtime
 * dependencies and 771 KB, and almost all of it parses attestation statements, which this product does not
 * read: a passkey is registered only behind a live session (`12 §8`), so the session is the attestation and the
 * options ask for `attestation: 'none'`. What is left is a small CBOR reader, two key shapes and two
 * `subtle.verify` calls.
 *
 * PURE, SO BOTH HOSTS RUN IT. `crypto.subtle`, `crypto.getRandomValues` and `TextEncoder` exist in workerd, in
 * Node and in a browser; `node:crypto` and `Buffer` exist in only one of them.
 *
 * EVERY FAILURE IS A `Why`, AND THE `Why` IS FOR A LOG. The caller answers one sentence for all of them, because
 * a verifier that says which check failed is an oracle for whoever is building a forgery. The owner, who
 * deserves the reason, reads it in the log.
 *
 * THE CHECKS RUN IN ONE ORDER, cheapest and least revealing first: the client data's type, its challenge, the
 * exact origin, no cross-origin frame; then the authenticator data's RP ID hash, its flags (UP and UV always, AT
 * on registration), the key's algorithm and whether WebCrypto accepts the key; then, for an assertion, the
 * signature, the sign count and the user handle.
 *
 * UV ALWAYS, BECAUSE THE OPTIONS SAY `required` AND AN OPTION IS ONLY A REQUEST. The browser is asked to verify the
 * person (a PIN, a face, a finger), and the flag in the signed authenticator data is the only evidence it did; a
 * relying party that asks and never checks accepts one tap on a device somebody else picked up.
 */

type Bytes = Uint8Array<ArrayBuffer>;
type Key = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

/** Which check said no. `dup` is the Directory's (a credential id it already holds); every other one is decided here. */
export type Why =
  | 'shape'
  | 'cbor'
  | 'type'
  | 'challenge'
  | 'origin'
  | 'rpid'
  | 'flags'
  | 'alg'
  | 'sig'
  | 'count'
  | 'dup'
  | 'handle';

export type Verdict<T> = { ok: true; value: T } | { ok: false; why: Why };

const pass = <T>(value: T): Verdict<T> => ({ ok: true, value });
const fail = <T>(why: Why): Verdict<T> => ({ ok: false, why });

/** The two algorithms the options offer: ES256 (-7) and RS256 (-257). Everything else is refused as `alg`. */
export type Alg = -7 | -257;

/** A public key as it is stored: the JWK WebCrypto imports, so verifying is one `importKey` and no conversion. */
export type PublicJwk = { kty: 'EC'; crv: 'P-256'; x: string; y: string } | { kty: 'RSA'; n: string; e: string; alg: 'RS256' };

const encoder = new TextEncoder();
/* `ignoreBOM: false` is the default, spelled out because the Workers types require both options. */
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });

/** UTF-8, or `null` for bytes that are not. `fatal`, so a malformed string is refused rather than repaired. */
const utf8 = (bytes: Uint8Array): string | null => {
  try {
    return decoder.decode(bytes);
  } catch {
    return null;
  }
};

/** A copy on an `ArrayBuffer` of its own, which is what `crypto.subtle` is typed to take. */
const own = (bytes: Uint8Array): Bytes => new Uint8Array(bytes);

const sha256 = async (bytes: Uint8Array): Promise<Bytes> => new Uint8Array(await crypto.subtle.digest('SHA-256', own(bytes)));

/**
 * Byte equality in time that depends on the length and not on where the first difference is.
 *
 * EXPORTED FOR THE DIRECTORY'S SERVER-KEY COMPARE, which runs it over two SHA-256 digests, so the length is
 * always 32 and says nothing either.
 */
export const same = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
};

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** base64url without padding: how WebAuthn writes every binary field in JSON. */
export function b64url(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += ALPHABET[n >> 18]! + ALPHABET[(n >> 12) & 63]! + ALPHABET[(n >> 6) & 63]! + ALPHABET[n & 63]!;
  }
  if (bytes.length - i === 1) {
    const n = bytes[i]! << 16;
    out += ALPHABET[n >> 18]! + ALPHABET[(n >> 12) & 63]!;
  } else if (bytes.length - i === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += ALPHABET[n >> 18]! + ALPHABET[(n >> 12) & 63]! + ALPHABET[(n >> 6) & 63]!;
  }
  return out;
}

/**
 * base64url to bytes, or `null` for anything but the canonical unpadded spelling.
 *
 * CANONICAL, BECAUSE A CREDENTIAL ID IS A PRIMARY KEY. Two spellings of one id (padding, or non-zero bits after
 * the last whole byte) would be two lookups for one passkey.
 */
export function unb64url(text: string): Bytes | null {
  if (text.length % 4 === 1 || !/^[A-Za-z0-9_-]*$/.test(text)) return null;
  const out = new Uint8Array(Math.floor((text.length * 3) / 4));
  let acc = 0;
  let bits = 0;
  let o = 0;
  for (const c of text) {
    acc = (acc << 6) | ALPHABET.indexOf(c);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 255;
      acc &= (1 << bits) - 1;
    }
  }
  return acc === 0 ? out : null;
}

/* ── CBOR ─────────────────────────────────────────────────────────────── */

/** What the reader produces. Major type 7 is only the four simple values: nothing WebAuthn sends is a float. */
export type Cbor = number | string | boolean | null | undefined | Bytes | Cbor[] | Map<number | string, Cbor>;

const BAD = Symbol('bad');
type Reader = { b: Uint8Array; i: number };

/**
 * FOUR CONTAINERS DEEP AT MOST. An attestation object is a map holding a map holding an array holding bytes,
 * which is three; a COSE key is one. A fifth level is not WebAuthn, and refusing it bounds the recursion.
 */
const MAX_DEPTH = 4;

/** One item's head: its major type, its additional information, and the argument that follows. */
function head(r: Reader): { major: number; ai: number; arg: number } | typeof BAD {
  if (r.i >= r.b.length) return BAD;
  const first = r.b[r.i++]!;
  const major = first >> 5;
  const ai = first & 31;
  if (ai < 24) return { major, ai, arg: ai };
  /* 28 to 30 are reserved and 31 is an indefinite length: definite lengths only, so neither is read. */
  const size = ai === 24 ? 1 : ai === 25 ? 2 : ai === 26 ? 4 : ai === 27 ? 8 : 0;
  if (size === 0 || r.i + size > r.b.length) return BAD;
  let arg = 0;
  for (let k = 0; k < size; k++) arg = arg * 256 + r.b[r.i++]!;
  /* NO INTEGER PAST 2^53 - 1. A JavaScript number holds nothing larger exactly, and a length or a count that
     large is an attack on the allocator rather than a key. */
  if (arg > Number.MAX_SAFE_INTEGER) return BAD;
  return { major, ai, arg };
}

function item(r: Reader, depth: number): Cbor | typeof BAD {
  const h = head(r);
  if (h === BAD) return BAD;
  switch (h.major) {
    case 0:
      return h.arg;
    case 1:
      return -1 - h.arg;
    case 2:
    case 3: {
      /* A length is checked against what is left BEFORE anything is allocated for it. */
      if (h.arg > r.b.length - r.i) return BAD;
      const bytes = r.b.slice(r.i, r.i + h.arg);
      r.i += h.arg;
      if (h.major === 2) return bytes;
      const text = utf8(bytes);
      return text === null ? BAD : text;
    }
    case 4: {
      if (depth >= MAX_DEPTH || h.arg > r.b.length - r.i) return BAD;
      const out: Cbor[] = [];
      for (let k = 0; k < h.arg; k++) {
        const v = item(r, depth + 1);
        if (v === BAD) return BAD;
        out.push(v);
      }
      return out;
    }
    case 5: {
      if (depth >= MAX_DEPTH || h.arg * 2 > r.b.length - r.i) return BAD;
      const out = new Map<number | string, Cbor>();
      for (let k = 0; k < h.arg; k++) {
        const key = item(r, depth + 1);
        /* A KEY IS AN INTEGER OR A STRING, AND ONLY ONCE. A COSE key with two `alg` entries is two keys, and
           reading whichever came last is how a verifier gets talked into the wrong one. */
        if ((typeof key !== 'number' && typeof key !== 'string') || out.has(key)) return BAD;
        const v = item(r, depth + 1);
        if (v === BAD) return BAD;
        out.set(key, v);
      }
      return out;
    }
    case 7:
      return h.ai === 20 ? false : h.ai === 21 ? true : h.ai === 22 ? null : h.ai === 23 ? undefined : BAD;
    default:
      /* Major type 6, a tag. Nothing in an attestation object or a COSE key is tagged. */
      return BAD;
  }
}

/**
 * A whole CBOR item: major types 0 to 5 and 7, definite lengths, at most four containers deep, integers up to
 * 2^53 - 1, and not one byte left over.
 */
export function cbor(bytes: Uint8Array): Verdict<Cbor> {
  const r: Reader = { b: bytes, i: 0 };
  const value = item(r, 0);
  return value === BAD || r.i !== bytes.length ? fail('cbor') : pass(value);
}

/* ── client data ──────────────────────────────────────────────────────── */

/**
 * `origin` IS ONE ORIGIN OR THE LIST OF THEM a ceremony may come from: the page's own, and on the Worker the one a
 * native app's assertion carries (`https://<relying party id>`, see `AuthConfig.rp` in `identity.ts`).
 */
export type Expect = { origin: string | readonly string[]; rpId: string; challenge?: string | undefined };

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/**
 * `clientDataJSON`: what the browser says it was asked to do, and where.
 *
 * THE ORIGIN IS COMPARED EXACTLY, as a string, against each origin the host listed. `https://studio.example` is not
 * `https://studio.example/`, not `http://studio.example` and not a subdomain; the browser writes it, so a mismatch is
 * somebody else's page.
 *
 * AND NEVER FROM INSIDE A FRAME ON ANOTHER SITE. Anything but an absent or `false` `crossOrigin` is refused as
 * `origin`, because the page that asked is then not the page the origin names.
 *
 * WITHOUT AN EXPECTED CHALLENGE it answers the one the browser carried, which is how the Directory finds the
 * challenge row to consume before it verifies anything expensive.
 */
export function clientData(
  json: Uint8Array,
  expect: { type: 'webauthn.create' | 'webauthn.get'; origin: string | readonly string[]; challenge?: string | undefined },
): Verdict<{ challenge: string }> {
  const text = utf8(json);
  let c: unknown = null;
  try {
    c = text === null ? null : JSON.parse(text);
  } catch {
    c = null;
  }
  if (!isObject(c) || typeof c.type !== 'string' || typeof c.challenge !== 'string' || typeof c.origin !== 'string')
    return fail('shape');
  if (c.type !== expect.type) return fail('type');
  if (expect.challenge !== undefined && c.challenge !== expect.challenge) return fail('challenge');
  const origins: readonly string[] = typeof expect.origin === 'string' ? [expect.origin] : expect.origin;
  if (!origins.includes(c.origin)) return fail('origin');
  if (c.crossOrigin !== undefined && c.crossOrigin !== false) return fail('origin');
  return pass({ challenge: c.challenge });
}

/* ── authenticator data ───────────────────────────────────────────────── */

const UP = 0x01;
const UV = 0x04;
const BE = 0x08;
const BS = 0x10;
const AT = 0x40;
const ED = 0x80;

const u32 = (b: Uint8Array, offset: number): number =>
  b[offset]! * 0x1000000 + ((b[offset + 1]! << 16) | (b[offset + 2]! << 8) | b[offset + 3]!);

/**
 * The first 37 bytes every authenticator data starts with: whose RP ID it was made for, and the flags.
 *
 * BACKED UP WITHOUT BACKUP-ELIGIBLE IS REFUSED, as the specification says a relying party must: the two bits
 * contradict each other, and an authenticator that sets them both wrong is not one to trust with the rest.
 */
async function prefix(data: Uint8Array, rpId: string, need: number): Promise<Verdict<{ flags: number; signCount: number }>> {
  if (data.length < 37) return fail('shape');
  if (!same(data.subarray(0, 32), await sha256(encoder.encode(rpId)))) return fail('rpid');
  const flags = data[32]!;
  if ((flags & need) !== need || ((flags & BS) !== 0 && (flags & BE) === 0)) return fail('flags');
  return pass({ flags, signCount: u32(data, 33) });
}

/**
 * COSE to JWK, for exactly the two keys the options ask for.
 *
 * ES256 IS EC2 ON P-256 WITH 32-BYTE COORDINATES, and RS256 is RSA with a modulus of at least 2048 bits. A key
 * that names -7 on another curve, or RS256 on a short modulus, is refused rather than coerced.
 */
function jwkOf(key: Cbor): { jwk: PublicJwk; alg: Alg } | null {
  if (!(key instanceof Map)) return null;
  const kty = key.get(1);
  const alg = key.get(3);
  if (alg === -7 && kty === 2 && key.get(-1) === 1) {
    const x = key.get(-2);
    const y = key.get(-3);
    if (x instanceof Uint8Array && y instanceof Uint8Array && x.length === 32 && y.length === 32)
      return { alg: -7, jwk: { kty: 'EC', crv: 'P-256', x: b64url(x), y: b64url(y) } };
  }
  if (alg === -257 && kty === 3) {
    const n = key.get(-1);
    const e = key.get(-2);
    if (n instanceof Uint8Array && e instanceof Uint8Array && n.length >= 256 && n.length <= 1025 && e.length >= 1 && e.length <= 8)
      return { alg: -257, jwk: { kty: 'RSA', n: b64url(n), e: b64url(e), alg: 'RS256' } };
  }
  return null;
}

/** The key WebCrypto will verify with, or `null` when it will not take it (a point off the curve, a bad modulus). */
async function importJwk(jwk: PublicJwk, alg: Alg): Promise<Key | null> {
  try {
    return await crypto.subtle.importKey(
      'jwk',
      jwk,
      alg === -7 ? { name: 'ECDSA', namedCurve: 'P-256' } : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
  } catch {
    return null;
  }
}

/* ── the two ceremonies ───────────────────────────────────────────────── */

/** What a verified registration yields: everything the `dir_passkey` row needs. */
export type Registered = { id: string; jwk: PublicJwk; alg: Alg; signCount: number; backedUp: boolean };

/**
 * A new passkey, from `navigator.credentials.create()`.
 *
 * `fmt` AND `attStmt` ARE READ FOR SHAPE AND NOTHING ELSE. Whatever the statement says (`packed`, `tpm`, a
 * vendor's certificate chain) it is not verified, because the options asked for `none` and the session that
 * reached this call is the proof that the right person is holding the device.
 */
export async function registration(
  input: { clientDataJSON: Uint8Array; attestationObject: Uint8Array },
  expect: Expect,
): Promise<Verdict<Registered>> {
  const client = clientData(input.clientDataJSON, { type: 'webauthn.create', origin: expect.origin, challenge: expect.challenge });
  if (!client.ok) return fail(client.why);

  const top = cbor(input.attestationObject);
  if (!top.ok) return fail(top.why);
  const att = top.value;
  if (!(att instanceof Map)) return fail('shape');
  const data = att.get('authData');
  if (typeof att.get('fmt') !== 'string' || !(att.get('attStmt') instanceof Map) || !(data instanceof Uint8Array)) return fail('shape');

  const head = await prefix(data, expect.rpId, UP | UV | AT);
  if (!head.ok) return fail(head.why);

  /* The attested credential data: a 16-byte AAGUID, a two-byte length, the credential id, then the COSE key. */
  if (data.length < 55) return fail('shape');
  const idLength = (data[53]! << 8) | data[54]!;
  const coseAt = 55 + idLength;
  if (idLength < 1 || idLength > 1023 || coseAt >= data.length) return fail('shape');
  const r: Reader = { b: data, i: coseAt };
  const cose = item(r, 0);
  if (cose === BAD) return fail('cbor');
  /* Extensions follow the key only when ED says so, as one map; otherwise not a byte may follow it. */
  if ((head.value.flags & ED) !== 0 && !(item(r, 0) instanceof Map)) return fail('cbor');
  if (r.i !== data.length) return fail('cbor');

  const key = jwkOf(cose);
  if (!key || !(await importJwk(key.jwk, key.alg))) return fail('alg');

  return pass({
    id: b64url(data.subarray(55, coseAt)),
    jwk: key.jwk,
    alg: key.alg,
    signCount: head.value.signCount,
    backedUp: (head.value.flags & BS) !== 0,
  });
}

/**
 * A sign-in, from `navigator.credentials.get()`, against the passkey the Directory holds for that credential id.
 *
 * THE SIGNATURE IS OVER `authenticatorData ‖ SHA-256(clientDataJSON)`. ES256 arrives as DER and WebCrypto wants
 * the raw 64 bytes, which is all `derToRaw` is for; RS256 is PKCS#1 v1.5 as it comes.
 *
 * THE SIGN COUNT: if either the stored count or the new one is non-zero, the new one must be greater. A passkey
 * that syncs reports zero for ever and is accepted; one that counted and then went backwards, or stood still, is
 * a clone.
 *
 * AND A USER HANDLE, WHEN THERE IS ONE, MUST BE THE PERSON THE PASSKEY WAS REGISTERED TO. The authenticator
 * wrote it at registration from `user.id`; a different one means this credential was minted for somebody else.
 */
export async function assertion(
  input: { clientDataJSON: Uint8Array; authenticatorData: Uint8Array; signature: Uint8Array; userHandle?: Uint8Array | null | undefined },
  expect: Expect & { jwk: PublicJwk; alg: Alg; signCount: number; person: string },
): Promise<Verdict<{ signCount: number; backedUp: boolean }>> {
  const client = clientData(input.clientDataJSON, { type: 'webauthn.get', origin: expect.origin, challenge: expect.challenge });
  if (!client.ok) return fail(client.why);

  const data = input.authenticatorData;
  const head = await prefix(data, expect.rpId, UP | UV);
  if (!head.ok) return fail(head.why);

  const key = await importJwk(expect.jwk, expect.alg);
  if (!key) return fail('alg');

  const signed = new Uint8Array(data.length + 32);
  signed.set(data);
  signed.set(await sha256(input.clientDataJSON), data.length);
  let good = false;
  try {
    if (expect.alg === -7) {
      const raw = derToRaw(input.signature);
      if (!raw) return fail('sig');
      good = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, raw, signed);
    } else good = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, own(input.signature), signed);
  } catch {
    good = false;
  }
  if (!good) return fail('sig');

  const signCount = head.value.signCount;
  if ((signCount !== 0 || expect.signCount !== 0) && signCount <= expect.signCount) return fail('count');

  const handle = input.userHandle;
  if (handle && handle.length > 0 && !same(handle, encoder.encode(expect.person))) return fail('handle');

  return pass({ signCount, backedUp: (head.value.flags & BS) !== 0 });
}

/**
 * An ES256 signature from DER `ECDSA-Sig-Value` to the raw `r ‖ s` WebCrypto verifies, or `null`.
 *
 * EACH INTEGER IS 1 TO 33 BYTES. Thirty-three means DER added a zero so a value with its top bit set does not
 * read as negative, and that zero is dropped; fewer than 32 means leading zeros were left off, and they are put
 * back. Anything else, a long-form length, or a byte after the second integer, is not a signature.
 */
export function derToRaw(der: Uint8Array): Bytes | null {
  if (der.length < 8 || der[0] !== 0x30 || der[1] !== der.length - 2 || der[1]! > 0x7f) return null;
  const out = new Uint8Array(64);
  let i = 2;
  for (const half of [0, 32]) {
    if (der[i] !== 0x02) return null;
    const length = der[i + 1];
    if (length === undefined || length < 1 || length > 33 || i + 2 + length > der.length) return null;
    let v = der.subarray(i + 2, i + 2 + length);
    if (length === 33) {
      if (v[0] !== 0) return null;
      v = v.subarray(1);
    }
    out.set(v, half + 32 - v.length);
    i += 2 + length;
  }
  return i === der.length ? out : null;
}
