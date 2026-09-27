/**
 * The model name and the key an owner's Slash setting names, reaching the endpoint through this Worker's own door.
 * `loop/research-spark-routes.md` brief K1, and the app-level half of F1 and F2 that `packages/host/test/slash.test.ts`
 * holds one layer down.
 *
 * WHY THIS FILE EXISTS WHEN THE HOST PACKAGE ALREADY TESTS `slashNamedEngine` AND `slashByokOf`. Those tests call the
 * builders by hand. What they cannot say is that THIS app wraps its engine in the one and hands its door the other, and
 * both are one line in `src/slash.ts` that a refactor drops without a single host test going red. Measured on 22
 * September: with the `slashNamedEngine(...)` wrap removed from `workerSlashEngine`, `packages/host/test/slash*.test.ts`
 * stayed 27 of 27 and the status case below failed on `glm-5.3-flash`, the package's short name, where `llama3` is what
 * this deployment runs.
 *
 * RED BEFORE K1'S DOOR, MEASURED THE SAME DAY: the tier `b` case failed at its settings POST with 501
 * `NOT_IN_THIS_BUILD`, "Slash cannot use a key of your own on this host yet.", because `workerSlashDoor` handed
 * `slashAskDoor` no `byok` builder. The owner could not choose their own key, so neither their key nor their model name
 * ever reached a provider.
 *
 * THE RECORD AND THE ENGINE ARE REAL; THE ENDPOINT AND THE KEY OPENER ARE DOUBLES, as in `slash.test.ts`. The grant is a
 * real vault row made through `bindGrant`, so `grants()` lists it and revoking it is the kernel's own revoke, and its
 * sealed bytes are three meaningless ones because opening is injected: what is under test is which grant is asked for,
 * not the cipher.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { serveSlash } from '@braindog/host';
import { createRecordApi } from '@braindog/record';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { keyNamed } from '../../../packages/kernel/src/actions.ts';
import { workerSlashAnswers, workerSlashDoor } from '../src/slash.ts';

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
  '{"text":"Two tasks are open and {{ref:tasks#1}} is first.","body_kind":"rowset","body":{"register":"tasks","rows":[{"fields":{"what":"Chase the first"},"from":["tasks#1"]}]},"flagged":false}';

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

/** A real record with two open tasks and one vault grant that is NOT labelled `slash`, and this Worker's door over it. */
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
  const door = workerSlashDoor({ SLASH_ENDPOINT: URL_, SLASH_MODEL: 'llama3', KEK: FAKE_KEK }, () => api, {
    sql: own,
    clock,
    send: net.send,
    open: () => async (grant) => (opened.push(grant.id), keyOf(grant.id)),
  }, new Set([ORIGIN]));
  const call = async (route: string, body?: unknown) => {
    const request =
      body === undefined
        ? new Request(`${ORIGIN}/api/slash/${route}`, { headers: { 'sec-fetch-site': 'same-origin' } })
        : new Request(`${ORIGIN}/api/slash/${route}`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const res = await serveSlash(request, door, OWNER);
    const raw = await res.text();
    return { status: res.status, raw, value: (JSON.parse(raw) as { value?: Record<string, unknown> }).value ?? {} };
  };
  return { api, net, opened, grant: bound.value.id, call, close: () => (sql.close(), own.close()) };
}

test("STATUS NAMES WHAT THIS WORKER SENDS: SLASH_MODEL on the included tier, and byo is no tier this Worker runs", async () => {
  const s = await stack();
  const a = await s.call('status');
  assert.equal(a.status, 200, a.raw);
  assert.equal(a.value['tier'], 'a');
  assert.equal(a.value['model'], 'llama3', 'status named the package routing name, not what this deployment runs');

  /* `byo` IS NOT RUN ON THE CLOUD (`CLOUD_TIERS` in `src/slash.ts`): it names no address of the owner's, only a model name
     for this Worker's own endpoint. The save is refused in the engine's words, and the included tier answers on. The
     owner's own model name still reaches the endpoint on tier `b`, which the next case holds. */
  const set = await s.call('settings', { tier: 'byo', model: 'gpt-4o-mini' });
  assert.equal(set.status, 422, set.raw);
  assert.match(set.raw, /ENUM_VALUE_UNKNOWN/u);
  assert.equal((await s.call('status')).value['model'], 'llama3');
  const out = await s.call('propose', { question: 'Which tasks are open?' });
  assert.equal(out.status, 200, out.raw);
  assert.equal(out.value['body_kind'], 'rowset');
  assert.deepEqual([s.net.model(0), s.net.model(1)], ['llama3', 'llama3']);
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
  /* THE DRAFT WENT ON THIS HOST'S OWN ROUTE, which on a Worker is the vault's `slash` grant, and this vault has none, so it
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

/*
 * THE AUTOMATION'S GATE AND THE KEY PATH, ASKED ABOUT ONE VAULT. `workerSlashAnswers` refuses a rule's question before
 * anything is built when the vault holds no `slash` key, and the key path opens what `slashGrantOf` chooses. At
 * `afb3b1b2` the gate read the label and `revoked_at` alone, a third chooser beside the kernel's and the host's, so the two
 * could disagree about whether there was a key at all. SPK-3, the Worker's half.
 */

const ASK = { run: 'run_1', step: 0, rule: 'rate', question: 'What rate applies?', shape: 'number' as const };
const NOTE_UNDER_SLASH = "rule.rate asked Slash at step 1, and the key labelled slash in this record's vault is a note, not an API token, so nothing was sent and the run stopped there. Put your model key in the vault under slash as an API token.";

/** A real record with the given grants under `slash`, and this Worker's answer to an automation over it. */
async function asked(kinds: readonly ('api_token' | 'note' | 'password')[]) {
  const clock = fixedClock(Date.UTC(2026, 8, 22, 9));
  const sql = openSqlite();
  const own = openSqlite();
  const api = await createRecordApi({ sql, clock });
  const ids = kinds.map((kind) => {
    clock.advance(86_400_000);
    const bound = api.kernel.bindGrant(
      { label: 'slash', opens: 'gateway.example.test', kind, ciphertext: new Uint8Array([1, 2, 3]), nonce: new Uint8Array([9, 8, 7]), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_2f' },
      'p_owner',
    );
    assert.ok(bound.ok, JSON.stringify(bound));
    return bound.value.id;
  });
  const sent: (string | null)[] = [];
  const opened: string[] = [];
  const answer = workerSlashAnswers({ SLASH_ENDPOINT: URL_, KEK: FAKE_KEK }, () => api, {
    sql: own,
    clock,
    send: async (_url, init) => {
      sent.push(new Headers(init.headers).get('authorization'));
      return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '{"answer":4.25}' } }], usage: { prompt_tokens: 3, completion_tokens: 1 } }), { status: 200 });
    },
    open: () => async (grant) => (opened.push(grant.id), keyOf(grant.id)),
  });
  assert.ok(answer, 'a Worker with an endpoint and a KEK built no answer');
  return { api, sql, ids, sent, opened, answer, close: () => (sql.close(), own.close()) };
}

test("A NOTE UNDER slash IS NO KEY TO THE AUTOMATION'S GATE EITHER: refused by its kind, before the engine is built", async () => {
  const s = await asked(['note']);
  try {
    const out = await s.answer(ASK);
    /* RED AT `afb3b1b2`: the gate saw a live row labelled `slash` and let the question by, the key path chose nothing to
       open, `keyRequired` threw, and the run was told the key "would not open on this Worker", which sends an owner to put
       in again a key that was never there. The refusal and the ledger were the same; the sentence and the repair were not. */
    assert.ok(!out.ok && 'refusal' in out, JSON.stringify(out));
    assert.deepEqual({ code: out.refusal.code, fix: out.refusal.fix }, { code: 'FORBIDDEN', fix: NOTE_UNDER_SLASH });
    assert.deepEqual([s.opened, s.sent], [[], []], 'a note was opened or a question was sent');
  } finally {
    s.close();
  }
});

test("TWO TOKENS UNDER slash: THE AUTOMATION'S QUESTION GOES ON THE KEY A SCHEDULED ACTION NAMED slash WOULD SEND", async () => {
  const s = await asked(['api_token', 'api_token', 'note']);
  try {
    const out = await s.answer(ASK);
    assert.ok(out.ok, JSON.stringify(out));
    const action = keyNamed(s.sql, 'slash');
    /* THE NOTE IS THE NEWEST ROW and an action named `slash` would take it, as `packages/host/test/grant-named.test.ts`
       case 5 holds; among tokens the two agree, and that is the newer token. */
    assert.equal(action?.id, s.ids[2]);
    assert.deepEqual(s.opened, [s.ids[1]]);
    assert.deepEqual(s.sent, [`Bearer ${keyOf(s.ids[1]!)}`]);
  } finally {
    s.close();
  }
});
