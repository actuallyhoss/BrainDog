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
 * what a request reaches. Neither is reached on this Worker today. `index.ts` has yet to mount the door, so
 * the door has no caller either and the engine is built by nothing at all, not even a test;
 * `workerSparkDoor`'s own memo below carries the measurement and the field and branch the mount wants.
 */

import { sparkFromEnv, sparkInferenceOf, sparkModelOf, sparkRecord, type SparkHostDeps } from '@braindog/host/spark';
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
  const inference = sparkInferenceOf(sparkFromEnv(env, { operatorKey: false }), wireOf(env, api, deps));
  if (inference === undefined) return undefined;
  const { createSpark } = await import('@braindog/spark');
  return createSpark({ sql: deps.sql, clock: deps.clock, inference, record: sparkRecord(api()) });
}

/**
 * `POST /api/spark/read` for this record's object: the door `@braindog/host` serves, over the builder above.
 *
 * THIS IS THE CALLER THE BUILDER HAD NOT GOT, AND NOTHING CALLS IT EITHER, so say both. Finding 2 of
 * `loop/research-batch-five-audit.md` is the absence, and `grep -rn workerSparkDoor apps` still finds this
 * declaration and no call, which is the same sentence the audit wrote about `workerSparkEngine`. Three passes
 * added the dependency, then the builder, then a door; none added the branch in `Record$.#answer` that hands a
 * request to one.
 *
 * AND THE TALLY THIS MEMO CARRIED WAS WRONG, measured on 2026-09-21 by putting `throw new Error(…)` on the
 * first line of `workerSparkEngine` and running `node --test --experimental-strip-types
 * "apps/worker/test/*.test.ts"`: 179 tests, 176 pass, 3 fail, not the "179 of 179" written here. The audit's
 * 172 was `apps/worker/test/*.test.ts` LESS `spark.test.ts`, and dropping that exclusion turned a true
 * sentence about every OTHER suite into a false one about this app. The three reds are all in
 * `apps/worker/test/spark.test.ts`, at `:153`, `:206` and `:238`, which is the audit's point rather than a
 * refutation of it: the only callers of either builder are the tests that name them. `apps/selfhost` is the
 * cleaner measurement, because with `sparkEngineFor` throwing its suite is 204 tests, 202 pass, 0 fail,
 * 2 skipped, exactly as an unmutated run: no test in that app reaches its own builder at all.
 *
 * WHAT A REQUEST ACTUALLY MEETS TODAY, measured rather than reasoned about: a real self-host started with a
 * `SPARK_ENDPOINT` and a key answers `spark: true` at `/api/version` and 404 `ROUTE_UNKNOWN` "There is no
 * method called spark/read." at `POST /api/spark/read`, because `serveApi` is the only thing behind `/api` on
 * either host. The door is reachable from no product surface, on either host, whatever this file or
 * `spark-ask.ts` exports.
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
