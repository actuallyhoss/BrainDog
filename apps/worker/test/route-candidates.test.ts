/**
 * The Cloud's route (ENG-A06 job 5): "Rules are the fallback, not the engine." (D35.43)
 *
 * `includedCandidates` says what the Cloud may try for an ask on the included model, and `workerSlashEngine` hands
 * `routeFor`'s answer to the engine, so when the included model fails the next model the operator set is asked before the
 * rules speak. The larger model stays off whatever `SLASH_LARGE` says (HD.463), because the table names no large row, and
 * the operator's second provider is a candidate only when all four of its settings are set.
 *
 * EVERY MODEL HERE IS A LOCAL FUNCTION: the binding is a fake and the second provider's address is a fake `send`. No
 * test spends a neuron or leaves the machine, and the key is an invented string.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { routeFor } from '@braindog/host/infer';
import { createRecordApi } from '@braindog/record';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { includedCandidates, includedRoute, workerSlashEngine } from '../src/slash.ts';

const FALLBACK_URL = 'https://models.example.test/v1';
const FALLBACK_KEY = 'fallback-key-for-this-test-only';
const OWNER = { principal: { kind: 'person' as const, id: 'p_owner', level: 'owner' as const } };
const PREDICATE = '{"registers":["tasks"],"where":{"field":"state","is":"open"},"q":null}';
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
      { id: 'state', type: 'enum', values: ['open', 'done'] },
    ],
    state: 'state',
    done: ['done'],
  } as never,
};

/** Workers AI's `run`, throwing where it is told to, and answering the predicate in the chat shape otherwise. */
const fakeAi = (fail: boolean) => {
  const runs: string[] = [];
  return {
    runs,
    AI: {
      run: async (model: string) => {
        runs.push(model);
        if (fail) throw new Error('the upstream did not answer in time');
        return { choices: [{ message: { role: 'assistant', content: PREDICATE }, finish_reason: 'stop' }], usage: { prompt_tokens: 700, completion_tokens: 60 } };
      },
    },
  };
};

const included = (ai = fakeAi(false)) => ({ AI: ai.AI, AI_GATEWAY: 'braindog', SLASH_INCLUDED: 'yes' });
const FALLBACK = {
  SLASH_FALLBACK_URL: FALLBACK_URL,
  SLASH_FALLBACK_MODEL: 'second-chat-model',
  SLASH_FALLBACK_PROVIDER: 'openai',
  SLASH_FALLBACK_KEY: FALLBACK_KEY,
};

const ids = (env: Parameters<typeof includedCandidates>[0], purpose: 'ask' | 'plan' | 'automation' | 'pattern' | 'prose' = 'ask') => {
  const facts = includedCandidates(env);
  return facts === undefined ? undefined : routeFor(purpose, facts).candidates.map((c) => c.id);
};

test('NO INCLUDED MODEL, NO FACTS: AI unbound, or bound and not switched on, names no route', () => {
  assert.equal(includedCandidates({ SLASH_INCLUDED: 'yes', ...FALLBACK }), undefined, 'a route with no binding');
  assert.equal(includedCandidates({ AI: fakeAi(false).AI, ...FALLBACK }), undefined, 'the binding alone switched the route on');
  assert.equal(includedRoute({ SLASH_INCLUDED: 'yes' }), undefined);
});

test('THE INCLUDED MODEL ALONE: flash answers and nothing else is on the answering route', () => {
  const facts = includedCandidates(included());
  assert.ok(facts);
  assert.equal(facts.form, 'included');
  assert.equal(facts.models.flash?.model, 'glm-5.3-flash');
  assert.equal(facts.models.small?.model, 'llama-3.2-1b');
  assert.equal(facts.models.provider, undefined);
  assert.deepEqual([facts.large, facts.machine], [false, false]);
  assert.deepEqual(ids(included()), ['flash']);
  /* THE ROUTER PUTS THE SMALL ROW FIRST FOR PROSE, and flash after it. The engine walks no prose today (`digestProse` asks
     `PROSE`'s own model outside `core.run`), so this is the order a walk would take, and a pattern stays on flash alone. */
  assert.deepEqual(ids(included(), 'pattern'), ['flash']);
  assert.deepEqual(ids(included(), 'prose'), ['small', 'flash']);
});

test("THE OPERATOR'S SECOND PROVIDER IS SECOND, only when its three settings and its secret are all set", () => {
  const env = { ...included(), ...FALLBACK };
  assert.deepEqual(ids(env), ['flash', 'provider']);
  assert.equal(includedCandidates(env)?.models.provider?.model, 'second-chat-model');
  for (const gone of Object.keys(FALLBACK)) {
    const short = { ...env, [gone]: '' };
    assert.deepEqual(ids(short), ['flash'], `${gone} left empty still named the second provider`);
  }
  assert.deepEqual(ids({ ...env, SLASH_FALLBACK_PROVIDER: 'another' }), ['flash'], 'a provider shape this host has no wire for');
  /* AND THE KEY IS NOWHERE IN WHAT THE ROUTER IS HANDED: the facts name a model, never the secret. */
  assert.doesNotMatch(JSON.stringify(includedCandidates(env)), new RegExp(FALLBACK_KEY, 'u'));
});

test('SLASH_LARGE yes IS HIS YES AND STILL NAMES NO LARGER MODEL, because the table carries no large row', () => {
  const facts = includedCandidates({ ...included(), ...FALLBACK, SLASH_LARGE: 'yes' });
  assert.equal(facts?.large, true);
  assert.equal(facts?.models.large, undefined);
  for (const purpose of ['ask', 'plan', 'automation', 'pattern', 'prose'] as const) {
    assert.ok(!ids({ ...included(), SLASH_LARGE: 'yes' }, purpose)?.includes('large'), `${purpose} named a larger model`);
  }
  assert.equal(includedCandidates({ ...included(), SLASH_LARGE: 'no' })?.large, false);
});

test('THE INCLUDED MODEL FAILS AND THE SECOND ANSWERS: two calls, two rows, one ask counted, and the key on no row', async () => {
  const ai = fakeAi(true);
  const sent: { url: string; auth: string | null; model: unknown }[] = [];
  const send = async (input: URL, init: RequestInit): Promise<Response> => {
    const body = JSON.parse(String(init.body)) as { model?: unknown };
    sent.push({ url: String(input), auth: new Headers(init.headers).get('authorization'), model: body.model });
    const reply = { choices: [{ message: { role: 'assistant', content: PREDICATE }, finish_reason: 'stop' }], usage: { prompt_tokens: 650, completion_tokens: 50 } };
    return new Response(JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const clock = fixedClock(Date.UTC(2026, 9, 14, 9));
  const sql = openSqlite();
  const own = openSqlite();
  const api = await createRecordApi({ sql, clock });
  assert.ok((await api.kernel.install([TASKS])).ok);
  assert.ok((await api.create({ register: 'tasks', fields: { what: 'Send the quote', state: 'open' } }, OWNER)).ok);
  try {
    const engine = await workerSlashEngine({ ...included(ai), ...FALLBACK }, () => api, { sql: own, clock, send });
    assert.ok(engine, 'no engine over the included model');
    const read = (await engine.read('What is still open?', OWNER)) as { ok: boolean };
    assert.ok(read.ok, JSON.stringify(read));
    assert.deepEqual(ai.runs, ['@cf/zai-org/glm-5.3-flash'], 'the included model was asked once');
    assert.equal(sent.length, 1, 'the second provider was asked once');
    assert.equal(sent[0]?.url, `${FALLBACK_URL}/chat/completions`);
    assert.equal(sent[0]?.model, 'second-chat-model');
    assert.equal(sent[0]?.auth, `Bearer ${FALLBACK_KEY}`, 'the keyed wire carried the secret');
    const rows = own
      .all<{ model: string; status: string; code: string | null; spends: string; candidate: string | null }>(
        "SELECT model, status, code, spends, candidate FROM slash_call WHERE kind = 'read' ORDER BY rowid",
      )
      .map((r) => ({ ...r }));
    assert.deepEqual(rows, [
      { model: 'glm-5.3-flash', status: 'error', code: 'UNREACHABLE', spends: 'none', candidate: 'flash' },
      { model: 'second-chat-model', status: 'ok', code: null, spends: 'person', candidate: 'provider' },
    ]);
    assert.equal((engine.status() as { asks: { used: number } }).asks.used, 1, 'one question is one ask, whatever it took');
    const everything = JSON.stringify(own.all('SELECT * FROM slash_call'));
    assert.doesNotMatch(everything, new RegExp(FALLBACK_KEY, 'u'), 'the key reached the ledger');
  } finally {
    sql.close();
    own.close();
  }
});

test('A RECORD ON HIS OWN KEY WALKS NO ROUTE: his key failing asks neither the included model nor the second provider', async () => {
  const ai = fakeAi(false);
  const clock = fixedClock(Date.UTC(2026, 9, 14, 9));
  const sql = openSqlite();
  const own = openSqlite();
  const api = await createRecordApi({ sql, clock });
  assert.ok((await api.kernel.install([TASKS])).ok);
  let sent = 0;
  try {
    const engine = await workerSlashEngine({ ...included(ai), ...FALLBACK }, () => api, { sql: own, clock, send: async () => ((sent += 1), new Response('{}')) });
    assert.ok(engine);
    own.exec('UPDATE slash_settings SET tier = ?', 'b');
    const seen: string[] = [];
    const hisKey = {
      complete: async (call: { model: string }) => {
        seen.push(call.model);
        throw new Error('his provider did not answer');
      },
    };
    await engine.read('What is still open?', OWNER, hisKey as never);
    assert.equal(seen.length, 1, 'his key was asked once');
    assert.deepEqual([ai.runs.length, sent], [0, 0], 'his key fell to another model');
  } finally {
    sql.close();
    own.close();
  }
});

test('WITH NO SECOND PROVIDER THE ONE CALL IS AS IT WAS: the included model is asked once, then the rules speak', async () => {
  const ai = fakeAi(true);
  const clock = fixedClock(Date.UTC(2026, 9, 14, 9));
  const sql = openSqlite();
  const own = openSqlite();
  const api = await createRecordApi({ sql, clock });
  assert.ok((await api.kernel.install([TASKS])).ok);
  try {
    const engine = await workerSlashEngine(included(ai), () => api, { sql: own, clock, send: async () => assert.fail('nothing else may be asked') });
    assert.ok(engine);
    /* THE RULES SPEAK AFTER THE ONE MODEL ON THE ROUTE, as they always did: one run, one row, nothing else asked. */
    await engine.read('What is still open?', OWNER);
    assert.equal(ai.runs.length, 1, 'a route of one asked the same model twice');
    const rows = own
      .all<{ model: string; code: string | null; candidate: string | null }>("SELECT model, code, candidate FROM slash_call WHERE kind = 'read'")
      .map((r) => ({ ...r }));
    assert.deepEqual(rows, [{ model: 'glm-5.3-flash', code: 'UNREACHABLE', candidate: 'flash' }]);
  } finally {
    sql.close();
    own.close();
  }
});
