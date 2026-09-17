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
 */

import { SPARK_KEY_LABEL, sparkFromEnv as fromEnv, sparkModelOf, type SparkHostConfig } from '@braindog/host/spark';
import type { RecordApi, SparkModel } from '@braindog/record';

import { keyOpener } from './actions.ts';
import type { KeyStore } from './keys.ts';

export { SPARK_KEY_LABEL };

export type SparkConfig = SparkHostConfig & {
  send?: ((input: URL, init: RequestInit) => Promise<Response>) | undefined;
};

/** `SPARK_ENDPOINT`, `SPARK_MODEL`, `SPARK_KEY`, or nothing. */
export const sparkFromEnv = (env: Record<string, string | undefined>): SparkConfig | undefined => fromEnv(env);

/** The model the record is handed, or `undefined`. An address that is not http or https is refused at boot, loudly. */
export function sparkModelFor(config: SparkConfig | undefined, api: () => RecordApi, store: KeyStore | undefined): SparkModel | undefined {
  if (!config) return undefined;
  return sparkModelOf(config, {
    grants: () => api().kernel.grants(),
    openKey: (grant) => keyOpener(api(), store)(grant),
    send: config.send ?? ((input, init) => fetch(input, init)),
  });
}
