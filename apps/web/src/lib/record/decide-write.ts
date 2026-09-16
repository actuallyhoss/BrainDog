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
 * FOUR ANSWERS. `written` drops the shell's kept `boot`, so the rail's count follows once the layout reads again.
 * `gone` is no record behind the screen any more (`UNREACHABLE`, `UNAUTHORIZED`, a 404 that is not JSON), with the
 * sentence to say. `refused` is the record's own sentence. `conflict` is a row the proposal would change that moved
 * since it was filed: the screen reads again and says so.
 */

import { createClient } from '@braindog/client';

import { copy } from '../copy.ts';
import { forget, type Fetch } from './boot-live.ts';
import { noRecord } from './device.ts';

export type Verdict = { decide: { option: string; reason: string } } | { defer: { until: string; why: string } };

export type Written =
  | { from: 'written'; decision: string | null; applied?: Record<string, string[]> }
  | { from: 'gone'; fix: string }
  | { from: 'refused'; fix: string }
  | { from: 'conflict'; fix: string };

/** A verdict with nothing to send says so here, and the record is not asked. */
function missing(verdict: Verdict): string | null {
  if ('decide' in verdict) return verdict.decide.option === '' || verdict.decide.reason.trim() === '' ? copy.reasonRequired : null;
  return verdict.defer.until === '' || verdict.defer.why.trim() === '' ? copy.reasonRequired : null;
}

const trimmed = (verdict: Verdict): Verdict =>
  'decide' in verdict
    ? { decide: { option: verdict.decide.option, reason: verdict.decide.reason.trim() } }
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
  if (noRecord(out.refusal.code)) return { from: 'gone', fix: out.refusal.fix };
  return { from: 'refused', fix: out.refusal.fix };
}

/** Answer one with an option and the reason `decide` requires. */
export const answerQuestion = (base: string, id: string, option: string, reason: string, io?: Fetch): Promise<Written> =>
  writeDecision(base, id, { decide: { option, reason } }, io);

/** Park one until a day, with why it can wait. */
export const parkQuestion = (base: string, id: string, until: string, why: string, io?: Fetch): Promise<Written> =>
  writeDecision(base, id, { defer: { until, why } }, io);
