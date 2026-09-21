/**
 * Spark's model on the self-host: an endpoint named in the environment, and the key it is called with.
 *
 * NOTHING CONFIGURED, NOTHING LOADED. With no `SPARK_ENDPOINT` the record gets no model and Spark's own rules draft, which is
 * the product working, not a degraded one (`docs/46` §5.1).
 *
 * THE KEY IS THE HOST'S OR THE PERSON'S, NEVER THE RECORD'S TO READ. `SPARK_KEY` in the environment, when the operator set one;
 * otherwise the person's own key in the vault under the label `spark`, opened through this host's key store on each call
 * (`actions.ts` `keyOpener`, which counts the opening under a `grant.read` event). Neither is written anywhere. The builder is
 * `@braindog/host/spark`'s, the one the Worker uses too.
 *
 * TWO FEATURES SHARE THE NAME AND THIS FILE NOW BUILDS BOTH. `sparkModelFor` is the model behind the RECORD's Spark, which
 * proposes how a BrainDog is ARRANGED; `sparkEngineFor` is `@braindog/spark`, `docs/46`'s engine, which answers a typed
 * question about what is IN the record. `1f85a49a` settled that neither is a newer version of the other, and the app is where
 * the edge to the package belongs: `46 §5.1` has the host `import()` it once and only when an endpoint is configured, so the
 * decision cannot live in `@braindog/host/spark`, a module every host loads.
 */

import { SPARK_KEY_LABEL, sparkFromEnv as fromEnv, sparkInferenceOf, sparkModelOf, sparkRecord, type SparkHostConfig } from '@braindog/host/spark';
import type { Clock, Sql } from '@braindog/ports';
import type { RecordApi, SparkModel } from '@braindog/record';
import type { Spark } from '@braindog/spark';

import { keyOpener } from './actions.ts';
import type { KeyStore } from './keys.ts';

export { SPARK_KEY_LABEL };

export type SparkConfig = SparkHostConfig & {
  send?: ((input: URL, init: RequestInit) => Promise<Response>) | undefined;
};

/** `SPARK_ENDPOINT`, `SPARK_MODEL`, `SPARK_KEY`, or nothing. */
export const sparkFromEnv = (env: Record<string, string | undefined>): SparkConfig | undefined => fromEnv(env);

/** The endpoint deps both ports are built from. Written once because the key discipline is the part that must not be copied. */
const wireOf = (config: SparkConfig, api: () => RecordApi, store: KeyStore | undefined) => ({
  grants: () => api().kernel.grants(),
  openKey: (grant: { id: string; label: string }) => keyOpener(api(), store)(grant),
  send: config.send ?? ((input: URL, init: RequestInit) => fetch(input, init)),
});

/** The model the record is handed, or `undefined`. An address that is not http or https is refused at boot, loudly. */
export function sparkModelFor(config: SparkConfig | undefined, api: () => RecordApi, store: KeyStore | undefined): SparkModel | undefined {
  if (!config) return undefined;
  return sparkModelOf(config, wireOf(config, api, store));
}

export type SparkEngineDeps = {
  /**
   * Spark's OWN SQLite, and the caller's to supply.
   *
   * IT IS NOT THE RECORD'S DATABASE (`46 §2`), and it is a parameter here rather than a second file opened beside
   * `record.sqlite` because the caller is the one that already owns this process's files: `server.ts` takes `options.file`,
   * and where the `settings` and `call` tables of `46 §4.1` live is that same decision. This file neither knows the path nor
   * guesses one.
   */
  sql: Sql;
  clock: Clock;
};

/**
 * `@braindog/spark` over this host's endpoint and this record's guarded reads, or nothing at all.
 *
 * THE IMPORT IS DYNAMIC AND THE REFUSAL COMES FIRST, in that order, which is the whole of `46 §5.1`: a self-host with no
 * endpoint configured never evaluates the module, and the keyless e2e row stays byte-identical. Reversing those two lines
 * would keep the feature working and lose the property the loading rule exists for.
 *
 * `sparkRecord` IS THE BRIDGE AND NOT THE RECORD'S OWN `project`, which does not exist yet: it composes the projection out of
 * `boot`, `schema`, `list`, `search` and `get`, so every read runs under the asker's own level and scoping. When the record
 * grows `project`, the bridge goes and the record's stub is passed instead.
 */
export async function sparkEngineFor(
  config: SparkConfig | undefined,
  api: () => RecordApi,
  store: KeyStore | undefined,
  deps: SparkEngineDeps,
): Promise<Spark | undefined> {
  if (!config) return undefined;
  const inference = sparkInferenceOf(config, wireOf(config, api, store));
  if (inference === undefined) return undefined;
  const { createSpark } = await import('@braindog/spark');
  return createSpark({ sql: deps.sql, clock: deps.clock, inference, record: sparkRecord(api()) });
}
