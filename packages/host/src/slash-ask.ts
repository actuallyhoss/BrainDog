/**
 * Slash's doors: `POST /api/slash/read`, `GET /api/slash/status`, `POST /api/slash/settings`,
 * `POST /api/slash/propose`, `GET /api/slash/asks`, `POST /api/slash/pattern`, and the first run's
 * `POST /api/slash/setup` and `POST /api/slash/mapping`, the half both hosts share. `docs/46` §5.2, `23 §7` and `§8`.
 *
 * THE READ WAS ALONE FOR A DAY. The Slash object both hosts
 * build had five methods and only `read` had a door, so tier stayed `a`, the cap stayed 80, and an owner
 * could neither see nor set Slash's model from the product. Status, settings and propose came next; the
 * owner's list of what was asked (`asks`) and a pattern drafted from the inbox (`pattern`) are the last
 * two, and this file is their one writer.
 *
 * BOTH HOSTS MOUNT THIS DOOR, AND THE ENGINE IS REACHED THROUGH IT FROM A BROWSER. `903bc9c9` wrote the
 * door and `1816500a` wrote the two branches in front of it, eight minutes apart:
 * `apps/selfhost/src/server.ts` hands a request to `serveSlash` when `servesSlash` names the path, ahead
 * of `servesKeys`, and `apps/worker/src/index.ts` does the same in `Record$.#answer`, beside `servesMcp`'s
 * branch and behind two locks of its own (a person, and a credentialed one). The palette's `slashRead`
 * (`packages/client/src/index.ts`) is the caller.
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
 * SO IT IS THE SHAPE THE TREE ALREADY HAS FOR EXACTLY THIS, in `keychain.ts`, `keys.ts` and
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

import { messageOf } from './log-floor.ts';
import { ulids } from '@braindog/kernel';
import { codeOf, fixOf, type Refusal, type Result, type Sql } from '@braindog/ports';
import type { SlashBackground, SlashMeter } from '@braindog/record';

import { ABUSE, tooManyLine } from './abuse.ts';
import { httpStatus } from './index.ts';
import { mayThink, sendable, type Reads } from './infer.ts';
import { backgroundMeter, BACKGROUND_JOBS_MONTH, HEADLINE_ASK, UNDERSTAND_ASK, type AskPurpose, type AskSpends } from './model-jobs.ts';
import { slashBaseUrlOf, slashKeySave } from './slash.ts';
import { KEYCHAIN_HEADERS } from './keychain.ts';
import { turnedAway } from './slash-turned-away.ts';

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
 * over one answers their paths 501 in `NO_MODEL`'s words rather than a 500. Each ask `history` lists carries its
 * `purpose`, the ledger's own column, which the door passes on untouched.
 */
export type SlashAskEngine<C> = {
  read(question: string, ctx: C, inference?: unknown): Promise<Result<unknown>>;
  status(): unknown;
  configure(patch: Record<string, unknown>, ctx: C): Result<unknown>;
  propose(question: string, ctx: C, byok?: unknown, askId?: string, inference?: unknown): Promise<Result<unknown>>;
  history?(limit: number, ctx: C): Result<unknown>;
  proposePattern?(samples: readonly unknown[], ctx: C, inference?: unknown): Promise<Result<unknown>>;
  /** The first run's two asks (`packages/slash/src/propose.ts`), each handed the body whole: the engine reads it itself. */
  proposeSetup?(ask: unknown, ctx: C, inference?: unknown): Promise<Result<unknown>>;
  proposeMapping?(ask: unknown, ctx: C, inference?: unknown): Promise<Result<unknown>>;
  /** A conversation's turn, its held actions and the conversation read back (`packages/slash/src/chat.ts`). */
  chat?(input: SlashChatInput, ctx: C, tools: unknown, emit: (event: Record<string, unknown>) => void, inference?: unknown, deep?: unknown): Promise<void>;
  act?(id: string, accept: boolean, ctx: C, tools: unknown): Promise<Result<unknown>>;
  thread?(id: string, ctx: C): Result<unknown>;
  threads?(ctx: C): Result<unknown>;
  /** One of this person's conversations named, or deleted (`POST /api/slash/conversation`). */
  rename?(id: string, name: string, ctx: C): Result<unknown>;
  remove?(id: string, ctx: C): Result<unknown>;
};

/**
 * What a person sends in a conversation, as the door has checked it: the words, the thread and the page, how deep to go
 * (`quick`, `deep` or `auto`), the rows they sent with it, and `rethink` for "Think harder" on the thread's last answer.
 */
export type SlashChatInput = {
  thread?: string;
  message: string;
  page?: { path: string; title?: string; row?: string };
  mode?: 'quick' | 'deep' | 'auto';
  attach?: string[];
  mentions?: { at: number; len: number; ref: string }[];
  rethink?: boolean;
};

/**
 * The most things one message may send Slash, and the forms each is named in: a row (`tasks#12`), or a question in Decide,
 * an agent's run or a vital sign by its id (`decide:<id>`, `run:<id>`, `sign:<id>`).
 */
const ATTACH_MOST = 8;
const ROW_REF = /^(?:[a-z][a-z0-9_]*#[1-9][0-9]*|(?:decide|run|sign):[A-Za-z0-9_.:-]{1,80})$/u;

/**
 * The tools a conversation reads and writes through, built by the host for one asker (`@braindog/mcp/slash-tools`). The
 * door hands them to the engine unread, and asks `now` itself, which needs no model.
 */
export type SlashChatTools = { now?(): Promise<readonly { text: string; href?: string }[]> };

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
 * key store is, and handed the asker's context so the keychain's own gate runs on it (`slashOwnKeyFor`
 * in `slash.ts`). The door reads nothing about tiers: it hands every ask whatever `byok` answers for
 * this session, as the model for both passes, and when that answer is a refusal it is the answer,
 * before the engine is called, so a caller the keychain turns away costs no model call. Where `byok` is
 * absent the settings door refuses his own key outright, because a stored choice no host can serve
 * would make every later ask answer `FORBIDDEN`.
 *
 * `keychain` IS THE KEYCHAIN'S OWN GATE, which a save that points his key somewhere must pass (`slashKeySave`):
 * the owner, in a browser, proved in the last fifteen minutes. `samples` reads the inbox arrivals a
 * pattern is asked for, under the asker's own context, so the record decides who may read them.
 */
export type SlashAskDoor<C> = {
  origins: ReadonlySet<string>;
  engine?: (() => Promise<SlashAskEngine<C> | undefined>) | undefined;
  byok?: ((ctx: C) => Promise<unknown>) | undefined;
  keychain?: ((ctx: C) => Promise<Refusal | null>) | undefined;
  samples?: ((ids: readonly string[], ctx: C) => Promise<Result<unknown[]>>) | undefined;
  /**
   * Whether Slash's model answers, read from its own ledger (`engine-health.ts` `engineHealthRead`). Asked even where the
   * host wired no engine, since `off` is an answer too; absent, the door answers `NOT_IN_THIS_BUILD`.
   */
  health?: (() => Promise<unknown>) | undefined;
  /** The day's ceiling on asks that spend the person's allowance (`slashDayStop`): a refusal to answer 429, or `null` to go on. */
  day?: (() => Promise<Refusal | null>) | undefined;
  /** The tools of a conversation, for this asker (`SlashChatTools`). Absent, the conversation's doors answer `NOT_IN_THIS_BUILD`. */
  chat?: ((ctx: C) => SlashChatTools) | undefined;
  /**
   * Deep for this asker (`slashDeepFor` in `slash.ts`): the port over the owner's Anthropic key, `{ refused }` with the
   * sentence where it will not open, or `undefined` where no key is set. Asked only for a turn that may go deep, so a quick
   * turn never runs the keychain's gate. Absent, Deep is never offered and a deep turn is handed to the Mac.
   */
  deep?: ((ctx: C) => Promise<unknown>) | undefined;
};

/** What a host hands `slashAskDoor` beside the builder: the keychain's gate, the inbox's reader and the day's ceiling (`SlashAskDoor`). */
export type SlashDoorReads<C> = Pick<SlashAskDoor<C>, 'keychain' | 'samples' | 'health' | 'day' | 'chat' | 'deep'>;

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
 * day opens a keychain grant, which can fail for a reason that has passed by the second ask, so a failure is
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
    ...(reads.keychain === undefined ? {} : { keychain: reads.keychain }),
    ...(reads.samples === undefined ? {} : { samples: reads.samples }),
    ...(reads.health === undefined ? {} : { health: reads.health }),
    ...(reads.day === undefined ? {} : { day: reads.day }),
    ...(reads.chat === undefined ? {} : { chat: reads.chat }),
    ...(reads.deep === undefined ? {} : { deep: reads.deep }),
  };
}

/** A Slash door this file answers. */
export type SlashRoute = 'read' | 'status' | 'settings' | 'propose' | 'asks' | 'pattern' | 'setup' | 'mapping' | 'health' | 'chat' | 'act' | 'now' | 'thread' | 'threads' | 'conversation';

/** The doors that are a GET: they read and change nothing, so a browser sends them with no `Origin`. */
const GETS: ReadonlySet<SlashRoute> = new Set(['status', 'asks', 'health', 'now', 'thread', 'threads']);

/**
 * Which Slash door a path is, or `null`.
 *
 * BOTH HOSTS DISPATCH ON THE TRUTH OF THIS AND NOTHING ELSE, which is why widening it mounts a door
 * without an edit to either app: `apps/selfhost/src/server.ts` hands the request to `serveSlash` when it
 * answers anything, and `apps/worker/src/index.ts` does the same inside `Record$` and refuses a bearer in
 * the router on `!== null`. `packages/host/test/slash-ask.test.ts` reads both hosts' wiring as text for it.
 */
export function servesSlash(pathname: string): SlashRoute | null {
  const hit = /^\/+api\/+slash\/+(read|status|settings|propose|asks|pattern|setup|mapping|health|chat|act|now|threads|conversation)\/*$/.exec(pathname);
  if (hit) return hit[1] as SlashRoute;
  /* A CONVERSATION IS READ BACK AT ITS OWN ADDRESS, `thread/<id>`, the id one this door minted. */
  return /^\/+api\/+slash\/+thread\/+[0-9A-Z]{26}\/*$/.test(pathname) ? 'thread' : null;
}

/**
 * The keys a settings patch may carry, which are the keys `configure` reads (`packages/slash/src/index.ts`): the source and
 * where his own key is asked, and `tier`, kept readable for one release.
 */
const SETTINGS = ['source', 'provider', 'base_url', 'model', 'grant_id', 'ask_cap', 'tier', 'deep_grant_id', 'deep_cap_cents'] as const;

/** The asks one `GET /api/slash/asks` lists when it names no `limit`, and the most it lists when it names more. */
const ASKS_LISTED = 20;
const ASKS_MOST = 100;

/**
 * The most arrivals one pattern is drafted from, the ceiling on what one press sends a model. Three alike is where the inbox
 * offers the button, and a pattern is checked anchor by anchor against every sample it was drafted from, so a
 * handful proves it as well as a hundred would.
 */
export const PATTERN_SAMPLES_MOST = 10;

/**
 * A question is 400 bytes to the engine (`propose.ts` `ASK_BYTES`), and this is the envelope around it.
 *
 * IT IS A CEILING ON THE READ AND NOT A SECOND OPINION ABOUT THE QUESTION. The engine truncates to
 * its own budget and says so; what this stops is a stranger posting a megabyte at a door that is
 * about to run a model call, which is the same reason `keys.ts` caps its body at the keychain's limit.
 * ONE CALL AND NOT TWO: `46 §13` D12's second pass is `propose`, which is its own door, so a `read`
 * never proposes, and the test measures `sent.length === 1` for a `read` that answered rows.
 */
const BODY_LIMIT = 4_000;

/**
 * The first run's envelope: the catalogue the screen was drawn from rides along with what was typed, and the setup's offer
 * alone is about 3 KB. The engine cuts every part to its own size (`setupAskOf`, `mappingAskOf`); this stops a megabyte.
 */
const FIRST_RUN_BODY_LIMIT = 32_000;

type Header = readonly [string, string];

function reply(status: number, payload: object, extra: readonly Header[] = []): Response {
  const headers = new Headers();
  for (const [k, v] of [...KEYCHAIN_HEADERS, ...extra]) headers.append(k, v);
  return new Response(JSON.stringify(payload), { status, headers });
}

const refusal = (status: number, refused: Refusal, extra: readonly Header[] = []): Response => reply(status, { ok: false, refusal: refused }, extra);

/** A result as the door answers it, with the status every other route gives it. */
export const slashReply = (out: Result<unknown>): Response => reply(httpStatus(out), out);

/**
 * THE DAY'S CEILING ON ASKS THAT SPEND THE PERSON'S ALLOWANCE (`ABUSE.slashDay`), counted from Slash's own ledger.
 *
 * ON TOP OF THE PLAN'S MONTH AND NEVER IN ITS PLACE: `ask_cap` stays the plan's, and this only stops one UTC day from
 * spending a whole month at a loop's speed. An ask on his own key spends nothing of ours (`spends` is not `person`) and
 * is not counted. A ledger that cannot be read goes on, since the month's cap still holds behind it.
 */
export function slashDayStop(sql: Sql, now: number): Refusal | null {
  const midnight = new Date(now);
  midnight.setUTCHours(0, 0, 0, 0);
  let used = 0;
  try {
    used = Number(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM slash_call WHERE purpose = 'ask' AND spends = 'person' AND ts >= ?", midnight.toISOString())?.n ?? 0);
  } catch {
    return null;
  }
  if (used < ABUSE.slashDay.most) return null;
  const wait = Math.max(1, Math.ceil((midnight.getTime() + 86_400_000 - now) / 1000));
  return { code: 'RATE_LIMITED', fix: tooManyLine(wait), retry_after: wait };
}

/** The one sentence every bearer gets here. `46 §5.2`: every bearer at a cookie route is 403 `NEEDS_BROWSER_SESSION`. */
const NO_BEARER: Refusal = {
  code: 'NEEDS_BROWSER_SESSION',
  fix: 'Open this in the app; a token cannot ask Slash about this BrainDog.',
  at: 'principal',
};

/** The sentence a host with no model behind Slash answers, and the one `/api/version` already says as `slash: false`. */
const NO_MODEL: Refusal = {
  code: 'NOT_IN_THIS_BUILD',
  fix: 'No model is configured behind Slash on this host, so it cannot read your BrainDog for you.',
};

/** The sentence a host that hands no health read answers at `/api/slash/health`. */
const NO_HEALTH: Refusal = {
  code: 'NOT_IN_THIS_BUILD',
  fix: "This host does not read Slash's health yet.",
};

/**
 * Answer the ask, for the session this host has already resolved.
 *
 * NOTHING THROWS ACROSS THIS BOUNDARY, and the engine builder is the reason the promise has to be
 * kept here rather than left to the host's outer catch. The builder opens a keychain grant and
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
      fix: "Slash's doors are /api/slash/read, /api/slash/status, /api/slash/settings, /api/slash/propose, /api/slash/asks, /api/slash/pattern, /api/slash/setup, /api/slash/mapping, /api/slash/health, /api/slash/chat, /api/slash/act, /api/slash/thread/<id>, /api/slash/threads, /api/slash/conversation and /api/slash/now.",
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
     a count. `health` reads no row either, a state and a sentence. `asks` is the third GET and is held the same way; it answers only the owner's own session
     (`history` in the package), so a page elsewhere learns nothing through a cookie it cannot read. */
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  const foreign = GETS.has(route)
    ? (origin !== null && !door.origins.has(origin)) || (site !== null && site !== 'same-origin' && site !== 'none')
    : origin === null || !door.origins.has(origin);
  if (foreign) return refusal(403, { code: 'FORBIDDEN', fix: 'Slash is asked from this app, in a browser, on this address.', at: 'origin' });

  /* THE ENGINE'S HEALTH, BEFORE THE ENGINE IS ASKED FOR, because a host with no model answers it too (`off`), and reading it
     builds nothing: it reads Slash's ledger and calls no model. Any signed-in person, since it holds no row and no words. */
  if (route === 'health') {
    const health = door.health;
    if (health === undefined) return refusal(501, NO_HEALTH);
    return answer(async () => ({ ok: true, value: await health() }));
  }

  /* WHAT MATTERS NOW, read from the record's own briefing with no model, so it answers on a host with none. */
  if (route === 'now') {
    const tools = door.chat?.(ctx);
    if (tools?.now === undefined) return refusal(501, NO_CHAT);
    const now = tools.now.bind(tools);
    return flat(async () => ({ ok: true, value: { lines: await now() } }));
  }

  if (!door.engine) return refusal(501, NO_MODEL);

  if (route === 'threads') {
    const engine = await built(door.engine);
    if (engine instanceof Response) return engine;
    const threads = engine.threads?.bind(engine);
    if (threads === undefined) return refusal(501, NO_CHAT);
    return flat(() => threads(ctx));
  }

  if (route === 'thread') {
    const id = /([0-9A-Z]{26})\/*$/.exec(url.pathname)?.[1] ?? '';
    const engine = await built(door.engine);
    if (engine instanceof Response) return engine;
    const thread = engine.thread?.bind(engine);
    if (thread === undefined) return refusal(501, NO_CHAT);
    return flat(() => thread(id, ctx));
  }

  if (route === 'status') {
    const engine = await built(door.engine);
    if (engine instanceof Response) return engine;
    return answer(() => ({ ok: true, value: engine.status() }));
  }

  if (route === 'asks') {
    /* DIGITS OR NOTHING, as a typed number is read everywhere: `?limit=0x10` is not sixteen. */
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
  if (route === 'chat' && raw.length > CHAT_BODY_LIMIT)
    return refusal(400, { code: 'BODY_MALFORMED', fix: 'A message to Slash is a few sentences, and this is far longer.', at: 'message' });
  if (route !== 'chat' && raw.length > (route === 'setup' || route === 'mapping' ? FIRST_RUN_BODY_LIMIT : BODY_LIMIT))
    return route === 'setup'
      ? refusal(400, { code: 'BODY_MALFORMED', fix: 'The first run sends what you said and what it offered, and this is far longer than both.' })
      : route === 'mapping'
        ? refusal(400, { code: 'BODY_MALFORMED', fix: 'A file is read from its headings and first few entries, and this is far longer than those.' })
        : route === 'settings'
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
    /* AND A SAVE THAT POINTS HIS KEY SOMEWHERE PASSES THE KEYCHAIN'S OWN GATE FIRST (`slashKeySave`), in the keychain's own
       sentence, so a month-old cookie cannot send his key to an address of somebody else's choosing. */
    if (door.keychain !== undefined && slashKeySave(patch)) {
      let stop: Refusal | null;
      try {
        stop = await door.keychain(ctx);
      } catch (e) {
        return refusal(500, { code: 'INTERNAL', fix: `The keychain could not be asked about your key: ${messageOf(e)}.` });
      }
      if (stop !== null) return slashReply({ ok: false, refusal: stop });
    }
    const engine = await built(door.engine);
    if (engine instanceof Response) return engine;
    return answer(() => engine.configure(patch, ctx));
  }

  if (route === 'pattern') return pattern(body, door, ctx);
  if (route === 'conversation') return renamedOrRemoved(body, door, ctx);
  if (route === 'chat' || route === 'act') return conversation(route, body, door, ctx);
  if (route === 'setup' || route === 'mapping') return firstRun(route, body, door, ctx);

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
  const day = await door.day?.();
  if (day) return slashReply({ ok: false, refusal: day });
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
 * not hold a pattern to `ask_cap` itself, and a button that drafts past the month's limit is a model call nobody stopped.
 * On his own key nothing is capped, so nothing stops it here.
 * ON THE INCLUDED MODEL, CHECKED AND COUNTED. The draft settles as a `kind = 'pattern'` row that says it spent his
 * allowance (`purpose = 'ask'`, `spends = 'person'`, written by the package where it settles), and the count `status()`
 * reads is every row that says so (`asksUsed` in `packages/slash/src/call.ts`). So a press moves his count whether its
 * pattern was filed or the checks refused it, and it never moves the background count (`model-jobs.ts`
 * `backgroundSpent`), which once took every press that filed nothing. On his own key the listing counts the press as it
 * always did (`keyedAsks` in `packages/slash/src/index.ts`).
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

  const day = await door.day?.();
  if (day) return slashReply({ ok: false, refusal: day });
  const own = await opened(door, ctx);
  if (own instanceof Response) return own;
  const asks = (engine.status() as { asks?: { used?: unknown; cap?: unknown; resets?: unknown; capped?: unknown } } | undefined)?.asks;
  if (asks?.capped !== false && typeof asks?.used === 'number' && typeof asks.cap === 'number' && asks.used >= asks.cap)
    return slashReply({
      ok: false,
      refusal: {
        code: 'SLASH_BUDGET_SPENT',
        fix: `This month's Slash questions are used until ${typeof asks.resets === 'string' ? asks.resets.slice(0, 10) : 'next month'}, so no pattern was drafted.`,
      },
    });

  let read: Result<unknown[]>;
  try {
    read = await door.samples([...new Set(ids as string[])], ctx);
  } catch (e) {
    return refusal(500, { code: 'INTERNAL', fix: `The inbox could not be read for Slash: ${messageOf(e)}.` });
  }
  if (!read.ok) return slashReply(read);
  const samples = read.value;
  return answer(() => draft(samples, ctx, own));
}

/**
 * `POST /api/slash/setup` and `POST /api/slash/mapping`: the first run's two asks, a setup from what a person said about
 * themselves and a mapping for a file they exported elsewhere. Neither writes: the answer is a proposal the first run draws,
 * and the person's one press is what writes it.
 *
 * THE BODY GOES TO THE ENGINE WHOLE, AFTER A CHECK OF ITS KEYS. The engine reads it into its own shape (`setupAskOf`,
 * `mappingAskOf` in `packages/slash/src/propose.ts`), so a malformed part is a smaller ask or the engine's own refusal and
 * never a throw. A key neither takes is refused here, as the pattern door refuses one.
 *
 * ON HIS OWN KEY WHERE HE CHOSE IT, as every ask is, and an engine built before these two answers 501 in `NO_MODEL`'s words,
 * which the first run reads as "use the rules".
 */
async function firstRun<C>(route: 'setup' | 'mapping', body: Record<string, unknown>, door: SlashAskDoor<C>, ctx: C): Promise<Response> {
  /* `first` IS THE OWNER'S SIGN-UP WORDS, read once on the house (`FIRST_WORDS` in `packages/slash/src/propose.ts`).
     `asked` IS THE CONVERSATION'S QUESTIONS SO FAR, which the page has sent since 1 November and this door refused by name,
     so every answer after the first was read by the rules; `quick` asks one turn of it (`turn`), not the whole reading;
     `kind` is what the BrainDog was made as, for the read after the build (`drafts`). */
  const takes = route === 'setup' ? ['said', 'offer', 'today', 'first', 'asked', 'quick', 'kind'] : ['file', 'columns', 'sample', 'lists'];
  const stray = Object.keys(body).find((k) => !takes.includes(k));
  if (stray !== undefined)
    return refusal(422, { code: 'FIELD_UNKNOWN', fix: `${stray} is not something this call takes. It takes ${takes.join(', ')}.`, at: stray, allowed: takes });
  if (!door.engine) return refusal(501, NO_MODEL);
  const engine = await built(door.engine);
  if (engine instanceof Response) return engine;
  const ask = (route === 'setup' ? engine.proposeSetup : engine.proposeMapping)?.bind(engine);
  if (ask === undefined) return refusal(501, NO_MODEL);
  const own = await opened(door, ctx);
  if (own instanceof Response) return own;
  return answer(() => ask(body, ctx, own));
}

/**
 * His own key for this asker, as the host's `byok` answers it: an adapter, `undefined` on the included model, or the
 * refusal as the door's answer. A throw is a 500 with its sentence, since the keychain was asked and did not answer.
 */
async function opened<C>(door: SlashAskDoor<C>, ctx: C): Promise<unknown> {
  let own: unknown;
  try {
    own = door.byok ? await door.byok(ctx) : undefined;
  } catch (e) {
    return refusal(500, { code: 'INTERNAL', fix: `Your key could not be opened for Slash: ${messageOf(e)}.` });
  }
  return refusedKey(own) ? slashReply({ ok: false, refusal: own.refusal }) : own;
}

/** A `byok` answer that is the host refusing to open the key, as `slashOwnKeyFor` writes one, and not an adapter. */
const refusedKey = (value: unknown): value is { ok: false; refusal: Refusal } =>
  typeof value === 'object' && value !== null && (value as { ok?: unknown }).ok === false && typeof (value as { refusal?: unknown }).refusal === 'object';

const shown = (value: unknown): string => JSON.stringify(value) ?? String(value);

/** The sentence a host that hands no conversation tools answers at its doors. */
const NO_CHAT: Refusal = { code: 'NOT_IN_THIS_BUILD', fix: 'Talking with Slash is not answered by this host yet. Ask from the palette instead.' };

/** A mention's mark on a message: whole letters of it, naming a thing the door could be sent. */
function mentionFits(m: unknown, message: string): boolean {
  if (typeof m !== 'object' || m === null) return false;
  const { at, len, ref } = m as Record<string, unknown>;
  return Number.isInteger(at) && Number.isInteger(len) && (at as number) >= 0 && (len as number) > 0 && (at as number) + (len as number) <= message.length && typeof ref === 'string' && ROW_REF.test(ref);
}

/** The most a message to Slash may weigh as sent, its page and thread included: the engine reads the first 1,000 bytes of the words. */
const CHAT_BODY_LIMIT = 8_000;

/**
 * An answer whose value is also its top level: `{ ok, value, ...value }`. The conversation's doors are read by the
 * palette as their contract names them, flat, and by this repository's client through its one envelope (`answered`), and
 * both read the same body.
 */
async function flat(run: () => Result<unknown> | Promise<Result<unknown>>): Promise<Response> {
  try {
    const out = await run();
    if (!out.ok) return slashReply(out);
    const value = out.value !== null && typeof out.value === 'object' && !Array.isArray(out.value) ? (out.value as Record<string, unknown>) : {};
    return reply(200, { ...value, ok: true, value: out.value });
  } catch (e) {
    return refusal(500, { code: 'INTERNAL', fix: `Slash could not answer that: ${messageOf(e)}.` });
  }
}

/**
 * `POST /api/slash/conversation`: one of this person's conversations named (`{ id, name }`) or deleted (`{ id, remove: true }`).
 * The engine asks whose it is; somebody else's is the same refusal as one that was never there.
 */
async function renamedOrRemoved<C>(body: Record<string, unknown>, door: SlashAskDoor<C>, ctx: C): Promise<Response> {
  if (door.engine === undefined) return refusal(501, NO_CHAT);
  const { id, name, remove: gone } = body;
  if (typeof id !== 'string' || !/^[0-9A-Z]{26}$/u.test(id)) return refusal(422, { code: 'VALUE_MALFORMED', fix: 'id is the conversation, as the list named it.', at: 'id' });
  if (gone !== true && typeof name !== 'string') return refusal(422, { code: 'VALUE_MALFORMED', fix: 'name is what to call the conversation, in words, or remove is true to delete it.', at: 'name' });
  const engine = await built(door.engine);
  if (engine instanceof Response) return engine;
  const rename = engine.rename?.bind(engine);
  const remove = engine.remove?.bind(engine);
  if (rename === undefined || remove === undefined) return refusal(501, NO_CHAT);
  return flat(() => (gone === true ? remove(id, ctx) : rename(id, name as string, ctx)));
}

/**
 * `POST /api/slash/chat` and `POST /api/slash/act`: a conversation's turn, and a held action answered.
 *
 * A TURN IS STREAMED, ONE JSON EVENT A LINE (`application/x-ndjson`), as it happens: the thread, each step, each action,
 * the answer in pieces and `done` last, which always comes. Everything the door checks is checked before the stream
 * opens, so a refusal before the engine runs is an ordinary JSON answer with its status; once the stream is open a
 * failure is an `error` event and then `done`.
 *
 * THE MONTH, THE DAY AND THE KEY ARE THE ENGINE'S AND THE DOOR'S AS FOR A QUESTION: the day's ceiling and his own key
 * are asked here before anything is held, and the engine holds the month's ask before its first model call.
 */
async function conversation<C>(route: 'chat' | 'act', body: Record<string, unknown>, door: SlashAskDoor<C>, ctx: C): Promise<Response> {
  if (door.chat === undefined || door.engine === undefined) return refusal(501, NO_CHAT);
  const tools = door.chat(ctx);

  if (route === 'act') {
    const id = body['id'];
    const accept = body['accept'];
    if (typeof id !== 'string' || id === '') return refusal(422, { code: 'VALUE_MALFORMED', fix: 'id is the action Slash held, as its event named it.', at: 'id' });
    if (typeof accept !== 'boolean') return refusal(422, { code: 'VALUE_MALFORMED', fix: 'accept is true to do it, or false to drop it.', at: 'accept' });
    const engine = await built(door.engine);
    if (engine instanceof Response) return engine;
    const act = engine.act?.bind(engine);
    if (act === undefined) return refusal(501, NO_CHAT);
    return flat(() => act(id, accept, ctx, tools));
  }

  const rethink = body['rethink'];
  if (rethink !== undefined && rethink !== null && typeof rethink !== 'boolean')
    return refusal(422, { code: 'VALUE_MALFORMED', fix: 'rethink is true to ask the last question again, thinking harder.', at: 'rethink' });
  const again = rethink === true;
  const message = body['message'] ?? (again ? '' : undefined);
  if (typeof message !== 'string' || (message.trim() === '' && !again))
    return refusal(422, { code: 'VALUE_MALFORMED', fix: 'message is what you want to say to Slash, in words.', at: 'message' });
  const thread = body['thread'];
  if (thread !== undefined && thread !== null && typeof thread !== 'string')
    return refusal(422, { code: 'VALUE_MALFORMED', fix: 'thread is the id the conversation started with, as text.', at: 'thread' });
  if (again && (typeof thread !== 'string' || thread === ''))
    return refusal(422, { code: 'VALUE_MALFORMED', fix: 'Think harder asks a conversation again, so name its thread.', at: 'thread' });
  const mode = body['mode'];
  if (mode !== undefined && mode !== null && mode !== 'quick' && mode !== 'deep' && mode !== 'auto')
    return refusal(422, { code: 'ENUM_VALUE_UNKNOWN', fix: 'mode is quick, deep or auto.', at: 'mode', allowed: ['quick', 'deep', 'auto'] });
  const attach = body['attach'];
  if (attach !== undefined && attach !== null && (!Array.isArray(attach) || attach.length > ATTACH_MOST || !attach.every((r) => typeof r === 'string' && ROW_REF.test(r))))
    return refusal(422, { code: 'VALUE_MALFORMED', fix: `attach is up to ${ATTACH_MOST} things by their ids: a row such as "tasks#12", or decide:, run: or sign: and an id.`, at: 'attach' });
  /* WHICH LETTERS NAME WHICH ROW, for the bubble alone: what the model reads is `attach`. Marks that do not fit are not kept. */
  const mentions = Array.isArray(body['mentions']) && typeof message === 'string' ? (body['mentions'] as unknown[]).slice(0, ATTACH_MOST).filter((m): m is { at: number; len: number; ref: string } => mentionFits(m, message)) : [];
  const page = body['page'];
  const at = typeof page === 'object' && page !== null && !Array.isArray(page) ? (page as Record<string, unknown>) : null;
  if (page !== undefined && page !== null && (at === null || typeof at['path'] !== 'string'))
    return refusal(422, { code: 'VALUE_MALFORMED', fix: 'page is where you are, { path, title?, row? }, with path as text.', at: 'page' });
  const words = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, 200) : undefined);
  const input: SlashChatInput = {
    message,
    ...(typeof thread === 'string' && thread !== '' ? { thread } : {}),
    ...(mode === 'quick' || mode === 'deep' || mode === 'auto' ? { mode } : {}),
    ...(Array.isArray(attach) && attach.length > 0 ? { attach: [...new Set(attach as string[])] } : {}),
    ...(mentions.length > 0 ? { mentions: mentions.map((m) => ({ at: m.at, len: m.len, ref: m.ref })) } : {}),
    ...(again ? { rethink: true } : {}),
    ...(at === null
      ? {}
      : {
          page: {
            path: String(at['path']).slice(0, 300),
            ...(words(at['title']) === undefined ? {} : { title: words(at['title'])! }),
            ...(words(at['row']) === undefined ? {} : { row: words(at['row'])! }),
          },
        }),
  };

  const engine = await built(door.engine);
  if (engine instanceof Response) return engine;
  const chat = engine.chat?.bind(engine);
  if (chat === undefined) return refusal(501, NO_CHAT);
  /* THE DAY'S CEILING IS THE HOST'S MODEL'S, so a turn that only goes deep, on his own key, is not held to it. */
  const day = again || mode === 'deep' ? null : await door.day?.();
  if (day) return slashReply({ ok: false, refusal: day });
  /* HIS OWN KEY FOR QUICK, refused as the door's answer; and DEEP, only for a turn that may go deep, whose refusal is the
     turn's own to say, since the turn can still offer the Mac. */
  const deepAsked = again || mode === 'deep' || mode === 'auto';
  const own = again || mode === 'deep' ? undefined : await opened(door, ctx);
  if (own instanceof Response) return own;
  let deep: unknown;
  if (deepAsked && door.deep !== undefined) {
    try {
      deep = await door.deep(ctx);
    } catch (e) {
      deep = { refused: `Your Anthropic key could not be opened for Deep: ${messageOf(e)}.` };
    }
  }

  const lines = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let ended = false;
      const send = (event: Record<string, unknown>): void => {
        if (closed) return;
        if (event['type'] === 'done') ended = true;
        try {
          controller.enqueue(lines.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true;
        }
      };
      /* NOT AWAITED, so the response goes out with its first line and the turn writes into it as it runs. */
      void chat(input, ctx, tools, send, own, deep)
        .catch((e: unknown) => send({ type: 'error', text: `Slash stopped: ${messageOf(e)}.` }))
        .finally(() => {
          if (!ended) send({ type: 'done', spent: { asks: 0, left: null } });
          if (closed) return;
          closed = true;
          try {
            controller.close();
          } catch {
            /* The reader went away first; nothing is left to tell. */
          }
        });
    },
  });
  const headers = new Headers();
  for (const [k, v] of KEYCHAIN_HEADERS) headers.append(k, v);
  headers.set('content-type', 'application/x-ndjson; charset=utf-8');
  /* EACH LINE REACHES THE SCREEN AS IT IS WRITTEN: `no-transform` keeps a proxy, Cloudflare's edge among them, from
     compressing the stream, which holds lines back until a block fills; `x-accel-buffering: no` tells nginx in front of a
     self-host not to buffer it. */
  headers.set('cache-control', 'no-store, no-transform');
  headers.set('x-accel-buffering', 'no');
  return new Response(stream, { status: 200, headers });
}

/** The engine, or the refusal a person gets for a builder that threw or a host that configured no model. */
async function built<C>(engine: () => Promise<SlashAskEngine<C> | undefined>): Promise<SlashAskEngine<C> | Response> {
  let out: SlashAskEngine<C> | undefined;
  try {
    out = await engine();
  } catch (e) {
    return refusal(500, { code: 'INTERNAL', fix: `Slash could not be started here: ${messageOf(e)}.` });
  }
  return out ?? refusal(501, NO_MODEL);
}

/** One engine call, answered, with a throw out of it a 500 and a sentence rather than a hung socket. */
async function answer(run: () => Result<unknown> | Promise<Result<unknown>>): Promise<Response> {
  try {
    return slashReply(await run());
  } catch (e) {
    return refusal(500, { code: 'INTERNAL', fix: `Slash could not answer that: ${messageOf(e)}.` });
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
  for (const key of ['source', 'provider', 'base_url', 'tier', 'model', 'grant_id', 'deep_grant_id'] as const) {
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
  if (patch['deep_cap_cents'] !== undefined && typeof patch['deep_cap_cents'] !== 'number')
    return refusal(422, {
      code: 'VALUE_MALFORMED',
      fix: `deep_cap_cents is a number of cents, and this one is ${shown(patch['deep_cap_cents'])}.`,
      at: 'deep_cap_cents',
    });
  if ((patch['source'] === 'key' || patch['tier'] === 'b' || (typeof patch['deep_grant_id'] === 'string' && patch['deep_grant_id'] !== '')) && !byok)
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
  /**
   * His switch for background reading (`infer.ts` `mayThink`), read before a background ask is held. Absent is on. His
   * own press and first plan never read it.
   */
  reads?: Reads | undefined;
};

/**
 * Slash's press and first plan held and settled in the package's own ledger (`@braindog/record` `SlashMeter`).
 *
 * THEY WERE THE TWO ASKS NOTHING COUNTED. Measured with a probe on a
 * record 20 days old over the Worker's included model: 25 presses, 25 included calls, and neither a `call` row nor a look
 * at `ask_cap` anywhere, because the record's model is built beside the engine and not through it. The record now asks
 * this before it asks its model, and `packages/record/test/slash-press-cap.test.ts` drives the same 25 presses at
 * `ask_cap: 3` through the real engine: 3 model calls, `status()` reading 3 used, and the read after them refused.
 *
 * THE ROW IS `kind = 'read'` WITH NO PREDICATE, which is how the package already settles an ask that is not the palette's
 * (`answer.ts`, an automation's question), and the tier is the one the engine reads, as that row's is. So whichever count
 * the engine's `status()` reads, the package's own on tier `a` or the host's `drafted()` on `b` and `byo`, already sees it,
 * and `46 §4.1`'s CHECK needs no new kind. WHAT THE ROW WAS FOR AND WHOSE ALLOWANCE IT SPENT ARE ITS OWN TWO COLUMNS,
 * `purpose` and `spends` (the package's store version 3, `packages/slash/src/call.ts`): his press is `ask` and the first
 * plan is `plan`, and both spend `person`, the 80 that are his. `question` is the words shown beside the row and no
 * count reads it.
 *
 * NO `await` BETWEEN THE CHECK AND THE HOLD, for the reason `packages/slash/src/call.ts` `reserve` gives: the hold is the
 * row the next ask's count includes, so two presses in flight cannot both pass the last ask of the month. The engine is
 * awaited first, and then `status()`, the check and the insert run in one synchronous step.
 *
 * THE COUNTS ARE THE RECORD'S ESTIMATE, bytes over three as the package's `tokens` counts a prompt, of what it sent and
 * what came back. The record's `SlashModel` answers the parsed plan and not the provider's usage, so this is the figure
 * the package itself bills a model it could not read a count from (`core.run`'s `UNREACHABLE` arm). IT BILLS LOW, AND BY
 * A LOT: the instructions and the schema are the host's and never reach the record. Measured through the
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

/**
 * What a background ask is for: the record's own three, and `understand`, the host's reading of who is who
 * (`understand.ts` `understandingOver`), which the record never asks for itself.
 */
export type SlashBackgroundAsk = SlashBackground | 'understand';

/**
 * The record's `SlashMeter` with its background ask always there, which this host's ledger counts. `payload` is what the
 * ask is about to send its model, all of it: handed here so it is read before the ask is held (`background`).
 */
export type SlashRecordMeter = SlashMeter & {
  background(kind?: SlashBackgroundAsk, payload?: unknown): ReturnType<NonNullable<SlashMeter['background']>>;
};

/**
 * The question a background ask's ledger row is written with, by what it is for: words for a person, which no meter
 * counts by.
 */
const BACKGROUND_ASK: Record<SlashBackgroundAsk, string> = {
  skill: "Slash's skill draft",
  look: "Slash's daily look",
  headline: HEADLINE_ASK,
  understand: UNDERSTAND_ASK,
};

/**
 * The purpose a background ask's row is written with, which is what the meters count by (`backgroundSpentBy`). EACH ITS
 * OWN. A skill draft was written as `look` once, and so it spent the look's month and the look spent its floor; it is
 * `skill` now, a purpose the plan gives a floor of its own (`budget-plan.ts`).
 */
const BACKGROUND_PURPOSE: Record<SlashBackgroundAsk, AskPurpose> = {
  skill: 'skill',
  look: 'look',
  headline: 'headline',
  understand: 'understand',
};

/** His own two asks through the record, by what each is for. Both spend his allowance. */
const HELD_PURPOSE: Record<'draft' | 'form', AskPurpose> = { draft: 'ask', form: 'plan' };
const PERSON: AskSpends = 'person';
const BACKGROUND: AskSpends = 'background';

/**
 * What a held row spends once it settles. AN ATTEMPT NO MODEL ANSWERED SPENDS NOBODY'S MONTH AND KEEPS ITS ROW AND ITS
 * NEURONS, the package's own rule for a row it settles (`packages/slash/src/call.ts` `unspent`), restated: the record
 * settles a call that was sent and never answered as `UNREACHABLE`, and one the provider turned away as
 * `PULL_REQUEST_REFUSED`. An unreadable reply was answered, so it counts, once.
 */
const settled = (charge: AskSpends, code: string | undefined): AskSpends =>
  code === 'UNREACHABLE' || code === 'PULL_REQUEST_REFUSED' ? 'none' : charge;

export function slashRecordMeter(deps: SlashLedgerDeps): SlashRecordMeter {
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
      if (!own && asks.used >= asks.cap) {
        /* THE ASK TURNED AWAY LEAVES ITS ROW (`slash-turned-away.ts`, model-sign-49). */
        turnedAway(deps.sql, new Date(deps.clock.now()).toISOString(), 'read', typeof status?.tier === 'string' ? status.tier : 'a');
        return {
          ok: false,
          refusal: {
            code: 'SLASH_BUDGET_SPENT',
            fix: `This month's Slash questions are used until ${typeof asks.resets === 'string' ? asks.resets.slice(0, 10) : 'next month'}.`,
          },
        };
      }
      /* THE TIER THE ENGINE READS AND NOT THE ONE THE ROW HOLDS. Where a host does not run a stored tier the package reads it
         as `a` (`SlashOptions.tiers`), and a row written under the stored one would sit outside the count `status()` is. */
      const tier = typeof status?.tier === 'string' ? status.tier : 'a';
      const model = own && typeof status?.model === 'string' && status.model !== '' ? status.model : deps.model;
      const id = mint();
      const at = () => new Date(deps.clock.now()).toISOString();
      const t0 = deps.clock.now();
      deps.sql.exec(
        `INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, code, question, purpose, spends)
         VALUES (?, ?, 'read', ?, ?, 0, 0, 0, 0, 'error', 'SLASH_PENDING', ?, ?, ?)`,
        id,
        at(),
        tier,
        model,
        kind === 'draft' ? "Slash's press" : "Slash's first plan",
        HELD_PURPOSE[kind] ?? HELD_PURPOSE.draft,
        PERSON,
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
              'UPDATE slash_call SET ts = ?, tokens_in = ?, tokens_out = ?, neurons = ?, ms = ?, status = ?, code = ?, spends = ? WHERE id = ?',
              at(),
              usage.in,
              usage.out,
              neurons,
              deps.clock.now() - t0,
              code === undefined ? 'ok' : 'error',
              code ?? null,
              settled(PERSON, code),
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
     * ONE ASK OF THE BACKGROUND ALLOWANCE, never his: the daily look's own draft, a skill draft, the page headlines, or
     * understanding who is who. The row says so itself, `spends = 'background'`, which is the one thing `backgroundMeter`
     * counts and the one thing the engine's `asksUsed` passes over (it counts `spends = 'person'`), so neither ever spends
     * one of his asks. THE KIND IS STILL `pattern` AND DECIDES NOTHING: before the row said whose allowance it spent, the
     * engine counted every `pattern` row as his, and on the included model each of these took one of his 80 while this
     * comment said it did not.
     *
     * EACH FROM ITS OWN SHARE OF ONE POOL (the plan's, `budget-plan.ts`): a headline ask is written with purpose
     * `headline` and held to the headlines' share, the look with `look` to the look's, and a skill draft with `skill`
     * to the skill drafts'. Each share may always spend its floor, and past it what is left once the floors nobody has
     * used are set aside. So a month of drafts and digests cannot leave the pages without their line, nor the headlines
     * the digests without prose, nor a month of daily looks a skill without its draft.
     * `ask` is optional because a record a release behind calls `background()` for its skill drafts alone.
     *
     * AND ONLY WHILE HE LETS IT READ: all four are behind his one switch, asked first (`mayThink`).
     *
     * AND NEVER WHAT IS NEVER SENT, whatever the switch says: `payload` is what the caller is about to hand its model, and
     * a sealed field, a key or a file's bytes anywhere in it refuses the ask here (`infer.ts` `sendable`), on the look, the
     * headlines and a skill draft as on understanding. The refusal names which of the three and never where or what.
     */
    async background(ask: SlashBackgroundAsk = 'skill', payload?: unknown) {
      /* THE CONSENT RULE BEFORE THE LEDGER: off, the record reads the refusal as "the rules speak" and no row
         is written, held or turned away, because nothing was asked and no month was spent. */
      const may = await mayThink(ask in BACKGROUND_PURPOSE ? ask : 'skill', deps.reads);
      if (!may.ok) return { ok: false, refusal: { code: codeOf(may), fix: fixOf(may) } };
      /* AND THE PAYLOAD BEFORE THE LEDGER TOO: nothing was asked, so no row is written, held or turned away, no month is
         spent, and a month already spent does not get to answer first and leave the payload unread. */
      const clean = sendable(payload);
      if (!clean.ok) return { ok: false, refusal: { code: codeOf(clean), fix: fixOf(clean) } };
      const engine = await deps.engine();
      if (engine === undefined) return { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'Slash has no ledger on this host to count the draft in.' } };
      const status = engine.status() as { tier?: unknown; model?: unknown } | undefined;
      const work = backgroundMeter(deps.sql, BACKGROUND_JOBS_MONTH, ask === 'headline' ? 'headline' : 'work');
      /* THE LOOK AND A SKILL DRAFT ARE EACH HELD TO THEIR OWN PURPOSE'S MONTH, as each job of the model-jobs pass is: its
         floor, and past it what is left once every floor nobody has used is set aside, so neither spends through this
         door what the other, a digest's prose, a pattern or reading who is who is still owed. */
      const meter = ask === 'look' || ask === 'skill' ? (work.of?.(ask) ?? work.rest ?? work) : work;
      const since = monthStart(deps.clock.now());
      /* UNDERSTANDING IS HELD TO ITS OWN SHARE AND TO THE WORK'S MONTH IT IS COUNTED IN, both. */
      const understanding = ask === 'understand' ? work.understand : undefined;
      if (meter.spent(since) >= meter.cap || (understanding !== undefined && understanding.spent(since) >= understanding.cap)) {
        /* THE ASK TURNED AWAY LEAVES ITS ROW (`slash-turned-away.ts`, model-sign-49). */
        turnedAway(deps.sql, new Date(deps.clock.now()).toISOString(), 'pattern', typeof status?.tier === 'string' ? status.tier : 'a');
        return {
          ok: false,
          refusal: {
            code: 'SLASH_BUDGET_SPENT',
            fix:
              ask === 'headline'
                ? `This month's Slash headlines are spent until ${monthResets(deps.clock.now())}, so each page keeps its own line until then.`
                : ask === 'understand'
                  ? `This month's Slash reading of who is who is spent until ${monthResets(deps.clock.now())}, so the doubtful names wait until then.`
                  : `This month's background Slash questions are used until ${monthResets(deps.clock.now())}.`,
          },
        };
      }
      const tier = typeof status?.tier === 'string' ? status.tier : 'a';
      const model = typeof status?.model === 'string' && status.model !== '' ? status.model : deps.model;
      const id = mint();
      const at = () => new Date(deps.clock.now()).toISOString();
      const t0 = deps.clock.now();
      deps.sql.exec(
        `INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, code, question, purpose, spends)
         VALUES (?, ?, 'pattern', ?, ?, 0, 0, 0, 0, 'error', 'SLASH_PENDING', ?, ?, ?)`,
        id,
        at(),
        tier,
        model,
        BACKGROUND_ASK[ask] ?? BACKGROUND_ASK.skill,
        BACKGROUND_PURPOSE[ask] ?? BACKGROUND_PURPOSE.skill,
        BACKGROUND,
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
              'UPDATE slash_call SET ts = ?, tokens_in = ?, tokens_out = ?, neurons = ?, ms = ?, status = ?, code = ?, spends = ? WHERE id = ?',
              at(),
              usage.in,
              usage.out,
              neurons,
              deps.clock.now() - t0,
              code === undefined ? 'ok' : 'error',
              code ?? null,
              settled(BACKGROUND, code),
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
