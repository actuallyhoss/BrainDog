/**
 * A retired model, a model that never answers, and the daily probe (24 November 2026).
 *
 * Workers AI retired `glm-5.3-flash` on 20 November: every call answered 410, `5028: ... was deprecated on 2026-11-20`,
 * and this host read it as "the provider did not answer", tried each call twice, paused ten minutes and asked again, and
 * nothing but the engine's own route had a second model. These hold the four answers to that: a retirement is not served
 * and is tried once, a call that does not start answering in time is let go, the record's own asks walk to the fallback,
 * and the cron's probe writes the line the alarm mail reads.
 *
 * EVERY MODEL HERE IS A LOCAL FUNCTION: no test spends a neuron or leaves the machine.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { INCLUDED_FALLBACKS, INCLUDED_MODEL, inferenceDetail } from '@braindog/ports';

import { aiInference, ROUTED } from '../src/inference.ts';
import { noticeIn, probeModels } from '../src/model-probe.ts';
import { includedModel } from '../src/slash.ts';

const providerOf = (name: string): string => ROUTED.find((r) => r.name === name)!.provider;
const PRIMARY = providerOf(INCLUDED_MODEL);
const SECOND = providerOf(INCLUDED_FALLBACKS[0]);
const RETIRED = `5028: AiError: Model has been deprecated: ${PRIMARY} was deprecated on 2026-11-20. See the model catalog for alternatives.`;

const ask = { model: INCLUDED_MODEL, messages: [{ role: 'user' as const, content: 'q' }], maxTokens: 64, schema: { type: 'object' }, budget: { neurons: 1_000 } };
const answer = (content: string) => ({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } });

/** A binding that says the included model is retired and answers every other model. */
const retiredFirst = () => {
  const runs: string[] = [];
  return {
    runs,
    AI: {
      run: async (model: string) => {
        runs.push(model);
        if (model === PRIMARY) throw new Error(RETIRED);
        return answer('{"ok":true,"lines":{},"pages":{}}');
      },
    },
  };
};

test('A RETIRED MODEL IS NOT SERVED AND IS ASKED ONCE: no second path through the binding, and its own words are kept', async () => {
  const ai = retiredFirst();
  const got = await aiInference({ AI: ai.AI, AI_GATEWAY: 'braindog' }, { log: () => {} }).complete(ask);
  assert.equal(got.ok, false);
  assert.deepEqual(ai.runs, [PRIMARY], 'the retired model was asked again without the gateway');
  const detail = inferenceDetail((got as { refusal: Parameters<typeof inferenceDetail>[0] }).refusal);
  assert.equal(detail.why, 'the provider does not serve it');
  assert.match(detail.raw ?? '', /^5028: AiError: Model has been deprecated/u);
});

test('A CALL THAT DOES NOT START ANSWERING IN TIME IS LET GO, once, and reads as no answer', async () => {
  const runs: unknown[] = [];
  const AI = {
    run: (_model: string, _inputs: Record<string, unknown>, options?: { signal?: AbortSignal }) => {
      runs.push(options?.signal);
      return new Promise<never>(() => {});
    },
  };
  const started = Date.now();
  const got = await aiInference({ AI, AI_GATEWAY: 'braindog' }, { log: () => {}, timeoutMs: 40 }).complete(ask);
  assert.ok(Date.now() - started < 2_000, 'the call waited past its clock');
  assert.equal(runs.length, 1, 'a model that is late was asked again on another path');
  assert.ok(runs[0] instanceof AbortSignal && runs[0].aborted, 'the late call was not aborted');
  const detail = inferenceDetail((got as { refusal: Parameters<typeof inferenceDetail>[0] }).refusal);
  assert.equal(detail.why, 'the provider did not answer');
  assert.match(detail.raw ?? '', /did not start answering in time/u);
});

test("THE RECORD'S OWN ASKS WALK TO THE FALLBACK: a headline on a retired model is answered by the next one", async () => {
  const ai = retiredFirst();
  const fails: { model: string; why: string; raw: string }[] = [];
  const model = includedModel({ AI: ai.AI, SLASH_INCLUDED: 'yes' }, (f) => fails.push(f));
  assert.ok(model?.headline);
  const said = await model.headline({ pages: [] } as never);
  assert.deepEqual(said, { lines: {}, pages: {}, ok: true });
  assert.deepEqual(ai.runs, [PRIMARY, SECOND]);
  assert.deepEqual(fails.map((f) => [f.model, f.why]), [[INCLUDED_MODEL, 'the provider does not serve it']]);
  assert.match(fails[0]!.raw, /5028/u);
});

test('THE DAILY PROBE ASKS EACH MODEL ONCE: a retirement is an op: model line and a mail with its words, an answer is a probe line', async () => {
  const ai = retiredFirst();
  const mailed: Record<string, unknown>[] = [];
  const lines: string[] = [];
  const log = console.log;
  const error = console.error;
  console.log = (line: string) => lines.push(String(line));
  console.error = (line: string) => lines.push(String(line));
  let probed;
  try {
    probed = await probeModels({ AI: ai.AI, AI_GATEWAY: 'braindog', SLASH_INCLUDED: 'yes' }, async (fields) => mailed.push(fields));
  } finally {
    console.log = log;
    console.error = error;
  }
  assert.deepEqual(ai.runs, [PRIMARY, SECOND]);
  assert.deepEqual(probed.map((p) => [p.model, p.ok]), [[INCLUDED_MODEL, false], [INCLUDED_FALLBACKS[0], true]]);
  assert.equal(mailed.length, 1);
  assert.equal(mailed[0]!['op'], 'model');
  assert.equal(mailed[0]!['model'], INCLUDED_MODEL);
  assert.equal(mailed[0]!['why'], 'the provider does not serve it');
  assert.match(String(mailed[0]!['raw']), /^5028: AiError/u);
  const ops = lines.flatMap((l) => {
    try {
      return [JSON.parse(l) as Record<string, unknown>];
    } catch {
      return [];
    }
  });
  assert.ok(ops.some((o) => o['op'] === 'model' && o['probe'] === true && o['model'] === INCLUDED_MODEL), JSON.stringify(ops));
  assert.ok(ops.some((o) => o['op'] === 'model-probe' && o['ok'] === true && o['model'] === INCLUDED_FALLBACKS[0]), JSON.stringify(ops));

  /* OFF WHERE THE INCLUDED MODEL IS OFF: nothing is asked. */
  assert.deepEqual(await probeModels({ AI: ai.AI }), []);
});

test('A RETIREMENT NOTICE BESIDE AN ANSWER IS READ, and the answer\'s own words are not', () => {
  assert.equal(noticeIn(answer('{"ok":true}')), null);
  assert.equal(noticeIn({ ...answer('this model is deprecated, said the model'), usage: {} }), null);
  assert.match(noticeIn({ ...answer('{"ok":true}'), messages: ['This model will be deprecated on 2027-01-15.'] }) ?? '', /deprecated on 2027-01-15/u);
});
