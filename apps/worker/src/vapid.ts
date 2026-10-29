/**
 * VAPID for Web Push, over WebCrypto and nothing else. RFC 8292, `09 §3`, `51 §5` (`notify.push`).
 *
 * NO DEPENDENCY, AND THAT IS NOT A PREFERENCE. `51 §7` pins `@pushforge/builder` for this, and it is not in the
 * lockfile: `pnpm install --offline` cannot fetch it, so the pinned route was one nobody could build. What it would have
 * done is two things, and only one of them is needed here. Signing the JWT is an ES256 signature, which WebCrypto does
 * in one call in workerd and in Node alike. Encrypting a payload (RFC 8291, ECDH plus HKDF plus AES-GCM) is the other,
 * and since E44 it is done here too, over WebCrypto, for the one thing a push carries: where a tap opens.
 *
 * SO THE PUSH CARRIES NO CONTENT, which `09 §3` asks for in so many words ("one line, no content"). The kernel's
 * `notify.push` payload is `{ sub: { id } }` and at most a path (`open`), so there are no words to leave even by mistake: the
 * service worker shows a fixed line, and the app reads what changed with the person's own session. A row an older
 * build queued still carries a title cut from a notice, which is somebody's overdue invoice, and it is never read.
 *
 * THE KEYS ARE HIS, and nothing in this repository generates or holds one. `VAPID_PUBLIC` is a var, because the app
 * hands it to every browser that subscribes; `VAPID_PRIVATE` is a Worker secret. Both are the two strings the usual
 * generators print: the public key as the 65-byte uncompressed P-256 point and the private key as the 32-byte scalar,
 * each in base64url.
 */

import { b64url } from '@braindog/kernel';

/** A WebCrypto key, named without the DOM library, exactly as `sign.ts` and `keys.ts` name it. */
type Key = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

/** A VAPID pair, read and checked: the public key as the header carries it, and the private half as a signing key. */
export type Vapid = { publicKey: string; key: Key };

/** What a push service answered. The status is the whole answer, because a push has no response body worth reading. */
export type PushSend = (endpoint: string, headers: Record<string, string>, body?: Uint8Array) => Promise<{ status: number }>;

const EC = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const ES256 = { name: 'ECDSA', hash: 'SHA-256' } as const;

/**
 * How long a token is good for. RFC 8292 §2 lets a push service refuse an `exp` more than 24 hours out, and every
 * large one does. Twelve hours is the figure the common libraries use, and it leaves room for a clock that runs fast.
 */
const LIFETIME_S = 12 * 3600;

/**
 * How long the push service holds a message for a phone that is off. A day: long enough that a phone switched off
 * overnight hears it in the morning, and short enough that a week-old "something needs you" does not arrive after the
 * email that said the same thing was read. The message has no content, so a stale one costs a tap and nothing else.
 */
const TTL_S = 24 * 3600;

function unb64url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '='));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Bytes from base64url, or `null` for anything `atob` refuses. A malformed key is a sentence, not a throw. */
function bytes(text: string): Uint8Array | null {
  try {
    return unb64url(text.trim());
  } catch {
    return null;
  }
}

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

/**
 * The pair, read and proved to be a pair, or the sentence that says which half is wrong.
 *
 * TWO KEYS FROM TWO RUNS OF A GENERATOR is the likeliest mistake, and unchecked it is invisible: every push service
 * answers 403 to every push, and the dead letter names a status code rather than the two settings that disagree. The
 * private key is imported as a JWK carrying `x` and `y` taken from the public key, and Node 24's WebCrypto refuses
 * that import when `d` does not belong to them (measured in `test/vapid.test.ts`, which first expected the import to
 * pass and was answered by the catch below). Whether workerd checks the same is not measured here, so the pair is
 * also proved by a signature made with one half and verified with the other, once, when the keys are read.
 */
export async function vapidKeys(publicKey: string, privateKey: string): Promise<Vapid | string> {
  const point = bytes(publicKey);
  if (!point || point.length !== 65 || point[0] !== 4)
    return 'VAPID_PUBLIC is not a P-256 public key: it should be the 65-byte uncompressed point in base64url, as the key generator printed it.';
  const d = bytes(privateKey);
  if (!d || d.length !== 32)
    return 'VAPID_PRIVATE is not a P-256 private key: it should be the 32-byte private scalar in base64url, as the key generator printed it.';

  const apart =
    'VAPID_PUBLIC and VAPID_PRIVATE are not one pair, so every push service would refuse every push. Set both halves from the same run of the key generator.';
  let pub: Key;
  try {
    pub = await crypto.subtle.importKey('raw', point, EC, false, ['verify']);
  } catch {
    return 'VAPID_PUBLIC is not a point on P-256, so no push can be signed. Generate the pair again and set both halves from the same run.';
  }
  let key: Key;
  try {
    const jwk = { kty: 'EC', crv: 'P-256', x: b64url(point.slice(1, 33)), y: b64url(point.slice(33, 65)), d: b64url(d), ext: false };
    key = await crypto.subtle.importKey('jwk', jwk, EC, false, ['sign']);
  } catch {
    return apart;
  }
  const probe = utf8('vapid pair check');
  const ok = await crypto.subtle.verify(ES256, pub, await crypto.subtle.sign(ES256, key, probe), probe);
  if (!ok) return apart;
  /* THE HEADER CARRIES THE BYTES RE-SPELLED, NOT THE VAR AS PASTED. A trailing `=` passed every check above and went
     into `k=` as typed, where RFC 8292 §3.2 has unpadded base64url (`test/vapid.test.ts` saw it). */
  return { publicKey: b64url(point), key };
}

/**
 * The signed token for one endpoint: `aud` is that endpoint's origin, `exp` is twelve hours on, `sub` is who to write to.
 *
 * `aud` IS THE ORIGIN ALONE. A token minted for `https://fcm.googleapis.com/fcm/send/...` with the path in it is
 * refused, and so is one with a trailing slash, because the service compares strings. `new URL().origin` has neither.
 *
 * AND `sub` IS REQUIRED IN PRACTICE, though RFC 8292 says only SHOULD: Apple's service refuses a token without one.
 * It is a `mailto:` or an `https:` address, the contact a push service writes to before it blocks a sender.
 */
export async function vapidJwt(vapid: Vapid, endpoint: string, subject: string, now = Date.now()): Promise<string> {
  if (!/^(?:mailto:\S+@\S+|https:\/\/\S+)$/.test(subject))
    throw new Error('a push is signed with a contact address, mailto: or https:, and this deployment names none');
  const head = b64url(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64url(utf8(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + LIFETIME_S, sub: subject })));
  /* ES256 IN A JWT IS r||s, 64 bytes, and WebCrypto's ECDSA hands back exactly that. Node's `crypto.sign` hands back
     DER unless told otherwise, which is the usual way a hand-rolled VAPID signer ends up answered 403 everywhere. */
  const sig = new Uint8Array(await crypto.subtle.sign(ES256, vapid.key, utf8(`${head}.${body}`)));
  return `${head}.${body}.${b64url(sig)}`;
}

/**
 * The headers a content-free push goes with: `Authorization` in RFC 8292 §3's `vapid t=, k=` form, and `TTL`.
 *
 * NO `Content-Type` AND NO `Content-Encoding`, because there is no body for either to describe. A push service reads a
 * body with no `Content-Encoding: aes128gcm` as a malformed encrypted payload, and the way to send nothing is to send
 * nothing: `fetch` gives a POST with no body a `Content-Length: 0` of its own.
 */
export async function pushHeaders(vapid: Vapid, endpoint: string, subject: string, now = Date.now()): Promise<Record<string, string>> {
  return { Authorization: `vapid t=${await vapidJwt(vapid, endpoint, subject, now)}, k=${vapid.publicKey}`, TTL: String(TTL_S) };
}

/**
 * WHERE A TAP OPENS, AND NOTHING ELSE, ENCRYPTED TO THE PHONE (E44 of 24 October; RFC 8291 over RFC 8188's aes128gcm).
 * The one thing a push now carries is `{ open }`, a path in the app such as `/kiln/decide/sg_01J...`: a handle and
 * never a word, so the push service that relays it learns nothing, and the service worker opens it on a tap.
 *
 * ONE RECORD, AS RFC 8291 §4 SAYS: a fresh P-256 pair for each message, the shared secret with the phone's `p256dh`,
 * mixed with its 16-byte `auth` secret into the key, a random salt, one AES-128-GCM record ended by the 0x02 delimiter,
 * and the header salt, record size, and the sender's public key. WebCrypto alone, in workerd and in Node alike.
 */
export async function encryptPush(keys: { p256dh: string; auth: string }, plain: Uint8Array): Promise<Uint8Array> {
  const ua = bytes(keys.p256dh);
  const secret = bytes(keys.auth);
  if (!ua || ua.length !== 65 || ua[0] !== 4 || !secret || secret.length !== 16) throw new Error("a push opens nothing without the phone's two keys, and these are not them");
  const hmac = async (key: Uint8Array, data: Uint8Array): Promise<Uint8Array> => {
    const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
  };
  const join = (...parts: Uint8Array[]): Uint8Array => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) out.set(p, (at += p.length) - p.length);
    return out;
  };
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as { publicKey: Key; privateKey: Key };
  const as = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);
  const phone = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: phone } as never, pair.privateKey, 256));
  /* RFC 8291 §3.4: IKM from the auth secret and the two public keys, then RFC 8188 §2.2's key and nonce from the salt. */
  const ikm = await hmac(await hmac(secret, shared), join(utf8('WebPush: info\0'), ua, as, Uint8Array.of(1)));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, utf8('Content-Encoding: aes128gcm\0\x01'))).slice(0, 16);
  const nonce = (await hmac(prk, utf8('Content-Encoding: nonce\0\x01'))).slice(0, 12);
  const aes = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, join(plain, Uint8Array.of(2))));
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return join(salt, rs, Uint8Array.of(as.length), as, sealed);
}

/** The headers an encrypted push adds to `pushHeaders`': its encoding, and the type of a body nobody but the phone reads. */
export const PUSH_BODY_HEADERS = { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream' } as const;

/** `/api/push/key`: the key a browser subscribes with. Asked of a path already moved to the root, as every method is. */
export const servesPushKey = (pathname: string): boolean => /^\/+api\/+push\/+key\/*$/.test(pathname);

/**
 * The public key the app subscribes with, or `null` where no push would be sent.
 *
 * `null` UNLESS BOTH HALVES ARE SET AND ARE ONE PAIR. Both, for the rule `delivers` has: a toggle drawn on a deployment
 * that leases no push turns on and never rings. One pair, because a phone subscribed with a public key whose private
 * half is from another run is a phone every push service refuses, and it was refused only after the browser had asked
 * the person and been told yes. The key goes out as `vapidKeys` re-spelled it, unpadded base64url.
 */
export async function pushKeyOf(env: { VAPID_PUBLIC?: string | undefined; VAPID_PRIVATE?: string | undefined }): Promise<string | null> {
  const pub = (env.VAPID_PUBLIC ?? '').trim();
  const priv = (env.VAPID_PRIVATE ?? '').trim();
  if (pub === '' || priv === '') return null;
  const vapid = await vapidKeys(pub, priv);
  return typeof vapid === 'string' ? null : vapid.publicKey;
}

/**
 * `fetch`, as a push needs it: POST, no body, no redirect followed, and a timeout inside the notify lease.
 *
 * The same two rules as the webhook post in `index.ts`, for the same two reasons. A redirect is an endpoint nobody
 * subscribed, so a 3xx is answered as itself and fails; and a request that never returns outlives its sixty-second
 * lease, so it is cut at twenty.
 */
export const fetchPush: PushSend = async (endpoint, headers, body) => {
  const out = await fetch(endpoint, { method: 'POST', headers, ...(body ? { body } : {}), redirect: 'manual', signal: AbortSignal.timeout(20_000) });
  return { status: out.status };
};
