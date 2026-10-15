/**
 * Slash's model on the self-host: an endpoint named in the environment, and the key it is called with.
 *
 * NOTHING CONFIGURED, NOTHING LOADED. With no `SLASH_ENDPOINT` the record gets no model and Slash's own rules draft, which is
 * the product working, not a degraded one (`docs/46` §5.1).
 *
 * THE KEY IS THE HOST'S OR THE PERSON'S, NEVER THE RECORD'S TO READ. This host's endpoint is called with `SLASH_KEY` when
 * the operator set one, and with none otherwise, which is a local model working. HIS OWN KEY is the one he picked from the
 * vault in Settings, by its id, with the provider and address he named (`slashOwnKeyOf`), opened through this host's key
 * store on each call (`actions.ts` `keyOpener`, which counts the opening under a `grant.read` event) and always required.
 * No key is chosen by its label any more. Neither is written anywhere. The builders are
 * `@braindog/host/slash`'s, the ones the Worker uses too.
 *
 * TWO FEATURES SHARE THE NAME AND THIS FILE NOW BUILDS BOTH. `slashModelFor` is the model behind the RECORD's Slash, which
 * proposes how a BrainDog is ARRANGED; `slashEngineFor` is `@braindog/slash`, `docs/46`'s engine, which answers a typed
 * question about what is IN the record. `1f85a49a` settled that neither is a newer version of the other, and the app is where
 * the edge to the package belongs: `46 §5.1` has the host `import()` it once and only when an endpoint is configured, so the
 * decision cannot live in `@braindog/host/slash`, a module every host loads.
 *
 * AND `slashDoor` IS THE THIRD NAME HERE, because a builder is not a caller: `POST /api/slash/read` is what a
 * request reaches. BOTH ARE REACHED NOW: `server.ts:1167` mounts this door in the site literal and dispatches
 * `servesSlash(path)` ahead of `servesKeys(path)`. `slashDoor`'s own memo below
 * carries what a real socket answers through it, and what that answer does not contain.
 */

import {
  SLASH_KEY_GONE,
  SLASH_KEY_LABEL,
  SlashKeyClosedError,
  endpointInference,
  slashFromEnv as fromEnv,
  slashGuardedEngine,
  slashInferenceOf,
  slashModelNameOf,
  slashModelOf,
  slashNamedEngine,
  slashOwnInference,
  slashOwnKeyFor,
  slashOwnKeyOf,
  slashOwnModel,
  slashRecord,
  slashSamplesOf,
  type SlashHostConfig,
  type SlashHostDeps,
  type SlashInference,
} from '@braindog/host/slash';
import { slashAskDoor, type SlashAskDoor, type SlashRecordMeter } from '@braindog/host';
import { routeFor, type Candidate, type RouteFacts } from '@braindog/host/infer';
import type { ModelJobInference, SlashAnswer } from '@braindog/host/slash-answers';
import { understandingOver } from '@braindog/host/understand';
import type { ModelJobEmbed, ModelJobEmbeddings } from '@braindog/host/model-jobs';
import { no, ok, type Clock, type Refusal, type Result, type Sql } from '@braindog/ports';
import type { CallContext, RecordApi, SlashModel } from '@braindog/record';
import type { Slash, SlashCandidate, SlashRoute } from '@braindog/slash';

import { keyOpener } from './actions.ts';
import type { KeyStore } from './keys.ts';

export { SLASH_KEY_LABEL };

/** A second endpoint the operator named, asked when this host's own model does not answer (ENG-A06, ENG-A07). */
export type SlashFallback = { url: string; model: string; key: string };

export type SlashConfig = SlashHostConfig & {
  send?: ((input: URL, init: RequestInit) => Promise<Response>) | undefined;
  fallback?: SlashFallback | undefined;
};

const FALLBACK_VARS = ['SLASH_FALLBACK_ENDPOINT', 'SLASH_FALLBACK_MODEL', 'SLASH_FALLBACK_KEY'] as const;

/**
 * `SLASH_FALLBACK_ENDPOINT`, `SLASH_FALLBACK_MODEL` and `SLASH_FALLBACK_KEY`, all three or nothing.
 *
 * PART OF ONE IS NONE OF IT, SAID ONCE: a second endpoint with no key, or no model, would be asked and refuse every time
 * the first failed, so it is left off and `log` is told which variable is missing. The line names variables and never a
 * value, because one of the three is a key. An address that is not http or https is left off the same way, rather than
 * refused at boot as `SLASH_ENDPOINT` is: the second endpoint is the operator's spare, and a typo in it must not stop the
 * first from answering.
 */
function fallbackFromEnv(env: Record<string, string | undefined>, log: (line: string) => void): SlashFallback | undefined {
  const set = (name: (typeof FALLBACK_VARS)[number]): boolean => typeof env[name] === 'string' && env[name].trim() !== '';
  const missing = FALLBACK_VARS.filter((name) => !set(name));
  if (missing.length === FALLBACK_VARS.length) return undefined;
  if (missing.length > 0) {
    log(`Slash's second endpoint is not used: ${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} not set, and it needs all three.`);
    return undefined;
  }
  const url = env.SLASH_FALLBACK_ENDPOINT!.trim();
  let protocol = '';
  try {
    protocol = new URL(url).protocol;
  } catch {
    /* read as not http below */
  }
  if (protocol !== 'http:' && protocol !== 'https:') {
    log("Slash's second endpoint is not used: SLASH_FALLBACK_ENDPOINT is not an http or https address.");
    return undefined;
  }
  return { url, model: env.SLASH_FALLBACK_MODEL!.trim(), key: env.SLASH_FALLBACK_KEY! };
}

/**
 * `SLASH_ENDPOINT`, `SLASH_MODEL`, `SLASH_KEY`, `SLASH_EMBED_MODEL`, `SLASH_EMBED_ENDPOINT`, the second endpoint's three, or
 * nothing. With no `SLASH_ENDPOINT` the second is not read either: a spare for a model this host does not have is no model.
 */
export const slashFromEnv = (
  env: Record<string, string | undefined>,
  log: (line: string) => void = (line) => console.warn(line),
): SlashConfig | undefined => {
  const config = fromEnv(env);
  if (config === undefined) return undefined;
  const fallback = fallbackFromEnv(env, log);
  return fallback === undefined ? config : { ...config, fallback };
};

/** The handles the route writes on a ledger row's `candidate`, never shown to a person. */
const ENDPOINT_ID = 'endpoint';
const FALLBACK_ID = 'fallback';

/**
 * The model the package's templates ask for, sent to this host's endpoint as it is where `SLASH_MODEL` names none, which
 * is what `endpointInference`'s `modelSent` does with it today; with `SLASH_MODEL` set, that name is the candidate's.
 */
const TEMPLATE_MODEL = 'glm-5.3-flash';

/**
 * What the router knows on this host (`@braindog/host/infer` `RouteFacts`), or nothing where no endpoint is configured.
 *
 * A SELF-HOST'S ROUTE IS ITS ENDPOINT, THEN ITS SECOND ENDPOINT WHERE ALL THREE OF ITS VARIABLES ARE SET, and nothing
 * else: no larger model and no machine of his, so both switches are off. `routeFor` closes up the place of an absent one.
 */
export function selfhostFacts(config: SlashConfig | undefined): RouteFacts | undefined {
  if (!config) return undefined;
  const endpoint: Candidate = { id: ENDPOINT_ID, model: config.model ?? TEMPLATE_MODEL, tier: 'byo', source: 'included' };
  const fallback: Candidate | undefined =
    config.fallback === undefined ? undefined : { id: FALLBACK_ID, model: config.fallback.model, tier: 'byo', source: 'included' };
  return { form: 'selfhost', models: { endpoint, ...(fallback ? { fallback } : {}) }, large: false, machine: false };
}

/**
 * The deps every port here is built from. Written once because the key discipline is the part that must not be copied.
 *
 * `actor` SIGNS EVERY `grant.read` THIS WIRE OPENS, AND `system` IS RIGHT ONLY WHERE NOBODY ASKED: the record's own press
 * reaches its model with no context, so it passes none and `keyOpener`'s own default stands. The door has an asker and
 * passes their id through `slashOwnKeyFor`, and an automation's question passes `rule:<id>`. This host's own endpoint
 * opens no vault key at all, so only his own key is ever signed for.
 */
const wireOf = (config: SlashConfig, api: () => RecordApi, store: KeyStore | undefined, actor?: string): SlashHostDeps => ({
  grants: () => api().kernel.grants(),
  openKey: (grant: { id: string; label: string }) => keyOpener(api(), store, actor)(grant),
  send: config.send ?? ((input: URL, init: RequestInit) => fetch(input, init)),
});

/**
 * The model name the owner typed under Included on this host, kept on tier a (ENG-A07), or `null` where none is kept, so
 * the record names the model it is asked by and not the endpoint's default. Read on each ask, as the own key is.
 */
const typedModelOf = (sql: Sql): string | null => {
  if (sql.one("SELECT 1 AS n FROM sqlite_master WHERE type = 'table' AND name = 'slash_settings'") === undefined) return null;
  const row = sql.one<{ tier: string; model: string | null }>('SELECT tier, model FROM slash_settings WHERE singleton = 1');
  return row?.tier === 'a' && typeof row.model === 'string' && row.model.trim() !== '' ? row.model.trim() : null;
};

/**
 * The model the record is handed, or `undefined`. An address that is not http or https is refused at boot, loudly.
 *
 * HIS OWN KEY WHERE HE CHOSE IT, READ ON EACH PRESS, so the arranger's press and a question at the palette go to the one
 * model he picked in Settings, and a save reaches the next press without a restart. `slash` is Slash's own store, a thunk
 * because `server.ts` opens it after it builds this. Absent, or with no key store to open his key with, the record's
 * model is this host's endpoint alone.
 */
export function slashModelFor(
  config: SlashConfig | undefined,
  api: () => RecordApi,
  store: KeyStore | undefined,
  slash?: () => Sql,
): SlashModel | undefined {
  if (!config) return undefined;
  const endpoint = slashModelOf(config, wireOf(config, api, store));
  if (endpoint === undefined || slash === undefined || store === undefined) return endpoint;
  const chosen = (): SlashModel => {
    const own = slashOwnKeyOf(slash());
    if (own === null) return endpoint;
    const model = slashOwnModel(own, wireOf(config, api, store), config.url);
    /* NOT SENT, SO THE RECORD RELEASES ITS HOLD: a key that is gone is the same `sent: false` as one that will not open. */
    if (model === undefined) throw new SlashKeyClosedError(SLASH_KEY_GONE.fix);
    return model;
  };
  return {
    /* READ ON EACH ASK AS THE REST IS, because the record names who drafted by it. */
    get name() {
      if (slashOwnKeyOf(slash()) !== null) return 'your key';
      return typedModelOf(slash()) ?? endpoint.name;
    },
    draft: async (input) => chosen().draft(input),
    form: async (input) => {
      const model = chosen();
      if (model.form === undefined) throw Object.assign(new Error('The model Slash answers with here drafts no first plan.'), { sent: false });
      return model.form(input);
    },
    /* HANDS `SlashModel.skill` THROUGH THE SAME CHOICE `form` IS, so the daily look's skill step reads his own
       key's model, and not only the record's endpoint, when he has one chosen. */
    skill: async (input) => {
      const model = chosen();
      if (model.skill === undefined) throw Object.assign(new Error('The model Slash answers with here drafts no skill.'), { sent: false });
      return model.skill(input);
    },
    /* AND THE PAGE HEADLINES THE SAME WAY: a model that writes none is never sent, and each page keeps its rules line. */
    headline: async (input) => {
      const model = chosen();
      if (model.headline === undefined) throw Object.assign(new Error('The model Slash answers with here writes no headlines.'), { sent: false });
      return model.headline(input);
    },
    /* AND THE BRIEFING, so a self-host on his own key is asked for Today's cards as the other adapters are. */
    brief: async (input) => {
      const model = chosen();
      if (model.brief === undefined) throw Object.assign(new Error('The model Slash answers with here writes no briefing.'), { sent: false });
      return model.brief(input);
    },
  };
}

export type SlashEngineDeps = {
  /**
   * Slash's OWN SQLite, and the caller's to supply.
   *
   * IT IS NOT THE RECORD'S DATABASE (`46 §2`), and it is a parameter here rather than a second file opened beside
   * `record.sqlite` because the caller is the one that already owns this process's files: `server.ts` takes `options.file`,
   * and where Slash's `slash_settings` and `slash_call` tables live is that same decision. This file neither knows the path nor
   * guesses one.
   */
  sql: Sql;
  clock: Clock;
};

/**
 * The route `createSlash` walks on this host (ENG-A06): `routeFor` over `selfhostFacts`, as the package's candidates.
 *
 * "RULES ARE THE FALLBACK, NOT THE ENGINE" (D35.43). When this host's endpoint does not answer, the ask goes to the second
 * endpoint before Slash's rules speak. The first candidate carries no `inference`, so it is asked on the adapter the caller
 * handed in, which is this host's endpoint as it always was; the second carries its own, on the same wire (`wireOf`'s
 * `send`) with the operator's `SLASH_FALLBACK_KEY`. It opens no vault key, so no `grant.read` is signed for it.
 *
 * NEVER ON HIS OWN KEY. A question he sent to the provider he picked is not sent on to the operator's spare because his
 * provider was slow: with his key chosen the route is empty and the core asks as before. The core holds the same rule on
 * its own (tier `b` walks nothing), and this is read on each ask, so a key he picks or lets go counts on the next one.
 */
function slashRouteOf(config: SlashConfig, wire: SlashHostDeps, sql: Sql): SlashRoute | undefined {
  const facts = selfhostFacts(config);
  if (facts === undefined) return undefined;
  const fallback = fallbackInference(config, wire);
  return (purpose) => {
    if (slashOwnKeyOf(sql) !== null) return [];
    return routeFor(purpose, facts).candidates.map(
      (c): SlashCandidate => (c.id === FALLBACK_ID && fallback !== undefined ? { id: c.id, model: c.model, inference: fallback } : { id: c.id, model: c.model }),
    );
  };
}

/** The second endpoint's adapter, on the same wire with the operator's `SLASH_FALLBACK_KEY`, or `undefined` where it is not set. */
function fallbackInference(config: SlashConfig, wire: SlashHostDeps): SlashInference | undefined {
  const second = config.fallback;
  return second === undefined
    ? undefined
    : endpointInference({
        url: second.url,
        model: second.model,
        key: async () => second.key,
        send: wire.send,
        name: FALLBACK_ID,
        keyName: "this host's SLASH_FALLBACK_KEY",
      });
}

/**
 * The wire for each candidate the engine's probe asks (ENG-A08, `@braindog/host` `engineProbeOf`): the second endpoint for
 * its own candidate, this host's endpoint for the rest, the same adapters the route above hands the asks.
 */
export function selfhostProbeWire(
  config: SlashConfig | undefined,
  api: () => RecordApi,
  store: KeyStore | undefined,
): (candidate: Candidate) => SlashInference | undefined {
  if (!config) return () => undefined;
  const wire = wireOf(config, api, store);
  const fallback = fallbackInference(config, wire);
  const own = slashInferenceOf(config, wire);
  return (c) => (c.id === FALLBACK_ID ? fallback : own);
}

/**
 * `@braindog/slash` over this host's endpoint and this record's guarded reads, or nothing at all.
 *
 * THE IMPORT IS DYNAMIC AND THE REFUSAL COMES FIRST, in that order, which is the whole of `46 §5.1`: a self-host with no
 * endpoint configured never evaluates the module, and the keyless e2e row stays byte-identical. Reversing those two lines
 * would keep the feature working and lose the property the loading rule exists for.
 *
 * `slashRecord` IS THE BRIDGE AND NOT THE RECORD'S OWN `project`, which does not exist yet: it composes the projection out of
 * `boot`, `schema`, `list`, `search` and `get`, so every read runs under the asker's own level and scoping. When the record
 * grows `project`, the bridge goes and the record's stub is passed instead.
 */
export async function slashEngineFor(
  config: SlashConfig | undefined,
  api: () => RecordApi,
  store: KeyStore | undefined,
  deps: SlashEngineDeps,
): Promise<Slash | undefined> {
  if (!config) return undefined;
  const wire = wireOf(config, api, store);
  const inference = slashInferenceOf(config, wire);
  if (inference === undefined) return undefined;
  const { createSlash } = await import('@braindog/slash');
  const route = slashRouteOf(config, wire, deps.sql);
  /* NAMED BY THIS HOST, because on tier `a` the package can only say `glm-5.3-flash` and what answers is `SLASH_MODEL`.
     Every door this engine is handed to reads the one `status()`. On his own key
     the name is the one he typed, and the wrap leaves it. */
  const engine = slashNamedEngine(
    createSlash({ sql: deps.sql, clock: deps.clock, inference, record: slashRecord(api()) }, route === undefined ? {} : { route }),
    slashModelNameOf(config),
  );
  /* GUARDED BY THIS HOST, because `byo`'s asks are on this host's endpoint and the package meters tier `a` alone, and
     because `configure` checks a grant id's shape and never the vault (`slashGuardedEngine`). */
  return slashGuardedEngine(engine, { sql: deps.sql, clock: deps.clock, grants: () => api().kernel.grants() });
}

/**
 * What answers an automation's question to Slash on this host, or nothing: `serveAsks`'s `answer`, one job at a time.
 *
 * `undefined` EXACTLY WHERE `slashEngineFor` IS, AND DECIDED WITHOUT AN `await`, because `server.ts` reads it to set the
 * record's `answersSlash` before the record is opened. The test is the builder's own (`slashInferenceOf`), so the switch
 * that admits `ask_slash` at install and the engine that answers it cannot come to disagree, and a self-host with no
 * `SLASH_ENDPOINT` still never evaluates `@braindog/slash` (`46 §5.1`).
 *
 * THE ENGINE IS BUILT ONCE, ON THE FIRST QUESTION, THROUGH `slashEngineFor`, so it is the guarded one: `byo` spends the
 * one `ask_cap` a person's read does. A second engine beside the door's, over the same
 * Slash SQLite, because both read `slash_settings` and `slash_call` on every ask and hold nothing of their own. A build
 * that throws is let go, so the next pass builds again rather than every question after it failing on one bad import.
 *
 * ON HIS OWN KEY THE QUESTION GOES TO HIS KEY, asked on a wire signed `rule:<id>`, so the
 * vault's `grant.read` names the rule that opened it and not `system`. This never runs the vault's session gate
 * (`slashOwnKeyFor`): a rule has no session for it to read, and installing a rule that asks Slash is the owner's consent to
 * its question going to the model he chose. A key that is gone or will
 * not open stops the run `FORBIDDEN` with nothing sent and nothing in the ledger, and this host's endpoint is never asked
 * in its place.
 */
export function slashAnswersFor(
  config: SlashConfig | undefined,
  api: () => RecordApi,
  store: KeyStore | undefined,
  deps: SlashEngineDeps,
): SlashAnswer | undefined {
  if (!config || slashInferenceOf(config, wireOf(config, api, store)) === undefined) return undefined;
  let built: Promise<Slash | undefined> | null = null;
  return async (ask) => {
    built ??= slashEngineFor(config, api, store, deps).catch((e: unknown) => {
      built = null;
      throw e;
    });
    const engine = await built;
    /* NOT REACHABLE WHILE THE TEST ABOVE HOLDS, and a thrown sentence here becomes the ladder's `failed` ack rather than an
       answer nobody asked for. */
    if (engine === undefined) throw new Error('Slash has no model on this host to answer with.');
    const own = store === undefined ? null : slashOwnKeyOf(deps.sql);
    if (own === null) return engine.answer(ask);
    const inference = slashOwnInference(own, wireOf(config, api, store, `rule:${ask.rule}`), config.url);
    if (inference === undefined)
      return no(
        'FORBIDDEN',
        `rule.${ask.rule} asked Slash at step ${ask.step + 1}, and the key Slash was set to answer with is no longer a key in the vault, so nothing was sent and the run stopped there. Pick your key again in Settings.`,
        { at: 'grant_id' },
      );
    let closed = false;
    const out = await engine.answer(ask, {
      complete: async (call) => {
        try {
          return await inference.complete(call);
        } catch (e) {
          closed ||= e instanceof SlashKeyClosedError;
          throw e;
        }
      },
    });
    if (closed)
      return no(
        'FORBIDDEN',
        `rule.${ask.rule} asked Slash at step ${ask.step + 1}, and your own key for Slash would not open on this host, so nothing was sent and the run stopped there.`,
        { at: 'grant_id' },
      );
    return out;
  };
}

/**
 * What answers the record's model jobs on this host, or nothing: `serveModelJobs`'s `deps.inference` for the tick, the
 * twin of the Worker's `workerModelJobs` (`apps/worker/src/slash-jobs.ts`).
 *
 * THREE JOBS, ALL SLASH'S: an `infer.draft` is a pattern for messages nothing parsed, drafted by `draftPattern`, an
 * `infer.prose` is the two sentences above a digest, written by `digestProse`, and an `infer.embed` is a hundred rows'
 * vectors, by `embedTexts`, only where `SLASH_EMBED_MODEL` names a model.
 * The pass that leases, meters and acks them is `@braindog/host`'s; this is only the engine it is handed.
 *
 * `undefined` EXACTLY WHERE `slashAnswersFor` IS, AND DECIDED WITHOUT AN `await`, so the tick can tell a host with
 * nothing to answer from one whose engine is still to be built, and a self-host with no `SLASH_ENDPOINT` still never
 * evaluates `@braindog/slash` (`46 §5.1`). The engine is `slashEngineFor`'s guarded one, built once on the first job
 * over the same Slash SQLite, so a job's ledger row sits beside every ask's; a build that throws is let go, so the next
 * pass builds again. A model job has nobody asking, so its key is opened as `keyOpener`'s default.
 */
export function slashModelJobs(
  config: SlashConfig | undefined,
  api: () => RecordApi,
  store: KeyStore | undefined,
  deps: SlashEngineDeps,
  meter: SlashRecordMeter,
): (ModelJobInference & ModelJobEmbed) | undefined {
  if (!config || slashInferenceOf(config, wireOf(config, api, store)) === undefined) return undefined;
  /* AND WHO IS WHO, over the record's own model on the same endpoint: the doubtful pairs of `infer.resolve` and the
     night's notes, each held in `meter`'s background ledger under `UNDERSTAND_ASK` (`@braindog/host/understand`). */
  const model = slashModelOf(config, wireOf(config, api, store));
  let built: Promise<Slash | undefined> | null = null;
  const engine = async (): Promise<Slash> => {
    const slash = await (built ??= slashEngineFor(config, api, store, deps).catch((e: unknown) => {
      built = null;
      throw e;
    }));
    /* NOT REACHABLE WHILE THE TEST ABOVE HOLDS, and a thrown sentence is the pass's failed ack rather than an answer. */
    if (slash === undefined) throw new Error('Slash has no model on this host to answer with.');
    return slash;
  };
  return {
    draft: async (samples, waiting) => (await engine()).draftPattern(samples, waiting),
    prose: async (digest) => (await engine()).digestProse(digest),
    /* AND THE INDEX, WHERE THE ENDPOINT EMBEDS (`SLASH_EMBED_MODEL`): one `slash_call` row of kind `embed` a call,
       through the engine's `embedTexts`, so `backgroundMeter` counts it inside the month and its half-kept rule as on
       the Cloud. A refusal goes back as it came, for the pass to read. Absent, `infer.embed` waits for a host that has it. */
    ...(config.embedModel
      ? {
          embed: async (texts: readonly string[]): Promise<Result<ModelJobEmbeddings>> => {
            const out = await (await engine()).embedTexts(texts);
            return out.ok ? ok({ model: out.value.model, dims: out.value.dims, vectors: out.value.vectors }) : out;
          },
        }
      : {}),
    ...(model ? understandingOver(model, meter) : {}),
  };
}

/**
 * `POST /api/slash/read` for this process: the door `@braindog/host` serves, over the builder above.
 *
 * THE DOOR IS MOUNTED IN `server.ts`, AND UNMOUNTED IT IS A 404 THAT NO TEST IN THIS APP NOTICES. With the mount
 * absent, a real `start({ file, port: 0, slash: { url, model, key, send } })` reported `slash: true` at `/api/version`
 * and answered `POST /api/slash/read` with 404 `ROUTE_UNKNOWN` "There is no method called slash/read.", from
 * `serveApi`, because nothing stood in front of it. With `throw new Error(…)` on the first line of `slashEngineFor`,
 * every test in `apps/selfhost/test` was measured green: the only reds were in `apps/worker/test/slash.test.ts`, which drives
 * THIS file's builder from the other app's suite.
 *
 * WHAT IT ANSWERS, DRIVEN OVER A REAL SOCKET: 200, on exactly one model call, for an owner signed in with the server
 * key, and the row it was asked about. On a record holding three rows in `things`, one of them named Kiln, the single
 * word `Kiln` comes back with that row and `{"register":"things","rows":1,"predicate":"all"}` in the fold.
 *
 * A REGISTER IS ASKED ABOUT ITS TEXT ONLY THROUGH A FIELD DECLARED `search: true`. `packages/kernel/src/fts.ts`
 * `projectedText` indexes nothing else, so on a register with no such field `kernel.search('Kiln')` answers `[]` and
 * the ask answers nothing, both correctly.
 *
 * TWO OF THE DOOR'S OWN REFUSALS ARE UNREACHABLE HERE, AND THAT IS THE DISPATCH ORDER RATHER THAN A DEFECT.
 * The door sits behind `contextFor` in the dispatch, so a bearer this record does not know
 * answered 401 `UNAUTHORIZED` and a page at `https://evil.example` answered 403 `FORBIDDEN` in this host's own
 * CSRF sentence, not the door's 403 `NEEDS_BROWSER_SESSION` at `principal` or its 403 at `origin`. `serveKeys`
 * sits at the same place for the same reason and inherits the same order, and a bearer that IS known does reach
 * the door and is refused there, which is the case `46 §5.2` is written for. The door keeps both checks anyway
 * because the Worker's mount is inside `Record$` and answers for itself.
 *
 * WHEN THE ENGINE IS BUILT IS `slashAskDoor`'s AND NOT THIS FILE'S, for the reason every other line here defers
 * to `@braindog/host/slash`: the Worker asks the same question of the same builder, and a rule about when to
 * build drifts between two hosts exactly as a rule about how to open a key would. What is this file's is WHICH
 * builder, which is the whole of the edge to the thirteenth package.
 */
export function slashDoor(
  config: SlashConfig | undefined,
  api: () => RecordApi,
  store: KeyStore | undefined,
  deps: SlashEngineDeps,
  origins: ReadonlySet<string>,
): SlashAskDoor<CallContext> {
  /* HIS OWN KEY IS OFFERED ONLY WHERE A KEY CAN BE OPENED, which on this host is a key store: without one `keyOpener`
     answers `null` for every grant, and a `byok` handed in here is what lets the settings door store his key, so
     offering it would save a choice every later ask refuses. `SLASH_KEY` does not make a host able to open the owner's
     key and so does not count. His choice is read on each ask, after the engine that made the `slash_settings` table has
     been built, so a key he picks or revokes counts on the next ask.
     AND IT IS OPENED FOR THE ASKER, NOT FOR `system`. `slashOwnKeyFor` runs the vault's own gate on `ctx` and signs the
     `grant.read` with the asker's id; before it, a read colleague with a fifty-minute-old proof proposed on the owner's key
     and the log said `system`. */
  const byok =
    config === undefined || store === undefined
      ? undefined
      : async (ctx: CallContext) =>
          slashOwnKeyFor(slashOwnKeyOf(deps.sql), api(), ctx, (_asker, actor) => wireOf(config, api, store, actor), config.url);
  /* THE VAULT'S OWN GATE FOR A SAVE THAT POINTS HIS KEY SOMEWHERE (`slashKeySave`), asked through the read that writes no
     event, and the INBOX'S OWN READ for a pattern's arrivals, as the asker. */
  const vault = async (ctx: CallContext): Promise<Refusal | null> => {
    const gate = await api().listGrants(ctx);
    if (gate.ok) return null;
    return 'refusal' in gate ? gate.refusal : { code: 'FORBIDDEN', fix: 'The vault could not be asked about your key. Try again.' };
  };
  const samples = (ids: readonly string[], ctx: CallContext) => slashSamplesOf(api(), ids, ctx);
  /* THIS HOST'S ENDPOINT OPENS NO VAULT KEY, so the engine is handed on as built: there is no `grant.read` for an asker
     to sign unless the ask is on his own key, which `byok` above opens for them. */
  return slashAskDoor(origins, () => slashEngineFor(config, api, store, deps), byok, { vault, samples });
}

/* ── erasing a person from Slash's ledger ─────────────────────────────────────────────────────────────────────────────── */

/**
 * `eraseSlash` over this process's Slash SQLite, or nothing where no ledger was ever built in it. The ledger rows it touched.
 *
 * THE PACKAGE IS LOADED ONLY WHERE THERE IS A LEDGER, which is `46 §5.1` kept on this path too: a self-host with no endpoint
 * never built an engine, so its Slash file holds no `slash_call` table, nor version 1's `call`, and the erasure finishes
 * without evaluating the module. The Worker has the same two functions over its own storage (`apps/worker/src/slash.ts`).
 */
export async function slashErased(sql: Sql, subjects: readonly string[]): Promise<number> {
  if (sql.one("SELECT 1 AS n FROM sqlite_master WHERE type = 'table' AND name IN ('slash_call', 'call')") === undefined) return 0;
  const { eraseSlash } = await import('@braindog/slash');
  return eraseSlash(sql, subjects);
}

/**
 * The record's `erase`, followed by `eraseSlash` over the Slash SQLite this process hands every engine, so an erasure
 * reaches the questions Slash kept. `server.ts` calls it once, on the record it built.
 *
 * THE RECORD CANNOT DO IT ITSELF: it has no edge to `@braindog/slash` and must not, and the ledger is not even in the
 * record's file here but beside it. So the host that holds both finishes the erasure.
 *
 * ONLY WHEN THE RECORD ANSWERED `ok`, so every refusal it gives (a caller who is not the owner in a browser, a subject too
 * short) stands for the ledger too. A ledger that could not be erased is a refusal of its own and not the record's report:
 * the record's part is done and cannot be undone, and answering the erasure whole would say something that did not happen.
 * Asked again, the record finds nothing more and the ledger is walked again.
 */
export function slashErasing(api: Pick<RecordApi, 'erase'>, sql: Sql): void {
  const erase = api.erase.bind(api);
  api.erase = async (args, ctx) => {
    const out = await erase(args, ctx);
    if (!out.ok) return out;
    try {
      await slashErased(sql, args.subjects);
    } catch (e) {
      return no(
        'INTERNAL',
        `The record erased every value naming them, and Slash's own ledger could not be erased: ${e instanceof Error ? e.message : String(e)} Erase again once Slash answers.`,
      );
    }
    return out;
  };
}
