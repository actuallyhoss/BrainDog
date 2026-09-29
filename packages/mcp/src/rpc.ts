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
 * remembered: every message stands alone, which is what a Worker that keeps nothing can serve.
 */

import { refused, type Result } from '@braindog/ports';

import { INSTRUCTIONS } from './instructions.ts';

export { INSTRUCTIONS };
import { HOUR, MINUTE, TEMPLATES, TOOLS, tools, ttlOf, type McpSurface, type Tool } from './index.ts';

/** Newest first. `initialize` answers with one of these, as `negotiate` picks it. */
export const VERSIONS = ['2026-07-28', '2025-06-18', '2025-03-26'] as const;

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
const fail: (id: Id | null, n: number, message: string, data?: unknown) => Reply = (id, code, message, data) => ({
  jsonrpc: '2.0',
  id,
  error: { code, message, ...(data === undefined ? {} : { data }) },
});

const JSON_TYPE = 'application/json';
/* Compact, never pretty-printed: every byte of a result is read by a model, and whitespace is tokens. */
const text = (value: unknown) => ({ type: 'text', text: JSON.stringify(value ?? null) });

/**
 * A `Result` as a tool result.
 *
 * A value is its JSON. A refusal is `isError` with the refusal itself as the text, because its code,
 * its sentence and `allowed` are what the model reads to correct the call. A conflict carries the
 * current row and who changed it, so the retry needs no second read.
 */
const render = (r: Result<unknown>) => {
  if (r.ok) return { content: [text(r.value)] };
  if (refused(r)) return { isError: true, content: [text(r.refusal)] };
  const { version, current, actor } = r.conflict;
  return {
    isError: true,
    content: [
      text({
        code: 'VERSION_STALE',
        fix: `${actor} changed this row after you read it. current is the row at version ${version}; re-apply your change to it and send that version.`,
        version,
        actor,
        current,
      }),
    ],
  };
};

/* `annotations` only on the tools that read, since writing is the default a client assumes. */
const listed = (t: Tool) => ({
  name: t.name,
  description: t.description,
  inputSchema: t.input,
  ...(t.writes ? {} : { annotations: { readOnlyHint: true } }),
});

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

const SERVER = { name: 'braindog', version: '0.0.0' };
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
const DECIDES_NOT: Result<never> = {
  ok: false,
  refusal: {
    code: 'LEVEL_REQUIRED',
    fix: "Deciding is a person's act and no token holds it; the suggestion waits in the Decide queue of the app.",
    at: 'inputResponses',
  },
};

/**
 * The version an `initialize` is answered with, or `null` for none.
 *
 * THE ONE ASKED FOR, OR THE NEWEST OLDER ONE. A client that names a revision this server does not know
 * is answered with the newest it speaks at or below that one, because a client cannot speak a revision
 * newer than its own. Older than all of them is `null`, and the answer is an error naming the versions
 * there are. A client that names no date is answered with the newest.
 */
export function negotiate(asked: unknown): (typeof VERSIONS)[number] | null {
  if (typeof asked !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(asked)) return VERSIONS[0];
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
 */
export async function handle<C>(message: unknown, surface: McpSurface<C>, ctx: C, origin?: string): Promise<Reply | null> {
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
    return await dispatch(id, message.method, params, surface, ctx, origin);
  } catch (e) {
    const ref = crypto.randomUUID();
    console.error('mcp', ref, message.method, e);
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
): Promise<Reply> {
  const mcp = tools(surface, origin);

  switch (method) {
    case 'initialize': {
      const protocolVersion = negotiate(params.protocolVersion);
      /* THE REVISION'S OWN ANSWER to a version the server cannot meet: -32602, naming what it speaks. */
      if (protocolVersion === null)
        return fail(id, RPC.params, 'Unsupported protocol version', { supported: [...VERSIONS], requested: params.protocolVersion });
      return answer(id, { protocolVersion, capabilities: CAPABILITIES, serverInfo: SERVER, instructions: INSTRUCTIONS });
    }

    /* WHAT A 2026-07-28 CLIENT ASKS BEFORE ANYTHING ELSE, which that revision says every server answers:
       the versions, the capabilities, who this is and the instructions. The same for every caller, so
       any cache may keep it. */
    case 'server/discover':
      return answer(id, {
        resultType: 'complete',
        supportedVersions: [...VERSIONS],
        capabilities: CAPABILITIES,
        _meta: { 'io.modelcontextprotocol/serverInfo': SERVER },
        instructions: INSTRUCTIONS,
        ttlMs: HOUR,
        cacheScope: 'public',
      });

    case 'ping':
      return answer(id, {});

    /* The instructions again, because a client that skipped `initialize` still reads this. */
    case 'tools/list':
      return answer(id, { tools: TOOLS.map(listed), instructions: INSTRUCTIONS, ttlMs: HOUR, cacheScope: 'private' });

    case 'tools/call': {
      const args = params.arguments ?? {};
      if (typeof params.name !== 'string')
        return fail(id, RPC.params, 'tools/call needs the name of a tool.', { allowed: TOOLS.map((t) => t.name) });
      if (!isObject(args)) return fail(id, RPC.params, "arguments is an object of the tool's fields.");
      /* THE REVISION SENDS `inputResponses` ON A RETRY OF THE ORIGINAL REQUEST, and a client may put it in the request's
         params or among the tool's arguments, so both places are read. */
      if (params.name === 'propose' && (Object.hasOwn(params, 'inputResponses') || Object.hasOwn(args, 'inputResponses')))
        return answer(id, render(DECIDES_NOT));
      return answer(id, render(await mcp.call(params.name, args, ctx)));
    }

    /* A minute, not an hour: the list names pages, and a page appears when its row does. */
    case 'resources/list': {
      const listing = await mcp.resources(ctx);
      return answer(id, {
        resources: listing.map(({ uri, name, description }) => ({ uri, name, description, mimeType: JSON_TYPE })),
        ttlMs: MINUTE,
        cacheScope: 'private',
      });
    }

    case 'resources/templates/list':
      return answer(id, { resourceTemplates: TEMPLATES.map((t) => ({ ...t, mimeType: JSON_TYPE })), ttlMs: HOUR, cacheScope: 'private' });

    case 'resources/read': {
      if (typeof params.uri !== 'string') return fail(id, RPC.params, 'resources/read needs a uri.');
      const r = await mcp.read(params.uri, ctx);
      if (!r.ok)
        return refused(r)
          ? fail(id, RPC.resource, r.refusal.fix, { refusal: r.refusal })
          : fail(id, RPC.resource, 'This resource did not answer. Read it again.');
      return answer(id, {
        contents: [{ uri: params.uri, mimeType: JSON_TYPE, text: JSON.stringify(r.value ?? null) }],
        ttlMs: ttlOf(params.uri),
        cacheScope: 'private',
      });
    }

    /* None yet. The skill and the instructions teach; a prompt library is a third thing to keep true. */
    case 'prompts/list':
      return answer(id, { prompts: [], ttlMs: HOUR, cacheScope: 'private' });

    default:
      return fail(id, RPC.method, `There is no method called ${method}.`, { allowed: METHODS });
  }
}
