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
runs anything. It answers `initialize` with the instructions and a negotiated protocol version; `ping`; `tools/list`
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

`src/index.ts` is the package's `.` export and `src/rpc.ts` its `./rpc` export. The second is its own entry because
it imports the first, and a re-export the other way would be a cycle.

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
  get(args: { register: string; seq: number }, ctx: C): Answer;
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
export const METHODS: readonly ['initialize', 'ping', 'tools/list', 'tools/call',
                                'resources/list', 'resources/templates/list', 'resources/read', 'prompts/list'];
export type Reply =
  | { jsonrpc: '2.0'; id: string | number; result: unknown }
  | { jsonrpc: '2.0'; id: string | number | null; error: { message: string; data?: unknown } & Record<'code', number> };
export function handle<C>(message: unknown, surface: McpSurface<C>, ctx: C): Promise<Reply | null>;

// src/instructions.ts
export const INSTRUCTIONS: string;                    // §4.6
```

**`C` is whatever the transport carries.** In process it is the record's `CallContext`; from the command line it is
whatever the stdio loop passes, because the bearer travels in each request. The tools hand it on and never read it.

**The four optional methods** arrive with the session register. Until a surface has one, its tool refuses
`NOT_IN_THIS_BUILD` with a sentence saying what to do instead, and its resource is not listed (§4.7).

**The error's number is spelt through `Record<'code', number>`** so that every `code:` written in this package is a
refusal code, which is what the `refusals` gate counts.

Error contract: `handle` never throws, and a throw below its dispatch becomes `-32603` (§4.1). `call` and `read`
return what the surface returns and add no throw of their own. `resources` never fails: it lists what reads, which
for a caller who can read little is little.

---

## 3 · Files

Three source files, one test helper and three test files. Counted.

```
packages/mcp/
├── package.json         @braindog/mcp · private · "exports": { ".": "./src/index.ts", "./rpc": "./src/rpc.ts" }
│                        dependencies: @braindog/ports, @braindog/record (the tests' real record), both workspace:*
│                        scripts: test = node --test test/*.test.ts · typecheck = tsc --noEmit -p tsconfig.json
├── tsconfig.json        extends ../../tsconfig.base.json
├── src/
│   ├── index.ts         McpSurface, TOOLS, TEMPLATES, ttlOf, tools(): the fourteen, the resource list, the read
│   ├── rpc.ts           handle(): framing, version negotiation, the result renderer
│   └── instructions.ts  INSTRUCTIONS, §4.6
└── test/
    ├── stub.ts          a surface that records every call and answers ok
    ├── mcp.test.ts      the tools and resources over a real record: refusals teach, scoping, nothing listed that refuses
    ├── rpc.test.ts      the golden JSON-RPC cases: one per tool, one per framing rule
    └── budget.test.ts   tokenBudget (§5.8) over the rendered tools/list, the ceilings of §7, plain ASCII
```

`src/http.ts`, which exports `serveMcp()`, arrives with build step 3. There is no `mcp-budget` gate and no generated
schema file: the budget is `budget.test.ts` (§7), and the fourteen input schemas are written by hand in `index.ts`
(§4.4).

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
8. Dispatch on the eight names of `METHODS`. Any other is `-32601`, with `data.allowed` naming the eight.
9. A throw below the dispatch is `-32603`, with `message: 'internal'` and `data: { ref }`, where `ref` is
   `crypto.randomUUID()`. The reference and the error go to `console.error`, which is stderr under stdio and the log
   on a host. No exception text crosses the wire, because an exception message can carry a row's value or a path.

| Number | When | `message`, then `data` |
|---|---|---|
| `-32600` | steps 1, 2, 3 and 5 | a sentence saying what a message is |
| `-32601` | step 8 | `There is no method called <m>.`, then `{ allowed }` |
| `-32602` | step 7; `tools/call` with no `name`, or with `arguments` that is not an object; `resources/read` with no `uri` | a sentence, then `{ allowed }` for a missing tool name |
| `-32603` | step 9 | `internal`, then `{ ref }` |
| `-32002` | `resources/read` of an address that is not there, or that the record refuses | the refusal's sentence, then `{ refusal }` |

**Versions.** `initialize` echoes `params.protocolVersion` when it is one of `VERSIONS` (`2026-07-28`, `2025-06-18`,
`2025-03-26`) and otherwise answers the newest, so a client that predates 2026-07-28 still connects. The `Mcp-Method`
and `Mcp-Name` headers are the HTTP transport's to check, and only when they are present (build step 3).

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
type ToolsListResult = {
  tools: { name: string; description: string; inputSchema: object; annotations?: { readOnlyHint: true } }[];
  instructions: string;                           // INSTRUCTIONS, every time
  ttlMs: 3_600_000; cacheScope: 'record';         // 10 §4 rule 3
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
as 10 §1 names them. The resource list is held for a minute rather than an hour because it names pages, and a page
appears when its row does.

### 4.4 · The fourteen tools, and what each reaches

| Tool | Reaches | Arguments | Writes |
|---|---|---|---|
| `record_index` | `boot`, then `version` | none | no |
| `context` | `context({})` | none | no |
| `schema` | `schema({ register })` | `register` | no |
| `get` | `get({ register, seq })` | `spoken`: `obligations#41`, or a prefixed id such as `S42` | no |
| `list` | `list({ register, where?, limit?, cursor? })` | the same | no |
| `search` | `search({ q, limit? })` | the same | no |
| `history` | `history({ register, seq })` | `spoken`, qualified | no |
| `governance` | `governance(args)` | `register?`, `id?`, `status?`, `limit?` | no |
| `propose` | `propose(args)` | `question`, `body_kind`, `body` | yes |
| `create` | `create({ register, fields, note? })` | the same | yes |
| `update` | `update({ register, seq, patch, version?, note? })` | `spoken`, `patch`, `version?`, `note?` | yes |
| `log` | `update({ register, seq, patch: {}, note })` | `spoken`, `note` | yes |
| `handoff` | `handoff(args)` | `next?`, `tried?`, `note?`, `title?`, `state?` (`idle`, `handoff` or `done`) | yes |
| `meet` | `meet(args)` | `name?`, `email?`, `handle?`, `where` | yes |

These are the fourteen of `loop/research-agent-path.md` §1.5. Five tools left to pay for the three new ones:
`pages`, `page` and `metric` were already resources (§4.7); `credentials` could never answer a token, because the
vault refuses every one; and `dry_run` previews a rule, which only a person installs. Its route stays for the command
line and the web.

The tool layer holds no checks of its own beyond addressing:

- **Addresses.** `get` takes `register#number` or a prefixed id; `history`, `update` and `log` take `register#number`
  only. Anything else is `VALUE_MALFORMED` at `spoken`, and the sentence shows the forms that work. A prefixed id is
  found through the declarations: each register `boot` lists is asked for its `schema`, and the one whose
  `seq_prefix` is the prefix is read by register and number, the one form the record's `get` takes. A register the
  caller cannot read is never asked. A prefix no readable register holds is `REGISTER_UNKNOWN`, and the sentence
  sends `SG` and `D` to `governance`. When the record's `get` takes a spoken id itself (build step 6), this becomes
  one call.
- **Arguments** are not validated against the schema here. The schemas are JSON Schema written by hand in
  `index.ts`, with `additionalProperties: false` and `required` left out when empty. The record refuses a wrong field
  by name (`FIELD_UNKNOWN`, `ENUM_VALUE_UNKNOWN`, with `allowed`), which teaches better than a protocol error would.
- **A tool the record does not answer yet**, which is `context`, `handoff` or `meet` over a surface without the
  method, is `NOT_IN_THIS_BUILD` with a sentence saying what to do instead.
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
Money is an integer in minor units with its currency. Divide by 100 before saying a number, and never add two currencies.
Writes are compare-and-set. On VERSION_STALE, re-read the row and re-apply your change to the new copy. Never resend the copy you held.
An agent never decides. Lay out options with propose; the person chooses in their app. To change something you may not change yourself, such as a skill's text or where a key applies, propose it.
A credential never goes in a row, a note or a tool call. Deposit a key with the command braindog key add, which reads it from standard input.
Before you stop, call handoff with the one next step. Record each dead end in tried the moment you rule it out.
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

Every step that fails produces a `Response` and stops. Nothing below step 4 runs before `opts.context` has answered.

1. **Method.** `req.method !== 'POST'` → `405`, `Allow: POST`. There is no `GET` stream — the server is stateless and
   has nothing to push (10 §1) — and no `DELETE`, because there is no session to end.
2. **Content type.** `Content-Type` not `application/json` (parameters ignored) → `415`.
3. **Accept.** Read once, for one bit: does it offer `text/event-stream`? Kept as `wantsSse` for step 14.
4. **Context.** `ctx = await opts.context(req)`. `null` → `401`, `WWW-Authenticate: Bearer`, body
   `{ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'UNAUTHORIZED' } }` — and nothing else (12 §8: a 401
   says only this). The body has not been read; a stranger's payload is never parsed.
5. **Size.** `Content-Length` above `maxBodyBytes` → `413`. Absent: the body stream is read with a running count and
   aborted at the cap → `413`.
6. **Parse.** `JSON.parse` fails → `400`, `-32700`. Not an object, an array, `jsonrpc !== '2.0'`, `method` not a
   string, `id` present but neither string nor number → `400`, `-32600`.
7. **Notification.** No `id` → `202`, empty body. Nothing is executed on a notification.
8. **Header agreement.** `Mcp-Method` must equal `method`; for `tools/call` `Mcp-Name` must equal `params.name`, for
   `resources/read` `params.uri`, for `prompts/get` `params.name`. Missing or different → `400`, `-32600`,
   `fix: "Send Mcp-Method and Mcp-Name equal to the body; this server speaks MCP 2026-07-28."` The edge rate-limits on
   these headers (10 §8); a body that disagrees with them is a body dodging the limit.
9. **`_meta`.** `params._meta.session`, if present, against §4.2. A miss → `400`, `-32600` with `data.at` the field.
   Then `ctx = { ...ctx, session }`.
10. **Dispatch** on `method`: `ping` → `{}`; `tools/list` (§5.2); `tools/call` (§5.3); `resources/list`,
    `resources/templates/list`, `resources/read` (§5.5); `prompts/list`, `prompts/get` (§4.8); anything else → `-32601`.
11. **Call.** The one `api` call the dispatch chose, `await`ed inside `try`.
12. **Render** the `Result` (§5.4) or the list.
13. **Thrown?** Anything thrown at 10–12 → `500`, `-32603`, `message: 'internal'`, `data: { ref }` where `ref` is
    `crypto.randomUUID()`; the host's logger receives `{ ref, method, name, stack }` through `console.error` — never
    the arguments (35 §2's logging rule). No exception text crosses the wire.
14. **Respond.** `Cache-Control: no-store` on every response. If §5.6 says a `list_changed` is due, the method is not
    a `*/list`, and `wantsSse`: `text/event-stream` with three `data:` events — the two notifications, then the
    response. Otherwise `application/json`, one message. HTTP status: `200` for every JSON-RPC message except those steps 4, 6,
    8, 9 and 13 name.

### 5.2 · `tools/list`

1. `idx = await api.index({}, ctx)`; `registers = idx.ok ? idx.value.registers.map(r => r.id) : []` — a refusal here
   (a token with no readable register) renders the empty form of §4.5, never an error: the tool list must always
   arrive. One `index` read per `tools/list`, which a client makes once per `ttlMs`.
2. Render `list`'s description with §4.5's rule.
3. `tools = TOOLS.map(t => ({ name, description: rendered, inputSchema: t.inputSchema }))` — the eight, in order.
4. Result `{ tools, instructions: INSTRUCTIONS, ttlMs: 3_600_000, cacheScope: 'record' }`.

The `inputSchema` objects are the generated constants of `tool-schemas.gen.ts`: `scripts/gen-schemas.ts` calls
`toJsonSchema(schema, { errorMode: 'throw' })` for each of the eight — throwing on anything unrepresentable is the
property 31 §9 chose Valibot for — deletes the `$schema` key each conversion emits (fifteen tokens, eight times), and
writes the file. `test/schemas.test.ts` regenerates in memory and asserts deep equality, so the committed artefact
cannot drift from the validator that enforces it.

### 5.3 · `tools/call`

1. `name = params.name`. In `TOOLS` → step 2. In `REFUSED` → an error result with that verdict's refusal
   (`{ code, at: 'name', found: name, fix }`) — *before any call*, the test of 10 §8. Otherwise `-32602`,
   `fix: "Unknown tool; the eight are record_index, search, get, list, create, update, propose, log."`
2. `args = params.arguments ?? {}`; `v.safeParse(tool.schema, args)`. Any issue → `-32602`: `message` is the fix
   sentence, `data: { at: 'arguments.' + issue.path, found, wanted, fix }` — one entry per issue, first one in
   `message` (§13 D7: a call that does not match its published schema is a protocol error, not a record refusal).
3. Two checks the schema cannot say and the description already does: `get` needs exactly one of `spoken`,
   `register`+`seq`, `id`; `update` needs exactly one of `seq`, `id`. Otherwise `-32602`,
   `fix: "Give exactly one address: spoken, or register and seq, or id."`
4. `propose` with `params.inputResponses` present → §5.7 step 3, no call.
5. `result = await api[tool.method](args, ctx)`. For `record_index` the method is `index` and the argument object is
   passed through unchanged (`level`, `scope`).
6. Render (§5.4); `propose` renders through §5.7.

### 5.4 · Rendering a `Result`

| `Result` | MCP result |
|---|---|
| `{ ok: true, value, version }` | `{ content: [{ type: 'text', text: JSON.stringify(value) }], _meta: { version } }` |
| `{ ok: false, refusals }` | `{ isError: true, content: [{ type: 'text', text: refusals.map(line).join('\n') }], structuredContent: { refusals } }` |
| `{ ok: false, conflict }` | `{ isError: true, content: [{ type: 'text', text: "VERSION_STALE · version <conflict.version> — <actor> changed this row; re-read the current row below and re-apply." }], structuredContent: { conflict } }` |

`line(r)` = `` `${r.code} · ${r.at}${r.found === undefined ? '' : ` '${String(r.found)}'`} — ${r.fix}` ``. The refusal
teaches (10 §7 rule 4): the model reads `content`; a client that wants structure reads `structuredContent`. Values
are never inspected or reshaped — `next`, `cursor`, `truncated`, `sinceCapped` arrive exactly as the record wrote them.

### 5.5 · `resources/list`, `resources/templates/list`, `resources/read`

1. `resources/list`: `api.index({}, ctx)` as in §5.2 step 1; the five literal resources, then `schema/<id>` for each
   register in the index's order; `ttlMs: 3_600_000`.
2. `resources/templates/list`: `braindog:whats-new{?since}`, `braindog:page/{slug}`, `braindog:metric/{id}`,
   `braindog:learnings/for/{repo}` — four.
3. `resources/read`: split `params.uri` at the first `:`; scheme must be `braindog`. Match the path against the ten
   rows of §4.7 in order — literal first, then `prefix/` + one segment; `whats-new` accepts `?since=<digits>`. No
   match, or a parameter outside its grammar → `-32002`, `fix: "Unknown resource; call resources/list."`
4. Call the row's method with `row.args(value)`. `ok` → `{ contents: [{ uri, mimeType: 'application/json',
   text: JSON.stringify(value) }], ttlMs: row.ttlMs, cacheScope: 'record' }`. A refusal or conflict → `-32002`,
   `message` = the first refusal's `fix`, `data: { refusals }` — a resource read has no `isError` result to carry it.

### 5.6 · `tools/list_changed` — how the handler learns, and how the client hears

The transport has no session and no server-initiated stream, and the Worker that hosts the handler keeps nothing
between requests (51 §5.3), so the handler cannot be *told* that a pack was installed; it can only *notice the
consequence*, and a notification can only ride inside the response to a request the client makes. Two facts make
that sufficient: a client caches `tools/list` for `ttlMs` (one hour), and the eight tools never change — only the
register list inside `list`'s description does (ADR-008).

1. **Evidence.** A `tools/call` or `resources/read` whose `Result` carries a refusal with `code === 'REGISTER_UNKNOWN'`
   is proof that the client's cached list names a register the record no longer has — the exact case 10 §3 describes
   (*"calling `list(register: 'invoices')` against a record that no longer has one"*).
2. **The ride.** When the client offered `text/event-stream`, that response is an SSE body of three events:
   `{ jsonrpc: '2.0', method: 'notifications/tools/list_changed' }`, then
   `{ jsonrpc: '2.0', method: 'notifications/resources/list_changed' }`, then the error result or error. Registers
   and schemas changed together, so both notifications go. Without SSE in `Accept`, the error result alone goes; the
   record's `REGISTER_UNKNOWN` `fix` still teaches, and the handler adds nothing to it.
3. **Additions.** A register an install added is seen on the client's next `tools/list`, at most one `ttlMs` later.
   Nothing else about the tool list changes on install.
4. **Never on a `*/list` response**, and never from state: no hash, no timestamp, no per-client record exists.

### 5.7 · MRTR — `propose`

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

`tools/gates/mcp-budget.mjs` builds a handler over a stub `api` whose `index` returns `test/fixtures/index-24.json`
(24 registers — the cap of §4.5, so the worst case that still shows every id) and a `context` returning a `read`
token; it POSTs `tools/list` and prints, per tool, `tokenBudget` of the description and of the whole tool object,
then `INSTRUCTIONS`, then the whole result. Any row over its §7 ceiling exits 1. The same numbers over
`index-14.json` are asserted in `budget.test.ts`, so a local `pnpm test` fails before CI does.

---

## 6 · Refusals and errors

Two vocabularies, never mixed: JSON-RPC's numeric codes for the protocol layer (a request that never reached a
method), and 30 §6's `UPPER_SNAKE` codes inside results (a call the record, or this package on its behalf, refused).
This package raises exactly three corpus codes itself; every other code is relayed from the record unchanged.

### 6.1 · The protocol layer

| JSON-RPC `code` | HTTP | When | `data` |
|---|---|---|---|
| `-32700` | 400 | the body is not JSON | — |
| `-32600` | 400 | not an object; an array; `jsonrpc` ≠ `'2.0'`; `id` of the wrong type; `Mcp-Method`/`Mcp-Name` missing or disagreeing (§5.1 step 8); `_meta.session` outside §4.2 | `{ at, found?, fix }` |
| `-32601` | 200 | a `method` outside the eight of §5.1 step 10 | `{ fix }` |
| `-32602` | 200 | an unknown tool or prompt; arguments that fail the schema (§5.3 step 2–3); a prompt argument missing or over 8,192 bytes | `{ at, found?, wanted?, fix }` per issue; `message` = the first `fix` |
| `-32002` | 200 | an unknown resource URI or parameter; a resource read the record refused | `{ fix }` or `{ refusals }` |
| `-32001` | 401 | `opts.context` returned `null` | none — `message: 'UNAUTHORIZED'` and nothing else (12 §8) |
| `-32603` | 500 | anything thrown below dispatch | `{ ref }` — a UUID the log line carries; `message: 'internal'` |

Plus three HTTP-only answers with an empty body: `405` (not `POST`), `413` (over `maxBodyBytes`), `415` (not JSON);
and `202` for a notification.

### 6.2 · The corpus codes this package raises before any call

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
| `FORBIDDEN` | 403 | an error result inside HTTP 200 — from the record when a `read` token calls `create`, or from `REFUSED` for the five names above |
| `NEEDS_BROWSER_SESSION` | 403 | an error result inside HTTP 200, from `REFUSED`, before any call |

Over MCP a refusal is a tool result, because a tool result is what the model reads; the HTTP status describes the
transport exchange and nothing else (§13 D7).

---

## 7 · Performance budget

All token figures are `tokenBudget` (§5.8) of the exact text `handle` returns, serialised as a transport sends it
(`JSON.stringify`, no whitespace). `budget.test.ts` re-counts them on every run.

| Item | Ceiling | Measured | How |
|---|---|---|---|
| `tools/list` result: `tools[]`, `instructions`, `ttlMs`, `cacheScope` | **≤ 2,600** | **2,311** (7,924 bytes) | `budget.test.ts` |
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

**Boundaries crossed.** One untrusted boundary — the HTTP body and headers — and one trusted call inward, `api`.
`opts.context` is the host's and is trusted; its output is the only source of principal, scope, level and `now`.

| Concern | Where it is handled |
|---|---|
| The bearer | never seen: `opts.context(req)` reads the header, the handler reads its answer. A `null` is a 401 before one byte of body is read |
| Scope, level, ceiling | `ctx` only. The handler never reads a principal, an actor, a scope or a level from the body; `_meta.session` is grammar-checked and handed to the record, which resolves it (30 §3) and never trusts a caller-supplied actor (33 §2) |
| Arguments | validated by the module-scope Valibot schema before any call (§5.3); unknown keys refused (`strictObject`), not dropped — a hallucinated key is intent, not noise |
| Body size | 1 MB, checked on `Content-Length` and again on the stream (§5.1 step 5) |
| Header agreement | `Mcp-Method`/`Mcp-Name` must equal the body, so the edge's per-tool limit on the header is the limit on the call (§5.1 step 8) |
| Code generation | none at request time: schemas and validators are module-scope constants; JSON Schemas are a committed artefact (31 §9, ADR-040) |
| Error text | a 401 is one word; a 500 is `internal` plus a UUID; a refusal carries `code at found wanted fix` from the record and nothing from the runtime. No stack, no SQL, no path ever crosses the wire (12 §8) |
| Logging | one line per failure: `{ ref, method, name, code }` — never an argument, a value or a note (35 §2) |
| Credentials | no route: VAULT is refused by name before any call; `secret` fields are replaced by their label before the record projects a row (30 §9 rule 3); no tool returns a secret (ADR-010) |
| Deciding | no path: `inputResponses` is refused for every principal (§5.7); a token cannot become a person by phrasing |
| Completeness | the verdict test (§9) — every routable method is a tool, a resource or a named refusal, so nothing is reachable by accident |

**What never travels:** a plaintext credential, a stack trace, an exception message, a SQL string, a file path, a
principal identifier the client did not already hold.

---

## 9 · Tests and gates

`node --test test/`, five files. Every golden case is a JSON fixture `{ name, headers, body, ctx, api, expect }`:
`api` names the stub method and the `Result` it returns; `expect` gives HTTP status, headers that matter, the body,
and the `api` calls recorded (method, args, `ctx.session`). Thirty-four golden cases, counted: thirty in the table,
four below it.

| # | Input | Expected |
|---|---|---|
| 1 | `tools/list`, `Mcp-Method: tools/list`, stub `index` → `index-14.json` | 200; `api.index({}, ctx)` called once; eight tools in 30 §5's order; `instructions === INSTRUCTIONS`; `ttlMs 3600000`; `cacheScope 'record'`; `list`'s description names the 14 registers in order; stub `index` → refusal → the description reads `Registers: none you can read.` |
| 2 | `tools/call record_index {}` | `api.index({}, ctx)`; content text = JSON of the stub value; `_meta.version` |
| 3 | `record_index { level: 'digest', scope: { repo: 'crumb-bot' } }` | `api.index` called with exactly those arguments |
| 4 | `search { q: 'cloudflare', limit: 10 }` | `api.search({ q, limit })` |
| 5 | `get { spoken: 'SG23' }` · `get { register: 'obligations', seq: 7, path: 'note' }` · `get { id: <ulid> }` | three calls, arguments passed through |
| 6 | `get { spoken: 'SG23', id: <ulid> }` · `get {}` | `-32602`, "exactly one address"; no call |
| 7 | `list { register: 'obligations', where: {…}, limit: 25 }` | `api.list`; the stub's `cursor` arrives untouched in the text |
| 8 | `create { register, fields, op_id }` | `api.create`; `_meta.version` |
| 9 | `update { register, seq: 12, patch, version: 4, op_id }` → stub `ok` | content = the row |
| 10 | same → stub `conflict { version: 5, current, actor: 'person:sam' }` | `isError`; text starts `VERSION_STALE · version 5 — person:sam`; `structuredContent.conflict.current` present |
| 11 | `update` with both `seq` and `id` | `-32602`; no call |
| 12 | `propose { question, options: [2], body_kind: 'options', body }` → stub `ok { id: 'SG23' }` | `resultType 'input_required'`; `requests[0] = { id: 'SG23', kind: 'decision', question, options, requires_reason: true }`; content text names `SG23` |
| 13 | `propose` with `inputResponses: [{ id: 'keep', reason: 'still deploys' }]` | `isError`; `LEVEL_REQUIRED at inputResponses`; **no call** |
| 14 | `log { note: 'Cancelled the paid plan; nothing deployed in 60 days.' }` | `api.log` |
| 15 | `log { note: <281 chars> }` | `-32602`, `at 'arguments.note'` |
| 16 | `list { register: 7 }` · `list { registre: 'x' }` · `list {}` | `-32602` each: wrong type, unknown key, missing key; `data.at` names the field; no call |
| 17 | `list { register: 'invoices' }` → stub refusal `REGISTER_UNKNOWN` | `isError`; text `REGISTER_UNKNOWN · register 'invoices' — <fix>`; `structuredContent.refusals[0].code` |
| 18 | `tools/call openGrant` · `installPack` · `createJob` | `isError`, `NEEDS_BROWSER_SESSION`, the group's `fix`; **no call** |
| 19 | `tools/call claimJob` · `markRead` · `project` | `isError`, `FORBIDDEN`, the `fix`; no call |
| 20 | `tools/call frobnicate` | `-32602`, the eight named |
| 21 | `resources/list` | `api.index` called once; 5 literals then `schema/<id>` per register in the index's order; `ttlMs 3600000` |
| 22 | `resources/templates/list` | exactly `whats-new{?since}`, `page/{slug}`, `metric/{id}`, `learnings/for/{repo}` |
| 23 | `resources/read braindog:schema/obligations` | `api.schema({ register: 'obligations' })`; `mimeType application/json`; `ttlMs 3600000` |
| 24 | `braindog:page/money` · `braindog:whats-new?since=120` · `braindog:learnings/for/crumb-bot` · `braindog:decisions` · `braindog:boot` | `page({slug})` · `whatsNew({cursor:120})` · `learningsFor({repo})` · `list({register:'decision',limit:50})` · `boot({})`; the ttl of each row |
| 25 | `braindog:nope` · `braindog:learnings/for/../x` · `http://x` | `-32002`; no call |
| 26 | `prompts/list` · `prompts/get orient` · `prompts/get file-this { text }` · `prompts/get write-up {}` | three prompts; one user message; `-32602` for the missing `spoken` |
| 27 | `Mcp-Method: tools/list` with body `tools/call` · missing `Mcp-Name` on `tools/call` | `-32600`, 400; no call |
| 28 | `context → null` | 401; `WWW-Authenticate: Bearer`; body exactly `{ jsonrpc, id: null, error: { code: -32001, message: 'UNAUTHORIZED' } }` |
| 29 | body `[…]` · `not json` · no `id` · `GET` · `Content-Type: text/plain` · `Content-Length: 1048577` | 400 `-32600` · 400 `-32700` · 202 empty · 405 · 415 · 413 |
| 30 | `_meta.session { spoken: 'S42', repo: '../x' }` · `_meta.session { spoken: 'S42', repo: 'crumb-bot', host: 'laptop' }` | 400 `-32600 at _meta.session.repo` · the call's `ctx.session` deep-equals the object and `ctx.principal` is the host's |

Beyond the golden set:

| Test | Asserts |
|---|---|
| `list_changed` (golden 31–33) | `list { register: 'invoices' }` → stub refusal `REGISTER_UNKNOWN`, `Accept: application/json, text/event-stream` → `text/event-stream` with three `data:` events in order (tools notification, resources notification, the error result); the same with `Accept: application/json` → plain JSON error result; a stub refusal with another code (`FORBIDDEN`) → plain JSON; `resources/read braindog:schema/invoices` → stub `REGISTER_UNKNOWN` → SSE: two notifications then the `-32002` error |
| thrown `api` (golden 34) | 500; `error.code -32603`; `message 'internal'`; `data.ref` is a UUID; the body contains neither the thrown message nor `at ` |
| `schemas.test.ts` | for each of the eight, `toJsonSchema(schema, { errorMode: 'throw' })` minus `$schema` deep-equals the generated constant; no generated schema contains `$schema`; every optional property has a `description` |
| `verdict.test.ts` | the 38 names of 30 §5 minus INTERNAL = `TOOLS.map(method)` ∪ `RESOURCES.map(method)` ∪ `Object.keys(REFUSED)`; `REFUSED` is disjoint from the other two; the only name in both `TOOLS` and `RESOURCES` is `list` (the `decisions` resource); `record_index` maps to `index`; `DATA_API_METHODS` equals `TOOLS.map(method)` ∪ `RESOURCES.map(method)` — seventeen |
| `budget.test.ts` — calibration | `test/fixtures/calibration.json`: twelve `{ text, o200k }` pairs (four prose, four minified JSON, two id-heavy, two with newlines), counted once by hand with `gpt-tokenizer`'s `o200k_base` outside the workspace and committed with the tokenizer version; asserts `o200k ≤ tokenBudget(text) ≤ 1.4 × o200k` for every pair |
| `budget.test.ts` — ceilings | each rendered description ≤ 200; `INSTRUCTIONS` ≤ 300; `tools/list` over `index-14.json` ≤ 1,800 and over `index-24.json` ≤ 1,800; a 40-register stub shows 24 ids and `+16 more`; every description, resource description, prompt text and `INSTRUCTIONS` is ASCII; 200 stub calls have median wall time ≤ 2 ms |
| `fuzz.test.ts` | fast-check, 500 runs: for `fc.oneof(fc.string(), fc.json())` as body and random headers, the handler resolves to a `Response` and never rejects; failing seeds committed under `test/seeds/` |

CI rows (33 §8): `mcp-budget` — this package's gate script; `router-groups` — the host's, cited; `refusal-fixtures` —
unaffected, no code added. `ci.yml` runs `pnpm -F @braindog/mcp test`; `gates.yml` runs `mcp-budget`.

---

## 10 · Deliberate ceilings

Eleven `ponytail:` lines, each in the file it names.

1. `budget.ts` — *ponytail: a six-class run heuristic, not a tokenizer; if the calibration band fails, replace the body with a real tokenizer's count and keep the signature.*
2. `index.ts` — *ponytail: `list_changed` is emitted on evidence — a `REGISTER_UNKNOWN` refusal — never on the install itself, because the Worker keeps no state between requests; a newly installed register is seen within one `ttlMs`. Add a push from a host that has state (the Durable Object) if an hour ever proves too long.*
3. `tools.ts` — *ponytail: `inputResponses` is refused for every principal because Phase A has only token principals over MCP; when a person principal can arrive (OAuth), forward the response to the decide method spec 45 names, keyed by `requests[0].id`.*
4. `tools.ts` — *ponytail: the register list is embedded once, in `list`, and capped at 24; move it into an `enum` in every schema if a client is found that cannot read descriptions (ADR-008's reversal condition).*
5. `wire.ts` — *ponytail: a response is one JSON body, or an SSE string of two or three events; nothing streams. A `get` on a large document is one body; add chunking when a document exceeds the 1 MB body the other way.*
6. `resources.ts` — *ponytail: no `resources/subscribe`; `ttlMs` is the whole cache story. Add subscriptions when a client honours them and a page is read more than once a minute.*
7. `resources.ts` — *ponytail: prompts are three static templates with verbatim argument insertion; no prompt registry, no per-record prompts.*
8. `index.ts` — *ponytail: no `outputSchema` and no `structuredContent` on `ok` results — nothing consumes them; add when a client validates outputs.*
9. `index.ts` — *ponytail: the register list is one `api.index` read per `tools/list`, which also counts rows the description never shows; swap for a lighter READ+ method if `tools/list` ever appears in a profile.*
10. `index.ts` — *ponytail: no logging or timing hook in `opts`; the host wraps the returned function if it wants either.*
11. `index.ts` — *ponytail: no `completion/complete`, no `logging/*`, no `roots`, no `sampling` — the last three are deprecated in 2026-07-28 (10 §1) and the first has no client that uses it here.*

And one that is not a ceiling but a boundary, stated once: the legacy HTTP+SSE transport is not carried and never
will be in this package (ADR-054).

---

## 11 · Dependencies

| Kind | Package | Version | Why |
|---|---|---|---|
| runtime | `@braindog/declare` | `workspace:*` | the `Refusal` type (42 §2) |
| runtime | `valibot` | `1.4.2` | argument validation at module scope — the same pin `declare` carries (ADR-040); not a new runtime dependency under ADR-046 |
| dev | `@valibot/to-json-schema` | the release paired with `valibot 1.4.2`; pinned exactly at first install and added to 31 §3's table (§13 D1) | `scripts/gen-schemas.ts` and `schemas.test.ts` only — never imported from `src/` |
| dev | `fast-check` | `4.9.0` | `fuzz.test.ts` |
| dev | `typescript` · `@types/node` | `6.0.3` · `24.13.0` | the root's |

No `@modelcontextprotocol/sdk`: the 2026-07-28 shape without a handshake is ~110 lines of `wire.ts`, and the SDK
would carry the session model the spec removed. No JSON Schema validator at runtime: the Valibot schema validates,
the JSON Schema advertises, and the drift test keeps them equal.

---

## 12 · Build order

**Before this:** `packages/declare` (spec 42) — for the `Refusal` type and the Valibot pin. The envelope types of
33 §2 are declared here structurally, so neither `packages/kernel` (41) nor `packages/record` (45) is a
prerequisite: this package builds and its tests pass against a stub `api`.

**What this unblocks:** `apps/worker`'s `POST /mcp` (51 §5.3), which constructs the handler per request over the
record stub with a one-line adapter —

```ts
const api = Object.fromEntries(DATA_API_METHODS.map(m => [m, (args: unknown, ctx: CallContext) => stub.call(m, args, ctx)])) as DataApi;
return createMcpHandler(api, { context: async () => pre })(req);
```

— `apps/selfhost`'s `POST /mcp` over the in-process record; the `mcp-budget` gate; the tier-C runner's
`--allowedTools` list, which is `TOOLS.map(name)` prefixed `mcp__braindog__` (26 §5).

**Interface agreement this package demands of spec 45:** `record`'s `call(m, args, ctx)` (51 I2) accepts the
seventeen names of `DATA_API_METHODS` with 33 §2's argument objects — the READ+ methods with object arguments
(`page({ slug })`, not `page(slug)`) — and returns `Result<T>` with `CallContext` structurally equal to §2 (41 D1's
declarations are that); `index` returns at least `{ registers: [{ id }] }`; `propose` returns `{ id: 'SG<n>' }`.
`tsc` at the Worker's adapter proves the shapes.

Position: ninth in 31 §2's total order (35 §4); BUILD.md phase 6.

---

## 13 · Decisions taken here

Thirteen, each with the document to amend in the same revision.

| # | Decision | Amend |
|---|---|---|
| D1 | **JSON Schema is generated at build time.** `scripts/gen-schemas.ts` converts the eight Valibot schemas with `@valibot/to-json-schema` (`errorMode: 'throw'`), strips `$schema`, and writes `src/tool-schemas.gen.ts`; the package is a devDependency; `schemas.test.ts` asserts no drift | 31 §9 last paragraph and ADR-040: name the script, the artefact and the drift test; 31 §3: add the `@valibot/to-json-schema` pin |
| D2 | **The token estimator** is §5.8's six-class run heuristic; the budgets of 10 §4 are ceilings on its count; its bias is asserted against `o200k_base` on a twelve-string calibration set, band `[1.0, 1.4]` | 10 §4 "asserted in CI by counting tokens" → "by `tokenBudget` (44 §5.8)"; 33 §8's `mcp-budget` row cites it |
| D3 | **`tools/list_changed` is emitted on evidence**: a `REGISTER_UNKNOWN` refusal on `tools/call` or `resources/read` makes that response an SSE body carrying `tools/list_changed` and `resources/list_changed` before the result; an added register is seen within one `ttlMs`. The stateless Worker cannot be told about an install (51 §5.3), and the eight tools do not change on one (ADR-008) | 10 §3 "Emitted on pack install…" → "carried in the response that proves the cache stale; an added register within `ttlMs`"; 33 §4's `/mcp` row |
| D4 | **`INSTRUCTIONS`** is §4.6's text, 268 tokens | 10 §8: replace the paraphrase with a pointer to 44 §4.6 |
| D5 | **The 1,800 includes `instructions`**; the register list appears once, in `list`'s description, capped at 24 ids; no schema carries an `enum` of registers | 10 §3 "descriptions embed" → "`list`'s description embeds"; 10 §4's table row |
| D6 | **`_meta.session`** is the one `_meta` key read; it mirrors `CallContext.session` field for field with §4.2's grammar; every other `_meta` key is ignored | 33 §2 "the `_meta` block of an MCP call" → "`_meta.session` (44 §4.2)" |
| D7 | **Two error vocabularies.** A call that does not match its published schema is JSON-RPC `-32602` with `message` = the fix and `data` = `{ at, found, wanted, fix }` — the corpus has no argument-shape code and ADR-057's table is not grown for one. Everything the record refuses is an error result inside HTTP 200 carrying `code` and `fix`; a conflict is `VERSION_STALE` with `current` and `actor` | 30 §6's MCP row: "an error result carrying `code` and `fix` for the record's refusals; the protocol's `-32602` for a call outside its published schema"; 10 §3 "over HTTP a refusal is 422" gains "over MCP, an error result" |
| D8 | **MRTR on `propose`:** `resultType: 'input_required'`, one request of `kind: 'decision'` whose `id` is the suggestion id; a retry carrying `inputResponses` is refused `LEVEL_REQUIRED` before any call while every MCP principal is a token. An earlier brief wrote `decision_required`; the protocol's value is `input_required` and `decision` is the request's `kind` | 10 §5: the example's second half is the person-principal phase; 15 §A4 "MRTR decision gate" → "MRTR shape; the answer path when OAuth lands" |
| D9 | **Types.** `Result`, `CallContext`, `Conflict` are re-declared structurally here — their owner is `kernel` (41 §13 D1), to which `mcp` has no edge, and the Worker's `tsc` binds the two declarations at the adapter; `Refusal` comes from `declare` (42 §2); READ+ methods take object arguments; `ports` is not imported | 31 §2 row 9: `mcp` depends on `7`; 33 §2: READ+ rows written as `page({ slug })` etc.; 41 §13 D1 gains "44 re-declares them structurally" |
| D10 | **Resource URIs** are `braindog:<path>`; `resources/list` is concrete for the five literals and `schema/<id>` per readable register; `page`, `metric`, `learnings/for`, `whats-new` are templates; the ttl table of §4.7; `decisions` is `list({ register: 'decision', limit: 50 })` | 10 §6: add the scheme, the ttl column and the four templates |
| D11 | **The refusal list over MCP is twenty-one methods**: VAULT, JOBS-session and ADMIN as `NEEDS_BROWSER_SESSION`; JOBS-runner, `markRead` and `project` as `FORBIDDEN`; plus `inputResponses` as `LEVEL_REQUIRED`. INTERNAL has no name the handler knows | 10 §8's table: add the `markRead` and `project` rows and split JOBS by half with its code |
| D12 | **Transport shape.** `POST` only (`405` otherwise); notifications `202`; `Cache-Control: no-store` on every response; `application/json` unless a notification rides, then `text/event-stream`; `Content-Type` must be JSON (`415`); 1 MB body (`413`); `ttlMs`/`cacheScope` are top-level result fields | 33 §4: `no-store` covers `/mcp`; 10 §1's `ttlMs` row names the position |
| D13 | **The factory is `createMcpHandler(api, opts)` — no `decls`.** The handler runs where the record is a stub behind an RPC and the host keeps nothing between requests (01 §5, 51 §5.3); the register list is one `api.index` read at `tools/list`; `api` is the seventeen named methods of `DataApi`, and a host with a generic `call` adapts in one line over `DATA_API_METHODS` (§12). The brief for this spec and 10 §1 wrote `(api, decls)`; 51 I1 asked for the read through `api`, and the read wins because a stateless host cannot hold `decls` | 10 §1: `createMcpHandler(api, decls)` → `createMcpHandler(api, { context })`; 51 §5.3 step 3 and I1: the adapter of §12 in place of `{ call }` |

---

## 14 · Done when

- [ ] `packages/mcp` exists with the seven files of §3; `pnpm -F @braindog/mcp typecheck` and `test` are green.
- [ ] `TOOLS` has eight entries in 30 §5's order; each `inputSchema` is the generated constant; `schemas.test.ts` passes.
- [ ] `tools/list` over `index-24.json` is ≤ 1,800 tokens by `tokenBudget`; every description ≤ 200; `INSTRUCTIONS` ≤ 300; `mcp-budget` prints the table and exits 0.
- [ ] The calibration file holds twelve pairs with the tokenizer version recorded, and the band `[1.0, 1.4]` holds.
- [ ] All 34 golden cases pass, including the five refused names, the MRTR shape, the `inputResponses` refusal, the header-agreement refusal, the 401 body, and `list_changed` on evidence and not otherwise.
- [ ] `verdict.test.ts` proves the 38 routable methods each have exactly one verdict.
- [ ] `fuzz.test.ts` runs 500 bodies without a rejection; `test/seeds/` is committed (empty is fine).
- [ ] No `src/` file imports `@valibot/to-json-schema`, `node:*`, `@braindog/ports`, `@braindog/kernel` or `@braindog/record`.
- [ ] Every response carries `Cache-Control: no-store`; no body carries an exception message (the thrown-`api` case).
- [ ] The eleven `ponytail:` lines of §10 are in the files they name.
- [ ] 10, 15, 30, 31, 33, 41 and 51 are amended per §13 in the same revision, and BUILD.md's loop log records it.

---

*Next: [45-SPEC-RECORD](45-SPEC-RECORD.md).*
