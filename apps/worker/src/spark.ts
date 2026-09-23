/**
 * Spark on the Worker: the model hookup and the daily look (`loop/research-spark.md` S15, `docs/46` §5.9).
 *
 * TWO WAYS TO A MODEL, AND THE PERSON'S OWN ENDPOINT WINS. Where `SPARK_ENDPOINT` is set, it and `SPARK_MODEL` name where to
 * ask, and the key is the one the person put in their vault under the label `spark`, opened in the Worker through `KEK` on
 * each call (`actions.ts` `keyOpener`, one `grant.read` event each time) and dropped when the call returns. A hosted record
 * has no operator key for that path. The builder is `@braindog/host/spark`'s, the one the self-host uses, so the two hosts
 * cannot drift. Where it is empty, the model is the INCLUDED one (`includedInference` below): Workers AI through `AI`,
 * which spends the Cloudflare account's neurons and opens no key at all.
 *
 * NO `KEK`, NO ENDPOINT MODEL. Unbound, no vault key can be opened, so the endpoint path builds nothing, `/api/version` says
 * `spark: false`, and Spark's own rules draft. The included model does not read `KEK`.
 *
 * THE INCLUDED MODEL IS SWITCHED ON BY `SPARK_INCLUDED`, NOT BY THE BINDING. `AI` is bound in both environments already
 * (`wrangler.jsonc`, since `src/inference.ts` was written) and `deploy.yml` deploys production on every green `ci`, so a
 * model keyed on the binding alone would have started spending his account at the first deploy of the commit that built it.
 * Spending it is his call (`loop/research-living-in-it.md` section 8, call 2), so it takes a var no environment declares.
 *
 * TWO FEATURES SHARE THE NAME AND THIS FILE NOW BUILDS BOTH. `workerSparkModel` is the model behind the RECORD's Spark, which
 * proposes how a BrainDog is ARRANGED; `workerSparkEngine` is `@braindog/spark`, `docs/46`'s engine, which answers a typed
 * question about what is IN the record. `1f85a49a` settled that neither is a newer version of the other, and the app is where
 * the edge to the package belongs: `46 §5.1` has the host `import()` it once and only when an endpoint is configured, so the
 * decision cannot live in `packages/host/src/spark.ts`, a module every host loads.
 *
 * ONE KEY PATH FOR BOTH PORTS, which is what `wireOf` is for. The two builders below read the same `SPARK_ENDPOINT`, open the
 * same vault grant through the same opener, and refuse on the same condition, so `/api/version`'s single `spark` flag cannot
 * come to mean one thing for the record's model and another for the package's engine.
 *
 * AND `workerSparkDoor` IS THE THIRD NAME HERE, because a builder is not a caller: `POST /api/spark/read` is
 * what a request reaches. BOTH ARE REACHED NOW: `index.ts` keeps a `#spark` field on `Record$` and hands a
 * request to `serveSpark` when `servesSpark` names the path, which landed on 21 September.
 * `workerSparkDoor`'s own memo below carries what a real socket answers through the self-host's mirror of it.
 */

import {
  SPARK_INSTRUCTIONS,
  SPARK_KEY_LABEL,
  SPARK_PLAN_INSTRUCTIONS,
  SparkAnsweredError,
  SparkKeyClosedError,
  answerOf,
  sparkAskerEngine,
  sparkByokFor,
  sparkFromEnv,
  sparkGrantIdOf,
  sparkGrantOf,
  sparkGuardedEngine,
  sparkInferenceOf,
  sparkModelNameOf,
  sparkModelOf,
  sparkNamedEngine,
  sparkRecord,
  type SparkHostDeps,
  type SparkInference,
} from '@braindog/host/spark';
import type { OpenKey } from '@braindog/host/actions';
import { sparkAskDoor, type SparkAskDoor } from '@braindog/host';
import { grantChosen } from '@braindog/kernel';
import type { SparkAnswer } from '@braindog/host/spark-answers';
import { no, type Clock, type Sql } from '@braindog/ports';
import type { CallContext, RecordApi, SparkModel } from '@braindog/record';
import type { Spark } from '@braindog/spark';

import { keyOpener } from './actions.ts';
import { aiInference, type AiBinding, type JsonSchema } from './inference.ts';
import { isBound, type KekBinding } from './keys.ts';

export type SparkEnv = {
  SPARK_ENDPOINT?: string | undefined;
  SPARK_MODEL?: string | undefined;
  KEK?: KekBinding | undefined;
  /** Workers AI, and the gateway its calls go through (`inference.ts` `AiEnv`). */
  AI?: AiBinding | undefined;
  AI_GATEWAY?: string | undefined;
  /** `yes` to answer Spark with the included model where no endpoint is set. Anything else, including unset, is off. */
  SPARK_INCLUDED?: string | undefined;
};

/* ── the included model ───────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The most one included call may spend, in neurons, checked by `aiInference` BEFORE the call against its worst case.
 *
 * THE NUMBER IS HIS TO CHANGE (`loop/research-living-in-it.md` section 8, call 2), and this is the survey's default. One
 * conversational turn on `glm-5.3-flash`, 12,000 tokens in and 1,500 out, is 231.8 neurons or $0.00255 (`inference.ts`,
 * the rate table's comment). 2,500 is about ten and a half such turns, and 2,500 × $0.011 / 1,000 is $0.0275 at most.
 *
 * IT STOPS A RUNAWAY AND NOTHING ELSE. The package caps its own prompts at 12,000 tokens in and 2,048 out, 256.7 neurons at
 * the most, so no package call comes near it; the package's monthly `ask_cap` is what bounds those. What it does stop is the
 * record's own `draft`, whose reading has no cap of its own: with 2,048 tokens out (93.1 neurons) it refuses a prompt past
 * about 176,500 tokens, some 700 KB, and the rules draft instead. That `draft` is not counted by `ask_cap` at all, and the
 * daily look asks it once a UTC day per record, so this ceiling is the whole bound on that call.
 */
export const INCLUDED_NEURONS_PER_CALL = 2_500;

/** The routing name the record's own asks go by: every template of the package asks the same (`prompts.ts`). */
const INCLUDED_MODEL = 'glm-5.3-flash';

/** The record's `draft` and `form` send no `max_tokens` on the endpoint path; here one is needed, and this is the package's largest. */
const RECORD_TOKENS = 2_048;

/* THE SCHEMAS THE RECORD'S TWO ASKS ANSWER, TOP LEVEL ONLY, because `aiInference` checks the top level and the record checks
   the rest (`fromModel`, `formedRows`). Whether `glm-5.3-flash` honours an open object under `strict: true` was not measured
   here: no test spends a neuron, so the first alpha answer after the switch is the measurement. */
const DRAFTS: JsonSchema = { type: 'object', properties: { drafts: { type: 'array', items: { type: 'object' } } }, required: ['drafts'] };
const PLAN: JsonSchema = { type: 'object', properties: { plan: { type: 'object' } }, required: ['plan'] };

/** Nothing reached the binding, which the package reads by this mark and not by the class, as it reads `SparkKeyClosedError`'s. */
class NotSent extends Error {
  readonly sent = false;
}

const counted = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.ceil(v) : 0);

/**
 * `aiInference` as the package's `SparkInference`, or nothing where the included model is off.
 *
 * THE PORTS DIFFER IN THREE WAYS AND THIS IS THE WHOLE ADAPTER: `jsonSchema` is `schema`, a budget is added, and a refusal
 * becomes a throw, because the package reads every throw as a model not reached and marks tell it otherwise.
 *
 * - NO RUN, NO SEND: the ceiling, or a routing name the adapter's table does not carry. `sent: false` lets `answer` release
 *   its hold and write no ledger row.
 * - A RUN AND A BAD ANSWER, `PROPOSAL_SCHEMA`: the platform billed it, so it is `SparkAnsweredError` with the counts the
 *   binding reported. `aiInference` drops them from its refusal, so a wrapped binding, built fresh for each call so two asks
 *   in flight cannot cross, keeps the last answer to read them off.
 * - A BINDING THAT THREW is a plain throw, `UNREACHABLE`, which the ladder asks again.
 *
 * `model` IN THE REPLY IS THE ROUTING NAME, NOT THE PROVIDER ID `aiInference` answers. The package prices a row by its name
 * in `MODELS`, which holds `glm-5.3-flash` and not `@cf/zai-org/glm-5.3-flash`: handing the id through billed every row 0
 * neurons, measured in `test/spark-included.test.ts`'s door case.
 */
export function includedInference(env: SparkEnv): SparkInference | undefined {
  const ai = env.AI;
  if (ai === undefined || env.SPARK_INCLUDED !== 'yes') return undefined;
  return {
    complete: async (call) => {
      let last: unknown;
      let ran = false;
      const port = aiInference({
        AI: { run: async (model, inputs, options) => ((ran = true), (last = await ai.run(model, inputs, options))) },
        AI_GATEWAY: env.AI_GATEWAY,
      });
      const out = await port.complete({
        model: call.model,
        messages: call.messages,
        maxTokens: call.maxTokens,
        schema: call.jsonSchema as JsonSchema,
        budget: { neurons: INCLUDED_NEURONS_PER_CALL },
      });
      if (out.ok) return { text: out.value.text, usage: { in: out.value.usage.in, out: out.value.usage.out }, model: call.model };
      const fix = 'refusal' in out ? out.refusal.fix : 'The included model did not answer.';
      if (!ran) throw new NotSent(fix);
      if ('refusal' in out && out.refusal.code === 'PROPOSAL_SCHEMA') {
        const usage = (last as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } } | null)?.usage;
        throw new SparkAnsweredError(fix, { in: counted(usage?.prompt_tokens), out: counted(usage?.completion_tokens) }, call.model);
      }
      throw new Error(fix);
    },
  };
}

/**
 * The record's own Spark over the included model: `endpointModel`'s two asks, the same instructions and the same input,
 * read by the same `answerOf`. Every failure is a throw, which the record reads as "the rules speak".
 */
export function includedModel(env: SparkEnv): SparkModel | undefined {
  const inference = includedInference(env);
  if (inference === undefined) return undefined;
  const ask = async (instructions: string, input: unknown, schema: JsonSchema): Promise<unknown> => {
    const reply = await inference.complete({
      model: INCLUDED_MODEL,
      maxTokens: RECORD_TOKENS,
      jsonSchema: schema,
      messages: [
        { role: 'system', content: instructions },
        { role: 'user', content: JSON.stringify(input) },
      ],
    });
    return answerOf(reply.text);
  };
  return {
    name: 'included',
    draft: (input) => ask(SPARK_INSTRUCTIONS, input, DRAFTS),
    form: (input) => ask(SPARK_PLAN_INSTRUCTIONS, input, PLAN),
  };
}

/**
 * How a request leaves this Worker and how a sealed key is opened. Both are injected so a test needs no network and no KEK.
 *
 * `open` TAKES THE ASKER'S ID SO A TEST-INJECTED OPENER STILL SIGNS AS THEM: `wireOf` passes its own `actor` through to
 * whichever opener is in play, the real one or a test's stand-in, so `keyOpener`'s default of `system` is only ever what a
 * caller with nobody asking gets.
 */
export type SparkWire = {
  send?: ((input: URL, init: RequestInit) => Promise<Response>) | undefined;
  open?: ((api: Pick<RecordApi, 'kernel'>, actor?: string) => OpenKey | null) | undefined;
};

/**
 * The endpoint deps both ports are built from. Written once because the key discipline is the part that must not be copied.
 *
 * `actor` SIGNS EVERY `grant.read` THIS WIRE OPENS, AND `system` IS RIGHT ONLY WHERE NOBODY ASKED: the record's own model and
 * the engine's build-time model both run with nobody at the keyboard, so their callers pass none and `keyOpener`'s own
 * default stands. The door's two callers have an asker and pass their id: `sparkByokFor` for tier `b`'s key, and
 * `sparkAskerEngine` for this host's own model, built again on each ask.
 */
const wireOf = (env: SparkEnv, api: () => Pick<RecordApi, 'kernel'>, options: SparkWire, actor?: string): SparkHostDeps => {
  const opener = options.open ?? ((a: Pick<RecordApi, 'kernel'>, who?: string) => keyOpener(a, env.KEK, who));
  return {
    grants: () => api().kernel.grants(),
    openKey: isBound(env.KEK) ? async (grant) => (opener(api(), actor) ?? (async () => null))(grant) : null,
    send: options.send ?? ((input, init) => fetch(input, init)),
  };
};

/**
 * THE ENDPOINT WHEN ONE IS SET, EVEN WHERE IT BUILDS NOTHING. An endpoint with no `KEK` is no model, and falling through to
 * the included one there would answer his asks on the account's neurons while he believes they go to his own provider. The
 * four builders below make the same choice on the same test, so `/api/version`'s `spark` and the engines stay one fact.
 */
export function workerSparkModel(env: SparkEnv, api: () => Pick<RecordApi, 'kernel'>, options: SparkWire = {}): SparkModel | undefined {
  const config = sparkFromEnv(env, { operatorKey: false });
  return config === undefined ? includedModel(env) : sparkModelOf(config, wireOf(env, api, options));
}

export type SparkEngineDeps = SparkWire & {
  /**
   * Spark's OWN SQLite, and the caller's to supply.
   *
   * IT IS NOT THE RECORD'S DATABASE (`46 §2`), and it is a parameter here rather than a line reading `this.ctx.storage`
   * because `docs/46` puts the engine in its own Durable Object (`apps/worker/src/do/spark.ts`, `idFromName(rec_id)`), which
   * has its own storage and its own `wrangler.jsonc` binding. Until that object exists the caller decides which storage the
   * `settings` and `call` tables of `46 §4.1` are created in, and this file neither knows nor guesses.
   */
  sql: Sql;
  clock: Clock;
};

/**
 * `@braindog/spark` over this Worker's endpoint or the included model, and this record's guarded reads, or nothing at all.
 *
 * THE IMPORT IS DYNAMIC AND THE REFUSAL COMES FIRST, in that order, which is the whole of `46 §5.1`: a Worker with neither
 * an endpoint it can open a key for nor the included model switched on never evaluates the module, so the bundle a keyless
 * deployment serves does not carry it and the keyless e2e row stays byte-identical. Reversing those two lines would keep the feature working and lose
 * the property the loading rule exists for.
 *
 * `sparkRecord` IS THE BRIDGE AND NOT THE RECORD'S OWN `project`, which does not exist yet: it composes the projection out of
 * `boot`, `schema`, `list`, `search` and `get`, so every read runs under the asker's own level and scoping. When the record
 * grows `project`, the bridge goes and the record's stub is passed instead.
 *
 * `api()` IS RESOLVED HERE AND NOT PER CALL because the engine is built on the first ask and not at boot, which is when the
 * Durable Object's record already exists. The two-argument `() => api` shape is kept so the caller can pass the same thunk it
 * passes `workerSparkModel`, which is assigned after this module's own `#open` has begun.
 */
export async function workerSparkEngine(env: SparkEnv, api: () => RecordApi, deps: SparkEngineDeps): Promise<Spark | undefined> {
  const config = sparkFromEnv(env, { operatorKey: false });
  const inference = config === undefined ? includedInference(env) : sparkInferenceOf(config, wireOf(env, api, deps));
  if (inference === undefined) return undefined;
  const { createSpark } = await import('@braindog/spark');
  /* NAMED BY THIS HOST, as on the self-host: the package's tier `a` status says `glm-5.3-flash` whatever `SPARK_MODEL`
     sends (`loop/research-spark-routes.md` F2), and one wrap here is what every door over this engine reads. */
  const engine = sparkNamedEngine(createSpark({ sql: deps.sql, clock: deps.clock, inference, record: sparkRecord(api()) }), sparkModelNameOf(config));
  /* GUARDED BY THIS HOST, as on the self-host: tier `b`'s drafts are on this Worker's endpoint and the package meters tier
     `a` alone, and `configure` checks a grant id's shape and never the vault (`sparkGuardedEngine`). */
  return sparkGuardedEngine(engine, { sql: deps.sql, clock: deps.clock, grants: () => api().kernel.grants() });
}

/**
 * The four kinds the vault admits that `sparkGrantOf` passes over, as the gate's sentence names them. The names are the vault
 * screen's (`apps/web/src/lib/record/vault.ts` `kinds`), with the article a sentence needs. `api_token` is absent on
 * purpose: a token under `spark` is chosen, so the gate never has one to name.
 */
const KIND_NAMED: Partial<Record<string, string>> = {
  password: 'a password',
  ssh_key: 'an SSH key',
  recovery_codes: 'a set of recovery codes',
  note: 'a note',
};

/**
 * What answers an automation's question to Spark on this Worker, or nothing: `serveAsks`'s `answer`, one job at a time.
 *
 * `undefined` EXACTLY WHERE `workerSparkEngine` IS, AND DECIDED WITHOUT AN `await`, because `Record$.#open` reads it to set
 * the record's `answersSpark` before `createRecordApi` runs. The test is the builder's own (`sparkInferenceOf` over the same
 * `wireOf`), and `workerSparkModel`, which `/api/version`'s `spark` reads, comes out of the same `endpointOptionsOf`, so the
 * switch that files `ask_spark` and the flag the canvas reads are one fact (`test/spark-answers.test.ts` cases 2 and 5).
 *
 * THE ENGINE IS BUILT ONCE, ON THE FIRST QUESTION, THROUGH `workerSparkEngine`, so it is the guarded one and it meters on
 * the same `settings` and `call` tables the door's engine does, in the same storage: one `ask_cap` for a person's read and
 * an automation's question. A build that throws is let go, as `apps/selfhost/src/spark.ts` `sparkAnswersFor` lets it go,
 * so the next pass builds again rather than every question after it failing on one bad import.
 *
 * NO KEY LABELLED `spark`, NO POST, AND THE RULE IS THIS FILE'S ALONE. The host's key path sends with no `authorization`
 * when the vault has no `spark` grant, which on a self-host is a local model working. Here the endpoint is a hosted provider
 * on the owner's own bill. With this check taken out, measured on 23 September in `test/spark-answers.test.ts`'s no-key
 * case with the provider answering 401: one POST with no `authorization` header, a ledger row settled `UNREACHABLE`, the run
 * still `waiting` and a `retry` row queued, so every rung of the ladder would be another keyless POST for a day. The
 * survey's W2 read the same POST counted as an ask and blamed on the model, under the status rule as it stood then. Either
 * way it is wrong here, so the job is refused `FORBIDDEN` before the engine is built or anything is held, and nothing is
 * written to the ledger (Q7's default).
 *
 * AND A KEY THAT IS THERE AND WILL NOT OPEN IS REFUSED TOO, which the check above cannot see: it reads which grant the key
 * path would choose, and the key path reads the opening. `loop/research-batch-forty-nine-audit.md` finding 2 put the
 * owner's key under one `KEK` and woke the object under another, as a `wrangler secret put KEK` leaves it: 8 POSTs with no
 * `authorization` of 8 over the ladder, 8 ledger rows under the dash, and a run ending "could not be reached".
 * `keyOpener` answers `null` for that and for four other ways a grant fails to open (`actions.ts`). So the rule's wire asks
 * for `keyRequired`, the host throws before `post` sends, and the job is refused `FORBIDDEN` with the same ledger as the
 * no-key case: none. `test/spark-key-status.test.ts` holds it.
 *
 * EACH QUESTION IS ASKED ON A WIRE SIGNED `rule:<id>`, so the vault's `grant.read` for the owner's key names the rule that
 * opened it and not `system`. This never calls `sparkByokFor`: a rule has no session for the vault's gate to read, and
 * installing a rule that asks Spark is the owner's consent to its question going to this Worker's endpoint (Q3's default).
 */
export function workerSparkAnswers(env: SparkEnv, api: () => RecordApi, deps: SparkEngineDeps): SparkAnswer | undefined {
  const config = sparkFromEnv(env, { operatorKey: false });
  let built: Promise<Spark | undefined> | null = null;
  const engineOf = () =>
    (built ??= workerSparkEngine(env, api, deps).catch((e: unknown) => {
      built = null;
      throw e;
    }));
  /* THE INCLUDED MODEL OPENS NO KEY, SO NONE OF THE KEY RULES BELOW IS ITS. There is no vault grant to gate on, no
     `keyRequired` to ask for and no rule id to sign a `grant.read` with, so the question goes to the engine's own model. */
  if (config === undefined) {
    if (includedInference(env) === undefined) return undefined;
    return async (ask) => {
      const engine = await engineOf();
      if (engine === undefined) throw new Error('Spark has no model on this Worker to answer with.');
      return engine.answer(ask);
    };
  }
  if (sparkInferenceOf(config, wireOf(env, api, deps)) === undefined) return undefined;
  return async (ask) => {
    /* THE GATE ASKS THE KEY PATH'S OWN CHOOSER, so the two cannot disagree about whether there is a key. It read the label
       and `revoked_at` alone until 23 September, a third chooser beside the kernel's and the host's: a `note` labelled
       `spark` passed it, the key path chose nothing to open, and the run was told the key "would not open on this Worker",
       which sends an owner to put in again a key that was never there (`test/spark-named.test.ts`, the note case). */
    const grants = api().kernel.grants();
    if (sparkGrantOf(grants) === undefined) {
      /* AND WHEN AN ENTRY IS THERE UNDER `spark` BUT IS NOT A TOKEN, THE SENTENCE SAYS WHICH KIND IT IS. After the gate
         moved onto the chooser, a password as the only `spark` entry ended the run on "this record's vault holds no key
         labelled spark", measured on 23 September through the bundled Worker (`test/spark-worker-chooser.test.ts` W1),
         while the owner's own vault screen lists that very row as a key of kind Password. The entry named is the one an
         action naming `spark` would open, the kernel's own `grantChosen` with no kind asked for, so this reads no fourth
         order of its own. */
      const held = grantChosen(grants, SPARK_KEY_LABEL);
      const kind = held === undefined ? undefined : KIND_NAMED[held.kind];
      return no(
        'FORBIDDEN',
        kind === undefined
          ? `rule.${ask.rule} asked Spark at step ${ask.step + 1}, and this record's vault holds no key labelled ${SPARK_KEY_LABEL}, so the run stopped there. Put your model key in the vault under ${SPARK_KEY_LABEL}.`
          : `rule.${ask.rule} asked Spark at step ${ask.step + 1}, and the key labelled ${SPARK_KEY_LABEL} in this record's vault is ${kind}, not an API token, so nothing was sent and the run stopped there. Put your model key in the vault under ${SPARK_KEY_LABEL} as an API token.`,
        { at: 'grant' },
      );
    }
    const engine = await engineOf();
    const inference = sparkInferenceOf(config, { ...wireOf(env, api, deps, `rule:${ask.rule}`), keyRequired: true });
    /* NEITHER IS REACHABLE WHILE THE TEST ABOVE HOLDS, and a thrown sentence here becomes the ladder's `failed` ack
       rather than an answer nobody asked for. */
    if (engine === undefined || inference === undefined) throw new Error('Spark has no model on this Worker to answer with.');
    /* THE KEY IS OPENED ON THE CALL, SO WHETHER IT OPENS IS LEARNT INSIDE `answer`, and this wrap is how the pass hears
       it: `SparkKeyClosedError` is thrown by `keyRequired` before `post` sends, and the package, reading its `sent: false`,
       releases its hold and writes no ledger row. What the package cannot say is where the key lives, so the sentence is
       this file's, beside the no-key one above it. */
    let closed = false;
    const out = await engine.answer(ask, {
      complete: async (call) => {
        try {
          return await inference.complete(call);
        } catch (e) {
          closed ||= e instanceof SparkKeyClosedError;
          throw e;
        }
      },
    });
    if (closed)
      return no(
        'FORBIDDEN',
        `rule.${ask.rule} asked Spark at step ${ask.step + 1}, and the key labelled ${SPARK_KEY_LABEL} in this record's vault would not open on this Worker, so nothing was sent and the run stopped there.`,
        { at: 'grant' },
      );
    return out;
  };
}

/**
 * `POST /api/spark/read` for this record's object: the door `@braindog/host` serves, over the builder above.
 *
 * THIS WAS THE CALLER THE BUILDER HAD NOT GOT, and finding 2 of `loop/research-batch-five-audit.md` is that
 * absence. Three passes added the dependency, then the builder, then a door, and none added the branch in
 * `Record$.#answer` that hands a request to one; the fourth added it, so `grep -rn workerSparkDoor apps` now
 * finds this declaration and the branch that calls it.
 *
 * AND THE TALLY THIS MEMO CARRIED WAS WRONG TWICE OVER, so each mutation is written out on its own. Every
 * figure below is `node --test --experimental-strip-types "apps/worker/test/*.test.ts"`, whose unmutated run
 * is 179 tests, 179 pass. A `throw new Error(…)` on the first line of `workerSparkEngine` ALONE is 177 pass,
 * 2 fail, at `spark.test.ts:153` and `:238`. On the first line of `sparkEngineFor` alone it is also 177 pass,
 * 2 fail, but at `:206` and `:238`, because `:206` drives the SELF-HOST's builder out of this app's suite.
 * Only BOTH builders throwing is 176 pass, 3 fail at `:153`, `:206` and `:238`. The revision of this memo that
 * replaced a "179 of 179" reading hung that three-red tally on the single mutation, which no run produces, so
 * the correction needed correcting. Every reading carries the audit's point rather than refuting it: the only
 * callers of either builder are the tests that name them. The audit's 172 was this same glob LESS
 * `spark.test.ts`, and dropping that exclusion turned a true sentence about every OTHER suite into a false one
 * about this app. `apps/selfhost` is the cleaner measurement, because with `sparkEngineFor` throwing its own
 * suite is 204 tests, 202 pass, 0 fail, 2 skipped, exactly as an unmutated run: no test in that app reaches
 * its own builder at all.
 *
 * WHAT A REQUEST MET BEFORE THE MOUNT, measured rather than reasoned about: a real self-host started with a
 * `SPARK_ENDPOINT` and a key answered `spark: true` at `/api/version` and 404 `ROUTE_UNKNOWN` "There is no
 * method called spark/read." at `POST /api/spark/read`, because `serveApi` was the only thing behind `/api` on
 * either host.
 *
 * WHAT IT MEETS NOW, on the self-host, driven over a real socket on 21 September: 200 on one model call, and the
 * row it asked about. A record holding three rows in `things` asked the name of one of them answers that row,
 * with `{"register":"things","rows":1,"predicate":"all"}` in the fold. The first writing of this paragraph said
 * the read came back empty; the drive's own register declared no field with `search: true`, so nothing about
 * those rows was indexed and both the record and the ask were answering correctly. This Worker's mount is the
 * same door over the same builder and has not been driven against a deployed object, so it is not claimed here.
 * The drive and the correction are in `loop/BACKLOG.md`.
 *
 * IT IS BUILT INSIDE THE OBJECT AND NOT IN THE ROUTER, unlike `/api/keys/*`, and the difference is what each
 * door needs: the key doors need the `KEK` binding alone, so the Worker answers them without waking the record,
 * and this one needs the record's own `RecordApi` and Spark's own SQLite in this object's storage (`46 §2`).
 *
 * WHEN THE ENGINE IS BUILT IS `sparkAskDoor`'s AND NOT THIS FILE'S, for the reason `wireOf` above is written
 * once: the self-host asks the same question of the same builder, and two copies of that rule are two hosts
 * that come to disagree about the first ask of the day. What is this file's is WHICH builder.
 *
 * AND THE MOUNT THIS OBJECT NEEDS IS A FIELD AND A BRANCH, in `apps/worker/src/index.ts` and nowhere else,
 * because `servesApi` is a prefix test (`route.ts:58`) and so `/api/spark/read` already reaches `Record$`.
 * A FIELD and not a local: `sparkAskDoor` caches the built engine on the door it returns, so a door built per
 * request would run `createSpark`'s two `CREATE TABLE IF NOT EXISTS` and its settings insert on every question,
 * which is the cold path `46 §7` budgets. The branch goes in `#answer`, beside `servesMcp`'s and before
 * `serveApi`, because `fetch` only drains the body around it. The storage is this object's own until
 * `apps/worker/src/do/spark.ts` exists, which is what `SparkEngineDeps.sql`'s comment above already says.
 */
export function workerSparkDoor(
  env: SparkEnv,
  api: () => RecordApi,
  deps: SparkEngineDeps,
  origins: ReadonlySet<string>,
): SparkAskDoor<CallContext> {
  /* TIER `b` IS OFFERED ONLY WHERE A KEY CAN BE OPENED. With no `KEK` there is no engine either, but the door is built
     before the engine, and a `byok` handed in here is what lets the settings door store tier `b`: offering it on a Worker
     that can open nothing would save a setting every later propose refuses. `api` is not called until a propose, by which
     time the engine is built and its `settings` table exists for `sparkGrantIdOf` to read. */
  const config = sparkFromEnv(env, { operatorKey: false });
  const wire = wireOf(env, api, deps);
  /* OPENED FOR THE ASKER, NOT FOR `system`: `sparkByokFor` runs the vault's own gate on `ctx` and signs the `grant.read`
     with the asker's id, where this line once opened the owner's key for any caller the door let through
     (`loop/research-batch-thirty-one-audit.md` §1). */
  const byok =
    config === undefined || wire.openKey === null
      ? undefined
      : async (ctx: CallContext) => sparkByokFor(config, sparkGrantIdOf(deps.sql), api(), ctx, (_asker, actor) => wireOf(env, api, deps, actor));
  /* AND THIS WORKER'S MODEL IS BUILT FOR THE ASKER ON EACH ASK, off the same `wireOf` with the same `actor`: on a hosted
     record that model is always keyed from the vault, so without this every `grant.read` Spark made was signed `system`.
     Per call and as an argument, because a slot would cross two asks in flight and `AsyncLocalStorage` is not here
     (`sparkAskerEngine`). The included model opens no key and so signs nothing, and its engine is handed on as built. */
  const build = async () => {
    const engine = await workerSparkEngine(env, api, deps);
    return engine === undefined || config === undefined
      ? engine
      : sparkAskerEngine(engine, (actor) => sparkInferenceOf(config, wireOf(env, api, deps, actor)));
  };
  return sparkAskDoor(origins, build, byok);
}

/** Spark's daily look, asked on an alarm and after a request: the record decides whether it is due. It never throws. */
export async function sparkLook(api: Pick<RecordApi, 'sparkTick'>): Promise<void> {
  try {
    await api.sparkTick();
  } catch (e) {
    console.error('spark:', e instanceof Error ? e.message : String(e));
  }
}
