/**
 * The engine's health, the record's half: `engineHealth`, READ+ (ENG-A02).
 *
 * WHETHER SLASH'S MODEL ANSWERS, AND THE ONE SENTENCE A PERSON READS ABOUT IT. The ledger it is read from is Slash's own
 * (`packages/slash/src/health.ts`), which this package may not import, so the host builds the read and hands it in as
 * `engineHealth`, the way it hands `slashMeter` (`packages/host/src/engine-health.ts`). Absent, the answer is `null`: a
 * host that wired no engine has nothing to say about one, and saying "healthy" in its place is what Settings did on the
 * day a model job died.
 *
 * READ LEVEL, SO A READ TOKEN, THE COMMAND LINE AND THE DAILY VITAL-SIGN READ CAN ALL CALL IT. It holds no row of the
 * record and no person's words: a state, two instants and a sentence with no model id, job name or code in it.
 */

import type { Result } from '@braindog/ports';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** `@braindog/slash`'s `EngineHealth`, restated because this package never imports that one. */
export type EngineHealth = {
  state: 'answering' | 'not_answering' | 'never_asked' | 'off' | 'key_closed';
  last_ok: string | null;
  since: string | null;
};

/** `@braindog/slash`'s `EngineSaid`: the sentence, and whose it is to fix. */
export type EngineSaid = { text: string; whose: 'ours' | 'yours' | null };

/** What the host's read answers, and what `engineHealth` answers a caller. */
export type EngineHealthRead = { health: EngineHealth; said: EngineSaid };

export function methods(deps: RecordDeps) {
  const { scoped } = deps;

  return {
    /** Whether Slash's model answers, read from its own ledger, with the sentence a person reads. `null` where the host wired no engine. READ+. */
    async engineHealth(_args: unknown, ctx: CallContext): Promise<Result<EngineHealthRead | null>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const read = deps.engineHealth;
      if (read === undefined) return { ok: true, value: null };
      return { ok: true, value: await read() };
    },
  };
}
