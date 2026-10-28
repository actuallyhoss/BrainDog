/**
 * The engine's probe, the record's half: `engineProbe`, ADMIN.
 *
 * "DOES THE MODEL ANSWER NOW?", ON HIS PRESS. The engine's health is read from the ledger (`engine.ts`, `engineHealth`),
 * and while no model answers the jobs wait and the model is tried every half hour, so after he mended a key he waited
 * that long to know. This asks each model of the answer route a fixed prompt, through the router the real ask uses, and
 * answers "Answered by <model> in 1.2 s" or why not. The host builds the probe (`packages/host/src/engine-probe.ts`) and
 * hands it in as `engineProbe`, the way it hands `engineHealth`; absent, the call is refused `NOT_IN_THIS_BUILD`.
 *
 * THE OWNER'S, IN A BROWSER. It sends a question to a model on the record's account, so no token and no agent presses it.
 *
 * AT MOST ONE EVERY TEN MINUTES A RECORD, kept as Slash's own pref (`slash.probed`, the instant of the last press) for the
 * reason `slash.reads` is one: local to this copy, no event, no migration. The press is marked before the models are
 * asked, so two presses at once send one probe; a press that found no model to ask is given back, since nothing was sent.
 * A press inside the ten minutes is `RATE_LIMITED` with the minutes left, and every answer says when the next may go.
 */

import type { Result } from '@braindog/ports';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** The host's `EngineProbeCandidate`, restated because this package never imports the host. */
export type EngineProbeCandidate = { model: string; served: boolean; strict: boolean; ms: number; why?: string };

/** What the host's probe answers: every candidate in the order a real ask tries them, and the one sentence about them. */
export type EngineProbe = { candidates: EngineProbeCandidate[]; said: string };

/** What `engineProbe` answers a caller: the probe, and the instant the next press may go. */
export type EngineProbed = EngineProbe & { next: string };

/** How long a record waits between two probes. */
export const ENGINE_PROBE_EVERY_MS = 10 * 60_000;

/** Slash's person, whose prefs hold its own marks, and the mark this one is. */
const SLASH = 'slash';
const SLASH_PROBED = 'slash.probed';

const UNBUILT = 'This host cannot check its model on a press. The repair is a deploy of a host that can, not an edit.';

/** The minutes left, said as a person says them. */
const minutesLeft = (ms: number): string => {
  const n = Math.max(1, Math.ceil(ms / 60_000));
  return `${n} minute${n === 1 ? '' : 's'}`;
};

export function methods(deps: RecordDeps) {
  const { admin, kernel, no, clock } = deps;

  return {
    /**
     * Ask each model of the answer route whether it answers now, with a fixed prompt that holds nothing of the record.
     * Takes nothing. Answers `{ candidates, said, next }`. One every ten minutes a record. ADMIN.
     */
    async engineProbe(args: unknown, ctx: CallContext): Promise<Result<EngineProbed>> {
      const stop = admin(ctx, 'check whether Slash’s model answers');
      if (stop) return { ok: false, refusal: stop };
      if (args !== undefined && args !== null) {
        const plain = typeof args === 'object' && !Array.isArray(args);
        if (!plain || Object.keys(args).length > 0)
          return no('FIELD_UNKNOWN', 'engineProbe takes nothing: it asks each model of the answer route the same fixed question.', {
            at: plain ? (Object.keys(args)[0] ?? 'args') : 'args',
            allowed: [],
          });
      }
      const probe = deps.engineProbe;
      if (probe === undefined) return no('NOT_IN_THIS_BUILD', UNBUILT, { at: 'engineProbe' });

      const now = clock.now();
      const kept = kernel.prefsOf(SLASH)[SLASH_PROBED];
      const last = typeof kept === 'string' ? Date.parse(kept) : Number.NaN;
      /* A MARK AHEAD OF THE CLOCK (a clock set back) is not read, so it can never hold him longer than ten minutes. */
      const since = Number.isFinite(last) && last <= now ? now - last : Infinity;
      if (since < ENGINE_PROBE_EVERY_MS) {
        const left = ENGINE_PROBE_EVERY_MS - since;
        return {
          ok: false,
          refusal: {
            code: 'RATE_LIMITED',
            fix: `The model was checked in the last ten minutes. The next check can go in ${minutesLeft(left)}.`,
            at: 'engineProbe',
            retry_after: Math.max(1, Math.ceil(left / 1000)),
          },
        };
      }

      kernel.setPref(SLASH, SLASH_PROBED, new Date(now).toISOString());
      let out: EngineProbe;
      try {
        out = await probe();
      } catch (thrown) {
        kernel.setPref(SLASH, SLASH_PROBED, typeof kept === 'string' ? kept : null);
        throw thrown;
      }
      /* NOTHING WAS SENT, so the press is given back: he may set a model up and press again at once. */
      if (out.candidates.length === 0) {
        kernel.setPref(SLASH, SLASH_PROBED, typeof kept === 'string' ? kept : null);
        return { ok: true, value: { candidates: [], said: out.said, next: new Date(now).toISOString() } };
      }
      return { ok: true, value: { candidates: out.candidates, said: out.said, next: new Date(now + ENGINE_PROBE_EVERY_MS).toISOString() } };
    },
  };
}
