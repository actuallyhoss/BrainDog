# 37 · `packages/ports` — specification

The nine port interfaces, the `node:sqlite` implementation of `Sql`, the guard both `Sql` implementations run,
and the conformance corpus that proves them equal. Derives from [33-CONTRACTS](33-CONTRACTS.md) §1 and §3,
[30-BLUEPRINT](30-BLUEPRINT.md) §13, [01-ARCHITECTURE](01-ARCHITECTURE.md) §2 and §4, [31-STACK](31-STACK.md) §5.
Second in the build order; the first of the three artefacts of 30 §14.

> **Clean room.** Nothing here is ported. Every driver fact below was measured on the pinned toolchain
> (2026-09-02, Node 24.13.0, SQLite 3.50.4, `:memory:`), never read from the predecessor.

> **Mode: ponytail.** `Sql` has two real implementations — `node:sqlite` now, the Durable Object adapter in
> phase 5 ([35-SPEC-OVERVIEW](35-SPEC-OVERVIEW.md) §4, row 51). That seam is the self-host promise of
> 01 §4, not an abstraction for later. Everything else here has one shape.

---

## 1 · Purpose and boundary

| | |
|---|---|
| **Does** | declares the nine ports and `Ingress`; ships `openNodeSqlite`; ships `guard`, `guardScript`, `mapDriverMessage`, `measureCaps` and `bootProbe`, which both `Sql` adapters call so they refuse identically, and `guarded`, the wrapper that calls them (§2.4.1); ships `DO_LIMITS`, `SqlError`, `blobKey`; ships the conformance corpus, its runner and the committed reference trace |
| **Refuses to do** | know the kernel's schema; parse SQL; cache statements; fake the other eight ports; implement `better-sqlite3`; import `cloudflare:*`; host the Durable Object adapter (that is `apps/worker`, spec 51) |
| **Imports** | nothing at runtime. `node:sqlite` appears in exactly one file, behind the `./node-sqlite` subpath, so the main entry runs in workerd, in Node and in a bare test process (31 §1) |
| **Consumers** | `kernel` and `record` use `{ Sql, Scheduler, Clock }`; `spark` uses `{ Sql, Clock, Inference }`; `apps/selfhost` and `apps/cli` call `openNodeSqlite`; `apps/worker` calls the shared functions from its own adapter (33 §1) |

The `Sql` port is synchronous, and the types make the input-gate hazard of 01 §2 unrepresentable: `exec` returns a
`Cursor`, not a Promise, and `transactionSync` takes `() => NotPromise<T>`.

---

## 2 · Public API

```jsonc
// package.json — exports; nothing else is importable (31 §3, layer 2)
"exports": {
  ".":              "./src/index.ts",              // workerd-clean: types, DO_LIMITS, SqlError, the shared functions, blobKey
  "./node-sqlite":  "./src/node-sqlite.ts",        // the one file that imports node:sqlite
  "./conformance":  "./src/conformance/cases.ts"   // CASES, runConformance, the trace types
}
```

### 2.1 · `Sql` — verbatim from 33 §1

```ts
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

The record's storage. `exec` is one statement, with or without parameters (§13 D1). `Cursor` is materialised;
`one()` throws a `RangeError` on any count but one. Errors are `SqlError` with a code from the thirteen (§6).

### 2.2 · The other eight, and `Ingress` — verbatim from 33 §1

```ts
interface Scheduler {
  get(): Promise<number | null>;        // ms since epoch of the armed alarm
  set(atMs: number): Promise<void>;     // idempotent; the write path calls it AFTER transactionSync
  clear(): Promise<void>;
  wake(): Promise<void>;                // Cloud: env.OUTBOX_Q.send({ record }); self-host: no-op (the loop polls)
}
```
The one alarm of 09 §1 and the outbox doorbell of 01 §2. `set` runs after the transaction, never inside it
(30 §4 step 11); `wake` is the record's only I/O and the last statement (ADR-021).

```ts
interface Clock { now(): number }      // ms since epoch, UTC. The kernel formats RFC 3339. Injected in tests.
```
Time, so fixtures materialise deterministically (30 §12 #3). A test satisfies it with `{ now: () => t }`.

```ts
type BlobKey = string & { readonly __brand: 'BlobKey' };          // blobKey(recordId, sha256) is the ONLY constructor
interface Blobs {
  put(key: BlobKey, body: Uint8Array | ReadableStream, meta: { mime: string; bytes: number }): Promise<void>;
  get(key: BlobKey): Promise<{ body: ReadableStream; mime: string; bytes: number } | null>;
  delete(key: BlobKey): Promise<void>;
  list(prefix: RecordId): AsyncIterable<BlobKey>;
}
```
Attachments, content-addressed under the record's prefix; R2 on Cloud, `node:fs` on the self-host (31 §5).
`blobKey` being the only constructor is what makes the cross-tenant dedupe leak unrepresentable (31 §5).

```ts
interface Inference {
  complete(req: { model: string; messages: Msg[]; tools?: ToolDef[]; maxTokens: number; jsonSchema?: object })
    : Promise<{ text: string; toolCalls?: ToolCall[]; usage: { in: number; out: number } }>;
  embed(texts: string[]): Promise<{ model: string; dims: number; vectors: Int8Array[] }>;
}
```
Spark's model calls. Workers AI through the gateway; a BYO key is the same adapter with a different base URL
(31 §5). The record has no `Inference` port (ADR-002).

```ts
interface Dispatch {
  email(m: { to: string; subject: string; text: string; html?: string }): Promise<void>;
  push(sub: PushSubscription, payload: { title: string; url: string }): Promise<void>;
  webhook(url: URL, body: string, signature: string): Promise<{ status: number }>;
}
```
The three ways a notification leaves (09 §3), called by the Worker's outbox drain, never by the record.

```ts
interface Http {
  fetch(url: URL, init: { method: 'GET' | 'POST'; headers: Record<string, string>; body?: string; timeoutMs: number })
    : Promise<Response>;               // redirect: 'manual'; private and link-local ranges refused; 2 MB cap
}
```
The connector's fetch and nothing else's ([25-CONNECTORS](25-CONNECTORS.md)); the constraints are the
adapter's, not the caller's — an `init` that could relax them would be a port that moved the decision back to
the place that cannot make it. The address check is the adapter's for the same reason: on a self-host
`localhost:3000` is the record itself, and only the adapter knows which machine it is on (47 §8).

```ts
const HTTP_FAULTS = ['PrivateRange', 'TooLarge', 'Timeout', 'Network'] as const;   // Error.name — 47 §13 D14
```
The four ways an adapter refuses, by `Error.name` rather than by class: the adapter lives in an app and the
caller in a package, so a class crossing that seam is an edge pointing the wrong way up 31 §2's order. Closing
the set is what makes the caller's mapping exhaustive — `httpFault(e)` answers `null` for anything else, which
is a defect and not a provider behaviour.

```ts
type Key = InstanceType<typeof CryptoKey>;         // no `dom` lib here, and 31 §1 bans `node:`

interface KeyStore {
  current(): Promise<{ kekId: string; key: Key }>;
  byId(kekId: string): Promise<Key | null>;
}
```
The root KEK — one key in Secrets Store, or a `0600` file on the self-host. The record has no `KeyStore` port and
never sees a plaintext credential (12 §6, ADR-062).

`Key` is named off the global class rather than imported, and that is not a flourish. `tsconfig.base.json` sets
no `dom` lib on purpose — a package that can name `document` is a package that can reach for it — so the TYPE
`CryptoKey` is only declared by `node:crypto`, which 31 §1 bans under `packages/**`. The VALUE is a global, so
the type comes off it. `apps/selfhost` wrote the same two methods out a second time over `webcrypto.CryptoKey`,
because that is the import an app is allowed to make; it now re-exports this one, and the copy that would have
drifted is the one nobody was looking at (30 §2).

```ts
interface Snapshots {
  take(label: string): Promise<{ id: string; at: string; bytes: number }>;
  list(): Promise<{ id: string; at: string; bytes: number }[]>;
  restore(id: string): Promise<void>;
  prune(keep: number): Promise<void>;
}
```
PITR bookmarks plus the nightly `.brainl.age` on Cloud; `VACUUM INTO`, sign, keep 30 on the self-host (33 §1, §6).

```ts
interface Ingress {
  fetch(req: Request): Promise<Response>;
  email?(m: { to: string; from: string; raw: ReadableStream; size: number }): Promise<void>;
  queue?(batch: { recordId: RecordId }[]): Promise<void>;
  scheduled?(cron: string): Promise<void>;
}
```
An entrypoint contract a runtime satisfies, not a port (33 §1).

### 2.3 · The record types beside the ports

```ts
type RecordId = `rec_${string}`;                                            // 'rec_' + ULID — 02 §1
type Msg      = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; toolCallId?: string };
type ToolDef  = { name: string; description: string; inputSchema: object };
type ToolCall = { id: string; name: string; args: Record<string, unknown> };
type PushSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };   // the Web Push shape

function blobKey(recordId: RecordId, sha256: string): BlobKey;   // `${recordId}/${sha256}`; RangeError unless
                                                                 // the id is rec_ + 26 Crockford chars and the
                                                                 // hash is 64 lower-case hex
```

### 2.4 · The `Sql` runtime exports (main entry)

```ts
export const DO_LIMITS = {
  length: 2 * 1024 * 1024,   // docs say 2 MB; workerd source sets 4 MB. Take the tighter one.
  sqlLength: 100_000, column: 100, variableNumber: 100, likePatternLength: 50,
  exprDepth: 100, compoundSelect: 5, triggerDepth: 10,   // ← all three UNDOCUMENTED
  attach: 0, vdbeOp: 25_000, functionArg: 32,
} as const;                                                                 // 30 §13, verbatim

type SqlErrorCode =
  | 'TOO_MANY_PARAMS' | 'LIKE_TOO_LONG' | 'EXPR_TOO_DEEP' | 'INT_OUT_OF_RANGE' | 'TXN_STATEMENT_FORBIDDEN'
  | 'NO_SUCH_MODULE' | 'MULTI_STATEMENT_PARAMS' | 'STATEMENT_TOO_LONG' | 'TOO_MANY_COLUMNS' | 'COMPOUND_TOO_LONG'
  | 'CONSTRAINT' | 'SYNTAX' | 'UNKNOWN';                                       // thirteen, closed — 33 §3

class SqlError extends Error {
  readonly name = 'SqlError';
  readonly code: SqlErrorCode;
  constructor(code: SqlErrorCode, message: string, options?: { cause?: unknown });
}

function guard(query: string, params: readonly unknown[]): void;   // §5.3 steps 1–7; throws SqlError
function guardScript(sql: string): void;                           // §5.4 steps 1–2; throws SqlError
function mapDriverMessage(message: string): SqlErrorCode;          // §5.8; never throws
function measureCaps(run: (sql: string, ...params: Param[]) => Row[]): Capabilities;   // §5.2
function bootProbe(caps: Capabilities, driver: string): void;      // throws SqlError NO_SUCH_MODULE with §5.1's text
function guarded<S extends Sql>(sql: S): S;                        // §2.4.1; the wrapper a host returns
```

#### 2.4.1 · As built (W60-3, 24 September 2026): the port this tree has, and `guarded`

The tree's `Sql` is not §2.1's. It has `exec(sql, ...params): void`, `all`, `one` and `transactionSync`, and no
`Cursor`, `execScript` or `caps`; both hosts send a zero-parameter `exec` to the driver's multi-statement entry, so
that call is the script door. `src/sql.ts` therefore ships the five functions above over that port, plus
`guarded(sql)`, the wrapper each host returns in place of the port it built: a zero-parameter `exec` is checked by
`guardScript`, every other call by `guard`, and a driver error whose sentence carries one of §5.8's eleven fragments is
rethrown as a `SqlError` carrying the same sentence and the driver's error as `cause`. An `UNKNOWN` one passes through
unchanged, so a caller that reads the driver's own error keeps reading it. `transactionSync` is the host's own.
`Capabilities` is a standalone type, since the port has no `caps` to hang it on. The hosts adopt `guarded` in W60-6
(Worker) and W60-7 (self-host).

*The boot probe departs from §5.1 step 4, and this is the amendment.* Nothing in the tree calls `openNodeSqlite`, which
does not exist, so there is no open for `bootProbe` to throw from, and a throw at open is the failure being replaced:
measured on 24 September 2026, an adapter refusing `USING fts5` made the kernel's migration 1 throw
`no such module: fts5` and `openRecord` threw with it. So the probe is the kernel's, at the top of `applyMigrations`
(`packages/kernel/src/migrate.ts`): `SELECT json('{}')` after the ledger, a `LIMIT 0` read of `entry_fts` once the
schema is whole, and a missing module from either or from migration 1 is `30 §6`'s `RECORD_UNAVAILABLE` (503) in the
returned state, sticky like `SCHEMA_NEWER`, at `sqlite.fts5` or `sqlite.json`. It reads `fts5` through
`mapDriverMessage`, so a guarded port's `SqlError` and a bare driver's `Error` are the same fact. It does not call
`measureCaps`, which creates and drops two tables in `main` on every open, and it does not read compile options,
which the DO answers with `not authorized`. `bootProbe` and its four-line text stay here for a host that opens
through `openNodeSqlite` once one does; `NO_SUCH_MODULE` never reaches a caller either way (§6).

`guard` takes `unknown[]` on purpose: its job is the runtime type check that TypeScript cannot make for a
JavaScript caller. Both adapters call these five; the Node one in this package, the DO one in spec 51.

### 2.5 · `./node-sqlite`

```ts
interface NodeSql extends Sql { close(): void }
function openNodeSqlite(path: string): NodeSql;   // ':memory:' is the memory adapter — there is no other
```

Throws `SqlError('NO_SUCH_MODULE', …)` with the boot-probe text when the build lacks FTS5 or JSON1. There is no
degraded mode (ADR-038).

### 2.6 · `./conformance`

```ts
type TraceLine = ['rows', unknown[]] | ['err', SqlErrorCode] | ['n', number];
type Trace     = Record<string, TraceLine[]>;                     // case id → lines

type Case = {
  id: string;                               // 'params-101', 'like-51-bytes', 'savepoint-refused', 'fts5-phrase', …
  requires?: (keyof Capabilities)[];        // a skip is printed with its reason, never silent
  run(sql: Sql): TraceLine[];
};

interface Assert {                          // four methods — §13 D7
  ok(v: unknown, msg: string): void;
  equal(a: unknown, b: unknown, msg: string): void;
  deepEqual(a: unknown, b: unknown, msg: string): void;
  fail(msg: string): never;
}

type ReferenceFile = {
  generated_by: 'node-sqlite' | 'durable-object';
  generated_at: string;                     // RFC 3339
  sqlite: string;                           // the generating build's version, informational
  provisional: boolean;                     // true until the Durable Object adapter generated it
  traces: Trace;
};

const CASES: readonly Case[];               // thirty-two, §9.2
function runConformance(sql: Sql, assert: Assert, reference: ReferenceFile | null)
  : { trace: Trace; ran: number; skipped: { id: string; reason: string }[] };
```

---

## 3 · Files

```
packages/ports/
├── package.json                 @braindog/ports · private · "type": "module" · the three exports above · zero deps
├── tsconfig.json                extends ../../tsconfig.base.json; include src, test
├── src/
│   ├── sql.ts                   Param Row Cursor Capabilities Sql SqlErrorCode SqlError DO_LIMITS
│   │                            guard guardScript mapDriverMessage measureCaps bootProbe            ~190 lines
│   ├── index.ts                 the eight other ports, Ingress, the record types, blobKey; re-exports sql.ts  ~90 lines
│   ├── node-sqlite.ts           openNodeSqlite — the ONLY `node:*` import under packages/**            ~110 lines
│   └── conformance/
│       ├── cases.ts             CASES (32), runConformance, the helpers rows/err/codeOf/normalise        ~280 lines
│       └── reference.json       the committed reference trace, ~93 lines of trace, under 8 KB
└── test/
    ├── sql.test.ts              guard · mapDriverMessage · measureCaps · transactionSync · Cursor    (§9.1)
    ├── conformance.test.ts      openNodeSqlite(':memory:') → runConformance against reference.json;
    │                            CONFORMANCE_WRITE=1 rewrites the file instead                        (§9.3)
    └── boot-probe.test.ts       the exact refusal text for fts5: false and json: false               (§9.1)
```

Four source files and one JSON. The Durable Object adapter is `apps/worker/src/sql-do.ts` (spec 51), described in
§5.6 as the second implementation of the same contract; it imports the main entry and `./conformance`, never
`./node-sqlite`.

---

## 4 · Data structures

Stated as sentences a test can check.

**`Param`.** A value is a `Param` at runtime iff it is `null`, a finite `number`, a `bigint`, a `string` or a
`Uint8Array`. A `number` that is an integer is within ±(2⁵³ − 1). A `bigint` is within ±(2⁵³ − 1). Anything else —
`boolean`, `undefined`, `Date`, a plain object, an array, `NaN`, `±Infinity` — never reaches a driver (§5.3 step 4).

**`Row`.** Keys are the SELECT's column names in column order. Values are `Param`s; the adapters never return a
`bigint` (`node:sqlite` reads integers as `number`; the DO has no bigint). A statement with two columns of the
same name is a caller bug; the later value wins.

**`Cursor`.** Materialised at `exec`: `toArray()` returns the same array on every call; iteration yields the
array; `first()` is `toArray()[0]`; `one()` returns the single row or throws `RangeError('one(): expected exactly
one row, got N')`. `rowsRead` and `rowsWritten` are fixed at `exec` and never change. Callers consume a cursor
once — the DO's cursor is one-shot (§10 #8).

**`Capabilities`.** After `openNodeSqlite` returns, `fts5 === true` and `json === true` (§5.1 step 4). The five
ceilings equal `DO_LIMITS.variableNumber · likePatternLength · sqlLength · compoundSelect · exprDepth`.
`nestedTransactions === false`. `sqlite` matches `/^\d+\.\d+\.\d+$/`. `expressionIndexUsed` is whatever the probe
measured — `true` on Node 24.13.0.

**`SqlError`.** `code` is one of the thirteen. `message` is non-empty. For `UNKNOWN` the message is the driver's,
verbatim. `cause` is the driver's error when one exists, else absent. A `SqlError` never carries a bound value.

**`TraceLine`.** `['rows', r]` holds JSON-normalised rows: a `Uint8Array` becomes `number[]`, `-0` becomes `0`.
`['err', c]` holds a code; a non-`SqlError` throw is recorded as `'UNKNOWN'`. `['n', k]` holds an integer.

**`Case`.** `id` is unique and kebab-case. Every SELECT a case runs carries `ORDER BY`. A case owns the tables
named `c_<id with _>` and begins with `DROP TABLE IF EXISTS`. No case traces `caps.sqlite`.

**`ReferenceFile`.** `Object.keys(traces).length === CASES.length`. `provisional` is `true` iff
`generated_by === 'node-sqlite'`.

**`RecordId`, `BlobKey`.** `blobKey` accepts `rec_` + 26 characters of `0-9A-HJKMNP-TV-Z` and 64 characters of
`0-9a-f`; the result is `${recordId}/${sha256}`, so `Blobs.list(recordId)` is a prefix scan.

---

## 5 · Algorithms

### 5.1 · `openNodeSqlite(path)` — the open sequence

1. `db = new DatabaseSync(path, { enableForeignKeyConstraints: false, enableDoubleQuotedStringLiterals: false })`.
   Only options that exist are passed: an unknown key is silently ignored (measured), so `busy_timeout` is a
   PRAGMA, not an option.
2. PRAGMAs, through the driver directly: `journal_mode = WAL` (reports `memory` on `:memory:`, harmless);
   `synchronous = NORMAL`; `busy_timeout = 5000` — the four rows of 33 §6, `foreign_keys` already off by step 1.
3. Assert `PRAGMA foreign_keys` reads `0`; a `1` is `SqlError('UNKNOWN', 'foreign_keys is on')` — 02 §1 relies on
   OFF and nothing may cascade.
4. `caps = measureCaps((sql, ...p) => db.prepare(sql).all(...p))` (§5.2), then `bootProbe(caps, 'node:sqlite')`.
   `bootProbe` throws `SqlError('NO_SUCH_MODULE', text)` when `fts5` or `json` is false. The text, exactly:

```
This SQLite build cannot host a .brain file:
  fts5: required, not available
  driver: node:sqlite · SQLite 3.50.4
On macOS, Bun loads Apple's libsqlite3.dylib and is unsupported. Use Node 24.13+, which bundles its own SQLite.
```

   One `  <cap>: required, not available` line per missing capability, in the order `fts5`, `json`; the `driver:`
   line names the adapter and `caps.sqlite`. Lines one, two and four are 30 §13's; line three is the driver 33 §3
   asks for (§13 D10).
5. Return `{ exec, execScript, transactionSync, caps, close }` closing over `db` and `inTxn = false`.
   `close()` is `db.close()`.

Cost: two `CREATE`/`DROP` pairs and one `EXPLAIN`, under 2 ms per open on the pinned Node. Runs once per record
file at boot and once per test database.

### 5.2 · `measureCaps(run)`

1. `sqlite` ← `run('SELECT sqlite_version() AS v')[0].v`.
2. `json` ← `run("SELECT json_extract('{\"a\":1}', '$.a') AS v")[0].v === 1`; a throw is `false`.
3. `fts5` ← `run('DROP TABLE IF EXISTS _caps_fts')`, then `run('CREATE VIRTUAL TABLE _caps_fts USING fts5(x)')`
   succeeds; a throw whose `mapDriverMessage` is `NO_SUCH_MODULE` is `false`, any other throw propagates; then
   `run('DROP TABLE IF EXISTS _caps_fts')`. The table is created, not `PRAGMA compile_options` read: the
   fact, not the claim (30 §13).
4. `expressionIndexUsed` — skipped as `false` when `json` is false; otherwise:

```sql
DROP TABLE IF EXISTS _caps_probe;
CREATE TABLE _caps_probe (register TEXT NOT NULL, fields TEXT NOT NULL);
CREATE INDEX _caps_probe_due ON _caps_probe (json_extract(fields, '$.due')) WHERE register = 'x';
EXPLAIN QUERY PLAN SELECT 1 FROM _caps_probe WHERE register = ? AND json_extract(fields, '$.due') < ?;  -- 'x', '2026-01-01'
DROP TABLE _caps_probe;
```

   `true` iff some plan row's `detail` contains `USING INDEX _caps_probe_due`. Measured on Node 24.13.0:
   `SEARCH _caps_probe USING INDEX _caps_probe_due (<expr><?)` for the bound form and for the literal form.
   The bound form is the probe because it is the compiler's form (30 §7); the literal form is case
   `expression-index-used`. A throw anywhere in this step records `false` and drops the table — an adapter whose
   engine refuses `EXPLAIN` still opens, and the conformance case then fails loudly with the reason (30 §12 #5).
5. The declared ceilings: `maxParams 100 · maxLikePattern 50 · maxSqlBytes 100_000 · maxCompoundSelect 5 ·
   maxExprDepth 100`, all from `DO_LIMITS`; `nestedTransactions: false`.

### 5.3 · `exec(query, ...params)` — the numbered checks, in order

Steps 1–7 are `guard(query, params)`, shared by both adapters. Steps 8–12 are the Node adapter's.

1. **Transaction statement.** `/^\s*(?:BEGIN|COMMIT|END|ROLLBACK|SAVEPOINT|RELEASE)\b/i` on the query →
   `TXN_STATEMENT_FORBIDDEN`. Six keywords: `END` is `COMMIT`'s synonym and workerd's authorizer denies it with the
   rest (§13 D6). Measured: `node:sqlite` allows a raw `SAVEPOINT a; RELEASE a`, so this check is the only thing
   refusing it.
2. **Statement length.** `query.length * 3 > 100_000 && utf8Bytes(query) > 100_000` → `STATEMENT_TOO_LONG`.
   A UTF-16 code unit encodes to at most three UTF-8 bytes, so the cheap test is exact as a filter and
   `TextEncoder` runs only for statements over 33 333 characters.
   *Measured on local workerd, 24 September 2026:* 99 999 and 100 000 bytes answered, 100 001 refused
   (`statement too long: SQLITE_TOOBIG`); in two-byte characters 100 000 answered and 100 002 refused. So "over
   100 000" stands. The hardening survey's "refused at exactly 100 000" (`loop/research-hardening.md` §0 item 6,
   §2.5) came from a probe whose padding was one byte longer than its label. The built guard counts bytes in a loop
   rather than encoding, which is the same number without a second copy of the statement.
3. **Parameter count.** `params.length > 100` → `TOO_MANY_PARAMS`.
4. **Parameter types**, for each index `i`:
   - `string`, `null`, `Uint8Array` (a `Buffer` is one) — pass;
   - `number` — not finite → `SYNTAX` (SQLite binds `NaN` as `NULL`, silently); integer and not
     `Number.isSafeInteger` → `INT_OUT_OF_RANGE` (measured: `2 ** 53 + 2` binds as `real`, silently);
   - `bigint` — outside ±(2⁵³ − 1) → `INT_OUT_OF_RANGE`;
   - anything else → `SYNTAX` naming `i` and `typeof`. Measured on `node:sqlite`: `true` and `undefined` throw
     `ERR_INVALID_ARG_TYPE`; a `Date` binds as `NULL`; a plain object is read as a named-parameter map. The DO
     rejects all four. The guard makes the direction of each asymmetry irrelevant (§13 D5).
     *Corrected by measurement on local workerd, 24 September 2026:* the DO rejects none of them. `SELECT ? AS v`
     answered the TEXT `'true'` for `true`, `NULL` for `undefined`, `new Date(0)`'s `toString()` in the machine's
     time zone, `'[object Object]'` for `{}`, `''` for `[]`, `NULL` for `NaN`, and a `real` for `2 ** 53 + 2`; a
     bigint of `5n` threw `Cannot convert a BigInt value to a number`. Every one of those is a wrong row written
     without a word, which makes this step the most valuable of the seven on the Worker. The built guard names a
     non-`Param` object by its constructor (`Date`, `Array`, `Object`) rather than `typeof`, which says `object` for all
     three.
5. **LIKE pattern length.** Iterate `/(\b(?:LIKE|GLOB)\s*)?\?/gi` over the query counting `?` placeholders; for a
   match whose group 1 is set, the parameter at that index, if a string over 50 UTF-8 bytes →
   `LIKE_TOO_LONG`. Positional, and at bind time (§13 D2). `NOT LIKE ?` is covered; `ESCAPE '\'` after it is
   irrelevant. *As built:* the regex also captures `?NNN`, which takes index NNN, and a bare `?` takes one past the
   highest index seen so far, which is SQLite's own rule. `packages/record/src/identity.ts` binds `?1` twice, and
   counting its placeholders by position would have measured the wrong parameter.
6. **Compound terms.** `count(/\b(?:UNION|INTERSECT|EXCEPT)\b/gi) + 1 > 5` → `COMPOUND_TOO_LONG` (§13 D6).
7. **Second statement.** `/;\s*[^\s;]/` on the query → `MULTI_STATEMENT_PARAMS`, with or without parameters
   (§13 D1). A trailing `;` is not a second statement.
8. **Prepare.** `stmt = db.prepare(query)`; a throw → `SqlError(mapDriverMessage(e.message), e.message, { cause: e })`.
9. **`sourceSQL` assertion.** `tail = query.slice(stmt.sourceSQL.length)`; `!/^[\s;]*$/.test(tail)` →
   `MULTI_STATEMENT_PARAMS`. Measured: `prepare` compiles the first statement only and drops the rest without
   error; `sourceSQL` is exactly the compiled prefix, leading whitespace and comments included, terminating
   semicolon included. Step 7 makes the two adapters refuse identically; this step is Node's proof that nothing
   was silently dropped. If it ever fires, step 7 has a hole.
10. **Run or all.** `stmt.columns().length === 0` → `r = stmt.run(...params)`; `rows = []`;
    `rowsWritten = r.changes`; `rowsRead = 0`. Otherwise `rows = stmt.all(...params)`; `rowsRead = rows.length`;
    `rowsWritten = /^\s*(?:INSERT|UPDATE|DELETE|REPLACE)\b/i.test(query) ? rows.length : 0` — a `RETURNING`
    clause yields one row per row written, and the kernel's `UPDATE counter … RETURNING next - 1` (30 §4) is
    exactly that. Why not one call for everything: measured, `run()` on a SELECT returns a stale `changes` from
    the previous statement, and `all()` on an INSERT executes it and returns `[]` with no `changes` (§13 D3).
    A throw here → step 8's mapping; the read-side `RangeError` for an integer past 2⁵³ maps to `INT_OUT_OF_RANGE`.
11. **Cursor.** Return the materialised cursor of §4 over `rows`, `rowsRead`, `rowsWritten`.
12. Nothing is cached; `stmt` is garbage.

### 5.4 · `execScript(sql)`

1. `guardScript(sql)`: `/(?:^|;)\s*(?:BEGIN|COMMIT|END|ROLLBACK|SAVEPOINT|RELEASE)\b/i` → `TXN_STATEMENT_FORBIDDEN`;
   then the length check of §5.3 step 2 → `STATEMENT_TOO_LONG`. SQLite applies `SQLITE_LIMIT_SQL_LENGTH` to the
   text handed to `prepare`, so a migration file is at most 100 000 bytes on both adapters.
2. `db.exec(sql)`; a throw → the mapping of §5.3 step 8. No transaction is opened here: the migration runner wraps
   each file in `transactionSync` (33 §9).

### 5.5 · `transactionSync(fn)`

1. `inTxn` → `SqlError('TXN_STATEMENT_FORBIDDEN', 'transactionSync does not nest (caps.nestedTransactions = false)')`.
2. `db.exec('BEGIN')`; `inTxn = true`.
3. `r = fn()`. If `r` is thenable (`typeof r?.then === 'function'`) →
   `SqlError('TXN_STATEMENT_FORBIDDEN', 'transactionSync callback returned a promise')`. `NotPromise<T>` catches
   TypeScript callers at compile time; this catches the rest, because an awaited write would land after the commit.
4. `db.exec('COMMIT')`; `inTxn = false`; return `r`.
5. On any throw at steps 3–4: `inTxn = false`; `try { db.exec('ROLLBACK') } catch {}` — a failed `COMMIT` may have
   rolled back already (measured message: `cannot rollback - no transaction is active`); rethrow the original
   error unchanged. A caller's `Error` stays theirs; a `SqlError` stays a `SqlError`.

The flag fires before SQLite's own `cannot start a transaction within a transaction`, so Node refuses first and with
the code the DO adapter uses.

### 5.6 · The second implementation — the Durable Object adapter (spec 51)

`apps/worker/src/sql-do.ts` wraps `ctx.storage.sql` and satisfies the same `Sql`. Stated here so the two never
drift; spec 51 owns the file.

| Method | Does |
|---|---|
| `exec` | `guard(query, params)`; bind with `bigint → Number(v)` and `Uint8Array → ArrayBuffer` slice; `c = ctx.storage.sql.exec(query, ...bound)`; `rows = c.toArray()` with every `ArrayBuffer` wrapped in a `Uint8Array`; then read `c.rowsRead`, `c.rowsWritten` (they grow while iterating, so materialise first); a throw → `SqlError(mapDriverMessage(e.message), e.message, { cause: e })` |
| `execScript` | `guardScript(sql)`; `ctx.storage.sql.exec(sql)`; a throw → the same mapping |
| `transactionSync` | the same `inTxn` flag and thenable check around `ctx.storage.transactionSync(fn)`; workerd rolls back on throw |
| `caps` | `measureCaps((sql, ...p) => ctx.storage.sql.exec(sql, ...p).toArray())` in the constructor under `blockConcurrencyWhile`, then `bootProbe(caps, 'durable-object')` |

Workerd's own refusals — 101 bindings, a 51-byte pattern at evaluation, a 100 001-byte statement, `BEGIN`, a
boolean — become unreachable behind `guard`; what still surfaces (a constraint, a syntax error, a compound of six
inside a subquery) carries SQLite's message text and maps by fragment like Node's (§5.8). No numeric `errcode` is
relied on, because workerd exposes none.

### 5.7 · `runConformance(sql, assert, reference)`

1. `trace = {}`; `ran = 0`; `skipped = []`.
2. For each `c` of `CASES`, in order: `missing = (c.requires ?? []).filter(k => !sql.caps[k])`. If non-empty,
   push `{ id: c.id, reason: 'requires ' + missing.join(', ') }` and continue. Else
   `trace[c.id] = JSON.parse(JSON.stringify(c.run(sql)))`; `ran += 1`.
3. If `reference`: `assert.equal(Object.keys(reference.traces).length, CASES.length, 'the reference covers the
   corpus')`; for each `id` in `trace`: `reference.traces[id] === undefined` → `assert.fail(id + ': no reference
   trace')`; else `assert.deepEqual(trace[id], reference.traces[id], id)`.
4. `assert.equal(ran + skipped.length, CASES.length, 'every case ran or was skipped')`.
5. Return `{ trace, ran, skipped }`. The host prints `conformance <host>: ran <ran> skipped <n>` and one
   `skip <id>: <reason>` line per skip; the `conformance-count` gate (33 §8) compares the `ran` numbers across
   hosts and fails on a host that printed none.

### 5.8 · `mapDriverMessage(message)` — driver text to the thirteen

Substring match, case-sensitive, on SQLite's fixed message fragments. The fragments do not overlap, so order is
irrelevant. Every fragment below was produced on Node 24.13.0 except the last, which is workerd's.

| Fragment in the driver's message | Code |
|---|---|
| `constraint failed` — `UNIQUE constraint failed: t.k`, `NOT NULL constraint failed: …`, `CHECK constraint failed: …`, `FOREIGN KEY constraint failed` | `CONSTRAINT` |
| `syntax error` — `near "SELEC": syntax error` | `SYNTAX` |
| `no such module` | `NO_SUCH_MODULE` |
| `too many columns` | `TOO_MANY_COLUMNS` |
| `too many terms in compound SELECT` | `COMPOUND_TOO_LONG` |
| `Expression tree is too large` | `EXPR_TOO_DEEP` |
| `LIKE or GLOB pattern too complex` | `LIKE_TOO_LONG` |
| `too many SQL variables` | `TOO_MANY_PARAMS` |
| `statement too long` | `STATEMENT_TOO_LONG` |
| `too large to be represented as a JavaScript number` — `node:sqlite` reading an INTEGER past 2⁵³ | `INT_OUT_OF_RANGE` |
| `please use the state.storage.transaction` (workerd, below) | `TXN_STATEMENT_FORBIDDEN` |
| anything else — `no such table: x`, `no such column: "x" - should this be a string literal in single-quotes?`, `malformed JSON`, `column index out of range`, `statement has been finalized` | `UNKNOWN`, message kept verbatim |

*Measured on local workerd (wrangler 4.129.0), 24 September 2026, and amended here.* The DO's answer to `BEGIN`,
`END`, `ROLLBACK`, `RELEASE a` and `SAVEPOINT a` is one sentence, "To execute a transaction, please use the
state.storage.transaction() or state.storage.transactionSync() APIs instead of the SQL BEGIN TRANSACTION or SAVEPOINT
statements. ...", and not the `cannot execute transaction-related statements` this table had recorded, which no
statement produced. The DO answers `CREATE VIRTUAL TABLE ... USING nosuch(x)` with `not authorized: SQLITE_AUTH`, not
`no such module`, so case #17 (`no-such-module`) traces `UNKNOWN` there and `NO_SUCH_MODULE` on Node: a finding for
spec 51's first conformance run, not a fragment to add, because `not authorized` is also the DO's answer to `PRAGMA
compile_options` and does not mean a missing module. Its other sentences carried the fragments above:
`too many columns on c_cols: SQLITE_ERROR`, `too many terms in compound SELECT: SQLITE_ERROR`,
`LIKE or GLOB pattern too complex: SQLITE_ERROR`, `too many SQL variables at offset 213: SQLITE_ERROR`,
`statement too long: SQLITE_TOOBIG`, `Expression tree is too large (maximum depth 100): SQLITE_ERROR`.

*For whoever wires the guard (W60-6, W60-7).* `attempt()` in `packages/kernel/src/tx.ts` issues a raw `SAVEPOINT`
and recognises the DO's refusal by `/storage\.transaction/` on its message, then falls back to a nested
`transactionSync`. Step 1 refuses `SAVEPOINT` on both hosts before the driver, with this spec's sentence, which that
test does not match, so `attempt()` rethrows. The kernel needs to recognise `TXN_STATEMENT_FORBIDDEN` by code, and the
self-host's nested `transactionSync`, which today runs `fn()` with no savepoint, needs to become one, or a refusal
inside `attempt()` keeps its writes on the self-host.

---

## 6 · Refusals and errors

The thirteen, with when each is raised and the message a developer reads. The kernel never shows a `SqlError` to a
person: it maps `CONSTRAINT` onto its own `UNIQUE_VIOLATION`/`ALREADY_KNOWN` at write-path step 4 and treats the
rest as bugs (30 §6). `INT_OUT_OF_RANGE` is the one code in both vocabularies, because the same fact is refused at
step 3 and here (30 §6).

| Code | Raised when | Message |
|---|---|---|
| `TOO_MANY_PARAMS` | guard: 101+ parameters; driver: `too many SQL variables` | `101 parameters bound; the ceiling is 100 (DO_LIMITS.variableNumber). Chunk the statement.` |
| `LIKE_TOO_LONG` | guard: the parameter at `LIKE ?`/`GLOB ?` exceeds 50 bytes; driver: a literal pattern over 50 bytes evaluated on the DO | `LIKE pattern at parameter 3 is 51 bytes; the ceiling is 50 (DO_LIMITS.likePatternLength).` |
| `EXPR_TOO_DEEP` | driver only: `Expression tree is too large` — depth 101 on the DO, 1001 on Node | the driver's message |
| `INT_OUT_OF_RANGE` | guard: an integral `number` or a `bigint` beyond ±(2⁵³ − 1); driver: Node reading one | `parameter 2 is an integer beyond ±(2^53 - 1); store it as TEXT (01 §2).` or the driver's message |
| `TXN_STATEMENT_FORBIDDEN` | guard: a statement or script statement opening with one of the six keywords; nested `transactionSync`; a thenable callback; driver: workerd's refusal | `statement begins with SAVEPOINT; use transactionSync.` · `transactionSync does not nest (caps.nestedTransactions = false)` · `transactionSync callback returned a promise` |
| `NO_SUCH_MODULE` | driver: `no such module`; `bootProbe` on a build without FTS5 or JSON1 | the driver's message, or the four-line probe text of §5.1 |
| `MULTI_STATEMENT_PARAMS` | guard: a second statement in `exec`, with or without parameters; the `sourceSQL` assertion | `exec takes exactly one statement; a second begins at byte 14. Use execScript for a script.` |
| `STATEMENT_TOO_LONG` | guard: over 100 000 UTF-8 bytes in `exec` or `execScript`; driver: `statement too long` | `statement is 100001 bytes; the ceiling is 100000 (DO_LIMITS.sqlLength).` |
| `TOO_MANY_COLUMNS` | driver only: `too many columns` — 101 on the DO, 2 001 on Node | the driver's message |
| `COMPOUND_TOO_LONG` | guard: six or more compound terms by keyword count; driver: `too many terms in compound SELECT` | `6 compound SELECT terms; the ceiling is 5 (DO_LIMITS.compoundSelect).` or the driver's message |
| `CONSTRAINT` | driver: `constraint failed` | the driver's message — `UNIQUE constraint failed: c_uq.k` |
| `SYNTAX` | driver: `syntax error`; guard: a parameter that is not a `Param` | the driver's message, or `parameter 1 is boolean; a Param is null, number, bigint, string or Uint8Array.` |
| `UNKNOWN` | driver: anything not above | the driver's message, verbatim |

Two throws are not `SqlError`s and carry no code: `Cursor.one()` on a count other than one throws `RangeError`, and
`transactionSync` rethrows the callback's own error after rolling back. Both are programming errors, not driver
outcomes. A message never contains a bound value: SQLite names tables and columns, never data, and the guard's
messages carry indexes and byte counts only (12 §8).

---

## 7 · Performance budget

Measured 2026-09-02, Node 24.13.0, SQLite 3.50.4, win32-x64, `:memory:`, 50 000 warm iterations timed with
`performance.now()`. The statement is the compiler's shape: two `json_extract` terms, one `LIKE ?`, three
parameters, a one-row table.

| Operation | Measured | Budget |
|---|---|---|
| `guard` alone, three parameters, one `LIKE ?` | 0.4 µs | ≤ 1 µs |
| `exec` SELECT, end to end (guard + prepare + `sourceSQL` + `columns` + `all`) | 14.4 µs | ≤ 25 µs |
| of which `prepare` | ≈ 10 µs (14.4 − 4.2 with a pre-prepared statement) | — |
| `exec` INSERT of one row | 3.4 µs | ≤ 10 µs |
| `prepare` + `all` of `SELECT 1` | 2.4 µs | — |
| empty `BEGIN` / `COMMIT` pair | 0.6 µs | ≤ 2 µs |
| adapter overhead above the bare driver per `exec` | ≈ 0.5 µs | ≤ 1 µs |
| `measureCaps` + `bootProbe` per open | < 2 ms | ≤ 10 ms |

A write path of about fifteen statements (30 §4) spends roughly 0.2 ms in the adapter and driver together — noise
against one network round trip. The statement cache that would save the 10 µs `prepare` is not built (§10 #1).

| Artefact | Size |
|---|---|
| `reference.json` | 32 cases, ≈ 93 trace lines, under 8 KB pretty-printed; the file is regenerated, never edited |
| main entry, minified | under 6 KB; no dependency |
| memory held by the adapter | one `DatabaseSync`, one boolean; no statement or row is retained after `exec` returns |

How measured: `test/bench.ts`, run by hand with `node test/bench.ts`, prints the first table; it is not a CI gate
because timing gates are flaky. The numbers are re-measured when the Node pin moves and the table is corrected with
an "an earlier draft said" note.

---

## 8 · Security

`exec` is an internal boundary — the kernel and the record on one side, a driver on the other. No SQL text is ever
user-authored: the `where:` compiler emits SQL from a validated tree and binds every value (30 §7); the kernel's
statements are fixed strings. The guard is therefore not an injection defence; it is the parity mechanism that
stops a self-host from passing where the Cloud would fail (30 §13). What it guarantees the record, and why each
matters:

| Guarantee | Why it matters |
|---|---|
| No caller opens a transaction or savepoint (`BEGIN COMMIT END ROLLBACK SAVEPOINT RELEASE` refused) | a stray `BEGIN` inside the write path would make `transactionSync`'s atomicity a lie on Node and throw mid-write on the DO; nesting is out of the interface (30 §13) |
| No `boolean`, `undefined`, `Date`, object or array is coerced | measured: a `Date` binds as `NULL` and an object is a named-parameter map on Node; a silent `NULL` in `fields` is the corruption class 30 §6 refuses rather than repairs |
| No integer past 2⁵³ in or out | the DO loses precision silently; a `seq` or a money figure off by one is the worst kind of wrong (30 §13) |
| No double-quoted string literal (`enableDoubleQuotedStringLiterals: false`) | `"$.due"` is an identifier and errors, so a misquoted JSON path can never become a string that matches nothing; the compiler emits single quotes and binds values (30 §7) |
| `foreign_keys` is off, and asserted | 02 §1: `event` has no FK to `entry`; nothing cascades |
| Every ceiling is refused before the driver, with the same code on both adapters | "Node refuses first" is a mechanism, not a hope (01 §4) |
| A LIKE pattern is the whole bound value | a pattern assembled in SQL (`? \|\| '%'`) cannot be measured; 34 §1 binds the finished pattern |

What never travels: a bound value into a `SqlError`, a log line, or a trace (`rows` traces hold the corpus's own
literals only); key material — `ports` declares `KeyStore` and touches no key; the record has no `KeyStore` port
(12 §6). The `.brain` path is the self-host's to choose; the adapter opens one file and no second (`ATTACH` is not
in the interface, 30 §13). The one `node:*` import under `packages/**` is `src/node-sqlite.ts`, behind a
subpath; lint layer 4 (31 §3) exempts that file and nothing else, so the main entry provably runs in workerd.

---

## 9 · Tests and gates

### 9.1 · Unit — `test/sql.test.ts`, `test/boot-probe.test.ts`

Input → expected. All against `openNodeSqlite(':memory:')` unless stated.

| Check | Input | Expected |
|---|---|---|
| guard: each of the six keywords, lower-case, leading whitespace | `'  savepoint a'` | `TXN_STATEMENT_FORBIDDEN` |
| guard: keyword not at the start | `"SELECT 'BEGIN' AS v"` | passes |
| guard: length | 100 000 bytes / 100 001 bytes | passes / `STATEMENT_TOO_LONG` |
| guard: length, multibyte | 33 400 × `é` (66 800 bytes) | passes |
| guard: count | 100 / 101 parameters | passes / `TOO_MANY_PARAMS` |
| guard: types | `true`, `undefined`, `new Date()`, `{}`, `[]`, `NaN`, `Infinity` | `SYNTAX`, each naming its index |
| guard: integers | `2 ** 53`, `-(2 ** 53)`, `2n ** 53n` / `Number.MAX_SAFE_INTEGER`, `1.5`, `-0` | `INT_OUT_OF_RANGE` / passes |
| guard: LIKE positional | `'… WHERE a LIKE ? AND b = ?'` with a 50-byte pattern and a 60-byte string | passes |
| guard: LIKE bytes | 26 × `é` at `LIKE ?` (52 bytes, 26 characters) | `LIKE_TOO_LONG` |
| guard: GLOB, NOT LIKE | 51 bytes at `GLOB ?` / at `NOT LIKE ?` | `LIKE_TOO_LONG` |
| guard: compound | 5 / 6 terms | passes / `COMPOUND_TOO_LONG` |
| guard: second statement | `'SELECT 1; SELECT 2'`, `'SELECT 1;SELECT 2'` / `'SELECT 1;'`, `'SELECT 1; '` | `MULTI_STATEMENT_PARAMS` / passes |
| `mapDriverMessage` | one row per fragment of §5.8, plus `'no such table: x'` | the code / `UNKNOWN` |
| `measureCaps` | `:memory:` | `fts5 true`, `json true`, `expressionIndexUsed true`, `sqlite` = `'3.50.4'`, the five ceilings |
| `measureCaps` tolerance | a `run` that throws on `EXPLAIN` | `expressionIndexUsed false`, no throw |
| `bootProbe` | `{ …caps, fts5: false }`, `'node:sqlite'` | `SqlError NO_SUCH_MODULE`; `message` equals the four lines of §5.1 exactly |
| `bootProbe` | `{ …caps, fts5: false, json: false }` | five lines: `fts5:` then `json:` |
| `openNodeSqlite` PRAGMAs | after open | `foreign_keys 0`, `busy_timeout 5000`, `synchronous 1` |
| `exec` run/all | `CREATE TABLE`, `INSERT`, `UPDATE … RETURNING`, `SELECT`, `PRAGMA foreign_keys`, `EXPLAIN QUERY PLAN …` | `rowsWritten` 0 · 1 · 1 · 0 · 0 · 0; `rowsRead` 0 · 0 · 1 · n · 1 · k |
| `Cursor.one()` | 0 rows / 2 rows / 1 row | `RangeError` / `RangeError` / the row |
| `transactionSync` | throw inside; nested; thenable; `COMMIT` path returns the value | rolled back, error rethrown unchanged; `TXN_STATEMENT_FORBIDDEN` twice; the value |
| `execScript` | DDL + DML + trailing comment / a `BEGIN` after a `;` | rows present / `TXN_STATEMENT_FORBIDDEN`, nothing executed |
| `blobKey` | a valid pair / a 63-hex hash / `'rec_x'` | the key / `RangeError` / `RangeError` |
| read-side integer | `SELECT 9007199254740993 AS v` | `INT_OUT_OF_RANGE` (Node-only behaviour; not a conformance case, §10 #13) |

### 9.2 · Conformance — the corpus, thirty-two cases

Each case: id · what it runs · expected trace lines. `rows …` abbreviates `['rows', …]`; a code abbreviates
`['err', CODE]`; `n k` abbreviates `['n', k]`. Tables are `c_<id>`; every SELECT carries `ORDER BY`.

| # | id | Runs | Expected trace |
|---|---|---|---|
| 1 | `caps-declared` | reads `sql.caps` | `n 100 · n 50 · n 100000 · n 5 · n 100 · n 1 (fts5) · n 1 (json) · n 0 (nested)` |
| 2 | `param-boolean` | `exec('SELECT ? AS v', true)` | `SYNTAX` |
| 3 | `param-other-types` | `exec('SELECT ? AS v', x)` for `undefined`, `new Date(0)`, `{}`, `[]` | `SYNTAX × 4` |
| 4 | `param-roundtrip` | `SELECT ? AS n, ? AS s, ? AS z, ? AS b, ? AS f, ? AS g` with `1, 'x', null, Uint8Array [1,2,3], 1.5, 5n`; then `typeof()` of each | `rows [{n:1,s:'x',z:null,b:[1,2,3],f:1.5,g:5}] · rows [{a:'integer',b:'text',c:'null',d:'blob',e:'real',f:'integer'}]` |
| 5 | `int-beyond-2-53` | `SELECT ? AS v` with `2 ** 53`, `9007199254740992n`, `-(2 ** 53)`, then `Number.MAX_SAFE_INTEGER` | `INT_OUT_OF_RANGE × 3 · rows [{v:9007199254740991}]` |
| 6 | `multi-statement-params` | `exec('SELECT ? AS a; SELECT 2 AS b', 1)` | `MULTI_STATEMENT_PARAMS` |
| 7 | `multi-statement-no-params` | `exec('SELECT 1 AS a; SELECT 2 AS b')`; `exec('SELECT 1 AS a;')`; `exec('SELECT 1 AS a; ')` | `MULTI_STATEMENT_PARAMS · rows [{a:1}] · rows [{a:1}]` |
| 8 | `begin-refused` | `BEGIN` · `begin immediate` · `  BEGIN TRANSACTION` | `TXN_STATEMENT_FORBIDDEN × 3` |
| 9 | `savepoint-refused` | `SAVEPOINT a` · `RELEASE a` · `ROLLBACK TO a` | `TXN_STATEMENT_FORBIDDEN × 3` |
| 10 | `txn-keywords-refused` | `COMMIT` · `END` · `END TRANSACTION` · `ROLLBACK` · `commit;` · then `SELECT 'BEGIN' AS v` | `TXN_STATEMENT_FORBIDDEN × 5 · rows [{v:'BEGIN'}]` |
| 11 | `params-101` | `SELECT count(*) AS n FROM (SELECT 1 AS x) WHERE x IN (?, … )` with `caps.maxParams` ones, then one more | `n 100 · rows [{n:1}] · TOO_MANY_PARAMS` |
| 12 | `like-51-bytes` | `c_like(x TEXT)` holding `'a'` (a pattern is only evaluated against a row); `SELECT count(*) AS n FROM c_like WHERE x LIKE ?` with `'a' + '%' × 49` (50 bytes); with 51 bytes; `… WHERE x LIKE ? AND ? <> ''` with the 50-byte pattern and a 60-byte string; `GLOB ?` with 51 bytes; `LIKE ?` with 26 × `é` | `n 50 · rows [{n:1}] · LIKE_TOO_LONG · rows [{n:1}] · LIKE_TOO_LONG · LIKE_TOO_LONG` |
| 13 | `statement-100001-bytes` | `'SELECT 1 AS v'` space-padded to `caps.maxSqlBytes`; to one more | `n 100000 · rows [{v:1}] · STATEMENT_TOO_LONG` |
| 14 | `compound-6` | `SELECT i AS v` × 5 joined by `UNION ALL`, `ORDER BY v`; × 6 | `n 5 · rows [{v:1}…{v:5}] · COMPOUND_TOO_LONG` |
| 15 | `expr-depth-1001` | `SELECT 1 AS v WHERE 1=1 OR 1=1 …` (1 001 terms) | `EXPR_TOO_DEEP` — Node refuses at 1 001, the DO at 101; both map |
| 16 | `columns-2001` | `CREATE TABLE c_cols (c0, …, c2000)` | `TOO_MANY_COLUMNS` — Node's ceiling is 2 000, the DO's 100 |
| 17 | `no-such-module` | `CREATE VIRTUAL TABLE c_nomod USING nosuch(x)` | `NO_SUCH_MODULE` |
| 18 | `fts5-phrase` *(requires fts5)* | `CREATE VIRTUAL TABLE c_fts USING fts5(body)`; insert `'the quick brown fox'`, `'a brown quick dog'`, `'quick brown'`; `SELECT rowid AS r FROM c_fts WHERE c_fts MATCH ? ORDER BY rowid` with `'"quick brown"'` | `rows [{r:1},{r:3}]` |
| 19 | `json-extract` *(requires json)* | `SELECT json_extract(?, '$.a.b') AS v, json_type(?, '$.n') AS t` with `'{"a":{"b":2}}'`, `'{"n":null}'`; `json_extract('{"a":1}', '$.missing')`; `SELECT count(*) AS n FROM json_each(?)` with `'[1,2,3]'` | `rows [{v:2,t:'null'}] · rows [{v:null}] · rows [{n:3}]` |
| 20 | `expression-index-used` | `c_idx(register, fields)` with the partial expression index of §5.2 on `register = 'obligations'`; three rows, two in the register; `EXPLAIN QUERY PLAN` of the bound form; of the literal form; `caps.expressionIndexUsed`; the query itself | `n 1 · n 1 · n 1 · rows [{rowid:…}]` — the DO half of Q12 |
| 21 | `dqs-identifier` | `exec('SELECT "x" AS v')`; `exec("SELECT 'x' AS v")` | `UNKNOWN · rows [{v:'x'}]` — fills the `—` in 30 §13's table in week one |
| 22 | `constraint-unique` | `c_uq(id INTEGER PRIMARY KEY, k TEXT UNIQUE, n INTEGER NOT NULL CHECK (n > 0))`; insert `('a', 1)`; count; insert `('a', 2)`; insert `('b', NULL)`; insert `('c', 0)` | `rows [{n:1}] · CONSTRAINT × 3` |
| 23 | `syntax-misspelled` | `SELEC 1` · `SELECT 1 FORM c_uq` | `SYNTAX × 2` |
| 24 | `unknown-no-such-table` | `SELECT * FROM c_absent` · `SELECT json_extract('nope', '$.a')` | `UNKNOWN × 2` |
| 25 | `txn-commit` | `c_txn(x INTEGER)`; `transactionSync(() => { insert 1; insert 2; return 7 })`; count | `n 7 · rows [{n:2}]` |
| 26 | `txn-rollback-on-throw` | `c_rb`; `transactionSync(() => { insert; throw new Error('boom') })` caught, `n 1` if the message is `boom`; count; a plain insert afterwards; count | `n 1 · rows [{n:0}] · rows [{n:1}]` |
| 27 | `txn-nested-refused` | `transactionSync(() => transactionSync(() => 1))`; then `transactionSync(() => 1)` | `TXN_STATEMENT_FORBIDDEN · n 1` |
| 28 | `txn-async-refused` | `c_async`; `transactionSync(() => { insert; return Promise.resolve(1) })`; count | `TXN_STATEMENT_FORBIDDEN · rows [{n:0}]` |
| 29 | `cursor-one-first` | `SELECT column1 AS v FROM (VALUES (1), (2)) ORDER BY v`: `first()`; `one()`; `one()` on `SELECT 1 AS v`; `first()` on `SELECT 1 AS v WHERE 0` is `undefined`; `[...cursor].length` | `rows [{v:1}] · UNKNOWN · rows [{v:1}] · n 1 · n 2` |
| 30 | `cursor-counters` | `c_cnt(x INTEGER)` — a rowid table with no index, because an index may count as rows written on the DO; `INSERT … VALUES (1), (2), (3)` → `rowsWritten`, `rowsRead`; `SELECT x FROM c_cnt ORDER BY x` → `rowsRead`, `rowsWritten` | `n 3 · n 0 · n 3 · n 0` |
| 31 | `execscript-ddl-dml` | `execScript('CREATE TABLE c_scr (x INTEGER); INSERT INTO c_scr VALUES (1); INSERT INTO c_scr VALUES (2); -- done')`; `SELECT x FROM c_scr ORDER BY x` | `rows [{x:1},{x:2}]` |
| 32 | `execscript-begin-refused` | `execScript('CREATE TABLE c_scr2 (x); BEGIN; INSERT INTO c_scr2 VALUES (1); COMMIT;')`; `execScript('BEGIN; SELECT 1;')`; `SELECT count(*) AS n FROM sqlite_master WHERE name = 'c_scr2'` | `TXN_STATEMENT_FORBIDDEN × 2 · rows [{n:0}]` — refused before anything ran |

Thirty-two, counted; ninety-three trace lines. Cases #2, #6 and #9 are 33 §3's #1, #2 and #3. Cases #15, #16 and
#17 prove the *mapping* on both engines where the *ceilings* differ; §10 #4–#5 record that Node does not refuse at
the DO's number for those two. Cases #20, #21 and #30 are the week-one measurements of 30 §12 #5 — a
disagreement there is a finding, not a flake.

### 9.3 · The reference-trace procedure

1. `pnpm --filter @braindog/ports test` runs `test/conformance.test.ts`: `openNodeSqlite(':memory:')`,
   `runConformance(sql, nodeAssert, reference)` where `reference` is `JSON.parse(readFileSync('src/conformance/
   reference.json'))` and `nodeAssert` wraps `node:assert/strict` (`ok · equal · deepEqual · fail`).
2. With `CONFORMANCE_WRITE=1`, the same test calls `runConformance(sql, nodeAssert, null)` and writes
   `{ generated_by: 'node-sqlite', generated_at, sqlite: caps.sqlite, provisional: true, traces }` as two-space
   JSON with a trailing LF. **Provisional** until phase 5.
3. In phase 5 the Worker's Vitest job runs the same corpus against the DO adapter with `CONFORMANCE_WRITE=1`,
   writing `generated_by: 'durable-object'`, `provisional: false`. From then on only that job regenerates the file
   (33 §3); the Node test compares against it.
4. Every host prints `conformance <host>: ran <n> skipped <m>` and each `skip <id>: <reason>`. Skips are expected
   to be zero on both hosts, because a build failing `fts5` or `json` was refused at boot; the mechanism exists for
   a self-hoster certifying a build without running the app.

### 9.4 · CI rows (33 §8, owned here)

| Gate | Where | Asserts |
|---|---|---|
| `conformance-count` | script | every host's `ran` is equal to every other's and to `CASES.length − skips`; every skip printed; once `apps/worker` exists, `reference.json` has `provisional: false` |
| `boot-probe` | `node --test` (Vitest arrives in phase 5, BUILD.md) | `bootProbe({ …caps, fts5: false }, 'node:sqlite')` throws with the exact four-line text |
| `graph` · lint layer 4 | script · ESLint | no `node:*` under `packages/**` except `packages/ports/src/node-sqlite.ts`; `src/index.ts` does not import it |

No property test lives here; the compiler's depth and compound assertions are spec 38's (30 §7).

---

## 10 · Deliberate ceilings

Each a `ponytail:` line in the source, named here with the condition that adds it back.

1. `ponytail: prepare per exec, no statement cache` — measured ≈ 10 µs per compiled statement. Add a bounded LRU
   keyed by query text when a profile shows `prepare` above 20 % of a request.
2. `ponytail: rowsRead counts rows returned, rowsWritten counts changes` — the DO counts rows scanned and rows
   (plus index entries) written for billing. They agree on an unindexed INSERT and a full SELECT, which case #30
   asserts. No kernel logic reads the counters; measure the DO before any budget ever does.
3. `ponytail: LIKE detection is a positional regex` — a `?` inside an inline string literal shifts the count. The
   compiler binds every value and inlines only `'$.<id>'` paths, whose alphabet (34 §4) has no `?`. Parse if a
   hand-written statement ever inlines one.
4. `ponytail: compound terms by keyword count` — nested compounds are summed, so three subqueries of two terms
   each read as six. Split per SELECT when a kernel statement needs it.
5. `ponytail: expression depth is not guarded` — the DO refuses at 101, Node at 1 001, and depth needs a parser.
   Spec 38's property test asserts the compiler stays under 100; a hand-written statement between 101 and 1 000
   fails on Cloud CI only.
6. `ponytail: execScript refuses by a (^|;) keyword regex` — a trigger body's `BEGIN … END;` would be refused. No
   trigger is declared (01 §2). When one is, walk the script with `prepare` + `sourceSQL` for exact boundaries.
7. `ponytail: the transaction prefix regex skips no leading comment` — `/* c */ BEGIN` passes on Node. No caller
   writes comments before a keyword; strip comments if a case ever needs it.
8. `ponytail: the Node cursor is re-readable; the DO's is one-shot` — callers consume a cursor once. A `spent`
   flag if a bug ever needs the louder failure.
9. `ponytail: placeholders are not counted against parameters` — too few binds `NULL` on Node (SQLite's default);
   the DO's behaviour is spec 51's week-one measurement. If it errors, add a case and count `?`.
10. `ponytail: no better-sqlite3 adapter` — 33 §1 names it for an older Node; the pin is 24.13 (31 §3). Add it
    when a supported Node lacks `node:sqlite`.
11. `ponytail: no memory fakes for the eight other ports` — an object literal satisfies each interface; the first
    spec that needs a fake ships it in its own `test/`.
12. `ponytail: measureCaps creates and drops two probe tables in main on every open` — a write per boot. Move
    to `temp` if the DO permits it and the write is ever measured to matter.
13. `ponytail: a SQL-computed integer past 2^53 is INT_OUT_OF_RANGE on read on Node and imprecise on the DO` —
    `random()`, an overflowing `SUM`. The kernel computes none; ids are TEXT (01 §2). Bound with `% n` if one appears.
14. `ponytail: UNKNOWN is a wide bucket` — no such table, malformed JSON, index out of range, an empty statement.
    Split when a consumer needs to branch on one.
15. `ponytail: reference.json is generated from Node until phase 5` — provisional, flagged in the file, gated in CI.
16. `ponytail: ATTACH, PRAGMA and VACUUM are not pre-refused` — the DO denies them as `UNKNOWN`. Whether the DO
    permits `PRAGMA user_version` and `application_id` (30 §11) is spec 51's week-one measurement;
    `record.format_ver` is the portable mirror 30 §11 already keeps.

---

## 11 · Dependencies

| Kind | Name | Version | Why |
|---|---|---|---|
| runtime | — | — | none. `node:sqlite` is a Node built-in, imported by one file behind a subpath |
| dev (root) | `typescript` | 6.0.3 | type-check only (35 §2) |
| dev (root) | `@types/node` | 24.13.0 | `node:sqlite` typings — `StatementSync.columns()`, `sourceSQL` |
| test | `node:test`, `node:assert/strict` | Node 24.13.0 | the runner and the `Assert` host |
| phase 5, in `apps/worker` only | `vitest` 4.1.11 + `@cloudflare/vitest-plugin` 1.1.2 | 31 §3 | the second `Assert` host |

No `fast-check` here. A new runtime dependency is a new ADR (35 §2).

---

## 12 · Build order

**Needs before it:** nothing. In-degree zero; second in the total order of 31 §2 but independent of `render`, so
the two build in parallel.

**Unblocks:** `kernel` (6) — migrations and the write path run on `openNodeSqlite(':memory:')` in tests; `mcp`
(9); `record` (10); `spark` (11); `cli` (12); `selfhost` and `worker`. Spec 38's property test needs a SQLite to
run compiled SQL against (30 §14 #2); this adapter as a devDependency is the lazy answer, and spec 38 decides.
Spec 51 builds the second `Sql` implementation against §5.6 and regenerates the reference trace (§9.3 step 3).

---

## 13 · Decisions taken here

Each with the design document to amend in the same revision (35 §1).

**D1 · `exec` is one statement, always.** A second statement is `MULTI_STATEMENT_PARAMS` with or without
parameters; `execScript` is the only multi-statement door. Detected twice: a shared regex (`;\s*[^\s;]`) so both
adapters refuse identically, and Node's `sourceSQL` assertion — measured, `prepare` silently drops everything
after the first statement, and `sourceSQL` is exactly the compiled prefix — so a hole in the regex cannot become a
silently dropped statement. *Amend 33 §1 (the doc-comment), 30 §13.*

**D2 · LIKE is positional and bind-time — the over-refusal approximation.** The guard measures the parameter bound
at `LIKE ?` or `GLOB ?`, not every string in the statement (a 60-byte `eq` literal beside a `starts` predicate
would otherwise be refused). It refuses at bind time even when SQLite would never evaluate the pattern — an empty
table on the DO accepts a 60-byte pattern and fails once it has rows, which is the silent-ceiling class this
package removes. Case #12 runs on a one-row table for that reason. *Amend 30 §13 ("every bound string used as a
LIKE pattern") and 33 §1.*

**D3 · Run versus all by `columns().length`, and the counters' meaning on Node.** Zero columns → `run()`,
`rowsWritten = changes`; otherwise `all()`, `rowsRead = rows.length`, and `rowsWritten = rows.length` for a
`RETURNING` write. Measured: `run()` on a SELECT reports a stale `changes`; `all()` on an INSERT executes it and
returns `[]`. `Cursor.one()` throws `RangeError`, not `SqlError` — no SQL failed. *Amend 33 §1 (Cursor comments).*

**D4 · Errors map by SQLite's message fragments, on both adapters.** Twelve fragments (§5.8), substring-matched;
no numeric `errcode`, because workerd exposes none and the fragments are SQLite's own fixed strings. `UNKNOWN`
keeps the driver's message verbatim. *Amend 33 §3 and 30 §13 ("maps workerd's own errors" → the table lives in
`ports` and both adapters call it).*

**D5 · A value that is not a `Param` is `SYNTAX`.** The closed list has no type code; `SYNTAX` is "the call is
malformed" and the message names the index and type. Case #1's premise is corrected: measured, `node:sqlite` does
not coerce a boolean — it throws — while it binds a `Date` as `NULL` and reads an object as named parameters. The
guard refuses every non-`Param` before either driver, so the direction of the asymmetry no longer matters. `NaN`
and `±Infinity` are refused too. *Amend 33 §3 (case #1), 31 §5 ("node:sqlite coerces").*

**D6 · Six keywords; compound terms guarded; expression depth not.** `END` joins the five (it is `COMMIT`'s
synonym and denied by the same authorizer check). `COMPOUND_TOO_LONG` becomes a guard refusal by keyword count, so
a fifth ceiling is refused on Node first. Expression depth stays a property of the compiler's output (30 §7): it
needs a parser, and cases #15 and #16 prove the mapping instead. *Amend 33 §1, 30 §13 (the ceilings table).*

**D7 · `Assert` has four methods.** The runner uses `ok · equal · deepEqual · fail` and returns the skips for the
host to print; `throws` and `skip` had no caller. *Amend 33 §3, 30 §13 ("six methods"), 31 §5.*

**D8 · One permitted `node:*` import under `packages/**`.** `packages/ports/src/node-sqlite.ts`, behind the
`./node-sqlite` subpath. The kernel's tests need a real SQLite and packages never import apps, so the adapter cannot
live in `apps/selfhost`. Lint layer 4 exempts that one path. *Amend 31 §1, §3 (layer 4), §8 (the tree's `ports`
line).*

**D9 · Two implementations, no fakes, no `better-sqlite3`.** `node:sqlite` at `:memory:` is the memory adapter
(BUILD.md already records it); a `Clock` or `Scheduler` fake is an object literal in the test that needs it;
`better-sqlite3` is not built under the Node pin. *Amend 33 §1 ("one memory implementation each", "three
adapters"), 33 §6 (`BRAINDOG_SQLITE`), 31 §8.*

**D10 · The adapter owns the open sequence.** `openNodeSqlite` applies 33 §6's four PRAGMAs, asserts
`foreign_keys = 0`, returns `close()`, and runs `measureCaps` + `bootProbe`. `measureCaps` tolerates an `EXPLAIN`
failure (records `false`; the case then fails loudly). `json` is required beside `fts5`. The probe text gains a
`driver:` line. *Amend 33 §6 ("Per open"), 33 §3, 30 §13 (the message).*

**D11 · The record types beside the ports.** `RecordId`, `Msg`, `ToolDef`, `ToolCall`, `PushSubscription` take
the minimal shapes of §2.3; `blobKey` validates both halves. *Amend 33 §1.*

**D12 · Week-one measurements are cases, not spikes.** `EXPLAIN` on the DO (#20), double-quoted literals on the
DO (#21) and the DO's counters (#30) are in the corpus with Node's answer recorded; a disagreement in phase 5 is a
finding that amends 30 §13's divergence table. *Amend 30 §12 #5, 17 Q12.*

---

## 14 · Done when

- [ ] `package.json` with the three exports, `private: true`, no `dependencies`; `tsconfig.json` extends the base
- [ ] `src/sql.ts`, `src/index.ts`, `src/node-sqlite.ts`, `src/conformance/cases.ts` exist and nothing else under `src/`
- [ ] `src/index.ts` imports no `node:*`; lint layer 4 passes with the single exemption
- [ ] `tsc -p packages/ports` is clean under `strict`, `erasableSyntaxOnly`, `verbatimModuleSyntax`
- [ ] every row of §9.1 is a passing `node --test` case
- [ ] `CASES.length === 32`; ids match §9.2; every SELECT in a case has `ORDER BY`
- [ ] `CONFORMANCE_WRITE=1 pnpm --filter @braindog/ports test` writes `reference.json` with `provisional: true`; a
      second run without the flag is green
- [ ] the boot-probe test matches the four-line text byte for byte
- [ ] `test/bench.ts` prints the §7 table; the measured `exec` SELECT is under 25 µs and the guard under 1 µs
- [ ] the twelve amendments of §13 are applied to 30, 31, 33 and 17, and BUILD.md's loop log names this revision
- [ ] spec 51's `sql-do.ts` section cites §5.6 and imports only the main entry and `./conformance`

---

*Previous: [36-SPEC-RENDER](36-SPEC-RENDER.md). Next: [38-SPEC-WHERE](38-SPEC-WHERE.md).*
