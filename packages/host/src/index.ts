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

import type { Conflict, Refusal, Result } from '@braindog/ports';
import { conflicted, refused } from '@braindog/ports';

/**
 * The six groups `30 §5` splits the surface into, and it splits it by WHO MAY REACH IT rather than
 * by convenience — which is what makes ADR-018's "the web app is a client of the agent API"
 * enforceable rather than aspirational.
 *
 * `INTERNAL` IS HERE SO IT CAN BE REFUSED. It is the host's own surface and not routable from
 * outside; naming it in the type is what lets `router-groups` say "no route carries this" instead of
 * hoping nobody adds one.
 */
export const GROUPS = ['DATA', 'READ+', 'VAULT', 'JOBS', 'ADMIN', 'INTERNAL'] as const;
export type Group = (typeof GROUPS)[number];

/** One method the host exposes: its name, its group, and what it does to the record. */
export type Route = {
  /** The name a caller sends. `record.list`, and the dot is the group. */
  name: string;
  /**
   * Which of `30 §5`'s six.
   *
   * EVERY ROUTE DECLARES ONE, and `30 §5` asks for exactly this: "the router asserts it — every
   * route declares its group, and a CI test walks the router and fails on a route with no group".
   * The rule it keeps is the one that stops the surface drifting: *if a screen needs something
   * outside DATA and READ+, it is either a browser-session group — VAULT, JOBS, ADMIN — or it is a
   * design error.* There is no third case, and a group in the table is how a reviewer sees which
   * case a new method is claiming to be.
   */
  group: Group;
  /** Whether it changes anything. A read is safe to retry; a write is not. */
  writes: boolean;
  /** One line, for the CLI's help and the MCP tool description. */
  what: string;
};

export const ROUTES: readonly Route[] = [
  { name: 'boot', group: 'READ+', writes: false, what: 'What this record holds, and how many rows are in each register.' },
  { name: 'schema', group: 'READ+', writes: false, what: 'What one register holds: its fields, their types, and what each may take.' },
  { name: 'get', group: 'DATA', writes: false, what: 'One row, by the number a person says out loud.' },
  { name: 'list', group: 'DATA', writes: false, what: 'Rows of one register, narrowed by a predicate, newest first.' },
  { name: 'history', group: 'READ+', writes: false, what: 'The writes that made one row, in order, each with who and when.' },
  { name: 'search', group: 'DATA', writes: false, what: 'Rows whose text matches, across every register you can see, best first.' },
  { name: 'version', group: 'READ+', writes: false, what: "The record's version, so a client can ask what changed since." },
  { name: 'whoami', group: 'READ+', writes: false, what: 'Who you are to this record, and which verbs you reach.' },
  { name: 'digestToday', group: 'READ+', writes: false, what: 'What the digest would say if it went now. It sends nothing.' },
  { name: 'pages', group: 'READ+', writes: false, what: 'Every page this record can draw, templates expanded.' },
  { name: 'page', group: 'READ+', writes: false, what: 'One page, with every block run: rows and figures, never markup.' },
  { name: 'metric', group: 'READ+', writes: false, what: 'One figure, with its target and how it compares.' },
  { name: 'listGrants', group: 'VAULT', writes: false, what: 'What each credential opens. Never the credential.' },
  { name: 'dryRun', group: 'READ+', writes: false, what: 'What a rule would do, before anybody turns it on. It writes nothing.' },
  { name: 'governance', group: 'READ+', writes: false, what: 'What has been proposed, what was decided, and what was predicted.' },
  { name: 'propose', group: 'DATA', writes: true, what: 'Put a question in front of a person. It changes nothing by itself.' },
  { name: 'decide', group: 'DATA', writes: true, what: 'Answer one, with the reason. No token reaches this.' },
  { name: 'packs', group: 'READ+', writes: false, what: 'Which packs this record has, and at what version.' },
  { name: 'planPack', group: 'ADMIN', writes: false, what: 'What installing a pack would do to this record. It writes nothing.' },
  { name: 'installPack', group: 'ADMIN', writes: true, what: 'Apply the plan somebody approved. A browser session only.' },
  { name: 'uninstallPack', group: 'ADMIN', writes: true, what: 'Take one back out. Its declarations go; its rows stay.' },
  { name: 'setDeclaration', group: 'ADMIN', writes: true, what: 'Set one declaration from the app, through the same lint a pack gets.' },
  { name: 'retireDeclaration', group: 'ADMIN', writes: true, what: 'Retire one. Its rows stay; a declaration is a shape.' },
  { name: 'ruleApply', group: 'ADMIN', writes: true, what: 'Run one rule over the rows already there. `dry` first: there is no undo.' },
  { name: 'members', group: 'ADMIN', writes: false, what: 'Who is on this record, at what level, and where.' },
  { name: 'invite', group: 'ADMIN', writes: true, what: 'Put somebody on, or move them. A level per register.' },
  { name: 'removeMember', group: 'ADMIN', writes: true, what: 'Take somebody off. Never the last owner.' },
  { name: 'listTokens', group: 'ADMIN', writes: false, what: 'Every agent token, with when it was last used. Never the token.' },
  { name: 'createToken', group: 'ADMIN', writes: true, what: 'Mint one. The secret is in the answer and is stored nowhere.' },
  { name: 'revokeToken', group: 'ADMIN', writes: true, what: 'Revoke one. The second call says the same as the first.' },
  /* `writes: true` BECAUSE IT WRITES. An export appends an `export` event — 12 §6's rule that a
     vault whose reads are not audited cannot say whether anything got out — and a GET that mutates
     the record is a GET a proxy may replay and a browser may prefetch. */
  { name: 'export', group: 'ADMIN', writes: true, what: 'The record as a file: line per row, and it imports back.' },
  { name: 'import', group: 'ADMIN', writes: true, what: 'A file into an EMPTY record. Anything else is a merge nobody asked for.' },
  { name: 'markRead', group: 'DATA', writes: true, what: 'How far you have read, named as an event. A person only, and never an event of its own.' },
  { name: 'log', group: 'DATA', writes: true, what: 'A note against a row. It changes nothing and is still a write.' },
  { name: 'create', group: 'DATA', writes: true, what: 'Add a row. The record allocates its number.' },
  { name: 'update', group: 'DATA', writes: true, what: 'Change a row, against the version you read.' },
];

/**
 * The three vault methods that touch sealed material are DELIBERATELY NOT HERE.
 *
 * `45-SPEC-RECORD` puts VAULT behind a browser session, and neither host can yet tell one from a
 * bearer token — so routing `openGrant` would make a credential reachable by anything holding a
 * token, which is the one thing this product says it does not do. `listGrants` is here because it
 * carries what a key OPENS and never the key. The others arrive when a host can prove a session.
 */
export const UNROUTED = ['openGrant', 'bindGrant', 'revokeGrant', 'createRecord'] as const;

const BY_NAME = new Map(ROUTES.map((r) => [r.name, r]));

/**
 * The list above is a promise, and this is the thing that keeps it.
 *
 * `UNROUTED` WAS READ BY NOTHING — declared, documented, and enforced by no line in the repository.
 * Adding `openGrant` to `ROUTES` and to the handler map would have passed both of the assertions
 * `handlersFor` makes, and started returning sealed bytes over HTTP to anything holding a token.
 * The comment above it argues exactly why that must not happen; this is the argument in code.
 */
for (const name of UNROUTED)
  if (BY_NAME.has(name))
    throw new TypeError(`${name} is in UNROUTED and in ROUTES. One of the two is wrong, and it is not the vault.`);

/**
 * The answer's HTTP status, from its SHAPE.
 *
 * `422` FOR ANY REFUSAL AND `409` FOR A CONFLICT, and the distinction is structural rather than a
 * lookup by code (30 §6). This was a table of forty codes, and a table has two failure modes a
 * shape does not: a code nobody remembered to add came back as a 500 — an ordinary "you typed the
 * wrong enum value" arriving as "the server is broken" — and a code somebody guessed at got a 409,
 * which tells a client to re-read a row that never moved and retry a write that will be refused
 * again forever.
 *
 * SO ONLY THE EXCEPTIONS ARE ENUMERATED, and each is a different INSTRUCTION to the caller: 401 says
 * the credential is wrong, 403 says it is the wrong kind and retrying will never work, 503 says the
 * build and the schema disagree and a deploy fixes it, 409 says somebody else got there first and a
 * re-read will. Everything else is a value the caller can fix, which is a 422.
 */
const NOT_422: Readonly<Record<string, number>> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  /* A BROWSER SESSION IS NOT A SCOPE PROBLEM. 403 with the envelope, because the sentence is the
     part that tells somebody what to do about it — 30 §6's own row. */
  NEEDS_BROWSER_SESSION: 403,
  /* THE REFINEMENTS OF `FORBIDDEN`, AND THERE WERE THREE. 30 §6 has one code for "a credential
     outside its scope, level or ceiling", and this file answered with which of the three it was,
     because "get a bigger token" and "this belongs to a person and a token is not one" are different
     instructions and a caller that cannot tell them apart retries the one that can never work. They
     are a strict refinement, so they take `FORBIDDEN`'s status.

     THE INSTRUCTION IS RIGHT AND THE REMEDY WAS WRONG, and `PERSON_REQUIRED` has gone because of it.
     `30 §6`'s `FORBIDDEN` row already carries three separate facts — a `spark` principal writing a
     row, a runner posting out of `seq` order, the scope case — each told apart by its SENTENCE. A
     code is what a caller branches on; "ask a person to sign in" is what it acts on, and minting a
     code per remedy grows the vocabulary at the speed of the copywriting (`10 §7`).
     `LEVEL_REQUIRED` is in the registry and stays. `SCOPE_INSUFFICIENT` is the last invention of the
     three and follows `PERSON_REQUIRED` the day the one assertion in `packages/mcp`'s tests that
     names it moves with it; the row is here until then. */
  SCOPE_INSUFFICIENT: 403,
  LEVEL_REQUIRED: 403,
  SCHEMA_MISMATCH: 503,
  SCHEMA_NEWER: 503,
  /* A RECORD NOBODY MAY ACT ON IS NOT A REFUSAL OF THE CALLER'S INPUT. Every owner suspended is the
     record's problem, at 503, and it answered 422 for as long as its code was outside the registry
     and therefore outside this table — `49 §5.1` step 5.3, and the self-host's `NOBODY`. */
  RECORD_UNAVAILABLE: 503,
  /* The router's own four, which no method returns — `30 §6`'s host and client family, except
     `INTERNAL`, which is a crash rather than a refusal and is discussed at the catch below. */
  ROUTE_UNKNOWN: 404,
  BODY_MALFORMED: 400,
  /* 501 FOR "PUBLISHED, NOT BUILT". A metric declaring `median`, a block naming a computed source,
     an `infer.prose` job on a host that wired no sender: the declaration is right and this build is
     behind, which is what 501 means and what 422 would deny. It was `UNIMPLEMENTED`, a code in no
     registry; `30 §6` now has `NOT_IN_THIS_BUILD` beside `FORMAT_NEWER_THAN_READER`, which is the
     same sentence about a version number. */
  NOT_IN_THIS_BUILD: 501,
  INTERNAL: 500,
};

export const httpStatus = (r: Result<unknown>): number =>
  r.ok ? 200 : conflicted(r) ? 409 : refused(r) ? (NOT_422[r.refusal.code] ?? 422) : 500;

export type Handler = (args: Record<string, unknown>, ctx: unknown) => Promise<Result<unknown>>;

/**
 * The handlers, built once from the record's surface.
 *
 * THE WIRING IS SHARED, not just the table. A test could assert that two hosts wire the same routes;
 * this makes it impossible for them not to — the Worker and the self-host both call this, so a route
 * cannot exist in one and not the other, and "the product behaves differently depending on where you
 * run it" stops being a thing anybody has to remember.
 *
 * It takes the surface structurally rather than importing `@braindog/record`, so `host` stays under
 * `record` in the package graph (`31-STACK` §2) and the acyclicity argument still holds.
 */
export type RecordSurface = {
  boot(ctx: never): Promise<Result<unknown>>;
  version(ctx: never): Promise<Result<unknown>>;
  schema(args: never, ctx: never): Promise<Result<unknown>>;
  get(args: never, ctx: never): Promise<Result<unknown>>;
  list(args: never, ctx: never): Promise<Result<unknown>>;
  history(args: never, ctx: never): Promise<Result<unknown>>;
  search(args: never, ctx: never): Promise<Result<unknown>>;
  pages(ctx: never): Promise<Result<unknown>>;
  page(args: never, ctx: never): Promise<Result<unknown>>;
  metric(args: never, ctx: never): Promise<Result<unknown>>;
  listGrants(ctx: never): Promise<Result<unknown>>;
  dryRun(args: never, ctx: never): Promise<Result<unknown>>;
  whoami(ctx: never): Promise<Result<unknown>>;
  digestToday(args: never, ctx: never): Promise<Result<unknown>>;
  markRead(args: { upTo?: number } | undefined, ctx: never): Promise<Result<unknown>>;
  log(args: never, ctx: never): Promise<Result<unknown>>;
  governance(args: never, ctx: never): Promise<Result<unknown>>;
  propose(args: never, ctx: never): Promise<Result<unknown>>;
  decide(args: never, ctx: never): Promise<Result<unknown>>;
  packs(ctx: never): Promise<Result<unknown>>;
  planPack(args: never, ctx: never): Promise<Result<unknown>>;
  installPack(args: never, ctx: never): Promise<Result<unknown>>;
  uninstallPack(args: never, ctx: never): Promise<Result<unknown>>;
  setDeclaration(args: never, ctx: never): Promise<Result<unknown>>;
  retireDeclaration(args: never, ctx: never): Promise<Result<unknown>>;
  ruleApply(args: never, ctx: never): Promise<Result<unknown>>;
  members(ctx: never): Promise<Result<unknown>>;
  invite(args: never, ctx: never): Promise<Result<unknown>>;
  removeMember(args: never, ctx: never): Promise<Result<unknown>>;
  listTokens(ctx: never): Promise<Result<unknown>>;
  createToken(args: never, ctx: never): Promise<Result<unknown>>;
  revokeToken(args: never, ctx: never): Promise<Result<unknown>>;
  export(args: never, ctx: never): Promise<Result<unknown>>;
  import(args: never, ctx: never): Promise<Result<unknown>>;
  create(args: never, ctx: never): Promise<Result<unknown>>;
  update(args: never, ctx: never): Promise<Result<unknown>>;
};

export function handlersFor(api: RecordSurface): Record<string, Handler> {
  const handlers: Record<string, Handler> = {
    boot: (_a, ctx) => api.boot(ctx as never),
    version: (_a, ctx) => api.version(ctx as never),
    schema: (a, ctx) => api.schema(a as never, ctx as never),
    get: (a, ctx) => api.get(a as never, ctx as never),
    list: (a, ctx) => api.list(a as never, ctx as never),
    history: (a, ctx) => api.history(a as never, ctx as never),
    search: (a, ctx) => api.search(a as never, ctx as never),
    pages: (_a, ctx) => api.pages(ctx as never),
    page: (a, ctx) => api.page(a as never, ctx as never),
    metric: (a, ctx) => api.metric(a as never, ctx as never),
    listGrants: (_a, ctx) => api.listGrants(ctx as never),
    dryRun: (a, ctx) => api.dryRun(a as never, ctx as never),
    whoami: (_a, ctx) => api.whoami(ctx as never),
    digestToday: (a, ctx) => api.digestToday(a as never, ctx as never),
    markRead: (a, ctx) => api.markRead(a as { upTo?: number } | undefined, ctx as never),
    log: (a, ctx) => api.log(a as never, ctx as never),
    governance: (a, ctx) => api.governance(a as never, ctx as never),
    propose: (a, ctx) => api.propose(a as never, ctx as never),
    decide: (a, ctx) => api.decide(a as never, ctx as never),
    packs: (_a, ctx) => api.packs(ctx as never),
    planPack: (a, ctx) => api.planPack(a as never, ctx as never),
    installPack: (a, ctx) => api.installPack(a as never, ctx as never),
    uninstallPack: (a, ctx) => api.uninstallPack(a as never, ctx as never),
    setDeclaration: (a, ctx) => api.setDeclaration(a as never, ctx as never),
    retireDeclaration: (a, ctx) => api.retireDeclaration(a as never, ctx as never),
    ruleApply: (a, ctx) => api.ruleApply(a as never, ctx as never),
    members: (_a, ctx) => api.members(ctx as never),
    invite: (a, ctx) => api.invite(a as never, ctx as never),
    removeMember: (a, ctx) => api.removeMember(a as never, ctx as never),
    listTokens: (_a, ctx) => api.listTokens(ctx as never),
    createToken: (a, ctx) => api.createToken(a as never, ctx as never),
    revokeToken: (a, ctx) => api.revokeToken(a as never, ctx as never),
    export: (a, ctx) => api.export(a as never, ctx as never),
    import: (a, ctx) => api.import(a as never, ctx as never),
    create: (a, ctx) => api.create(a as never, ctx as never),
    update: (a, ctx) => api.update(a as never, ctx as never),
  };
  /* The table and the wiring, checked against each other where they are both in scope — so adding a
     route to one without the other throws at start rather than 404ing in production. */
  for (const route of ROUTES)
    if (!handlers[route.name]) throw new TypeError(`${route.name} is in the route table and has no handler`);
  for (const name of Object.keys(handlers))
    if (!BY_NAME.has(name)) throw new TypeError(`${name} has a handler and is not in the route table`);
  return handlers;
}

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

  /* NOTHING THROWS ACROSS THIS BOUNDARY, and this is where that promise is kept. A handler that
     throws — an argument nobody coerced, a driver error, a bug — used to escape here, and the caller
     never wrote a response at all: the socket stayed open, the request hung, and on the self-host
     the SERVER then never closed. A crash is a 500 with a sentence, not a connection nobody ends. */
  /**
   * `INTERNAL` IS LEFT STANDING, DELIBERATELY, AND IT IS NOT A REFUSAL.
   *
   * `30 §6`'s whole shape is *a refusal names the field and what was expected* — a crash names
   * neither, and there is nothing a caller can fix. So the registry should not carry it, and it is
   * the one code in this file that stays outside on purpose rather than by neglect: a 500 body has
   * to say something, the envelope has one shape, and the shape has a `code`.
   *
   * THE REASON IT IS NOT RENAMED HERE IS THAT THERE ARE THREE OF IT. This catch, the self-host's
   * outer `catch` and the Worker's own — one fact, one word, three files, and the first paragraph of
   * this module is about exactly the failure of the two hosts drifting apart. Moving two of the
   * three would buy a lower number in one gate and a product that answers differently depending on
   * where a customer runs it, which is the trade this file exists to refuse.
   */
  let out: Result<unknown>;
  try {
    out = await handler(args, ctx);
  } catch (e) {
    return json(500, {
      ok: false,
      refusal: { code: 'INTERNAL', fix: `${name} could not be answered: ${e instanceof Error ? e.message : String(e)}.` },
    });
  }
  return json(httpStatus(out), out);
}

const json = (status: number, body: { ok: boolean; value?: unknown; refusal?: Refusal; conflict?: Conflict }): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      /* A record is never a shared cache's business: one customer's answer must never be another's. */
      'cache-control': 'no-store',
    },
  });
