/**
 * Spark on the Worker: the model hookup and the daily look (`loop/research-spark.md` S15, `docs/46` §5.9).
 *
 * THE PERSON'S OWN KEY, NEVER AN OPERATOR'S. A hosted record has no operator key for Spark: `SPARK_ENDPOINT` and `SPARK_MODEL`
 * name where to ask, and the key is the one the person put in their vault under the label `spark`, opened in the Worker
 * through `KEK` on each call (`actions.ts` `keyOpener`, one `grant.read` event each time) and dropped when the call returns.
 * The builder is `@braindog/host/spark`'s, the one the self-host uses, so the two hosts cannot drift.
 *
 * NO `KEK`, NO MODEL. Unbound, no vault key can be opened, so no model is built, `/api/version` says `spark: false`, and
 * Spark's own rules draft.
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
  sparkFromEnv,
  sparkInferenceOf,
  sparkModelNameOf,
  sparkModelOf,
  sparkNamedEngine,
  sparkRecord,
  type SparkHostDeps,
} from '@braindog/host/spark';
import type { OpenKey } from '@braindog/host/actions';
import { sparkAskDoor, type SparkAskDoor } from '@braindog/host';
import type { Clock, Sql } from '@braindog/ports';
import type { CallContext, RecordApi, SparkModel } from '@braindog/record';
import type { Spark } from '@braindog/spark';

import { keyOpener } from './actions.ts';
import { isBound, type KekBinding } from './keys.ts';

export type SparkEnv = { SPARK_ENDPOINT?: string | undefined; SPARK_MODEL?: string | undefined; KEK?: KekBinding | undefined };

/** How a request leaves this Worker and how a sealed key is opened. Both are injected so a test needs no network and no KEK. */
export type SparkWire = {
  send?: ((input: URL, init: RequestInit) => Promise<Response>) | undefined;
  open?: ((api: Pick<RecordApi, 'kernel'>) => OpenKey | null) | undefined;
};

/** The endpoint deps both ports are built from. Written once because the key discipline is the part that must not be copied. */
const wireOf = (env: SparkEnv, api: () => Pick<RecordApi, 'kernel'>, options: SparkWire): SparkHostDeps => {
  const opener = options.open ?? ((a: Pick<RecordApi, 'kernel'>) => keyOpener(a, env.KEK));
  return {
    grants: () => api().kernel.grants(),
    openKey: isBound(env.KEK) ? async (grant) => (opener(api()) ?? (async () => null))(grant) : null,
    send: options.send ?? ((input, init) => fetch(input, init)),
  };
};

export function workerSparkModel(env: SparkEnv, api: () => Pick<RecordApi, 'kernel'>, options: SparkWire = {}): SparkModel | undefined {
  return sparkModelOf(sparkFromEnv(env, { operatorKey: false }), wireOf(env, api, options));
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
 * `@braindog/spark` over this Worker's endpoint and this record's guarded reads, or nothing at all.
 *
 * THE IMPORT IS DYNAMIC AND THE REFUSAL COMES FIRST, in that order, which is the whole of `46 §5.1`: a Worker with no
 * endpoint configured and no way to open a key never evaluates the module, so the bundle a keyless deployment serves does not
 * carry it and the keyless e2e row stays byte-identical. Reversing those two lines would keep the feature working and lose
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
  const inference = sparkInferenceOf(config, wireOf(env, api, deps));
  if (inference === undefined) return undefined;
  const { createSpark } = await import('@braindog/spark');
  /* NAMED BY THIS HOST, as on the self-host: the package's tier `a` status says `glm-5.3-flash` whatever `SPARK_MODEL`
     sends (`loop/research-spark-routes.md` F2), and one wrap here is what every door over this engine reads. */
  return sparkNamedEngine(createSpark({ sql: deps.sql, clock: deps.clock, inference, record: sparkRecord(api()) }), sparkModelNameOf(config));
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
  return sparkAskDoor(origins, () => workerSparkEngine(env, api, deps));
}

/** Spark's daily look, asked on an alarm and after a request: the record decides whether it is due. It never throws. */
export async function sparkLook(api: Pick<RecordApi, 'sparkTick'>): Promise<void> {
  try {
    await api.sparkTick();
  } catch (e) {
    console.error('spark:', e instanceof Error ? e.message : String(e));
  }
}
