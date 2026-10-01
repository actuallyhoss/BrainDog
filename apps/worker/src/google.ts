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
 * A GET THAT SIGNS SOMEBODY IN, WHICH NO OTHER ROUTE HERE IS. A redirect back from Google can be nothing else. What
 * stands in for the origin check a POST has is the state: a callback is answered only for the browser that holds the
 * cookie the start wrote, with a code Google issued against the verifier inside it.
 */

import { clearCookie, readSid, safeNext, sameKey, sessionCookie, type CookieMode } from '@braindog/host/auth';
import type { AuthCall, AuthResult } from '@braindog/ports';

/** The two routes and the one method each answers, as `AUTH_ROUTES` declares them. */
export const GOOGLE_ROUTES = { '/auth/google/start': 'GET', '/auth/google/callback': 'GET' } as const;

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
const landing = (next: unknown): string => {
  const to = safeNext(next);
  return to === '/app' || to.startsWith('/app/') || to.startsWith('/app?') ? to : '/app/';
};

const stateCookie = (value: string, mode: CookieMode, age: number): string =>
  `${STATE_COOKIE[mode]}=${value}; Path=/; Max-Age=${age}; HttpOnly; ${mode === 'secure' ? 'Secure; ' : ''}SameSite=Lax`;

function readState(request: Request, mode: CookieMode): { state: string; verifier: string; nonce: string; next: string } | null {
  const name = STATE_COOKIE[mode];
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at < 0 || part.slice(0, at).trim() !== name) continue;
    const [state, verifier, nonce, next] = part.slice(at + 1).trim().split('.');
    if (!state || !verifier || !nonce) return null;
    return { state, verifier, nonce, next: textOf(next ?? '') ?? '' };
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
  if (request.method !== 'GET') return new Response(null, { status: 405, headers: { allow: 'GET', 'cache-control': 'no-store' } });
  const url = new URL(request.url);
  const redirect = `${door.origin}/auth/google/callback`;

  if (path === '/auth/google/start') {
    const state = fresh();
    const verifier = fresh();
    const nonce = fresh();
    const next = landing(url.searchParams.get('next'));
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
    const kept = `${state}.${verifier}.${nonce}.${b64url(new TextEncoder().encode(next))}`;
    return go(to.toString(), [stateCookie(kept, door.mode, STATE_LIFE_S)]);
  }

  /* THE STATE COOKIE GOES WHATEVER HAPPENS, so a callback is answered once for one start. */
  const forget = stateCookie('', door.mode, 0);
  const held = readState(request, door.mode);
  const next = landing(held?.next);
  const back = (why: GoogleWhy): Response => {
    const q = new URLSearchParams({ google: why, ...(next === '/app/' ? {} : { next }) });
    return go(`${door.origin}/app/signin?${q}`, [forget]);
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

  const email = addressOf(claims, door, held.nonce, (door.now ?? Date.now)());
  if (!email.includes('@')) return back(email as GoogleWhy);

  const minted = await door.ask({ flow: 'magic.start', email, ip: door.ip });
  if (minted.status === 429) return back('locked');
  if (minted.status !== 200) return back('failed');
  /* NO LINK IS AN ADDRESS NOBODY HAS, or one whose mailbox is locked out. Saying so tells the asker nothing they could
     not already know: Google has just shown the address is theirs. */
  const mail = minted.mail;
  if (!mail || !('linkToken' in mail)) return back('unknown');

  const sid = readSid(request, door.mode);
  const out = await door.ask({ flow: 'magic.redeem', linkToken: mail.linkToken, ip: door.ip, ...(sid === undefined ? {} : { sid }) });
  if (out.status === 429) return back('locked');
  if (out.status !== 200 || out.session === undefined) return back('failed');
  const cookie = out.session === 'clear' ? clearCookie(door.mode) : sessionCookie(out.session.sid, door.mode);
  return go(`${door.origin}${next}`, [forget, cookie]);
}
