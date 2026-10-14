/**
 * The engine's readings, the method: `engineReadings`, READ+ (ENG-B01 job 3).
 *
 * WHAT WAS ASKED OF THE MODEL, WHAT IT ANSWERED, WHAT WAS KEPT AND REFUSED, AND WHAT THE RECORD STILL DOES NOT
 * UNDERSTAND, over the last 30 days. The counting is `../engine-readings.ts`, which reads nothing. The ledger it counts
 * is Slash's own (`slash_call`), which this package may not open, so the host builds the read and hands it in as
 * `engineLedger`, the way it hands `engineHealth` (`./engine.ts`). Absent, the answer is `null`: a host that wired no
 * ledger knows nothing of what was asked, and a row of zeros in its place would read as "nothing was asked".
 *
 * READ LEVEL, SO A READ TOKEN, THE COMMAND LINE AND THE DAILY VITAL-SIGN READ CAN ALL CALL IT. It holds no row of the
 * record and no person's words: purposes, counts, instants and a failure's code, each already held to a plain word by
 * the arithmetic.
 *
 * NOTHING IS OWED YET. What waits for a model to read it is the `about_owed` table's to say (ENG-B03), and that table
 * does not exist, so `owed` is handed in empty and every `owed` reads 0 until it does.
 */

import { slashBrake } from '@braindog/kernel';
import type { Result } from '@braindog/ports';

import type { CallContext } from '../index.ts';
import { engineReadings, MONTH_DAYS, type EngineReadings, type LedgerCall, type MentionSeen, type OpenQuestion } from '../engine-readings.ts';
import type { RecordDeps } from './index.ts';

/** What the host's read answers: the ledger's calls, each mention's attached or not, and the open questions' causes. */
export type EngineLedger = {
  calls: readonly LedgerCall[];
  mentions: readonly MentionSeen[];
  questions: readonly OpenQuestion[];
};

/** The host's read. `since` is the instant the month begins, so it selects no call older than the arithmetic counts. */
export type EngineLedgerRead = (since: string) => Promise<EngineLedger>;

const DAY = 86_400_000;

export function methods(deps: RecordDeps) {
  const { scoped, clock } = deps;

  return {
    /** What the model was asked and answered in the last 30 days, and what is not yet understood. `null` where the host wired no ledger. READ+. */
    async engineReadings(_args: unknown, ctx: CallContext): Promise<Result<EngineReadings | null>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const read = deps.engineLedger;
      if (read === undefined) return { ok: true, value: null };
      const now = clock.now();
      const { calls, mentions, questions } = await read(new Date(now - MONTH_DAYS * DAY).toISOString());
      return { ok: true, value: engineReadings({ now, calls, owed: [], mentions, questions, braked: slashBrake(deps.sql) }) };
    },
  };
}
