/**
 * The first run's two doors, `POST /api/slash/setup` and `POST /api/slash/mapping`, over a real socket.
 *
 * WHAT WAS MISSING WAS THE WIRING, NOT THE ASK. The package drafted a setup and a mapping (`packages/slash/src/propose.ts`)
 * and no door reached either, so `/api/slash/setup` answered 404 and every first run quietly used the rules. These hold the
 * door to the engine the hosts build: a body goes through whole, one model call answers it, a key neither takes is refused
 * before a model is asked, an engine without the two answers in `NO_MODEL`'s words, and on `byo` the guard stops them where
 * it stops a question.
 */

import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { CallContext } from '@braindog/record';
import type { Result } from '@braindog/ports';

import { serveSlash, servesSlash, slashAskDoor, type SlashAskEngine } from '../src/index.ts';
import { endpointInference, slashGuardedEngine } from '../src/slash.ts';
import { createSlash } from '../../slash/src/index.ts';
import { DDL } from '../../slash/src/call.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
const NOW = Date.UTC(2026, 9, 2, 9);

const OFFER = {
  usecases: [{ id: 'business', title: 'Small business', summary: 'Your orders and stock.' }],
  modules: [{ id: 'money-core', name: 'Money', lists: [{ id: 'obligations', name: 'Bills and invoices', fields: ['what', 'amount', 'due'] }] }],
};
const SETUP = { said: 'I run a bakery and owe my flour supplier £400.', offer: OFFER, today: '2026-10-02' };
const SETUP_ANSWER = {
  name: null,
  summary: 'Your bakery and what you owe.',
  usecase: 'business',
  also: [],
  modules: ['money-core'],
  currency: 'GBP',
  heard: [{ phrase: 'a bakery', became: 'Small business' }],
  names: [],
  rows: [],
  draft: null,
};
const MAPPING = {
  file: 'bills.csv',
  columns: ['Description', 'Amount'],
  sample: [{ Description: 'Flour', Amount: '400.00' }],
  lists: [{ id: 'obligations', name: 'Bills and invoices', fields: [{ id: 'what', type: 'text' }, { id: 'amount', type: 'money' }] }],
};
const MAPPING_ANSWER = { list: 'obligations', fields: [{ column: 'Description', field: 'what' }], fixed: [], summary: 'Your bills.', name: null };

const completion = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }], usage: { prompt_tokens: 300, completion_tokens: 40 } }), { status: 200 });

/** The package's engine on its own SQLite, over an endpoint that answers `content` and counts what it was sent. */
function engineOver(content: string) {
  const own = openSqlite();
  const sent: string[] = [];
  const engine = createSlash({
    sql: own,
    clock: fixedClock(NOW),
    inference: endpointInference({ url: 'http://127.0.0.1:11434/v1/chat/completions', model: 'small', send: async (url) => (sent.push(url.href), completion(content)) }),
    record: { project: async () => ({ ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'none' } }), propose: async () => ({ ok: true, value: { id: 'x' } }) },
  });
  return { own, sent, engine };
}

/** A host on a real port with one branch, `servesSlash`, in front of the door. */
async function listen(t: TestContext, engine: () => Promise<SlashAskEngine<CallContext> | undefined>) {
  let port = 0;
  let door!: ReturnType<typeof slashAskDoor<CallContext>>;
  const server = createServer((req, res) => {
    void (async () => {
      const url = `http://127.0.0.1:${port}${req.url ?? '/'}`;
      const headers = Object.entries(req.headers).map(([k, v]): [string, string] => [k, Array.isArray(v) ? v.join(', ') : (v ?? '')]);
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const request = new Request(url, { method: req.method ?? 'GET', headers, ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) });
      const out = servesSlash(new URL(url).pathname) ? await serveSlash(request, door, owner) : new Response('{}', { status: 404 });
      res.writeHead(out.status, Object.fromEntries(out.headers));
      res.end(Buffer.from(await out.arrayBuffer()));
    })();
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  port = (server.address() as AddressInfo).port;
  const origin = `http://127.0.0.1:${port}`;
  door = slashAskDoor(new Set([origin]), engine);
  t.after(
    () =>
      new Promise<void>((done) => {
        server.closeAllConnections();
        server.close(() => done());
      }),
  );
  return origin;
}

type Answer = { status: number; body: { ok: boolean; value?: Record<string, unknown>; refusal?: { code: string; fix: string; at?: string } } };

async function post(origin: string, path: string, body: unknown): Promise<Answer> {
  const res = await fetch(`${origin}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as Answer['body'] };
}

test('A SETUP IS ONE MODEL CALL THROUGH THE DOOR, answered in the package shape and counted as an ask', async (t) => {
  const { own, sent, engine } = engineOver(JSON.stringify(SETUP_ANSWER));
  t.after(() => own.close());
  const origin = await listen(t, async () => engine as SlashAskEngine<CallContext>);
  const out = await post(origin, '/api/slash/setup', SETUP);
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.equal(out.body.value?.['usecase'], 'business');
  assert.deepEqual(out.body.value?.['modules'], ['money-core']);
  assert.equal(sent.length, 1);
  assert.equal(engine.status().asks.used, 1, 'the setup was not counted against the month');
});

test('A MAPPING IS ONE MODEL CALL THROUGH THE DOOR, into a list it was offered', async (t) => {
  const { own, sent, engine } = engineOver(JSON.stringify(MAPPING_ANSWER));
  t.after(() => own.close());
  const origin = await listen(t, async () => engine as SlashAskEngine<CallContext>);
  const out = await post(origin, '/api/slash/mapping', MAPPING);
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.equal(out.body.value?.['list'], 'obligations');
  assert.deepEqual(out.body.value?.['fields'], [{ column: 'Description', field: 'what' }]);
  assert.equal(sent.length, 1);
});

test('A KEY NEITHER TAKES IS REFUSED BY NAME, and no model is asked', async (t) => {
  const { own, sent, engine } = engineOver(JSON.stringify(SETUP_ANSWER));
  t.after(() => own.close());
  const origin = await listen(t, async () => engine as SlashAskEngine<CallContext>);
  const setup = await post(origin, '/api/slash/setup', { ...SETUP, question: 'x' });
  assert.equal(setup.status, 422);
  assert.equal(setup.body.refusal?.code, 'FIELD_UNKNOWN');
  assert.equal(setup.body.refusal?.at, 'question');
  const mapping = await post(origin, '/api/slash/mapping', { ...MAPPING, said: 'x' });
  assert.equal(mapping.body.refusal?.at, 'said');
  assert.equal(sent.length, 0);
});

test('A FIRST RUN BODY MAY BE LONGER THAN A QUESTION, up to its own limit', async (t) => {
  const { own, sent, engine } = engineOver(JSON.stringify(SETUP_ANSWER));
  t.after(() => own.close());
  const origin = await listen(t, async () => engine as SlashAskEngine<CallContext>);
  /* About 6 KB of offer: over a question's 4,000 bytes and well inside the first run's. */
  const usecases = Array.from({ length: 40 }, (_, i) => ({ id: `case-${i}`, title: `Use case ${i}`, summary: 'x'.repeat(100) }));
  const long = await post(origin, '/api/slash/setup', { ...SETUP, offer: { ...OFFER, usecases: [...OFFER.usecases, ...usecases] } });
  assert.equal(long.status, 200, JSON.stringify(long.body));
  const huge = await post(origin, '/api/slash/setup', { ...SETUP, said: 'x'.repeat(40_000) });
  assert.equal(huge.status, 400);
  assert.equal(huge.body.refusal?.code, 'BODY_MALFORMED');
  assert.equal(sent.length, 1);
});

test('AN ENGINE BUILT BEFORE THE FIRST RUN ANSWERS 501, which the first run reads as "use the rules"', async (t) => {
  const bare = { read: async () => ({ ok: true, value: null }), status: () => ({}), configure: () => ({ ok: true, value: null }), propose: async () => ({ ok: true, value: null }) } as SlashAskEngine<CallContext>;
  const origin = await listen(t, async () => bare);
  const out = await post(origin, '/api/slash/mapping', MAPPING);
  assert.equal(out.status, 501);
  assert.equal(out.body.refusal?.code, 'NOT_IN_THIS_BUILD');
});

test('ON byo THE GUARD STOPS BOTH WHERE IT STOPS A QUESTION, without calling through', async () => {
  const sql = openSqlite();
  for (const statement of DDL) sql.exec(statement);
  sql.exec("INSERT INTO slash_settings (singleton, tier, model, grant_id, ask_cap, updated_at) VALUES (1, 'byo', 'llama3:8b', NULL, 1, ?)", new Date(NOW).toISOString());
  sql.exec(
    "INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, predicate) VALUES ('c_0', ?, 'read', 'byo', 'llama3:8b', 10, 10, 0, 5, 'ok', '{}')",
    new Date(NOW - 60_000).toISOString(),
  );
  let reached = 0;
  const through = async (..._args: unknown[]): Promise<Result<unknown>> => (reached++, { ok: true, value: null });
  const engine = {
    status: () => ({}),
    read: through,
    propose: through,
    configure: (): Result<unknown> => ({ ok: true, value: null }),
    proposeSetup: through,
    proposeMapping: through,
  };
  const guarded = slashGuardedEngine(engine, { sql, clock: fixedClock(NOW), grants: () => [] });
  for (const out of [await guarded.proposeSetup(SETUP, owner), await guarded.proposeMapping(MAPPING, owner)])
    assert.equal(!out.ok && 'refusal' in out ? out.refusal.code : '', 'SLASH_BUDGET_SPENT');
  assert.equal(reached, 0);
  sql.close();
});
