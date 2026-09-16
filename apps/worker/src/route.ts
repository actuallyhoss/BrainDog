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

import { ROUTES, sessionOf, withSession } from '@braindog/host';
import type { CallContext } from '@braindog/record';

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
 * 33 §4'S OWN LIST, AND ONLY THE PART THAT IS BUILT. `/a/*`, `/s/*`, `/in/*` and `/ws` belong to this
 * Worker in the document and do not exist yet, and a router claiming them now would answer 401 for
 * routes whose whole point is being reachable without one. `/auth/*` and `/mcp` are built, and are
 * `servesAuth` and `servesMcp` below. Everything outside the three is the app's: that is what
 * `run_worker_first` means.
 */
export const servesApi = (pathname: string): boolean => /^\/+api\/+[^/]/.test(pathname);

/** `/auth/*`: sign-in, which is the Directory's and never reaches a record (`51 §5.8`). */
export const servesAuth = (pathname: string): boolean => /^\/+auth(?:\/|$)/.test(pathname);

/** `/account/*`: a signed-in person's account, which is the Directory's and never reaches a record. */
export const servesAccount = (pathname: string): boolean => /^\/+account(?:\/|$)/.test(pathname);

/**
 * `/mcp`: an agent's MCP client, with its bearer and nothing else (`loop/research-agent-path.md` §1.1).
 * One path and no subpaths, because the transport is one endpoint and `run_worker_first` names it alone.
 */
export const servesMcp = (pathname: string): boolean => /^\/+mcp\/*$/.test(pathname);

/**
 * `/.well-known/braindog-build`: which version of this Worker is answering, and no record is asked.
 *
 * IT IS NOT A RECORD QUESTION, which is the whole reason it is not `/api/version`. That route is
 * `READ+` because it answers one record's own activity cursor, so reading the deployed build through
 * it meant carrying a bearer for a question with no record in it. The build id is a property of the
 * Worker version, so it is answered where nothing has to be opened to read it. `33 §4` puts the
 * `/.well-known/braindog-key` that `braindog verify` reads beside it, under the same rule and with no
 * credential, and THAT one is specified and not built: nothing answers it in any of the three apps, and
 * the test below pins this prefix to `braindog-build` alone.
 *
 * `/.well-known/*` IS IN `run_worker_first`, which is what makes this path the Worker's at all. Off
 * that list the app shell answers here with `index.html` and a 200, which is worse than a 404
 * because it looks like a working endpoint (`apps/worker/wrangler.jsonc`).
 */
export const servesBuild = (pathname: string): boolean => /^\/+\.well-known\/+braindog-build\/*$/.test(pathname);

/** Whether a string has the shape of a record id. A shape and not a record: nothing is asked. */
export const isRecordId = (x: string): boolean => REC_ID.test(x);

/**
 * THE ONE DOOR WITHOUT A KEY: the public demo, read-only, from one record the deployment names.
 *
 * `DEMO_RECORD` IS A CONSTANT THE REQUEST CANNOT TOUCH. With no bearer, nothing in a request names a
 * record, and every way of letting a request name one is a way to read somebody else's: a header, a
 * query parameter, a path segment. So the id comes from the deployment's own `vars` and is compared
 * against nothing the caller sent (`loop/research-anon-read.md`, A8). Unset, empty, or not the shape
 * of a record id, and this answers `null` and the Worker is exactly what it was.
 *
 * A GET WITH NO AUTHORIZATION HEADER AT ALL, for a route the table says does not write. An empty
 * `Authorization:` is a header, and takes the ordinary path to the ordinary 401: the self-host learnt
 * what reading `''` as nothing costs. `writes` is read from `ROUTES`, not judged from the principal,
 * so a method added to the table as a write is refused here the day it is added. `dryRun` is a read
 * with a caller-supplied rule in front of an unbounded walk, and has no place in a demo (A4).
 *
 * THE RECORD'S OWN GUARDS STILL DECIDE THE REST. The principal is a `read` person, so every ADMIN
 * and VAULT read (`members`, `listTokens`, `listGrants`, `planPack`) is refused inside the record by
 * level, exactly as it is for any colleague invited at `read`.
 *
 * NOTHING HERE MAY BE CACHED. Every `/api` answer carries `no-store` and no `Vary`, and must keep
 * doing so: the URL does not name the record, so `/api/boot` is one address for the demo and for
 * every tenant, and a shared cache keyed on it would hand one's answer to the other (A12). There is
 * no per-visitor rate limit yet, and `loop/BACKLOG.md` says what one needs.
 */
const DEMO_READS: ReadonlySet<string> = new Set(ROUTES.filter((r) => !r.writes && r.name !== 'dryRun').map((r) => r.name));

/** The record an anonymous request reads, or `null` when it takes the ordinary path. */
export function demoRecord(request: Request, pinned: string | undefined): string | null {
  if (request.headers.get('authorization') !== null || request.method !== 'GET') return null;
  if (!pinned || !REC_ID.test(pinned)) return null;
  const name = new URL(request.url).pathname.replace(/^\/+api\/+/, '').replace(/\/+$/, '');
  return DEMO_READS.has(name) ? pinned : null;
}

/**
 * Who an anonymous reader is: `p_demo`, at `read`, and not credentialed.
 *
 * `credentialed: false` IS SAID, NOT LEFT OUT. `createToken` refuses on `=== false` and `undefined`
 * is not `false`. Nothing at `read` reaches it; the day something does, this is still the answer.
 */
export const DEMO_CONTEXT: CallContext = {
  principal: { kind: 'person', id: 'p_demo', level: 'read' },
  credentialed: false,
};

/**
 * The request the record sees: the caller's, carrying the context this Worker decided and no bearer.
 *
 * ONE FUNCTION FOR BOTH DOORS. `Record$.fetch` takes `x-braindog-ctx` as the whole of who is asking,
 * so whatever a caller sent in that header is overwritten rather than trusted, whichever way they
 * came in (A9). And the bearer goes no further: the record has no use for it, and every hop a
 * credential takes is another place it can be logged.
 */
export function inward(request: Request, ctx: CallContext): Request {
  const inner = new Request(request);
  /* AND WHAT AN AGENT SAYS ABOUT ITS RUN, checked here, on every door: the record reads the hints of a
     token's call and ignores anybody else's, so a person is never a run whichever door they used. */
  inner.headers.set('x-braindog-ctx', JSON.stringify(withSession(ctx, sessionOf(request.headers))));
  inner.headers.delete('authorization');
  return inner;
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
