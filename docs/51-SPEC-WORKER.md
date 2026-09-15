# 51 · `apps/worker` — specification

The single Cloudflare deployment: one stateless Worker in front of three Durable Object classes, the Cloud
implementation of the nine ports, and the `wrangler.jsonc` that binds them. Derives from
[33-CONTRACTS](33-CONTRACTS.md) §1, §4, §7, §9–§11 · [01-ARCHITECTURE](01-ARCHITECTURE.md) ·
[30-BLUEPRINT](30-BLUEPRINT.md) §8, §13 · [26-BYO-INTELLIGENCE](26-BYO-INTELLIGENCE.md) §2 ·
[22-FRONTEND](22-FRONTEND.md) §5 · [09-ALARMS](09-ALARMS-AND-NOTIFICATIONS.md) §1 · [12-SECURITY](12-SECURITY.md) §6, §8 ·
[02-DATA-MODEL](02-DATA-MODEL.md) §9–§10 · [16-DECISIONS](16-DECISIONS.md) ADR-021, ADR-044, ADR-061 ·
[31-STACK](31-STACK.md) §3, §8. Phase 5 of [BUILD.md](../BUILD.md). Licence `Apache-2.0`.

> **Platform facts.** Everything the design documents verified is cited. Every platform fact this spec needs and
> the documents do not state is written as an assumption in §13 and marked *verify*; nothing below asserts one.

---

## 1 · Purpose and boundary

**Does.** Terminates every Cloud surface of 33 §4 — `/api/*`, `/mcp`, `/in/webhook/*`, inbound email, `/a/*`,
`/s/*`, `/ws`, `/auth/*`, `PUT /a` — builds the pre-context the record turns into a `CallContext`, and forwards
one RPC to the right Durable Object. Hosts the three classes of 33 §7 as thin shells over `packages/record`,
`packages/spark` and the Directory flows. Implements the DO `Sql` adapter over `ctx.storage.sql` and the Cloud
side of the other eight ports. Drains the outbox from a queue, fires the alarm, takes the nightly `.dogl.age`,
deletes a customer, restores a bookmark.

**Refuses.**

| Refuses to | Because |
|---|---|
| hold logic — a DO file over 100 lines is a review finding | 31 §8: *logic has leaked out of a package and into a runtime* |
| make any outbound call from `Record` except `OUTBOX_Q.send({ record })` | 01 §2, ADR-002, ADR-021 |
| let a plaintext credential or the KEK leave the Worker isolate | 12 §6, ADR-062 |
| emit a CORS header, cache an API answer, or serve a 401 body beyond its code | 12 §8 |
| know a token scope, a level or an actor — the record derives them | 33 §2, 30 §10 |
| provision anything per customer — naming is provisioning | 01 §2 |
| import another app | 35 §2 |

**Imports.** `@braindog/ports` (types, `blobKey`, `preflight`, `mapSqlError` hooks), `@braindog/record`
(`createRecord`, `Method`, `GROUPS`, `./directory`), `@braindog/spark` (`createSpark`), `@braindog/mcp`
(`serveMcp`, `gate` and `unauthorized` from `./http`), `@braindog/connect` (`ingest`), `cloudflare:workers`, `age-encryption`, `@pushforge/builder`.
`apps/web/build` is an asset directory, never an import. Rows 1–4 and 7–11 of 31 §2 are reachable; nothing else.

---

## 2 · Public API

The Worker has no importers. Its public surface is the `Ingress` default export, the three DO classes' RPC, the
adapter, the ports, and the bindings.

```ts
// apps/worker/src/index.ts — the Ingress of 33 §1
export default {
  fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response>;
  queue(batch: MessageBatch<OutboxMessage>, env: Env, ctx: ExecutionContext): Promise<void>;
  email(msg: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void>;
  scheduled(ev: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void>;
} satisfies ExportedHandler<Env>;
export { Record } from './do/record.ts';
export { Spark } from './do/spark.ts';
export { Directory } from './do/directory.ts';
```

```ts
// apps/worker/src/do/record.ts — ≤ 100 lines. RPC = the six groups, through ONE dispatcher (§13 D1)
export class Record extends DurableObject<Env> {
  call<M extends Method>(method: M, args: Args<M>, pre: PreContext): Promise<Result<Ret<M>>>;
  alarm(): Promise<void>;                                   // → record.alarm(): 09 §1 handler, re-arm, wake
  fetch(req: Request): Promise<Response>;                   // the /ws upgrade only; anything else 404
  webSocketMessage(ws: WebSocket, m: string | ArrayBuffer): void;   // client never speaks: close 1003
  webSocketClose(ws: WebSocket): void; webSocketError(ws: WebSocket): void;
  bookmark(): Promise<string>;                              // ctx.storage.getCurrentBookmark()
  pitr(atMs: number): Promise<never>;                       // getBookmarkForTime → onNextSessionRestoreBookmark → abort
  destroy(): Promise<void>;                                 // deleteAlarm() then deleteAll() — 02 §9
}
```

```ts
// apps/worker/src/do/spark.ts — ≤ 100 lines
export class Spark extends DurableObject<Env> {
  dispatch(args: SparkArgs, pre: PreContext): Promise<Result<SparkResult>>;   // packages/spark's one entry (46)
  wake(jobId: string): Promise<void>;                      // push { t: 'job', id } to every runner socket
  fetch(req: Request): Promise<Response>;                  // the /ws/runner upgrade only
  webSocketMessage(ws: WebSocket, m: string | ArrayBuffer): void;
  webSocketClose(ws: WebSocket): void; webSocketError(ws: WebSocket): void;
}
```

```ts
// apps/worker/src/do/directory.ts — ≤ 100 lines. One instance: idFromName('directory')
export class Directory extends DurableObject<Env> {
  session(sidHash: string): Promise<{ person: PersonId; records: RecordId[]; rotate: boolean } | null>;
  resolve(slug: string): Promise<RecordId | null>;
  listRecords(cursor?: string): Promise<{ ids: RecordId[]; cursor?: string }>;   // pages of 500
  auth(call: AuthCall): Promise<AuthResult>;               // the flows of 33 §10, one dispatcher
}
```

```ts
// apps/worker/src/sql-do.ts
export function doSql(storage: DurableObjectStorage): Sql;   // 33 §1's Sql over ctx.storage.sql; caps measured at open
export function mapWorkerdError(e: unknown): SqlErrorCode;   // the thirteen codes, §5.9 table

// apps/worker/src/ports-cf.ts — the Cloud side of the other eight ports (33 §1)
export function doScheduler(ctx: DurableObjectState, env: Env, record: RecordId): Scheduler;
export const clock: Clock;                                   // { now: () => Date.now() }
export function r2Blobs(bucket: R2Bucket): Blobs;
export function aiInference(env: Env): Inference;            // env.AI through the gateway
export function cfDispatch(env: Env): Dispatch;              // EMAIL binding · VAPID via @pushforge/builder · fetch
export function cfHttp(): Http;                              // fetch, redirect: 'manual', private ranges refused, 2 MB
export function keyStoreOf(kek: KekBinding | undefined): Promise<KeyStore | null>;   // built in src/keys.ts: KEK, a Worker secret or a Secrets Store binding; null when unbound; kekId = 34 §5
export function r2Snapshots(env: Env, rec: DurableObjectStub<Record>, id: RecordId): Snapshots;

// apps/worker/src/auth.ts
export function preContext(req: Request, env: Env, surface: Surface): Promise<{ rec: RecordId; pre: PreContext } | Response>;
export function shareToken(env: Env): { mint(p: SharePayload): Promise<string>; verify(t: string): Promise<SharePayload | null> };
```

Error contract: every DO method returns a value or a `Result`; a `throw` crossing an RPC is a bug the tests in §9
catch. `doSql` throws `SqlError { code: SqlErrorCode }` and nothing else.

---

## 3 · Files

Eight source files and one config, counted. Tests under `apps/worker/test/`.

| File | Responsibility | Size |
|---|---|---|
| `src/index.ts` | the router of 33 §4 as one `switch` on `(method, path)`, the four entry points, the `/a/*` sniff table, `claimJob?wait=`, telemetry | ~260 lines |
| `src/auth.ts` | bearer and cookie parsing, `PreContext`, the share token, the origin check | ~90 |
| `src/outbox.ts` | the queue consumer: lease → dispatch by kind → ack; the snapshot job; customer deletion | ~140 |
| `src/sql-do.ts` | `doSql`, `mapWorkerdError`, `measureCaps` | ~80 |
| `src/ports-cf.ts` | eight port implementations | ~150 |
| `src/do/record.ts` | the `Record` class — shell, socket, push | ≤ 100 |
| `src/do/spark.ts` | the `Spark` class — shell, runner socket | ≤ 100 |
| `src/do/directory.ts` | the `Directory` class — shell | ≤ 60 |
| `wrangler.jsonc` | §4.6 in full | 40 |
| `vitest.config.ts` · `test/*.test.ts` | §9 | — |

`src/do/*.ts` hold platform calls only — `acceptWebSocket`, `setAlarm`, `deleteAll`, bookmarks. Every decision
about *what* to do is in a package.

---

## 4 · Data structures

### 4.1 · Bindings

```ts
interface Env {
  RECORD: DurableObjectNamespace<Record>; SPARK: DurableObjectNamespace<Spark>; DIRECTORY: DurableObjectNamespace<Directory>;
  OUTBOX_Q: Queue<OutboxMessage>; BLOBS: R2Bucket; AI: Ai; ASSETS: Fetcher;
  KEK?: string | SecretsStoreSecret; KEK_PREV?: SecretsStoreSecret;   // one key, never one per customer (12 §6); unset is no key store (§8 rule 3)
  EMAIL: SendEmail; TELEMETRY: AnalyticsEngineDataset; RL_READ: RateLimit; RL_WRITE: RateLimit;
  AI_GATEWAY: string; AGE_RECIPIENT: string; PUBLIC_HOST: string;
  SESSION_SECRET?: string; PROVISION_KEY?: string; AUTH_MAIL_FROM?: string;   // two secrets and the sign-in sender (§5.8)
}
```

### 4.2 · The pre-context and the call

```ts
type PreContext = {
  auth:
    | { kind: 'person'; id: PersonId }                 // the Directory verified the cookie; the record reads `member`
    | { kind: 'bearer'; hash: string }                 // SHA-256 hex of the secret half; the record reads `token` / `device_grant`
    | { kind: 'share'; id: string; slug: string }      // the Worker verified the MAC; the record checks `share.close`
    | { kind: 'system' } | { kind: 'spark' };
  session?: { spoken?: string; client_id?: string; host?: string; repo?: string };   // 33 §2
  now: number;
  surface: 'web' | 'mcp' | 'cli' | 'email' | 'webhook' | 'alarm';
};
```

Invariants a test can check: the Worker never places `scope`, `level`, `name` or an actor in a `PreContext`; a
`person` auth is only ever built after `Directory.session()` returned a row naming that person **and** the
request's record; a `bearer` auth carries a hash, never the secret; `system` is built only by `queue`, `email`,
`scheduled` and `alarm`, never from a request.

### 4.3 · Wire shapes

| Shape | Form | Rule |
|---|---|---|
| Bearer | `Authorization: Bearer <rec_id>.<secret>` — `^rec_[0-9A-HJKMNP-TV-Z]{26}\.[A-Za-z0-9_-]{43}$` | the record id routes; `sha256(secret)` is what `token.hash` and `device_grant.token_hash` hold. 32 random bytes, shown once (§13 D3) |
| Session cookie | `__Host-bd_s=<43 chars>; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax` | `dir_session.id_hash` is HMAC-SHA-256 of `s:` and the id, under the key HKDF derives from `SESSION_SECRET`; re-issued when `rotated_at` is over 24 h old, the old id honoured for 60 seconds (33 §10) |
| The record | on the session row, not in a cookie | the record the session opened: one the person owns, else the first they joined; `/auth/switch` will move it (§13 D4, amended) |
| Session hint | `BrainDog-Session: {"spoken":"S42","client_id":"…","host":"…","repo":"…"}` | ASCII JSON ≤ 512 bytes; malformed → ignored; MCP carries the same under `_meta` and 44 parses it |
| Share token | `/s/<rec_id>.<b64url JCS{id,slug,exp,k}>.<b64url HMAC-SHA-256>` | key = `HKDF-SHA-256(KEK, info 'braindog/share')`; `k` = `kek_id`; `exp` RFC 3339; verified in the Worker, revocation checked by the record (§13 D5) |
| WebSocket push | `{ "version": 1234, "registers": ["obligations", "decision"] }` | outgoing only; never a row — 22 §5 |
| Runner push | `{ "t": "job", "id": "<job id>" }` | a doorbell; the claim is `claimJob()` over HTTP — 33 §11 |
| Queue message | `{ "record": "rec_…" }` | the id and nothing else — 01 §2; a redelivery is a no-op |
| R2 attachment key | `rec_<id>/<sha256>` via `blobKey(recordId, sha256)` — the only constructor | 12 §2, 03 §8 |
| R2 snapshot key | `rec_<id>/snapshots/<label>-<YYYY-MM-DD>.dogl.age` and `…/snapshots/latest.dogl.age` | written through the binding, not `Blobs`; `customMetadata { bookmark, rows, bytes, at }` — 12 §8 |
| Runner attachment | `{ runner_id, record_id }` ≤ 16,384 bytes | 26 §2.3; job bodies stay in `job` |
| Telemetry point | blobs `[kind, surface, tool, outcome, sha256(rec ‖ month-salt)[:16]]`, doubles `[ms, rows, neurons, bytes]` | 08 §5; never a field value — the `telemetry-allowlist` gate |

### 4.4 · `wrangler.jsonc` — in full

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "braindog",
  "main": "apps/worker/src/index.ts",
  "compatibility_date": "2026-08-01",          // floor 2026-02-24: deleteAll() deletes the alarm — the compat-date gate
  "compatibility_flags": [],                   // no nodejs_compat: node:sqlite is a stub under it (22 §9); nothing here needs node:*
  "workers_dev": false,
  "routes": [{ "pattern": "brain.dog", "custom_domain": true }],
  "durable_objects": { "bindings": [
    { "name": "RECORD",    "class_name": "Record" },
    { "name": "SPARK",     "class_name": "Spark" },
    { "name": "DIRECTORY", "class_name": "Directory" } ] },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["Record", "Spark", "Directory"] }],
  "queues": {
    "producers": [{ "binding": "OUTBOX_Q", "queue": "braindog-outbox" }],
    "consumers": [{ "queue": "braindog-outbox", "max_batch_size": 10, "max_batch_timeout": 5, "max_retries": 3 }] },
  "r2_buckets": [{ "binding": "BLOBS", "bucket_name": "braindog-blobs" }],
  "ai": { "binding": "AI" },
  "secrets_store_secrets": [
    { "binding": "KEK",      "store_id": "<store-id>", "secret_name": "braindog-kek" },
    { "binding": "KEK_PREV", "store_id": "<store-id>", "secret_name": "braindog-kek-prev" } ],
  "send_email": [{ "name": "EMAIL" }],
  "analytics_engine_datasets": [{ "binding": "TELEMETRY", "dataset": "braindog_telemetry" }],
  "ratelimits": [
    { "name": "RL_READ",  "namespace_id": "1001", "simple": { "limit": 600, "period": 60 } },
    { "name": "RL_WRITE", "namespace_id": "1002", "simple": { "limit": 120, "period": 60 } } ],
  "triggers": { "crons": ["17 3 * * *"] },
  "vars": { "AI_GATEWAY": "braindog", "AGE_RECIPIENT": "age1<recipient>", "PUBLIC_HOST": "brain.dog" },
  "assets": {
    "directory": "apps/web/build", "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*", "/mcp", "/a", "/a/*", "/in/*", "/s/*", "/ws", "/ws/*", "/auth/*", "/account/*"] },
  "observability": { "enabled": true }
}
```

The skeleton in 33 §7 lacked `send_email`, `analytics_engine_datasets`, `ratelimits`, `triggers`, `vars`,
`KEK_PREV` and `not_found_handling`; §13 D18 amends it. Every binding shape is a §13 assumption until
`wrangler deploy --dry-run` accepts the file.

---

## 5 · Algorithms

### 5.1 · Request → `PreContext` (`auth.ts`)

1. Read `Authorization`. If present and it matches the bearer grammar of §4.3: `rec = <rec_id>`,
   `auth = { kind: 'bearer', hash: hex(sha256(secret)) }`. A header present but malformed → **401** `UNAUTHORIZED`.
2. Else read `__Host-bd_s`: `DIRECTORY.auth({ flow: 'session', sid })`. Anything but a 200 → **401** with the cookie
   cleared, and never the demo principal (a 429 or a 503 passes through as itself). The record is `who.record`,
   the record's own `access(person)` gives the level (none → **403** `FORBIDDEN`), and `provedAt` is
   `who.provedAt`. A rotation's `Set-Cookie` rides on the eventual response. The order is `src/session.ts`'s:
   bearer, cookie, then the demo for a credential-free read, else **401**.
3. Cookie auth on a mutating method (`POST`, `PUT`) requires `Origin` equal to `https://<PUBLIC_HOST>` or
   `Sec-Fetch-Site: same-origin` → else **403** `FORBIDDEN` (12 §8 CSRF). Bearer requests skip this.
4. `session` from `BrainDog-Session` if valid; `now = Date.now()`; `surface` from the route: `/api/*` cookie → `web`,
   `/api/*` bearer → `cli`, `/mcp` → `mcp`.
5. Rate limit: bearer → `RL_READ.limit({ key: hash })`, and for `create update propose log` also `RL_WRITE`;
   cookie → `RL_READ.limit({ key: 'p:' + person })`. `success: false` → **429**, bare body, `Retry-After: 60`.
6. Return `{ rec, pre }`. The stub is `env.RECORD.get(env.RECORD.idFromName(rec))`. The record builds
   `CallContext` from `pre` and refuses `UNAUTHORIZED` when the hash matches no live row (§13 D2).

### 5.2 · `POST /api/<method>` and the four GET aliases

1. `method = path.slice(5)`; `GROUPS[method]` undefined or `INTERNAL` → **404** bare. The `router-groups` gate walks
   `GROUPS` from `@braindog/record`; the Worker holds no method list of its own.
2. Body over 1 MB (`Content-Length` first, then bytes) → **413** bare. Parse JSON; a parse failure → **400** bare —
   no refusal code exists for a malformed body, and the adapter's `SYNTAX` is not a refusal.
3. `preContext` (§5.1). A bearer at a `VAULT`, `ADMIN` or session-half `JOBS` method → **403** `NEEDS_BROWSER_SESSION`
   in the Worker *and* in the record — the router check is what the gate asserts; the record's is the one that holds.
4. `claimJob` with `?wait=<s>`: clamp `s` to 20; loop: `r = await stub.call('claimJob', args, pre)`; return on a job or
   when `s` elapses, sleeping 1,500 ms between calls; abort with the request signal (33 §11).
5. `r = await stub.call(method, args, pre)` → HTTP by §6.1. Headers on every answer: `Cache-Control: no-store`,
   `Content-Type: application/json`, no `Access-Control-*`.
6. `ctx.waitUntil(stub.call('observe', batch, SYSTEM))` for the read-side signals the Worker sees — `page.render`,
   `register.read`, `search.empty` when `search` returned zero rows (24 §4.2) — and one telemetry point.
7. GET aliases: `/api/boot` → `boot`, `/api/pages/:slug` → `page`, `/api/schema/:register` → `schema`,
   `/api/version` → `{ version }` from `whatsNew`'s cursor head; the polling fallback of 22 §5.
8. Additions to 33 §4 this spec needs (§13 D6–D8): `PUT /a` (upload), `POST /api/snapshot`, `GET /api/snapshots`.

### 5.3 · `POST /mcp`

1. `servesMcp(pathname)` is decided before `doorOf`, so a cookie is never read and the demo never answers. `/mcp`
   is one path with no subpaths.
2. `gate(request)` from `@braindog/mcp/http`: **405** with `Allow: POST` for any other method, **403** for any
   `Origin`, **415** for a body that is not `application/json`. Headers only; nothing of the body is read.
3. `bearerOf(request, 'mcp', …)` in `src/session.ts`, the same path `/api` takes: the bearer's record id, the
   Directory's `knows`, the record's `verify(bearer, 'mcp')`, which records `last_surface = 'mcp'`, then
   `access(person)`. A missing, malformed or unknown bearer is **401** with `WWW-Authenticate: Bearer` and the
   JSON-RPC body `{ id: null, error: -32001 'UNAUTHORIZED' }`; a person no longer on the record is **403**
   `FORBIDDEN`, as on `/api`.
4. `inward(request, ctx)` to the record's object, whose `fetch` answers `/mcp` with `serveMcp(request, api, ctx)`:
   **413** above 1 MB, the body parsed, the mirrored headers held to it, then the core's `handle`. The JSON-RPC
   parse, the fourteen tools, resources and `instructions` are 44's; the Worker never sees a tool name.
5. Not built yet: the rate limit keyed on the token hash (§5.1 step 5), `Mcp-Name` in the telemetry blob, and
   `_meta.session`.

### 5.4 · Arrivals — `/in/webhook/<rec_id>/<ingest-id>/<token>` and `email()`

Webhook:
1. Parse the path; a malformed segment → **404** bare. Read the body to ≤ 1 MB → else **413**. `sha = hex(sha256(body))`.
2. `v = await stub.call('ingestVerify', { ingest_id }, SYSTEM)` → `{ kind: 'path', token }` |
   `{ kind: 'hmac_sha256', header, sealed }` | refusal (unknown ingest → **404**).
3. `path`: `verified = timingSafeEqual(token, v.token)`. `hmac_sha256`: unseal through `KeyStore` and the connector DEK
   (12 §6, ADR-052), `verified = HMAC-SHA-256(key, body)` equals the named header, constant-time.
4. `await stub.call('arrive', { channel: 'webhook', ingest_id, headers, body, sha256: sha, verified }, SYSTEM)` —
   one transaction in the record: store raw, match, extract, write, outbox rows, ring (30 §4 steps 1–12b; 07 §2).
   An unverified payload is stored `untriaged` and never matched (12 §3). Duplicate `(channel, sha256)` → one row.
5. **200** with an empty body, always, once stored. No parsing in the handler (07 §2).

Email:
1. `slug = local part of msg.to`; `rec = await DIRECTORY.resolve(slug)`; `null` → `msg.setReject('no such record')`.
2. `msg.rawSize > 5 MiB` → reject (01 §5). Read `msg.raw` fully; `sha`; lower-case the header names (30 §1).
3. `verified = Authentication-Results carries dkim=pass and spf=pass` (§13 A14).
4. `arrive({ channel: 'email', headers, body, sha256, verified })` as above. Nothing else; nothing parsed.

### 5.5 · `GET /a/<sha256>` and `PUT /a`

Read:
1. Path must match `^/a/([0-9a-f]{64})$` → else **404**. The record is the session's, else `?r=<rec_id>`
   (a shared page's images); neither → **404**. No session check: the URL is the capability (12 §8).
2. `obj = await BLOBS.get(blobKey(rec, sha))`; `null` → **404**.
3. Headers: `Content-Type` from `obj.httpMetadata.contentType` (set from bytes at upload), `X-Content-Type-Options:
   nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `X-Robots-Tag: noindex`,
   `Cache-Control: private, max-age=31536000, immutable`. Stream `obj.body`.

Write:
1. `preContext`; a bearer needs scope `write` — the Worker cannot know that, so the upload is confirmed by a
   `call('whoami', {}, pre)` whose principal must be a person or a `write` token → else **403**.
2. `Content-Length` absent or over 2,097,152 → **413** before reading; read; length mismatch → **400**.
3. Sniff the first 16 bytes: PNG `89 50 4E 47 0D 0A 1A 0A` · JPEG `FF D8 FF` · GIF `47 49 46 38` · WebP
   `52 49 46 46 ?? ?? ?? ?? 57 45 42 50` · AVIF `?? ?? ?? ?? 66 74 79 70 61 76 69 66`. Anything else → **415**; an
   SVG is anything else (12 §8).
4. `sha = hex(sha256(bytes))`; `BLOBS.put(blobKey(rec, sha), bytes, { httpMetadata: { contentType }, customMetadata:
   { bytes } })` — the writer cannot choose the key. Return `{ sha256, mime, bytes }`; the `file` value is then
   written through `create`/`update` by the caller.

### 5.6 · `GET /s/<token>`

1. `p = await shareToken(env).verify(token)`; `null` or `exp < now` → **404** bare — a wrong capability looks like nothing.
2. `r = await stub(p.rec).call('page', { slug: p.slug }, { auth: { kind: 'share', id: p.id, slug: p.slug }, now, surface: 'web' })`.
   The record refuses a closed share (`share.close` is terminal — 20 §2) and applies the link's projection as
   `ctx.scope` (20 §1). A refusal → **404**.
3. Serve the shell from `ASSETS` unchanged; the shell fetches `/api/pages/:slug` with the same token in
   `Authorization: Share <token>`, and the Worker treats `Share` exactly as steps 1–2, for `page` only. Two lines.

### 5.7 · `GET /ws` — the live channel (22 §5, ADR-044)

1. `Upgrade` must be `websocket` → else **426**. Cookie auth as §5.1 steps 2–3 (no `Origin` on an upgrade; check
   `Sec-WebSocket-Protocol` is absent and `Origin` equals the host).
2. `return stub.fetch(new Request('https://do/ws', { headers: { Upgrade: 'websocket', 'X-Person': person } }))` — an
   upgrade cannot ride an RPC method (§13 A2). The internal header is trusted: only the Worker reaches the stub.
3. In `Record.fetch`: `[client, server] = Object.values(new WebSocketPair())`; `this.ctx.acceptWebSocket(server)`;
   `return new Response(null, { status: 101, webSocket: client })`. The constructor already called
   `ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))`, so keepalives never wake the object.
4. After every `call()` whose `Result` is `ok` with `version > this.#ver`, and after every `alarm()`:
   `{ registers } = this.#rec.changed(this.#ver)`; `this.#ver = version`;
   `for (ws of this.ctx.getWebSockets()) ws.send(JSON.stringify({ version, registers }))`. `#ver` is initialised
   from `MAX(event.rowid)` in the constructor, so a wake after hibernation pushes only what changed since.
5. `webSocketMessage` → `ws.close(1003, 'read-only')`: the client never speaks, and an inbound message bills 20:1.
   `webSocketClose`/`webSocketError` → nothing to clean; there is no attachment.
6. Reconnect jitter (5–30 s), the 15 s polling fallback and `.overloaded` handling are the client's — 22 §5, 50.

### 5.8 · `/auth/*` — the Directory (33 §10)

`/auth/*` is `serveAuth` from `packages/host/src/auth.ts` over the Directory's one RPC, `Directory.auth(call)`, with
the origin from `PUBLIC_HOST` and the lockout's address from `cf-connecting-ip`, which Cloudflare writes and a
caller cannot. The routes are 33 §4's table; this host serves all of them but `/auth/token`, the self-host's
server key, and adds the operator's two.

**Shipped switched off.** Without `SESSION_SECRET` (32 characters or more) the Directory holds no MAC key:
`/auth/methods` answers `why: 'not-configured'` and every other `/auth` route is 404. Mail goes out only when
`AUTH_MAIL_FROM` and the `EMAIL` binding (Cloudflare Email Service, which reaches any address) are both set, by
`ctx.waitUntil` and never awaited.

| Route | Flow | Notes |
|---|---|---|
| `POST /auth/passkey/register/options` · `/register` | `passkey.register.options` · `passkey.register` | a live session, in place of attestation |
| `POST /auth/passkey/assert/options` · `/assert` | `passkey.assert.options` · `passkey.assert` | every failure is the one body, 401 "That did not sign you in." (12 §8) |
| `POST /auth/magic/start` · `/redeem` | `magic.start` · `magic.redeem` | start is always 200 and mails only a live person; the link is `/signin#magic=`, redeemed by a POST |
| `GET /auth/methods` · `/session` · `/passkeys`; `POST /auth/passkey/remove` · `/logout` | as named | a logout deletes the row and clears the cookie |
| `POST /auth/provision` | (the operator's) | a `PROVISION_KEY` bearer; `{ slug, email, name? }` → the record first, then its Directory rows (D21), then a 24-hour claim link handed back to the operator and never mailed |
| `POST /auth/claim/mint` | `claim.mint` | a `PROVISION_KEY` bearer; a new claim link for a person already provisioned |
| `POST /auth/device/start` · `/poll` · `/approve`; `/auth/invite`; `/auth/switch` | none yet | specified, not built |

Self-service sign-up is not built: a hosted record is made by the operator today. A record provisioned while `KEK`
is bound is made with its three keys wrapped under it. One provisioned without it has no vault keys, and binding
`KEK` later does not give it any: it reads, writes and signs people in, cannot seal a grant or sign an export, and
its key doors answer the sentence in §8 rule 3.

The lockout (12 §8) is 49 §5.5's, over `dir_fail`: reserve before compare; ten compared and the eleventh a **429**
with `Retry-After`, sticky for fifteen minutes; a first strike forgotten after fifteen minutes; an address cleared
by a success on it; a reservation that returns no row is **503**, fail closed. Agent tokens never touch `/auth/*`,
so they bypass it (32 §2.3).

**`/account/*`, September 15th 2026.** `GET /account/usage?from=YYYY-MM-DD&to=YYYY-MM-DD` is `serveAccount` from the
same file, over the Directory's RPC `Directory.usage(person, range)`. It reads the session cookie and nothing else,
and answers what the records that person owns used. With no cookie, or without `SESSION_SECRET`, it is 401
`UNAUTHORIZED`.

### 5.9 · The DO `Sql` adapter (`sql-do.ts`)

```ts
export function doSql(storage: DurableObjectStorage): Sql {
  let depth = 0;
  const sql = storage.sql;
  const caps = measureCaps(sql);                       // once, at open
  return {
    exec(query, ...params) {
      preflight(query, params, caps);                   // shared with the Node adapter: 37 — TOO_MANY_PARAMS, STATEMENT_TOO_LONG,
                                                        //   TXN_STATEMENT_FORBIDDEN, MULTI_STATEMENT_PARAMS, LIKE_TOO_LONG, INT_OUT_OF_RANGE
      try { return wrap(sql.exec(query, ...params)); } catch (e) { throw new SqlError(mapWorkerdError(e)); }
    },
    execScript(text) { try { sql.exec(text); } catch (e) { throw new SqlError(mapWorkerdError(e)); } },
    transactionSync(fn) {
      if (depth) throw new SqlError('TXN_STATEMENT_FORBIDDEN');        // does NOT nest — 33 §1
      depth++; try { return storage.transactionSync(fn); } finally { depth--; }
    },
    caps,
  };
}
```

1. `preflight` runs the same checks in the same order as the Node adapter, so the DO never reaches workerd for a
   ceiling both know: parameter count (101 → `TOO_MANY_PARAMS`), UTF-8 statement bytes (100,001 →
   `STATEMENT_TOO_LONG`), statement prefix `BEGIN|COMMIT|END|ROLLBACK|SAVEPOINT|RELEASE` after whitespace and
   comments → `TXN_STATEMENT_FORBIDDEN`, a second statement with any parameter → `MULTI_STATEMENT_PARAMS`, a bound
   string at a `LIKE ?`/`GLOB ?` position over 50 bytes → `LIKE_TOO_LONG`, a `number` integer outside ±2⁵³ or a
   `bigint` outside 64 bits → `INT_OUT_OF_RANGE`. Case #1 (a boolean or `undefined` param) is refused by `preflight`
   with the code 37 assigns; the DO rejects it too, so the two agree either way. *That is the "Node refuses first" of
   30 §13 made symmetric: both adapters refuse before the driver.*
2. `wrap(cursor)` returns 33 §1's `Cursor`: `toArray`, `one`, `first`, `rowsRead`, `rowsWritten`, iteration.
   `one()` on zero or several rows is a contract violation, not a driver error, so it throws `SqlError('UNKNOWN')` —
   the same code the Node adapter uses for it. Every `ArrayBuffer` value is re-wrapped as `Uint8Array` so `Row` holds
   `Param` types only (§13 A9).
3. `measureCaps(sql)`: `sqlite = SELECT sqlite_version()`; `fts5 = EXISTS (SELECT 1 FROM pragma_compile_options WHERE
   compile_options = 'ENABLE_FTS5')`; `json = SELECT json('{}') = '{}'`; the five ceilings from `DO_LIMITS` (30 §13);
   `nestedTransactions: false`; `expressionIndexUsed` = after migration 0001, `EXPLAIN QUERY PLAN SELECT id FROM entry
   WHERE json_extract(fields,'$._rule') = ? AND json_extract(fields,'$._parent') = ? AND json_extract(fields,'$._each') = ?`
   mentions `USING INDEX entry_created_by` — a real partial expression index every record carries (30 §1), so the probe
   is honest, read-only and microseconds. `fts5 === false` sets the module-level refusal like `SCHEMA_MISMATCH`, with
   the 30 §13 message naming `ctx.storage.sql` as the driver.
4. `mapWorkerdError(e)` matches `e.message` in this order; the texts are §13 A10 until the conformance trace pins them:

| workerd message contains | Code |
|---|---|
| `too many SQL variables` | `TOO_MANY_PARAMS` |
| `LIKE or GLOB pattern too complex` | `LIKE_TOO_LONG` |
| `Expression tree is too large` | `EXPR_TOO_DEEP` |
| `too many terms in compound SELECT` | `COMPOUND_TOO_LONG` |
| `too many columns` | `TOO_MANY_COLUMNS` |
| `no such module` | `NO_SUCH_MODULE` |
| `statement too long` / `string or blob too big` | `STATEMENT_TOO_LONG` |
| `transaction-related statements` | `TXN_STATEMENT_FORBIDDEN` |
| `must contain only one statement` | `MULTI_STATEMENT_PARAMS` |
| `constraint failed` (UNIQUE, NOT NULL, CHECK, PRIMARY KEY) | `CONSTRAINT` |
| `syntax error` · `no such table` · `no such column` · `no such function` | `SYNTAX` |
| anything else | `UNKNOWN` — logged as the SQLite result code only, never the message |

Thirteen codes, closed; `INT_OUT_OF_RANGE` never comes from the driver because `preflight` catches it, which is the
point — the DO loses precision silently (30 §13).

### 5.10 · The alarm (`Record.alarm`)

1. `await this.#rec.alarm()` — 09 §1's handler in `packages/record`: one `transactionSync` claiming ≤ 100 due rows,
   dispatching by kind, writing outbox rows; then `await scheduler.set(MIN(due_at))` in a `finally`; then
   `await scheduler.wake()` when any outbox row is `pending`. The record package owns the order; the host only calls it.
2. `doScheduler`: `get → ctx.storage.getAlarm()`, `set(at) → (await getAlarm()) === at ? nothing : setAlarm(at)`,
   `clear → deleteAlarm()`, `wake → env.OUTBOX_Q.send({ record })`. `wake` is the only I/O the object performs and
   the record calls it last (30 §4 step 12b).
3. After `alarm()` returns: the push of §5.7 step 4. A throw before re-arm cannot happen — the `finally` is the
   package's; the platform's own retry of a throwing `alarm()` (09 §1) is a second ladder this host neither adds to
   nor suppresses.
4. *Scheduled actions, September 15th 2026.* After the drain, `Record$.alarm` calls
   `api.kernel.runActions(execute, { limit: ALARM_RUNS, scheduler })` with the executor of `src/actions.ts`. It sends
   https only, to an origin an active declaration names; refuses a host written as a literal private or local address
   with `postable()`; follows same-origin redirects, three at most; and gives a run 10 seconds and 2 MB. The key is
   opened from the Worker key store (`keyOpener`, over `vault.ts`'s `openSealed`) only when `KEK` is bound. Unbound, an
   action that names a key sends nothing, and its run event carries *"This host holds no key store yet, so the key
   "<label>" was not opened and nothing was sent."* The kernel records that as a failure it does not retry and does
   not pause, so the row runs again at its next interval and sends nothing again until `KEK` is bound. `ALARM_RUNS` is
   5: at most 20 subrequests and 50 seconds an alarm, inside `loop/research-scheduled-actions.md` §2.3's 800
   subrequests and ten minutes. A pass that throws is logged by its message and not rethrown, because the drain has
   already re-armed. Before each run the executor asks the Directory's `mayRun(record, action)` over RPC. A record on
   the hosted plan at its monthly allowance answers `held`: nothing is sent, and the action waits for the first of
   next month. After the pass, each metered run goes to `Directory.meter`, which counts a run's event once.

### 5.11 · The queue consumer (`outbox.ts`)

```
queue(batch):
  for rec of distinct(batch.messages.map(m => m.body.record)):
    stub = RECORD.get(idFromName(rec))
    rows = await stub.call('leaseOutbox', { kinds: KINDS, n: 10 }, SYSTEM)     // one statement; expired leases included — 30 §8
    for row of rows:
      try   { result = await dispatch(row, rec, stub, env); await stub.call('ackOutbox', { id: row.id, state: 'done', result }, SYSTEM) }
      catch (e) { await stub.call('ackOutbox', { id: row.id, state: 'failed', error: sentence(e) }, SYSTEM) }
    if rows.length === 10: await env.OUTBOX_Q.send({ record: rec })           // more may wait: ring again
  batch.ackAll()
```

1. A redelivered or duplicate message leases nothing and acks nothing — the idempotency test of §9. Two consumers on
   the same record cannot double-send: the lease is one `UPDATE … RETURNING` and the record is single-writer.
2. `dispatch` by `row.kind` (30 §8's nine):

| Kind | Does | Lease |
|---|---|---|
| `notify.email` | `cfDispatch.email(payload)` → `EMAIL.send(...)` | 60 s |
| `notify.push` | `cfDispatch.push(payload.sub, { title, url })` — `@pushforge/builder` signs VAPID, `fetch(endpoint)`; a 404/410 acks `done` with `{ gone: true }` so the record drops the subscription | 60 s |
| `notify.webhook` | `cfDispatch.webhook(url, body, sig)` — `sig` = HMAC-SHA-256 under the grant the payload names, unsealed as §5.4 step 3; `redirect: 'manual'`; a 3xx or ≥ 400 is a failure | 60 s |
| `pull.fetch` | `ingest(decl, { http: cfHttp(), secret })` from `@braindog/connect` — placeholders, `expect:`, cursors, ≤ 2 MB per body, ≤ 50 pages; every page → `arrive({ channel: 'pull', … })`; an `expect:` failure throws without advancing the cursor (25 §9) | 300 s |
| `export.r2` | §5.12 | 300 s |
| `erase.r2` | `for sha of payload.sha256s: BLOBS.delete(blobKey(rec, sha))`; a prefix with no keys is `done` | 300 s |
| `infer.embed` | `aiInference.embed(payload.texts)` → `result = { model, dims, vectors }` — the record writes `entry_vec` **on ack** | 120 s |
| `infer.prose` | `aiInference.complete(payload)` → `result = { text, usage }` — the digest row is written on ack | 120 s |
| `infer.draft` | `aiInference.complete(payload)` → `result = { body, usage }` — `propose` by actor `spark` on ack | 120 s |

3. The three `infer.*` write-backs ride `ackOutbox.result` (§13 D9): the Worker holds no record-writing call but
   `arrive`, `leaseOutbox`, `ackOutbox` and `observe`. Retry is the schedule's ladder (30 §8, 09 §1); the consumer
   never re-leases on a clock of its own. Per-record lease bound for `pull.fetch`: ≤ 5 rows per invocation and
   `rows × max_pages ≤ 200` subrequests (25 §9).
4. `aiInference`: `complete` → `env.AI.run(model, { messages, tools, max_tokens, response_format }, { gateway: { id:
   env.AI_GATEWAY } })`; `embed` → `env.AI.run('@cf/baai/bge-m3', { text }, …)` → each vector quantised
   `clamp(round(x × 127), −127, 127)` into an `Int8Array` (33 §1). The gateway's payload retention is off
   (`cf-aig-collect-log-payload: false`, 11 §3). BYO keys (tier B) are the same adapter with a different base URL via
   `fetch` — later, 46.
5. `cfHttp.fetch(url, init)`: refuse before the call when `url.protocol !== 'https:'` or the host is a literal
   private, loopback or link-local address, `localhost`, or ends `.internal`/`.local` (25 §7 rule 5; the platform
   blocks private egress as well); `redirect: 'manual'`; `signal: AbortSignal.timeout(timeoutMs)`; `Content-Length`
   over 2,097,152 → refuse before reading; count bytes while reading and abort at the cap.

### 5.12 · The nightly snapshot — `export.r2` (`r2Snapshots.take`)

1. Trigger: `scheduled()` at `17 3 * * *` → `DIRECTORY.listRecords(cursor)` in pages of 500 → per record
   `stub.call('snapshot', { label: 'nightly' }, SYSTEM)` — an ADMIN method the owner also reaches as
   `POST /api/snapshot` (*snapshot now*, 12 §8) — which inserts one `export.r2` outbox row and rings. Under 900
   records this is one cron invocation (25 §9's subrequest ceiling); `ponytail:` line in §10 for more.
2. `bookmark = await stub.bookmark()` — the PITR bookmark the snapshot pairs with.
3. Page the dump: `cursor = null; do { p = await stub.call('export', { cursor }, SYSTEM); parts.push(p.chunk);
   bytes += p.chunk.length; cursor = p.cursor } while (cursor)` — pages of ≤ 1,000 rows (33 §9). `bytes > 40 MiB` →
   throw with the sentence *"snapshot over 40 MiB — raise the ceiling or stream (§10)"*.
4. Sign: the last page carries `dog_manifest` rows; the signed bytes are the canonical projection ordered by
   `table_name` (34 §5); the key is `vault_key(purpose = 'signing')`, unwrapped in the Worker with
   `secretsKeyStore.byId(kek_id)`; `crypto.subtle.sign('Ed25519', …)`; the `dog_sig` header line is filled in.
5. `ct = await new age.Encrypter().addRecipient(env.AGE_RECIPIENT).encrypt(bytes)` — `age-encryption@0.3.1`.
6. `BLOBS.put(key, ct, { customMetadata: { bookmark, rows, bytes, at } })` for the dated key and again for
   `latest.dogl.age`. Then list `rec_<id>/snapshots/`, keep the 30 newest dated keys, delete the rest.
7. Return `{ key, bytes, rows, bookmark }`; the record's ack writes the `export` event with the counts. A failure acks
   `failed` with the sentence; the ladder ends in a `dead` row and a `suggestion` — the visible item 12 §8 requires.
8. `GET /api/snapshots` (cookie, ADMIN) lists the prefix with `customMetadata` — *what is kept, with counts*.
   `Snapshots.list`/`prune` are these two steps; `restore` is §5.14.

### 5.13 · Customer deletion (02 §9)

1. `deleteCustomer(env, rec)` — called by operations (53), no public route: `stub = RECORD.get(idFromName(rec))`.
2. `await stub.destroy()`: `deleteAlarm()` then `deleteAll()` — belt and braces; the `compat-date` gate is the
   load-bearing half (09 §1). Spark holds no durable state in phase 5, so it has no `destroy()`; one arrives with
   conversation storage (46, §10).
3. Page `BLOBS.list({ prefix: 'rec_<id>/', cursor })` and `BLOBS.delete(keys)` in batches of 1,000 until empty —
   attachments and snapshots both.
4. `DIRECTORY.auth({ flow: 'record.forget', rec })` removes `record_dir` and `person_record` rows.
5. The test in §9 asserts no alarm (`getAlarm() === null`), no R2 object under the prefix, and no Directory row.

### 5.14 · Restore (33 §9)

1. `POST /api/restore { at }` (cookie, ADMIN) → `stub.pitr(Date.parse(at))`: `b = await ctx.storage.getBookmarkForTime(at)`;
   `await ctx.storage.onNextSessionRestoreBookmark(b)`; `ctx.abort()`. The call rejects — the object restarted.
2. The Worker catches the rejection and calls `stub.call('restore', { bookmark: b, at }, pre)` on the fresh object,
   which writes the `restore.pitr` event into the restored storage. Two steps because an event written before the
   restore would be rewound with everything else (§13 D15).

### 5.15 · Spark — the runner socket (26 §2, 33 §11)

1. `GET /ws/runner` with a device-grant bearer: `preContext`; `w = await stub.call('whoami', {}, pre)` must be a
   runner principal → else **403**. Then `SPARK.get(idFromName(rec)).fetch(new Request('https://do/ws/runner',
   { headers: { Upgrade: 'websocket', 'X-Runner': w.id } }))`.
2. `Spark.fetch`: accept as §5.7 step 3 with `acceptWebSocket(server, ['runner'])`;
   `server.serializeAttachment({ runner_id, record_id })` (≤ 16,384 bytes — 26 §2.3). Auto-response ping/pong is set
   in the constructor.
3. After a successful `createJob` (a JOBS method on the record), the Worker calls `SPARK.wake(jobId)`:
   `for (ws of ctx.getWebSockets('runner')) ws.send(JSON.stringify({ t: 'job', id }))`. The runner then calls
   `POST /api/claimJob` over HTTP — one claim path for the socket, the long-poll and the plain poll.
4. `webSocketMessage` → the runner sends nothing but pings, which never arrive here → `close(1003)`.
   `webSocketClose` → nothing: a claimed job past `lease_until` is *shown* as lost by the list, and `claimJob` may
   reclaim it — no lease state in Spark, no Spark alarm (§13 D13).
5. `dispatch(args, pre)` → `this.#spark.dispatch(args, pre)` over ports `{ sql: doSql(ctx.storage), clock,
   inference: aiInference(env) }` — tier A jobs and, later, conversation. Every write it wants is a `propose` or
   `suggest` the Worker relays to the record with `auth: { kind: 'spark' }`; the `spark-actor` gate proves nothing else.

### 5.16 · The conformance job (33 §3, 30 §13)

1. `apps/worker/test/conformance.test.ts` under `@cloudflare/vitest-plugin`: `runInDurableObject(stub, (_, state) =>
   { const sql = doSql(state.storage); for (c of cases) trace[c.id] = c.requires?.some(k => !sql.caps[k]) ?
   skip(c) : c.run(sql) })` with the plain-array cases and the six-method `Assert` from `@braindog/ports`.
2. With `REGENERATE=1` the job writes `packages/ports/conformance/reference.json`; otherwise it asserts equality with
   the committed file — the DO is the reference because it is the tighter implementation.
3. It prints every skip with its reason and the case count; the `conformance-count` gate compares counts across the
   Node host and this one. Case #1 (`Param` asymmetry), #2 (`MULTI_STATEMENT_PARAMS`), #3 (`SAVEPOINT`), the
   `fts5-phrase` case and the expression-index probe all run here — the Q12 half the corpus still owes (17 Q12).

### 5.17 · The deploy-parity gate (33 §8, 18 §6)

1. `deploy.yml` runs `wrangler deploy`, then `tools/gates/deploy-parity.mjs` (52): `GET https://<PUBLIC_HOST>/` and
   `/_app/version.json` with `Cache-Control: no-cache`; `sha256(body)` must equal `sha256(apps/web/build/index.html)`
   and `…/_app/version.json`. A mismatch fails the workflow — three green deploys have served stale assets before.
2. What this spec guarantees for it: neither path is in `run_worker_first`, so `ASSETS` serves the built bytes
   unchanged; the Worker never rewrites, compresses or injects into a shell response. `/` is the prerendered shell in
   `build/` (§13 A16).

### 5.18 · Telemetry and logging

1. One `TELEMETRY.writeDataPoint` per request in `ctx.waitUntil`, the shape of §4.3; the record id is
   `sha256(rec ‖ salt)` with a salt that rotates monthly (08 §5). Never a field value, a query, a prompt or a payload.
2. `console.log(JSON.stringify({ t, code, rec, method, status, ms }))` on refusals, conflicts, 5xx and every queue
   dispatch: the code, the ids, the shape — never a value (35 §2, 12 §8). `observability.enabled` keeps them.

---

## 6 · Refusals and errors

### 6.1 · `Result` → HTTP

| `Result` / condition | HTTP | Body |
|---|---|---|
| `{ ok: true }` | 200 | the `Result` as is |
| `{ ok: false, refusals }` whose first code is `UNAUTHORIZED` | 401 | `{ "refusals": [{ "code": "UNAUTHORIZED" }] }` — only this |
| first code `FORBIDDEN` or `NEEDS_BROWSER_SESSION` | 403 | the refusals |
| first code `WRONG_KEY` | 409 | the refusals — 12 §6.1: never "corrupt" |
| `{ ok: false, conflict }` — `VERSION_STALE` | 409 | `{ "conflict": { "version", "current", "actor" } }` |
| first code `SCHEMA_MISMATCH` or `SCHEMA_NEWER` — the module-level refusal set by `applyMigrations` or a failed FTS5 probe | 503 | the refusals; `Retry-After: 300` |
| any other refusal | 422 | the refusals |
| rate limit tripped, or the lockout's `n > 10` | 429 | bare; `Retry-After` |
| the lockout's reservation returned no row | 503 | bare — fail closed |
| unknown route, INTERNAL method, malformed capability, wrong record for `/a` | 404 | bare |
| bad JSON, `Content-Length` mismatch | 400 | bare |
| body over its cap (1 MB API, 2 MB upload, 5 MiB email) | 413 | bare |
| an unsniffable or SVG upload | 415 | bare |
| `Upgrade` missing on `/ws` | 426 | bare |
| a throw the Worker did not expect | 500 | bare — 12 §8 |

Only codes from 30 §6 appear in a body; the Worker mints none. The adapter's thirteen never reach HTTP: a
`SqlError` escaping a record method is a 500 and a bug.

### 6.2 · What the Worker itself refuses

| Condition | Answer | `fix` a person reads |
|---|---|---|
| bearer at `VAULT`, `ADMIN`, session-half `JOBS` | 403 `NEEDS_BROWSER_SESSION` | *Open this in the browser; no token can do it.* |
| cookie mutation without a same-origin `Origin` | 403 `FORBIDDEN` | *Reload the page and try again.* |
| the session's record no longer holds the person | 403 `FORBIDDEN` | *You are not on this record.* |
| `/mcp` with a cookie, or with nothing | 401, `WWW-Authenticate: Bearer`, the JSON-RPC error `-32001`; the cookie is never read | *UNAUTHORIZED*, and nothing else |
| module-level `SCHEMA_MISMATCH` / `SCHEMA_NEWER` | 503 | *A deploy is in progress; retry in five minutes.* |

---

## 7 · Performance budget

| Item | Number | Source · measured how |
|---|---|---|
| DO duration price | $12.50 per million GB-s | 26 §2.2 · the account's DO analytics, GB-s per class per day |
| A held connection (non-hibernating socket or SSE), one customer, one month | 0.125 GB × 2,592,000 s = **324,000 GB-s ≈ $4.05** — 81 % of the included allowance | 22 §5, ADR-044 · the counter-example the design refuses |
| A hibernating socket, idle | ≈ 0 GB-s; outgoing pushes free; inbound billed 20:1 | 22 §5 · assert GB-s per record-day < 100 in staging with 50 open sockets |
| Browser requests per active day | ≈ 100 (`boot` + pages + writes) on the socket; ≈ 1,920 on the 15 s fallback | 22 §5 · request counts by route in `TELEMETRY` |
| MCP ceiling per token | 600/min, burst 60; writes 120/min; payload 1 MB | 10 §8 · the `ratelimits` bindings |
| Workers AI, one conversational turn (12k in / 1.5k out) | $0.00255; modelled $0.20 per record-month | 08 §6, 11 §4 · gateway cost tracking |
| Platform per record-month (DO, requests, R2, Queues) | ≈ $0.35 estimated; total ≈ $0.55 against $12 | 08 §6 · the monthly invoice per active record |
| CPU per `/api/*` request | ≤ 20 ms; a whole page renders in 2.12 ms | 22 §5 · `ms` in the log line, p95 per method |
| CPU per invocation ceiling | 30 s default, 300 s max — a long import is not a request | 01 §2 · never approached; the alarm batch is 100 rows |
| Queue consumer per message | ≤ 5 s wall for `notify.*`; `pull.fetch` bounded by ≤ 5 runs × ≤ 50 pages ≤ 200 subrequests | 25 §9, 30 §8 · `ms` per kind |
| Scheduled actions per alarm | ≤ 5 runs (`ALARM_RUNS`) × ≤ 4 requests (one and three redirects) = 20 subrequests; ≤ 5 × 10 s = 50 s wall | `loop/research-scheduled-actions.md` §2.3 · asserted in `test/actions.test.ts` |
| Subrequests per invocation | 1,000 (paid) — the cron fan-out stops at 900 records | 25 §9 · counted in `scheduled()` |
| Memory per isolate | 128 MB — **which is why `export` streams pages of ≤ 1,000 rows** through a `TransformStream` and never buffers a record | 01 §2, 33 §9 · a 10 GB record exports without an OOM in staging |
| Snapshot buffer | ≤ 40 MiB plaintext (§10) — age has no streaming mode this spec relies on | §13 A12 · the refusal sentence appears above the cap |
| Attachment · webhook · email body | 2 MB · 1 MB · 5 MiB, checked against `Content-Length` before buffering | 12 §8, 10 §8, 01 §5 |
| Queue message | ≈ 60 bytes against a 128 KB cap | 26 §2.2 |
| Runner attachment | ≤ 16,384 bytes; ours is two ids | 26 §2.3 |
| Worker startup | ≤ 200 ms; zero top-level work — validators compile at module top (30 §4) but the ports and DOs bind lazily | 22 §9 · `wrangler deploy` startup report |
| Cold start of an evicted object | 50–200 ms; the constructor runs migrations only under `blockConcurrencyWhile` and loads nothing else | 01 §8 · first-request latency after eviction in staging |
| DO file size | `record.ts`, `spark.ts` ≤ 100 lines; `directory.ts` ≤ 60 | 31 §8 · `wc -l` in CI |

---

## 8 · Security

Trust boundaries crossed here: the public edge → the Worker; the Worker → three DO classes; the Worker → R2, Queues,
Workers AI, Email, Secrets Store. Each control, where it sits, and what never travels:

1. **The input gate.** Every write in `Record` is one `transactionSync`; the alarm re-arm is an async storage op
   still under the gate; `OUTBOX_Q.send({ record })` is the last statement after commit (30 §4 steps 11–12b). The
   test in §9 serialises two overlapping writes.
2. **No outbound call from `Record` except `wake()`.** `Record`'s ports are `{ Sql, Scheduler, Clock }`; `fetch`,
   `Inference`, `Dispatch` are not in scope — structurally, not by review (ADR-002, 31 §2). `Spark` speaks only to
   the configured model; the Worker does everything else.
3. **The KEK never leaves the Worker.** `keyStoreOf` in `src/keys.ts` imports it as a non-extractable `CryptoKey`; the record
   receives and returns sealed material only (`openGrant`/`bindGrant`); AES-GCM, HKDF and Ed25519 run in the
   Worker (12 §6, ADR-062). No log line, telemetry point, push payload or prompt carries a plaintext — the
   `secret-grep` gate.
   *The key doors, September 15th 2026.* `KEK` is a Worker secret (`wrangler secret put KEK --env <environment>`)
   or a Secrets Store binding of that name, holding 32 bytes as 64 hex characters or base64url; the fingerprint is the
   self-host's, so one root key names itself the same way on both hosts. A bound value that is not 32 bytes is a
   refusal and never an absent store. Unbound, `/api/vault/deposit` and `/api/vault/open` check the vault grant and
   answer `NOT_IN_THIS_BUILD`, and `/auth/provision` makes records without wrapped keys, exactly as before. Bound,
   provisioning wraps a new record's three keys (`recordKeys`), and the doors seal and open in `src/vault.ts` through
   `packages/host/src/vault.ts`: the record's `depositGrant` calls the Worker's `seal` back over RPC, so the value
   stays in the Worker and only sealed bytes reach the object, and a read is answered once with `no-store`. A record
   provisioned before the binding answers `NOT_IN_THIS_BUILD` with *"Keys need a record created after this host key
   store was bound, and this record is older than that."* `KEK_PREV` is not read yet: a record wrapped under another
   root key answers `WRONG_KEY`.
4. **Bearers are hashes at rest**, the secret half is compared by the record against `token.hash` or
   `device_grant.token_hash`; a theft of every table impersonates nobody (26 §2.1).
5. **`redirect: 'manual'` and the private-range refusal** in `cfHttp` and `cfDispatch.webhook`; `connect`
   re-validates any `Location` against the declared origin before following (25 §7 rule 5).
   *Scheduled actions, September 15th 2026.* The alarm's executor, `src/actions.ts`, holds the self-host's rules
   (§5.10 step 4) and resolves no name. Cloudflare does not route a Worker's `fetch` to a private address, so the
   check the self-host makes after resolving a name is the platform's on this host; what the executor refuses itself
   is a host written as a literal private, loopback or link-local address, `localhost` or `.internal`.
6. **The asset route is sandboxed**: type from bytes, SVG 415, `nosniff`, `default-src 'none'; sandbox`,
   `noindex`, the 64-hex regex, the record prefix in every key (12 §8, 12 §2).
7. **`no-store` on every JSON answer, no CORS anywhere, a 401 that says one word, a 500 that says nothing** (12 §8).
8. **CSRF**: `SameSite=Lax` plus the `Origin` check on every cookie-authenticated mutation.
9. **Isolation is addressing.** One request reaches one `idFromName(rec_id)`; no code path holds two record stubs
   except `deleteCustomer` and the cron fan-out, both `system` (12 §2).
10. **Group enforcement in two places**: the router refuses a bearer at a browser-only group so the gate can see it;
    the record refuses it again so the CLI cannot be pointed around the router (30 §10).
11. **The lockout** reserves before it compares, is sticky at ten, fails closed on a missing row, and does not apply to
    agent tokens (12 §8).
12. **Email and webhook handlers parse nothing**; an unverified payload is stored `untriaged` and never matched (07 §2, 12 §3).

---

## 9 · Tests and gates

All under Vitest 4.1.11 + `@cloudflare/vitest-plugin` 1.1.2 against `wrangler.jsonc` — the one place the pins are
used (31 §3). Files `apps/worker/test/*.test.ts`. Input → expected:

| # | Test | Input | Expected |
|---|---|---|---|
| 1 | conformance | the `packages/ports` case array against `doSql(state.storage)` | trace equals `conformance/reference.json`; case count equals the Node host's; skips printed |
| 2 | conformance regenerate | `REGENERATE=1` | `reference.json` rewritten; `git diff --exit-code` decides whether a change is intended |
| 3 | caps | `doSql(...).caps` | `fts5 === true`, `json === true`, `maxParams === 100`, `maxLikePattern === 50`, `expressionIndexUsed === true`, `nestedTransactions === false` |
| 4 | error map | each row of §5.9's table provoked through `exec` | the named code; nothing else escapes |
| 5 | input gate | two concurrent `call('create', …)` on one stub, each with a distinct `op_id`, both racing `wake()` | two rows, `seq` 1 and 2, `version` strictly increasing; no interleaved event rows |
| 6 | alarm deletion | `setAlarm(now + 1h)` then `destroy()` on a record | `getAlarm()` is `null`; `listDurableObjectIds` shows no storage; and `compatibility_date >= 2026-02-24` (the lint reads `wrangler.jsonc`) |
| 7 | hibernation wake | open `/ws`, `runDurableObjectAlarm` after the object is evicted in the test harness, then one write | the socket receives exactly one `{ version, registers }` naming the written register; no message for a read |
| 8 | socket read-only | send `"hello"` on the `/ws` socket | close code 1003 |
| 9 | queue idempotency | `queue()` twice with `{ record }` after one outbox row | one `notify.email` sent (the `EMAIL` mock counts 1); second batch leases nothing |
| 10 | queue crash | the dispatcher throws for a `notify.webhook` row | `ackOutbox(id, 'failed', sentence)`; a `retry` schedule row exists; the outbox row is `failed`, not re-leased by the consumer |
| 11 | deploy parity | `SELF.fetch('/')` and `/_app/version.json` in the plugin's asset mode | bytes equal `apps/web/build/*`; the live check runs in `deploy.yml` |
| 12 | customer deletion | a record with one alarm, two attachments, one snapshot | after `deleteCustomer`: `getAlarm() === null`, `BLOBS.list({ prefix })` empty, `DIRECTORY.resolve(slug) === null` |
| 13 | bearer routing | `Authorization: Bearer rec_X.secret` where the record holds `sha256(secret)` | 200; the same secret against another record → 401 |
| 14 | browser-only groups | a bearer at `/api/openGrant` | 403 `NEEDS_BROWSER_SESSION` before any RPC (the stub mock records zero calls) |
| 15 | CSRF | cookie `POST /api/create` without `Origin` | 403 `FORBIDDEN` |
| 16 | lockout | eleven wrong magic-link redemptions from one IP | the eleventh is 429 with `Retry-After`; a reservation whose `RETURNING` is empty → 503 |
| 17 | asset store | upload a PNG, an SVG, a 2,097,153-byte file | 200 with the SHA-256 key; 415; 413 before the body is read |
| 18 | share link | a valid token → page; the same token after `share.close`; a token with one flipped MAC byte | 200; 404; 404 |
| 19 | snapshot | `export.r2` row on a 2,000-row record | one dated key and `latest.dogl.age` in R2 with `customMetadata.rows === 2000`; decrypting with the test identity yields a `.dogl` whose manifest verifies |
| 20 | snapshot ceiling | a dump over 40 MiB | `ackOutbox(…, 'failed', 'snapshot over 40 MiB…')` |
| 21 | DO size | `wc -l src/do/*.ts` | `record.ts`, `spark.ts` ≤ 100; `directory.ts` ≤ 60 |

CI rows this app owns in 33 §8: `conformance-count`, `boot-probe` (the FTS5 refusal message), `compat-date`,
`deploy-parity`, `router-groups`. `gates.yml` runs the scripts; `ci.yml` runs the Vitest files; `deploy.yml` ends
with `deploy-parity`.

---

## 10 · Deliberate ceilings

- `ponytail:` one `call(method, args, pre)` RPC per class instead of forty-five named methods; named methods when a
  caller needs per-method RPC typing the generic cannot give.
- `ponytail:` no per-socket subscription filter — every `/ws` client gets every `{ version, registers }`; add
  `serializeAttachment({ registers })` when a record has more than ~40 registers and the refetch fan-out shows in `ms`.
- `ponytail:` the snapshot buffers ≤ 40 MiB plaintext and refuses above it; stream through R2 multipart when
  `age-encryption` exposes streaming encryption (§13 A12) or a record over 40 MiB exists.
- `ponytail:` the cron fan-out is one invocation up to 900 records; page across `scheduled()` runs with the
  Directory cursor when the 901st record signs up.
- `ponytail:` no Workflow; triage is synchronous inside `arrive` and the model-backed proposal is an `infer.draft`
  row; add a Workflow when a step needs durable multi-step retry across a deploy (01 §6's argument, deferred).
- `ponytail:` Spark keeps no lease state and no alarm; a stale claim is visible in the list and reclaimable at
  `claimJob`; add the 60 s renewal alarm when a runner fleet exceeds one machine per record (26 §2.4).
- `ponytail:` the spoken-id redirect `/<ID>` → canonical is done by the shell, not a 302; `run_worker_first`
  cannot name uppercase prefixes without invoking the Worker for every asset (§13 D19).
- `ponytail:` the rate limit is the Workers Rate Limiting binding with two fixed buckets; a per-record AI budget
  stays at the gateway; add a token-level ledger in the record when a customer asks *which agent did 4,000 calls*.
- `ponytail:` a webhook's HMAC verification costs two RPCs (`ingestVerify`, `arrive`); fold into one when webhook
  volume shows in the budget.
- `ponytail:` KEK rotation is one previous key (`KEK_PREV`); a rotation ladder longer than two keys is 53's.
- `ponytail:` no billing gate — ADR-059's read-only mode is a Directory column and a router check added when
  Stripe lands (53).
- `ponytail:` `Spark.destroy()` does not exist until Spark stores conversation state (46).
- `ponytail:` telemetry is one point per request and one per queue dispatch; sampling arrives with the first bill
  that shows it.

---

## 11 · Dependencies

| Kind | Package | Version | Why |
|---|---|---|---|
| runtime | `@pushforge/builder` | 2.0.5 | VAPID for Web Push; zero dependencies (ADR-046, 09 §3) |
| runtime | `age-encryption` | 0.3.1 (+ five `@noble`/`@scure` transitive) | `.dogl.age` (ADR-046, 03 §5) |
| workspace | `@braindog/ports` `where` `theme` `render` `declare` `mcp` `record` `spark` `connect` | `workspace:*` | 31 §2 row 14 |
| dev | `wrangler` | 4.128.0 | 31 §3 |
| dev | `vitest` | 4.1.11 | 31 §3 |
| dev | `@cloudflare/vitest-plugin` | 1.1.2 | peers `vitest ^4.1.0` exactly — the repo's hardest pin (31 §3) |
| dev | `typescript` | 6.0.3 | 35 §2; types via `wrangler types` → `worker-configuration.d.ts` (§13 A18) |

A third runtime package is a new ADR.

---

## 12 · Build order

**Before this:** `packages/ports` with `preflight`, the case array and the Node reference run (37); `packages/record`
with `createRecord`, `Method`/`GROUPS` and the methods of §13 D11 (45); `packages/mcp`'s `serveMcp` (44);
`packages/connect`'s `ingest` (47); `packages/spark`'s `createSpark` (46 — a stub that refuses is enough for phase 5);
`apps/web/build` (50) for `ASSETS`; the Directory flows (§13 D10). Phases 0–4 of BUILD.md.

**This unblocks:** the DO half of Q12 and the committed `reference.json` (30 §14 #1); every Cloud-only feature — PITR,
inbound email, the hibernatable socket, the nightly `.dogl.age`; phase 6's MCP over the live host; 52's `deploy.yml`
and 53's runbooks (restore, key rotation, erasure, deletion).

---

## 13 · Decisions taken here

### Decisions, each with its amendment

| # | Decision | Amend |
|---|---|---|
| D1 | Each DO class exposes **one RPC dispatcher** — `Record.call(method, args, pre)`, `Spark.dispatch`, `Directory.auth` — plus the platform methods of §2. Forty-five named RPC methods in a ≤ 100-line file is not possible, and the method name is data the gate walks | 33 §7: *"expose their methods as RPC"* → *"one `call` dispatcher over the groups"* |
| D2 | The Worker builds a **`PreContext`** (verified person id, bearer hash, share, system, spark) and the **record builds `CallContext`** — scope, level, name and actor are the record's tables. A bearer cannot be resolved anywhere else | 33 §2 first paragraph after the code block |
| D3 | **Bearer wire format** `<rec_id>.<secret>`; `token.hash` and `device_grant.token_hash` hold `sha256(secret)`. The record id must be in the bearer or the Worker cannot find the table that verifies it | 33 §10 *Agent token* row; 12 §3 |
| D4 | Browser requests name their record **on the session row**, not in a second cookie: sign-in opens a record the person owns (else the first they joined), `/auth/switch` will move it, and the record's own `member` table says what the person may do. *Amended from a `rec` cookie: one opaque cookie is one thing to protect.* A person holds several records and the shell is static | 33 §4 (`/auth/switch`), 33 §10 |
| D5 | **Share token** = `<rec_id>.<b64url payload>.<b64url HMAC-SHA-256>` under `HKDF(KEK, 'braindog/share')` with `kek_id` in the payload; the Worker verifies the MAC, the record checks `share.close`. An invalid token is 404 | 20 §2 tier 1; 33 §4 `/s/<token>` |
| D6 | **`PUT /a`** uploads (cookie, or a bearer whose `whoami` is `write`); `/a/<sha256>` takes the record from the session or `?r=`. The corpus had a store and no way in | 33 §4; 12 §8 asset store; 03 §8 |
| D7 | **Webhook URL** `/in/webhook/<rec_id>/<ingest-id>/<token>` — an ingest id is per record. The random segment is the default verification; `hmac_sha256` is verified in the Worker via `ingestVerify` | 33 §4; 12 §3 |
| D8 | **Nightly snapshot** = `scheduled()` → `snapshot` (ADMIN, the tenth; also `POST /api/snapshot`) → an `export.r2` outbox row → the consumer's `Snapshots.take`; `GET /api/snapshots` lists R2. The outbox gives the ladder and the visible failure 12 §8 asks for | 30 §5 ADMIN; 33 §1 `Snapshots` (Cloud); 33 §4; 12 §8 |
| D9 | The three **`infer.*` write-backs ride `ackOutbox.result`** and the record persists them in the ack's transaction — the consumer's write surface is `arrive · leaseOutbox · ackOutbox · observe` | 30 §8 *`infer.*`* row |
| D10 | The **Directory's schema and flows are a package** — assumed `@braindog/record/directory` exporting `createDirectory(sql, clock)` — because two apps host it and apps never import each other. If 45 or 49 places it elsewhere, one import line changes here | 31 §2 row 10 and §8; 45; 49 |
| D11 | **Record methods the routes need that 30 §5 does not list**: `arrive` (INTERNAL), `ingestVerify` (INTERNAL), `join` (INTERNAL, invitation acceptance), `whoami` (READ+), `snapshot` (ADMIN), `deviceStart · devicePoll · deviceApprove`, `createToken · listTokens · revokeToken`. Names assumed; 45 owns the signatures | 30 §5 — a counted row per group |
| D12 | **No Workflow in v1**: `arrive` does store → match → extract → write → outbox in one transaction (pure, no model); the unmatched case is an `infer.draft` row. The contracts already omit a Workflow binding | 01 §6; 07 §7 — *"is a Workflow"* → *"may become one"* |
| D13 | The **runner socket is a doorbell**; the claim is always `claimJob()`; Spark holds no lease state and no alarm in v1 | 26 §2.4 *Job half-done*; 33 §7 *Spark* row (*"job leases"*) |
| D14 | **Customer deletion** is `Record.destroy()` + `deleteCustomer()` in the Worker, invoked by operations; no public route | 02 §9 *A customer* row → *"by 53's runbook"* |
| D15 | **Restore is two calls**: `pitr(at)` (host, aborts) then `call('restore', { bookmark, at })` writes `restore.pitr` into the restored storage | 33 §9 *Restore* |
| D16 | The queue message stays **`{ record }`**; `Ingress.queue`'s element is renamed from `recordId` to `record` | 33 §1 `Ingress` |
| D17 | **429 is bare with `Retry-After`** — for the two rate-limit bindings and for the lockout; no refusal code is minted | 10 §8; 12 §8 |
| D18 | **`wrangler.jsonc`** gains `send_email`, `analytics_engine_datasets`, `ratelimits`, `triggers.crons`, `vars`, `KEK_PREV`, `not_found_handling`, `/a` and `/ws/*` in `run_worker_first`; no compatibility flags | 33 §7 skeleton |
| D19 | **`/<ID>` is resolved by the shell**, not a server 302 | 33 §4 `/<ID>` row; 19 §2 *Real paths* |
| D20 | The DO adapter **shares `preflight`** with the Node adapter; both refuse every enforceable ceiling before the driver, and `mapWorkerdError` covers what only the driver can see | 33 §1 *"The Cloud adapter maps workerd's own errors"* → *"… and pre-checks the same ceilings"* |
| D21 | Sign-up writes the **record before the Directory rows** | 33 §10 *Sign up* |
| D22 | `whatsNew`'s cursor head is `GET /api/version`; the live push's `registers` come from a non-RPC helper `record.changed(since)` on the instance | 45 |

### Interface assumptions for the audit's agreement lens

| # | Symbol assumed | Owner |
|---|---|---|
| I1 | `serveMcp(request, api, ctx)` from `@braindog/mcp/http`, over the record's own methods; the core beneath it is `handle(message, surface, ctx)` from `./rpc` | 44 |
| I2 | `createRecord(ports): { call, alarm, applyMigrations, changed, version }`; `Method`, `Args<M>`, `Ret<M>`, `GROUPS` | 45 |
| I3 | `export(cursor)` returns `{ chunk, cursor, manifest? }` in pages of ≤ 1,000 rows | 45 |
| I4 | `preflight(query, params, caps)`, the case array, `Assert`, `SqlError` | 37 |
| I5 | `ingest(decl, { http, secret })` → the fetched pages; throws on `expect:` | 47 |
| I6 | `createSpark(ports).dispatch(args, pre)` | 46 |
| I7 | `createDirectory(sql, clock)` with `AuthCall`/`AuthResult` | D10 |

### Platform assumptions to verify

| # | Assumption | Verify by |
|---|---|---|
| A1 | Classes `extends DurableObject<Env>` from `cloudflare:workers` expose public methods as RPC on `DurableObjectStub<T>`; structured-clonable args and returns; a `throw` becomes a rejection | `wrangler dev` + test #13 |
| A2 | A WebSocket upgrade must go through `stub.fetch()`, not an RPC method; `ctx.acceptWebSocket(ws, tags?)`, `ctx.getWebSockets(tag?)`, `ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(req, res))`, `ws.serializeAttachment()` ≤ 16,384 bytes; `webSocketMessage/Close/Error` handler names | 22 §5, 26 §2.3 name the calls; tests #7–#8 |
| A3 | `send_email: [{ name }]` binding; `env.EMAIL.send({ from, to, subject, text, html })` or an `EmailMessage` from `cloudflare:email`; the sender domain is verified in the dashboard | `wrangler deploy --dry-run`; a staging send |
| A4 | `secrets_store_secrets` binding shape; `await env.KEK.get()` returns the secret string; 100 secrets × 1 KB | 12 §6 states the ceiling; dry-run |
| A5 | Queue consumer options `max_batch_size`, `max_batch_timeout`, `max_retries`; `batch.ackAll()`, `msg.retry()`; a body ≤ 128 KB | 26 §2.2 states the cap; dry-run |
| A6 | `ctx.storage.getCurrentBookmark()`, `getBookmarkForTime(ms)`, `onNextSessionRestoreBookmark(b)`, `ctx.abort()`; PITR 30 days, Cloud only | 01 §2 names two of the four; a staging restore |
| A7 | `deleteAll()` deletes the alarm at `compatibility_date ≥ 2026-02-24` | 09 §1 verified 2026-09-01; the `compat-date` gate |
| A8 | `storage.sql.exec()` returns a cursor with `toArray`, `one`, `rowsRead`, `rowsWritten`, iteration; multiple statements are accepted without parameters and refused with them; `storage.transactionSync` exists and does not nest | test #1, #4 |
| A9 | BLOB values come back as `ArrayBuffer`; INTEGERs as `number` | conformance case on a BLOB round-trip |
| A10 | The workerd error texts in §5.9's table | the trace equality of test #1 pins every mapping |
| A11 | `pragma_compile_options` is readable inside a DO; `EXPLAIN QUERY PLAN` is permitted | test #3 |
| A12 | `age-encryption@0.3.1`'s `Encrypter.encrypt(Uint8Array)`; whether a streaming form exists; R2 `put` with a `ReadableStream` needs a known length, else multipart | the package's `d.ts`; a staging put |
| A13 | WebCrypto `Ed25519` sign/verify and `HKDF` are available in workerd | a unit test in the plugin |
| A14 | Inbound Email Routing adds `Authentication-Results` with `dkim=`/`spf=`; `msg.raw`, `msg.rawSize`, `msg.setReject()`; the size ceiling | a staging message |
| A15 | `analytics_engine_datasets` binding; `writeDataPoint({ blobs, doubles, indexes })`; 250 points per invocation | 08 §5 states the limits; dry-run |
| A16 | `assets.not_found_handling: 'single-page-application'` serves `index.html` for unknown paths; `run_worker_first` globs as written; asset requests are free | 22 §9 states *free and unlimited*; test #11 |
| A17 | `ratelimits` binding with `simple: { limit, period }` and `limit({ key })`; `period` of 60 | dry-run |
| A18 | `wrangler types` emits `worker-configuration.d.ts` for the bindings of §4.4 | `pnpm exec wrangler types` |
| A19 | `env.AI.run(model, input, { gateway: { id } })`; model ids `@cf/meta/llama-3.2-1b-instruct`, `@cf/baai/bge-m3`; the GLM-5.3-Flash id; `cf-aig-collect-log-payload` as a gateway setting | 11 §3 names the models; the catalogue |
| A20 | `cloudflare:test` exports `env`, `SELF`, `runInDurableObject`, `runDurableObjectAlarm`, `listDurableObjectIds` | the plugin's `d.ts` |
| A21 | Cron triggers deliver `ScheduledController`; the invocation shares the 1,000-subrequest ceiling | 25 §9 states the ceiling |

---

## 14 · Done when

- [ ] `wrangler deploy --dry-run` accepts §4.4 unchanged; `compat-date` passes.
- [ ] `doSql` passes the conformance array; `reference.json` is committed from this host; counts match the Node host.
- [ ] `caps.fts5 === true` and `caps.expressionIndexUsed === true` on the live DO — Q12 closed.
- [ ] Tests #1–#21 green under `@cloudflare/vitest-plugin`.
- [ ] `record.ts` and `spark.ts` ≤ 100 lines, `directory.ts` ≤ 60, enforced in CI.
- [ ] Every route in `index.ts` declares its group; `router-groups` passes; a bearer at `openGrant` is 403 before any RPC.
- [ ] A browser holds `/ws` for an hour in staging and the object's GB-s stay under 100; a write reaches the tab as `{ version, registers }`.
- [ ] A redelivered queue message leaves the `EMAIL` mock at one call.
- [ ] `deploy.yml` passes `deploy-parity` against `https://brain.dog/`.
- [ ] A staging record is snapshotted, deleted, and restored to a bookmark; the `export` and `restore.pitr` events exist; no alarm and no R2 object survive the deletion.
- [ ] Every row of §13's amendment column is applied to its design document in the same revision.

---

*Previous: [50-SPEC-WEB](50-SPEC-WEB.md). Next: [52-SPEC-TESTING-AND-CI](52-SPEC-TESTING-AND-CI.md).*
