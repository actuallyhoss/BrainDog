/**
 * OAuth on the self-host: `@braindog/host/oauth`'s doors over this process's Directory, browser session and record, and
 * the consent page an app's sign-in lands on.
 *
 * THE PROTOCOL IS THE HOST PACKAGE'S AND THIS FILE IS THE WIRING, as `apps/worker/src/oauth.ts` is the Cloud's. The store
 * is `answerOAuth` over the Directory's own SQLite, `directory.sqlite` in the data folder, called in this process; the
 * person is the browser session the Directory holds; the token is minted by the record's own `createToken`, as that
 * person, so the record's ADMIN guard decides whether they may, and the token is on the owner's list like any other.
 *
 * ONE ISSUER: THE ORIGIN THE APP IS SERVED FROM (`BRAINDOG_ORIGIN`, or `http://localhost:<port>`). The session cookie
 * lives there and nowhere else, so the consent page, Allow and Deny must be there too. But an agent on this machine
 * may be pointed at `http://127.0.0.1:<port>/mcp`, and a client refuses a protected resource whose address is not the one
 * it typed (RFC 9728 §3.3), so every loopback name `/mcp` answers by is the resource as that name reached it, with this
 * one issuer behind all of them (`OAuthDeps.resources`).
 *
 * OFF, IN OAUTH'S WORDS, WHERE NOBODY COULD SAY YES OR WHERE SAYING YES WOULD NOT BE SAFE. Nobody allows an app on a
 * host where nobody signs in from a browser (open mode, no directory, an origin no cookie can be set on, no session
 * key: `start`'s `off`, whose reason the boot line prints), because `createToken` refuses
 * the credential-less owner of open mode, and a metadata document promising a sign-in that always fails would be a
 * promise this host cannot keep. And an issuer at an `http:` address is allowed only when the socket listens on this
 * machine alone: a code and a bearer crossing a network unencrypted are anybody's on that network.
 */

import {
  consentFor,
  DOCUMENT_MOST_BYTES,
  escapeHtml,
  oauthError,
  oauthPage,
  REQUEST_GONE,
  scopeSentence,
  serveOAuthDoor,
  TOKEN_DAYS,
  type Approver,
  type Consent,
  type Minted,
  type OAuthDeps,
  type OAuthStore,
} from '@braindog/host/oauth';
import { httpStatus } from '@braindog/host';
import { clearCookie, readSid, sessionContext, sessionCookie, type CookieMode } from '@braindog/host/auth';
import { MEMBER_STOPPED } from '@braindog/kernel';
import { FRESH, type CallContext, type RecordApi } from '@braindog/record';
import { answerOAuth } from '@braindog/record/oauth';
import { fixOf, type Auth, type Clock, type Result, type Sql } from '@braindog/ports';

import { pinFor, pinnedSend, systemResolve, type Resolve, type Send } from './actions.ts';

/** Where `/oauth/authorize` sends the browser to answer a held request: this file's page, as the Worker's `CONSENT_AT` is. */
const CONSENT_AT = '/oauth/consent';

/** How long an app's metadata document may take to answer before it is treated as not answering, as on the Cloud. */
const DOCUMENT_WAIT_MS = 5_000;

/** The longest name a person's choice of record is read as. A slug is at most thirty-two characters and an id is thirty. */
const RECORD_NAME_MOST = 64;

/** The listening addresses that are this machine alone, as `start` reads them for its limiter. */
const LOOPBACK_BINDS: ReadonlySet<string> = new Set(['127.0.0.1', '::1', 'localhost']);

/**
 * Every path OAuth answers on this host: `/oauth/*`, and the three metadata names under `/.well-known/`, as the Worker's
 * `servesOAuth` and `servesOAuthMeta` read them. A path under these that names no door is the host package's 404.
 */
export const servesOAuth = (pathname: string): boolean =>
  /^\/+oauth(?:\/|$)/.test(pathname) || /^\/+\.well-known\/+oauth-(?:authorization-server\/*|protected-resource(?:\/.*)?)$/.test(pathname);

/** What the session door answered, in the sentence a person at the consent screen reads: the Worker's words exactly. */
const REFUSED: Record<401 | 403 | 429 | 503, string> = {
  401: 'Sign in to BrainDog in this browser, then allow this again.',
  403: 'You cannot connect an app to that record.',
  429: 'Too many requests from this browser. Try again in a minute.',
  503: 'BrainDog could not reach this record. Try again in a minute.',
};

/** What `start` hands this file: the Directory's SQL, the record, and what `start` already decided about sign-in and the socket. */
export type OAuthHereOptions = {
  /** The Directory's SQLite, which holds the store's tables beside the lockout's `dir_fail`. */
  sql: Sql;
  clock: Clock;
  api: RecordApi;
  /** The origin the app is served from: the issuer. */
  origin: string;
  /** Every origin this process answers for, the issuer's among them (`start`'s `origins`). */
  origins: ReadonlySet<string>;
  /** The Directory's sign-in, or `null` where this host holds no sessions. */
  auth: Auth | null;
  mode: CookieMode | null;
  /** The address the socket listens on, `start`'s `host`. */
  listen: string;
  /** `BRAINDOG_TRUST_PROXY=1`: the requests are a proxy's, and the `Host` it sends is not a name a client typed. */
  trustProxy: boolean;
  /** Whether the Directory gives this record `slug` as a name it holds now (`Site.names`). */
  names: (slug: string) => boolean;
  /** How a metadata document is read: a pinned socket and the name service, or a test's own. */
  send?: Send | undefined;
  resolve?: Resolve | undefined;
};

/** The OAuth door this process keeps, built once in `start`. */
export type OAuthHere = {
  /**
   * The origin a request reached this process by, from the `Host` the socket got: one of `origins` when that name is a
   * resource here, and the issuer otherwise. `server.ts` builds the OAuth request at it, so the host package reads the
   * address the client typed.
   */
  originAt: (host: string) => string;
  /** Where `/mcp`'s 401 points a client, as the request reached it, or `undefined` while OAuth is off. */
  metadata: (host: string) => string | undefined;
  /** Every OAuth path. `address` is what `/oauth/register` and `/oauth/authorize` are counted by. */
  serve: (request: Request, address: string) => Promise<Response>;
};

/** A cookie that must ride back on an answer, as the header list `oauthPage` and `oauthError` take. */
const cookieHeader = (cookie: string | undefined): [string, string][] => (cookie === undefined ? [] : [['set-cookie', cookie]]);

/**
 * An app's metadata document, read once: `https:` only, every address its name resolves to checked before anything is
 * sent (`pinFor`), no redirect followed, `DOCUMENT_WAIT_MS` to answer and at most `DOCUMENT_MOST_BYTES`, counted as they
 * arrive. `null` for anything else, which the host package reads as an app it does not know.
 *
 * THE FENCE A SCHEDULED ACTION HAS, BECAUSE THE ADDRESS IS A STRANGER'S. A client id is whatever an authorize request
 * says, and a self-host sits on somebody's own network, so a name resolving to a private address is never asked. A
 * redirect is refused rather than followed because the document must be at the address that is its own id.
 */
async function readDocument(url: string, send: Send, pin: ReturnType<typeof pinFor>): Promise<string | null> {
  try {
    const at = new URL(url);
    if (at.protocol !== 'https:') return null;
    const signal = AbortSignal.timeout(DOCUMENT_WAIT_MS);
    const pinned = await pin(at, signal);
    if (typeof pinned === 'string') return null;
    const out = await send(at, { method: 'GET', headers: { accept: 'application/json' }, redirect: 'manual', signal }, pinned);
    if (out.status !== 200 || out.body === null) {
      await out.body?.cancel().catch(() => undefined);
      return null;
    }
    const reader = out.body.getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > DOCUMENT_MOST_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      parts.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.byteLength;
    }
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return null;
  }
}

/** The person a browser session names, on this record, or the refusal the consent page and Allow both say. */
type Person =
  | { ok: true; ctx: CallContext; person: string; provedAt: number; cookie?: string | undefined }
  | { ok: false; status: 401 | 403 | 429 | 503; say: string; retryAfter?: number | undefined; cookie?: string | undefined };

/**
 * The browser session, and nothing else: `contextFor`'s cookie step in `server.ts`, without the bearer before it or open
 * mode after it.
 *
 * A BEARER IS NEVER A PERSON AT THE CONSENT SCREEN. The server key is the owner and could mint, but it proves nothing
 * about the last fifteen minutes, and an app is let in by a person who just proved who they are (`FRESH`). A bad cookie
 * is cleared, as it is at `/api`, and a rotation rides back on whatever is answered.
 */
async function personOf(request: Request, here: OAuthHereOptions): Promise<Person> {
  if (here.auth === null || here.mode === null) return { ok: false, status: 401, say: REFUSED[401] };
  const sid = readSid(request, here.mode);
  if (sid === undefined) return { ok: false, status: 401, say: REFUSED[401] };
  const clear = clearCookie(here.mode);
  const out = await here.auth({ flow: 'session', sid });
  if (out.status === 429) return { ok: false, status: 429, say: REFUSED[429], retryAfter: out.retryAfter };
  if (out.status === 503) return { ok: false, status: 503, say: REFUSED[503] };
  if (out.status !== 200) return { ok: false, status: 401, say: REFUSED[401], cookie: clear };
  const cookie = out.session === undefined ? undefined : out.session === 'clear' ? clear : sessionCookie(out.session.sid, here.mode);
  const held = here.api.kernel.access(out.body.person);
  if (!held) return { ok: false, status: 403, say: here.api.kernel.memberStopped(out.body.person) ? MEMBER_STOPPED : REFUSED[403], cookie };
  return { ok: true, ctx: sessionContext(out.body, held), person: out.body.person, provedAt: out.body.provedAt, cookie };
}

/**
 * The record a person chose, as this process's record id, or `null` when the name is not this record's. One record is
 * served here, so its id, its own slug and any name the Directory gives it now are the only names that choose anything.
 */
function recordNamed(chosen: string, here: OAuthHereOptions): string | null {
  if (chosen.length > RECORD_NAME_MOST) return null;
  const own = here.api.kernel.identity();
  if (own === null) return null;
  return chosen === own.id || chosen === own.slug || here.names(chosen) ? own.id : null;
}

/** What a person is told when minting answered and no bearer came back, which the record never does on purpose. */
const NOT_MINTED = 'BrainDog could not connect this app to this record.';

/** What the door mints with: the reach, the app's name, the days, and the app the door proved, forwarded as is. */
type MintArgs = Parameters<Extract<Approver, { ok: true }>['mint']>[0];

/**
 * `createToken` on this record, as the person the session named, with the host package's arguments: the bearer, or the
 * record's own sentence and the status `/api` would have answered it with.
 *
 * READ AS A `Result<unknown>` AND CHECKED, because the method's inferred answer joins its refusals' `Result<unknown>` to
 * the kernel's, so the bearer's type is not carried to here; the Worker reads the same field off JSON the same way.
 */
async function mintAs(api: RecordApi, ctx: CallContext, args: MintArgs): Promise<Minted> {
  const out: Result<unknown> = await api.createToken(args, ctx);
  if (!out.ok) return { ok: false, status: httpStatus(out), say: fixOf(out) || NOT_MINTED };
  const bearer = (out.value as { bearer?: unknown } | null)?.bearer;
  return typeof bearer === 'string' ? { ok: true, bearer } : { ok: false, status: 500, say: NOT_MINTED };
}

/** A consent form's choice of one value, as a set of radio buttons inside a labelled group, as the Worker's page draws it. */
function choices(name: string, legend: string, options: { value: string; label: string }[], checked: string): string {
  const rows = options.map(
    (o) =>
      `<label><input type="radio" name="${name}" value="${escapeHtml(o.value)}"${o.value === checked ? ' checked' : ''} required> <span>${escapeHtml(o.label)}</span></label>`,
  );
  return `<fieldset><legend>${escapeHtml(legend)}</legend>\n${rows.join('\n')}\n</fieldset>`;
}

/** The Deny form, which every state of the page offers, so an app can be turned away without signing in. */
const denyForm = (consent: Consent): string =>
  `<form method="post" action="/oauth/deny"><input type="hidden" name="request" value="${escapeHtml(consent.request)}"><button type="submit">Deny ${escapeHtml(consent.client_name)}</button></form>`;

/**
 * `GET /oauth/consent?request=<id>`: who is asking, answered where, for what, on this record, and Allow or Deny.
 *
 * THE PERSON MUST BE SIGNED IN HERE, IN THIS BROWSER, AND RECENTLY, as on the Cloud: a page that is not is one sentence
 * and a way to sign in, with Deny still offered, and the approve door checks the same fifteen minutes again. Only the
 * record's owner is offered Allow, since only an owner may mint a token.
 */
async function consentPage(request: Request, here: OAuthHereOptions, store: OAuthStore): Promise<Response> {
  if (request.method !== 'GET') return oauthError(405, 'invalid_request', 'This address takes GET.', [['allow', 'GET']]);
  const consent = await consentFor(store, new URL(request.url).searchParams.get('request') ?? '');
  if (consent === null) return oauthPage(400, 'This sign-in has ended', `<p>${escapeHtml(REQUEST_GONE)}</p>`);
  const name = escapeHtml(consent.client_name);
  const asking = `<p><strong>${name}</strong> is asking to reach a record of yours. BrainDog will send it back to <span class="host">${escapeHtml(consent.redirect_host)}</span>.</p>`;
  const signIn = (why: string): string =>
    `${asking}\n<p>${escapeHtml(why)}</p>\n<div class="acts"><a class="act main-act" href="/app/signin" target="_blank" rel="noopener">Sign in to BrainDog</a>\n${denyForm(consent)}</div>`;

  const who = await personOf(request, here);
  if (!who.ok)
    return who.status === 401
      ? oauthPage(200, 'Sign in to connect this app', signIn('Sign in to BrainDog in another tab, then come back and reload this page.'), cookieHeader(who.cookie))
      : oauthPage(200, 'Connect this app', `${asking}\n<p>${escapeHtml(who.say)}</p>\n<div class="acts">${denyForm(consent)}</div>`, cookieHeader(who.cookie));
  if (here.clock.now() - who.provedAt > FRESH)
    return oauthPage(
      200,
      'Sign in again to connect this app',
      signIn('You last signed in more than fifteen minutes ago. Sign in again in another tab, then reload this page. If BrainDog shows you as signed in, sign out and in again.'),
      cookieHeader(who.cookie),
    );

  const own = here.api.kernel.identity();
  if (own === null || here.api.kernel.access(who.person)?.level !== 'owner')
    return oauthPage(
      200,
      'Connect this app',
      `${asking}\n<p>Only a record's owner can connect an app to it, and you do not own the record this BrainDog serves.</p>\n<div class="acts">${denyForm(consent)}</div>`,
      cookieHeader(who.cookie),
    );

  const records = choices('record', 'Which record', [{ value: own.slug, label: own.name }], own.slug);
  const reach = choices('scope', 'What it may do', consent.offers.map((s) => ({ value: s, label: scopeSentence(s) })), consent.suggested);
  const html = `${asking}
<p>If you allow it, it can reach the record you choose until it goes ${TOKEN_DAYS} days unused. It is listed under Settings, Agents, by this app's name, and removing it there stops the app at once.</p>
<form method="post" action="/oauth/approve" id="allow">
<input type="hidden" name="request" value="${escapeHtml(consent.request)}">
${records}
${reach}
</form>
<div class="acts"><button type="submit" form="allow" class="main-act">Allow ${name}</button>
${denyForm(consent)}</div>`;
  return oauthPage(200, `Connect ${consent.client_name}`, html, cookieHeader(who.cookie));
}

/**
 * The OAuth door for this process, or the sentence it is off with.
 *
 * THE LOOPBACK NAMES ARE RESOURCES ONLY ON A SOCKET THAT IS THIS MACHINE'S ALONE AND NO PROXY SPEAKS FOR. Behind a
 * trusted proxy the `Host` is whatever the proxy sends, often `127.0.0.1`, and telling a client far away that the
 * resource lives there would point it at its own machine.
 */
export function oauthHere(here: OAuthHereOptions): OAuthHere {
  const issuer = new URL(here.origin);
  const listensHere = LOOPBACK_BINDS.has(here.listen);
  const off =
    here.auth === null || here.mode === null
      ? 'OAuth is off on this BrainDog: nobody can sign in to it from a browser, so nobody could allow an app. The line about signing in that it printed when it started says why.'
      : issuer.protocol !== 'https:' && !listensHere
        ? `OAuth is off on this BrainDog: it signs in at ${here.origin}, which is not encrypted, and that is safe only while it listens on this machine alone. Set BRAINDOG_HOST=127.0.0.1, or serve it at an https address with BRAINDOG_ORIGIN.`
        : null;

  /* EVERY NAME A REQUEST MAY REACH `/mcp` BY, TO THE ORIGIN IT IS AT, and the issuer's own name last, so it wins its own. */
  const byName = new Map<string, string>();
  if (listensHere && !here.trustProxy) for (const o of here.origins) byName.set(new URL(o).host, o);
  byName.set(issuer.host, here.origin);
  const originAt = (host: string): string => byName.get(host.trim().toLowerCase()) ?? here.origin;
  const resources = [...new Set(byName.values())].map((o) => `${o}/mcp`);

  const store: OAuthStore = async (call) => answerOAuth(here.sql, here.clock, call);
  const pin = pinFor(here.resolve ?? systemResolve);
  const send = here.send ?? pinnedSend;

  /* THE HOST DECIDES WHO, THE RECORD DECIDES WHETHER (`Approver`). The name is checked before the session is read, as on
     the Cloud, so a name that is not this record's costs no session lookup. */
  const approver = async (request: Request, chosen: string): Promise<Approver> => {
    const record = recordNamed(chosen, here);
    if (record === null) return { ok: false, status: 403, say: REFUSED[403] };
    const who = await personOf(request, here);
    if (!who.ok) return who;
    const ctx = who.ctx;
    return { ok: true, record, provedAt: who.provedAt, cookie: who.cookie, mint: (args) => mintAs(here.api, ctx, args) };
  };

  const depsFor = (address: string): OAuthDeps => ({
    issuer: here.origin,
    store,
    now: () => here.clock.now(),
    address: address === '' ? null : address,
    /* ON THE ISSUER'S OWN NAME, NEVER THE NAME THE REQUEST CAME IN ON: the session cookie is there, and Allow is accepted
       only from a page on the issuer (`sameOrigin`). */
    consent: (id) => `${here.origin}${CONSENT_AT}?request=${encodeURIComponent(id)}`,
    approver,
    /* AN APP'S ONE-HOUR KEY, minted under the sealed parent by the record's host-only `mintChild`, under the operator's
       cut-off as every bearer is. A parent that no longer works answers `null`, which ends the app's refresh family at
       once; anything else the record refuses is thrown, so a record that is briefly away does not log the app out. */
    child: async (parent, minutes) => {
      const out = await here.api.mintChild(parent, { minutes });
      if (out.ok) return { bearer: out.value.bearer, expires_at: out.value.expires_at };
      const refusal = 'refusal' in out ? out.refusal : null;
      if (refusal?.at === 'parent') return null;
      throw new Error(`The record could not mint an app's key: ${refusal?.code ?? 'CONFLICT'}.`);
    },
    fetchDocument: (url) => readDocument(url, send, pin),
    resources,
  });

  return {
    originAt,
    metadata: (host) => (off === null ? `${originAt(host)}/.well-known/oauth-protected-resource` : undefined),
    serve: async (request, address) => {
      if (off !== null) return oauthError(404, 'invalid_request', off);
      if (/^\/+oauth\/+consent\/*$/.test(new URL(request.url).pathname)) return consentPage(request, here, store);
      return (
        (await serveOAuthDoor(request, depsFor(address))) ??
        oauthError(404, 'invalid_request', 'There is no OAuth endpoint at this address. They are listed at /.well-known/oauth-authorization-server.')
      );
    },
  };
}
