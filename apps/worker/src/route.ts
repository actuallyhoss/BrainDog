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

import { ROUTES, sessionOf, withSession, type IngestArrival, type IngestDoor, type IngestVerify } from '@braindog/host';
import type { Result, Snapshot } from '@braindog/ports';
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
 * `/mcp`: an agent's MCP client, with its bearer and nothing else (`loop/research-agent-path.md` §1.1).
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
 * IT IS BEFORE EVERY DOOR AND CARRIES NO CREDENTIAL. The cookie is never read here and the demo
 * never applies: an arrival is above the auth gate by design, and what stands in for a principal is
 * whether the payload was verified, which decides only whether the stored row may match (`12 §3`).
 */
export const servesIn = (pathname: string): boolean => /^\/+in(?:\/|$)/.test(pathname);

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

/**
 * `GET /api/snapshots/<id>`: one kept copy as a file, which is the self-host's door (`49 §5.13`). The id, or `null`.
 *
 * THE WORKER KEEPS NO COPIES, AND IT SAYS SO HERE AS IT DOES ON THE LIST. Without this the path fell through to the
 * method router and answered `ROUTE_UNKNOWN`, while `snapshot`, `snapshots` and `restore` on the same record answer
 * `NOT_IN_THIS_BUILD`, so one question had two answers depending on which door it was asked at.
 */
export const copyAsked = (method: string, pathname: string): string | null =>
  method === 'GET' ? (/^\/+api\/+snapshots\/+([^/]+)\/*$/.exec(pathname)?.[1] ?? null) : null;

/**
 * What a copy's door answers where no file can be streamed: the list's own refusal, which on a Worker is
 * `NOT_IN_THIS_BUILD`, or, should a list ever answer, that this id is not one of its copies.
 */
export async function copyRefusal(id: string, list: () => Promise<Result<Snapshot[]>>): Promise<Result<Snapshot[]>> {
  const listed = await list();
  if (!listed.ok) return listed;
  return { ok: false, refusal: { code: 'OUT_OF_BOUNDS', fix: `${id} is not one of the copies this record keeps.`, at: 'id' } };
}

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
      if (seen.size >= IN_KEYS_MOST) return Math.ceil(IN_WINDOW_MS / 1000);
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
  /**
   * Which record a forwarded message is for. Absent, and this deployment takes no mail at all.
   *
   * OPTIONAL BECAUSE THE DIRECTORY CANNOT ANSWER IT YET, and optional is the honest way to say so:
   * `serveIngest` answers 404 for the whole `/in/email/*` surface when a door offers no `inbound`,
   * the way `/auth/provision` answers `off()` with no operator key set. The day the Directory has
   * the index, wiring it here is the whole of the Worker's change.
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
 * deployment that supplies no index takes no mail, which is every deployment in this build.
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
    /* AN ABSENT KEY AND NOT A METHOD ANSWERING `null`, and the difference is not one a caller can
       see: measured against `serveIngest` on 2026-09-20, a door with no `inbound` and a door whose
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
