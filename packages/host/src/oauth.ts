/**
 * OAuth 2.1, with BrainDog as its own authorization server: how any MCP client connects by a URL and a person's yes
 * (`docs/10-MCP.md` §2).
 *
 * THE FLOW IS THE STANDARD ONE, AND EVERY STEP IS HERE. An app that gets `/mcp`'s 401 reads the protected resource's
 * metadata, then this server's, registers itself (RFC 7591) or names its metadata document (a Client ID Metadata
 * Document), and sends the person's browser to `/oauth/authorize`. That request is held ten minutes while the person
 * reads the consent screen; Allow mints an ordinary agent token through the record's own `createToken`, seals it under
 * a one-time code and sends the browser back to the app with the code; the app trades the code and its PKCE verifier
 * at `/oauth/token` for a one-hour key and a refresh token, good ninety days from its last use, so it signs in again
 * only after three unused months or when the person removes it.
 *
 * THE APP NEVER HOLDS THE TOKEN ALLOW MADE (sharing plan 2.9). That token is the parent: sealed under the code, then
 * under each refresh token, and never sent. What the app gets is a child of it (`deps.child`), good for an hour and
 * never more than its parent, and each refresh mints a new one only while the parent still works. Removing the app in
 * Settings revokes the parent, which ends every child at its next call and the refresh family at its next use.
 *
 * PURE, OVER PORTS, SO BOTH HOSTS SERVE THE SAME PROTOCOL. The store is `OAuthStore` (the Directory's SQL through
 * `@braindog/record/oauth`), the person is `Approver` (the host's own browser session and record), and reading an
 * app's metadata document is `fetchDocument`, which only an app can do (`packages/*` make no outbound call). WebCrypto
 * only, and nothing of `node:`.
 *
 * NOTHING INVALID IS EVER SENT BACK TO AN APP'S ADDRESS UNTIL THAT ADDRESS IS PROVED. An unknown client or a redirect
 * address it did not register is answered on a BrainDog page, because sending an error to an address nobody vouched
 * for is an open redirect (RFC 9700 §4.11). Once the address is the app's own, what is wrong with the rest of the
 * request goes back to it as OAuth's `error`, with `state` and `iss` (RFC 9207).
 *
 * OAUTH'S OWN ERRORS, AND NEVER A REFUSAL. Every JSON error here is `{ error, error_description }` as RFC 6749 §5.2
 * writes it, because that is what an OAuth client reads; a record's `code:` shape would be a refusal code the
 * `refusals` gate counts and no client understands.
 *
 * THE CODE OPENS THE BEARER AND NOTHING ELSE DOES. The store keeps the code's SHA-256 and the bearer sealed under a key
 * derived from the code (`sealBearer`), so the Directory's storage, or a copy of it, holds no token that works: the only
 * thing that opens one is the code, which exists in one browser redirect for sixty seconds.
 */

import type { TokenClient } from '@braindog/kernel';
import { FRESH } from '@braindog/record';
import { ABUSE, tooManyLine } from './abuse.ts';
import type { CodeRequest, HeldRequest, OAuthAnswers, OAuthCall, OAuthClient } from '@braindog/record/oauth';
import { ipBucket } from '@braindog/record/directory';

import { sameOrigin } from './auth.ts';

/** The token scopes, in the ladder's order: each opens what the one before it does (`0001:78`, ADR-060). */
export const OAUTH_SCOPES = ['read', 'propose', 'write'] as const;
export type OAuthScope = (typeof OAUTH_SCOPES)[number];

/** How many days an app may sit unused before it must sign in again: the refresh token's sliding life. */
export const TOKEN_DAYS = 90;
/** The parent lives as long as the kernel allows, so a refresh can mint under it; revoking it in Settings still ends it. */
const BEARER_DAYS = 365;
/** What an app's access token is good for: one hour, as a child key of the sealed parent. */
const CHILD_MINUTES = 60;
const DAY_MS = 86_400_000;
/** A refresh token that was just replaced still works this long, for a client that never saw our answer and retries. */
const REFRESH_GRACE = 2 * 60_000;

/** How long a sign-in waits for the person, and how long its code lives once they allow it. */
const REQUEST_LIFE = 10 * 60_000;
const CODE_LIFE = 60_000;

/** How long a Client ID Metadata Document is kept before it is read again, and the most of one that is read. */
const DOCUMENT_LIFE = 24 * 60 * 60_000;
export const DOCUMENT_MOST_BYTES = 5 * 1024;

/**
 * The ceilings on what one stranger's request can make this file read or keep: a body,
 * the addresses one app registers, one address's length, an app's name, and the `state` echoed back to it.
 */
const BODY_MOST_BYTES = 8 * 1024;
const REDIRECTS_MOST = 10;
const URI_MOST = 2000;
const NAME_MOST = 80;
const STATE_MOST = 1024;
/** Every redirect address one app registers, together (SEC8): what one registration can make the store keep. */
const REDIRECTS_TOTAL_MOST = 2048;

/**
 * Where `/oauth/register` and `/oauth/authorize` count a caller (SEC8): an IPv6 address as its /64, which is what one
 * home or one cheap server is handed, and a second, wider count over its /48, so a whole allocation of /64s is not an
 * endless supply of fresh counts. The raw address was the key, and a /64 is 2^64 of them.
 */
const WIDE_MOST = 100;
function placesOf(address: string | null): { place: string; wide: string | null } {
  const place = ipBucket(address ?? '') || 'unknown';
  if (!place.endsWith('::/64')) return { place, wide: null };
  const hextets = place.slice(0, -'::/64'.length).split(':');
  while (hextets.length < 3) hextets.push('0');
  return { place, wide: `${hextets.slice(0, 3).join(':')}::/48` };
}

/** The count at the door for one `kind`: the place's, then its /48's, and the first that says wait. */
async function counted(deps: OAuthDeps, kind: 'register' | 'authorize'): Promise<number | null> {
  const { place, wide } = placesOf(deps.address);
  const wait = await deps.store({ op: 'count', key: `${kind}:${place}` });
  if (wait !== null || wide === null) return wait;
  return deps.store({ op: 'count', key: `${kind}48:${wide}`, most: WIDE_MOST });
}

/** The HKDF info a code's sealing key is derived under: one key for this job and no other, as `braindog/share` is. */
const CODE_INFO = 'braindog/oauth-code';

/** The loopback names an app on the person's own machine may be answered at (RFC 8252 §7.3). */
const LOOPBACK: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost']);

/**
 * The store, as one call: `answerOAuth` in `@braindog/record/oauth`, behind whatever the host puts between. The Cloud
 * crosses to the Directory object in one RPC; the self-host calls the function in its own process.
 */
export type OAuthStore = <C extends OAuthCall>(call: C) => Promise<OAuthAnswers[C['op']]>;

/** What minting answered: the bearer, or the record's own sentence and the status it came with. */
export type Minted = { ok: true; bearer: string } | { ok: false; status: number; say: string };

/**
 * The person at the consent screen, as the host found them from its browser session and the record they chose.
 *
 * THE HOST DECIDES WHO, THE RECORD DECIDES WHETHER. An approver is a session on that record, with the moment its
 * sign-in was last proved; `mint` is the record's `createToken` called as that person, so the record's own ADMIN guard
 * is what refuses somebody who does not own it. `cookie` is a session rotation that must ride back on the answer.
 */
export type Approver =
  | {
      ok: true;
      record: string;
      provedAt: number;
      /** When the account was made, in epoch milliseconds, where the host knows it: a new account counts as freshly proved (`NEW_ACCOUNT`). */
      since?: number | undefined;
      mint: (args: { scope: OAuthScope; label: string; days: number; client: TokenClient }) => Promise<Minted>;
      cookie?: string | undefined;
    }
  | { ok: false; status: 401 | 403 | 429 | 503; say: string; retryAfter?: number | undefined; cookie?: string | undefined };

export type OAuthDeps = {
  /** `https://<PUBLIC_HOST>`, with no trailing slash: the issuer every metadata document and redirect names. */
  issuer: string;
  store: OAuthStore;
  now: () => number;
  /** The address `/oauth/register` and `/oauth/authorize` are counted by, as the host decides it; `null` is one shared count. */
  address: string | null;
  /** Where the browser goes to answer a held request: the app's consent route, or a host's own page until it exists. */
  consent: (request: string) => string;
  approver: (request: Request, record: string) => Promise<Approver>;
  /**
   * A child key of the sealed parent, for `minutes`, from the record the parent's first half names (`mintChild`, a
   * host-only call): its bearer and when it ends, or `null` when the parent no longer works (revoked, run out, its
   * person stopped), which ends the app's refresh family at once.
   */
  child: (parent: string, minutes: number) => Promise<{ bearer: string; expires_at: string } | null>;
  /** The text of a metadata document at an `https:` client id, at most `DOCUMENT_MOST_BYTES`, or `null`. Absent: no documents. */
  fetchDocument?: ((url: string) => Promise<string | null>) | undefined;
  /**
   * Every other address `/mcp` answers at on this host, beside `${issuer}/mcp`, or none: the self-host's loopback names
   * (`apps/selfhost/src/oauth.ts`). Absent on the Cloud, which has one name.
   *
   * A CLIENT CHECKS THE RESOURCE AGAINST THE ADDRESS IT TYPED (RFC 9728 §3.3), so a request that reached one of these is
   * told that one as the resource, and an app may name any of them as `resource`: a token minted here works at every
   * name this host answers by, so none of them is a different resource.
   */
  resources?: readonly string[] | undefined;
};

/** What the consent screen draws for one held request, and what `GET /oauth/request` answers. */
export type Consent = {
  request: string;
  client_name: string;
  redirect_host: string;
  /** The most the app asked for, or `null` when it asked for no scope in particular. */
  scope: OAuthScope | null;
  /** What the person may allow, in the ladder's order. */
  offers: OAuthScope[];
  /** The one pre-chosen: `propose` or less, because an agent proposes and a person decides. */
  suggested: OAuthScope;
  expires: number;
  /** How the app came, and the host that names it: proven for `cimd`, only named by the app for `dcr`. */
  source: AppSource;
};

/** How an app came to the door and the host it is of; `null` for an app answered on the person's own machine. */
export type AppSource = { kind: 'cimd' | 'dcr'; host: string | null };

type Header = [string, string];

/* ── ANSWERS ───────────────────────────────────────────────────────────────────────────────────────── */

/** Every JSON answer here: `no-store` on all of them, because a token, a code's redirect and an error are one caller's. */
const json = (status: number, body: unknown, extra: Header[] = []): Response =>
  new Response(JSON.stringify(body), { status, headers: [['content-type', 'application/json; charset=utf-8'], ['cache-control', 'no-store'], ['x-content-type-options', 'nosniff'], ...extra] });

/** OAuth's own error body (RFC 6749 §5.2), never a refusal's. */
export const oauthError = (status: number, error: string, description: string, extra: Header[] = []): Response =>
  json(status, { error, error_description: description }, extra);

/** A 429 in OAuth's body with the plain line and `retry_after`, so an app and a person read the same wait. */
const tooMany = (wait: number): Response =>
  json(429, { error: 'temporarily_unavailable', error_description: tooManyLine(wait), retry_after: wait }, [['retry-after', String(wait)]]);

/** The browser goes on: 302 from a GET, 303 after a form's POST, so the next request is a GET whatever the browser. */
const goTo = (status: 302 | 303, location: string, extra: Header[] = []): Response =>
  new Response(null, { status, headers: [['location', location], ['cache-control', 'no-store'], ['referrer-policy', 'no-referrer'], ...extra] });

/** Text as HTML, for anything an app or a person wrote. The page is assembled from escaped parts only. */
export const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * A page BrainDog draws itself on this path, for a person: an error that must not go back to an app, and the host's
 * consent fallback. `html` is already escaped by whoever assembled it.
 *
 * NO SCRIPT, AND A POLICY THAT SAYS SO. Inline styles only, nothing loaded from anywhere, never framed. `form-action`
 * is left unset on purpose: a browser holds a form's redirect to it too, and Allow's answer is a 303 to the app's own
 * address, which is exactly where the page must be able to send the person. No colour is named: the page takes the
 * browser's own light or dark, so it has no palette of its own to drift from the theme's.
 *
 * `same-origin` AND NOT `no-referrer`, BECAUSE ALLOW AND DENY ARE FORMS POSTED TO THIS ORIGIN. Under `no-referrer` a
 * browser sends `Origin: null` on a form's POST (the Fetch standard's "append a request `Origin` header"), so
 * `sameOrigin` refused every Allow and every Deny a person pressed. `same-origin` keeps the origin on this BrainDog's
 * own requests and still sends nothing to an app: the redirect to its address carries `no-referrer` itself (`goTo`).
 */
export function oauthPage(status: number, title: string, html: string, extra: Header[] = []): Response {
  const body = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="referrer" content="same-origin">
<title>${escapeHtml(title)}</title>
<style>
body { font-family: system-ui, sans-serif; line-height: 1.5; margin: 0; }
main { max-inline-size: 34rem; margin-inline: auto; padding-block: 2rem; padding-inline: 1rem; overflow-wrap: anywhere; }
h1 { font-size: 1.4em; line-height: 1.25; margin-block: 0 1rem; }
fieldset { border: 1px solid currentColor; border-radius: 0.5rem; margin-block: 0 1rem; padding-block: 0.5rem 0.75rem; padding-inline: 0.75rem; }
label { display: flex; gap: 0.5rem; align-items: flex-start; min-block-size: 2.75rem; padding-block: 0.4rem; }
.acts { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-block-start: 1.5rem; }
button, .act { font: inherit; min-block-size: 2.75rem; min-inline-size: 2.75rem; padding-block: 0.5rem; padding-inline: 1.25rem; border: 1px solid currentColor; border-radius: 999px; background: transparent; color: inherit; cursor: pointer; overflow-wrap: anywhere; }
.main-act { font-weight: 600; border-width: 2px; }
.host { overflow-wrap: anywhere; }
</style>
</head>
<body>
<main>
<h1>${escapeHtml(title)}</h1>
${html}
</main>
</body>
</html>`;
  return new Response(body, {
    status,
    headers: [
      ['content-type', 'text/html; charset=utf-8'],
      ['cache-control', 'no-store'],
      ['x-content-type-options', 'nosniff'],
      ['referrer-policy', 'same-origin'],
      ['content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'"],
      ...extra,
    ],
  });
}

/** A page of sentences: each one escaped here and set as its own paragraph. */
const sentences = (status: number, title: string, lines: string[], extra: Header[] = []): Response =>
  oauthPage(status, title, lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('\n'), extra);

/** An answer the method does not take: 405, with the one it does. */
const onlyMethods = (request: Request, methods: readonly string[]): Response | null =>
  methods.includes(request.method)
    ? null
    : oauthError(405, 'invalid_request', `This address takes ${methods.join(' or ')}.`, [['allow', methods.join(', ')]]);

/* ── BYTES ─────────────────────────────────────────────────────────────────────────────────────────── */

const b64url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromB64url = (text: string): Uint8Array<ArrayBuffer> | null => {
  if (!/^[A-Za-z0-9_-]+$/.test(text) || text.length % 4 === 1) return null;
  try {
    return Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4)), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
};

const random = (n: number): Uint8Array<ArrayBuffer> => crypto.getRandomValues(new Uint8Array(n));

/** SHA-256 of a code, in hex: the only form of it the store keeps. */
const digest = async (text: string): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, '0')).join('');

/** What a PKCE verifier hashes to under S256 (RFC 7636 §4.2). */
export const challengeOf = async (verifier: string): Promise<string> => b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));

/** The AES-GCM key a code seals its bearer under, by HKDF-SHA-256 from the code's own characters. */
const codeKey = async (code: string) => {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode(CODE_INFO) },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
};

/**
 * A bearer sealed under a code: a random twelve-byte nonce, then AES-256-GCM, as base64url.
 *
 * THE CODE IS 256 RANDOM BITS, SO HKDF WITH NO SALT IS ENOUGH. The key is a function of the code alone, and the code is
 * never stored, so the row this makes opens for whoever holds the code and for nobody who holds the table.
 */
export async function sealBearer(bearer: string, code: string): Promise<string> {
  const nonce = random(12);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, await codeKey(code), new TextEncoder().encode(bearer)));
  const out = new Uint8Array(nonce.length + sealed.length);
  out.set(nonce);
  out.set(sealed, nonce.length);
  return b64url(out);
}

/** The bearer a code's row holds, or `null` when the code is not the one it was sealed under. */
export async function openBearer(sealed: string, code: string): Promise<string | null> {
  const bytes = fromB64url(sealed);
  if (bytes === null || bytes.length <= 12) return null;
  try {
    const opened = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12) }, await codeKey(code), bytes.subarray(12));
    return new TextDecoder().decode(opened);
  } catch {
    return null;
  }
}

/**
 * The body's text, or `null` above the cap: counted as it arrives, because `Content-Length` is a claim.
 *
 * A COPY OF THE LOOP `serveApi` READS WITH, because that one is private to `index.ts`, whose owner this file is not.
 */
async function textOf(request: Request, cap: number): Promise<string | null> {
  if (Number(request.headers.get('content-length') ?? 0) > cap) {
    await request.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!request.body) return '';
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > cap) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/**
 * A body as named fields: a form (`application/x-www-form-urlencoded`, which is what RFC 6749 sends and what the
 * consent page posts) or a JSON object. `form` says which, because a form's answer is a page and a JSON caller's is
 * JSON. The first of a repeated field is the one read. `null` is too long, or neither shape.
 */
async function bodyOf(request: Request): Promise<{ fields: Record<string, unknown>; form: boolean } | null> {
  const type = (request.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  const text = await textOf(request, BODY_MOST_BYTES);
  if (text === null) return null;
  if (type === 'application/x-www-form-urlencoded') {
    const fields = Object.create(null) as Record<string, unknown>;
    new URLSearchParams(text).forEach((value, key) => {
      if (!Object.hasOwn(fields, key)) fields[key] = value;
    });
    return { fields, form: true };
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) return { fields: parsed as Record<string, unknown>, form: false };
  } catch {
    /* Not JSON either, which is answered below as neither shape. */
  }
  return null;
}

const textField = (x: unknown): string => (typeof x === 'string' ? x : '');

/** An id this file minted: a held request's, which is base64url and short. Anything else is asked of no store. */
const REQUEST_ID = /^[A-Za-z0-9_-]{16,64}$/;

/* ── ADDRESSES, NAMES AND SCOPES ───────────────────────────────────────────────────────────────────── */

/**
 * Why an address is not one an app may be answered at, or `null` when it is: `https:`, or `http:` on this machine's
 * loopback (RFC 8252 §7.3), with no fragment and no user name, at most `URI_MOST` characters.
 *
 * THE SENTENCE NAMES NO PART OF WHAT WAS SENT. A registration is a public write, and a public door echoes nothing back
 * that it was handed.
 */
export function redirectWrong(uri: unknown): string | null {
  if (typeof uri !== 'string' || uri.length === 0 || uri.length > URI_MOST) return `A redirect address is a URL of at most ${URI_MOST} characters.`;
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return 'A redirect address is a whole URL, with its scheme.';
  }
  if (uri.includes('#')) return 'A redirect address carries no fragment.';
  if (url.username !== '' || url.password !== '') return 'A redirect address carries no user name or password.';
  if (url.protocol === 'https:') return null;
  if (url.protocol === 'http:' && LOOPBACK.has(url.hostname)) return null;
  return 'BrainDog answers an app at an https address, or at http://127.0.0.1 or http://localhost on its own machine, and nowhere else.';
}

/**
 * Whether an address is one this app registered. Exactly, or, for a loopback address, on any port with the same path
 * and query: an app on the person's machine listens where the system gives it room (RFC 8252 §7.3).
 */
function registered(client: OAuthClient, asked: string): boolean {
  if (client.redirect_uris.includes(asked)) return true;
  let url: URL;
  try {
    url = new URL(asked);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' || !LOOPBACK.has(url.hostname) || asked.includes('#') || url.username !== '' || url.password !== '') return false;
  return client.redirect_uris.some((r) => {
    try {
      const u = new URL(r);
      return u.protocol === 'http:' && u.hostname === url.hostname && u.pathname === url.pathname && u.search === url.search;
    } catch {
      return false;
    }
  });
}

/**
 * What the door proved about an app, for a token's stamp and the consent screen. For `cimd` the host of the client id
 * itself, which served the document that names it; for `dcr` the host of the address the request is answered at,
 * which the app chose. An address on this machine has no host to name.
 */
function sourceOf(client: OAuthClient, redirect: string): AppSource {
  let url: URL;
  try {
    url = new URL(client.source === 'cimd' ? client.client_id : redirect);
  } catch {
    return { kind: client.source, host: null };
  }
  return { kind: client.source, host: url.protocol === 'https:' && !LOOPBACK.has(url.hostname) ? url.host.toLowerCase() : null };
}

/** The host a code goes to, as the consent screen names it. */
const hostOf = (uri: string): string => {
  try {
    return new URL(uri).host;
  } catch {
    return uri;
  }
};

/**
 * A character no app's name keeps: a control character, or one that changes the direction text is drawn in, which
 * would let a name read on the consent screen as something other than what it is. By number, so this file holds none.
 */
const hidden = (c: number): boolean =>
  c < 0x20 || (c >= 0x7f && c <= 0x9f) || c === 0x200e || c === 0x200f || (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069);

/**
 * An app's name as a person will read it on the consent screen and on the token: control and direction-changing
 * characters taken out, trimmed, at most `NAME_MOST` characters, and the host it is answered at when it gave none.
 */
function nameOf(said: unknown, uris: readonly string[]): string {
  /* BY CHARACTER AND NOT BY UNIT, so the cut at `NAME_MOST` never halves an emoji into a character nobody can draw. */
  const kept = typeof said === 'string' ? [...said].filter((ch) => !hidden(ch.codePointAt(0) ?? 0)).join('').trim() : '';
  const clean = [...kept].slice(0, NAME_MOST).join('').trim();
  /* A NAME THAT BEGINS AS THE RECORD'S OWN KEYS DO IS NO NAME. The name becomes the token's label, and a label `job:<id>`
     is a job's bearer to the record (left off the agents list, its runs counted to the job, revoked when it ends) and
     `report:` a report key's; the record refuses both, so the app is named by its host instead. */
  if (clean !== '' && !RESERVED_LABEL.test(clean)) return clean;
  const first = uris[0];
  return first === undefined ? 'An app' : `An app at ${hostOf(first)}`;
}

/** The beginnings of a label only the record writes: a job's bearer and a report key. */
const RESERVED_LABEL = /^(?:job|report):/iu;

const isScope = (x: unknown): x is OAuthScope => typeof x === 'string' && (OAUTH_SCOPES as readonly string[]).includes(x);

/**
 * The most an authorize request asked for, from its space-separated `scope`: `''` for none, `null` for a word that is
 * not a scope here. A token holds one scope on the ladder, so asking for several is asking for the highest.
 */
function scopeAsked(raw: string | null): OAuthScope | '' | null {
  let top = -1;
  for (const word of (raw ?? '').split(/\s+/)) {
    if (word === '') continue;
    const at = (OAUTH_SCOPES as readonly string[]).indexOf(word);
    if (at < 0) return null;
    top = Math.max(top, at);
  }
  return OAUTH_SCOPES[top] ?? '';
}

/** What a person may allow for an app that asked for `top`: everything up to it, or every scope when it asked for none. */
const offersFor = (top: OAuthScope | null): OAuthScope[] => (top === null ? [...OAUTH_SCOPES] : OAUTH_SCOPES.slice(0, OAUTH_SCOPES.indexOf(top) + 1));

/** The scope a token answer names: the granted one and every one below it, since each opens what the one before does. */
const ladder = (scope: string): string => {
  const at = OAUTH_SCOPES.indexOf(scope as OAuthScope);
  return OAUTH_SCOPES.slice(0, at + 1).join(' ');
};

/**
 * A scope as a sentence, which is how the consent screen says it and never as the bare word.
 */
export const scopeSentence = (scope: OAuthScope): string =>
  scope === 'read'
    ? 'Read your BrainDog.'
    : scope === 'propose'
      ? 'Read your BrainDog and propose changes, which wait for you to decide.'
      : 'Read your BrainDog, propose changes, and change rows directly.';

/**
 * Whether a `resource` names the one resource this server protects (RFC 8707), by any address it has (`resources`),
 * with or without a trailing slash.
 */
const isResource = (resource: string, deps: OAuthDeps): boolean =>
  [`${deps.issuer}/mcp`, ...(deps.resources ?? [])].some((r) => resource === r || resource === `${r}/`);

/** The resource as this request reached it: one of `resources` when it came in by that address, and the issuer's otherwise. */
function resourceAt(request: Request, deps: OAuthDeps): string {
  const reached = `${new URL(request.url).origin}/mcp`;
  return deps.resources?.includes(reached) === true ? reached : `${deps.issuer}/mcp`;
}

/**
 * Hosts where anybody can put a file under the host's own name: GitHub's raw and gist files, paste sites, and the public
 * buckets of the big stores. A document served there proves only that somebody uploaded it, and the consent screen
 * would say "BrainDog checked that this app is raw.githubusercontent.com", so an app is never read from one. Each is
 * matched as the host or any name under it.
 */
const USER_CONTENT_HOSTS = [
  'githubusercontent.com',
  'gist.github.com',
  'gitlab.io',
  'pastebin.com',
  'paste.ee',
  'hastebin.com',
  'dropboxusercontent.com',
  'storage.googleapis.com',
  'firebasestorage.googleapis.com',
  's3.amazonaws.com',
  'blob.core.windows.net',
  'r2.dev',
  'jsdelivr.net',
  'unpkg.com',
] as const;

/** Whether a host is one where anybody can serve a file (`USER_CONTENT_HOSTS`), including a bucket's own name under S3. */
export function isUserContentHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/u, '');
  if (/(^|\.)s3[.-][a-z0-9-]+\.amazonaws\.com$/u.test(h)) return true;
  return USER_CONTENT_HOSTS.some((d) => h === d || h.endsWith(`.${d}`));
}

/**
 * Whether a metadata document came as JSON: `application/json` or a `+json` type, with any parameters. A file host that
 * answers `text/plain` is serving somebody's upload, not an app's own document.
 */
export function isJsonType(type: string | null): boolean {
  const essence = (type ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  return essence === 'application/json' || /^application\/[a-z0-9.+-]+\+json$/u.test(essence);
}

/** Whether a client id is an address a metadata document may be read from: `https:`, a path, no fragment, no user, and a host that is no file host. */
function isDocumentUrl(id: string): boolean {
  if (id.length > URI_MOST || id.includes('#')) return false;
  try {
    const url = new URL(id);
    return url.protocol === 'https:' && url.pathname !== '/' && url.username === '' && url.password === '' && !isUserContentHost(url.hostname);
  } catch {
    return false;
  }
}

/* ── METADATA ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * RFC 9728: what `/mcp` is, and who issues its tokens. The `WWW-Authenticate` of `/mcp`'s 401 points here. `resource`
 * is `${issuer}/mcp` unless the request reached another of the host's names for it (`OAuthDeps.resources`).
 */
export const protectedResource = (issuer: string, resource = `${issuer}/mcp`) => ({
  resource,
  authorization_servers: [issuer],
  scopes_supported: [...OAUTH_SCOPES],
  bearer_methods_supported: ['header'],
});

/**
 * RFC 8414: this server. `client_id_metadata_document_supported` is true only on a host that can read one, and
 * `authorization_response_iss_parameter_supported` says every redirect carries `iss` (RFC 9207).
 */
export const authorizationServer = (issuer: string, documents: boolean) => ({
  issuer,
  authorization_endpoint: `${issuer}/oauth/authorize`,
  token_endpoint: `${issuer}/oauth/token`,
  registration_endpoint: `${issuer}/oauth/register`,
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  code_challenge_methods_supported: ['S256'],
  token_endpoint_auth_methods_supported: ['none'],
  client_id_metadata_document_supported: documents,
  scopes_supported: [...OAUTH_SCOPES],
  authorization_response_iss_parameter_supported: true,
});

/* ── THE DOORS ─────────────────────────────────────────────────────────────────────────────────────── */

/**
 * `POST /oauth/register`: RFC 7591 for public clients. The app says where it is answered and what it is called; it is
 * given an id, and never a secret, because it proves itself with PKCE on every sign-in.
 *
 * COUNTED PER ADDRESS BEFORE ANYTHING IS READ, by the store's `count` (its ceiling and window are named there), then a
 * 429 with `Retry-After`, in the Directory's own lockout table, so a flood of registrations costs its sender a wait and
 * the store one row.
 *
 * THE ANSWER REPEATS WHAT WAS REGISTERED, as RFC 7591 §3.2.1 requires, after it has been cleaned: the name as a person
 * will read it and the addresses that passed `redirectWrong`, with the grant this server actually gives.
 */
async function register(request: Request, deps: OAuthDeps): Promise<Response> {
  const wait = await counted(deps, 'register');
  if (wait !== null) return tooMany(wait);
  const body = await bodyOf(request);
  if (body === null || body.form) return oauthError(400, 'invalid_client_metadata', `Registration takes a JSON object of at most ${BODY_MOST_BYTES} bytes.`);
  const f = body.fields;
  const uris = f.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > REDIRECTS_MOST)
    return oauthError(400, 'invalid_redirect_uri', `An app registers between one and ${REDIRECTS_MOST} redirect addresses, as redirect_uris.`);
  for (const uri of uris) {
    const wrong = redirectWrong(uri);
    if (wrong !== null) return oauthError(400, 'invalid_redirect_uri', wrong);
  }
  const addresses = uris as string[];
  if (addresses.reduce((n, u) => n + u.length, 0) > REDIRECTS_TOTAL_MOST)
    return oauthError(400, 'invalid_redirect_uri', `An app's redirect addresses come to at most ${REDIRECTS_TOTAL_MOST} characters together.`);
  if (f.token_endpoint_auth_method !== undefined && f.token_endpoint_auth_method !== 'none')
    return oauthError(400, 'invalid_client_metadata', 'BrainDog registers public clients only: token_endpoint_auth_method is none, and the app proves itself with PKCE.');
  if (f.grant_types !== undefined && !(Array.isArray(f.grant_types) && f.grant_types.includes('authorization_code')))
    return oauthError(400, 'invalid_client_metadata', 'BrainDog gives the authorization_code grant, and an app that does not ask for it cannot sign in here.');
  if (f.response_types !== undefined && !(Array.isArray(f.response_types) && f.response_types.includes('code')))
    return oauthError(400, 'invalid_client_metadata', 'BrainDog answers response_type code, and an app that does not ask for it cannot sign in here.');

  const now = deps.now();
  const client: OAuthClient = { client_id: `bdc_${b64url(random(18))}`, name: nameOf(f.client_name, addresses), redirect_uris: addresses, source: 'dcr', created_at: now };
  if ((await deps.store({ op: 'register', client })) === 'full')
    return oauthError(503, 'temporarily_unavailable', 'BrainDog is holding as many apps as it can. Try again later.');
  return json(201, {
    client_id: client.client_id,
    client_id_issued_at: Math.floor(now / 1000),
    client_name: client.name,
    redirect_uris: client.redirect_uris,
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
  });
}

/**
 * The app a client id names: one that registered here, or one whose metadata document is read from the id itself and
 * kept a day. `null` for an id nobody registered and no document answers for.
 *
 * A DOCUMENT IS HELD TO WHAT A REGISTRATION IS HELD TO, and to one thing more: it must name itself, `client_id` equal
 * to the address it was read from, or anybody could serve a copy of another app's document from their own site.
 * A document that no longer reads, a day on, is not trusted from the copy: the app stopped vouching for it.
 */
async function clientFor(id: string, deps: OAuthDeps): Promise<OAuthClient | null> {
  if (id.length === 0 || id.length > URI_MOST) return null;
  const known = await deps.store({ op: 'client', client_id: id });
  if (known !== null && (known.source === 'dcr' || deps.now() - known.created_at < DOCUMENT_LIFE)) return known;
  if (deps.fetchDocument === undefined || !isDocumentUrl(id)) return null;
  const text = await deps.fetchDocument(id);
  if (text === null || text.length > DOCUMENT_MOST_BYTES) return null;
  let doc: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    doc = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  if (doc.client_id !== id) return null;
  const uris = doc.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > REDIRECTS_MOST || uris.some((u) => redirectWrong(u) !== null)) return null;
  if (doc.token_endpoint_auth_method !== undefined && doc.token_endpoint_auth_method !== 'none') return null;
  const addresses = uris as string[];
  const client: OAuthClient = { client_id: id, name: nameOf(doc.client_name, addresses), redirect_uris: addresses, source: 'cimd', created_at: deps.now() };
  return (await deps.store({ op: 'register', client })) === 'ok' ? client : null;
}

/** An address with the answer's fields added to its query, in the order given, keeping whatever query it already had. */
function answerAt(uri: string, fields: Record<string, string>): string {
  const url = new URL(uri);
  for (const [key, value] of Object.entries(fields)) url.searchParams.set(key, value);
  return url.toString();
}

/** The words of every page that says a held request is no longer there, whichever way it went. */
export const REQUEST_GONE = 'This sign-in has expired or was already answered. Go back to the app and connect again.';

/**
 * `GET /oauth/authorize`: check the app and its address, hold the request ten minutes, and send the browser to the
 * consent screen.
 *
 * THE ORDER IS THE SAFETY. The count, then the app, then its address, each answered on a BrainDog page; only once the
 * address is proved does anything go back to it. PKCE is required and S256 is the only method (OAuth 2.1 §7.5.2), so a
 * code stolen on its way back is useless without the verifier the app kept.
 */
async function authorize(request: Request, deps: OAuthDeps): Promise<Response> {
  const title = 'BrainDog could not connect this app';
  const wait = await counted(deps, 'authorize');
  if (wait !== null) return sentences(429, title, [tooManyLine(wait)], [['retry-after', String(wait)]]);
  const q = new URL(request.url).searchParams;
  const id = q.get('client_id');
  if (id === null) return sentences(400, title, ['The app that sent you here did not say which app it is. Go back to it and connect again.']);
  const client = await clientFor(id, deps);
  if (client === null) return sentences(400, title, ['BrainDog does not know the app that sent you here, so it was not asked anything. Go back to the app and add BrainDog again.']);
  const asked = q.get('redirect_uri');
  const redirect = asked === null ? (client.redirect_uris.length === 1 ? client.redirect_uris[0] : undefined) : registered(client, asked) ? asked : undefined;
  if (redirect === undefined)
    return sentences(400, title, [`${client.name} asked to be answered at an address it did not register, so BrainDog sent nothing there. Go back to the app and connect again.`]);
  const state = q.get('state') ?? '';
  if (state.length > STATE_MOST) return sentences(400, title, [`${client.name} sent a request too long to answer. Go back to the app and connect again.`]);

  const back = (error: string, description: string): Response =>
    goTo(302, answerAt(redirect, { error, error_description: description, ...(state === '' ? {} : { state }), iss: deps.issuer }));
  if (q.get('response_type') !== 'code') return back('unsupported_response_type', 'BrainDog answers response_type=code and nothing else.');
  const challenge = q.get('code_challenge') ?? '';
  if (q.get('code_challenge_method') !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(challenge))
    return back('invalid_request', 'BrainDog needs PKCE: a code_challenge made with code_challenge_method=S256.');
  const scope = scopeAsked(q.get('scope'));
  if (scope === null) return back('invalid_scope', `BrainDog's scopes are ${OAUTH_SCOPES.join(', ')}.`);
  const resource = q.get('resource');
  if (resource !== null && !isResource(resource, deps)) return back('invalid_target', `This server issues tokens for ${deps.issuer}/mcp and nothing else.`);

  const held: HeldRequest = { id: b64url(random(24)), client_id: client.client_id, redirect_uri: redirect, challenge, scope, state, expires: deps.now() + REQUEST_LIFE };
  if ((await deps.store({ op: 'hold', request: held })) === 'full')
    return back('temporarily_unavailable', 'BrainDog is holding as many sign-ins as it can. Try again in a few minutes.');
  return goTo(302, deps.consent(held.id));
}

/**
 * What the consent screen draws for one held request, or `null` when it has expired, was answered, or names an app
 * that is gone. The host's consent page and `GET /oauth/request` both read it here.
 */
export async function consentFor(store: OAuthStore, id: string): Promise<Consent | null> {
  if (!REQUEST_ID.test(id)) return null;
  const held = await store({ op: 'held', id });
  if (held === null) return null;
  const client = await store({ op: 'client', client_id: held.client_id });
  if (client === null) return null;
  const top = isScope(held.scope) ? held.scope : null;
  const offers = offersFor(top);
  return {
    request: held.id,
    client_name: client.name,
    redirect_host: hostOf(held.redirect_uri),
    scope: top,
    offers,
    suggested: offers.includes('propose') ? 'propose' : 'read',
    expires: held.expires,
    source: sourceOf(client, held.redirect_uri),
  };
}

/** `GET /oauth/request?request=<id>`: the consent screen's read of a held request. The id is the only key, and it is 192 random bits. */
async function consentDoor(request: Request, deps: OAuthDeps): Promise<Response> {
  const found = await consentFor(deps.store, new URL(request.url).searchParams.get('request') ?? '');
  if (found === null) return oauthError(404, 'invalid_request', REQUEST_GONE);
  const { expires, ...rest } = found;
  return json(200, { ...rest, expires_at: new Date(expires).toISOString() });
}

/**
 * `POST /oauth/approve { request, record, scope }`: the person allows the app, on the record they chose, at a scope no
 * higher than the app asked for.
 *
 * FROM A PAGE ON THIS BRAINDOG, BY A PERSON WHO PROVED WHO THEY ARE IN THE LAST FIFTEEN MINUTES, as `deviceApprove`
 * asks (`FRESH`). A browser left signed in for a month is not enough to hand an app a
 * bearer that works from anywhere for ninety days.
 *
 * THE REQUEST IS TAKEN BEFORE THE TOKEN IS MINTED, so a second press, or a second tab, finds nothing to answer and no
 * second token is made. The token is minted by the record as that person, labelled with the app's name, so it is on
 * the owner's list of tokens under that name and revocable there like any other.
 */
/** An account this young has proved itself by being made, so Allow does not ask it to sign in a second time. */
export const NEW_ACCOUNT = 60 * 60_000;

/**
 * Whether Allow may go ahead: a sign-in within `FRESH`, or an account made within `NEW_ACCOUNT`.
 *
 * AN OLDER ACCOUNT IS ASKED AS BEFORE. Only the account's age is read, never the session's, so a browser left signed in
 * for a month on an old account still needs a sign-in in the last fifteen minutes.
 */
export function provedRecently(now: number, provedAt: number, since?: number): boolean {
  return now - provedAt <= FRESH || (since !== undefined && now - since <= NEW_ACCOUNT);
}

async function approve(request: Request, deps: OAuthDeps): Promise<Response> {
  if (!sameOrigin(request, deps.issuer)) return oauthError(403, 'access_denied', 'Allowing an app is accepted only from a page on this BrainDog.');
  const body = await bodyOf(request);
  if (body === null) return oauthError(400, 'invalid_request', `Allowing an app takes request, record and scope, in at most ${BODY_MOST_BYTES} bytes.`);
  const title = 'BrainDog could not connect this app';
  const say = (status: number, error: string, description: string, extra: Header[] = []): Response =>
    body.form ? sentences(status, title, [description], extra) : oauthError(status, error, description, extra);
  const cookie = (c: string | undefined): Header[] => (c === undefined ? [] : [['set-cookie', c]]);

  const id = textField(body.fields.request);
  const held = REQUEST_ID.test(id) ? await deps.store({ op: 'held', id }) : null;
  if (held === null) return say(400, 'invalid_request', REQUEST_GONE);
  const scope = body.fields.scope;
  if (!isScope(scope) || !offersFor(isScope(held.scope) ? held.scope : null).includes(scope))
    return say(400, 'invalid_scope', 'Choose one of the reaches this app asked for.');
  const record = textField(body.fields.record);
  if (record === '') return say(400, 'invalid_request', 'Choose which record this app may reach.');

  const who = await deps.approver(request, record);
  if (!who.ok)
    return say(who.status, who.status === 429 || who.status === 503 ? 'temporarily_unavailable' : 'access_denied', who.say, [
      ...(who.retryAfter === undefined ? [] : [['retry-after', String(who.retryAfter)] as Header]),
      ...cookie(who.cookie),
    ]);
  if (!provedRecently(deps.now(), who.provedAt, who.since))
    return say(401, 'login_required', 'Sign in again, then allow this: BrainDog asks for a sign-in in the last fifteen minutes before it lets an app in.', cookie(who.cookie));
  const client = await deps.store({ op: 'client', client_id: held.client_id });
  const taken = client === null ? null : await deps.store({ op: 'take', id });
  if (client === null || taken === null) return say(400, 'invalid_request', REQUEST_GONE, cookie(who.cookie));

  /* THE STAMP IS WHAT THE DOOR PROVED, never what the app said of itself: its client id, how it came, and its host. */
  const { kind, host } = sourceOf(client, taken.redirect_uri);
  const minted = await who.mint({ scope, label: client.name, days: BEARER_DAYS, client: { id: client.client_id, kind, host } });
  if (!minted.ok) return say(minted.status, 'access_denied', minted.say, cookie(who.cookie));
  const code = b64url(random(32));
  const answers: CodeRequest = { client_id: taken.client_id, redirect_uri: taken.redirect_uri, challenge: taken.challenge, scope };
  const kept = await deps.store({
    op: 'code',
    row: { code_hash: await digest(code), request: answers, record: who.record, bearer_sealed: await sealBearer(minted.bearer, code), expires: deps.now() + CODE_LIFE },
  });
  /* THE TOKEN EXISTS AND WAS NEVER HANDED OVER, which the person is told in words they can act on: it is on their list
     under the app's name, and removing it there is the whole of the repair. */
  if (kept === 'full')
    return say(503, 'temporarily_unavailable', `BrainDog is holding as many sign-ins as it can, so ${client.name} was not answered. Remove it under Settings, Agents, and connect again in a few minutes.`, cookie(who.cookie));
  const redirect = answerAt(taken.redirect_uri, { code, ...(taken.state === '' ? {} : { state: taken.state }), iss: deps.issuer });
  return body.form ? goTo(303, redirect, cookie(who.cookie)) : json(200, { redirect }, cookie(who.cookie));
}

/**
 * `POST /oauth/deny { request }`: the person says no, and the app is told `access_denied` at its own address.
 *
 * NO SESSION IS ASKED, ONLY THE ORIGIN. Saying no hands nothing to anybody, and a person who is not signed in must be
 * able to turn an app away; the request id is 192 random bits, so nobody denies a request they were not shown.
 */
async function deny(request: Request, deps: OAuthDeps): Promise<Response> {
  if (!sameOrigin(request, deps.issuer)) return oauthError(403, 'access_denied', 'Turning an app away is accepted only from a page on this BrainDog.');
  const body = await bodyOf(request);
  if (body === null) return oauthError(400, 'invalid_request', `Turning an app away takes request, in at most ${BODY_MOST_BYTES} bytes.`);
  const id = textField(body.fields.request);
  const taken = REQUEST_ID.test(id) ? await deps.store({ op: 'take', id }) : null;
  if (taken === null) return body.form ? sentences(400, 'Nothing to answer', [REQUEST_GONE]) : oauthError(400, 'invalid_request', REQUEST_GONE);
  const redirect = answerAt(taken.redirect_uri, {
    error: 'access_denied',
    error_description: 'The person did not allow this app.',
    ...(taken.state === '' ? {} : { state: taken.state }),
    iss: deps.issuer,
  });
  return body.form ? goTo(303, redirect) : json(200, { redirect });
}

/**
 * `POST /oauth/token`: a code and its verifier, for the bearer.
 *
 * THE CODE IS SPENT BY BEING ASKED FOR (`redeem` deletes the row it reads), so a code used twice, or tried with a wrong
 * verifier first, never answers again. Every check after that is against what the request held: the same app, the same
 * address, the verifier that hashes to the challenge it began with, and the one resource.
 */
async function token(request: Request, deps: OAuthDeps): Promise<Response> {
  /* PER ADDRESS BEFORE THE BODY IS READ (`ABUSE.oauthToken`): a code is single use, so a guesser needs many tries. */
  const wait = await deps.store({ op: 'count', key: `token:${ipBucket(deps.address ?? '') || 'unknown'}`, most: ABUSE.oauthToken.most });
  if (wait !== null) return tooMany(wait);
  const body = await bodyOf(request);
  if (body === null) return oauthError(400, 'invalid_request', `The token endpoint takes a form of at most ${BODY_MOST_BYTES} bytes.`);
  const f = body.fields;
  if (f.grant_type === 'refresh_token') return refreshed(f, deps);
  if (f.grant_type !== 'authorization_code')
    return oauthError(400, 'unsupported_grant_type', 'BrainDog answers grant_type=authorization_code and refresh_token.');
  const code = textField(f.code);
  const verifier = textField(f.code_verifier);
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return oauthError(400, 'invalid_request', 'PKCE: code_verifier is 43 to 128 letters, digits and - . _ ~.');
  const spent = 'This code is not one BrainDog gave, has expired, or was already used. Sign in again.';
  if (code === '' || code.length > 128) return oauthError(400, 'invalid_grant', spent);
  const row = await deps.store({ op: 'redeem', code_hash: await digest(code) });
  if (row === null) return oauthError(400, 'invalid_grant', spent);
  if (textField(f.client_id) !== row.request.client_id) return oauthError(400, 'invalid_grant', 'This code was given to another app.');
  if (f.redirect_uri !== undefined && f.redirect_uri !== row.request.redirect_uri) return oauthError(400, 'invalid_grant', 'The redirect address is not the one this code was asked for.');
  if (f.resource !== undefined && !isResource(textField(f.resource), deps)) return oauthError(400, 'invalid_target', `This server issues tokens for ${deps.issuer}/mcp and nothing else.`);
  if ((await challengeOf(verifier)) !== row.request.challenge) return oauthError(400, 'invalid_grant', 'The code_verifier does not match the code_challenge this sign-in began with.');
  const parent = await openBearer(row.bearer_sealed, code);
  if (parent === null) return oauthError(400, 'invalid_grant', spent);
  /* THE APP GETS A CHILD, NEVER THE PARENT. A parent removed in the minute between Allow and here mints none. */
  const child = await deps.child(parent, CHILD_MINUTES);
  if (child === null) return oauthError(400, 'invalid_grant', REMOVED);
  /* A refresh family is started with the parent sealed in it, so the app can come back for a new key without asking the
     person again. Unmade when the table is full: the app has its hour, and signs in again at the end of it. */
  const now = deps.now();
  const ends = now + (BEARER_DAYS - 1) * DAY_MS;
  const refresh = b64url(random(32));
  const made = await deps.store({
    op: 'family',
    row: {
      id: b64url(random(18)), client_id: row.request.client_id, record: row.record, scope: row.request.scope,
      cur_hash: await digest(refresh), cur_sealed: await sealBearer(parent, refresh), prev_hash: null, prev_sealed: null, prev_until: 0,
      expires: Math.min(ends, now + TOKEN_DAYS * DAY_MS), ends,
    },
  });
  return json(200, {
    access_token: child.bearer, token_type: 'Bearer', expires_in: secondsLeft(child.expires_at, now), scope: ladder(row.request.scope),
    ...(made === 'ok' ? { refresh_token: refresh } : {}),
  }, [['pragma', 'no-cache']]);
}

/** What a removed app is told, at the code and at every refresh after. */
const REMOVED = 'This app was removed, or the person who allowed it was stopped. Sign in again.';

/** Seconds until an instant, as `expires_in` says them: at least one, so an answer never says a key is already over. */
const secondsLeft = (instant: string, now: number): number => Math.max(1, Math.floor((Date.parse(instant) - now) / 1000));

/**
 * `grant_type=refresh_token`: a new one-hour child of the sealed parent and a new refresh token, the old one kept for a
 * short grace. Sliding: every use moves the family's end ninety days on, never past the parent's own.
 *
 * REVOKING THE PARENT IN SETTINGS ENDS THE APP. Its children answer 401 at their next call, and the next refresh finds
 * no child to mint (`deps.child` answers `null`), drops the family and answers `invalid_grant`.
 *
 * THE TOKEN JUST REPLACED, INSIDE ITS GRACE, IS ANSWERED AS A RETRY AND MOVES NOTHING. It is a client that never saw our
 * answer, or a second tab of the same app that refreshed at the same moment, and both want the answer the first
 * presentation got. So the token that answer handed out is sealed under the one it replaced (`prev_sealed` holds the
 * parent and the new token), and a retry is handed that same token and a child of its own; the current token stays where
 * it is. It used to rotate the family again for whoever presented the old token, which displaced the token the app
 * held: anyone who replayed a stolen copy within the two minutes took the family over, and the app was signed out.
 *
 * A TOKEN THE FAMILY LEFT BEHIND ENDS IT (RD4). A replay inside the grace still hands over the current token, so the
 * thief could refresh twice, push the app's copy out of the one slot that was remembered, and keep the family while the
 * app got a plain refusal. The store now remembers the last few tokens each family left behind; any of them presented
 * again, or the replaced token presented after the family moved past its answer, ends the family for everybody. Inside
 * the grace and before the family moves, every retry is answered alike (RE3): answered once, three calls refreshing one
 * token together signed the app out.
 */
async function refreshed(f: Record<string, unknown>, deps: OAuthDeps): Promise<Response> {
  const gone = 'This refresh token is not one BrainDog gave, was replaced, or has not been used for ninety days. Sign in again.';
  const presented = textField(f.refresh_token);
  if (presented === '' || presented.length > 128) return oauthError(400, 'invalid_grant', gone);
  const hash = await digest(presented);
  /* TWICE: a retry racing the rotation loses the compare-and-set once and then finds the new row. */
  for (let attempt = 0; attempt < 2; attempt++) {
    const row = await deps.store({ op: 'refresh_get', hash });
    if (row === null) return oauthError(400, 'invalid_grant', gone);
    if (f.client_id !== undefined && textField(f.client_id) !== row.client_id) return oauthError(400, 'invalid_grant', 'This refresh token was given to another app.');
    if (f.resource !== undefined && !isResource(textField(f.resource), deps)) return oauthError(400, 'invalid_target', `This server issues tokens for ${deps.issuer}/mcp and nothing else.`);
    const sealed = row.which === 'current' ? row.cur_sealed : row.prev_sealed;
    const opened = sealed === null ? null : await openBearer(sealed, presented);
    if (opened === null) return oauthError(400, 'invalid_grant', gone);
    const now = deps.now();

    if (row.which === 'previous') {
      const held = retryOf(opened);
      /* THE ANSWER THE FIRST PRESENTATION GOT, if the current token is still the one it handed out. Anything else is a
         family that has moved on since, which the old token has no claim to. */
      if (held.next !== null) {
        /* WHILE THE FAMILY HAS NOT MOVED PAST ITS ANSWER (RE3): every retry inside the grace gets the same answer, so
           several calls refreshing one token at once all carry on. One after the family moved on is a copy in two
           hands, and the family goes, so whoever replayed it is signed out along with the app (RD4). */
        if ((await digest(held.next)) !== row.cur_hash || !(await deps.store({ op: 'refresh_retry', id: row.id, hash, expect_cur: row.cur_hash }))) {
          await deps.store({ op: 'refresh_drop', id: row.id });
          return oauthError(400, 'invalid_grant', gone);
        }
        return childAnswer(row, held.parent, held.next, now, deps);
      }
      /* A ROW SEALED BEFORE THE RETRY WAS KEPT has only the parent, and lives at most the two-minute grace: it is answered
         as it was then, by a rotation, so a client mid-refresh across the deploy is not signed out. */
    }

    const parent = row.which === 'previous' ? retryOf(opened).parent : opened;
    const next = b64url(random(32));
    const ok = await deps.store({
      op: 'refresh_rotate',
      id: row.id,
      expect_cur: row.cur_hash,
      next: {
        cur_hash: await digest(next), cur_sealed: await sealBearer(parent, next),
        /* The one just presented stays good for the grace, sealed with the token it was replaced by, so a retry is handed
           that one again; a retry of an older one does not get a longer grace. */
        prev_hash: hash, prev_sealed: await sealBearer(`${parent}${RETRY_SPLIT}${next}`, presented), prev_until: row.which === 'previous' ? row.prev_until : now + REFRESH_GRACE,
        expires: now + TOKEN_DAYS * DAY_MS,
      },
    });
    if (!ok) continue;
    return childAnswer(row, parent, next, now, deps);
  }
  return oauthError(400, 'invalid_grant', gone);
}

/** Between the parent and the token that replaced the one a retry presents, in `prev_sealed`: in neither alphabet. */
const RETRY_SPLIT = '\n';

/** What a previous token's seal holds: the parent, and the token that replaced it (`null` in a row sealed before it was kept). */
function retryOf(opened: string): { parent: string; next: string | null } {
  const at = opened.indexOf(RETRY_SPLIT);
  return at < 0 ? { parent: opened, next: null } : { parent: opened.slice(0, at), next: opened.slice(at + RETRY_SPLIT.length) };
}

/**
 * A child and the family's refresh token, as a refresh answers them.
 *
 * MINTED AFTER THE ROTATION WINS, so two retries racing make one new token, and checked against the parent every time: a
 * parent revoked since the last refresh mints nothing, and the family goes with it.
 */
async function childAnswer(row: { id: string; scope: string }, parent: string, refresh: string, now: number, deps: OAuthDeps): Promise<Response> {
  const child = await deps.child(parent, CHILD_MINUTES);
  if (child === null) {
    await deps.store({ op: 'refresh_drop', id: row.id });
    return oauthError(400, 'invalid_grant', REMOVED);
  }
  return json(200, {
    access_token: child.bearer, token_type: 'Bearer', expires_in: secondsLeft(child.expires_at, now), scope: ladder(row.scope), refresh_token: refresh,
  }, [['pragma', 'no-cache']]);
}

/**
 * Every OAuth path, or `null` for a path that is not one: the host's router has already decided the path is OAuth's,
 * and this is the one place that says which door under it answers.
 *
 * A PATH UNDER OAUTH'S PREFIXES THAT NAMES NO DOOR IS A 404 IN OAUTH'S WORDS, never `null`, so a mistyped endpoint
 * is not handed on to be answered as something else.
 */
export async function serveOAuthDoor(request: Request, deps: OAuthDeps): Promise<Response | null> {
  const path = new URL(request.url).pathname.replace(/\/{2,}/g, '/').replace(/(.)\/+$/, '$1');
  const read = ['GET', 'HEAD'] as const;
  if (path === '/.well-known/oauth-protected-resource' || path === '/.well-known/oauth-protected-resource/mcp')
    return onlyMethods(request, read) ?? json(200, protectedResource(deps.issuer, resourceAt(request, deps)));
  if (path.startsWith('/.well-known/oauth-protected-resource/'))
    return oauthError(404, 'invalid_request', `This BrainDog protects one resource, ${deps.issuer}/mcp, described at /.well-known/oauth-protected-resource.`);
  if (path === '/.well-known/oauth-authorization-server')
    return onlyMethods(request, read) ?? json(200, authorizationServer(deps.issuer, deps.fetchDocument !== undefined));
  if (!/^\/oauth(?:\/|$)/.test(path)) return null;
  if (path === '/oauth/register') return onlyMethods(request, ['POST']) ?? register(request, deps);
  if (path === '/oauth/authorize') return onlyMethods(request, ['GET']) ?? authorize(request, deps);
  if (path === '/oauth/request') return onlyMethods(request, ['GET']) ?? consentDoor(request, deps);
  if (path === '/oauth/approve') return onlyMethods(request, ['POST']) ?? approve(request, deps);
  if (path === '/oauth/deny') return onlyMethods(request, ['POST']) ?? deny(request, deps);
  if (path === '/oauth/token') return onlyMethods(request, ['POST']) ?? token(request, deps);
  return oauthError(404, 'invalid_request', 'There is no OAuth endpoint at this address. They are listed at /.well-known/oauth-authorization-server.');
}
