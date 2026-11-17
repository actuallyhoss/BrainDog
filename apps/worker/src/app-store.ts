/**
 * The App Store's word that a subscription was bought, renewed, ended or refunded: a JWS Apple signs, checked here.
 *
 * WHAT IS SIGNED. StoreKit 2 hands the app a signed transaction (`Transaction.jwsRepresentation`), and App Store Server
 * Notifications V2 post a signed payload that carries a signed transaction inside it. Each is a compact JWS whose header
 * names `ES256` and carries `x5c`: the leaf that signed it, Apple's WWDR intermediate, and Apple Root CA - G3.
 *
 * HOW IT IS CHECKED, AS APPLE'S OWN LIBRARIES DO: the last certificate is Apple Root CA - G3, by its SHA-256 (pinned
 * below, never read from the request); the intermediate is signed by the root and carries Apple's WWDR marker
 * (1.2.840.113635.100.6.2.1); the leaf is signed by the intermediate and carries the App Store receipt-signing marker
 * (1.2.840.113635.100.6.11.1); every certificate is in date at the time the payload says it was signed; and the JWS
 * itself is signed by the leaf's key. Anything else is `null`, and nothing is taken from a payload that is.
 *
 * NO NETWORK. Nothing is fetched: the root is pinned and the chain rides in the header, so a check costs four ECDSA
 * verifications and never waits on Apple.
 */

/** SHA-256 of Apple Root CA - G3 (DER), from https://www.apple.com/certificateauthority/AppleRootCA-G3.cer. */
const APPLE_ROOT_G3_SHA256 = '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179';

/** The OIDs, as their DER content bytes in hex. */
const OID_LEAF = '2a864886f76364060b01'; // 1.2.840.113635.100.6.11.1
const OID_WWDR = '2a864886f76364060201'; // 1.2.840.113635.100.6.2.1
const OID_P256 = '2a8648ce3d030107';
const OID_P384 = '2b81040022';
const OID_ECDSA_SHA256 = '2a8648ce3d040302';
const OID_ECDSA_SHA384 = '2a8648ce3d040303';

/** The most bytes a JWS is read at: a signed transaction is a few kilobytes, three certificates and all. */
const JWS_MOST = 32_768;

type Tlv = { tag: number; start: number; body: number; end: number };

/** One DER element at `at`: its tag, where its content starts and where it ends. `null` for bytes that are not one. */
function tlv(b: Uint8Array, at: number): Tlv | null {
  if (at + 2 > b.length) return null;
  const tag = b[at]!;
  let len = b[at + 1]!;
  let body = at + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 3 || body + n > b.length) return null;
    len = 0;
    for (let i = 0; i < n; i++) len = (len << 8) | b[body + i]!;
    body += n;
  }
  const end = body + len;
  return end > b.length ? null : { tag, start: at, body, end };
}

/** The elements inside a constructed one, in order. */
function children(b: Uint8Array, parent: Tlv): Tlv[] {
  const out: Tlv[] = [];
  let at = parent.body;
  while (at < parent.end) {
    const t = tlv(b, at);
    if (t === null) return [];
    out.push(t);
    at = t.end;
  }
  return out;
}

const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/** A certificate's parts that a check reads. */
type Cert = {
  der: Uint8Array;
  tbs: Uint8Array;
  sigAlg: string;
  signature: Uint8Array;
  spki: Uint8Array;
  curve: 'P-256' | 'P-384';
  notBefore: number;
  notAfter: number;
};

/** UTCTime (`YYMMDDHHMMSSZ`) or GeneralizedTime (`YYYYMMDDHHMMSSZ`) as epoch milliseconds. */
function timeOf(b: Uint8Array, t: Tlv): number | null {
  const s = new TextDecoder().decode(b.subarray(t.body, t.end));
  const m = t.tag === 0x17 ? /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/u.exec(s) : t.tag === 0x18 ? /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/u.exec(s) : null;
  if (m === null) return null;
  let year = Number(m[1]);
  if (t.tag === 0x17) year += year < 50 ? 2000 : 1900;
  return Date.UTC(year, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
}

/** A certificate read from its DER, or `null` for one that is not an EC certificate on P-256 or P-384. */
function certOf(der: Uint8Array): Cert | null {
  const top = tlv(der, 0);
  if (top === null || top.tag !== 0x30) return null;
  const [tbsT, algT, sigT] = children(der, top);
  if (!tbsT || !algT || !sigT || sigT.tag !== 0x03) return null;
  const alg = children(der, algT)[0];
  if (!alg || alg.tag !== 0x06) return null;
  const parts = children(der, tbsT);
  /* `[0] version` is there in every v3 certificate; the fields after it are in a fixed order. */
  const f = parts[0]?.tag === 0xa0 ? parts.slice(1) : parts;
  const validity = f[3];
  const spkiT = f[5];
  if (!validity || !spkiT) return null;
  const [nb, na] = children(der, validity);
  const notBefore = nb ? timeOf(der, nb) : null;
  const notAfter = na ? timeOf(der, na) : null;
  const spkiAlg = children(der, spkiT)[0];
  const curveT = spkiAlg ? children(der, spkiAlg)[1] : undefined;
  const curveOid = curveT ? hex(der.subarray(curveT.body, curveT.end)) : '';
  const curve = curveOid === OID_P256 ? 'P-256' : curveOid === OID_P384 ? 'P-384' : null;
  if (notBefore === null || notAfter === null || curve === null) return null;
  return {
    der,
    tbs: der.subarray(tbsT.start, tbsT.end),
    sigAlg: hex(der.subarray(alg.body, alg.end)),
    /* A BIT STRING's first content byte counts the unused bits, always 0 for a signature. */
    signature: der.subarray(sigT.body + 1, sigT.end),
    spki: der.subarray(spkiT.start, spkiT.end),
    curve,
    notBefore,
    notAfter,
  };
}

/** Whether a certificate's own bytes hold an OID (its extensions are the only place these markers appear). */
function holds(cert: Cert, oid: string): boolean {
  const want = `06${(oid.length / 2).toString(16).padStart(2, '0')}${oid}`;
  return hex(cert.tbs).includes(want);
}

/** A DER ECDSA signature (`SEQUENCE { r, s }`) as the fixed-width `r || s` WebCrypto verifies. */
function rawSignature(der: Uint8Array, size: number): Uint8Array | null {
  const top = tlv(der, 0);
  if (top === null || top.tag !== 0x30) return null;
  const [r, s] = children(der, top);
  if (!r || !s) return null;
  const out = new Uint8Array(size * 2);
  for (const [i, t] of [r, s].entries()) {
    let v = der.subarray(t.body, t.end);
    while (v.length > size && v[0] === 0) v = v.subarray(1);
    if (v.length > size) return null;
    out.set(v, i * size + (size - v.length));
  }
  return out;
}

const buffer = (b: Uint8Array): ArrayBuffer => b.slice().buffer as ArrayBuffer;

type Key = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

async function keyOf(cert: Cert): Promise<Key | null> {
  try {
    return await crypto.subtle.importKey('spki', buffer(cert.spki), { name: 'ECDSA', namedCurve: cert.curve }, false, ['verify']);
  } catch {
    return null;
  }
}

/** Whether `child` is signed by `parent`'s key. */
async function signedBy(child: Cert, parent: Cert): Promise<boolean> {
  const hash = child.sigAlg === OID_ECDSA_SHA256 ? 'SHA-256' : child.sigAlg === OID_ECDSA_SHA384 ? 'SHA-384' : null;
  const key = await keyOf(parent);
  const raw = rawSignature(child.signature, parent.curve === 'P-256' ? 32 : 48);
  if (hash === null || key === null || raw === null) return false;
  try {
    return await crypto.subtle.verify({ name: 'ECDSA', hash }, key, buffer(raw), buffer(child.tbs));
  } catch {
    return false;
  }
}

const fromB64 = (s: string, url: boolean): Uint8Array | null => {
  try {
    const t = url ? s.replace(/-/gu, '+').replace(/_/gu, '/') : s;
    const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
};

const jsonOf = (b: Uint8Array | null): Record<string, unknown> | null => {
  if (b === null) return null;
  try {
    const v: unknown = JSON.parse(new TextDecoder().decode(b));
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

/**
 * A JWS signed by the App Store, its payload, or `null` when any part of the check fails. `now` is the clock the
 * certificates are held to when the payload names no `signedDate`.
 */
export async function verifyAppStore(jws: unknown, now: number): Promise<Record<string, unknown> | null> {
  if (typeof jws !== 'string' || jws.length > JWS_MOST) return null;
  const parts = jws.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts as [string, string, string];
  const header = jsonOf(fromB64(h, true));
  const payload = jsonOf(fromB64(p, true));
  if (header === null || payload === null || header['alg'] !== 'ES256') return null;
  const x5c = header['x5c'];
  if (!Array.isArray(x5c) || x5c.length !== 3 || !x5c.every((c) => typeof c === 'string')) return null;
  const certs = (x5c as string[]).map((c) => fromB64(c, false)).map((d) => (d === null ? null : certOf(d)));
  const [leaf, wwdr, root] = certs;
  if (!leaf || !wwdr || !root) return null;

  const pin = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer(root.der))));
  if (pin !== APPLE_ROOT_G3_SHA256) return null;
  if (!holds(wwdr, OID_WWDR) || !holds(leaf, OID_LEAF)) return null;
  const signed = typeof payload['signedDate'] === 'number' ? payload['signedDate'] : now;
  if (!certs.every((c) => c !== null && c.notBefore <= signed && signed <= c.notAfter)) return null;
  if (!(await signedBy(wwdr, root)) || !(await signedBy(leaf, wwdr))) return null;

  const key = await keyOf(leaf);
  const sig = fromB64(s, true);
  if (key === null || sig === null || sig.length !== 64 || leaf.curve !== 'P-256') return null;
  try {
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, buffer(sig), buffer(new TextEncoder().encode(`${h}.${p}`)));
    return ok ? payload : null;
  } catch {
    return null;
  }
}

/** A signed transaction's fields billing reads (Apple's `JWSTransactionDecodedPayload`). */
export type AppStoreTransaction = {
  transactionId: string;
  originalTransactionId: string;
  bundleId: string;
  productId: string;
  /** When this period ends, epoch milliseconds; `null` for a transaction that is not a subscription. */
  expiresDate: number | null;
  /** Set when Apple took the transaction back (a refund, or Family Sharing ended). */
  revocationDate: number | null;
  appAccountToken: string | null;
  environment: 'Production' | 'Sandbox' | string;
};

/** A verified payload read as a transaction, or `null` when it names no transaction. */
export function transactionOf(p: Record<string, unknown>): AppStoreTransaction | null {
  const text = (k: string): string => (typeof p[k] === 'string' ? (p[k] as string) : '');
  const num = (k: string): number | null => (typeof p[k] === 'number' && Number.isFinite(p[k]) ? (p[k] as number) : null);
  const tx = {
    transactionId: text('transactionId'),
    originalTransactionId: text('originalTransactionId'),
    bundleId: text('bundleId'),
    productId: text('productId'),
    expiresDate: num('expiresDate'),
    revocationDate: num('revocationDate'),
    appAccountToken: text('appAccountToken') === '' ? null : text('appAccountToken').toLowerCase(),
    environment: text('environment'),
  };
  return tx.transactionId === '' || tx.originalTransactionId === '' || tx.productId === '' || tx.bundleId === '' ? null : tx;
}

/**
 * The `appAccountToken` a record's purchases carry: a UUID made from the record's id, so the server knows which
 * record a transaction is for without a table, and a transaction bought for one record is refused for another.
 * Not a secret: a transaction is signed by Apple and only the person who bought it holds it.
 */
export async function appAccountTokenOf(record: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`braindog.app-store:${record}`))).slice(0, 16);
  d[6] = (d[6]! & 0x0f) | 0x40;
  d[8] = (d[8]! & 0x3f) | 0x80;
  const h = hex(d);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
