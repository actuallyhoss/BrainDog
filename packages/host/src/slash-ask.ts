/**
 * Slash's doors: `POST /api/slash/read`, `GET /api/slash/status`, `POST /api/slash/settings`,
 * `POST /api/slash/propose`, `GET /api/slash/asks` and `POST /api/slash/pattern`, the half both hosts
 * share. `docs/46` §5.2, `23 §7` and `§8`, and C15 in `loop/finish/agents.md`.
 *
 * THE READ WAS ALONE FOR A DAY. `loop/research-spark-routes.md` found that the Slash object both hosts
 * build had five methods and only `read` had a door, so tier stayed `a`, the cap stayed 80, and an owner
 * could neither see nor set Slash's model from the product. Status, settings and propose came next; the
 * owner's list of what was asked (`asks`) and a pattern drafted from the inbox (`pattern`) are the last
 * two, and this file is their one writer (`loop/finish/contracts.md` X26).
 *
 * BOTH HOSTS MOUNT THIS DOOR, AND THE ENGINE IS REACHED THROUGH IT FROM A BROWSER. `903bc9c9` wrote the
 * door and `1816500a` wrote the two branches in front of it, eight minutes apart on 21 September:
 * `apps/selfhost/src/server.ts` hands a request to `serveSlash` when `servesSlash` names the path, ahead
 * of `servesKeys`, and `apps/worker/src/index.ts` does the same in `Record$.#answer`, beside `servesMcp`'s
 * branch and behind two locks of its own (a person, and a credentialed one). The palette's `slashRead`
 * (`packages/client/src/index.ts`) is the caller. This header said for a day afterwards that nothing
 * reached the door; that was true only between those two commits, and `loop/research-spark-seam.md` §0
 * is the survey that caught it.
 *
 * WHAT WAS WRONG ONCE IT WAS REACHED WAS THE WORKER'S BUILD OF THE ENGINE, and neither host's tests saw it,
 * because every one of them ran over `node:sqlite`. On a Durable Object `createSlash` threw
 * `not authorized: SQLITE_AUTH` from an unguarded `PRAGMA`, so `engine()` below rejected and every ask was
 * the 500 `INTERNAL` this door answers for a builder that threw, while `/api/version` said `slash: true`.
 * `packages/slash/src/index.ts` guards the pragma now, and `apps/worker/test/slash-in-do.test.ts` drives the
 * ask through workerd on real object storage: 500 before the guard, 200 after it. The fault behind that one
 * is mended too: `post` in `slash.ts` sent `redirect: 'error'`, which workerd refuses outright, and it sends
 * `'manual'` now, so his own key's calls leave the Worker. The included model opens no socket of its own: it
 * answers over the Worker's `AI` binding (`apps/worker/src/inference.ts`).
 *
 * IT IS A DOOR AND NOT A ROW IN `ROUTES`, AND THAT WAS MEASURED RATHER THAN PREFERRED. `ROUTES` is
 * the RECORD's surface and two gates hold it to that. `tools/gates/guards.mjs` reads every routed
 * name out of `packages/host/src/index.ts` and then looks for a method of that name in
 * `packages/record/src/index.ts`, whose first authorisation call has to be the one the group implies:
 * *"A route whose handler this gate cannot find is a route whose check it cannot read."*
 * `tools/gates/router-groups.mjs` reads the same table and fails on any name that `30 §5`'s own
 * group table does not enumerate and its own `UNENUMERATED` map does not record. This answer comes
 * out of the HOST's engine and not out of the record, so a row in that table would be a name neither
 * gate can account for, and `docs/30-BLUEPRINT.md` §5 would have to grow a forty-first ADMIN method
 * for a method the record has not got.
 *
 * SO IT IS THE SHAPE THE TREE ALREADY HAS FOR EXACTLY THIS, in `vault.ts`, `keys.ts` and
 * `ingest.ts`, and `packages/client/src/index.ts` says the rule in as many words over its own two key
 * doors: *"NOT THROUGH `call`, BECAUSE THEY ARE NOT METHODS. `ROUTES` is the record's surface; these
 * are a host step in front of it at a fixed path, and a name in `NAMES` would be a name `handlersFor`
 * had to route."* `46 §5.2` had already put the ask at `POST /api/slash/read` behind a cookie, so
 * nothing here invents an address either.
 *
 * WHAT IT ASKS AND WHAT ANSWERS. A question in words goes in; the engine of `docs/46` drafts a
 * predicate for it, projects the record through `slashRecord`'s six guarded reads under the ASKER's
 * own context, and answers the rows it found with the predicate it drafted and the fold of what it
 * read. That is the other Slash: the four `slash*` methods in `ROUTES` are the record's ARRANGEMENT
 * engine, which proposes how a BrainDog is put together, and `1f85a49a` settled that the two features
 * share a name and are both kept.
 *
 * THE ORDER: the path, then the method, then a bearer, then the origin, then whether there is a model
 * at all, and only then the body. It is `keys.ts`'s order for `keys.ts`'s reasons. A bearer is refused
 * `NEEDS_BROWSER_SESSION` whatever it is, which is `46 §5.2`'s own last line and `§6`'s row for it;
 * a request with no `Origin`, or one this host does not answer for, is the half of CSRF that does not
 * depend on the browser (`12 §8`), and it is why a cookie is admissible here at all. The one exception
 * is status, a GET, on which a browser sends no `Origin` to its own site; `serveSlash` says the rule
 * that replaces it.
 *
 * THE ENGINE IS A THUNK AND NOT AN OBJECT, because `46 §5.1` has the host `import()` the package once
 * and only when it has a model to offer, and `apps/worker/src/slash.ts` builds it on the first ask
 * rather than at boot, when the Durable Object's record already exists. A door holding the built
 * engine would be a door that decided when to build it, one level too low.
 *
 * NO MODEL HERE IS A SENTENCE AND NOT A 404. `46 §5.1` says the routes are not registered at all
 * on a host with no model to offer, and `/api/version` already answers `slash: false` so the app draws
 * no row to press. What is left for this door to answer is a caller who asked anyway, and
 * `ROUTE_UNKNOWN` would tell them the address is wrong when the address is right and the host has no
 * model. `keys.ts` made the same call for the same shape, `NOT_IN_THIS_BUILD` at 501: *"This host
 * holds no key store yet, so it keeps no keys."* Nothing about the loading rule changes: this file
 * imports `@braindog/slash` nowhere, and cannot, because `packages/host` does not depend on it.
 */

import { ulids } from '@braindog/kernel';
import type { Refusal, Result, Sql } from '@braindog/ports';
import type { SlashMeter } from '@braindog/record';

import { httpStatus } from './index.ts';
import { backgroundMeter, BACKGROUND_JOBS_MONTH } from './model-jobs.ts';
import { slashBaseUrlOf, slashKeySave } from './slash.ts';
import { VAULT_HEADERS } from './vault.ts';

/**
 * The methods of `Slash` these doors call, over whatever context the host resolves a session to.
 *
 * STRUCTURAL, AS `RecordSurface` IS. `packages/host` must not depend on `@braindog/slash`: `31 §2`
 * puts the package at row 13 and `46 §5.1` puts the `import()` in the app, so naming the type here
 * would be the edge this file exists to serve, pointing the wrong way. Both hosts already pass the
 * whole `Slash`, which satisfies this shape without a line of either app changing.
 *
 * `configure` AND `history` ARE THE OWNER'S AND THE PACKAGE SAYS SO: each answers a `write` member and a
 * `system` principal 403 `FORBIDDEN`. `inference` on `read`, `propose` and `proposePattern` is the model
 * for this one ask, his own key where he chose it, which the door opens for the asker (`byok`).
 *
 * `history` AND `proposePattern` ARE OPTIONAL so an engine built before them still fits, and a door
 * over one answers their paths 501 in `NO_MODEL`'s words rather than a 500.
 */
export type SlashAskEngine<C> = {
  read(question: string, ctx: C, inference?: unknown): Promise<Result<unknown>>;
  status(): unknown;
  configure(patch: Record<string, unknown>, ctx: C): Result<unknown>;
  propose(question: string, ctx: C, byok?: unknown, askId?: string, inference?: unknown): Promise<Result<unknown>>;
  history?(limit: number, ctx: C): Result<unknown>;
  proposePattern?(samples: readonly unknown[], ctx: C, inference?: unknown): Promise<Result<unknown>>;
};

/**
 * A host's half.
 *
 * `origins` IS THE ORIGINS THIS HOST ANSWERS FOR, and an empty set closes the door, exactly as it
 * does in `keys.ts`: a host that cannot say what its own address is cannot tell a page of its own
 * from a page somewhere else.
 *
 * `engine` IS ABSENT WHERE THE HOST WIRED NONE and answers `undefined` where it wired one and the
 * deployment configured no endpoint. Both are the same fact to a person, so both get the same
 * sentence.
 *
 * `byok` IS THE HOST'S WAY TO OPEN THE OWNER'S OWN KEY FOR ONE ASK, built on both hosts wherever a
 * key store is, and handed the asker's context so the vault's own gate runs on it (`slashOwnKeyFor`
 * in `slash.ts`). The door reads nothing about tiers: it hands every ask whatever `byok` answers for
 * this session, as the model for both passes, and when that answer is a refusal it is the answer,
 * before the engine is called, so a caller the vault turns away costs no model call. Where `byok` is
 * absent the settings door refuses his own key outright, because a stored choice no host can serve
 * would make every later ask answer `FORBIDDEN`.
 *
 * `vault` IS THE VAULT'S OWN GATE, which a save that points his key somewhere must pass (`slashKeySave`):
 * the owner, in a browser, proved in the last fifteen minutes. `samples` reads the inbox arrivals a
 * pattern is asked for, under the asker's own context, so the record decides who may read them.
 */
export type SlashAskDoor<C> = {
  origins: ReadonlySet<string>;
  engine?: (() => Promise<SlashAskEngine<C> | undefined>) | undefined;
  byok?: ((ctx: C) => Promise<unknown>) | undefined;
  vault?: ((ctx: C) => Promise<Refusal | null>) | undefined;
  samples?: ((ids: readonly string[], ctx: C) => Promise<Result<unknown[]>>) | undefined;
};

/** What a host hands `slashAskDoor` beside the builder: the vault's gate and the inbox's reader (`SlashAskDoor`). */
export type SlashDoorReads<C> = Pick<SlashAskDoor<C>, 'vault' | 'samples'>;

/**
 * A door over a builder that is asked once, which is what each host's `slash.ts` hands this file.
 *
 * IT IS HERE AND NOT IN THE TWO APPS because it was written twice and is the same paragraph both times, and
 * because neither app has a test suite this could be measured in: `apps/worker` and `apps/selfhost` both build
 * the engine from `@braindog/host/slash`'s two adapters so the hosts cannot drift, and a rule about WHEN to
 * build it drifts the same way a rule about how to open a key does.
 *
 * BUILT ON THE FIRST ASK AND NOT AT BOOT. `46 §5.1` has the host `import()` the package only when an endpoint is
 * configured, and `createSlash` brings Slash's store to its version and writes the settings singleton into Slash's own SQLite (`46 §7`,
 * under 5 ms), so it wants the object's storage and the record that is already open rather than a cold start.
 *
 * AND A REJECTED PROMISE IS NOT A CACHED ANSWER, which `apps/worker/src/index.ts` `#record()` states the cost of
 * in its own words: `??=` stored whatever the opener returned, rejection included, so one transient failure at
 * cold start was remembered as this record's permanent state until the object was evicted. The first ask of the
 * day opens a vault grant, which can fail for a reason that has passed by the second ask, so a failure is
 * forgotten here and the next ask is a retry rather than an echo.
 */
export function slashAskDoor<C>(
  origins: ReadonlySet<string>,
  build: () => Promise<SlashAskEngine<C> | undefined>,
  byok?: (ctx: C) => Promise<unknown>,
  reads: SlashDoorReads<C> = {},
): SlashAskDoor<C> {
  let built: Promise<SlashAskEngine<C> | undefined> | null = null;
  return {
    origins,
    engine: () => {
      built ??= build().catch((e: unknown) => {
        built = null;
        throw e;
      });
      return built;
    },
    ...(byok === undefined ? {} : { byok }),
    ...(reads.vault === undefined ? {} : { vault: reads.vault }),
    ...(reads.samples === undefined ? {} : { samples: reads.samples }),
  };
}

/** A Slash door this file answers. */
export type SlashRoute = 'read' | 'status' | 'settings' | 'propose' | 'asks' | 'pattern';

/** The two doors that are a GET: they read and change nothing, so a browser sends them with no `Origin`. */
const GETS: ReadonlySet<SlashRoute> = new Set(['status', 'asks']);

/**
 * Which Slash door a path is, or `null`.
 *
 * BOTH HOSTS DISPATCH ON THE TRUTH OF THIS AND NOTHING ELSE, which is why widening it mounts a door
 * without an edit to either app: `apps/selfhost/src/server.ts` hands the request to `serveSlash` when it
 * answers anything, and `apps/worker/src/index.ts` does the same inside `Record$` and refuses a bearer in
 * the router on `!== null`. `packages/host/test/slash-ask.test.ts` reads both hosts' wiring as text for it.
 */
export function servesSlash(pathname: string): SlashRoute | null {
  const hit = /^\/+api\/+slash\/+(read|status|settings|propose|asks|pattern)\/*$/.exec(pathname);
  return hit ? (hit[1] as SlashRoute) : null;
}

/**
 * The keys a settings patch may carry, which are the keys `configure` reads (`packages/slash/src/index.ts`): the source and
 * where his own key is asked (`loop/finish/contracts.md` §3.2), and `tier`, kept readable for one workflow.
 */
const SETTINGS = ['source', 'provider', 'base_url', 'model', 'grant_id', 'ask_cap', 'tier'] as const;

/** The asks one `GET /api/slash/asks` lists when it names no `limit`, and the most it lists when it names more. */
const ASKS_LISTED = 20;
const ASKS_MOST = 100;

/**
 * The most arrivals one pattern is drafted from, the ceiling on what one press sends a model. Three alike is where the inbox
 * offers the button (AGT-26), and a pattern is checked anchor by anchor against every sample it was drafted from, so a
 * handful proves it as well as a hundred would.
 */
export const PATTERN_SAMPLES_MOST = 10;

/**
 * A question is 400 bytes to the engine (`propose.ts` `ASK_BYTES`), and this is the envelope around it.
 *
 * IT IS A CEILING ON THE READ AND NOT A SECOND OPINION ABOUT THE QUESTION. The engine truncates to
 * its own budget and says so; what this stops is a stranger posting a megabyte at a door that is
 * about to run a model call, which is the same reason `keys.ts` caps its body at the vault's limit.
 * ONE CALL AND NOT TWO: `46 §13` D12's second pass is `propose`, which is its own door, so a `read`
 * never proposes, and the test measures `sent.length === 1` for a `read` that answered rows.
 */
const BODY_LIMIT = 4_000;

type Header = readonly [string, string];

function reply(status: number, payload: object, extra: readonly Header[] = []): Response {
  const headers = new Headers();
  for (const [k, v] of [...VAULT_HEADERS, ...extra]) headers.append(k, v);
  return new Response(JSON.stringify(payload), { status, headers });
}

const refusal = (status: number, refused: Refusal, extra: readonly Header[] = []): Response => reply(status, { ok: false, refusal: refused }, extra);

/** A result as the door answers it, with the status every other route gives it. */
export const slashReply = (out: Result<unknown>): Response => reply(httpStatus(out), out);

/** The one sentence every bearer gets here. `46 §5.2`: every bearer at a cookie route is 403 `NEEDS_BROWSER_SESSION`. */
const NO_BEARER: Refusal = {
  code: 'NEEDS_BROWSER_SESSION',
  fix: 'Open this in the app; a token cannot ask Slash about this record.',
  at: 'principal',
};

/** The sentence a host with no model behind Slash answers, and the one `/api/version` already says as `slash: false`. */
const NO_MODEL: Refusal = {
  code: 'NOT_IN_THIS_BUILD',
  fix: 'No model is configured behind Slash on this host, so it cannot read the record for you.',
};

/**
 * Answer the ask, for the session this host has already resolved.
 *
 * NOTHING THROWS ACROSS THIS BOUNDARY, and the engine builder is the reason the promise has to be
 * kept here rather than left to the host's outer catch. The builder opens a vault grant and
 * `import()`s a package, so a failure in it is a rejected promise on the first ask of the day, and
 * `serveApi`'s own comment records what an escaped throw cost: *"the caller never wrote a response at
 * all: the socket stayed open, the request hung, and on the self-host the SERVER then never closed."*
 * A 500 with a sentence is the answer, and the test that makes the builder throw asserts exactly
 * this, because an action that swallowed it into an `ok` would be an action nothing reaches again.
 */
export async function serveSlash<C>(request: Request, door: SlashAskDoor<C>, ctx: C): Promise<Response> {
  const url = new URL(request.url);
  const route = servesSlash(url.pathname);
  if (route === null)
    return refusal(404, {
      code: 'ROUTE_UNKNOWN',
      fix: "Slash's doors are /api/slash/read, /api/slash/status, /api/slash/settings, /api/slash/propose, /api/slash/asks and /api/slash/pattern.",
    });
  const path = `/api/slash/${route}`;
  const verb = GETS.has(route) ? 'GET' : 'POST';
  if (request.method !== verb) return refusal(405, { code: 'ROUTE_UNKNOWN', fix: `${path} takes a ${verb}.` }, [['allow', verb]]);

  /* A BEARER OF ANY KIND, BEFORE ANYTHING ELSE, as in `keys.ts`: on a self-host the server key makes
     the owner and would pass every check below this one, so it is the header that is refused rather
     than the principal behind it. */
  if (request.headers.get('authorization') !== null) return refusal(403, NO_BEARER);

  /* TWO ORIGIN RULES, BECAUSE A BROWSER SENDS `Origin` ON ONE METHOD AND NOT THE OTHER. Every browser
     sends it on a POST, so a POST with none is not a page and is refused. The Fetch standard adds it to a
     same-origin request only when the method is neither GET nor HEAD, so the palette's own
     `fetch('/api/slash/status')` carries none, and the POST rule would refuse every palette that opened.
     The GET is held to `apps/selfhost/src/server.ts` `forged` instead: a NAMED origin this host does not
     answer for, or a `Sec-Fetch-Site` that names another site, is a page somewhere else. Status reads no
     row and calls no model, so what a request with neither header can learn is a tier, a model name and
     a count. `asks` is the other GET and is held the same way; it answers only the owner's own session
     (`history` in the package), so a page elsewhere learns nothing through a cookie it cannot read. */
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  const foreign = GETS.has(route)
    ? (origin !== null && !door.origins.has(origin)) || (site !== null && site !== 'same-origin' && site !== 'none')
    : origin === null || !door.origins.has(origin);
  if (foreign) return refusal(403, { code: 'FORBIDDEN', fix: 'Slash is asked from this app, in a browser, on this address.', at: 'origin' });

  if (!door.engine) return refusal(501, NO_MODEL);

  if (route === 'status') {
    const engine = await built(door.engine);
    if (engine instanceof Response) return engine;
    return answer(() => ({ ok: true, value: engine.status() }));
  }

  if (route === 'asks') {
    /* DIGITS OR NOTHING, as a typed number is read everywhere (`loop/finish/rules.md` §4): `?limit=0x10` is not sixteen. */
    const said = url.searchParams.get('limit');
    if (said !== null && !/^[0-9]{1,4}$/u.test(said))
      return refusal(422, { code: 'VALUE_MALFORMED', fix: `limit is a whole number of asks, at most ${ASKS_MOST}.`, at: 'limit' });
    const limit = said === null ? ASKS_LISTED : Math.min(Math.max(1, Number(said)), ASKS_MOST);
    const engine = await built(door.engine);
    if (engine instanceof Response) return engine;
    const history = engine.history?.bind(engine);
    if (history === undefined) return refusal(501, NO_MODEL);
    return answer(() => history(limit, ctx));
  }

  if ((request.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() !== 'application/json')
    return refusal(400, { code: 'BODY_MALFORMED', fix: `${path} takes a JSON object, sent as application/json.` });
  const raw = await request.text();
  if (raw.length > BODY_LIMIT)
    return route === 'settings'
      ? refusal(400, { code: 'BODY_MALFORMED', fix: "Slash's settings are a few short fields, and this is far longer than all of them." })
      : route === 'pattern'
        ? refusal(400, { code: 'BODY_MALFORMED', fix: `A pattern is asked for with at most ${PATTERN_SAMPLES_MOST} arrivals, and this is far longer.`, at: 'samples' })
        : refusal(400, { code: 'BODY_MALFORMED', fix: 'A question is a sentence, and Slash reads the first 400 bytes of it.', at: 'question' });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
    return refusal(400, { code: 'BODY_MALFORMED', fix: `${path} takes a JSON object, sent as application/json.` });
  const body = parsed as Record<string, unknown>;

  if (route === 'settings') {
    const wrong = unsettled(body, door.byok !== undefined);
    if (wrong) return wrong;
    /* THE ADDRESS IS CHECKED AND WRITTEN ONE WAY HERE, where the host can say what a public address is, and the package
       stores what this hands it (`slashBaseUrlOf`). */
    const patch: Record<string, unknown> = { ...body };
    const typed = patch['base_url'];
    if (typeof typed === 'string' && typed.trim() !== '') {
      const checked = slashBaseUrlOf(typed);
      if (!checked.ok) return slashReply(checked);
      patch['base_url'] = checked.value;
    }
    /* AND A SAVE THAT POINTS HIS KEY SOMEWHERE PASSES THE VAULT'S OWN GATE FIRST (`slashKeySave`), in the vault's own
       sentence, so a month-old cookie cannot send his key to an address of somebody else's choosing. */
    if (door.vault !== undefined && slashKeySave(patch)) {
      let stop: Refusal | null;
      try {
        stop = await door.vault(ctx);
      } catch (e) {
        return refusal(500, { code: 'INTERNAL', fix: `The vault could not be asked about your key: ${e instanceof Error ? e.message : String(e)}.` });
      }
      if (stop !== null) return slashReply({ ok: false, refusal: stop });
    }
    const engine = await built(door.engine);
    if (engine instanceof Response) return engine;
    return answer(() => engine.configure(patch, ctx));
  }

  if (route === 'pattern') return pattern(body, door, ctx);

  /* THE TYPE AND NOT THE CONTENTS. A blank question is the engine's own refusal, in the engine's own
     words ("Ask Slash a question first. A blank ask has nothing to read."), and saying it twice in
     two files is two sentences to keep in step. What the engine cannot survive is a question that is
     not text at all: `question.trim()` on a number is a TypeError, which is a 500 for a value a
     caller can see and fix. */
  const question = body['question'];
  if (typeof question !== 'string')
    return refusal(422, { code: 'VALUE_MALFORMED', fix: `question is what you want to know, in words, and this one is ${shown(question)}.`, at: 'question' });

  /* `ask_id` IS PASS 1'S OWN ANSWER QUOTED BACK, so the package re-projects the predicate it stored instead
     of drafting a second one, which would be a second model call for the same question (`46 §5.5` step 1).
     Absent is a propose with no pass 1 behind it and the package drafts; anything but text is a caller
     that has confused the field with something else. */
  const askId = body['ask_id'];
  if (route === 'propose' && askId !== undefined && typeof askId !== 'string')
    return refusal(422, { code: 'VALUE_MALFORMED', fix: `ask_id is the one Slash's reading answered, as text, and this one is ${shown(askId)}.`, at: 'ask_id' });

  const engine = await built(door.engine);
  if (engine instanceof Response) return engine;

  /* HIS OWN KEY, OPENED FOR THIS ASKER, IS THE MODEL FOR BOTH PASSES. After the build and not before, because the settings
     row `slashOwnKeyOf` reads is created by the build. A refused opening is the answer and the engine is not asked: handed
     nothing instead, pass one would draft on another model before the package found the key closed. */
  const own = await opened(door, ctx);
  if (own instanceof Response) return own;
  if (route === 'read') return answer(() => engine.read(question, ctx, own));
  return answer(() => engine.propose(question, ctx, own, askId as string | undefined, own));
}

/**
 * `POST /api/slash/pattern`: a pattern drafted from arrivals the inbox holds, filed on Decide as a `pattern` proposal.
 *
 * THE ARRIVALS ARE NAMED BY ID AND READ BY THE RECORD, under the asker's own context (`door.samples`), so a caller who may
 * not read the inbox is refused in the record's own words and never has a message's text go to a model. The draft is the
 * package's (`proposePattern`, `packages/slash/src/jobs.ts`), on his own key where he chose it.
 *
 * A PRESS IS CHECKED AGAINST THE MONTH BEFORE ANY MODEL IS ASKED, on the same count `status()` shows: the package does
 * not hold a pattern to `ask_cap` itself, and a button that drafts past the month's limit is a model call nobody stopped
 * (`loop/research-spark-routes.md` F4). On his own key nothing is capped, so nothing stops it here.
 * ON THE INCLUDED MODEL, CHECKED AND NOT YET COUNTED. The draft settles as a `kind = 'pattern'` row, and the included
 * count `status()` reads is `read` and `propose` rows alone (`asksUsed` in `packages/slash/src/call.ts`), so a press does
 * not yet move it. Counting it is `call.ts`'s, which this unit asked of that file's owner. On his own key the listing
 * counts the press already (`keyedAsks` in `packages/slash/src/index.ts`).
 */
async function pattern<C>(body: Record<string, unknown>, door: SlashAskDoor<C>, ctx: C): Promise<Response> {
  const stray = Object.keys(body).find((k) => k !== 'samples');
  if (stray !== undefined)
    return refusal(422, { code: 'FIELD_UNKNOWN', fix: `${stray} is not something this call takes. It takes samples.`, at: stray, allowed: ['samples'] });
  const ids = body['samples'];
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > PATTERN_SAMPLES_MOST || !ids.every((id) => typeof id === 'string' && id !== ''))
    return refusal(422, {
      code: 'VALUE_MALFORMED',
      fix: `samples are the arrivals a pattern is drafted from, from one to ${PATTERN_SAMPLES_MOST} of them, each named as the inbox names it.`,
      at: 'samples',
    });
  if (!door.engine || !door.samples) return refusal(501, NO_MODEL);
  const engine = await built(door.engine);
  if (engine instanceof Response) return engine;
  const draft = engine.proposePattern?.bind(engine);
  if (draft === undefined) return refusal(501, NO_MODEL);

  const own = await opened(door, ctx);
  if (own instanceof Response) return own;
  const asks = (engine.status() as { asks?: { used?: unknown; cap?: unknown; resets?: unknown; capped?: unknown } } | undefined)?.asks;
  if (asks?.capped !== false && typeof asks?.used === 'number' && typeof asks.cap === 'number' && asks.used >= asks.cap)
    return slashReply({
      ok: false,
      refusal: {
        code: 'SLASH_BUDGET_SPENT',
        fix: `This month's Slash asks are spent until ${typeof asks.resets === 'string' ? asks.resets.slice(0, 10) : 'next month'}, so no pattern was drafted.`,
      },
    });

  let read: Result<unknown[]>;
  try {
    read = await door.samples([...new Set(ids as string[])], ctx);
  } catch (e) {
    return refusal(500, { code: 'INTERNAL', fix: `The inbox could not be read for Slash: ${e instanceof Error ? e.message : String(e)}.` });
  }
  if (!read.ok) return slashReply(read);
  const samples = read.value;
  return answer(() => draft(samples, ctx, own));
}

/**
 * His own key for this asker, as the host's `byok` answers it: an adapter, `undefined` on the included model, or the
 * refusal as the door's answer. A throw is a 500 with its sentence, since the vault was asked and did not answer.
 */
async function opened<C>(door: SlashAskDoor<C>, ctx: C): Promise<unknown> {
  let own: unknown;
  try {
    own = door.byok ? await door.byok(ctx) : undefined;
  } catch (e) {
    return refusal(500, { code: 'INTERNAL', fix: `Your key could not be opened for Slash: ${e instanceof Error ? e.message : String(e)}.` });
  }
  return refusedKey(own) ? slashReply({ ok: false, refusal: own.refusal }) : own;
}

/** A `byok` answer that is the host refusing to open the key, as `slashOwnKeyFor` writes one, and not an adapter. */
const refusedKey = (value: unknown): value is { ok: false; refusal: Refusal } =>
  typeof value === 'object' && value !== null && (value as { ok?: unknown }).ok === false && typeof (value as { refusal?: unknown }).refusal === 'object';

const shown = (value: unknown): string => JSON.stringify(value) ?? String(value);

/** The engine, or the refusal a person gets for a builder that threw or a host that configured no model. */
async function built<C>(engine: () => Promise<SlashAskEngine<C> | undefined>): Promise<SlashAskEngine<C> | Response> {
  let out: SlashAskEngine<C> | undefined;
  try {
    out = await engine();
  } catch (e) {
    return refusal(500, { code: 'INTERNAL', fix: `Slash could not be started here: ${e instanceof Error ? e.message : String(e)}.` });
  }
  return out ?? refusal(501, NO_MODEL);
}

/** One engine call, answered, with a throw out of it a 500 and a sentence rather than a hung socket. */
async function answer(run: () => Result<unknown> | Promise<Result<unknown>>): Promise<Response> {
  try {
    return slashReply(await run());
  } catch (e) {
    return refusal(500, { code: 'INTERNAL', fix: `Slash could not answer that: ${e instanceof Error ? e.message : String(e)}.` });
  }
}

/**
 * What the settings door refuses before `configure` reads the patch, or `null`.
 *
 * A KEY THIS DOOR DOES NOT KNOW IS REFUSED, BECAUSE THE ENGINE DOES NOT REFUSE IT. Measured on the package:
 * `configure({ tier: 'a', bogus: 1 }, owner)` answered `ok` with nothing changed, so an owner's typo was a
 * save that said it had worked. The record answers a stray `FIELD_UNKNOWN` everywhere, in `stray`'s sentence
 * (`packages/record/src/index.ts`), and this is that sentence.
 *
 * A VALUE OF THE WRONG JS TYPE IS REFUSED HERE TOO, because the engine's checks assume the type: `model.trim()`
 * on a number is a TypeError and a 500, the reason the ask checks `question`. The engine's own refusals about
 * the values themselves (a tier it does not run, a cap below zero, a grant id of the wrong shape) stay the
 * engine's, in its words.
 *
 * AND HIS OWN KEY WHERE THE HOST CANNOT OPEN A KEY IS 501, because storing it would break the palette on save:
 * every later ask would answer `FORBIDDEN` for a key no host here can open.
 */
function unsettled(patch: Record<string, unknown>, byok: boolean): Response | null {
  const stray = Object.keys(patch).find((k) => !(SETTINGS as readonly string[]).includes(k));
  if (stray !== undefined)
    return refusal(422, {
      code: 'FIELD_UNKNOWN',
      fix: `${stray} is not something this call takes. It takes ${SETTINGS.join(', ')}.`,
      at: stray,
      allowed: [...SETTINGS],
    });
  for (const key of ['source', 'provider', 'base_url', 'tier', 'model', 'grant_id'] as const) {
    const value = patch[key];
    if (value !== undefined && value !== null && typeof value !== 'string')
      return refusal(422, { code: 'VALUE_MALFORMED', fix: `${key} is text or null, and this one is ${shown(value)}.`, at: key });
  }
  if (patch['ask_cap'] !== undefined && typeof patch['ask_cap'] !== 'number')
    return refusal(422, {
      code: 'VALUE_MALFORMED',
      fix: `ask_cap is a number of asks, and this one is ${shown(patch['ask_cap'])}.`,
      at: 'ask_cap',
    });
  if ((patch['source'] === 'key' || patch['tier'] === 'b') && !byok)
    return refusal(501, { code: 'NOT_IN_THIS_BUILD', fix: 'Slash cannot use a key of your own on this host yet.', at: patch['source'] === 'key' ? 'source' : 'tier' });
  return null;
}

/* ── the record's own two asks, on the ledger every other ask settles in ─────────────────────────────── */

export type SlashLedgerDeps = {
  /** Slash's own SQLite, the one the app handed `createSlash`, holding its `slash_settings` and `slash_call` tables. */
  sql: Sql;
  clock: { now(): number };
  /**
   * The engine every other ask is held by, the one the door and the automations are built over, built here if no ask has
   * built it yet. Its `status()` is the count and the cap this meter refuses on, so an ask the record makes and an ask a
   * person makes at the palette are spent from one number, whatever that engine's wraps make of it.
   */
  engine: () => Promise<{ status(): unknown } | undefined>;
  /** The routing name the record's model answers under, which the row is written with: `glm-5.3-flash` for the included model. */
  model: string;
  /** Neurons per million tokens where this host's own account pays for that model. Absent, the row is priced at 0. */
  rate?: { in: number; out: number } | undefined;
};

/**
 * Slash's press and first plan held and settled in the package's own ledger (`@braindog/record` `SlashMeter`).
 *
 * THEY WERE THE TWO ASKS NOTHING COUNTED. `loop/research-batch-sixty-audit.md` finding 2 measured the audit's S2 probe, a
 * record 20 days old over the Worker's included model: 25 presses, 25 included calls, and neither a `call` row nor a look
 * at `ask_cap` anywhere, because the record's model is built beside the engine and not through it. The record now asks
 * this before it asks its model, and `packages/record/test/slash-press-cap.test.ts` drives the same 25 presses at
 * `ask_cap: 3` through the real engine: 3 model calls, `status()` reading 3 used, and the read after them refused.
 *
 * THE ROW IS `kind = 'read'` WITH NO PREDICATE, which is how the package already settles an ask that is not the palette's
 * (`answer.ts`, an automation's question), and the tier is the one the engine reads, as that row's is. So whichever count
 * the engine's `status()` reads, the package's own on tier `a` or the host's `drafted()` on `b` and `byo`, already sees it,
 * and `46 §4.1`'s CHECK needs no new kind. A `draft` kind of its own is the package's to add, as a step under its
 * `STORE_VERSION` (`packages/slash/src/call.ts`); until then `question` says which ask a row was.
 *
 * NO `await` BETWEEN THE CHECK AND THE HOLD, for the reason `packages/slash/src/call.ts` `reserve` gives: the hold is the
 * row the next ask's count includes, so two presses in flight cannot both pass the last ask of the month. The engine is
 * awaited first, and then `status()`, the check and the insert run in one synchronous step.
 *
 * THE COUNTS ARE THE RECORD'S ESTIMATE, bytes over three as the package's `tokens` counts a prompt, of what it sent and
 * what came back. The record's `SlashModel` answers the parsed plan and not the provider's usage, so this is the figure
 * the package itself bills a model it could not read a count from (`core.run`'s `UNREACHABLE` arm). IT BILLS LOW, AND BY
 * A LOT: the instructions and the schema are the host's and never reach the record. Measured on 24 September through the
 * Worker's own `workerSlashModel` over a binding reporting 700 tokens in and 60 out, the row held 176 and 5, 3 neurons
 * where the provider's count is 12. The COUNT against `ask_cap` is exact; the price waits on a `SlashModel` that hands
 * back the provider's usage, which is `packages/record/src/slash.ts` and each host's builder and not this file.
 */
/** The first instant of the month `ms` falls in, UTC, so a background spend and its cap agree on where the month starts. */
const monthStart = (ms: number): string => {
  const at = new Date(ms);
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1)).toISOString();
};

/** The day the month `ms` falls in resets, for the sentence a spent background allowance is shown with. */
const monthResets = (ms: number): string => {
  const at = new Date(ms);
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
};

export function slashRecordMeter(deps: SlashLedgerDeps): SlashMeter {
  const mint = ulids(() => deps.clock.now());
  return {
    async hold(kind) {
      const engine = await deps.engine();
      /* NO ENGINE IS NO LEDGER, AND NO LEDGER IS NO SPEND: the record reads a refusal as "the rules draft". */
      if (engine === undefined) return { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'Slash has no ledger on this host to count the ask in.' } };
      const status = engine.status() as { tier?: unknown; model?: unknown; asks?: { used?: unknown; cap?: unknown; resets?: unknown; capped?: unknown } } | undefined;
      const asks = status?.asks;
      if (typeof asks?.used !== 'number' || typeof asks.cap !== 'number')
        return { ok: false, refusal: { code: 'INTERNAL', fix: "Slash's count of this month's asks could not be read, so its model was not asked." } };
      /* ON HIS OWN KEY THE PRESS IS LISTED AND NOT CAPPED, as every ask there is (`capped: false`), and nothing of this
         host's is spent, so the row is priced 0 and named for the model his key is asked for. */
      const own = asks.capped === false;
      if (!own && asks.used >= asks.cap)
        return {
          ok: false,
          refusal: {
            code: 'SLASH_BUDGET_SPENT',
            fix: `This month's Slash asks are spent until ${typeof asks.resets === 'string' ? asks.resets.slice(0, 10) : 'next month'}.`,
          },
        };
      /* THE TIER THE ENGINE READS AND NOT THE ONE THE ROW HOLDS. Where a host does not run a stored tier the package reads it
         as `a` (`SlashOptions.tiers`), and a row written under the stored one would sit outside the count `status()` is. */
      const tier = typeof status?.tier === 'string' ? status.tier : 'a';
      const model = own && typeof status?.model === 'string' && status.model !== '' ? status.model : deps.model;
      const id = mint();
      const at = () => new Date(deps.clock.now()).toISOString();
      const t0 = deps.clock.now();
      deps.sql.exec(
        `INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, code, question)
         VALUES (?, ?, 'read', ?, ?, 0, 0, 0, 0, 'error', 'SLASH_PENDING', ?)`,
        id,
        at(),
        tier,
        model,
        kind === 'draft' ? "Slash's press" : "Slash's first plan",
      );
      let done = false;
      return {
        ok: true,
        value: {
          settle: ({ usage, code }) => {
            if (done) return;
            done = true;
            const rate = own ? undefined : deps.rate;
            const neurons = rate === undefined ? 0 : Math.round((usage.in * rate.in) / 1e6 + (usage.out * rate.out) / 1e6);
            deps.sql.exec(
              'UPDATE slash_call SET ts = ?, tokens_in = ?, tokens_out = ?, neurons = ?, ms = ?, status = ?, code = ? WHERE id = ?',
              at(),
              usage.in,
              usage.out,
              neurons,
              deps.clock.now() - t0,
              code === undefined ? 'ok' : 'error',
              code ?? null,
              id,
            );
          },
          /* NOTHING LEFT THIS HOST, SO NOTHING IS WRITTEN, as `answer` releases its hold for a call never sent. */
          release: () => {
            if (done) return;
            done = true;
            deps.sql.exec("DELETE FROM slash_call WHERE id = ? AND code = 'SLASH_PENDING'", id);
          },
        },
      };
    },
    /**
     * ONE ASK OF THE BACKGROUND ALLOWANCE, never his: the daily look's skill draft (GAP-12). Counted the way
     * `backgroundMeter` counts it, over a `pattern` row with no `filed`, which `asksUsed` (the engine's own count of kind
     * `read`) never sees, so a skill draft never spends one of his asks.
     */
    async background() {
      const engine = await deps.engine();
      if (engine === undefined) return { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'Slash has no ledger on this host to count the draft in.' } };
      const status = engine.status() as { tier?: unknown; model?: unknown } | undefined;
      const spent = backgroundMeter(deps.sql).spent(monthStart(deps.clock.now()));
      if (spent >= BACKGROUND_JOBS_MONTH)
        return {
          ok: false,
          refusal: { code: 'SLASH_BUDGET_SPENT', fix: `This month's background Slash asks are spent until ${monthResets(deps.clock.now())}.` },
        };
      const tier = typeof status?.tier === 'string' ? status.tier : 'a';
      const model = typeof status?.model === 'string' && status.model !== '' ? status.model : deps.model;
      const id = mint();
      const at = () => new Date(deps.clock.now()).toISOString();
      const t0 = deps.clock.now();
      deps.sql.exec(
        `INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, code, question)
         VALUES (?, ?, 'pattern', ?, ?, 0, 0, 0, 0, 'error', 'SLASH_PENDING', ?)`,
        id,
        at(),
        tier,
        model,
        "Slash's skill draft",
      );
      let done = false;
      return {
        ok: true,
        value: {
          settle: ({ usage, code }) => {
            if (done) return;
            done = true;
            const rate = deps.rate;
            const neurons = rate === undefined ? 0 : Math.round((usage.in * rate.in) / 1e6 + (usage.out * rate.out) / 1e6);
            deps.sql.exec(
              'UPDATE slash_call SET ts = ?, tokens_in = ?, tokens_out = ?, neurons = ?, ms = ?, status = ?, code = ? WHERE id = ?',
              at(),
              usage.in,
              usage.out,
              neurons,
              deps.clock.now() - t0,
              code === undefined ? 'ok' : 'error',
              code ?? null,
              id,
            );
          },
          release: () => {
            if (done) return;
            done = true;
            deps.sql.exec("DELETE FROM slash_call WHERE id = ? AND code = 'SLASH_PENDING'", id);
          },
        },
      };
    },
  };
}
