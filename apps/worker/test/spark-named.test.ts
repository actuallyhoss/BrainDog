/**
 * The model name and the key an owner's Spark setting names, reaching the endpoint through this Worker's own door.
 * `loop/research-spark-routes.md` brief K1, and the app-level half of F1 and F2 that `packages/host/test/spark.test.ts`
 * holds one layer down.
 *
 * WHY THIS FILE EXISTS WHEN THE HOST PACKAGE ALREADY TESTS `sparkNamedEngine` AND `sparkByokOf`. Those tests call the
 * builders by hand. What they cannot say is that THIS app wraps its engine in the one and hands its door the other, and
 * both are one line in `src/spark.ts` that a refactor drops without a single host test going red. Measured on 22
 * September: with the `sparkNamedEngine(...)` wrap removed from `workerSparkEngine`, `packages/host/test/spark*.test.ts`
 * stayed 27 of 27 and the status case below failed on `glm-5.3-flash`, the package's short name, where `llama3` is what
 * this deployment runs.
 *
 * RED BEFORE K1'S DOOR, MEASURED THE SAME DAY: the tier `b` case failed at its settings POST with 501
 * `NOT_IN_THIS_BUILD`, "Spark cannot use a key of your own on this host yet.", because `workerSparkDoor` handed
 * `sparkAskDoor` no `byok` builder. The owner could not choose their own key, so neither their key nor their model name
 * ever reached a provider.
 *
 * THE RECORD AND THE ENGINE ARE REAL; THE ENDPOINT AND THE KEY OPENER ARE DOUBLES, as in `spark.test.ts`. The grant is a
 * real vault row made through `bindGrant`, so `grants()` lists it and revoking it is the kernel's own revoke, and its
 * sealed bytes are three meaningless ones because opening is injected: what is under test is which grant is asked for,
 * not the cipher.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { serveSpark } from '@braindog/host';
import { createRecordApi } from '@braindog/record';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { workerSparkDoor } from '../src/spark.ts';

const URL_ = 'https://gateway.example.test/v1/chat/completions';
const ORIGIN = 'https://app.example.test';
const FAKE_KEK = '0'.repeat(64);
const OWNER = { principal: { kind: 'person' as const, id: 'p_owner', level: 'owner' as const } };
const keyOf = (id: string) => `fake-key-of-${id}`;

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'what',
    search: ['what'],
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'done'], required: true },
    ],
  } as never,
};

const DRAFT = '{"registers":["tasks"],"where":{"field":"state","is":"open"},"q":null}';
const PROPOSAL =
  '{"text":"Two tasks are open and {{ref:tasks#1}} is first.","body_kind":"rowset","body":{"register":"tasks","rows":[{"what":"Chase {{ref:tasks#1}}"}]},"flagged":false}';

/** An endpoint that answers a draft and then a proposal, over and over, and keeps every request it was sent. */
const endpoint = () => {
  const sent: RequestInit[] = [];
  return {
    sent,
    model: (i: number) => (JSON.parse(String(sent[i]!.body)) as { model: string }).model,
    bearer: (i: number) => (sent[i]!.headers as Record<string, string>).authorization,
    send: async (_url: URL, init: RequestInit) => {
      const content = sent.push(init) % 2 === 1 ? DRAFT : PROPOSAL;
      return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }], usage: { prompt_tokens: 700, completion_tokens: 60 } }), {
        status: 200,
      });
    },
  };
};

/** A real record with two open tasks and one vault grant that is NOT labelled `spark`, and this Worker's door over it. */
async function stack() {
  const clock = fixedClock(Date.UTC(2026, 8, 22, 9));
  const sql = openSqlite();
  const own = openSqlite();
  const api = await createRecordApi({ sql, clock });
  assert.ok((await api.kernel.install([TASKS])).ok);
  for (const what of ['Invoice Acme', 'Invoice Beta']) assert.ok((await api.create({ register: 'tasks', fields: { what, state: 'open' } }, OWNER)).ok);
  const bound = api.kernel.bindGrant(
    { label: 'openai', opens: 'api.openai.example', kind: 'api_token', ciphertext: new Uint8Array([1, 2, 3]), nonce: new Uint8Array([9, 8, 7]), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_2f' },
    'p_owner',
  );
  assert.ok(bound.ok, JSON.stringify(bound));
  const net = endpoint();
  const opened: string[] = [];
  const door = workerSparkDoor({ SPARK_ENDPOINT: URL_, SPARK_MODEL: 'llama3', KEK: FAKE_KEK }, () => api, {
    sql: own,
    clock,
    send: net.send,
    open: () => async (grant) => (opened.push(grant.id), keyOf(grant.id)),
  }, new Set([ORIGIN]));
  const call = async (route: string, body?: unknown) => {
    const request =
      body === undefined
        ? new Request(`${ORIGIN}/api/spark/${route}`, { headers: { 'sec-fetch-site': 'same-origin' } })
        : new Request(`${ORIGIN}/api/spark/${route}`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const res = await serveSpark(request, door, OWNER);
    const raw = await res.text();
    return { status: res.status, raw, value: (JSON.parse(raw) as { value?: Record<string, unknown> }).value ?? {} };
  };
  return { api, net, opened, grant: bound.value.id, call, close: () => (sql.close(), own.close()) };
}

test("STATUS NAMES WHAT THIS WORKER SENDS: SPARK_MODEL on the included tier, the owner's own name once they choose one", async () => {
  const s = await stack();
  const a = await s.call('status');
  assert.equal(a.status, 200, a.raw);
  assert.equal(a.value['tier'], 'a');
  assert.equal(a.value['model'], 'llama3', 'status named the package routing name, not what this deployment runs');

  /* `byo` NEEDS NO KEY OF THE OWNER'S, so it is the tier that isolates the model name from the key. The owner's name goes
     out as typed and the status says so; `SPARK_MODEL` is this host's answer for tier `a` and has no say here. */
  const set = await s.call('settings', { tier: 'byo', model: 'gpt-4o-mini' });
  assert.equal(set.status, 200, set.raw);
  assert.equal((await s.call('status')).value['model'], 'gpt-4o-mini');
  const out = await s.call('propose', { question: 'Which tasks are open?' });
  assert.equal(out.status, 200, out.raw);
  assert.equal(out.value['body_kind'], 'rowset');
  /* THE DRAFT IS THE HOST'S OWN CALL on every tier (`propose.ts` hands the owner's model to the proposal alone), so it goes
     as `llama3`; the proposal is the owner's. */
  assert.deepEqual([s.net.model(0), s.net.model(1)], ['llama3', 'gpt-4o-mini']);
  s.close();
});

test("TIER b REACHES THE ENDPOINT WITH THE GRANT ITS SETTING NAMES AND THE MODEL ITS OWNER TYPED", async () => {
  const s = await stack();
  const set = await s.call('settings', { tier: 'b', grant_id: s.grant, model: 'gpt-4o-mini' });
  assert.equal(set.status, 200, set.raw);
  assert.equal(set.value['grant_id'], s.grant);
  assert.equal((await s.call('status')).value['model'], 'gpt-4o-mini');

  const out = await s.call('propose', { question: 'Which tasks are open?' });
  assert.equal(out.status, 200, out.raw);
  assert.equal(out.value['body_kind'], 'rowset');
  assert.equal(s.net.sent.length, 2);
  /* THE PROPOSAL CARRIES THE NAMED GRANT'S KEY AND THE OWNER'S MODEL, and the key is on the header and nowhere in the body. */
  assert.equal(s.net.bearer(1), `Bearer ${keyOf(s.grant)}`);
  assert.equal(s.net.model(1), 'gpt-4o-mini');
  assert.ok(!String(s.net.sent[1]!.body).includes(keyOf(s.grant)), 'the key went into what the model reads');
  /* THE DRAFT WENT ON THIS HOST'S OWN ROUTE, which on a Worker is the vault's `spark` grant, and this vault has none, so it
     carried no key and opened nothing. One opening in all, and it was the owner's grant. */
  assert.equal(s.net.bearer(0), undefined);
  assert.equal(s.net.model(0), 'llama3');
  assert.deepEqual(s.opened, [s.grant]);

  /* REVOKED AFTER THE SETTING WAS SAVED: no adapter, so the package's own FORBIDDEN, and no proposal is sent. */
  assert.ok(s.api.kernel.revokeGrant(s.grant, 'p_owner').ok);
  const refused = await s.call('propose', { question: 'Which tasks are open?' });
  assert.equal(refused.status, 403, refused.raw);
  assert.match(refused.raw, /Your key is not open in this session/u);
  assert.equal(s.net.sent.length, 3, 'a proposal went out on a revoked grant');
  s.close();
});
