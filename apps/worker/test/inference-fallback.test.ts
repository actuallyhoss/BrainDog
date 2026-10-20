/** A broken gateway, and the paths a model call falls back through. A stubbed binding and fetch: no neuron is spent. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { aiInference, runModel, type AiEnv, type AiOptions, type CompleteRequest } from '../src/inference.ts';

const ask: CompleteRequest = {
  model: 'llama-3.2-1b',
  messages: [{ role: 'user', content: 'Is this an invoice?' }],
  maxTokens: 64,
  schema: { type: 'object', properties: { kind: { type: 'string' } }, required: ['kind'], additionalProperties: false },
  budget: { neurons: 50 },
};
const GOOD = { response: '{"kind":"invoice"}', usage: { prompt_tokens: 3, completion_tokens: 3 } };
const GATEWAY_ERROR = 'AiError: 2001: gateway braindog not found';

const binding = (run: (options: AiOptions | undefined) => unknown): { seen: (AiOptions | undefined)[]; env: AiEnv } => {
  const seen: (AiOptions | undefined)[] = [];
  return {
    seen,
    env: {
      AI_GATEWAY: 'braindog',
      AI: {
        run: async (_m, _i, options) => {
          seen.push(options);
          return run(options);
        },
      },
    },
  };
};

test('A GATEWAY THAT THROWS IS RETRIED ONCE WITHOUT IT, and the retry answers', async () => {
  const { seen, env } = binding((o) => {
    if (o?.gateway) throw new Error(GATEWAY_ERROR);
    return GOOD;
  });
  const lines: string[] = [];
  const got = await aiInference(env, { log: (l) => lines.push(l) }).complete(ask);
  assert.ok(got.ok);
  assert.equal(seen.length, 2);
  assert.equal(seen[0]?.gateway?.id, 'braindog');
  assert.equal(seen[1]?.gateway, undefined);
  assert.equal(lines.length, 1);
  assert.match(lines[0] ?? '', /^ai: answered by binding-without-gateway/u);
});

test('WHEN BOTH BINDING CALLS THROW, THE REST ENDPOINT ANSWERS', async () => {
  const { env } = binding(() => {
    throw new Error(GATEWAY_ERROR);
  });
  const calls: { url: string; auth: string | null }[] = [];
  const fetchStub = (async (url: string, init: RequestInit) => {
    calls.push({ url, auth: new Headers(init.headers).get('authorization') });
    return new Response(JSON.stringify({ success: true, result: GOOD }), { status: 200 });
  }) as unknown as typeof fetch;
  const lines: string[] = [];
  const got = await aiInference({ ...env, AI_REST_URL: 'https://ai.example/run/', WORKERS_AI_TOKEN: 'tok' }, { fetch: fetchStub, log: (l) => lines.push(l) }).complete(ask);
  assert.ok(got.ok);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, 'https://ai.example/run/@cf/meta/llama-3.2-1b-instruct');
  assert.equal(calls[0]?.auth, 'Bearer tok');
  assert.equal(lines.length, 1);
  assert.match(lines[0] ?? '', /^ai: answered by rest/u);
});

test('BOTH THROW AND REST IS NOT CONFIGURED: A CLEAR REFUSAL, one fault line, no fetch', async () => {
  const { env } = binding(() => {
    throw new Error(GATEWAY_ERROR);
  });
  const lines: string[] = [];
  const fetchStub = (async () => assert.fail('no fetch without a token')) as unknown as typeof fetch;
  const got = await aiInference(env, { fetch: fetchStub, log: (l) => lines.push(l) }).complete(ask);
  assert.equal(got.ok, false);
  assert.equal(lines.length, 1);
  assert.match(lines[0] ?? '', /rest not configured.*WORKERS_AI_TOKEN/u);
});

test('A MODEL THE PLATFORM DOES NOT SERVE IS NOT RETRIED', async () => {
  const { seen, env } = binding(() => {
    throw new Error('No such model');
  });
  await assert.rejects(runModel(env, 'x', {}, { log: () => {} }));
  assert.equal(seen.length, 1);
});
