/**
 * The public demo at Spark's door, driven into a real `Record$`. `loop/research-batch-seventeen-audit.md` finding 5.
 *
 * THE OBJECT'S SECOND LOCK ASKED ONLY `principal.kind`. `DEMO_CONTEXT` (`src/route.ts`) is `p_demo` at `read`, and it
 * is a person, so the audit's context was answered 200 with a Reading and one call to the model: on a live host, one
 * opening of the owner's own `spark` key and one ask off the record's `ask_cap`, spent by somebody who never signed in.
 * What kept it shut was the router, because `demoRecord` admits a GET alone and the ask is a POST. That is one method
 * away from open, and the object is where the record decides who is asking, so it answers for itself.
 *
 * `credentialed` IS THE FIELD THAT SAYS IT. A session's context is `credentialed: true` (`packages/host/src/auth.ts`),
 * the demo's says `false` out loud, and `createToken` already refuses on it. A person context that leaves it out is
 * refused too: the two people the Worker forwards both say, so a context that says neither was not built by this host.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEMO_CONTEXT } from '../src/route.ts';
import { bundled, objectStorage } from './bundled-worker.ts';

const HOST = 'app.example.test';
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const URL_ = 'https://gateway.example.test/v1/chat/completions';
const FAKE_KEK = '0'.repeat(64);

const hostedRecord = async () => {
  const { Record$ } = await bundled();
  const env = { PUBLIC_HOST: HOST, SPARK_ENDPOINT: URL_, KEK: FAKE_KEK, INGRESS: { send: async () => {} } };
  const state = { storage: objectStorage(), id: { toString: () => REC }, blockConcurrencyWhile: (f: () => unknown) => f(), waitUntil: () => {} };
  const object = new Record$(state, env);
  const made = await object.create({ id: REC, slug: 'studio', name: 'Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_owner', email: 'ada@example.test', name: 'Ada' } });
  assert.equal(made, null, `the record was not made: ${JSON.stringify(made)}`);
  return object;
};

/** A POST to the ask carrying the app's own origin and the context the router would have decided. */
const ask = (ctx: object) =>
  new Request(`https://${HOST}/api/spark/read`, {
    method: 'POST',
    headers: { origin: `https://${HOST}`, 'content-type': 'application/json', 'x-braindog-ctx': JSON.stringify(ctx) },
    body: JSON.stringify({ question: 'Which tasks are open?' }),
  });

/** The model, answered here and counted, so a refusal is seen to have spent nothing. */
const withModel = async (run: () => Promise<Response>): Promise<{ status: number; body: { refusal?: { code: string; at?: string } }; calls: number }> => {
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    const content = '{"registers":[],"where":null,"q":"open"}';
    return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), { status: 200 });
  }) as typeof fetch;
  try {
    const out = await run();
    return { status: out.status, body: (await out.json()) as { refusal?: { code: string; at?: string } }, calls };
  } finally {
    globalThis.fetch = real;
  }
};

test("THE PUBLIC DEMO'S CONTEXT IS REFUSED AT THE OBJECT, and the model is not called", async () => {
  const object = await hostedRecord();
  const out = await withModel(() => object.fetch(ask(DEMO_CONTEXT)));
  assert.equal(out.status, 403, `the demo asked Spark and was answered ${out.status}: ${JSON.stringify(out.body)}`);
  assert.equal(out.body.refusal?.code, 'NEEDS_BROWSER_SESSION');
  assert.equal(out.body.refusal?.at, 'principal');
  assert.equal(out.calls, 0, 'the model was called for the demo');
});

test('A PERSON CONTEXT THAT DOES NOT SAY IT IS CREDENTIALED is refused the same way', async () => {
  const object = await hostedRecord();
  const out = await withModel(() => object.fetch(ask({ principal: { kind: 'person', id: 'p_owner', level: 'owner' } })));
  assert.equal(out.status, 403, JSON.stringify(out.body));
  assert.equal(out.calls, 0);
});

test('A SIGNED-IN PERSON STILL GETS THROUGH, or the lock would be a door shut on everybody', async () => {
  const object = await hostedRecord();
  const out = await withModel(() => object.fetch(ask({ principal: { kind: 'person', id: 'p_owner', level: 'owner' }, credentialed: true })));
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.equal(out.calls, 1);
});
