/**
 * Spark's doors: `POST /api/spark/read`, `GET /api/spark/status`, `POST /api/spark/settings` and
 * `POST /api/spark/propose`, the half both hosts share. `docs/46` §5.2, `23 §7` and `§8`.
 *
 * FOUR OF `46 §5.2`'s FIVE, AND THE READ WAS ALONE FOR A DAY. `loop/research-spark-routes.md` found that
 * the Spark object both hosts build has five methods and only `read` had a door, so tier stayed `a`, the
 * cap stayed 80, and an owner could neither see nor set Spark's model from the product. Status, settings
 * and propose are here now; `pattern` is not, and `SparkAskEngine` says why.
 *
 * BOTH HOSTS MOUNT THIS DOOR, AND THE ENGINE IS REACHED THROUGH IT FROM A BROWSER. `903bc9c9` wrote the
 * door and `1816500a` wrote the two branches in front of it, eight minutes apart on 21 September:
 * `apps/selfhost/src/server.ts` hands a request to `serveSpark` when `servesSpark` names the path, ahead
 * of `servesKeys`, and `apps/worker/src/index.ts` does the same in `Record$.#answer`, beside `servesMcp`'s
 * branch and behind two locks of its own (a person, and a credentialed one). The palette's `sparkRead`
 * (`packages/client/src/index.ts`) is the caller. This header said for a day afterwards that nothing
 * reached the door; that was true only between those two commits, and `loop/research-spark-seam.md` §0
 * is the survey that caught it.
 *
 * WHAT WAS WRONG ONCE IT WAS REACHED WAS THE WORKER'S BUILD OF THE ENGINE, and neither host's tests saw it,
 * because every one of them ran over `node:sqlite`. On a Durable Object `createSpark` threw
 * `not authorized: SQLITE_AUTH` from an unguarded `PRAGMA`, so `engine()` below rejected and every ask was
 * the 500 `INTERNAL` this door answers for a builder that threw, while `/api/version` said `spark: true`.
 * `packages/spark/src/index.ts` guards the pragma now, and `apps/worker/test/spark-in-do.test.ts` drives the
 * ask through workerd on real object storage: 500 before the guard, 200 after it. The same file carries a
 * `todo` for the fault behind that one, which is this package's: `post` in `spark.ts` sends
 * `redirect: 'error'`, workerd refuses the value, and so no model call leaves the Worker yet.
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
 * had to route."* `46 §5.2` had already put the ask at `POST /api/spark/read` behind a cookie, so
 * nothing here invents an address either.
 *
 * WHAT IT ASKS AND WHAT ANSWERS. A question in words goes in; the engine of `docs/46` drafts a
 * predicate for it, projects the record through `sparkRecord`'s six guarded reads under the ASKER's
 * own context, and answers the rows it found with the predicate it drafted and the fold of what it
 * read. That is the other Spark: the four `spark*` methods in `ROUTES` are the record's ARRANGEMENT
 * engine, which proposes how a BrainDog is put together, and `1f85a49a` settled that the two features
 * share a name and are both kept.
 *
 * THE ORDER: the path, then the method, then a bearer, then the origin, then whether there is a model
 * at all, and only then the body. It is `keys.ts`'s order for `keys.ts`'s reasons. A bearer is refused
 * `NEEDS_BROWSER_SESSION` whatever it is, which is `46 §5.2`'s own last line and `§6`'s row for it;
 * a request with no `Origin`, or one this host does not answer for, is the half of CSRF that does not
 * depend on the browser (`12 §8`), and it is why a cookie is admissible here at all. The one exception
 * is status, a GET, on which a browser sends no `Origin` to its own site; `serveSpark` says the rule
 * that replaces it.
 *
 * THE ENGINE IS A THUNK AND NOT AN OBJECT, because `46 §5.1` has the host `import()` the package once
 * and only when an endpoint is configured, and `apps/worker/src/spark.ts` builds it on the first ask
 * rather than at boot, when the Durable Object's record already exists. A door holding the built
 * engine would be a door that decided when to build it, one level too low.
 *
 * NO MODEL HERE IS A SENTENCE AND NOT A 404. `46 §5.1` says the routes are not registered at all
 * when `SPARK_ENDPOINT` is unset, and `/api/version` already answers `spark: false` so the app draws
 * no row to press. What is left for this door to answer is a caller who asked anyway, and
 * `ROUTE_UNKNOWN` would tell them the address is wrong when the address is right and the host has no
 * model. `keys.ts` made the same call for the same shape, `NOT_IN_THIS_BUILD` at 501: *"This host
 * holds no key store yet, so it keeps no keys."* Nothing about the loading rule changes: this file
 * imports `@braindog/spark` nowhere, and cannot, because `packages/host` does not depend on it.
 */

import type { Refusal, Result } from '@braindog/ports';

import { httpStatus } from './index.ts';
import { VAULT_HEADERS } from './vault.ts';

/**
 * The four methods of `Spark` these doors call, over whatever context the host resolves a session to.
 *
 * STRUCTURAL, AS `RecordSurface` IS. `packages/host` must not depend on `@braindog/spark`: `31 §2`
 * puts the package at row 13 and `46 §5.1` puts the `import()` in the app, so naming the type here
 * would be the edge this file exists to serve, pointing the wrong way. Both hosts already pass the
 * whole `Spark`, which satisfies this shape without a line of either app changing.
 *
 * FOUR AND NOT FIVE. This type said "one method rather than five because a door that names `configure`
 * is a door somebody can reach settings through", and that was the right caution while nothing checked
 * who was configuring. The check is the package's, and it was measured before this door named the
 * method: `configure` answers a `write` member and a `system` principal 403 `FORBIDDEN`, "Only the
 * record owner changes how Spark is set up." `proposePattern` is still left out on purpose, because it
 * is neither metered nor capped (`loop/research-spark-routes.md` F4: with `ask_cap: 0`, `read` refused
 * and `proposePattern` called the model anyway), and a door in front of it would be a second unmetered
 * model call behind a button until `docs/46` §4.1 says whether a pattern is an ask.
 */
export type SparkAskEngine<C> = {
  read(question: string, ctx: C): Promise<Result<unknown>>;
  status(): unknown;
  configure(patch: Record<string, unknown>, ctx: C): Result<unknown>;
  propose(question: string, ctx: C, byok?: unknown, askId?: string): Promise<Result<unknown>>;
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
 * `byok` IS THE HOST'S WAY TO OPEN THE OWNER'S OWN KEY FOR ONE PROPOSE, and it is absent on both hosts
 * today. The door reads nothing about tiers: it hands `propose` whatever `byok` answers for this
 * session. Where it is absent the settings door refuses tier `b` outright, because a stored tier `b`
 * that no host can serve would make every later `propose` answer `FORBIDDEN`.
 */
export type SparkAskDoor<C> = {
  origins: ReadonlySet<string>;
  engine?: (() => Promise<SparkAskEngine<C> | undefined>) | undefined;
  byok?: ((ctx: C) => Promise<unknown>) | undefined;
};

/**
 * A door over a builder that is asked once, which is what each host's `spark.ts` hands this file.
 *
 * IT IS HERE AND NOT IN THE TWO APPS because it was written twice and is the same paragraph both times, and
 * because neither app has a test suite this could be measured in: `apps/worker` and `apps/selfhost` both build
 * the engine from `@braindog/host/spark`'s two adapters so the hosts cannot drift, and a rule about WHEN to
 * build it drifts the same way a rule about how to open a key does.
 *
 * BUILT ON THE FIRST ASK AND NOT AT BOOT. `46 §5.1` has the host `import()` the package only when an endpoint is
 * configured, and `createSpark` writes two tables and the settings singleton into Spark's own SQLite (`46 §7`,
 * under 5 ms), so it wants the object's storage and the record that is already open rather than a cold start.
 *
 * AND A REJECTED PROMISE IS NOT A CACHED ANSWER, which `apps/worker/src/index.ts` `#record()` states the cost of
 * in its own words: `??=` stored whatever the opener returned, rejection included, so one transient failure at
 * cold start was remembered as this record's permanent state until the object was evicted. The first ask of the
 * day opens a vault grant, which can fail for a reason that has passed by the second ask, so a failure is
 * forgotten here and the next ask is a retry rather than an echo.
 */
export function sparkAskDoor<C>(
  origins: ReadonlySet<string>,
  build: () => Promise<SparkAskEngine<C> | undefined>,
  byok?: (ctx: C) => Promise<unknown>,
): SparkAskDoor<C> {
  let built: Promise<SparkAskEngine<C> | undefined> | null = null;
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
  };
}

/** A Spark door this file answers. */
export type SparkRoute = 'read' | 'status' | 'settings' | 'propose';

/**
 * Which Spark door a path is, or `null`. `46 §5.2` has five and four are served here; `pattern` waits for
 * `46 §4.1` to say whether a pattern is an ask (see `SparkAskEngine`).
 *
 * BOTH HOSTS DISPATCH ON THE TRUTH OF THIS AND NOTHING ELSE, which is why widening it mounted three doors
 * without an edit to either app: `apps/selfhost/src/server.ts` hands the request to `serveSpark` when it
 * answers anything, and `apps/worker/src/index.ts` does the same inside `Record$` and refuses a bearer in
 * the router on `!== null`.
 */
export function servesSpark(pathname: string): SparkRoute | null {
  const hit = /^\/+api\/+spark\/+(read|status|settings|propose)\/*$/.exec(pathname);
  return hit ? (hit[1] as SparkRoute) : null;
}

/** The four keys a settings patch may carry, which are the four `configure` reads (`packages/spark/src/index.ts`). */
const SETTINGS = ['tier', 'model', 'grant_id', 'ask_cap'] as const;

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
export const sparkReply = (out: Result<unknown>): Response => reply(httpStatus(out), out);

/** The one sentence every bearer gets here. `46 §5.2`: every bearer at a cookie route is 403 `NEEDS_BROWSER_SESSION`. */
const NO_BEARER: Refusal = {
  code: 'NEEDS_BROWSER_SESSION',
  fix: 'Open this in the app; a token cannot ask Spark about this record.',
  at: 'principal',
};

/** The sentence a host with no model behind Spark answers, and the one `/api/version` already says as `spark: false`. */
const NO_MODEL: Refusal = {
  code: 'NOT_IN_THIS_BUILD',
  fix: 'No model is configured behind Spark on this host, so it cannot read the record for you.',
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
export async function serveSpark<C>(request: Request, door: SparkAskDoor<C>, ctx: C): Promise<Response> {
  const route = servesSpark(new URL(request.url).pathname);
  if (route === null)
    return refusal(404, { code: 'ROUTE_UNKNOWN', fix: "Spark's doors are /api/spark/read, /api/spark/status, /api/spark/settings and /api/spark/propose." });
  const path = `/api/spark/${route}`;
  const verb = route === 'status' ? 'GET' : 'POST';
  if (request.method !== verb) return refusal(405, { code: 'ROUTE_UNKNOWN', fix: `${path} takes a ${verb}.` }, [['allow', verb]]);

  /* A BEARER OF ANY KIND, BEFORE ANYTHING ELSE, as in `keys.ts`: on a self-host the server key makes
     the owner and would pass every check below this one, so it is the header that is refused rather
     than the principal behind it. */
  if (request.headers.get('authorization') !== null) return refusal(403, NO_BEARER);

  /* TWO ORIGIN RULES, BECAUSE A BROWSER SENDS `Origin` ON ONE METHOD AND NOT THE OTHER. Every browser
     sends it on a POST, so a POST with none is not a page and is refused. The Fetch standard adds it to a
     same-origin request only when the method is neither GET nor HEAD, so the palette's own
     `fetch('/api/spark/status')` carries none, and the POST rule would refuse every palette that opened.
     The GET is held to `apps/selfhost/src/server.ts` `forged` instead: a NAMED origin this host does not
     answer for, or a `Sec-Fetch-Site` that names another site, is a page somewhere else. Status reads no
     row and calls no model, so what a request with neither header can learn is a tier, a model name and
     a count. */
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  const foreign =
    route === 'status'
      ? (origin !== null && !door.origins.has(origin)) || (site !== null && site !== 'same-origin' && site !== 'none')
      : origin === null || !door.origins.has(origin);
  if (foreign) return refusal(403, { code: 'FORBIDDEN', fix: 'Spark is asked from this app, in a browser, on this address.', at: 'origin' });

  if (!door.engine) return refusal(501, NO_MODEL);

  if (route === 'status') {
    const engine = await built(door.engine);
    if (engine instanceof Response) return engine;
    return answer(() => ({ ok: true, value: engine.status() }));
  }

  if ((request.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() !== 'application/json')
    return refusal(400, { code: 'BODY_MALFORMED', fix: `${path} takes a JSON object, sent as application/json.` });
  const raw = await request.text();
  if (raw.length > BODY_LIMIT)
    return route === 'settings'
      ? refusal(400, { code: 'BODY_MALFORMED', fix: "Spark's settings are four short fields, and this is far longer than all four." })
      : refusal(400, { code: 'BODY_MALFORMED', fix: 'A question is a sentence, and Spark reads the first 400 bytes of it.', at: 'question' });
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
    const engine = await built(door.engine);
    if (engine instanceof Response) return engine;
    return answer(() => engine.configure(body, ctx));
  }

  /* THE TYPE AND NOT THE CONTENTS. A blank question is the engine's own refusal, in the engine's own
     words ("Ask Spark a question first. A blank ask has nothing to read."), and saying it twice in
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
    return refusal(422, { code: 'VALUE_MALFORMED', fix: `ask_id is the one Spark's reading answered, as text, and this one is ${shown(askId)}.`, at: 'ask_id' });

  const engine = await built(door.engine);
  if (engine instanceof Response) return engine;
  if (route === 'read') return answer(() => engine.read(question, ctx));

  let byok: unknown;
  try {
    byok = door.byok ? await door.byok(ctx) : undefined;
  } catch (e) {
    return refusal(500, { code: 'INTERNAL', fix: `Your key could not be opened for Spark: ${e instanceof Error ? e.message : String(e)}.` });
  }
  return answer(() => engine.propose(question, ctx, byok, askId as string | undefined));
}

const shown = (value: unknown): string => JSON.stringify(value) ?? String(value);

/** The engine, or the refusal a person gets for a builder that threw or a host that configured no model. */
async function built<C>(engine: () => Promise<SparkAskEngine<C> | undefined>): Promise<SparkAskEngine<C> | Response> {
  let out: SparkAskEngine<C> | undefined;
  try {
    out = await engine();
  } catch (e) {
    return refusal(500, { code: 'INTERNAL', fix: `Spark could not be started here: ${e instanceof Error ? e.message : String(e)}.` });
  }
  return out ?? refusal(501, NO_MODEL);
}

/** One engine call, answered, with a throw out of it a 500 and a sentence rather than a hung socket. */
async function answer(run: () => Result<unknown> | Promise<Result<unknown>>): Promise<Response> {
  try {
    return sparkReply(await run());
  } catch (e) {
    return refusal(500, { code: 'INTERNAL', fix: `Spark could not answer that: ${e instanceof Error ? e.message : String(e)}.` });
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
 * AND TIER `b` WHERE THE HOST CANNOT OPEN A KEY IS 501, because storing it would break the palette on save:
 * every later `propose` would answer `FORBIDDEN` for a key no host here can open.
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
  for (const key of ['tier', 'model', 'grant_id'] as const) {
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
  if (patch['tier'] === 'b' && !byok)
    return refusal(501, { code: 'NOT_IN_THIS_BUILD', fix: 'Spark cannot use a key of your own on this host yet.', at: 'tier' });
  return null;
}
