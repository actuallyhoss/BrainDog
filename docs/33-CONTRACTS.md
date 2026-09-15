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

`packages/ports` exports nine interfaces, the `Refusal` and `RefusalCode` types (type-only — `where` refuses and sits
below `kernel`, so the lowest shared package declares the shape; [30-BLUEPRINT](30-BLUEPRINT.md) §6 stays the list's
home), two `Sql` adapters and the conformance cases (§3). No port imports another. `packages/record` uses exactly
`{ Sql, Scheduler, Clock }`; `packages/spark` uses `{ Sql, Clock, Inference }`; `packages/connect` uses
`{ Http, KeyStore, Clock }`; everything else is a host's. There are no fakes: `:memory:` is the memory adapter, and a
`Clock` or `Scheduler` stand-in is an object literal in the test that needs it (37 §13 D9).

```ts
// ─── 1 · Sql — SYNCHRONOUS, and the type makes the async hazard unrepresentable ───────────
type Param = null | number | bigint | string | Uint8Array;        // no boolean, no undefined
type Row   = Record<string, Param>;
type NotPromise<T> = T extends Promise<unknown> ? never : T;

interface Cursor<T = Row> extends Iterable<T> {
  toArray(): T[];
  one(): T;                       // exactly one row, else throws RangeError — no SQL failed, so never a SqlError
  first(): T | undefined;
  readonly rowsRead: number;      // a statement with columns is read with all(); rowsRead counts its rows
  readonly rowsWritten: number;   // a zero-column statement is run(); rowsWritten = changes (37 §13 D3)
}

interface Capabilities {
  sqlite: string;           // '3.50.4'
  fts5: boolean;            // measured at open — false is refused at boot, §6
  json: boolean;            // measured at open — false is refused at boot, like fts5 (37 §13 D10)
  maxParams: number;        // 100 everywhere — enforced by the adapter, not the driver
  maxLikePattern: number;   // 50 — checked positionally, at bind time: every bound string in a LIKE position
  maxSqlBytes: number;      // 100_000
  maxCompoundSelect: number;// 5 — guarded: COMPOUND_TOO_LONG
  maxExprDepth: number;     // 100 — measured, not guarded: the property test keeps the compiler under it
  expressionIndexUsed: boolean;   // the EXPLAIN QUERY PLAN probe
  nestedTransactions: false;
}

interface Sql {
  /** Exactly ONE statement, with or without parameters (MULTI_STATEMENT_PARAMS otherwise). */
  exec<T = Row>(query: string, ...params: Param[]): Cursor<T>;
  /** Zero-parameter multi-statement text — the only multi-statement door. The migration runner only. */
  execScript(sql: string): void;
  /** Synchronous callback. Rolls back on throw. Does NOT nest. */
  transactionSync<T>(fn: () => NotPromise<T>): T;
  readonly caps: Capabilities;
}
```

Two adapters: **`ctx.storage.sql`** (Cloud, the reference) and **`node:sqlite`** (the self-host, Node 24.13 pinned — §6).
There is no `better-sqlite3` — it is not built under the Node pin — and `bun:sqlite` is unsupported. Each adapter
refuses raw `BEGIN COMMIT END ROLLBACK SAVEPOINT RELEASE` by statement-prefix check — six keywords,
`TXN_STATEMENT_FORBIDDEN` — and refuses a nested `transactionSync` or a thenable callback with the same code, so the
two fail identically.

> **`DO_LIMITS` is enforced in our adapter, above the driver.** Measured 2026-09-02: `node:sqlite`'s
> `DatabaseSync` has no `limits` option and no `setLimit` method — an unknown option key is silently ignored. So
> the Node adapter counts parameters before `prepare` (`TOO_MANY_PARAMS` at 101), checks every bound string in a
> LIKE position (`LIKE_TOO_LONG` at 51 bytes — positional and bind-time, the over-refusal approximation), checks
> statement length (`STATEMENT_TOO_LONG` at 100 001) and compound depth (`COMPOUND_TOO_LONG` above 5); expression
> depth is not guarded — the compiler's output is asserted to stay under 100 by the property test. A value outside
> `Param` — a boolean, `undefined`, `NaN`, `±Infinity` — is refused as `SYNTAX` before either driver sees it:
> `node:sqlite` would throw, the DO would reject. The Cloud adapter runs the same pre-checks and maps workerd's own
> errors onto the same codes. **That is what "Node refuses first" means.**

```ts
// ─── 2 · Scheduler — the one alarm, and the outbox doorbell ─────────────────────────────
interface Scheduler {
  get(): Promise<number | null>;        // ms since epoch of the armed alarm
  set(atMs: number): Promise<void>;     // idempotent; the write path calls it AFTER transactionSync
  clear(): Promise<void>;
  wake(): Promise<void>;                // Cloud: env.OUTBOX_Q.send({ record }); self-host: kicks the in-process poller (setImmediate)
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
// The adapter's refusals are named, not coded: it throws an Error whose name ∈ PrivateRange | TooLarge | Timeout | Network
// (47 §13 D14) — a vocabulary, not a refusal code; connect turns them into the connector refusals of 30 §6.

// ─── 8 · KeyStore — the root KEK ───────────────────────────────────────────────────────────
interface KeyStore {
  current(): Promise<{ kekId: string; key: CryptoKey }>;
  byId(kekId: string): Promise<CryptoKey | null>;
}
// Cloud: Secrets Store, two slots — KEK and KEK_PREV (one key, never one per customer); the previous slot retires
// thirty days after the first clean nightly re-wrap (53 §13 #2). Self-host: BRAINDOG_KEK_FILE and BRAINDOG_KEK_PREV_FILE, 0600.

// ─── 9 · Snapshots ─────────────────────────────────────────────────────────────────────────
interface Snapshots {
  take(label: string): Promise<{ id: string; at: string; bytes: number }>;
  list(): Promise<{ id: string; at: string; bytes: number }[]>;
  restore(id: string): Promise<void>;
  prune(keep: number): Promise<void>;
}
// Cloud: PITR bookmarks, plus the nightly walk — scheduled() → snapshot (ADMIN, as system) → an export.r2 outbox row →
// Snapshots.take writes the .dogl.age under the record's R2 prefix (51 §13 D8; 53 §13 #8). Self-host: VACUUM INTO,
// nightly, keep 30 — a full copy that keeps the six local tables and never leaves the host (§6).

// ─── Ingress — an entrypoint contract, not a port ──────────────────────────────────────────
interface Ingress {
  fetch(req: Request): Promise<Response>;
  email?(m: { to: string; from: string; raw: ReadableStream; size: number }): Promise<void>;
  queue?(batch: { record: RecordId }[]): Promise<void>;     // the element is named as the queue message is: record
  scheduled?(cron: string): Promise<void>;
}
```

Nine, counted. `Msg`, `ToolDef`, `ToolCall`, `PushSubscription` and `RecordId` are the obvious record types, declared
beside the ports with the minimal shapes 37 §2.3 gives; `blobKey(recordId, sha256)` validates both halves. Beside them,
and type-only, sit `Refusal` and `RefusalCode` (§2).

---

## 2 · The envelopes every method shares

Every method in every group of [30-BLUEPRINT](30-BLUEPRINT.md) §5 takes `(args, ctx: CallContext)` and returns
`Promise<Result<T>>` — reads included, because `Scheduler` is async and one signature beats two.

```ts
type CallContext = {
  principal:
    | { kind: 'person'; id: PersonId; level: Level }                                     // read | append | write | decide | owner
    | { kind: 'token';  id: TokenId;  person: PersonId; scope: Scope[]; name: string }  // read | propose | write — never admin
    | { kind: 'runner'; id: string; name: string }                                       // the tier-C runner's device grant (§11)
    | { kind: 'share';  id: string; slug: string }                                       // a share token: one projected page (§4)
    | { kind: 'system' }
    | { kind: 'spark' };
  session?: { spoken?: string; client_id?: string; host?: string; repo?: string };   // the actor ladder's inputs
  op?: OperationGrantId;                // set when a bearer reaches one ADMIN method under an operation grant (§4, §10)
  now: number;
  surface: 'web' | 'mcp' | 'cli' | 'email' | 'webhook' | 'alarm';
};

type Result<T> =
  | { ok: true;  value: T; version: number }                    // version = record_version = MAX(event.rowid)
  | { ok: false; refusals: Refusal[] }                          // HTTP 422
  | { ok: false; conflict: { version: number; current: Entry; actor: string } };   // HTTP 409 — re-read, re-apply

type Refusal = { code: RefusalCode; at: string; found?: unknown; wanted?: string; fix: string };   // 30 §6; declared in ports, type-only
```

Six principal kinds, counted. **Who declares what:** `Refusal` and `RefusalCode` are `@braindog/ports`' (type-only);
`CallContext` and `Result<T>` are `@braindog/kernel`'s; `RecordApi` — the object with the seventy-eight methods below — is
`@braindog/record`'s (`export type RecordApi`). Every consumer imports the type; nothing re-declares any of the four
structurally.

The host builds `CallContext` on every request — `@braindog/host`'s `resolveContext(req, lookups)` reads the `rec`
cookie, the bearer (found by its hash) or the operation grant, and the session hints from seven headers on `/api/*`
and `/mcp` alike, `X-Braindog-Session`, `-Client`, `-Host`, `-Repo`, `-Remote`, `-Cwd` and `-Agent`, or from
`_meta.session` on `/mcp`, which is read over them key by key (the one `_meta` key read; every other key is ignored,
44 §4.2). `@braindog/host`'s `sessionOf` and `hintsOf` hold each hint to its grammar and drop what fails, and the call
still goes through. Every principal carries them and the record reads a token's only, so a person is never a run;
the alarm and the queue build a `system` context. The record derives `actor` and `ctx.scope` from it, runs the `op`
reach check itself, and never trusts a caller-supplied actor. There is no 412: a stale `version` is a 409 whose body
names who changed the row.

**The seventy-eight methods.** The groups and their reach are [30-BLUEPRINT](30-BLUEPRINT.md) §5's — DATA
any token in scope (`markRead` person principals only) · READ+ any token, and the MCP resources · VAULT a browser
session only · JOBS the browser four by session and the runner three by the runner's grant, every MCP token refused ·
ADMIN a browser session, or a bearer carrying an operation grant for that one operation · INTERNAL the host only, no
route. The shapes are decided here. 12 · 14 · 4 · 7 · 22 · 19, as 30 §5 counts them. `ROUTES` in `@braindog/host`
routes 50 of the seventy-eight at `/api/<method>`, 21 of them ADMIN.

| Group | Method | Args | Returns / notes |
|---|---|---|---|
| DATA | `index` | `{ level?: 'index' \| 'digest', scope? }` | registers with counts, open questions, what changed — the three read levels of [10-MCP](10-MCP.md) §4 |
| DATA | `search` | `{ q, registers?, limit? }` — `limit` ≤ 50 | rows, projected |
| DATA | `get` | `{ spoken } \| { register, seq } \| { id }`, plus `{ path?, level? }` — `path` = `<field>(.<key>)*` | one row; `full` needs a `path`; a missing row is `ok` with `value: null`. `S1` is read against the installed prefixes, and a row the caller may not read answers as a missing one, so a spoken id is not a way to learn which registers exist |
| DATA | `list` | `{ register, where?, order?, limit?, cursor?, fields? }` — default `order: [{ field: updated_at, dir: desc }]`, `limit` 25, max 200 | rows + `cursor` |
| DATA | `create` | `{ register, fields, op_id }` | the row, `version` |
| DATA | `update` | `{ register, seq \| id, patch, version, op_id }` — `version` is compare-and-set | the row, or `conflict` |
| DATA | `propose` | `{ question, body_kind, body, op_id? }` — `body_kind ∈ options \| pattern \| rowset \| change` | `SG<n>`; Spark files a tier-A proposal here, once (46 §5) |
| DATA | `log` | `{ note, target? }` — `note` ≤ 280 chars | the event |
| DATA | `markRead` | `{ upTo }` — person principals only; `upTo` = an `event.rowid` | nothing; not an event |
| DATA | `attach` | `{ source, client_id?, doing?, branch?, head? }`, `source` one of `startup` `resume` `clear` `compact` `cli`; a token only, needing `propose` | `{ session, spoken, resumed, project, context }`: the run the ladder found or opened, `project` its spoken id or `null`, and `context` the briefing READ+'s `context` gives for that run, so the start hook prints it from one answer. Re-attaching refreshes where the run is and what it is doing, and never `next`, `tried` or `notes` |
| DATA | `handoff` | `{ next?, tried?, note?, doing?, state?, branch?, head?, session? }`, needing `propose`; `session` names a run, and only a person may name one | the run. `tried` and `note` append inside one transaction, fifty kept of each and the oldest dropped; `state` moves along the declared transitions |
| DATA | `meet` | `{ name?, email?, handle?, where }`: at least one of the first three, and always `where`; any other key is `FIELD_UNKNOWN`; needs `propose` on `people` | `{ person, created, linked, merge }`: the person matched by email or handle, or added, with where they were met, and linked to the project of the caller's run; `merge` is the suggestion this call opened, or `null`. A record with People switched off refuses it `REGISTER_UNKNOWN` and writes nothing, a run included |
| READ+ | `page` | `{ slug }` | the page's `blocks[]` with their rows, one projection |
| READ+ | `metric` | `{ id }` | the value, its partials and `currency_excluded` |
| READ+ | `schema` | `{ register }` | the register's declared fields and states |
| READ+ | `dialect` | `{}` | the dialect of [34-GRAMMARS](34-GRAMMARS.md) §2, from the record's own constant — `record` never imports `render` |
| READ+ | `digestToday` | `{}` | today's digest |
| READ+ | `sessionsLive` | `{}` | the live runs, newest heard from first, each with `stale` (45 minutes), `age_s` and `same_repo` worked out as it is read; it opens no run |
| READ+ | `context` | `{}`; a read that never writes and opens no run | `{ session, project, ambiguous, handoff, live, waiting, registers, people, faded, next }`: where the caller stands, each part held to what it may read ([45-SPEC-RECORD](45-SPEC-RECORD.md) §5.3). The learnings for where a session stands arrive in `registers`, with every other register that has a scope field; a key arrives by its label, and its secret field as `{ sealed, opened, last_opened, last_by }` |
| READ+ | `whatsNew` | `{ cursor? }` — cursor = `event.rowid`; default = the first rowid after the caller's `member.seen_at` | ≤ 60 events + `sinceCapped` |
| READ+ | `project` | `{ query, budget }` — `secret` fields already replaced by their label | the `Projection` of 30 §9 |
| READ+ | `boot` | `{}` | index + the live runs as `sessions` + open suggestions, without their bodies, as `waiting` + `whatsNew` + `theme { id, version, css }` + `me { person, level, owner, records }`, one round trip |
| READ+ | `whoami` | `{}` | the principal as the record resolves it: its levels and the registers in scope |
| READ+ | `ruleTest` | `{ id, against }` — raw ids, a register, or a file's rows | the dry run's `Report` (23 §4): `won / lost / takenBy`; writes nothing |
| READ+ | `packConfig` | `{ id }`; any other key is `FIELD_UNKNOWN` | `{ id, version, config, values }`: what the pack's manifest declares under `config:`, and the value each setting holds now. A pack the seed owns by its bodies has `version: null` and empty maps; a pack this record does not have is `DECLARATION_UNKNOWN` |
| READ+ | `actions` | `{}` | one row per active `pull`, `call` or `poll`: `{ ingest, channel, project, host, every, key, state, next, last, month, days }`. `project` is `null` for every project; `key` is the vault label and never a value; `state` is its schedule row's, `pending firing paused done`, and `next` its `due_at` while pending or firing. `last` is the latest run's `{ at, outcome, status, note }` from its `pull` event; `month` is this UTC month's `{ runs, requests, bytes, failures, held }`, where a held run counts no run; `days` holds the same four counts for each day from the 1st. A pack that is off lists none |
| VAULT | `listGrants` | `{}` | grants with labels; never a value |
| VAULT | `openGrant` | `{ id, kek_id }` | the **sealed** material `{ ciphertext, nonce, aad, kek_id, wrapped_dek }`; the host unwraps and decrypts, the record never does (ADR-062) |
| VAULT | `bindGrant` | `{ id?, label, opens, kind, sealed }` — the mirror of `openGrant`: sealed material in | the grant row; a present `id` rotates it and keeps exactly two versions |
| VAULT | `revokeGrant` | `{ id }` | nothing; `ciphertext` nulled, one `grant.revoke` event |
| JOBS | `createJob` | `{ kind, args, session?, expires? }` — kinds `triage explain propose draft`; `args` are ids and enums, never prose | the job; a browser session only |
| JOBS | `cancelJob` | `{ id }` | sets `job.cancel = 1` |
| JOBS | `listJobs` | `{ status?, limit? }` | the jobs; `lost` is derived, never stored |
| JOBS | `jobEvents` | `{ id, after }` | the events past `after` — the job view's poll (23 §3.1) |
| JOBS | `claimJob` | `{ wait? }` — the host holds the long-poll (≤ 20 s, a check every 1.5 s) and calls the record's one-statement claim | `{ job, lease_until, bearer, mcp }` or `{ job: null, idle_ms }`; the runner's grant only (§11) |
| JOBS | `postJobEvent` | `{ job_id, seq, kind, body }` — `seq` must be `job.seq + 1` | `{ seq, cancel, lease_until }` |
| JOBS | `readCancel` | `{ job_id }` | `{ cancel, lease_until }` — renews the lease |
| ADMIN | `planPack` | `{ doc, source? }` | read-only: the `Diff` and its `planHash` |
| ADMIN | `installPack` | `{ doc, source?, planHash }` | applied under `PLAN_STALE`: the pack row, its declarations, its seeds, one `install` event |
| ADMIN | `uninstallPack` | `{ id, force? }` | retires; the rows stay (04 §4); a retire over rows is `WOULD_ORPHAN` until `force` |
| ADMIN | `disablePack` | `{ id, alsoDisable? }`; any other key is `FIELD_UNKNOWN` | `{ id, state, changed, packs, declarations, said }`; the `pack` row and every row stay (04 §4). Refused, 422: `PACK_REQUIRED` with the dependents in `allowed`, which a second call passes as `alsoDisable`; `SCOPES_IN_USE` |
| ADMIN | `enablePack` | `{ id }`; any other key is `FIELD_UNKNOWN` | the same shape, the declarations back over the same rows. Refused, 422: `PACK_DISABLED` with the pack still off in `allowed`, when this one leans on it |
| ADMIN | `resumeAction` | `{ ingest }`; any other key is `FIELD_UNKNOWN`, and none is `REQUIRED_MISSING` | `{ ingest, kind }`: the paused `pull`, `call` or `poll` row pending and due now, with one `pull` event naming who resumed it; an action that is not paused is `OUT_OF_BOUNDS`. A 401, a 403 or `WRONG_KEY` pauses an action, and this is the only way it runs again; a key marked stale stays stale |
| ADMIN | `setPackConfig` | `{ id, values }`: each value checked against the manifest's `config:`, and `null` puts a setting back to its default; any other key is `FIELD_UNKNOWN` | `{ id, version, config, values, changed, said }`, with one `edit` event. Nothing installed changes: a declaration reads the new value the next time the pack is planned and installed. A pack this record does not have is `DECLARATION_UNKNOWN` |
| ADMIN | `setDeclaration` | `{ body }` — one in-app declaration; no `mode` | the declaration's new version; a rule is tested and applied by `ruleTest` / `ruleApply`, never here |
| ADMIN | `ruleApply` | `{ id, dry }` | `dry: true` → the `DryRun`; `false` → the rows written, no undo (07 §6) |
| ADMIN | `invite` | `{ email, levels }` — the owner mints; one email, 24 h | the invitation; acceptance is `acceptInvite` |
| ADMIN | `export` | `{ cursor?, sections?, redactGrants? }` | one page of `.dogl` lines (≤ 1,000 rows) + the next cursor; `system` for the nightly backup (§9) |
| ADMIN | `import` | `{ lines }` — the whole `.dogl` | the `ImportReport`; into an empty record only (§9) |
| ADMIN | `erase` | `{ subjects, personId?, basis }` — a subject is three characters or more | the report; the stores of 02 §10 in one transaction, R2 through the outbox |
| ADMIN | `restore` | `{ bookmark, at? }` | writes `restore.pitr`; on Cloud the Worker runs `pitr(at)` first (§9) |
| ADMIN | `snapshot` | `{ label? }` | one outbox row the host's `Snapshots.take` consumes (§1) |
| ADMIN | `createToken` | `{ scope, name }` — one scope word, the ladder's top | the bearer `<rec_id>.<secret>`, shown once; the row stores `sha256(secret)` |
| ADMIN | `listTokens` | `{}` | the tokens with `last_used_at`, `last_surface`; never a secret |
| ADMIN | `revokeToken` | `{ id }` | nothing |
| ADMIN | `deviceApprove` | `{ user_code }`, by the owner from a sign-in proved in the last 15 minutes; five wrong codes deny every waiting device | `{ handle, reach, scope, label, ua }`; an `access.grant` event names the approver |
| ADMIN | `listDevices` | `{}` | every device grant by its handle, with its status, reach, label and last use; never a poll id, a code or a bearer |
| ADMIN | `revokeDevice` | `{ handle }` | the row, now `revoked`, and a login's token revoked with it; an unknown handle is `OUT_OF_BOUNDS` |
| ADMIN | `deleteRecord` | `{ slug }` — typed to confirm; a browser session, re-authenticated | the record is gone: the Worker `destroy()`s the object and removes the R2 prefix (§10) |
| INTERNAL | `drainSchedule` | `{}` | the alarm handler: the due rows fired, the next `due_at` |
| INTERNAL | `leaseOutbox` | `{ kinds, n }` | the leased rows; one statement, so a double drain finds nothing |
| INTERNAL | `ackOutbox` | `{ id, state, result?, error? }` — object form, the one shape | nothing; `infer.*` write-backs ride `result` inside the ack's transaction |
| INTERNAL | `observe` | `{ batch: [{ kind, subject }] }` | nothing |
| INTERNAL | `applyMigrations` | `{}` | `{ from, to }`; runs before any cache load — a fresh database never throws on open |
| INTERNAL | `createRecord` | `{ id, slug, name, tz, locale, owner }` | the record row, the owner's `person` mirror and `member('*', 'owner')` |
| INTERNAL | `arrive` | `{ channel, ingest_id?, headers, body, sha256, verified }` | one transaction: store → match → extract → write (07 §2, §7) |
| INTERNAL | `ingestVerify` | `{ ingest_id }` | the ingest's `verify:` material — a path token, or the HMAC grant, sealed |
| INTERNAL | `applyPull` | `{ outbox, n, raw, rows?, ingest }` — one page of a pull | `{ wrote, kept }`; refused on a lease that is not this run's |
| INTERNAL | `sealedGrant` | `{ grant_id }` | `{ ciphertext, nonce, aad, kek_id, wrapped_dek }` for a connector run |
| INTERNAL | `changed` | `{ since }` | `{ version, registers }` — the live channel's frame |
| INTERNAL | `acceptInvite` | `{ invitation, person }` — the Directory's verified person | `person_record`, the `person` mirror, the `member` rows, one `access.grant` event per register |
| INTERNAL | `deviceStart` | `{ reach, label, ua?, scope? }` and the caller's address | `{ device_code, user_code, expires, interval }`; the eleventh start from one address in 15 minutes is `{ ok: false, retryAfter }`. The host adds `verification_uri` and `expires_in` |
| INTERNAL | `devicePoll` | `{ device_code }` | `{ pending: true, interval }`, or `{ pending: false, bearer, reach, scope, expires }` once, after approval |
| INTERNAL | `vaultGrant` | a `vault` reach's bearer | `{ handle, scope, person, expires }` for the host's key doors; `verifyToken` never accepts one |
| INTERNAL | `depositGrant` | `{ label, opens?, kind? }`, the `VaultGrant`, the session hints and `seal(target)`; `/api/vault/deposit` calls it after `vaultGrant` | `{ credential, label, version, rotated }`: the record names the grant id, version and AAD in `target`, the host seals under its key store inside `seal`, and only sealed bytes are bound, with the row, in one transaction; a label already in the grant's scope rotates its grant. No label, or one over 120 characters, is `REQUIRED_MISSING`, and so is a new key that does not say what it opens; a record with no wrapped key is `NOT_IN_THIS_BUILD` |
| INTERNAL | `openForGrant` | `{ label } \| { credential }`, the `VaultGrant`, the session hints and the `kek_id`; `/api/vault/open` calls it after `vaultGrant` | `openGrant`'s sealed material with the row's `credential` and `label`, and one `grant.read` event signed by the caller's run; the host opens it and answers once. A key outside the grant's scope is `FORBIDDEN`, and one with no sealed value is `GRANT_REVOKED` |
| INTERNAL | `rewrapKeys` | `{ from, to, rows }` | the rows re-wrapped under the new KEK (53) |
| INTERNAL | `opsReport` | `{ observation? }` | the runbooks' figures (53) |

**Cursors** are base64url of the JCS array `[lastOrderValue, lastId]`, applied as keyset `WHERE (k, id) < (?, ?)`.
**Idempotency:** `op_id` is stored on the first event row only; a replay returns the current row with the original
rowid as `version` — the kernel's replay, never the host's (41 §13 #9).

**Suggestion bodies:** `options { question, options: [{ id, label, because }], requires_reason: true }` ·
`pattern { ingest: <declaration body>, samples: [raw_id…] }` · `rowset { register, rows: [{ fields } | { at, version, patch }], ingest? }` ·
`change { declaration_id, from, to, observed, prediction }` — accepting a `change` writes the `prediction` row
(24 §4.6). Spark's palette answer has a fifth shape, `query`, which is never filed (23 §4).

**A `rowset` row that carries `at` updates a row; any other row creates one.** `at` is the row's spoken id or row id
in `register`, `version` is the version it was read at, and `patch` holds the fields it changes, with `deleted_at` to
delete the row. Nothing sits beside those three keys. Filing checks that the row is live, that no row is named twice,
and that `version` and a non-empty `patch` are there; whether the patch is valid is the write path's, at acceptance, as
it is for a row a rowset creates. Accepting applies each update as the person who decides, compare-and-set, and it is
the one way a field or a move declared `by: decide` changes. A delete is written after the fields, as its own event.
Every row lands or none does: a version that has moved answers the conflict of `Result<T>`, no row of the rowset is
created or changed, no decision is recorded, and the suggestion stays open. A row that creates is signed by
`ingest:<id>` when the body names an `ingest`; an update is always signed by the person deciding. So a skill's new
version is `{ at: 'skills#3', version: 7, patch: { body, rev: 5, because: ['learnings#12', 'learnings#15'] } }`,
promoting a learning is `{ at: 'LN7', version: 4, patch: { project: null } }`, and `meet`'s merge of two people who
share a name is two update rows on `people`: the older row takes the union of both rows' `handles`, `met` and
`projects`, and the newer gets `merged_into` and `deleted_at` (`packages/kernel/src/people.ts`).

**The factories.** `openRecord({ sql, clock, random, accent })` opens the kernel — randomness injected so a fixture is
deterministic, `accent` the theme's hue chooser (`nextAccentHue`, [ADR-028](16-DECISIONS.md); 13 §2.1b) — and
`applyMigrations` runs before any cache load. `createRecordApi(deps): RecordApi` returns the seventy-eight as named
methods; a host routes `POST /api/<method>` by property lookup on that object — a two-line lookup in
`@braindog/host`, never a `call` dispatcher in the record. `createSpark(deps): Spark` is the same shape for Spark's
named methods (46 §2), served at `/api/spark/<method>`. `@braindog/mcp` reaches the same methods for an agent:
`handle(message, surface, ctx)` is the JSON-RPC core its stdio and HTTP transports share, and
`serveMcp(request, surface, ctx, { maxBodyBytes?, session? })` is `POST /mcp`. Its `surface` is `McpSurface<C>`, a
structural type naming only the methods the tools call, so a host passes the `RecordApi` itself once it has checked
the bearer, or `null` for a caller it does not know, and the package is tested with a stub and no Durable Object
([44-SPEC-MCP](44-SPEC-MCP.md) §2).

---

## 3 · The conformance suite

One corpus of cases, executed against both `Sql` adapters, producing one normalised trace each; the assertion is
that the traces are equal ([30-BLUEPRINT](30-BLUEPRINT.md) §13). The reference trace is generated from the Cloud
adapter and committed as `packages/ports/conformance/reference.json`, regenerated only by the Workers-plugin job.
Each host writes `packages/ports/test/results/<host>.json` — the artefact `conformance-count` reads (§8).

```ts
type SqlErrorCode =
  | 'TOO_MANY_PARAMS' | 'LIKE_TOO_LONG' | 'EXPR_TOO_DEEP' | 'INT_OUT_OF_RANGE' | 'TXN_STATEMENT_FORBIDDEN'
  | 'NO_SUCH_MODULE' | 'MULTI_STATEMENT_PARAMS' | 'STATEMENT_TOO_LONG' | 'TOO_MANY_COLUMNS' | 'COMPOUND_TOO_LONG'
  | 'CONSTRAINT' | 'SYNTAX' | 'UNKNOWN';                                       // thirteen, closed
// Errors map by SQLite's message fragments — twelve, substring-matched, on both adapters; no numeric errcode (37 §13 D4).

type TraceLine = ['rows', unknown[]] | ['err', SqlErrorCode] | ['n', number];

type Case = {
  id: string;                               // 'params-101', 'like-51-bytes', 'savepoint-refused', 'fts5-phrase', …
  requires?: (keyof Capabilities)[];        // a skip is printed with its reason, never silent
  run(sql: Sql): TraceLine[];
};

interface Assert {                          // four methods; a skip is the runner's, from Case.requires — never an assertion
  ok(v: unknown, msg: string): void;
  equal(a: unknown, b: unknown, msg: string): void;
  deepEqual(a: unknown, b: unknown, msg: string): void;
  fail(msg: string): never;
}
```

The cases are a plain array, not a `describe` block; the host supplies `Assert`, so the same list runs under
`node --test` for the Node adapter and under `@cloudflare/vitest-plugin` for the Durable Object — Vitest is
`apps/worker/test` alone (52 §13 #5). CI asserts each host ran the same number of cases and prints every skip.
**Case #1** is the non-`Param` value: `node:sqlite` throws on a boolean and the DO rejects it, so the adapter refuses
every non-`Param` — `NaN` and `±Infinity` included — as `SYNTAX` before either driver sees it (37 §13 D5). **Case #2**
is `MULTI_STATEMENT_PARAMS`. **Case #3** is the raw `SAVEPOINT` refusal. The expression-index probe
(`EXPLAIN QUERY PLAN … USING INDEX`) is the case that closes Q12; it is green on Node 24.13.0 for both the literal and
the bound-parameter form, and it runs against the Cloud adapter in week one. Fixtures and property runs pin the clock
to one fixed instant and seed one `sfc32` generator (40 §13 D3); `openRecord` takes `clock` and `random` (§2) so the
kernel never reaches for `Date` or `crypto` itself.

The **boot probe** reuses `measureCaps` at startup and refuses a build without FTS5 or JSON, naming the driver in its
message ([30-BLUEPRINT](30-BLUEPRINT.md) §13); `measureCaps` tolerates an `EXPLAIN` failure by recording `false`, and
the conformance case then fails loudly (37 §13 D10). There is no degraded mode.

---

## 4 · The HTTP surface

Every route declares its group; a CI gate walks the router and fails on a route with no group. The table is data —
`ROUTES` in `@braindog/host` — and both hosts serve exactly it (§7).

| Route | Method | Auth | Group / does |
|---|---|---|---|
| `/api/<method>` | POST | bearer or cookie | one route per DATA and READ+ method, by property lookup on the `RecordApi` object; body = args; `Result<T>` |
| `/api/<method>` | POST | **cookie only** | VAULT, and the browser four of JOBS (`createJob cancelJob listJobs jobEvents`) — a bearer gets **403 `NEEDS_BROWSER_SESSION`**; every MCP token is refused the job surface |
| `/api/<method>` | POST | cookie, **or a bearer carrying an operation grant** for exactly this method | ADMIN — `ctx.op` is the grant: single-use, ten minutes, the operation named at approval (§10; ADR-060 as amended) |
| `/api/claimJob` · `/api/postJobEvent` · `/api/readCancel` | POST | the runner's grant | the runner three of JOBS; `claimJob { wait }` long-polls in the host, never inside the object (§11) |
| `/api/export` | POST | cookie, or an operation grant `export <scope>` | answers `200 text/plain; charset=utf-8` — the `.dogl` itself, streamed; the host emits the `dog_sig` line last (§9) |
| `/api/import` | POST | cookie, or an operation grant `import <file sha256>` | takes the `.dogl` as its `text/plain` body; an empty record only (§9) |
| `/api/deleteRecord` | POST | cookie, re-authenticated | ADMIN; the slug typed to confirm (§10) |
| `/api/snapshot` · `/api/snapshots[/:id]` | POST · GET | cookie | ADMIN; the list reads R2 (Cloud) or `<slug>/snapshots/` (self-host) |
| `/api/spark/<method>` | POST | cookie only | Spark's named methods (46 §2), registered only when `SPARK_ENDPOINT` is set; otherwise no route |
| `/api/boot` · `/api/pages/:slug` · `/api/schema/:register` | GET | bearer or cookie | aliases of `boot page schema` |
| `/api/version` | GET | bearer or cookie | `{ version, format, kernel, primitives, app, spark: boolean }` — the polling fallback reads `version`; `deploy-parity` reads `app` (§8) |
| `/mcp` | POST | **bearer only**: an agent token, or the self-host's server key, by the path `/api` takes; never a cookie, never the demo, never open mode | streamable HTTP, stateless, the 2026-07-28 shape: `serveMcp` in `@braindog/mcp/http` over the core's `handle`, called by both hosts; fourteen tools, resources, `instructions` with every `tools/list`. In order: 405 with `Allow: POST` for any other method, GET and DELETE included; 403 for any `Origin`; 415 for a body that is not `application/json`; 401 with `WWW-Authenticate: Bearer` before a byte of the body is read; 413 above 1 MB, on `Content-Length` and on the bytes; 400 `-32700` for a body that is not JSON. `MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name` are held to the body when sent, and required of a 2026-07-28 request: 400 with `-32022` for an unsupported version, `-32020` for a mismatch. A notification is 202 with no body; a method the server lacks is 404 `-32601`. No session id is minted or echoed. The token's `last_surface` is `mcp` |
| `/in/webhook/<rec_id>/<ingest-id>/<token>` | POST | the ingest's `verify:` (HMAC header or the URL's random path segment) | above the auth gate; store raw, enqueue, return — an ingest id is per record, so the record is in the path |
| `<slug>@in.brain.dog` | email | DKIM/SPF pass, else quarantined | Cloud: above the auth gate; store raw, enqueue |
| `/in/email/<token>` | POST | the token minted at `init` (`<slug>/inbound.token`) | self-host: raw RFC 5322 in the body, from a forwarding webhook (§6) |
| `/a/<sha256>` | GET | none | attachment bytes, type sniffed, SVG 415, `default-src 'none'; sandbox`; the record from the session or `?r=` |
| `/a/<sha256>` | PUT | cookie, or a `write` bearer | upload: the client computes the hash, the server verifies it — a mismatch is `CHECKSUM_MISMATCH` |
| `/s/<token>` | GET | the share token → a `share` principal | one projected page, read-only; an invalid token is 404 |
| `/<ID>` | GET | cookie | a spoken id, resolved by the shell — there is no server 302 |
| `/.well-known/braindog-key` | GET | none | `{ key_id, public_key }` — the host's signing key, for `braindog verify` |
| `/.well-known/oauth-protected-resource` | GET | none | **deferred** — Phase A ships agent tokens only; when built BrainDog is its own authorization server |
| `/ws` | GET (upgrade) | cookie | Cloud: the hibernatable WebSocket, the frame `{ version, registers }` on change; self-host phase 2: 404, the client polls `/api/version` |
| `/ws/runner` | GET (upgrade) | the runner's grant | Cloud only: the doorbell socket, `{ t: 'wake' }`; the self-host runner long-polls (§11) |
| `/auth/*` | GET · POST | per route | the sign-in routes below, which are the Directory's (§10) |
| `/account/*` | GET | **cookie only** | the account routes below, which are the Directory's like sign-in and never reach a record |
| everything else | GET | — | the static shell: one `build/`, served as assets by both hosts; no server renders a request |

**The `/auth/*` routes, once.** `AUTH_ROUTES` in `packages/host/src/auth.ts` is this table as data (its two device rows come from `device.ts`), and both hosts
answer it through one `serveAuth`. A POST needs `application/json` and a same-origin `Origin`. A 200 is the `/api`
envelope; a sign-in that does not sign somebody in is `401 UNAUTHORIZED` "That did not sign you in."; the lockout
is a bare `429` with `Retry-After` and `{ ok: false, retryAfter }`; a lockout store that fails is `503`.

| Route | Method | Host | Does |
|---|---|---|---|
| `/auth/methods` | GET | both | which ways in this host offers, and who the cookie belongs to: `{ passkey, magic, key, open, demo, why?, me, firstRun? }` |
| `/auth/session` | GET | both | who the cookie belongs to, or 401 and the cookie cleared |
| `/auth/token` | POST | self-host | `{ serverKey }`: `BRAINDOG_TOKEN` for a session, where the Directory holds one person |
| `/auth/passkey/register/options` · `/auth/passkey/register` | POST | both | the registration ceremony, behind a session |
| `/auth/passkey/assert/options` · `/auth/passkey/assert` | POST | both | signing in with a passkey |
| `/auth/magic/start` | POST | both | `{ email }`: a link, mailed as `<origin>/signin#magic=<token>`; an unknown address gets the same 200 and no mail |
| `/auth/magic/redeem` | POST | both | `{ linkToken }` or `{ claimToken }`: spent once, by a press, never by a GET |
| `/auth/passkeys` · `/auth/passkey/remove` | GET · POST | both | a person's own passkeys, and removing one, the last included |
| `/auth/logout` | POST | both | ends the session and clears the cookie |
| `/auth/device` | POST | both | `{ slug?, reach, label, scope? }` with no credential, and no `Origin` needed because a CLI sends none: `{ device_code, user_code, verification_uri, expires_in, expires, interval }`, where `verification_uri` is always `<origin>/settings/agents`. `403` when the host was reached by another name or a page on another origin sent it; ten starts per address in 15 minutes, then `429` |
| `/auth/device/token` | POST | both | `{ slug?, device_code }`: `{ pending: true, interval }` until approved, then the bearer once. `slug` names the record on Cloud; the self-host holds one, and answers both routes only when `BRAINDOG_TOKEN` is set |
| `/auth/provision` · `/auth/claim/mint` | POST | Cloud | the operator's, behind `PROVISION_KEY`: a record, its Directory rows and a 24-hour claim link handed back, never mailed |

Specified and not built: `/auth/device/approve` (the operation grant of
§10), `/auth/invite` and `/auth/switch`. They keep these paths when they land.

**The `/account/*` routes.** `ACCOUNT_ROUTES` in `packages/host/src/auth.ts` is this table as data, and both hosts
answer it through one `serveAccount`. The session cookie is the only credential it reads: a bearer, no cookie, a host
where nobody signs in or an ended session is 401 `UNAUTHORIZED`. A path not in the table is 404 `ROUTE_UNKNOWN`, and
another method is 405 with `Allow: GET`. `router-groups` reads the table: every row a GET under `/account/`, served by
both hosts, behind the session, and named here.

| Route | Method | Host | Does |
|---|---|---|---|
| `/account/usage` | GET | both | `?from=YYYY-MM-DD&to=YYYY-MM-DD`: `{ from, to, totals, records }`, what the records the signed-in person owns used between the two days, each with its month so far against its plan's allowance. A day in another shape is `VALUE_MALFORMED`; a range that runs backwards or covers more than a year and a day is `OUT_OF_BOUNDS` |

`Cache-Control: no-store` on `/api/*` and `/mcp`; no CORS; `run_worker_first: ['/api/*', '/mcp', '/a', '/a/*', '/in/*',
'/s/*', '/ws', '/ws/*', '/auth/*', '/account/*', '/.well-known/*']`, the list in `apps/worker/wrangler.jsonc`. INTERNAL methods have no route. There is no admin scope: VAULT never
sees a bearer, and ADMIN sees one only when it carries an operation grant for exactly that method.

**Error bodies.** Both hosts return the `Result` envelope unchanged; the status is `host.httpStatus(result)`: `ok`
200 · any refusal 422 (`PLAN_STALE` and `IMPORT_NOT_EMPTY` included — never 409) · `conflict` 409 · `UNAUTHORIZED` 401
with an empty body · `FORBIDDEN` and `NEEDS_BROWSER_SESSION` 403 with the envelope · the migration refusal 503. Every
response echoes the client's `X-Request-Id`, and both hosts log it. A request names its record by its session
(browser; the record is on the session row), by the bearer's hash, or by its own path (a share, an email, a webhook).

---

## 5 · The CLI — `braindog`

One bundled file (`esbuild`), the `braindog-cli` package (Apache-2.0); `yaml` and `valibot` ride inside it through `declare`
([ADR-046](16-DECISIONS.md), [ADR-063](16-DECISIONS.md)) and nothing else does. Every command has `--json`.

| Command | Does |
|---|---|
| `braindog login <host>` | the RFC 8628 device flow of [12-SECURITY](12-SECURITY.md) §6.1 with `reach = login`: prints a six-digit code, the owner approves in the browser, the CLI receives a **`read`+`write` agent token** and stores it in `hosts.json` (0600) — under `$XDG_CONFIG_HOME/braindog/`, `~/.config/braindog/` when unset, `%APPDATA%\braindog\` on Windows unless `XDG_CONFIG_HOME` is set. `BRAINDOG_HOST` / `BRAINDOG_TOKEN` override. That token never reaches ADMIN |
| `braindog init <slug> [--owner]` · `braindog dev [--port]` | self-host only; both spawn the self-host entry with `process.execPath` (`BRAINDOG_SELFHOST`, or `apps/selfhost/src/main.ts` in a checkout) — the CLI never imports `apps/selfhost` and never links `packages/record`. `init` creates `<data>/<slug>/record.dog`, runs migration 0001, writes the owner into the Directory and mints `<slug>/inbound.token` (0600). `dev` runs against a scratch data dir with real ports over `:memory:` and prints its mail and a throwaway `BRAINDOG_TOKEN` to stderr |
| `braindog export [--with-attachments] [--redact-grants] [--sections data,origin,governance] [--mirror] [-o file]` | streams the `.dogl` (41 §5.10's line format) from the record and materialises a signed `.dog`; `--mirror` also writes rendered markdown in the layout of 32 §2 |
| `braindog import <file.dog \| file.dogl>` | one `text/plain` body into an empty record only (`IMPORT_NOT_EMPTY`), §9 |
| `braindog verify <file> [--key <pubkey \| url>]` | offline: `application_id`, format, manifest hashes, signature; without `--key` the output says `unpinned`, with it the key must match `dog_sig.key_id` |
| `braindog pack lint <dir>` · `pack plan <dir>` · `pack install <dir \| url \| git ref> [--with-deps]` · `pack uninstall <id>` | lint is offline, through `declare`'s `parsePack(files) → Pack \| Refusal[]`, `lint(pack, installed)` and `checksum(pack)` (42 §2 — the CLI uses those names); plan prints the diff; install applies it under `PLAN_STALE` |
| `braindog rule test <id> --against <raw \| register>` · `rule apply <id> [--dry]` | `ruleTest` (READ+) and `ruleApply` (ADMIN, §2); the dry run reports `won / lost / takenBy` and is also the undo |
| `braindog ingest test <id> --against <raw ids \| file>` | prints the extraction `Report` in 23 §4's shape; exit 1 when any field is `0 of n` |
| `braindog token create --scope read,propose --name <n>` · `token list` · `token revoke <id>` | agent tokens; `--scope` is a list on the command line and one word on the wire — the ladder's top; a browser session may also do all three |
| `braindog runner enroll` · `runner run` | tier C: the device grant with `reach = runner`, then the loop of §11 |
| `braindog --version` | `app <date>+<sha> · format 1 · kernel <n> · primitives 1` |

**ADMIN from the CLI is an operation grant** ([ADR-060](16-DECISIONS.md) as amended). Every ADMIN command —
`pack install`, `pack uninstall`, `export`, `import`, `token create`, `token revoke`, `rule apply` — starts a device
grant whose `reach` names the operation: `pack install <id> planHash <h>`, `export <scope>`, `import <file sha256>`,
`token create <name> <scope>`, `token revoke <id>`. The owner approves that one operation in the browser after seeing
its summary — the plan diff, the export scope, the token's scope — and the bearer reaches exactly that method once,
within ten minutes, with `ctx.op` set. Nothing is written down, and `login`'s token is never widened.

Refusals print as one sentence: `register.invoices.fields[4].type 'currency' — did you mean 'money'?`
(`FIELD_TYPE_UNKNOWN`). A local error — a missing file, a bad flag — has no refusal code; `--json` carries it as a
fourth envelope variant. Exit codes: 0 ok · 1 refused, or a local error · 2 conflict · 3 unreachable, or the host is
the cause.

---

## 6 · The self-host process

One Node process, one artefact, `docker run`, no build step. Phase 2 ships it with the magic link and `BRAINDOG_TOKEN`,
polling in place of `/ws`, and inbound email through a forwarding webhook; passkeys are phase 3.

| Setting | Value |
|---|---|
| Runtime | Node **24.13.0**, pinned to the minor; `node:sqlite` is the only driver (FTS5 and JSON measured present) — no `better-sqlite3`, which is not built under the pin |
| Entry | `BRAINDOG_SELFHOST`, or `apps/selfhost/src/main.ts` relative to a checkout — what `braindog init` and `dev` spawn (§5) |
| Data | `BRAINDOG_DATA=/data` — `<slug>/record.dog` per record, plus `directory.sqlite` (§10); a request names its record by its session row, the bearer's hash, or its own path (§4) |
| Root key | `BRAINDOG_KEK_FILE=/data/kek` — 32 random bytes, 0600, created on first run; `BRAINDOG_KEK_PREV_FILE` is the second slot of the rotation ladder (§1) |
| Secrets | `BRAINDOG_SESSION_SECRET`, optional: what the Directory's session key is derived from by HKDF instead of the key file (§10); `BRAINDOG_ORIGIN`: the origin the app is served from, which names the cookie and the passkeys' relying party; `BRAINDOG_TRUST_PROXY=1`: count the lockout against the last `X-Forwarded-For` entry; `BRAINDOG_TOKENS_VALID_FROM` — the fleet lever that invalidates every bearer minted before an instant |
| Origin | `BRAINDOG_ORIGIN` — the public origin for magic-link URLs, the CSRF origin check and (phase 3) the WebAuthn `rpId`; default `http://localhost:<PORT>` |
| Auth | the magic link, and `BRAINDOG_TOKEN` as an owner-level bearer for a private single-user instance; passkeys in phase 3; sign-up is closed — `init` and invitations create people |
| Mail | outbound through `BRAINDOG_SMTP_URL` and `BRAINDOG_SMTP_FROM` — one small client over `node:tls` (implicit TLS on 465 or STARTTLS on 587, `AUTH PLAIN`), no dependency (49 §5); inbound through `POST /in/email/<token>` from a forwarding webhook, raw RFC 5322 in the body — the token lives at `<slug>/inbound.token` |
| Port | `PORT=8080`; TLS is the reverse proxy's job |
| Per open | the adapter applies `journal_mode=WAL` · `synchronous=NORMAL` · `busy_timeout=5000` · `foreign_keys=OFF`, asserts `foreign_keys = 0`, and runs `measureCaps` and the boot probe (37 §13 D10) |
| Scheduler | one `setTimeout` over `MIN(due_at)` per record; one outbox poller per record, which `wake()` kicks (`setImmediate`); one nightly timer per process |
| Snapshots | nightly `VACUUM INTO` (permitted here) → keep 30, under `<slug>/snapshots/`. **A snapshot is a full copy that keeps the six `local` tables and never leaves the host** — disaster recovery, restored offline by putting the file back; **an export is the portable `.dog` without them** (§9) |
| Live channel | no `/ws` in phase 2 — 404, and the client polls `/api/version` |
| Web | the same static `build/` the Worker serves, from disk |
| Boot | `measureCaps` per record file; a build without FTS5 refuses to start, naming the driver. One sick record does not stop the host: `SCHEMA_MISMATCH` / `SCHEMA_NEWER` is per record, 503 on its routes only |
| Limits | the adapter enforces `DO_LIMITS` (§1) so a self-host never out-runs the Cloud |

The self-host is where a `.dog` is a *file*: the live database is a `.dog` with its `local` tables in it, a snapshot is
a byte-for-byte copy of that, and an export is the same content with `local` stripped, manifested and signed — the four
`dog_*` header tables are present in all three because migration 0001 created them.

---

## 7 · The Worker and its Durable Objects

**Three DO classes**, never a class per customer:

| Class | Instance | Holds |
|---|---|---|
| `Record` | `idFromName(rec_id)` | the record — 27 tables + 4 header tables; the named methods of `createRecordApi(deps)` (§2); the hibernatable WebSocket |
| `Spark` | `idFromName(rec_id)` | the `settings` and `call` tables of 46 §4.1 — no conversation table, no retrieval cache; the runner's doorbell socket. **No lease state and no alarm**: job leases are the record's (`claimJob`, §11) |
| `Directory` | `idFromName('directory')` | persons, passkeys, sessions, magic links, invitations, `slug → rec_id`, the login lockout — the tables and flows of `@braindog/record/directory` (§10) |

Classes extend `DurableObject`; `Record` exposes `createRecordApi(deps)`'s methods and `Spark` exposes
`createSpark(deps)`'s, by name. Everything both hosts would otherwise write twice lives in **`@braindog/host`**: the
route table as data (`ROUTES`), `httpStatus(result)`, `resolveContext(req, lookups)`, `serveApi(api, req, ctx)` over
standard `Request`/`Response`, and the session hints `/api` and `/mcp` both read, `sessionOf` for the headers and
`hintsOf` for `_meta.session`. It is platform-neutral, about three hundred lines, and imported by the Worker and the
self-host alike; each host's `/mcp` branch calls `serveMcp` from `@braindog/mcp/http`. The Worker resolves
`slug → rec_id` at the Directory, then `env.RECORD.get(env.RECORD.idFromName(rec_id))`. The Worker itself is
stateless.

```jsonc
// wrangler.jsonc — the skeleton
{
  "name": "braindog",
  "main": "apps/worker/src/index.ts",
  "compatibility_date": "2026-08-01",          // ≥ 2026-02-24 is the floor CI asserts: deleteAll() must delete the alarm. No compatibility_flags
  "durable_objects": { "bindings": [
    { "name": "RECORD",    "class_name": "Record" },
    { "name": "SPARK",     "class_name": "Spark" },
    { "name": "DIRECTORY", "class_name": "Directory" } ] },
  "migrations": [ { "tag": "v1", "new_sqlite_classes": ["Record", "Spark", "Directory"] } ],
  "queues":   { "producers": [ { "binding": "OUTBOX_Q", "queue": "braindog-outbox" } ],
                "consumers": [ { "queue": "braindog-outbox", "max_batch_size": 10 } ] },
  "r2_buckets":     [ { "binding": "BLOBS", "bucket_name": "braindog-blobs" } ],
  "ai":             { "binding": "AI" },
  "send_email":     [ { "name": "MAIL" } ],
  "analytics_engine_datasets": [ { "binding": "TELEMETRY", "dataset": "…" } ],
  "ratelimits":     [ /* the two bindings of 51 §5 */ ],
  "triggers":       { "crons": ["17 3 * * *"] },                 // the nightly walk: snapshot, re-wrap, reconcile, the ladder
  "vars":           { "SPARK_ENDPOINT": "" },                    // unset = no Spark routes, `spark: false`
  "secrets_store_secrets": [ { "binding": "KEK",      "store_id": "…", "secret_name": "braindog-kek" },
                             { "binding": "KEK_PREV", "store_id": "…", "secret_name": "braindog-kek-prev" } ],
  // Worker secrets: SESSION_SECRET · TOKENS_VALID_FROM · AGE_RECIPIENT — the only age material the Worker holds
  "assets": { "directory": "apps/web/build", "binding": "ASSETS", "not_found_handling": "single-page-application",
              "run_worker_first": ["/api/*", "/mcp", "/a", "/a/*", "/in/*", "/s/*", "/ws", "/ws/*", "/auth/*", "/account/*",
                                   "/.well-known/*"] },
  "observability": { "enabled": true }
}
```

Sign-up generates three keys — the record DEK, the connector DEK and the signing key — wrapped under the current KEK
([12-SECURITY](12-SECURITY.md) §6). The nightly `scheduled()` at `17 3 * * *` takes the snapshot and runs the
operations ladder — re-wrap under `KEK`, reconcile, the drills' checks (53). There is no staging environment: the ops
record is the canary, the record 51 §14 already restores. The Worker's own runtime dependencies:
`@pushforge/builder@2.0.5` and `age-encryption@0.3.1` — and nothing else ([ADR-046](16-DECISIONS.md)).

---

## 8 · The gate inventory

Every CI assertion in the corpus, with its owner. Source and artefact gates are zero-dependency scripts under
`tools/gates/<name>.mjs`; package tests run under `node --test` (Vitest is `apps/worker/test` alone); rendered-box
gates are Playwright specs under `apps/web/test/e2e/`. Every number a gate asserts lives in `tools/gates/budgets.json`,
the one home; a count is never a budget — it is read from the owning enumeration.

| Gate | Where | Asserts |
|---|---|---|
| `graph` | script | the package graph is acyclic and every import points down the thirteen-package order `render → ports → where → theme → fixtures → kernel → declare → extract → record → mcp → spark → connect → host` (31 §2); `mcp` imports `record`'s type only; apps import packages and never each other |
| `licence-closure` | script | `npm pack --dry-run --json` of both packages: no `@braindog/`, no `../../`, both LICENSE files start with the right words (31 §4) |
| `clean-room` | script | no identifier from `clean-room.txt` in any tracked text file outside `docs/` — the predecessor tripwire (BUILD.md) |
| `no-declarations-in-kernel` | script | the kernel declares nothing of the eight kinds except `register.session` |
| `closed-lists` | script | every list in [34-GRAMMARS](34-GRAMMARS.md) §6 matches its owner's enumeration and its CHECK — the record's `DIALECT` constant against `render`'s kinds among them |
| `event-kinds` | script | the `event.kind` CHECK has forty members and the prose says forty |
| `refusal-fixtures` | script | every code in 30 §6 has a fixture that produces it, and no fixture lacks a code; the script checks the names, the `via`-keyed runners of 40 §6 check production |
| `router-groups` | script | every route declares its group; INTERNAL has no route; VAULT accepts no bearer; ADMIN accepts a bearer only with an operation grant, at exactly one ADMIN method |
| `spark-actor` | script | `event WHERE actor = 'spark' AND kind NOT IN ('suggest','propose','predict')` is empty over the `corpus` record |
| `grant-note` | script | no `grant.*` event note contains its grant's `label` or `opens`, over the `corpus` record (12 §8) |
| `mcp-budget` | test | not a gate script: `packages/mcp/test/budget.test.ts` holds `tools/list` at or under 2,600 tokens by `tokenBudget` (44 §5.8), measured at 2,311, each description under 200 and the instructions at or under 400 (44 §7) |
| `secret-grep` | script | no write path, log line, push payload or prompt template can carry a `grant` plaintext |
| `telemetry-allowlist` | script | the Analytics Engine blob allow-list of 08 §5 is exact |
| `shot-allowlist` | script | the screenshot-mode provenance allow-list ([ADR-050](16-DECISIONS.md)) equals the extraction from the markup, both ways |
| `harness-constants` | script | no host, port or URL literal in `apps/web/test/**` outside `env.ts` |
| `css-rules` | script | the CSS usage rules over first-party CSS and the emitted token set — the gate that stands where Stylelint would; there is no Stylelint |
| `conformance-count` | script | every host wrote `packages/ports/test/results/<host>.json` with the same number of cases; every skip printed |
| `compat-date` | script | `compatibility_date ≥ 2026-02-24` |
| `deploy-parity` | script | after `wrangler deploy`, fetch `/` and `/_app/version.json` from the live host; SHA-256 must equal the `build/` output; `/api/version` answers the deployed `app` |
| `where-property` | test | the compiler and the evaluator agree on **1,000** random predicates in CI and **10,000** nightly; failing seeds committed |
| `boot-probe` | test | a build without FTS5 refuses with the exact message, naming the driver |
| `dog-roundtrip` | test | export → import → export over the `corpus` record differs by exactly one appended `import` event |
| `targets` · `row-centre` · `field-height` · `contrast` · `focus` · `screenshot-mode` · `motion` · `bundle` · `a11y-tree` · `shell` · `grid-contract` · `page-render` · `draft-survives-load` · `no-model` · `job-view` · `keys-sheet` · `vault-screen` | Playwright | **seventeen specs** — the rows of [18-BUILD-TOOLKIT](18-BUILD-TOOLKIT.md) §6 and 50 §9, over the 8 fixture pages × 4 widths (390 · 768 · 1024 · 1440) × 2 schemes × 2 directions — 128 configurations; the ninth fixture record, `corpus`, is the whole-corpus gates' |

**Output and workflows.** One JSON line per gate — `gate ok ms` or `gate skip`, and on red `what expected found where` —
then a summary line; exit codes `0 1 2 3`. Every script gate has one seeded violation under
`tools/gates/negative/<gate>/`, run by `self-test.mjs` in `gates.yml`, and every Playwright spec runs once against
`negative/web/`. `.github/workflows/{ci,gates,deploy,release}.yml` map onto this table one-to-one — `gates.yml` runs the
script column, `ci.yml` the test and Playwright columns, `deploy.yml` ends with `deploy-parity`, `nightly.yml` runs the
10,000 — and `gate1.yml` is a report that never fails and maps to no gate. Four drills are calendar gates, not CI:
restore monthly, KEK rotation quarterly, erasure quarterly, upgrade every release (53).

---

## 9 · Export, import, restore, migrations

**Two containers, one content.** The `.dog` is a SQLite file. The `.dogl` is the canonical logical dump — header
lines, then one JCS array per row, tables in `dog_section` order, in the line format **41 §5.10** states once and every
other document cites — whose bytes are exactly what `dog_manifest` hashes ([34-GRAMMARS](34-GRAMMARS.md) §5). They
verify with the same key and import to the same rows.

| Operation | Procedure |
|---|---|
| **Export from Cloud** | the record pages the `.dogl` through `export({ cursor, sections?, redactGrants? })` (ADMIN, or `system` for the backup), ≤ 1,000 rows a page; `POST /api/export` answers one streamed `text/plain` body and the host — never the record — signs: one `sign()` over the record's `vault_key(purpose = 'signing')`, unwrapped with the KEK, and the `dog_sig` line emitted last. A Worker cannot build a SQLite file — no engine, no filesystem, 128 MB — so the `.dog` is materialised by the CLI or a self-host from the `.dogl`. The nightly R2 backup is `.dogl.age` |
| **Export from a self-host** | `VACUUM INTO`, strip the six `local` tables, vacuum again, write the manifest and signature into the copy — that is the export; the untouched `VACUUM INTO` copy is the snapshot (§6) |
| **What travels** | every table except `dog_section = 'local'` — six: `token device_grant auth_fail observation job job_event`; the other twenty-five travel. `grant` rows travel with `ciphertext` sealed, and `vault_key` travels — a KEK-wrapped key is nothing without the KEK, and a restored record must open its own vault; `--redact-grants` drops them; `--sections` narrows to `data`, `origin`, `governance` |
| **Import** | `POST /api/import` takes the whole `.dogl` as one `text/plain` body — there is no page protocol over HTTP; the record's batching (≤ 30 rows × ≤ 3 parameters) is internal to `importDogl`. Only into an empty record (`IMPORT_NOT_EMPTY`); verify signature and manifest (`SIGNATURE_INVALID`, `CHECKSUM_MISMATCH`); refuse a `user_version` above the reader's (`FORMAT_NEWER_THAN_READER`); run kernel migrations on the imported rows; rebuild `entry_fts` from `entry`; write one `import` event — so export → import → export differs by exactly that one appended event. It is not the write path — `event` rows keep their actors — but nothing bypasses validation |
| **Restore** | `restore({ bookmark, at? })` is one ADMIN method: on Cloud the Worker performs `pitr(at)` first and then calls it, and it writes `restore.pitr` into the restored storage. A self-host has no PITR and does not serve `restore`: the path is `braindog import` into a fresh record, or a snapshot put back offline (§6) |
| **Migrations** | `packages/kernel/src/migrations/NNNN_<slug>.ts`, each exporting its SQL string; applied in numeric order by `applyMigrations` (INTERNAL) from the DO constructor under `blockConcurrencyWhile`, before any cache load — a fresh database never throws on open; each in one `transactionSync` that inserts its `migration` row; a module carrying `-- format-bump` sets `PRAGMA user_version` — best effort inside the record (a conformance case measures whether the DO permits it, and the refusal is swallowed explicitly), and set by the CLI or the self-host when a `.dog` is materialised; a checksum mismatch or a database newer than the code sets a module-level refusal (`SCHEMA_MISMATCH` \| `SCHEMA_NEWER`) that every RPC returns as 503 until a deploy fixes it — per record on a self-host. Never rolled back, never percentage-rolled: fix-forward |

Three numbers, one home each: `PRAGMA user_version` = the format revision (1 at v1); `MAX(migration.version)` = the
kernel migration number; `record.format_ver` mirrors `user_version` for readers without PRAGMA access.

---

## 10 · Identity, and the Directory

Login is account-level — a person may hold several records — so identity lives **outside** the record, in the third
Durable Object class (Cloud) or `directory.sqlite` (self-host), same schema, same `Sql` port. Its tables and flows are
`@braindog/record/directory`, a subpath of `record`, so both hosts run one implementation.

| Directory table | Holds |
|---|---|
| `person` | `id` (`p_` + ULID), `email` UNIQUE, `name`, `created_at`, `suspended_at` |
| `passkey` | `id`, `person`, `jwk`, `alg` (ES256 or RS256), `sign_count`, `label`, `backed_up`, `created_at`, `last_used`; both hosts |
| `session` | `id_hash` (HMAC-SHA-256 of `s:` and the id, under the host's session key), `person`, `record` (the record the session opened, so a browser holds one cookie), `expires`, `rotated_at`, `authed_at`, `prev_hash`, `prev_until`. The cookie: `__Host-bd_s`, `HttpOnly Secure SameSite=Lax`, 30 days sliding, rotated after 24 h of use; the replaced id answers for sixty seconds, because the app sends its first calls in parallel and the first to arrive rotates; `authed_at` records the last proof, rotation never moves it, and VAULT requires it within 15 minutes |
| `link` | `hash` (HMAC-SHA-256 of `l:` and the token), `person`, `purpose` (`magic`, 15 min; `claim`, 24 h), `expires`; single use, spent by the statement that deletes it |
| `challenge` | `hash` (HMAC-SHA-256 of `c:` and the challenge), `purpose`, `person`, `expires` (5 min): WebAuthn challenges in a table rather than in memory, so a ceremony survives the Directory object being evicted; single use, and minting refuses past 10,000 live rows |
| `invitation` | `hash`, `email`, `rec_id`, `levels`, `expires` (24 h), `accepted_at` |
| `record_dir` | `slug` UNIQUE, `rec_id`, `owner_person`, `billing ∈ active \| lapsed`, `lapsed_at` |
| `person_record` | `person_id`, `rec_id` |
| `fail` | `key`, `n`, `first`, `until`: the login lockout, reserve-before-compare, sticky, fail closed, and forgetting a first strike fifteen minutes old |

The record keeps `person` as a mirror (`id email name suspended_at`) so a `.dog` resolves its actors offline, plus
`member`, `token`, `device_grant` (with its `reach`) and its own `auth_fail` for device codes and share tokens. A browser
request's record is on its session row, set at sign-in to a record the person owns (else the first they joined),
and the host asks that record's own `member` table what the person may do, as it does for a bearer. In code the
tables are `dir_`-prefixed, at Directory version 3.

| Flow | Steps |
|---|---|
| Sign up | Cloud: email → magic link → `createRecord` (INTERNAL) writes the record first — the record row, the owner's `person` mirror, `member('*', 'owner')` — then the Directory rows `record_dir` and `person_record`; sign-up generates the record DEK, the connector DEK and the signing key ([12-SECURITY](12-SECURITY.md) §6); a passkey is registered after, from phase 3. Self-host: closed — `init` and invitations; an unknown email at `/auth/magic/start` gets 200 and no mail |
| Sign in | passkey first where one exists, the magic link as the fallback — the self-host's only path in phase 2; both produce a `session` row, which carries the record; a self-host also takes its server key at `/auth/token`; **no passwords** |
| Invite | `invite({ email, levels })` (ADMIN, the owner) mints an invitation — one email, 24 h; the invitee signs in behind `GET /auth/invite/<token>` and the host calls `acceptInvite` (INTERNAL) with the Directory's verified person, which writes `person_record`, the record's `person` mirror, the `member` rows and one `access.grant` event per register |
| Agent token | minted from a browser session (`createToken`) or by `braindog login`'s device flow; scoped `read` / `propose` / `write` — one word stored, the ladder's top; the bearer is `<rec_id>.<secret>` and the record's `token` table stores `sha256(secret)` with `last_used_at` and `last_surface`; one record |
| Device grant | six digits, ten minutes, five tries; `code_hash = sha256(id ‖ ':' ‖ user_code)` — `id` is the poll id, never the code; approved by the owner from a sign-in proved in the last 15 minutes (`deviceApprove`); `verification_uri` is `${origin}/settings/agents`; `device_grant.reach` names what the grant reaches — `login` or `runner` mint a 90-day bearer in `token_hash`; the CLI, an agent and a runner all enrol this way |
| Operation grant | `reach ∈ export \| import \| pack \| token`: from a browser session the owner approves **one named operation** after seeing its summary; the approval is single-use, expires in ten minutes, is recorded in `device_grant.reach` and an `access.grant` event, and the bearer then reaches exactly that ADMIN method once with `ctx.op` set (§4; [ADR-060](16-DECISIONS.md) as amended) |
| Suspend | `person.suspended_at` in the Directory; the record's mirror follows on the next request; suspending a person suspends their tokens in the same record transaction |
| Delete | `deleteRecord({ slug })` — the owner, a browser session re-authenticated, the slug typed; the Worker `destroy()`s the object's storage and removes the R2 prefix; the lapse ladder runs the same deletion at day 90 of `billing = lapsed` (02 §9) |

---

## 11 · The tier-C job protocol

A connected machine runs Claude Code under its owner's own subscription ([26-BYO-INTELLIGENCE](26-BYO-INTELLIGENCE.md)).
The runner **pulls**; nothing pushes to the box.

| Step | Who | Mechanism |
|---|---|---|
| Enrol | runner | the device grant with `reach = runner` (§10); its 90-day bearer reaches exactly `claimJob postJobEvent readCancel` |
| Wait | runner ↔ host | v1 pulls by long-poll: `claimJob { wait }` in the body — the host checks every 1.5 s, answers on the first queued row, never holds past 20 s, and the runner aborts at wait + 10 s; the hold runs in the host process, never inside an object. Cloud adds `/ws/runner`, a hibernatable doorbell socket whose `{ t: 'wake' }` ends a wait early, $0 idle; the self-host runner transport is the long-poll alone. Plain polling with the `idle_ms` backoff the reply carries is the last fallback ([26-BYO-INTELLIGENCE](26-BYO-INTELLIGENCE.md) §5) |
| Create | a browser session | `createJob({ kind, args, session?, expires? })` — kinds `triage explain propose draft`; every MCP token is refused this surface; `listJobs` and `jobEvents({ id, after })` are the job view's poll (23 §3.1) |
| Claim | runner | `claimJob` → `{ job, lease_until, bearer, mcp }`: the oldest `queued` row, `status = claimed`, in **one statement** that also sweeps expiry and re-claims a lost row once (46 §4.7); the **job bearer** is minted here as a `token` row — `read`+`propose`, one record, audience one job, expiring with it — for the child process's `/mcp` calls, and revoked at `end` |
| Run | runner | `claude --restricted -p … --output-format stream-json --json-schema <kind schema> --permission-mode dontAsk --max-turns 12`; never `--dangerously-skip-permissions`; a dedicated unix user with tokenless remotes as defence in depth |
| Report | runner | `postJobEvent({ job_id, seq, kind, body })` — kinds `start say think tool out limit note end error`; `seq` must be `job.seq + 1`, so a gap or a replay is refused; the distilled events, never the raw stream; the reply carries `cancel` and the renewed `lease_until` |
| Cancel | browser → runner | `cancelJob` sets `job.cancel = 1`; the runner reads it on every `postJobEvent` reply and through `readCancel`, which also renews the lease; it kills the child; the transcript stays |
| Finish | runner | the final `result` line, validated against the kind's schema, becomes `status ∈ ok needs_decision refused limit error` (`PROPOSAL_SCHEMA` when it fails); `interrupted` and `cancelled` are the other two terminal states; `claude_session` is kept so `--resume` can continue it |
| Lost | the list | a `claimed` row past `lease_until` is *shown* as lost; LOST is never written; the next `claimJob` re-claims it once, inside the claim statement |
| Expire | `claimJob` | `queued` beyond 24 h → `cancelled` with a notice — the sweep inside the claim statement, not a schedule |

Nine statuses, four kinds, nine event kinds — the CHECKs in [30-BLUEPRINT](30-BLUEPRINT.md) §1 are the count. The SQL
and the semantics are 46 §4.7's, adopted verbatim by 45.

---

*Previous: [34-GRAMMARS](34-GRAMMARS.md). Back to the index: [00-README](00-README.md).*
