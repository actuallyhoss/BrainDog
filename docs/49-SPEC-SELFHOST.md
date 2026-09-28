# 49 · apps/selfhost — specification

One Node process that is the whole product for a self-hoster: the nine ports wired on Node, the Directory in
`directory.sqlite`, every `<slug>/record.brain` open behind the same `RecordApi` the Worker exposes, and the HTTP
surface of [33-CONTRACTS](33-CONTRACTS.md) §4 served by `node:http`. Derives from 33 §1, §4, §6, §9, §10;
[12-SECURITY](12-SECURITY.md) §3, §6, §8; [30-BLUEPRINT](30-BLUEPRINT.md) §5, §8, §13; [22-FRONTEND](22-FRONTEND.md)
§5, §9; [26-BYO-INTELLIGENCE](26-BYO-INTELLIGENCE.md) §2, §5; [09-ALARMS](09-ALARMS-AND-NOTIFICATIONS.md) §1. Built
in phase 2 of [BUILD.md](../BUILD.md); the passkey, inbound and share routes below are marked with the phase that
first exercises them.

Mode: ponytail. `node:http`, `node:sqlite` through `packages/ports`, `crypto.webcrypto`, one `setTimeout` per
record, no framework, no build step for the self-hoster. Every ceiling a simplification leaves is a `ponytail:`
line in §10.

---

## 1 · Purpose and boundary

| | |
|---|---|
| **Does** | reads config from env; opens or creates the KEK; opens the Directory and every record directory under `BRAINDOG_DATA`; refuses to start without FTS5; applies kernel migrations; arms one timer and one outbox poller per record; serves 33 §4 over `node:http`; owns identity — sessions, magic links, invitations, device grants, passkeys; signs and keeps nightly snapshots |
| **Refuses** | to write a row except through `RecordApi`; to decrypt anything the record could decrypt (it never can — ADR-062: AES-GCM runs here, the record stores sealed bytes); to terminate TLS; to receive SMTP; to hold a plaintext credential, session id, magic-link token or device code in any table |
| **Imports** | `@braindog/ports` (`openNodeSqlite` from `./node-sqlite`, `bootProbe`, `blobKey`, `SqlError`, the port types — 37 §2), `@braindog/kernel` (`openRecord` for the snapshot copy; the `CallContext` and `Result` types, which live there — 41 §13 #1), `@braindog/record` (`createRecordApi`, `RecordApi` — 45), `@braindog/mcp` (`serveMcp`, `gate` and `unauthorized` from `./http`), `@braindog/connect` (`runPull`, phase 4 — 47 §2), and `@braindog/web/node` — the `handler` adapter-node emits into `build-node/` (50 §13 #1–#2; [31-STACK](31-STACK.md) §2 row 15 admits the edge). Never `apps/cli`, never `apps/worker` |

The host touches a record file outside `RecordApi` in exactly **five** places, each named where it happens
(§5) and nowhere else: the bearer lookup and its `last_used` write on `token` and `device_grant` (§5.4); the
`member` level of a person (§5.4); the device-grant ceremony rows and the record's `auth_fail` (§5.9); the
snapshot *copy* — never the live file — where the six `local` tables are emptied, `vault_key(purpose = 'signing')`
is read and `dog_sig` is written (§5.13); and the same `vault_key` row on the live file when a streamed export
is signed (§5.2 step 9). Everything else the host needs — the next due instant, the record version, the active
declarations, the schema refusal — it reads through `api.kernel` (41 §2: `pendingWork` · `version` ·
`declarations` · `refused`). Five, counted; a sixth is a review finding.

---

## 2 · Public API

```ts
// apps/selfhost/src/server.ts — the package's only export surface
export function configFromEnv(env: NodeJS.ProcessEnv): Config;                 // throws ConfigError { key, fix }
export function startServer(config: Config): Promise<{ port: number; close(): Promise<void> }>;
                                                                                // rejects BootRefused — §6
export function openDirectory(path: string, driver: Config['sqlite']): Directory;
export function openRecordFile(slugDir: string, deps: HostDeps): OpenRecord;    // throws BootRefused on !caps.fts5
export const ROUTES: readonly Route[];                                          // §4.7 — the router-groups gate walks it
export const METHOD_GROUPS: Readonly<Record<RoutableMethod, Group>>;            // 49 routes, as @braindog/host's ROUTES:
                                                                                //   21 ADMIN, createToken listTokens revokeToken among them

type Config = {
  data: string;            // BRAINDOG_DATA        default '/data'
  kekFile: string;         // BRAINDOG_KEK_FILE    default `${data}/kek`
  token?: string;          // BRAINDOG_TOKEN       owner bearer; single-user only (§5.7 enforces "single")
  port: number;            // PORT                 default 8080
  sqlite: 'node:sqlite' | 'better-sqlite3';       // BRAINDOG_SQLITE   default 'node:sqlite'
  origin: string;          // BRAINDOG_ORIGIN      default `http://localhost:${port}` — magic-link URLs, rpId, CSRF
  smtp?: { url: URL; from: string };              // BRAINDOG_SMTP_URL smtps://u:p@host:465 | smtp://u:p@host:587 ; BRAINDOG_MAIL_FROM (amended by OPS-19)
};

type HostDeps = { clock: Clock; keys: KeyStore; dispatch: Dispatch; http: Http; blobs: (recId: RecordId) => Blobs;
                  sqlite: Config['sqlite']; onDrainError: (slug: string, err: unknown) => void };

type OpenRecord = {
  slug: string; recId: RecordId; sql: Sql; caps: Capabilities;
  api: RecordApi;                       // 45 — and api.kernel, the Kernel it wraps (41 §2), for the host's reads
  scheduler: NodeScheduler; poller: Poller; snapshots: NodeSnapshots;
  sick: null | 'SCHEMA_MISMATCH' | 'SCHEMA_NEWER';             // every route → 503 while set
  close(): void;
};

type Directory = { sql: Sql; close(): void };                   // the typed queries live in directory.ts
```

`startServer` resolves once `listen` has bound; `close()` stops the listener, clears every timer, drains the
pollers' in-flight rows, checkpoints WAL and closes every database.

The entry is `apps/selfhost/src/main.ts` — the file 48 §5.14 spawns — with three subcommands: `serve` (the
default; `startServer(configFromEnv(process.env))`), `init <slug> [--owner <email>]` (§5.22) and `dev [--port <n>]`
(§5.22). Exit codes: 0 clean stop · 1 `BootRefused`, `ConfigError` or an `init` refusal (one sentence on stderr,
nothing else).

---

## 3 · Files

Nine source files, counted.

| File | Responsibility | ~Lines |
|---|---|---|
| `src/main.ts` | argv → `serve` · `init <slug>` · `dev`; exit codes; `SIGTERM`/`SIGINT` → `close()` — the file 48 §5.14 spawns | 45 |
| `src/server.ts` | `configFromEnv`, `startServer`, the boot sequence (§5.1), `openRecordFile`, `init`/`dev` (§5.22), record resolution (§5.3), the `node:http` request loop, `close()` | 200 |
| `src/router.ts` | `ROUTES`, `METHOD_GROUPS`, path matching, body limits, `Result` → status (§6), GET aliases, the streamed export, `/a`, `/s`, `/<ID>`, `/in/*`, `/ws` 404, the shell fallback | 200 |
| `src/auth.ts` | cookies and sessions, lockout, magic link, token exchange, invitations, the device grant and operation grants (48 §13 D1), `CallContext`, the per-token bucket | 270 |
| `src/webauthn.ts` | CBOR subset, COSE → JWK, registration and assertion verification, DER → raw ECDSA — phase 3 | 170 |
| `src/directory.ts` | the DDL of §4.1, `openDirectory`, `user_version` check, the typed queries | 80 |
| `src/ports-node.ts` | `Clock`, `KeyStore` (KEK file), `Blobs` (disk), `Dispatch` (SMTP client, webhook, push), `Http` (undici `fetch` + private-range refusal) | 270 |
| `src/scheduler.ts` | `NodeScheduler` (one `setTimeout`, clamp, re-arm) and `Poller` (lease → dispatch → ack, kick, interval) | 100 |
| `src/snapshots.ts` | `VACUUM INTO` → strip `local` → manifest → sign → keep 30; the nightly timer | 110 |
| `test/*.test.ts` | §9 | — |

*This table is the design's count and has not been re-counted against the tree, which holds more than nine files
in `src/`. Two that this spec describes as built: `src/slash.ts`, which builds Slash's model, engine and door over
`@braindog/host/slash` ([46-SPEC-SLASH](46-SPEC-SLASH.md) §5.9), and `src/script.ts`, `scriptSandbox`, the QuickJS
runner a scheduled script runs in, which passes `@braindog/host/script` only what a Node host has: `pinFor`,
`pinnedSend` and the key opener (§5.23).*

---

## 4 · Data structures

### 4.1 · The Directory

33 §10's eight tables, typed. `PRAGMA user_version = 1`; a higher value refuses boot (`SCHEMA_NEWER`, §6).
Opened through the same `node:sqlite` adapter with the four PRAGMAs of 33 §6.

```sql
CREATE TABLE person        (id TEXT PRIMARY KEY,                     -- 'p_' + 26-char ULID, minted here
                            email TEXT NOT NULL UNIQUE, name TEXT,
                            created_at TEXT NOT NULL, suspended_at TEXT);
CREATE TABLE passkey       (id TEXT PRIMARY KEY,                     -- base64url credential id
                            person_id TEXT NOT NULL, public_key TEXT NOT NULL,   -- JWK, JSON text (§5.10)
                            sign_count INTEGER NOT NULL DEFAULT 0,
                            created_at TEXT NOT NULL, last_used TEXT);
CREATE INDEX passkey_person ON passkey(person_id);
CREATE TABLE session       (id_hash TEXT PRIMARY KEY,                -- SHA-256 hex of the cookie value
                            person_id TEXT NOT NULL, expires TEXT NOT NULL,
                            rotated_at TEXT NOT NULL,
                            authed_at TEXT NOT NULL);                -- last passkey/magic-link proof — VAULT's 15-minute rule (§13 #16)
CREATE TABLE magic_link    (hash TEXT PRIMARY KEY, person_id TEXT NOT NULL, expires TEXT NOT NULL);
CREATE TABLE invitation    (hash TEXT PRIMARY KEY, email TEXT NOT NULL, rec_id TEXT NOT NULL,
                            levels TEXT NOT NULL,                    -- json { "<register>|*": "<level>" }
                            expires TEXT NOT NULL, accepted_at TEXT);
CREATE TABLE record_dir    (slug TEXT PRIMARY KEY, rec_id TEXT NOT NULL UNIQUE, owner_person TEXT NOT NULL);
CREATE TABLE person_record (person_id TEXT NOT NULL, rec_id TEXT NOT NULL, PRIMARY KEY (person_id, rec_id));
CREATE TABLE auth_fail     (key TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0, until TEXT);
```

Invariants a test can check: no table holds a value that opens anything — `session.id_hash`, `magic_link.hash`
and `invitation.hash` are SHA-256 of what the browser holds; `person.email` is stored lower-cased and trimmed;
a `magic_link` row is deleted by the statement that consumes it; `invitation.accepted_at` is set once and the
row is never reused; `auth_fail.n` never exceeds 10.

**Amended with sign-in, at Directory version 3.** The tables above are the first draft's. The built Directory is
`@braindog/record/directory`, the same file the Worker runs, and its sign-in tables are `dir_session`,
`dir_passkey`, `dir_link` (magic and claim links in one table, told apart by `purpose`), `dir_challenge` and
`dir_fail` (33 §10). Every stored hash is HMAC-SHA-256 under the session key rather than a plain SHA-256. The key
is derived from the KEK file by HKDF with the info `braindog/session`, or from `BRAINDOG_SESSION_SECRET` when that
is set, so replacing either one signs everybody out without walking a row (12 §8). Times in these tables are epoch
milliseconds.

### 4.2 · Cookies

| Cookie | Value | Attributes | Life |
|---|---|---|---|
| `__Host-bd_s`, on an https origin | 32 random bytes, base64url (43 chars); the table holds its HMAC | `Path=/; HttpOnly; Secure; SameSite=Lax` | `Max-Age=2592000` (30 days) |
| `bd_s`, on http at a loopback name | the same | `Path=/; HttpOnly; SameSite=Lax` | the same |

One cookie. The record it opens is on the session row, so `bd_r` is gone. An origin that is neither https nor
loopback gets no cookie at all, and `/auth/methods` says `why: 'insecure'`. `BRAINDOG_ORIGIN` names the origin,
and without it the origin is `http://localhost:<PORT>`.

**Rotation rule.** On any request carrying the cookie where `now − rotated_at > 24 h`, the row takes a new id and
keeps the old one as `prev_hash` until `now + 60 s`, the expiry moves to `now + 30 d`, and the answer carries the
new cookie. The rotation is a compare-and-set on `rotated_at`, so two requests carrying one day-old cookie rotate
it once. The minute of grace is an amendment: the app sends `boot`, `version` and a route's calls in parallel with
one cookie, and an old id that died on the spot answered every call but the first with a 401. `authed_at` moves
only on a new sign-in (§5.6, §5.7, §5.10), never on rotation.
### 4.3 · The data directory

```
$BRAINDOG_DATA/
  kek                         32 raw random bytes, mode 0600, created on first run with flag 'wx'
  vapid.json                  { publicKey, privateKey } P-256 JWK for Web Push, 0600, created on first run
  directory.sqlite            (+ -wal, -shm)
  <slug>/
    record.brain                the live record (+ -wal, -shm) — a .brain because migration 0001 made it one
    blobs/<sha256>            attachment bytes, content-addressed; mime is sniffed at read, bytes is stat.size
    snapshots/<YYYYMMDDTHHMMSSZ>-<label>.brain    signed exports: 25 travelling tables, six local tables empty
```

A directory under `data` is a record iff it contains `record.brain` and its name is a `record_dir.slug`; anything
else is ignored with one log line.

### 4.4 · The KEK file and what is derived from it

| Thing | Value |
|---|---|
| File | exactly 32 bytes; anything else refuses boot (`fix: "kek must be exactly 32 bytes"`) |
| Mode | 0600; on POSIX `(mode & 0o077) !== 0` refuses boot; on Windows the check is skipped and logged once |
| `kek_id` | first 18 hex of SHA-256(raw) — [34-GRAMMARS](34-GRAMMARS.md) §5 |
| `KeyStore.current()` | `{ kekId, key }`, key = `subtle.importKey('raw', kek, 'AES-GCM', false, ['encrypt','decrypt'])` — the DEK wrapping of 12 §6 carries a `nonce`, so it is AES-GCM |
| `k_code` | `hkdfSync('sha256', kek, '', 'braindog/device-code', 32)` — HMAC key for `device_grant.code_hash` |
| `k_share` | `hkdfSync('sha256', kek, '', 'braindog/share', 32)` — HMAC key for share tokens (§4.9) |

The raw buffer is zero-filled after the three derivations. `byId(id)` answers the current key or `null`.

*Amended September 28th 2026 (OPS-16; OPS-28 records it).* During a rotation the previous key sits beside the key file
as `<file>.prev`, the same 32 bytes and mode. `openKeyStore` opens both: `current()` is the key file, and `byId`
answers either id, so every row wrapped under the old key still opens. The first start that finds a `.prev` re-wraps
every record's keys under the current one before anything is served (`rewrapAtStart`), and says so. Unless
`BRAINDOG_SESSION_SECRET` is set, the session key is derived from the key file, so a new key file signs everybody out,
which the boot line also says. Retiring the old key is deleting `<file>.prev` ([53-SPEC-OPERATIONS](53-SPEC-OPERATIONS.md)
§5.6).

### 4.5 · `caps`

`Capabilities` of 33 §1, measured by `measureCaps(sql)` at every open — Directory and each record. `fts5 === false`
anywhere is `BootRefused`. The five enforced ceilings are the adapter's; the host reads only `sqlite`, `fts5`,
`json`.

### 4.6 · `CallContext` construction

| Credential | `principal` | `surface` |
|---|---|---|
| `Authorization: Bearer` = `config.token` | `{ kind: 'person', id: record_dir.owner_person, level: 'owner' }` | `cli` |
| bearer found in `token` | `{ kind: 'token', id, scope: ladder(scope), name: label }` — `read`→`[read]`, `propose`→`[read,propose]`, `write`→`[read,propose,write]` | `api` on `/api/*`, `mcp` on `/mcp` |
| bearer found in `device_grant` with `reach = 'runner'` (`active`, unexpired) | `{ kind: 'token', id, scope: ['read','propose'], name: label }` + host flag `runner` | `cli` |
| bearer found in `device_grant` with `reach ∈ export import pack token` (`active`, within its ten minutes) | `{ kind: 'person', id: approved_by, level: member('*') }` with `op: reach` — the operation grant of 48 §13 D1 | `cli` |
| the session cookie | `{ kind: 'person', id: person, level: member('*') }`, with `credentialed: true` and `provedAt` from the session's `authed_at` | `web` |
| timer, poller, snapshot job | `{ kind: 'system' }` | `alarm` |
| `/in/*` | `{ kind: 'system' }` | `webhook` · `email` |

`session` is filled from seven request headers when present: `X-Braindog-Session`, `X-Braindog-Client`,
`X-Braindog-Host`, `X-Braindog-Repo`, `X-Braindog-Remote`, `X-Braindog-Cwd` and `X-Braindog-Agent`, giving
`{ spoken, client_id, host, repo, remote, cwd, agent }`. `sessionOf` in `packages/host/src/session.ts` holds each
to its grammar and drops what fails. Over `/mcp` the same hints come from `params._meta.session`, checked the same way. `now = clock.now()`.

### 4.7 · Routes as data

```ts
type Group = 'DATA' | 'READ+' | 'VAULT' | 'JOBS' | 'ADMIN' | 'AUTH' | 'INGRESS' | 'PUBLIC' | 'SHELL';
type Auth  = 'bearer-or-cookie' | 'cookie' | 'runner' | 'ingest' | 'share' | 'none';
type Route = { method: 'GET' | 'POST'; path: string | RegExp; group: Group; auth: Auth; phase: 2 | 3 | 4 | 7;
               handle: (req, res, rec: OpenRecord | null, ctx: CallContext | null) => Promise<void> };
```

| Route | Method | Auth | Group | Phase |
|---|---|---|---|---|
| `/api/<method>` for the 12 DATA + 15 READ+ methods | POST | bearer-or-cookie | DATA · READ+ | 2 |
| `/api/<method>` for VAULT (1), ADMIN (21, `createToken listTokens revokeToken` among them, 48 §5.12), `createJob cancelJob listJobs` | POST | cookie — ADMIN also an operation grant whose `reach` names the method (§5.2 step 7) | VAULT · ADMIN · JOBS | 2 (JOBS 7) |
| `/api/claimJob[?wait=N]` · `/api/postJobEvent` · `/api/readCancel` | POST | runner | JOBS | 7 |
| `/api/boot` · `/api/pages/:slug` · `/api/schema/:register` · `/api/version` | GET | bearer-or-cookie | READ+ | 2 |
| `/api/snapshot` · `/api/snapshots` · `/api/snapshots/:id` | POST · GET · GET | cookie | ADMIN | 2 |
| `/mcp` | POST | bearer only; never the cookie, never open mode | DATA | 6 |
| `/a` · `/a/<64 hex>` | POST · GET | bearer-or-cookie · none | DATA · PUBLIC | 2 |
| `/in/webhook/<ingest-id>` · `/in/email/<token>` | POST | ingest | INGRESS | 4 |
| `/s/<token>` | GET | share | READ+ | 7 |
| `/<ID>` (34 §4's two spoken grammars) | GET | cookie | READ+ | 2 |
| the sign-in routes of 33 §4 (`AUTH_ROUTES`), the operator's two excepted: `/auth/methods` · `/auth/session` · `/auth/token` · `/auth/magic/start` · `/auth/magic/redeem` · `/auth/passkeys` · `/auth/passkey/remove` · `/auth/logout` | GET · POST | none, or the session cookie | AUTH | 2 |
| `/auth/switch` (September 16th 2026): moves the session to another record the person is on. This process opens only the record it serves, so the Directory's `admits(record, person)` is `record === this record's id` and the kernel's `access(person)`; any other name, and a person the record's own table no longer holds, is the one 403 at `slug`. It is asked after the session, so a caller with no cookie gets 401 for every name and cannot learn which one this process serves | POST | the session cookie, same origin | AUTH | 2 |
| `/auth/invite` | GET | none | AUTH | 2 |
| `/account/usage?from&to` (`ACCOUNT_ROUTES`): what the records the signed-in person owns used, from the Directory's ledger | GET | the session cookie | AUTH | 2 |
| `/account/records` (`ACCOUNT_ROUTES`): every open record the signed-in person can reach, each named and levelled by that record's own answer: the record switcher's rows | GET | the session cookie | AUTH | 2 |
| `/auth/device` · `/auth/device/token` · `/auth/device/approve` | POST | none · none · cookie | AUTH | 2 |
| `/auth/passkey/register/options` · `/auth/passkey/register` · `/auth/passkey/assert/options` · `/auth/passkey/assert` | POST | cookie · cookie · none · none | AUTH | 3 |
| `/ws` | GET | — | PUBLIC | 404 in phase 2 (§13 #4) |
| `/app/<slug>/api/<method>` (September 23rd 2026): `/api/<method>` for the record the path names, moved to the root before anything reads it; a slug that is not this process's record is refused once the caller is known, so a request with no credential gets the root's own 401 | as `/api/<method>` | as `/api/<method>` | as `/api/<method>` | as `/api/<method>` |
| `/app` and everything under it, `GET /app/signin` included: the built app, falling back to its `index.html`, contained by `realpath`, served with `frame-ancestors 'none'`; a missing file under `/app/_app/` is a 404. Every other path is a `308` into `/app`, so `/`, `/signin` and a mailed `/signin#magic=` link land there with their fragment (§5.19) | GET | none | SHELL | 3 |

Forty-nine `/api/<method>` routes come from `ROUTES` in `@braindog/host`, 21 of them ADMIN; INTERNAL methods have none; `restore`
answers 404 on this host (§13 #10). The `router-groups` gate (33 §8) asserts every entry has a `group`, that
no VAULT route has `auth` other than `cookie` and no ADMIN route admits a `token` principal, and that the
`METHOD_GROUPS` keys equal 30 §5's six groups less INTERNAL plus 48's three token methods.

### 4.8 · The device-grant request — 48 §4.2's wire, adopted

```ts
type Reach         = 'login' | 'runner' | 'export' | 'import' | 'pack' | 'token';
type DeviceRequest = { slug?: string; reach: Reach; label: string; subject?: string };
type DeviceCode    = { device_code: string; user_code: string; verification_uri: string; expires_in: 600; interval: 5 };
type DevicePoll    = { pending: true; interval: number } | { token: string; expires: string; reach: Reach };
```

`device_grant.reach` is the column 48 §13 D1 adds to 30 §1; `label` is stored in `label` and `subject` in `ua` —
48 sends no user agent, and the approver reads both (§13 #14). `verification_uri` is `${origin}/app/settings/agents`
since push A of the one-domain move: this host holds one record, so the address names no slug, where the Cloud's
names the one the start asked for (`packages/host/src/device.ts`).
What each reach mints is §5.9 step 3.

### 4.9 · The share token (phase 7)

`<token>` = `base64url(payload) + '.' + base64url(HMAC-SHA256(k_share, payload))`, payload = JCS
`{ id, rec, slug, exp }`. Verification is stateless; revocation is terminal — the record's `share.close` event
for `id`, checked through `api.page` with a `{ kind: 'share', id, slug }` principal (§13 #13).

---

## 5 · Algorithms

### 5.1 · Boot

1. `configFromEnv`: parse; `mkdir(data, { mode: 0o700, recursive: true })`; a missing `BRAINDOG_ORIGIN` defaults to `http://localhost:${port}`; an SMTP URL whose scheme is not `smtp`/`smtps` is `ConfigError`.
2. KEK: `readFile(kekFile)`; `ENOENT` → `writeFile(kekFile, randomBytes(32), { mode: 0o600, flag: 'wx' })` and read again; check length and mode (§4.4); derive `k_code`, `k_share`; import the AES-GCM key.
3. `vapid.json`: read or generate (`subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' })`, export JWK, 0600).
4. `openDirectory(`${data}/directory.sqlite`)`: `sql = openNodeSqlite(path)` — the adapter sets the four PRAGMAs of 33 §6, measures `caps` and runs `bootProbe` itself (37 §5.1), throwing `SqlError('NO_SUCH_MODULE')` with the probe text on a build without FTS5, which `startServer` rethrows as `BootRefused`; `user_version` 0 → run the DDL of §4.1 and set 1; > 1 → `SCHEMA_NEWER`.
5. For each `record_dir` row whose `<slug>/record.brain` exists: `openRecordFile` —
   1. `sql = openNodeSqlite(`${dir}/record.brain`)` — the same probe, the same `BootRefused`. `config.sqlite === 'better-sqlite3'` asks `ports` for its alternative adapter behind the same `Sql` (33 §1); 37 §1 leaves that adapter to a later ADR, so the flag is refused with `ConfigError` until it exists.
   2. `api = createRecordApi({ sql, scheduler, clock })` with `scheduler = new NodeScheduler(…)` whose `fire` is `api.drainSchedule({}, systemCtx)` and whose `kick` is `poller.kick`. There is no MCP handler per record: `/mcp` calls `serveMcp(request, api, ctx)` on each request (§5.2).
   3. `await api.kernel.applyMigrations()` (41 §2); `api.kernel.refused()` non-null → `rec.sick = its code`, log, continue — one bad record does not stop the host.
   4. `{ nextDueMs, outboxPending } = api.kernel.pendingWork()` (41 §2); `nextDueMs !== null && await scheduler.set(nextDueMs)`; `outboxPending && poller.kick()`.
   5. `poller.start()` (§5.12); `snapshots.armNightly()` (§5.13). `<slug>/inbound.token` is **not** read here (September 20th 2026): boot only builds the reader, which opens the file on the first forwarded message and at most once a second after that (§5.16, §5.22).
6. A `record_dir` row with no directory, or a directory with no row, is logged as `slug` and skipped.
7. `http.createServer(handle).listen(port, '0.0.0.0')`; resolve `{ port, close }`.
8. `SIGTERM`/`SIGINT` → `close()`.

### 5.2 · A request

1. Read method, `URL`, headers; `Content-Length` or body > 1 MB → 413 bare ([10-MCP](10-MCP.md) §8); `/a` has its own 2 MB rule (§5.17).
2. Match `ROUTES` in order: `/auth/*` first, then `/mcp`, then `/api/*`, `/a`, `/in`, `/s`, `/ws`, `/<ID>`, the shell last (the `run_worker_first` list of 33 §4 is exactly this prefix set). `/mcp` is taken before the body is read: `gate` answers 405, 403 for any `Origin` and 415 from the headers, the bearer is checked by the same function `/api` uses, with `verifyToken(bearer, 'mcp')`, and only then does `serveMcp` read the body, counting to 1 MB as it arrives. A missing or unknown bearer is 401 with `WWW-Authenticate: Bearer`; a known token for somebody no longer on the record is 403, as on `/api`.
3. Set `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Content-Type: application/json; charset=utf-8` on every `/api/*`, `/auth/*`, `/mcp` answer. No `Access-Control-*` header is ever written; a test greps for it.
4. Resolve the record (§5.3) when the route needs one; a `sick` record → 503 `{ code, fix }`.
5. Authenticate per `route.auth` (§5.4); build `CallContext`.
6. Cookie principal on a non-GET: `Origin` must equal `config.origin`, or `Sec-Fetch-Site` must be `same-origin`; else 403 `FORBIDDEN` (12 §8's origin check).
7. Group gate for `/api/<method>`: VAULT, ADMIN, JOBS-session with a `token` principal → 403 `NEEDS_BROWSER_SESSION`; ADMIN admits a `person` principal that came from a cookie, from `config.token`, or from an operation grant whose `ctx.op` names the method — `export` → `export`; `import` → `import`; `pack` → `planPack installPack uninstallPack`; `token` → `createToken listTokens revokeToken` (48 §13 D1) — any other `op` → 403 `FORBIDDEN`; VAULT with `now − authed_at > 15 min`, or with an `op` set, → 403 `NEEDS_BROWSER_SESSION`, `fix: "Sign in again to open the vault"`; runner methods with anything but the `runner` flag → 403 `FORBIDDEN`; a `runner` principal anywhere else → 403 `FORBIDDEN`.
8. Token bucket for `token` principals: 600/min, burst 60 (10 §8) → 429 with `Retry-After`.
9. Parse the JSON body (invalid → 400 bare); `result = api[method](body, ctx)`; write per §6. `openGrant` and `bindGrant` pass through the host's vault step: unwrap the DEK with `KeyStore`, derive the grant key by HKDF, decrypt or encrypt with the AAD of 12 §6, return plaintext once — the record only ever sees sealed bytes. `export` answers `200 text/plain; charset=utf-8` and streams the `.brainl` (48 §13 D3): page after page of `api.export` (`exportBrainl`), the host signing the manifest after page 0 with §5.13's `sign()` and emitting the one `dog_sig` row line in the last block (48 §13 D2's order).
10. GET aliases: `/api/boot` → `boot({})`; `/api/pages/:slug` → `page(slug)`; `/api/schema/:register` → `schema(register)`; `/api/version` → §5.14.
11. Every path is wrapped once: a thrown error is logged as `{ code | name, route, recId }` — never a body — and answered 500 bare.

### 5.3 · Which record

33 §4 names no record in any path; a self-host may hold several. Order, first hit wins:

1. One `record_dir` row → it, always.
2. Bearer: the hash is looked up in each open record's `token`, then `device_grant` (≤ 10 indexed lookups; `ponytail:` O(records)).
3. Cookie: the session row's record, which sign-in set to one the person owns, else the first they joined; the record's own `member` table then says what they may do.
4. `/s/<token>` → `payload.rec`; `/in/email/<token>` → the record whose Directory-side token matches; `/in/webhook/<id>` → the first record whose `api.kernel.declarations()` holds an active `ingest.<id>` (41 §2); `/a/<sha256>` → content-addressed, every `blobs/` dir is tried.
5. Nothing → 404 bare.

### 5.4 · Authenticate

1. `Authorization: Bearer t` present: if `config.token` and `sameKey(t, config.token)` (SHA-256 of both, compared in constant time) → owner principal (§4.6). Else `h = sha256hex(t)`; `SELECT id, scope, label, expires_at, revoked_at FROM token WHERE hash = ?` → a live row → principal; `UPDATE token SET last_used_at = ?, last_surface = ? WHERE id = ?`. Else `SELECT id, reach, label, approved_by, expires, last_used FROM device_grant WHERE token_hash = ? AND status = 'active'` with `expires > now`: `reach = 'runner'` and `last_used ≥ now − 14 d` → the runner principal, `UPDATE device_grant SET last_used = ?` (a row silent 14 days is set `expired` and the request gets 401); `reach ∈ export import pack token` → `{ kind: 'person', id: approved_by, level: member('*') }` with `ctx.op = reach` — the ten-minute operation grant of 48 §13 D1; a `login` row is never a bearer (its token is in `token`). Nothing → 401 `{ code: 'UNAUTHORIZED' }`. Bearers never touch `auth_fail` (12 §8: agents bypass the lockout).
2. The session cookie: the Directory's `auth({ flow: 'session', sid })`, which finds the row by the id's HMAC or, for sixty seconds after a rotation, by the previous one. Missing, expired, or a suspended person → 401 and the cookie cleared; a bad cookie never falls through to step 3. The level is the record's own `access(person)`; none → 403 `FORBIDDEN`. A cookie non-GET needs `sameOrigin`, else 403 `FORBIDDEN`. Rotate per §4.2.
3. Nothing presented and no `config.token` (open mode): the `Host` must be `localhost`, `127.0.0.1` or `[::1]` at this port, or the origin's host, else an empty 421 (DNS rebinding); a non-GET whose `Origin` or `Sec-Fetch-Site` names another site is 403 `FORBIDDEN`, and a request carrying neither is the CLI or the client, not a page; then the owner, with `credentialed: false`.
4. `auth: 'none'` routes skip both; `auth: 'cookie'` routes refuse a bearer with 403 `NEEDS_BROWSER_SESSION` — except `config.token`, which is owner everywhere (30 §10).

### 5.5 · The lockout — reserve before compare, fail closed

Keys: `ip:<addr>` on `/auth/token`, `/auth/passkey/assert` and `/auth/magic/redeem`; `mint:<addr>` and
`email:<addr>` on `/auth/magic/start`; `device:<addr>` on `/auth/device`, `/auth/device/token` and
`/auth/device/approve`, the last three in the **record's** `auth_fail` (33 §10) and the rest in the Directory's
`dir_fail`. `<addr>` is `socket.remoteAddress`. Behind a proxy the operator names with `BRAINDOG_TRUST_PROXY=1`, it
is the last `X-Forwarded-For` entry, the one that proxy wrote; otherwise the header is ignored, because an address
anybody can write is an address anybody can lock out.

```sql
-- one statement, BEFORE any comparison: ?1 the key, ?2 now, ?3 now minus 15 min, ?4 now plus 15 min
INSERT INTO dir_fail (key, n, first, until) VALUES (?1, 1, ?2, NULL)
ON CONFLICT (key) DO UPDATE SET
  n     = CASE WHEN (until IS NOT NULL AND until <= ?2) OR (until IS NULL AND first <= ?3) THEN 1 ELSE MIN(n + 1, 10) END,
  first = CASE WHEN (until IS NOT NULL AND until <= ?2) OR (until IS NULL AND first <= ?3) THEN ?2 ELSE first END,
  until = CASE WHEN until IS NOT NULL AND until <= ?2 THEN NULL
               WHEN until IS NULL AND first <= ?3 THEN NULL
               WHEN n >= 10 THEN COALESCE(until, ?4) ELSE until END
RETURNING n, until;
```

1. No row returned, or the statement throws → 503 `{ ok: false }`: a reservation that fails is never a pass.
2. `until > now` → 429 with `Retry-After` in seconds and `{ ok: false, retryAfter }`. The compare never runs, and
   a correct secret during the window is refused like any other (sticky).
3. Compare. A success deletes the `ip:` key in the transaction that writes the session. The `mint:` and `email:`
   keys are never cleared, because sending a link is not a sign-in.

Ten attempts are compared and the eleventh is refused, for fifteen minutes (§13 #17). The counter is capped at 10,
so hammering cannot extend the window. **Three amendments to the first draft, each argued above the statement in
`packages/record/src/identity.ts`.** The lock falls on the eleventh reservation rather than the tenth, which
refused the tenth attempt itself, so nine failures and then the right secret could never succeed. A success clears
the address, because an office behind one address signs many people in on a Monday morning and every one of those
sign-ins reserved a strike. And a count whose first strike is fifteen minutes old starts again, because otherwise a
handful of typos from one address over a month added up to a lock.
### 5.6 · Magic link

1. `POST /auth/magic/start { email }`: reserve `mint:<ip>`, then `email:<addr>`. A live person with that address
   gets a `magic` link; none → the same 200 `{}` and no mail (no enumeration; sign-up is closed on a self-host,
   §13 #15). With no mail transport the route is 404 and `/auth/methods` says `magic: false`, so the screen never
   offers it, and a link is never printed instead. *Amended by OPS-19:* with `BRAINDOG_SMTP_URL` and
   `BRAINDOG_MAIL_FROM` set, the host sends through §5.20's client, `magic` is true, and an invitation's mailbox proof
   works too; with either unset it stays off, and notification mail waits in the outbox, said once at each start.
2. `t` = 32 random bytes, base64url; `INSERT INTO dir_link (hash, person, purpose, expires)` with the HMAC of `t`,
   `'magic'` and `now + 15 min`. The host sends `<origin>/app/signin#magic=<t>` without waiting for the send, so a
   known and an unknown address answer in the same time. A fragment never reaches a server, a log or a link
   pre-fetcher.
3. The app reads the fragment once, removes it from the address bar, and on a press sends
   `POST /auth/magic/redeem { linkToken }`: reserve `ip:<ip>`; `DELETE FROM dir_link WHERE hash = ? AND purpose = 'magic' AND expires > ? RETURNING person`,
   single use and expiry in one statement; no row → 401. A claim link is the same with `claimToken`, purpose
   `claim` and 24 hours.
4. Session: a new id; a presented session is deleted first (fixation); the row records the person, the record
   they own (else the first they joined), `now + 30 d` and `authed_at = now`; `Set-Cookie` per §4.2; 200 with
   `{ person, email, record, provedAt }`. The app goes on to `next` when it is a path on this origin, else `/`.
### 5.7 · Token exchange — `BRAINDOG_TOKEN` → a session

1. `POST /auth/token { serverKey }`: `config.token` unset → 404 `ROUTE_UNKNOWN`; reserve `ip:<ip>`.
2. `SELECT COUNT(*) FROM person` > 1 → 403 `FORBIDDEN` — the token is single-user by design (12 §3), and the process enforces the word.
3. The two digests compared in constant time → a session for the one person, as in §5.6 step 4; 200 with `{ person, email, record, provedAt }` and the cookie.

This is also the bootstrap when no SMTP is configured, and the authenticated session behind which the first
passkey is registered (12 §8: registration needs a session in place of attestation).

### 5.8 · Invitation

1. `POST /api/invite { email, levels }` (ADMIN, cookie, `level === 'owner'` else 403 `FORBIDDEN`): `t = randomBytes(32)`; `INSERT INTO invitation (hash, email, rec_id, levels, expires) VALUES (sha256hex(t), ?, ?, json(levels), now + 24 h)`; `dispatch.email({ to: email, subject: 'You are invited to <record.name>', text: `${origin}/auth/invite?t=${t}` })`; 200 `{ ok: true, value: { email, expires }, version }` with `version` from §5.14.
2. `GET /auth/invite?t=…`: reserve `ip:<ip>`; `SELECT email, rec_id, levels FROM invitation WHERE hash = ? AND expires > ? AND accepted_at IS NULL`; none → 401.
3. In one Directory transaction: `person` for `email` or `INSERT` one (`p_` + ULID); `UPDATE invitation SET accepted_at = now`; `INSERT OR IGNORE INTO person_record`.
4. `api.invite({ person: { id, email, name }, levels }, ownerCtx)` where `ownerCtx.principal = { kind: 'person', id: record_dir.owner_person, level: 'owner' }` — the owner's act, completed at acceptance: the record writes its `person` mirror, the `member` rows and one `access.grant` event per register (33 §10). A refusal here rolls nothing back in the Directory; the invitee can retry with a new invitation.
5. Session as §5.6 step 4, on the invitation's record; 302 `/settings/recovery` — the screen that registers a passkey (phase 3).

### 5.9 · Device grant — RFC 8628, 12 §6.1

1. `POST /auth/device { slug?, reach, label, subject? }` (48 §4.2): resolve the record — `slug`, else the host's only record (§5.3); reserve `device:<ip>` in the record's `auth_fail`; `device_code = base64url(randomBytes(32))`; `user_code = String(randomInt(0, 1_000_000)).padStart(6, '0')`; `INSERT INTO device_grant (id, code_hash, status, reach, label, ua, tries, expires) VALUES (device_code, hmac(k_code, user_code), 'pending', reach, label, subject, 0, now + 10 min)`; 200 `{ ok: true, value: { device_code, user_code, verification_uri: `${origin}/app/settings/agents`, expires_in: 600, interval: 5 }, version }`. The device keeps `device_code`; the code is never sent by the device again.
2. `POST /auth/device/approve { user_code }` (cookie; a `token` bearer → 403 `NEEDS_BROWSER_SESSION`): reserve `device:<ip>`; then one `transactionSync`:
   1. `UPDATE device_grant SET tries = tries + 1 WHERE status = 'pending' AND expires > ?` — every pending row pays for a wrong guess.
   2. `SELECT id, reach, label, ua FROM device_grant WHERE status = 'pending' AND expires > ? AND code_hash = ?`.
   3. Match → `UPDATE device_grant SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ?`; 200 `{ approved: { reach, label, subject: ua } }` — the screen said what it was about to grant before the click (50 draws it at `/settings/agents`).
   4. No match → `UPDATE device_grant SET status = 'denied' WHERE status = 'pending' AND tries >= 5`; changed rows > 0 → 422 `{ refusals: [{ code: 'DEVICE_CODE_TRIES', at: 'user_code', fix: 'Ask the device to start again' }] }`; else 404 bare. Denied rows are kept.
3. `POST /auth/device/token { device_code }`: reserve `device:<ip>`; `SELECT status, reach, label, approved_by, expires FROM device_grant WHERE id = ?`:
   - `pending`, `expires > now` → 200 `{ ok: true, value: { pending: true, interval: 5 }, version }`; `pending`, expired → `UPDATE … status = 'expired'`; 422 `DEVICE_CODE_EXPIRED`.
   - `approved` → `t = base64url(randomBytes(32))`, `h = sha256hex(t)`, then by `reach`: **`login`** → `INSERT INTO token (id, person_id, hash, scope, label, created_at, expires_at) VALUES (ulid, approved_by, h, 'write', label, now, now + 90 d)` and the grant row → `active`, `token_hash = h`, `expires = now + 90 d` — the approval's audit, never itself a bearer (33 §5's `read`+`write` agent token); **`runner`** → grant row `active`, `token_hash = h`, `expires = now + 90 d`, `last_used = now` — the 90-day bearer of 12 §6.1; **`export` · `import` · `pack` · `token`** → grant row `active`, `token_hash = h`, `expires` left at the code's ten minutes — the operation grant §5.4 resolves to the approver with `ctx.op = reach`. 200 `{ ok: true, value: { token: t, expires, reach }, version }` — shown once.
   - `denied` → 422 `DEVICE_CODE_TRIES`; `expired` → 422 `DEVICE_CODE_EXPIRED`; `active` or `revoked` polled again → 401 `UNAUTHORIZED` — a token is shown once.
4. `braindog login` sends `reach: 'login'`; `braindog runner enroll` sends `reach: 'runner'`; `braindog export|import|pack|token` send the command's reach with a `subject` the approver reads (48 §5.2–§5.3).

### 5.10 · Passkeys — phase 3

Registration (`/auth/passkey/register/options` then `/auth/passkey/register`; an authenticated session is
required — 12 §8 — and the options carry `attestation: 'none'`, `pubKeyCredParams: [{ alg: -7 }, { alg: -257 }]`,
`rp.id = new URL(origin).hostname`). Challenges live in `dir_challenge`, by their HMAC, for five minutes: single use, consumed by the one statement
that deletes them, pruned on every insert, and refused past 10,000 live rows. A table and not a `Map`, because the
Worker's Directory object is evicted between requests and a ceremony in flight would go with it.

1. `c = JSON.parse(utf8(clientDataJSON))`: `c.type === 'webauthn.create'`, `c.challenge` is live for this person, `c.origin === origin`.
2. `att = cbor(attestationObject)`; `attStmt` is ignored whatever `fmt` says — the session is the attestation.
3. `authData`: `rpIdHash === sha256(rp.id)`; flag UP set; flag AT set; `signCount = u32be(33)`; `credId = bytes(55, 55 + u16be(53))`; `cose = cbor(rest)`.
4. COSE → JWK: `kty 2, alg -7, crv 1` → `{ kty: 'EC', crv: 'P-256', x, y }`; `kty 3, alg -257` → `{ kty: 'RSA', n, e, alg: 'RS256' }`; anything else → `rejected`.
5. `subtle.importKey('jwk', …)` must succeed; `INSERT INTO passkey (id, person_id, public_key, sign_count, created_at)`; a duplicate id → `rejected`.

Assertion (`/auth/passkey/assert/options` → `{ challenge, rpId, userVerification: 'preferred' }`, empty
`allowCredentials` so discoverable credentials work; then `/auth/passkey/assert`), with `ip:<ip>` reserved:

1. `c.type === 'webauthn.get'`, challenge live, origin matches.
2. `SELECT person_id, public_key, sign_count FROM passkey WHERE id = ?`; none → `rejected`.
3. `authData`: rpIdHash matches; UP set.
4. Verify `signature` over `authData ‖ sha256(clientDataJSON)`: ES256 — DER `ECDSA-Sig-Value` → raw `r‖s` (64 bytes), `subtle.verify({ name: 'ECDSA', hash: 'SHA-256' })`; RS256 — `subtle.verify('RSASSA-PKCS1-v1_5')`.
5. `n = u32be(33)`; if `n !== 0 || stored !== 0` then require `n > stored`, else `rejected` (a clone); `UPDATE passkey SET sign_count = ?, last_used = ?`.
6. Session as §5.6 step 4, and always a new one: a presented cookie is deleted first rather than refreshed, so a cookie planted before a sign-in never becomes a signed-in one. A new assertion is also how the vault's fifteen minutes are renewed.

Every failure is one body on the wire, 401 `UNAUTHORIZED` "That did not sign you in."; the reason
(`challenge` · `origin` · `rpid` · `flags` · `alg` · `sig` · `count` · `dup`, and the Directory's own) goes to the log, never the answer.
The CBOR decoder handles major types 0–5 and 7, definite lengths only, depth ≤ 4, integers ≤ 2^53; anything
else → `rejected`.

### 5.11 · The scheduler — one `setTimeout` per record

```ts
class NodeScheduler implements Scheduler {
  constructor(private fire: () => Promise<void>, private clock: Clock, private kick: () => void, private onError: (e: unknown) => void) {}
  get()        → this.at
  set(atMs)    → if (atMs === this.at) return; clearTimeout(this.t); this.at = atMs;
                 this.t = setTimeout(() => this.onFire(), Math.min(Math.max(atMs - this.clock.now(), 0), 2 ** 31 - 1));
  clear()      → clearTimeout(this.t); this.at = null
  wake()       → this.kick()                                   // §13 #5
  onFire()     → const at = this.at; this.at = null;
                 if (at > this.clock.now() + 5) return this.set(at);        // the clamp, or an early tick
                 try { await this.fire() } catch (e) { this.onError(e); this.set(this.clock.now() + 60_000) }
}
```

1. `fire` is `api.drainSchedule({}, systemCtx)` — the alarm handler of 09 §1: claim ≤ 100, dispatch, write outbox rows, then the record itself calls `scheduler.set(MIN(due_at))` and `scheduler.wake()`. A batch of 100 re-arms to `now`, which is a 0 ms timer.
2. The write path re-arms after every write (30 §4 step 11); `set` is idempotent on an equal instant, so a burst of writes costs one `clearTimeout` each and one timer.
3. A `due_at` further than 24.8 days is clamped; the early tick re-arms without draining.
4. A thrown drain is logged and retried in 60 s; the timer is never left unarmed — 09 §1's worst bug.

### 5.12 · The outbox poller

```ts
class Poller {
  kinds: OutboxKind[]          // served kinds: notify.webhook, pull.fetch (phase 4), export.r2, erase.r2,
                               //   + notify.email iff smtp, + notify.push iff vapid; infer.* iff an Inference adapter (none in phase 2)
  kick()  → if (!this.queued) { this.queued = true; setImmediate(() => this.drain()) }
  start() → this.timer = setInterval(() => this.kick(), 15_000)
  drain() → this.queued = false; if (this.running) { this.again = true; return } this.running = true;
            try { do { this.again = false; rows = api.leaseOutbox({ kinds, n: 10 }, sys).value;
                       for (row of rows) await this.one(row) } while (this.again || rows.length === 10) }
            finally { this.running = false }
  one(row)→ try { await HANDLERS[row.kind](row); if (row.kind !== 'pull.fetch') api.ackOutbox({ id: row.id, outcome: 'done' }, sys) }
            catch (e) { api.ackOutbox({ id: row.id, outcome: 'failed', error: `${e.name}:${e.code ?? e.status ?? ''}` }, sys) }
            // runPull acks itself and rejects only on a programming error (47 §2); every other handler is acked here
}
```

| Kind | Handler |
|---|---|
| `notify.email` | `dispatch.email(payload)`: `mailedNotices` in `smtp.ts`, over SMTP. `main.ts` lists the kind only when `BRAINDOG_SMTP_URL` and `BRAINDOG_MAIL_FROM` are both set, so without them the row is never leased and waits in `pending` (note 1) |
| `notify.push` | `dispatch.push(payload.sub, payload)` |
| `notify.webhook` | `dispatch.webhook(new URL(payload.url), payload.body, payload.signature)`; a non-2xx status throws. `payload.signature` is computed at delivery and never stored: HMAC-SHA256 over the raw `payload.body` bytes, keyed by the secret of the grant `payload.grant` names (a vault label or id, the newest live one, as `keyNamed` resolves a call's key), sent as `x-braindog-signature: sha256=<lower-case hex>`, the shape an inbound `verify: hmac_sha256` reads. The key is opened by `sealedGrant` under this job's lease (`poll()` binds the opener to the leased row) and unwrapped with `keys`. A `payload.grant` that is gone, revoked or unopenable fails the job with the reason and posts nothing; no `payload.grant` posts unsigned. `signedWebhooks(post)` in `server.ts` is this handler, and `main.ts` hands it `webhookPost()`, the pinned sender in `actions.ts`, so a running self-host posts the row |
| `pull.fetch` | `runPull(row, { http, keys, clock, record: api, ctx: systemCtx })` — 47 §2, phase 4. **It acks itself** (`applyPull` · `ackOutbox`), so `one()` skips the ack for this kind |
| `export.r2` | `snapshots.take('export')` |
| `erase.r2` | delete the blobs the payload names, or every key from `blobs.list(recId)` when it names none |

1. A kind not in `kinds` is never leased, so it waits in `pending` until the host can serve it — a self-host with no model never dead-letters an `infer.embed` row.
2. Retries are the schedule's (30 §8): a `failed` ack inserts the `retry` row; when it fires, `drainSchedule` resets the outbox row and `wake()` kicks the poller — so a retry leaves within milliseconds of falling due.
3. The 15 s tick is the belt for a lease abandoned by a crash; `leaseOutbox` already reclaims `leased_until < now`.
4. The error string carries a name and a status, never a payload (12 §8).

### 5.13 · Snapshots — nightly, signed, thirty kept

```ts
take(label): 1. id = `${compactUtc(now)}-${label}`; tmp = `${dir}/snapshots/${id}.brain.part`
             2. sql.exec('VACUUM INTO ?', tmp)                       // not inside a transaction; permitted on a file
             3. copy = openNodeSqlite(tmp); k = openRecord(copy, clock)            // 37 §2.5, 41 §2 — the copy, never the live file
                copy.transactionSync(() => for t of copy.exec("SELECT table_name FROM dog_section WHERE section = 'local'") → `DELETE FROM ${t}`)
                await k.exportBrainl(null)                                          // page 0 refreshes dog_meta and dog_manifest (41 §2); lines discarded
                bytes = signedBytes(copy)                                         // SELECT table_name, rows, sha256 FROM dog_manifest ORDER BY table_name
                                                                                  //   → one JCS array per row, LF-joined, UTF-8 (34 §5) — ten lines here
                sig = await sign(copy, bytes)                                     // below
                copy.transactionSync(() => { DELETE FROM dog_sig; INSERT INTO dog_sig (alg, key_id, public_key, sig, signed_at) VALUES ('ed25519', …) })
             4. copy.exec('VACUUM'); copy.close(); rename(tmp, `${dir}/snapshots/${id}.brain`)
             5. return { id, at, bytes: stat.size }
list():      readdir → *.brain, newest first, with size
prune(keep): unlink every file after the first `keep` of list()
restore(id): throws — a self-host restore is `braindog import` into a fresh directory (33 §9; §13 #10)
```

Signing — `sign(sql, bytes)`: `SELECT wrapped, nonce, kek_id FROM vault_key WHERE purpose = 'signing'` (a
governance row that travels; read from the copy here, from the live file for a streamed export); `KeyStore.byId(kek_id)`
(`null` → `WRONG_KEY`); AES-GCM-decrypt → the Ed25519 private key as PKCS#8; `subtle.importKey('pkcs8', …, 'Ed25519')`;
`subtle.sign('Ed25519', key, bytes)`; the public key is the `x` of `exportKey('jwk')`, raw 32 bytes base64url;
`key_id` is the first 16 hex of SHA-256(public key) (03 §4). The key pair itself is generated by `init` (§5.22). The nightly timer fires at 02:00 UTC plus `hash(slug) mod 60` minutes; it runs
`take('nightly')` then `prune(30)`; a failure calls `api.propose({ question: 'Last night's snapshot failed',
options: [{ id: 'retry', label: 'Run it now' }, { id: 'ignore', label: 'Ignore' }], body_kind: 'options', body }, systemCtx)`
— the visible item 12 §8 requires. `POST /api/snapshot` is `take('manual')`; `GET /api/snapshots` is `list()`;
`GET /api/snapshots/:id` streams the file with `Content-Disposition: attachment`.

*Amended September 28th 2026 against the tree (OPS-19 and the restore work; OPS-28 records it).* Three things above
are not what was built:

- **The clock.** The nightly copy falls due once a day at `BRAINDOG_BACKUP_AT`, `03:20` UTC by default
  (`src/backup.ts`), and is caught up on start when the machine was off at that time; it is not `02:00` plus a hash of
  the slug. The same clock copies the Directory, `VACUUM INTO <data>/directory-snapshots/<time>Z-nightly.sqlite`,
  thirty kept, because a Directory lost is every record whole and unreachable. Thirty nightly copies are kept apart
  from the thirty a person takes.
- **The signature is detached.** Each copy gets `<id>.brain.sig` beside it, signed by the record's signing key, and
  `braindog verify <copy>` checks the `.brain` against it (`src/snapshots.ts`, `apps/cli/src/verify.ts`).
- **`restore(id)` restores.** It keeps the record as a `before-restore` copy, puts the copy's tables back in one
  transaction without the credentials the live record has ended, rebuilds the search index and writes one
  `restore.pitr` event; a copy written by other migrations is refused `OUT_OF_BOUNDS` and changes nothing. Settings >
  Backups draws it, for the owner, from a sign-in within fifteen minutes. `braindog init <slug> --from <file.brainl>` is
  the restore into a fresh directory (`src/restore.ts`) ([53-SPEC-OPERATIONS](53-SPEC-OPERATIONS.md) §5.5 (c)).

### 5.14 · The live channel — phase 2 polls

`GET /api/version` → `api.version(ctx)` (33 §4), `no-store`: `version` is `MAX(event.rowid)` (41 §2, 30 §1) to an owner who reads every list, and to anybody else an unordered 53-bit hash of the id of the newest event line they are shown, or `0`, which a poller compares for change and never scans from. `/ws` answers 404 so the client falls back to 15 s
polling after its two failures (22 §5) without waiting on a handshake. The upgrade path is §10.

### 5.15 · `claimJob?wait=20` — the long poll (phase 7)

1. `wait = clamp(parseInt(query.wait ?? '0'), 0, 20)`; `deadline = now + wait × 1000`; `ac = new AbortController()`; `req.on('close', () => ac.abort())`.
2. Loop: `r = api.claimJob(body, ctx)`; `!r.ok` → answer per §6; `r.value.job` → 200 `r`.
3. `now ≥ deadline` → 200 `{ ok: true, value: { job: null, idle_ms: 1500 }, version }`.
4. `await sleep(Math.min(1500, deadline − now), ac.signal)`; aborted → return without writing.

Twenty seconds maximum, a 1.5 s check, `idle_ms` always answered — 26 §5 and 33 §11 verbatim; the runner aborts
at wait + 10 s on its side.

### 5.16 · Inbound — phase 4

1. `POST /in/webhook/<ingest-id>`: resolve the record (§5.3); store raw first — `api.arrive({ channel: 'webhook', headers, body, ingest_id }, systemCtx)` (45 names the arrival write; §12); then verify per the declaration's `verify:` — `hmac_sha256` over the raw body with the grant's secret, compared against `headers[verify.header]` (its `sha256=` prefix taken off) by `sameSecret` (`packages/host/src/ingest.ts`), which digests both sides and walks all 32 bytes — or the URL's random path segment, compared the same way; verified → the row is eligible to match; unverified → it stays `untriaged` and never matches (12 §3). Answer 202 either way. The HMAC secret is decrypted once per ingest per process and cached; the `grant.read` event that produces is the audit trail.
2. `POST /in/email/<token>`: the self-host has no MX, so email arrives as a forwarded raw RFC 5322 message from the self-hoster's provider or a script; `<token>` is the content of `<slug>/inbound.token`, written by `init` (§5.22; 32 random bytes, base64url, 0600), read on each arrival and at most once a second, its trailing newline trimmed, and compared as SHA-256 digests by `sameKey` (`packages/host/src/auth.ts`), which digests both sides before walking all 32 bytes so that no length can answer early; `api.arrive({ channel: 'email', headers, body }, systemCtx)`; the forwarding MTA's `Authentication-Results` header must show `dkim=pass` or `spf=pass` for the row to be eligible to match, and otherwise it is quarantined `untriaged`, exactly 12 §3's rule with the forwarder as the verifier (§13 #3). 202.

*Amended September 21st 2026.* Item 2 and §5.1 step 5 both said the token was read at boot, and by then
neither was true. The boot read went on September 20th 2026 in `91cda54d`: `inboundDigest`
(`apps/selfhost/src/server.ts`) is built while the record opens and reads nothing, then opens the file on the
first forwarded message and at most once every `IN_TOKEN_MS`, which is one second. A token read once at boot
is a store that can only be written to, so rotating meant a restart and revoking meant a restart; reading on
arrival makes rotation `write the file` and revocation `rm`, with no command to learn. Three rules come with
it, each with a test of its own in `apps/selfhost/test/server.test.ts`: a missing, unreadable or
whitespace-only file is a closed door rather than the digest of the empty string; the read is cached as a
promise and not as its answer, so several messages arriving in one tick wait on the one read instead of being
served the value from before it; and the trailing newline an editor leaves is trimmed, because a rotation done
by hand is the common case. The comparison had drifted earlier and is corrected in the same pass: it is
`sameKey` over SHA-256 digests, not `timingSafeEqual` over the tokens, so nothing in the process holds a value
that would open the door if it leaked. Item 1 carried the same wrong name for the webhook HMAC and is corrected
with it: `timingSafeEqual` is in no source file in this tree, and both webhook comparisons are `sameSecret`
(`packages/host/src/ingest.ts`), which digests each side before walking it for the same reason. 51 §5.4 step 3
still names `timingSafeEqual` for the Worker's half of the same door, and correcting that is not this file's to
do.

### 5.17 · Attachments

1. `POST /a` (bearer with `write`, or cookie): `Content-Length > 2 MB` → 413 before reading; read with a counter, abort at 2 MB + 1 → 413.
2. `mime = sniff(bytes)`: `89 50 4E 47` png · `FF D8 FF` jpeg · `47 49 46 38` gif · `RIFF….WEBP` webp · `….ftypavif` avif; anything else, SVG included, → 415 (12 §8: type from bytes, never the header).
3. `sha = sha256hex(bytes)`; `blobs.put(blobKey(recId, sha), bytes, { mime, bytes })` — write to `blobs/.<sha>.part`, `rename`; 200 `{ sha256: sha, mime, bytes }`. The writer never chooses the key.
4. `GET /a/<64 hex>` (no auth): `blobs.get` → 404 bare or 200 with `Content-Type: <sniffed>`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `X-Robots-Tag: noindex`, `Cache-Control: public, max-age=31536000, immutable`. The regex is what stops traversal.

### 5.18 · `/<ID>` → 302

1. Match `^/([A-Z][A-Z0-9]{0,3})([1-9][0-9]*)$` or `^/([a-z][a-z0-9_]*)%23([1-9][0-9]*)$` (34 §4; `#` arrives encoded).
2. `SG<n>` → 302 `/decide/SG<n>`; `D<n>` → 302 `/decide/D<n>` (50 confirms the decision's address); otherwise `api.get({ spoken }, ctx)` → 302 `/r/<register>/<seq>` ([19-INTERFACE](19-INTERFACE.md) §2); a refusal → 404 bare.

### 5.19 · The shell and its assets

Every unmatched GET — `/app/signin?next=` included — goes to the `handler(req, res, next)` of `@braindog/web/node`,
adapter-node's output in `build-node/` (50 §13 #1–#2; 22 §9 differences 1 and 2): it serves `/_app/immutable/*`
with `immutable`, and renders the shell through the one `render()` call of `hooks.server.ts`. `/api/*` never
reaches it because the router matched first. The image ships the built directory; the self-hoster runs no bundler.

*(Amended September 23rd 2026, checked against `apps/selfhost/src/shell.ts` at `bb13a0b8`.)* **What is built is a
static handler over `adapter-static`'s build, and it is mounted at `/app`.** `apps/web` is built with
`paths.base: '/app'` and writes every file under `build/app/`, so its pages ask for `/app/_app/…`; `shellOf` takes the
`app/` folder as its root, or `BRAINDOG_SHELL`. Under `/app` a file is that file, a missing file under `/app/_app/` is a
404, and any other path is `index.html`, which reads its own path. `/fonts/*` is read from the same folder. Every
other path is a `308` to `/app<path><query>`, whatever the request asks for: `/` because that is where a person types
the address, and `/signin` or `/r/tasks` because a bookmark or a link mailed before the move points there, and the
browser keeps a `#magic=` fragment across a `Location` that has none. `/api`, `/auth`, `/account`, `/mcp` and `/in`
stay at the root and are answered before the shell is reached, and `/app/<slug>/api/<method>` is `/api/<method>` (§4.7).

### 5.22 · `init <slug>` and `dev` — the two subcommands 48 §5.14 spawns

`init <slug> [--owner <email>]` (`BRAINDOG_OWNER` when the flag is absent):

1. Config, KEK and Directory as §5.1 steps 1–4.
2. `slug` must match `^[a-z][a-z0-9-]{1,31}$` (§13 #21); a `record_dir` row or a directory already there → one sentence on stderr, exit 1.
3. `mkdir <slug>/blobs <slug>/snapshots`; `sql = openNodeSqlite(<slug>/record.brain)`; `api = createRecordApi(…)`; `await api.kernel.applyMigrations()` — migration 0001, the thirty-one tables.
4. Keys: `dek_record`, `dek_connector` = `randomBytes(32)`; the signing pair = `subtle.generateKey('Ed25519', true, ['sign'])`, private half exported `pkcs8`; each wrapped AES-GCM under `KeyStore.current()` with a fresh 12-byte nonce → `{ wrapped, nonce, wrapped_by: 'kek', kek_id }` — the three `vault_key` rows of 30 §1 (12 §6, 03 §4: generated on first run).
5. Owner: `email = trim(lower(owner))`; `person` row or `INSERT` one (`p_` + ULID).
6. `api.createRecord({ id: 'rec_' + ULID, slug, name: slug, tz: 'UTC', locale: 'en', owner: { id, email, name: null }, keys }, systemCtx)` — 45's INTERNAL method writes `record`, the `person` mirror, `member('*', 'owner')` and the three `vault_key` rows (§12).
7. Directory: `INSERT INTO record_dir (slug, rec_id, owner_person)`, `INSERT INTO person_record`; `writeFile(<slug>/inbound.token, base64url(randomBytes(32)), { mode: 0o600, flag: 'wx' })`.
8. stderr: `record <slug> created · owner <email> · inbound email token at <slug>/inbound.token`; exit 0.

`dev [--port <n>]`:

1. `data = mkdtemp('braindog-dev-')`; `BRAINDOG_TOKEN` = `base64url(randomBytes(32))` unless set; `origin = http://localhost:<port>`.
2. `init dev --owner dev@localhost`.
3. `startServer` with a `Dispatch` whose `email` writes the message to stderr instead of SMTP — a scratch record on the developer's machine, never `serve`'s behaviour — and `Http`, `Blobs`, `KeyStore` unchanged.
4. stderr: `dev record at http://localhost:<port> · BRAINDOG_TOKEN=<value>` — the throwaway token of a throwaway directory, printed so `braindog login` and `POST /auth/token` can be tried at once.

### 5.20 · The SMTP client — `Dispatch.email`

1. `smtps:` → `tls.connect({ host, port: 465, servername: host })`; `smtp:` → `net.connect(port ?? 587)`, `EHLO`, `STARTTLS` → 220 → `tls.connect({ socket, servername: host })`, `EHLO` again. A plain `smtp:` without STARTTLS support is refused — credentials never travel in clear.
2. Expect 220; `EHLO <origin hostname>` → 250 (multi-line until `250 `); `AUTH PLAIN base64('\0' + user + '\0' + pass)` → 235 when the URL carries credentials.
3. `MAIL FROM:<from>` 250 · `RCPT TO:<to>` 250 · `DATA` 354.
4. Headers `From`, `To`, `Subject` (RFC 2047 `=?utf-8?B?…?=` when non-ASCII), `Date`, `Message-ID: <ulid@host>`, `MIME-Version: 1.0`, `Content-Type: text/plain; charset=utf-8`, `Content-Transfer-Encoding: base64`; body base64 in 76-column CRLF lines — no line can start with `.`, so no dot-stuffing; terminate `\r\n.\r\n` → 250; `QUIT` → 221.
5. Any 4xx/5xx → throw `SmtpError { code }`; socket timeout 30 s; one message per connection. `html` is ignored (§10).

*Amended September 28th 2026 (OPS-19; OPS-28 records it).* Built as `src/smtp.ts` over `node:net` and `node:tls`
with no dependency, configured by `BRAINDOG_SMTP_URL` and `BRAINDOG_MAIL_FROM` and off unless both are set. The
password is read once and never written anywhere: not in a line on stderr, not in an error the retry ladder stores,
not in the boot summary, which names the host and port alone. A server's reply text is never quoted either, since it
may echo an address; an error names the stage and the status. A header value holding a line break is refused before
it is written, and one `notify.email` names at most fifty addresses. It sends words only; the Worker's letters add
HTML.

### 5.21 · `Http.fetch` — the connector's fetch

1. `url.protocol ∈ http: https:` else throw; `redirect: 'manual'`; `signal: AbortSignal.timeout(init.timeoutMs)`.
2. `addrs = isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map(a => a.address)`; any address in `0/8 · 10/8 · 100.64/10 · 127/8 · 169.254/16 · 172.16/12 · 192.168/16 · ::1 · fc00::/7 · fe80::/10` or an IPv4-mapped form of one → throw `HttpRefused('private-range')`.
3. `globalThis.fetch(url, init)` — Node 24's `fetch` is undici; read the body with a counter, abort past 2 MB → `HttpRefused('too-large')`; return `new Response(buf, { status, headers })`.

### 5.23 · A person's script, in QuickJS

*Added September 22nd 2026 for DIRECTION 22 ("scripts run hosted and outside"), from `apps/selfhost/src/script.ts`,
`packages/host/src/script.ts`, `packages/host/src/script-try.ts`, `packages/script/src/quickjs.ts` and
`packages/kernel/src/script-run.ts`, revised the same day for wave thirty-seven at `d23ac77d`. [51-SPEC-WORKER](51-SPEC-WORKER.md) §5.19 is the Cloud's half; the record's half, and why the record
never runs a script, is [04-PACKS](04-PACKS.md) §1 and [25-CONNECTORS](25-CONNECTORS.md) §12.*

A `script` declaration is the ninth kind. When its `runs.every` is due the record writes one `script.run` outbox
row carrying the script's id, the version it fired under and its input, and nothing else. This host leases that row
in the same pass as the scheduled actions and hands it to a sandbox; what comes back is a list of writes the record
applies, or a refusal.

1. **When.** Only where `options.actions` is set, which `main.ts` turns on and a test does not unless it asks: the
   sandbox is built once, beside the executor, in `server.ts`'s `act()`, from the same `send`, `resolve` and key
   opener the executor has. Each pass hands `runActions` `holdingScript(script, record, ledger.mayRun, admissions)`,
   so a script asks the Directory's ledger on the same admission count as a `call` and a connector, and a record
   with one run left spends it once. The self-host's records are on the `selfhost` plan, which is never held. Each
   run's usage (requests, bytes, wall time) goes to `Directory.meter` with the rest of the pass.
2. **A clock, a rule or a door starts one.** Three callers each queue a `script.run`: the schedule's `fireScript`
   (`packages/kernel/src/index.ts`), a rule's `script` step for a script that says `runs.rule: true`, and a verified
   arrival at its `runs.door` (`startAtDoor` in `packages/kernel/src/script.ts`); an unverified arrival starts nothing.
   A trial of a draft is not a queued run and is step 11.
3. **The version is the one it fired under** (`prepareScript`): the declaration row of that exact version, superseded
   or not, so a run queued before an edit runs the source the owner approved when it was queued. A script with no
   active version (retired, its pack off) runs nothing and is metered `dropped`.
4. **The sandbox** is `runInQuickJs` (`@braindog/script/quickjs`): QuickJS compiled to WebAssembly
   (quickjs-ng 0.32.0 through `quickjs-emscripten-core`), a fresh module instance per run with its own
   `WebAssembly.Memory` whose `maximum` is 32 MB, a 512 KB interpreter stack, and no globals but the language's own.
   `ctx` is built inside it by the prelude from host functions and frozen; it is the only way out. The script's
   default export is called with it. The ceilings are in §8; over one before the run starts is `OUT_OF_BOUNDS`, and
   the run is refused with no writes.
5. **`ctx.fetch(url, { method, headers, body, key })`**, checked in the sandbox's host function before anything
   leaves: the URL's origin is in the script's `egress:` (compared as `URL.origin`, never as a prefix), the scheme is
   `https:`, the URL carries no user name or password, the fetch count is under `limits.fetches`, and a `key` is a
   label in `keys:`. The first three are `PULL_ORIGIN_REFUSED`, the count `OUT_OF_BOUNDS`, an undeclared key
   `FORBIDDEN`. Before any of that, a declaration whose `keys:` names the vault's `slash` key is refused `FORBIDDEN`
   and the sandbox never starts (`slashDeclared`); the kernel refuses such a script at install too. Then the host (`scriptRunner`, `packages/host/src/script.ts`) resolves the label with `grantNamed`,
   by label or id, never a revoked grant, the newest first and a tie broken on the id, as a `call`'s `keyNamed`
   does; a label with no live grant is an error in the script, *"The key "<label>" is not in the vault, so nothing
   was sent."*, and nothing is sent. Then `keyRefused`: the key goes only to the host the grant's `opens` names,
   read as a host name when it parses as one and compared exactly, with no subdomain let in, and never when the grant
   is the one labelled `slash`. A fetch that breaks it is `FORBIDDEN` and is kept: every later fetch of the run is
   refused unsent, and the run answers that refusal whatever the script returned, as the Worker's `ScriptRuns` does
   (`test/script-key-egress.test.ts`). Then `sendAction` (§8, *Scheduled actions*) over the script's own `egress:`,
   not the record's ingest origins: the origin checked again, a literal private or local host refused, `pin`
   resolving the name and refusing a private address before the socket, the socket connected to the address that
   was checked, same-origin redirects three at most, 10 s, 2 MB, and the key opened only after all of that, sent as
   `authorization: Bearer`, opened as `system` since nobody asked, and scrubbed from the answer in every spelling
   `spellingsOf` names: the bytes as sent, JSON-escaped (with `/` escaped too, as PHP does), URL-encoded in either
   case of hex, and base64 standard and URL-safe at each byte offset ([12-SECURITY](12-SECURITY.md) §6.2). Any
   method the script asked for is sent as written. No response header comes back to the script, because
   `sendAction` keeps none and scrubs only the body. A refusal here is a rejected promise the script may catch;
   caught, nothing was sent and no key opened, except after `keyRefused`, which refuses the run however it is
   handled.
6. **`ctx.record.list(register, where)` and `ctx.record.get(spoken)`** (`scriptReads`, the same function the Worker
   uses): the record's own `list` and `get`, asked as `{ kind: 'system', id: 'script:<id>@v<n>' }` with the
   script's `reads:` as its `registers` ceiling. `list` of a register outside `reads:` is `FORBIDDEN` in the
   sandbox; a `get` of a row outside it answers `null`, which is the record's answer to any caller who may not read
   it. Every `secret` field and `list<secret>` field is taken off each row, and a `where` naming a secret field
   anywhere in its tree is refused, *"… a script may not ask what a secret field holds."* Until
   `7adc7d0c` this host handed a script no reads at all, so `reads: ["clients"]` ran on the Cloud and was refused
   here.
7. **`ctx.write(register, fields)` and `ctx.update(spoken, patch, version?)`** queue; nothing is applied during the
   run. `write` checks the register against `writes:` and the count against `limits.writes` as it is called. An
   update with no version is written without comparing; a version given that is not a whole number throws in the
   prelude with a sentence naming the call, and uncaught that refuses the run.
8. **The answer is applied in one transaction** (`finishScript`): the count of writes checked first against
   `limits.writes` and never above 1,000, every create's register and every update's row's register checked against
   `writes:` before the first write, then every write through the ordinary write path as
   `script:<id>@v<n>`, one batch, in one savepoint, so the third of three refused takes the first two back. The
   outbox ack is the first statement inside it, so a run whose lease lapsed while it ran applies nothing.
9. **What is kept.** One `pull` event per run on `declaration:script.<id>`, with its outcome and usage, and
   `ctx.log`'s text on it as `to_v.log`, cut at 8 KB on a character boundary (cut in the sandbox and again here),
   with the lists the version read and wrote beside it as `to_v.lists`. The record shows the log only to an owner in a
   browser who reads every one of those lists (`logOf`, `packages/record/src/index.ts`), and `--redacted--` to every
   other reader. A refused run's note says only that it did not finish and that its log says why; the reason, which
   can quote the script's own words, goes first in the log, so a log at its cap never loses it. A
   refused run is metered as a run and never retried. Three refused runs in a row of the version now installed pause
   the script's schedule row and tell the owner once; host failures, holds and drops between them neither count nor
   break the streak, and a resume does break it. `resumeScript` (ADMIN, 30 §5) is the only way it starts again.
10. **No rehearsal.** `rehearseOnThisMachine` wraps `pin` and `send` inside `actionExecutor` and is not exported, so a
    script aimed at a local `.test` name is resolved by the system and fails as the network. That is the safe way
    round, and it is not what a `call` gets.
11. **A trial** (`script_try`, [25-CONNECTORS](25-CONNECTORS.md) §12). The record's `scriptTry` checks the draft
    with the kernel's `scriptBody`, the check an install runs, and hands this host's `tryScript` the body, the input
    and the caller's own `list` and `get`. `server.ts` wires it only when `options.actions` is set, for step 1's
    reason; without it the record answers `NOT_IN_THIS_BUILD`. It builds one `scriptRunner` per trial through
    `trialSandbox` (`packages/host/src/script-try.ts`) over `runInQuickJs`, the pinned socket, the name service and
    the key opener a scheduled run uses, so every rule in steps 4 to 7 holds. What differs: the run is version 0 and
    acts as `script:<id>@try`; it reads as the caller, not as `system`; it is handed the vault only when the caller
    is the owner signed in as a person, so for anybody else a fetch naming a key is a rejected promise with *"A trial
    opens no key for an agent…"*; and its answer stops where `finishScript` would start, so nothing is written, no
    event is kept and nothing is filed. It asks the Directory's `mayRun` first and is metered on the script's line,
    `channel: 'script'`, under an id minted for it; a sandbox that throws is counted as a failure that costs no run
    and answered as the host's 500.

---

## 6 · Refusals and errors

| Outcome | HTTP | Body |
|---|---|---|
| `Result.ok` | 200 | the `Result` as JSON |
| `Result.refusals` | 422 — 409 when `refusals[0].code === 'VERSION_STALE'` | `{ ok: false, refusals }` |
| `Result.conflict` | 409 | `{ ok: false, conflict: { version, current, actor } }` |
| no or bad credential; expired session, link or invitation; passkey `rejected`; lockout window | 401 | `{ code: 'UNAUTHORIZED' }` — and nothing else |
| `token` principal at VAULT · ADMIN · JOBS-session; VAULT with `authed_at` over 15 min; a non-owner bearer on `auth: 'cookie'` | 403 | `{ code: 'NEEDS_BROWSER_SESSION', fix }` |
| origin check failed; runner methods without the runner flag; runner elsewhere; `invite` below owner; token exchange on a multi-person Directory | 403 | `{ code: 'FORBIDDEN' }` |
| record `sick` | 503 | `{ code: 'SCHEMA_MISMATCH' \| 'SCHEMA_NEWER', fix: 'Deploy the matching build' }` — every route of that record |
| lockout reservation returned no row | 503 | bare |
| `/auth/device/*` — a pending code past ten minutes; the fifth wrong code, or a poll of a `denied` row | 422 | `DEVICE_CODE_EXPIRED` · `DEVICE_CODE_TRIES` as `{ refusals }` |
| `/auth/device/token` on a row already exchanged or revoked | 401 | `{ code: 'UNAUTHORIZED' }` |
| `POST /api/export` | 200 | `text/plain; charset=utf-8` — the `.brainl`, streamed (48 §13 D3); a refusal before the first byte is the 422 above |
| `openGrant` with a `kek_id` the `KeyStore` cannot answer | 409 | `{ code: 'WRONG_KEY' }` |
| body over 1 MB; attachment over 2 MB | 413 | bare |
| attachment not one of the five image types | 415 | bare |
| unknown `/api/<method>`, `restore`, `/ws`, a spoken id that resolves to nothing | 404 | bare |
| token bucket exhausted | 429 | bare, `Retry-After` |
| anything thrown | 500 | bare |

**Boot refusal** — `BootRefused.message` is the `SqlError('NO_SUCH_MODULE')` text `bootProbe` throws (37 §5.1),
which is 30 §13's block with the driver named:

```
This SQLite build cannot host a .brain file:
  fts5: required, not available
On macOS, Bun loads Apple's libsqlite3.dylib and is unsupported. Use Node 24.13+, which bundles its own SQLite.
driver: node:sqlite · sqlite 3.50.4
```

`ConfigError { key, fix }` prints `BRAINDOG_SMTP_URL: scheme must be smtp or smtps` and exits 1. Nothing at
boot or on the wire ever prints a token, a code, a cookie value or a payload.

---

## 7 · Performance budget

| Measure | Budget | How measured |
|---|---|---|
| Cold start, ten records, warm disk | ≤ 400 ms to `listen`; CI asserts < 1,000 ms | `test/boot.test.ts`: `performance.now()` around `startServer` over ten fixture records |
| Per record at boot | ≤ 25 ms — `openNodeSqlite` (four PRAGMAs, `measureCaps`, `bootProbe`: < 2 ms per 37 §7), `applyMigrations` no-op, `pendingWork()`, `serveMcp` | same test, per-record timings logged |
| `GET /api/version`, cookie | ≥ 2,000 req/s on Node 24.13.0, one process, 4 cores | `tools/bench/selfhost.mjs`: `fetch` in 50 concurrent loops for 5 s; reported, not gated |
| `POST /api/list`, 25 rows, cookie | ≥ 500 req/s | same script |
| Auth overhead per request | ≤ 60 µs — one indexed `SELECT` (session or token), one `member` read | `performance.now()` deltas in the request loop under `BRAINDOG_TRACE=1` |
| Timer lateness | fires within [0, 50) ms of `due_at` when the loop is idle; never early (an early tick re-arms) | `test/scheduler.test.ts`: due at +50 ms, assert fired in [50, 250) ms |
| Timer horizon | any `due_at` ≤ 2^31 − 1 ms ahead in one hop; further is chained | same test with a 40-day row and an injected `Clock` |
| Poller | `leaseOutbox` + one ack ≤ 2 ms excluding the network call; tick 15 s; kick → drain ≤ 5 ms | `test/poller.test.ts` |
| Snapshot | `VACUUM INTO` of 100 MB ≤ 2 s on NVMe; manifest of 3,000 rows ≤ 150 ms | `test/snapshots.test.ts` on the fixtures; the 100 MB figure is reported |
| Memory | ≤ 80 MB RSS idle + ≤ 4 MB per open record | `process.memoryUsage()` after boot in the perf test |
| Passkey verification | ≤ 3 ms per assertion | `test/webauthn.test.ts` |

---

## 8 · Security

| Boundary | Rule |
|---|---|
| TLS | the reverse proxy's; the process speaks HTTP on `PORT`, binds `0.0.0.0` for Docker (`-p 127.0.0.1:8080:8080` is how a self-hoster keeps it local). The cookie is `__Host-bd_s` with `Secure` on https, and `bd_s` without it on http at a loopback name, which a browser treats as secure; any other http origin gets no cookie, so a self-host off localhost needs TLS and `BRAINDOG_ORIGIN` |
| The KEK | one file, 32 bytes, 0600, created `wx`; refused when group/other-readable; read once, derived twice, zero-filled; never logged, never in a snapshot, never in an export. It is what a self-hoster must back up **separately** — Settings → backups says so in one line |
| Decryption | in the host, never the record (ADR-062): `openGrant` returns sealed material; the host unwraps the DEK, derives the grant key by HKDF, decrypts under `aad = record_id ‖ grant_id ‖ version` and returns plaintext once |
| Cookie | `HttpOnly SameSite=Lax`, `Secure` wherever the origin allows it, 30 days, rotated after 24 h of use with a 60-second grace; `authed_at` gates the vault at 15 minutes |
| The app | served from the same origin as `/auth` and `/api`, mounted at `/app` (§5.19): the built `apps/web`, or `BRAINDOG_SHELL`, with `realpath` containment, `frame-ancestors 'none'` and `nosniff` |
| CSRF | `SameSite=Lax` plus the `Origin` / `Sec-Fetch-Site` check on every cookie-authenticated non-GET (12 §8), and on every `/auth` POST, which must also be `application/json`. With no server key, a `Host` this process was not reached by is an empty 421 (DNS rebinding), and a write whose `Origin` names another site is 403 |
| Lockout | reserve before compare; ten compared and the eleventh refused with 429 and `Retry-After` for fifteen minutes, sticky; a first strike forgotten after fifteen minutes; an address cleared by a success on it; fail closed (503 on no row); bearers bypass it; `X-Forwarded-For` only behind `BRAINDOG_TRUST_PROXY=1`; device codes and share tokens on the record's own `auth_fail` |
| `/auth/*` rate | `mint:<ip>` and `device:<ip>` through the same table — ten starts per fifteen minutes; device codes additionally pay `tries` on every pending row |
| `/api/*` rate | 600/min, burst 60 per token (10 §8), in memory |
| Refusals | a 401 says `UNAUTHORIZED` and nothing else; a 500 is bare; passkeys say `rejected` internally; no CORS anywhere; `no-store` on every JSON answer |
| Hashes only | sessions, magic links, invitations, bearer tokens, device grants are stored as SHA-256 or HMAC; the tables cannot approve themselves |
| Attachments | key = content SHA-256; type from bytes; SVG 415; 2 MB checked twice; served `nosniff`, `default-src 'none'; sandbox`, `noindex`, immutable |
| `Http` | private, loopback, link-local, CGNAT and ULA ranges refused after resolution; `redirect: 'manual'`; 2 MB cap; timeout from the caller. `ponytail:` resolve-then-connect leaves a rebinding window |
| Scheduled actions | The send loop is `@braindog/host/actions`, the one the Worker runs: https to an origin an active declaration names, a host written as a literal private or local address refused, same-origin redirects three at most, 10 s, 2 MB, the ledger asked first, and the key's value scrubbed from the answer and from every refusal sentence. `src/actions.ts` passes in what only this host has, September 15th 2026: its key opener, a `pin` step in which the host is resolved before connecting and refused when any address it gives is unspecified (`0/8`, `::`), loopback (`127/8`, `::1`), private (`10/8`, `172.16/12`, `192.168/16`), link-local (`169.254/16`, `fe80::/10`), unique-local (`fc00::/7`), carrier-grade NAT (`100.64/10`), multicast (`224/4`, `ff00::/8`), reserved (`240/4`), or an IPv6 form carrying one of those (mapped, compatible, NAT64); the socket connects through a `lookup` that answers only the checked address, so no second lookup happens; every same-origin redirect hop resolved and checked again, three at most; 10 s; 2 MB. A refused address is `PULL_ORIGIN_REFUSED` with one sentence, a failure on the run's event that pauses nothing and is not retried. Each run asks the Directory's `mayRun` first and each pass's usage goes to `meter`; the record is put on the `selfhost` plan at its first pass (and `init` provisions it there), so a self-host is never held |
| Scripts | §5.23. A person's or an agent's code runs in QuickJS compiled to WebAssembly, a fresh instance and a fresh `WebAssembly.Memory` per run, never in this process's own JavaScript and never with `node:vm`. Ceilings, default and most a declaration may ask: `cpu_ms` 200 and 1,000, `fetches` 5 and 20, `wall_ms` 15,000 and 30,000, `writes` 200 and 1,000; 64 KB of source; 32 MB of memory; 8 KB of log. The memory ceiling is the WebAssembly `maximum`, because QuickJS's own limit is not a cap: measured on quickjs-ng 0.32.0, a hundred 1 MB strings pushed one at a time passed a 32 MB limit at 104,956,678 bytes. Time spent inside a host function counts against `cpu_ms` and `wall_ms`, running out of memory is `OUT_OF_BOUNDS`, and every refusal is sticky, so a script that catches one is still refused with no writes. The only way out is `ctx`; its `fetch` is the scheduled actions' send loop above over the script's own `egress:`, so the private-address rules, `pin` and the key discipline are the same code. A key is never in the sandbox: the script names a label, and the host opens the grant for one request after every check. Reads never carry a secret field and never filter on one. A key goes only to the host its vault entry opens, never the vault's `slash` key, and is scrubbed from the answer in every spelling `spellingsOf` names; a run's log is shown only to an owner who reads every list the script read and wrote, and a refused run's note carries none of the script's words. **Not built:** the install line does not say which host each key goes to, and a key whose `opens` is not among the script's origins is refused at each fetch, not at install. [12-SECURITY](12-SECURITY.md) §6.2 and §8 carry both |
| SMTP | credentials from env, not the vault — the vault cannot hold what sends its own recovery mail (12 §6); TLS required |
| Backups | a snapshot holds sealed `grant` rows and the KEK-wrapped `vault_key`; the six `local` tables are empty; it opens nothing without the KEK file. `braindog verify` proves it unchanged, and is **not built**: `verify` is specified in 48 §5.6 and is none of the eleven commands the CLI dispatches (48 §2), so nothing checks a snapshot today |
| Logs | `{ code, route, recId }` and shapes only; the `secret-grep` gate (33 §8) runs over this app's write paths and log lines |
| Multi-user | `BRAINDOG_TOKEN` exchange refuses when the Directory holds more than one person |

---

## 9 · Tests and gates

`node --test apps/selfhost/test/`. Every test boots a real server on port 0 against a temp `BRAINDOG_DATA`
with an injected `Clock` and, where mail is involved, a mock SMTP server (`node:net`, answers 220/250/235/354/250/221
and captures `DATA`).

**Boot**

| Input | Expected |
|---|---|
| a `measureCaps` stub returning `fts5: false` | `startServer` rejects `BootRefused`; message starts with the three-line block of §6; exit code 1 from the bin |
| a record whose `migration` table has version 99 | `applyMigrations` → `SCHEMA_NEWER`; server starts; every route of that slug → 503 `SCHEMA_NEWER`; another slug answers 200 |
| no `kek` file | created, 32 bytes, mode 0600 |
| `kek` with mode 0644 (POSIX) | `BootRefused`, message names the mode |
| `kek` of 31 bytes | `BootRefused` |
| `directory.sqlite` with `user_version = 2` | `BootRefused` `SCHEMA_NEWER` |
| ten fixture records | `listen` within 1,000 ms; RSS ≤ 80 MB + 4 MB × 10 |
| `main.ts init demo --owner a@b.c` on an empty data dir | exit 0; `demo/record.brain` with 31 tables and three `vault_key` rows; `record_dir`, `person`, `person_record` rows; `demo/inbound.token` mode 0600; a second `init demo` → exit 1, one sentence |
| `main.ts init Demo!` | exit 1 — the slug grammar |
| `main.ts dev --port 0` | stderr carries `BRAINDOG_TOKEN=`; `POST /auth/token` with it → a session; a magic link mint appears on stderr, not on any socket |

**Router**

| Input | Expected |
|---|---|
| walk `ROUTES` | every entry has a `group`; VAULT entries have `auth: 'cookie'`; no ADMIN entry admits a `token` principal; `ROUTES` has 49 method routes, 21 of them ADMIN, and no INTERNAL method |
| `POST /api/listGrants` with a `write` bearer | 403 `NEEDS_BROWSER_SESSION` |
| `POST /api/installPack` with `BRAINDOG_TOKEN` | reaches the record (200 or 422 from it) |
| `POST /api/list` with cookie, with bearer | 200 both; response has `Cache-Control: no-store` and no `Access-Control-*` header |
| `POST /api/list` with cookie and `Origin: https://evil.example` | 403 `FORBIDDEN` |
| `POST /api/nope` | 404 bare |
| `POST /api/restore` | 404 bare |
| `GET /api/version` | `{ version }` equal to `MAX(event.rowid)` for an owner who reads every list; for a member, a number that does not move while only lines hidden from her are written |
| `GET /ws` | 404 |
| 1 MB + 1 byte body on `/api/log` | 413 |
| 61 requests in one second with one token | the 61st is 429 with `Retry-After` |

**Auth**

| Input | Expected |
|---|---|
| `POST /auth/magic/start` with a known email | one message whose text contains `/app/signin#magic=`; `POST /auth/magic/redeem` with its token → 200 and the cookie exactly as §4.2 writes it; the `dir_link` row gone |
| the same link twice | second → 401 |
| the link at +16 min (injected clock) | 401 |
| `/auth/magic/start` with an unknown email | 200 `{}`; SMTP receives nothing |
| `/auth/magic/start` with no mail transport | 404; `GET /auth/methods` → `magic: false` |
| ten wrong keys or links from one IP, then the right one | the eleventh → 429 with `Retry-After`; at +15 min → 200 |
| `auth_fail` reservation forced to return no row (stub) | 503 |
| `POST /auth/token` with the right token, one person | 302-equivalent 200 and a session; with two persons → 403 `FORBIDDEN` |
| a session at +25 h of use | the answer carries a new cookie; the old value still answers for 60 seconds, then 401 |
| a VAULT read with a cookie whose `authed_at` is 16 min old | 403 `NEEDS_BROWSER_SESSION`, "Sign in again to open the vault."; after a new sign-in → 200 |
| open mode: `GET /api/boot` with `Host: evil.example:<port>` | an empty 421 |
| open mode: a `text/plain` POST whose `Origin` is another site | 403 `FORBIDDEN`, and nothing written |
| open mode: a session cookie that names nothing | 401 and the cookie cleared; never the owner |
| `GET /auth/invite?t=` for a fresh invitation | person created, `person_record` written, `accepted_at` set, `api.invite` called with the owner principal, 302 `/settings/recovery`; second use → 401 |

**Device grant**

| Input | Expected |
|---|---|
| `POST /auth/device { reach: 'login' }` → approve with cookie → `/auth/device/token` | `{ token, expires, reach: 'login' }` once; a `token` row with `scope: 'write'`, `expires_at` ≈ +90 d; the grant row `active` with the same hash; a second `/auth/device/token` → 401 |
| `verification_uri` in the start reply | equals `${origin}/app/settings/agents` — 48 §5.2 refuses any other origin |
| approve with a bearer | 403 `NEEDS_BROWSER_SESSION` |
| five wrong codes | rows `denied`; fifth → 422 `DEVICE_CODE_TRIES`; the denied row still exists; polling it → 422 `DEVICE_CODE_TRIES` |
| poll at +11 min while pending | 422 `DEVICE_CODE_EXPIRED`; row `expired` |
| `reach: 'runner'` exchanged; then `POST /api/claimJob` and `POST /api/createJob` | claim reaches the record; create → 403 `FORBIDDEN` |
| a runner bearer whose `last_used` is 15 days old | 401; row `expired` |
| `reach: 'export'` exchanged; `POST /api/export` with it; `POST /api/installPack` with it; the same at +11 min | 200 streamed; 403 `FORBIDDEN`; 401 |
| `reach: 'token'` exchanged; `POST /api/createToken`, `listTokens`, `revokeToken` | all reach the record as the approver's person principal with `op: 'token'` |

**Scheduler and poller**

| Input | Expected |
|---|---|
| a `schedule` row due at +50 ms via a write | `drainSchedule` observed between 50 and 250 ms |
| two writes moving `MIN(due_at)` | one live timer; `get()` equals the new minimum |
| a row due in 40 days | `set` clamps; the fire re-arms without draining; with the clock advanced 40 days it drains |
| `drainSchedule` throws once | logged through `onDrainError`; timer re-armed at +60 s |
| an `outbox` row `notify.email` | mock SMTP receives it; `ackOutbox(…, 'done')` observed; row `done` |
| mock SMTP answers 451 | `ackOutbox(…, 'failed', 'SmtpError:451')`; a `schedule` row `kind = 'retry', key = 'outbox:<id>'` exists |
| an `infer.embed` row with no Inference adapter | never leased; still `pending` after three ticks |
| `wake()` after a write | drain begins within 5 ms, before the 15 s tick |

**Snapshots**

*Amended September 16th 2026.* The two rows that call `braindog verify` cannot be written as they stand: `verify` is
specified in 48 §5.6 and is none of the eleven commands the CLI dispatches (48 §2).

| Input | Expected |
|---|---|
| `take('test')` on a fixture record | file exists; opens with `node:sqlite`; six `local` tables have zero rows; `dog_manifest` has one row per travelling table except itself and `dog_sig` (41 K25); `braindog verify <file> --key <public key>` exits 0 and prints `✓ 25 tables` |
| `POST /api/export` with cookie, piped to a file, then `braindog verify` | `text/plain`, `#dog 1` first line, `dog_sig` block last (48 §13 D2); verify exits 0 |
| 31 snapshots then `prune(30)` | 30 remain, the oldest gone |
| `POST /api/snapshot` with cookie; with bearer | 200 `{ id, at, bytes }`; 403 `NEEDS_BROWSER_SESSION` |
| the signing key unwrappable (stub `KeyStore.byId → null`) | `take` throws; `api.propose` observed with `body_kind: 'options'` |

**Long poll, inbound, attachments, ids**

| Input | Expected |
|---|---|
| `claimJob?wait=2` with no job | answers at 2.0 ± 0.1 s with `{ job: null, idle_ms: 1500 }` |
| `claimJob?wait=5`, a job inserted at 0.5 s | answers by 2.0 s with the job |
| `claimJob?wait=20`, client disconnects at 1 s | the loop stops within one tick; no further `claimJob` calls |
| `/in/webhook/<id>` with a valid HMAC; with a bad one | both 202; `arrive` called with `verified: true` / `false` |
| `/in/email/<token>` with `Authentication-Results: … dkim=pass`; without the header | 202 both; eligible / quarantined |
| `<slug>/inbound.token` replaced while the process runs, then a message a second later at each token | the replaced one 404 bare; the one now on disk 202 |
| the same file deleted; the same file truncated to whitespace | 404 both, and the whitespace is not itself a token that opens the door |
| a token file written with the trailing newline an editor leaves | 202, the newline trimmed before the digest |
| `POST /a` with a 1 KB PNG | 200 `{ sha256, mime: 'image/png', bytes: 1024 }`; file at `blobs/<sha>`; `GET /a/<sha>` → 200 with the four headers of §5.17 |
| `POST /a` with an SVG; with 2 MB + 1 | 415; 413 |
| `GET /a/<63 hex>` | falls through to the shell, not the blob route |
| `GET /D41`, `GET /tasks%237`, `GET /ZZ9` | 302 `/decide/D41`; 302 `/r/tasks/7`; 404 |
| `Http.fetch('http://10.0.0.1/')`, `('http://[::1]/')` | both throw `HttpRefused('private-range')` |
| `Http.fetch` of a 3 MB body | throws `HttpRefused('too-large')` |

**Scripts (§5.23).** `test/script.test.ts` and `test/script-reads.test.ts` drive the real `scriptSandbox`
through `runActions` with a stubbed socket and name service; the sandbox's own cases are
`packages/script/test/*.test.ts` and the record's half is `packages/kernel/test/script-run*.test.ts`.

| Input | Expected |
|---|---|
| a scheduled script that fetches with its key and writes one row | the provider hears the key as a bearer; the row is written as `script:<id>@v<n>`; the Directory ledger shows one run |
| the same script aimed at a local address, written as one or resolved to one | refused before any socket opens and before the key is opened |
| a provider that echoes the `authorization` header | the key's value is not in what the script read, nor in its log |
| a key sent to an origin in `egress:` that its vault entry does not open; a script declaring the vault's `slash` key; a provider echoing the key JSON-escaped, URL-encoded or in base64 | refused `FORBIDDEN` before the key is opened, the run refused; refused before the sandbox starts; none of those spellings in what the script read (`test/script-key-egress.test.ts`) |
| a revoked grant and a live one under the same label; then none live | the live one is opened; with none, nothing is sent |
| a script and a `call` in one pass with one run left | one of the two runs |
| a script with `reads: [clients]` lists and gets | rows come back, with every secret field taken off |
| a filter on a secret field | refused, so a grant id cannot be read back one prefix at a time |
| a read outside `reads:` | `list` refused; `get` answers nothing |
| `process`, `require`, a bare `fetch`, `import`, the `Function`-constructor escape | none reaches the host (`packages/script/test/escape.test.ts`) |
| an answer with more writes than `limits.writes`, or over 1,000 with none declared | nothing written (`packages/kernel/test/script-run-limits.test.ts`) |
| two refusals under v1, then v2 refused once | not paused: only runs of the installed version count |

**Passkeys (phase 3)** — fixture vectors committed under `test/fixtures/webauthn/`: a P-256 registration and
assertion pair, an RS256 pair, each generated once with `subtle` and stored.

| Input | Expected |
|---|---|
| register then assert, ES256 and RS256 | `passkey` row; assertion → session cookie; `sign_count` advanced |
| assertion with `origin` changed | 401; log line `reason: origin` |
| assertion with `sign_count` equal to stored, both non-zero | 401; `reason: count` |
| `attestationObject` with `fmt: 'packed'` and garbage `attStmt` | registered — the statement is ignored |
| CBOR with an indefinite-length map | 401 |

**CI rows** (33 §8): `router-groups` walks `ROUTES`; `boot-probe` is the first row above; `secret-grep` covers
`apps/selfhost/src`; `conformance-count` is `packages/ports`' and this app only consumes its adapter.

---

## 10 · Deliberate ceilings

- `ponytail:` `/ws` is a 404; the client polls `/api/version` every 15 s. Add Node's `upgrade` event plus a ~150-line RFC 6455 codec pushing `{ version, registers }` from the poller when a self-hoster reports the lag.
- `ponytail:` record resolution probes every open record for a bearer, a webhook id or a blob; fine under ten records; a hash → slug map when a host serves more.
- `ponytail:` the device poll's `interval` is a constant 5 and there is no `slow_down`; add it when a device is seen polling faster than it was told.
- `ponytail:` one KEK, no rotation set; `byId` knows one id. Rotation = a second file and a `kek_id` → file map.
- `ponytail:` `Http` resolves then connects; a DNS-rebinding window remains. The scheduled actions' executor does not have it: `src/actions.ts` hands the shared loop a `pin` and a transport that connects to the address it checked (§8). Close it with an `undici` `Agent` whose `connect` re-checks the address when `undici` is ever a dependency.
- `ponytail:` SMTP is AUTH PLAIN over TLS, text/plain, base64, one message per connection; `html` is dropped. Add LOGIN and multipart when a provider needs them.
- `ponytail:` the per-token bucket is a `Map` in memory; a restart forgets it. That is the correct cost for one owner's box.
- `ponytail:` passkey challenges live in memory for five minutes; a restart forgets a ceremony in flight.
- `ponytail:` no Inference adapter; `infer.*` rows wait in `pending`. A BYO key is the same adapter with a base URL (33 §1) when tier B lands.
- `ponytail:` `idle_ms` is a constant 1500; the runner backs off itself.
- `ponytail:` the lockout keys on `X-Forwarded-For`'s first value; the reverse proxy is the boundary that makes it honest.
- `ponytail:` the nightly hour is 02:00 UTC + a slug-hashed minute, not the record's `tz`.
- `ponytail:` `Snapshots.restore` throws; restore is `braindog import` into a fresh directory, offline.
- `ponytail:` attachments are the five image types; PDF when a register asks for it.
- `ponytail:` inbound email trusts the forwarder's `Authentication-Results`; DKIM verification in-process (~150 lines, DNS + RSA) when a self-hoster runs their own MX.
- `ponytail:` on Windows the KEK mode check is skipped; ACL inspection when a Windows self-host matters.
- `ponytail:` a second WebAssembly instance per run is about 2 ms on the machine it was measured on, which a run every fifteen minutes can pay; a pool when a record runs scripts often enough to see it.

Seventeen, counted.

---

## 11 · Dependencies

| Kind | Package | Version | Why |
|---|---|---|---|
| runtime | `@pushforge/builder` | 2.0.5 | Web Push (VAPID + RFC 8291) for `notify.push` — the package ADR-046 already permits; the self-host uses it for the same reason the Worker does (§13 #9) |
| workspace | `@braindog/ports` · `@braindog/kernel` · `@braindog/record` · `@braindog/mcp` · `@braindog/connect` | `workspace:*` | §1 |
| workspace | `@braindog/script`, its `./quickjs` subpath, which brings `quickjs-emscripten-core` 0.32.0 and `@jitl/quickjs-ng-wasmfile-release-sync` 0.32.0 | `workspace:*` | the sandbox of §5.23; [31-STACK](31-STACK.md) §2 row 23 admits the edge |
| workspace | `@braindog/web` — its `./node` subpath, adapter-node's `handler` in `build-node/` | `workspace:*`, built in the image | the shell and its assets (§5.19). 50 §2.1 calls the package `private` with no `exports` map while 50 §13 #1 names `@braindog/web/node`; this spec imports the latter and the audit reconciles 50 |
| dev | `@types/node` 24.13.0 · `typescript` 6.0.3 | pins of 31 §3 | type-check only; tests are `node --test` on `.ts` |

`better-sqlite3` is not a dependency here: `packages/ports` loads it lazily when `BRAINDOG_SQLITE` asks (37).
No other runtime package; a new one is a new ADR.

---

## 12 · Build order

**Needs first:** 37 `packages/ports` (`openNodeSqlite`, `bootProbe`, `blobKey`, the port types); 41
`packages/kernel` (`openRecord`, the `Kernel` interface, the envelopes); 45 `packages/record` (`createRecordApi`,
`RecordApi`); 48 `apps/cli` for the phase-2 round trip (`init` spawns §5.22; `verify` reads §5.13's file). 44
`packages/mcp` and 47 `packages/connect` arrive in phases 6 and 4; their routes are in `ROUTES` from day one and
answer 404 until the import exists.

**Unblocks:** 50 `apps/web` (a server to run against), 52 (the boot, router and lockout rows), 53 (backup,
restore and key-rotation procedures reference §5.13 and §4.4).

Symbols this spec takes from its neighbours — the interface-agreement lens checks each; 45 is not yet drafted,
so its row is what this spec needs from it:

| From | Symbol | Where it is stated |
|---|---|---|
| 37 | `openNodeSqlite(path): NodeSql` at `./node-sqlite` (`:memory:` is the memory adapter; runs `measureCaps` and `bootProbe`, throws `SqlError('NO_SUCH_MODULE')`) · `bootProbe(caps, driver)` · `blobKey(recId, sha256)` · `SqlError` | 37 §2.4–§2.5, §5.1 |
| 41 | `openRecord(sql, clock): Kernel`; `Kernel.applyMigrations() · refused() · pendingWork() · version() · declarations() · exportBrainl(cursor)`; the `CallContext` and `Result` types; `dog_manifest` excludes itself and `dog_sig` (K25) | 41 §2, §13 #1 |
| 44 | `serveMcp(request, surface, ctx \| null, { maxBodyBytes? }): Promise<Response>`, with `gate(request)` and `unauthorized()` beside it, from `@braindog/mcp/http`; `surface` is the `RecordApi` | `loop/research-agent-path.md` §1.7 |
| 47 | `runPull(job: OutboxRow<'pull.fetch'>, deps: { http, keys, clock, record, ctx }): Promise<PullResult>` — acks itself | 47 §2 |
| 48 | `apps/selfhost/src/main.ts` with `init <slug>` and `dev`; `POST /auth/device { slug?, reach, label, subject? }` → `DeviceCode`; `POST /auth/device/token { device_code }` → `DevicePoll`; `Reach`; operation grants and `device_grant.reach`; `createToken listTokens revokeToken`; `POST /api/export` as streamed `text/plain`; `#dog` / `#table` block order with `dog_sig` last | 48 §4.2, §5.2–§5.3, §5.12, §5.14, §13 D1–D3 |
| 50 | `@braindog/web/node` → `handler(req, res, next)`; `/app/signin?next=`; `/decide/[id]`; `/settings/<area>` — `agents` for the code entry (`verification_uri`), `recovery` for the first passkey; `/r/<register>/<seq>` | 50 §2.2, §5.13, §13 #1–#2; 19 §2 |
| 45 | `createRecordApi({ sql, scheduler, clock }): RecordApi & { kernel: Kernel }`; `drainSchedule`, `leaseOutbox({ kinds, n })`, `ackOutbox({ id, outcome, error })`, `applyPull`; `createRecord({ id, slug, name, tz, locale, owner, keys: { record, connector, signing } })` writing `record`, the `person` mirror, `member('*', 'owner')` and the three `vault_key` rows; `invite({ person, levels })` at acceptance; `arrive({ channel, headers, body, ingest_id?, verified })` — INTERNAL, the arrival write 33 §4 describes and 30 §5 does not list; the three token methods of 48 §5.12 | 30 §5, 33 §2, §9; this spec §5.8, §5.16, §5.22 |

---

## 13 · Decisions taken here

| # | Decision | Amend |
|---|---|---|
| 1 | **Passkeys are specified here (§5.10) and land in phase 3 with the web app; phase 2 closes with the magic link and the token exchange.** WebAuthn is a browser ceremony and phase 2 has no browser to drive it; ES256 and RS256, no attestation, registration behind a session | BUILD.md phase 3 row: "+ `/auth/passkey/*`"; 12 §3 self-host row |
| 2 | `POST /auth/token` exchanges `BRAINDOG_TOKEN` for an owner session — the browser bootstrap without SMTP, and the session a first passkey is registered behind; refused when the Directory holds more than one person | 33 §6 Auth row; 12 §3 |
| 3 | **Inbound email on a self-host is a forwarding webhook**, `POST /in/email/<token>`, raw RFC 5322 in the body; the forwarding MTA's `Authentication-Results` pass is what makes a row eligible to match; no SMTP receive, no DKIM in-process | 33 §4 (a row); 07 §1 self-host column: "a forwarding webhook, or your own MX" |
| 4 | **Phase 2 polls; `/ws` is 404.** The client's own 15 s fallback is the live channel; a WebSocket is §10's first line | 33 §4 `/ws` row: "Cloud; self-host phase 2: 404, the client polls" |
| 5 | **`wake()` kicks the in-process poller** (`setImmediate`) instead of being a no-op; the poller's tick is **15 s** and is the belt for abandoned leases | 33 §1 `wake()` comment; 30 §8 doorbell row; 09 §1 self-hosted paragraph |
| 6 | **The SMTP client is ~90 lines over `node:tls`** — implicit TLS on 465 or STARTTLS on 587, AUTH PLAIN, text/plain base64; configured by `BRAINDOG_SMTP_URL` and `BRAINDOG_SMTP_FROM`; without it, `/auth/methods` says so and `notify.email` is not leased | 33 §6 (an SMTP row) |
| 7 | `BRAINDOG_ORIGIN` — the public origin, for magic-link URLs, the WebAuthn `rpId` and the CSRF origin check; default `http://localhost:<PORT>` | 33 §6 |
| 8 | **How a request names its record on a multi-record host** (§5.3): one record is implicit; a bearer is found by hash; a session row carries the record; a share, email or webhook path carries its own; `/a/<sha256>` is content-addressed across records | 33 §4 (one sentence after the table); 33 §6 Data row |
| 9 | `notify.push` on the self-host through `@pushforge/builder@2.0.5`, VAPID keys at `<data>/vapid.json` | ADR-046: "the Worker and the self-host" |
| 10 | **Snapshots are exports**: the `VACUUM INTO` copy has its six `local` tables emptied, is vacuumed again, manifested and signed, so `braindog verify` prints 25 tables; `Snapshots.restore` throws and `restore` has no route — restore is `braindog import` into a fresh directory. **Not built**: neither `verify` nor `import` is among the eleven commands the CLI dispatches today (48 §2), so nothing prints the 25 tables and no directory is restored this way yet | 33 §6 Snapshots row: "→ strip `local` → manifest → sign"; 33 §9 Restore row: "self-host: offline, no route" |
| 11 | `POST /a` uploads (the table listed only the GET); `POST /api/snapshot`, `GET /api/snapshots[/:id]` are the two owner routes 12 §8 names | 33 §4 (three rows) |
| 12 | `invite` is the **acceptance-time** record write, called with the owner principal from `record_dir.owner_person`; minting is a Directory write and an email by the host | 33 §10 Invite row; 30 §5 ADMIN note |
| 13 | A share recipient is a principal: `{ kind: 'share'; id; slug }`; tokens are HMAC-signed with `HKDF(KEK, 'braindog/share')`, stateless, terminally revoked by `share.close` | 33 §2 `CallContext.principal`; 30 §10 share row |
| 14 | **48 §13 D1's device wire is adopted whole** — `POST /auth/device` / `POST /auth/device/token`, `Reach`, `device_grant.reach`, operation grants of ten minutes resolved to the approver with `ctx.op`, ADMIN admitting them by reach; two things this host adds: 48's `subject` is stored in 30 §1's `ua` column (the second free-text column the approver reads), and `verification_uri` is `${origin}/app/settings/agents` (`${origin}/settings/agents` before push A of the one-domain move) | 30 §1 (`device_grant.ua` comment: "label · subject"); 33 §10 Device grant row; 50 (a code-entry control at `/settings/agents`) |
| 15 | **Sign-up is closed on a self-host**: persons come from `braindog init` and invitations; an unknown email at `/auth/magic/start` gets 200 and no mail | 33 §10 Sign up row: "Cloud; self-host: `init` and invitations" |
| 16 | `session.authed_at` (a ninth column, not a ninth table) records the last proof; rotation every 24 h of use with a sliding 30-day expiry never moves it; VAULT requires it within 15 minutes | 33 §10 `session` row |
| 17 | Lockout constants: ten compared and the eleventh refused, fifteen minutes, a capped counter, a count forgotten fifteen minutes after its first strike, an address cleared by a success; keys `ip:` `email:` `mint:` `device:`; device codes and share tokens on the record's `auth_fail` | 12 §8 (the numbers) |
| 18 | `CallContext.session` comes from `X-BrainDog-Session`, `-Client-Id`, `-Host`, `-Repo` on `/api/*`; `/mcp` reads `_meta` | 33 §2; 48 sends them |
| 19 | The host signs: the final page of a streamed `POST /api/export` and every snapshot use one `sign()` over the record's `vault_key(purpose = 'signing')`, unwrapped with the KEK | 33 §9 Export rows: "the Worker or the self-host signs" |
| 20 | One sick record does not stop the host: `SCHEMA_MISMATCH` / `SCHEMA_NEWER` is per record, 503 on its routes only | 33 §9 Migrations row (self-host clause) |
| 21 | `main.ts` carries `init <slug> [--owner]` and `dev [--port]` (48 §5.14's contract); a slug is `^[a-z][a-z0-9-]{1,31}$`; `init` generates the record DEK, the connector DEK and the Ed25519 signing pair, wraps them under the KEK and hands them to `createRecord`; the inbound-email capability lives at `<slug>/inbound.token` (0600); `dev` prints mail and its throwaway `BRAINDOG_TOKEN` to stderr | 33 §5 `init` row (the owner flag, the token file); 34 §4 (a slug grammar row); 33 §6 |
| 22 | `POST /api/export` answers streamed `text/plain` on this host too — 48 §13 D3's one exception to the `Result` envelope — and the host, not the record, emits the `dog_sig` line last (#19 names the key) | 33 §4 `/api/<method>` row (the export exception); 48 §13 D2 (who writes `dog_sig`) |
| 23 | `createToken` · `listTokens` · `revokeToken` are routable ADMIN methods on this host, reached by a cookie or a `token` operation grant | 30 §5 ADMIN row (the three methods 48 §5.12 calls; 41 → 44 becomes 47 methods) |
| 24 | **A script runs on this host in QuickJS compiled to WebAssembly**, one instance per run, leased with the scheduled actions and admitted on their count; its `ctx.fetch` is their send loop, and its reads are the record's own `list` and `get` as the script's actor. Not `node:vm`, which is not a boundary, and not `isolated-vm`, a native build on every self-hoster's machine (`loop/research-shell-scripts.md` §4) | 31 §2 row 23 (done); 12 §8 (the ceilings) |

Twenty-four, counted.

---

## 14 · Done when

- [ ] `node apps/selfhost/src/main.ts init demo --owner a@b.c`, then `… serve`, on a clean `BRAINDOG_DATA`: creates `kek` (0600) and `vapid.json`, and answers `GET /api/version` with the record's version.
- [ ] A build with `fts5: false` refuses with the exact block of §6 and exit code 1 (`boot-probe` green).
- [ ] `main.ts init demo` creates the record, its three wrapped keys, the Directory rows and `inbound.token`; `main.ts dev` serves a scratch record and prints its token.
- [ ] `ROUTES` passes `router-groups`: every route grouped, no bearer at VAULT, no `token` principal at ADMIN, 49 method routes, 21 of them ADMIN, none INTERNAL.
- [ ] Magic link round-trips through the mock SMTP; the token exchange works with no SMTP; the lockout refuses the eleventh attempt and fails closed on a missing reservation.
- [ ] Device flow on 48's wire: `login` yields a `write` token once; `runner` a 90-day bearer; `export` a ten-minute operation grant that reaches `export` and nothing else; five wrong codes deny; expiry after ten minutes.
- [ ] A write re-arms the timer; the timer drains within 250 ms of `due_at`; a 40-day row is clamped and chained.
- [ ] The poller leases, dispatches to the mock SMTP and acks; a failure produces the `retry` row; `infer.*` is never leased.
- [ ] A nightly snapshot verifies with `braindog verify` at 25 tables; thirty are kept. **Not tickable today**: `verify` is none of the eleven commands the CLI dispatches (48 §2), so the verifying half of this box has nothing to run.
- [ ] `SCHEMA_NEWER` on one record gives 503 on its routes and 200 on another's.
- [ ] `POST /a` stores a PNG and refuses an SVG; `GET /a/<sha>` carries the four headers.
- [ ] `GET /D41` and `GET /tasks%237` redirect; the shell answers everything else from `apps/web/build`.
- [ ] `secret-grep` finds nothing in `apps/selfhost/src`; no response ever carries `Access-Control-Allow-Origin`.
- [ ] The phase-2 round trip of BUILD.md — `init → pack install → create → export → verify` — passes against this process over HTTP. **Not tickable today**: of those steps the CLI dispatches `init` alone, `pack install`, `export` and `verify` being none of its eleven commands (48 §2).
- [ ] Every amendment in §13 is applied to its design document in the same revision.

---

*Previous: [48-SPEC-CLI](48-SPEC-CLI.md). Next: [50-SPEC-WEB](50-SPEC-WEB.md).*
