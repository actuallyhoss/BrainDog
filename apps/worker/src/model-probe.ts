/**
 * The daily model probe: one tiny call to each model Slash's included route walks, from the Worker's own cron.
 *
 * WHY IT EXISTS. Workers AI retired `glm-5.3-flash` on 20 November 2026 and nothing between deploys asked a model:
 * the model checks run by hand, every Slash test answers from a canned model, and the record objects' failures were
 * mailed as "the provider did not answer". A retirement is now caught the night it happens, by the line the alarm mail
 * already reads (`op: 'model'`), with the provider's own words in it.
 *
 * ONE CALL A MODEL A NIGHT, ABOUT TWENTY NEURONS TOGETHER: a fixed prompt holding nobody's content, a JSON answer of
 * one key, through the same adapter and gateway every Slash call takes (`aiInference`), so what is probed is the path
 * that answers. The ceiling below is checked before each call, as every call's is.
 *
 * A MODEL THAT ANSWERED BUT SAID IT IS GOING is a failure too: Workers AI may put a retirement notice beside an answer,
 * and the day it does is the day to know, not the day it stops. Any words of the kind outside the answer's text count.
 */

import { INCLUDED_FALLBACKS, INCLUDED_MODEL, inferenceDetail, REASONING_ROOM } from '@braindog/ports';

import { aiInference, scrubRaw, type AiBinding, type AiEnv } from './inference.ts';
import { opsAlert, type OpsEnv } from './mail.ts';
import { op, type OpValue } from './oplog.ts';

export type ProbeEnv = AiEnv & OpsEnv & { SLASH_INCLUDED?: string | undefined };

/** What one model's probe came to. */
export type Probed = { model: string; ok: boolean; ms: number; why?: string; raw?: string };

/** Where a failure is mailed: the ops alert, through the Directory's window in production. */
export type ProbeAlert = (fields: { op: 'model' } & Record<string, OpValue>) => Promise<unknown>;

const PROBE_MESSAGES = [
  { role: 'system' as const, content: 'You check that a model answers. Answer with one JSON object and nothing else.' },
  { role: 'user' as const, content: 'Answer {"ok": true}.' },
];
const PROBE_SCHEMA = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] };
/** A real call's ceiling (`REASONING_ROOM`), so a model that reasons is probed as it is asked; one that thinks not uses about ten. */
const PROBE_TOKENS = REASONING_ROOM;
/** The most one probe may spend: 600 tokens out on the dearest row is about 42 neurons. */
const PROBE_NEURONS = 100;

/** Words of a retirement, read outside the answer's own text. */
const GOING = /deprecat|retir|sunset|end of life|no longer (?:be )?(?:served|available|supported)/iu;

/** A retirement notice beside an answer, or `null`: the answer with its choices (the model's words) taken out, read whole. */
export const noticeIn = (answer: unknown): string | null => {
  if (answer === null || typeof answer !== 'object') return null;
  const { choices: _choices, response: _response, ...beside } = answer as Record<string, unknown>;
  const said = JSON.stringify(beside);
  return GOING.test(said) ? scrubRaw(said) : null;
};

/**
 * Ask each model of the included route once, in order. A model that failed or announced its retirement writes an
 * `op: 'model'` line at error level and is mailed (`alert`); one that answered writes an `op: 'model-probe'` line.
 * Never throws: it runs before the nightly walk and must not stand in its way.
 */
export async function probeModels(env: ProbeEnv, alert?: ProbeAlert): Promise<Probed[]> {
  const ai = env.AI;
  if (ai === undefined || env.SLASH_INCLUDED !== 'yes') return [];
  const out: Probed[] = [];
  for (const model of [INCLUDED_MODEL, ...INCLUDED_FALLBACKS]) {
    try {
      let answer: unknown;
      const seen: AiBinding = { run: async (id, inputs, options) => (answer = await ai.run(id, inputs, options)) };
      const t0 = Date.now();
      const got = await aiInference({ ...env, AI: seen }).complete({
        model,
        messages: PROBE_MESSAGES,
        maxTokens: PROBE_TOKENS,
        schema: PROBE_SCHEMA,
        budget: { neurons: PROBE_NEURONS },
      });
      const ms = Date.now() - t0;
      const notice = noticeIn(answer);
      if (got.ok && notice === null) {
        op({ op: 'model-probe', model, ok: true, ms });
        out.push({ model, ok: true, ms });
        continue;
      }
      const refusal = !got.ok && 'refusal' in got ? got.refusal : null;
      const detail = refusal === null ? {} : inferenceDetail(refusal);
      const why = got.ok ? 'the provider says it is retiring the model' : (detail.why ?? (refusal?.code === 'PROPOSAL_SCHEMA' ? 'schema' : (refusal?.code ?? 'conflict')));
      const raw = got.ok ? (notice ?? '') : (detail.raw ?? scrubRaw(refusal?.fix ?? ''));
      op({ op: 'model', probe: true, rec: null, model, why, raw: raw || null, ms, sent: true, whose: 'operator' }, 'error');
      out.push({ model, ok: false, ms, why, raw });
      await (alert ?? ((fields) => opsAlert(env, fields)))({ op: 'model', model, why, raw });
    } catch (e) {
      /* THE PROBE'S OWN FAULT, NOT THE MODEL'S, and still a line: a probe that broke is a night nobody looked. */
      op({ op: 'model-probe', model, ok: false, error: scrubRaw(e instanceof Error ? e.message : String(e)) }, 'error');
    }
  }
  return out;
}
