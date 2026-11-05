/**
 * Which record a request is for.
 *
 * ITS OWN FILE, and free of `cloudflare:`, because what it returns is the argument to `idFromName` —
 * and that string IS the tenant boundary. A request that resolves to the wrong record is one
 * customer reading another's, which is not a thing to leave untested because the file it would
 * otherwise live in cannot be loaded outside workerd.
 *
 * THE BEARER NAMES THE RECORD, AND THE PATH DOES NOT. This claimed `/r/<slug>/api/<method>` as the
 * tenant prefix — a shape no document describes, sitting exactly on top of one that four of them do:
 * `/r/<register>` is the register list (19 §2), `/r/<register>/<seq>` is an entry, `{{ref:tasks#125}}`
 * renders `/r/tasks/125` (36), and `apps/web/src/routes/r/[register]/` is the page that draws it. Put
 * the Worker in front of the app as 33 §4's `run_worker_first` describes and every register link in
 * the product answers "There is no record called obligations."
 *
 * 33 §4 says it plainly: the surface is `/api/<method>`, and "a request names its record by the
 * `rec` cookie (browser), by the bearer's hash, or by its own path". A bearer is `<rec_id>.<secret>`
 * — the record id is the half in front of the dot, which is why `verifyToken` can refuse a bearer
 * minted for another record. Reading it here costs no hop and claims no URL.
 */

import { sessionOf, withSession, type IngestArrival, type IngestDoor, type IngestVerify } from '@braindog/host';
import { clearCookie, COOKIE } from '@braindog/host/auth';
import { fixOf, type Result, type Snapshot } from '@braindog/ports';
import type { CallContext } from '@braindog/record';
import { badSlug } from '@braindog/record/directory';

import { op } from './oplog.ts';

/** The address half of a bearer. Checked as a shape, never as a credential — that is the record's. */
const REC_ID = /^rec_[0-9A-HJKMNP-TV-Z]{26}$/;

/**
 * The record a bearer says it is for, or `null`.
 *
 * IT IS A CLAIM AND NOT A FACT. Everything this establishes is which object to ask; the object then
 * compares the secret's hash against its own table and refuses a bearer it does not know. The two
 * halves are deliberately in different places: only the object holding the table can say whether the
 * hash is in it, and asking anywhere else would be a search across every customer.
 *
 * THE SHAPE IS CHECKED BEFORE THE STRING IS USED AS AN ADDRESS, because `idFromName` on a name
 * nobody has CREATES an object rather than failing — so an unchecked id is an attacker minting empty
 * records, and the caller asks the Directory whether this one is ours before addressing it at all.
 */
export function recordOf(authorization: string | null): string | null {
  const bearer = /^Bearer\s+(.+)$/i.exec(authorization ?? '')?.[1];
  if (!bearer) return null;
  const cut = bearer.indexOf('.');
  const record = cut < 0 ? '' : bearer.slice(0, cut);
  return REC_ID.test(record) ? record : null;
}

/**
 * Whether this Worker answers for this path at all.
 *
 * 33 §4'S OWN LIST, AND ONLY THE PART THAT IS BUILT. `/a/*`, `/s/*` and `/ws` belong to this Worker
 * in the document and do not exist yet, and a router claiming them now would answer 401 for routes
 * whose whole point is being reachable without one. `/auth/*`, `/mcp` and `/in/*` are built, and are
 * `servesAuth`, `servesMcp` and `servesIn` below. Everything outside them is the app's: that is what
 * `run_worker_first` means.
 */
export const servesApi = (pathname: string): boolean => /^\/+api\/+[^/]/.test(pathname);

/** `/auth/*`: sign-in, which is the Directory's and never reaches a record (`51 §5.8`). */
export const servesAuth = (pathname: string): boolean => /^\/+auth(?:\/|$)/.test(pathname);

/** `/account/*`: a signed-in person's account, which is the Directory's and never reaches a record. */
export const servesAccount = (pathname: string): boolean => /^\/+account(?:\/|$)/.test(pathname);

/**
 * `/mcp`: an agent's MCP client, with its bearer and nothing else.
 * One path and no subpaths, because the transport is one endpoint and `run_worker_first` names it alone.
 */
export const servesMcp = (pathname: string): boolean => /^\/+mcp\/*$/.test(pathname);

/**
 * `/in/*`: something arrives from outside, and nobody is asked who it is (`33 §4`, `51 §5.4`).
 *
 * A PREFIX AND NOT A SHAPE, because the shapes are `servesIngest`'s and the two must not be written
 * twice. This says only that the path is the arrival door's rather than the app's, which is the one
 * question a router asks; a path under `/in/` that no host serves is `serveIngest`'s 404, and
 * routing it to the app instead would answer `index.html` and a 200, which a sender's retry logic
 * reads as delivered.
 *
 * IT IS BEFORE EVERY DOOR AND CARRIES NO CREDENTIAL. The cookie is never read here and no bearer is
 * asked for: an arrival is above the auth gate by design, and what stands in for a principal is
 * whether the payload was verified, which decides only whether the stored row may match (`12 §3`).
 */
export const servesIn = (pathname: string): boolean => /^\/+in(?:\/|$)/.test(pathname);

/**
 * `/oauth/*`: OAuth 2.1's endpoints, with BrainDog as its own authorization server, and the
 * consent page this Worker draws until the app has its own (`oauth.ts`).
 *
 * A PREFIX AND NOT A LIST, for `servesIn`'s reason: which endpoints exist is `@braindog/host/oauth`'s to say, and a path
 * under the prefix that names none is its 404 in OAuth's words, never the app shell's 200. It is the Directory's
 * business and never a record's until a person allows an app, so no record is addressed to answer it.
 */
export const servesOAuth = (pathname: string): boolean => /^\/+oauth(?:\/|$)/.test(pathname);

/**
 * The OAuth metadata an MCP client discovers from `/mcp`'s 401: the protected resource's (RFC 9728), at the root and
 * under the resource's own path, and the authorization server's (RFC 8414).
 *
 * THESE NAMES AND NOT `/.well-known/*`, as `servesBuild` is one name and not the prefix: `security.txt` is the site's,
 * and the site forwards exactly these (`apps/site/wrangler.jsonc`). Anything under the protected resource's name is
 * this Worker's, because RFC 9728 inserts the resource's path there; a path that is not `/mcp` is answered 404.
 */
export const servesOAuthMeta = (pathname: string): boolean =>
  /^\/+\.well-known\/+oauth-(?:authorization-server\/*|protected-resource(?:\/.*)?)$/.test(pathname);

/**
 * `/.well-known/braindog-build`: which version of this Worker is answering, and no record is asked.
 *
 * IT IS NOT A RECORD QUESTION, which is the whole reason it is not `/api/version`. That route is
 * `READ+` because it answers one record's own activity cursor, so reading the deployed build through
 * it meant carrying a bearer for a question with no record in it. The build id is a property of the
 * Worker version, so it is answered where nothing has to be opened to read it. `33 §4` puts the
 * `/.well-known/braindog-key` that `braindog verify` reads beside it, under the same rule and with no
 * credential. This Worker answers that one per record, at `/<slug>/.well-known/braindog-key`
 * (`servesKey` below), and `test/build.test.ts` pins this prefix to `braindog-build` alone.
 *
 * `/.well-known/*` IS IN `run_worker_first`, which is what makes this path the Worker's at all. Off
 * that list the app shell answers here with `index.html` and a 200, which is worse than a 404
 * because it looks like a working endpoint (`apps/worker/wrangler.jsonc`).
 */
export const servesBuild = (pathname: string): boolean => /^\/+\.well-known\/+braindog-build\/*$/.test(pathname);

/**
 * `/.well-known/apple-app-site-association`: which Apple apps may use this name's passkeys (`webcredentials`), the Mac
 * app's (`apple.ts`). Apple's servers fetch it from each name the app lists, `app.brain.dog` here and `brain.dog`
 * through the site, so the site forwards it too (`apps/site/wrangler.jsonc`). One name, as `servesBuild` is.
 */
export const servesAppleAssociation = (pathname: string): boolean => /^\/+\.well-known\/+apple-app-site-association\/*$/.test(pathname);

/**
 * `/.well-known/braindog-key`: the key a record's exports are signed with (`03 §4`), under a slug on this Worker.
 *
 * A PATH AFTER THE SLUG AND NOT AT THE ROOT, BECAUSE ONE WORKER SERVES MANY RECORDS. `03 §4` puts the key at the host's
 * root, which on a self-host is one record and here is every record on the deployment, each signing with its own key.
 * So the router asks this of `appPath`'s `rest` alone, at `/<slug>/...` and at the old `/app/<slug>/...`, which the site
 * still forwards for a key fetched before the move. THE ROOT IS LEFT TO THE ROUTER'S 404: the site forwards no
 * `/.well-known/braindog-key`, so an answer there would be one `app.brain.dog` gives and `brain.dog` never does, and
 * `test/site-binding.test.ts` holds every root branch of `route()` to a door the site forwards.
 */
export const servesKey = (pathname: string): boolean => /^\/+\.well-known\/+braindog-key\/*$/.test(pathname);

/**
 * `GET /api/snapshots/<id>`: one kept copy as a file, which is the self-host's door (`49 §5.13`). The id, or `null`.
 *
 * THE WORKER ANSWERS IT WITH A SENTENCE AND NEVER A FILE. Without this the path fell through to the method router and
 * answered `ROUTE_UNKNOWN`, while `snapshot`, `snapshots` and `restore` on the same record answered otherwise, so one
 * question had two answers depending on which door it was asked at. `copyRefusal` says which sentence.
 */
export const copyAsked = (method: string, pathname: string): string | null =>
  method === 'GET' ? (/^\/+api\/+snapshots\/+([^/]+)\/*$/.exec(pathname)?.[1] ?? null) : null;

/**
 * What a copy's door answers where no file can be streamed: the list's own refusal when the record keeps no copies, the
 * reason a copy it does keep cannot be handed over, or that this id is not one of its copies.
 *
 * A COPY THE LIST SHOWS IS NEVER ANSWERED AS ABSENT. Before the Worker kept copies the list always refused, and the
 * last line below was written for a list that "should ever answer". Once `Record$` handed the record `copies.ts`, it
 * answered every id that way, the one the list had just shown included (`test/copy.test.ts`). A Cloud copy is sealed to
 * the operator's backup recipient and this Worker holds only the public half (`12 §8`), so the bytes would open for
 * nobody who asked for them; the sentence names the two doors that do what they wanted.
 */
export async function copyRefusal(id: string, list: () => Promise<Result<Snapshot[]>>): Promise<Result<Snapshot[]>> {
  const listed = await list();
  if (!listed.ok) return listed;
  if (listed.value.some((copy) => copy.id === id))
    return {
      ok: false,
      refusal: {
        code: 'NOT_IN_THIS_BUILD',
        fix: `${id} is kept sealed to the operator's backup key, which this app never holds, so it cannot be downloaded here. Going back to it is Restore, and a file of the record as it is now is Export.`,
        at: 'id',
      },
    };
  return { ok: false, refusal: { code: 'OUT_OF_BOUNDS', fix: `${id} is not one of the copies kept here.`, at: 'id' } };
}

/** Whether a request is the version poll: `GET /api/version`, the one call a tab makes on a clock. */
export const pollAsked = (method: string, pathname: string): boolean => (method === 'GET' || method === 'HEAD') && /^\/+api\/+version\/*$/.test(pathname);

/** `POST /api/restore`, the one method whose answer the Worker acts on after the record has given it. */
export const restoreAsked = (method: string, pathname: string): boolean => method === 'POST' && /^\/+api\/+restore\/*$/.test(pathname);

/**
 * What was restored, as the record's `restored` takes it: the copy, the copy of what it was, and who asked, and what the
 * record had ended before the rewind, which `restored` ends again on the object that comes back.
 */
export type Restored = { bookmark: string; kept: string | null; by: string; ended?: unknown };

/**
 * `51 D15`'s second half, after the record has answered a restore: reset the object, then write `restore.pitr` on the
 * object that comes back. `out` is handed back unchanged, because the restore is done by then whatever follows.
 *
 * `reset` IS THE OBJECT'S `reopen`, AND ITS REJECTING IS THE EXPECTED ANSWER. `ctx.abort()` ends the object in the middle
 * of the call, so the caller sees a rejection; `false` is an object that armed nothing, a port that put rows back in
 * place and wrote the event itself, and then there is no second call to make. `restored` goes to the object PITR
 * started, which only a stub asked for after the reset reaches: the old stub is broken by the abort.
 *
 * A SECOND CALL THAT FAILS IS SAID, NOT ANSWERED. The record is back at the copy by then and the receipt `copies.ts`
 * put beside it says how, so turning the owner's 200 into a refusal would tell them a restore that happened did not. What
 * is missing is one event, and the line says which copy it was for.
 *
 * AND A REFUSED RESTORE IS RESET TOO, BECAUSE ONE CAN BE REFUSED AFTER IT WAS ARMED. When the bucket refuses the receipt,
 * `copies.ts` calls the restore off by arming the undo bookmark, and there is no call that disarms: the object is still
 * set to go back, to the moment of the first arm, at its next start. Left running, every write it accepted until an
 * eviction would be taken by that rewind. Measured: the Worker reset nothing for a refused restore
 * (`test/restore-in-do.test.ts`, the restore called off). `reopen` answers `false` for an object that armed nothing, so
 * asking after every refusal costs one call and resets only what is armed. No `restore.pitr` follows, since none happened.
 */
export async function afterRestore(
  out: Response,
  by: string,
  o: { reset: () => Promise<boolean>; restored: (args: Restored) => Promise<Result<unknown>> },
): Promise<Response> {
  const args = await restoredOf(out, by);
  let reset = true;
  try {
    reset = await o.reset();
  } catch {
    /* The object ended, which is what was asked of it. */
  }
  if (reset && args !== null) await written(args, o.restored);
  return withoutEnded(out);
}

/**
 * The record's answer as the owner reads it, without the `ended` it carried for `restored`: that list is for the object
 * that comes back, and the answer is the one a restore that puts rows back in place gives.
 */
async function withoutEnded(out: Response): Promise<Response> {
  const said = (await out
    .clone()
    .json()
    .catch(() => null)) as { ok?: unknown; value?: Record<string, unknown> } | null;
  if (said?.ok !== true || said.value === null || typeof said.value !== 'object' || !('ended' in said.value)) return out;
  const { ended: _, ...value } = said.value;
  /* THE RECORD'S OWN HEADERS, `no-store` among them, less a length that was the longer body's. */
  const answer = new Response(JSON.stringify({ ...said, value }), { status: out.status, statusText: out.statusText, headers: out.headers });
  answer.headers.delete('content-length');
  return answer;
}

/**
 * What a restore's answer says was restored, as `restored` takes it, or `null` for an answer that restored nothing.
 *
 * READ BY BOTH ENDS, AND THAT IS WHY IT IS ONE FUNCTION. The Worker reads it off the answer it is about to hand back, and
 * `Record$` reads it off the same answer as it leaves, for the case where the Worker never gets as far as the second call
 * (`recoverRestore` below). Two readers of one body that disagreed would write two different events for one restore.
 */
export async function restoredOf(out: Response, by: string): Promise<Restored | null> {
  const said = (await out
    .clone()
    .json()
    .catch(() => null)) as Result<{ bookmark?: unknown; kept?: unknown }> | null;
  if (out.status !== 200 || said?.ok !== true || typeof said.value.bookmark !== 'string') return null;
  const ended = (said.value as { ended?: unknown }).ended;
  return { bookmark: said.value.bookmark, kept: typeof said.value.kept === 'string' ? said.value.kept : null, by, ...(ended === undefined ? {} : { ended }) };
}

/**
 * `restore.pitr` on the object that came back, and an `op: 'restore'` line when it could not be written: the record is
 * back at `bookmark` either way, and the line is the only place the missing event is said.
 */
async function written(args: Restored, restored: (args: Restored) => Promise<Result<unknown>>): Promise<void> {
  try {
    const wrote = await restored(args);
    if (!wrote.ok) op({ op: 'restore', ok: false, bookmark: args.bookmark, why: 'refused', fix: fixOf(wrote) }, 'error');
  } catch (e) {
    op({ op: 'restore', ok: false, bookmark: args.bookmark, why: 'thrown', error: e instanceof Error ? e.message : String(e) }, 'error');
  }
}

/**
 * What an armed object says when its restore has answered and nobody reset it: what that restore restored, or `null`
 * when it restored nothing but is still set to go back (a restore called off after it was armed).
 */
export type Stranded = { restored: Restored | null };

/**
 * `51 D15`'s second half, run by whichever request next finds the record armed, when the one that asked for the restore
 * never ran it. `true` when the object was reset, so the caller can ask the object that came back.
 *
 * WHY THE WORKER WAS NOT ENOUGH. `afterRestore` runs in the invocation that forwarded the restore, after the record has
 * answered, and nothing else ever ran it. Measured in `test/restore-armed.test.ts` with that continuation dropped: the
 * object stayed armed, every door answered 500 for as long as it lived, and `restore.pitr` was never written, because
 * the eviction that finally rewound it is not followed by any call. A browser leaving the page mid-restore, a CPU limit
 * or a deploy is enough to drop it, and a restore is the request most likely to be slow.
 *
 * `stranded` IS ASKED FIRST, AND IT SAYS NO WHILE A RESTORE IS STILL RUNNING. Between the arm and the answer the object
 * is armed on purpose, `copies.ts` is putting its receipt, and a reset there would fail the restore that is running. The
 * object counts its restores in flight and answers `null` until the last one has answered.
 *
 * ONE RESET WRITES THE EVENT, EVEN WHEN TWO RACE. The Worker's own `afterRestore` and a request that arrived between its
 * two calls can both find the object armed. Only one `reopen` ends it; the other reaches the object that came back,
 * which is armed with nothing and answers `false`, and a `false` writes nothing, here and in `afterRestore` alike.
 */
export async function recoverRestore(o: {
  stranded: () => Promise<Stranded | null>;
  reset: () => Promise<boolean>;
  restored: (args: Restored) => Promise<Result<unknown>>;
}): Promise<boolean> {
  const left = await o.stranded();
  if (left === null) return false;
  let reset = true;
  try {
    reset = await o.reset();
  } catch {
    /* The object ended, which is what was asked of it. */
  }
  if (reset && left.restored !== null) await written(left.restored, o.restored);
  return true;
}

/**
 * The Directory's reserved words that no route of the app answers, for `appPath`'s refusal of an API path under one.
 *
 * `api` IS REFUSED ON ITS OWN, AND `p`, `r` AND `s` ARE LEFT OUT because each is a page with a parameter under it
 * (`p/[slug]`, `r/[register]`, `s/[token]`). The rest of the reserved set is the app's own routes, which are pages too.
 */
const NOT_A_PAGE = new Set(['auth', 'mcp', 'a', 'in', 'ws', 'admin', 'app', 'assets', 'static', 'www', 'new']);

/**
 * THE FIRST SEGMENTS THIS WORKER ANSWERS ITSELF AT THE ROOT, OR KEEPS FOR A DOOR NOT YET BUILT, and the app never draws.
 * `route()` hands the built ones to their doors before `appPath` is asked, so what reaches `appPath` with one of these in
 * front is a path no door serves, and the router's own 404 is its answer: the shell's 200 to an agent's `/a/x` or a
 * monitor's `/ws` would look like a working endpoint. The web app keeps the same list as `DOORS` (`apps/web/src/lib/at.ts`).
 */
const ROOT_DOORS = new Set(['api', 'auth', 'account', 'mcp', 'in', 'oauth', 'a', 'ws', 'healthz', 'app']);

/**
 * An address from before the app moved to the root, with `/app` taken off the front: `/app/acme/r` is `/acme/r` and
 * `/app` is `/`. `null` for an address that never had it.
 */
export function unprefixed(pathname: string): string | null {
  const m = /^\/+app(?:\/+(.*))?$/.exec(pathname);
  return m === null ? null : `/${m[1] ?? ''}`;
}

/**
 * A path of the app: the record it names, if any, and the path the app or the record reads once `/<slug>` is gone.
 *
 * THE APP IS AT THE ROOT, AND `/app` IN FRONT IS THE ADDRESS IT HAD BEFORE. A page load under `/app` is a 308 to the same
 * address without it (`legacyRedirect`), so what still reaches here with the prefix is what may not be redirected: a
 * CLI's or an agent's `/app/<slug>/api/<method>`, whose hosts file was written before the move and which refuses every
 * redirect. Both spellings are read the same way, so a token handed out on either address keeps working.
 *
 * THE FIRST SEGMENT IS A PAGE OR A RECORD'S NAME, AND THE DIRECTORY'S `badSlug` ALONE SAYS WHICH. A string it would
 * accept as a name is a slug; a word the app routes (`settings`, `signin`, `catalogue`), a spoken id (`d41`) and a file
 * (`mark.svg`) are all refused as names there, so here they are the app's own paths with no record named, which means
 * the record the session is on. A zone route takes a wildcard only at the end of its path, so no route can pick out the
 * API under a slug, which is why the Worker takes every path and strips the slug itself.
 *
 * WHAT COMES BACK AS `slug` IS A CLAIM AND NOT A RECORD. `doorOf` has the Directory say whether it is this person's
 * before anything is addressed. `/_app/*` is the build's chunks, which the static assets serve and `run_worker_first`
 * keeps away from this Worker, and `/.well-known/*` is the host's, so neither is an app path at all; nor is a door's
 * word (`ROOT_DOORS`).
 */
export type AppPath = { slug: string | null; rest: string };

export function appPath(pathname: string): AppPath | null {
  const m = /^\/+([^/]*)([\s\S]*)$/.exec(unprefixed(pathname) ?? pathname);
  if (!m) return null;
  const segment = m[1] ?? '';
  const tail = m[2] ?? '';
  if (segment === '') return { slug: null, rest: tail === '' ? '/' : tail };
  if (segment.startsWith('_') || segment.startsWith('.')) return null;
  /* `/api/*` AND `/app/api/*` NAME NO RECORD AND NO PAGE, SO THEY ARE NOT AN APP PATH: the root's is the record the
     bearer or the session names, which `route()` answers below this, and the old prefix's is the router's own
     `ROUTE_UNKNOWN`. `api` is a word the Directory never hands out, so it fell to the line below as a page, the rest was
     `/api/boot`, and the Worker served a second copy of the root `/api`. Measured through the bundle in
     `test/slug-api.test.ts`: a GET with no credential answered 200 from the public demo's record (the demo is gone
     since), a cookie reached its session's record, and `/app/api/vault/deposit` with a grant went past the key doors' own
     check, which reads the slug and saw none, into `doorOf` and the record's `verify`. */
  if (ROOT_DOORS.has(segment)) return null;
  if (badSlug(segment) === null) return { slug: segment, rest: tail === '' ? '/' : tail };
  /* NOR AN API PATH UNDER A WORD THAT CAN ONLY BE A MISTAKE. Measured on
     production: `/app/Acme/api/boot`, `/app/admin/api/boot` and `/app/www/api/boot` fell to the line below as pages and
     answered the shell with a 200, which a JSON client with a mistyped slug reads as success. NOT EVERY WORD THAT IS
     NOT A NAME: ten of the app's routes take a parameter as their second segment (`r/[register]`, `settings/[area]`
     and eight more under `apps/web/src/routes/`), so `/r/api` is a register page. Only the upper-case spelling of
     a name and a reserved word the app does not route are certainly not pages. */
  if (/^\/+api(?:\/|$)/.test(tail) && (NOT_A_PAGE.has(segment) || badSlug(segment.toLowerCase()) === null)) return null;
  return { slug: null, rest: `/${segment}${tail}` };
}

/**
 * A page of the app as the static assets gave it, with the four headers that say nobody may frame it or sniff it and
 * that its links send no referrer off the site.
 *
 * MEASURED ON PRODUCTION: NONE OF THEM ON ANY ANSWER, the shell and the sign-in page included. They are
 * set here because this is the only place certain to reach a page: whether `apps/web/static/_headers` survives a
 * response fetched through the `ASSETS` binding was not measured. None of them touches the passkey ceremony, which runs in
 * the top-level page and posts to its own origin, where `same-origin` still sends both `Origin` and `Referer`.
 *
 * AND HSTS, COOP AND PERMISSIONS-POLICY (`PAGE_HARDENING`). HSTS was left to a zone setting nobody turned on: measured on
 * 5 Nov, neither `app.brain.dog` nor `brain.dog` sent it, so a first visit typed without `https://` went out in the clear.
 * It names this host alone and carries no `includeSubDomains`, since a name somebody once pointed elsewhere must not stop
 * answering for it. `same-origin` on the opener means a page this one opens, or that opened it, holds no handle to it.
 * The app asks for no camera, microphone or place, so a frame or a script that got in cannot either.
 *
 * THE POLICY IS THE ONE THE PAGE ALREADY CARRIES (`pagePolicy`), so it names the very hashes of the build it rides on
 * and no deploy of the Worker can fall out of step with a build of the app. `path` is the address asked for, which
 * decides whether Turnstile stays in it; without one the page keeps its own policy whole, Turnstile included, which is
 * the looser of the two and never the one that blanks the sign-up page.
 *
 * A NEW RESPONSE AND NEVER THE ONE HANDED IN, because the runtime refuses to change the headers of a response a
 * binding returned ("Can't modify immutable headers"), and `test/shell-headers.test.ts` hands in one that refuses too.
 */
export async function asPage(out: Response, path?: string): Promise<Response> {
  const html = /^text\/html\b/i.test(out.headers.get('content-type') ?? '');
  /* ONLY A PAGE IS READ, and it is a few kilobytes. The same bytes go back out, so nothing is decoded and encoded again. */
  const bytes = html && out.body !== null ? await out.arrayBuffer() : null;
  const page = new Response(bytes ?? out.body, out);
  const policy = !html
    ? `${FILE_POLICY}; frame-ancestors 'none'`
    : pagePolicy(bytes === null ? '' : new TextDecoder().decode(bytes), path === undefined || SIGNUP.test(path));
  page.headers.set('content-security-policy', policy);
  page.headers.set('x-frame-options', 'DENY');
  page.headers.set('x-content-type-options', 'nosniff');
  page.headers.set('referrer-policy', 'same-origin');
  for (const [name, value] of PAGE_HARDENING) page.headers.set(name, value);
  /* NO PAGE OF THE APP IS FOR A SEARCH ENGINE: every one is a record, a sign-in or a door to one, and the site at
     brain.dog is what is indexed. A header and not a `robots.txt` disallow, because a crawler kept out never reads
     the noindex and may still list the bare address. */
  page.headers.set('x-robots-tag', 'noindex, nofollow');
  return page;
}

/** What every page says of how it is reached and what it may ask for. The self-host keeps the last two in `shell.ts`. */
export const PAGE_HARDENING = [
  ['strict-transport-security', 'max-age=31536000'],
  ['cross-origin-opener-policy', 'same-origin'],
  ['permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=(), midi=()'],
] as const;

/** Cloudflare Turnstile's origin, for its script and its frame, which only the sign-up page loads. */
const TURNSTILE = 'https://challenges.cloudflare.com';

/** The pages that may keep Turnstile: sign-up and sign-in take no record name, so they have no slug in front. */
const SIGNUP = /^\/(signup|signin)\/?$/;

/**
 * The policy on a file beside the pages: a script, a stylesheet, a font or an image. Nothing inline runs in any of
 * them, and an SVG opened on its own is a document that could, so it is the strictest there is.
 */
const FILE_POLICY = "default-src 'self'; object-src 'none'; base-uri 'none'";

/**
 * The header for a page: the policy SvelteKit wrote into its `<meta>` (`kit.csp` in `apps/web/svelte.config.js`),
 * with Turnstile's origin taken out unless `turnstile`, and `frame-ancestors 'none'`, which a meta tag cannot carry.
 *
 * A PAGE WITH NO META, OR NO BODY TO READ, GETS `frame-ancestors 'none'` ALONE. That is a HEAD, or a 304 whose headers
 * a browser may lay over the page it kept; that page's own meta still holds its scripts to the hashes. A policy
 * without them would refuse the shell's inline scripts and leave an empty screen, which is worse than no
 * `script-src`, and `apps/web/test/csp.test.ts` fails a build whose shell lacks the meta.
 *
 * The self-host keeps the same rule in `apps/selfhost/src/shell.ts`, where there is no sign-up to keep Turnstile for.
 */
export function pagePolicy(html: string, turnstile: boolean): string {
  const own = /<meta http-equiv="content-security-policy" content="([^"]*)"/i.exec(html)?.[1];
  if (own === undefined) return "frame-ancestors 'none'";
  const kept = own
    .split(';')
    .map((directive) => directive.trim().split(/\s+/).filter((source) => turnstile || source !== TURNSTILE).join(' '))
    .filter((directive) => directive !== '');
  return [...kept, "frame-ancestors 'none'"].join('; ');
}

/**
 * The same request at the root path the record reads: `/acme/api/create` becomes `/api/create`, query and all, and so
 * does the old `/app/acme/api/create`.
 *
 * BECAUSE THE RECORD ROUTES ON ITS OWN URL. `Record$.fetch` reads `/mcp`, `/api/snapshots/<id>` and `/api/slash/*` from
 * the pathname and `serveApi` takes the method from it, so a request forwarded with the slug still in front answered
 * `ROUTE_UNKNOWN` for every method. The slug has done its work by then: `doorOf` has turned it into a record id.
 */
export function atRoot(request: Request, rest: string): Request {
  const url = new URL(request.url);
  return new Request(new URL(`${rest}${url.search}`, url.origin), request);
}

/**
 * A page load at an address the app used to have: a 308 to the same page at `https://<PUBLIC_HOST>/<path>`, or `null`.
 *
 * TWO OLD ADDRESSES, ONE HOP EACH. `app.brain.dog/app/<rest>` was the app until 29 Oct, when it moved to the root
 * because he did not want the second `app`; it is a 308 to `app.brain.dog/<rest>`. And `brain.dog/app/<rest>`, which
 * reaches this Worker through the site's binding, was the app before that: it is a 308 straight to
 * `app.brain.dog/<rest>`, and not to `app.brain.dog/app/<rest>` and then again. Query kept, and the fragment of an
 * already-mailed `…/app/signin#magic=` survives, because a browser keeps it across a redirect whose `Location` has none.
 * 308 and not 301, because a HEAD stays a HEAD and nothing caches a guess about it.
 *
 * `LEGACY_HOSTS` IS A LIST OF NAMES THIS WORKER STILL ANSWERS FOR: `brain.dog`, for at least the ninety days a token
 * lives. Unset or empty and nothing is legacy; a public host that is also listed is never redirected off itself, because
 * that would be a redirect to itself for ever.
 *
 * ONLY A GET OR A HEAD, AND NEVER A PATH THIS WORKER ANSWERS ITSELF. `/api/*`, `/mcp`, `/in/*`, `/auth/*`, `/account/*`,
 * OAuth and the build id are served where they stand, and so is a record's API and its key under `/app/<slug>`: the CLI
 * refuses every redirect, a webhook sender does not follow a 3xx, a 301 or 302 turns a POST into a GET, and a stale tab's
 * fetch does not follow a redirect to another origin. A token is record-scoped and not host-scoped, so an agent keeps
 * working on the old address until its hosts file is edited, and the CLI reads an old one as the new (`hostKey`).
 *
 * ON THE PUBLIC HOST, EVERY GET UNDER `/app`, whatever it accepts. It is the same origin, so a tab's fetch follows it:
 * a stale tab's `/app/_app/version.json` lands on the new build's and the tab learns it is old. Nothing else on the
 * public host is redirected, because everything else is the app's own address.
 *
 * ON A LEGACY HOST, ONLY WHEN THE BROWSER ASKS FOR HTML. A navigation always says `text/html`; a favicon and a script's
 * GET do not, and for those the router's own answer is the true one where a redirect to another origin would be a page
 * handed to something that cannot follow it. And only under `/app`, since the site answers every other page on that
 * name and forwards nothing else here but the doors; a bare path that does arrive is sent to the same path on the app.
 */
export function legacyRedirect(request: Request, legacy: string | undefined, publicHost: string | undefined): Response | null {
  const home = (publicHost ?? '').trim().toLowerCase();
  if (home === '' || (request.method !== 'GET' && request.method !== 'HEAD')) return null;
  const url = new URL(request.url);
  const host = url.host.toLowerCase();
  const path = url.pathname;
  /* OAUTH IS A DOOR, AND ITS AUTHORIZE AND CONSENT ARE PAGE LOADS: a browser sent there by an app asks for HTML, and a
     308 to the app would hand the person the app shell instead of the sign-in they came for. */
  if (servesApi(path) || servesMcp(path) || servesIn(path) || servesAuth(path) || servesAccount(path) || servesBuild(path) || servesAppleAssociation(path) || servesOAuth(path) || servesOAuthMeta(path)) return null;
  /* AND A SLUG'S `/api` AND ITS KEY ARE DOORS TOO, WHICH THE ROOT'S LIST DOES NOT SEE. `/app/<slug>/api/<method>` is
     none of the doors' prefixes, so on the old host it was a 308 whatever the `Accept`, and `hostGet`'s
     `GET /api/slash/status`, which `apiBase()` sends under the slug, would have failed in every tab left open. */
  const app = appPath(path);
  if (app !== null && (servesApi(app.rest) || (app.slug !== null && servesKey(app.rest)))) return null;
  const moved = unprefixed(path);
  const to = (rest: string) => new Response(null, { status: 308, headers: { location: `https://${home}${rest}${url.search}`, 'cache-control': 'no-store' } });
  if (host === home) return moved === null ? null : to(moved);
  if (!legacyHosts(legacy).includes(host) || !/text\/html/i.test(request.headers.get('accept') ?? '')) return null;
  return to(moved ?? path);
}

/**
 * A request on a legacy host with its session cookie taken off, and whether it carried one.
 *
 * A SESSION COOKIE ON A LEGACY HOST IS NOBODY'S. Cookies minted on `brain.dog` before the app moved to `app.brain.dog`
 * kept opening records there: `/api`, `/auth` and `/account` are still answered on the old name, which shares an origin
 * with the marketing site, so any script on the site could read the record over GET with them, and their rotation went
 * on while sign-out (from the app's origin) could never reach them. A bearer is still taken there, for an agent whose
 * hosts file names the old address; a cookie is not, so a page there reads as signed out and the browser is told to
 * drop it (`legacyAnswer`).
 */
export function legacyRequest(request: Request, legacy: string | undefined): { request: Request; legacy: boolean; carried: boolean } {
  const host = new URL(request.url).host.toLowerCase();
  if (!legacyHosts(legacy).includes(host)) return { request, legacy: false, carried: false };
  const sent = request.headers.get('cookie');
  if (sent === null) return { request, legacy: true, carried: false };
  const session = new Set<string>([COOKIE.secure, COOKIE.local]);
  const parts = sent.split(';');
  const kept = parts.filter((part) => !session.has(part.slice(0, part.indexOf('=') < 0 ? part.length : part.indexOf('=')).trim()));
  if (kept.length === parts.length) return { request, legacy: true, carried: false };
  const stripped = new Request(request);
  if (kept.join(';').trim() === '') stripped.headers.delete('cookie');
  else stripped.headers.set('cookie', kept.join(';').trim());
  return { request: stripped, legacy: true, carried: true };
}

/**
 * The answer on a legacy host: no session cookie set there by anything below, and the one the request carried cleared.
 * A 101 is handed back as it is, since its socket cannot be copied into a new answer.
 */
export function legacyAnswer(answer: Response, carried: boolean): Response {
  if (answer.status === 101) return answer;
  const cookies = typeof answer.headers.getSetCookie === 'function' ? answer.headers.getSetCookie() : [];
  const session = (c: string) => c.startsWith(`${COOKIE.secure}=`) || c.startsWith(`${COOKIE.local}=`);
  if (!carried && !cookies.some(session)) return answer;
  const out = new Response(answer.body, answer);
  out.headers.delete('set-cookie');
  for (const c of cookies) if (!session(c)) out.headers.append('set-cookie', c);
  if (carried) out.headers.append('set-cookie', clearCookie('secure'));
  return out;
}

/** The names in `LEGACY_HOSTS`, lower-cased, none empty. Unset or empty is none. */
export const legacyHosts = (legacy: string | undefined): string[] =>
  (legacy ?? '').split(',').map((h) => h.trim().toLowerCase()).filter((h) => h !== '');

/**
 * Where `/mcp`'s 401 sends a client for the protected resource's metadata (RFC 9728 §5.1): on the name the request
 * reached, when that is the public host or one of `LEGACY_HOSTS`, and on the public host otherwise. `undefined` with no
 * public host, so the 401 is a bare `Bearer`.
 *
 * THE CLIENT CHECKS THE METADATA'S `resource` AGAINST THE ADDRESS IT WAS GIVEN (RFC 9728 §3.3, the MCP SDK's
 * `checkResourceAllowed`). A client set up with `https://brain.dog/mcp` that was sent to `app.brain.dog`'s metadata
 * read `https://app.brain.dog/mcp` there and refused to sign in. Sent to `brain.dog`'s, it reads `https://brain.dog/mcp`
 * (`serveOAuth` lists every legacy name as one of the resource's addresses), and the sign-in itself is the issuer's.
 */
export function mcpMetadataAt(request: Request, publicHost: string | undefined, legacy: string | undefined): string | undefined {
  const home = (publicHost ?? '').trim().toLowerCase();
  if (home === '') return undefined;
  const reached = new URL(request.url).host.toLowerCase();
  const name = legacyHosts(legacy).includes(reached) ? reached : home;
  return `https://${name}/.well-known/oauth-protected-resource`;
}

/** Whether a string has the shape of a record id. A shape and not a record: nothing is asked. */
export const isRecordId = (x: string): boolean => REC_ID.test(x);

/**
 * The request the record sees: the caller's, carrying the context this Worker decided and no bearer.
 *
 * ONE FUNCTION FOR BOTH DOORS. `Record$.fetch` takes `x-braindog-ctx` as the whole of who is asking,
 * so whatever a caller sent in that header is overwritten rather than trusted, whichever way they
 * came in. And the bearer goes no further: the record has no use for it, and every hop a
 * credential takes is another place it can be logged.
 */
export function inward(request: Request, ctx: CallContext): Request {
  const inner = new Request(request);
  /* AND WHAT AN AGENT SAYS ABOUT ITS RUN, checked here, on every door: the record reads the hints of a
     token's call and ignores anybody else's, so a person is never a run whichever door they used. */
  const text = JSON.stringify(withSession(ctx, sessionOf(request.headers)));
  /* A CONTEXT PAST THE CAP IS NOT SENT AT ALL. Its size rides on its own header, and the
     record answers it with `CTX_TOO_LARGE` rather than a caller it could not read. */
  const bytes = bytesOf(text);
  if (bytes > CTX_HEADER_MOST) {
    inner.headers.delete(CTX_HEADER);
    inner.headers.set(CTX_OVER_HEADER, String(bytes));
  } else {
    inner.headers.set(CTX_HEADER, text);
    inner.headers.delete(CTX_OVER_HEADER);
  }
  inner.headers.delete('authorization');
  return inner;
}

/** The header the caller's context rides on from this Worker to the record. */
export const CTX_HEADER = 'x-braindog-ctx';
/** The header saying a context was too large to send, with its size in bytes. A caller's own copy is overwritten. */
export const CTX_OVER_HEADER = 'x-braindog-ctx-over';

/**
 * THE MOST BYTES A CALLER'S CONTEXT TAKES ON THE HOP (at most 8 KB for the largest template set,
 * refused above 32 KB). Every list a lens names travels in it, with its rule and its hidden fields, so a person held by
 * many narrow shares is the one who reaches it. Past it the record answers this sentence and reads nothing.
 */
export const CTX_HEADER_MOST = 32 * 1024;
export const CTX_TOO_LARGE = 'This is more than one person\'s sharing can hold. Ask an owner to join some of these shares.';

/**
 * Why the context on this request cannot be read, or `null` when it can: too large on the hop, or past the cap as it
 * arrived. Asked by the record before it parses the header, so a header nobody capped is never parsed.
 */
export function ctxOversize(headers: Headers): { code: 'OUT_OF_BOUNDS'; fix: string; at: string } | null {
  const said = headers.get(CTX_OVER_HEADER);
  const text = headers.get(CTX_HEADER);
  if (said === null && (text === null || text.length <= CTX_HEADER_MOST)) return null;
  if (said === null && text !== null && bytesOf(text) <= CTX_HEADER_MOST) return null;
  return { code: 'OUT_OF_BOUNDS', fix: CTX_TOO_LARGE, at: 'share' };
}

const bytesOf = (text: string): number => new TextEncoder().encode(text).length;

/**
 * What one ingest path may spend in a minute, and how many distinct paths are counted at once.
 *
 * A BUDGET IS NOT OPTIONAL AND `IngestDoor` MAKES IT REQUIRED, which is why these three constants
 * exist rather than being left to a deployment: `/in/*` is the one surface a stranger reaches with
 * no credential and still gets a write out of, and a host cannot open it without having decided
 * what a sender is allowed to spend.
 *
 * IT IS PER ISOLATE, WHICH IS THE HONEST COST AND WORTH STATING PLAINLY. The self-host's counter is
 * per process, and a process is the whole host; Cloudflare runs as many isolates of this Worker as
 * it likes, so the real ceiling is this number times however many are warm in whichever colos the
 * sender's traffic lands in. That makes it a brake on one sender's loop and not a quota. The
 * durable ceiling this route actually needs is a Durable Object hop or a rate-limiting binding, and
 * both cost either a round trip before the path has resolved to anything or a change to
 * `wrangler.jsonc`. A brake that costs nothing is the right thing to have while neither is here,
 * and an unbudgeted door is not.
 *
 * AND THE KEY TABLE IS BOUNDED, because the key is a path a stranger types. Without the ceiling a
 * flood of invented ingest ids is a map that grows until the isolate dies, which is a denial of
 * service paid for with no credential at all. Full, an unknown key waits a window, and a key
 * already in the table is let through as usual.
 *
 * WHAT IS IN THE TABLE IS THE LAST MINUTE'S SENDERS AND NOT THE CONFIGURED ONES, and the ceiling
 * costs something because of it. Measured against this function, in `test/ingest.test.ts`: a
 * genuine path spent once, quiet for two minutes, then arriving while a flood holds all thousand
 * slots, is told to wait sixty seconds, and told the same the window after. A webhook that arrives
 * oftener than once a minute keeps its slot straight through a flood; an hourly one is refused for
 * as long as the flood lasts. That is the same trade the door ceiling below takes, and it is why
 * the refusal carries `retry-after`: a sender that honours it is a delivery a minute late.
 *
 * THE SELF-HOST HAS THE SAME SHAPE AND THIS IS NOT AN IMPORT OF IT. Putting it in `@braindog/host`
 * would claim the two hosts make one promise, and they do not: one counter lives as long as an
 * operator's process and the other as long as whatever isolate answered. A shared name would hide
 * exactly the difference an operator reading either number needs to know about.
 */
const IN_PER_MINUTE = 120;
const IN_WINDOW_MS = 60_000;
const IN_KEYS_MOST = 1_000;

/**
 * AND A CEILING ON THE WHOLE DOOR, because varying the path is how a per-path ceiling is evaded.
 *
 * MEASURED, in `test/ingest.test.ts`: two hundred invented ingest ids, each spending its own hundred
 * and twenty, put 24,000 arrivals through one isolate in one minute, and the bounded key table makes
 * the real figure 120,000. Every one of those costs a read of the Directory, because `knows` is what
 * stops a made-up record id becoming an address, and the Directory is the single object this whole
 * deployment signs in through. A stranger with no credential could therefore turn `/in/*` into an
 * outage on `/auth/*`, which is a good deal worse than anything they can do to the record they are
 * aiming at.
 *
 * FIFTY A SECOND IS THE NUMBER AND IT IS CHOSEN AGAINST A REAL COST. A deployment's webhooks are
 * senders somebody configured one at a time, and fifty arrivals a second landing on one isolate is
 * far past any of them; a flood is the only thing that reaches it. What it does cost is that during
 * a flood a genuine sender on the same isolate is told to wait, and that is the trade taken here
 * deliberately: a 429 with `retry-after` is a delivery a minute late, and the Directory falling over
 * is every customer unable to sign in.
 *
 * IT COUNTS ONLY WHAT IT LETS THROUGH. Counting refusals too would let a flood that costs nothing
 * past the key ceiling hold the whole door shut, which is a cheaper attack than the one this stops.
 */
const IN_DOOR_PER_MINUTE = 3_000;

/** Spend one arrival against `key`: the whole seconds to wait, or `null` to let it through. */
export function ingestBudget(now: () => number): (key: string) => number | null {
  const seen = new Map<string, { n: number; until: number }>();
  let door = { n: 0, until: 0 };
  return (key) => {
    const at = now();
    /* SWEPT ON EVERY CALL, so a window that has passed is gone before the ceiling is counted. The
       map is at most `IN_KEYS_MOST` entries, so this is a walk of a thousand and no timer. */
    for (const [k, row] of seen) if (row.until <= at) seen.delete(k);
    if (door.until <= at) door = { n: 0, until: at + IN_WINDOW_MS };
    /* THE DOOR BEFORE THE PATH, because this is the ceiling that protects something outside this
       record, and because a refusal here must not also be charged to the path's own count. */
    if (door.n >= IN_DOOR_PER_MINUTE) return Math.max(1, Math.ceil((door.until - at) / 1000));
    const row = seen.get(key);
    if (row === undefined) {
      /* THE OLDEST GOES, AS ON THE SELF-HOST, AND NOBODY IS REFUSED FOR THE TABLE BEING FULL. This answered a window's wait
         here, so a thousand made-up paths in a minute, seventeen a second from anywhere, told every real sender on the
         isolate to wait, and a phone's Shortcut does not send a bank text again. The door's own ceiling above is what
         holds a flood; an evicted key only starts its count again. */
      while (seen.size >= IN_KEYS_MOST) {
        const oldest = seen.keys().next();
        if (oldest.done === true) break;
        seen.delete(oldest.value);
      }
      seen.set(key, { n: 1, until: at + IN_WINDOW_MS });
      door.n += 1;
      return null;
    }
    row.n += 1;
    if (row.n > IN_PER_MINUTE) return Math.max(1, Math.ceil((row.until - at) / 1000));
    door.n += 1;
    return null;
  };
}

/**
 * What the Cloud's `/in/*` door asks of the deployment, and nothing of `cloudflare:`.
 *
 * ITS OWN SHAPE FOR THE SAME REASON `recordOf` IS IN THIS FILE: what it decides is which record a
 * stranger's POST reaches, and that string IS the tenant boundary. Written against the bindings it
 * could only be exercised inside workerd; written against these four it is a function.
 */
export type CloudIngestDeps = {
  /**
   * Whether the Directory holds this record.
   *
   * ASKED BEFORE THE ID EVER BECOMES AN ADDRESS, which is the same rule `recordOf`'s header states
   * and it matters more here: `idFromName` on a name nobody has CREATES the object, and this is a
   * path a stranger types with no credential at all. Without this, `POST /in/webhook/rec_.../x/y`
   * is an unauthenticated way to mint empty records until the account's storage runs out.
   */
  knows(rec: string): Promise<boolean>;
  /** What verifies this ingest on that record, or `null` for one nobody declared. */
  verifies(rec: string, ingest: string): Promise<IngestVerify | null>;
  /** Store the raw arrival on that record. Everything after storing it is the record's. */
  arrives(rec: string, arrival: Omit<IngestArrival, 'rec'>): Promise<Result<unknown>>;
  /** Whole seconds to wait, or `null` to let this one through. */
  spends(ask: { channel: string; key: string }): Promise<number | null>;
  /** Count one arrival answered 410 at a door switched off on that record. Absent, the 410 is still answered. */
  turnsAway?: (rec: string, ingest: string) => Promise<void>;
  /**
   * Which record a forwarded message is for. Absent, and this deployment takes no mail at all.
   *
   * OPTIONAL BECAUSE A DOOR WITH NO INDEX IS STILL A DOOR: `serveIngest` answers 404 for the whole
   * `/in/email/*` surface when a door offers no `inbound`, the way `/auth/provision` answers `off()`
   * with no operator key set. The Worker supplies one, the Directory's `recordFor` (`arrivals` in
   * `index.ts`), so it takes mail both ways: a forwarder's `POST /in/email/<token>` and the message
   * Email Routing hands its `email()` handler (`email.ts`), which goes through this same door.
   */
  inbound?: InboundIndex;
};

/**
 * The digest of an inbound mail token, answered with the record it names.
 *
 * ONE METHOD, BECAUSE THE WORKER NEEDS EXACTLY ONE FACT FROM THIS INDEX. Everything else about
 * inbound mail addresses — who issued one, when, how it is rotated, what the person was shown once
 * and never again — is the Directory's and belongs nowhere near a path a stranger types. A wider
 * shape here would be a wider surface reachable with no credential.
 *
 * THE DIGEST IS THE KEY AND THE TOKEN IS NEVER SEEN. `/in/email/<token>` has no record id in it, so
 * the token IS the lookup key, and a lookup key held in the clear is a credential in whatever index
 * holds it: anybody who can read that table can read the mail of every record in it. `serveIngest`
 * hands across the SHA-256 in hex and nothing else, this Worker checks that shape before using it,
 * and the Directory therefore stores 64 hex characters that open nothing. It is the same division
 * the self-host already makes, which keeps only the digest of the file `init` wrote
 * (`apps/selfhost/src/server.ts:994`).
 */
export type InboundIndex = {
  /** The record whose inbound token has this digest, or `null` for a digest nobody registered. */
  recordFor(tokenHash: string): Promise<string | null>;
};

/**
 * A SHA-256 in hex, lower-cased, and nothing else may be used as a lookup key.
 *
 * WHAT THIS REFUSES IS THE TOKEN ITSELF. `init` writes `randomBytes(32).toString('base64url')`,
 * which is 43 characters and fails this test, so a caller that passed the raw token where the
 * digest belongs gets `null` instead of putting a live credential into the Directory's query path.
 * `serveIngest` always digests first and cannot reach that mistake, and this is the guard for the
 * other callers of `IngestDoor.inbound` rather than for that one.
 */
const TOKEN_DIGEST = /^[0-9a-f]{64}$/;

/**
 * The Cloud's half of `/in/*`. `51 §5.4`, and `packages/host/src/ingest.ts` holds the order.
 *
 * THE SELF-HOST'S WEBHOOK SHAPE IS DECLINED HERE, which is what `verify` answering `null` to an ask
 * with no `rec` means. `/in/webhook/<ingest>` names no record, and this Worker serves every record:
 * the only ways to resolve it would be to guess or to serve one record's ingests at a URL another
 * record's sender was given. 404 says neither, and the self-host declines the four-segment shape at
 * its own door for the mirror reason.
 *
 * MAIL RESOLVES THROUGH AN INDEX OF DIGESTS, AND THROUGH NOTHING ELSE. `/in/email/<token>` is the
 * one arrival whose path names no record (`49 §5.16` step 2), so the digest of the token is the
 * address: `deps.inbound` is asked, and whatever it answers is put through the same two refusals a
 * webhook's path segment goes through before it can become an argument to `idFromName`. A
 * deployment that supplies no index takes no mail; the Worker supplies the Directory's.
 *
 * THE SELF-HOST HOLDS ONE DIGEST AND THE CLOUD HOLDS AN INDEX OF THEM, and that is the only
 * difference between the two halves. A self-host serves one record, so `inbound` there is a
 * comparison against the digest of the file `init` wrote; a Worker serves every record, so the
 * comparison has to be a lookup. Both sides see the digest and neither can see the token.
 */
export function cloudIngest(deps: CloudIngestDeps): IngestDoor {
  const index = deps.inbound;
  return {
    verify: async (ask) => {
      /* THE RECORD IS CHECKED BEFORE THE INGEST IS, so an id that is not this deployment's costs a
         Directory read and never a Durable Object. Both answers are the same 404 to the caller. */
      if (ask.rec === undefined || !isRecordId(ask.rec) || !(await deps.knows(ask.rec))) return null;
      return deps.verifies(ask.rec, ask.ingest);
    },
    arrive: async (arrival) =>
      arrival.rec === undefined
        ? /* UNREACHABLE THROUGH THE DOOR, because `verify` has already refused a path with no record
             in it. It is written rather than asserted because the alternative to a refusal here is
             an address built from `undefined`. */
          { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'An arrival names the record it is for.' } }
        : deps.arrives(arrival.rec, {
            channel: arrival.channel,
            headers: arrival.headers,
            body: arrival.body,
            sha256: arrival.sha256,
            verified: arrival.verified,
            ...(arrival.ingest === undefined ? {} : { ingest: arrival.ingest }),
          }),
    limit: (ask) => deps.spends(ask),
    turnedAway: async (ask) => {
      if (ask.rec !== undefined && ask.ingest !== undefined) await deps.turnsAway?.(ask.rec, ask.ingest);
    },
    /* AN ABSENT KEY AND NOT A METHOD ANSWERING `null`, and the difference is not one a caller can
       see: measured against `serveIngest`, a door with no `inbound` and a door whose
       `inbound` always answers `null` both give 404 to `POST /in/email/<tok>` and 405 to a GET.
       What the absent key buys is that `IngestDoor.inbound?` is the type's own way of saying "this
       host takes no forwarded mail", which the self-host spreads in the same way, so nothing has to
       call anything to find out whether a deployment has a mail door at all. */
    ...(index === undefined ? {} : { inbound: (hash: string) => inboundRecord(hash, index, deps) }),
  };
}

/**
 * The record a forwarded message's digest names, or `null`, with every answer that must not become
 * an address refused on the way.
 *
 * THREE REFUSALS, AND EACH ONE IS A DIFFERENT MISTAKE. The shape of the key keeps the raw token out
 * of the Directory's lookup path. The shape of the ANSWER is the rule `recordOf` and `cloudIngest`'s
 * `verify` both state: `idFromName` on a name nobody has CREATES the object, so a row holding a
 * typo, an empty string or a path fragment would be an unauthenticated way to mint empty records,
 * and this is reached with no credential at all. And `knows` is asked last because the index and
 * the closure are two separate writes in the Directory: a record closed while a bank still has its
 * forwarding address would otherwise keep taking mail into storage nobody can reach.
 *
 * ALL THREE ARE THE SAME 404 ON THE WIRE, which is what keeps this from being an oracle. A stranger
 * who guesses an address learns only that guessing is not worth continuing.
 */
async function inboundRecord(hash: string, index: InboundIndex, deps: CloudIngestDeps): Promise<string | null> {
  if (!TOKEN_DIGEST.test(hash)) return null;
  const rec = await index.recordFor(hash);
  if (rec === null || !isRecordId(rec)) return null;
  return (await deps.knows(rec)) ? rec : null;
}

/**
 * The answer, once whatever the caller sent has been read to its end.
 *
 * A DURABLE OBJECT THAT ANSWERS BEFORE IT READS THE BODY BREAKS. The router streams the body in, and an answer that
 * leaves first makes the runtime throw "Can't read from request stream after response has been sent" out of the
 * request, after which the next call to that record answers 500 "Network connection lost". `serveApi`'s 404 and 405
 * and the object's own early refusals all answer without reading, so `POST /api/<a typo>` with a body was enough.
 */
export async function drained(request: Request, out: Response): Promise<Response> {
  if (request.body !== null && !request.bodyUsed) await request.body.pipeTo(new WritableStream()).catch(() => undefined);
  return out;
}
