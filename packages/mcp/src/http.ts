/**
 * Streamable HTTP: `POST /mcp`, for an agent whose client cannot launch a process.
 *
 * ONE POST, ONE MESSAGE, ONE ANSWER, AND NOTHING KEPT. The 2026-07-28 binding has no protocol session and
 * no GET stream, so a Worker that keeps nothing between requests serves it whole. A client of an earlier
 * revision still works: `handle` answers its `initialize`, and the session id it may look for is never
 * minted or echoed, which is what that binding asks of a server that speaks only the stateless shape.
 *
 * THE ORDER IS THE ARGUMENT. Every step before the bearer reads
 * only the request line and the headers, so a stranger's body is never parsed:
 *
 *   1. POST only: 405, `Allow: POST`. GET and DELETE are how earlier revisions opened a stream and ended a session.
 *   2. Any `Origin`: 403. Only a browser page sends one, and no page is served this endpoint. There is no CORS.
 *   3. A body that is not `application/json`: 415.
 *   4. No caller: 401, `WWW-Authenticate: Bearer`, naming the OAuth metadata when the host has it. The host checks
 *      the bearer and hands over the context.
 *   5. Over the cap: 413, on `Content-Length` and again on the bytes as they arrive.
 *   6. Not JSON: 400, -32700.
 *   7. The headers that mirror the body, against the body: 400, -32022 or -32020.
 *   8. `handle`, with the context carrying `params._meta.session` and the client's own name and version, which the
 *      2026-07-28 revision sends on every request. A notification is 202 with no body.
 *
 * `no-store` ON EVERY ANSWER: the URL does not name the record, so a cache keyed on it would hand one
 * caller's answer to another.
 */

import type { McpSurface } from './index.ts';
import { handle, VERSIONS, type Reply } from './rpc.ts';

/** A megabyte. A tool call is a few hundred bytes; a body this size is a mistake or an attack. */
export const MAX_BODY_BYTES = 1_048_576;

type Id = string | number | null;

/* THE NUMBER IS SPELT THROUGH `Record<'code', number>`, as `rpc.ts` spells it, so every `code:` written in
   this package is a refusal code. */
type Failure = { jsonrpc: '2.0'; id: Id; error: { message: string; data?: unknown } & Record<'code', number> };
const failure = (id: Id, code: number, message: string, data?: unknown): Failure => ({
  jsonrpc: '2.0',
  id,
  error: { code, message, ...(data === undefined ? {} : { data }) },
});

/* `ignoreBOM: false` is the default, spelled out because the Workers types require both options. */
const UTF8 = { fatal: true, ignoreBOM: false } as const;

/** JSON-RPC's own numbers, MCP's two for the mirrored headers, and doc 44's for a missing bearer. */
const RPC = { parse: -32700, invalid: -32600, method: -32601, internal: -32603, unauthorized: -32001, mismatch: -32020, version: -32022 } as const;

type Header = [string, string];
const BASE: Header[] = [
  ['cache-control', 'no-store'],
  ['x-content-type-options', 'nosniff'],
];

const bare = (status: number, extra: Header[] = []): Response => new Response(null, { status, headers: [...BASE, ...extra] });

const json = (status: number, body: Reply | Failure, extra: Header[] = []): Response =>
  new Response(JSON.stringify(body), { status, headers: [['content-type', 'application/json; charset=utf-8'], ...BASE, ...extra] });

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

const isJson = (request: Request): boolean =>
  (request.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() === 'application/json';

/**
 * Steps 1 to 3: what the request line and the headers alone can refuse, or `null`.
 *
 * EXPORTED FOR THE WORKER, whose router checks the bearer before the record's object is reached. It runs
 * this first so a request is refused in the same order on both hosts.
 */
export function gate(request: Request): Response | null {
  if (request.method !== 'POST') return bare(405, [['allow', 'POST']]);
  if (request.headers.has('origin')) return bare(403);
  if (!isJson(request)) return bare(415);
  return null;
}

/**
 * Step 4. One word and nothing else: a 401 says only that the credential did not work.
 *
 * AND, WHEN THE HOST HAS ONE, WHERE TO GET ONE. `metadataUrl` is the protected resource's metadata (RFC 9728 §5.1),
 * `https://<host>/.well-known/oauth-protected-resource`, and an MCP client that holds no token starts OAuth from it.
 * The host builds the address from its own configured name, never from the request, so
 * the header cannot be steered by a caller; without it the challenge is the bare `Bearer` it always was.
 */
export const unauthorized = (metadataUrl?: string): Response =>
  json(401, failure(null, RPC.unauthorized, 'UNAUTHORIZED'), [['www-authenticate', metadataUrl === undefined ? 'Bearer' : `Bearer resource_metadata="${metadataUrl}"`]]);

/**
 * The body's bytes, or `null` above the cap.
 *
 * COUNTED AS THEY ARRIVE, because `Content-Length` is a claim and a chunked body makes none. Reading stops at
 * the first byte over, and the rest is never held.
 */
async function bytesOf(request: Request, cap: number): Promise<Uint8Array | null> {
  /* CANCELLED, NOT JUST LEFT UNREAD: the source is told the rest is refused, so a host can drain it and keep
     the connection. A body nobody reads and nobody cancels holds its socket until a timer kills it. */
  if (Number(request.headers.get('content-length') ?? 0) > cap) {
    await request.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > cap) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
}

/** An `Mcp-Name` as the body would say it: plain, or the `=?base64?…?=` form for a name a header cannot carry. `null` when that form does not decode. */
function nameOf(header: string): string | null {
  const encoded = /^=\?base64\?(.*)\?=$/.exec(header)?.[1];
  if (encoded === undefined) return header;
  try {
    return new TextDecoder('utf-8', UTF8).decode(Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

/** The revision a request's `_meta` names, or `null` when it names none. */
const versionIn = (meta: Record<string, unknown>): string | null =>
  typeof meta['io.modelcontextprotocol/protocolVersion'] === 'string' ? (meta['io.modelcontextprotocol/protocolVersion'] as string) : null;

/** What a request with no version header is taken to speak. */
const OLDEST = VERSIONS[VERSIONS.length - 1]!;

/**
 * Step 7: the headers that mirror the body, checked against it.
 *
 * THEY ARE WHAT AN INTERMEDIARY ROUTES AND LIMITS ON, so a body that disagrees with them is a body that
 * passed a check meant for another call. Each is compared only when it is sent, so a client that predates
 * them still works. A request that declares 2026-07-28 must send them, as that revision requires.
 *
 * `initialize` IS NOT HELD TO A VERSION HEADER. Its body is the negotiation, and `handle` answers it.
 */
function disagrees(message: Record<string, unknown>, headers: Headers): Failure | null {
  const id: Id = typeof message.id === 'string' || typeof message.id === 'number' ? message.id : null;
  const method = String(message.method);
  const params = isObject(message.params) ? message.params : {};
  const meta = isObject(params._meta) ? params._meta : {};
  const inBody = versionIn(meta);
  const said = headers.get('mcp-protocol-version');

  if (said !== null && inBody !== null && said !== inBody)
    return failure(id, RPC.mismatch, 'MCP-Protocol-Version does not match the protocol version in the body. Send the same version in both.');
  const version = said ?? inBody;
  if (version !== null && method !== 'initialize' && !(VERSIONS as readonly string[]).includes(version))
    return failure(id, RPC.version, 'Unsupported protocol version', { supported: VERSIONS, requested: version });

  const named = method === 'resources/read' ? params.uri : method === 'tools/call' || method === 'prompts/get' ? params.name : undefined;
  const sentMethod = headers.get('mcp-method');
  const sentName = headers.get('mcp-name');
  if (version === VERSIONS[0] && (said === null || sentMethod === null || (named !== undefined && sentName === null)))
    return failure(id, RPC.mismatch, 'A 2026-07-28 request sends MCP-Protocol-Version, Mcp-Method and, for a named call, Mcp-Name.');
  if (sentMethod !== null && sentMethod !== method)
    return failure(id, RPC.mismatch, 'Mcp-Method does not match the method in the body. Send the same in both.');
  if (sentName !== null && named !== undefined && nameOf(sentName) !== named)
    return failure(id, RPC.mismatch, 'Mcp-Name does not match the name or uri in the body. Send the same in both.');
  return null;
}

/**
 * What a request's `_meta` says about who is calling, for the host's `session`: its `session` hints as sent, and the
 * client's name and version beside them, or `null` for a request that says neither.
 *
 * THE CLIENT NAMES ITSELF ON EVERY REQUEST since the 2026-07-28 revision (`io.modelcontextprotocol/clientInfo`), which
 * names the app without guessing: a run that knew only `agent: claude` could not tell Claude Code from claude.ai, and
 * the owner's Agents page drew 447 of 500 runs as "other". A `session` that is not an object is handed on as it came,
 * as it always was, and the host's grammar drops it; the client's two words are added only beside an object.
 */
function saidOf(meta: Record<string, unknown>): unknown {
  const info = meta['io.modelcontextprotocol/clientInfo'];
  const client = isObject(info)
    ? {
        ...(typeof info.name === 'string' && info.name !== '' ? { client: info.name } : {}),
        ...(typeof info.version === 'string' && info.version !== '' ? { client_version: info.version } : {}),
      }
    : {};
  const hinted = Object.hasOwn(meta, 'session');
  if (!hinted && Object.keys(client).length === 0) return null;
  if (!hinted) return client;
  return isObject(meta.session) ? { ...client, ...meta.session } : Object.keys(client).length === 0 ? meta.session : client;
}

/**
 * The HTTP status a reply travels under. A result is 200. A message the transport could not accept is 400;
 * a method this server does not have is 404, as the 2026-07-28 binding asks; a throw is 500. A refusal of
 * the call itself is 200, because it is a result the model reads.
 */
function statusOf(reply: Reply): number {
  if (!('error' in reply)) return 200;
  const n = reply.error.code;
  if (n === RPC.parse || n === RPC.invalid) return 400;
  if (n === RPC.method) return 404;
  return n === RPC.internal ? 500 : 200;
}

/**
 * Answer one `POST /mcp`.
 *
 * `ctx` IS THE HOST'S ANSWER TO WHO IS ASKING, or `null` for nobody it knows, and this function never looks
 * inside it. It is handed to the tools, which hand it to the record, which is where authorisation lives.
 */
export async function serveMcp<C>(
  request: Request,
  surface: McpSurface<C>,
  ctx: C | null,
  options: {
    maxBodyBytes?: number;
    /**
     * The context with what the client says about itself on it: `params._meta.session`, where it is, and the app it is,
     * from `_meta['io.modelcontextprotocol/clientInfo']`.
     *
     * THE HOST'S, because checking a hint is the host's: this package holds no grammar and never looks
     * inside `ctx`. What it is handed is what the caller sent, `_meta.session`'s keys as they came and the client's
     * name and version as `client` and `client_version` beside them, which a run records (`packages/kernel/src/
     * session.ts`). It is called whenever the body carries either.
     */
    session?: (ctx: C, said: unknown) => C;
    /** Where this host serves the app, such as `https://brain.dog`. It is handed to `handle`, and the tools read it only to put a `decide` link on a filed question. Left out, that link is left out. */
    origin?: string;
    /** This host's build, sent on every answer as the header `braindog-build`, so the bridge can see a deploy mid-session (AGT-A02). */
    build?: string;
    /** Called after a `tools/call` is answered without a protocol error (AGT-A02; the scope's critic moved this half to AGT-B01's marks). */
    called?: (ctx: C, name: string) => void | Promise<void>;
    /**
     * Who is calling, by the host's own word, for the minute between `called` marks: a host that takes the bearer off
     * the request before it reaches here (the Worker hands the record its principal instead) names the caller from
     * `ctx`, so two keys stay two callers. Left out, or answering nothing, the bearer is read off the request.
     */
    caller?: (ctx: C) => string | undefined;
  } = {},
): Promise<Response> {
  const res = await answered(request, surface, ctx, options);
  if (options.build) res.headers.set('braindog-build', options.build);
  return res;
}

async function answered<C>(request: Request, surface: McpSurface<C>, ctx: C | null, options: Parameters<typeof serveMcp<C>>[3] & {}): Promise<Response> {
  const early = gate(request);
  if (early) return early;
  if (ctx === null) return unauthorized();

  const bytes = await bytesOf(request, options.maxBodyBytes ?? MAX_BODY_BYTES);
  if (bytes === null) return bare(413);

  let message: unknown;
  try {
    message = JSON.parse(new TextDecoder('utf-8', UTF8).decode(bytes));
  } catch {
    return json(400, failure(null, RPC.parse, 'The body is not JSON.'));
  }

  if (isObject(message) && typeof message.method === 'string') {
    const wrong = disagrees(message, request.headers);
    if (wrong) return json(400, wrong);
  }

  const meta = isObject(message) && isObject(message.params) && isObject(message.params._meta) ? message.params._meta : {};
  const said = saidOf(meta);
  const who = options.session && said !== null ? options.session(ctx, said) : ctx;

  /* THE REVISION THIS REQUEST SPEAKS, as `disagrees` has already held it to its body: the header, else the body's own,
     else 2025-03-26, which the specification tells a server to assume of a request that sends no header. `handle`
     reads it only to decide whether a result says `resultType`, which no client older than 2026-07-28 expects. */
  const version = request.headers.get('mcp-protocol-version') ?? versionIn(meta) ?? OLDEST;
  const reply = await handle(message, surface, who, options.origin, version, callerOf(options.caller?.(who) ?? request.headers.get('authorization') ?? '', said));
  if (options.called && reply !== null && !('error' in reply) && isObject(message) && message.method === 'tools/call') {
    const name = isObject(message.params) && typeof message.params.name === 'string' ? message.params.name : '';
    if (name !== '') await options.called(who, name);
  }
  return reply === null ? bare(202) : json(statusOf(reply), reply);
}

/**
 * Who is calling, as a key for the minute between `called` marks (`rpc.ts`): the bearer (or the host's own name for
 * the caller, `caller`) and what the client says of its session, folded to eight hex characters so the bearer itself is never kept. They are what the record tells one run
 * from another by, so two sessions on one key that say different things are two callers, and sessions that say nothing
 * are one caller as they are one run.
 */
function callerOf(key: string, said: unknown): string {
  const text = `${key}\n${said === null ? '' : JSON.stringify(said)}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}
