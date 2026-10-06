/**
 * What answers the record's model jobs on this Worker: `serveModelJobs`'s `deps.inference`, over Slash's own engine.
 *
 * TWO JOBS ON THE ENGINE, AND BOTH ARE SLASH'S. An `infer.draft` is a pattern for messages nothing
 * parsed, drafted by `draftPattern`; an `infer.prose` is the two sentences above a digest, written by `digestProse`. An
 * `infer.resolve` and the nightly notes go to the record's own model through `understandingOver`. The
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

import type { ModelJobEmbed } from '@braindog/host/model-jobs';
import type { ModelJobInference } from '@braindog/host/slash-answers';
import { understandingOver } from '@braindog/host/understand';
import type { RecordApi } from '@braindog/record';
import type { Slash } from '@braindog/slash';

import { aiInference } from './inference.ts';
import { workerUnderstandLedger } from './slash-meter.ts';
import { workerSlashEngine, workerSlashModel, type SlashEngineDeps, type SlashEnv } from './slash.ts';

export function workerModelJobs(env: SlashEnv, api: () => RecordApi, deps: SlashEngineDeps): (ModelJobInference & ModelJobEmbed) | undefined {
  const model = workerSlashModel(env, api, { ...deps, store: () => deps.sql });
  if (model === undefined) return undefined;
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
    /* WORKERS AI, NOT THE SLASH ENGINE ABOVE: `embed` is `aiInference`'s own, over the `AI` binding
       this Worker holds platform-wide, so it is offered whenever that binding exists and never gated on a record's
       own Slash setup. Absent, `infer.embed` is never leased (`@braindog/host/model-jobs`'s `ModelJobEmbed`). */
    embed: env.AI ? async (texts: readonly string[]) => aiInference(env).embed(texts) : undefined,
    /* AND WHO IS WHO, over the record's own model and not the engine: the doubtful pairs of `infer.resolve` and the
       night's notes, each held in this object's ledger under `UNDERSTAND_ASK`, in the understanding share and under the
       operator's ceiling (`slash-meter.ts`). */
    ...understandingOver(model, workerUnderstandLedger(env, api, deps)),
  };
}
