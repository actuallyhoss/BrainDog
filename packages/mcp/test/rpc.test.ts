/**
 * The wire: one JSON-RPC message in, one reply out, over a stub surface that records every call.
 *
 * GOLDEN CASES, and the table of tools below is exhaustive on purpose: a tool added to `TOOLS` with
 * no row here fails, so nothing reaches an agent without a test saying which method it calls.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { agreed, handle, METHODS, VERSIONS, type Reply } from '../src/rpc.ts';
import { serveMcp } from '../src/http.ts';
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
type ToolResult = { content: { type: string; text: string }[]; isError?: boolean; structuredContent?: Record<string, unknown> };
/** The JSON beside a tool result's text, which is the whole answer: a value, or the refusal. */
const said = (reply: Reply | null) => {
  const r = result<ToolResult>(reply);
  assert.ok(r.structuredContent, `no structuredContent beside ${JSON.stringify(r.content)}`);
  return r.structuredContent;
};
const textOf = (reply: Reply | null) => result<ToolResult>(reply).content[0]!.text;

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
    /* THE HANDSHAKE IS ANSWERED UNDER THE REVISION IT AGREES: whole for the stateless one, as its every result is, and
       with nothing an older client's closed result does not know. */
    assert.equal((r as { resultType?: string }).resultType, asked === VERSIONS[0] ? 'complete' : undefined, asked);
  }
  assert.equal(result<{ protocolVersion: string }>(await handle(req('initialize', {}), surface, ctx)).protocolVersion, '2026-07-28');
  /* A transport that says the request is older does not take `resultType` off a handshake that agrees the newest. */
  assert.equal(
    result<{ resultType?: string }>(await handle(req('initialize', { protocolVersion: VERSIONS[0] }), surface, ctx, undefined, '2025-06-18')).resultType,
    'complete',
  );
  assert.equal(calls.length, 0, 'initialize read the record');
});

test('AN OLDER CLIENT IS ANSWERED WITH THE NEWEST VERSION AT OR BELOW ITS OWN, never a newer one', async () => {
  /* A client names the revision it speaks. One this server does not know is answered with the newest
     it does that is no newer, because a client cannot speak a revision written after it. */
  const { surface } = stub();
  const version = async (asked: string) =>
    result<{ protocolVersion: string }>(await handle(req('initialize', { protocolVersion: asked }), surface, ctx)).protocolVersion;
  /* 2025-11-25 IS SPOKEN AS ITSELF. It was answered 2025-06-18, and over HTTP every later request that said its own
     revision was refused as one this server does not speak. */
  assert.equal(await version('2025-11-25'), '2025-11-25');
  assert.equal(await version('2026-01-15'), '2025-11-25');
  assert.equal(await version('2025-10-01'), '2025-06-18');
  assert.equal(await version('2025-06-01'), '2025-03-26');
  assert.equal(await version('2027-01-01'), '2026-07-28');

  /* Older than every one it speaks: no version is safe to answer with, so the error names them. */
  const e = error(await handle(req('initialize', { protocolVersion: '2024-11-05' }), surface, ctx));
  assert.equal(e.code, -32602);
  assert.deepEqual(e.data, { supported: [...VERSIONS], requested: '2024-11-05' });
});

test('server/discover IS ANSWERED, with the versions, the capabilities, who this is and the instructions', async () => {
  const { surface, calls } = stub();
  const r = result<Record<string, unknown>>(
    await handle(req('server/discover', { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } }), surface, ctx),
  );
  assert.deepEqual(r, {
    resultType: 'complete',
    supportedVersions: [...VERSIONS],
    capabilities: { tools: {}, resources: {}, prompts: {} },
    _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'braindog', title: 'BrainDog', version: '0.0.0' } },
    instructions: INSTRUCTIONS,
    ttlMs: 3_600_000,
    cacheScope: 'public',
  });
  assert.ok(METHODS.includes('server/discover'));
  assert.equal(calls.length, 0, 'discover read the record');
});

test('serverInfo.version IS THE BUILD the host hands over, in initialize, server/discover and the hello mark', async () => {
  /* EVERY HOST ANSWERED 0.0.0, so a client that reads serverInfo could not tell one deploy from the next. */
  const marks: { kind: string; build?: string }[] = [];
  const { surface } = stub({ doorHeard: async (m: { kind: string; build?: string }) => (marks.push(m), { ok: true, value: null }) } as never);
  const build = '2026.10.21+abc1234';
  const init = result<{ serverInfo: { version: string } }>(await handle(req('initialize', { protocolVersion: VERSIONS[1] }), surface, ctx, undefined, undefined, '', build));
  assert.equal(init.serverInfo.version, build);
  const discover = result<{ _meta: Record<string, { version: string }> }>(await handle(req('server/discover'), surface, ctx, undefined, undefined, '', build));
  assert.equal(discover._meta['io.modelcontextprotocol/serverInfo']!.version, build);
  assert.deepEqual(marks.filter((m) => m.kind === 'hello').map((m) => m.build), [build]);
  /* A HOST THAT HANDS NONE, or only space, still says 0.0.0: not told, which is never read as a build. */
  for (const none of [undefined, '', '  '])
    assert.equal(result<{ serverInfo: { version: string } }>(await handle(req('initialize', {}), surface, ctx, undefined, undefined, '', none)).serverInfo.version, '0.0.0');
});

test('OVER HTTP THE HOST BUILD IS serverInfo.version, beside the braindog-build header it already sent', async () => {
  const { surface } = stub();
  const build = '2026.10.21+abc1234';
  const res = await serveMcp(
    new Request('https://brain.dog/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req('initialize', { protocolVersion: VERSIONS[1] })),
    }),
    surface,
    ctx,
    { build },
  );
  assert.equal(res.headers.get('braindog-build'), build);
  const body = (await res.json()) as { result: { serverInfo: { version: string } } };
  assert.equal(body.result.serverInfo.version, build);
});

test('ping answers, and the prompts are start, wrap and ask', async () => {
  const { surface, calls } = stub();
  assert.deepEqual(result(await handle(req('ping'), surface, ctx)), { resultType: 'complete' });
  const listed = result<{ prompts: { name: string }[] }>(await handle(req('prompts/list'), surface, ctx));
  assert.deepEqual(listed.prompts.map((p) => p.name), ['start', 'wrap', 'ask', 'addon']);
  assert.equal(calls.length, 0, 'a prompt read the record');
});

test('AN OLDER CLIENT IS ANSWERED A BARE {} TO A PING, because its revision reads that answer as a closed, empty result', async () => {
  /* `resultType` went on every result for every client, and a 2025-06-18 or 2025-11-25 client that checks a ping's
     answer against the empty result its revision draws may refuse a key it does not know. */
  const { surface } = stub();
  for (const older of VERSIONS.slice(1)) {
    assert.deepEqual(result(await handle(req('ping'), surface, ctx, undefined, older)), {}, `${older} ping`);
    const listed = result<Record<string, unknown>>(await handle(req('tools/list'), surface, ctx, undefined, older));
    assert.equal(listed.resultType, undefined, `${older} tools/list`);
    assert.ok(Array.isArray(listed.tools));
  }
  assert.deepEqual(result(await handle(req('ping'), surface, ctx, undefined, VERSIONS[0])), { resultType: 'complete' });
  /* THE REQUEST'S OWN WORD WINS over the transport's, since a stateless client names its revision on every request. */
  const named = req('ping', { _meta: { 'io.modelcontextprotocol/protocolVersion': VERSIONS[0] } });
  assert.deepEqual(result(await handle(named, surface, ctx, undefined, '2025-06-18')), { resultType: 'complete' });
  /* A word that is not a date is no revision, and the transport's stands. */
  const junk = req('ping', { _meta: { 'io.modelcontextprotocol/protocolVersion': 'latest' } });
  assert.deepEqual(result(await handle(junk, surface, ctx, undefined, '2025-06-18')), {});
});

test('OVER HTTP THE REVISION IS THE HEADER, and a request with none is taken as 2025-03-26, which says no resultType', async () => {
  const { surface } = stub();
  const ping = (headers: Record<string, string>, meta?: string) =>
    new Request('https://app.brain.dog/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(req('ping', meta === undefined ? {} : { _meta: { 'io.modelcontextprotocol/protocolVersion': meta } })),
    });
  const answered = async (r: Request) => ((await (await serveMcp(r, surface, ctx)).json()) as { result: unknown }).result;
  assert.deepEqual(await answered(ping({})), {});
  assert.deepEqual(await answered(ping({ 'mcp-protocol-version': '2025-06-18' })), {});
  assert.deepEqual(await answered(ping({ 'mcp-protocol-version': '2025-11-25' })), {});
  assert.deepEqual(await answered(ping({ 'mcp-protocol-version': VERSIONS[0], 'mcp-method': 'ping' }, VERSIONS[0])), { resultType: 'complete' });
});

test('A STDIO LOOP KEEPS THE REVISION ITS HANDSHAKE AGREED, read from the reply by agreed', async () => {
  const { surface } = stub();
  for (const asked of ['2025-06-18', '2025-11-25', VERSIONS[0], '2099-01-01'])
    assert.equal(agreed(await handle(req('initialize', { protocolVersion: asked }), surface, ctx)), asked > VERSIONS[0] ? VERSIONS[0] : asked);
  assert.equal(agreed(await handle(req('ping'), surface, ctx)), null);
  assert.equal(agreed(await handle(req('initialize', { protocolVersion: '1999-01-01' }), surface, ctx)), null);
  assert.equal(agreed(null), null);
});

test('EVERY RESULT SAYS IT IS WHOLE TO A 2026-07-28 CLIENT, which refuses a list that does not', async () => {
  /* Claude Code took the handshake at this revision and then dropped every tool, on every session, because only
     `server/discover` carried `resultType`. Every method is asked here as that client asks it. */
  const { surface } = stub();
  const asked: [string, Record<string, unknown>][] = [
    ['initialize', { protocolVersion: VERSIONS[0] }],
    ['server/discover', {}],
    ['ping', {}],
    ['tools/list', {}],
    ['tools/call', { name: 'record_index', arguments: {} }],
    ['resources/list', {}],
    ['resources/templates/list', {}],
    ['prompts/list', {}],
    ['prompts/get', { name: 'start' }],
  ];
  for (const [method, params] of asked) {
    const r = result<Record<string, unknown>>(await handle(req(method, params), surface, ctx, undefined, VERSIONS[0]));
    assert.equal(r.resultType, 'complete', `${method} answered without resultType`);
  }
  const read = result<Record<string, unknown>>(
    await handle(req('resources/read', { uri: 'braindog:schema/obligations' }), surface, ctx, undefined, VERSIONS[0]),
  );
  assert.equal(read.resultType, 'complete', 'resources/read answered without resultType');
  assert.deepEqual(
    METHODS.filter((m) => m !== 'resources/read' && !asked.some(([method]) => method === m)),
    [],
    'a method was added and is not asked here',
  );
});

type Hints = { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };

test('tools/list is the sixteen, each with its title and every hint said, and no second copy of the instructions', async () => {
  const { surface, calls } = stub();
  const r = result<{ tools: { name: string; title: string; inputSchema: { type: string }; annotations: Hints }[]; instructions?: string; ttlMs: number }>(
    await handle(req('tools/list'), surface, ctx),
  );
  assert.equal(r.tools.length, 16);
  assert.deepEqual(r.tools.map((t) => t.name), TOOLS.map((t) => t.name));
  assert.equal(r.instructions, undefined, 'the instructions went out a second time');
  assert.equal(r.ttlMs, 3_600_000);
  for (const t of r.tools) {
    assert.equal(t.inputSchema.type, 'object', t.name);
    assert.equal(t.title, TOOLS.find((x) => x.name === t.name)?.title, `${t.name} has no title a host can show`);
    /* NONE REACHES PAST THE RECORD, and a missing hint is read as the worst. */
    assert.equal(t.annotations.openWorldHint, false, `${t.name} says it reaches the world`);
  }
  const hints = Object.fromEntries(r.tools.map((t) => [t.name, t.annotations]));
  for (const name of ['record_index', 'context', 'get', 'list', 'search', 'activity', 'governance'])
    assert.equal(hints[name]?.readOnlyHint, true, `${name} reads and does not say so`);
  /* THE ADDITIVE WRITES TAKE NOTHING AWAY, so a host need not ask a person before each one as it would a delete. */
  for (const name of ['create', 'propose', 'log', 'meet', 'triage', 'handoff', 'instructions']) {
    assert.equal(hints[name]?.readOnlyHint, false, name);
    assert.equal(hints[name]?.destructiveHint, false, `${name} adds and is marked as if it overwrote`);
  }
  /* AND `update` OVERWRITES A VALUE, which undo does not make safe (OpenAI's review rule). */
  assert.equal(hints.update?.destructiveHint, true);
  /* AND `act` CAN TAKE A WRITE AWAY: it is how a write is undone, and undoing a create deletes the row (door audit D35). */
  assert.equal(hints.act?.destructiveHint, true);
  assert.equal(hints.act?.idempotentHint, false);
  /* A DIRECTORY READS A MISSING readOnlyHint AS A WRITE IT CANNOT VOUCH FOR, so every listed tool says it, true or false. */
  for (const t of r.tools) assert.equal(typeof t.annotations.readOnlyHint, 'boolean', `${t.name} leaves readOnlyHint unsaid`);
  assert.equal(hints.update?.idempotentHint, true);
  assert.equal(hints.create?.idempotentHint, false);
  assert.equal(calls.length, 0, 'the tool list read the record, and it must always arrive');
});

/* ── every tool reaches its method ─────────────────────────────────────── */

/**
 * EACH TOOL'S METHODS, IN ORDER, WITH THE READS ITS WORDS ASK BESIDE IT. `context` asks `boot` for whom the questions
 * wait on and the Home page; `history` the schema and the row, for the head line's name and words; `governance` `boot`
 * for the person's name. A `list` whose page came back empty asks
 * nothing more, and is said by the list's id, so one `list` is one request to a host (`apps/cli/test/hooks.test.ts`
 * counts them).
 */
const TABLE = [
  { name: 'undoOwn', group: 'DATA', writes: true, what: 'Take back your own write.' },
  { name: 'setZone', group: 'ADMIN', writes: true, what: 'Set the time zone.' },
];

const EACH: [tool: string, args: Record<string, unknown>, methods: string[], first?: unknown, agents?: boolean][] = [
  ['record_index', {}, ['boot', 'version']],
  ['context', {}, ['context', 'boot'], {}],
  /* WHAT HE TOLD THE RUN, on a record that knows instructions: its settings first, then the door. */
  ['instructions', { take: 'IN4' }, ['whoami', 'instructionsMine'], { take: 'IN4' }, true],
  ['get', { spoken: 'obligations#41' }, ['get'], { register: 'obligations', seq: 41 }],
  ['list', { register: 'obligations', where: { field: 'state', is: 'open' }, limit: 5 }, ['list'], { register: 'obligations', where: { field: 'state', is: 'open' }, limit: 5 }],
  ['search', { q: 'invoice' }, ['search'], { q: 'invoice' }],
  ['activity', { limit: 5 }, ['recentHistory'], { limit: 5 }],
  /* NO `money` ROW: the tool that read seven of one pack's figures by id left the core, and those figures are
     `braindog:metric/<id>` like every other pack's (`money-out.test.ts`). ONE MORE IS ASKED THAN A PAGE SHOWS, so a
     page that is the last says so by carrying no cursor. */
  ['governance', { status: 'all' }, ['governance', 'boot'], { status: 'all', limit: 21 }],
  ['propose', { question: 'Keep it?', body_kind: 'options', body: {} }, ['propose', 'boot'], { question: 'Keep it?', body_kind: 'options', body: {} }],
  ['create', { register: 'obligations', fields: { what: 'a' } }, ['create'], { register: 'obligations', fields: { what: 'a' } }],
  ['update', { spoken: 'obligations#41', patch: { what: 'b' }, version: 3 }, ['update'], { register: 'obligations', seq: 41, patch: { what: 'b' }, version: 3 }],
  ['log', { spoken: 'obligations#41', note: 'Chased.' }, ['update'], { register: 'obligations', seq: 41, patch: {}, note: 'Chased.' }],
  ['handoff', { next: 'Wire the self-host.', tried: 'Reading the cookie.' }, ['handoff'], { next: 'Wire the self-host.', tried: 'Reading the cookie.' }],
  ['meet', { name: 'Ada', where: 'commit 4464966 in braindog' }, ['meet'], { name: 'Ada', where: 'commit 4464966 in braindog' }],
  ['triage', { arrival: 'a1', ignore: true }, ['triage'], { arrival: 'a1', ignore: true }],
  /* `act` RUNS THE CALL IT NAMES, with its arguments as sent; `undoOwn`, in `undo`'s words, is the one it is sent most. */
  ['act', { call: 'undoOwn', args: { batch: 'b1' } }, ['undoOwn'], { batch: 'b1' }],
];

test('EVERY TOOL REACHES THE RIGHT METHOD, with the context the transport handed over', async () => {
  assert.deepEqual(EACH.map(([name]) => name), TOOLS.map((t) => t.name), 'a tool has no golden case');
  for (const [name, args, methods, first, agents] of EACH) {
    const { surface, calls } = stub(name === 'act' ? { calls: () => TABLE, call: async () => assert.fail('undoOwn is answered by the tool, not sent on') } : {}, { agents: agents === true });
    const reply = await handle(req('tools/call', { name, arguments: args }), surface, ctx);
    const r = result<ToolResult>(reply);
    assert.notEqual(r.isError, true, `${name}: ${r.content[0]?.text}`);
    assert.deepEqual(calls.map((c) => c.method), methods, name);
    for (const c of calls) assert.equal(c.ctx, ctx, `${name} did not hand the context on`);
    /* THE SETTINGS READ (`whoami`) IS THE DOOR'S, before the tool's own method. */
    if (first !== undefined) assert.deepEqual(calls.find((c) => c.method !== 'whoami')?.args, first, name);
  }
});

test('act RUNS ANY OTHER CALL THE TABLE HOLDS THROUGH THE HOST, with the arguments as sent and the context handed over', async () => {
  const { surface, calls } = stub({ calls: () => TABLE });
  surface.call = async (name, args, c) => {
    calls.push({ method: name, args, ctx: c });
    return { ok: true, value: { say: 'Done.' } };
  };
  const reply = await handle(req('tools/call', { name: 'act', arguments: { call: 'setZone', args: { zone: 'UTC' } } }), surface, ctx);
  assert.notEqual(result<ToolResult>(reply).isError, true, textOf(reply));
  assert.deepEqual(calls, [{ method: 'setZone', args: { zone: 'UTC' }, ctx }]);
});

test('AND A CALL THE DOOR NEVER MAKES IS REFUSED BEFORE THE HOST HEARS OF IT, and undo still answers by its old name', async () => {
  const { surface, calls } = stub({ calls: () => [...TABLE, { name: 'erase', group: 'ADMIN', writes: true, what: 'Erase a person.' }] });
  surface.call = async () => assert.fail('the host was asked');
  const never = await handle(req('tools/call', { name: 'act', arguments: { call: 'erase', args: { person: 'p_1' } } }), surface, ctx);
  assert.equal(said(never).code, 'FORBIDDEN');
  assert.equal(calls.length, 0);
  /* FOLDED, NOT GONE, until `FOLDED_UNTIL`: a session that cached the older list keeps working. */
  const old = await handle(req('tools/call', { name: 'undo', arguments: { batch: 'b1' } }), surface, ctx);
  assert.notEqual(result<ToolResult>(old).isError, true, textOf(old));
  assert.deepEqual(calls.map((c) => c.method), ['undoOwn']);
});

const OBLIGATIONS = { id: 'obligations', name: 'Obligations', title: 'what', state: 'state', fields: [{ id: 'what', type: 'text' }, { id: 'amount', type: 'money' }, { id: 'state', type: 'enum', values: ['open', 'paid'] }] };
const ROW = { id: '01M3VMPS0000000000000000AA', register: 'obligations', seq: 41, version: 3, state: 'open', fields: { what: 'Renew the domain', amount: { amount: 145000, currency: 'EGP' }, state: 'open' } };

test('A RESULT IS PLAIN LINES, with the whole JSON beside it as structuredContent', async () => {
  const { surface } = stub({ get: async () => ({ ok: true, value: ROW }), schema: async () => ({ ok: true, value: OBLIGATIONS }) });
  const reply = await handle(req('tools/call', { name: 'get', arguments: { spoken: 'obligations#41' } }), surface, ctx);
  const r = result<ToolResult>(reply);
  assert.equal(r.content.length, 1);
  assert.equal(r.content[0]!.type, 'text');
  /* THE LINES NAME THE THING AND SAY MONEY AS A PERSON READS IT, and never the row's own id. */
  assert.equal(textOf(reply).split('\n')[0], 'Renew the domain (obligations#41) · open · version 3');
  assert.match(textOf(reply), /^Amount: EGP 1,450$/mu);
  assert.doesNotMatch(textOf(reply), /01M3VMPS/);
  /* AND THE JSON IS THE ROW AS EVERY TOOL ANSWERS ONE, minor units and all. */
  assert.deepEqual(said(reply), { spoken: 'obligations#41', version: 3, state: 'open', fields: ROW.fields });
});

test('AND format full PUTS THE JSON IN THE TEXT TOO, compact', async () => {
  const { surface } = stub({ get: async () => ({ ok: true, value: ROW }), schema: async () => ({ ok: true, value: OBLIGATIONS }) });
  const reply = await handle(req('tools/call', { name: 'get', arguments: { spoken: 'obligations#41', format: 'full' } }), surface, ctx);
  assert.deepEqual(JSON.parse(textOf(reply)), said(reply));
  assert.doesNotMatch(textOf(reply), /\n/);
});

test('AN UNKNOWN TOOL, OR A NAME OFF Object.prototype, IS A REFUSAL and runs nothing', async () => {
  const { surface, calls } = stub();
  for (const name of ['frobnicate', 'constructor', 'toString', '__proto__', 'hasOwnProperty', 'pages', 'credentials', 'dry_run']) {
    const reply = await handle(req('tools/call', { name, arguments: {} }), surface, ctx);
    assert.equal(result<ToolResult>(reply).isError, true, name);
    const refusal = said(reply);
    assert.equal(refusal.code, 'ROUTE_UNKNOWN', name);
    assert.ok((refusal.allowed as string[]).includes('context'), name);
    assert.match(textOf(reply), /^Refused, ROUTE_UNKNOWN: There is no tool called/u, name);
  }
  /* A NAME ONE LETTER FROM A TOOL IS ANSWERED WITH THE CALL IT MEANT, as the refusal's `try`. */
  const near = await handle(req('tools/call', { name: 'lists', arguments: { register: 'obligations' } }), surface, ctx);
  assert.equal(said(near).try, 'list {"register":"obligations"}');
  assert.match(textOf(near), /^Try: list \{"register":"obligations"\}$/mu);
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
  assert.equal(textOf(reply), 'Refused, REGISTER_UNKNOWN at register: There is no register called invoices.\nAllowed: obligations');
});

test('A REFUSAL THAT HAS A FIX CARRIES THE CORRECTED CALL, as try, named from what it allowed', async () => {
  /* `Obligations` is what `boot` names the list whose id is `obligations`, so "obligation" is one the agent meant. */
  const { surface } = stub({
    list: async () => ({ ok: false, refusal: { code: 'REGISTER_UNKNOWN', fix: 'There is no register called obligation.', at: 'register', allowed: ['obligations'] } }),
  });
  const reply = await handle(req('tools/call', { name: 'list', arguments: { register: 'obligation', limit: 5 } }), surface, ctx);
  assert.equal(said(reply).try, 'list {"register":"obligations","limit":5}');
});

test('a conflict carries the current row and who changed it, in words without a dash, and the call to send next', async () => {
  const { surface } = stub({ update: async () => ({ ok: false, conflict: { version: 5, current: { what: 'b' }, actor: 'person:sam' } }) });
  const reply = await handle(req('tools/call', { name: 'update', arguments: { spoken: 'obligations#1', patch: { what: 'c' }, version: 4 } }), surface, ctx);
  assert.equal(result<ToolResult>(reply).isError, true);
  const conflict = said(reply);
  assert.equal(conflict.code, 'VERSION_STALE');
  assert.deepEqual(conflict.current, { what: 'b' });
  assert.equal(conflict.version, 5);
  /* WHO, IN WORDS: the founding owner's own grant signs as `person:<id>`, and a line says the person. */
  assert.match(String(conflict.fix), /^Sam changed it after you read it/);
  assert.doesNotMatch(String(conflict.fix), /—/);
  assert.equal(conflict.try, 'update {"spoken":"obligations#1","patch":{"what":"c"},"version":5}');
  assert.match(textOf(reply), /^Not saved, VERSION_STALE: Sam changed it after you read it, and it is at version 5 now\./u);
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
    'braindog:declaration/{slug}',
    'braindog:automation/{id}',
    'braindog:inbox/{state}',
  ]);

  const read = result<{ contents: { uri: string; text: string }[]; ttlMs: number }>(
    await handle(req('resources/read', { uri: 'braindog:schema/obligations' }), surface, ctx),
  );
  assert.deepEqual(read.contents[0], { uri: 'braindog:schema/obligations', mimeType: 'application/json', text: '{"fields":[]}' });
  assert.equal(read.ttlMs, 3_600_000);
  assert.equal((read as { cacheScope?: string }).cacheScope, 'private');
});

test('EVERY LIST IS ONE PAGE: it carries no nextCursor, and a cursor the server never issued is -32602', async () => {
  /* `resources/list` read no cursor, so a client that sent one was handed the whole list again as if it were the next
     page. Nothing here pages, so no cursor is ever issued, and one that arrives is refused before the record is read. */
  const { surface, calls } = stub();
  for (const method of ['resources/list', 'resources/templates/list', 'tools/list', 'prompts/list']) {
    const whole = result<Record<string, unknown>>(await handle(req(method), surface, ctx));
    assert.equal(whole.nextCursor, undefined, `${method} offered a next page`);
    assert.ok(result(await handle(req(method, { cursor: null }), surface, ctx)), `${method} refused a null cursor`);
  }
  const before = calls.length;
  for (const method of ['resources/list', 'resources/templates/list', 'tools/list', 'prompts/list']) {
    const wrong = error(await handle(req(method, { cursor: 'c_2' }), surface, ctx));
    assert.equal(wrong.code, -32602, method);
    assert.match(wrong.message, /one page/);
  }
  assert.equal(calls.length, before, 'a refused cursor read the record');
});

test('a resource that is not there is -32602 under 2026-07-28 and -32002 under an older revision', async () => {
  const { surface } = stub();
  const now = error(await handle(req('resources/read', { uri: 'braindog:nothing' }), surface, ctx, undefined, '2026-07-28'));
  assert.equal(now.code, -32602);
  const old = error(await handle(req('resources/read', { uri: 'braindog:nothing' }), surface, ctx, undefined, '2025-06-18'));
  assert.equal(old.code, -32002);
});

test('a resource that is not there, or is refused, is -32002 with the sentence under an older revision', async () => {
  const { surface } = stub({ whoami: async () => ({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'Not for this token.' } }) });
  const missing = error(await handle(req('resources/read', { uri: 'braindog:nothing' }), surface, ctx, undefined, '2025-06-18'));
  assert.equal(missing.code, -32002);
  assert.match(missing.message, /There is nothing at braindog:nothing/);

  const refused = error(await handle(req('resources/read', { uri: 'braindog:whoami' }), surface, ctx, undefined, '2025-06-18'));
  assert.equal(refused.code, -32002);
  assert.equal(refused.message, 'Not for this token.');
  assert.equal((refused.data as { refusal: { code: string } }).refusal.code, 'FORBIDDEN');
});
