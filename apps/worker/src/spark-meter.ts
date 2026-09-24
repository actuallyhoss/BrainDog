/**
 * The ledger Spark's press and first plan are held and settled in on the Worker: `@braindog/host`'s `sparkRecordMeter`
 * over the engine `workerSparkAnswers` and the door are built from, in this object's own storage.
 *
 * THE RECORD ASKED FOR THIS AND NO HOST GAVE IT. `d16d9d35` made the record hold both asks through `deps.sparkMeter` and
 * ask its model unmetered where none is passed (`loop/research-batch-sixty-audit.md` finding 2). `Record$.#open` passed
 * none, so measured on 24 September through the bundle (`test/spark-press-metered.test.ts`): 5 presses and the daily look
 * under a ceiling of three asks made 6 binding calls and no `call` row, while a person's read at the palette was held to
 * both the owner's `ask_cap` and the operator's `SPARK_INCLUDED_MONTH_NEURONS` (`1cdc6721`).
 *
 * THE ENGINE IS `workerSparkEngine`, SO THE OPERATOR'S CEILING IS WHAT `status()` READS. On the included model that engine
 * is wrapped in `operatorCeiling`, whose `status()` names the ceiling's count and cap wherever the ceiling binds, and whose
 * count is every `call` row this month with a model's name: the meter's hold row carries `glm-5.3-flash`, so a press
 * spends the same asks a read and an automation's question do. One more engine over the same two tables, as the door and
 * `workerSparkAnswers` already are; it holds nothing of its own between asks.
 *
 * PRICED ONLY WHERE THE OPERATOR PAYS. On the included model every call is Workers AI on his account, so the row is
 * priced at the package's own rate for it (`MODELS['glm-5.3-flash']`, the rate the engine prices every tier at there).
 * Where `SPARK_ENDPOINT` is set the model is the owner's own provider on the owner's own bill, and the row is counted and
 * priced 0, which is `sparkRecordMeter`'s rule for a host that does not pay.
 *
 * LAZY, AND THE PACKAGE IS IMPORTED ONLY WHEN A PRESS ASKS, which is `46 §5.1`: a keyless deployment never evaluates
 * `@braindog/spark`, and the rate is read off it rather than copied a third time beside `src/inference.ts` and the package.
 * A build that throws is let go, as `workerSparkAnswers` lets it go, and the hold that asked is refused: the record reads a
 * meter that threw as a ledger it could not read, and its own rules draft.
 */

import { sparkRecordMeter } from '@braindog/host';
import type { RecordApi, SparkMeter } from '@braindog/record';
import { sparkFromEnv } from '@braindog/host/spark';

import { workerSparkEngine, type SparkEngineDeps, type SparkEnv } from './spark.ts';

/** The routing name the package's own tier `a` rows carry, and so the one the ceiling and `status()` count under. */
const INCLUDED_MODEL = 'glm-5.3-flash';

export function workerSparkMeter(env: SparkEnv, api: () => RecordApi, deps: SparkEngineDeps): SparkMeter {
  let built: Promise<SparkMeter> | null = null;
  const meterOf = (): Promise<SparkMeter> =>
    (built ??= (async () => {
      const engine = await workerSparkEngine(env, api, deps);
      const included = sparkFromEnv(env, { operatorKey: false }) === undefined;
      const rate = engine !== undefined && included ? (await import('@braindog/spark')).MODELS[INCLUDED_MODEL] : undefined;
      return sparkRecordMeter({ sql: deps.sql, clock: deps.clock, engine: async () => engine, model: INCLUDED_MODEL, rate });
    })().catch((e: unknown) => {
      built = null;
      throw e;
    }));
  return { hold: async (kind) => (await meterOf()).hold(kind) };
}
