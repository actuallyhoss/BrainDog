/**
 * Stripe's webhook signature, checked over WebCrypto and nothing else.
 *
 * THE ONE STRIPE SIGNATURE CHECK IN THE REPOSITORY. The Worker's billing webhook
 * calls it (`apps/worker/src/billing.ts`), and an ingest that declares `verify: { kind: 'stripe' }` calls it on both
 * hosts. It lives in a package and not in the Worker because a package cannot import an app, and two copies of a
 * signature check are two chances for one of them to be wrong.
 *
 * PURE, AND IT HAS TO BE. No `node:` module, no `fetch`, no clock of its own: the caller hands in the time, so a test
 * holds it still and the Worker and the self-host read the same answer from the same bytes.
 *
 * WHAT STRIPE SENDS (its documentation, "Verify webhook signatures manually"): a `Stripe-Signature` header of
 * comma-separated `key=value` pairs, one `t=` holding the Unix time the event was signed at and one or more `v1=`, each
 * the hex HMAC-SHA256 of `${t}.${raw}` under the endpoint's signing secret. There is more than one `v1` while a secret
 * is being rolled, and the event is genuine when ANY of them matches. `v0` is Stripe's test scheme and is never
 * accepted; any other key is ignored.
 */

/** A WebCrypto key, named without the DOM library, as `apps/worker/src/vapid.ts` names it. */
type Key = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

/** How far from the caller's clock a signature's `t` may be, in seconds: Stripe's own libraries use five minutes. */
export const STRIPE_TOLERANCE_S = 300;

/**
 * The most `v1=` values one header is checked for.
 *
 * A CEILING ON THE WORK A STRANGER CAN ASK FOR. The door is public, and every value is
 * one comparison; Stripe sends two at most, while a secret is rolled, so eight is room to spare and a header of ten
 * thousand is refused rather than walked.
 */
const MOST_SIGNATURES = 8;

/** A `v1=` value as Stripe writes it: 32 bytes of HMAC in lower-case hex. */
const SIGNATURE = /^[0-9a-f]{64}$/u;

const utf8 = (text: string): Uint8Array<ArrayBuffer> => Uint8Array.from(new TextEncoder().encode(text));

const hex = (buffer: ArrayBuffer): string => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Two signatures of the same length compared without saying WHERE they differ: every character is read, and the
 * differences are gathered into one number, so the time it takes is the same for a near miss and a wild guess.
 */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let differ = 0;
  for (let i = 0; i < a.length; i++) differ |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return differ === 0;
}

/**
 * Whether `raw` is a body Stripe signed with `secret`, at a time within `tolerance` seconds of `nowSeconds`.
 *
 * `raw` IS THE BODY EXACTLY AS IT ARRIVED, decoded as text and never parsed: a body that was read as JSON and written
 * out again is a different string, and its signature would be checked against bytes Stripe never sent.
 *
 * `false` FOR EVERY WAY IT CAN BE WRONG, and never a throw: no header, no `t`, a `t` that is not a whole number of
 * seconds, a signing time outside the tolerance on either side, no `v1`, an empty secret, or no `v1` that matches.
 * EVERY `v1` IS COMPARED, a match or not, so how long the check takes does not say which of them was right.
 */
export async function verifyStripe(raw: string, header: string, secret: string, nowSeconds: number, tolerance = STRIPE_TOLERANCE_S): Promise<boolean> {
  if (typeof raw !== 'string' || typeof header !== 'string' || typeof secret !== 'string' || secret === '') return false;
  if (!Number.isFinite(nowSeconds) || !Number.isFinite(tolerance) || tolerance < 0) return false;

  let t: string | null = null;
  const said: string[] = [];
  for (const part of header.split(',')) {
    const at = part.indexOf('=');
    if (at <= 0) continue;
    const key = part.slice(0, at).trim();
    const value = part.slice(at + 1).trim();
    if (key === 't' && t === null) t = value;
    else if (key === 'v1') said.push(value.toLowerCase());
  }
  if (t === null || !/^\d{1,12}$/u.test(t)) return false;
  if (Math.abs(nowSeconds - Number(t)) > tolerance) return false;
  const candidates = said.filter((v) => SIGNATURE.test(v));
  if (candidates.length === 0 || said.length > MOST_SIGNATURES) return false;

  const key: Key = await crypto.subtle.importKey('raw', utf8(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const want = hex(await crypto.subtle.sign('HMAC', key, utf8(`${t}.${raw}`)));
  let matched = false;
  for (const candidate of candidates) matched = same(candidate, want) || matched;
  return matched;
}
