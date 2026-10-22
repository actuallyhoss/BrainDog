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

test('WHEN THE BINDING FAILS WITHOUT THE GATEWAY TOO, THE THROW AND THE LOG LEAD WITH WHAT IT SAID, the gateway\'s sentence behind it', async () => {
  const DIRECT = 'AiError: 5016: the terms of this model are not agreed';
  const { env } = binding((o) => {
    throw new Error(o?.gateway ? GATEWAY_ERROR : DIRECT);
  });
  const lines: string[] = [];
  await assert.rejects(runModel(env, 'x', {}, { log: (l) => lines.push(l) }), (e: Error) => e.message === `${DIRECT}; gateway said: ${GATEWAY_ERROR}`);
  assert.match(lines[0] ?? '', /gateway said: AiError: 2001.*binding said: AiError: 5016/u);
  /* THE SAME WORDS FROM BOTH ARE SAID ONCE. */
  const same = binding(() => {
    throw new Error(GATEWAY_ERROR);
  });
  await assert.rejects(runModel(same.env, 'x', {}, { log: () => {} }), (e: Error) => e.message === GATEWAY_ERROR);
});

test('WITH NO GATEWAY AND REST UNCONFIGURED, THE ONE PATH THROWS WHAT IT THREW, as it did', async () => {
  const boom = new Error('AiError: 3001: unknown');
  const env: AiEnv = { AI: { run: async () => Promise.reject(boom) } };
  await assert.rejects(runModel(env, 'x', {}, { log: () => {} }), (e: unknown) => e === boom);
});

test('WHEN REST FAILS TOO, ITS WORDS LEAD, then the paths before it, the same words once', async () => {
  const { env } = binding(() => {
    throw new Error(GATEWAY_ERROR);
  });
  const fetchStub = (async () => new Response(JSON.stringify({ success: false, errors: [{ code: 10000, message: 'Authentication error' }] }), { status: 403 })) as unknown as typeof fetch;
  const lines: string[] = [];
  await assert.rejects(
    runModel({ ...env, AI_REST_URL: 'https://ai.example/run/', WORKERS_AI_TOKEN: 'tok' }, 'x', {}, { fetch: fetchStub, log: (l) => lines.push(l) }),
    (e: Error) => e.message === `rest 403 [{"code":10000,"message":"Authentication error"}]; gateway said: ${GATEWAY_ERROR}`,
  );
  /* THE LOG NAMES EVERY PATH, so a reader never has to guess which one the words came from. */
  assert.equal(lines.length, 1);
  assert.match(lines[0] ?? '', /^ai: no path answered; gateway said: AiError: 2001.*; binding said: AiError: 2001.*; rest said: rest 403 /u);
});

test('A MODEL THE PLATFORM DOES NOT SERVE IS NOT RETRIED', async () => {
  const { seen, env } = binding(() => {
    throw new Error('No such model');
  });
  await assert.rejects(runModel(env, 'x', {}, { log: () => {} }));
  assert.equal(seen.length, 1);
});

test('A 5XX FROM THE GATEWAY IS THE GATEWAY: retried without it, where it was once thrown at once as the model\'s', async () => {
  const { seen, env } = binding((o) => {
    if (o?.gateway) throw new Error('AiError: 502 Bad Gateway');
    return GOOD;
  });
  const got = await aiInference(env, { log: () => {} }).complete(ask);
  assert.ok(got.ok);
  assert.equal(seen.length, 2);
  assert.equal(seen[1]?.gateway, undefined);
});

test('A RATE LIMIT IS STILL THE MODEL\'S, and no other path is asked', async () => {
  const { seen, env } = binding(() => {
    throw new Error('AiError: 429 Too Many Requests');
  });
  await assert.rejects(runModel(env, 'x', {}, { log: () => {} }));
  assert.equal(seen.length, 1);
});

test('AN ANSWER IN JSON MODE IS READ AS JSON: Workers AI hands `response` back as the parsed object', async () => {
  const { env } = binding(() => ({ response: { kind: 'invoice' }, usage: { prompt_tokens: 3, completion_tokens: 3 } }));
  const got = await aiInference(env, { log: () => {} }).complete(ask);
  assert.ok(got.ok, JSON.stringify(got));
  assert.deepEqual(JSON.parse(got.value.text), { kind: 'invoice' });
});
