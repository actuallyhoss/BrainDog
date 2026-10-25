/**
 * A runner at a host: the context its bearer earns, and the wait a claim may be held for (`docs/33-CONTRACTS.md` §11).
 *
 * A RUNNER'S BEARER IS CHECKED BY THE RECORD IT NAMES, because only that record holds the device grant it was minted
 * for. `runnerContext` asks the record's kernel and builds the principal from what the grant says, never from anything
 * the caller sent, so the record's three runner doors (`packages/record/src/jobs.ts`) can trust its kind. Both hosts call
 * it where a bearer on `/api` is not a token: the Worker from its record object's `runner`, the self-host beside its own
 * bearer check.
 *
 * THE WAIT IS HELD HERE AND NEVER INSIDE THE RECORD. `claimJob { wait }` asks the host to hold the request until a job
 * is queued or the wait runs out; the record's `claimJob` answers at once, and `holdClaim` asks it again every
 * `CLAIM_EVERY_MS` until it hands over a job or `CLAIM_WAIT_MOST_MS` has passed. The record's single thread is never
 * the one waiting, and a runner whose host does not hold the wait is answered at once with how long to sleep, which is
 * the same protocol a turn slower.
 */

import type { CallContext, RecordApi } from '@braindog/record';

/** The longest a host holds one claim open (`33 §11`: never past twenty seconds). */
export const CLAIM_WAIT_MOST_MS = 20_000;

/** How often a held claim asks the record again (`33 §11`). */
export const CLAIM_EVERY_MS = 1_500;

/** The most times one held claim asks the record: the ceiling on the work one waiting runner costs. */
export const CLAIM_ASKS_MOST = Math.ceil(CLAIM_WAIT_MOST_MS / CLAIM_EVERY_MS) + 1;

/**
 * The context a runner's bearer earns on this record, or `null` when the bearer is not a runner's.
 *
 * `null` AND NEVER A REFUSAL, because the caller is a host deciding whether the bearer is a runner's at all, after the
 * token table did not know it; a bearer that is neither is the host's 401, in the words it already gives. `validFrom`
 * is the host's cut-off, as `keychainGrant` takes it: a machine enrolled before it is refused as one nobody enrolled.
 */
export async function runnerContext(api: RecordApi, bearer: string, validFrom?: string): Promise<CallContext | null> {
  if (typeof bearer !== 'string' || bearer === '') return null;
  const grant = await api.kernel.jobs.runner(bearer, validFrom);
  if (!grant.ok) return null;
  return { principal: { kind: 'runner', id: grant.value.id, name: grant.value.name }, credentialed: true };
}

/** The wait a runner asked for, in milliseconds: whole seconds, at most the host's own ceiling, and none when it sent none. */
export function claimWaitMs(wait: unknown): number {
  if (typeof wait !== 'number' || !Number.isFinite(wait) || wait <= 0) return 0;
  return Math.min(Math.floor(wait) * 1_000, CLAIM_WAIT_MOST_MS);
}

/**
 * Ask the record for a job, and keep asking until it hands one over or the wait runs out: the last answer either way.
 *
 * `ask` IS THE HOST'S OWN CALL INTO THE RECORD, whatever shape its answer takes (a `Result` in the self-host's process, a
 * `Response` from the Worker's object), and `idle` says whether an answer is "nothing yet". A refusal is not idle and is
 * answered at once. `now` and `sleep` are the host's clock, so a test holds no real time.
 */
export async function holdClaim<T>(
  ask: () => Promise<T>,
  wait: unknown,
  deps: { idle: (answer: T) => boolean; now: () => number; sleep: (ms: number) => Promise<void> },
): Promise<T> {
  const until = deps.now() + claimWaitMs(wait);
  let answer = await ask();
  for (let asked = 1; asked < CLAIM_ASKS_MOST && deps.idle(answer); asked++) {
    const left = until - deps.now();
    if (left <= 0) break;
    await deps.sleep(Math.min(CLAIM_EVERY_MS, left));
    answer = await ask();
  }
  return answer;
}

/** Whether a record's answer to `claimJob` is "nothing yet": a job of `null`, which is what `holdClaim` waits past. */
export const claimIdle = (answer: { ok: boolean; value?: unknown }): boolean =>
  answer.ok === true && typeof answer.value === 'object' && answer.value !== null && (answer.value as { job?: unknown }).job === null;
