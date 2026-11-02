/**
 * APNs for the iPhone app (apps plan 3.7, M4, 3 Nov), over WebCrypto and `fetch`, beside Web Push in the deliverer.
 *
 * ONE TABLE, TWO TRANSPORTS. The app registers the token Apple gave it through the same `subscribePush` the browser uses,
 * as `apns://<production|sandbox>/<bundle>/<hex token>` (`APNS_ENDPOINT`, `packages/record/src/push.ts`), so the row is
 * in `push_sub` and every rule that decides who a push rings holds for it unchanged: the owners for a notice, the person
 * named for a mention or a hand-over, `push.off` for a kind they turned off, quiet hours, one an hour. The deliverer
 * reads the scheme of the address the record hands it under the lease and sends through Apple or through the browser's
 * push service. What rings an iPhone is therefore exactly what rings a browser: questions waiting on him (`needs`),
 * alarms (the record's time-sensitive notices, a payment failed, a bill due: `needs`, `money`), mentions and hand-overs
 * (`people`), an agent asking or finishing (`agents`), the summaries (`summary`).
 *
 * NO CONTENT THROUGH APPLE (`09 §3`). The alert is one fixed line chosen by the kind (`lineOf`, the same sentences as the
 * web's `lib/phone/kinds.ts`), plus the path a tap opens and the kind word. The app's Notification Service Extension
 * reads the question itself over TLS with the person's own session and rewrites the line on the phone; Apple sees only
 * the fixed sentence. `mutable-content` asks for that; `category` lets the phone offer Accept and Later.
 *
 * THE KEY IS HIS. Three Worker secrets, none set by an agent:
 *   wrangler secret put APNS_KEY_ID  --env <environment>   the ten-character key id Apple shows beside the key
 *   wrangler secret put APNS_TEAM_ID --env <environment>   MG86668Z52 (the team, Quartz Apps LLC)
 *   wrangler secret put APNS_KEY     --env <environment>   the whole AuthKey_<id>.p8 file, PEM lines and all
 * All three, or no push goes to a phone; a browser's push is unaffected either way.
 *
 * HTTP/2 IS THE PLATFORM'S TO NEGOTIATE. Workers' `fetch` reaches an origin by ALPN and Apple answers only HTTP/2, so
 * nothing here picks a protocol; a local `wrangler dev` that speaks HTTP/1.1 to origins cannot reach Apple, and the first
 * real push is made on a deployed Worker (roomy's sender, which this follows, went the same way).
 */

import { b64url } from '@braindog/kernel';

type Key = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

/** What `subscribePush` keeps for a phone. Mirrors `APNS_ENDPOINT` in the record, which is what wrote it. */
const APNS_ENDPOINT = /^apns:\/\/(production|sandbox)\/([A-Za-z0-9.-]{1,155})\/([0-9a-f]{64,200})$/u;

/** A device token's address, read, or `null` for an address that is not one. */
export function apnsAddress(endpoint: string): { host: string; topic: string; token: string } | null {
  const m = APNS_ENDPOINT.exec(endpoint);
  if (!m) return null;
  const host = m[1] === 'sandbox' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
  return { host, topic: m[2]!, token: m[3]! };
}

export const isApns = (endpoint: string): boolean => endpoint.startsWith('apns://');

/** The deployment's APNs key, read and checked once a pass. */
export type Apns = { keyId: string; teamId: string; key: Key };

/** Whether all three secrets are there: the switch `delivers` reads on every pass, which costs nothing. */
export const apnsKeyed = (env: { APNS_KEY_ID?: string | undefined; APNS_TEAM_ID?: string | undefined; APNS_KEY?: string | undefined }): boolean =>
  (env.APNS_KEY_ID ?? '').trim() !== '' && (env.APNS_TEAM_ID ?? '').trim() !== '' && (env.APNS_KEY ?? '').trim() !== '';

/** The PEM's body as DER bytes, whether the secret holds the whole .p8 file or only its base64 lines. */
function pkcs8(pem: string): Uint8Array | null {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  if (body === '') return null;
  try {
    return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/**
 * The key from the three secrets, or the sentence that names what is wrong with them. A sentence and not a throw, so a
 * key pasted badly dead-letters each phone's push with words that say how to fix it, as `vapidKeys` does for Web Push.
 */
export async function apnsKeys(env: { APNS_KEY_ID?: string | undefined; APNS_TEAM_ID?: string | undefined; APNS_KEY?: string | undefined }): Promise<Apns | string> {
  const keyId = (env.APNS_KEY_ID ?? '').trim();
  const teamId = (env.APNS_TEAM_ID ?? '').trim();
  if (!/^[A-Z0-9]{10}$/u.test(keyId)) return 'APNS_KEY_ID is the ten-character id Apple shows beside the key.';
  if (!/^[A-Z0-9]{10}$/u.test(teamId)) return 'APNS_TEAM_ID is the ten-character team id, MG86668Z52.';
  const der = pkcs8(env.APNS_KEY ?? '');
  if (der === null) return 'APNS_KEY is the whole AuthKey .p8 file Apple gave, and this one does not read as one.';
  try {
    const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    return { keyId, teamId, key };
  } catch {
    return 'APNS_KEY did not open as an Apple push key (a P-256 .p8). Put the AuthKey file again.';
  }
}

/**
 * The provider token, ES256 over `{ iss: team, iat }`, kept for 50 minutes in the isolate. Apple refuses one older than
 * an hour (`ExpiredProviderToken`) and one made more often than every twenty minutes (`TooManyProviderTokenUpdates`).
 */
let kept: { token: string; keyId: string; at: number } | null = null;

export async function providerToken(apns: Apns, nowMs = Date.now()): Promise<string> {
  if (kept && kept.keyId === apns.keyId && nowMs - kept.at < 50 * 60_000) return kept.token;
  const enc = new TextEncoder();
  const head = b64url(enc.encode(JSON.stringify({ alg: 'ES256', kid: apns.keyId })));
  const claims = b64url(enc.encode(JSON.stringify({ iss: apns.teamId, iat: Math.floor(nowMs / 1000) })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, apns.key, enc.encode(`${head}.${claims}`)));
  const token = `${head}.${claims}.${b64url(sig)}`;
  kept = { token, keyId: apns.keyId, at: nowMs };
  return token;
}

/** Forget the isolate's token, after Apple called it expired or invalid, so the next push signs a new one. */
export const forgetProviderToken = (): void => {
  kept = null;
};

/**
 * The line a push says, from its kind and where it opens: the web's own sentences (`apps/web/src/lib/phone/kinds.ts`
 * `pushLine`), kept word for word so the lock screen says the same on an iPhone app as in the browser.
 */
export function lineOf(kind: string | undefined, path: string | null): string {
  const at = path ?? '';
  if (kind === 'summary' || at.includes('/agents/summary/')) return 'Your BrainDog summary is ready';
  if (kind === 'agents') return at.includes('/decide') ? 'An agent needs your answer' : 'An agent finished what you gave it';
  if (kind === 'money') return 'Something in your money is coming due';
  if (kind === 'people') {
    if (/^\/decide\/[^/]+\/thread$/u.test(at) || /^\/r\/[^/]+\/[^/]+$/u.test(at)) return 'Someone mentioned you in a comment';
    if (at.startsWith('/decide/')) return 'Someone handed you something';
    return 'Someone you invited joined';
  }
  return 'Something in your BrainDog needs you';
}

/**
 * The phone's category, which decides the buttons under the notification (the app registers them, `Push.swift`):
 * `question` for something that opens one question (Later, and Accept where the app finds the web's one press allows
 * it), `open` for everything else (a tap opens it). Never decided here from what the question says, which Apple never
 * sees: the app's service extension reads the question and keeps or narrows the buttons.
 */
export const categoryOf = (path: string | null): string => (path !== null && /^\/decide\/[A-Za-z0-9_-]+$/u.test(path) ? 'question' : 'open');

/** The JSON Apple carries: the fixed line, the category, the BrainDog as the thread, and where a tap opens. */
export function apnsPayload(args: { open: string | null; kind: string | undefined; record: string | null }): Record<string, unknown> {
  return {
    aps: {
      alert: { title: 'BrainDog', body: lineOf(args.kind, args.open) },
      sound: 'default',
      category: categoryOf(args.open),
      'mutable-content': 1,
      ...(args.record ? { 'thread-id': args.record } : {}),
      ...(args.kind === 'summary' ? { 'interruption-level': 'passive' } : {}),
    },
    ...(args.open ? { open: args.open } : {}),
    ...(args.kind ? { kind: args.kind } : {}),
    ...(args.record ? { record: args.record } : {}),
  };
}

/** What Apple answered: the status, and the `reason` its JSON names for a refusal. */
export type ApnsSend = (url: string, headers: Record<string, string>, body: string) => Promise<{ status: number; reason?: string }>;

/** One POST to Apple, cut at twenty seconds like a Web Push (a request that never returns outlives its lease). */
export const fetchApns: ApnsSend = async (url, headers, body) => {
  const out = await fetch(url, { method: 'POST', headers, body, redirect: 'manual', signal: AbortSignal.timeout(20_000) });
  let reason: string | undefined;
  if (out.status !== 200) {
    try {
      reason = ((await out.json()) as { reason?: string }).reason;
    } catch {
      reason = undefined;
    }
  }
  return { status: out.status, ...(reason ? { reason } : {}) };
};

/**
 * Send one push to one phone. `gone` when Apple says the token is dead (410 Unregistered, 400 BadDeviceToken or
 * DeviceTokenNotForTopic), so the record drops the row as it does for a browser's 404 or 410; a throw for anything else,
 * which walks the retry ladder. An expired or invalid provider token is forgotten first, so the retry signs a new one.
 */
export async function sendApns(
  apns: Apns,
  send: ApnsSend,
  endpoint: string,
  payload: Record<string, unknown>,
  nowMs = Date.now(),
): Promise<'sent' | 'gone'> {
  const at = apnsAddress(endpoint);
  if (!at) throw new Error('an apns push goes to a device token the app registered, and this address is not one');
  const headers: Record<string, string> = {
    authorization: `bearer ${await providerToken(apns, nowMs)}`,
    'apns-topic': at.topic,
    'apns-push-type': 'alert',
    'apns-priority': '10',
    /* A day, as a Web Push's TTL: a phone off overnight hears it in the morning, and a week-old one never arrives. */
    'apns-expiration': String(Math.floor(nowMs / 1000) + 24 * 3600),
    'content-type': 'application/json',
  };
  const out = await send(`${at.host}/3/device/${at.token}`, headers, JSON.stringify(payload));
  if (out.status === 200) return 'sent';
  if (out.status === 410) return 'gone';
  if (out.status === 400 && (out.reason === 'BadDeviceToken' || out.reason === 'DeviceTokenNotForTopic')) return 'gone';
  if (out.status === 403 && (out.reason === 'ExpiredProviderToken' || out.reason === 'InvalidProviderToken')) forgetProviderToken();
  throw new Error(`Apple answered ${out.status}${out.reason ? ` ${out.reason}` : ''}`);
}
