/**
 * The engine's health, the record's half: `engineHealth`, READ+.
 *
 * WHETHER SLASH'S MODEL ANSWERS, AND THE ONE SENTENCE A PERSON READS ABOUT IT. The ledger it is read from is Slash's own
 * (`packages/slash/src/health.ts`), which this package may not import, so the host builds the read and hands it in as
 * `engineHealth`, the way it hands `slashMeter` (`packages/host/src/engine-health.ts`). Absent, the answer is `null`: a
 * host that wired no engine has nothing to say about one, and saying "healthy" in its place is what Settings did on the
 * day a model job died.
 *
 * READ LEVEL, SO A READ TOKEN, THE COMMAND LINE AND THE DAILY VITAL-SIGN READ CAN ALL CALL IT. It holds no row of the
 * record and no person's words: a state, two instants and a sentence with no model id, job name or code in it.
 *
 * AND THE ONE SWITCH FOR SLASH'S BACKGROUND READING: `slashReads`, ADMIN. The consent rule: his own ask is his
 * own act, and what Slash reads on its own is on until the owner says otherwise. Kept as Slash's own pref beside the
 * daily look's (`slash.daily` in `index.ts`), for the reason that one is: local to this copy, no event, no migration.
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

/** Slash's person, whose prefs hold its switches, and the pref this one is: absent for on, `false` for off. */
const SLASH = 'slash';
const SLASH_READS = 'slash.reads';

/** What `slashReads` answers: whether Slash may read in the background, and nothing of who or which record. */
export type SlashReads = { on: boolean };

export function methods(deps: RecordDeps) {
  const { scoped, admin, kernel, no } = deps;

  const reads = (): SlashReads => ({ on: kernel.prefsOf(SLASH)[SLASH_READS] !== false });

  return {
    /** Whether Slash's model answers, read from its own ledger, with the sentence a person reads. `null` where the host wired no engine. READ+. */
    async engineHealth(_args: unknown, ctx: CallContext): Promise<Result<EngineHealthRead | null>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const read = deps.engineHealth;
      /* THE OWNER'S, since it says this month's model spend and the provider's own error text: anybody else is answered as
         a host with no engine, which draws nothing, rather than a refusal on a screen they did nothing on. */
      if (read === undefined || deps.guard(ctx, 'owner') !== null) return { ok: true, value: null };
      return { ok: true, value: await read() };
    },

    /**
     * Whether Slash reads in the background, and the owner's switch for it: `{ on }` sets it, no argument reads it.
     *
     * AN OWNER'S, IN A BROWSER, as the daily look's switch is: it is the consent to send what the record holds to a
     * model without a press each time. Off stops the background jobs, never his own ask. ADMIN.
     */
    async slashReads(args: { on?: unknown } | undefined, ctx: CallContext): Promise<Result<SlashReads>> {
      const stop = admin(ctx, 'choose whether Slash reads in the background');
      if (stop) return { ok: false, refusal: stop };
      const said = (args ?? {}) as Record<string, unknown>;
      const extra = Object.keys(said).find((k) => k !== 'on');
      if (extra !== undefined) return { ok: false, refusal: { code: 'FIELD_UNKNOWN', fix: `${extra} is not something this call takes. It takes on.`, at: extra, allowed: ['on'] } };
      if (said.on === undefined) return { ok: true, value: reads() };
      if (typeof said.on !== 'boolean') return no('VALUE_MALFORMED', 'on is true to let Slash read in the background, or false to have it wait for you to ask.', { at: 'on' });
      kernel.setPref(SLASH, SLASH_READS, said.on ? null : false);
      return { ok: true, value: reads() };
    },
  };
}
