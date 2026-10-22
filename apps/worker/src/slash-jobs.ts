/**
 * What answers the record's model jobs on this Worker: `serveModelJobs`'s `deps.inference`, over Slash's own engine.
 *
 * THREE JOBS ON THE ENGINE, AND ALL ARE SLASH'S. An `infer.draft` is a pattern for messages nothing
 * parsed, drafted by `draftPattern`; an `infer.prose` is the two sentences above a digest, written by `digestProse`; an
 * `infer.embed` is the index's vectors, made by `embedTexts`, and a search's own words go the same way (`workerMeaning`). An
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
 * AND ON THE SAME FACTS AS EVERY ASK (ENG-A06): the engine is built with `includedRoute`, so a pattern is asked of the
 * candidates `routeFor('pattern', includedCandidates(env))` names, which today is the included model alone: the operator's
 * second provider is on the answering route only. A digest's prose is walked by `digestProse` itself, outside `core.run`:
 * `routeFor('prose')` names the flash model and the second model after it.
 *
 * THE PACKAGE IS STILL IMPORTED ONLY BEHIND THE REFUSAL (`46 §5.1`): `workerSlashEngine` imports it, and nothing here
 * calls that before a job is leased.
 */

import { backgroundMeter, queryVector, type ModelJobEmbed, type ModelJobEmbeddings } from '@braindog/host/model-jobs';
import type { Reads } from '@braindog/host/infer';
import type { ModelJobInference } from '@braindog/host/slash-answers';
import { understandingOver } from '@braindog/host/understand';
import { ok, type Result, type Sql } from '@braindog/ports';
import type { RecordApi } from '@braindog/record';
import type { Slash } from '@braindog/slash';

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
    draft: async (samples, waiting) => (await engine()).draftPattern(samples, waiting),
    prose: async (digest) => (await engine()).digestProse(digest),
    /* THROUGH THE ENGINE, OVER THE `AI` BINDING (ENG-B18): the engine's own model embeds with `aiInference`'s `embed`
       wherever that binding is bound (`slash.ts` `embedOver`), and `embedTexts` writes each call's `slash_call` row, so
       the month's embed count, the half-month rule and the vital signs read what was sent. It skipped the engine once,
       and the count read 0 whatever went out. Offered whenever the binding exists; absent, `infer.embed` is never
       leased (`@braindog/host/model-jobs`'s `ModelJobEmbed`). */
    embed: env.AI
      ? async (texts: readonly string[]): Promise<Result<ModelJobEmbeddings>> => {
          const got = await (await engine()).embedTexts(texts);
          return got.ok ? ok({ model: got.value.model, dims: got.value.dims, vectors: got.value.vectors }) : got;
        }
      : undefined,
    /* AND WHO IS WHO, over the record's own model and not the engine: the doubtful pairs of `infer.resolve` and the
       night's notes, each held in this object's ledger under `UNDERSTAND_ASK`, in the understanding share and under the
       operator's ceiling (`slash-meter.ts`). */
    ...understandingOver(model, workerUnderstandLedger(env, api, deps)),
  };
}

/**
 * A search's words as a vector on this Worker (ENG-B18), for the record's search by meaning: `queryVector` over the
 * engine's `embed` above and the background allowance this Durable Object's ledger counts (`backgroundMeter`), so a query
 * is one `slash_call` row of kind `embed`, asked only while his switch is on (`reads`) and the month has room past its
 * kept half, and kept a day. `now` is the Durable Object's clock, the wall's by default. `undefined` where the Worker cannot embed, and the search is by words.
 */
export function workerMeaning(jobs: ModelJobEmbed | undefined, sql: Sql, reads: Reads, now: () => number = () => Date.now()): ReturnType<typeof queryVector> {
  return queryVector({ embed: jobs?.embed, meter: backgroundMeter(sql), now, reads });
}
