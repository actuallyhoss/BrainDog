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

import { ROUTES } from '@braindog/host';
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
 * 33 §4'S OWN LIST, AND ONLY THE PART THAT IS BUILT. Everything else that belongs to this Worker in
 * the document — `/mcp`, `/a/*`, `/s/*`, `/in/*`, `/auth/*`, `/ws` — does not exist yet, and a router
 * claiming them now would answer 401 for routes whose whole point is being reachable without one.
 * Everything outside the list is the app's: that is what `run_worker_first` means.
 */
export const servesApi = (pathname: string): boolean => /^\/+api\/+[^/]/.test(pathname);

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
  inner.headers.set('x-braindog-ctx', JSON.stringify(ctx));
  inner.headers.delete('authorization');
  return inner;
}
