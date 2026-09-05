/**
 * The bit both hosts share: the route table, the status mapping, and the loop that answers.
 *
 * TWO HOSTS EXIST — the Worker and the self-host — and they are the same product. `ADR-064` puts
 * their common half in one platform-neutral package for a reason that is not tidiness: a route that
 * exists in one and not the other is a product that behaves differently depending on where a
 * customer runs it, and nobody finds out until somebody exports a record from one and imports it
 * into the other.
 *
 * STANDARD `Request` AND `Response`, so this file runs in workerd and in Node without a shim. The
 * Worker adds the Durable Object and the self-host adds the filesystem; neither adds a route.
 *
 * THE ROUTE TABLE IS DATA. It is a list of names and what each one needs, so "what can this thing
 * do" is a value the MCP server, the CLI and the docs can all read rather than a switch three of
 * them have to stay in step with.
 */

import type { Refusal, Result } from '@braindog/ports';

/** One method the host exposes: its name, and what it does to the record. */
export type Route = {
  /** The name a caller sends. `record.list`, and the dot is the group. */
  name: string;
  /** Whether it changes anything. A read is safe to retry; a write is not. */
  writes: boolean;
  /** One line, for the CLI's help and the MCP tool description. */
  what: string;
};

export const ROUTES: readonly Route[] = [
  { name: 'boot', writes: false, what: 'What this record holds, and how many rows are in each register.' },
  { name: 'schema', writes: false, what: 'What one register holds: its fields, their types, and what each may take.' },
  { name: 'get', writes: false, what: 'One row, by the number a person says out loud.' },
  { name: 'list', writes: false, what: 'Rows of one register, narrowed by a predicate, newest first.' },
  { name: 'history', writes: false, what: 'The writes that made one row, in order, each with who and when.' },
  { name: 'version', writes: false, what: "The record's version, so a client can ask what changed since." },
  { name: 'create', writes: true, what: 'Add a row. The record allocates its number.' },
  { name: 'update', writes: true, what: 'Change a row, against the version you read.' },
];

const BY_NAME = new Map(ROUTES.map((r) => [r.name, r]));

/**
 * A refusal's HTTP status.
 *
 * ONE MAPPING, and it is a table rather than a chain of `if`s because the codes are a closed list
 * and a code with no row here should be visible as a 500 rather than silently a 400. The three that
 * matter: 409 for a stale write, so a client knows to re-read rather than retry; 403 for a
 * permission, so a client knows retrying will never work; 422 for a value, so it knows to fix it.
 */
const STATUS: Record<string, number> = {
  REGISTER_UNKNOWN: 404,
  FIELD_UNKNOWN: 422,
  VALUE_MALFORMED: 422,
  ENUM_VALUE_UNKNOWN: 422,
  REQUIRED_MISSING: 422,
  IMMUTABLE_FIELD: 422,
  TRANSITION_ILLEGAL: 422,
  INT_OUT_OF_RANGE: 422,
  TEXT_JSON_QUOTED: 422,
  TEXT_ESCAPED_NEWLINE: 422,
  DECLARATION_INVALID: 422,
  WHERE_MALFORMED: 422,
  WHERE_UNSUPPORTED: 422,
  WHERE_OPERATOR_UNSUPPORTED: 422,
  ALREADY_KNOWN: 409,
  UNIQUE_VIOLATION: 409,
  VERSION_STALE: 409,
  FORBIDDEN: 403,
  SCOPE_INSUFFICIENT: 403,
  LEVEL_REQUIRED: 403,
  PERSON_REQUIRED: 403,
  SCHEMA_MISMATCH: 503,
  SCHEMA_NEWER: 503,
  ROUTE_UNKNOWN: 404,
  BODY_MALFORMED: 400,
};

export const httpStatus = (code: string): number => STATUS[code] ?? 500;

export type Handler = (args: Record<string, unknown>, ctx: unknown) => Promise<Result<unknown>>;

/**
 * Answer one request against a set of handlers.
 *
 * ONE SHAPE FOR EVERY ANSWER — `{ ok, value }` or `{ ok, refusal }` — because a client that has to
 * branch on shape per route is a client that gets one of them wrong. The status carries the same
 * information for anything that reads status codes; the body carries the sentence.
 */
export async function serveApi(
  request: Request,
  handlers: Record<string, Handler>,
  ctx: unknown,
): Promise<Response> {
  const url = new URL(request.url);
  const name = url.pathname.replace(/^\/+api\/+/, '').replace(/\/+$/, '');

  const route = BY_NAME.get(name);
  const handler = handlers[name];
  if (!route || !handler)
    return json(404, {
      ok: false,
      refusal: {
        code: 'ROUTE_UNKNOWN',
        fix: `There is no method called ${name || '(nothing)'}.`,
        allowed: ROUTES.map((r) => r.name),
      },
    });

  /* A WRITE IS A POST. Not decoration: a GET that changes something is a change a browser can make
     by prefetching a link, and a proxy may retry it. */
  if (route.writes && request.method !== 'POST')
    return json(405, {
      ok: false,
      refusal: { code: 'FORBIDDEN', fix: `${name} changes the record, so it is a POST.` },
    });

  let args: Record<string, unknown> = {};
  if (request.method === 'POST') {
    try {
      const body: unknown = await request.json();
      if (body !== null && typeof body === 'object' && !Array.isArray(body)) args = body as Record<string, unknown>;
      else throw new TypeError('not an object');
    } catch {
      return json(400, {
        ok: false,
        refusal: { code: 'BODY_MALFORMED', fix: `${name} takes a JSON object as its body.` },
      });
    }
  } else {
    /* A READ MAY BE A GET, and its arguments come from the query string, JSON-decoded per value so
       a predicate survives the trip. A value that is not JSON is taken as the string it is, because
       `?register=obligations` is what somebody types. */
    for (const [key, raw] of url.searchParams) {
      try {
        args[key] = JSON.parse(raw);
      } catch {
        args[key] = raw;
      }
    }
  }

  const out = await handler(args, ctx);
  return out.ok ? json(200, out) : json(httpStatus(out.refusal.code), out);
}

const json = (status: number, body: { ok: boolean; value?: unknown; refusal?: Refusal }): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      /* A record is never a shared cache's business: one customer's answer must never be another's. */
      'cache-control': 'no-store',
    },
  });
