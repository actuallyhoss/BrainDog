/**
 * Tier `byo`'s proposal is on this host's key, so it is held to `ask_cap` like the draft before it:
 * `loop/research-batch-thirty-four-audit.md` §3.
 *
 * WHAT THE AUDIT MEASURED, AND WHAT THIS FILE REPEATS. `slashGuardedEngine` let any propose on a stored `ask_id` through,
 * on the reason "its one call is on the owner's key". That is tier `b`. On `byo` the package proposes on `fallback`
 * (`packages/slash/src/propose.ts`, `s.tier === 'b' ? byok : fallback`), which is `SLASH_ENDPOINT` with `SLASH_KEY`, and
 * writes the row `kind = 'propose'`, which the host's count did not read. At `ask_cap: 1`, one read and five proposes on
 * its `ask_id` answered `200 200 200 200 200` on six model calls, all six on the operator key, with status reading 1 of 1.
 *
 * RED BEFORE THE REPAIR, measured on 22 September against the tree as it stood: the first case below answered
 * `proposes on the stored ask_id: 200 200 200; 4 model calls; status used 1`, and the second, four proposes sent
 * together at `ask_cap: 2` after the read, `200 200 200 200; 5 model calls`.
 *
 * THE LAST CASE IS THE LINE THE REPAIR MUST NOT CROSS: on tier `b` the proposal is the owner's key, and a propose on a
 * stored `ask_id` there still answers past a cap that the draft has used up.
 *
 * NO KEY IS PRINTED. A key is compared with `assert.ok(x === y)` and a message naming no value, as the byok file does.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { openKeyStore, recordKeys } from '../src/keys.ts';
import { start } from '../src/server.ts';

const MINUTE = 60_000;
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const OPERATOR = 'fake-operator-key';
const OWNER_MODEL = 'gpt-4o-mini';

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
  '{"text":"Two tasks are open and {{ref:tasks#1}} is first.","body_kind":"rowset","body":{"register":"tasks","rows":[{"what":"Chase {{ref:tasks#1}}"}]},"flagged":false}';

type Body = { ok: boolean; value?: Record<string, unknown>; refusal?: { code: string; fix: string; at?: string } } | null;

/** A self-host with an operator key, which is what tier `byo` is sent on here. */
async function stack() {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-slash-byo-'));
  const sessionKey = new Uint8Array(randomBytes(32));
  const store = await openKeyStore(join(dir, 'kek.key'));
  const sent: RequestInit[] = [];
  const running = await start({
    file: join(dir, 'record.brain'),
    directory: join(dir, 'directory.sqlite'),
    port: 0,
    host: '127.0.0.1',
    token: randomBytes(32).toString('base64url'),
    sessionKey,
    keys: store,
    pollMs: 0,
    slash: {
      url: 'http://127.0.0.1:11434/v1/chat/completions',
      model: 'llama3',
      key: OPERATOR,
      send: async (_url, init) => {
        sent.push(init);
        const content = String(init.body).includes('body_kind') ? PROPOSAL : DRAFT;
        return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }], usage: { prompt_tokens: 700, completion_tokens: 60 } }), {
          status: 200,
        });
      },
    },
  });
  const port = (running.server.address() as { port: number }).port;
  const origin = `http://localhost:${port}`;

  const ada = running.directory.person$('ada@example.com', 'Ada');
  assert.ok(ada.ok);
  const owner = ada.value.id;
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

  const sid = randomBytes(32).toString('base64url');
  const db = new DatabaseSync(join(dir, 'directory.sqlite'));
  try {
    const now = Date.now();
    db.prepare('INSERT INTO dir_session (id_hash, person, record, expires, rotated_at, authed_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(createHmac('sha256', sessionKey).update(`s:${sid}`).digest('hex'), owner, REC, now + 60 * MINUTE, now, now);
  } finally {
    db.close();
  }

  const call = async (path: string, body?: unknown) => {
    const res = await fetch(`${origin}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { cookie: `bd_s=${sid}`, ...(body === undefined ? { 'sec-fetch-site': 'same-origin' } : { origin, 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const raw = await res.text();
    return { status: res.status, raw, body: (raw ? JSON.parse(raw) : null) as Body };
  };

  const used = async (): Promise<number | undefined> => ((await call('/api/slash/status')).body?.value?.['asks'] as { used?: number } | undefined)?.used;
  const bearer = (init: RequestInit) => (init.headers as Record<string, string>).authorization;

  return {
    running,
    sent,
    call,
    used,
    bearer,
    async close() {
      await running.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const ASK = { question: 'Which tasks are open?' };

test('§3: ON TIER byo AT ask_cap 2, ONE PROPOSE ON THE STORED ask_id ANSWERS AND THE NEXT IS SLASH_BUDGET_SPENT', async () => {
  const s = await stack();
  try {
    const set = await s.call('/api/slash/settings', { tier: 'byo', model: OWNER_MODEL, ask_cap: 2 });
    assert.equal(set.status, 200, set.raw);

    const read = await s.call('/api/slash/read', ASK);
    assert.equal(read.status, 200, read.raw);
    const askId = read.body?.value?.['ask_id'];
    const outs = [];
    for (let i = 0; i < 3; i++) outs.push(await s.call('/api/slash/propose', { ...ASK, ask_id: askId }));
    const used = await s.used();

    const seen = `proposes on the stored ask_id: ${outs.map((o) => o.status).join(' ')}; ${s.sent.length} model calls; status used ${used}`;
    assert.deepEqual(
      outs.map((o) => o.body?.refusal?.code ?? o.status),
      [200, 'SLASH_BUDGET_SPENT', 'SLASH_BUDGET_SPENT'],
      seen,
    );
    assert.equal(s.sent.length, 2, seen);
    assert.ok(s.sent.every((init) => s.bearer(init) === `Bearer ${OPERATOR}`), 'a tier byo ask went out on a key other than the operator one');
    assert.equal(used, 2, seen);
  } finally {
    await s.close();
  }
});

test('§3: FOUR PROPOSES ON ONE ask_id SENT TOGETHER AT THE LAST ASK MAKE ONE MODEL CALL, because the hold is what the host counts', async () => {
  const s = await stack();
  try {
    assert.equal((await s.call('/api/slash/settings', { tier: 'byo', model: OWNER_MODEL, ask_cap: 2 })).status, 200);
    const read = await s.call('/api/slash/read', ASK);
    assert.equal(read.status, 200, read.raw);
    const askId = read.body?.value?.['ask_id'];

    const outs = await Promise.all([0, 1, 2, 3].map(() => s.call('/api/slash/propose', { ...ASK, ask_id: askId })));
    const statuses = outs.map((o) => o.status);
    const seen = `${statuses.join(' ')}; ${s.sent.length} model calls`;
    assert.deepEqual([...statuses].sort(), [200, 422, 422, 422], seen);
    assert.equal(s.sent.length, 2, seen);
    assert.equal(await s.used(), 2);
  } finally {
    await s.close();
  }
});

test("§3: ON TIER b A PROPOSE ON THE STORED ask_id STILL ANSWERS AT THE CAP, because that call is the owner's key", async () => {
  const s = await stack();
  try {
    const value = ['bd_fake_slash_byo_', randomBytes(24).toString('hex')].join('');
    const put = await s.call('/api/keys/put', { label: 'OpenAI', opens: 'Slash on my own account', value });
    assert.equal(put.status, 200, `the key was not put in: ${put.status}`);
    const row = s.running.api.kernel.get(String(put.body?.value?.['credential'])) ?? assert.fail('the key row is not there');
    const grant = String(row.fields['value']);
    const set = await s.call('/api/slash/settings', { tier: 'b', grant_id: grant, model: OWNER_MODEL, ask_cap: 1 });
    assert.equal(set.status, 200, set.raw);

    const read = await s.call('/api/slash/read', ASK);
    assert.equal(read.status, 200, read.raw);
    const out = await s.call('/api/slash/propose', { ...ASK, ask_id: read.body?.value?.['ask_id'] });
    assert.equal(out.status, 200, `a tier b proposal on the owner's key was stopped by the draft cap: ${out.status} ${out.body?.refusal?.code ?? ''}`);
    assert.equal(s.sent.length, 2);
    assert.ok(s.bearer(s.sent[1]!) === `Bearer ${value}`, "the proposal did not go on the owner's key");
    assert.ok(!out.raw.includes(value), 'the key came back in the answer');
  } finally {
    await s.close();
  }
});
