/**
 * `slashStatus`, `slashSettings`, `slashAnswer`, `slashAsks` and `slashPattern`: the doors beside `slashRead`, and what each
 * hands back. `slashAnswer` was `slashPropose` until a rename; its door did not move.
 *
 * THE SAME RULE AS THE ASK, FOR THE SAME REASON. `packages/host/src/slash-ask.ts` answers every `authorization` header
 * 403 `NEEDS_BROWSER_SESSION`, so a member that sent the bearer this client holds would never be answered at all. What
 * these tests pin is that each member goes to its door's own path with the method that door takes, and never with a
 * bearer, and that a refusal comes back as the door wrote it rather than in a sentence of the client's.
 *
 * STATUS IS A GET WITH NO BODY, and that is the one that differs. `46 §5.2` has it as a GET, the palette fires it on
 * open to warm the engine, and a POST would carry a body the door does not read and an `Origin` the door does not need.
 *
 * WRITTEN BEFORE THE MEMBERS, and run against a client that had only `slashRead`: every test below failed with
 * `TypeError: client.slashStatus is not a function` or its two neighbours.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createClient, type SlashProposal, type SlashSettings, type SlashStatus } from '../src/index.ts';

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

const STATUS: SlashStatus = { tier: 'a', model: 'glm-5.3-flash', asks: { used: 3, cap: 80, resets: '2026-10-01' } };
const SETTINGS: SlashSettings = { tier: 'a', model: null, grant_id: null, ask_cap: 5, updated_at: '2026-09-22T09:00:00.000Z' };
const PROPOSAL: SlashProposal = {
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

test('slashStatus IS A GET TO ITS OWN PATH, with no body and no bearer', async () => {
  const { client, sent } = answering(200, { ok: true, value: STATUS });
  assert.deepEqual(await client.slashStatus(), { ok: true, value: STATUS });
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.url, 'https://braindog.example/api/slash/status');
  assert.equal(sent[0]!.init.method, 'GET');
  assert.equal(sent[0]!.init.body, undefined);
  assert.equal(headersOf(sent[0]!).get('authorization'), null, 'a bearer went to a door that refuses every bearer');
});

test('slashSettings POSTS THE PATCH AS IT WAS GIVEN, and nothing else', async () => {
  const { client, sent } = answering(200, { ok: true, value: SETTINGS });
  assert.deepEqual(await client.slashSettings({ ask_cap: 5 }), { ok: true, value: SETTINGS });
  assert.equal(sent[0]!.url, 'https://braindog.example/api/slash/settings');
  assert.equal(sent[0]!.init.method, 'POST');
  assert.equal(headersOf(sent[0]!).get('content-type'), 'application/json');
  assert.equal(headersOf(sent[0]!).get('authorization'), null);
  assert.deepEqual(JSON.parse(String(sent[0]!.init.body)), { ask_cap: 5 });
});

test('slashAnswer SENDS THE ask_id PASS 1 ANSWERED, and leaves it out when there is none', async () => {
  const { client, sent } = answering(200, { ok: true, value: PROPOSAL });
  assert.deepEqual(await client.slashAnswer('Which tasks are open?', '01M33H56ZCMM62YT38ARN8JRM8'), { ok: true, value: PROPOSAL });
  assert.equal(sent[0]!.url, 'https://braindog.example/api/slash/propose');
  assert.equal(sent[0]!.init.method, 'POST');
  assert.equal(headersOf(sent[0]!).get('authorization'), null);
  assert.deepEqual(JSON.parse(String(sent[0]!.init.body)), { question: 'Which tasks are open?', ask_id: '01M33H56ZCMM62YT38ARN8JRM8' });

  await client.slashAnswer('Which tasks are open?');
  assert.deepEqual(JSON.parse(String(sent[1]!.init.body)), { question: 'Which tasks are open?' });
});

test('slashSettings CARRIES HIS OWN KEY AS FOUR FIELDS, the key named by its grant and never its value', async () => {
  const { client, sent } = answering(200, { ok: true, value: SETTINGS });
  const patch = { source: 'key', provider: 'anthropic', base_url: null, model: 'claude-x', grant_id: '01M33H56ZCMM62YT38ARN8JRM8' } as const;
  await client.slashSettings(patch);
  assert.deepEqual(JSON.parse(String(sent[0]!.init.body)), patch);
});

test('slashAsks IS A GET WITH ITS limit IN THE QUERY, 20 when none is named, with no body and no bearer', async () => {
  const asks = { asks: [{ id: 'c1', ts: '2026-09-22T09:00:00.000Z', kind: 'read', status: 'ok', code: null, question: 'Which tasks?', model: 'glm-5.3-flash', filed: null }] };
  const { client, sent } = answering(200, { ok: true, value: asks });
  assert.deepEqual(await client.slashAsks(), { ok: true, value: asks });
  assert.equal(sent[0]!.url, 'https://braindog.example/api/slash/asks?limit=20');
  assert.equal(sent[0]!.init.method, 'GET');
  assert.equal(sent[0]!.init.body, undefined);
  assert.equal(headersOf(sent[0]!).get('authorization'), null);
  await client.slashAsks(50);
  assert.equal(sent[1]!.url, 'https://braindog.example/api/slash/asks?limit=50');
});

test('slashPattern POSTS THE ARRIVALS BY ID to its own door', async () => {
  const { client, sent } = answering(200, { ok: true, value: { ...PROPOSAL, body_kind: 'pattern' } });
  await client.slashPattern(['01M33H56ZCMM62YT38ARN8JRM8']);
  assert.equal(sent[0]!.url, 'https://braindog.example/api/slash/pattern');
  assert.equal(sent[0]!.init.method, 'POST');
  assert.equal(headersOf(sent[0]!).get('authorization'), null);
  assert.deepEqual(JSON.parse(String(sent[0]!.init.body)), { samples: ['01M33H56ZCMM62YT38ARN8JRM8'] });
});

test("EACH DOOR'S REFUSAL COMES BACK VERBATIM, because Settings and the palette draw it as the host wrote it", async () => {
  /* Each body is the one `packages/host/src/slash-ask.ts` or `packages/slash/src/index.ts` writes, copied rather than invented. */
  const owner = { code: 'FORBIDDEN', fix: 'Only the record owner changes how Slash is set up.' };
  assert.deepEqual(await answering(403, { ok: false, refusal: owner }).client.slashSettings({ ask_cap: 0 }), { ok: false, refusal: owner });

  const stray = {
    code: 'FIELD_UNKNOWN',
    fix: 'bogus is not something this call takes. It takes source, provider, base_url, model, grant_id, ask_cap, tier.',
    at: 'bogus',
    allowed: ['source', 'provider', 'base_url', 'model', 'grant_id', 'ask_cap', 'tier'],
  };
  assert.deepEqual(await answering(422, { ok: false, refusal: stray }).client.slashSettings({ bogus: 1 } as never), { ok: false, refusal: stray });

  const none = { code: 'NOT_IN_THIS_BUILD', fix: 'No model is configured behind Slash on this host, so it cannot read the record for you.' };
  assert.deepEqual(await answering(501, { ok: false, refusal: none }).client.slashStatus(), { ok: false, refusal: none });

  const spent = { code: 'SLASH_BUDGET_SPENT', fix: 'Slash is out of asks until 2026-10-01. Add your own key, or wait.' };
  assert.deepEqual(await answering(422, { ok: false, refusal: spent }).client.slashAnswer('Which tasks are open?'), { ok: false, refusal: spent });
});

test('A HOP THAT ANSWERS SOMETHING ELSE IS UNREACHABLE AT THE GET TOO, through the same check every other call goes through', async () => {
  const out = await answering(200, { ok: true }).client.slashStatus();
  assert.equal(out.ok === false && 'refusal' in out ? out.refusal.code : null, 'UNREACHABLE');
});
