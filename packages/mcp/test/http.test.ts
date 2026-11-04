/**
 * The HTTP transport over a stub surface: the order of its refusals, the headers that mirror the body, and
 * the three things it never does, which are read a stranger's body, keep a session, and answer a browser.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { gate, MAX_BODY_BYTES, serveMcp, unauthorized } from '../src/http.ts';
import { INSTRUCTIONS } from '../src/instructions.ts';
import { VERSIONS } from '../src/rpc.ts';
import { stub, type Ctx } from './stub.ts';

const ctx: Ctx = { who: 'agent' };
const AT = 'https://app.brain.dog/mcp';
const JSON_TYPE = { 'content-type': 'application/json' };
let n = 0;
const rpc = (method: string, params?: Record<string, unknown>) => ({ jsonrpc: '2.0', id: ++n, method, ...(params === undefined ? {} : { params }) });

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(AT, { method: 'POST', headers: { ...JSON_TYPE, ...headers }, body: typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body) });

type Wire = { jsonrpc: string; id: unknown; result?: Record<string, unknown>; error?: { message: string; data?: unknown } & Record<'code', number> };
const read = async (res: Response) => {
  const raw = await res.text();
  return { raw, wire: (raw ? JSON.parse(raw) : null) as Wire | null };
};

/** A body that counts every byte asked of it. `highWaterMark: 0`, so nothing is pulled until something reads. */
function watched(chunks: Uint8Array[] = []) {
  const seen = { pulls: 0, cancelled: false };
  const body = new ReadableStream<Uint8Array>(
    {
      pull(c) {
        seen.pulls += 1;
        const next = chunks.shift();
        if (next) c.enqueue(next);
        else c.close();
      },
      cancel() {
        seen.cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  return { body, seen };
}
const streamed = (body: ReadableStream<Uint8Array>, headers: Record<string, string> = {}) =>
  new Request(AT, { method: 'POST', headers: { ...JSON_TYPE, ...headers }, body, duplex: 'half' } as RequestInit);

/** A 2026-07-28 call, with every header that revision mirrors. */
const modern = (method: string, params: Record<string, unknown>, name?: string) =>
  post(rpc(method, { ...params, _meta: { 'io.modelcontextprotocol/protocolVersion': VERSIONS[0] } }), {
    'mcp-protocol-version': VERSIONS[0],
    'mcp-method': method,
    ...(name === undefined ? {} : { 'mcp-name': name }),
  });

/* ── what the request line and the headers alone decide ────────────────── */

test('ONLY A POST: every other method is 405 with Allow: POST, and nothing is asked', async () => {
  const { surface, calls } = stub();
  for (const method of ['GET', 'DELETE', 'PUT', 'PATCH', 'OPTIONS', 'HEAD']) {
    const res = await serveMcp(new Request(AT, { method }), surface, ctx);
    assert.equal(res.status, 405, method);
    assert.equal(res.headers.get('allow'), 'POST');
    /* WITH THE CODE AND THE SENTENCE EVERY OTHER DOOR ANSWERS A METHOD WITH, for a person who opened the address. */
    assert.deepEqual(await res.json(), { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: '/mcp takes a POST of one JSON-RPC message, with a bearer.' } });
  }
  assert.equal(calls.length, 0);
});

test('A PAGE IS NOT A CALLER: any Origin is 403, even this host\'s own, and nothing is asked', async () => {
  const { surface, calls } = stub();
  for (const origin of ['https://evil.example', 'https://app.brain.dog', 'null']) {
    const res = await serveMcp(post(rpc('ping'), { origin }), surface, ctx);
    assert.equal(res.status, 403, origin);
    assert.equal(await res.text(), '');
  }
  assert.equal(calls.length, 0);
});

test('415 FOR A BODY THAT IS NOT JSON BY ITS TYPE, and a parameter or a capital does not change the type', async () => {
  const { surface } = stub();
  for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data', 'application/jsonp'])
    assert.equal((await serveMcp(post(rpc('ping'), { 'content-type': type }), surface, ctx)).status, 415, type);
  /* A string body with no type of its own is sent as text/plain, which is what a hand-written request looks like. */
  assert.equal((await serveMcp(new Request(AT, { method: 'POST', body: JSON.stringify(rpc('ping')) }), surface, ctx)).status, 415);
  for (const type of ['application/json; charset=utf-8', 'Application/JSON']) {
    assert.equal(gate(post(rpc('ping'), { 'content-type': type })), null, type);
    assert.equal((await serveMcp(post(rpc('ping'), { 'content-type': type }), surface, ctx)).status, 200, type);
  }
});

/* ── the caller, before a byte of the body ─────────────────────────────── */

test('NOBODY IS 401 BEFORE A BYTE OF THE BODY IS READ, and the answer says one word', async () => {
  const { surface, calls } = stub();
  const { body, seen } = watched([new TextEncoder().encode('not even json')]);
  const res = await serveMcp(streamed(body, { 'content-length': String(MAX_BODY_BYTES * 8) }), surface, null);
  assert.equal(res.status, 401, 'an oversized claim was weighed before the caller was known');
  assert.equal(res.headers.get('www-authenticate'), 'Bearer');
  const { wire } = await read(res);
  assert.equal(wire?.id, null);
  assert.equal(wire?.error?.code, -32001);
  assert.equal(wire?.error?.message, 'UNAUTHORIZED');
  assert.deepEqual(Object.keys(wire?.error ?? {}), ['code', 'message']);
  assert.equal(seen.pulls, 0, 'the body was read before the caller was known');
  assert.equal(calls.length, 0);

  /* THE SAME ANSWER THE WORKER'S ROUTER GIVES, and the header checks still come first, as that router runs them. */
  assert.deepEqual(await read(unauthorized()), await read(await serveMcp(post(rpc('ping')), surface, null)));
  assert.equal((await serveMcp(new Request(AT), surface, null)).status, 405);
  assert.equal((await serveMcp(post('{}', { 'content-type': 'text/plain' }), surface, null)).status, 415);
});

test('413 ON THE CLAIM WITHOUT READING, AND ON THE BYTES AT THE FIRST ONE OVER', async () => {
  const { surface, calls } = stub();

  const claimed = watched([new Uint8Array(10)]);
  const res = await serveMcp(streamed(claimed.body, { 'content-length': String(MAX_BODY_BYTES + 1) }), surface, ctx);
  assert.equal(res.status, 413);
  assert.equal(await res.text(), '');
  assert.equal(claimed.seen.pulls, 0, 'a body its own length already refused was read');
  assert.equal(claimed.seen.cancelled, true, 'a refused body was left for nobody to drain');

  /* CHUNKED, WITH NO CLAIM AT ALL: a cap of 16 and chunks of 8, so the third chunk is the one over. */
  const flowing = watched([1, 2, 3, 4, 5].map(() => new TextEncoder().encode('        ')));
  const over = await serveMcp(streamed(flowing.body), surface, ctx, { maxBodyBytes: 16 });
  assert.equal(over.status, 413);
  assert.equal(flowing.seen.pulls, 3, 'reading went on past the byte that was over');
  assert.equal(flowing.seen.cancelled, true, 'the rest of the body was not refused');

  /* AND EXACTLY THE CAP IS NOT OVER IT. */
  const exact = JSON.stringify(rpc('ping'));
  assert.equal((await serveMcp(post(exact), surface, ctx, { maxBodyBytes: new TextEncoder().encode(exact).byteLength })).status, 200);
  assert.equal(calls.length, 0);
});

/* ── the message ───────────────────────────────────────────────────────── */

test('400: bytes that are not JSON are -32700, and so is text that is not UTF-8; a batch is -32600', async () => {
  const { surface, calls } = stub();
  for (const body of ['not json', '', '{"jsonrpc":', new Uint8Array([0x7b, 0xff, 0x7d])]) {
    const res = await serveMcp(post(body), surface, ctx);
    assert.equal(res.status, 400, String(body));
    const { wire } = await read(res);
    assert.equal(wire?.id, null);
    assert.equal(wire?.error?.code, -32700);
  }
  const batch = await serveMcp(post([rpc('ping'), rpc('ping')]), surface, ctx);
  assert.equal(batch.status, 400);
  assert.equal((await read(batch)).wire?.error?.code, -32600);
  assert.equal(calls.length, 0);
});

test('A NOTIFICATION IS 202 WITH NO BODY, AND NOTHING RUNS FOR IT; a reply from a client is the same', async () => {
  const { surface, calls } = stub();
  for (const message of [
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', method: 'tools/call', params: { name: 'create', arguments: { register: 'obligations', fields: {} } } },
    { jsonrpc: '2.0', id: 3, result: {} },
  ]) {
    const res = await serveMcp(post(message), surface, ctx);
    assert.equal(res.status, 202, JSON.stringify(message));
    assert.equal(res.headers.get('content-type'), null);
    assert.equal(await res.text(), '');
  }
  assert.equal(calls.length, 0, 'a notification ran a tool that nobody will hear from');
});

test('INITIALIZE, THEN A TOOL CALL: no session is minted, and one a client sends is ignored', async () => {
  const { surface, calls } = stub();
  const init = await serveMcp(post(rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } })), surface, ctx);
  assert.equal(init.status, 200);
  assert.equal(init.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(init.headers.get('mcp-session-id'), null);
  const r = (await read(init)).wire?.result as { protocolVersion: string; instructions: string };
  assert.equal(r.protocolVersion, '2025-06-18');
  assert.equal(r.instructions, INSTRUCTIONS);

  const call = await serveMcp(
    post(rpc('tools/call', { name: 'record_index', arguments: {} }), {
      'mcp-session-id': 'a-session-this-server-never-issued',
      'last-event-id': '7',
      'mcp-protocol-version': '2025-06-18',
      'mcp-method': 'tools/call',
      'mcp-name': 'record_index',
    }),
    surface,
    ctx,
  );
  assert.equal(call.status, 200);
  assert.equal(call.headers.get('mcp-session-id'), null);
  /* THE WHOLE ANSWER IS `structuredContent`, and the text beside it is the brief one a model reads first. */
  const result = (await read(call)).wire?.result as { content: { text: string }[]; structuredContent: unknown };
  assert.deepEqual(result.structuredContent, { registers: [{ id: 'obligations', name: 'Obligations' }], version: 41 });
  assert.match(result.content[0]!.text, /^This BrainDog · 1 list\b/u);
  assert.deepEqual(calls.map((c) => c.method), ['boot', 'version']);
  assert.ok(calls.every((c) => c.ctx === ctx), 'the tools were not handed the host\'s context');
});

test('THE APP A CLIENT SAYS IT IS REACHES THE HOST WITH EVERY CALL, with or without the session it says it is in', async () => {
  /* A 2026-07-28 CLIENT NAMES ITSELF ON EVERY REQUEST, in `_meta`, since there is no initialize to remember it from. A
     run is said as the app it is ("Claude Code on MacBook"), so the host is handed `client` and `client_version` even
     when the caller sends no `_meta.session`, and beside that session's own keys when it does, which win. */
  const { surface } = stub();
  const handed: unknown[] = [];
  const session = (c: Ctx, said: unknown): Ctx => (handed.push(said), c);
  const clientInfo = { name: 'claude-code', version: '2.1.0' };
  const call = (meta: Record<string, unknown>) =>
    serveMcp(
      post(rpc('tools/call', { name: 'record_index', arguments: {}, _meta: { 'io.modelcontextprotocol/protocolVersion': VERSIONS[0], ...meta } }), {
        'mcp-protocol-version': VERSIONS[0],
        'mcp-method': 'tools/call',
        'mcp-name': 'record_index',
      }),
      surface,
      ctx,
      { session },
    );
  assert.equal((await call({ 'io.modelcontextprotocol/clientInfo': clientInfo })).status, 200);
  assert.equal((await call({ 'io.modelcontextprotocol/clientInfo': clientInfo, session: { project: 'Kiln', client: 'mine' } })).status, 200);
  assert.equal((await call({ session: { project: 'Kiln' } })).status, 200);
  assert.equal((await call({})).status, 200);
  assert.deepEqual(handed, [
    { client: 'claude-code', client_version: '2.1.0' },
    { client: 'mine', client_version: '2.1.0', project: 'Kiln' },
    { project: 'Kiln' },
  ]);
});

test('A METHOD THIS SERVER DOES NOT HAVE IS -32601 ON A 200, never a 404 a client reads as the endpoint gone (D38); a bad argument is still a 200', async () => {
  const { surface } = stub();
  const missing = await serveMcp(post(rpc('completion/complete', {})), surface, ctx);
  assert.equal(missing.status, 200);
  assert.equal((await read(missing)).wire?.error?.code, -32601);
  const params = await serveMcp(post(rpc('tools/call', { arguments: {} })), surface, ctx);
  assert.equal(params.status, 200);
  assert.equal((await read(params)).wire?.error?.code, -32602);
});

/* ── the headers that mirror the body ──────────────────────────────────── */

test('THE MIRRORED HEADERS ARE HELD TO THE BODY WHEN THEY ARE SENT: 400 with -32020, and no call', async () => {
  const { surface, calls } = stub();
  const cases: [string, Request][] = [
    ['Mcp-Method names another method', post(rpc('tools/list'), { 'mcp-method': 'tools/call' })],
    ['Mcp-Name names another tool', post(rpc('tools/call', { name: 'create', arguments: {} }), { 'mcp-method': 'tools/call', 'mcp-name': 'list' })],
    ['Mcp-Name names another resource', post(rpc('resources/read', { uri: 'braindog:boot' }), { 'mcp-name': 'braindog:whoami' })],
    ['Mcp-Name does not decode', post(rpc('tools/call', { name: 'list', arguments: {} }), { 'mcp-name': '=?base64?%%%?=' })],
    ['the version header and the body disagree', post(rpc('tools/list', { _meta: { 'io.modelcontextprotocol/protocolVersion': '2025-06-18' } }), { 'mcp-protocol-version': '2025-03-26' })],
  ];
  for (const [why, request] of cases) {
    const id = ((await request.clone().json()) as { id: number }).id;
    const res = await serveMcp(request, surface, ctx);
    assert.equal(res.status, 400, why);
    const { wire } = await read(res);
    assert.equal(wire?.error?.code, -32020, why);
    assert.equal(wire?.id, id, `${why}: the error does not name the request`);
  }
  assert.equal(calls.length, 0, 'a call whose headers disagreed with it ran');

  /* THE BASE64 FORM, for a name a header cannot carry, is compared after it is decoded. */
  const encoded = await serveMcp(
    post(rpc('tools/call', { name: 'record_index', arguments: {} }), { 'mcp-method': 'tools/call', 'mcp-name': `=?base64?${btoa('record_index')}?=` }),
    surface,
    ctx,
  );
  assert.equal(encoded.status, 200);
});

test('A 2026-07-28 REQUEST MUST SEND THEM, AND A CLIENT THAT PREDATES THEM NEED NOT', async () => {
  const { surface } = stub();
  const said = { _meta: { 'io.modelcontextprotocol/protocolVersion': VERSIONS[0] } };
  const missing: [string, Request][] = [
    ['no MCP-Protocol-Version', post(rpc('tools/list', said), { 'mcp-method': 'tools/list' })],
    ['no Mcp-Method', post(rpc('tools/list', said), { 'mcp-protocol-version': VERSIONS[0] })],
    ['no Mcp-Name on a call', post(rpc('tools/call', { ...said, name: 'list', arguments: {} }), { 'mcp-protocol-version': VERSIONS[0], 'mcp-method': 'tools/call' })],
  ];
  for (const [why, request] of missing) {
    const res = await serveMcp(request, surface, ctx);
    assert.equal(res.status, 400, why);
    assert.equal((await read(res)).wire?.error?.code, -32020, why);
  }
  assert.equal((await serveMcp(modern('tools/list', {}), surface, ctx)).status, 200);
  assert.equal((await serveMcp(modern('tools/call', { name: 'search', arguments: { q: 'x' } }, 'search'), surface, ctx)).status, 200);
  assert.equal((await serveMcp(post(rpc('tools/call', { name: 'search', arguments: { q: 'x' } })), surface, ctx)).status, 200, 'an older client was held to headers it never knew');
});

test('AN UNSUPPORTED VERSION IS 400 WITH -32022 AND THE VERSIONS THIS SERVER SPEAKS; initialize is exempt, its body is the negotiation', async () => {
  const { surface, calls } = stub();
  const res = await serveMcp(post(rpc('tools/list'), { 'mcp-protocol-version': '1900-01-01' }), surface, ctx);
  assert.equal(res.status, 400);
  const { wire } = await read(res);
  assert.equal(wire?.error?.code, -32022);
  assert.deepEqual(wire?.error?.data, { supported: [...VERSIONS], requested: '1900-01-01' });

  const inBody = await serveMcp(post(rpc('tools/list', { _meta: { 'io.modelcontextprotocol/protocolVersion': '1900-01-01' } })), surface, ctx);
  assert.equal((await read(inBody)).wire?.error?.code, -32022);

  const init = await serveMcp(post(rpc('initialize', { protocolVersion: '2024-11-05' }), { 'mcp-protocol-version': '2024-11-05' }), surface, ctx);
  assert.equal(init.status, 200);
  assert.equal(calls.length, 0);
});

/* ── what never crosses the wire ───────────────────────────────────────── */

test('A THROW IS 500 WITH internal AND A REFERENCE, AND NOTHING OF THE EXCEPTION', async () => {
  const { surface } = stub({
    boot: async () => {
      throw new Error('row value: sk_test_do_not_echo');
    },
  });
  const kept = console.error;
  console.error = () => undefined;
  try {
    const res = await serveMcp(post(rpc('tools/call', { name: 'record_index', arguments: {} })), surface, ctx);
    assert.equal(res.status, 500);
    const { raw, wire } = await read(res);
    assert.equal(wire?.error?.code, -32603);
    assert.equal(wire?.error?.message, 'internal');
    assert.match(String((wire?.error?.data as { ref?: unknown }).ref), /^[0-9a-f-]{36}$/);
    assert.ok(!raw.includes('sk_test_do_not_echo'), 'the exception crossed the wire');
  } finally {
    console.error = kept;
  }
});

test('EVERY ANSWER SAYS no-store, AND NONE CARRIES A CORS OR A SESSION HEADER', async () => {
  const { surface } = stub();
  const answers = await Promise.all([
    serveMcp(new Request(AT), surface, ctx),
    serveMcp(post(rpc('ping'), { origin: 'https://evil.example' }), surface, ctx),
    serveMcp(post(rpc('ping'), { 'content-type': 'text/plain' }), surface, ctx),
    serveMcp(post(rpc('ping')), surface, null),
    serveMcp(post(rpc('ping'), { 'content-length': String(MAX_BODY_BYTES + 1) }), surface, ctx),
    serveMcp(post('nope'), surface, ctx),
    serveMcp(post({ jsonrpc: '2.0', method: 'notifications/initialized' }), surface, ctx),
    serveMcp(post(rpc('initialize', { protocolVersion: '2025-06-18' })), surface, ctx),
    serveMcp(post(rpc('tools/list'), { 'mcp-method': 'ping' }), surface, ctx),
    serveMcp(post(rpc('nothing/here')), surface, ctx),
  ]);
  for (const res of answers) {
    assert.equal(res.headers.get('cache-control'), 'no-store', `a ${res.status} can be cached`);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff', `a ${res.status} can be sniffed`);
    const names = [...res.headers.keys()];
    assert.deepEqual(names.filter((h) => h.startsWith('access-control-') || h === 'mcp-session-id'), [], `a ${res.status} carries ${names.join(', ')}`);
  }
});
