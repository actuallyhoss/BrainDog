/**
 * The ledger Slash's press and first plan are held and settled in on the Worker: `@braindog/host`'s `slashRecordMeter`
 * over the engine `workerSlashAnswers` and the door are built from, in this object's own storage.
 *
 * THE RECORD ASKED FOR THIS AND NO HOST GAVE IT. `d16d9d35` made the record hold both asks through `deps.slashMeter` and
 * ask its model unmetered where none is passed (`loop/research-batch-sixty-audit.md` finding 2). `Record$.#open` passed
 * none, so measured on 24 September through the bundle (`test/slash-press-metered.test.ts`): 5 presses and the daily look
 * under a ceiling of three asks made 6 binding calls and no `call` row, while a person's read at the palette was held to
 * both the owner's `ask_cap` and the operator's `SLASH_INCLUDED_MONTH_NEURONS` (`1cdc6721`).
 *
 * THE ENGINE IS `workerSlashEngine`, SO THE OPERATOR'S CEILING IS WHAT `status()` READS. On the included model that engine
 * is wrapped in `operatorCeiling`, whose `status()` names the ceiling's count and cap wherever the ceiling binds, and whose
 * count is every `call` row this month with a model's name: the meter's hold row carries `glm-5.3-flash`, so a press
 * spends the same asks a read and an automation's question do. One more engine over the same two tables, as the door and
 * `workerSlashAnswers` already are; it holds nothing of its own between asks.
 *
 * PRICED ONLY WHERE THE OPERATOR PAYS. On the included model every call is Workers AI on his account, so the row is
 * priced at the package's own rate for it (`MODELS['glm-5.3-flash']`, the rate the engine prices every tier at there).
 * Where `SLASH_ENDPOINT` is set the model is the owner's own provider on the owner's own bill, and the row is counted and
 * priced 0, which is `slashRecordMeter`'s rule for a host that does not pay.
 *
 * LAZY, AND THE PACKAGE IS IMPORTED ONLY WHEN A PRESS ASKS, which is `46 §5.1`: a keyless deployment never evaluates
 * `@braindog/slash`, and the rate is read off it rather than copied a third time beside `src/inference.ts` and the package.
 * A build that throws is let go, as `workerSlashAnswers` lets it go, and the hold that asked is refused: the record reads a
 * meter that threw as a ledger it could not read, and its own rules draft.
 */

import { slashRecordMeter } from '@braindog/host';
import type { RecordApi, SlashMeter } from '@braindog/record';
import { slashFromEnv } from '@braindog/host/slash';

import { workerSlashEngine, type SlashEngineDeps, type SlashEnv } from './slash.ts';

/** The routing name the package's own tier `a` rows carry, and so the one the ceiling and `status()` count under. */
const INCLUDED_MODEL = 'glm-5.3-flash';

export function workerSlashMeter(env: SlashEnv, api: () => RecordApi, deps: SlashEngineDeps): SlashMeter {
  let built: Promise<SlashMeter> | null = null;
  const meterOf = (): Promise<SlashMeter> =>
    (built ??= (async () => {
      const engine = await workerSlashEngine(env, api, deps);
      const included = slashFromEnv(env, { operatorKey: false }) === undefined;
      const rate = engine !== undefined && included ? (await import('@braindog/slash')).MODELS[INCLUDED_MODEL] : undefined;
      return slashRecordMeter({ sql: deps.sql, clock: deps.clock, engine: async () => engine, model: INCLUDED_MODEL, rate });
    })().catch((e: unknown) => {
      built = null;
      throw e;
    }));
  return { hold: async (kind) => (await meterOf()).hold(kind) };
}
