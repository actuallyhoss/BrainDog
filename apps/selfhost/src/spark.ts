/**
 * Spark's model on the self-host: an endpoint named in the environment, and the key it is called with.
 *
 * NOTHING CONFIGURED, NOTHING LOADED. With no `SPARK_ENDPOINT` the record gets no model and Spark's own rules draft, which is
 * the product working, not a degraded one (`docs/46` §5.1).
 *
 * THE KEY IS THE HOST'S OR THE PERSON'S, NEVER THE RECORD'S TO READ. `SPARK_KEY` in the environment, when the operator set one;
 * otherwise the person's own key in the vault under the label `spark`, opened through this host's key store on each call
 * (`actions.ts` `keyOpener`, which counts the opening under a `grant.read` event). Neither is written anywhere.
 */

import { endpointModel } from '@braindog/host/spark';
import type { RecordApi, SparkModel } from '@braindog/record';

import { keyOpener } from './actions.ts';
import type { KeyStore } from './keys.ts';

/** The vault label a person's own model key is kept under. */
export const SPARK_KEY_LABEL = 'spark';

export type SparkConfig = {
  url: string;
  model?: string | undefined;
  /** The operator's key. Absent, the vault's `spark` key, if the person put one there. */
  key?: string | undefined;
  send?: ((input: URL, init: RequestInit) => Promise<Response>) | undefined;
};

/** `SPARK_ENDPOINT`, `SPARK_MODEL`, `SPARK_KEY`, or nothing. */
export function sparkFromEnv(env: Record<string, string | undefined>): SparkConfig | undefined {
  const url = env.SPARK_ENDPOINT?.trim();
  if (!url) return undefined;
  return { url, model: env.SPARK_MODEL?.trim() || undefined, key: env.SPARK_KEY || undefined };
}

/** The model the record is handed, or `undefined`. An address that is not http or https is refused at boot, loudly. */
export function sparkModelFor(config: SparkConfig | undefined, api: () => RecordApi, store: KeyStore | undefined): SparkModel | undefined {
  if (!config) return undefined;
  const own = async (): Promise<string | null> => {
    const grant = api()
      .kernel.grants()
      .find((g) => g.label === SPARK_KEY_LABEL && g.revoked_at === null);
    return grant ? keyOpener(api(), store)(grant) : null;
  };
  return endpointModel({
    url: config.url,
    model: config.model,
    key: config.key !== undefined ? async () => config.key ?? null : own,
    send: config.send ?? ((input, init) => fetch(input, init)),
    name: 'endpoint',
  });
}
