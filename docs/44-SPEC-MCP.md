# 44 · packages/mcp — specification

The agent surface of [10-MCP](10-MCP.md), typed to the file: eight fixed tools, ten resources, three prompts, the
server `instructions`, and the streamable-HTTP JSON-RPC handler that carries them — hand-rolled, over the `DataApi`
envelopes of [33-CONTRACTS](33-CONTRACTS.md) §2, with the token budgets of 10 §4 asserted by a gate. Ninth in the
build order of [35-SPEC-OVERVIEW](35-SPEC-OVERVIEW.md) §4. Mode: ponytail.

---

## 1 · Purpose and boundary

**What it does.** `createMcpHandler(api, opts)` returns one function, `(req: Request) => Promise<Response>`, that a
host mounts at `POST /mcp` (33 §4). The function parses a 2026-07-28 MCP request, checks the `Mcp-Method` and
`Mcp-Name` headers against the body, validates tool arguments against a schema, calls one method of `api`, and
renders the `Result<T>` as an MCP result — `ok` as content, a refusal as an error result carrying `code` and `fix`
(30 §6), a conflict as `VERSION_STALE` with the current row and the other actor's name. It answers `tools/list` with
the eight tools, the `instructions` and `ttlMs`; `resources/*` with the READ+ methods; `prompts/*` with three
templates. It is stateless: no session store, no handshake (10 §1).

**What it refuses to do.** Seven, counted:

| Refused | Whose job |
|---|---|
| Authenticate a bearer or build a `CallContext` | the host — `opts.context(req)` (33 §2: "the Worker builds `CallContext` on every request") |
| Rate-limit | the Worker, on `Mcp-Name` (10 §8) |
| Authorise a call against scope, level or ceiling | the record, in one place (30 §10) |
| Touch a database or a port | it has no `Sql`; it holds `api` and `opts`, nothing else — the register list it embeds is one `api.index` read (§5.2) |
| Speak the legacy HTTP+SSE transport | not carried (ADR-054); the one-day shim of Q7, if ever, is the Worker's |
| Reach VAULT, JOBS or ADMIN | refused by name, with a reason, before any call (10 §8) |
| Decide | no token holds `decide` (30 §10); the MRTR retry is refused (§5.7) |

**What it may import.** `@braindog/declare` — the `Refusal` type ([42-SPEC-DECLARE](42-SPEC-DECLARE.md) §2 exports
it) — and `valibot`, which `declare` already brings (ADR-040). Nothing else. The envelopes `CallContext` and `Result`
are owned by `kernel` ([41-SPEC-KERNEL](41-SPEC-KERNEL.md) §13 D1), to which this package has no edge, so §2 re-declares
them structurally (§13 D9). [31-STACK](31-STACK.md) §2 permits an edge to `ports`; nothing here uses one, and §13 D9
removes the row. `mcp` never imports `record` (31 §2: "the MCP server reaching into internals, and being untestable
without a Durable Object") — the record reaches this package only as the `api` argument, and the Worker's `tsc` at
the call site is what binds the two.

---

## 2 · Public API

Everything below is exported from `src/index.ts`; the `exports` map has one entry.

```ts
import type { Refusal } from '@braindog/declare';
import * as v from 'valibot';

// ─── envelopes — 33-CONTRACTS §2 verbatim, declared here structurally (§13 D9) ─────────────
type Scope = 'read' | 'propose' | 'write';
type Level = 'read' | 'append' | 'write' | 'decide' | 'owner';
type Session = { spoken?: string; client_id?: string; host?: string; repo?: string };

type CallContext = {
  principal:
    | { kind: 'person'; id: string; level: Level }
    | { kind: 'token';  id: string; scope: Scope[]; name: string }
    | { kind: 'system' }
    | { kind: 'spark' };
  session?: Session;
  now: number;
  surface: 'web' | 'mcp' | 'cli' | 'email' | 'webhook' | 'alarm';
};

type Conflict = { version: number; current: unknown; actor: string };
type Result<T> =
  | { ok: true;  value: T; version: number }
  | { ok: false; refusals: Refusal[] }
  | { ok: false; conflict: Conflict };

// ─── the record, as this package sees it: DATA minus markRead, plus READ+ minus project ──────
type IndexValue = { registers: { id: string }[] };      // the ONE value shape this package reads (§5.2); 10 §4's example
interface DataApi {
  index(args: IndexArgs,   ctx: CallContext): Promise<Result<IndexValue>>;
  search(args: SearchArgs, ctx: CallContext): Promise<Result<unknown>>;
  get(args: GetArgs,       ctx: CallContext): Promise<Result<unknown>>;
  list(args: ListArgs,     ctx: CallContext): Promise<Result<unknown>>;
  create(args: CreateArgs, ctx: CallContext): Promise<Result<unknown>>;
  update(args: UpdateArgs, ctx: CallContext): Promise<Result<unknown>>;
  propose(args: ProposeArgs, ctx: CallContext): Promise<Result<{ id: string }>>;   // id = 'SG<n>'
  log(args: LogArgs,       ctx: CallContext): Promise<Result<unknown>>;
  page(args: { slug: string },         ctx: CallContext): Promise<Result<unknown>>;
  metric(args: { id: string },         ctx: CallContext): Promise<Result<unknown>>;
  schema(args: { register: string },   ctx: CallContext): Promise<Result<unknown>>;
  dialect(args: Record<string, never>,  ctx: CallContext): Promise<Result<unknown>>;
  digestToday(args: Record<string, never>, ctx: CallContext): Promise<Result<unknown>>;
  sessionsLive(args: Record<string, never>, ctx: CallContext): Promise<Result<unknown>>;
  learningsFor(args: { repo: string },  ctx: CallContext): Promise<Result<unknown>>;
  whatsNew(args: { cursor?: number },   ctx: CallContext): Promise<Result<unknown>>;
  boot(args: Record<string, never>,     ctx: CallContext): Promise<Result<unknown>>;
}

// ─── the handler ────────────────────────────────────────────────────────────────────────────
type McpHandlerOptions = {
  /** Verifies the bearer and builds the CallContext from headers alone — the body is not read yet.
   *  null → 401 UNAUTHORIZED. surface must be 'mcp'. The handler replaces `session` from _meta and touches nothing else. */
  context: (req: Request) => Promise<CallContext | null>;
  /** Default 1_048_576 — 10 §8's 1 MB. Larger bodies are 413. */
  maxBodyBytes?: number;
};
type McpHandler = (req: Request) => Promise<Response>;

function createMcpHandler(api: DataApi, opts: McpHandlerOptions): McpHandler;
const DATA_API_METHODS: readonly (keyof DataApi)[];    // the seventeen names, for the host's adapter (§12) and the verdict test (§9)
```

`createMcpHandler` never throws, and the function it returns never rejects: every failure, including a thrown
`api`, is a `Response` (§6). It is a closure over `api` and `opts` with no state of its own, so a host may construct
it once per record (the self-host) or once per request (the Worker, [51-SPEC-WORKER](51-SPEC-WORKER.md) §5.3) — the
cost is one object allocation either way. There is no `decls` argument: the handler runs where the record is a stub
behind an RPC (01 §5), so the register list it needs is a read through `api` at `tools/list` (§5.2, §13 D13).

```ts
// ─── the tables ─────────────────────────────────────────────────────────────────────────────
type ToolName = 'record_index' | 'search' | 'get' | 'list' | 'create' | 'update' | 'propose' | 'log';
type Tool = {
  name: ToolName;
  method: 'index' | Exclude<ToolName, 'record_index'>;   // record_index → index (10 §3); the rest share their name
  description: string;          // `list` alone contains the literal `{registers}`, filled at tools/list (§5.2)
  schema: v.GenericSchema;      // Valibot, module scope — validates arguments (§5.3)
  inputSchema: JsonSchema;      // generated from `schema` at build time — advertised (§5.2, §13 D1)
};
const TOOLS: readonly Tool[];   // eight, in 30 §5's order

type ResourceParam = 'register' | 'slug' | 'id' | 'repo' | 'since';
type Resource = {
  name: string;                 // 'schema' 'dialect' 'whats-new' 'decisions' 'digest-today' 'page' 'metric' 'sessions-live' 'learnings' 'boot'
  uri: string;                  // 'braindog:schema/{register}' — an RFC 6570 level-1 template, or a literal
  param?: ResourceParam;
  method: 'page' | 'metric' | 'schema' | 'dialect' | 'digestToday' | 'sessionsLive' | 'learningsFor' | 'whatsNew' | 'boot' | 'list';
  args: (value?: string) => object;
  ttlMs: number;
  description: string;
};
const RESOURCES: readonly Resource[];   // ten — 10 §6's table

type Prompt = {
  name: 'orient' | 'file-this' | 'write-up';
  description: string;
  arguments: { name: string; description: string; required: boolean }[];
  messages: (args: Record<string, string>) => { role: 'user'; content: { type: 'text'; text: string } }[];
};
const PROMPTS: readonly Prompt[];       // three — 10 §6

type Verdict = { group: 'DATA' | 'READ+' | 'VAULT' | 'JOBS' | 'ADMIN'; code: 'NEEDS_BROWSER_SESSION' | 'FORBIDDEN'; fix: string };
const REFUSED: Readonly<Record<string, Verdict>>;   // twenty-one method names — §6

const INSTRUCTIONS: string;             // §4.6 — the exact text; ASCII; ≤ 300 tokens by tokenBudget

const BUDGETS = {
  toolsList: 1_800, toolDescription: 200, instructions: 300, recordIndex: 500, listPage: 2_000,
  registersShown: 24, bodyBytes: 1_048_576, ttlMs: 3_600_000,
} as const;

/** The estimator of §5.8. Deterministic, pure, O(n). Never below o200k_base on the calibration set; at most 1.4× it. */
function tokenBudget(text: string): number;
```

Error contract of the tables: they are data; nothing in them throws. `TOOLS[i].schema` and `inputSchema` are
constructed at module scope (ADR-040 — never inside a `fetch()` or a Durable Object constructor).

---

## 3 · Files

Five source files, one generated file, one script. Counted.

```
packages/mcp/
├── package.json                  @braindog/mcp · private · AGPL-3.0-only · "exports": { ".": "./src/index.ts" }
│                                 dependencies: @braindog/declare workspace:*, valibot 1.4.2 (the pin declare uses)
│                                 devDependencies: @valibot/to-json-schema (§11), fast-check 4.9.0
│                                 scripts: test = node --test test/ · gen = node scripts/gen-schemas.ts · typecheck = tsc -p .
├── tsconfig.json                 extends ../../tsconfig.base.json; references: ../declare
├── scripts/
│   └── gen-schemas.ts            Valibot → JSON Schema for the eight tools; strips `$schema`; writes src/tool-schemas.gen.ts   ~20 lines
├── src/
│   ├── index.ts                  createMcpHandler (the request loop of §5.1); the envelope types; DATA_API_METHODS; re-exports   ~150 lines
│   ├── wire.ts                   JSON-RPC parse and shape checks, header agreement, _meta.session grammar,
│   │                             json() and sse() responses, the seven error codes of §6                            ~110 lines
│   ├── tools.ts                  the eight Valibot schemas and descriptions; TOOLS; REFUSED; argument → api call   ~200 lines
│   ├── tool-schemas.gen.ts       GENERATED — `export default { record_index: {…}, … } as const`. Never edited      ~180 lines
│   ├── resources.ts              RESOURCES, the URI matcher, PROMPTS, INSTRUCTIONS                                 ~130 lines
│   └── budget.ts                 tokenBudget, BUDGETS                                                              ~30 lines
└── test/
    ├── golden.test.ts            every test/fixtures/*.json: request → expected response, stub api recording calls
    ├── budget.test.ts            the calibration band; per-tool and instructions budgets; the 14- and 24-register sums
    ├── schemas.test.ts           fresh toJsonSchema(schema) deep-equals tool-schemas.gen.ts — drift
    ├── verdict.test.ts           the 38 routable methods each have exactly one verdict
    ├── fuzz.test.ts              fast-check: no body ever makes the handler throw
    └── fixtures/                 the golden pairs of §9; index-14.json and index-24.json (stub `index` values); calibration.json
```

`tools/gates/mcp-budget.mjs` (33 §8's row) lives outside the package: ~25 lines that import `src/index.ts`, render
`tools/list` over a stub `api` whose `index` returns `test/fixtures/index-24.json`, print the table of §7 and exit 1
on a breach.

---

## 4 · Data structures

### 4.1 · JSON-RPC, as accepted and produced

```ts
type JsonRpcId = string | number;
type Params = { _meta?: Meta; [k: string]: unknown };
type Meta = { session?: Session; [k: string]: unknown };     // only `session` is read; every other key is ignored

type JsonRpcRequest      = { jsonrpc: '2.0'; id: JsonRpcId; method: string; params?: Params };
type JsonRpcNotification = { jsonrpc: '2.0'; method: string; params?: Params };            // no id → 202, empty body
type JsonRpcResult<T>    = { jsonrpc: '2.0'; id: JsonRpcId; result: T };
type JsonRpcError        = { jsonrpc: '2.0'; id: JsonRpcId | null; error: { code: number; message: string; data?: unknown } };
```

Invariants a test checks: a body that is a JSON array is refused (batching is not in 2026-07-28); `id` is echoed
exactly, never coerced; `_meta.session`, when present, is an object whose four optional fields match §4.2's grammar
and carry no other key; `params._meta` is the only `_meta` the handler reads — a `_meta` at the top level of the
request is ignored.

### 4.2 · `_meta.session` — the actor ladder's inputs (30 §3, 33 §2)

| Field | Grammar | Is |
|---|---|---|
| `spoken` | `^S[1-9][0-9]*$` | the caller's `session` row, `S<n>` — the kernel's register (ADR-026) |
| `client_id` | `^[A-Za-z0-9._:-]{1,128}$` | the runtime's own id, for re-attach |
| `host` | `^[A-Za-z0-9._-]{1,128}$` | the machine |
| `repo` | `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`, never containing `..` | a name, never a path (26 §5) |

The handler copies the validated object onto `ctx.session` — the one field it adds to the host's `CallContext`.
It never reads a principal, a scope, an actor or a `now` from the body. The record resolves `spoken` against its own
rows and derives the actor (30 §3); the handler checks grammar only.

### 4.3 · Results

```ts
type ToolsListResult = {
  tools: { name: ToolName; description: string; inputSchema: JsonSchema }[];   // eight
  instructions: string;                                                        // INSTRUCTIONS, every time (ADR-054)
  ttlMs: 3_600_000; cacheScope: 'record';                                      // 10 §4 rule 3
};

type Text = { type: 'text'; text: string };
type CallToolResult =
  | { content: [Text]; _meta: { version: number } }                                            // ok: text = JSON of value
  | { isError: true; content: [Text]; structuredContent: { refusals: Refusal[] } }              // 422's twin
  | { isError: true; content: [Text]; structuredContent: { conflict: Conflict } }               // 409's twin
  | { resultType: 'input_required'; requests: [DecisionRequest]; content: [Text] };             // MRTR — propose only

type DecisionRequest = {
  id: string;                          // the suggestion id, 'SG<n>'
  kind: 'decision';
  question: string;
  options: { id: string; label: string; because: string }[];
  requires_reason: true;
};
type InputResponse = { id: string; reason: string };          // 10 §5's shape: id = the chosen option

type ReadResourceResult = { contents: [{ uri: string; mimeType: 'application/json'; text: string }]; ttlMs: number; cacheScope: 'record' };
type ListResourcesResult = { resources: { uri: string; name: string; description: string; mimeType: 'application/json' }[]; ttlMs: 3_600_000; cacheScope: 'record' };
type ListTemplatesResult = { resourceTemplates: { uriTemplate: string; name: string; description: string }[]; ttlMs: 3_600_000; cacheScope: 'record' };
type ListPromptsResult   = { prompts: { name: string; description: string; arguments: Prompt['arguments'] }[]; ttlMs: 3_600_000; cacheScope: 'record' };
type GetPromptResult     = { description: string; messages: ReturnType<Prompt['messages']> };
```

Invariants: an `ok` result has exactly one content block and it is `JSON.stringify` of the value (not JCS — nothing
hashes it) — no `structuredContent`, because nothing consumes it and it would double the bytes; an error result's text has one line
per refusal, in the CLI's voice (33 §5): `` `<CODE> · <at> '<found>' — <fix>` `` (`found` omitted when absent);
`ttlMs` and `cacheScope` are top-level fields of the result, as 10 §1 names them.

### 4.4 · The eight input schemas, field by field

The Valibot schema is the source; the JSON Schema is generated from it (§13 D1). Every optional field's
`description` leads with the normal case (10 §7 rule 2). Grammars are 34 §4's. Argument objects are 33 §2's.

```ts
const RegisterId = v.pipe(v.string(), v.regex(/^[a-z][a-z0-9_]{0,31}$/));
const Ulid       = v.pipe(v.string(), v.regex(/^[0-9A-HJKMNP-TV-Z]{26}$/));
const Seq        = v.pipe(v.number(), v.integer(), v.minValue(1));
const Path       = v.pipe(v.string(), v.regex(/^[a-z][a-z0-9_]{0,31}(\.[A-Za-z0-9_-]+)*$/));    // <field>(.<key>)*
const Repo       = v.pipe(v.string(), v.regex(/^(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/));
const Tree       = v.record(v.string(), v.unknown());     // a where: predicate tree — the compiler validates it (34 §1)

record_index:  v.strictObject({
  level: v.optional(v.pipe(v.picklist(['index', 'digest']), v.description('usually unset; digest costs far more'))),
  scope: v.optional(v.strictObject({ repo: v.pipe(Repo, v.description('the repo you stand in')) })) })
search:        v.strictObject({
  q:         v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  registers: v.optional(v.pipe(v.array(RegisterId), v.description('usually unset: all you can read'))),
  limit:     v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50), v.description('default 25'))) })
get:           v.strictObject({                            // exactly one address — checked in code, said in the description (§5.3 step 3)
  spoken:   v.optional(v.pipe(v.string(), v.description("'SG23' or 'tasks#125'"))),
  register: v.optional(RegisterId),
  seq:      v.optional(Seq),
  id:       v.optional(Ulid),
  path:     v.optional(v.pipe(Path, v.description('field then keys, e.g. amount.currency; usually unset'))) })
list:          v.strictObject({
  register: RegisterId,
  where:    v.optional(v.pipe(Tree, v.description('predicate tree; usually unset'))),
  order:    v.optional(v.pipe(v.array(v.strictObject({ field: RegisterId, dir: v.picklist(['asc', 'desc']) })),
                              v.description('usually unset: updated_at desc'))),
  limit:    v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(200), v.description('default 25'))),
  cursor:   v.optional(v.pipe(v.string(), v.maxLength(512), v.description('from the previous page'))),
  fields:   v.optional(v.pipe(v.array(RegisterId), v.description('usually unset'))) })
create:        v.strictObject({
  register: RegisterId,
  fields:   v.pipe(v.record(v.string(), v.unknown()), v.description('field id to value')),
  op_id:    v.pipe(Ulid, v.description('fresh ULID')) })
update:        v.strictObject({                            // seq or id — checked in code (§5.3 step 3)
  register: RegisterId,
  seq:      v.optional(Seq),
  id:       v.optional(Ulid),
  patch:    v.pipe(v.record(v.string(), v.unknown()), v.description('only the fields that change')),
  version:  v.pipe(v.number(), v.integer(), v.minValue(1), v.description("the row's current version")),
  op_id:    v.pipe(Ulid, v.description('fresh ULID')) })
propose:       v.strictObject({
  question:  v.pipe(v.string(), v.minLength(1)),
  options:   v.array(v.strictObject({ id: v.string(), label: v.string(), because: v.string() })),
  body_kind: v.pipe(v.picklist(['options', 'pattern', 'rowset', 'change']), v.description('usually options')),
  body:      v.pipe(v.record(v.string(), v.unknown()), v.description('typed body for body_kind')) })
log:           v.strictObject({
  note:   v.pipe(v.string(), v.minLength(1), v.maxLength(280), v.description('one sentence')),
  target: v.optional(v.pipe(v.string(), v.description('usually unset; a spoken id'))) })
```

Field ids inside `fields`, `patch` and `order[].field` are not checked here beyond grammar; the record refuses
`FIELD_UNKNOWN` (30 §4 step 1). Spoken ids in `get.spoken` and `log.target` are strings here; the record resolves
them (34 §4). The bounds that appear — `limit ≤ 50`, `limit ≤ 200`, `note ≤ 280` — are 33 §2's; no other bound is
invented (a `question` or `because` length is the record's call).

### 4.5 · The descriptions, and how the register list is embedded

```ts
record_index: "Orient first. Registers with counts, open questions, what changed since your last call, and what to ask for next."
search:       "Find rows by words (ids, names, amounts), then by meaning. Returns projected rows with spoken ids, never whole documents."
get:          "One row by exactly one address: spoken ('SG23', 'tasks#125'), register and seq, or id; a bare '#7' never resolves. path returns the full value at it; without one, the projected row."
list:         "Rows of one register, projected, newest first, 25 a page. Registers: {registers}. Pass the returned cursor for the next page."
create:       "Add one row. fields are exactly the register's declared fields (resource schema/<register>); money is {amount, currency} in minor units."
update:       "Change fields on one row (register and seq, or id). Send its current version (compare-and-set) and only the fields that change. VERSION_STALE means someone else wrote: re-read, re-apply."
propose:      "Open a question for the person to decide; never decide yourself. Every option carries a because. Returns the suggestion id; the choice is made in their app."
log:          "Append one audit note: one sentence a human reads in six weeks, about a material change. Not for routine edits; rows record themselves."
```

`{registers}` is filled once, in `list`, with `value.registers.map(r => r.id)` of the one `api.index({}, ctx)` call
`tools/list` makes (§5.2) — the registers this token can read, in the record's order, comma-separated; past
`BUDGETS.registersShown` (24) the tail is `, +<n> more (record_index lists all)`; an empty list renders
`Registers: none you can read.` No other description carries the list, and no `inputSchema` carries it as an `enum`
— the schemas stay static so they can be generated once (§13 D5). Every description is ASCII, states when to reach for the tool and when not, and never
explains how the server works (10 §7 rule 1).

### 4.6 · `INSTRUCTIONS` — the exact text

```
One person's business record, shared by every agent. Orient with record_index first; it says what to ask for next. Ask for the figure you need, never the whole record.
Money is an integer in minor units with its currency. Divide by 100 before saying a number; never add two currencies.
Writes are compare-and-set. On VERSION_STALE re-read the row and re-apply; the body names who changed it and carries the current row.
An agent never decides. Lay out options with propose; a person chooses, with a reason, in their own app.
A credential never goes in the record.
Log each material change with log: one sentence a human reads in six weeks. Rows record themselves; skip routine edits.
A refusal names the field, what it found, what it wanted, and the fix. Correct the call; never retry unchanged.
Everything you write is read on a phone: short, scannable. Documents use the block dialect (resource dialect); a figure is a {{path}}, never typed.
```

Eight lines, 161 words, 943 bytes, **268 tokens** by `tokenBudget`. It carries the five sentences 10 §8 requires
(minor units; re-read on `VERSION_STALE`; no credential; log one sentence; read on a phone) and three the tool
descriptions would otherwise repeat (orient first; never decide; the refusal teaches). It is returned with every
`tools/list`, under the same `ttlMs`, because 2026-07-28 has no initialise step (ADR-054).

### 4.7 · Resources — the URI grammar

Scheme `braindog:`, then the path 10 §6 writes. Ten, counted, each backed by one method (ADR-018 by construction).

| # | URI | Method called | `ttlMs` | Why that ttl |
|---|---|---|---|---|
| 1 | `braindog:schema/{register}` | `schema({ register })` | 3,600,000 | static between installs; `list_changed` invalidates |
| 2 | `braindog:dialect` | `dialect({})` | 86,400,000 | sixteen kinds, closed (ADR-056) |
| 3 | `braindog:whats-new{?since}` | `whatsNew({ cursor: Number(since) })` — absent → `{}` | 0 | a catch-up is never stale on purpose |
| 4 | `braindog:decisions` | `list({ register: 'decision', limit: 50 })` | 60,000 | live rows; a minute is a phone's refresh |
| 5 | `braindog:digest/today` | `digestToday({})` | 60,000 | as above |
| 6 | `braindog:page/{slug}` | `page({ slug })` | 60,000 | resolved against live rows |
| 7 | `braindog:metric/{id}` | `metric({ id })` | 60,000 | as above |
| 8 | `braindog:sessions/live` | `sessionsLive({})` | 0 | who is working changes by the minute |
| 9 | `braindog:learnings/for/{repo}` | `learningsFor({ repo })` | 60,000 | forty rows, `truncated` set honestly |
| 10 | `braindog:boot` | `boot({})` | 0 | the first screen; one round trip (30 §5) |

`resources/list` is concrete where the handler can be: the five literal URIs with no parameter (2, 4, 5, 8, 10), then
one `schema/<id>` per register of the same `api.index` read `tools/list` makes. `resources/templates/list` returns
the four the handler cannot enumerate without a declarations read it does not have — 3, 6, 7 and 9 — as templates;
an agent reaches a page or a metric by the name the person used or `record_index`'s `next` hints. `{register}`,
`{slug}`, `{id}` match `^[a-z][a-z0-9_-]{0,63}$`; `{repo}` matches §4.2's `Repo`; `since` matches `^[0-9]{1,18}$`. Every content is `application/json`, the method's value serialised. Descriptions are one sentence
each; two carry a rule because agents get it wrong (10 §6): `sessions/live` — *"two sessions in one working tree
overwrite each other. Coordinate or stop."*; `learnings/for` — *"a learning changes what a session does, generalises,
would otherwise be got wrong (not merely slower), and has no other home; most sessions record nothing, and that is
the correct number"* (32 §3).

### 4.8 · Prompts

| Name | Argument | The user message, rendered |
|---|---|---|
| `orient` | — | *Call record_index. In under 120 words say what needs attention today — overdue obligations, renewals inside 30 days, open questions — citing spoken ids. Quote no figure you did not fetch.* |
| `file-this` | `text` (required) | *Here is text to file:* ␤␤`<text>`␤␤ *Read schema/<register> for each register you would write to. Then call propose with body_kind 'rowset' listing the rows and one option per register, a because on each. Do not create rows directly.* |
| `write-up` | `spoken` (required) | *Read the dialect resource and get({ spoken: '<spoken>' }). Draft a write-up for it in the block dialect: short blocks, a figure only as a {{path}}, never typed. Return the text; do not write it to the record.* |

Argument values are inserted verbatim as text; they are never parsed, never placed in a URI, and capped at 8,192
bytes (a longer `text` is `-32602`).

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

All token figures are `tokenBudget` of the exact text in this specification, serialised as the handler serialises
it (`JSON.stringify`, no whitespace). The gate re-counts them on every CI run.

| Item | Ceiling | Measured | How |
|---|---|---|---|
| `tools/list` result — `tools[]` + `instructions` + `ttlMs` + `cacheScope` | **≤ 1,800** | 1,713 at 14 registers · **1,741 at the 24-register cap** | `mcp-budget` gate; `budget.test.ts` |
| One tool description, rendered | ≤ 200 | 29 (`record_index`) … 100 (`list`, 24 registers) | `budget.test.ts`, each of the eight |
| One tool object (name + description + `inputSchema`) | — reported | 118 (`log`) … 318 (`list`) | printed by the gate |
| `INSTRUCTIONS` | ≤ 300 | 268 | `budget.test.ts` |
| `record_index` response | ≤ 500 | the record's — 10 §4's example is 106 | spec 45's fixture; relayed unchanged here |
| A `list` page, default 25 rows | ≤ 2,000 | the record's | spec 45's fixture; relayed unchanged here |
| Handler overhead per call, excluding `api` | ≤ 2 ms median | parse + validate + render of a 4 kB body | `budget.test.ts`: 200 calls against a stub `api`, median asserted |
| Request body | ≤ 1,048,576 bytes | `413` past it | golden fixture |
| Register ids shown in `list` | ≤ 24, then `+n more` | 40-register stub renders 24 | `budget.test.ts` |
| `api.index` reads per `tools/list` or `resources/list` | 1 | once per client per `ttlMs` | golden 1, 21 |
| `resources/list` entries | 5 + one per readable register | not in every turn; fetched on demand | — |
| Prompt argument | ≤ 8,192 bytes | `-32602` past it | golden fixture |

The headroom at the cap is 59 tokens. One more clause in a description is a clause out of another; the gate is the
arbiter. *An earlier draft counted `instructions` outside the 1,800; every token of it sits in the context every
turn, so it is inside.*

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
