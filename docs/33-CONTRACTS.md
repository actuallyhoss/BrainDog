# 33 · The contracts

The interfaces an implementer types before the first feature: the nine ports (§1), the call envelopes every RPC
method shares (§2), the conformance suite's types (§3), the HTTP surface (§4), the CLI (§5), the self-host process
(§6), the Worker and its Durable Objects (§7), the gate inventory (§8), export/import/migrations (§9), identity
and the Directory (§10), and the tier-C job protocol (§11).

> **Why this document exists.** A day-one walk of the build order on 2026-09-02 ([31-STACK](31-STACK.md) §2) stopped
> at `packages/ports` within the hour: seven of nine ports had a row in a table and no members. This document is
> every signature the walk found missing, decided once. [30-BLUEPRINT](30-BLUEPRINT.md) keeps the schema, the write
> path and the groups; [34-GRAMMARS](34-GRAMMARS.md) keeps the languages. Nothing here is code; it is the type a
> file has to satisfy.

---

## 1 · The nine ports

`packages/ports` exports nine interfaces, one memory implementation each, and the conformance cases (§3). No port
imports another. `packages/record` uses exactly `{ Sql, Scheduler, Clock }`; `packages/spark` uses
`{ Sql, Clock, Inference }`; everything else is the Worker's or the self-host's.

```ts
// ─── 1 · Sql — SYNCHRONOUS, and the type makes the async hazard unrepresentable ───────────
type Param = null | number | bigint | string | Uint8Array;        // no boolean, no undefined
type Row   = Record<string, Param>;
type NotPromise<T> = T extends Promise<unknown> ? never : T;

interface Cursor<T = Row> extends Iterable<T> {
  toArray(): T[];
  one(): T;                 // exactly one row, else throws
  first(): T | undefined;
  readonly rowsRead: number;
  readonly rowsWritten: number;
}

interface Capabilities {
  sqlite: string;           // '3.50.4'
  fts5: boolean;            // measured at open — false is refused at boot, §6
  json: boolean;
  maxParams: number;        // 100 everywhere — enforced by the adapter, not the driver
  maxLikePattern: number;   // 50
  maxSqlBytes: number;      // 100_000
  maxCompoundSelect: number;// 5
  maxExprDepth: number;     // 100
  expressionIndexUsed: boolean;   // the EXPLAIN QUERY PLAN probe
  nestedTransactions: false;
}

interface Sql {
  /** Exactly ONE statement when any parameter is supplied (MULTI_STATEMENT_PARAMS otherwise). */
  exec<T = Row>(query: string, ...params: Param[]): Cursor<T>;
  /** Zero-parameter multi-statement text. The migration runner only. */
  execScript(sql: string): void;
  /** Synchronous callback. Rolls back on throw. Does NOT nest. */
  transactionSync<T>(fn: () => NotPromise<T>): T;
  readonly caps: Capabilities;
}
```

Three adapters: **`ctx.storage.sql`** (Cloud, the reference), **`node:sqlite`** (self-host default, Node ≥ 24.13),
**`better-sqlite3`** (self-host alternative for an older Node). `bun:sqlite` is unsupported. Each adapter refuses
raw `BEGIN COMMIT ROLLBACK SAVEPOINT RELEASE` by statement-prefix check (`TXN_STATEMENT_FORBIDDEN`) so the three
fail identically.

> **`DO_LIMITS` is enforced in our adapter, above the driver.** Measured 2026-09-02: `node:sqlite`'s
> `DatabaseSync` has no `limits` option and no `setLimit` method — an unknown option key is silently ignored. So
> the Node adapters count parameters before `prepare` (`TOO_MANY_PARAMS` at 101), check every bound string used
> as a LIKE pattern (`LIKE_TOO_LONG` at 51 bytes), check statement length (`STATEMENT_TOO_LONG` at 100 001), and the
> compiler's output is asserted to stay under compound-select 5 and expression depth 100 by the property test.
> The Cloud adapter maps workerd's own errors onto the same codes. **That is what "Node refuses first" means.**

```ts
// ─── 2 · Scheduler — the one alarm, and the outbox doorbell ─────────────────────────────
interface Scheduler {
  get(): Promise<number | null>;        // ms since epoch of the armed alarm
  set(atMs: number): Promise<void>;     // idempotent; the write path calls it AFTER transactionSync
  clear(): Promise<void>;
  wake(): Promise<void>;                // Cloud: env.OUTBOX_Q.send({ record }); self-host: no-op (the loop polls)
}
// getAlarm/setAlarm are async storage operations on a Durable Object, so re-arm cannot sit inside
// transactionSync — 30 §4 puts it after the transaction and before wake().

// ─── 3 · Clock ─────────────────────────────────────────────────────────────────────────────
interface Clock { now(): number }      // ms since epoch, UTC. The kernel formats RFC 3339. Injected in tests.

// ─── 4 · Blobs — content-addressed under the record's prefix ───────────────────────────────
type BlobKey = string & { readonly __brand: 'BlobKey' };          // blobKey(recordId, sha256) is the ONLY constructor
interface Blobs {
  put(key: BlobKey, body: Uint8Array | ReadableStream, meta: { mime: string; bytes: number }): Promise<void>;
  get(key: BlobKey): Promise<{ body: ReadableStream; mime: string; bytes: number } | null>;
  delete(key: BlobKey): Promise<void>;
  list(prefix: RecordId): AsyncIterable<BlobKey>;
}

// ─── 5 · Inference ─────────────────────────────────────────────────────────────────────────
interface Inference {
  complete(req: { model: string; messages: Msg[]; tools?: ToolDef[]; maxTokens: number; jsonSchema?: object })
    : Promise<{ text: string; toolCalls?: ToolCall[]; usage: { in: number; out: number } }>;
  embed(texts: string[]): Promise<{ model: string; dims: number; vectors: Int8Array[] }>;
}
// Cloud: Workers AI through the gateway; a BYO key is the same adapter with a different base URL and a vault grant.

// ─── 6 · Dispatch — the three ways a notification leaves ───────────────────────────────────
interface Dispatch {
  email(m: { to: string; subject: string; text: string; html?: string }): Promise<void>;
  push(sub: PushSubscription, payload: { title: string; url: string }): Promise<void>;
  webhook(url: URL, body: string, signature: string): Promise<{ status: number }>;
}

// ─── 7 · Http — the connector's fetch, and nothing else's ──────────────────────────────────
interface Http {
  fetch(url: URL, init: { method: 'GET' | 'POST'; headers: Record<string, string>; body?: string; timeoutMs: number })
    : Promise<Response>;               // redirect: 'manual'; private and link-local ranges refused; 2 MB cap
}

// ─── 8 · KeyStore — the root KEK ───────────────────────────────────────────────────────────
interface KeyStore {
  current(): Promise<{ kekId: string; key: CryptoKey }>;
  byId(kekId: string): Promise<CryptoKey | null>;
}
// Cloud: Secrets Store (one key, never one per customer). Self-host: BRAINDOG_KEK_FILE, 0600.

// ─── 9 · Snapshots ─────────────────────────────────────────────────────────────────────────
interface Snapshots {
  take(label: string): Promise<{ id: string; at: string; bytes: number }>;
  list(): Promise<{ id: string; at: string; bytes: number }[]>;
  restore(id: string): Promise<void>;
  prune(keep: number): Promise<void>;
}
// Cloud: PITR bookmarks + the nightly .dogl.age to R2. Self-host: VACUUM INTO + sign, nightly, keep 30.

// ─── Ingress — an entrypoint contract, not a port ──────────────────────────────────────────
interface Ingress {
  fetch(req: Request): Promise<Response>;
  email?(m: { to: string; from: string; raw: ReadableStream; size: number }): Promise<void>;
  queue?(batch: { recordId: RecordId }[]): Promise<void>;
  scheduled?(cron: string): Promise<void>;
}
```

Nine, counted. `Msg`, `ToolDef`, `ToolCall`, `PushSubscription` and `RecordId` are the obvious record types and are
declared beside the ports.

---

## 2 · The envelopes every method shares

Every method in every group of [30-BLUEPRINT](30-BLUEPRINT.md) §5 takes `(args, ctx)` and returns `Result<T>`.

```ts
type CallContext = {
  principal:
    | { kind: 'person'; id: PersonId; level: Level }          // read | append | write | decide | owner
    | { kind: 'token';  id: TokenId;  scope: Scope[]; name: string }   // read | propose | write — never admin
    | { kind: 'system' }
    | { kind: 'spark' };
  session?: { spoken?: string; client_id?: string; host?: string; repo?: string };   // the actor ladder's inputs
  now: number;
  surface: 'web' | 'mcp' | 'cli' | 'email' | 'webhook' | 'alarm';
};

type Result<T> =
  | { ok: true;  value: T; version: number }                    // version = record_version = MAX(event.rowid)
  | { ok: false; refusals: Refusal[] }                          // HTTP 422
  | { ok: false; conflict: { version: number; current: Entry; actor: string } };   // HTTP 409 — re-read, re-apply

type Refusal = { code: RefusalCode; at: string; found?: unknown; wanted?: string; fix: string };   // 30 §6
```

The Worker builds `CallContext` on every request from the cookie or bearer, the `_meta` block of an MCP call, or
the alarm; the record derives `actor` and `ctx.scope` from it and never trusts a caller-supplied actor. There is
no 412: a stale `version` is a 409 whose body names who changed the row.

**DATA and READ+ argument objects, the only ones an external caller sees:**

| Method | Args | Returns |
|---|---|---|
| `index({ level?: 'index' \| 'digest', scope? })` | the three read levels of [10-MCP](10-MCP.md) §4 | registers with counts, open questions, what changed |
| `search({ q, registers?, limit? })` | `limit` ≤ 50 | rows, projected |
| `get({ spoken } \| { register, seq } \| { id }, { path?, level? })` | `path` = `<field>(.<key>)*` | one row; `full` needs a `path` |
| `list({ register, where?, order?, limit?, cursor?, fields? })` | default `order: [{ field: updated_at, dir: desc }]`, `limit` 25, max 200 | rows + `cursor` |
| `create({ register, fields, op_id })` | | the row, `version` |
| `update({ register, seq \| id, patch, version, op_id })` | `version` is compare-and-set | the row, or `conflict` |
| `propose({ question, options, body_kind, body })` | `body_kind ∈ options \| pattern \| rowset \| change` | `SG<n>` |
| `log({ note, target? })` | `note` ≤ 280 chars | the event |
| `markRead({ upTo })` | person principals only; `upTo` = an `event.rowid` | nothing; not an event |
| `page(slug)` · `metric(id)` · `schema(register)` · `dialect()` · `digestToday()` · `sessionsLive()` · `learningsFor(repo)` | | the resource |
| `whatsNew(cursor?)` | cursor = `event.rowid`; default = the first rowid after the caller's `member.seen_at` | ≤ 60 events + `sinceCapped` |
| `project(query, budget)` | `secret` fields already replaced by their label | the `Projection` of 30 §9 |
| `boot()` | | index + live sessions + open suggestions + `whatsNew`, one round trip |

**Cursors** are base64url of the JCS array `[lastOrderValue, lastId]`, applied as keyset `WHERE (k, id) < (?, ?)`.
**Idempotency:** a replayed `op_id` returns the original `Result` from `event.op_id`.

**Suggestion bodies:** `options { question, options: [{ id, label, because }], requires_reason: true }` ·
`pattern { ingest: <declaration body>, samples: [raw_id…] }` · `rowset { register, rows: [{ fields }] }` ·
`change { declaration_id, from, to }`.

---

## 3 · The conformance suite

One corpus of cases, executed against every `Sql` adapter, producing one normalised trace each; the assertion is
that the traces are equal ([30-BLUEPRINT](30-BLUEPRINT.md) §13). The reference trace is generated from the Cloud
adapter and committed as `packages/ports/conformance/reference.json`, regenerated only by the Workers-plugin job.

```ts
type SqlErrorCode =
  | 'TOO_MANY_PARAMS' | 'LIKE_TOO_LONG' | 'EXPR_TOO_DEEP' | 'INT_OUT_OF_RANGE' | 'TXN_STATEMENT_FORBIDDEN'
  | 'NO_SUCH_MODULE' | 'MULTI_STATEMENT_PARAMS' | 'STATEMENT_TOO_LONG' | 'TOO_MANY_COLUMNS' | 'COMPOUND_TOO_LONG'
  | 'CONSTRAINT' | 'SYNTAX' | 'UNKNOWN';                                       // thirteen, closed

type TraceLine = ['rows', unknown[]] | ['err', SqlErrorCode] | ['n', number];

type Case = {
  id: string;                               // 'params-101', 'like-51-bytes', 'savepoint-refused', 'fts5-phrase', …
  requires?: (keyof Capabilities)[];        // a skip is printed with its reason, never silent
  run(sql: Sql): TraceLine[];
};

interface Assert {
  ok(v: unknown, msg: string): void;
  equal(a: unknown, b: unknown, msg: string): void;
  deepEqual(a: unknown, b: unknown, msg: string): void;
  throws(fn: () => void, code: SqlErrorCode): void;
  skip(reason: string): never;
  fail(msg: string): never;
}
```

The cases are a plain array, not a `describe` block; the host supplies `Assert`, so the same list runs under bare
Vitest, under `@cloudflare/vitest-plugin`, and under `node --test`. CI asserts each host ran the same number of
cases and prints every skip. **Case #1** is the `Param` asymmetry (a boolean bound on Node is coerced; the DO
rejects it — so the adapter refuses it first). **Case #2** is `MULTI_STATEMENT_PARAMS`. **Case #3** is the raw
`SAVEPOINT` refusal. The expression-index probe (`EXPLAIN QUERY PLAN … USING INDEX`) is the case that closes Q12;
it is green on Node 24.13.0 for both the literal and the bound-parameter form, and it runs against the Cloud
adapter in week one.

The **boot probe** reuses `measureCaps` at startup and refuses a build without FTS5, naming the driver
([30-BLUEPRINT](30-BLUEPRINT.md) §13). There is no degraded mode.

---

## 4 · The HTTP surface

Every route declares its group; a CI gate walks the router and fails on a route with no group.

| Route | Method | Auth | Group / does |
|---|---|---|---|
| `/api/<method>` | POST | bearer or cookie | one route per DATA and READ+ method; body = args; `Result<T>` |
| `/api/<method>` | POST | **cookie only** | VAULT, JOBS (session half), ADMIN — a bearer gets **403 `NEEDS_BROWSER_SESSION`** |
| `/api/boot` · `/api/pages/:slug` · `/api/schema/:register` · `/api/version` | GET | bearer or cookie | aliases of `boot page schema` and `{ version }` for the polling fallback |
| `/mcp` | POST | bearer | streamable HTTP, the 2026-07-28 shape (`Mcp-Method`, `Mcp-Name`, `_meta`); eight tools, resources, `instructions` with every `tools/list` |
| `/in/webhook/<ingest-id>` | POST | the ingest's `verify:` (HMAC header or the URL's random path segment) | above the auth gate; store raw, enqueue, return |
| `<slug>@in.brain.dog` | email | DKIM/SPF pass, else quarantined | above the auth gate; store raw, enqueue |
| `/a/<sha256>` | GET | none | attachment bytes, type sniffed, SVG 415, `default-src 'none'; sandbox` |
| `/s/<token>` | GET | the share token | one projected page, read-only |
| `/<ID>` | GET | cookie | a spoken id → 302 to its canonical page |
| `/.well-known/oauth-protected-resource` | GET | none | **deferred** — Phase A ships agent tokens only; when built BrainDog is its own authorization server |
| `/ws` | GET (upgrade) | cookie | the hibernatable WebSocket, `{ version, registers }` on change |
| `/auth/*` | mixed | — | passkey ceremony, magic link, device-grant approval — the Directory (§10) |
| everything else | GET | — | the SvelteKit shell, served as static assets |

`no-store` on `/api/*`; no CORS; `run_worker_first: ['/api/*', '/mcp', '/a/*', '/in/*', '/s/*', '/ws', '/auth/*']`.
INTERNAL methods have no route. There is no admin token, so ADMIN and VAULT never see a bearer.

---

## 5 · The CLI — `braindog`

One file, no dependencies, the `braindog-cli` package (AGPL). Every command has `--json`.

| Command | Does |
|---|---|
| `braindog login <host>` | the RFC 8628 device flow of [12-SECURITY](12-SECURITY.md) §6.1: prints a six-digit code, the owner approves in the browser, the CLI receives a **`read`+`write` agent token** and stores it at `$XDG_CONFIG_HOME/braindog/hosts.json` (0600). `BRAINDOG_HOST` / `BRAINDOG_TOKEN` override |
| `braindog init <slug>` | self-host only: creates `<data>/<slug>/record.dog`, runs migration 0001, writes the owner into the Directory |
| `braindog dev` | runs the self-host process against a scratch data dir with the memory ports |
| `braindog export [--with-attachments] [--redact-grants] [--sections data,origin,governance] [--mirror] [-o file]` | streams the `.dogl` from the record and materialises a signed `.dog`; `--mirror` also writes rendered markdown |
| `braindog import <file.dog \| file.dogl>` | into an empty record only (`IMPORT_NOT_EMPTY`), §9 |
| `braindog verify <file> --key <pubkey \| url>` | offline: `application_id`, format, manifest hashes, signature |
| `braindog pack lint <dir>` · `pack plan <dir>` · `pack install <dir \| url \| git ref> [--with-deps]` · `pack uninstall <id>` | lint is offline; plan prints the diff; install applies it under `PLAN_STALE` |
| `braindog rule test <id> --against <raw \| register>` · `rule apply <id> --dry` | the dry run reports `won / lost / takenBy`; `--dry` is also the undo |
| `braindog token create --scope read,propose --name <n>` · `token list` · `token revoke <id>` | agent tokens; a browser session may also do all three |
| `braindog runner enroll` · `runner run` | tier C: the device grant, then the loop of §11 |
| `braindog --version` | `app <date>+<sha> · format 1 · kernel <n> · primitives 1` |

Refusals print as one sentence: `register.invoices.fields[4].type 'currency' — did you mean 'money'?`
(`FIELD_TYPE_UNKNOWN`). Exit codes: 0 ok · 1 refused · 2 conflict · 3 unreachable.

---

## 6 · The self-host process

One Node process, one artefact, `docker run`, no build step.

| Setting | Value |
|---|---|
| Runtime | Node **24.13.0**, pinned to the minor; `node:sqlite` (FTS5 measured present); `better-sqlite3` as the alternative via `BRAINDOG_SQLITE=better-sqlite3` |
| Data | `BRAINDOG_DATA=/data` — `<slug>/record.dog` per record, plus `directory.sqlite` (§10) |
| Root key | `BRAINDOG_KEK_FILE=/data/kek` — 32 random bytes, 0600, created on first run |
| Auth | passkeys or the magic link; `BRAINDOG_TOKEN` for a private single-user instance (owner level) |
| Port | `PORT=8080`; TLS is the reverse proxy's job |
| Per open | `journal_mode=WAL` · `synchronous=NORMAL` · `busy_timeout=5000` · `foreign_keys=OFF` |
| Scheduler | one `setTimeout` over `MIN(due_at)` per record; one outbox poller per record; `wake()` is a no-op |
| Snapshots | nightly `VACUUM INTO` (permitted here) → sign → keep 30, under `<slug>/snapshots/` |
| Boot | `measureCaps` per record file; a build without FTS5 refuses to start, naming the driver |
| Limits | the adapter enforces `DO_LIMITS` (§1) so a self-host never out-runs the Cloud |

The self-host is where a `.dog` is a *file*: the live database and the export are the same bytes, and the four
`dog_*` header tables are present because migration 0001 created them.

---

## 7 · The Worker and its Durable Objects

**Three DO classes**, never a class per customer:

| Class | Instance | Holds |
|---|---|---|
| `Record` | `idFromName(rec_id)` | the record — 27 tables + 4 header tables; the hibernatable WebSocket; RPC methods per group |
| `Spark` | `idFromName(rec_id)` | conversation state, retrieval, the tier-C runner's WebSocket and job leases |
| `Directory` | `idFromName('directory')` | persons, passkeys, sessions, magic links, invitations, `slug → rec_id`, the login lockout |

Classes extend `DurableObject` and expose their methods as RPC; the Worker resolves `slug → rec_id` at the
Directory, then `env.RECORD.get(env.RECORD.idFromName(rec_id))`. The Worker itself is stateless.

```jsonc
// wrangler.jsonc — the skeleton
{
  "name": "braindog",
  "main": "apps/worker/src/index.ts",
  "compatibility_date": "2026-08-01",          // ≥ 2026-02-24 is the floor CI asserts: deleteAll() must delete the alarm
  "durable_objects": { "bindings": [
    { "name": "RECORD",    "class_name": "Record" },
    { "name": "SPARK",     "class_name": "Spark" },
    { "name": "DIRECTORY", "class_name": "Directory" } ] },
  "migrations": [ { "tag": "v1", "new_sqlite_classes": ["Record", "Spark", "Directory"] } ],
  "queues":   { "producers": [ { "binding": "OUTBOX_Q", "queue": "braindog-outbox" } ],
                "consumers": [ { "queue": "braindog-outbox", "max_batch_size": 10 } ] },
  "r2_buckets":     [ { "binding": "BLOBS", "bucket_name": "braindog-blobs" } ],
  "ai":             { "binding": "AI" },
  "secrets_store_secrets": [ { "binding": "KEK", "store_id": "…", "secret_name": "braindog-kek" } ],
  "assets": { "directory": "apps/web/build", "binding": "ASSETS",
              "run_worker_first": ["/api/*", "/mcp", "/a/*", "/in/*", "/s/*", "/ws", "/auth/*"] },
  "observability": { "enabled": true }
}
```

The Worker's own runtime dependencies: `@pushforge/builder@2.0.5` and `age-encryption@0.3.1` — and nothing else
([ADR-046](16-DECISIONS.md)).

---

## 8 · The gate inventory

Every CI assertion in the corpus, with its owner. Source and artefact gates are zero-dependency scripts under
`tools/gates/<name>.mjs`; rendered-box gates are Playwright specs under `apps/web/test/`.

| Gate | Where | Asserts |
|---|---|---|
| `graph` | script | the package graph is acyclic and every import points down the total order (31 §2) |
| `licence-closure` | script | `npm pack --dry-run --json` of both packages: no `@braindog/`, no `../../`, both LICENSE files start with the right words (31 §4) |
| `no-declarations-in-kernel` | script | the kernel declares nothing of the eight kinds except `register.session` |
| `closed-lists` | script | every list in [34-GRAMMARS](34-GRAMMARS.md) §6 matches its owner's enumeration and its CHECK |
| `event-kinds` | script | the `event.kind` CHECK has forty members and the prose says forty |
| `refusal-fixtures` | script | every code in 30 §6 has a fixture that produces it; no fixture without a code |
| `router-groups` | script | every route declares its group; INTERNAL has no route; VAULT/ADMIN accept no bearer |
| `spark-actor` | script | `event WHERE actor = 'spark' AND kind NOT IN ('suggest','propose','predict')` is empty over every fixture |
| `mcp-budget` | script | `tools/list` ≤ 1,800 tokens; each description within its budget (10 §4) |
| `secret-grep` | script | no write path, log line, push payload or prompt template can carry a `grant` plaintext |
| `telemetry-allowlist` | script | the 1,544-literal provenance allow-list is exact |
| `conformance-count` | script | every host ran the same number of cases; every skip printed |
| `where-property` | vitest | the compiler and the evaluator agree on 10,000 random predicates; failing seeds committed |
| `boot-probe` | vitest | a build without FTS5 refuses with the exact message |
| `compat-date` | script | `compatibility_date ≥ 2026-02-24` |
| `deploy-parity` | script | after `wrangler deploy`, fetch `/` and `/_app/version.json` from the live host; SHA-256 must equal the `build/` output |
| `dog-roundtrip` | vitest | export → import → export yields an identical canonical logical dump |
| `targets` · `row-centre` · `field-height` · `contrast` · `focus` · `screenshot-mode` · `motion` · `bundle` · `a11y-tree` · `grid-contract` | Playwright | the rows of [18-BUILD-TOOLKIT](18-BUILD-TOOLKIT.md) §6, over 8 fixtures × 4 widths × 2 schemes × 2 directions |

`.github/workflows/{ci,gates,deploy,release,gate1}.yml` map onto this table one-to-one; `gates.yml` runs the script
column, `ci.yml` the vitest and Playwright columns, `deploy.yml` ends with `deploy-parity`.

---

## 9 · Export, import, restore, migrations

**Two containers, one content.** The `.dog` is a SQLite file. The `.dogl` is the canonical logical dump — header
lines, then one JSON line per row, tables in `dog_section` order — whose bytes are exactly what `dog_manifest`
hashes ([34-GRAMMARS](34-GRAMMARS.md) §5). They verify with the same key and import to the same rows.

| Operation | Procedure |
|---|---|
| **Export from Cloud** | the record streams the `.dogl` in pages of ≤ 1,000 rows via `export(cursor)` (ADMIN); the Worker signs the manifest and serves the stream. A Worker cannot build a SQLite file — no engine, no filesystem, 128 MB — so the `.dog` is materialised by the CLI or a self-host from the `.dogl`. The nightly R2 backup is `.dogl.age` |
| **Export from a self-host** | `VACUUM INTO`, then the manifest and signature are written into the copy; the live file already *is* a `.dog` |
| **What travels** | every table except `dog_section = 'local'` (`token device_grant auth_fail observation job job_event`); `grant` rows travel with `ciphertext` sealed, and `vault_key` travels — a KEK-wrapped key is nothing without the KEK, and a restored record must open its own vault; `--redact-grants` drops them; `--sections` narrows to `data`, `origin`, `governance` |
| **Import** | only into an empty record (`IMPORT_NOT_EMPTY`); verify signature and manifest (`SIGNATURE_INVALID`, `CHECKSUM_MISMATCH`); refuse a `user_version` above the reader's (`FORMAT_NEWER_THAN_READER`); run kernel migrations on the imported rows; copy tables in batches of ≤ 30 rows × ≤ 3 parameters; rebuild `entry_fts` from `entry`; write one `import` event. It is not the write path — `event` rows keep their actors — but nothing bypasses validation |
| **Restore** | `restore(bookmark)` is PITR-only (Cloud) and writes `restore.pitr`; a self-host restore is `import` into a fresh directory |
| **Migrations** | `packages/kernel/migrations/NNNN_<slug>.sql`, applied in numeric order from the DO constructor under `blockConcurrencyWhile`; each file in one `transactionSync` that inserts its `migration` row; a file carrying `-- format-bump` sets `PRAGMA user_version`; a checksum mismatch or a database newer than the code sets a module-level refusal (`SCHEMA_MISMATCH` \| `SCHEMA_NEWER`) that every RPC returns as 503 until a deploy fixes it |

Three numbers, one home each: `PRAGMA user_version` = the format revision (1 at v1); `MAX(migration.version)` = the
kernel migration number; `record.format_ver` mirrors `user_version` for readers without PRAGMA access.

---

## 10 · Identity, and the Directory

Login is account-level — a person may hold several records — so identity lives **outside** the record, in the third
Durable Object class (Cloud) or `directory.sqlite` (self-host), same schema, same `Sql` port.

| Directory table | Holds |
|---|---|
| `person` | `id` (`p_` + ULID), `email` UNIQUE, `name`, `created_at`, `suspended_at` |
| `passkey` | `id`, `person_id`, `public_key`, `sign_count`, `created_at`, `last_used` |
| `session` | `id_hash`, `person_id`, `expires`, `rotated_at` — the cookie: `HttpOnly Secure SameSite=Lax`, 30 days, rotating |
| `magic_link` | `hash`, `person_id`, `expires` (15 min), single use |
| `invitation` | `hash`, `email`, `rec_id`, `levels`, `expires` (24 h), `accepted_at` |
| `record_dir` | `slug` UNIQUE, `rec_id`, `owner_person` |
| `person_record` | `person_id`, `rec_id` |
| `auth_fail` | `key`, `n`, `until` — the login lockout, reserve-before-compare, fail closed |

The record keeps `person` as a mirror (`id email name suspended_at`) so a `.dog` resolves its actors offline, plus
`member`, `token`, `device_grant` and its own `auth_fail` for device codes and share tokens.

| Flow | Steps |
|---|---|
| Sign up | email → magic link → passkey registration → `createRecord` (INTERNAL) writes `record_dir`, `person_record`, the record's `person` mirror and `member('*', 'owner')` |
| Sign in | passkey first; the magic link as the fallback; both produce a `session` row; **no passwords** |
| Invite | the owner mints an invitation (one email, 24 h); the invitee registers a passkey behind it; acceptance writes `person_record`, the record's `person` mirror, the `member` rows, and one `access.grant` event per register |
| Agent token | minted from a browser session or by `braindog login`'s device flow; scoped `read` / `propose` / `write`; one record; hashed in the record's `token` table with `last_used_at` and `last_surface` |
| Device grant | six digits, ten minutes, five tries; approved from a browser; a 90-day bearer in `device_grant.token_hash`; the CLI, an agent and a runner all enrol this way |
| Suspend | `person.suspended_at` in the Directory; the record's mirror follows on the next request; suspending a person suspends their tokens in the same record transaction |

---

## 11 · The tier-C job protocol

A connected machine runs Claude Code under its owner's own subscription ([26-BYO-INTELLIGENCE](26-BYO-INTELLIGENCE.md)).
The runner **pulls**; nothing pushes to the box.

| Step | Who | Mechanism |
|---|---|---|
| Enrol | runner | the device grant (§10); the 90-day bearer reaches exactly the three runner methods |
| Wait | runner ↔ Spark | a hibernatable WebSocket to the `Spark` object; $0 idle. Fallback one: long-poll `claimJob?wait=20` — the Worker checks every 1.5 s, answers on the first queued row, never holds past 20 s; the runner aborts at wait + 10 s. Fallback two: plain polling with the `idle_ms` backoff the reply carries ([26-BYO-INTELLIGENCE](26-BYO-INTELLIGENCE.md) §5) |
| Create | a browser session | `createJob({ kind, args, session, expires })` — kinds `triage explain propose draft`; every MCP token is refused this surface |
| Claim | runner | `claimJob()` → `{ job, lease_until }`; the oldest `queued` row; `status = claimed` |
| Run | runner | `claude --restricted -p … --output-format stream-json --json-schema <kind schema> --permission-mode dontAsk --max-turns 12`; never `--dangerously-skip-permissions`; a dedicated unix user with tokenless remotes as defence in depth |
| Report | runner | `postJobEvent({ job_id, seq, kind, body })` — kinds `start say think tool out limit note end error`; `seq` is the high-water mark on `job.seq`; the distilled events, never the raw stream |
| Cancel | browser → runner | `cancelJob` sets `job.cancel = 1`; the runner reads it on every `postJobEvent` reply (`readCancel`) and kills the child; the transcript stays |
| Finish | runner | the final `result` line, validated against the kind's schema, becomes `status ∈ ok needs_decision refused limit error`; `claude_session` is kept so `--resume` can continue it |
| Lost | the list | a `claimed` row past `lease_until` is *shown* as lost; LOST is never written |
| Expire | schedule | `queued` beyond 24 h → `cancelled` with a notice |

Nine statuses, four kinds, nine event kinds — the CHECKs in [30-BLUEPRINT](30-BLUEPRINT.md) §1 are the count.

---

*Previous: [34-GRAMMARS](34-GRAMMARS.md). Back to the index: [00-README](00-README.md).*
