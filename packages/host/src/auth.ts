/**
 * Sign-in over HTTP, for both hosts: the route table, the cookie, and the loop that answers `/auth/*`.
 * `12 §3` row 49, `33 §4`, `49 §5.4` to `§5.10`, `51 §5.8`.
 *
 * THE CONTRACT, IN ONE PLACE, because the web app, the self-host and the Worker all read it:
 *
 *   Paths    `/auth/` and the `AuthCall` flow with its dots as slashes, except `key.exchange`, which is
 *            `POST /auth/token` (`49 §5.7`), and `provision`, which is the operator's and not a flow.
 *            `AUTH_ROUTES` below is the table, and a test pins every row.
 *   In       JSON. A POST needs `content-type: application/json` and `sameOrigin`, except the two
 *            operator routes, which take `Authorization: Bearer <PROVISION_KEY>` instead. The fields are
 *            the `AuthCall`'s: `{ serverKey }`, `{ credential, label? }`, `{ credential }`, `{ email }`,
 *            `{ linkToken }` or `{ claimToken }`, `{ id }`; provision takes `{ slug, email, name? }`.
 *   200      `{ ok: true, value }`, the value being `AuthBodies[flow]`; `/auth/methods` answers `MethodsBody`.
 *   Refused  `{ ok: false, refusal: { code, fix, at? } }` at 400, 401, 403, 404, 405 or 422, with codes
 *            already in `REFUSAL_CODES`. Every sign-in that does not sign somebody in is 401
 *            `UNAUTHORIZED`, "That did not sign you in."
 *   429      a `Retry-After` header in seconds, and `{ ok: false, retryAfter }`.
 *   503      `{ ok: false }`: the lockout's store failed, and a lockout that cannot count refuses.
 *   Cookie   `__Host-bd_s` on https, `bd_s` on http at a loopback name, and none on any other http
 *            origin, where `/auth/methods` says `why: 'insecure'`. One opaque id; the record is on the row.
 *   Links    `${origin}/signin#magic=<token>` and `#claim=<token>`, redeemed by `POST /auth/magic/redeem`.
 *            A fragment never reaches a server, a log or a link pre-fetcher, and a press is what spends it.
 *
 * STANDARD `Request`, `Response` AND WEBCRYPTO, like the rest of this package, so the Worker and the
 * self-host run this file unchanged. Neither adds a sign-in route, and neither answers one differently.
 *
 * NOTHING HERE LOGS, AND NOTHING ECHOES. A cookie value, a token, a key and an address arrive in a request
 * and leave, at most, as the one cookie or the one link they exist to become.
 */

import type { AssertionJSON, Auth, AuthCall, AuthFlow, AuthResult, Mail, Methods, RegistrationJSON, Refusal, Result, Who } from '@braindog/ports';

import { DEVICE_ROUTES, serveDevice, type DeviceDoor, type DeviceFlow } from './device.ts';
import { INVITE_ROUTES, serveInvite, type InviteDoor, type InviteFlow } from './invite.ts';
import { httpStatus } from './index.ts';

export { DEVICE_ROUTES, type DeviceAsk, type DeviceDoor, type DeviceFlow, type DeviceStarted } from './device.ts';
export { INVITE_ROUTES, type InviteDoor, type InviteFlow, type InviteSeen } from './invite.ts';

/* ── the account ─────────────────────────────────────────────────────────── */

/** One account route: where it is, and that it needs the session cookie. Both hosts serve every row. */
export type AccountRoute = { path: string; method: 'GET'; on: 'both'; needs: 'session'; what: string };

/**
 * The routes that answer about a person's account rather than a record (`loop/research-scheduled-actions.md` §4.6).
 *
 * THE DIRECTORY'S, LIKE SIGN-IN, and never a record's: usage is billing, and a record cannot see its own allowance.
 * A person sees the records they own and nothing of anybody else's.
 */
export const ACCOUNT_ROUTES: readonly AccountRoute[] = [
  { path: '/account/usage', method: 'GET', on: 'both', needs: 'session', what: 'What the records you own used between two days, and each month so far against its allowance.' },
  /* THE SWITCHER'S INDEX, and not an authorisation: every open record this person can REACH, by
     the level they actually hold there. `usage` above answers for records this person OWNS; this
     answers for every one they can open at all, which is the wider question the sidebar asks. */
  { path: '/account/records', method: 'GET', on: 'both', needs: 'session', what: 'Which records you can reach, each with its name and the level you hold there.' },
];

/** What a host hands `serveAccount`: its origin, the Directory's sign-in or `null` where nobody signs in, and the ledger. */
export type AccountDoor = {
  origin: string;
  auth: Auth | null;
  usage: (person: string, range: { from: string; to: string }) => Result<unknown> | Promise<Result<unknown>>;
  /** `/account/records`: every open record this person can reach, each `{ slug, name, level }`. */
  records: (person: string) => Result<unknown> | Promise<Result<unknown>>;
};

/**
 * Answer one `/account/*` request.
 *
 * THE SESSION COOKIE AND NOTHING ELSE. A bearer is an agent or the server key, and neither is a person with an
 * account. No cookie, a host where nobody signs in, or a session that has ended is 401 `UNAUTHORIZED`.
 */
export async function serveAccount(request: Request, door: AccountDoor): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const route = ACCOUNT_ROUTES.find((r) => r.path === path);
  if (!route) return refusal(404, { code: 'ROUTE_UNKNOWN', fix: 'There is no account route at that address.' });
  if (request.method !== route.method)
    return refusal(405, { code: 'FORBIDDEN', fix: `${route.path} is a ${route.method}.` }, [['allow', route.method]]);

  const mode = cookieMode(door.origin);
  const sid = mode === null ? undefined : readSid(request, mode);
  if (!door.auth || mode === null || sid === undefined)
    return refusal(401, { code: 'UNAUTHORIZED', fix: path === '/account/records' ? 'Sign in to see which records you can reach.' : 'Sign in to see what your records used.' });
  const seen = await door.auth({ flow: 'session', sid });
  if (seen.status !== 200) return answered(seen, mode);

  /* A ROTATION REACHES THE COOKIE whatever the row below answers. */
  const kept: Header[] = seen.session === undefined ? [] : [['set-cookie', seen.session === 'clear' ? clearCookie(mode) : sessionCookie(seen.session.sid, mode)]];
  const person = (seen.body as Who).person;
  const out =
    path === '/account/records'
      ? await door.records(person)
      : await door.usage(person, { from: url.searchParams.get('from') ?? '', to: url.searchParams.get('to') ?? '' });
  return reply(out.ok ? 200 : httpStatus(out), out, kept);
}

/** One sign-in route: where it is, who serves it, and what it needs. */
export type AuthRoute = {
  path: string;
  method: 'GET' | 'POST';
  /**
   * The `AuthCall` it becomes. `provision` is the one that is not a flow: it makes a record, then mints a claim.
   * The two device flows reach a record and never the Directory, and `device.ts` answers them.
   */
  flow: AuthFlow | 'provision' | DeviceFlow | InviteFlow;
  /** The server key is the self-host's, and provisioning is the Worker's; everything else is both. */
  on: 'both' | 'selfhost' | 'worker';
  /** Nothing, the session cookie, or the operator's key. A route that needs a session still answers without one: 401. */
  needs: 'nothing' | 'session' | 'operator';
  what: string;
};

/**
 * Every sign-in route, as data, in the shape `ROUTES` has for `/api`.
 *
 * ONE ROW PER FLOW, AND THE FLOW THE PLAN DID NOT NAME GOT THE SAME RULE. `claim.mint` is in the `AuthCall`
 * union and is operator only, so it is `POST /auth/claim/mint` beside provision: a claim link that expired
 * before somebody opened it can be minted again without making a second record.
 */
export const AUTH_ROUTES: readonly AuthRoute[] = [
  { path: '/auth/methods', method: 'GET', flow: 'methods', on: 'both', needs: 'nothing', what: 'Which ways in this host offers, and who the cookie belongs to.' },
  { path: '/auth/session', method: 'GET', flow: 'session', on: 'both', needs: 'session', what: 'Who the cookie belongs to, or a 401 and the cookie cleared.' },
  { path: '/auth/token', method: 'POST', flow: 'key.exchange', on: 'selfhost', needs: 'nothing', what: 'The server key for a session, where this host has one person.' },
  { path: '/auth/passkey/register/options', method: 'POST', flow: 'passkey.register.options', on: 'both', needs: 'session', what: 'A challenge for a new passkey. A session stands in for attestation.' },
  { path: '/auth/passkey/register', method: 'POST', flow: 'passkey.register', on: 'both', needs: 'session', what: 'Keep the passkey the browser just made.' },
  { path: '/auth/passkey/assert/options', method: 'POST', flow: 'passkey.assert.options', on: 'both', needs: 'nothing', what: 'A challenge for signing in with a passkey.' },
  { path: '/auth/passkey/assert', method: 'POST', flow: 'passkey.assert', on: 'both', needs: 'nothing', what: 'Sign in with a passkey.' },
  { path: '/auth/magic/start', method: 'POST', flow: 'magic.start', on: 'both', needs: 'nothing', what: 'Send a sign-in link. An address nobody has gets the same answer and no mail.' },
  { path: '/auth/magic/redeem', method: 'POST', flow: 'magic.redeem', on: 'both', needs: 'nothing', what: 'Spend a sign-in or claim link, once.' },
  { path: '/auth/passkeys', method: 'GET', flow: 'passkeys', on: 'both', needs: 'session', what: 'Your passkeys, never their keys.' },
  { path: '/auth/passkey/remove', method: 'POST', flow: 'passkey.remove', on: 'both', needs: 'session', what: 'Remove one of your passkeys, the last one included.' },
  { path: '/auth/logout', method: 'POST', flow: 'logout', on: 'both', needs: 'nothing', what: 'End this session and clear the cookie.' },
  { path: '/auth/switch', method: 'POST', flow: 'switch', on: 'both', needs: 'session', what: 'Open another record you are on, in this browser. `{ slug }`.' },
  { path: '/auth/claim/mint', method: 'POST', flow: 'claim.mint', on: 'worker', needs: 'operator', what: 'A new 24-hour claim link for somebody already provisioned.' },
  { path: '/auth/provision', method: 'POST', flow: 'provision', on: 'worker', needs: 'operator', what: 'A record, its Directory rows and a 24-hour claim link, handed to the operator.' },
  ...DEVICE_ROUTES,
  ...INVITE_ROUTES,
];

/** Why `/auth/methods` offers nothing: no key to take the MACs under, or an origin no cookie can be set on. */
export type Why = 'not-configured' | 'insecure';

/**
 * What `/auth/methods` answers. The Directory says what it can do; the host adds what only it knows.
 *
 * `open` IS A SELF-HOST WITH NO SERVER KEY, where a request carrying nothing is the owner and there is no
 * session to have. `demo` is a Worker with a pinned public record. `firstRun` is there whenever sign-in is.
 */
export type MethodsBody = {
  passkey: boolean;
  magic: boolean;
  key: boolean;
  open: boolean;
  demo: boolean;
  why?: Why;
  me: Who | null;
  firstRun?: boolean;
};

/** The cookie's two names. `__Host-` pins it to this host, `/` and `Secure`, so no subdomain can plant one. */
export const COOKIE = { secure: '__Host-bd_s', local: 'bd_s' } as const;
export type CookieMode = keyof typeof COOKIE;

/** Thirty days, the session's own life (`12 §3` row 49). The row expires on the server whatever the browser keeps. */
const MAX_AGE = 2_592_000;

const LOOPBACK = (host: string): boolean => host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1' || host === '[::1]';

/**
 * Which cookie an origin can hold: `secure` on https, `local` on http at a loopback name, `null` otherwise.
 *
 * NONE ON ANY OTHER HTTP ORIGIN, because a session cookie a network can read is a session anybody on it can
 * spend. A browser treats loopback as a secure context, which is what makes `bd_s` without `Secure` honest
 * there and nowhere else.
 */
export function cookieMode(origin: string): CookieMode | null {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }
  if (url.protocol === 'https:') return 'secure';
  return url.protocol === 'http:' && LOOPBACK(url.hostname) ? 'local' : null;
}

/**
 * The WebAuthn relying party for an origin, or `null` where a browser will not run a ceremony.
 *
 * THE EXACT HOST, NEVER THE APEX: a passkey made for `app.brain.dog` answers nothing at any other name.
 * An IP literal is not a valid RP ID, and an http origin that is not loopback is not a secure context.
 */
export function relyingParty(origin: string): { id: string; origin: string } | null {
  if (cookieMode(origin) === null) return null;
  const url = new URL(origin);
  if (/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) || url.hostname.startsWith('[')) return null;
  return { id: url.hostname, origin: url.origin };
}

/** The `Set-Cookie` value that carries a session id. Exact, because a test pins every attribute. */
export function sessionCookie(sid: string, mode: CookieMode): string {
  return mode === 'secure'
    ? `${COOKIE.secure}=${sid}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`
    : `${COOKIE.local}=${sid}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax`;
}

/** The `Set-Cookie` value that ends one: the same name and attributes, empty, at age zero. */
export function clearCookie(mode: CookieMode): string {
  return mode === 'secure'
    ? `${COOKIE.secure}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`
    : `${COOKIE.local}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
}

/**
 * The session id a request carries, or `undefined` when it carries none.
 *
 * WHAT WAS SENT, NOT WHAT IS VALID. An empty or malformed value comes back as it is, and the Directory
 * answers it with a 401 and a cleared cookie; reading it as "no cookie" would let a broken cookie reach
 * whatever the host does for a request that carries nothing.
 */
export function readSid(request: Request, mode: CookieMode): string | undefined {
  const name = COOKIE[mode];
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at < 0) continue;
    if (part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
  }
  return undefined;
}

/**
 * Whether a browser sent this from a page on `origin`.
 *
 * `Origin` WHEN IT IS THERE, and it must be exactly this one. Without it, `Sec-Fetch-Site` must say
 * `same-origin`, or `none` for something the person typed. A request with neither is refused: every
 * browser that holds a cookie sends one of the two on a POST, so a request carrying neither did not come
 * from a page this host served.
 */
export function sameOrigin(request: Request, origin: string): boolean {
  const said = request.headers.get('origin');
  if (said !== null) return said === origin;
  const site = request.headers.get('sec-fetch-site');
  return site === 'same-origin' || site === 'none';
}

/** A backslash or a control character: a browser reads the first as `/` and drops the second, before a person notices. */
function slippery(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 32 || c === 127 || c === 92) return true;
  }
  return false;
}

/**
 * A `next` that can only ever be a path on this origin; anything else is `/`.
 *
 * THE SHAPES THAT LEAVE ARE THE ONES A BROWSER READS DIFFERENTLY FROM A PERSON: `//evil.example` is a host,
 * so is `/\evil.example`, a tab or newline inside is dropped before it is read, and `%2F%2F` decodes to the
 * first. So the text must start with one `/`, carry no backslash or control character, decode to neither,
 * and still resolve to this origin.
 */
export function safeNext(next: unknown): string {
  if (typeof next !== 'string' || !next.startsWith('/') || next.length > 2048 || slippery(next)) return '/';
  let decoded: string;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    return '/';
  }
  if (next.startsWith('//') || decoded.startsWith('//') || slippery(decoded)) return '/';
  const url = new URL(next, 'https://here.invalid');
  return url.origin === 'https://here.invalid' ? `${url.pathname}${url.search}${url.hash}` : '/';
}

/**
 * Two secrets compared in time that does not depend on either: SHA-256 of both, then every byte.
 *
 * DIGESTED FIRST, so the lengths are always 32 and a length that differed cannot answer early.
 */
export async function sameKey(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', encoder.encode(a)), crypto.subtle.digest('SHA-256', encoder.encode(b))]);
  const p = new Uint8Array(x);
  const q = new Uint8Array(y);
  let differ = 0;
  for (let i = 0; i < p.length; i++) differ |= (p[i] ?? 0) ^ (q[i] ?? 0);
  return differ === 0;
}

/**
 * The Directory's MAC key, by HKDF-SHA-256 with the info `braindog/session`, from the KEK's bytes or a
 * configured secret.
 *
 * DERIVED, NOT USED AS IT IS. The KEK also wraps every record's keys, and a secret used for two jobs is a
 * secret whose second job can leak the first; `braindog/session` makes this a key for this job only.
 */
export async function deriveSessionKey(material: Uint8Array): Promise<Uint8Array> {
  const copy = new Uint8Array(material);
  const base = await crypto.subtle.importKey('raw', copy, 'HKDF', false, ['deriveBits']);
  copy.fill(0);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode('braindog/session') },
    base,
    256,
  );
  return new Uint8Array(bits);
}

/**
 * The context a live session is, in the shape the bearer path builds, from the Directory's `Who` and the
 * record's own `access(person)`.
 *
 * `provedAt` COMES FROM THE SESSION ROW AND FROM NOWHERE ELSE, which is what lets the vault ask for a proof
 * in the last fifteen minutes. `credentialed`, because a cookie is a credential of the person's own.
 */
export function sessionContext<L extends string>(
  who: Who,
  held: { level: L | null; registers: readonly string[] | null; levels: Readonly<Record<string, L>> },
): {
  principal: { kind: 'person'; id: string; level: L | null };
  registers?: readonly string[];
  levels?: Readonly<Record<string, L>>;
  credentialed: true;
  provedAt: number;
} {
  return {
    principal: { kind: 'person', id: who.person, level: held.level },
    ...(held.registers === null ? {} : { registers: held.registers }),
    ...(Object.keys(held.levels).length === 0 ? {} : { levels: held.levels }),
    credentialed: true,
    provedAt: who.provedAt,
  };
}

/** What the operator's provisioning made, before the claim link is minted for it. */
export type Provisioned = { record: string; slug: string; person: string };

/**
 * What a host hands `serveAuth`.
 *
 * `ip` IS THE HOST'S DECISION: the socket address, `cf-connecting-ip`, or a forwarded address only behind a
 * proxy the host was told to trust. `mail` is called and not awaited, so a known and an unknown address take
 * the same time to answer; it must not throw. `operator` is the Worker's, and absent everywhere else.
 */
export type AuthDoor = {
  on: 'selfhost' | 'worker';
  /** The one origin this host serves pages from, without a trailing slash. */
  origin: string;
  auth: Auth;
  ip: string;
  open?: boolean;
  demo?: boolean;
  mail?: ((to: string, link: string) => void) | undefined;
  operator?:
    | {
        key: string | undefined;
        provision: (args: { slug: string; email: string; name?: string }) => Promise<Result<Provisioned>>;
      }
    | undefined;
  /** The `host[:port]` this request arrived by: the socket's `Host`, or the Worker's URL. A device is told to open `origin` only when the two agree. */
  reached?: string | undefined;
  /** The record's half of the device grant. Absent where no device may sign in, and both device routes are 404. */
  device?: DeviceDoor | undefined;
  /** The record and Directory halves of an invitation link. Absent where nobody can accept one, and the route is 404. */
  invite?: InviteDoor | undefined;
};

type Header = readonly [string, string];

const HEADERS: readonly Header[] = [
  ['content-type', 'application/json; charset=utf-8'],
  /* A sign-in answer is one browser's and never a cache's. */
  ['cache-control', 'no-store'],
  ['x-content-type-options', 'nosniff'],
];

/** Answers are JSON in the `/api` envelope, with no CORS header ever written. */
function reply(status: number, payload: object, extra: readonly Header[] = []): Response {
  const headers = new Headers();
  for (const [k, v] of [...HEADERS, ...extra]) headers.append(k, v);
  return new Response(JSON.stringify(payload), { status, headers });
}

const refusal = (status: number, refused: Refusal, extra: readonly Header[] = []): Response => reply(status, { ok: false, refusal: refused }, extra);

/** A route this host does not serve, or a way in it has switched off. The screen already knows from `methods`. */
const off = (): Response => refusal(404, { code: 'ROUTE_UNKNOWN', fix: 'This BrainDog does not offer that way to sign in.' });

/** The link a person is sent or handed. The fragment is the whole of the design: see the header. */
const linkOf = (origin: string, mail: Mail): string =>
  'linkToken' in mail ? `${origin}/signin#magic=${mail.linkToken}` : `${origin}/signin#claim=${mail.claimToken}`;

const isJson = (request: Request): boolean =>
  (request.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() === 'application/json';

/** Sixty-four kilobytes: an RSA passkey registration is about two, and nothing else here is bigger. */
const BODY_LIMIT = 65_536;

/** The body as an object, or `null` for anything else: not JSON, too big, an array, a bare value. */
async function objectOf(request: Request): Promise<Record<string, unknown> | null> {
  const raw = await request.text();
  if (raw.length > BODY_LIMIT) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const text = (x: unknown): string => (typeof x === 'string' ? x : '');

/**
 * The HTTP request as the `AuthCall` it asks for.
 *
 * SHAPES ARE THE DIRECTORY'S TO JUDGE. A missing credential goes over as `undefined` and comes back as the
 * one failure body; checking it here as well would be a second opinion that could disagree with the first.
 */
function callOf(flow: AuthFlow, body: Record<string, unknown>, sid: string | undefined, ip: string): AuthCall | null {
  const presented = sid === undefined ? {} : { sid };
  switch (flow) {
    case 'session':
    case 'passkey.register.options':
    case 'passkeys':
    case 'logout':
      return { flow, sid: sid ?? '' };
    case 'key.exchange':
      return { flow, serverKey: text(body.serverKey), ip, ...presented };
    case 'passkey.register':
      return {
        flow,
        sid: sid ?? '',
        credential: body.credential as RegistrationJSON,
        ...(typeof body.label === 'string' ? { label: body.label } : {}),
      };
    case 'passkey.assert.options':
      return { flow };
    case 'passkey.assert':
      return { flow, credential: body.credential as AssertionJSON, ip, ...presented };
    case 'magic.start':
      return { flow, email: text(body.email), ip };
    case 'magic.redeem':
      return typeof body.claimToken === 'string'
        ? { flow, claimToken: body.claimToken, ip, ...presented }
        : { flow, linkToken: text(body.linkToken), ip, ...presented };
    case 'passkey.remove':
      return { flow, sid: sid ?? '', id: text(body.id) };
    case 'switch':
      return { flow, sid: sid ?? '', slug: text(body.slug) };
    /* THE TWO THAT ARE HANDLED BEFORE THIS AND NOT HERE. `methods` is answered above, and
       `claim.mint` goes through `operated`, which checks the operator key first. Naming them is
       what lets `default` be a type error rather than a 404. */
    case 'methods':
    case 'claim.mint':
      return null;
    default:
      return unhandled(flow);
  }
}

/**
 * A flow this host has no case for, refused at compile time rather than at the door.
 *
 * `default: return null` MEANT "THIS BRAINDOG DOES NOT OFFER THAT WAY TO SIGN IN", which `serveAuth`
 * answers with a 404. That is the right answer for a path nobody serves and the wrong one for a flow
 * that is in `AUTH_ROUTES`, in `AuthCall` and in `AuthBodies` and was only missed in the switch
 * above: the route exists, the Directory implements it, and the host answers as though neither did.
 *
 * MEASURED ON 2026-09-20 by adding a fourteenth flow to `AuthCall` and its body to `AuthBodies`.
 * `pnpm -C packages/host typecheck` passed, and the new route answered 404. The parameter below is
 * `never`, so the same edit now fails to compile, which is where a missing case belongs.
 *
 * IT STILL ANSWERS AT RUNTIME, because `serveAuth` reaches here through `route.flow as AuthFlow` and
 * a cast proves nothing about what a string really is.
 */
function unhandled(flow: never): null {
  void flow;
  return null;
}

/** The Directory's answer as a response: the envelope, the status, the cookie, and `Retry-After` on a 429. */
function answered(out: AuthResult, mode: CookieMode): Response {
  const extra: Header[] = [];
  if (out.session === 'clear') extra.push(['set-cookie', clearCookie(mode)]);
  else if (out.session !== undefined) extra.push(['set-cookie', sessionCookie(out.session.sid, mode)]);
  switch (out.status) {
    case 200:
      return reply(200, { ok: true, value: out.body }, extra);
    case 429:
      extra.push(['retry-after', String(out.retryAfter)]);
      return reply(429, { ok: false, retryAfter: out.retryAfter }, extra);
    case 503:
      return reply(503, { ok: false }, extra);
    default:
      return refusal(out.status, out.refusal, extra);
  }
}

/**
 * Answer one `/auth/*` request.
 *
 * THE ORDER IS THE ARGUMENT. The route and its method first, so a path that is not a route says so and
 * nothing else; then the origin and the content type on every POST, before the body is read, so a page
 * elsewhere gets a 403 without the Directory hearing about it; then the host's own reasons it can hold no
 * session; and only then the Directory.
 */
export async function serveAuth(request: Request, door: AuthDoor): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/\/+$/, '');
  const route = AUTH_ROUTES.find((r) => r.path === path && (r.on === 'both' || r.on === door.on));
  /* The path is not repeated back. A link pasted into the path rather than the fragment would be a token. */
  if (!route) return refusal(404, { code: 'ROUTE_UNKNOWN', fix: 'There is no sign-in route at that address.' });
  if (request.method !== route.method)
    return refusal(405, { code: 'FORBIDDEN', fix: `${route.path} is a ${route.method}.` }, [['allow', route.method]]);

  if (route.needs === 'operator') return operated(request, route, door);
  /* A DEVICE HAS NO COOKIE AND NO PAGE, so its two routes are answered before the checks a browser's are. */
  if (route.flow === 'device' || route.flow === 'device.token') return serveDevice(request, route, door);

  const mode = cookieMode(door.origin);
  const sid = mode === null ? undefined : readSid(request, mode);

  let body: Record<string, unknown> = {};
  if (route.method === 'POST') {
    if (!sameOrigin(request, door.origin))
      return refusal(403, { code: 'FORBIDDEN', fix: `Sign-in is answered only for pages on ${door.origin}.`, at: 'origin' });
    const parsed = isJson(request) ? await objectOf(request) : null;
    if (!parsed) return refusal(400, { code: 'BODY_MALFORMED', fix: `${route.path} takes a JSON object, sent as application/json.` });
    body = parsed;
  }

  if (route.flow === 'methods') return methods(door, mode, sid);

  /* NO SESSION CAN BE HELD, SO NO WAY IN IS OFFERED: an open self-host has none to have, and an origin no
     cookie can be set on would mint one with nowhere to go. */
  if (door.open || mode === null) return off();

  /* AN INVITATION IS SPENT BY SIGNING IN, so it is answered after the checks every browser route has, and its
     session reaches the cookie through the same `answered`. */
  if (route.flow === 'invite') return serveInvite(body, sid, door, (out) => answered(out, mode));

  const call = callOf(route.flow as AuthFlow, body, sid, door.ip);
  if (!call) return off();
  const out = await door.auth(call);

  /* THE LINK GOES OUT WITHOUT BEING WAITED FOR, and only as a link. A send that was awaited would make a
     known address slower to answer than an unknown one. */
  if (out.status === 200 && out.mail && door.mail) {
    try {
      door.mail(out.mail.to, linkOf(door.origin, out.mail));
    } catch {
      /* A failed send is the host's to report; the answer is the same either way. */
    }
  }
  return answered(out, mode);
}

/**
 * `/auth/methods`: the Directory's half and the host's, and the reason when there is nothing to offer.
 *
 * A COOKIE THAT CAN NAME NOTHING IS CLEARED HERE, because this is the first call the app makes: a host that
 * is open, or has no key to check sessions with, cannot have issued it.
 */
async function methods(door: AuthDoor, mode: CookieMode | null, sid: string | undefined): Promise<Response> {
  const out = await door.auth({ flow: 'methods', ...(sid === undefined ? {} : { sid }) });
  if (out.status !== 200) return mode === null ? reply(503, { ok: false }) : answered(out, mode);

  const demo = door.demo === true;
  const nothing: MethodsBody = { passkey: false, magic: false, key: false, open: door.open === true, demo, me: null };
  const clear: Header[] = mode === null || sid === undefined ? [] : [['set-cookie', clearCookie(mode)]];
  if (door.open) return reply(200, { ok: true, value: nothing }, clear);
  if (mode === null) return reply(200, { ok: true, value: { ...nothing, why: 'insecure' } satisfies MethodsBody });

  const m = out.body as Methods;
  if (!m.configured) return reply(200, { ok: true, value: { ...nothing, why: 'not-configured' } satisfies MethodsBody }, clear);
  const body: MethodsBody = { passkey: m.passkey, magic: m.magic, key: m.key, open: false, demo, me: m.me, firstRun: m.firstRun };
  return answered({ ...out, body }, mode);
}

/**
 * The operator's two routes: a record and a claim link, or a claim link on its own. Worker only.
 *
 * THE KEY IS COMPARED IN CONSTANT TIME, AND AN UNSET ONE IS NO ROUTE AT ALL. The link comes back to the
 * operator in the answer and is never mailed from here: a person should hear about their record from the
 * person who made it, and the operator decides how.
 */
async function operated(request: Request, route: AuthRoute, door: AuthDoor): Promise<Response> {
  const operator = door.operator;
  if (!operator?.key) return off();
  const bearer = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1]?.trim() ?? '';
  if (!bearer || !(await sameKey(bearer, operator.key)))
    return refusal(401, { code: 'UNAUTHORIZED', fix: 'This route takes the operator key.', at: 'authorization' });
  const body = isJson(request) ? await objectOf(request) : null;
  if (!body) return refusal(400, { code: 'BODY_MALFORMED', fix: `${route.path} takes a JSON object, sent as application/json.` });

  /* NOTHING IS MADE WHILE SIGN-IN IS OFF: a record whose claim link cannot be minted is a record nobody can reach. */
  const on = await door.auth({ flow: 'methods' });
  if (on.status !== 200 || !(on.body as Methods).configured) return off();

  const email = text(body.email).trim().toLowerCase();
  let made: Provisioned | null = null;
  if (route.flow === 'provision') {
    const name = text(body.name).trim();
    const out = await operator.provision({ slug: text(body.slug).trim(), email, ...(name ? { name } : {}) });
    if (!out.ok) return reply(httpStatus(out), out);
    made = out.value;
  }
  const minted = await door.auth({ flow: 'claim.mint', email });
  if (minted.status !== 200 || !minted.mail) return answered(minted, cookieMode(door.origin) ?? 'secure');
  const claim = linkOf(door.origin, minted.mail);
  const expires = (minted.body as { expires: number }).expires;
  return reply(200, { ok: true, value: made ? { ...made, claim, expires } : { claim, expires } });
}
