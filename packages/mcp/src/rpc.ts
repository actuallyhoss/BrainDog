/**
 * JSON-RPC 2.0, the framing both transports share.
 *
 * ONE FUNCTION, AND IT IS PURE. `handle` takes one parsed message and returns one reply, or `null`
 * for a notification, which is never answered. The command line's stdio loop and the hosts'
 * `POST /mcp` each do their own reading and writing around it, so the two cannot drift in what they
 * say. No `node:` module and no `process`, which the `stack`
 * and `graph` gates require of anything under `packages/`.
 *
 * STATELESS. `initialize` negotiates a version and hands over the instructions, and nothing is
 * remembered: every message stands alone, which is what a Worker that keeps nothing can serve. The one exception is
 * when a caller's calls were last marked (`calledBy`), which writes fewer marks and changes no reply.
 */

import { refused, type Result } from '@braindog/ports';

import { INSTRUCTIONS } from './instructions.ts';

export { INSTRUCTIONS };
import { HOUR, MINUTE, TEMPLATES, TOOLS, tools, ttlOf, type McpSurface, type Said, type Tool } from './index.ts';
import { refusalBrief } from './brief.ts';

/**
 * Newest first. `initialize` answers with one of these, as `negotiate` picks it.
 *
 * 2025-11-25 IS SPOKEN AND ANSWERED AS ITSELF. It was missing, so a client of that revision was answered 2025-06-18,
 * and over HTTP every later request that said `MCP-Protocol-Version: 2025-11-25` was refused -32022 as a version this
 * server does not speak. Nothing it asks of a server is beyond this one: tools that refuse a bad argument as a tool
 * error the model can read rather than a protocol error, a 403 for any `Origin`, no batches, and a `title` beside
 * every name, all of which `http.ts` and this file already do.
 */
export const VERSIONS = ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26'] as const;

export const METHODS = [
  'initialize',
  'server/discover',
  'ping',
  'tools/list',
  'tools/call',
  'resources/list',
  'resources/templates/list',
  'resources/read',
  'prompts/list',
] as const;

type Id = string | number;

/**
 * THE ERROR'S NUMBER IS SPELT THROUGH `Record<'code', number>`, so that every `code:` written in this
 * package is a refusal code. The `refusals` gate reads those, and a JSON-RPC number is not one.
 */
type RpcError = { message: string; data?: unknown } & Record<'code', number>;

export type Reply =
  | { jsonrpc: '2.0'; id: Id; result: unknown }
  | { jsonrpc: '2.0'; id: Id | null; error: RpcError };

/** JSON-RPC's own numbers, and MCP's for a resource that is not there. */
const RPC = { invalid: -32600, method: -32601, params: -32602, internal: -32603, resource: -32002 } as const;

const answer = (id: Id, result: unknown): Reply => ({ jsonrpc: '2.0', id, result });

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Whether a revision is the stateless one or later, the first to put `resultType` on a result. Only a date is one. */
const stateless = (version: string): boolean => DATE.test(version) && version >= VERSIONS[0];

/**
 * A result, which says it is whole when the revision it is answered under asks that.
 *
 * THE 2026-07-28 REVISION REQUIRES `resultType` ON EVERY RESULT. Only `server/discover` carried the field, so a client
 * of the revision took the handshake, then refused `tools/list`, `prompts/list` and both resource lists as invalid:
 * Claude Code connected, read the instructions and exposed none of the tools, on every session.
 *
 * AND ONLY THAT REVISION GETS IT. A client of 2025-11-25 or earlier reads `ping` against a closed, empty result, so a
 * key it does not know is a reply it may refuse; it is answered as its own revision draws a result, with nothing added.
 */
const whole = (id: Id, result: Record<string, unknown>, version: string): Reply =>
  answer(id, stateless(version) ? { resultType: 'complete', ...result } : result);

/**
 * The revision a request is answered under: the one its own `_meta` names, as every request of the stateless revision
 * does, else the one its transport knows (the HTTP header, or what `initialize` agreed on a stdio pipe), else the newest.
 *
 * THE NEWEST WHEN NOTHING SAYS, because a caller built before `version` was handed in passes nothing, and the client
 * that broke without `resultType` was the newest one. HTTP always says: `serveMcp` hands the header, or 2025-03-26, the
 * revision the specification tells a server to assume when a request carries no header.
 */
function revisionOf(params: Record<string, unknown>, version: string | undefined): string {
  const meta = isObject(params._meta) ? params._meta : {};
  const said = meta['io.modelcontextprotocol/protocolVersion'];
  return typeof said === 'string' && DATE.test(said) ? said : (version ?? VERSIONS[0]);
}

/**
 * The version an `initialize` reply agreed, or `null` for any other reply: what a stdio loop keeps, since a pipe sends
 * no header and its later requests are answered under the revision the handshake chose.
 */
export function agreed(reply: Reply | null): string | null {
  if (reply === null || !('result' in reply) || !isObject(reply.result)) return null;
  const v = reply.result.protocolVersion;
  return typeof v === 'string' && isObject(reply.result.serverInfo) ? v : null;
}
const fail: (id: Id | null, n: number, message: string, data?: unknown) => Reply = (id, code, message, data) => ({
  jsonrpc: '2.0',
  id,
  error: { code, message, ...(data === undefined ? {} : { data }) },
});

const JSON_TYPE = 'application/json';

/**
 * A tool's answer as a tool result: the text an agent reads, and the JSON beside it as `structuredContent`.
 *
 * THE TEXT IS PLAIN LABELLED LINES, AND THE JSON IS THE WHOLE ANSWER. Every read answered one block of compact JSON,
 * so a model read raw row ids, person ids and nulls it could not use and a person should never be shown, and on the
 * owner's record the default reads ran to 13 and 18 KB. The lines are what a model reads first and relays; the JSON is
 * for a client that renders it, and in the text too when the call asks `format: "full"` (`index.ts`, `answer`).
 *
 * A REFUSAL IS `isError` WITH ITS SENTENCE, ITS ALLOWED VALUES AND ITS `try` in the text, and the refusal whole beside
 * it, because those are what the model reads to correct the call. A conflict carries the current row and who changed
 * it, so the retry needs no second read.
 */
const render = (said: Said) => ({
  ...(said.result.ok ? {} : { isError: true }),
  content: [{ type: 'text', text: said.text }],
  structuredContent: said.structured,
});

/**
 * A tool as `tools/list` lists it: its name, the title a host shows a person, what it does, its arguments, and what it
 * may do to the record.
 *
 * EVERY HINT IS SAID, BECAUSE A MISSING ONE IS READ AS THE WORST. The specification's defaults for a tool that says
 * nothing are destructive and open to the world, so every write here inherited both: Claude prompts for a destructive
 * tool every time, and ChatGPT treats any tool lacking `readOnlyHint` as a write and shows the person its raw JSON.
 * Reads are read-only; `create`, `propose`, `log`, `meet`, `triage` and `handoff` add and take nothing away; `update`
 * overwrites a value and says so, by OpenAI's rule that being able to undo a change does not make it safe. And none
 * reaches past the record, so `openWorldHint` is false on all sixteen.
 */
export const listedTool = (t: Tool) => ({
  name: t.name,
  title: t.title,
  description: t.description,
  inputSchema: t.input,
  annotations: t.writes ? { destructiveHint: t.destructive === true, openWorldHint: false } : { readOnlyHint: true, openWorldHint: false },
});

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/* THE TITLE IS WHAT A HOST SHOWS A PERSON for the server, since 2025-06-18, where `name` is the handle it keys on. */
const SERVER = { name: 'braindog', title: 'BrainDog', version: '0.0.0' };
const CAPABILITIES = { tools: {}, resources: {}, prompts: {} };

/**
 * Whether `propose` answers in the input-required shape of the 2026-07-28 revision's multi round-trip requests.
 *
 * OFF, BECAUSE NO CLIENT CAPABILITY FOR IT COULD BE CONFIRMED. The
 * contract turns the input-required answer on only when a request's `_meta` carries the capability the revision names
 * for it, and the name has to be read in the specification's own text, which this repository does not hold. The shape
 * `44-SPEC-MCP` §5.7 drew (one request of kind `decision`) is this project's design, not a kind the revision is known to
 * name. So nothing reads this switch yet, and a filed question answers as every tool does, with its `decide` link; the
 * day the name is confirmed, the branch in `tools/call` reads it and this turns true.
 */
export const MRTR = false;

/**
 * The answer to a `propose` that carries `inputResponses`: a retry that thinks it is answering the question it filed.
 *
 * REFUSED BEFORE ANY CALL, SO NO SECOND QUESTION IS FILED. Deciding is a rung no token reaches (ADR-060), so whatever the
 * client collected from the person in its own window is not the person's decision on this record; the record's answer is
 * the one they give in the app, at the `decide` link the first answer carried (`44-SPEC-MCP` §5.7 step 3).
 */
const DECIDES_NOT = {
  ok: false,
  refusal: {
    code: 'LEVEL_REQUIRED',
    fix: "Deciding is a person's act and no token holds it; the suggestion waits in the Decide queue of the app.",
    at: 'inputResponses',
  },
} as const satisfies Result<never>;

/** One mark `handle` leaves with the surface's `heard`. */
type Mark = Parameters<NonNullable<McpSurface<unknown>['heard']>>[0];

/**
 * Leave a mark, and never wait on it or let it fail the call (AGT-B01, "the agent door lists its tools").
 *
 * NOT AWAITED, AND EVERY WAY IT CAN GO WRONG IS SWALLOWED: a surface whose `heard` throws, answers a refusal, rejects or
 * never settles costs the answer nothing, because a session that was given its tools must be given them whether or not
 * the record could count it. The record writes a mark before its first `await`, so nothing is lost by not waiting.
 */
function hear<C>(surface: McpSurface<C>, ctx: C, mark: Mark): void {
  if (typeof surface.heard !== 'function') return;
  try {
    const p: unknown = surface.heard(mark, ctx);
    /* ANY THENABLE, not only this realm's Promise, so a rejection from a surface built elsewhere is caught too. */
    if (p !== null && typeof p === 'object' && typeof (p as { then?: unknown }).then === 'function') Promise.resolve(p).catch(() => undefined);
  } catch {
    /* A mark that throws is a mark not kept, and nothing more. */
  }
}

/** How often a caller's calls are marked after its first: the count since the last mark rides on the next. */
const CALLED_EVERY = MINUTE;
/** The most callers one surface remembers between marks; the oldest goes first. */
const CALLERS_KEPT = 1_000;

/**
 * THE ONE THING THIS FILE REMEMBERS, AND ONLY TO WRITE FEWER MARKS. A caller's first call is marked at once, so a session
 * that called is counted from its first answer; after that, at most one mark a minute carries the calls since the last.
 * Kept per surface, so a record's host that keeps one surface keeps one count, and a surface built for each request
 * marks each call, which is more writes and the same count. A reply never depends on it.
 */
const calledBy = new WeakMap<object, Map<string, { at: number; n: number }>>();

/** How many calls to mark now for this caller, or `null` to hold this one for the next mark. */
function called(surface: object, caller: string, now: number): number | null {
  let seen = calledBy.get(surface);
  if (seen === undefined) calledBy.set(surface, (seen = new Map()));
  const was = seen.get(caller);
  if (was !== undefined && now - was.at < CALLED_EVERY) {
    was.n += 1;
    return null;
  }
  if (was === undefined && seen.size >= CALLERS_KEPT) seen.delete(seen.keys().next().value as string);
  seen.set(caller, { at: now, n: 0 });
  return (was?.n ?? 0) + 1;
}

/** The client as a mark names it, its name and version, held to the record's 80 characters. */
function clientOf(params: Record<string, unknown>): string | undefined {
  const info = params.clientInfo;
  if (!isObject(info) || typeof info.name !== 'string' || info.name.trim() === '') return undefined;
  const said = `${info.name.trim()}${typeof info.version === 'string' && info.version.trim() !== '' ? ` ${info.version.trim()}` : ''}`;
  return said.slice(0, 80);
}

/**
 * The version an `initialize` is answered with, or `null` for none.
 *
 * THE ONE ASKED FOR, OR THE NEWEST OLDER ONE. A client that names a revision this server does not know
 * is answered with the newest it speaks at or below that one, because a client cannot speak a revision
 * newer than its own. Older than all of them is `null`, and the answer is an error naming the versions
 * there are. A client that names no date is answered with the newest.
 */
export function negotiate(asked: unknown): (typeof VERSIONS)[number] | null {
  if (typeof asked !== 'string' || !DATE.test(asked)) return VERSIONS[0];
  return VERSIONS.find((v) => v <= asked) ?? null;
}

/**
 * Answer one message.
 *
 * NEVER THROWS. A throw below the dispatch becomes `-32603` with the word `internal` and a reference,
 * and the reference and the error go to the host's log. No exception text crosses the wire, because
 * an exception message can carry a row's value or a path.
 *
 * `origin` IS WHERE THE HOST SERVES THE APP, `https://brain.dog` or a self-host's own address, and only a host knows it:
 * the tools put it in front of a filed question's `decide` link and read it for nothing else. Left out, as a caller
 * built before it passes nothing, a filed question answers without the link.
 *
 * `version` IS THE REVISION THE TRANSPORT KNOWS this request speaks (`revisionOf`), and it decides only whether a
 * result carries `resultType`. `initialize` is answered under the revision it negotiates, whatever is passed.
 *
 * AND IT MARKS HOW THE SESSION MET THE DOOR, through the surface's optional `heard` (AGT-B01): `hello` for an
 * `initialize` it answered, with the client and this server's build; `listed` for a tool list it gave, with how many;
 * `called` on a caller's first tool call and at most once a minute after; `internal` for an answer whose code is
 * INTERNAL. None is waited on and none can fail the call (`hear`). `caller` is the transport's key for who is calling,
 * which only the minute between `called` marks reads; a stdio pipe is one caller and passes none.
 */
export async function handle<C>(
  message: unknown,
  surface: McpSurface<C>,
  ctx: C,
  origin?: string,
  version?: string,
  caller = '',
): Promise<Reply | null> {
  if (Array.isArray(message)) return fail(null, RPC.invalid, 'Send one message at a time; a batch is not accepted.');
  if (!isObject(message)) return fail(null, RPC.invalid, 'A message is a JSON object.');

  const id = typeof message.id === 'string' || typeof message.id === 'number' ? message.id : null;
  if (Object.hasOwn(message, 'id') && id === null) return fail(null, RPC.invalid, 'id is a string or a number.');
  /* A reply to a request this server never sends. Answering it would start a conversation nobody asked for. */
  if (message.method === undefined && (Object.hasOwn(message, 'result') || Object.hasOwn(message, 'error'))) return null;
  if (message.jsonrpc !== '2.0' || typeof message.method !== 'string')
    return fail(id, RPC.invalid, 'A request carries jsonrpc "2.0" and a method.');
  /* A NOTIFICATION IS NEVER ANSWERED, AND NOTHING RUNS FOR ONE. The client has said it will not read
     a reply, so a write made for one would be a write nobody hears about. */
  if (id === null) return null;

  const params = message.params ?? {};
  if (!isObject(params)) return fail(id, RPC.params, 'params is an object.');

  try {
    return await dispatch(id, message.method, params, surface, ctx, origin, revisionOf(params, version), caller);
  } catch (e) {
    const ref = crypto.randomUUID();
    console.error('mcp', ref, message.method, e);
    hear(surface, ctx, { kind: 'internal' });
    return fail(id, RPC.internal, 'internal', { ref });
  }
}

async function dispatch<C>(
  id: Id,
  method: string,
  params: Record<string, unknown>,
  surface: McpSurface<C>,
  ctx: C,
  origin: string | undefined,
  version: string,
  caller: string,
): Promise<Reply> {
  const mcp = tools(surface, origin);
  const said = (result: Record<string, unknown>) => whole(id, result, version);
  /* EVERY LIST IS ONE PAGE, AND SAYS SO BY CARRYING NO `nextCursor`. So a cursor is one this server never issued, which
     the specification answers -32602; a client that sends one is never handed the whole list again as if it were the
     next page. `null` is read as no cursor, as a missing key is. */
  const paged = (p: Record<string, unknown>): Reply | null =>
    p.cursor === undefined || p.cursor === null
      ? null
      : fail(id, RPC.params, 'This list is one page and issues no cursor. Ask again without one.', { cursor: p.cursor });

  switch (method) {
    case 'initialize': {
      const protocolVersion = negotiate(params.protocolVersion);
      /* THE REVISION'S OWN ANSWER to a version the server cannot meet: -32602, naming what it speaks. */
      if (protocolVersion === null)
        return fail(id, RPC.params, 'Unsupported protocol version', { supported: [...VERSIONS], requested: params.protocolVersion });
      /* ANSWERED UNDER THE REVISION IT AGREES, so a client of the stateless one reads `resultType` here as on every other
         result, and an older client's handshake carries nothing it does not know. */
      const client = clientOf(params);
      hear(surface, ctx, { kind: 'hello', build: SERVER.version, ...(client === undefined ? {} : { client }) });
      return whole(id, { protocolVersion, capabilities: CAPABILITIES, serverInfo: SERVER, instructions: INSTRUCTIONS }, protocolVersion);
    }

    /* WHAT A 2026-07-28 CLIENT ASKS BEFORE ANYTHING ELSE, which that revision says every server answers:
       the versions, the capabilities, who this is and the instructions. The same for every caller, so
       any cache may keep it. Only that revision has the method, so it is always answered as that revision. */
    case 'server/discover':
      return whole(id, {
        supportedVersions: [...VERSIONS],
        capabilities: CAPABILITIES,
        _meta: { 'io.modelcontextprotocol/serverInfo': SERVER },
        instructions: INSTRUCTIONS,
        ttlMs: HOUR,
        cacheScope: 'public',
      }, VERSIONS[0]);

    /* `{}` FOR AN OLDER CLIENT, which reads a ping's answer as an empty result and nothing else. */
    case 'ping':
      return said({});

    /* THE INSTRUCTIONS ARE NOT SENT AGAIN HERE. They went out in `initialize`, or in `server/discover` for a client of the
       stateless revision, and a session that asked for both carried the whole text twice; Claude Code puts the
       instructions in every session's system prompt on its own. Once a connection is the specification's place for them. */
    case 'tools/list': {
      const wrong = paged(params);
      if (wrong) return wrong;
      hear(surface, ctx, { kind: 'listed', n: TOOLS.length });
      return said({ tools: TOOLS.map(listedTool), ttlMs: HOUR, cacheScope: 'private' });
    }

    case 'tools/call': {
      const args = params.arguments ?? {};
      if (typeof params.name !== 'string')
        return fail(id, RPC.params, 'tools/call needs the name of a tool.', { allowed: TOOLS.map((t) => t.name) });
      if (!isObject(args)) return fail(id, RPC.params, "arguments is an object of the tool's fields.");
      /* MARKED BEFORE IT RUNS, so a call that throws or is refused was still a call. */
      const n = called(surface, caller, Date.now());
      if (n !== null) hear(surface, ctx, { kind: 'called', n });
      /* THE REVISION SENDS `inputResponses` ON A RETRY OF THE ORIGINAL REQUEST, and a client may put it in the request's
         params or among the tool's arguments, so both places are read. */
      if (params.name === 'propose' && (Object.hasOwn(params, 'inputResponses') || Object.hasOwn(args, 'inputResponses')))
        return said(render({ result: DECIDES_NOT, text: refusalBrief(DECIDES_NOT.refusal), structured: DECIDES_NOT.refusal }));
      const out = await mcp.answer(params.name, args, ctx);
      if (refused(out.result) && out.result.refusal.code === 'INTERNAL') hear(surface, ctx, { kind: 'internal' });
      return said(render(out));
    }

    /* A minute, not an hour: the list names pages, and a page appears when its row does. */
    case 'resources/list': {
      const wrong = paged(params);
      if (wrong) return wrong;
      const listing = await mcp.resources(ctx);
      return said({
        resources: listing.map(({ uri, name, description }) => ({ uri, name, description, mimeType: JSON_TYPE })),
        ttlMs: MINUTE,
        cacheScope: 'private',
      });
    }

    case 'resources/templates/list':
      return paged(params) ?? said({ resourceTemplates: TEMPLATES.map((t) => ({ ...t, mimeType: JSON_TYPE })), ttlMs: HOUR, cacheScope: 'private' });

    case 'resources/read': {
      if (typeof params.uri !== 'string') return fail(id, RPC.params, 'resources/read needs a uri.');
      const r = await mcp.read(params.uri, ctx);
      if (!r.ok)
        return refused(r)
          ? fail(id, RPC.resource, r.refusal.fix, { refusal: r.refusal })
          : fail(id, RPC.resource, 'This resource did not answer. Read it again.');
      return said({
        contents: [{ uri: params.uri, mimeType: JSON_TYPE, text: JSON.stringify(r.value ?? null) }],
        ttlMs: ttlOf(params.uri),
        cacheScope: 'private',
      });
    }

    /* None yet. The skill and the instructions teach; a prompt library is a third thing to keep true. */
    case 'prompts/list':
      return paged(params) ?? said({ prompts: [], ttlMs: HOUR, cacheScope: 'private' });

    default:
      return fail(id, RPC.method, `There is no method called ${method}.`, { allowed: METHODS });
  }
}
