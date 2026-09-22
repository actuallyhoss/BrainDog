/**
 * `sparkStatus`, `sparkSettings` and `sparkPropose`: the three doors beside `sparkRead`, and what each hands back.
 *
 * THE SAME RULE AS THE ASK, FOR THE SAME REASON. `packages/host/src/spark-ask.ts` answers every `authorization` header
 * 403 `NEEDS_BROWSER_SESSION`, so a member that sent the bearer this client holds would never be answered at all. What
 * these tests pin is that each member goes to its door's own path with the method that door takes, and never with a
 * bearer, and that a refusal comes back as the door wrote it rather than in a sentence of the client's.
 *
 * STATUS IS A GET WITH NO BODY, and that is the one that differs. `46 §5.2` has it as a GET, the palette fires it on
 * open to warm the engine, and a POST would carry a body the door does not read and an `Origin` the door does not need.
 *
 * WRITTEN BEFORE THE MEMBERS, and run against a client that had only `sparkRead`: every test below failed with
 * `TypeError: client.sparkStatus is not a function` or its two neighbours.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createClient, type SparkProposal, type SparkSettings, type SparkStatus } from '../src/index.ts';

type Sent = { url: string; init: RequestInit };

/** A client whose whole network is one canned answer, which also keeps what was asked of it. */
const answering = (status: number, body: unknown) => {
  const sent: Sent[] = [];
  const client = createClient({
    base: 'https://braindog.example',
    token: 'rec_x.a-token-these-doors-refuse',
    fetch: (async (url: string, init: RequestInit) => {
      sent.push({ url: String(url), init });
      return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    }) as typeof globalThis.fetch,
  });
  return { client, sent };
};

const STATUS: SparkStatus = { tier: 'a', model: 'glm-5.3-flash', asks: { used: 3, cap: 80, resets: '2026-10-01' } };
const SETTINGS: SparkSettings = { tier: 'a', model: null, grant_id: null, ask_cap: 5, updated_at: '2026-09-22T09:00:00.000Z' };
const PROPOSAL: SparkProposal = {
  text: 'Two tasks are open, {{tasks#1}} and {{tasks#2}}.',
  citations: ['tasks#1', 'tasks#2'],
  verbs: ['open'],
  body_kind: 'query',
  body: {},
  model: 'glm-5.3-flash',
  filed: null,
  read: [{ register: 'tasks', rows: 2, predicate: '{"field":"state","is":"open"}' }],
};

const headersOf = (s: Sent) => new Headers(s.init.headers);

test('sparkStatus IS A GET TO ITS OWN PATH, with no body and no bearer', async () => {
  const { client, sent } = answering(200, { ok: true, value: STATUS });
  assert.deepEqual(await client.sparkStatus(), { ok: true, value: STATUS });
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.url, 'https://braindog.example/api/spark/status');
  assert.equal(sent[0]!.init.method, 'GET');
  assert.equal(sent[0]!.init.body, undefined);
  assert.equal(headersOf(sent[0]!).get('authorization'), null, 'a bearer went to a door that refuses every bearer');
});

test('sparkSettings POSTS THE PATCH AS IT WAS GIVEN, and nothing else', async () => {
  const { client, sent } = answering(200, { ok: true, value: SETTINGS });
  assert.deepEqual(await client.sparkSettings({ ask_cap: 5 }), { ok: true, value: SETTINGS });
  assert.equal(sent[0]!.url, 'https://braindog.example/api/spark/settings');
  assert.equal(sent[0]!.init.method, 'POST');
  assert.equal(headersOf(sent[0]!).get('content-type'), 'application/json');
  assert.equal(headersOf(sent[0]!).get('authorization'), null);
  assert.deepEqual(JSON.parse(String(sent[0]!.init.body)), { ask_cap: 5 });
});

test('sparkPropose SENDS THE ask_id PASS 1 ANSWERED, and leaves it out when there is none', async () => {
  const { client, sent } = answering(200, { ok: true, value: PROPOSAL });
  assert.deepEqual(await client.sparkPropose('Which tasks are open?', '01M33H56ZCMM62YT38ARN8JRM8'), { ok: true, value: PROPOSAL });
  assert.equal(sent[0]!.url, 'https://braindog.example/api/spark/propose');
  assert.equal(sent[0]!.init.method, 'POST');
  assert.equal(headersOf(sent[0]!).get('authorization'), null);
  assert.deepEqual(JSON.parse(String(sent[0]!.init.body)), { question: 'Which tasks are open?', ask_id: '01M33H56ZCMM62YT38ARN8JRM8' });

  await client.sparkPropose('Which tasks are open?');
  assert.deepEqual(JSON.parse(String(sent[1]!.init.body)), { question: 'Which tasks are open?' });
});

test("EACH DOOR'S REFUSAL COMES BACK VERBATIM, because Settings and the palette draw it as the host wrote it", async () => {
  /* Each body is the one `packages/host/src/spark-ask.ts` or `packages/spark/src/index.ts` writes, copied rather than invented. */
  const owner = { code: 'FORBIDDEN', fix: 'Only the record owner changes how Spark is set up.' };
  assert.deepEqual(await answering(403, { ok: false, refusal: owner }).client.sparkSettings({ ask_cap: 0 }), { ok: false, refusal: owner });

  const stray = { code: 'FIELD_UNKNOWN', fix: 'bogus is not something this call takes. It takes tier, model, grant_id, ask_cap.', at: 'bogus', allowed: ['tier', 'model', 'grant_id', 'ask_cap'] };
  assert.deepEqual(await answering(422, { ok: false, refusal: stray }).client.sparkSettings({ bogus: 1 } as never), { ok: false, refusal: stray });

  const none = { code: 'NOT_IN_THIS_BUILD', fix: 'No model is configured behind Spark on this host, so it cannot read the record for you.' };
  assert.deepEqual(await answering(501, { ok: false, refusal: none }).client.sparkStatus(), { ok: false, refusal: none });

  const spent = { code: 'SPARK_BUDGET_SPENT', fix: 'Spark is out of asks until 2026-10-01. Add your own key, or wait.' };
  assert.deepEqual(await answering(422, { ok: false, refusal: spent }).client.sparkPropose('Which tasks are open?'), { ok: false, refusal: spent });
});

test('A HOP THAT ANSWERS SOMETHING ELSE IS UNREACHABLE AT THE GET TOO, through the same check every other call goes through', async () => {
  const out = await answering(200, { ok: true }).client.sparkStatus();
  assert.equal(out.ok === false && 'refusal' in out ? out.refusal.code : null, 'UNREACHABLE');
});
