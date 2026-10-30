/**
 * HOW MANY TRIALS AN AGENT HAS LEFT TODAY ON ONE RECORD. Pure: the caller hands in how many trials by a token
 * this record has run since midnight UTC, and gets back how many more it may, or the refusal.
 *
 * TWENTY A DAY, BECAUSE A TRIAL IS A RUN. Each one starts a sandbox and calls a provider on the owner's plan, and an
 * agent that loops on trials would spend the month's runs before the person asked for anything. Twenty is enough to get
 * a draft right and leaves the rest of the day's allowance where it was. The owner's own trials are not counted: the
 * cap is on what an agent may spend of hers, not on her.
 *
 * A REFUSED BODY DOES NOT COUNT, because nothing ran: the caller counts only trials the host started. `OUT_OF_BOUNDS`,
 * the code a run past its own limits answers, with a sentence that says what to do instead of waiting.
 */

import type { Refusal, Result } from '@braindog/ports';

/** The trials by agents one record runs in a UTC day. */
export const TRIALS_A_DAY = 20;

/** What the trial past the cap is told. */
export const TRIALS_SPENT = `Agents have tried ${TRIALS_A_DAY} scripts here today, the most they may. Propose it untried, or try again tomorrow.`;

/** The UTC day a trial at `at` is counted in, as `YYYY-MM-DD`. */
export const trialDay = (at: number): string => new Date(at).toISOString().slice(0, 10);

/**
 * The trials left after `count` have run today (`1` after nineteen), or the refusal once twenty have. A count that is
 * not a number is refused as the cap, since a cap that opens when its own reading fails is no cap.
 */
export function trialsLeft(count: number): Result<number> {
  if (!(count < TRIALS_A_DAY)) return { ok: false, refusal: { code: 'OUT_OF_BOUNDS', fix: TRIALS_SPENT } satisfies Refusal };
  return { ok: true, value: TRIALS_A_DAY - Math.max(0, Math.floor(count)) };
}
