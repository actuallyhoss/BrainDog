/**
 * A bearer's minute through the Worker: which key each bearer spends (`limitKey` in `packages/host/src/limits.ts`), which
 * binding it spends it on, and that a refused minute is a 429 before the record is asked.
 *
 * `front-doors.test.ts` HOLDS THE COOKIE'S MINUTE, and nothing held a bearer's. The key is decided from the context the
 * bearer door built (`bearerOf`), so a door that moves the check into the record has to come to the same key: the token's
 * own id for a key, its PARENT'S id for a child minted at the parent's scope (`verifyToken` answers the parent's id for
 * one, `packages/kernel/src/token.ts`), so the two share one minute, the child's own id for a child held to less, and the
 * approving person for an operation grant, who is the one spending it.
 *
 * THE BINDINGS ARE COUNTERS THAT NOTE EVERY KEY THEY ARE ASKED ABOUT and refuse past `most` in a run, as the platform's
 * binding refuses past its limit within its window: `RL_READ`, `RL_WRITE` and `RL_MCP`, each its own count.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { keyStoreOf, recordKeys } from '../src/keys.ts';
import { cloud, ORIGIN } from './cloud-harness.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const OWNER = 'ada@example.test';
const SLUG = 'studio';
/* A TEST KEY, MADE HERE AND NEVER A DEPLOYMENT'S. */
const KEK = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');

type Out = { ok: boolean; value?: any; refusal?: { code: string; fix: string } };

/** A rate-limit binding that counts each key, notes every ask, and refuses a key past `most`. */
function counter(name: string, asks: string[], most = Number.POSITIVE_INFINITY) {
  const spent = new Map<string, number>();
  return {
    spent,
    async limit({ key }: { key: string }) {
      asks.push(`${name} ${key}`);
      const n = (spent.get(key) ?? 0) + 1;
      spent.set(key, n);
      return { success: n <= most };
    },
  };
}

/** A record with a write key, the bindings counting, and the record object's `fetch` counted. */
async function counted(most = Number.POSITIVE_INFINITY) {
  const asks: string[] = [];
  const read = counter('read', asks, most);
  const write = counter('write', asks, most);
  const mcp = counter('mcp', asks, most);
  const c = await cloud({ KEK, RL_READ: read, RL_WRITE: write, RL_MCP: mcp });
  const store = (await keyStoreOf(KEK)) ?? assert.fail('no key store');
  const person = await c.provision(REC, SLUG, OWNER, { keys: await recordKeys(store, REC) });
  const cookie = await c.signIn(OWNER);
  const minted = (await (await c.ask('/api/createToken', { method: 'POST', cookie, body: JSON.stringify({ scope: 'write', label: 'agent' }) })).json()) as Out;
  assert.ok(minted.ok, JSON.stringify(minted));
  const object = c.record(REC) as any;
  const through = object.fetch.bind(object);
  const seen = { asked: 0 };
  object.fetch = (request: Request) => {
    seen.asked += 1;
    return through(request);
  };
  /* WHAT THE SIGN-IN AND THE MINT SPENT IS NOT THE BEARER'S, so the notes start here. */
  asks.length = 0;
  for (const b of [read, write, mcp]) b.spent.clear();
  return { c, person, cookie, object, seen, asks, bindings: { read, write, mcp }, token: { id: minted.value.id as string, bearer: minted.value.bearer as string } };
}

/** One JSON-RPC message to `/mcp`, as an agent sends it: a POST of JSON with its bearer and no `Origin`. */
const mcpCall = (c: Awaited<ReturnType<typeof cloud>>, bearer: string, message: object) =>
  c.bundle.default.fetch(
    new Request(`${ORIGIN}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, ...message }) }),
    c.env,
    { waitUntil: () => {} },
  );

test('A KEY SPENDS token:<its id>: a read on RL_READ, a write on RL_WRITE, and anything on /mcp on RL_MCP', async () => {
  const { c, token, asks } = await counted();
  assert.equal((await c.ask('/api/whoami', { bearer: token.bearer })).status, 200);
  const made = await c.ask('/api/create', { method: 'POST', bearer: token.bearer, body: JSON.stringify({ register: 'tasks', fields: { title: 'One' } }) });
  assert.notEqual(made.status, 429, await made.clone().text());
  /* WHICH TOOL IS INSIDE A BODY THE DOOR HAS NOT PARSED, so a listing and a write both spend the MCP budget. */
  assert.equal((await mcpCall(c, token.bearer, { method: 'tools/list' })).status, 200);
  await mcpCall(c, token.bearer, { method: 'tools/call', params: { name: 'create', arguments: { register: 'tasks', fields: { title: 'Two' } } } });
  const key = `token:${token.id}`;
  assert.deepEqual(asks, [`read ${key}`, `write ${key}`, `mcp ${key}`, `mcp ${key}`]);
});

test('A CHILD AT ITS PARENT’S SCOPE SPENDS ITS PARENT’S MINUTE, ON /api AND /mcp; ONE HELD TO LESS HAS ITS OWN', async () => {
  const { c, object, token, asks } = await counted();
  const same = (await object.mintChild(token.bearer, { minutes: 30 })) as Out;
  assert.ok(same.ok, JSON.stringify(same));
  const less = (await object.mintChild(token.bearer, { minutes: 30, scope: 'read' })) as Out;
  assert.ok(less.ok, JSON.stringify(less));
  assert.notEqual(same.value.id, token.id, 'the child is a row of its own');

  assert.equal((await c.ask('/api/whoami', { bearer: same.value.bearer })).status, 200);
  assert.equal((await mcpCall(c, same.value.bearer, { method: 'tools/list' })).status, 200);
  assert.equal((await c.ask('/api/whoami', { bearer: less.value.bearer })).status, 200);
  assert.deepEqual(asks, [`read token:${token.id}`, `mcp token:${token.id}`, `read token:${less.value.id}`]);
});

test('SO A PARENT THAT SPENT ITS MINUTE LEAVES ITS CHILD NONE: the child is 429 before the record is asked', async () => {
  const { c, object, seen, token } = await counted(2);
  const child = (await object.mintChild(token.bearer, { minutes: 30 })) as Out;
  assert.ok(child.ok, JSON.stringify(child));
  for (let i = 0; i < 2; i++) assert.equal((await c.ask('/api/whoami', { bearer: token.bearer })).status, 200);
  const asked = seen.asked;
  const out = await c.ask('/api/whoami', { bearer: child.value.bearer });
  const text = await out.text();
  assert.equal(out.status, 429, text);
  assert.equal((JSON.parse(text) as Out).refusal?.code, 'RATE_LIMITED');
  assert.equal(out.headers.get('retry-after'), '60');
  assert.equal(out.headers.get('cache-control'), 'no-store');
  assert.equal(seen.asked, asked, 'the record was asked for a caller over their minute');

  /* AND ON /mcp THE SAME, on its own budget: the parent's two tool listings leave the child's third refused. */
  for (let i = 0; i < 2; i++) assert.equal((await mcpCall(c, token.bearer, { method: 'tools/list' })).status, 200);
  const refused = await mcpCall(c, child.value.bearer, { method: 'tools/list' });
  const said = await refused.text();
  assert.equal(refused.status, 429, said);
  assert.equal((JSON.parse(said) as Out).refusal?.code, 'RATE_LIMITED', 'the /mcp 429 is the /api body, not JSON-RPC');
  assert.equal(seen.asked, asked + 2);
});

test('AN OPERATION GRANT SPENDS person:<the approver>, ON RL_WRITE, and never a token’s minute', async () => {
  const { c, person, cookie, object, asks } = await counted();
  const started = await object.deviceStart({ reach: 'export', label: 'test-box · braindog-cli' }, '203.0.113.7');
  const looked = (await (await c.ask('/api/deviceLook', { method: 'POST', cookie, body: JSON.stringify({ user_code: started.value.user_code }) })).json()) as Out;
  assert.ok(looked.ok, JSON.stringify(looked));
  const approved = await c.ask('/api/deviceApprove', { method: 'POST', cookie, body: JSON.stringify({ user_code: started.value.user_code, handle: looked.value.handle }) });
  assert.equal(approved.status, 200, await approved.clone().text());
  const polled = (await object.devicePoll({ device_code: started.value.device_code })) as Out;
  assert.ok(polled.ok, JSON.stringify(polled));
  /* THE OWNER'S OWN SESSION SPENT THE SAME KEY approving it, so the grant shares the minute of the person signed in. */
  assert.deepEqual(asks, [`write person:${person}`, `write person:${person}`]);

  asks.length = 0;
  const exported = await c.ask('/api/export', { method: 'POST', bearer: polled.value.bearer, body: '{}' });
  assert.equal(exported.status, 200, await exported.clone().text());
  assert.deepEqual(asks, [`write person:${person}`]);
});
