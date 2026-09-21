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
 */

import { sparkFromEnv, sparkInferenceOf, sparkModelOf, sparkRecord, type SparkHostDeps } from '@braindog/host/spark';
import type { OpenKey } from '@braindog/host/actions';
import type { Clock, Sql } from '@braindog/ports';
import type { RecordApi, SparkModel } from '@braindog/record';
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

/** Spark's daily look, asked on an alarm and after a request: the record decides whether it is due. It never throws. */
export async function sparkLook(api: Pick<RecordApi, 'sparkTick'>): Promise<void> {
  try {
    await api.sparkTick();
  } catch (e) {
    console.error('spark:', e instanceof Error ? e.message : String(e));
  }
}
