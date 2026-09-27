/**
 * What answers the record's model jobs on this Worker: `serveModelJobs`'s `deps.inference`, over Slash's own engine.
 *
 * TWO JOBS, AND BOTH ARE SLASH'S (`loop/finish/contracts.md` X8). An `infer.draft` is a pattern for messages nothing
 * parsed, drafted by `draftPattern`; an `infer.prose` is the two sentences above a digest, written by `digestProse`. The
 * pass that leases them, meters them on the background allowance and acks them is `@braindog/host/model-jobs`, and the
 * alarm calls it; this file is only the engine it is handed.
 *
 * `undefined` EXACTLY WHERE THE RECORD HAS NO MODEL, AND DECIDED WITHOUT AN `await`, so the alarm can tell a Worker with
 * nothing to answer from one whose engine is still to be built. The test is `workerSlashModel`'s, the one `/api/version`'s
 * `slash` and the record's `delivers` read (`recordDelivers` in `deliver.ts`), so a digest is never queued for two
 * sentences on a Worker that cannot write them.
 *
 * THE ENGINE IS `workerSlashEngine`'s, BUILT ONCE ON THE FIRST JOB, as `workerSlashAnswers` builds its own: the same
 * `slash_settings` and `slash_call` tables in the same storage, so a job's ledger row sits beside every ask's, and the
 * operator's monthly ceiling counts it. A build that throws is let go, so the next pass builds again. On an endpoint the
 * key is opened as `system`, which `wireOf` in `slash.ts` keeps for callers with nobody asking, and a model job has nobody.
 *
 * THE PACKAGE IS STILL IMPORTED ONLY BEHIND THE REFUSAL (`46 §5.1`): `workerSlashEngine` imports it, and nothing here
 * calls that before a job is leased.
 */

import type { ModelJobInference } from '@braindog/host/slash-answers';
import type { RecordApi } from '@braindog/record';
import type { Slash } from '@braindog/slash';

import { workerSlashEngine, workerSlashModel, type SlashEngineDeps, type SlashEnv } from './slash.ts';

export function workerModelJobs(env: SlashEnv, api: () => RecordApi, deps: SlashEngineDeps): ModelJobInference | undefined {
  if (workerSlashModel(env, api, { ...deps, store: () => deps.sql }) === undefined) return undefined;
  let built: Promise<Slash | undefined> | null = null;
  const engine = async (): Promise<Slash> => {
    const slash = await (built ??= workerSlashEngine(env, api, deps).catch((e: unknown) => {
      built = null;
      throw e;
    }));
    /* NOT REACHABLE WHILE THE TEST ABOVE HOLDS, and a thrown sentence is the pass's failed ack rather than an answer. */
    if (slash === undefined) throw new Error('Slash has no model on this Worker to answer with.');
    return slash;
  };
  return {
    draft: async (samples) => (await engine()).draftPattern(samples),
    prose: async (digest) => (await engine()).digestProse(digest),
  };
}
