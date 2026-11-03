/**
 * `braindog mcp` as Claude Code runs it: a child process, JSON-RPC on its stdin and stdout, and a host
 * answering `/api` over a real socket.
 *
 * THE HOST IS A STUB ON node:http, NOT THE SELF-HOST, because apps never import apps (the graph gate).
 * What is under test is the command: its framing, its deadline, its drain, and what it prints. What
 * the record answers is for the self-host's own tests.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { PassThrough, Writable } from 'node:stream';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TOOLS, tools, type McpSurface } from '@braindog/mcp';
import { ALWAYS_LOADED, INSTRUCTIONS, SEARCH_HINTS, VERSIONS } from '@braindog/mcp/rpc';
import { UNREACHABLE_FIX } from '../src/surface.ts';
import { serveStdio } from '../src/stdio.ts';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
/* Obviously fake, and long enough that a fragment of it in any output is findable. */
const TOKEN = 'rec_01TESTTESTTESTTESTTESTTEST.stub-bearer-never-printed-4c1d';

const scratch = mkdtempSync(join(tmpdir(), 'braindog-cli-'));
const children: ChildProcessWithoutNullStreams[] = [];
/** Everything any child wrote on either stream, for the last test, which says none of it holds the token. */
const printed: string[] = [];
after(() => {
  for (const child of children) child.kill();
  rmSync(scratch, { recursive: true, force: true });
});

/* ── a host ────────────────────────────────────────────────────────────── */

type Seen = { method: string; query: URLSearchParams; headers: IncomingHttpHeaders };
/* A RAW RECORD ROW, the shape `/api/list` answers: `id`, `register`, `seq` and `version` apart from its
   fields. `@braindog/mcp`'s `list` tool always runs a page through `compact()` then `listed()` before an
   agent sees it (`packages/mcp/src/index.ts` `SHAPED`, `listed`), which is what a row without them was
   never a stand-in for: `compact` reads `isEntry`, and a row missing `id`, `register` or `version` fails
   that check and is handed to `listed` unchanged, so `spoken` and `version` are read off fields that were
   never there. `COMPACTED_ROWS` below is what the tool actually answers for this one, in `structuredContent`, and
   with no `cursor`, since a null says nothing a missing key does not. */
const ROWS = { rows: [{ id: 'obligations#1', register: 'obligations', seq: 1, version: 1, fields: { what: 'Rent' } }], matched: 1, cursor: null };
const COMPACTED_ROWS = { rows: [{ spoken: 'obligations#1', version: 1, fields: { what: 'Rent' } }], matched: 1 };

/**
 * `list` answers at once, after 300 ms for `late`, or never for `hangs`.
 *
 * EVERY OTHER METHOD IS REFUSED UNLESS `answers` NAMES IT, which is what lets the whole-surface runs
 * below have a record that says yes to everything without importing the self-host. What each answer
 * holds is shaped only where a tool reads a field off it, because what is under test here is that
 * the name reached a method at all.
 */
async function stubHost(t: { after: (fn: () => Promise<void>) => void }, answers: Record<string, unknown> = {}) {
  const seen: Seen[] = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://stub');
    const method = url.pathname.replace(/^\/api\//, '');
    seen.push({ method, query: url.searchParams, headers: req.headers });
    const answer = (body: unknown) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    const register = url.searchParams.get('register');
    if (method !== 'list') {
      if (Object.hasOwn(answers, method)) return answer({ ok: true, value: answers[method] });
      return answer({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `The stub answers list, and not ${method}.` } });
    }
    if (register === 'hangs') return;
    if (register === 'late') return void setTimeout(() => answer({ ok: true, value: ROWS }), 300);
    answer({ ok: true, value: ROWS });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  t.after(
    () =>
      new Promise<void>((done) => {
        server.closeAllConnections();
        server.close(() => done());
      }),
  );
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen };
}

/* ── a command ─────────────────────────────────────────────────────────── */

/* The JSON-RPC error's number is spelt through Record<'code', number>, as in rpc.ts, so the only `code`
   keys in source are refusal codes. */
type Rpc = { id: number | null; result?: any; error?: { message: string } & Record<'code', number> };

/** The machine's own BrainDog settings stay out: an empty config folder, and no BRAINDOG_ variable. */
function envFor(extra: Record<string, string>, config = join(scratch, 'empty')): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, XDG_CONFIG_HOME: config };
  for (const name of Object.keys(env)) if (name.startsWith('BRAINDOG_')) delete env[name];
  return { ...env, ...extra };
}

/* THE SERVER THIS COMMAND COMPOSES, `--local`, for the seven nights it stays beside the bridge: signed in,
   `braindog mcp` relays to the host's own `POST /mcp`, which `bridge.test.ts` holds against a real self-host. */
function launch(extra: Record<string, string>, options: { args?: string[]; config?: string } = {}) {
  const child = spawn(process.execPath, ['src/main.ts', ...(options.args ?? ['mcp', '--agent', 'claude', '--local'])], {
    cwd: APP,
    env: envFor(extra, options.config),
  });
  children.push(child);
  let out = '';
  let err = '';
  let buffer = '';
  const waiting = new Map<number | null, (reply: Rpc) => void>();
  const lines: string[] = [];

  child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
    out += chunk;
    buffer += chunk;
    let cut: number;
    while ((cut = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 1);
      lines.push(line);
      const reply = JSON.parse(line) as Rpc;
      waiting.get(reply.id)?.(reply);
    }
  });
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => (err += chunk));
  /* `close` rather than `exit`: it waits for both streams, so nothing written is missed. */
  const closed = new Promise<number | null>((done) => child.on('close', (code) => done(code)));

  let n = 0;
  /**
   * EVERY CALL WAITS UNDER A DEADLINE, BECAUSE `node --test` IMPOSES NONE OF ITS OWN. A reply that
   * never came left its promise unsettled for ever: the runner sat with no output and the file had
   * to be killed by hand, which is a hang and not a failure, and it says nothing about which call
   * was lost. One test below now makes seventeen calls where the file once made one or two, so
   * there are seventeen more ways to sit there.
   *
   * TEN SECONDS IS FOURTEEN TIMES THE SLOWEST CALL MEASURED HERE. Every call in this file was timed:
   * the longest took 706 ms, the hung read that waits out its own 400 ms budget with the child's
   * startup in front of it, and the rest came back in 330 to 410 ms. So on a machine doing nothing
   * else this does not fire, and when it does fire the child's stderr goes in the message, because a reply that
   * never arrives is usually a child that died saying why.
   */
  /* AND DOUBLED OFF CI. The timings above were taken on a machine doing nothing else, and this deadline was
     found firing on one running every workspace's tests at once, where the child's own startup waits for
     a core. A deadline is here to turn a hang into a failure, not to time anything, so off CI it is twice as long and
     on CI it is the ten seconds argued for above. */
  const DEADLINE_MS = process.env.CI ? 10_000 : 20_000;
  const expect = (id: number | null, what: string) =>
    new Promise<Rpc>((done, fail) => {
      const timer = setTimeout(
        () => fail(new Error(`${what} was never answered, after ${DEADLINE_MS} ms. The child's stderr: ${err.trim() || 'nothing'}`)),
        DEADLINE_MS,
      );
      /* `unref`, so a deadline still counting when the run is otherwise over does not hold it open. */
      timer.unref();
      waiting.set(id, (reply) => {
        clearTimeout(timer);
        done(reply);
      });
    });
  return {
    lines,
    ask(method: string, params?: Record<string, unknown>): Promise<Rpc> {
      const id = ++n;
      const reply = expect(id, `${method} (id ${id})`);
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) })}\n`);
      return reply;
    },
    /** Several requests in ONE write, as a client that pipelines sends them, and their replies in the same order. */
    together(calls: [method: string, params?: Record<string, unknown>][]): Promise<Rpc>[] {
      const sent = calls.map(([method, params]) => ({ id: ++n, method, params }));
      const replies = sent.map(({ id, method }) => expect(id, `${method} (id ${id}, sent together)`));
      child.stdin.write(sent.map(({ id, method, params }) => `${JSON.stringify({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) })}\n`).join(''));
      return replies;
    },
    /** A raw line, and the reply that carries a null id. */
    raw(line: string): Promise<Rpc> {
      const reply = expect(null, `the reply to a raw line (${line})`);
      child.stdin.write(`${line}\n`);
      return reply;
    },
    /**
     * AND THE EXIT WAITS UNDER THE SAME DEADLINE, because "it never exits" is the failure two tests
     * in this file are about. A child that stops answering is one hang; a child that answers
     * everything and then sits there on end of input is the other, and it was the one left open:
     * with `child.stdin.end()` taken out, so that the child keeps waiting for a line that never
     * comes, the file ran past 45 s and had to be killed, with no output naming the test. Under the
     * deadline the same run fails in ten seconds and says which child and what it last said.
     */
    async end() {
      child.stdin.end();
      const never = new Promise<never>((_, fail) => {
        const timer = setTimeout(
          () => fail(new Error(`the child never exited after stdin ended, after ${DEADLINE_MS} ms. The child's stderr: ${err.trim() || 'nothing'}`)),
          DEADLINE_MS,
        );
        timer.unref();
      });
      const code = await Promise.race([closed, never]);
      printed.push(out, err);
      return { code, out, err };
    },
  };
}

/** The whole answer, which is `structuredContent`; the text beside it is the brief one a model reads first. */
const said = (reply: Rpc) => reply.result.structuredContent as Record<string, unknown>;

/* ── the protocol ──────────────────────────────────────────────────────── */

test('A CLIENT OF THE NEWEST REVISION IS HANDED A LIST IT ACCEPTS', async (t) => {
  /* Every test here spoke as a 2025-06-18 client, so nothing asked what the newest one is answered. Claude Code asks
     for the newest revision, was answered with it, and then refused `tools/list` for lacking `resultType`: connected,
     with no tools, on every session. */
  const host = await stubHost(t);
  const s = launch({ BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN });

  const init = await s.ask('initialize', { protocolVersion: VERSIONS[0], capabilities: {}, clientInfo: { name: 'claude-code', version: '2.2.0' } });
  assert.equal(init.result.protocolVersion, VERSIONS[0]);
  /* THE HANDSHAKE TOO, the one result left without it, which a client of the revision may check as it checks a list. */
  assert.equal(init.result.resultType, 'complete', `initialize answered a ${VERSIONS[0]} client without resultType`);
  assert.deepEqual((await s.ask('ping')).result, { resultType: 'complete' });
  for (const method of ['tools/list', 'prompts/list', 'resources/templates/list']) {
    const listed = await s.ask(method);
    assert.equal(listed.result.resultType, 'complete', `${method} answered a ${VERSIONS[0]} client without resultType`);
  }
  assert.equal(((await s.ask('tools/list')).result.tools as unknown[]).length, TOOLS.length);
});

/* `apps/cli/src/stdio.ts` HANDS `handle` THE REVISION ITS HANDSHAKE AGREED (`agreed` in `@braindog/mcp/rpc`). A pipe
   sends no header, so without that the loop would answer every later request as the newest revision. */
test('AN OLDER CLIENT GETS A BARE PING AND NO resultType, as its own revision draws a result', async (t) => {
  /* A 2025-06-18 or 2025-11-25 client reads a ping's answer as a closed, empty result, so a key it does not know is a
     reply it may refuse; every result carried one, for every client. */
  const host = await stubHost(t);
  for (const older of ['2025-06-18', '2025-11-25']) {
    const s = launch({ BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN });
    const init = await s.ask('initialize', { protocolVersion: older, capabilities: {}, clientInfo: { name: 'strict', version: '1' } });
    assert.equal(init.result.protocolVersion, older);
    assert.equal(init.result.resultType, undefined, `initialize answered a ${older} client with resultType`);
    assert.deepEqual((await s.ask('ping')).result, {}, `ping answered a ${older} client with more than {}`);
    assert.equal((await s.ask('tools/list')).result.resultType, undefined, `tools/list answered a ${older} client with resultType`);
    assert.equal((await s.end()).code, 0);
  }
});

test('A REQUEST SENT IN THE SAME WRITE AS initialize IS ANSWERED UNDER THE REVISION IT AGREES', async (t) => {
  /* The loop read both lines before the hello was answered, so the list went out under the newest revision, with a
     `resultType` an older client may refuse. The hello is now answered before the next line is read. */
  const host = await stubHost(t);
  for (const older of ['2025-06-18', '2025-11-25']) {
    const s = launch({ BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN });
    const [init, listed, ping] = s.together([
      ['initialize', { protocolVersion: older, capabilities: {}, clientInfo: { name: 'pipelined', version: '1' } }],
      ['tools/list'],
      ['ping'],
    ]);
    assert.equal((await init!).result.protocolVersion, older);
    const list = await listed!;
    assert.equal(list.result.resultType, undefined, `tools/list sent with the hello answered a ${older} client with resultType`);
    assert.equal((list.result.tools as unknown[]).length, TOOLS.length);
    assert.deepEqual((await ping!).result, {}, `ping sent with the hello answered a ${older} client with more than {}`);
    assert.equal((await s.end()).code, 0);
  }
});

test('A SLOW HELLO DROPS AND REORDERS NOTHING: the lines behind it wait, then each is answered once, after it', async () => {
  /* The hello's reply is held 80ms in the pipe, and the input ends while it is held: the two lines read behind it are
     answered after it, under the revision it agreed, and none is lost to the end of the input. */
  const input = new PassThrough();
  const out: Rpc[] = [];
  let first = true;
  const output = new Writable({
    write(chunk: Buffer, _enc, done) {
      for (const line of chunk.toString().split('\n').filter(Boolean)) out.push(JSON.parse(line) as Rpc);
      if (first) setTimeout(done, 80);
      else done();
      first = false;
    },
  });
  const served = serveStdio({} as McpSurface<null>, () => null, input, output);
  input.end(
    [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'slow', version: '1' } } },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { jsonrpc: '2.0', id: 3, method: 'ping' },
    ]
      .map((m) => `${JSON.stringify(m)}\n`)
      .join(''),
  );
  await served;
  assert.deepEqual(out.map((r) => r.id).sort(), [1, 2, 3], 'every line is answered once');
  assert.equal(out[0]!.id, 1, 'the hello is answered first');
  assert.equal(out[0]!.result.protocolVersion, '2025-06-18');
  const list = out.find((r) => r.id === 2)!;
  assert.equal(list.result.resultType, undefined, 'the list behind a slow hello was answered under the newest revision');
  assert.deepEqual(out.find((r) => r.id === 3)!.result, {});
});

/** The two tools that carry a card (MCP Apps), and the tool-list `_meta` that attaches it for both conventions. */
const CARDS: Record<string, string> = { get: 'project', governance: 'decision' };
const cardMetaOf = (kind: string) => ({
  ui: { resourceUri: `ui://braindog/${kind}.html` },
  'openai/outputTemplate': `ui://braindog/${kind}.skybridge.html`,
  'openai/widgetAccessible': true,
});
/** The `_meta` a tool is listed with: its card, and whether a host loads it at once or finds it by its search words. */
const metaOf = (name: string): Record<string, unknown> | undefined => {
  const meta = {
    ...(CARDS[name] === undefined ? {} : cardMetaOf(CARDS[name]!)),
    ...(ALWAYS_LOADED.has(name) ? { 'anthropic/alwaysLoad': true } : SEARCH_HINTS[name] === undefined ? {} : { 'anthropic/searchHint': SEARCH_HINTS[name] }),
  };
  return Object.keys(meta).length === 0 ? undefined : meta;
};

test('initialize and tools/list answer without touching the host, and the list is what the server serves', async (t) => {
  const host = await stubHost(t);
  const s = launch({ BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN });

  const init = await s.ask('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
  assert.equal(init.result.protocolVersion, '2025-06-18');
  assert.equal(init.result.serverInfo.name, 'braindog');
  assert.match(init.result.instructions, /^BrainDog is one person's record/);

  /* THE NAMES, NOT A COUNT. This read `tools.length, 15` and went red the day a sixteenth tool
     landed, which taught nobody anything: a number a person edits to match is a number that agrees
     with whatever is there. What the command has to get right is that the list it serves is the
     server's own list, and that every name on it answers, which is the test below this one. */
  const listed = await s.ask('tools/list');
  /* THE NAMES OFF THE LIST ITSELF, NOT OFF THE MAP BELOW, because a `Map` keyed by name folds a
     repeat away: a list that served one tool twice has seventeen entries and sixteen keys, and
     comparing the keys calls that correct. A client renders what it was sent, not the set of it. */
  const names = (listed.result.tools as { name: string }[]).map((t) => t.name);
  const served = new Map((listed.result.tools as { name: string }[]).map((t) => [t.name, t]));
  assert.deepEqual(names, TOOLS.map((t) => t.name), 'the pipe dropped a tool, added one, repeated one, or changed the order');

  /**
   * AND THE WHOLE TOOL, NOT THE NAMES ALONE, which is what this asserted until it was measured. A
   * run that emptied every `description` and replaced every `inputSchema` with `{}` on the way
   * through the pipe left the names assertion green: sixteen tools arrived, correctly named, and
   * not one of them was callable, because a model chooses a tool by its description and fills it in
   * from its schema. So each tool is compared whole against the declaration it was built from, and
   * its title and hints with it, since that is what a client shows a person before it runs
   * something: a read is read-only, a write says whether it can lose anything, and none reaches
   * outside the record. This goes red when the server adds a field to a listed tool, and that is
   * right: a field that does not survive serialisation is a field the client never sees.
   */
  for (const tool of TOOLS)
    assert.deepEqual(
      served.get(tool.name),
      {
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.input,
        annotations: tool.writes
          ? { readOnlyHint: false, destructiveHint: tool.destructive === true, idempotentHint: tool.idempotent === true, openWorldHint: false }
          : { readOnlyHint: true, openWorldHint: false },
        ...((meta) => (meta === undefined ? {} : { _meta: meta }))(metaOf(tool.name)),
      },
      `${tool.name} did not survive the pipe as it was declared`,
    );

  const { code, err } = await s.end();
  assert.equal(code, 0, err);
  assert.equal(host.seen.length, 0, 'the handshake reached the host, and it must answer when the host is down');
  for (const line of s.lines) assert.equal(JSON.parse(line).jsonrpc, '2.0', `stdout carried something other than the protocol: ${line}`);
});

/* ── every advertised name, driven over the transport ──────────────────── */

/** What each tool is called with: enough to reach a method, and nothing about what it then does. */
const CALLS: Record<string, Record<string, unknown>> = {
  record_index: {},
  context: {},
  instructions: {},
  get: { spoken: 'obligations#1' },
  list: { register: 'obligations' },
  search: { q: 'rent' },
  activity: { limit: 5 },
  governance: {},
  propose: {
    question: 'Keep it?',
    body_kind: 'options',
    body: { options: [{ id: 'yes', label: 'Keep it', because: 'It is used' }, { id: 'no', label: 'Drop it', because: 'It is not' }] },
  },
  create: { register: 'obligations', fields: { what: 'Invoice 42' } },
  update: { spoken: 'obligations#1', patch: { state: 'paid' }, version: 1 },
  log: { spoken: 'obligations#1', note: 'Chased twice.' },
  handoff: { doing: 'Driving the tool list', next: 'Report what answered' },
  meet: { name: 'Ada', where: 'commit 4464966 in braindog' },
  triage: { arrival: 'a1', ignore: true },
  undo: { batch: 'b1' },
};

/** What the stub record answers each method, shaped only where a tool or a resource reads a field off it. */
const ANSWERS: Record<string, unknown> = {
  boot: { registers: [{ id: 'obligations', name: 'Obligations' }] },
  version: { version: 3 },
  whoami: { level: 'owner' },
  context: { project: 'braindog' },
  schema: { fields: [] },
  get: { register: 'obligations', seq: 1, fields: { what: 'Rent' } },
  search: [],
  history: [],
  recentHistory: { events: [] },
  metric: { value: 1200, unit: 'USD' },
  governance: [],
  propose: { spoken: 'suggestions#1' },
  create: { spoken: 'obligations#2', version: 1 },
  update: { spoken: 'obligations#1', version: 2 },
  handoff: { spoken: 'sessions#1' },
  meet: { person: 'people#1', created: true },
  triage: { id: 'a1', state: 'ignored', entry: null, already: false },
  undoOwn: { batch: 'b1', undone: 0 },
  sessionsLive: { runs: [] },
  digestToday: { lines: [] },
  actions: [],
  inbox: { rows: [], cursor: null, counts: { untriaged: 0, review: 0, skipped: 0, matched: 0, proposed: 0, ignored: 0 } },
  inboxPatterns: { patterns: [] },
  automations: [],
  arrangement: { packs: [] },
  pages: [],
  briefing: { cards: [] },
  exceptions: { exceptions: [] },
  stale: { lines: [], count: 0 },
  learnings: { rows: [], truncated: false, faded: 0 },
  widgetGallery: { widgets: [] },
  understandPlan: { dry: true, kinds: [], writes: [], more: 0, questions: [], asks: {}, done: true },
  previewPage: { page: 'handoffs', title: 'Next steps left', blocks: [] },
  instructionsMine: { run: 'S1', stamp: 's1', pending: [], stop: null, lines: ['Nothing new for you.'] },
};

/**
 * THE COUNT AGREEING IS NOT THE PROPERTY THAT MATTERS; the tool answering is.
 *
 * A name in `TOOLS` that `apps/cli/src/surface.ts` has no member for refuses `NOT_IN_THIS_BUILD` on
 * every call for ever, and an agent cannot tell that from a tool that happens to be refusing today,
 * so it spends a turn on it every session. That shipped once: `activity` was served, the record
 * routed `recentHistory`, and stdio said "not in this build" for a run because the allow-list had
 * not heard of the name (7b6fd267). `packages/mcp/test/index.test.ts` makes this claim in process;
 * this is the same claim over the transport Claude Code actually speaks, which is where it went
 * wrong, and it is the run that would have caught it.
 */
test('EVERY TOOL THE SERVER SERVES ANSWERS OVER STDIO, none of them advertised and dead', async (t) => {
  const host = await stubHost(t, ANSWERS);
  const s = launch({ BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN });
  assert.deepEqual(Object.keys(CALLS).sort(), TOOLS.map((x) => x.name).sort(), 'a tool has no call here, or a call names no tool');

  const dead: string[] = [];
  for (const tool of TOOLS) {
    const reply = await s.ask('tools/call', { name: tool.name, arguments: CALLS[tool.name]! });
    assert.ok(reply.result, `${tool.name}: ${JSON.stringify(reply.error)}`);
    if (reply.result.isError !== true) continue;
    const code = String(said(reply).code);
    t.diagnostic(`${tool.name}: ${code}`);
    if (code === 'ROUTE_UNKNOWN' || code === 'NOT_IN_THIS_BUILD') dead.push(`${tool.name} (${code})`);
  }
  assert.deepEqual(dead, [], 'a tool is advertised over stdio and no method behind it answers');

  /* AND A NAME THAT IS NOT A TOOL IS STILL REFUSED BY NAME. `credentials` was surveyed as advertised
     and dead; it is neither, because the vault needs a person in a browser and no tool was ever
     served for it. The refusal hands back the served names, so the second attempt works. */
  const refused = await s.ask('tools/call', { name: 'credentials', arguments: {} });
  assert.equal(refused.result.isError, true);
  assert.equal(said(refused).code, 'ROUTE_UNKNOWN');
  assert.deepEqual(said(refused).allowed, TOOLS.map((x) => x.name));

  const { code, err } = await s.end();
  assert.equal(code, 0, err);
});

/**
 * The same listing, built in this process over a surface that answers every method there is.
 *
 * A PROXY, NOT A STUB WRITTEN OUT MEMBER BY MEMBER, because the failure under test is a member
 * nobody added. A hand-written stub goes stale on exactly the day the list of addresses did, and
 * then the new resource is missing from both sides at once and the test stays green. Reaching any
 * property here returns a method, so a member added to `McpSurface` tomorrow answers today, and
 * what comes back is the set of addresses a client that routes everything is offered. It is given
 * the same `ANSWERS` as the stub host in the test below, so the only thing that can differ between
 * this list and the one that came over the pipe is which methods `apps/cli/src/surface.ts` and the
 * client route, which is the whole question.
 *
 * The fallback carries `rows` against the day a method with no `ANSWERS` entry is reached. None is
 * today, which was checked rather than assumed: the only one a listing can reach is `list`, for the
 * skills register, and it asks only when `boot` names one, which this `ANSWERS` does not. Give
 * `boot` a skills register and a bare `{}` here would throw on `value.rows` before any address came
 * back.
 */
async function everyAddress(): Promise<string[]> {
  const answer = (name: string) => async () => ({ ok: true, value: Object.hasOwn(ANSWERS, name) ? ANSWERS[name] : { rows: [] } });
  const complete = new Proxy({}, { get: (_target, name) => (typeof name === 'string' ? answer(name) : undefined) });
  const listing = await tools(complete as McpSurface<undefined>).resources(undefined);
  return listing.map((r) => r.uri);
}

/**
 * AND EVERY RESOURCE WITH NO PARAMETER, for the same reason and with a sharper edge.
 *
 * A resource is listed only once it has been read, so a method the allow-list is missing does not
 * refuse where anyone can see it: the address simply is not there, and nothing says why. That was
 * true of `braindog:actions` until this run: the record routes `actions`, the client's table has
 * carried the name since it was written, and `LATER` did not, so the one address that lists what
 * this BrainDog runs on a schedule was absent from every stdio session.
 */
test('AND EVERY RESOURCE WITH NO PARAMETER IS LISTED, so none of them goes quietly missing', async (t) => {
  const host = await stubHost(t, ANSWERS);
  const s = launch({ BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN });

  /* DERIVED, NOT TYPED OUT. This named ten addresses by hand, so the eleventh, landing behind an
     optional member the command line does not route, would have been absent from every session and
     absent from this test in the same breath, which is the failure the test exists to catch and the
     way `braindog:actions` was missing in the first place. The tool half of this file has always
     read its names off `TOOLS`; this half now reads its addresses off the same server. */
  const listed = await s.ask('resources/list');
  const uris = (listed.result.resources as { uri: string }[]).map((r) => r.uri);
  /* THE CARDS ARE THE SERVER'S TOO: each of the three has an address for MCP Apps hosts and one for ChatGPT. */
  const cards = ['decision', 'project', 'rule'].flatMap((kind) => [`ui://braindog/${kind}.html`, `ui://braindog/${kind}.skybridge.html`]);
  const wanted = [...(await everyAddress()), ...cards];
  assert.ok(wanted.length > 0, 'the surface offered no address at all, so this proves nothing');
  /* Sorted, because an address list is a set: what matters is that the pipe carried all of them. */
  assert.deepEqual([...uris].sort(), [...wanted].sort(), 'stdio lists a different set of addresses than the server would offer');

  const { code, err } = await s.end();
  assert.equal(code, 0, err);
});

test('A LIST CALL goes to /api/list with the bearer and the session headers, and comes back as the tool result', async (t) => {
  const host = await stubHost(t);
  const s = launch({ BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN });

  const reply = await s.ask('tools/call', { name: 'list', arguments: { register: 'obligations', where: { field: 'state', is: 'open' }, limit: 5 } });
  assert.notEqual(reply.result.isError, true, reply.result.content[0].text);
  assert.deepEqual(said(reply), COMPACTED_ROWS);
  /* AND THE TEXT IS THE BRIEF ONE, the row by its words and its handle, read from the same answer. */
  assert.match(reply.result.content[0].text, /^Rent \(obligations#1\)$/mu, reply.result.content[0].text);

  const hit = host.seen.find((x) => x.method === 'list');
  assert.ok(hit, 'the host was never asked');
  assert.equal(hit.query.get('register'), 'obligations');
  assert.deepEqual(JSON.parse(hit.query.get('where') ?? 'null'), { field: 'state', is: 'open' });
  assert.equal(hit.query.get('limit'), '5');
  assert.equal(hit.headers.authorization, `Bearer ${TOKEN}`);
  assert.equal(hit.headers['x-braindog-agent'], 'claude');
  assert.match(String(hit.headers['x-braindog-cwd']), /cli$/);

  assert.equal((await s.end()).code, 0);
});

/**
 * A FIGURE IS READ BY `get` OVER THE PIPE AS IN PROCESS. A client with tools and no resources
 * had no figure at all once the money tool left, and the command line is where Claude Code meets this server, so the
 * route is driven here and not only in `packages/mcp/test/figures.test.ts`: the id goes to the host's `metric`, never
 * its `get`, and the reading comes back as the host answered it.
 */
test('A FIGURE BY ITS ID goes to /api/metric and comes back as the reading', async (t) => {
  const host = await stubHost(t, ANSWERS);
  const s = launch({ BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN });

  const reply = await s.ask('tools/call', { name: 'get', arguments: { spoken: 'owed' } });
  assert.notEqual(reply.result.isError, true, reply.result.content[0].text);
  assert.deepEqual(said(reply), ANSWERS.metric);
  assert.deepEqual(host.seen.map((x) => x.method).filter((m) => m === 'metric' || m === 'get'), ['metric']);

  assert.equal((await s.end()).code, 0);
});

test('the token comes from the hosts file when the environment has none', async (t) => {
  const host = await stubHost(t);
  const config = join(scratch, 'signed-in');
  mkdirSync(join(config, 'braindog'), { recursive: true });
  writeFileSync(
    join(config, 'braindog', 'hosts.json'),
    JSON.stringify({ default: host.base, hosts: { [host.base]: { token: { value: TOKEN, expires: '2099-01-01T00:00:00Z', label: 'test' } } } }),
  );
  const s = launch({}, { config });
  await s.ask('tools/call', { name: 'list', arguments: { register: 'obligations' } });
  assert.equal(host.seen[0]?.headers.authorization, `Bearer ${TOKEN}`);
  assert.equal((await s.end()).code, 0);
});

test('A LINE THAT IS NOT JSON is a parse error, and the server keeps serving', async (t) => {
  const host = await stubHost(t);
  const s = launch({ BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN });
  const broken = await s.raw('{"jsonrpc":"2.0","id":');
  assert.equal(broken.error?.code, -32700);
  assert.ok((await s.ask('ping')).result);
  assert.equal((await s.end()).code, 0);
});

/* ── when the host does not answer ─────────────────────────────────────── */

test('A HOST THAT DOES NOT ANSWER gets the unreachable sentence once the budget runs out', async (t) => {
  const host = await stubHost(t);
  const s = launch({ BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN, BRAINDOG_TIMEOUT_MS: '400' });

  const started = Date.now();
  const reply = await s.ask('tools/call', { name: 'list', arguments: { register: 'hangs' } });
  const waited = Date.now() - started;
  assert.ok(waited >= 350, `it gave up after ${waited} ms, before its budget`);
  assert.equal(reply.result.isError, true);
  /* THE REASON RIDES IN `detail` (as the client's refusal carries it), beside the sentence and never as it. */
  const { detail, ...refused } = said(reply) as { detail?: unknown };
  assert.deepEqual(refused, { code: 'UNREACHABLE', fix: UNREACHABLE_FIX });
  assert.equal(typeof detail, 'string');

  /* And while one call waits, the others are not held behind it. */
  const slow = s.ask('tools/call', { name: 'list', arguments: { register: 'hangs' } });
  assert.ok((await s.ask('ping')).result, 'a ping waited behind a hung call');
  await slow;
  assert.equal((await s.end()).code, 0);
});

test('a host with nothing listening gets the same sentence', async () => {
  const closed = createServer();
  await new Promise<void>((done) => closed.listen(0, '127.0.0.1', done));
  const { port } = closed.address() as AddressInfo;
  await new Promise<void>((done) => closed.close(() => done()));

  const s = launch({ BRAINDOG_HOST: `http://127.0.0.1:${port}`, BRAINDOG_TOKEN: TOKEN });
  const reply = await s.ask('tools/call', { name: 'record_index', arguments: {} });
  assert.equal(said(reply).fix, UNREACHABLE_FIX);
  assert.equal((await s.end()).code, 0);
});

/* ── the end of input ──────────────────────────────────────────────────── */

test('WHEN STDIN ENDS, the calls in flight are answered before the process exits', async (t) => {
  const host = await stubHost(t);
  const s = launch({ BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN });
  const late = s.ask('tools/call', { name: 'list', arguments: { register: 'late' } });
  const ping = s.ask('ping');
  const { code, err } = await s.end();
  assert.equal(code, 0, err);
  assert.deepEqual(said(await late), COMPACTED_ROWS);
  assert.ok((await ping).result);
});

test('AND AFTER A SESSION OF CALLS, ONE AT A TIME, IT STILL EXITS 0 when stdin ends', async (t) => {
  /* An agent's session is many calls over one keep-alive connection. `process.exit` straight after the
     last reply aborted Node 24 on Windows with a libuv assertion, every time, once there had been a few. */
  const host = await stubHost(t);
  const s = launch({ BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN });
  for (let i = 0; i < 6; i++) assert.deepEqual(said(await s.ask('tools/call', { name: 'list', arguments: { register: 'tasks' } })), COMPACTED_ROWS);
  const { code, err } = await s.end();
  assert.equal(code, 0, err);
  assert.doesNotMatch(err, /Assertion failed/);
});

/* ── when it cannot start ──────────────────────────────────────────────── */

test('A STARTUP FAILURE IS ONE LINE ON STDERR, nothing on stdout, and exit 1', async () => {
  const expired = join(scratch, 'expired');
  mkdirSync(join(expired, 'braindog'), { recursive: true });
  writeFileSync(
    join(expired, 'braindog', 'hosts.json'),
    JSON.stringify({ default: 'https://a.example', hosts: { 'https://a.example': { token: { value: TOKEN, expires: '2020-01-01T00:00:00Z', label: 'test' } } } }),
  );
  const cases: [Record<string, string>, { args?: string[]; config?: string }, RegExp][] = [
    [{}, {}, /^No BrainDog host is set\./],
    [{}, { config: expired }, /^The login to https:\/\/a\.example expired on 1 Jan 2020\. Run braindog login https:\/\/a\.example\.$/],
    [{ BRAINDOG_HOST: 'http://a.example', BRAINDOG_TOKEN: TOKEN }, {}, /^http:\/\/a\.example is http, not https\./],
    [{ BRAINDOG_HOST: 'https://a.example' }, { args: ['mcp', TOKEN] }, /^braindog mcp takes --agent, --host and --local, and nothing else\./],
    [{ BRAINDOG_HOST: 'https://a.example' }, { args: ['mcp', '--agent', 'robot'] }, /^--agent is one of claude, codex, cursor, other\.$/],
  ];
  for (const [env, options, pattern] of cases) {
    const { code, out, err } = await launch(env, options).end();
    assert.equal(code, 1, err);
    assert.equal(out, '', 'a startup failure wrote to stdout');
    assert.equal(err.trimEnd().split('\n').length, 1, `more than one line: ${err}`);
    assert.match(err.trim(), pattern);
  }
});

/* ── the other commands ────────────────────────────────────────────────── */

test('INIT AND SERVE ARE THE SELF-HOST\'S, spawned with their arguments and their exit code', () => {
  const entry = join(scratch, 'selfhost.mjs');
  writeFileSync(entry, 'process.stderr.write(JSON.stringify(process.argv.slice(2))); process.exit(7);\n');
  for (const args of [['init', 'the-studio', '--owner', 'ada@example.com'], ['serve']]) {
    const r = spawnSync(process.execPath, ['src/main.ts', ...args], { cwd: APP, env: envFor({ BRAINDOG_SELFHOST: entry }), encoding: 'utf8' });
    assert.equal(r.status, 7);
    assert.deepEqual(JSON.parse(r.stderr), args);
    printed.push(r.stdout, r.stderr);
  }

  const missing = spawnSync(process.execPath, ['src/main.ts', 'init', 'x'], {
    cwd: APP,
    env: envFor({ BRAINDOG_SELFHOST: join(scratch, 'nowhere.mjs') }),
    encoding: 'utf8',
  });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /^braindog init needs the self-host\. Set BRAINDOG_SELFHOST to its entry file\.$/m);
});

test('nothing is listed as coming later, and an unknown command is not echoed unless it is a plain word', () => {
  const run = (...args: string[]) => {
    const r = spawnSync(process.execPath, ['src/main.ts', ...args], { cwd: APP, env: envFor({}), encoding: 'utf8' });
    printed.push(r.stdout, r.stderr);
    return r;
  };
  /* EVERY COMMAND OF THE AGENT PATH'S §4.2 IS BUILT, so the sentence that named one and did nothing is
     gone with the list behind it. A command that answers "not built yet" and a command that does not
     exist read the same to a person typing quickly, and only one of them is a typo. */
  const built = run('logout', '--help');
  assert.doesNotMatch(built.stderr, /is not built yet/, built.stderr);

  const typo = run('mpc');
  assert.equal(typo.status, 1);
  assert.match(typo.stderr, /^braindog has no command called mpc\./);

  const pasted = run(TOKEN);
  assert.equal(pasted.status, 1);
  assert.match(pasted.stderr, /^braindog has no such command\./);

  const help = run('--help');
  assert.equal(help.status, 0);
  /* THE HELP IS GROUPED BY WHAT A PERSON DOES, one short line a command; the long text is the command's own --help. */
  const rows = help.stdout.split(/\r?\n/);
  assert.ok(rows.length < 80, `${rows.length} lines`);
  const groups = ['Sign in:', 'Keys:', 'Agents and sessions:', 'Records:', 'Plugins:', 'Sync:', 'Other:'];
  const at = groups.map((g) => rows.indexOf(g));
  assert.ok(at.every((n) => n >= 0) && at.every((n, k) => k === 0 || n > at[k - 1]!), `groups out of order: ${at}`);
  for (const row of rows.filter((l) => l.startsWith('  '))) assert.ok(row.length <= 90, row);
  assert.match(help.stdout, /^  login <host> +\S/m);
  assert.match(help.stdout, /^  keys put <label> +\S/m);
  assert.match(help.stdout, /^  addon new\|check\|test\|preview +\S.*\(also: pack\)$/m);
  assert.doesNotMatch(help.stdout, /^braindog (?:login|keys|addon|pack) /m);

  /* A COMMAND'S OWN HELP KEEPS ITS LONG TEXT, and `pack` answers as `addon` does. */
  const own = run('keys', '--help');
  assert.equal(own.status, 0);
  assert.match(own.stdout, /^braindog keys put <label>/m);
  const addon = run('addon', '--help');
  assert.equal(addon.status, 0);
  assert.match(addon.stdout, /^braindog addon new <id>/m);
  assert.doesNotMatch(addon.stdout, /braindog pack /);
  assert.equal(run('pack', '--help').stdout, addon.stdout);
  assert.doesNotMatch(help.stdout, /Not built yet: .*(?:skills|tools)/);

  /* EVERY COMMAND THE SERVER'S INSTRUCTIONS NAME IS ONE THIS HELP LISTS. They told every agent to run
     `braindog key add`, which was never a command, so the one way to deposit a key was a typo. */
  const named = [...INSTRUCTIONS.matchAll(/braindog ([a-z]+(?: [a-z]+)?)/g)].map((m) => m[1]!);
  assert.ok(named.length > 0, 'the instructions name no command, so this proves nothing');
  for (const command of named) assert.match(help.stdout, new RegExp(`^  ${command}(?![a-z])`, 'm'), command);
});

/* ── last, over everything above ───────────────────────────────────────── */

test('THE TOKEN WAS NEVER PRINTED, on stdout or stderr, by any run above', () => {
  assert.ok(printed.length > 20, 'the runs above printed nothing, so this proves nothing');
  const all = printed.join('\n');
  assert.equal(all.includes(TOKEN), false, 'the token was printed');
  assert.equal(all.includes('stub-bearer-never-printed'), false, 'the secret half of the token was printed');
});
