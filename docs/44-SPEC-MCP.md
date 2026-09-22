# 44 · packages/mcp — specification

The agent surface of [10-MCP](10-MCP.md), typed to the file: fourteen fixed tools, ten kinds of resource, the server
`instructions`, and the JSON-RPC 2.0 core that carries them, hand-rolled over the `Result` envelope of
[33-CONTRACTS](33-CONTRACTS.md) §2, with the token budget of 10 §4 asserted by a test. Two transports wrap the core:
stdio in `apps/cli` and streamable HTTP at `POST /mcp` on both hosts (`loop/research-agent-path.md` §1). Ninth in the
build order of [35-SPEC-OVERVIEW](35-SPEC-OVERVIEW.md) §4. Mode: ponytail.

---

## 1 · Purpose and boundary

**What it does.** One pure function carries everything. `handle(message, surface, ctx)` in `src/rpc.ts` takes one
parsed JSON-RPC 2.0 message and returns one reply, or `null` for a notification, which is never answered and never
runs anything. It answers `initialize` with the instructions and a negotiated protocol version; `server/discover` with the
versions, the capabilities and the instructions; `ping`; `tools/list`
with the fourteen tools and the instructions again; `tools/call`; `resources/list`, `resources/templates/list` and
`resources/read`; and `prompts/list`, which is empty for now. The tools and resources are `tools(surface)` in
`src/index.ts`, over `McpSurface<C>`, a structural type naming only the record methods the tools call. A `Result`
becomes an MCP result: a value as its JSON, a refusal as an error result carrying the refusal, a conflict as
`VERSION_STALE` with the current row and the other actor (§4.3). Nothing is remembered between messages (10 §1).

**Two transports wrap it.** Each does its own reading and writing around `handle`, so the two cannot drift in what
they say (`loop/research-agent-path.md` §1.1):

| Transport | Where | For |
|---|---|---|
| stdio | `braindog mcp` in `apps/cli`, over `@braindog/client` (build step 2) | Claude Code, Codex and Cursor, which launch a process; the bearer stays in the hosts file |
| streamable HTTP | `POST /mcp` on both hosts, `serveMcp()` in `src/http.ts` (build step 3) | clients that cannot launch a process |

**What it refuses to do.** Eight, counted:

| Refused | Whose job |
|---|---|
| Authenticate a bearer or build the context | the transport: the command line reads its bearer from the hosts file, and a host verifies it before `/mcp` (33 §4) |
| Rate-limit | the host (10 §8) |
| Authorise a call against scope, level or ceiling | the record, in one place (30 §10). The tools hand `ctx` on and never read it |
| Touch a database, a port, a `node:` module or `process` | it holds `surface` and `ctx` and nothing else; the `stack` and `graph` gates hold it to that |
| Speak the legacy HTTP+SSE transport | not carried (ADR-054) |
| Reach VAULT, JOBS or ADMIN | no tool names one. Any other name is `ROUTE_UNKNOWN` with the fourteen in `allowed`, and the record refuses every token at those groups in any case (10 §8). The named refusals of §6.2 are not built |
| Decide | there is no `decide` tool, and no token holds `decide` (30 §10) |
| Hand over a credential | there is no vault tool. `context` names a key by its label and what it opens, never its value (§8) |

**What it may import.** `@braindog/ports`, for `Result` and `refused` (31 §2, row 12). `src/` imports nothing of
`@braindog/record`: `McpSurface<C>` is structural, so the same tools run over the record in process and over
`@braindog/client` from the command line. The tests import the record and the kernel's SQLite adapter to run the
tools over a real one, which is why `@braindog/record` stays in `dependencies`. No `valibot` and no
`@modelcontextprotocol/sdk`: the record checks arguments and names the field (§4.4), and the protocol without a
session store is one file.

---

## 2 · Public API

`src/index.ts` is the package's `.` export, `src/rpc.ts` its `./rpc` export and `src/http.ts` its `./http` export.
The last two are entries of their own because each imports the first, and a re-export the other way would be a cycle.

```ts
// src/index.ts
type Answer<T = unknown> = Promise<Result<T>>;
type Args = Record<string, unknown>;
type Row = { state?: string | null; fields: Record<string, unknown> };

export type McpSurface<C> = {
  boot(ctx: C): Answer<{ registers: { id: string; name: string }[] }>;
  version(ctx: C): Answer<{ version: number }>;
  whoami(ctx: C): Answer;
  schema(args: { register: string }, ctx: C): Answer;
  get(args: { register: string; seq: number } | { spoken: string }, ctx: C): Answer;
  list(args: { register: string; where?: unknown; limit?: number; cursor?: string | null }, ctx: C): Answer<{ rows: Row[] }>;
  search(args: { q: string; limit?: number }, ctx: C): Answer;
  history(args: { register: string; seq: number }, ctx: C): Answer;
  governance(args: never, ctx: C): Answer;
  propose(args: never, ctx: C): Answer;
  create(args: { register: string; fields: Args; note?: string }, ctx: C): Answer;
  update(args: { register: string; seq: number; patch: Args; version?: number; note?: string }, ctx: C): Answer;
  pages(ctx: C): Answer<{ slug: string; title: string }[]>;
  page(args: { slug: string }, ctx: C): Answer;
  metric(args: { metric: string }, ctx: C): Answer;
  digestToday(args: { digest?: string }, ctx: C): Answer;
  context?(args: Record<string, never>, ctx: C): Answer;        // build step 8
  handoff?(args: Args, ctx: C): Answer;                          // build step 6
  meet?(args: Args, ctx: C): Answer;                             // build step 16
  sessionsLive?(args: Record<string, never>, ctx: C): Answer;    // build step 6
};

export type Tool = { name: string; description: string; input: Record<string, unknown>; writes: boolean };
export type Resource = { uri: string; name: string; description: string; ttlMs: number };

export const TOOLS: readonly Tool[];                  // fourteen, §4.4
export const TEMPLATES: readonly { uriTemplate: string; name: string; description: string }[];   // four, §4.7
export const HOUR = 3_600_000;
export const MINUTE = 60_000;
export function ttlOf(uri: string): number;           // §4.7's ttl column, by the address's first segment

export function tools<C>(surface: McpSurface<C>): {
  list(): readonly Tool[];
  call(name: string, args: Record<string, unknown>, ctx: C): Promise<Result<unknown>>;
  resources(ctx: C): Promise<Resource[]>;
  read(uri: string, ctx: C): Promise<Result<unknown>>;
};

// src/rpc.ts, the ./rpc export
export const VERSIONS: readonly ['2026-07-28', '2025-06-18', '2025-03-26'];
export const METHODS: readonly ['initialize', 'server/discover', 'ping', 'tools/list', 'tools/call',
                                'resources/list', 'resources/templates/list', 'resources/read', 'prompts/list'];
export function negotiate(asked: unknown): (typeof VERSIONS)[number] | null;    // §4.1
export type Reply =
  | { jsonrpc: '2.0'; id: string | number; result: unknown }
  | { jsonrpc: '2.0'; id: string | number | null; error: { message: string; data?: unknown } & Record<'code', number> };
export function handle<C>(message: unknown, surface: McpSurface<C>, ctx: C): Promise<Reply | null>;

// src/instructions.ts
export const INSTRUCTIONS: string;                    // §4.6

// src/http.ts, the ./http export
export const MAX_BODY_BYTES = 1_048_576;              // §5.1 step 5
export function gate(request: Request): Response | null;   // §5.1 steps 1 to 3, for a host that checks the bearer next
export const unauthorized: () => Response;            // §5.1 step 4
export function serveMcp<C>(request: Request, surface: McpSurface<C>, ctx: C | null,
  options?: { maxBodyBytes?: number; session?: (ctx: C, said: unknown) => C }): Promise<Response>;   // §5.1
```

**`C` is whatever the transport carries.** In process it is the record's `CallContext`; from the command line it is
whatever the stdio loop passes, because the bearer travels in each request. The tools hand it on and never read it.

**The four optional methods** are optional because a host may not answer them. The record answers `context`,
`handoff` and `sessionsLive` since build steps 6 and 8, and `meet` since step 16. The command line offers only
the routes its client knows, so it still works against an older host. Without one, the tool refuses
`NOT_IN_THIS_BUILD` with a sentence saying what to do instead, and the resource is not listed (§4.7).

**The error's number is spelt through `Record<'code', number>`** so that every `code:` written in this package is a
refusal code, which is what the `refusals` gate counts.

Error contract: `handle` never throws, and a throw below its dispatch becomes `-32603` (§4.1). `call` and `read`
return what the surface returns and add no throw of their own. `resources` never fails: it lists what reads, which
for a caller who can read little is little.

---

## 3 · Files

Four source files, one test helper and four test files. Counted.

```
packages/mcp/
├── package.json         @braindog/mcp · private
│                        "exports": { ".": "./src/index.ts", "./rpc": "./src/rpc.ts", "./http": "./src/http.ts" }
│                        dependencies: @braindog/ports, @braindog/record (the tests' real record), both workspace:*
│                        scripts: test = node --test test/*.test.ts · typecheck = tsc --noEmit -p tsconfig.json
├── tsconfig.json        extends ../../tsconfig.base.json
├── src/
│   ├── index.ts         McpSurface, TOOLS, TEMPLATES, ttlOf, tools(): the fourteen, the resource list, the read
│   ├── rpc.ts           handle(): framing, version negotiation, the result renderer
│   ├── http.ts          serveMcp(), gate(), unauthorized(): POST /mcp, §5.1
│   └── instructions.ts  INSTRUCTIONS, §4.6
└── test/
    ├── stub.ts          a surface that records every call and answers ok
    ├── mcp.test.ts      the tools and resources over a real record: refusals teach, scoping, nothing listed that refuses
    ├── rpc.test.ts      the JSON-RPC cases: one per tool, one per framing rule
    ├── http.test.ts     serveMcp in §5.1's order, over Request and Response
    └── budget.test.ts   tokenBudget (§5.8) over the rendered tools/list, the ceilings of §7, plain ASCII
```

The transports' own halves live with their hosts. The stdio loop is `apps/cli/src/stdio.ts`, over the surface
`apps/cli/src/surface.ts` builds on `@braindog/client`, and each host's `/mcp` branch calls `serveMcp`
(`apps/worker/src/index.ts`, `apps/selfhost/src/server.ts`). There is no `mcp-budget` gate and no generated schema
file: the budget is `budget.test.ts` (§7), and the fourteen input schemas are written by hand in `index.ts` (§4.4).

---

## 4 · Data structures

### 4.1 · JSON-RPC, as accepted and produced

`handle` takes a message already parsed from JSON; a transport answers a body that does not parse with `-32700`
itself. In order:

1. An array is a batch, and is `-32600` with `id: null`. One message at a time.
2. A message that is not an object is `-32600` with `id: null`.
3. `id`, when present, is a string or a number, or the message is `-32600` with `id: null`. It is echoed exactly,
   `0` included.
4. No `method`, and a `result` or an `error`: a reply to a request this server never sends. `null`, unanswered.
5. `jsonrpc` other than `'2.0'`, or a `method` that is not a string: `-32600`.
6. No `id`: a notification. `null`, and nothing runs, because the client has said it will not read a reply.
7. `params`, when present, is an object, or the message is `-32602`.
8. Dispatch on the nine names of `METHODS`. Any other is `-32601`, with `data.allowed` naming the nine.
9. A throw below the dispatch is `-32603`, with `message: 'internal'` and `data: { ref }`, where `ref` is
   `crypto.randomUUID()`. The reference and the error go to `console.error`, which is stderr under stdio and the log
   on a host. No exception text crosses the wire, because an exception message can carry a row's value or a path.

| Number | When | `message`, then `data` |
|---|---|---|
| `-32600` | steps 1, 2, 3 and 5 | a sentence saying what a message is |
| `-32601` | step 8 | `There is no method called <m>.`, then `{ allowed }` |
| `-32602` | step 7; `tools/call` with no `name`, or with `arguments` that is not an object; `resources/read` with no `uri`; `initialize` naming a version older than every one in `VERSIONS` | a sentence, then `{ allowed }` for a missing tool name, or `{ supported, requested }` for the version |
| `-32603` | step 9 | `internal`, then `{ ref }` |
| `-32002` | `resources/read` of an address that is not there, or that the record refuses | the refusal's sentence, then `{ refusal }` |

**Versions.** `initialize` echoes `params.protocolVersion` when it is one of `VERSIONS` (`2026-07-28`, `2025-06-18`,
`2025-03-26`). A date it does not know is answered with the newest of `VERSIONS` at or below it, because a client
cannot speak a revision written after its own: `2025-11-25` gets `2025-06-18`. A date older than all three is `-32602`,
`Unsupported protocol version`, with `{ supported, requested }`, and a request naming no date gets the newest. This
is `negotiate`.

**`server/discover`**, which the 2026-07-28 revision says every server answers, returns the versions, the
capabilities, who this is and the instructions, the same for every caller (§4.3). It reads nothing from the record.
The `Mcp-Method` and `Mcp-Name` headers are the HTTP transport's to check (§5.1).

### 4.2 · `_meta.session`, the actor ladder's inputs (30 §3, 33 §2)

| Field | Grammar | Is |
|---|---|---|
| `spoken` | `^S[1-9][0-9]*$` | the caller's `session` row, `S<n>`, in the kernel's register (ADR-026) |
| `client_id` | `^[A-Za-z0-9._:-]{1,128}$` | the runtime's own id, for re-attach |
| `host` | `^[A-Za-z0-9._-]{1,128}$` | the machine |
| `repo` | `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`, never containing `..` | a name, never a path (26 §5) |
| `remote` | printable ASCII, at most 256 characters | the origin, normalised, with no user and so no credential |
| `cwd` | printable ASCII, at most 512 characters | the working folder, which places the run in a project |
| `agent` | `claude`, `codex`, `cursor` or `other` | the face on screen, the register's `agent` field |

`handle` does not read `_meta`. `ctx` is the transport's type (§2), so `serveMcp` reads `params._meta.session` out
of the body and hands it to the host's `session` option, which checks it with `hintsOf` from `@braindog/host` and
puts it on the context over the header hints, key by key. The stdio transport sends the same hints as request
headers, `X-Braindog-Session`, `-Client`, `-Host`, `-Repo`, `-Remote`, `-Cwd` and `-Agent`, and both hosts check
those with `sessionOf` on `/api` and `/mcp` alike. A hint that fails its grammar is dropped and the call goes
through. Nothing reads a principal, a scope, an actor or a `now` from a body. The record resolves `spoken` against
its own rows and derives the actor (30 §3), from a token's hints only.

### 4.3 · Results

```ts
type Text = { type: 'text'; text: string };      // text is compact JSON, never pretty-printed

type InitializeResult = {
  protocolVersion: (typeof VERSIONS)[number];
  capabilities: { tools: {}; resources: {}; prompts: {} };
  serverInfo: { name: 'braindog'; version: string };
  instructions: string;                           // INSTRUCTIONS
};
type DiscoverResult = {
  resultType: 'complete';
  supportedVersions: (typeof VERSIONS)[number][];
  capabilities: { tools: {}; resources: {}; prompts: {} };
  _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'braindog'; version: string } };
  instructions: string;                           // INSTRUCTIONS
  ttlMs: 3_600_000; cacheScope: 'public';         // the same answer for every caller
};
type ToolsListResult = {
  tools: { name: string; description: string; inputSchema: object; annotations?: { readOnlyHint: true } }[];
  instructions: string;                           // INSTRUCTIONS, every time
  ttlMs: 3_600_000; cacheScope: 'private';        // anything a record answers is private: 10 §4 rule 3
};
type CallToolResult =
  | { content: [Text] }                           // ok: the value
  | { isError: true; content: [Text] };           // a refusal, or a conflict as VERSION_STALE

type ListResourcesResult = { resources: { uri: string; name: string; description: string; mimeType: 'application/json' }[]; ttlMs: 60_000 };
type ListTemplatesResult = { resourceTemplates: { uriTemplate: string; name: string; description: string; mimeType: 'application/json' }[]; ttlMs: 3_600_000 };
type ReadResourceResult  = { contents: [{ uri: string; mimeType: 'application/json'; text: string }]; ttlMs: number };   // ttlOf(uri)
type ListPromptsResult   = { prompts: [] };
```

Invariants. An `ok` result has one content block, `JSON.stringify` of the value, and no `structuredContent`, because
nothing consumes it and it would double the bytes. A refusal's text is the refusal itself,
`{"code":"...","fix":"...","at":"...","allowed":[...]}`, because `allowed` is the half that teaches and a one-line
rendering dropped it. A conflict's text is `{ code: 'VERSION_STALE', fix, version, actor, current }`, and `fix` names
the actor and the version to send, so the retry needs no second read. `annotations.readOnlyHint` rides on the eight
tools that never write, so a client can tell its user before one runs. `ttlMs` and `cacheScope` are top-level fields,
as 10 §1 names them. `cacheScope` takes one of the two values the MCP specification allows: `private` for anything a
record answers, which is why `tools/list` carries it, and `public` for `server/discover` alone, the one answer that
reads nothing and is the same for every caller. The resource results carry `ttlMs` and no `cacheScope`. The resource
list is held for a minute rather than an hour because it names pages, and a page appears when its row does.

### 4.4 · The fourteen tools, and what each reaches

| Tool | Reaches | Arguments | Writes |
|---|---|---|---|
| `record_index` | `boot`, then `version` | none | no |
| `context` | `context({})` | none | no |
| `schema` | `schema({ register })` | `register` | no |
| `get` | `get({ register, seq })`, or `get({ spoken })` for a prefixed id | `spoken`: `obligations#41`, or a prefixed id such as `S42` | no |
| `list` | `list({ register, where?, limit?, cursor? })` | the same | no |
| `search` | `search({ q, limit? })` | the same | no |
| `history` | `history({ register, seq })` | `spoken`, qualified | no |
| `governance` | `governance(args)` | `register?`, `id?`, `status?`, `limit?` | no |
| `propose` | `propose(args)` | `question`, `body_kind`, `body` | yes |
| `create` | `create({ register, fields, note? })` | the same | yes |
| `update` | `update({ register, seq, patch, version?, note? })` | `spoken`, `patch`, `version?`, `note?` | yes |
| `log` | `update({ register, seq, patch: {}, note })` | `spoken`, `note` | yes |
| `handoff` | `handoff(args)` | `next?`, `tried?`, `note?`, `doing?`, `state?` (`idle`, `handoff` or `done`) | yes |
| `meet` | `meet(args)` | `name?`, `email?`, `handle?`, `where` | yes |

These are the fourteen of `loop/research-agent-path.md` §1.5. Five tools left to pay for the three new ones:
`pages`, `page` and `metric` were already resources (§4.7); `credentials` could never answer a token, because the
vault refuses every one; and `dry_run` previews a rule, which only a person installs. Its route stays for the command
line and the web.

The tool layer holds no checks of its own beyond addressing:

- **Addresses.** `get` takes `register#number` or a prefixed id; `history`, `update` and `log` take `register#number`
  only. Anything else is `VALUE_MALFORMED` at `spoken`, and the sentence shows the forms that work. A prefixed id goes
  to the record as spoken, `get({ spoken })`, in one call. The record resolves it against the installed prefixes,
  and answers a prefix that no register the caller reads holds with `REGISTER_UNKNOWN`, whose sentence sends `SG`
  and `D` to `governance`.
- **Arguments** are not validated against the schema here. The schemas are JSON Schema written by hand in
  `index.ts`, with `additionalProperties: false` and `required` left out when empty. The record refuses a wrong field
  by name (`FIELD_UNKNOWN`, `ENUM_VALUE_UNKNOWN`, with `allowed`), which teaches better than a protocol error would.
- **A tool the surface does not answer**, which is `meet` over a host older than build step 16, or `context` and
  `handoff` over one older than build step 8, is `NOT_IN_THIS_BUILD` with a sentence saying what to do instead.
- **Any other name** is `ROUTE_UNKNOWN`, with the fourteen in `allowed`. The lookup is `Object.hasOwn`, because the
  name comes from the caller and every name on `Object.prototype` would otherwise be found and called.
- **A note** is an `update` with an empty patch, so it answers to the same permission and lands in the same history.

### 4.5 · The descriptions

Each says when to reach for the tool, never how the server works (10 §7 rule 1). No description names a register:
`record_index` and `context` do that, so the fourteen are the same text for every record and a client's cached list
does not go stale on an install. Plain ASCII, with no dash standing in for a sentence break; `budget.test.ts` asserts
both. `index.ts` is the source, and these are copied from it:

```
record_index  What this record holds: its registers, how many rows in each, and its version. The cheap way to learn register names.
context       Where you are and what applies here: your session, your project, its open work, questions waiting on the person,
              people, the keys and servers you may use (by name, never a value), skills and learnings, plus everything global.
              Call it first, and again after a long pause.
schema        The fields of one register, their types and what each may take. Read before writing.
get           One row, by the id a person says out loud: obligations#41, S42 or LN7.
list          Rows of one register, narrowed by a predicate. The predicate is a tree: {"field":"state","is":"open"}, or {"all":[...]}.
search        Rows whose text matches, across every register you can see. Every word is a prefix.
history       The writes that made one row, in order, each with who and when.
governance    What has been proposed and not yet answered, what was decided and why, and what was predicted. Open suggestions
              unless you ask for more.
propose       Put a question to the person, with what you would do about it. It changes nothing by itself, so it is the verb
              to use when you are not sure, or to change what you may not.
create        Add a row to a register. The record allocates its number and hands it back.
update        Change a row. Send the version you read; a stale write is refused rather than merged, so read it again and reapply.
log           Append one note to a row, changing nothing about it. One sentence, for the next reader.
handoff       Keep your session's handoff true. next is the one concrete next step; 'carry on' is not one. tried adds a dead
              end, and note adds a line of reasoning; both append and never overwrite. state handoff asks another session to
              pick it up.
meet          Someone you came across in the work: a commit author, a sender, a client. They are matched by email or handle,
              added if new, and linked to your project with where you met them. Never guess an email.
```

`propose`'s `body` argument carries the other half of its description: a `rowset` row with `at` (`skills#3`),
`version` and `patch` changes that row when the person accepts it (`loop/research-agent-path.md` §5.3).

### 4.6 · `INSTRUCTIONS`, the exact text

```
BrainDog is one person's business record, shared by every agent that works for them. Call context first: it names your session, your project, and what applies here.
Money is an integer in minor units with its currency. Shift it by the decimals of that currency before saying a number (GBP 2, JPY 0, KWD 3), and never add two currencies.
Writes are compare-and-set. On VERSION_STALE, re-read the row and re-apply your change to the new copy. Never resend the copy you held.
An agent never decides. Lay out options with propose; the person chooses in their app. To change something you may not change yourself, such as a skill's text or where a key applies, propose it.
A credential never goes in a row, a note or a tool call. Deposit a key with the command braindog key add, which reads it from standard input.
Call handoff with doing once you know the task, and before you stop with the one next step. Record each dead end in tried when you rule it out.
Record a learning only when a future session would otherwise get something wrong, and say the failure in because. Most sessions record none.
When you meet a person in the work, such as a commit author, a sender or a client, call meet.
A refusal names the field and the fix. Correct the call; never retry it unchanged.
Everything you write is read on a phone. Keep it short and plain.
```

Ten lines, 227 words, 1,255 bytes, **352 tokens** by `tokenBudget`, which is the plan's "about 270" by o200k_base
once §5.8's stated bias is allowed for. It carries the rules every tool would otherwise repeat: call `context` first;
minor units; re-read on `VERSION_STALE`; never decide, propose; never a credential, and how to deposit one; the
handoff and `tried`; when a learning is worth recording; `meet`; the refusal teaches; read on a phone. The old line
about `log` gave way to `handoff`, which is where a session's reasoning now goes. It is returned in `initialize` and
again with every `tools/list`, because a client that skipped the first still reads the second.

### 4.7 · Resources

Scheme `braindog:`, then a path. Ten kinds, each backed by one method (ADR-018 by construction).

| # | URI | Method called | `ttlMs` | Listed when |
|---|---|---|---|---|
| 1 | `braindog:whoami` | `whoami()` | 0 | it reads |
| 2 | `braindog:boot` | `boot()` | 60,000 | it reads |
| 3 | `braindog:context` | `context({})` | 0 | the surface has `context` and it reads |
| 4 | `braindog:sessions/live` | `sessionsLive({})` | 0 | the surface has `sessionsLive` and it reads |
| 5 | `braindog:digest/today` | `digestToday({})` | 60,000 | it reads |
| 6 | `braindog:decisions` | `governance({ register: 'suggestion' })` | 60,000 | it reads |
| 7 | `braindog:schema/{register}` | `schema({ register })` | 3,600,000 | once for each register `boot` lists |
| 8 | `braindog:page/{slug}` | `page({ slug })` | 60,000 | the page draws and not every block came back `FORBIDDEN` or `LEVEL_REQUIRED` |
| 9 | `braindog:metric/{id}` | `metric({ metric: id })` | 60,000 | a listed page drew the figure and it reads |
| 10 | `braindog:skill/{name}` | `list({ register: 'skills', where: { field: 'name', is: name }, limit: 1 })` | 3,600,000 | the caller can read `skills` and the row is not retired |

**Every address is asked before it is advertised.** A listing that names what the caller may not read tells them it
exists, and one that names what then refuses sends an agent to a certain refusal. So the list is never ahead of the
record: each fixed resource and each figure is read first, a page is withheld when every block on it was withheld
for the caller's ceiling or level, and a register comes from `boot`, which lists only what the caller may read. A
figure is read before it is listed because a reading survives its own refusal: the kernel keeps the id on a cell it
could not fill, and advertising that id would hand back the name the record's `METRIC_UNKNOWN` was chosen to hide.

Row 4's description carries the sentence the start hook prints: *"Two sessions in one working tree overwrite each
other. Coordinate or stop."* (32 §2.1). Row 10's description is the skill's `trigger`, because when to use a thing is
the headline. Row 3 replaces the `learnings/for/{repo}` of an earlier revision: `context` carries the learnings for
where the session stands. `dialect` and `whats-new` wait for their methods.

**What row 3 answers** is the record's `context` (30 §5), built in step 8, and the `context` tool answers the same.
`attach` returns the same briefing, so the start hook prints it from one call. It never writes and never opens a run.

| Key | Is |
|---|---|
| `session` | the caller's run, `{ spoken, state }`, when the caller is a token that has one; otherwise `null` |
| `project` | `{ spoken, name, mark, hue, how }`, where `how` is `remote`, `folder` or `repo`, the rung that placed the caller. `null` is global, and so is a caller who may not read the projects register, because naming the project would name a row it cannot see |
| `ambiguous` | the projects that matched at the same strength, which leaves the caller global |
| `handoff` | the newest other run in this project, or with no project in this repository, that left a `next`: `{ from, age_s, next, tried, head }` |
| `live` | the other live runs, as `same_repo` and `elsewhere`, each with `stale`, worked out at 45 minutes, and `age_s` |
| `waiting` | the newest eight open suggestions the caller may see, as `{ id, question }` |
| `registers` | every register with a scope field the caller may read, as `{ id, name, rows, inherited, truncated }`: the project's open rows, newest twenty, then the global rows nearer-wins leaves |
| `people` | the rows linked to this project through a `links` scope, newest ten |
| `faded` | the rows of a register with a `confirmed_on` day that nobody confirmed or made in ninety days, left out and counted |
| `next` | one sentence saying what to call next |

Each row is a brief: `{ spoken, version, scope, state }`, then the register's title and `mobile` fields, with a ref
given as its spoken id. A `secret` field is `{ sealed, opened, last_opened, last_by }`, and the grant's id never
appears.

`resources/templates/list` returns rows 7 to 10 as templates. The arguments are checked against a grammar before
they are arguments: `{register}`, `{slug}` and `{id}` match `^[a-z][a-z0-9_-]{0,63}$`, and `{name}` matches
`^[a-z0-9][a-z0-9-]{0,63}$`, the folder names the command line writes skills under. The address is split, never
resolved, so `braindog:schema/../../x` is `ROUTE_UNKNOWN`.

### 4.8 · Prompts

None yet. `prompts/list` answers `{ prompts: [] }` and the capability is declared, so a client may ask. The three of
10 §6 wait: the instructions and the skill teach in the meantime, and a prompt library is a third thing to keep true.

---

## 5 · Algorithms

### 5.1 · One request, in order

`serveMcp(request, surface, ctx, { maxBodyBytes?, session? })` in `src/http.ts`, over `handle`. The host checks the
bearer first, as it does for `/api`, and passes the context it built, or `null` for a caller it does not know. Every
step that fails answers and stops. Every step before the bearer reads only the request line and the headers, so a
stranger's body is never parsed.

1. **Method.** Not `POST`: `405`, `Allow: POST`. There is no `GET` stream and no `DELETE`, because the server keeps no
   session (10 §1).
2. **Origin.** Any `Origin` header: `403`. Only a browser page sends one, no page is served this endpoint, and there
   is no CORS.
3. **Content type.** Not `application/json`, parameters ignored: `415`.
4. **Caller.** `ctx` is `null`: `401`, `WWW-Authenticate: Bearer`, and the body
   `{ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'UNAUTHORIZED' } }` and nothing else (12 §8).
5. **Size.** A `Content-Length` above `maxBodyBytes` (1 MB), or the bytes passing it as they arrive: `413`. The body
   is cancelled rather than left unread, so the host can drain it and keep the connection.
6. **Parse.** Not UTF-8 JSON: `400`, `-32700`.
7. **The headers that mirror the body**, each compared only when it is sent, so a client that predates them still
   works. `MCP-Protocol-Version` and the body's `_meta['io.modelcontextprotocol/protocolVersion']` must agree;
   `Mcp-Method` must equal `method`; `Mcp-Name` must equal the tool's name or the resource's `uri`, decoded first when
   it arrives in the `=?base64?...?=` form. A disagreement is `400`, `-32020`. A version this server does not speak
   is `400`, `-32022`, with `data: { supported, requested }`, on every method but `initialize`, whose body is the
   negotiation (§4.1). A request that declares 2026-07-28 must send `MCP-Protocol-Version`, `Mcp-Method` and, for a
   named call, `Mcp-Name`, as that revision requires.
8. **`_meta.session`.** When the body carries one, the host's `session` option checks each hint against §4.2 and
   puts what passes on the context. A hint that fails is dropped, and the call goes through.
9. **`handle`** (§4.1). A notification is `202` with an empty body.
10. **Status.** A result is `200`, and so is a refusal of the call, because it is a result the model reads. `-32700`
    and `-32600` are `400`; `-32601` is `404`, as the 2026-07-28 binding asks; `-32603` is `500`.

`Cache-Control: no-store` and `X-Content-Type-Options: nosniff` are on every answer, because the URL does not name the
record, and a cache keyed on it would hand one caller's answer to another. No session id is minted or echoed, and
nothing is streamed.

### 5.2 · `tools/list`

1. Nothing is read from the record. The list is the same for every record and every caller, so it always arrives,
   and a caller who can read nothing still learns what it could call.
2. `tools = TOOLS.map(listed)`: for each of the fourteen, in §4.4's order, `{ name, description, inputSchema }`, where
   `inputSchema` is the tool's `input`, plus `annotations: { readOnlyHint: true }` on the eight that never write.
3. Result `{ tools, instructions: INSTRUCTIONS, ttlMs: 3_600_000, cacheScope: 'private' }`.

The `inputSchema` objects are constants written by hand in `index.ts` with three helpers: `obj()` adds
`additionalProperties: false` and leaves `required` out when it would be empty, and `str()` and `int()` carry one
`description` each. There is no generator and no schema file (§13 D1). The whole result, instructions included, is
what `budget.test.ts` counts (§5.9).

### 5.3 · `tools/call`

1. A `params.name` that is not a string is `-32602`, with the fourteen in `data.allowed`. `params.arguments`, `{}` when
   absent, that is not an object is `-32602`. Neither reaches a tool.
2. `tools(surface).call(name, args, ctx)` looks the name up with `Object.hasOwn`. A name that is not one of the
   fourteen is an error result, `ROUTE_UNKNOWN` with the fourteen in `allowed`, and nothing runs. That covers every
   VAULT, JOBS and ADMIN method name, and every name on `Object.prototype` (§6.2).
3. The tool addresses the call and does nothing more (§4.4). It parses `spoken` into `{ register, seq }`, or refuses
   `VALUE_MALFORMED` at `spoken`; `log` refuses an empty note `REQUIRED_MISSING` at `note`; a tool whose method the
   surface does not offer refuses `NOT_IN_THIS_BUILD` with what to do instead.
4. The surface method runs with `ctx` as the transport handed it. `record_index` calls `boot`, then `version`, and
   answers the registers with `version` as a number, or `null` when it did not answer. The arguments are not checked
   against the published schema: the record refuses a wrong field by name, with `allowed` (§13 D7).
5. The `Result` is rendered by §5.4 and answered as the JSON-RPC `result`, which travels under HTTP 200 on `/mcp`
   whether it is a value or a refusal. `propose` renders like every other tool (§5.7).

### 5.4 · Rendering a `Result`

`render` in `rpc.ts`, where `text(v)` is `{ type: 'text', text: JSON.stringify(v ?? null) }`, compact:

| `Result` | MCP result |
|---|---|
| `{ ok: true, value }` | `{ content: [text(value)] }` |
| `{ ok: false, refusal }` | `{ isError: true, content: [text(refusal)] }`: the refusal whole, `code` and `fix`, and `at` and `allowed` when it has them |
| `{ ok: false, conflict: { version, current, actor } }` | `{ isError: true, content: [text({ code: 'VERSION_STALE', fix, version, actor, current })] }` |

A conflict's `fix` reads *"`<actor>` changed this row after you read it. current is the row at version `<version>`;
re-apply your change to it and send that version."*, so the retry needs no second read. The refusal teaches
(10 §7 rule 4), and the model reads it in `content`. There is no `structuredContent` and no `_meta`, because nothing
consumes them and they would double the bytes. Values are never inspected or reshaped: `cursor`, `truncated` and
`next` arrive exactly as the record wrote them.

### 5.5 · `resources/list`, `resources/templates/list`, `resources/read`

1. `resources/list`: `tools(surface).resources(ctx)`, which never fails. In order: the six fixed resources of §4.7,
   rows 1 to 6, each read first and listed only when the read is `ok`; `schema/<id>` for each register `boot` lists;
   `page/<slug>` for each page that draws and whose blocks did not all come back `FORBIDDEN` or `LEVEL_REQUIRED`;
   `metric/<id>` for each figure a listed page drew, read first; and `skill/<name>`, once for each name, for every
   skill that is not retired, when `boot` lists `skills`. Each carries `mimeType: 'application/json'`, and the list
   carries `ttlMs: 60_000`. Listing costs a read of each fixed resource, page and figure, which is the price of never
   advertising a refusal.
2. `resources/templates/list`: the four `TEMPLATES`, `braindog:schema/{register}`, `braindog:page/{slug}`,
   `braindog:metric/{id}` and `braindog:skill/{name}`, each with `mimeType: 'application/json'`, and
   `ttlMs: 3_600_000`. It reads nothing.
3. `resources/read`: a `uri` that is not a string is `-32602`. Otherwise the address loses its `braindog:` prefix and
   is split at its first `/` into a head and the rest, and is never resolved. The head picks the row of §4.7. The
   rest is empty for `whoami`, `boot`, `context` and `decisions`, exactly `live` after `sessions` and `today` after
   `digest`; it matches `^[a-z][a-z0-9_-]{0,63}$` after `schema`, `page` and `metric`, and `^[a-z0-9][a-z0-9-]{0,63}$`
   after `skill`. Anything else is `ROUTE_UNKNOWN` at `uri`, *"There is nothing at `<uri>`. Read braindog:boot for
   what this record holds."*, and no method is called. Row 10 answers the first skill of that name, or the same
   `ROUTE_UNKNOWN` when there is none.
4. The row's method runs. `ok` is `{ contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(value) }],
   ttlMs: ttlOf(uri) }`. A refusal is `-32002`, with the refusal's `fix` as `message` and `data: { refusal }`, because
   a resource read has no `isError` result to carry it. Anything else that is not `ok` is `-32002`, *"This resource
   did not answer. Read it again."*

### 5.6 · `tools/list_changed` — how the handler learns, and how the client hears

Neither notification is sent, and the capabilities declare `tools: {}` and `resources: {}` with no `listChanged`.
The transport has no session and no server-initiated stream, and nothing is remembered between messages (§4.1), so
there is nobody to tell. Nothing needs telling about the tools: the fourteen do not change on an install, and no
description names a register (§4.5), so a client may hold `tools/list` for its hour without holding anything stale.

What an install does change is read, never pushed:

1. **Registers** are named by `record_index`, `context` and `boot`, each read when it is wanted.
2. **Schemas, pages, figures and skills** are in `resources/list`, which a client holds for a minute (§4.3).
3. **A stale name** is caught by the record. A call naming a register the record no longer has is refused
   `REGISTER_UNKNOWN` in the record's words, relayed unchanged, and nothing is added to it here.

### 5.7 · MRTR — `propose`

**Not built.** `rpc.ts` renders `propose` as it renders every tool (§5.4): the record's answer as JSON, carrying the
suggestion's id. No result carries `resultType`, and `inputResponses` is not read. What follows is the design, kept
for the day a person can reach MCP and answer in the client (10 §5).

1. `propose` arguments validated (§5.3); `api.propose(args, ctx)` called; the suggestion row exists when it returns.
2. `ok` with `{ id }` renders as the MRTR shape: `{ resultType: 'input_required', requests: [{ id, kind: 'decision',
   question: args.question, options: args.options, requires_reason: true }], content: [{ type: 'text',
   text: "<id> opened: <question>. A person decides it in their app; the choice and its reason become a decision row." }] }`.
   A client that understands MRTR shows the question and options to the person in the tool they are already in
   (10 §5); a runner in `dontAsk` returns `needs_decision` (26 §5); a client that ignores `resultType` reads the text.
3. A `propose` carrying `inputResponses` is answered before any call with an error result
   `{ code: 'LEVEL_REQUIRED', at: 'inputResponses', wanted: 'a person at level decide', fix: "Deciding is a person's
   act and no token holds it; the suggestion waits in the Decide queue of the app." }`. Phase A has only token
   principals over MCP (10 §2), and no token grants `decide` (30 §10) — so the gate holds server-side whatever the
   client did with the options (ADR-009). No second suggestion is opened. The upgrade path is §10's third line.
4. A refusal or conflict from `api.propose` renders as §5.4.

### 5.8 · `tokenBudget` — the estimator

Six run classes, one regular expression, one pass. Whitespace other than newlines costs nothing (a space rides with
the word that follows it in every BPE vocabulary).

```ts
const RUN = /[A-Z]{2,}|[A-Za-z]+|[0-9]+|[!-\/:-@\[-`{-~]+|\n+|[^\x00-\x7F]/gu;
export function tokenBudget(text: string): number {
  let n = 0;
  for (const [s] of text.matchAll(RUN)) {
    const c = s.charCodeAt(0);
    if (/^[A-Z]{2,}$/.test(s)) n += Math.ceil(s.length / 2);        // SHOUTING and codes: REGISTER_UNKNOWN → 8
    else if (/^[A-Za-z]/.test(s)) n += Math.ceil(s.length / 5);     // words: obligations → 3
    else if (c >= 48 && c <= 57) n += Math.ceil(s.length / 3);      // digit groups of three: 3600000 → 3
    else if (s[0] === '\n') n += 1;                                 // a newline run
    else if (c > 127) n += 1;                                       // one non-ASCII code point
    else n += Math.ceil(s.length / 3);                              // punctuation clusters: ":{" → 1
  }
  return n;
}
// ponytail: a run heuristic, not a tokenizer; if the calibration band of §9 ever fails, replace the body
// with a real tokenizer's count and keep the signature.
```

Why not `bytes / 4`: on the `tools/list` of §7 it gives 1,437 against this estimator's 1,741 — it under-counts
minified JSON, whose punctuation clusters tokenise at about three bytes a token, and a budget that under-counts is a
budget that passes in CI and fails in the context window. Why `_` is punctuation: `op_id` is two tokens in o200k
(`op`, `_id`) and would be one under a word rule that absorbed the underscore. Stated bias: about +15 % to +30 % over
o200k_base on prose and on minified JSON, never under on the calibration set — asserted, not assumed (§9). Known
under-case: an emoji is one code point and two or three tokens; none may appear in tool text, and `budget.test.ts`
asserts every description, resource description, prompt and `INSTRUCTIONS` is ASCII.

### 5.9 · What is measured

`budget.test.ts` calls `handle` with `tools/list` over the stub surface and counts the result with `tokenBudget`,
serialised as a transport sends it. It prints the total, the bytes and the instructions' count as a test diagnostic,
and fails when the total is over 2,600, the instructions over 400, or any description at 200 or more. It also holds
everything a client shows a model to plain ASCII: the tool list, the instructions, the resource descriptions and the
templates. There is no gate script and no fixture: the tool list names no register, so there is nothing to vary.

---

## 6 · Refusals and errors

Two vocabularies, never mixed: JSON-RPC's numeric codes for the protocol layer (a request that never reached a
method), and 30 §6's `UPPER_SNAKE` codes inside results (a call the record, or this package on its behalf, refused).
This package raises four corpus codes itself, each named in §5.3 and §5.5: `ROUTE_UNKNOWN`, `VALUE_MALFORMED`,
`REQUIRED_MISSING` and `NOT_IN_THIS_BUILD`. Every other code is relayed from the record unchanged.

### 6.1 · The protocol layer

| JSON-RPC `code` | HTTP | When | `data` |
|---|---|---|---|
| `-32700` | 400 | the body is not JSON | none |
| `-32600` | 400 | not an object; an array; `jsonrpc` other than `'2.0'`; an `id` of the wrong type (§4.1) | none |
| `-32601` | 404 | a `method` outside the nine of `METHODS` | `{ allowed }` |
| `-32602` | 200 | `params` that is not an object; `tools/call` with no `name`, or with `arguments` that is not an object; `resources/read` with no `uri`; `initialize` naming a version older than every one in `VERSIONS` | `{ allowed }` for a missing tool name; `{ supported, requested }` for the version |
| `-32002` | 200 | a resource that is not there, or that the record refused | `{ refusal }` for a refusal |
| `-32020` | 400 | a mirrored header that disagrees with the body, or one a 2026-07-28 request left out (§5.1 step 7) | none |
| `-32022` | 400 | a protocol version this server does not speak, on any method but `initialize` | `{ supported, requested }` |
| `-32001` | 401 | the host knows no caller | none; `message: 'UNAUTHORIZED'` and nothing else (12 §8) |
| `-32603` | 500 | anything thrown below the dispatch | `{ ref }`, a UUID the log line carries; `message: 'internal'` |

Plus the HTTP answers with an empty body: `405` (not `POST`), `403` (an `Origin`), `413` (over `maxBodyBytes`) and
`415` (not JSON), and `202` for a notification. An unknown tool is not a protocol error. It is an error result
carrying `ROUTE_UNKNOWN`, with the fourteen in `allowed` (§4.4), because a result is what the model reads to correct
the call.

### 6.2 · The corpus codes this package raises before any call

**Not built.** There is no `REFUSED` table in `index.ts`. A VAULT, JOBS or ADMIN method name sent to `tools/call` is
`ROUTE_UNKNOWN`, with the fourteen in `allowed` (§5.3), and the record refuses a token at those groups in any case
(30 §10). The table below is an earlier revision's design, kept as that.

> **The ADMIN row is about a direct write, not about metadata (September 22nd 2026,
> [DIRECTION §22](../loop/DIRECTION.md)).** An agent never calls `setDeclaration`, and it does not need to: it adds a
> field, or a value to a closed list, by `propose` with `body_kind: 'change'` and `to: { add: { register, fields, values } }`,
> which is merged onto whatever is live when it lands, so two additions never race (`packages/kernel/src/govern.ts`,
> `addTo`). A new list is not an addition: `addTo` refuses one with `REGISTER_UNKNOWN`, and it is proposed whole. The owner's answer of September 22nd: an additive, optional one lands at once and is logged in history
> ("Claude added domain to Projects"); removing, retyping or narrowing a field still waits for the owner's Accept in
> Decide. Measured at `da9326d6`, the landing without a press is not built yet, and an `add` still waits for Accept
> like any change.

| Code | Group | Methods (`tools/call` by name) | The `fix` an agent reads |
|---|---|---|---|
| `NEEDS_BROWSER_SESSION` | VAULT | `listGrants` `openGrant` `bindGrant` `revokeGrant` | *A credential is the highest-value thing prompt injection could ask for. The vault answers a browser session only; no token reaches it.* |
| `NEEDS_BROWSER_SESSION` | JOBS, session half | `createJob` `cancelJob` `listJobs` | *A job is code execution on a machine. Jobs are created, cancelled and listed from a browser session; ask the owner to run it from the app.* |
| `FORBIDDEN` | JOBS, runner half | `claimJob` `postJobEvent` `readCancel` | *A job is code execution on a machine. Only the enrolled runner's device grant claims it, over /api, never over MCP.* |
| `NEEDS_BROWSER_SESSION` | ADMIN | `planPack` `installPack` `uninstallPack` `setDeclaration` `invite` `export` `import` `erase` `restore` | *Installing a pack or erasing a record is the owner's act, from a browser session. No admin token exists.* |
| `FORBIDDEN` | DATA | `markRead` | *The read mark belongs to a person; a token has none. Use whats-new with your own cursor.* |
| `FORBIDDEN` | READ+ | `project` | *The projection is Spark's read. Read through search, list and get.* |
| `LEVEL_REQUIRED` | — | `propose` carrying `inputResponses` (§5.7) | *Deciding is a person's act and no token holds it; the suggestion waits in the Decide queue of the app.* |

Twenty-one names in `REFUSED` (4 + 3 + 3 + 9 + 1 + 1), plus one shape. The codes are 30 §6's rows
`needs-browser-session`, `forbidden`, `level-required`; this package adds no code and therefore no fixture
(ADR-057). Each refusal is `{ code, at: 'name', found: <name>, fix }`.

### 6.3 · The mapping of the three auth codes

| Code | Over `/api` (33 §4) | Over `/mcp` |
|---|---|---|
| `UNAUTHORIZED` | 401 | HTTP 401, before the body is read (§5.1 step 4) — the one refusal that is an HTTP status here |
| `FORBIDDEN` | 403 | an error result inside HTTP 200, from the record, as when a `read` token calls `create` |
| `NEEDS_BROWSER_SESSION` | 403 | not met over MCP: no tool names a VAULT or ADMIN method, so such a name is `ROUTE_UNKNOWN` first (§5.3) |

Over MCP a refusal is a tool result, because a tool result is what the model reads; the HTTP status describes the
transport exchange and nothing else (§13 D7).

---

## 7 · Performance budget

All token figures are `tokenBudget` (§5.8) of the exact text `handle` returns, serialised as a transport sends it
(`JSON.stringify`, no whitespace). `budget.test.ts` re-counts them on every run.

| Item | Ceiling | Measured | How |
|---|---|---|---|
| `tools/list` result: `tools[]`, `instructions`, `ttlMs`, `cacheScope` | **≤ 2,600** | **2,311** | `budget.test.ts` |
| The fourteen tool objects alone | reported | 1,945 | the same count, less the instructions |
| One tool description | < 200 | 17 (`history`) to 72 (`context`) | `budget.test.ts`, each of the fourteen |
| One tool object: name, description, `inputSchema`, `annotations` | reported | 75 (`record_index`) to 210 (`propose`) | |
| `INSTRUCTIONS` | ≤ 400 | 352 | `budget.test.ts` |
| `record_index` response | ≤ 500 | the record's; 10 §4's example is 106 | relayed unchanged here |
| A `list` page, default 25 rows | ≤ 2,000 | the record's | relayed unchanged here |
| `resources/list` | none | not in any turn; fetched when wanted | |

**2,600, where an earlier revision set 1,800.** That ceiling was set for eight tools. The agent path needs fourteen,
because `context`, `handoff` and `meet` are what an agent does every session (`loop/research-agent-path.md` §1.5),
and those three cost 500 tokens with their schemas. The instructions grew from 268 to 352 for the same reason: they
now say to call `context` first, to hand off, to record learnings sparingly and to call `meet`, so their own ceiling
moved from 300 to 400. The headroom is 289 tokens. One more clause in a description is a clause out of another, and
the test is the arbiter. The instructions are counted inside the figure, because every token of them sits in the
context every turn.

---

## 8 · Security

**Boundaries crossed.** One untrusted boundary, the HTTP body and headers or a line on standard input, and one trusted
call inward, the `surface`. The context is the host's and is trusted: it is the only source of principal, scope and
level.

| Concern | Where it is handled |
|---|---|
| The bearer | never seen here. A host checks it before `/mcp`, as it does for `/api`, and passes a context or `null`; a `null` is a 401 before one byte of the body is read (§5.1). Over stdio the command line sends it from the hosts file |
| Scope, level, ceiling | the record, in one place (30 §10). The tools hand the context on and never read it. `_meta.session` is checked by the host against §4.2 and handed to the record, which resolves it (30 §3) and never trusts an actor a caller names (33 §2) |
| Arguments | the record's: it refuses a wrong field by name, with `allowed`. The tool layer checks addresses and nothing else (§4.4) |
| Body size | 1 MB, on `Content-Length` and again on the bytes as they arrive (§5.1 step 5) |
| Header agreement | a mirrored header must equal the body whenever it is sent, so a check an intermediary makes on the header is a check on the call (§5.1 step 7) |
| Code generation | none. The fourteen input schemas are constants written by hand |
| Error text | a 401 is one word; a throw is `internal` and a UUID; a refusal carries the record's `code`, `fix`, `at` and `allowed`. No stack, no SQL and no path crosses the wire (12 §8) |
| Logging | a throw writes one line to the host's log, or to standard error under stdio: the reference, the method and the error, and never an argument |
| Credentials | no tool names a VAULT method, and the record refuses every token there. `context` names a key by its label and what it opens, and shows its secret field as `{ sealed, opened, last_opened, last_by }`: never the grant, the sealed bytes or a value (ADR-010) |
| Deciding | there is no `decide` tool, and no token reaches `decide` (30 §10) |
| Completeness | the tool list is fixed at fourteen, and any other name is `ROUTE_UNKNOWN`, looked up with `Object.hasOwn` |

**What never travels:** a plaintext credential, a stack trace, an exception message, a SQL string, a file path, a
principal identifier the client did not already hold.

---

## 9 · Tests and gates

`node --test test/*.test.ts` in the package, and the transports' own tests with their hosts. Each file below exists,
and each case is named for what it holds.

| File | Holds |
|---|---|
| `packages/mcp/test/rpc.test.ts` | `handle` over `stub.ts`. `initialize` negotiates, and an older client gets the newest version at or below its own. `server/discover` answers without reading the record, with `cacheScope: 'public'`. `ping`, and `prompts/list` as an empty list. `tools/list` is the fourteen, with the instructions and the read-only ones marked, and reads nothing. Each tool reaches its method with the transport's context. A value is compact JSON, a refusal is carried whole, and a conflict carries the current row and who changed it. An unknown tool, or a name off `Object.prototype`, runs nothing. A throw is `-32603` and a reference, with no exception text. A notification returns `null`, and the id is echoed exactly. A batch or a malformed message is `-32600`, an unknown method `-32601`, and parameters of the wrong shape `-32602`. Resources are listed, templated and read with their `ttlMs`, and an address that is not there, or is refused, is `-32002` |
| `packages/mcp/test/mcp.test.ts` | the tools and resources over a real record. The count is fourteen, and there is no vault tool. Each tool says whether it writes. A row is addressed as a person says it, by `register#number` or by a prefixed id, and `S1` is the run. A refusal names what to send instead, and a stale write comes back as a conflict. `context` and `handoff` answer through the record, and so does `meet`, refused `REGISTER_UNKNOWN` with People switched off and then adding and matching a person; a host without `meet` is `NOT_IN_THIS_BUILD`. The five tools that left answer as any unknown name does. A `read` token reads through every tool and writes through none. Every resource listed reads, and what a surface cannot answer is not listed. A page is withheld for the level held, no metric is advertised that the record says does not exist, and a skill is read by its name |
| `packages/mcp/test/http.test.ts` | `serveMcp` in §5.1's order: 405 with `Allow: POST`; 403 for any `Origin`; 415; 401 before a byte of the body; 413 on the claim and on the bytes; 400 with `-32700` for bytes that are not JSON or not UTF-8, and `-32600` for a batch; 202 for a notification; no session minted, and one a client sends ignored; 404 for a method this server does not have; the mirrored headers held to the body, required of a 2026-07-28 request and not of an older one; `-32022` for an unsupported version, `initialize` exempt; 500 for a throw; `no-store` on every answer, and no CORS or session header |
| `packages/mcp/test/budget.test.ts` | §5.8's estimator on its worked examples, the ceilings of §7, and plain ASCII in everything a client shows a model (§5.9) |
| `apps/cli/test/stdio.test.ts` | `braindog mcp` spawned against a stub `/api`. `initialize` and `tools/list` answer without touching the host. A list call carries the bearer and the session headers. The token comes from the hosts file when the environment has none. A line that is not JSON is a parse error, and the server keeps serving. A host that does not answer, or has nothing listening, gets the unreachable sentence. Calls in flight are answered when stdin ends. A startup failure is one line on stderr. The token is never printed |
| `apps/cli/test/http.test.ts` | the hosts file, its path and its whole-file write; where the host and the token come from; the budget from `BRAINDOG_TIMEOUT_MS`; the bearer and the session headers on a request; no redirect followed; a header outside its grammar dropped |
| `apps/selfhost/test/mcp.test.ts` | a real socket. 401 before the body, and a session cookie is not a bearer. Open mode is nobody at `/mcp`. 405, 415 and 413, a chunked body included. `initialize` then a tool call, with nothing minted. An agent reaches the same things through `/mcp` as through `/api`, at the same levels |
| `apps/selfhost/test/session.test.ts` | `_meta.session` names the run, over the header hints key by key |
| `apps/worker/test/mcp.test.ts` | `/mcp` is one path; only a bearer is a caller; the Directory is asked before the record's object; `/mcp` is recorded as where a token was used; the headers are checked before the bearer |

Not built, from an earlier revision of this section: the tokenizer calibration against `o200k_base`, which needs a
real tokenizer outside the workspace (`loop/BACKLOG.md`); a fuzz test of the handler; and a verdict test that every
routable method has a tool, a resource or a named refusal.

**Gates.** There is no `mcp-budget` gate: the budget is `budget.test.ts` (§7), which runs with the package's tests.
The gates that hold this package are `graph` and `stack`, which keep every `node:` module and `process` out of
`packages/`; `refusals`, which reads every `code:` written here as a refusal code, which is why a JSON-RPC number is
spelt through `Record<'code', number>` (§2); and `secret-grep`.

---

## 10 · Deliberate ceilings

No source file in this package or in `apps/cli` carries a `ponytail:` marker. The ceilings the code holds:

1. `rpc.ts`: one message at a time. A batch is `-32600`.
2. `rpc.ts`: nothing is remembered between messages, so there is no protocol session to resume or expire.
3. `rpc.ts`: no prompts. *"The skill and the instructions teach; a prompt library is a third thing to keep true."*
4. `rpc.ts`: a result is one compact text block, with no `structuredContent` and no `outputSchema` (§4.3).
5. `index.ts`: no `decide` tool. No token reaches `decide`, and a tool that always refuses is a tool an agent spends
   its turns discovering.
6. `http.ts`: a body of at most 1 MB, and one JSON answer, never a stream.
7. No `list_changed` and no `resources/subscribe`: `ttlMs` is the whole cache story (§5.6).
8. No `completion/complete`, `logging/*`, `roots` or `sampling`. The last three are deprecated in 2026-07-28 (10 §1).

And one that is not a ceiling but a boundary, stated once: the legacy HTTP+SSE transport is not carried and never
will be in this package (ADR-054).

---

## 11 · Dependencies

| Kind | Package | Version | Why |
|---|---|---|---|
| runtime | `@braindog/ports` | `workspace:*` | `Result` and `refused` (31 §2, row 12) |
| runtime | `@braindog/record` | `workspace:*` | the tests' real record; no file under `src/` imports it (§1) |

The package declares no dev dependency; the compiler is the workspace's. No `@modelcontextprotocol/sdk`: the protocol
with no session store is `rpc.ts` and `http.ts`, and the SDK would carry the session model this server does not keep.
No JSON Schema validator and no Valibot: the record validates every argument and names the field (§4.4).

---

## 12 · Build order

**Before this:** `packages/ports`, for `Result` and `refused`. `McpSurface<C>` names the record's methods structurally
(§2), so neither the kernel nor the record is a prerequisite of `src/`; the tests run the tools over a real record,
which is why `@braindog/record` is a dependency.

**How it was built**, in the agent path's build order (`loop/research-agent-path.md`, item 2):

| Step | What landed | Where |
|---|---|---|
| 1 | The core: `rpc.ts` and `instructions.ts`, and `index.ts` rebuilt over `McpSurface<C>` with the fourteen tools, the resources and `budget.test.ts` | `packages/mcp` |
| 2 | stdio: `braindog mcp` over `@braindog/client`, the bearer from `BRAINDOG_TOKEN` or the hosts file and never from an argument, a 20-second budget for each call, and the unreachable sentence | `apps/cli/src/{main,http,surface,stdio}.ts` |
| 3 | `POST /mcp` on both hosts: `serveMcp`, with `gate` run first on the Worker so that both refuse in one order | `packages/mcp/src/http.ts`, `apps/worker/src/index.ts`, `apps/selfhost/src/server.ts` |
| 6 | The record answers `handoff` and `sessionsLive`, and both hosts read the session hints from headers and from `_meta.session` | `packages/record`, `packages/host/src/session.ts` |
| 8 | The record answers `context`, and `attach` returns it | `packages/record` |
| 16 | The record answers `meet`, which switches the `meet` tool on, and the end hook sends it the authors of a session's commits | `packages/record`, `packages/host`, `packages/client`, `apps/cli/src/hooks.ts` |

Beside step 8, `rpc.ts` gained `server/discover` and the version rule of §4.1, the two protocol gaps the forty-first
pass left open (`loop/BACKLOG.md`).

**What this unblocks:** the start hook (step 9), which prints the briefing `attach` returns; and the tier-C runner's
`--allowedTools` list, which is `TOOLS.map(name)` prefixed `mcp__braindog__` (26 §5), once the runner is built.

**Interface agreement with spec 45:** each host passes the record's API to `serveMcp` as the surface, and the command
line passes the surface `surfaceOver` builds over `@braindog/client`. So the record answers each method of
`McpSurface<C>` as `(args, ctx) => Promise<Result<T>>`, with `boot` answering at least `{ registers: [{ id, name }] }`
and `version` at least `{ version }`. `tsc` at each call site proves the shapes.

Position: ninth in 31 §2's total order (35 §4); BUILD.md phase 6.

---

## 13 · Decisions taken here

Fifteen, each with where the code holds it. Where an earlier revision decided otherwise, the row says so and names
the documents that still cite the earlier decision.

| # | Decision | Held in |
|---|---|---|
| D1 | **The input schemas are written by hand, and nothing generates them.** An earlier revision generated them from Valibot with `@valibot/to-json-schema`, `scripts/gen-schemas.ts` and a drift test. This package has no Valibot and no generator, because the record validates every argument and names the field (§4.4), and a second validator here would be a second set of checks to keep in step | `index.ts`, `obj()`. 16 (ADR-040) and 31 §9 still describe the generator and cite this row |
| D2 | **The token estimator** is §5.8's six-class run heuristic, copied into `budget.test.ts`, and the ceilings of §7 are ceilings on its count. Its calibration against `o200k_base` is not built | `budget.test.ts` |
| D3 | **No `list_changed`.** Nothing in `tools/list` changes on an install, and what does change is read when it is wanted (§5.6) | `rpc.ts`, `CAPABILITIES` |
| D4 | **`INSTRUCTIONS`** is §4.6's text, sent with `initialize`, `server/discover` and every `tools/list` | `instructions.ts`, `rpc.ts` |
| D5 | **The 2,600 includes the instructions**, and no description or schema names a register, so the list is the same for every record | `budget.test.ts`, §4.5 |
| D6 | **`_meta.session` is the one `_meta` key that reaches the record.** `handle` reads no `_meta`. `serveMcp` hands `_meta.session` to the host's `session` option, which checks it with `hintsOf` (§4.2), and reads `io.modelcontextprotocol/protocolVersion` only to hold the version header to it | `http.ts`, `packages/host/src/session.ts` |
| D7 | **Two error vocabularies.** A protocol failure is a JSON-RPC number (§6.1). Everything the record refuses, and every refusal this package makes on its behalf, is an error result inside HTTP 200 carrying the refusal whole; a conflict is `VERSION_STALE` with `current` and `actor`. An argument outside the published schema is not a protocol error here: the record refuses the field by name | `rpc.ts`, `render` |
| D8 | **MRTR on `propose` is not built.** `propose` answers like every other tool (§5.7) | `rpc.ts` |
| D9 | **Types.** `McpSurface<C>` is structural, `Result` and `refused` come from `@braindog/ports`, and `src/` imports nothing of the record, so the same tools run in process and over `@braindog/client` | `index.ts` |
| D10 | **Resources** are `braindog:<path>`, split and never resolved: six fixed and four templates, each address read before it is listed, with the ttl of §4.7. `decisions` is `governance({ register: 'suggestion' })` | `index.ts` |
| D11 | **No refusal list.** A VAULT, JOBS or ADMIN method name is `ROUTE_UNKNOWN` like any other name that is not a tool, and the record refuses every token at those groups (§6.2) | `index.ts`, `call` |
| D12 | **Transport shape.** stdio and `POST /mcp` around one `handle`. Over HTTP: `POST` only, no `Origin`, JSON only, a bearer before the body, 1 MB, and the mirrored headers held to the body; a notification is 202 and `-32601` is 404; `no-store` and `nosniff` on every answer; no session id, and nothing streamed (§5.1) | `http.ts`, `apps/cli/src/stdio.ts` |
| D13 | **There is no handler factory.** An earlier revision specified `createMcpHandler(api, opts)`. The code has `handle(message, surface, ctx)`, which both transports share, and `serveMcp(request, surface, ctx, options)`, to which a host passes the record's API after the bearer check `/api` uses, or `null` for a caller it does not know | `rpc.ts`, `http.ts`, both hosts |
| D14 | **`cacheScope` is `private` for anything a record answers, and `public` only for `server/discover`**, the two values the MCP specification allows. `tools/list` carries `private`, and the resource results carry `ttlMs` alone | `rpc.ts` |
| D15 | **Versions.** `initialize` answers the version asked for, or the newest this server speaks below it, or the newest of all when none is named, and refuses a date older than all three with `-32602` and the list (§4.1). Over HTTP, a request other than `initialize` that names a version this server does not speak is `-32022` | `rpc.ts`, `negotiate`; `http.ts` |

---

## 14 · Done when

- [x] `packages/mcp` holds the four source files, the test helper and the four test files of §3, and `src/` imports
      only `@braindog/ports` and its own files.
- [x] `TOOLS` has fourteen entries in §4.4's order, each input schema written by hand.
- [x] `handle` answers the nine methods of `METHODS`; `server/discover` carries `cacheScope: 'public'` and
      `tools/list` carries `cacheScope: 'private'`.
- [x] `budget.test.ts` holds `tools/list` at or under 2,600 tokens by `tokenBudget` (measured at 2,311), each
      description under 200 and `INSTRUCTIONS` at or under 400, all in plain ASCII.
- [x] stdio in `apps/cli` and `POST /mcp` on both hosts serve the same `handle`; every HTTP answer carries
      `Cache-Control: no-store`, and no body carries an exception message.
- [x] The record answers `context`, `handoff` and `sessionsLive`, so their tools and resources are live.
- [x] The record answers `meet` (build step 16), so its tool is live. A host older than that refuses it `NOT_IN_THIS_BUILD`.
- [ ] The tokenizer calibration of §9 is built.
- [x] 10, 33 and 45 agree with this document: fourteen tools, `context` in place of `learningsFor`, and no
      `createMcpHandler`.

---

*Next: [45-SPEC-RECORD](45-SPEC-RECORD.md).*
