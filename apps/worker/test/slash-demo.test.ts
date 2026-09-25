/**
 * Nobody reaches a record without a credential: not through the router, and not at Slash's door inside the object.
 *
 * THERE WAS A PUBLIC DEMO, AND IT IS GONE (`loop/DIRECTION.md` 26, `loop/research-no-sample.md` A1). `DEMO_RECORD` named
 * one record that any GET with no `Authorization` header read as `p_demo` at `read`, uncredentialed. Production shipped
 * it empty, so the door was dark, but it was one `--var` away from open, and the app now shows only a real record. The
 * first test here is the one that went red against the Worker that still had it: a deployment that sets `DEMO_RECORD` to
 * a well-formed id answered `GET /api/boot` with no credential 200, from that record. Now it is the ordinary 401 and no
 * record is addressed, whatever the variable says, so an old deploy command that still carries it opens nothing.
 *
 * THE OBJECT'S OWN LOCK STAYS, because it was never only about the demo. It asked only `principal.kind` once, and the
 * demo's context, a person, was answered 200 with a Reading and one model call: on a live host, one opening of the
 * owner's `slash` key and one ask off the record's `ask_cap`, spent by somebody who never signed in
 * (`loop/research-batch-seventeen-audit.md` finding 5). `credentialed` is the field that says it. A session's context
 * is `credentialed: true` (`packages/host/src/auth.ts`), and a person context that says `false`, or leaves it out, was
 * not built by a sign-in and is refused before the model is called.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bundled, objectStorage } from './bundled-worker.ts';

const HOST = 'app.example.test';
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const URL_ = 'https://gateway.example.test/v1/chat/completions';
const FAKE_KEK = '0'.repeat(64);

/** A person context that no sign-in built: the shape the demo door used to forward, `p_demo` at `read`. */
const UNCREDENTIALED = { principal: { kind: 'person', id: 'p_demo', level: 'read' }, credentialed: false };

test('A DEPLOYMENT THAT STILL SETS DEMO_RECORD OPENS NOTHING: a GET with no credential is 401 and no record is addressed', async () => {
  const { default: worker } = await bundled();
  const addressed: string[] = [];
  const records = {
    idFromName: (n: string) => (addressed.push(n), n),
    get: () => ({ fetch: async () => new Response('{"ok":true,"value":{}}', { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }) }),
  };
  /* NO COOKIE AND NO BEARER, SO THE DIRECTORY HAS NOTHING TO BE ASKED, and a call to it would be a door this test does not know about. */
  const directory = new Proxy({}, { get: (_, name) => () => assert.fail(`the Directory was asked ${String(name)} for a request with no credential`) });
  const env = { PUBLIC_HOST: HOST, DEMO_RECORD: REC, RECORD: records, DIRECTORY: { idFromName: (n: string) => n, get: () => directory } };
  const answered: string[] = [];
  for (const path of ['/api/boot', '/api/list?register=tasks', '/api/schema?register=tasks']) {
    const out = await worker.fetch(new Request(`https://${HOST}${path}`), env, { waitUntil: () => {} });
    const code = /"code":"([A-Z_]+)"/.exec(await out.text())?.[1] ?? '-';
    answered.push(`${path} ${out.status} ${code}`);
  }
  assert.deepEqual(answered, ['/api/boot 401 UNAUTHORIZED', '/api/list?register=tasks 401 UNAUTHORIZED', '/api/schema?register=tasks 401 UNAUTHORIZED']);
  assert.deepEqual(addressed, [], 'a record was addressed for a request that carried no credential');
});

const hostedRecord = async () => {
  const { Record$ } = await bundled();
  const env = { PUBLIC_HOST: HOST, SLASH_ENDPOINT: URL_, KEK: FAKE_KEK, INGRESS: { send: async () => {} } };
  const state = { storage: objectStorage(), id: { toString: () => REC }, blockConcurrencyWhile: (f: () => unknown) => f(), waitUntil: () => {} };
  const object = new Record$(state, env);
  const made = await object.create({ id: REC, slug: 'studio', name: 'Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_owner', email: 'ada@example.test', name: 'Ada' } });
  assert.equal(made, null, `the record was not made: ${JSON.stringify(made)}`);
  return object;
};

/** A POST to the ask carrying the app's own origin and the context the router would have decided. */
const ask = (ctx: object) =>
  new Request(`https://${HOST}/api/slash/read`, {
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

test('A PERSON CONTEXT THAT SAYS IT IS NOT CREDENTIALED IS REFUSED AT THE OBJECT, and the model is not called', async () => {
  const object = await hostedRecord();
  const out = await withModel(() => object.fetch(ask(UNCREDENTIALED)));
  assert.equal(out.status, 403, `an uncredentialed person asked Slash and was answered ${out.status}: ${JSON.stringify(out.body)}`);
  assert.equal(out.body.refusal?.code, 'NEEDS_BROWSER_SESSION');
  assert.equal(out.body.refusal?.at, 'principal');
  assert.equal(out.calls, 0, 'the model was called for somebody who never signed in');
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
