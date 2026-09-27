/**
 * The model name and the key an owner's Slash setting names, reaching the endpoint through this host's door, over a
 * real socket. `loop/research-spark-routes.md` brief K1, and the app-level half of F1 and F2 that
 * `packages/host/test/slash.test.ts` holds one layer down.
 *
 * WHY THIS FILE EXISTS WHEN THE HOST PACKAGE ALREADY TESTS `slashNamedEngine` AND `slashByokOf`. Those tests call the
 * builders by hand. What they cannot say is that THIS app wraps its engine in the one and hands its door the other, and
 * both are one line in `src/slash.ts` that a refactor drops without a single host test going red. Measured on 22
 * September: with the `slashNamedEngine(...)` wrap removed from `slashEngineFor`, `packages/host/test/slash*.test.ts`
 * stayed 27 of 27 and the status case below failed on `glm-5.3-flash`, the package's short name, where `llama3` is what
 * this host runs.
 *
 * RED BEFORE K1'S DOOR, MEASURED THE SAME DAY: the tier `b` case failed at its settings POST with 501
 * `NOT_IN_THIS_BUILD`, "Slash cannot use a key of your own on this host yet.", because `slashDoor` handed
 * `slashAskDoor` no `byok` builder.
 *
 * NOTHING IS A DOUBLE BUT THE ENDPOINT. The key goes in through `/api/keys/put` as an owner's browser puts one in, which
 * seals it under this host's real key store as a vault grant; the setting names that grant's id; the propose opens it
 * through `keyOpener`, the same opener the `slash`-labelled key uses. So the bearer the endpoint sees is the value typed
 * into the key door and nothing written in this file stands in for the cipher. The operator's `SLASH_KEY` is set too,
 * because the claim is that it does not stand in for the owner's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openKeyStore, recordKeys } from '../src/keys.ts';
import { start } from '../src/server.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const OPERATOR = 'fake-operator-key';

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

const KEYS = {
  id: 'register.credentials',
  kind: 'register' as const,
  body: {
    id: 'credentials',
    name: 'Keys',
    title: 'label',
    fields: [
      { id: 'label', type: 'text', required: true, max: 120 },
      { id: 'opens', type: 'text', required: true, max: 280 },
      { id: 'value', type: 'secret' },
    ],
  } as never,
};

const DRAFT = '{"registers":["tasks"],"where":{"field":"state","is":"open"},"q":null}';
const PROPOSAL =
  '{"text":"Two tasks are open and {{ref:tasks#1}} is first.","body_kind":"rowset","body":{"register":"tasks","rows":[{"fields":{"what":"Chase the first"},"from":["tasks#1"]}]},"flagged":false}';

type Body = { ok: boolean; value?: Record<string, unknown>; refusal?: { code: string; fix: string } } | null;

async function stack() {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-slash-named-'));
  const serverKey = randomBytes(32).toString('base64url');
  const store = await openKeyStore(join(dir, 'kek.key'));
  /* A DRAFT AND THEN A PROPOSAL, alternately, which is `46 §5.4`'s two calls per propose with no `ask_id`. */
  const sent: RequestInit[] = [];
  const running = await start({
    file: join(dir, 'record.brain'),
    directory: join(dir, 'directory.sqlite'),
    port: 0,
    host: '127.0.0.1',
    token: serverKey,
    sessionKey: new Uint8Array(randomBytes(32)),
    keys: store,
    pollMs: 0,
    slash: {
      url: 'http://127.0.0.1:11434/v1/chat/completions',
      model: 'llama3',
      key: OPERATOR,
      send: async (_url, init) => {
        const content = sent.push(init) % 2 === 1 ? DRAFT : PROPOSAL;
        return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }], usage: { prompt_tokens: 700, completion_tokens: 60 } }), {
          status: 200,
        });
      },
    },
  });
  const port = (running.server.address() as { port: number }).port;
  const origin = `http://localhost:${port}`;

  const person = running.directory.person$('ada@example.com', 'Ada');
  assert.ok(person.ok);
  const owner = person.value.id;
  const made = await running.api.createRecord({
    id: REC,
    slug: 'the-studio',
    name: 'The Studio',
    tz: 'UTC',
    locale: 'en',
    owner: { id: owner, email: 'ada@example.com', name: 'Ada' },
    keys: await recordKeys(store, REC),
  });
  assert.ok(made.ok, JSON.stringify(made));
  assert.ok(running.directory.provision({ slug: 'the-studio', email: 'ada@example.com', record: REC }).ok);
  assert.ok((await running.api.kernel.install([TASKS, KEYS])).ok);
  for (const what of ['Invoice Acme', 'Invoice Beta'])
    assert.ok(running.api.kernel.create('tasks', { what, state: 'open' }, { actor: owner }).ok);

  const call = async (path: string, init: { body?: unknown; sid?: string; headers?: Record<string, string> } = {}) => {
    const method = init.body === undefined ? 'GET' : 'POST';
    const headers: Record<string, string> = {
      ...(method === 'POST' ? { 'content-type': 'application/json', origin } : { 'sec-fetch-site': 'same-origin' }),
      ...(init.sid === undefined ? {} : { cookie: `bd_s=${init.sid}` }),
      ...init.headers,
    };
    const res = await fetch(`${origin}${path}`, { method, headers, ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }) });
    const raw = await res.text();
    return { status: res.status, raw, body: (raw ? JSON.parse(raw) : null) as Body, headers: res.headers };
  };
  const signIn = async (): Promise<string> => {
    const out = await call('/auth/token', { body: { serverKey } });
    assert.equal(out.status, 200, out.raw);
    return /^bd_s=([A-Za-z0-9_-]{43});/.exec(out.headers.getSetCookie()[0] ?? '')?.[1] ?? assert.fail('no session cookie');
  };
  const model = (i: number) => (JSON.parse(String(sent[i]!.body)) as { model: string }).model;
  const bearer = (i: number) => (sent[i]!.headers as Record<string, string>).authorization;

  return {
    running,
    sent,
    call,
    signIn,
    model,
    bearer,
    async close() {
      await running.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test("STATUS NAMES WHAT THIS HOST SENDS: SLASH_MODEL on the included tier, the owner's own name once they choose one", async () => {
  const s = await stack();
  try {
    const sid = await s.signIn();
    const a = await s.call('/api/slash/status', { sid });
    assert.equal(a.status, 200, a.raw);
    assert.equal(a.body?.value?.['tier'], 'a');
    assert.equal(a.body?.value?.['model'], 'llama3', 'status named the package routing name, not what this host runs');

    /* `byo` NEEDS NO KEY OF THE OWNER'S, so it isolates the model name from the key: it goes out on the host's own route
       and the operator's key, under the name the owner typed. */
    const set = await s.call('/api/slash/settings', { sid, body: { tier: 'byo', model: 'gpt-4o-mini' } });
    assert.equal(set.status, 200, set.raw);
    assert.equal((await s.call('/api/slash/status', { sid })).body?.value?.['model'], 'gpt-4o-mini');
    const out = await s.call('/api/slash/propose', { sid, body: { question: 'Which tasks are open?' } });
    assert.equal(out.status, 200, out.raw);
    assert.equal(out.body?.value?.['body_kind'], 'rowset');
    /* THE DRAFT IS THE HOST'S OWN CALL on every tier, so it goes as `llama3`; the proposal is the owner's. */
    assert.deepEqual([s.model(0), s.model(1)], ['llama3', 'gpt-4o-mini']);
    assert.equal(s.bearer(1), `Bearer ${OPERATOR}`);
  } finally {
    await s.close();
  }
});

test('TIER b REACHES THE ENDPOINT WITH THE KEY THE OWNER PUT IN AND THE MODEL THE OWNER TYPED, and not SLASH_KEY or SLASH_MODEL', async () => {
  const s = await stack();
  try {
    const sid = await s.signIn();
    const value = ['bd_fake_slash_byok_', randomBytes(24).toString('hex')].join('');
    const put = await s.call('/api/keys/put', { sid, body: { label: 'OpenAI', opens: 'Slash on my own account', value } });
    assert.equal(put.status, 200, put.raw);
    const row = s.running.api.kernel.get(String(put.body?.value?.['credential'])) ?? assert.fail('the key row is not there');
    const grant = String(row.fields['value']);
    assert.match(grant, /^g_/u);

    const set = await s.call('/api/slash/settings', { sid, body: { tier: 'b', grant_id: grant, model: 'gpt-4o-mini' } });
    assert.equal(set.status, 200, set.raw);
    assert.equal((await s.call('/api/slash/status', { sid })).body?.value?.['model'], 'gpt-4o-mini');

    const out = await s.call('/api/slash/propose', { sid, body: { question: 'Which tasks are open?' } });
    assert.equal(out.status, 200, out.raw);
    assert.equal(out.body?.value?.['body_kind'], 'rowset');
    assert.equal(s.sent.length, 2);
    /* THE PROPOSAL CARRIES THE VALUE TYPED INTO THE KEY DOOR, opened from the vault by id, and the owner's model name. */
    assert.equal(s.bearer(1), `Bearer ${value}`);
    assert.equal(s.model(1), 'gpt-4o-mini');
    assert.ok(!String(s.sent[1]!.body).includes(value), 'the key went into what the model reads');
    /* THE DRAFT WENT ON THIS HOST'S OWN ROUTE: the operator's key and `SLASH_MODEL`. */
    assert.equal(s.bearer(0), `Bearer ${OPERATOR}`);
    assert.equal(s.model(0), 'llama3');
  } finally {
    await s.close();
  }
});
