# 48 · apps/cli — specification

The `braindog` command: the `braindog-cli` package on npm, Apache-2.0, unscoped, one published file, no
runtime dependencies ([33-CONTRACTS](33-CONTRACTS.md) §5, [31-STACK](31-STACK.md) §6). Mode: ponytail. Node's
`util.parseArgs`, `fetch`, `node:sqlite` through the ports adapter, WebCrypto — the standard library all the
way down.

---

## 1 · Purpose and boundary

**What it does.** Logs a machine into one record through the RFC 8628 device flow; moves a record in and out
of the two containers of [03-DOG-FORMAT](03-DOG-FORMAT.md) §2 (`.dogl` ↔ `.dog`); verifies either offline;
lints, plans, installs and uninstalls packs ([04-PACKS](04-PACKS.md) §3–§4); dry-runs rules
([07-INGEST-AND-RULES](07-INGEST-AND-RULES.md) §6); mints, lists and revokes agent tokens; enrols and runs the
tier-C runner ([33-CONTRACTS](33-CONTRACTS.md) §11, [46-SPEC-SPARK](46-SPEC-SPARK.md) §4.7); starts a self-host
for development.

**What it refuses to do.** It never holds the record: every row read or written goes over HTTP to a record
that validates it. It never signs a `.dog` — the signature travels from the host that holds the key. It never
decrypts a grant. It never prints a stored token. It never imports `apps/selfhost` or `apps/worker` — apps
import packages, never each other ([35-SPEC-OVERVIEW](35-SPEC-OVERVIEW.md) §2) — so `init` and `dev` *spawn*
the self-host (§13 D5). It never runs `claude` with `--dangerously-skip-permissions`.

**What it may import.** `render` for `PRIMITIVES_VERSION` (36); `ports` for the envelope types and the
`node:sqlite` adapter (37; the one [40-SPEC-FIXTURES](40-SPEC-FIXTURES.md) §5.3 uses); `kernel` for
`FORMAT_VERSION`, `KERNEL_MIGRATION` and `applyMigrations` (41); `declare` for the offline lint (42);
`spark/prompts` for the runner's templates (46 §2, "data only, so the CLI's runner can bundle it alone");
`where` only transitively. Row 12 of [31-STACK](31-STACK.md) §2 plus one edge, `spark` (§13 D9). Everything
else is `node:*`.

---

## 2 · Public API

An app's public surface is its command tree, its config file and its environment. Every command but `mcp`
takes the two globals `--json` and `--host <host>`; every command exits with one of four codes (§4.4).

| Command | Arguments · flags | Calls | Prints | Exit |
|---|---|---|---|---|
| `login <host>` | `<host>` = `https://origin[/slug]` | `POST /auth/device` then `POST /auth/device/token` until approved | the six digits and the URL (stderr); `logged in to <host> as <label> · expires <date>` | 0 · 1 · 3 |
| `mcp` | `--agent claude\|codex\|cursor\|other` · `--host <host>` | reads one JSON-RPC message per line on stdin and answers it with `handle` from `@braindog/mcp/rpc`; a tool call is `GET` or `POST /api/<method>` with the bearer and the session headers of `loop/research-agent-path.md` §3.4, inside a 20-second budget | JSON-RPC on stdout and nothing else; one line on stderr when it cannot start. A host that does not answer is a tool error carrying the unreachable sentence of the agent path's §1.7 | 0 once stdin closes and every call in flight is answered · 1 when it cannot start |
| `init <slug>` | self-host only | spawns the self-host entry: `init <slug>` (§5.14) | the child's output | the child's |
| `serve [<file>]` | self-host only | spawns the self-host entry: `serve [<file>]` (§5.14) | the child's output | the child's |
| `dev` | self-host only; `--port <n>` (default 8080) | spawns the self-host entry: `dev` | the child's output | the child's |
| `export` | `--sections data,origin,governance` · `--redact-grants` · `--with-attachments` · `--mirror` · `-o <file.dog>` · `--key <pubkey \| url>` | `POST /api/export` — one streamed body, under an operation grant (§5.2) · `GET /a/<sha256>` for attachments | the verify block of §5.6, then the paths written | 0 · 1 · 3 |
| `import <file.dog \| file.dogl>` | `--key <pubkey \| url>` | offline verify, then `POST /api/import` — one streamed body (operation grant) | `imported <tables> tables, <rows> rows · event <id>` | 0 · 1 · 3 |
| `verify <file>` | `--key <pubkey \| url>` (optional: unpinned without it) | nothing — offline; the URL form of `--key` is the one network call | the verify block | 0 · 1 |
| `pack lint <dir \| file>` | — | nothing — offline, `@braindog/declare` | `ok <pack> <version> · <n> declarations · <checksum[0..16]>`, or one sentence per refusal | 0 · 1 |
| `pack plan <src>` | `<src>` = path · `https://…` · `git:owner/repo@ref` · Kennel id | `POST /api/planPack` (operation grant) | the diff screen of 04 §3 | 0 · 1 · 3 |
| `pack install <src>` | `--with-deps` · `--yes` | `planPack`, then `POST /api/installPack { pack, plan_hash }` | the diff, `Apply? [y/N]`, then `installed <id> <version>` | 0 · 1 · 3 |
| `pack uninstall <id>` | `--yes` | `POST /api/uninstallPack` | the RETIRES · KEEPS · DELETES block of 04 §4 | 0 · 1 · 3 |
| `rule test <id>` | `--against <raw-id \| register>` | `POST /api/ruleTest` | the dry run of 07 §6, plus `won / lost / takenBy` | 0 · 1 · 3 |
| `rule apply <id>` | `--dry` | `POST /api/ruleApply { id, dry }` | `would set <n> fields on <m> rows` / `set <n> fields on <m> rows · batch <ulid>` | 0 · 1 · 2 · 3 |
| `token create` | `--scope read,propose` · `--name <n>` | `POST /api/createToken` (operation grant) | the token, **once**, then `shown once` | 0 · 1 · 3 |
| `token list` | — | `POST /api/listTokens` (operation grant) | id · name · scope · created · last used · surface | 0 · 1 · 3 |
| `token revoke <id>` | — | `POST /api/revokeToken` (operation grant) | `revoked <id>` | 0 · 1 · 3 |
| `runner enroll` | — | `POST /auth/device` with `reach: 'runner'` | the six digits; `enrolled <host> as <label>` | 0 · 1 · 3 |
| `runner run` | `--once` | `POST /api/claimJob { wait: 20 }` · `postJobEvent` · `readCancel`; spawns `claude` | one line per job to stderr; never exits unless `--once` | 0 · 1 · 3 |
| `--version` | — | nothing | `app <date>+<sha> · format 1 · kernel <n> · primitives 1` | 0 |

Nineteen commands plus `--version`, counted: the seventeen of the first design, then `mcp` and `serve`.
`--json` puts exactly one JSON document on stdout (§4.5) and moves every progress line to stderr. `mcp` takes
no `--json`, because its stdout is the protocol. `--host` beats `BRAINDOG_HOST`, which beats `hosts.json`'s
`default`. A host is written `https://origin[/slug]`; a bare name means https, and plain http is refused
except to this machine, because the bearer would cross the network in the clear.

**Built today: `mcp`, `init` and `serve`.** The command runs from a checkout as
`node apps/cli/src/main.ts`. Until §3's bundle exists, the manifest's `bin` points at that file and the manifest
stays `private`, so `tools/release.mjs` does not offer a file npm could not run. `init` and `serve` are the
self-host's, which has no `bin` of its own and tells people to type them, so this command claims the name and
spawns the self-host for both. The agent path adds `hook start|end`, `logout`, `session`, `key add|exec` (alias
`run`), `skills sync`, `tools scan|write`, `context` and `install` (`loop/research-agent-path.md` §4.2). Each
gets its row here in the step that builds it; until then the command says it is not built yet.

Claude Code registers `mcp` once per profile, and no token appears in the line or in the file it writes:

```
claude mcp add-json braindog '{"type":"stdio","command":"node","args":["<checkout>/apps/cli/src/main.ts","mcp","--agent","claude"]}' --scope user
```

### The config file

```
$XDG_CONFIG_HOME/braindog/hosts.json          Linux, macOS; ~/.config when XDG_CONFIG_HOME is unset
%APPDATA%\braindog\hosts.json                 Windows, unless XDG_CONFIG_HOME is set
mode 0600 · written atomically (write hosts.json.tmp, rename)
```

Shape in §4.1. `BRAINDOG_TOKEN` wins over the file and is never written to it. A token is never an argument,
because argv shows in process lists and in an agent's config.

### Environment

| Variable | Read by | Means |
|---|---|---|
| `BRAINDOG_HOST` | every remote command | the host when `--host` is absent |
| `BRAINDOG_TOKEN` | every remote command | the bearer, as-is: an agent token on Cloud, the owner bearer of 33 §6 on a self-host |
| `XDG_CONFIG_HOME` | config | the directory above `braindog/hosts.json` |
| `BRAINDOG_TIMEOUT_MS` | `mcp` | the budget of one tool call, in milliseconds; 20,000 when unset or not a whole number |
| `BRAINDOG_SELFHOST` | `init`, `serve`, `dev` | the path of the self-host entry file (§5.14) |
| `BRAINDOG_DATA`, `PORT` | `init`, `serve`, `dev` | passed through to the spawned self-host, unread by the CLI |

---

## 3 · Files

```
apps/cli/
├── package.json          name braindog-cli · license Apache-2.0 · type module · bin { braindog: dist/braindog.mjs }
│                         files [dist] · engines { node: ">=24.13" } · dependencies {}
├── LICENSE               the Apache-2.0 text — a real file, exact name (31 §4 rules 3–4)
├── README.md
├── tsconfig.json         strict · verbatimModuleSyntax · erasableSyntaxOnly · noEmit
├── src/
│   ├── main.ts           ~200 lines  parseArgs, the command table, dispatch, exit codes, --version, the four error classes
│   ├── http.ts           ~220 lines  host resolution, hosts.json (0600, atomic), call() and stream(), the device flow, admin()
│   ├── dog.ts            ~360 lines  the .dogl reader, the canonical projection, hashing, verify, materialise, toDogl, mirror
│   ├── pack.ts           ~180 lines  source resolution (path · url · git · Kennel), lint, plan, install (--with-deps), uninstall, the diff screen
│   ├── runner.ts         ~240 lines  enrol, the claim loop, the claude spawn, distil(), PROMPTS from @braindog/spark/prompts
│   └── print.ts          ~120 lines  the refusal sentence, conflict and unreachable lines, tables, the verify block, the --json envelope
└── test/
    ├── mock-host.ts      a node:http server answering canned Result envelopes and a .dogl body
    ├── make-dogl.ts      materialises the fixture record (40 §5.3), exportDogl() to lines, appends a dog_sig row with a test key
    ├── fixtures/         stream-json.ndjson · refusals → sentences · the golden --json per command
    └── *.test.ts         §9
```

Six source files, counted. Published artefact: `dist/braindog.mjs`, one file, built by
`esbuild src/main.ts --bundle --platform=node --format=esm --target=node24 --banner:js='#!/usr/bin/env node'
--define:__BUILD__='"<yyyy.mm.dd>+<sha7>"' --outfile=dist/braindog.mjs`. `tsc --noEmit` type-checks; tests run
the `.ts` sources directly under Node 24.13 (`node --test`). esbuild is a devDependency only (§13 D4).

---

## 4 · Data structures

### 4.1 · `hosts.json`

```ts
type HostsFile = {
  default?: string;                                  // a key of `hosts`
  hosts: Record<string, {                            // key: 'https://brain.dog/acme' — origin + '/' + slug, no trailing slash
    token?:  { value: string; expires: string; label: string };   // login: the read+write agent token, 90 days
    runner?: { value: string; expires: string; label: string };   // runner enroll: the 90-day device grant
  }>;
};
```

Invariants a test checks: the file's mode is `0600` on POSIX; a write is a rename of a complete file; a `value`
appears in no other file, no log line, no `--json` output; an `expires` in the past makes the CLI say
`login expired for <host> — run braindog login <host>` (exit 1) before any request.

### 4.2 · The wire

```ts
// 33 §2, imported from @braindog/ports as types
type Result<T> = { ok: true; value: T; version: number }
               | { ok: false; refusals: Refusal[] }
               | { ok: false; conflict: { version: number; current: unknown; actor: string } };
type Refusal   = { code: RefusalCode; at: string; found?: unknown; wanted?: string; fix: string };

// the device flow — /auth/* routes, 33 §4; the shapes are §13 D1
type DeviceRequest = { slug?: string; reach: Reach; label: string; subject?: string };
type Reach         = 'login' | 'runner' | 'export' | 'import' | 'pack' | 'token';
type DeviceCode    = { device_code: string; user_code: string; verification_uri: string; expires_in: 600; interval: 5 };
type DevicePoll    = { pending: true; interval: number } | { token: string; expires: string; reach: Reach };

// export — POST /api/export answers 200 text/plain; charset=utf-8: the .dogl of 41 §5.10, streamed (§13 D3)
type ExportArgs  = { sections?: ('data' | 'origin' | 'governance')[]; redact_grants?: boolean };
// import — POST /api/import takes the .dogl as its body; the host hands the lines to importDogl (41 §5.11)
type ImportReply = { imported: { tables: number; rows: number; event: string } };

// packs — the Diff of 04 §3; the type is 42's, these are the fields the CLI prints
type Diff = { plan_hash: string; pack: { id: string; version: string; author: string; license: string };
              requires: { format: Check; primitives: Check; packs: (Check & { id: string })[] };
              adds: Named[]; changes: Named[]; conflicts: Named[]; seeds: number; spawns: Named[];
              calls_out: Named[]; touches: { rows_read: 0; rows_written: 0 } };
type Named = { id: string; summary: string };  type Check = { wanted: string; have: string; ok: boolean };

// rules
type RuleTest  = { register: string; total: number; matches: { seq: number; title: string; would: string[]; outside?: string }[];
                   suppressed: number; won: number; lost: number; takenBy: Record<string, number> };
type RuleApply = { dry: boolean; rows: number; fields: number; batch?: string };

// tokens
type TokenCreated = { id: string; name: string; scope: Scope; expires: string; token: string };
type TokenRow     = { id: string; name: string; scope: Scope; created_at: string; last_used_at: string | null; last_surface: string | null };

// the runner — 46 §4.7, verbatim
type Claim     = { job: Job; lease_until: string; bearer: string; mcp: { url: string; tools: string[] } };
type Idle      = { job: null; idle_ms: 1500 };
type Job       = { id: string; kind: 'triage' | 'explain' | 'propose' | 'draft'; args: Record<string, string>; seq: number;
                   claude_session: string | null; expires: string; /* …the row of 30 §1 */ };
type JobEventIn = { job_id: string; seq: number; kind: 'start' | 'say' | 'think' | 'tool' | 'out' | 'limit' | 'note' | 'end' | 'error'; body: object | null };
type Ack       = { seq: number; cancel: 0 | 1; lease_until: string };
type EndBody   = { status: 'ok' | 'needs_decision' | 'refused' | 'limit' | 'error' | 'interrupted' | 'cancelled';
                   result?: object; error?: string; claude_session?: string; turns?: number; ms?: number };
```

### 4.3 · The `.dogl`, as the CLI reads and writes it

The grammar is [41-SPEC-KERNEL](41-SPEC-KERNEL.md) §5.10's, restated only to the extent the reader and the
writer here need it. Text, UTF-8, LF, no BOM.

```ebnf
dogl      = "#dogl " digits NL { block } ;                 (* the format revision — FORMAT_VERSION, 1 at v1 *)
block     = "#table " table-name " " columns NL { row } ;   (* columns: the DDL order, comma-separated, no spaces *)
row       = json-array NL ;                                 (* the JCS array of the values, in column order — 34 §5 *)
```

| Rule | Value |
|---|---|
| Line kinds | a line beginning `#` is structure; every other line begins `[` and is a row of the current table; nothing else is legal |
| Block order | `dog_meta`, `dog_section`, `dog_manifest`; then `data`, `origin`, `governance` — within a section, the DDL order of 30 §1, which is `sqlite_master` order; `dog_sig` last, one row appended by the host that holds the signing key |
| Row order | by primary key; `entry_fts` by `id`; `dog_sig` by `key_id`; BINARY collation |
| Values | `null` · INTEGER → number · REAL → JCS number · TEXT → string · BLOB → `{"b64":"<RFC 4648 §4, padded>"}`; an INTEGER beyond ±(2⁵³ − 1) is the adapter's `INT_OUT_OF_RANGE` |
| Hash | `dog_manifest.sha256` = SHA-256 hex over the table's row lines joined by LF, no trailing LF; an empty table hashes the empty string |
| Manifest | one row per exported table except `dog_manifest` and `dog_sig` — 23 rows for a full export of a 31-table record; 25 tables travel (03 §3) |
| Signature | Ed25519 over the row lines of `dog_manifest` ordered by `table_name`, LF-joined; keys and `sig` base64url raw bytes; `key_id` = the first 16 hex of SHA-256(public key) |
| Schema | **not in the stream**. A `.dog` gets its tables from `applyMigrations` (41 §5.2), the same DDL the record has; the stream's headers are checked against it (§5.5) |
| `.dog` header | `PRAGMA application_id = 1145193761` · `PRAGMA user_version = <format>` (03 §2) |

A `.dog` and its `.dogl` carry the same rows, manifest and signature; `toDogl(.dog)` reproduces the stream byte
for byte (§9 T13–T14).

### 4.4 · Exit codes

| Code | Means | Raised when |
|---|---|---|
| 0 | ok | the command's `Result` was `ok`, or the offline check passed |
| 1 | refused | a `refusals` envelope; an offline refusal (`FORMAT_NEWER_THAN_READER`, `CHECKSUM_MISMATCH`, `SIGNATURE_INVALID`, `SCHEMA_NEWER`, `INT_OUT_OF_RANGE`); a CLI-local error (bad arguments, a file that is not a `.dog`, no self-host entry, `claude` too old) |
| 2 | conflict | a `conflict` envelope — HTTP 409 |
| 3 | unreachable | DNS, TCP, TLS, a timeout, any 5xx, a body that is not JSON, an export stream cut before `#table dog_sig` |

Four, counted, from [33-CONTRACTS](33-CONTRACTS.md) §5.

### 4.5 · The `--json` envelope

```ts
type Out<T> = { ok: true;  value: T; version?: number }                  // the host's Result, passed through
            | { ok: false; refusals: Refusal[] }                          // exit 1
            | { ok: false; conflict: { version: number; current: unknown; actor: string } }   // exit 2
            | { ok: false; error: { message: string; cause?: string } };  // exit 1 (local) or 3 (unreachable) — §13 D11

type Verified = { container: 'dog' | 'dogl'; format: number; tables: number; rows: number; manifest: 'ok';
                  signature: { valid: true; key_id: string; pinned: boolean }; produced: { at: string; by: string };
                  partial?: ('data' | 'origin' | 'governance')[] };
```

One document, stdout, then exit. `value` is the reply type of §4.2, or for the offline commands: `verify` →
`Verified`; `pack lint` → `{ pack, version, declarations, checksum }`; `export` → `{ dogl, dog, verified: Verified,
files?: { fetched: number; missing: string[] }, mirror?: { rows: number } }`.

---

## 5 · Algorithms

### 5.1 · Dispatch (`main.ts`)

1. `--version` or `-v` first: print `app ${__BUILD__} · format ${FORMAT_VERSION} · kernel ${KERNEL_MIGRATION} · primitives ${PRIMITIVES_VERSION}`; exit 0. Unbundled, `__BUILD__` is `dev+0000000`.
2. Take the leading non-flag words as the command path (`pack install`); look it up; unknown → usage to stderr, exit 1.
3. `parseArgs({ args: rest, options: { ...GLOBAL, ...command.options }, allowPositionals: true, strict: true })`; a parse error → its message and the command's usage line, exit 1.
4. `await command.run(ctx, positionals, values)` → `{ value, human }`; `emit()` prints `human` to stdout, or the `Out` envelope under `--json`; exit 0.
5. Catch by class: `Refused` → one sentence per refusal (§6), exit 1 · `Conflicted` → the conflict line, exit 2 · `Unreachable` → the unreachable line, exit 3 · anything else → `error: <message>`, exit 1. Under `--json` the same four are the envelope of §4.5.

### 5.2 · The HTTP client and the device flow (`http.ts`)

`call(host, method, args, bearer, { timeoutMs = 30_000 })`:

1. `fetch(`${origin}/api/${method}`, { method: 'POST', headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json', accept: 'application/json', 'user-agent': `braindog-cli/${__BUILD__}` }, body: JSON.stringify(args), signal: AbortSignal.timeout(timeoutMs) })`.
2. Network error or timeout → `Unreachable(host, cause)`.
3. `401` → `Refused([{ code: 'UNAUTHORIZED', at: host, fix: 'Run braindog login <host>.' }])`; the body is not read ([12-SECURITY](12-SECURITY.md) §8: a 401 says only that).
4. `409` → `Conflicted(body.conflict)`. `422`, `403`, `503` → `Refused(body.refusals)`. Any other non-2xx, or a body that is not JSON → `Unreachable`.
5. `200` → return `body.value`, remembering `body.version` for the envelope.

No retries: a failed call is reported once (`ponytail:` §10). `stream(host, method, args, bearer)` is `call()`
returning `res.body` unparsed, `timeoutMs = 600_000`; `send(host, method, body: ReadableStream, bearer)` is the
mirror — `fetch(…, { body, duplex: 'half', headers: { 'content-type': 'text/plain; charset=utf-8' } })` — and
parses the `Result` that comes back.

`device(host, request, onCode)` — RFC 8628 over the `Result` envelope:

1. `POST ${origin}/auth/device` with `{ slug, reach, label: `${os.hostname()} · braindog-cli ${__BUILD__}`, subject }` → `DeviceCode`. `slug` is the host's path segment; absent, the self-host's only record.
2. Refuse a `verification_uri` whose origin differs from the host's — a phished approval page is the one thing this flow must never print.
3. `onCode(code)` prints to stderr: `Open ${verification_uri} and enter  ${user_code.slice(0,3)} ${user_code.slice(3)}   (10 minutes)`.
4. Every `interval` seconds until `expires_in` has elapsed: `POST /auth/device/token { device_code }`. `pending` → sleep the reply's `interval` (so a slow-down is obeyed). A token → return it. A refusal (`DEVICE_CODE_EXPIRED`, `DEVICE_CODE_TRIES`) → `Refused`. `expires_in` elapsed with no answer → `Refused([DEVICE_CODE_EXPIRED])`.

`admin(host, method, args, reach, subject)` — how a CLI reaches an ADMIN method without an admin token (§13 D1):

1. Call with the stored bearer (`BRAINDOG_TOKEN`, else `hosts[host].token`). A self-host owner bearer succeeds here and nothing else happens.
2. On `Refused` whose only code is `NEEDS_BROWSER_SESSION`: `device(host, { reach, subject })` — the owner approves *this operation* in the browser; the reply is a ten-minute operation grant, held in memory, never written.
3. Retry with the operation grant; keep it for the rest of the process (an `export`'s body, a `--with-deps` install's siblings). A second `NEEDS_BROWSER_SESSION` is a refusal, printed.

### 5.3 · `login <host>`

1. Parse `<host>`: `https:` required except for `localhost` and `127.0.0.1`; `origin[/slug]`; the key is the normalised string.
2. `device(host, { reach: 'login' })` — the exchange returns the `read`+`write` agent token, 90 days (33 §5).
3. `saveHost`: read `hosts.json` (or `{ hosts: {} }`), set `hosts[key].token = { value, expires, label }` and `default = key`; write `hosts.json.tmp` with `mode: 0o600`; `renameSync`.
4. Print `logged in to <key> as <label> · token expires <date>`. The token is never printed.

### 5.4 · `export`

1. Resolve host and bearer. `args = { sections, redact_grants }`; `-o` defaults to `./<slug>.dog`; the `.dogl` is written beside it with the same base name.
2. `admin(host, 'export', args, 'export', `export ${slug}${sections ? ' ' + sections.join(',') : ''}`)` as a stream; `pipeline(Readable.fromWeb(body), createWriteStream(`${base}.dogl.part`, { mode: 0o600 }))`.
3. The file must end with a `#table dog_sig …` header and one row; otherwise `Unreachable('export stream ended before dog_sig — export again')` — the record cut the stream because it changed mid-export (41 §5.10, `CHECKSUM_MISMATCH` at the host) or the network did. The `.part` is kept.
4. Rename to `${base}.dogl`; `verify()` it (§5.6). A refusal exits 1 and leaves the `.dogl` in place.
5. `materialise(`${base}.dogl`, `${base}.dog`)` (§5.5).
6. `--with-attachments`: `SELECT fields FROM entry WHERE deleted_at IS NULL`; every JSON object shaped `{ sha256: /^[0-9a-f]{64}$/, mime, bytes, name }` is a `file` value ([34-GRAMMARS](34-GRAMMARS.md) §3). `GET ${origin}/a/${sha256}`, four at a time, into `${base}.files/${sha256}` after the bytes hash to their name; a 404 goes to `missing`. The route is unauthenticated — the URL is the capability (12 §8).
7. `--mirror`: `mirror(dog, `${base}.mirror/`)` (§5.9).
8. Print the verify block, then `wrote <base>.dogl · <base>.dog[ · n files (m missing)][ · mirror n rows]`.

On a self-host the same route serves the same stream (33 §6); the CLI cannot tell which it spoke to.

### 5.5 · Materialise `.dogl` → `.dog` (`dog.ts`)

1. `rm -f ${dog}.part`; `sql = open(`${dog}.part`)` — the `node:sqlite` adapter of `@braindog/ports`; `applyMigrations(sql)` from `@braindog/kernel` — the thirty-one tables, the kernel's indexes, `register.session`, the `dog_section` rows (41 §5.2). `sql.exec('PRAGMA application_id = 1145193761')`.
2. Read lines with `readline.createInterface({ input: createReadStream(dogl), crlfDelay: Infinity })` — never `readFileSync`.
3. Line 1 must be `#dogl <n>`; `n > FORMAT_VERSION` → `FORMAT_NEWER_THAN_READER`; `n < FORMAT_VERSION` is accepted (03 §7 rule 3).
4. `#table <name> <cols>` → the table must exist in the file's schema and every named column in `PRAGMA table_info`, else `SCHEMA_NEWER` (the file was written by a newer kernel; `fix: Update braindog-cli.`); a column the DDL has and the header lacks takes its default (03 §7's additive rule). Prepare `INSERT OR REPLACE INTO <name> (<cols>) VALUES (?, …)` — `OR REPLACE` because the migration seeded `dog_meta`, `dog_section`, `counter`, `migration` and `register.session`, and the file's rows win. For `entry_fts`: `INSERT INTO entry_fts (rowid, id, register, text) SELECT rowid, ?, ?, ? FROM entry WHERE id = ?` — the rowid is looked up, because rowids are reassigned and `entry_fts.rowid = entry.rowid` (30 §1); `entry` precedes `entry_fts` in DDL order.
5. A row line → `JSON.parse`; arity must equal the header's; `{ b64 }` → `Buffer.from(b64, 'base64')`; `sql.exec(stmt, ...values)` inside `sql.transactionSync` per 1,000 rows. Twenty-four parameters at most (`event`), under the adapter's hundred.
6. After the last line: `sql.exec('PRAGMA user_version = <n>')`; close; `renameSync` to `${dog}`, mode `0600`.
7. Return `{ tables, rows }`.

Declaration indexes (`entry_i_*`, `entry_u_*`, `entry_k_*`) are not recreated: a `.dog` is a file a person
queries, and a restore is an `import` that rebuilds them (`ponytail:` §10). One pass, O(rows), O(1) memory in rows.

### 5.6 · `verify <file>` (`dog.ts`)

Offline. `--key` is a base64url raw public key, or a URL answering JSON `{ key_id, public_key }` (the well-known
key of 03 §4 — §13 D10); absent, the key inside the file is used and the result says `unpinned`. The embedded
key proves integrity; origin is `--key`'s job (41 §5.11 step 3).

**On a `.dog`:**

1. `sql = open(path)`; nothing is written. `PRAGMA application_id` ≠ 1145193761 → local error `not a .dog file` (exit 1, no code). `PRAGMA user_version` > `FORMAT_VERSION` → `FORMAT_NEWER_THAN_READER`.
2. Read `dog_meta`, `dog_section`, `dog_manifest`, `dog_sig`, and `record.id`. `dog_sig` must hold exactly one row, else `SIGNATURE_INVALID`.
3. For every `dog_manifest` row: `project(sql, table)` (§5.7) into an incremental `createHash('sha256')`, counting rows; a differing hash or count → `CHECKSUM_MISMATCH at <table>`. Every table is checked; every mismatch is reported.
4. Signed bytes = `project(sql, 'dog_manifest')` joined by LF. Key = `--key` or `dog_sig.public_key`; recompute `key_id`; a mismatch with `dog_sig.key_id` → `SIGNATURE_INVALID`. `crypto.subtle.importKey('raw', key, { name: 'Ed25519' }, false, ['verify'])`; `crypto.subtle.verify('Ed25519', k, sig, bytes)` false → `SIGNATURE_INVALID`.
5. Every `dog_section` row with `section ≠ 'local'` and no manifest row marks the file `partial`; the sections present are reported.
6. Print, or throw `Refused` with every refusal collected.

**On a `.dogl`:** one streaming pass. Line 1 is the format; the `dog_manifest` block arrives third, so every later
`#table` block is hashed and counted against a manifest row already in hand; `dog_sig` arrives last; then steps
3–5 run. Memory is O(tables).

```
  ✓ application_id  DOG!            ✓ format 1
  ✓ 25 tables, 3,118 rows           ✓ manifest hashes match
  ✓ signature valid                 produced 2026-08-31T15:04:11Z by rec_01J…
```

The first cell reads `✓ dogl` for the text container; `signature valid (key from the file — pass --key to
pin)` when unpinned; `partial: governance` on a sectioned export. `25 tables` is the manifest's row count plus
the two it cannot hold; `3,118 rows` is the manifest's sum; `produced` is `dog_sig.signed_at` and `record.id`.

### 5.7 · The canonical projection (`project`, `toDogl`)

1. `cols = PRAGMA table_info(<t>)` ordered by `cid`; `order = cols where pk > 0 ordered by pk`, else `id` for `entry_fts`, `key_id` for `dog_sig` (41 §5.10).
2. `sql.exec(`SELECT <cols> FROM <t> ORDER BY <order>`)` — the adapter refuses an INTEGER beyond 2⁵³ − 1 (`INT_OUT_OF_RANGE`, 30 §13).
3. Per row: a `Uint8Array` → `{ b64: Buffer.from(v).toString('base64') }`; then `JSON.stringify(values)` — for an array of scalars and one-key objects this *is* the RFC 8785 form, so no JCS code exists here.
4. Yield the line. `hashLines` updates SHA-256 with each line and a LF between lines.

`toDogl(dog)` yields `#dogl <user_version>`, then one block per travelling table in the order of §4.3
(`dog_section` rank, then `sqlite_master.rowid`, which is DDL order), each with its `#table <name> <cols>`
header from `table_info` and its rows from `project`. The record's `exportDogl` (41 §5.10) emits the same
bytes; T13 is the proof, and the interface-agreement audit reconciles any drift between the two.

### 5.8 · `import <file>`

1. `verify(file, key)` — a refusal stops here. Nothing has left the machine.
2. `lines = file.endsWith('.dog') ? toDogl(file) : readLines(file)`, as a `ReadableStream`.
3. `admin(host, 'import', lines, 'import', `import ${record_slug} (${rows} rows)`)` through `send()` — one body, `text/plain`. The host reads it whole and calls `importDogl(lines, ctx)` (41 §5.11): `IMPORT_NOT_EMPTY`, `FORMAT_NEWER_THAN_READER`, `CHECKSUM_MISMATCH`, `SIGNATURE_INVALID`, `SCHEMA_NEWER` come back as refusals, and a refused or cut import writes nothing (41 §5.11 step 6).
4. Print `imported <tables> tables, <rows> rows · event <id>`. The record rebuilds `entry_fts` and writes the one `import` event; the CLI does neither.

### 5.9 · `--mirror` (`mirror`)

1. Read active register declarations: `SELECT id, body FROM declaration WHERE kind = 'register' AND superseded_at IS NULL AND retired = 0`; `body.title` names the title field; `body.fields[]` give ids and types in declared order.
2. `<dir>/README.md`: the record's name and slug, `dog_meta.created_at`, one line per register with its live row count.
3. `<dir>/<register>/README.md`: `| # | title | state | updated |`, live rows by `seq`.
4. `<dir>/<register>/<seq>.md`: `# <register>#<seq> · <title>`; a `| field | value |` table of the non-`document` fields in declared order; then `## <field>` and the verbatim text for each `document` field — the dialect is already markdown, so it is written, not rendered.
5. Values: `money` → `<currency> <amount / 10^d>` with `d = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits`; `list<T>` joined by `, `; `file` → `<name> (<bytes> B)`; `secret` → `grant <id>`; `ref` → the target's `<register>#<seq>` by one `SELECT register, seq FROM entry WHERE id = ?`; `bool` → `yes`/`no`; everything else verbatim; a missing value → `—`.
6. Deleted rows are skipped; `local` tables are not in the file; `grant.ciphertext` is not a register and never reaches the mirror.

### 5.10 · `pack lint | plan | install | uninstall` (`pack.ts`)

`loadSource(ref)`, in order of test: an existing path → its `*.pack.yaml`, or a directory read recursively for
`*.yaml|*.yml` with exactly one `*.pack.yaml` (04 §2); `https://` → one fetched file; `git:owner/repo@ref` →
`git clone --depth 1 --branch <ref> https://github.com/owner/repo` into `os.tmpdir()`, then the directory rule;
a bare id matching `^[a-z][a-z0-9-]{1,63}$` → `https://kennel.brain.dog/p/<id>` (04 §3); anything else → local error.

`lint`: `parsePack(files)` then `lintPack(pack)` from `@braindog/declare` (§11); refusals print with
`declarations[i]` rewritten to that declaration's `kind.id`; none → `ok <pack> <version> · <n> declarations ·
<packChecksum(pack).slice(0, 16)>`. Offline: `declare` imports no database (31 §2).

`install <src> [--with-deps] [--yes]`:

1. `loadSource`, `lint` — a lint refusal never reaches the host.
2. `diff = admin(host, 'planPack', { pack }, 'pack', `install ${id} ${version}`)`.
3. `DEPENDENCY_UNRESOLVED` refusals with `--with-deps`: for each `at` of the form `requires.packs.<id>`, run these steps for the Kennel id `<id>` first (depth ≤ 8; a repeated id is a local error naming the cycle), then re-plan the parent under the same operation grant. Without `--with-deps` the refusal prints with its own fix (04 §5).
4. Print `renderDiff(diff)` — the screen of 04 §3: the header line, the two `requires` lines with `ok` or the failing check, then `ADDS · CHANGES (shown, not applied) · CONFLICTS · SEEDS · SPAWNS · CALLS OUT · TOUCHES`, each `Named.summary` as the host rendered it.
5. `Apply? [y/N]`: `--yes` skips it; stdin not a TTY and no `--yes` → local error `pass --yes when stdin is not a terminal`; anything but `y` → `not applied`, exit 0.
6. `admin(host, 'installPack', { pack, plan_hash })`. `PLAN_STALE` → re-plan once, re-print, re-ask (04 §3 property 3); a second `PLAN_STALE` prints.
7. `installed <id> <version> · <n> declarations`.

`plan` is steps 1–4. `uninstall <id> [--yes]` asks once, calls `uninstallPack { id }`, prints
`RETIRES <n> declarations · KEEPS <rows> in <register>… · DELETES nothing` (04 §4).

### 5.11 · `rule test` · `rule apply`

`rule test <id> --against <x>`: `x` a 26-char ULID → `{ raw: x }`; a register id → `{ register: x }`; else
absent. `call(host, 'ruleTest', { id, against })` → 07 §6's block: `matches <n> of <total> rows in
register.<r>`, one line per row (`#<seq> <title> <would…>` or `— <outside>`), `once_per would suppress <k> of
<n>`, then `won <w> · lost <l> · takenBy rule.<id> <n>…`.

`rule apply <id> [--dry]`: `call(host, 'ruleApply', { id, dry })` → `--dry`: `would set <fields> fields on
<rows> rows`; without: `set <fields> fields on <rows> rows · batch <ulid>` — one `event.batch` for the run, so
the undo is one query (07 §6.1); the dry run is the undo by design.

### 5.12 · `token create | list | revoke`

`create --scope read,propose --name <n>`: the scope list collapses to the ladder's top (`write` > `propose` >
`read`, 30 §10); `admin(host, 'createToken', { scope, name }, 'token', `create token ${name} (${scope})`)`;
print `token <id> · <name> · <scope> · expires <date>`, a blank line, the token, then `shown once`. `list` and
`revoke` are `listTokens {}` and `revokeToken { id }` under the same reach.

### 5.13 · `runner enroll` · `runner run` (`runner.ts`)

`enroll`: `execFileSync('claude', ['--version'])` must parse to ≥ `2.1.248` (26 §5) — below it, or absent, a
local error; then `device(host, { reach: 'runner' })`; `hosts[key].runner = { value, expires, label }`.

`run [--once]` — the pull loop of 33 §11 and 46 §5 *Hold*, one job at a time:

1. Version gate as above, at start and before every job.
2. **Wait:** `call(host, 'claimJob', { wait: 20 }, runner, { timeoutMs: 30_000 })` — wait + 10 s, because `fetch` has no timeout of its own. `Idle` → sleep `idle_ms`, doubling on consecutive empties to 30,000 (46 §5); a `Claim` → step 3; `Unreachable` → one line, sleep 30 s, poll again.
3. **Check:** `job.kind` must be one of the four and a key of `PROMPTS`, else post `error { unknown_kind }` then `end { status: 'refused' }` — a compromised host cannot invent a fifth job (26 §4.3). Every `args` value ≤ 64 bytes and without whitespace, the record's own rule (46 §5 *Create*), else the same refusal. Every `mcp.tools` entry must start `mcp__braindog__`, else the same — the job bearer is `read`+`propose`, and no other tool is ever allowed.
4. **Prepare:** `dir = mkdtemp('braindog-job-')`, empty; `mcp.json` (mode 0600): `{ mcpServers: { braindog: { type: 'http', url: new URL(mcp.url, origin).href, headers: { Authorization: `Bearer ${bearer}` } } } }`; `schema.json` = `PROMPTS[kind].schema`; `prompt` = `PROMPTS[kind].system + '\n\n' + user` with each `%SLOT%` replaced once by `args[slot]`, never re-scanned (46 §4.5).
5. **Spawn:** `spawn('claude', ['--restricted', '-p', prompt, '--output-format', 'stream-json', '--json-schema', schemaPath, '--strict-mcp-config', '--mcp-config', mcpPath, '--allowedTools', mcp.tools.join(','), '--permission-mode', 'dontAsk', '--max-turns', '12', '--disable-slash-commands', ...(job.claude_session ? ['--resume', job.claude_session] : [])], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] })`. Never `--bare`; never `--dangerously-skip-permissions`.
6. **Distil:** each stdout line → `distil(line)` → at most one event (table below), `seq` from `job.seq + 1`; `call(host, 'postJobEvent', ev, runner)` → `Ack`. `cancel = 1` → `child.kill('SIGTERM')`, post `end { status: 'cancelled' }`, stop.
7. **Heartbeat:** 20 s without an event → `call(host, 'readCancel', { job_id }, runner)`; the reply renews the 60-second lease and carries `cancel` (46 §5 *Renew*).
8. **Finish:** exit 0 with a `result` line → `end` with `EndBody`: `status` from the result's own `status` field, `limit` on `error_max_turns`, `error` on another `error_*`, `needs_decision` when the result names a decision — the laptop never decides (26 §5); `claude_session` from the `init` line; `turns`, `ms` from the result. Exit 143 → `end { status: 'interrupted' }`. `dir` and `mcp.json` are removed in `finally`.
9. `--once` returns after one job; otherwise back to step 2.

| stream-json line | event | body |
|---|---|---|
| `type: system, subtype: init` | `start` | `{ model, session_id, tools: n }` |
| `type: assistant`, a `text` part | `say` | `{ text: head(2000), len }` |
| `type: assistant`, a `thinking` part | `think` | `{ text: head(500), len }` |
| `type: assistant`, a `tool_use` part | `tool` | `{ name, input: head(2000), len }` |
| `type: user`, a `tool_result` part | `out` | `{ text: head(2000), len }` — the fold names both lengths (18 §6) |
| `type: result, subtype: error_max_turns` | `limit` | `{ turns }` |
| `type: result, subtype: success` | `end` | `EndBody` — cost is effort, never money (26 §5) |
| `type: result`, another `error_*` | `error` | `{ subtype, message }` |
| the runner's own | `note` | `{ text }` — version gate, cancel seen, a line type the table does not name |

Nine kinds, the `job_event.kind` CHECK. The raw stream is never relayed (26 §5).

### 5.14 · `init <slug>` · `dev` (spawn the self-host)

1. `entry = process.env.BRAINDOG_SELFHOST ?? resolve(import.meta.dirname, '../../selfhost/src/main.ts')` when that file exists (a repository checkout); otherwise a local error: `braindog init needs the self-host — set BRAINDOG_SELFHOST to its entry file`.
2. `spawn(process.execPath, [entry, 'init', slug], { stdio: 'inherit', env: process.env })` — or `[entry, 'dev', '--port', port]`.
3. Forward `SIGINT` and `SIGTERM` to the child; exit with its code.

The self-host's `init <slug>` creates `<data>/<slug>/record.dog`, runs migration 0001 and writes the owner
into the Directory; its `dev` runs the process against a scratch data dir with the memory ports (33 §5). Both
are [49-SPEC-SELFHOST](49-SPEC-SELFHOST.md)'s to implement (§13 D5).

---

## 6 · Refusals and errors

**One sentence per refusal** ([30-BLUEPRINT](30-BLUEPRINT.md) §6, the CLI row):

```
<at> ['<found>'] — <fix with its first letter lower-cased>
```

`at` has a leading `declarations[<i>]` replaced by that declaration's `kind.id` when the CLI holds the pack
(`lint`, `plan`, `install`). So `{ code: 'FIELD_TYPE_UNKNOWN', at: 'declarations[3].fields[4].type',
found: 'currency', fix: "Did you mean 'money'?" }` prints as
`register.invoices.fields[4].type 'currency' — did you mean 'money'?`. The code travels only in `--json`.

| Situation | Rendering | Exit |
|---|---|---|
| `refusals` from the host | one line each, every code of 30 §6 passed through unchanged | 1 |
| `UNAUTHORIZED` | `<host> — run braindog login <host>.` | 1 |
| `NEEDS_BROWSER_SESSION` | never printed on the first occurrence — it starts the approval of §5.2; printed if the approval also fails | 1 |
| `PLAN_STALE` | re-planned once (§5.10); printed on the second | 1 |
| `conflict` (409) | `<register>#<seq> was changed by <actor> — now version <n>; re-read and re-apply.` | 2 |
| unreachable | `<host> unreachable — <cause>`: `ECONNREFUSED` · `ENOTFOUND` · `timeout after 30 s` · `HTTP 502` · `export stream ended before dog_sig — export again` | 3 |
| `SCHEMA_MISMATCH` · `SCHEMA_NEWER` (503) | the host's sentence | 1 |
| local error | `error: <message>` — no code; `--json` uses the `error` variant | 1 |

**Codes the CLI raises itself**, offline, each with the `fix` a person reads:

| Code | `at` · `found` | `fix` |
|---|---|---|
| `FORMAT_NEWER_THAN_READER` | `user_version` · the file's | `Update braindog-cli; this file was written by a newer format.` |
| `SCHEMA_NEWER` | `<table>.<column>` · the header's column | `Update braindog-cli; this file was written by a newer kernel.` |
| `CHECKSUM_MISMATCH` | `<table>` · the recomputed hash | `The rows of <table> changed after signing; do not trust this file.` |
| `SIGNATURE_INVALID` | `dog_sig` · `key_id` | `The signature does not verify against key <key_id>; the file was altered or not produced by that instance.` |
| `DEVICE_CODE_EXPIRED` | `device_code` | `The code lived ten minutes; run the command again.` |

Five, counted — four of 30 §6's format and lifecycle codes, one auth code, raised here only when the host never
answered within `expires_in`. `INT_OUT_OF_RANGE` is the adapter's and passes through. Everything else the CLI
refuses locally — a file that is not a `.dog`, a malformed `.dogl` line, an unreadable `hosts.json`, no
self-host entry, `git` or `claude` missing or old, `--yes` needed, an unknown flag — is an **error**, not a
refusal: a sentence, exit 1, no code, because the only codes are the corpus's.

---

## 7 · Performance budget

| Measure | Budget | How measured |
|---|---|---|
| `braindog --version` wall time | ≤ 120 ms p95 | T22 spawns `dist/braindog.mjs` 10× on the CI runner |
| `dist/braindog.mjs` size | ≤ 400 KB | `stat` after build, in `ci.yml` |
| `.dogl` → `.dog`, 100 MB / 300,000 rows | ≤ 30 s | T17, nightly, a generated `.dogl` |
| `verify` of that `.dog` · that `.dogl` | ≤ 15 s · ≤ 10 s | T17 |
| Peak RSS during export or verify | ≤ 300 MB | T17 reads `process.memoryUsage().rss` of the child — streaming only, never a whole file in memory |
| HTTP call timeout | 30 s; export and import bodies 600 s | `AbortSignal.timeout` |
| Import body | one request, ≤ 100 MB — the Worker's request ceiling; the record reads it whole (41 §5.11) | `ponytail:` §10 |
| Device poll | every 5 s (the reply's `interval`), ten minutes | §5.2 |
| Runner claim | `wait: 20`, abort at 30 s; `idle_ms` 1,500 → 30,000 | §5.13 |
| Attachment fetch | 4 concurrent | §5.4 step 6 |

Startup has nothing to load but one file: no dependency resolution, no `node_modules` walk.

---

## 8 · Security

| Boundary | Rule |
|---|---|
| `hosts.json` | mode `0600`, atomic rename, in the user's config dir; a token value appears nowhere else on disk. On Windows the mode is a no-op and the file inherits the profile's ACL (`ponytail:` §10) |
| Tokens on the wire | only in `Authorization: Bearer`; `https:` required except loopback; never in a URL, a log line, an error, or `--json` — except the new token's value at `token create`, once, by design |
| Operation grants | ten minutes, one command, held in memory, never written; approved by the owner in a browser for the named subject (§13 D1). A stolen `hosts.json` can read and write rows at the token's scope; it cannot export, import, install or mint |
| The approval page | the CLI prints `verification_uri` only when its origin equals the host's |
| `verify` | no network: the file, the key, WebCrypto. `--key <url>` is the one explicit fetch |
| `export` · `import` | the `.dogl` is verified after it arrives and before it is sent; the `.dog` and `.dogl` are written `0600` — they carry the whole record with its sealed grants (03 §5) |
| Attachments | bytes are hashed before they are written under their name; the content address is the check |
| The runner | `--restricted`, `--permission-mode dontAsk`, `--strict-mcp-config`, an empty working directory it owns, the closed kind list and the 64-byte no-whitespace arg rule, the `mcp__braindog__` tool filter, the version gate, the job bearer only inside a `0600` `mcp.json` deleted after the job; never `--bare`, never `--dangerously-skip-permissions` (26 §4.4: one flag turns on [C]). The dedicated unix user and the hardened systemd unit of 26 §5 are the operator's ([53-SPEC-OPERATIONS](53-SPEC-OPERATIONS.md)) |
| Logging | a line names a host, a command, a code, a count — never a token, a row, a grant, a prompt (12 §8) |
| Input | `parseArgs` in strict mode; a `.dogl` line that is neither `#…` nor a JSON array is an error; the only DDL a `.dog` build runs is the kernel's own |

---

## 9 · Tests and gates

`test/**/*.test.ts`, `node --test`, `node:assert/strict`; the mock host is an in-process `node:http` server
answering canned `Result` envelopes (35 §2). No `.dogl` is committed (40 §1): `make-dogl.ts` materialises the
fixture record through 40 §5.3's materialiser, runs `exportDogl` to lines, and appends the `dog_sig` row with a
test Ed25519 key held in `test/`. Golden files are compared as parsed JSON.

| # | Case | Input → expected |
|---|---|---|
| T1 | `--version` | → `app dev+0000000 · format 1 · kernel 1 · primitives 1`, exit 0 |
| T2 | unknown command · unknown flag | `braindog frob` · `export --bogus` → usage on stderr, exit 1 |
| T3 | refusal sentence | 30 §6's `FIELD_TYPE_UNKNOWN` object → `register.invoices.fields[4].type 'currency' — did you mean 'money'?` |
| T4 | golden `--json`, every command | mock host answers the fixture reply → stdout equals `golden/<command>.json`. Seventeen commands |
| T5 | exit codes | mock answers `ok` · `422` · `409` · closed socket → 0 · 1 · 2 · 3, for `rule apply` |
| T6 | `login` approved | poll → pending, pending, token → `hosts.json` holds it, `default` set, mode `0600` (POSIX only), the token absent from stdout and stderr |
| T7 | `login` expired · denied · foreign URI | `DEVICE_CODE_EXPIRED` → exit 1 · `DEVICE_CODE_TRIES` → exit 1 · `verification_uri` on another origin → refused before printing |
| T8 | env precedence | `--host` beats `BRAINDOG_HOST` beats `default`; `BRAINDOG_TOKEN` beats the file and is never written |
| T9 | `admin()` | first call `403 NEEDS_BROWSER_SESSION` → device flow → retry succeeds; second `403` → printed, exit 1; owner bearer → no device flow |
| T10 | `verify` accepts | the generated `seed.dogl` and its `.dog` with `--key` → the block, exit 0; without `--key` → `pinned: false` |
| T11 | `verify` refuses | one byte appended to the first `entry` line (40 §6's `tamper: row`) → `CHECKSUM_MISMATCH at entry`; a flipped `sig` byte → `SIGNATURE_INVALID`; `#dogl 2` → `FORMAT_NEWER_THAN_READER`; a header naming an unknown column → `SCHEMA_NEWER`; a plain SQLite file → `error: not a .dog file`; each exit 1 |
| T12 | `verify` partial | a `--sections governance` export → `partial: ['governance']`, exit 0 |
| T13 | round trip | `seed.dogl` → `materialise` → `toDogl` → bytes equal the input |
| T14 | round trip, property | fast-check 4.9.0: random `Param` values (text with `|`, quotes, unicode, CR/LF; blobs; nulls; integers to ±2⁵³ − 1) written into `entry.fields`, `event.note`, `entry_vec.vec` and `grant.ciphertext` of a materialised record → `exportDogl` → `materialise` → `toDogl` identical; 200 runs; failing `{ seed, path }` committed under `test/seeds/` |
| T15 | export | mock streams `seed.dogl` → `.dogl` and `.dog` written, verify block printed; stream cut before `dog_sig` → exit 3, `.part` kept |
| T16 | import | `seed.dog` → one `text/plain` body whose bytes equal `seed.dogl`; the mock's `IMPORT_NOT_EMPTY` → exit 1; a tampered file → refused locally, no request made |
| T17 | 100 MB, nightly | generated `.dogl` → the numbers of §7 |
| T18 | `pack lint` | every fixture under `fixtures/refusals/` of the 33 pack codes → the expected sentence; a clean pack → `ok`, checksum matches `packChecksum` |
| T19 | `pack install` | diff printed; `n` → `not applied`, exit 0; `--yes` → `installPack` called with the diff's `plan_hash`; `PLAN_STALE` once → re-planned; `--with-deps` → `people` planned and installed before the parent; non-TTY without `--yes` → exit 1 |
| T20 | runner distil | `stream-json.ndjson` (nine line types) → the nine expected events, `seq` 1..n, `out.len` = the untruncated length |
| T21 | runner loop | mock claim → job → a stub `claude` on PATH → events posted in order, `end` carries `claude_session`; `cancel: 1` on an ack → SIGTERM sent, `end { cancelled }`; stub exits 143 → `end { interrupted }`; kind `frob`, an arg with a space, or `Bash` in `mcp.tools` → `error`, `end { refused }`, `claude` never spawned; `--version` 2.1.200 → local error |
| T22 | startup | 10 spawns of `dist/braindog.mjs --version` → p95 ≤ 120 ms |
| T23 | `--mirror` | `seed.dog` → `README.md`, one directory per register, one file per live row, deleted rows absent, a `money` value rendered `EGP 1,299.00`-style |
| T24 | attachments | two `file` values, one served, one 404 → one file written under its hash, `missing: [sha]` |

Twenty-four, counted. CI rows ([33-CONTRACTS](33-CONTRACTS.md) §8): `ci.yml` runs T1–T16, T18–T24 on every
push and T17 nightly; `gates.yml`'s `licence-closure` runs `npm pack --dry-run --json` on `apps/cli` — only
`dist/braindog.mjs`, `LICENSE`, `README.md`, `package.json`; `dependencies` empty; the bundle contains no
`@braindog/` and no `../../`; `LICENSE` starts with the Apache-2.0 words (31 §4 rule 8); `graph` asserts the six
imports of §1 point down the order; `release.yml` builds and publishes through trusted publishing, `0.0.1` by
hand first (31 §6).

---

## 10 · Deliberate ceilings

- `ponytail:` the runner long-polls `claimJob { wait: 20 }` only; the `GET /ws/runner` socket and the frames of 46 §4.7 attach when the Worker exposes the route (Cloud only, 46 §13 #8) — the loop does not change.
- `ponytail:` one browser approval per ADMIN command on Cloud; unattended Cloud export or install is ADR-060's signed single-use plan hash, not a stored scope — add when a customer scripts it.
- `ponytail:` `import` is one request body, so a record above the host's request ceiling (100 MB on the Worker) cannot move through the CLI until 41 pages `importDogl`; a self-host has no such ceiling.
- `ponytail:` a CLI-built `.dog` carries the kernel's indexes, not the declarations' (`entry_i_*`); `import` recreates them. Add `kernel.rebuildIndexes` here when someone opens such a file live.
- `ponytail:` no HTTP retries outside the runner loop; add a bounded retry on `Unreachable` if flaky networks show up in bug reports.
- `ponytail:` `export --with-grants` (03 §5) is not a v1 flag — a passphrase re-wrap is a Worker act; add when the vault passphrase ships.
- `ponytail:` `pack install --force` for a downgrade that orphans rows (04 §5) is not a v1 flag; the record refuses the downgrade until the code exists.
- `ponytail:` the paste source of 04 §3 is the app's; the CLI takes a path, a URL, a `git:` ref or a Kennel id.
- `ponytail:` `git:` means GitHub over `git clone --depth 1` with `git` on PATH; other forges when asked.
- `ponytail:` the Kennel is one fixed URL pattern, `https://kennel.brain.dog/p/<id>`; no search, no index cache.
- `ponytail:` the `.dogl` stays beside the `.dog` after export; add `--dogl-only` when disk matters.
- `ponytail:` attachments fetch four at a time with no resume; a re-run skips files whose hash matches.
- `ponytail:` the mirror writes markdown with plain values and verbatim `document` fields; no HTML, no `braindog-render`; add `--mirror-html` through `toHTML` when a browser-readable mirror is asked for.
- `ponytail:` `--json` is one document at exit; no streaming progress protocol.
- `ponytail:` `hosts.json`'s `0600` is a no-op on Windows; an `icacls` call if a Windows report shows another user reading it.
- `ponytail:` `init` and `dev` need `BRAINDOG_SELFHOST` outside a checkout; a published self-host binary would let the CLI find it.
- `ponytail:` no `--model` on the runner; the customer's subscription and the `claude` default decide.
- `ponytail:` no colour, no TTY detection, `✓` and `✗` always; `--json` is the machine surface.

Eighteen, counted.

---

## 11 · Dependencies

| Kind | Package | Version | Why |
|---|---|---|---|
| runtime | — | — | none. `dependencies: {}`; the licence-closure gate asserts it |
| workspace | `@braindog/render` | `workspace:*` | `PRIMITIVES_VERSION` (36 §2) |
| workspace | `@braindog/ports` | `workspace:*` | `Result`, `Refusal`, `RefusalCode` types; `open(path)` — the `node:sqlite` adapter (37; 40 §5.3) |
| workspace | `@braindog/where` | `workspace:*` | transitively, through `declare` (38) |
| workspace | `@braindog/kernel` | `workspace:*` | `FORMAT_VERSION`, `KERNEL_MIGRATION`, `applyMigrations(sql)` (41 §2) |
| workspace | `@braindog/declare` | `workspace:*` | `parsePack(files: { path: string; text: string }[]): { pack?: Pack; refusals: Refusal[] }` · `lintPack(pack: Pack): Refusal[]` · `packChecksum(pack: Pack): string` (42) |
| workspace | `@braindog/spark` | `workspace:*` | `PROMPTS` from the `./prompts` subpath — data only, no imports (46 §2, §3) |
| dev | `typescript` | 6.0.3 | `tsc --noEmit` (31 §3) |
| dev | `esbuild` | pinned in `pnpm-workspace.yaml`'s catalog at first add — read from the registry, not from memory (31 §3's rule) | the one-file bundle (31 §8) |
| dev | `fast-check` | 4.9.0 | T14 (35 §2) |

Workspace packages are bundled into `dist/braindog.mjs` at build; esbuild tree-shakes `kernel` to its constants
and `applyMigrations`, and `spark` to `prompts.ts`. A runtime import is a new ADR ([ADR-046](16-DECISIONS.md)).

---

## 12 · Build order

Position 12 of [31-STACK](31-STACK.md) §2, after `record` ([35-SPEC-OVERVIEW](35-SPEC-OVERVIEW.md) §4).

| Needs first | For |
|---|---|
| 36 `render` | `PRIMITIVES_VERSION` |
| 37 `ports` | the envelope types; the `node:sqlite` adapter; the `Result` shape the mock host speaks |
| 40 `fixtures` · 41 `kernel` | the materialiser of 40 §5.3 and `exportDogl` produce the test `.dogl`; `applyMigrations` builds the `.dog`; 41 §5.10 owns the grammar |
| 42 `declare` | `parsePack`, `lintPack`, `packChecksum` |
| 45 `record` | the methods of §2; `export` and `import` as the routes carry them |
| 46 `spark` | `PROMPTS`; the `Claim` · `Ack` · `EndBody` protocol the runner speaks |

| Unblocks | How |
|---|---|
| 49 `selfhost` | the `init <slug>` and `dev` subcommand contract of §5.14; the `/api/export` and `/api/import` bodies it serves |
| 51 `worker` | the routes of §13 D1, D3, D9 the Worker must answer |
| 52 testing | `dog-roundtrip` runs through `materialise` and `toDogl`; the `licence-closure` row for `braindog-cli` |
| 53 operations | restore = `braindog import` into a fresh record; key rotation = `verify --key <url>` |

---

## 13 · Decisions taken here

Fourteen, counted. Each names the design document to amend in the same revision (35 §1).

**D1 · Operation grants: how the CLI reaches ADMIN without an admin token.** `braindog login` yields the
`read`+`write` agent token 33 §5 states, and that token cannot reach ADMIN (30 §5, ADR-060). So every
ADMIN command — `export`, `import`, `pack plan|install|uninstall`, `token create|list|revoke` — runs the same
RFC 8628 flow with a `reach` naming the command and a `subject` the approver reads; the owner approves *that
operation* from a browser session, and the exchange returns a ten-minute **operation grant** the CLI holds in
memory. This is the "device grant approved in the browser" ADR-060 already names for the install path,
generalised to the other owner acts; ADR-060 stays literally true — no token row has an admin scope, and a
stolen `hosts.json` cannot export or install. Wire: `POST /auth/device { slug?, reach, label, subject? }` and
`POST /auth/device/token { device_code }`, `Result` envelopes (§4.2). Storage: `device_grant` gains
`reach TEXT NOT NULL CHECK (reach IN ('login','runner','export','import','pack','token'))`; a `login` exchange
mints the `token` row and leaves the grant row as the approval's audit; a `runner` exchange returns the 90-day
bearer of 12 §6.1; the four operation reaches return a bearer whose hash sits in `token_hash` with `expires`
left at the code's ten minutes. The Worker resolves an operation bearer to the approver's person principal with
`ctx.op = reach`, and the ADMIN group admits a person principal whose `ctx.op` names the method's command. A
self-host's `BRAINDOG_TOKEN` is the owner bearer and needs no approval (30 §10). *Amend:* 33 §2
(`CallContext.op?: Reach`), 33 §4 (the two `/auth/device` routes; ADMIN admits an operation grant), 33 §5,
30 §1 (`device_grant.reach`), 30 §5 and §10 (one row: operation grant → the approver, one command, ten
minutes), 12 §6.1, ADR-060 (an addendum, not a reversal).

**D2 · The `.dogl` is 41 §5.10's, and the CLI adds only what a file needs.** The grammar (`#dogl`, `#table
name cols`, manifest before data, `dog_sig` last) is the kernel's; the CLI's own decisions are: the `.dog`'s
schema comes from `applyMigrations`, never from the stream; rows land with `INSERT OR REPLACE` so the
migration's seed rows yield to the file's; a header naming a column the DDL lacks is `SCHEMA_NEWER`;
declaration indexes are not recreated; `entry_fts` rows are re-keyed by rowid lookup. *Amend:* 03 §2–§3 and
33 §9 to cite 41 §5.10 as the grammar's home and `#dogl` as its magic; 34 §5 with the no-PK orderings. *Also:*
02 §1 and 32 §2.3 still list `vault_key` among seven `local` tables; 03 §3, 30 §1, 12 §8 and 41 §5.2 say six
and that `vault_key` travels sealed — fix the former two.

**D3 · `export` and `import` are each one streamed body.** `POST /api/export` answers `200 text/plain;
charset=utf-8` with the `.dogl` itself — the host pages `exportDogl(cursor)` internally and appends the signed
`dog_sig` row; a refusal is a `422` before the first byte; a mid-export `CHECKSUM_MISMATCH` (41 §5.10) cuts the
stream and the CLI reports exit 3. `POST /api/import` takes the `.dogl` as its `text/plain` body; the host
collects the lines and calls `importDogl(lines, ctx)`, which writes nothing unless everything verifies. The
request ceiling is the host's (§10). *Amend:* 33 §4 (the two routes' bodies), 33 §9 (no page protocol over
HTTP; the record's ≤ 30 × ≤ 3 batching is internal to `importDogl`).

**D4 · Bundling.** Type stripping is refused under `node_modules`, so the published artefact is JavaScript:
`esbuild` (dev only, per 31 §8) bundles `src/main.ts` into `dist/braindog.mjs` with `--platform=node
--format=esm --target=node24`; `tsc --noEmit` type-checks; `engines.node >= 24.13` because `node:sqlite` and
WebCrypto Ed25519 are the build's floor. *Amend:* 31 §3 (add the esbuild pin to the catalog, read from the
registry), 35 §2 (the build step is exactly this).

**D5 · The CLI/self-host boundary.** `init` and `dev` spawn the self-host entry with `process.execPath`; the
CLI never imports `apps/selfhost` (35 §2) and never links `packages/record`. The entry is
`BRAINDOG_SELFHOST`, or `apps/selfhost/src/main.ts` relative to a checkout. The self-host exposes `init <slug>`
and `dev [--port]` as subcommands of its entry. *Amend:* 33 §5 (the two rows say "spawns the self-host"),
33 §6; 49 implements the subcommands.

**D6 · `hosts.json` location and shape.** `$XDG_CONFIG_HOME/braindog/hosts.json`; `~/.config` when unset;
`%APPDATA%\braindog\hosts.json` on Windows unless `XDG_CONFIG_HOME` is set. Shape §4.1: `default` plus a map
whose keys are `origin/slug` and whose values hold `token` and `runner` separately. *Amend:* 33 §5.

**D7 · `--mirror` layout.** `<base>.mirror/README.md`, `<register>/README.md`, `<register>/<seq>.md`; §5.9's
value rendering; verbatim `document` fields; live rows only; no `braindog-render`. *Amend:* 33 §5, 32 §2.

**D8 · The runner, v1.** Long-poll only — 33 §11's fallback one, the socket a §10 ceiling. The protocol is
46 §4.7's verbatim: `claimJob { wait }` in the body (33 §11 wrote it as a query string), `Claim` with `bearer`
and `mcp.tools`, `Ack`, `EndBody` carrying `claude_session`, `readCancel` every 20 s as the lease's heartbeat.
The templates and result schema come from `@braindog/spark/prompts` (46 §2), so the runner refuses a fifth kind
by construction; `mcp.tools` is filtered to `mcp__braindog__*` before it reaches `--allowedTools`.
`--no-session-persistence` is dropped from 26 §5's invocation because it defeats `--resume <claude_session>`,
which the same section calls the most valuable column; sessions persist in the runner's own unix user's home.
*Amend:* 33 §11 (the `Wait` row: `{ wait }` in the body; v1 pulls by long-poll), 26 §5 (the invocation), ADR-044
(a note that the runner attaches to the socket when 51 exposes it).

**D9 · Methods and edges the corpus does not list.** `ruleTest({ id, against })` READ+ · `ruleApply({ id, dry })`
DATA, `write` scope unless `dry` · `createToken({ scope, name })`, `listTokens()`, `revokeToken({ id })` ADMIN.
Forty-nine methods, then — 10 · 11 · 4 · 6 · 12 · 6 — against 30 §5's forty-four. And one package edge:
`cli → spark` (12 → 11, down the order) for `prompts`. *Amend:* 30 §5 (the counts and rows), 33 §2 (the
argument objects), 33 §4 (the routes exist by the `/api/<method>` rule), 31 §2 (row 12: `1, 2, 3, 6, 7, 11`).

**D10 · `verify --key` is optional, and the key has a path.** Without `--key`, the file's own public key
verifies the signature and the output says `unpinned`; with it, the key must match `dog_sig.key_id`. The
well-known URL of 03 §4 is `GET /.well-known/braindog-key` → `{ key_id, public_key }`. *Amend:* 03 §4, 33 §4,
33 §5.

**D11 · Local errors have no code.** A CLI-local failure (bad file, missing tool, bad arguments) is an `error`
with a sentence and exit 1 (or 3 when the host is the cause), never a refusal with an invented code; `--json`
carries it as the fourth envelope variant. *Amend:* 33 §5.

**D12 · Flags not in v1.** `export --with-grants` (03 §5), `pack install --force` (04 §5), the paste source
(04 §3) — each a §10 ceiling. *Amend:* 03 §5 and 04 §3, §5 to say "CLI: later" beside each.

**D13 · `--scope` is a list on the command line and one value on the wire.** `read,propose` collapses to the
ladder's top (30 §10); the record's `token.scope` is one CHECKed value (30 §1). *Amend:* 33 §5.

**D14 · Attachments are checked by their address.** `--with-attachments` writes `<base>.files/<sha256>`;
`verify` beside such a directory hashes every file against its name and lists any referenced digest with no
file; nothing is added to the signed manifest. *Amend:* 03 §8 ("the manifest hashes the set" → "the content
address is the check").

---

## 14 · Done when

- [ ] `pnpm -F braindog-cli build` produces `dist/braindog.mjs`; `npm pack --dry-run --json` lists four files and no dependency; the bundle contains no `@braindog/` or `../../`
- [ ] `braindog --version` prints the tuple in ≤ 120 ms p95 (T22)
- [ ] T1–T24 green under `node --test`; T17 green nightly at the numbers of §7
- [ ] `login` against the mock stores a `0600` `hosts.json` and never prints the token (T6)
- [ ] `export` → `verify` → `import` round-trips the generated `seed.dogl` against the mock, and `toDogl(materialise(x)) ≡ x` byte for byte (T13, T14)
- [ ] every pack refusal fixture renders as its sentence (T18); `pack install` shows the diff, asks, applies with the `plan_hash`, and survives one `PLAN_STALE` (T19)
- [ ] the runner refuses an unknown kind, a prose argument, a foreign tool and an old `claude`; distils the fixture to nine events; honours cancel; reports `interrupted` on 143 (T20, T21)
- [ ] every `ponytail:` line of §10 appears as a comment at the place it describes
- [ ] the fourteen amendments of §13 are applied to their documents in this revision, and BUILD.md logs the iteration
- [ ] `braindog-cli@0.0.1` published by hand; trusted publishing wired for the next

---

*Previous: [47-SPEC-CONNECT](47-SPEC-CONNECT.md). Next: [49-SPEC-SELFHOST](49-SPEC-SELFHOST.md).*
