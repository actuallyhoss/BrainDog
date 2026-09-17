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
 */

import { sparkFromEnv, sparkModelOf } from '@braindog/host/spark';
import type { OpenKey } from '@braindog/host/actions';
import type { RecordApi, SparkModel } from '@braindog/record';

import { keyOpener } from './actions.ts';
import { isBound, type KekBinding } from './keys.ts';

export type SparkEnv = { SPARK_ENDPOINT?: string | undefined; SPARK_MODEL?: string | undefined; KEK?: KekBinding | undefined };

export function workerSparkModel(
  env: SparkEnv,
  api: () => Pick<RecordApi, 'kernel'>,
  options: { send?: ((input: URL, init: RequestInit) => Promise<Response>) | undefined; open?: ((api: Pick<RecordApi, 'kernel'>) => OpenKey | null) | undefined } = {},
): SparkModel | undefined {
  const opener = options.open ?? ((a: Pick<RecordApi, 'kernel'>) => keyOpener(a, env.KEK));
  return sparkModelOf(sparkFromEnv(env, { operatorKey: false }), {
    grants: () => api().kernel.grants(),
    openKey: isBound(env.KEK) ? async (grant) => (opener(api()) ?? (async () => null))(grant) : null,
    send: options.send ?? ((input, init) => fetch(input, init)),
  });
}

/** Spark's daily look, asked on an alarm and after a request: the record decides whether it is due. It never throws. */
export async function sparkLook(api: Pick<RecordApi, 'sparkTick'>): Promise<void> {
  try {
    await api.sparkTick();
  } catch (e) {
    console.error('spark:', e instanceof Error ? e.message : String(e));
  }
}
