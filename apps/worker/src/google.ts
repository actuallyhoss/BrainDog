/**
 * Sign in with Google: `/auth/google/start` and `/auth/google/callback`.
 *
 * GOOGLE PROVES THE ADDRESS AND THE DIRECTORY DOES THE REST. A mailed link signs somebody in because only the
 * mailbox's owner can read it; Google saying "this browser is signed in as that address" is the same proof, made
 * without a letter. So the callback asks the Directory for a sign-in link for the address (`magic.start`), which it
 * hands to the host to mail, and spends it on the spot (`magic.redeem`) rather than mailing it. No new flow, no new
 * table, and every rule a link already keeps is kept: an address nobody has gets no link, a suspended person gets
 * none, and the lockouts count this door as they count the letter.
 *
 * ONLY AN ADDRESS GOOGLE ANSWERS FOR. `email_verified` alone says the address was checked once, and for an address
 * on somebody else's domain that may have been years ago and for another person. So it is taken only for
 * `@gmail.com`, or with an `hd` claim, which is a Workspace domain Google runs the mail for. Anybody else is sent
 * back to the other ways in.
 *
 * THE ID TOKEN'S SIGNATURE IS NOT CHECKED, AND NEED NOT BE. It arrives in the answer to a request this Worker made
 * to Google's token endpoint over TLS, carrying the client secret, and never through the browser; Google's own
 * guidance for that case is that the channel is the proof. Its audience, issuer, expiry and nonce are checked.
 *
 * THE STATE IS A COOKIE AND NOT A ROW. The start writes one short-lived `__Host-` cookie holding the state, the PKCE
 * verifier, the nonce and where to go afterwards, and the callback reads it, clears it and compares. `SameSite=Lax`,
 * because the callback is a top-level navigation from Google and a `Strict` cookie would not come with it.
 *
 * AND IT NEVER MAKES ANYBODY, WHATEVER `SIGNUP` SAYS (`launch.ts`). `magic.start` mints nothing for an address nobody
 * has, so a first sign-in with Google is sent back with `unknown` and the person signs up through `/signup`, where
 * the switch, the code in `invite` and the strikes all apply. A Google door that made people would need a sign-up code
 * riding in `state`, and would be a second front door to keep in step with the first; there is none.
 *
 * A GET THAT SIGNS SOMEBODY IN, WHICH NO OTHER ROUTE HERE IS. A redirect back from Google can be nothing else. What
 * stands in for the origin check a POST has is the state: a callback is answered only for the browser that holds the
 * cookie the start wrote, with a code Google issued against the verifier inside it.
 */

import { appNext, clearCookie, readSid, sameKey, sameOrigin, sessionCookie, type CookieMode } from '@braindog/host/auth';
import type { AuthCall, AuthResult } from '@braindog/ports';

/** The two routes and the one method each answers, as `AUTH_ROUTES` declares them. */
export const GOOGLE_ROUTES = { '/auth/google/start': 'GET', '/auth/google/callback': 'GET', '/auth/google/desktop': 'POST' } as const;

/* THE MAC APP'S WAY BACK (docs/55-DESKTOP-APP.md). `?desktop=1&challenge=` on the start marks the flow, and so does
   `?app=mac&challenge=`, the spelling the native Mac app asks with; the callback then
   leaves the sign-in link UNSPENT and sends `braindog://auth?code=` to the app, and the app's window posts the code and its
   PKCE verifier to `/auth/google/desktop`, or to `/auth/app` for an app session, which spends the link and sets the
   cookie there. The code is the link token
   sealed with the challenge and an expiry, so it needs no table: single use is the link's own, two minutes is the expiry,
   and a code swapped onto another challenge fails its seal. No session token is ever in a URL. */
const CODE_LIFE_MS = 120_000;
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

const AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const ISSUERS: readonly string[] = ['https://accounts.google.com', 'accounts.google.com'];

/** How long somebody has to finish at Google before the start is forgotten. */
const STATE_LIFE_S = 600;
const STATE_COOKIE = { secure: '__Host-bd_g', local: 'bd_g' } as const;

/** Why a sign-in through Google ended on the sign-in page, as `?google=` says it. */
export type GoogleWhy = 'cancelled' | 'unknown' | 'unverified' | 'locked' | 'failed';

export type GoogleDoor = {
  /** The one origin this host serves pages from, without a trailing slash. */
  origin: string;
  mode: CookieMode;
  clientId: string;
  clientSecret: string;
  ip: string;
  ask: (call: AuthCall) => Promise<AuthResult>;
  /** `SESSION_SECRET`, which seals a desktop code. Absent, and the desktop flavour is refused. */
  secret?: string;
  fetch?: typeof fetch;
  now?: () => number;
};

/** Whether this deployment has both halves of a Google client. Either missing, and neither route is served. */
export const googleOn = (env: { GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string }): boolean =>
  (env.GOOGLE_CLIENT_ID ?? '').trim() !== '' && (env.GOOGLE_CLIENT_SECRET ?? '').trim() !== '';

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');

const fresh = (): string => b64url(crypto.getRandomValues(new Uint8Array(32)));

const textOf = (b64: string): string | null => {
  try {
    const bin = atob(b64.replaceAll('-', '+').replaceAll('_', '/'));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
};

/** Where the app is, and so the only place a sign-in may land. */
const landing = (next: unknown): string => appNext(next) ?? '/';

async function seal(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`desktop-code|${text}`))));
}

/** The key a code's link token is sealed under, drawn from the session secret for this one use. */
async function boxKey(secret: string): Promise<Awaited<ReturnType<typeof crypto.subtle.deriveKey>>> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode('braindog/desktop-code') },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

const bytesOf = (b64: string): Uint8Array | null => {
  try {
    return Uint8Array.from(atob(b64.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
};

/* THE LINK TOKEN TRAVELS SEALED, NOT IN CLEAR. It is a sign-in on its own at /auth/magic/redeem, so a code that
   carried it readable would let anyone who saw the redirect sign in without the app's verifier. Sealed, it opens
   only here, after the verifier has matched the challenge it was bound to. */
async function box(secret: string, linkToken: string, aad: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(aad) }, await boxKey(secret), new TextEncoder().encode(linkToken)),
  );
  const out = new Uint8Array(iv.length + sealed.length);
  out.set(iv);
  out.set(sealed, iv.length);
  return b64url(out);
}

async function unbox(secret: string, boxed: string, aad: string): Promise<string | null> {
  const bytes = bytesOf(boxed);
  if (bytes === null || bytes.length < 12 + 16) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: new TextEncoder().encode(aad) },
      await boxKey(secret),
      bytes.slice(12),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

/** A one-time code for the app: the sealed link token, the challenge it is bound to, when it dies, and the seal over those. */
export async function desktopCode(secret: string, linkToken: string, challenge: string, now: number): Promise<string> {
  const exp = String(now + CODE_LIFE_MS);
  const sealed = await box(secret, linkToken, `${challenge}.${exp}`);
  return `${sealed}.${challenge}.${exp}.${await seal(secret, `${sealed}.${challenge}.${exp}`)}`;
}

/** The link token inside a code, or null for one that is forged, expired or whose verifier is not the one that asked. */
export async function openDesktopCode(secret: string, code: string, verifier: string, now: number): Promise<string | null> {
  const [sealed, challenge, exp, mac, ...extra] = code.split('.');
  if (!sealed || !challenge || !exp || !mac || extra.length > 0 || !CHALLENGE.test(challenge) || !/^\d{1,15}$/.test(exp)) return null;
  if (Number(exp) <= now || Number(exp) - now > CODE_LIFE_MS) return null;
  if (!(await sameKey(mac, await seal(secret, `${sealed}.${challenge}.${exp}`)))) return null;
  const mine = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  if (!(await sameKey(mine, challenge))) return null;
  return unbox(secret, sealed, `${challenge}.${exp}`);
}

const stateCookie = (value: string, mode: CookieMode, age: number): string =>
  `${STATE_COOKIE[mode]}=${value}; Path=/; Max-Age=${age}; HttpOnly; ${mode === 'secure' ? 'Secure; ' : ''}SameSite=Lax`;

function readState(request: Request, mode: CookieMode): { state: string; verifier: string; nonce: string; next: string; challenge: string } | null {
  const name = STATE_COOKIE[mode];
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at < 0 || part.slice(0, at).trim() !== name) continue;
    const [state, verifier, nonce, next, challenge] = part.slice(at + 1).trim().split('.');
    if (!state || !verifier || !nonce) return null;
    return { state, verifier, nonce, next: textOf(next ?? '') ?? '', challenge: challenge ?? '' };
  }
  return null;
}

/** A redirect that no cache keeps and that tells the next page nothing about this one. */
function go(to: string, cookies: readonly string[]): Response {
  const headers = new Headers({ location: to, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
  for (const c of cookies) headers.append('set-cookie', c);
  return new Response(null, { status: 302, headers });
}

/** The claims this door reads from an ID token, or `null` for one that is not a token. */
function claimsOf(idToken: unknown): Record<string, unknown> | null {
  if (typeof idToken !== 'string') return null;
  const text = textOf(idToken.split('.')[1] ?? '');
  if (text === null) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The address Google answers for, or why there is none. */
function addressOf(claims: Record<string, unknown>, door: GoogleDoor, nonce: string, now: number): string | GoogleWhy {
  if (claims['aud'] !== door.clientId || typeof claims['iss'] !== 'string' || !ISSUERS.includes(claims['iss'])) return 'failed';
  if (typeof claims['exp'] !== 'number' || claims['exp'] * 1000 <= now || claims['nonce'] !== nonce) return 'failed';
  const email = typeof claims['email'] === 'string' ? claims['email'].trim() : '';
  if (email === '' || claims['email_verified'] !== true) return 'unverified';
  const hosted = typeof claims['hd'] === 'string' && claims['hd'] !== '';
  return hosted || email.toLowerCase().endsWith('@gmail.com') ? email : 'unverified';
}

export async function serveGoogle(request: Request, path: keyof typeof GOOGLE_ROUTES, door: GoogleDoor): Promise<Response> {
  const want = GOOGLE_ROUTES[path];
  if (request.method !== want) return new Response(null, { status: 405, headers: { allow: want, 'cache-control': 'no-store' } });
  const url = new URL(request.url);
  const redirect = `${door.origin}/auth/google/callback`;
  const now = (door.now ?? Date.now)();

  if (path === '/auth/google/desktop') return exchange(request, door, now);

  if (path === '/auth/google/start') {
    const state = fresh();
    const verifier = fresh();
    const nonce = fresh();
    const next = landing(url.searchParams.get('next'));
    /* The desktop flavour needs the app's challenge and a secret to seal with; without both it fails here, not at the end. */
    const desktop = url.searchParams.get('desktop') === '1' || url.searchParams.get('app') === 'mac';
    const asked = url.searchParams.get('challenge') ?? '';
    if (desktop && (!CHALLENGE.test(asked) || (door.secret ?? '').length < 32)) return go(`${door.origin}/signin?google=failed`, []);
    const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    const to = new URL(AUTHORIZE);
    to.search = new URLSearchParams({
      client_id: door.clientId,
      redirect_uri: redirect,
      response_type: 'code',
      scope: 'openid email',
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    }).toString();
    const kept = `${state}.${verifier}.${nonce}.${b64url(new TextEncoder().encode(next))}${desktop ? `.${asked}` : ''}`;
    return go(to.toString(), [stateCookie(kept, door.mode, STATE_LIFE_S)]);
  }

  /* THE STATE COOKIE GOES WHATEVER HAPPENS, so a callback is answered once for one start. */
  const forget = stateCookie('', door.mode, 0);
  const held = readState(request, door.mode);
  const next = landing(held?.next);
  const back = (why: GoogleWhy): Response => {
    const q = new URLSearchParams({ google: why, ...(next === '/' ? {} : { next }) });
    return go(`${door.origin}/signin?${q}`, [forget]);
  };

  if (url.searchParams.has('error')) return back('cancelled');
  const code = url.searchParams.get('code') ?? '';
  const state = url.searchParams.get('state') ?? '';
  if (held === null || code === '' || code.length > 2048 || !(await sameKey(state, held.state))) return back('failed');

  let claims: Record<string, unknown> | null = null;
  try {
    const answer = await (door.fetch ?? fetch)(TOKEN, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: door.clientId,
        client_secret: door.clientSecret,
        redirect_uri: redirect,
        grant_type: 'authorization_code',
        code_verifier: held.verifier,
      }),
    });
    if (answer.ok) claims = claimsOf(((await answer.json()) as { id_token?: unknown }).id_token);
  } catch {
    claims = null;
  }
  if (claims === null) return back('failed');

  const email = addressOf(claims, door, held.nonce, now);
  if (!email.includes('@')) return back(email as GoogleWhy);

  const minted = await door.ask({ flow: 'magic.start', email, ip: door.ip });
  if (minted.status === 429) return back('locked');
  if (minted.status !== 200) return back('failed');
  /* NO LINK IS AN ADDRESS NOBODY HAS, or one whose mailbox is locked out. Saying so tells the asker nothing they could
     not already know: Google has just shown the address is theirs. */
  const mail = minted.mail;
  if (!mail || !('linkToken' in mail)) return back('unknown');

  /* THE APP'S SIGN-IN: hand the unspent link over as a sealed code, and set no cookie in this browser. */
  if (held.challenge !== '') {
    if ((door.secret ?? '').length < 32) return back('failed');
    return go(`braindog://auth?code=${await desktopCode(door.secret as string, mail.linkToken, held.challenge, now)}`, [forget]);
  }

  const sid = readSid(request, door.mode);
  const out = await door.ask({ flow: 'magic.redeem', linkToken: mail.linkToken, ip: door.ip, ...(sid === undefined ? {} : { sid }) });
  if (out.status === 429) return back('locked');
  if (out.status !== 200 || out.session === undefined) return back('failed');
  const cookie = out.session === 'clear' ? clearCookie(door.mode) : sessionCookie(out.session.sid, door.mode);
  return go(`${door.origin}${next}`, [forget, cookie]);
}

/** What swapping a code needs: the host's origin and cookie, the Directory, the caller's address and the seal's secret. */
export type SwapDoor = Pick<GoogleDoor, 'origin' | 'mode' | 'ip' | 'ask' | 'secret'>;

/**
 * The app's window swaps its code for the session cookie: a same-site POST carrying the code and the PKCE verifier. The
 * code may come from Google's callback or from an emailed link handed back by its page (`desktop-signin.ts`); both are
 * the same sealed link, so both are spent here.
 *
 * `app` IS `/auth/app`: the session opened is an app session under the body's `label` (the Directory keeps it to one
 * line of 64 characters, and "BrainDog app" when there is none), and a success answers the envelope `{ ok, value }`.
 * Without it this is `/auth/desktop` and `/auth/google/desktop` exactly as they were: a browser's session, `{ ok }`.
 */
export async function exchange(request: Request, door: SwapDoor, now: number, app = false): Promise<Response> {
  const reply = (status: number, ok: boolean, cookies: readonly string[] = []): Response => {
    const headers = new Headers({ 'content-type': 'application/json', 'cache-control': 'no-store' });
    for (const c of cookies) headers.append('set-cookie', c);
    return new Response(JSON.stringify(app && ok ? { ok, value: {} } : { ok }), { status, headers });
  };
  if (!sameOrigin(request, door.origin) || (door.secret ?? '').length < 32) return reply(403, false);
  const body = (await request.json().catch(() => null)) as { code?: unknown; verifier?: unknown; label?: unknown } | null;
  if (typeof body?.code !== 'string' || typeof body.verifier !== 'string' || body.code.length > 512 || body.verifier.length > 256)
    return reply(400, false);
  const link = await openDesktopCode(door.secret as string, body.code, body.verifier, now);
  if (link === null) return reply(400, false);
  const sid = readSid(request, door.mode);
  const label = app ? { app: typeof body.label === 'string' ? body.label : '' } : {};
  const out = await door.ask({ flow: 'magic.redeem', linkToken: link, ip: door.ip, ...(sid === undefined ? {} : { sid }), ...label });
  if (out.status === 429) return reply(429, false);
  if (out.status !== 200 || out.session === undefined) return reply(400, false);
  return reply(200, true, [out.session === 'clear' ? clearCookie(door.mode) : sessionCookie(out.session.sid, door.mode)]);
}
