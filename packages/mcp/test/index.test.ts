/**
 * The advertised list, checked against what actually answers.
 *
 * A NAME IN `TOOLS` IS A PROMISE MADE IN EVERY TURN OF EVERY SESSION, and the failure this file is
 * written for is a name that can never be kept: `recentHistory` shipped with the `activity` tool and
 * the record routed it, and stdio still answered `NOT_IN_THIS_BUILD` for a run, because the one list
 * that turns a routed method into a surface member had not heard of it (7b6fd267,
 * `apps/cli/src/surface.ts`). An agent cannot tell that from a tool that is merely refusing today,
 * so it spends a turn on it, every session, for ever.
 *
 * SO EVERY TOOL IS CALLED, THROUGH THE SAME `handle` STDIO SERVES, over a real record. The table is
 * exhaustive against `TOOLS` on purpose: a tool added without a case here is red, which is the only
 * way a list of seventeen stays true. What is asserted is narrow and is the whole of the claim: the
 * name reached a method, so the answer is not `ROUTE_UNKNOWN` and not `NOT_IN_THIS_BUILD`. Whether
 * each tool then does what it says is `mcp.test.ts`.
 *
 * AND ONCE MORE OVER A SURFACE WITH NO OPTIONAL METHOD ON IT, which is what the command line hands
 * the tools when its allow-list is short. That run says exactly which tools go dark, and the list is
 * six; a seventh appearing in it is a tool somebody has to add a name for before it ships.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';

import { TEMPLATES, TOOLS, withCalls, type McpSurface } from '../src/index.ts';
import { handle, type Reply } from '../src/rpc.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

const OBLIGATIONS = {
  id: 'register.obligations',
  kind: 'register' as const,
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    state: 'state',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'money' },
      { id: 'state', type: 'enum', values: ['open', 'paid'] },
    ],
  } as never,
};

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok((await api.kernel.install([OBLIGATIONS])).ok);
  assert.ok(api.kernel.create('obligations', { what: 'Invoice 41', state: 'open' }, { actor: 'p_1' }).ok);
  return { sql, api };
}

/** What each tool is called with: enough to reach its method, and nothing about what it then does. */
const CALLS: Record<string, Record<string, unknown>> = {
  record_index: {},
  context: {},
  instructions: {},
  get: { spoken: 'obligations#1' },
  list: { register: 'obligations' },
  search: { q: 'invoice' },
  activity: { limit: 5 },
  governance: {},
  propose: {
    question: 'Keep it?',
    body_kind: 'options',
    body: { options: [{ id: 'yes', label: 'Keep it', because: 'It is used' }, { id: 'no', label: 'Drop it', because: 'It is not' }] },
  },
  create: { register: 'obligations', fields: { what: 'Invoice 42', state: 'open' } },
  update: { spoken: 'obligations#1', patch: { state: 'paid' }, version: 1 },
  log: { spoken: 'obligations#1', note: 'Chased twice.' },
  handoff: { doing: 'Checking the tool list', next: 'Report what answered' },
  meet: { name: 'Ada', where: 'commit 4464966 in braindog' },
  triage: { arrival: 'arr_1', ignore: true },
  act: { call: 'undoOwn', args: { batch: 'no-such-batch', dry: true } },
};

type ToolResult = { isError?: boolean; content: { text: string }[]; structuredContent: Record<string, unknown> };

/** One `tools/call` over the wire, and the refusal code it carried, or `''` where it answered. The refusal is whole in `structuredContent`. */
async function called<C>(name: string, surface: McpSurface<C>, ctx: C): Promise<string> {
  const reply = (await handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: CALLS[name] ?? {} } }, surface, ctx)) as Reply;
  assert.ok('result' in reply, `${name}: ${JSON.stringify(reply)}`);
  const out = reply.result as ToolResult;
  if (out.isError !== true) return '';
  return (out.structuredContent as { code: string }).code;
}

test('EVERY ADVERTISED TOOL REACHES A METHOD, asked over the wire rather than read off the array', async (t) => {
  const { sql, api } = await record();
  assert.deepEqual(Object.keys(CALLS).sort(), TOOLS.map((x) => x.name).sort(), 'a tool has no call here, or a call names no tool');
  /* `act` IS HANDED ITS CALLS BY THE HOST (`withCalls`), so the record alone goes dark on it, as below. Here one row of the table is enough to reach it. */
  const hosted = withCalls(api, async () => ({ ok: true, value: {} }) as never, () => [{ name: 'undoOwn', group: 'DATA', writes: true, what: 'Take back your own write.' }]);
  for (const tool of TOOLS) {
    const code = await called(tool.name, hosted, owner);
    t.diagnostic(`${tool.name}: ${code === '' ? 'answered' : code}`);
    assert.notEqual(code, 'ROUTE_UNKNOWN', `${tool.name} is advertised and no method answers it`);
    assert.notEqual(code, 'NOT_IN_THIS_BUILD', `${tool.name} is advertised and refuses for ever on this build`);
  }
  sql.close();
});

/**
 * THE NARROWEST SURFACE THAT TYPE-CHECKS: the sixteen methods `McpSurface` requires and not one of
 * the optional eight. What goes dark on it is exactly what a transport's own list has to carry.
 */
const narrowOver = (api: Awaited<ReturnType<typeof record>>['api']): McpSurface<CallContext> => ({
  boot: (ctx) => api.boot(ctx),
  version: (ctx) => api.version(ctx),
  whoami: (ctx) => api.whoami(ctx),
  schema: (args, ctx) => api.schema(args, ctx),
  get: (args, ctx) => api.get(args as never, ctx),
  list: (args, ctx) => api.list(args as never, ctx) as never,
  search: (args, ctx) => api.search(args, ctx),
  history: (args, ctx) => api.history(args, ctx),
  governance: (args, ctx) => api.governance(args as never, ctx),
  propose: (args, ctx) => api.propose(args as never, ctx),
  create: (args, ctx) => api.create(args as never, ctx),
  update: (args, ctx) => api.update(args as never, ctx),
  pages: (ctx) => api.pages(ctx) as never,
  page: (args, ctx) => api.page(args, ctx),
  metric: (args, ctx) => api.metric(args, ctx),
  digestToday: (args, ctx) => api.digestToday(args, ctx),
});

test('AND A SURFACE WITH NOTHING OPTIONAL ON IT DARKENS SEVEN OF THEM, which is the list a transport has to route', async () => {
  /* THE COMMAND LINE BUILDS ITS SURFACE FROM A FIXED LIST (`apps/cli/src/surface.ts`), and a name
     missing from it is a tool that refuses for ever. */
  const { sql, api } = await record();
  const narrow = narrowOver(api);

  const dark: string[] = [];
  for (const tool of TOOLS) if ((await called(tool.name, narrow, owner)) === 'NOT_IN_THIS_BUILD') dark.push(tool.name);
  assert.deepEqual(dark, ['context', 'instructions', 'activity', 'handoff', 'meet', 'triage', 'act']);
  sql.close();
});

/** The addresses `resources/list` offers, which is only ever what it managed to read first. */
async function listedOver<C>(surface: McpSurface<C>, ctx: C): Promise<string[]> {
  const reply = (await handle({ jsonrpc: '2.0', id: 1, method: 'resources/list' }, surface, ctx)) as Reply;
  assert.ok('result' in reply, JSON.stringify(reply));
  /* ONE PAGE, WHOLE: nothing here pages, so a listing that offered a next page would send a client to a refusal. */
  assert.equal((reply.result as { nextCursor?: unknown }).nextCursor, undefined, 'resources/list offered a next page');
  return (reply.result as { resources: { uri: string }[] }).resources.map((r) => r.uri);
}

test('AND THE RESOURCES GO THE SAME WAY, more quietly, which is the half of this list nobody had written down', async () => {
  /* A RESOURCE IS LISTED ONLY ONCE IT HAS BEEN READ, so a surface with no member behind one does not
     refuse anywhere an agent can see it: the address is simply absent and nothing says why. A tool
     at least answers "not in this build" when it goes. That is how `braindog:actions` stayed
     unreachable from the command line, with the name already in the client's table and in the
     record's routes and only `LATER` short (`apps/cli/src/surface.ts`), and it is why the tool half
     of this file above was not enough on its own. */
  const { sql, api } = await record();
  const whole = await listedOver(api, owner);
  const narrow = await listedOver(narrowOver(api), owner);
  assert.deepEqual(whole.filter((uri) => !narrow.includes(uri)), [
    'braindog:context',
    /* WHAT THE RECORD WOULD LINK, a tool until AGT-B05 and as optional on the surface as it was then. */
    'braindog:understand',
    /* THE STEPS LEFT, drawn by `previewPage`, which the narrow surface has not got. */
    'braindog:handoffs',
    /* WHAT MATTERS, WHAT STOPPED, WHAT WENT STALE AND WHAT A NAME IS (batch 85): the record's own reads, which the
       narrow surface has not got. */
    'braindog:briefing',
    /* EVERY WIDGET TODAY CAN HOLD (round 1030), the record's `widgetGallery`, which the narrow surface has not got. */
    'braindog:widgets',
    'braindog:exceptions',
    'braindog:stale',
    'braindog:learnings',
    'braindog:about',
    'braindog:sessions/live',
    'braindog:inbox',
    'braindog:inbox/patterns',
    'braindog:actions',
    'braindog:automations',
    'braindog:arrangement',
    'braindog:design',
    'braindog:grammar/page',
    'braindog:grammar/register',
    'braindog:grammar/metric',
    'braindog:grammar/proposals',
    'braindog:grammar/ingest',
    'braindog:grammar/kinds',
    /* AN ADD-ON FILE WHOLE (addons market plan, 3 Nov), the record's `arrangement` grammar as the others above are. */
    'braindog:grammar/pack',
  ]);
  sql.close();
});

test('CREDENTIALS IS NOT A TOOL, and skill is a template that needs a name', async () => {
  /* A keychain tool could only ever refuse, because the keychain needs a person in a browser and an agent
     holding a token is neither, and a tool that always refuses is a tool an agent spends its turns
     discovering. A skill is read by name at `braindog:skill/<name>`, and a template is fetched when
     it is wanted rather than costing every turn. */
  const { sql, api } = await record();
  for (const name of ['credentials', 'skill', 'dry_run', 'metric']) {
    assert.equal(TOOLS.some((t) => t.name === name), false, `${name} is advertised as a tool`);
    assert.equal(await called(name, api, owner), 'ROUTE_UNKNOWN');
  }
  assert.ok(TEMPLATES.some((t) => t.uriTemplate === 'braindog:skill/{name}'));
  sql.close();
});

test('AND THE REFUSAL FOR A NAME THAT IS NOT A TOOL LISTS EVERY TOOL, so the second attempt works', async () => {
  const { sql, api } = await record();
  const reply = (await handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'money_overview', arguments: {} } }, api, owner)) as Reply;
  assert.ok('result' in reply);
  const result = reply.result as ToolResult;
  const said = result.structuredContent as { code: string; fix: string; allowed: string[] };
  assert.equal(said.code, 'ROUTE_UNKNOWN');
  assert.deepEqual(said.allowed, TOOLS.map((t) => t.name));
  assert.match(said.fix, /money_overview/);
  /* AND THE TEXT A MODEL READS SAYS THE SAME, every tool by name on its Allowed line. */
  assert.match(result.content[0]!.text, /^Refused, ROUTE_UNKNOWN\b/u);
  assert.ok(TOOLS.every((t) => result.content[0]!.text.includes(t.name)), result.content[0]!.text);
  sql.close();
});
