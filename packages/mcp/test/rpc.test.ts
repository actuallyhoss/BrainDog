/**
 * The wire: one JSON-RPC message in, one reply out, over a stub surface that records every call.
 *
 * GOLDEN CASES, and the table of tools below is exhaustive on purpose: a tool added to `TOOLS` with
 * no row here fails, so nothing reaches an agent without a test saying which method it calls.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handle, METHODS, VERSIONS, type Reply } from '../src/rpc.ts';
import { INSTRUCTIONS } from '../src/instructions.ts';
import { TOOLS } from '../src/index.ts';
import { stub, type Ctx } from './stub.ts';

const ctx: Ctx = { who: 'agent' };
let n = 0;
const req = (method: string, params?: Record<string, unknown>) => ({ jsonrpc: '2.0', id: ++n, method, ...(params === undefined ? {} : { params }) });

const result = <T>(reply: Reply | null): T => {
  assert.ok(reply && 'result' in reply, JSON.stringify(reply));
  return reply.result as T;
};
const error = (reply: Reply | null) => {
  assert.ok(reply && 'error' in reply, JSON.stringify(reply));
  return reply.error;
};
type ToolResult = { content: { type: string; text: string }[]; isError?: boolean };
const said = (reply: Reply | null) => JSON.parse(result<ToolResult>(reply).content[0]!.text) as Record<string, unknown>;

/* ── the handshake ─────────────────────────────────────────────────────── */

test('initialize hands over the instructions and a version both sides speak', async () => {
  const { surface, calls } = stub();
  for (const asked of VERSIONS) {
    const r = result<{ protocolVersion: string; instructions: string; serverInfo: { name: string } }>(
      await handle(req('initialize', { protocolVersion: asked }), surface, ctx),
    );
    assert.equal(r.protocolVersion, asked, 'a supported version is not echoed');
    assert.equal(r.instructions, INSTRUCTIONS);
    assert.equal(r.serverInfo.name, 'braindog');
  }
  for (const params of [{ protocolVersion: '2024-11-05' }, {}])
    assert.equal(result<{ protocolVersion: string }>(await handle(req('initialize', params), surface, ctx)).protocolVersion, '2026-07-28');
  assert.equal(calls.length, 0, 'initialize read the record');
});

test('ping answers, and prompts are an empty list for now', async () => {
  const { surface } = stub();
  assert.deepEqual(result(await handle(req('ping'), surface, ctx)), {});
  assert.deepEqual(result(await handle(req('prompts/list'), surface, ctx)), { prompts: [] });
});

test('tools/list is the fourteen, with the instructions again and the read-only ones marked', async () => {
  const { surface, calls } = stub();
  const r = result<{ tools: { name: string; inputSchema: { type: string }; annotations?: { readOnlyHint: boolean } }[]; instructions: string; ttlMs: number }>(
    await handle(req('tools/list'), surface, ctx),
  );
  assert.equal(r.tools.length, 14);
  assert.deepEqual(r.tools.map((t) => t.name), TOOLS.map((t) => t.name));
  assert.equal(r.instructions, INSTRUCTIONS);
  assert.equal(r.ttlMs, 3_600_000);
  for (const t of r.tools) {
    assert.equal(t.inputSchema.type, 'object', t.name);
    assert.equal(t.annotations?.readOnlyHint === true, !TOOLS.find((x) => x.name === t.name)?.writes, `${t.name} says the wrong thing about writing`);
  }
  assert.equal(calls.length, 0, 'the tool list read the record, and it must always arrive');
});

/* ── every tool reaches its method ─────────────────────────────────────── */

const EACH: [tool: string, args: Record<string, unknown>, methods: string[], first?: unknown][] = [
  ['record_index', {}, ['boot', 'version']],
  ['context', {}, ['context'], {}],
  ['schema', { register: 'obligations' }, ['schema'], { register: 'obligations' }],
  ['get', { spoken: 'obligations#41' }, ['get'], { register: 'obligations', seq: 41 }],
  ['list', { register: 'obligations', where: { field: 'state', is: 'open' }, limit: 5 }, ['list'], { register: 'obligations', where: { field: 'state', is: 'open' }, limit: 5 }],
  ['search', { q: 'invoice' }, ['search'], { q: 'invoice' }],
  ['history', { spoken: 'obligations#41' }, ['history'], { register: 'obligations', seq: 41 }],
  ['governance', { status: 'all' }, ['governance'], { status: 'all' }],
  ['propose', { question: 'Keep it?', body_kind: 'options', body: {} }, ['propose'], { question: 'Keep it?', body_kind: 'options', body: {} }],
  ['create', { register: 'obligations', fields: { what: 'a' } }, ['create'], { register: 'obligations', fields: { what: 'a' } }],
  ['update', { spoken: 'obligations#41', patch: { what: 'b' }, version: 3 }, ['update'], { register: 'obligations', seq: 41, patch: { what: 'b' }, version: 3 }],
  ['log', { spoken: 'obligations#41', note: 'Chased.' }, ['update'], { register: 'obligations', seq: 41, patch: {}, note: 'Chased.' }],
  ['handoff', { next: 'Wire the self-host.', tried: 'Reading the cookie.' }, ['handoff'], { next: 'Wire the self-host.', tried: 'Reading the cookie.' }],
  ['meet', { name: 'Ada', where: 'commit 4464966 in braindog' }, ['meet'], { name: 'Ada', where: 'commit 4464966 in braindog' }],
];

test('EVERY TOOL REACHES THE RIGHT METHOD, with the context the transport handed over', async () => {
  assert.deepEqual(EACH.map(([name]) => name), TOOLS.map((t) => t.name), 'a tool has no golden case');
  for (const [name, args, methods, first] of EACH) {
    const { surface, calls } = stub();
    const reply = await handle(req('tools/call', { name, arguments: args }), surface, ctx);
    const r = result<ToolResult>(reply);
    assert.notEqual(r.isError, true, `${name}: ${r.content[0]?.text}`);
    assert.deepEqual(calls.map((c) => c.method), methods, name);
    for (const c of calls) assert.equal(c.ctx, ctx, `${name} did not hand the context on`);
    if (first !== undefined) assert.deepEqual(calls[0]?.args, first, name);
  }
});

test('a result is the value as compact JSON', async () => {
  const { surface } = stub();
  const r = result<ToolResult>(await handle(req('tools/call', { name: 'get', arguments: { spoken: 'obligations#41' } }), surface, ctx));
  assert.deepEqual(r.content, [{ type: 'text', text: '{"seq":41}' }]);
});

test('AN UNKNOWN TOOL, OR A NAME OFF Object.prototype, IS A REFUSAL and runs nothing', async () => {
  const { surface, calls } = stub();
  for (const name of ['frobnicate', 'constructor', 'toString', '__proto__', 'hasOwnProperty', 'pages', 'credentials', 'dry_run']) {
    const reply = await handle(req('tools/call', { name, arguments: {} }), surface, ctx);
    assert.equal(result<ToolResult>(reply).isError, true, name);
    const refusal = said(reply);
    assert.equal(refusal.code, 'ROUTE_UNKNOWN', name);
    assert.ok((refusal.allowed as string[]).includes('context'), name);
  }
  assert.equal(calls.length, 0);
});

/* ── refusals, conflicts and throws ────────────────────────────────────── */

test('a refusal is an error result carrying the refusal whole, so the model can correct the call', async () => {
  const { surface } = stub({
    list: async () => ({ ok: false, refusal: { code: 'REGISTER_UNKNOWN', fix: 'There is no register called invoices.', at: 'register', allowed: ['obligations'] } }),
  });
  const reply = await handle(req('tools/call', { name: 'list', arguments: { register: 'invoices' } }), surface, ctx);
  assert.equal(result<ToolResult>(reply).isError, true);
  assert.deepEqual(said(reply), { code: 'REGISTER_UNKNOWN', fix: 'There is no register called invoices.', at: 'register', allowed: ['obligations'] });
});

test('a conflict carries the current row and who changed it, in words without a dash', async () => {
  const { surface } = stub({ update: async () => ({ ok: false, conflict: { version: 5, current: { what: 'b' }, actor: 'person:sam' } }) });
  const reply = await handle(req('tools/call', { name: 'update', arguments: { spoken: 'obligations#1', patch: { what: 'c' }, version: 4 } }), surface, ctx);
  assert.equal(result<ToolResult>(reply).isError, true);
  const conflict = said(reply);
  assert.equal(conflict.code, 'VERSION_STALE');
  assert.deepEqual(conflict.current, { what: 'b' });
  assert.equal(conflict.version, 5);
  assert.match(String(conflict.fix), /^person:sam changed this row/);
  assert.doesNotMatch(String(conflict.fix), /—/);
});

test('A THROW IS -32603 AND A REFERENCE, and no exception text crosses the wire', async (t) => {
  const logged = t.mock.method(console, 'error', (..._: unknown[]) => {});
  const { surface } = stub({
    list: async () => {
      throw new Error('SQLITE_ERROR near /data/record.db: row value 4242');
    },
  });
  const reply = await handle(req('tools/call', { name: 'list', arguments: { register: 'obligations' } }), surface, ctx);
  const e = error(reply);
  assert.equal(e.code, -32603);
  assert.equal(e.message, 'internal');
  const ref = (e.data as { ref: string }).ref;
  assert.match(ref, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.doesNotMatch(JSON.stringify(reply), /SQLITE|record\.db|4242/);
  assert.ok(logged.mock.calls.some((c) => c.arguments.includes(ref)), 'the reference never reached the log, so nobody can find the error');
});

/* ── framing ───────────────────────────────────────────────────────────── */

test('A NOTIFICATION RETURNS NULL, and nothing runs for one', async () => {
  const { surface, calls } = stub();
  assert.equal(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' }, surface, ctx), null);
  assert.equal(
    await handle({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'create', arguments: { register: 'obligations', fields: {} } } }, surface, ctx),
    null,
  );
  /* And a reply from the client to a request this server never made is not answered either. */
  assert.equal(await handle({ jsonrpc: '2.0', id: 7, result: {} }, surface, ctx), null);
  assert.equal(calls.length, 0, 'a notification ran a write nobody will hear about');
});

test('the id is echoed exactly, including a zero and a string', async () => {
  const { surface } = stub();
  for (const id of [0, 'abc', 17]) {
    const reply = await handle({ jsonrpc: '2.0', id, method: 'ping' }, surface, ctx);
    assert.equal(reply?.id, id);
  }
});

test('a message that is not one request is -32600, and a batch is not accepted', async () => {
  const { surface, calls } = stub();
  const cases: [unknown, string | number | null][] = [
    [[req('ping'), req('ping')], null],
    ['ping', null],
    [null, null],
    [42, null],
    [{ jsonrpc: '2.0', id: {}, method: 'ping' }, null],
    [{ jsonrpc: '1.0', id: 3, method: 'ping' }, 3],
    [{ jsonrpc: '2.0', id: 4 }, 4],
    [{ jsonrpc: '2.0', id: 5, method: 7 }, 5],
  ];
  for (const [message, id] of cases) {
    const reply = await handle(message, surface, ctx);
    assert.equal(error(reply).code, -32600, JSON.stringify(message));
    assert.equal(reply?.id, id, JSON.stringify(message));
  }
  assert.equal(calls.length, 0);
});

test('an unknown method is -32601 and names the ones there are', async () => {
  const { surface } = stub();
  const e = error(await handle(req('sampling/createMessage'), surface, ctx));
  assert.equal(e.code, -32601);
  assert.deepEqual((e.data as { allowed: string[] }).allowed, [...METHODS]);
});

test('parameters of the wrong shape are -32602 and run nothing', async () => {
  const { surface, calls } = stub();
  for (const message of [
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: [] },
    req('tools/call', { arguments: {} }),
    req('tools/call', { name: 'list', arguments: ['obligations'] }),
    req('tools/call', { name: 'list', arguments: 'obligations' }),
    req('resources/read', {}),
  ])
    assert.equal(error(await handle(message, surface, ctx)).code, -32602, JSON.stringify(message));
  assert.equal(calls.length, 0);
});

/* ── resources ─────────────────────────────────────────────────────────── */

test('resources are listed, templated and read, with how long each may be held', async () => {
  const { surface } = stub();
  const listed = result<{ resources: { uri: string; mimeType: string }[] }>(await handle(req('resources/list'), surface, ctx));
  for (const uri of ['braindog:whoami', 'braindog:context', 'braindog:sessions/live', 'braindog:schema/obligations'])
    assert.ok(listed.resources.some((r) => r.uri === uri && r.mimeType === 'application/json'), uri);

  const templates = result<{ resourceTemplates: { uriTemplate: string }[] }>(await handle(req('resources/templates/list'), surface, ctx));
  assert.deepEqual(templates.resourceTemplates.map((t) => t.uriTemplate), [
    'braindog:schema/{register}',
    'braindog:page/{slug}',
    'braindog:metric/{id}',
    'braindog:skill/{name}',
  ]);

  const read = result<{ contents: { uri: string; text: string }[]; ttlMs: number }>(
    await handle(req('resources/read', { uri: 'braindog:schema/obligations' }), surface, ctx),
  );
  assert.deepEqual(read.contents[0], { uri: 'braindog:schema/obligations', mimeType: 'application/json', text: '{"fields":[]}' });
  assert.equal(read.ttlMs, 3_600_000);
});

test('a resource that is not there, or is refused, is -32002 with the sentence', async () => {
  const { surface } = stub({ whoami: async () => ({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'Not for this token.' } }) });
  const missing = error(await handle(req('resources/read', { uri: 'braindog:nothing' }), surface, ctx));
  assert.equal(missing.code, -32002);
  assert.match(missing.message, /There is nothing at braindog:nothing/);

  const refused = error(await handle(req('resources/read', { uri: 'braindog:whoami' }), surface, ctx));
  assert.equal(refused.code, -32002);
  assert.equal(refused.message, 'Not for this token.');
  assert.equal((refused.data as { refusal: { code: string } }).refusal.code, 'FORBIDDEN');
});
