/**
 * `braindog mcp` as a thin bridge: each line the app writes goes to the host's own `POST /mcp`, and its answer comes back
 * as one line (AGT-A03).
 *
 * THE SERVER IS THE HOST'S, NOT THIS COMMAND'S. Before this the command composed the server itself over a surface of one
 * host call per method (`surface.ts`), so a deploy reached no agent until its machine updated the command, and every
 * open session kept the tool list of the build it started with. Now the tools, their sentences and the instructions are
 * whatever the host serves, and one suite tests both transports.
 *
 * ONE MESSAGE PER LINE, ANSWERED AS IT FINISHES, the framing of `stdio.ts`: requests go out side by side and the id pairs
 * a reply with its request. `initialize` is answered before the next line is read, because what it agrees is how every
 * later request is sent. `ping` is answered on the machine; `notifications/cancelled` stops the request it names, and
 * nothing is written for that request after.
 *
 * WHAT LEAVES: the machine's bearer, `content-type: application/json`, `x-braindog-cli`, the session headers, the headers
 * that mirror the body (`packages/mcp/src/http.ts`, step 7), and, on a request that has `params`, the session hints as
 * `params._meta.session`. NO `Origin`, which the door refuses. A key the app set in `_meta.session` itself is left as
 * the app set it.
 *
 * WHAT COMES BACK. 200 with a body: written as one line. 202: nothing. 401: the sign-in ended while the session was open,
 * so this answer and every later one come from the refusing server (`signed-out.ts`). A network failure, a 5xx or the
 * budget: the refusal `UNREACHABLE` with its sentence (`surface.ts`).
 *
 * A WRITE WHOSE ANSWER WAS LOST IS SENT ONCE MORE, AND IS STILL ONE ENTRY (AGT-B05). A timeout does not say whether the
 * host wrote: before this the call was never sent twice, so the agent was told it failed and wrote it again itself, two
 * tasks for one "add a task". Now a `create` or an `update` carries an operation id, the app's own or one made here, and
 * an answer that never came sends the same call with the same id once more. The record keeps the id on the first line of
 * the write and answers a second sending with the first one's entry (`packages/kernel/src/index.ts`, `opId`), so the
 * retry is one entry however many times it lands. Only when the host's listed `inputSchema` for that tool names
 * `op_id`: a host that predates it refuses an argument it does not list, and every write would fail. A read is never
 * sent twice, and nothing else is.
 *
 * A DEPLOY MID-SESSION IS SEEN. Every answer carries `braindog-build` (AGT-A02). When it differs from the one seen at the
 * handshake, the bridge writes one `notifications/tools/list_changed` and refreshes its cache, and the handshake told
 * the app `tools.listChanged`, so the app asks for the new list.
 *
 * A HOST AWAY AT THE START is served from the cache (`bridge-cache.ts`): its last good handshake and tool list, every
 * tool refusing with the sentence. With no cache the bundled server answers the handshake, as it does signed out.
 *
 * STDOUT CARRIES THE PROTOCOL AND NOTHING ELSE, and no line written anywhere holds the bearer.
 */

import { homedir } from 'node:os';
import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';

import type { McpSurface } from '@braindog/mcp';
import { agreed, handle, VERSIONS, type Reply } from '@braindog/mcp/rpc';

import { readDoorCache, writeDoorCache, type DoorCache } from './bridge-cache.ts';
import { BUDGET_MS, type Target } from './http.ts';
import { loginCommand } from './login.ts';
import { cliBuild, type ClientInfo } from './position.ts';
import { signedOutSurface } from './signed-out.ts';
import { helloOf } from './stdio.ts';
import { UNREACHABLE_FIX, type Ctx } from './surface.ts';

/** Where the bridge reads and writes, and what it may be told in place of its defaults (a test's fetch and folder). */
export type BridgeIo = {
  input: Readable;
  output: Writable;
  /** A line for whoever reads the server's log, on stderr. Never the protocol, never a key. */
  say?: ((line: string) => void) | undefined;
  /** The folder `.braindog/cache` is under: the home folder unless a test names another. */
  home?: string | undefined;
  /** The budget of one request, twenty seconds unless `BRAINDOG_TIMEOUT_MS` says otherwise (`budgetOf`). */
  ms?: number | undefined;
  fetch?: typeof globalThis.fetch | undefined;
  /** The sentence a call refuses with once the host has said the sign-in ended. Left out, the one written here. */
  signedOut?: string | undefined;
};

/**
 * The session headers for a request, given what the app said it is in its hello: `sessionHeaders` in `position.ts`,
 * read per request by the caller because the start hook may write the session file after the server starts.
 */
export type Hints = (client: ClientInfo) => Promise<Record<string, string>>;

type Message = Record<string, unknown>;
type Id = string | number;
type Refusal = { code: string; fix: string; at?: string };

const isObject = (x: unknown): x is Message => typeof x === 'object' && x !== null && !Array.isArray(x);
const idOf = (m: Message): Id | null => (typeof m.id === 'string' || typeof m.id === 'number' ? m.id : null);

/** The ten hints `_meta.session` carries (`packages/host/src/session.ts`), each by the header that says it. */
const HINT_OF: Readonly<Record<string, string>> = {
  'x-braindog-session': 'spoken',
  'x-braindog-client': 'client_id',
  'x-braindog-host': 'host',
  'x-braindog-repo': 'repo',
  'x-braindog-remote': 'remote',
  'x-braindog-cwd': 'cwd',
  'x-braindog-agent': 'agent',
  'x-braindog-client-name': 'client',
  'x-braindog-client-version': 'client_version',
  'x-braindog-parent': 'parent',
};

/** The hints the session headers say, as `_meta.session` spells them. `x-braindog-cli` stays a header. */
export function hintsOfHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) if (HINT_OF[name] !== undefined) out[HINT_OF[name]] = value;
  return out;
}

/**
 * The message with `params._meta.session` set to the hints, under any key the app set itself. A message with no
 * `params`, or a `_meta.session` that is not an object, goes as the app wrote it.
 */
export function withHints(message: Message, hints: Record<string, string>): Message {
  if (!isObject(message.params) || Object.keys(hints).length === 0) return message;
  const meta = isObject(message.params._meta) ? message.params._meta : {};
  if (Object.hasOwn(meta, 'session') && !isObject(meta.session)) return message;
  const own = isObject(meta.session) ? meta.session : {};
  return { ...message, params: { ...message.params, _meta: { ...meta, session: { ...hints, ...own } } } };
}

/** An `Mcp-Name` a header can carry: the name, or the `=?base64?…?=` form the door decodes for one it cannot. */
const nameHeader = (name: string): string =>
  /^[\x20-\x7e]*$/.test(name) && !name.startsWith('=?base64?') ? name : `=?base64?${Buffer.from(name, 'utf8').toString('base64')}?=`;

/** The revision a request's own `_meta` names, as a request of the stateless revision does. */
const versionIn = (m: Message): string | undefined => {
  const meta = isObject(m.params) && isObject(m.params._meta) ? m.params._meta : {};
  const v = meta['io.modelcontextprotocol/protocolVersion'];
  return typeof v === 'string' ? v : undefined;
};

/** Whether a result answered under `version` says `resultType`, as `rpc.ts` decides it: the stateless revision or later. */
const stateless = (version: string | undefined): boolean => version === undefined || (/^\d{4}-\d{2}-\d{2}$/.test(version) && version >= VERSIONS[0]);

/** A tool call refused, in the shape the host answers one: the refusal as the text, and whole beside it. */
const toolRefusal = (id: Id, refusal: Refusal, version: string | undefined): Reply => ({
  jsonrpc: '2.0',
  id,
  result: { ...(stateless(version) ? { resultType: 'complete' } : {}), isError: true, content: [{ type: 'text', text: JSON.stringify(refusal) }], structuredContent: refusal },
});

/**
 * The bundled server with every member refusing `UNREACHABLE`: what answers the handshake, a list and a read when the
 * host is away and nothing is cached. Built from the signed-out surface's members, so a member added there is here too.
 */
function unreachableSurface(): McpSurface<Ctx> {
  const no = () => Promise.resolve({ ok: false as const, refusal: { code: 'UNREACHABLE', fix: UNREACHABLE_FIX } });
  return Object.fromEntries(Object.keys(signedOutSurface('')).map((name) => [name, no])) as unknown as McpSurface<Ctx>;
}

/** The tools a lost answer is sent again for: the two that write and take an operation id (AGT-B05). */
const RETRIED: ReadonlySet<string> = new Set(['create', 'update']);

/** The names of the tools a `tools/list` result says take `op_id`, read from each one's `inputSchema`. */
export function opTools(list: unknown): Set<string> {
  const out = new Set<string>();
  for (const tool of isObject(list) && Array.isArray(list.tools) ? list.tools : []) {
    if (!isObject(tool) || typeof tool.name !== 'string' || !isObject(tool.inputSchema)) continue;
    const props = tool.inputSchema.properties;
    if (isObject(props) && Object.hasOwn(props, 'op_id')) out.add(tool.name);
  }
  return out;
}

/**
 * The call as it is sent, and whether a lost answer may send it again: a `create` or an `update` carrying the app's own
 * `op_id`, or one made here when the host lists the argument for that tool (`takes`). Anything else goes as the app
 * wrote it, and once.
 */
export function withOpId(message: Message, takes: ReadonlySet<string>, mint: () => string = () => `op_${crypto.randomUUID()}`): { message: Message; again: boolean } {
  const params = isObject(message.params) ? message.params : undefined;
  if (message.method !== 'tools/call' || params === undefined || typeof params.name !== 'string' || !RETRIED.has(params.name)) return { message, again: false };
  const args = params.arguments ?? {};
  if (!isObject(args)) return { message, again: false };
  if (typeof args.op_id === 'string' && args.op_id !== '') return { message, again: true };
  /* AN ID THE APP SENT IN ANOTHER SHAPE is the host's to refuse, and is never replaced by one made here. */
  if (args.op_id !== undefined || !takes.has(params.name)) return { message, again: false };
  return { message: { ...message, params: { ...params, arguments: { ...args, op_id: mint() } } }, again: true };
}

/** What one POST came to. */
type Outcome =
  | { kind: 'answer'; reply: Reply | null; build: string | null }
  | { kind: 'signed-out' }
  | { kind: 'away' }
  | { kind: 'refused'; refusal: Refusal; build: string | null };

/**
 * Serve until the input ends, then finish every request already in flight. Resolves once the last reply is flushed.
 *
 * `target` is the host and its bearer (`http.ts`), `hints` the session headers for a request.
 */
export async function serveBridge(io: BridgeIo, target: Target, hints: Hints): Promise<void> {
  const ms = io.ms ?? BUDGET_MS;
  const go = io.fetch ?? globalThis.fetch;
  const say = io.say ?? (() => undefined);
  const home = io.home ?? homedir();
  const ctx = (): Ctx => ({ signal: AbortSignal.timeout(ms) });
  const offline = unreachableSurface();

  /* THE REVISION THE HANDSHAKE AGREED, mirrored as `MCP-Protocol-Version` on every later request. */
  let version: string | undefined;
  let client: ClientInfo = {};
  /* THE HOST'S BUILD AS THE APP'S TOOL LIST KNOWS IT. `local` is true while that list is the cache's or the bundled
     server's, so the host's first answer says whether the app should list again. */
  let build: string | null = null;
  let local = false;
  /* SET BY A 401, AND NEVER UNSET: from then on the refusing server answers, as for a machine not signed in. */
  let refusing: McpSurface<Ctx> | null = null;
  let cache: DoorCache | null = readDoorCache(home, target.key);
  let refreshes = 0;
  /* THE TOOLS THE HOST SAYS TAKE `op_id`, from the last list it answered, or the cache's while it has answered none. */
  let takes = opTools(cache?.tools);

  const open = new Map<Id, AbortController>();
  const inFlight = new Set<Promise<void>>();
  /* Settled by the write's own callback, which is what makes "flushed" true on a Windows pipe. */
  const send = (reply: unknown) => new Promise<void>((done) => io.output.write(`${JSON.stringify(reply)}\n`, () => done()));
  const track = (job: Promise<void>) => {
    inFlight.add(job);
    void job.finally(() => inFlight.delete(job));
  };
  const onMachine = (message: unknown, surface: McpSurface<Ctx>, m?: Message) => handle(message, surface, ctx(), target.base, (m && versionIn(m)) ?? version);

  /** One POST to the host's `/mcp`, and what came of it. Never throws, and no sentence here quotes the request. */
  const post = async (message: Message, signal: AbortSignal): Promise<Outcome> => {
    /* A HINT THAT CANNOT BE READ IS A REQUEST WITHOUT HINTS, never one left unanswered. */
    const session = await hints(client).catch(() => ({}) as Record<string, string>);
    const headers = new Headers({ 'content-type': 'application/json', accept: 'application/json', 'x-braindog-cli': cliBuild() });
    if (target.token) headers.set('authorization', `Bearer ${target.token}`);
    for (const [name, value] of Object.entries(session)) headers.set(name, value);
    const method = typeof message.method === 'string' ? message.method : undefined;
    const v = versionIn(message) ?? version;
    if (v !== undefined && method !== 'initialize') headers.set('mcp-protocol-version', v);
    if (method !== undefined) headers.set('mcp-method', method);
    const params = isObject(message.params) ? message.params : {};
    const named = method === 'resources/read' ? params.uri : method === 'tools/call' || method === 'prompts/get' ? params.name : undefined;
    if (typeof named === 'string') headers.set('mcp-name', nameHeader(named));
    let res: Response;
    try {
      res = await go(`${target.base}/mcp`, { method: 'POST', headers, body: JSON.stringify(withHints(message, hintsOfHeaders(session))), redirect: 'error', signal });
    } catch {
      /* The error could quote the request, and the request holds the bearer. */
      return { kind: 'away' };
    }
    const seen = res.headers.get('braindog-build');
    if (res.status === 401) {
      await res.body?.cancel().catch(() => undefined);
      return { kind: 'signed-out' };
    }
    if (res.status >= 500) {
      await res.body?.cancel().catch(() => undefined);
      return { kind: 'away' };
    }
    if (res.status === 202) return { kind: 'answer', reply: null, build: seen };
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { kind: 'away' };
    }
    if (isObject(body) && body.jsonrpc === '2.0') return { kind: 'answer', reply: body as Reply, build: seen };
    /* A 403 FOR SOMEBODY NO LONGER ON THE RECORD, OR A 429, is the record's refusal in the shape `/api` gives it. */
    const r = isObject(body) ? body.refusal : undefined;
    if (isObject(r) && typeof r.code === 'string' && typeof r.fix === 'string') return { kind: 'refused', refusal: { code: r.code, fix: r.fix }, build: seen };
    return { kind: 'away' };
  };

  /** The tool list again, after a deploy, kept for a session that starts while the host is away. Nothing is written. */
  const refresh = () => {
    const message = { jsonrpc: '2.0', id: `bridge-refresh-${++refreshes}`, method: 'tools/list', params: {} };
    void post(message, AbortSignal.timeout(ms)).then((got) => {
      if (got.kind !== 'answer' || got.reply === null || !('result' in got.reply) || !isObject(got.reply.result)) return;
      writeDoorCache(home, target.key, { build: got.build ?? undefined, tools: got.reply.result });
      takes = opTools(got.reply.result);
      cache = readDoorCache(home, target.key);
    });
  };

  /** What the host's build on an answer means for the app's tool list. */
  const heard = (now: string | null) => {
    if (local) {
      local = false;
      /* THE SAME BUILD IS THE SAME LIST only when the list the app was given was the cache's. A cache with a handshake
         and no list gave it the bundled server's, which is this command's, not the host's. */
      const same = now !== null && cache?.build === now && cache.tools !== undefined;
      build = now;
      if (!same) {
        track(send({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' }));
        refresh();
      }
      return;
    }
    if (now === null) return;
    if (build === null) build = now;
    else if (now !== build) {
      build = now;
      say('BrainDog was updated while this session was open, so its tools are listed again.');
      track(send({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' }));
      refresh();
    }
  };

  /** The app is told the bridge can say a list changed, because now it can. `capabilities` is left as is otherwise. */
  const listChanged = (reply: Reply): Reply => {
    if (!('result' in reply) || !isObject(reply.result) || !isObject(reply.result.capabilities)) return reply;
    const caps = reply.result.capabilities;
    const tools = isObject(caps.tools) ? caps.tools : {};
    return { ...reply, result: { ...reply.result, capabilities: { ...caps, tools: { ...tools, listChanged: true } } } };
  };

  /**
   * The answer while the host is away. The handshake is the bundled server's, which agrees a revision with this app,
   * carrying the cached server's name, instructions and capabilities; the list is the cached one; a tool call refuses.
   */
  const away = async (message: Message, id: Id | null): Promise<Reply | null> => {
    const v = versionIn(message) ?? version;
    if (id !== null && message.method === 'tools/call') return toolRefusal(id, { code: 'UNREACHABLE', fix: UNREACHABLE_FIX }, v);
    if (id !== null && message.method === 'tools/list' && cache?.tools !== undefined && !(isObject(message.params) && message.params.cursor !== undefined)) {
      const { resultType: _was, ...listed } = cache.tools;
      return { jsonrpc: '2.0', id, result: { ...(stateless(v) ? { resultType: 'complete' } : {}), ...listed } };
    }
    const reply = await onMachine(message, offline, message);
    if (message.method === 'initialize' && reply !== null && 'result' in reply && isObject(reply.result) && cache !== null) {
      const { serverInfo, instructions, capabilities } = cache.initialize;
      return { ...reply, result: { ...reply.result, ...(isObject(serverInfo) ? { serverInfo } : {}), ...(typeof instructions === 'string' ? { instructions } : {}), ...(isObject(capabilities) ? { capabilities } : {}) } };
    }
    return reply;
  };

  /** One message the app wrote, sent and answered. */
  const forward = async (message: Message): Promise<void> => {
    const id = idOf(message);
    const method = message.method;
    const stop = new AbortController();
    if (id !== null) open.set(id, stop);
    let reply: Reply | null;
    try {
      const sent = withOpId(message, takes);
      const once = () => post(sent.message, AbortSignal.any([stop.signal, AbortSignal.timeout(ms)])).catch((): Outcome => ({ kind: 'away' }));
      let got = await once();
      /* SENT ONCE MORE WITH THE SAME ID, and only once: a host away twice is away, and the agent is told so. */
      if (got.kind === 'away' && sent.again && !stop.signal.aborted) {
        say('A write got no answer from the host, so it was sent once more with the same operation id.');
        got = await once();
      }
      /* CANCELLED BY THE APP: it has said it will not read the answer, so none is written. */
      if (stop.signal.aborted) return;
      if (got.kind === 'signed-out') {
        if (refusing === null) say('The host no longer accepts this sign-in, so every call now answers how to sign in again.');
        refusing ??= signedOutSurface(io.signedOut ?? endedFix(target.key));
        reply = await onMachine(message, refusing, message);
      } else if (got.kind === 'away') {
        reply = await away(message, id);
        if (method === 'initialize') local = true;
      } else if (got.kind === 'refused') {
        heard(got.build);
        /* The number is a variable, as in `stdio.ts`, so every `code` key written here is a refusal code. */
        const internal = -32603;
        reply = id === null ? null : method === 'tools/call' ? toolRefusal(id, got.refusal, versionIn(message) ?? version) : { jsonrpc: '2.0', id, error: { code: internal, message: got.refusal.fix } };
      } else {
        reply = got.reply;
        if (method === 'initialize' && reply !== null && 'result' in reply && isObject(reply.result)) {
          build = got.build;
          writeDoorCache(home, target.key, { build: got.build ?? undefined, initialize: reply.result });
          cache = readDoorCache(home, target.key);
        } else heard(got.build);
        if (method === 'tools/list' && reply !== null && 'result' in reply && isObject(reply.result) && !(isObject(message.params) && message.params.cursor !== undefined)) {
          writeDoorCache(home, target.key, { build: got.build ?? undefined, tools: reply.result });
          takes = opTools(reply.result);
        }
      }
    } finally {
      if (id !== null) open.delete(id);
    }
    if (reply === null) return;
    if (method === 'initialize' || method === 'server/discover') {
      version = agreed(reply) ?? version;
      reply = listChanged(reply);
    }
    await send(reply);
  };

  for await (const line of createInterface({ input: io.input, crlfDelay: Infinity })) {
    if (!line.trim()) continue;
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      /* JSON-RPC's parse error, spelt through a variable as `stdio.ts` spells it. */
      const code = -32700;
      track(send({ jsonrpc: '2.0', id: null, error: { code, message: 'This line is not JSON. Send one JSON-RPC message per line.' } }));
      continue;
    }
    const said = helloOf(message);
    if (said !== null) client = said;
    let job: Promise<void>;
    if (!isObject(message) || refusing !== null || message.method === 'ping') {
      /* A MALFORMED MESSAGE, A PING, AND EVERYTHING AFTER A 401 are answered on the machine. */
      const surface = refusing ?? offline;
      job = onMachine(message, surface, isObject(message) ? message : undefined).then((reply) => {
        if (reply === null) return;
        if (isObject(message) && message.method === 'initialize') {
          version = agreed(reply) ?? version;
          reply = listChanged(reply);
        }
        return send(reply);
      });
    } else if (message.method === 'notifications/cancelled') {
      const asked = isObject(message.params) ? message.params.requestId : undefined;
      if (typeof asked === 'string' || typeof asked === 'number') open.get(asked)?.abort();
      continue;
    } else job = forward(message);
    /* THE HELLO IS ANSWERED BEFORE THE NEXT LINE IS READ, as in `stdio.ts`: what it agrees is how the rest are sent. */
    if (isObject(message) && message.method === 'initialize') await job;
    else track(job);
  }

  while (inFlight.size > 0) await Promise.all(inFlight);
}

/** The sentence every call answers once the host has said this machine's sign-in ended, in `signedOutFix`'s words. */
export const endedFix = (host: string): string =>
  `The login to ${host} ended, so nothing was read or written. Tell the person to run ${loginCommand(host)} in a terminal, then start a new session. Until then do not answer from memory, and say that BrainDog is not signed in.`;
