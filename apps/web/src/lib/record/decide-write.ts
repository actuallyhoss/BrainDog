/**
 * Decide's writes against the record: answering a question or a proposal, and parking one until a day.
 *
 * A ROUTE-ONLY MODULE, loaded by the two Decide screens, like `inbox-live.ts`: the client carries the route table as
 * a value. The fetch is handed in, so a test drives every branch without a socket.
 *
 * ONE VERB, `decide`. A suggestion is a governance row, and `30 §5` reads and writes those through the same verbs as
 * any other; the kernel resolves it, writes the `D<n>`, and installs what an accepted proposal carries. A proposal that
 * CALLS OUT needs nothing extra from here: the lines the press approves are the ones the record worked out when it was
 * filed, and the kernel copies them from the suggestion onto the decision event word for word. Sending them back would
 * let a browser say it approved lines the record never showed.
 *
 * THREE ANSWERS. `written` drops the shell's kept `boot`, so the rail's count follows once the layout reads again.
 * `refused` is the record's own sentence, and that includes a host that did not answer and a session that ran out.
 * `conflict` is a row the proposal would change that moved since it was filed: the screen reads again and says so.
 *
 * A REFUSAL THAT ASKS FOR A REASON SAYS SO, as `wants: 'reason'`. A question answered where it is shown
 * (`lib/page/QueueAnswer.svelte`) sends the option alone and lets the kernel decide whether a reason is owed
 * (`govern.ts` `decide`, which refuses `REQUIRED_MISSING` at `reason` today for every question). The card opens its one
 * reason line on that answer and on no other, so it never asks for a sentence the record would not have wanted.
 *
 * THERE WAS A FOURTH, `gone`, for a 401 or an unreachable host at an address with no slug, which is where the sample
 * was drawn. Neither Decide screen told it from `refused`, both print the `fix`, and with no sample an address with
 * no slug is a record like any other (wave C3 of `loop/research-no-sample.md`).
 */

import { createClient } from '@braindog/client';

import { copy } from '../copy.ts';
import { forget, type Fetch } from './boot-live.ts';

/**
 * `rows`: on accepting a proposal that adds several rows, the places of the ones ticked; the rest are declined.
 *
 * `reason` ABSENT IS NOT `reason` EMPTY. Absent, nobody has been asked yet, and the record is sent the option alone so
 * the kernel says whether it wants one. Typed and blank, somebody was asked and wrote nothing, which is refused here.
 */
export type Verdict = { decide: { option: string; reason?: string; rows?: number[] } } | { defer: { until: string; why: string } };

export type Written =
  | { from: 'written'; decision: string | null; applied?: Record<string, string[]> }
  | { from: 'refused'; fix: string; wants?: 'reason' }
  | { from: 'conflict'; fix: string };

/** A verdict with nothing to send says so here, and the record is not asked. */
function missing(verdict: Verdict): string | null {
  if ('decide' in verdict) {
    const { option, reason } = verdict.decide;
    return option === '' || (reason !== undefined && reason.trim() === '') ? copy.reasonRequired : null;
  }
  return verdict.defer.until === '' || verdict.defer.why.trim() === '' ? copy.reasonRequired : null;
}

const trimmed = (verdict: Verdict): Verdict =>
  'decide' in verdict
    ? {
        decide: {
          option: verdict.decide.option,
          ...(verdict.decide.reason !== undefined ? { reason: verdict.decide.reason.trim() } : {}),
          ...(verdict.decide.rows ? { rows: verdict.decide.rows } : {}),
        },
      }
    : { defer: { until: verdict.defer.until, why: verdict.defer.why.trim() } };

/** Send one verdict on suggestion `id`. */
export async function writeDecision(base: string, id: string, verdict: Verdict, io?: Fetch): Promise<Written> {
  const said = missing(verdict);
  if (said !== null) return { from: 'refused', fix: said };
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const out = await client.call<{ decision?: unknown; applied?: unknown }>('decide', { id, ...trimmed(verdict) });
  if (out.ok) {
    forget();
    const decision = out.value && typeof out.value.decision === 'string' ? out.value.decision : null;
    /* AN ACCEPTED ARRANGEMENT SAYS WHAT IT APPLIED, and the screen says it back. */
    const applied = out.value && typeof out.value.applied === 'object' && out.value.applied !== null ? (out.value.applied as Record<string, string[]>) : undefined;
    return { from: 'written', decision, ...(applied ? { applied } : {}) };
  }
  if ('conflict' in out) return { from: 'conflict', fix: copy.decideConflict };
  const wants = out.refusal.code === 'REQUIRED_MISSING' && out.refusal.at === 'reason';
  return { from: 'refused', fix: out.refusal.fix, ...(wants ? { wants: 'reason' as const } : {}) };
}

/**
 * Answer one with an option, the reason where there is one, and on accepting some rows of several, which.
 *
 * WITHOUT A REASON THE KERNEL DECIDES (`loop/finish/contracts.md` §8.3, modules C9): the option goes alone, and a record
 * that wants a sentence answers `wants: 'reason'`, so the caller asks for one and sends again.
 */
export const answerQuestion = (base: string, id: string, option: string, reason?: string, io?: Fetch, rows?: number[]): Promise<Written> =>
  writeDecision(base, id, { decide: { option, ...(reason !== undefined ? { reason } : {}), ...(rows ? { rows } : {}) } }, io);

/** Park one until a day, with why it can wait. */
export const parkQuestion = (base: string, id: string, until: string, why: string, io?: Fetch): Promise<Written> =>
  writeDecision(base, id, { defer: { until, why } }, io);
