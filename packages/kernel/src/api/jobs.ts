/**
 * `jobs`: the kernel's half of the job queue, as one member of the kernel.
 *
 * THE LOGIC IS `../jobs.ts` AND THIS IS ITS SEAM. Every function there takes `TokenDeps`, because a claim mints the job's
 * bearer and an end revokes it through `token.ts`; this builds that from the record's own parts, the way `index.ts`
 * builds it for tokens and device grants, and wraps each write in the record's transaction. The record's methods
 * (`packages/record/src/jobs.ts`) call these, and so does the host's `runnerContext` (`packages/host/src/jobs.ts`).
 *
 * ONE MEMBER, `jobs`, HOLDING EVERY METHOD, so the kernel gains one name and no name it already had: `create`, `cancel`
 * and the rest read as what they are only beside the word `jobs`.
 *
 * THE DIGEST AND THE RANDOMNESS ARE WEBCRYPTO'S, as `index.ts`'s `tokenDeps` has them: the digest is `declare.ts`'s
 * `digest`, the same lower-case SHA-256, so a bearer minted here is verified by `verifyToken` like any other, and the
 * kernel still imports no platform module.
 */

import type { Result } from '@braindog/ports';

import { digest } from '../declare.ts';
import type { KernelParts } from '../parts.ts';
import { recordIdentity } from '../provision.ts';
import type { TokenDeps } from '../token.ts';
import {
  cancelJob,
  claimJob,
  createJob,
  jobEvents,
  listJobs,
  postJobEvent,
  readCancel,
  runnerGrant,
  sweepJobs,
  type CancelRead,
  type Cancelled,
  type Claimed,
  type CreateJobArgs,
  type JobEvents,
  type JobRunner,
  type JobsPage,
  type PostJobEventArgs,
  type Posted,
  type RunnerGrant,
  type RunnerPlace,
} from '../jobs.ts';

export function extension(parts: KernelParts) {
  const { sql, clock, mint, transaction, get } = parts;

  /**
   * What the queue needs beyond SQL, read at each call so every row one call writes shares one instant. `validFrom` is
   * the host's cut-off, handed in only where a bearer is checked (`TokenDeps.validFrom`).
   */
  const deps = (validFrom?: string): TokenDeps => ({
    sql,
    nowMs: clock.now(),
    mint,
    recordId: () => recordIdentity(sql)?.id ?? null,
    digest,
    random: (n: number) => crypto.getRandomValues(new Uint8Array(n)),
    ...(validFrom === undefined ? {} : { validFrom }),
  });

  return {
    jobs: {
      /** Start one job of an approved kind. `about`, when given, must be a row the record holds. */
      create: (args: CreateJobArgs): Result<{ id: string }> =>
        transaction(() => createJob(deps(), args, (spoken) => get(spoken) !== null)),

      /** Stop one: at once while it waits, by a flag its runner reads while a machine runs it. */
      cancel: (args: { id?: unknown }): Result<Cancelled> => transaction(() => cancelJob(deps(), args)),

      /** The jobs, newest first, a page at a time. Reads only. */
      list: (args: { status?: unknown; limit?: unknown; cursor?: unknown }): Promise<Result<JobsPage>> => listJobs(deps(), args),

      /** One job's transcript since a line, and where it stands. Reads only. */
      events: (args: { id?: unknown; after?: unknown }): Result<JobEvents> => jobEvents(deps(), args),

      /**
       * A runner takes the oldest queued job it can run where it is, with its lease and its bearer, or is told how long
       * to wait. `place` is its machine and the profiles it can run under (migration 44).
       */
      claim: (runner: JobRunner, place?: RunnerPlace): Promise<Result<Claimed>> => claimJob(deps(), runner, transaction, place),

      /** A runner reports the next line of the job it holds. */
      post: (runner: JobRunner, args: PostJobEventArgs): Result<Posted> => transaction(() => postJobEvent(deps(), runner, args)),

      /** A runner asks whether its job was stopped, renewing its lease. */
      readCancel: (runner: JobRunner, args: { job_id?: unknown }): Result<CancelRead> => transaction(() => readCancel(deps(), runner, args)),

      /** A runner's bearer, checked against this record's device grants. INTERNAL: the host asks before it builds a context. */
      runner: (bearer: string, validFrom?: string): Promise<Result<RunnerGrant>> => runnerGrant(deps(validFrom), bearer),

      /** Let go what waited past its day and what a silent machine held. The hourly sweep's part; answers the rows moved. */
      sweep: (): number => transaction(() => sweepJobs(deps())),
    },
  };
}
