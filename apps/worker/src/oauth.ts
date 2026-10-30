/**
 * OAuth on the Cloud: `@braindog/host/oauth`'s doors with this Worker's store, sessions and records behind them, and
 * the consent page an app's sign-in lands on.
 *
 * THE PROTOCOL IS THE HOST PACKAGE'S AND THIS FILE IS THE WIRING. The store is the Directory object, reached in one
 * RPC (`Directory$.oauth`, over `@braindog/record/oauth`); the person is the browser session `session.ts` already
 * resolves, on the record they chose; the token is minted by that record's own `createToken`, as that person, so the
 * record's ADMIN guard decides whether they may. The self-host wires the same doors to its own store.
 *
 * THE APP'S CONSENT ROUTE HAS LANDED, AND `CONSENT_AT` IS WHERE `/oauth/authorize` SENDS THE BROWSER TO IT
 * (`/connect`). This Worker's own page, server-rendered, no script, below, stays only as the
 * fallback for a link already issued to the old address; it reads the held request, the session and the records the
 * person owns, and posts Allow and Deny to the host's doors, the same as the app's route does.
 *
 * NOTHING HERE IS REACHED BUT THROUGH `route()`'s OAuth branch, and `serveOAuth` answers `null` for any path that is
 * not OAuth's (`servesOAuth`, `servesOAuthMeta`), so the router's own 404 stays the answer to everything else.
 */

import {
  consentFor,
  escapeHtml,
  oauthError,
  oauthPage,
  REQUEST_GONE,
  provedRecently,
  scopeSentence,
  serveOAuthDoor,
  TOKEN_DAYS,
  DOCUMENT_MOST_BYTES,
  type Approver,
  type Consent,
  type Minted,
  type OAuthDeps,
  type OAuthStore,
} from '@braindog/host/oauth';
import type { ChildArgs, Minted as KernelMinted } from '@braindog/kernel';
import type { AuthResult, Result, Who } from '@braindog/ports';
import type { CallContext } from '@braindog/record';
import type { SwitcherRow } from '@braindog/record/directory';
import type { OAuthAnswers, OAuthCall } from '@braindog/record/oauth';

import { inward, isRecordId, legacyHosts, servesOAuth, servesOAuthMeta } from './route.ts';
import { doorOf, withCookie, type Deps as SessionDeps, type Held } from './session.ts';

/**
 * Where `/oauth/authorize` sends the browser to answer a held request: the app's own consent route, which
 * reads the same held request this Worker's fallback page below does.
 */
const CONSENT_AT = '/connect';

/** How long an app's metadata document may take to answer before it is treated as not answering. */
const DOCUMENT_WAIT_MS = 5_000;

/**
 * The two namespaces, as far as this file asks them anything. `index.ts`'s `Env` fits it as it is.
 *
 * WRITTEN STRUCTURALLY, AND THE OBJECTS ARE NAMED BY THE CALLS BELOW, so this file names nothing of `index.ts`, which
 * imports it and holds the Durable Object classes, and so a test can hand `serveOAuth` plain objects for both.
 */
type Namespace<I> = { idFromName(name: string): I; get(id: I): unknown };
export type OAuthEnv<I> = { PUBLIC_HOST?: string | undefined; LEGACY_HOSTS?: string | undefined; DIRECTORY: Namespace<I>; RECORD: Namespace<I> };

/** The Directory's calls this file makes, each an RPC the object already answers, `oauth` with it (a request to `index.ts`). */
type DirectoryCalls = {
  oauth<C extends OAuthCall>(call: C): Promise<OAuthAnswers[C['op']]>;
  auth(call: { flow: 'session'; sid: string; slug?: string }): Promise<AuthResult<Who>>;
  slugOf(record: string): Promise<string | null>;
  recordsFor(person: string): Promise<SwitcherRow[]>;
  madeAt(person: string): Promise<number | null>;
};

/**
 * A record's calls: what it says a person holds, a request to its API, which `inward` has already given a context, and
 * a child key under an app's sealed parent (`Record$.mintChild`).
 */
type RecordCalls = {
  access(person: string): Promise<Held | null>;
  fetch(request: Request): Promise<Response>;
  mintChild(parent: string, args: ChildArgs): Promise<Result<KernelMinted>>;
};

/** The longest name a person's choice of record is read as. A slug is at most thirty-two characters and an id is thirty. */
const RECORD_NAME_MOST = 64;

/**
 * An app's metadata document, read once: `https:` only, no redirect followed, `DOCUMENT_WAIT_MS` to answer and at most
 * `DOCUMENT_MOST_BYTES`, counted as they arrive. `null` for anything else, which the host reads as an app it does not
 * know. A redirect is refused rather than followed because the document must be at the address that is its own id.
 */
async function readDocument(url: string): Promise<string | null> {
  try {
    const out = await fetch(url, { method: 'GET', redirect: 'manual', headers: [['accept', 'application/json']], signal: AbortSignal.timeout(DOCUMENT_WAIT_MS) });
    if (out.status !== 200 || out.body === null) {
      await out.body?.cancel();
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
        await reader.cancel();
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
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return null;
  }
}

/** What the session door answered, in the sentence a person at the consent screen reads. */
const REFUSED: Record<401 | 403 | 429 | 503, string> = {
  401: 'Sign in to BrainDog in this browser, then allow this again.',
  403: 'You cannot connect an app to that record.',
  429: 'Too many requests from this browser. Try again in a minute.',
  503: 'BrainDog could not be reached. Try again in a minute.',
};

/** What the door mints with: the reach, the app's name, the days, and the app the door proved, forwarded as is. */
type MintArgs = Parameters<Extract<Approver, { ok: true }>['mint']>[0];

/**
 * `POST /api/createToken` on one record, as the person the session named, with the host's arguments: the record's own
 * answer, read for the bearer or for its sentence.
 */
async function mintOn(record: RecordCalls, origin: string, ctx: CallContext, args: MintArgs): Promise<Minted> {
  const asked = new Request(`${origin}/api/createToken`, { method: 'POST', headers: [['content-type', 'application/json']], body: JSON.stringify(args) });
  const out = await record.fetch(inward(asked, ctx));
  type Said = { ok?: unknown; value?: { bearer?: unknown }; refusal?: { fix?: unknown } };
  let said: Said | null = null;
  try {
    said = (await out.json()) as Said | null;
  } catch {
    said = null;
  }
  if (said?.ok === true && typeof said.value?.bearer === 'string') return { ok: true, bearer: said.value.bearer };
  const fix = said?.refusal?.fix;
  return { ok: false, status: out.status >= 400 ? out.status : 500, say: typeof fix === 'string' ? fix : 'BrainDog could not connect this app to that record.' };
}

/** The deps both the doors and the consent page read, built once per request and touching no binding until a call needs one. */
function wiring<I>(request: Request, env: OAuthEnv<I>, host: string) {
  const origin = `https://${host}`;
  const directory = (): DirectoryCalls => env.DIRECTORY.get(env.DIRECTORY.idFromName('directory')) as DirectoryCalls;
  const record = (id: string): RecordCalls => env.RECORD.get(env.RECORD.idFromName(id)) as RecordCalls;
  const store: OAuthStore = (call) => directory().oauth(call);
  const session: SessionDeps = {
    origin,
    session: (sid, slug) => directory().auth({ flow: 'session', sid, ...(slug === undefined ? {} : { slug }) }),
    access: (id, person) => record(id).access(person),
  };

  /* THE PERSON, ON THE RECORD THEY CHOSE, THROUGH THE SAME DOOR EVERY `/<slug>/api` CALL TAKES. The Directory says
     whether the name is theirs before any record is addressed, and `doorOf` holds a POST to this origin (`12 §8`).
     A record's id is turned into its name first, so the one path a slug takes is the only path there is. */
  const approver = async (asked: Request, chosen: string): Promise<Approver> => {
    if (chosen.length > RECORD_NAME_MOST) return { ok: false, status: 403, say: REFUSED[403] };
    const slug = isRecordId(chosen) ? await directory().slugOf(chosen) : chosen;
    if (slug === null) return { ok: false, status: 403, say: REFUSED[403] };
    const door = await doorOf(asked, session, slug);
    if (door.door === 'session') {
      const ctx = door.ctx;
      const on = record(door.record);
      const person = ctx.principal.kind === 'person' ? ctx.principal.id : null;
      const since = person === null ? null : await directory().madeAt(person);
      return { ok: true, record: door.record, provedAt: ctx.provedAt ?? 0, since: since ?? undefined, cookie: door.cookie, mint: (args) => mintOn(on, origin, ctx, args) };
    }
    if (door.door === 'refused')
      return { ok: false, status: door.status, say: door.status === 403 ? (door.refusal?.fix ?? REFUSED[403]) : REFUSED[door.status], retryAfter: door.retryAfter, cookie: door.cookie };
    return { ok: false, status: 403, say: 'Allowing an app needs you signed in to BrainDog in this browser, and a shared link or a key cannot do it.' };
  };

  const deps: OAuthDeps = {
    issuer: origin,
    store,
    now: () => Date.now(),
    /* THE ADDRESS CLOUDFLARE WRITES AND A CALLER CANNOT, as the sign-in lockout counts it. */
    address: request.headers.get('cf-connecting-ip'),
    /* ON THE ISSUER'S OWN NAME, NEVER THE NAME THE REQUEST CAME IN ON. `/oauth/*` is also answered on a legacy name
       (`legacyRedirect` spares it), and Allow is accepted only from a page on the issuer (`sameOrigin`), so a consent
       page drawn on the old name would be one whose Allow always failed. */
    consent: (id) => `${origin}${CONSENT_AT}?request=${encodeURIComponent(id)}`,
    approver,
    /* AN APP'S ONE-HOUR KEY, minted by the record the parent's first half names (`Record$.mintChild`, an RPC and never a
       route). A parent that no longer works answers `null`, which ends the app's refresh family at once; anything else
       the record refuses is thrown, so a record that is briefly away does not log the app out. */
    child: async (parent, minutes) => {
      const id = parent.split('.')[0] ?? '';
      if (id === '' || id.length > RECORD_NAME_MOST) return null;
      const out = await record(id).mintChild(parent, { minutes });
      if (out.ok) return { bearer: out.value.bearer, expires_at: out.value.expires_at };
      const refusal = 'refusal' in out ? out.refusal : null;
      if (refusal?.at === 'parent') return null;
      throw new Error(`The record could not mint an app's key: ${refusal?.code ?? 'CONFLICT'}.`);
    },
    fetchDocument: readDocument,
    /* THE OLD NAME IS THE SAME RESOURCE. `brain.dog/mcp` still answers (`legacyRedirect` spares it), and an app set up
       with it, the Claude Code plugin's first address among them, checks the metadata's `resource` against it: its 401
       sends it to `brain.dog`'s metadata (`mcpMetadataAt`), which names `brain.dog/mcp` from here, and a token minted for
       either name works at both. */
    resources: legacyHosts(env.LEGACY_HOSTS)
      .filter((h) => h !== host.toLowerCase())
      .map((h) => `https://${h}/mcp`),
  };
  return { deps, session, directory };
}

/** A consent form's choice of one value, as a set of radio buttons inside a labelled group. */
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
 * `GET /oauth/consent?request=<id>`: who is asking, answered where, for what, on which record, and Allow or Deny.
 *
 * THE PERSON MUST BE SIGNED IN HERE, IN THIS BROWSER, AND RECENTLY. A page that is not is one sentence and a way to
 * sign in, with Deny still offered; the approve door checks the same fifteen minutes again, because a page is only a
 * picture of the moment it was drawn. Only records the person owns are offered, since only an owner may mint a token.
 */
async function consentPage(request: Request, wired: { session: SessionDeps; directory: () => DirectoryCalls; store: OAuthStore; now: () => number }): Promise<Response> {
  if (request.method !== 'GET') return oauthError(405, 'invalid_request', 'This address takes GET.', [['allow', 'GET']]);
  const consent = await consentFor(wired.store, new URL(request.url).searchParams.get('request') ?? '');
  if (consent === null) return oauthPage(400, 'This sign-in has ended', `<p>${escapeHtml(REQUEST_GONE)}</p>`);
  const name = escapeHtml(consent.client_name);
  const asking = `<p><strong>${name}</strong> is asking to reach a record of yours. BrainDog will send it back to <span class="host">${escapeHtml(consent.redirect_host)}</span>.</p>`;
  const signIn = (why: string): string =>
    `${asking}\n<p>${escapeHtml(why)}</p>\n<div class="acts"><a class="act main-act" href="/signin" target="_blank" rel="noopener">Sign in to BrainDog</a>\n${denyForm(consent)}</div>`;

  const door = await doorOf(request, wired.session, null);
  if (door.door !== 'session') {
    const out =
      door.door === 'refused' && door.status === 401
        ? oauthPage(200, 'Sign in to connect this app', signIn('Sign in to BrainDog in another tab, then come back and reload this page.'))
        : oauthPage(200, 'Connect this app', `${asking}\n<p>${escapeHtml(door.door === 'refused' ? (door.refusal?.fix ?? REFUSED[door.status]) : REFUSED[403])}</p>\n<div class="acts">${denyForm(consent)}</div>`);
    return withCookie(out, door.door === 'refused' ? door.cookie : undefined);
  }
  const made = door.ctx.principal.kind === 'person' ? await wired.directory().madeAt(door.ctx.principal.id) : null;
  if (!provedRecently(wired.now(), door.ctx.provedAt ?? 0, made ?? undefined))
    return withCookie(
      oauthPage(200, 'Sign in again to connect this app', signIn('You last signed in more than fifteen minutes ago. Sign in again in another tab, then reload this page. If BrainDog shows you as signed in, sign out and in again.')),
      door.cookie,
    );

  /* A SESSION'S CONTEXT IS A PERSON'S (`sessionContext`), and the check is here so no other kind is ever asked about. */
  const person = door.ctx.principal.kind === 'person' ? door.ctx.principal.id : null;
  const owned = person === null ? [] : (await wired.directory().recordsFor(person)).filter((r) => r.level === 'owner');
  if (owned.length === 0)
    return withCookie(
      oauthPage(200, 'Connect this app', `${asking}\n<p>Only a record's owner can connect an app to it, and you own no record here.</p>\n<div class="acts">${denyForm(consent)}</div>`),
      door.cookie,
    );

  const records = choices('record', 'Which record', owned.map((r) => ({ value: r.slug, label: r.name })), owned[0]?.slug ?? '');
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
  return withCookie(oauthPage(200, `Connect ${consent.client_name}`, html), door.cookie);
}

/**
 * Every OAuth path on the Cloud, or `null` for a path that is not OAuth's.
 *
 * WITHOUT `PUBLIC_HOST` THERE IS NO ISSUER, so every OAuth path answers one 404 that says why, in OAuth's words: a
 * metadata document naming an empty host would send an app's browser nowhere.
 */
export async function serveOAuth<I>(request: Request, env: OAuthEnv<I>): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (!servesOAuth(path) && !servesOAuthMeta(path)) return null;
  const host = (env.PUBLIC_HOST ?? '').trim();
  if (host === '') return oauthError(404, 'invalid_request', 'OAuth is off on this BrainDog: it has no public address (PUBLIC_HOST) to name itself by.');
  const { deps, session, directory } = wiring(request, env, host);
  if (/^\/+oauth\/+consent\/*$/.test(path)) return consentPage(request, { session, directory, store: deps.store, now: deps.now });
  return serveOAuthDoor(request, deps);
}
