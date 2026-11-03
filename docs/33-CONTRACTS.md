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
`{ Sql, Scheduler, Clock }`; `packages/slash` uses `{ Sql, Clock, Inference }`; `packages/connect` uses
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
// Cloud: Workers AI through the gateway; a BYO key is the same adapter with a different base URL and keychain access.

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
// Snapshots.take writes the .brainl.age under the record's R2 prefix (51 §13 D8; 53 §13 #8). Self-host: VACUUM INTO,
// nightly, keep 30 — a full copy that keeps the six local tables and never leaves the host (§6).
// Wired September 16th 2026: the self-host also takes one on demand from `snapshot` and serves `snapshots` and `restore`
// over them; the Worker passes no store, so those three refuse NOT_IN_THIS_BUILD with a sentence pointing at Export.

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
    | { kind: 'slash' };
  session?: { spoken?: string; client_id?: string; host?: string; repo?: string };   // the actor ladder's inputs
  op?: OperationGrantId;                // set when a bearer reaches one ADMIN method under an operation grant (§4, §10)
  now: number;
  surface: 'web' | 'mcp' | 'cli' | 'email' | 'webhook' | 'alarm';
};

type Result<T> =
  | { ok: true;  value: T; version: number }                    // version = what `/api/version` answers this caller (§4); ports' Result carries none today
  | { ok: false; refusals: Refusal[] }                          // HTTP 422
  | { ok: false; conflict: { version: number; current: Entry; actor: string } };   // HTTP 409 — re-read, re-apply

type Refusal = { code: RefusalCode; at: string; found?: unknown; wanted?: string; fix: string };   // 30 §6; declared in ports, type-only
```

Six principal kinds, counted. **Who declares what:** `Refusal` and `RefusalCode` are `@braindog/ports`' (type-only);
`CallContext` and `Result<T>` are `@braindog/kernel`'s; `RecordApi` — the object with the eighty methods below — is
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

**The ninety methods.** The groups and their reach are [30-BLUEPRINT](30-BLUEPRINT.md) §5's — DATA
any token in scope (`markRead` person principals only) · READ+ any token, and the MCP resources, except `inbox`, an
owner's in a browser · KEYCHAIN a browser session only · JOBS the browser four by session and the runner three by the
runner's grant, every MCP token refused · ADMIN a browser session, or a bearer carrying an operation grant for that one
operation · INTERNAL the host only, no route. The shapes are decided here. 12 · 19 · 4 · 7 · 29 · 19, as 30 §5 counts
them. `ROUTES` in `@braindog/host` routes 68 of the ninety at `/api/<method>`, 32 of them ADMIN (recounted September 16th 2026 from the table itself, which the `router-groups` gate prints).

| Group | Method | Args | Returns / notes |
|---|---|---|---|
| DATA | `index` | `{ level?: 'index' \| 'digest', scope? }` | registers with counts, open questions, what changed — the three read levels of [10-MCP](10-MCP.md) §4 |
| DATA | `search` | `{ q, registers?, limit? }` — `limit` ≤ 50 | rows, projected |
| DATA | `get` | `{ spoken } \| { register, seq } \| { id }`, plus `{ path?, level? }` — `path` = `<field>(.<key>)*` | one row; `full` needs a `path`; a missing row is `ok` with `value: null`, and asking for nothing (`{}`) is `REQUIRED_MISSING` at `spoken`. `S1` is read against the installed prefixes, and a row the caller may not read answers as a missing one, so a spoken id is not a way to learn which registers exist |
| DATA | `list` | `{ register, where?, order?, limit?, cursor?, fields? }` — default `order: [{ field: updated_at, dir: desc }]`, `limit` 50, max 500; a `limit` below 1 is `OUT_OF_BOUNDS` at `limit` rather than read as the default *(September 16th 2026; this row said 25 and 200, which the kernel never did)* | rows + `cursor` |
| DATA | `create` | `{ register, fields, op_id }`; `fields` carrying `deleted_at` is `FIELD_UNKNOWN` at `deleted_at`, because a row does not arrive deleted | the row, `version` |
| DATA | `update` | `{ register, seq \| id, patch, version, op_id }` — `version` is compare-and-set | the row, or `conflict` |
| DATA | `propose` | `{ question, body_kind, body, op_id? }` — `body_kind ∈ options \| pattern \| rowset \| change` | `SG<n>`; Slash files a tier-A proposal here, once (46 §5) |
| DATA | `log` | `{ note, target? }` — `note` ≤ 280 chars | the event |
| DATA | `markRead` | `{ upTo? }`, person principals only; `upTo` is a cursor as `whatsNew` answers it: an `event.rowid` from a caller who reads the whole record, and from anybody else the `e.<id>` they were handed, a number being `VALUE_MALFORMED` at `upTo`. Absent means the newest event | `{ upTo, seen_at }`: the line the mark landed on, the newest at or below `upTo` the caller may see, as the same kind of cursor (`0` for nothing to mark); not an event |
| DATA | `attach` | `{ source, client_id?, doing?, branch?, head? }`, `source` one of `startup` `resume` `clear` `compact` `cli`; a token only, needing `propose` | `{ session, spoken, resumed, project, context }`: the run the ladder found or opened, `project` its spoken id or `null`, and `context` the briefing READ+'s `context` gives for that run, so the start hook prints it from one answer. Re-attaching refreshes where the run is and what it is doing, and never `next`, `tried` or `notes` |
| DATA | `handoff` | `{ next?, tried?, note?, doing?, state?, branch?, head?, session? }`, needing `propose`; `session` names a run, and only a person may name one | the run. `tried` and `note` append inside one transaction, fifty kept of each and the oldest dropped; `state` moves along the declared transitions |
| DATA | `meet` | `{ name?, email?, handle?, where }`: at least one of the first three, and always `where`; any other key is `FIELD_UNKNOWN`; needs `propose` on `people` | `{ person, created, linked, merge }`: the person matched by email or handle, or added, with where they were met, and linked to the project of the caller's run; `merge` is the suggestion this call opened, or `null`. A record with People switched off refuses it `REGISTER_UNKNOWN` and writes nothing, a run included |
| READ+ | `page` | `{ slug }` | the page's `blocks[]` with their rows, one projection. EVERY BLOCK THAT ANSWERS READINGS, VALUES, A SERIES OR A `metric.` SOURCE CARRIES `figures`, even empty: each figure it names (a cell's, the source's, a line's, a `{{path}}`'s, filled or not), by its id with no parameter, as this record declares it, `{ name, source, where?, value, format?, target?, group_by? }`, so a host says a figure's words, door and target from the record and loads no copy of the packs. An answer key, so a held block carries none. A block from a record built before it has no `figures`, and a host then reads its own copy. Added October 31st 2026 |
| READ+ | `previewPage` | `{ body }`: a page declaration's body, installed nowhere; any other key is `FIELD_UNKNOWN`, no body `REQUIRED_MISSING`. A POST although it writes nothing, as `scriptTry` is | the body as `page` answers a declared one: `{ ...body, page, read_at, blocks[] }`, each block through `kernel.block` and held to the caller as `page` holds it, so one over a list the caller cannot read has no rows, no `source` and one `FORBIDDEN` in `refusals`. Refused first by the install's own lint (`kernel.lint`), in its words; a `requires` naming a list the caller cannot read is refused before the lint, in the sentence a list that is not there gets, and a block over such a list is held before the lint reads it, so its `where` or its columns are never checked against a schema the caller may not read. Writes nothing, not even the `page.render` observation; a `for:` body is drawn as written and not expanded over a row. Added September 24th 2026 |
| READ+ | `previewChange` | `{ to, rows?, about? }`: `to` is a change's, one `{ id, kind, body }` or `{ declarations: [...] }`, at most `PREVIEW_DECLARATIONS_MOST` of them; `rows` is sample rows by list, at most `PREVIEW_SAMPLE_ROWS_A_LIST` a list and `PREVIEW_SAMPLE_ROWS_MOST` in all; `about` is the spoken id `<list>#<seq>` of the row a page per row is drawn over. Any other key is `FIELD_UNKNOWN`. A POST although it keeps nothing, as `previewPage` is | `{ pages: [{ id, slug, title, nav, layout, icon, about, blocks, was }] }`, one for each page declaration of the change: the declarations installed through the kernel's staged install and the samples written through the write path inside `kernel.rehearse`, each page read by `page`'s own reader and each block held to the caller as `previewPage` holds one; a page per row is filled over `about`, or over the first row its `where` admits, and drawn with its placeholders under one sentence when there is none. `was` is the page as it stands now for a change to a page the record has and the caller can open, else `null`. Refused first by the install's own lint, its `at` under the declaration it is about (`page.desk.blocks[8].columns`); a list the caller cannot read, named anywhere outside a page's blocks, is refused before the lint in the sentence a list that is not there gets, and a caller who does not read every list may try only lists, figures and pages. Bounded as `previewPage` is, across every page of the change. Every write is rolled back and the list cache put back; no `page.render` observation, no host kick, no spend. Added September 26th 2026 |
| READ+ | `metric` | `{ id }` | the value, its partials and `currency_excluded` |
| READ+ | `schema` | `{ register }` | the register's declared fields and states |
| READ+ | `dialect` | `{}` | the dialect of [34-GRAMMARS](34-GRAMMARS.md) §2, from the record's own constant — `record` never imports `render` |
| READ+ | `digestToday` | `{}` | today's digest |
| READ+ | `sessionsLive` | `{}` | the live runs, newest heard from first, each with `stale` (45 minutes), `age_s` and `same_repo` worked out as it is read; it opens no run |
| READ+ | `context` | `{}`; a read that never writes and opens no run, except that `topic`, what an agent with no folder says the person is working on, places its run (opened when it has none) in the project of that name or, on a record with no project yet, the first one formed from it as a draft | `{ session, project, ambiguous, handoff, live, waiting, registers, people, faded, next, ask? }`, `ask` the one line a token with no folder in no project is asked to put to the person: where the caller stands, each part held to what it may read ([45-SPEC-RECORD](45-SPEC-RECORD.md) §5.3). The learnings for where a session stands arrive in `registers`, with every other register that has a scope field; a key arrives by its label, and its secret field as `{ sealed, opened, last_opened, last_by }` |
| READ+ | `whatsNew` | `{ cursor? }`: read from the cursor upward; default = the first rowid after the caller's `member.seen_at`, a token reading its person's. THE CURSOR IS THE `event.rowid` FOR A CALLER WHO READS THE WHOLE RECORD, as a number or its digits, and an opaque string for anybody else: `e.<event id>` of a line they were shown, or an `s.` the record sealed. From a caller held to named lists a number, an unknown id, an id of a line they were not shown and a seal that does not open are one `VALUE_MALFORMED` at `cursor`, in the same words *(September 22nd 2026: the rowid between two of her lines counted the events she was not shown)* | `{ events, upTo, sinceCapped }`: at most 60 lines, **newest first**, each with `register`, `seq` and `title` when it is about something the caller may read, `rowid` only for a caller who reads the whole record, and `settles` on a `decide` line, the question it settled; `upTo` is the newest line's cursor, what `markRead` takes; `sinceCapped` when more lie between the mark and the oldest line. A row's line goes to whoever may read its register, a question's to whoever `governance` shows it to, a line about access or keys to an owner, and any other line only to a caller who reads the whole record |
| READ+ | `recentHistory` | `{ cursor?, limit? }`: `cursor` is the one the page above answered with, checked as `whatsNew` checks its own; `limit` 50, max 200 | `{ events, cursor }`: the whole log newest first, each line held as `whatsNew` holds it; `cursor` is `null` only at the bottom. One call walks at most 5,000 lines, and a page is short only where the walk stopped. The cursor is the last line's rowid for a caller who reads the whole record and `e.<its id>` for anybody else; where the walk stopped on a line they were not shown it is sealed, `s.…`, and opens only on the instance that sealed it, so a press of *Older entries* across a restart is refused, in words that say to start again from the newest page |
| READ+ | `inbox` | `{ cursor?, limit? }`: `cursor` is the one the page above answered with, an `inbox_raw` rowid; `limit` 50, max 200. An owner on `'*'` only: every token, every other level and a caller held to part of the record is refused `FORBIDDEN` | `{ arrivals, cursor }`: what `boot`'s `counts.inbox` counts, the `untriaged` and `review` rows of `inbox_raw`, newest first, each `{ rowid, id, ts, channel, from, to, subject, body, state, reason }`; the three headers are read out of `headers`, and neither `headers` nor `sha256` is sent. `cursor` is `null` only at the bottom |
| READ+ | `backlinks` | `{ register, seq, limit?, cursor? }`: the row everything is pointing at; `limit` 20, max 200, counted across the whole answer; `cursor` is the one the page above answered with. Any other key is `FIELD_UNKNOWN`, a `seq` that is not a whole number from 1 is `VALUE_MALFORMED`, and reading the row's own register is the first condition — what points at a row is a fact about that row | `{ to, from, cursor }`: `to` is `{ register, seq, id }`; `from` is one group per `ref` FIELD that names this row — `{ register, field, matched, rows }`, ordered by register then field, its rows newest first, `matched` the whole count where `rows` is the page of it. A register the caller may not read is not asked about, so it is absent rather than empty; a row never points at itself; an archived row is left out, as `list` leaves it out; a `list<ref>` is not read. A row the record does not hold answers `from: []`, as `get` answers `null`, rather than a refusal. `cursor` names the relation it stopped in as well as the position, `<register>.<field>|<when>|<id>`, and is `null` only at the bottom |
| READ+ | `project` | `{ query, budget }` — `secret` fields already replaced by their label | the `Projection` of 30 §9 |
| READ+ | `boot` | `{}` | `{ registers, now, sessions, waiting, record, me, pages, counts, whatsNew }`, one round trip: the readable registers with counts; the live runs; open suggestions without their bodies, capped at 20; `record { slug, name, locale }`; `me { kind, person, name, level }`; `pages [{ slug, title, nav, icon, list, about }]` filtered as `pages` filters them, `about` the `{ register, seq }` a page made from a template grew out of and `null` for one somebody wrote (added September 24th 2026: it was dropped, and the rail's cap per list is keyed on it); `counts { decide, inbox }`, `inbox` `null` below owner; and `whatsNew` exactly as the method answers with no cursor. `theme` is not in it yet |
| READ+ | `whoami` | `{}` | the principal as the record resolves it: its levels and the registers in scope |
| READ+ | `ruleTest` | `{ id, against }` — raw ids, a register, or a file's rows | the dry run's `Report` (23 §4): `won / lost / takenBy`; writes nothing |
| READ+ | `packConfig` | `{ id }`; any other key is `FIELD_UNKNOWN` | `{ id, version, config, values }`: what the pack's manifest declares under `config:`, and the value each setting holds now. A pack the seed owns by its bodies has `version: null` and empty maps; a pack this record does not have is `DECLARATION_UNKNOWN` |
| READ+ | `actions` | `{}` | one row per active `pull`, `call` or `poll`: `{ ingest, channel, project, host, every, key, state, next, last, month, days }`. `project` is `null` for every project; `key` is the Keychain label and never a value; `state` is its schedule row's, `pending firing paused done`, and `next` its `due_at` while pending or firing. `last` is the latest run's `{ at, outcome, status, note }` from its `pull` event; `month` is this UTC month's `{ runs, requests, bytes, failures, held }`, where a held run counts no run; `days` holds the same four counts for each day from the 1st. A pack that is off lists none |
| READ+ | `views` | `{ register? }`; any other key is `FIELD_UNKNOWN` | the saved views of that list, or of every list the caller may read when no register is named, each `{ register, id, name, filter, search, order, columns, created_by, created_at, updated_at }`. A named register the caller may not read is refused rather than answered empty; an unnamed call answers only what they read, so a view is never how somebody learns a list exists |
| READ+ | `view` | `{ register, id }` | the one saved view, whole: its filter, what it searched for, its order and its columns. A name the register has no view for is `VIEW_UNKNOWN`, carrying the names it does have in `allowed` |
| READ+ | `understandPlan` | `{}`: a GET that takes nothing | `{ dry: true, kinds, writes, more, questions, asks, done }`, the shape a dry `understand` answers: each kind it reads (`payments`, `runs`, `services`) with what it looked at, would link and the record would refuse, and for payments the organisations it would add; the first changes in names and how many more; the first questions it would ask on Decide and how many of each kind; and whether this slice reads to the end. Writes, files and moves nothing, and keeps no cursor. Who may read it is the record's own check. MCP's `understand` tool answers it in names. Added October 7th 2026 |
| KEYCHAIN | `listGrants` | `{}` | grants with labels; never a value |
| KEYCHAIN | `openGrant` | `{ id, kek_id }` | the **sealed** material `{ ciphertext, nonce, aad, kek_id, wrapped_dek }`; the host unwraps and decrypts, the record never does (ADR-062) |
| KEYCHAIN | `bindGrant` | `{ id?, label, opens, kind, sealed }` — the mirror of `openGrant`: sealed material in | the grant row; a present `id` rotates it and keeps exactly two versions |
| KEYCHAIN | `revokeGrant` | `{ id }` | nothing; `ciphertext` nulled, one `grant.revoke` event |
| KEYCHAIN | `keyAccess` | `{ credential? }`: a GET, `credential` a key's spoken id or row id | `{ lock_after, rules: [{ credential, machine, machine_name, rule, set_by, set_at }] }`: the lock window in minutes and the rules set, every key's or one key's, the key's `*` rule first. A key with no rule is not listed and opens for every machine (12 §6.3) |
| KEYCHAIN | `setKeyAccess` | `{ credential, machine, rule }`: `machine` a keychain grant's handle or `*`, `rule` `always`, `ask`, `deny` or `null` to take the rule away | the rule as set, or `null`. A handle no keychain grant has is `REF_UNKNOWN` at `machine` |
| KEYCHAIN | `keyAsks` | `{ recent? }`: a GET | `{ asks: [{ id, credential, label, machine, machine_name, run, status, asked_at, expires, answered_by, answered_at }] }`, the asks still waiting, newest first; `recent=true` adds the last week's answered and spent ones. `status` is `pending`, `once`, `always`, `denied` or `used` |
| KEYCHAIN | `keyUses` | none: a GET | `[{ credential, tool, title }]`, one line for each key a tool needs, by spoken id, and the tool by its name; names only, never a value |
| KEYCHAIN | `answerKeyAsk` | `{ id, answer }`, `answer` `once`, `always` or `deny` | the ask as answered. `always` also sets that machine's rule for the key to `always`; an ask already answered or run out is `FORBIDDEN` at `id` |
| KEYCHAIN | `setLockAfter` | `{ minutes }`, 5, 15 or 60 | `{ lock_after }`. The Keychain's gate asks for a sign-in within it from then on; 15 until it is set |
| JOBS | `createJob` | `{ kind, args, session?, expires?, machine?, seat? }` — kinds `triage explain propose draft`; `args` are ids and enums, never prose; `machine` and `seat` place the job on one machine and under one Claude Code profile, each by name as runs say them (kernel migration 44), `VALUE_MALFORMED` at the field otherwise | the job; a browser session only |
| JOBS | `cancelJob` | `{ id }` | sets `job.cancel = 1` |
| JOBS | `listJobs` | `{ status?, limit? }` | the jobs; `lost` is derived, never stored |
| JOBS | `jobEvents` | `{ id, after }` | the events past `after` — the job view's poll (23 §3.1) |
| JOBS | `claimJob` | `{ wait?, host?, seats? }` — the host holds the long-poll (≤ 20 s, a check every 1.5 s) and calls the record's one-statement claim; `host` is the runner's machine and `seats` the profiles it can run under, by name, and a placed job goes only to a runner that says its place (a name outside its grammar is passed over) | `{ job, lease_until, bearer, mcp }`, the job carrying its `seat` or `null`, or `{ job: null, idle_ms }`; the runner's grant only (§11) |
| JOBS | `postJobEvent` | `{ job_id, seq, kind, body }` — `seq` must be `job.seq + 1` | `{ seq, cancel, lease_until }` |
| JOBS | `readCancel` | `{ job_id }` | `{ cancel, lease_until }` — renews the lease |
| ADMIN | `planPack` | `{ doc, source? }` | read-only: the `Diff`, its `approve` lines and its `planHash` |
| ADMIN | `installPack` | `{ doc, source?, planHash, approve? }` | applied under `PLAN_STALE`. A plan whose `calls_out` has a `new` or `changed` action needs `approve`, exactly the plan's `approve` lines: without them `REQUIRED_MISSING` at `approve`, different ones `PLAN_STALE`, and a key they send that is not in the Keychain `REQUIRED_MISSING`; nothing is written on any of the three. The `install` event keeps the lines in its note, signed by the owner. Applied: the pack row, its declarations, its seeds, one `install` event |
| ADMIN | `uninstallPack` | `{ id, force? }` | retires; the rows stay (04 §4); a retire over rows is `WOULD_ORPHAN` until `force` |
| ADMIN | `disablePack` | `{ id, alsoDisable? }`; any other key is `FIELD_UNKNOWN` | `{ id, state, changed, packs, declarations, said }`; the `pack` row and every row stay (04 §4). Refused, 422: `PACK_REQUIRED` with the dependents in `allowed`, which a second call passes as `alsoDisable`; `SCOPES_IN_USE` |
| ADMIN | `enablePack` | `{ id }`; any other key is `FIELD_UNKNOWN` | the same shape, the declarations back over the same rows. Refused, 422: `PACK_DISABLED` with the pack still off in `allowed`, when this one leans on it |
| ADMIN | `resumeAction` | `{ ingest }`; any other key is `FIELD_UNKNOWN`, and none is `REQUIRED_MISSING` | `{ ingest, kind }`: the paused `pull`, `call` or `poll` row pending and due now, with one `pull` event naming who resumed it; an action that is not paused is `OUT_OF_BOUNDS`. A 401, a 403 or `WRONG_KEY` pauses an action, and this is the only way it runs again; a key marked stale stays stale |
| ADMIN | `fileArrival` | `{ id, register, fields? }`: `id` an `inbox_raw` id; with no `fields`, the register's title field takes the arrival's `subject` header, or the first line of its body; any other key is `FIELD_UNKNOWN`. An owner on `'*'` only: a token is `NEEDS_BROWSER_SESSION`, a caller held to part of the record `FORBIDDEN` | `{ id, state: 'matched', entry, already }`: the row written through `create`'s path, its events signed like any write, and the arrival `matched` with one `state` event on `inbox_raw:<id>` in the same batch. An arrival a person already filed answers with that row and `already: true`, writing nothing; an unknown id, or an arrival the inbox no longer shows, is `OUT_OF_BOUNDS`; a refused row is the write's own refusal, and the arrival stays where it was |
| ADMIN | `archiveArrival` | `{ id }`; any other key is `FIELD_UNKNOWN`. The same reach as `fileArrival` | `{ id, state: 'ignored', entry: null, already }`, with one `state` event on `inbox_raw:<id>`; the bytes are kept. A second call is `already: true` and writes nothing; an unknown id, or an arrival already filed or otherwise gone from the inbox, is `OUT_OF_BOUNDS` |
| ADMIN | `setPackConfig` | `{ id, values, batch? }`: each value checked against the manifest's `config:`, and `null` puts a setting back to its default; any other key is `FIELD_UNKNOWN`. `batch`, a ULID, is written on the event, so several calls that make one change (a use case's voice written down) read as one; anything else is `VALUE_MALFORMED` | `{ id, version, config, values, changed, said }`, with one `edit` event. Nothing installed changes: a declaration reads the new value the next time the pack is planned and installed. A pack this record does not have is `DECLARATION_UNKNOWN` |
| ADMIN | `setDeclaration` | `{ body, version? }` — one in-app declaration; no `mode`. `version` is the one it was read at (`page` answers it as `declared_version`; `0` for none), and a declaration that moved since is a 409 conflict carrying `{ id, body }` as it now stands | the declaration's new version; a rule is tested and applied by `ruleTest` / `ruleApply`, never here |
| ADMIN | `ruleApply` | `{ id, dry }` | `dry: true` → the `DryRun`; `false` → the rows written, no undo (07 §6) |
| ADMIN | `invite` | `{ person, level?, registers? }` moves somebody already known; `{ email, level?, registers? }` mints an invitation — one address, 24 h | the member rows, or `{ invitation, token }`: the link's token, answered once and stored only as `sha256`. A host where nobody can sign in refuses `NOT_IN_THIS_BUILD` with its own sentence, an address already on the record is `ALREADY_KNOWN`, and a token is `NEEDS_BROWSER_SESSION`. Nothing is mailed; acceptance is `acceptInvite` |
| ADMIN | `invitations` | `{}` | every invitation still waiting, newest first, each `{ id, email, level, registers, invited_by, created_at, expires_at }`. Never a link and never a hash |
| ADMIN | `revokeInvite` | `{ id }` | `{ id, revoked_at }`; the link stops working at once. One already used, withdrawn or run out is `OUT_OF_BOUNDS` |
| ADMIN | `export` | `{ cursor?, sections?, redactGrants? }` | one page of `.brainl` lines (≤ 1,000 rows) + the next cursor; `system` for the nightly backup (§9) |
| ADMIN | `import` | `{ lines }` — the whole `.brainl` | the `ImportReport`; into an empty record only (§9) |
| ADMIN | `erase` | `{ subjects, personId?, basis }` — a subject is three characters or more | the report; the stores of 02 §10 in one transaction, R2 through the outbox; an owner is not erasable (`LEVEL_REQUIRED`), and a basis naming the subject is `VALUE_MALFORMED` |
| ADMIN | `restore` | `{ bookmark, at? }` | writes `restore.pitr`; on Cloud the Worker runs `pitr(at)` first (§9). A self-host puts back one of its kept copies, the record kept first as `before-restore`, from a sign-in in the last 15 minutes where the host knows one; the Worker refuses `NOT_IN_THIS_BUILD` until `pitr(at)` is wired |
| ADMIN | `snapshot` | `{ label? }` | `{ id, at, bytes }` from the host's `Snapshots.take` (§9), and one `export` event; a host with no store refuses `NOT_IN_THIS_BUILD`, the Worker today, whose copy is sealed to a key only the operator holds |
| ADMIN | `snapshots` | none | the copies the host keeps, newest first, `{ id, at, bytes }[]`; a self-host streams one at `GET /api/snapshots/<id>` (amended September 16th 2026) |
| ADMIN | `createToken` | `{ scope, name }` — one scope word, the ladder's top | the bearer `<rec_id>.<secret>`, shown once; the row stores `sha256(secret)` |
| ADMIN | `listTokens` | `{}` | the tokens with `last_used_at`, `last_surface`; never a secret |
| ADMIN | `revokeToken` | `{ id }` | nothing |
| ADMIN | `deviceApprove` | `{ user_code }`, by the owner from a sign-in proved in the last 15 minutes; five wrong codes deny every waiting device | `{ handle, reach, scope, label, ua }`; an `access.grant` event names the approver |
| ADMIN | `listDevices` | `{}` | every device grant by its handle, with its status, reach, label and last use; never a poll id, a code or a bearer |
| ADMIN | `revokeDevice` | `{ handle }` | the row, now `revoked`, and a login's token revoked with it; an unknown handle is `OUT_OF_BOUNDS` |
| ADMIN | `deleteRecord` | `{ slug }` — typed to confirm; a browser session, re-authenticated | the record is gone: the Worker `destroy()`s the object and removes the R2 prefix (§10). A self-host removes the record file, its copies and its Directory name, and answers 503 after; the Worker refuses `NOT_IN_THIS_BUILD` until the sealed final snapshot is wired |
| ADMIN | `saveView` | `{ register, id, name, filter?, search?, order?, columns? }`; any other key is `FIELD_UNKNOWN` | the saved view. `id` is lower case and at most 40 characters, `name` at most 80, `filter` is 34 §3's `where` grammar compiled against that register's schema, and a field named in `order` or `columns` the register does not have is `FIELD_UNKNOWN` with the ones it has in `allowed`. Saving over a name replaces it and keeps who first saved it and when; fifty views to a register, and the rows are not touched |
| ADMIN | `retireView` | `{ register, id }` | `{ register, id, retired: true }`. The rows are untouched, because a view is a question and not a row; a name the register has no view for is `VIEW_UNKNOWN` with the names it does have |
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
| INTERNAL | `acceptInvite` | `{ token, person }` — the link's token and the Directory's verified person, which `POST /auth/invite` has just signed in; with no `person` it only looks | the `person` mirror, the `member` rows and one `access.grant` event per register, written as `system` with the invitation id in the note, and the row marked accepted in the same transaction. Spent, withdrawn or run out is `OUT_OF_BOUNDS`, and the token is compared by its hash |
| INTERNAL | `deviceStart` | `{ reach, label, ua?, scope? }` and the caller's address | `{ device_code, user_code, expires, interval }`; the eleventh start from one address in 15 minutes is `{ ok: false, retryAfter }`. The host adds `verification_uri` and `expires_in` |
| INTERNAL | `devicePoll` | `{ device_code }` | `{ pending: true, interval }`, or `{ pending: false, bearer, reach, scope, expires }` once, after approval |
| INTERNAL | `vaultGrant` | a `vault` reach's bearer | `{ handle, scope, person, expires }` for the host's key doors; `verifyToken` never accepts one |
| INTERNAL | `depositGrant` | `{ label, opens?, kind?, project?, credential? }`, a `VaultGrant` **or** a `CallContext`, the session hints and `seal(target)`; `/api/vault/deposit` calls it after `vaultGrant`, and `/api/keys/put` with a browser session | `{ credential, label, version, rotated }`: the record names the grant id, version and AAD in `target`, the host seals under its key store inside `seal`, and only sealed bytes are bound, with the row, in one transaction. The row named by `credential`, or the one of that label within reach, rotates its grant; a `credential` out of reach is refused rather than made. A context is held to the KEYCHAIN gate here, and `project` is its alone: a grant's key goes in the grant's own scope. No label, or one over 120 characters, is `REQUIRED_MISSING`, and so is a new key that does not say what it opens; a record with no wrapped key is `NOT_IN_THIS_BUILD` |
| INTERNAL | `openForGrant` | `{ label } \| { credential }`, a `VaultGrant` **or** a `CallContext`, the session hints and the `kek_id`; `/api/vault/open` calls it after `vaultGrant`, and `/api/keys/open` with a browser session | `openGrant`'s sealed material with the row's `credential` and `label`, and one `grant.read` event signed by the caller's run, or by the person where there is none; the host opens it and answers once. A key outside a grant's scope is `FORBIDDEN`, one an owner names and the record does not hold is `REF_UNKNOWN`, and one with no sealed value is `GRANT_REVOKED` |
| INTERNAL | `rewrapKeys` | `{ from, to, rows }` | the rows re-wrapped under the new KEK (53) |
| INTERNAL | `opsReport` | `{ observation? }` | the runbooks' figures (53) |

**Cursors** are base64url of the JCS array `[lastOrderValue, lastId]`, applied as keyset `WHERE (k, id) < (?, ?)`.
**Idempotency:** `op_id` is stored on the first event row only; a replay returns the current row with the original
rowid as `version` — the kernel's replay, never the host's (41 §13 #9).

**Suggestion bodies, all seven** (`BODY_KINDS` in `packages/kernel/src/govern.ts`; the schema's `CHECK` was
widened from four by migration `0008_arrange`): `options { question, options: [{ id, label, because }], requires_reason: true }` ·
`pattern { ingest: <declaration body>, samples: [raw_id…] }` · `rowset { register, rows: [{ fields } | { at, version, patch }], ingest? }` ·
`change { declaration_id, from, to, observed, prediction }` — accepting a `change` writes the `prediction` row
(24 §4.6). Then the three that change what the record IS, applied by the caller after the gate says yes because
installing is asynchronous (`ARRANGING`): `pack { install | enable | disable: <pack id>, doc? }`, exactly one verb
naming one pack · `settings { pack, values, before? }` · `arrange { why: […], packs?, pages?, settings?, rows? }`,
several of the others as one reviewable question, which says why in words and must change something.
Slash's palette answer has a further shape, `query`, which is never filed (23 §4).

**What it would cost to get each one wrong** is computed from the body, never declared in it
(`packages/kernel/src/weigh.ts`), and is what `governance.open` ranks the queue by — `undo`, `shape`, `rows`,
`call`, worst first, oldest first within a band (19 §8 risk 6).

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
`applyMigrations` runs before any cache load. `createRecordApi(deps): RecordApi` returns the eighty as named
methods; a host routes `POST /api/<method>` by property lookup on that object — a two-line lookup in
`@braindog/host`, never a `call` dispatcher in the record. `createSlash(deps): Slash` is the same shape for Slash's
named methods (46 §2), served at `/api/slash/<method>`. `@braindog/mcp` reaches the same methods for an agent:
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
| `/<slug>/api/<method>` | as `/api/<method>` | bearer or cookie | the same routes for the record the path names, which is where the app sends every record call made from a page under `/<slug>/` (`apiBase` in `apps/web/src/lib/at.ts`). The old `/app/<slug>/api/<method>` is the same route, still served and never redirected, for a hosts file written before October 29th. The host takes the slug off and answers `/api/<method>` with it. A cookie reaches that record only once the Directory finds the name live, the record open and the person in `dir_member`, and the record's own `access(person)` agrees; any other name, one that does not exist included, is one `403 FORBIDDEN` *"You are not on this record."*, and nothing is addressed first. A bearer must name the same record or it is `403`, and the key doors (`/api/vault/*`) are only at the root. `/app/api/<method>`, with no slug, is `ROUTE_UNKNOWN`. The self-host serves it for the one record it holds (added September 23rd 2026, push A of the one-domain move, under `/app`; at the root since October 29th 2026) |
| `/api/<method>` | POST | **cookie only** | KEYCHAIN, and the browser four of JOBS (`createJob cancelJob listJobs jobEvents`) — a bearer gets **403 `NEEDS_BROWSER_SESSION`**; every MCP token is refused the job surface |
| `/api/<method>` | POST | cookie, **or a bearer carrying an operation grant** for exactly this method | ADMIN — `ctx.op` is the grant: single-use, ten minutes, the operation named at approval (§10; ADR-060 as amended) |
| `/api/claimJob` · `/api/postJobEvent` · `/api/readCancel` | POST | the runner's grant | the runner three of JOBS; `claimJob { wait }` long-polls in the host, never inside the object (§11) |
| `/api/export` | POST | cookie, or an operation grant `export <scope>` | answers `200 text/plain; charset=utf-8` — the `.brainl` itself, streamed; the host emits the `dog_sig` line last (§9) |
| `/api/import` | POST | cookie, or an operation grant `import <file sha256>` | takes the `.brainl` as its `text/plain` body; an empty record only (§9) |
| `/api/deleteRecord` | POST | cookie, re-authenticated | ADMIN; the slug typed to confirm (§10) |
| `/api/snapshot` · `/api/snapshots[/:id]` | POST · GET | cookie | ADMIN; the list reads R2 (Cloud) or `<slug>/snapshots/` (self-host) |
| `/api/vault/deposit` · `/api/vault/open` | POST | **a Keychain grant's bearer**, checked by `vaultGrant`, which never accepts a login token; any `Origin` is refused | an agent's keys from a terminal (12 §6 rule 9). The host seals and opens with its `KeyStore` and the record binds sealed bytes only. Not record methods, so not in `ROUTES` |
| `/api/keys/put` · `/api/keys/open` | POST | **cookie only**, on an origin this host answers for; every bearer is **403 `NEEDS_BROWSER_SESSION`**, the self-host's server key included, and a request carrying no `Origin` is refused | the owner's own keys from the Keys screen, through the same host step: `put` seals a new value or replaces the value of the row it names, `open` answers one key once with `no-store` and counts it as a `grant.read`. The KEYCHAIN gate decides, not the door (12 §6 rule 9, added September 16th 2026) |
| `/api/kennel/v1/*` | GET · HEAD · POST | none to read, open to every origin; a write names who asks by an author's signature, a bearer as `/api` reads one, or a cookie from this host's own origin; `review` and `publisher` take the operator's `PROVISION_KEY`, and `review` also opens to the operator's own session (`OPERATOR_EMAILS`), for the app's Admin page | the Kennel (14 §1): `index.json`, `packs/<id>/<version>.pack.json` and `usecases/<id>/<version>.usecase.json` (immutable), their `.preview.json`, `counts.json`; `POST submit`, `POST yank`, `GET` and `POST review`, `POST publisher`. Not record methods, so not in `ROUTES`. A self-host answers the reads from its folder and `BRAINDOG_KENNEL`, and refuses the writes `NOT_IN_THIS_BUILD` |
| `/api/slash/<method>` | POST | cookie only | Slash's named methods (46 §2), registered only when `SLASH_ENDPOINT` is set; otherwise no route |
| `/api/boot` · `/api/pages/:slug` · `/api/schema/:register` | GET | bearer or cookie | aliases of `boot page schema` |
| `/api/version` | GET | bearer or cookie | `{ version, format, kernel, primitives, app, slash: boolean }`. The polling fallback reads `version`, and what it is depends on who asks: `MAX(event.rowid)` to an owner who reads every list (the record's `holdsRowids`), and to anybody else a 53-bit hash, from two FNV-1a passes, of the id of the newest event line they are shown, or `0` when they are shown none. That second number is not ordered: a non-owner may compare it for change and nothing else, never read it as a count or scan from it, because the rowid gap it replaced counted the events they were not shown (`83875130`). The `app` tuple is here for a client that already has this record open, and `deploy-parity` reads the deployment's own copy at `/.well-known/braindog-build` instead, because this route is `READ+` and a deploy check carries no bearer (§8) |
| `/mcp` | POST | **bearer only**: an agent token, or the self-host's server key, by the path `/api` takes; never a cookie, never open mode | streamable HTTP, stateless, the 2026-07-28 shape: `serveMcp` in `@braindog/mcp/http` over the core's `handle`, called by both hosts; sixteen tools, three prompts, resources, `instructions` with every `tools/list`. In order: 405 with `Allow: POST` for any other method, GET and DELETE included; 403 for any `Origin`; 415 for a body that is not `application/json`; 401 with `WWW-Authenticate: Bearer` before a byte of the body is read; 413 above 1 MB, on `Content-Length` and on the bytes; 400 `-32700` for a body that is not JSON. `MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name` are held to the body when sent, and required of a 2026-07-28 request: 400 with `-32022` for an unsupported version, `-32020` for a mismatch. A notification is 202 with no body; a method the server lacks is `-32601` on a 200, never a 404, which a client reads as the endpoint gone (D38). No session id is minted or echoed. The token's `last_surface` is `mcp` |
| `/in/webhook/<rec_id>/<ingest-id>/<token>` | POST | the ingest's `verify:` (HMAC header or the URL's random path segment) | above the auth gate; store raw, enqueue, return — an ingest id is per record, so the record is in the path |
| `<slug>@in.brain.dog` | email | DKIM/SPF pass, else quarantined | Cloud: above the auth gate; store raw, enqueue |
| `/in/email/<token>` | POST | the token minted at `init` (`<slug>/inbound.token`) | self-host: raw RFC 5322 in the body, from a forwarding webhook (§6) |
| `/a/<sha256>` | GET | none | attachment bytes, type sniffed, SVG 415, `default-src 'none'; sandbox`; the record from the session or `?r=` |
| `/a/<sha256>` | PUT | cookie, or a `write` bearer | upload: the client computes the hash, the server verifies it — a mismatch is `CHECKSUM_MISMATCH` |
| `/s/<token>` | GET | the share token → a `share` principal | one projected page, read-only; an invalid token is 404 |
| `/<ID>` · `/<slug>/<ID>` | GET | cookie | a spoken id, resolved by the shell — there is no server 302. It was under `/app` from push A until October 29th; a slug of the spoken-id shape (`d41`) is refused, so the segment is never both |
| `/.well-known/braindog-key` | GET | none | **Specified and not built.** `{ key_id, public_key }`, the host's signing key, for `braindog verify` (03 §4; 48 §13 D10). Neither host answers it, and `braindog-build` is the only path served under this prefix. It keeps this path when it lands |
| `/.well-known/braindog-build` | GET | none | `{ app }`: the `BRAINDOG_BUILD` tuple this Worker version was deployed with, and `null` when the deploy named none. It needs no credential because it is a fact about the deployment rather than about any record; `deploy-parity` reads it (§8) |
| `/.well-known/oauth-protected-resource` | GET | none | answers the RFC 9728 document; the OAuth doors are listed in [10-MCP](10-MCP.md) §2 |
| `/ws` | GET (upgrade) | cookie | Cloud: the hibernatable WebSocket, the frame `{ version, registers }` on change; self-host phase 2: 404, the client polls `/api/version` |
| `/ws/runner` | GET (upgrade) | the runner's grant | Cloud only: the doorbell socket, `{ t: 'wake' }`; the self-host runner long-polls (§11) |
| `/auth/*` | GET · POST | per route | the sign-in routes below, which are the Directory's (§10) |
| `/account/*` | GET · POST | **cookie only**, the payment provider's webhook by its signature | the account routes below, which are the Directory's like sign-in and never reach a record |
| `/` · `/*` | GET | none | the static shell: one build, written to the root of `build/` by `paths.base: ''`, served by both hosts beside the doors above, which are answered first; no server renders a request. A page under `/<slug>/` is the same shell, and its data comes from `/<slug>/api/*` above, so a stranger there is sent to `/signin?next=`, never to the sample. Bare `/` on the Cloud is a `302` to `/<slug>/` for a session on a record, to `/start` for one on none, and the shell with no cookie. A missing file under `/_app/` is a 404. A first segment that is a door's word no door serves (`/a`, `/ws` on a host without them) is the router's `ROUTE_UNKNOWN` 404, never the shell (October 29th 2026; under `/app` from push A until then) |
| `/app` · `/app/*` | GET · HEAD | none | the app's address from push A until October 29th 2026: a `308` to the same address with the `/app` taken off, query kept, so a bookmark or a link mailed before still lands, fragment and all. On the Cloud's own name every GET under `/app` is sent on; on a legacy name (`brain.dog`, reached through the site's binding) a browser's page load (`Accept: text/html`) is sent straight to `https://app.brain.dog<path>`, one hop. A record's API and key under `/app/<slug>/` are served, never redirected |

**The `/auth/*` routes, once.** `AUTH_ROUTES` in `packages/host/src/auth.ts` is this table as data (its two device rows come from `device.ts`), and both hosts
answer it through one `serveAuth`. A POST needs `application/json` and a same-origin `Origin`. A 200 is the `/api`
envelope; a sign-in that does not sign somebody in is `401 UNAUTHORIZED` "That did not sign you in."; the lockout
is a bare `429` with `Retry-After` and `{ ok: false, retryAfter }`; a lockout store that fails is `503`.

| Route | Method | Host | Does |
|---|---|---|---|
| `/auth/methods` | GET | both | which ways in this host offers, and who the cookie belongs to: `{ passkey, magic, key, open, why?, me, firstRun?, google? }`; `magic` is `'down'` on a host that offers links while its mail is not going out (no sender, or the last five sign-in letters failed within the quarter hour), and the sign-in page then offers no link and says so |
| `/auth/session` | GET | both | who the cookie belongs to, or 401 and the cookie cleared |
| `/auth/token` | POST | self-host | `{ serverKey }`: the server key (`BRAINDOG_SERVER_KEY`, formerly `BRAINDOG_TOKEN`) for a session, where the Directory holds one person |
| `/auth/passkey/register/options` · `/auth/passkey/register` | POST | both | the registration ceremony, behind a session |
| `/auth/passkey/assert/options` · `/auth/passkey/assert` | POST | both | signing in with a passkey |
| `/auth/magic/start` | POST | both | `{ email }`: a link, mailed as `<origin>/signin#magic=<token>` (`linkOf` in `packages/host/src/auth.ts`; a claim link is `#claim=` on the same page); an unknown address gets the same 200 and no mail. A link mailed from push A until October 29th 2026 as `<origin>/app/signin#magic=` still works, because that page load is a `308` to `/signin` and a browser keeps the fragment |
| `/auth/magic/redeem` | POST | both | `{ linkToken }` or `{ claimToken }`: spent once, by a press, never by a GET |
| `/auth/magic/whose` | POST | both | `{ linkToken }` or `{ claimToken }`: `{ email }` of the account the link opens, so the screen says it before the press; spends nothing, and a miss strikes `ip:<addr>` as a redeem does |
| `/auth/passkeys` · `/auth/passkey/remove` | GET · POST | both | a person's own passkeys, and removing one, the last included; adding or removing needs a proof within 15 minutes (401 `NEEDS_BROWSER_SESSION`, reason `stale`), removing ends the person's other sessions, and both are mailed to the person |
| `/auth/passkey/rename` | POST | both | `{ id, label }` → the renamed passkey, behind a session; renames only your own, to one line of at most 64 characters; an empty name is 422 `VALUE_MALFORMED`, and a key that is not yours 422 `OUT_OF_BOUNDS`, as one that does not exist is |
| `/auth/logout` | POST | both | ends the session and clears the cookie |
| `/auth/sessions` · `/auth/logout/all` | GET · POST | both | a person's own live sessions, `{ sessions: [{ ref, current, authedAt, activeAt, record }] }`, this one marked, each by a short reference and never by its id; and ending the others, `{ keep: "this" }`, or every one, `{ keep: "none" }`, answering `{ ended }` |
| `/auth/keychain/lock` | POST | both | `{}` with the session cookie, as JSON, from a page on this origin (`sameOrigin`). No session is 401. Lock now for the Keychain (12 §6.3): the session's last proof is moved back past the longest Keychain window, so its next Keychain act asks for a sign-in; the session stays signed in, its cookie and life unchanged. Answers `{ locked: true }`. Added October 26th 2026 |
| `/auth/signup/start` · `/auth/signup/verify` · `/auth/signup/name` | POST · POST · GET | Cloud | declared for sign-up: a mailed link proves the address, spending it once makes the person and signs them in, and `?slug=` asks whether a name is free; until the `AuthCall` union names the three flows each answers as a way in this host does not offer |
| `/auth/google/start` · `/auth/google/callback` | GET · GET | Cloud | signing in with Google, served only when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set and mail is on, which `/auth/methods` says as `google: true`. `start` takes `?next=`, a path of the app on this origin and not one of its doors (`appNext` in `packages/host/src/auth.ts`; an old `/app/...` is read as the path without it), writes a ten-minute state cookie and redirects to Google asking for `openid email`; `callback` checks the state, trades the code with the client secret and a PKCE verifier, and reads the address from the ID token. Only a verified `@gmail.com` address or one with an `hd` claim is taken. An address somebody here has is signed in through a link minted and spent on the spot (`magic.start`, `magic.redeem`) and redirected to `next`; anything else is a redirect to `/signin?google=` with `cancelled`, `unknown`, `unverified`, `locked` or `failed`. The only GETs that sign anybody in |
| `/auth/google/desktop` · `/auth/desktop` · `/auth/desktop/handoff` | POST · POST · POST | Cloud | the Mac app's way back from a sign-in finished in the browser (docs/55). The app keeps a PKCE verifier and sends its challenge: to `/auth/google/start` as `?desktop=1&challenge=`, and to `/auth/magic/start` as `app`, which the mailed link carries as `?app=`. Google's callback, or the link's page through `handoff` (`{ linkToken, challenge }` → `{ code }`), seals the unspent link to that challenge as a two-minute code for `braindog://auth?code=`; the app's window posts `{ code, verifier }` to `/auth/desktop` (or the older `/auth/google/desktop`), which spends the link and sets the cookie. A code without the window's verifier opens nothing |
| `/auth/device` | POST | both | `{ slug?, reach, label, scope? }` with no credential, and no `Origin` needed because a CLI sends none: `{ device_code, user_code, verification_uri, expires_in, expires, interval }`, where `verification_uri` is always on `<origin>`: `<origin>/<slug>/connect/approve` on the Cloud when the start named a slug, and `<origin>/connect/approve`, the record the session is on, otherwise and on the self-host (`packages/host/src/device.ts`, since push A). `403` when the host was reached by another name or a page on another origin sent it; ten starts per address in 15 minutes, then `429` |
| `/auth/device/token` | POST | both | `{ slug?, device_code }`: `{ pending: true, interval }` until approved, then the bearer once. `slug` names the record on Cloud; the self-host holds one, and answers both routes only when its server key (`BRAINDOG_SERVER_KEY`, or `BRAINDOG_TOKEN`) is set |
| `/auth/invite` | POST | both | `{ inviteToken, accept? }`, the token from the link's fragment: without `accept` it looks and spends nothing, answering `{ email, expires_at, signedInAs }`. With it, somebody signed in at that address goes on the record; an address that can already sign in here is 401 and signs in first; a new address proves its mailbox first: the host mails `<origin>/invite#<token>&proof=<proof>` to the invited address and answers `202 { proving: true, to }`, and only when that link comes back, as `{ inviteToken, accept, proof }`, is the person made, put on the record and given a session. A proof spent, run out, or minted for another invitation or address is 401. A self-host whose owner has no passkey is 409, because its server key stops working at the second person |
| `/auth/switch` | POST | both | `{ slug }` with the session cookie, as JSON, from a page on this origin (`sameOrigin`: `Origin` exactly this origin, or without it `Sec-Fetch-Site: same-origin`; a cross-site form or link moves nothing). No session is 401. The session row's record moves to that one and `Who` comes back; the cookie is not rewritten. The slug must be ASCII, `^[A-Za-z][A-Za-z0-9-]{1,31}$`, before it is lowered, so a character that folds to a letter (the Kelvin sign) opens nothing. The record must be open, under a live name, listed with the person in the Directory, **and** say so itself: the host's `admits(record, person)` asks the record's own `member` table, because the Directory keeps listing somebody `removeMember` took off. The update re-asks the same question in its own statement and finds the row by its current or previous id, so a cookie rotated on this request or a name released meanwhile moves nothing. Anything else is one `403 FORBIDDEN` at `slug`, *"You are on no open record by that name."*, the same for a record that does not exist and one the person is not on. A self-host admits only the record its process serves, asked after the session, so a caller with no cookie cannot learn which name that is; what a person may do inside is still the record's own table |
| `/auth/provision` · `/auth/claim/mint` | POST | Cloud | the operator's, behind `PROVISION_KEY`: a record, its Directory rows and a 24-hour claim link handed back, never mailed |
| `/auth/suspend` | POST | Cloud | the operator's, behind `PROVISION_KEY`, locked out on a wrong key like `/auth/provision`: `{ email, suspended? }` stops that person signing in and ends every session they hold, or, `{ email, suspended: false }`, lets them in again; answers `{ person, suspended_at }` |

Specified and not built: `/auth/device/approve` (the operation grant of
§10). It keeps this path when it lands. *(`/auth/switch` landed September 16th 2026 as a POST taking `{ slug }`, not the
`GET /auth/switch/<slug>` of `50`: a GET that moves a session is a link any page can make a browser follow.)* *(`/auth/invite` landed September 16th 2026, as a POST taking the
token in its body: the link is `<origin>/invite#<token>`, with no slug because the token names its record (`<origin>/app/invite#<token>` from push A until October 29th 2026, which a `308` still lands); the fragment keeps the token out of logs, proxies and `Referer`,
as a sign-in link's does.)*

**The `/account/*` routes.** `ACCOUNT_ROUTES` in `packages/host/src/auth.ts` is this table as data, and both hosts
answer it through one `serveAccount`. The session cookie is the only credential it reads: a bearer, no cookie, a host
where nobody signs in or an ended session is 401 `UNAUTHORIZED`. A path not in the table is 404 `ROUTE_UNKNOWN`, and
another method is 405 with `Allow` naming the row's own method, and a POST needs `application/json` from a page on this
origin. `router-groups` reads the table: every row a GET or a POST under `/account/`, served by both hosts or by the
Worker alone, behind the session except the payment webhook, and named here. A row whose door the host was not handed
answers 404 `ROUTE_UNKNOWN`.

| Route | Method | Host | Does |
|---|---|---|---|
| `/account/usage` | GET | both | `?from=YYYY-MM-DD&to=YYYY-MM-DD`: `{ from, to, totals, records }`, what the records the signed-in person owns used between the two days, each with its month so far against its plan's allowance. A day in another shape is `VALUE_MALFORMED`; a range that runs backwards or covers more than a year and a day is `OUT_OF_BOUNDS` |
| `/account/records` | GET | both | `{ slug, name, level }[]`, every open record the signed-in person can reach, each named and levelled by that record's own answer rather than the Directory's: the record switcher's rows. A record the Directory still lists but which answers with no level is left out, never shown with one nobody granted |
| `/account/billing` | GET | Cloud | each record the signed-in person owns, whether it is paid for, and whether this host takes payment at all |
| `/account/billing/checkout` | POST | Cloud | a payment page for a new record, `{ slug, name?, tz? }`, or for paying again, `{ record }` |
| `/account/billing/portal` | POST | Cloud | the payment provider's page for a record the person owns, `{ record }` |
| `/account/billing/extra` | POST | Cloud | extra usage past the allowance for a paid record the person owns, under a monthly cap, `{ record, cap_cents }`; 0 turns it off |
| `/account/billing/webhook` | POST | Cloud | the payment provider saying a payment happened, checked by its signature over the body as sent; no cookie |
| `/account/close` | POST | Cloud | closes the account, `{ email }` typed to confirm, from a sign-in in the last fifteen minutes |
| `/account/email` | POST | both | `{ email }`: always `200 {}`. Mails a single-use link, good for 24 hours, to the new address (`<origin>/settings/identity#email=<token>`, the token in the fragment as a sign-in link's is); nothing moves until it is pressed, and asking again takes the last link back. An address another person signs in with gets the same `200 {}` and is mailed nothing, so the answer never says who has an account; the ask needs a sign-in in the last 15 minutes, and each person may ask 5 times an hour and each address be asked for 3 times an hour (`RATE_LIMITED`). A host that cannot send mail is handed no door and answers 404 |
| `/account/email/confirm` | POST | both | `{ token }`, from a sign-in in the last fifteen minutes (`FRESH`; otherwise `NEEDS_BROWSER_SESSION`, and the link is left unspent): moves `dir_person.email`, then the `person.email` of every open record the person belongs to with an `edit` event on the person there, and mails the old address one line. Answers `{ email, unreached }`, the count of records that could not be reached and still show the old address. A spent, expired or another account's link is `UNAUTHORIZED` |

`Cache-Control: no-store` on `/api/*` and `/mcp`; no CORS; `run_worker_first: ['/api/*', '/mcp', '/a', '/a/*', '/in/*',
'/s/*', '/ws', '/ws/*', '/auth/*', '/account/*', '/.well-known/*', '/*', '!/_app/*', '!/catalogue/*']`, the list in `apps/worker/wrangler.jsonc` (`/app`, `/app/*` and the two negatives under `/app` from push A until October 29th 2026), with `not_found_handling: 'none'` since push A: the Worker sees every app navigation before a file answers it, because under `/<slug>/` the slug must be checked first, and the two negatives leave the hashed chunks and the bundled catalogue to the files. INTERNAL methods have no route. There is no admin scope: KEYCHAIN never
sees a bearer, and ADMIN sees one only when it carries an operation grant for exactly that method.

**Error bodies.** Both hosts return the `Result` envelope unchanged; the status is `host.httpStatus(result)`: `ok`
200 · any refusal 422 (`PLAN_STALE` and `IMPORT_NOT_EMPTY` included — never 409) · `conflict` 409 · `UNAUTHORIZED` 401
with an empty body · `FORBIDDEN` and `NEEDS_BROWSER_SESSION` 403 with the envelope · the migration refusal 503. Every
response echoes the client's `X-Request-Id`, and both hosts log it. A request names its record by its session
(browser; the record is on the session row), by the bearer's hash, or by its own path (a share, an email, a webhook).
A browser's call under `/<slug>/api/` names its record by the slug instead, checked as the table's `/<slug>/api/<method>` row says, and the
session row's record is then the one last opened, which only `/auth/switch` moves.

---

## 5 · The CLI — `braindog`

One bundled file (`esbuild`), the `braindog-cli` package (Apache-2.0); `yaml` and `valibot` ride inside it through `declare`
([ADR-046](16-DECISIONS.md), [ADR-063](16-DECISIONS.md)) and nothing else does. `--json` is built
([48-SPEC-CLI](48-SPEC-CLI.md) §4.5): it answers with one JSON document on stdout and moves every other line to stderr.
`mcp`, `keys exec`, `keys headers`, `keys helper`, `run`, `hook`, `setup`, `env apply`, the `sync` verbs but
`inventory`, `addon preview`, `starter preview`, `init` and `serve` do not take it, since each hands stdout to
something else or asks at the terminal.

The table is the families of commands, as `braindog --help` names them on October 30th 2026 (`fullUsage` in
`apps/cli/src/main.ts`); each command's own `--help` prints its lines, and 48 §2 has every flag. `addon` was `pack`
and `starter` was `usecase`, and the old names still answer.

| Command | Does |
|---|---|
| `braindog setup <host> [--dry-run \| --yes] [--only <app>] [--profile <folder>] [--statusline]` | sets a machine up from one record in six steps, one line each, stopping at the first that fails: sign in unless already signed in; BrainDog's hooks and Agent Skill in every Claude Code profile (and Codex's turn end and its `AGENTS.md` block where Codex is); the `braindog` MCP server in every app it finds; the record's global tools; `skills sync`; one token for each kind of agent it wired, each approved in the app |
| `braindog login <host> [--keychain <project\|*>]` · `logout [<host>]` | the RFC 8628 device flow of [12-SECURITY](12-SECURITY.md) §6.1 with `reach = login`: prints a six-digit code, the owner approves in the browser, the CLI receives a **`read`+`write` agent token** and stores it in `hosts.json` (0600) — under `$XDG_CONFIG_HOME/braindog/`, `~/.config/braindog/` when unset, `%APPDATA%\braindog\` on Windows unless `XDG_CONFIG_HOME` is set. `BRAINDOG_HOST` / `BRAINDOG_TOKEN` override. That token never reaches ADMIN. `<host>` is what the app's connect screen prints, `<origin>/<slug>` (on the Cloud today `https://app.brain.dog/<slug>`); the CLI keeps it as `<origin>/<slug>`, and an address written with `/app` before October 29th 2026 the same way, taking `/app` off, so a login written either way is one entry. There is no default host. `logout` removes the host's tokens from the file and tells nobody |
| `braindog keys list\|put\|scan\|exec\|headers\|helper` · `braindog run` | the Keychain from a terminal: list (never a value), deposit from standard input or a file of `NAME=value` lines, name keys lying in a repository's files, run a command with one key in its environment (`run` is `keys exec`), or print one header or the key alone to a program, never to a terminal |
| `braindog skills sync` · `tools scan\|write` · `session …` · `context` | the agent's side: skills into Claude Code's folders, MCP servers recorded and written, the run this folder is in, and the card again |
| `braindog page pull\|push\|check` | a page as a `.dog` file; `push` from a token files a `propose` change and waits on Decide (48 §2) |
| `braindog starter …` · `addon …` · `kennel review` | starters and add-ons: `new`, `check`, `test`, `preview`, `diff`, `search`, `install` (a proposal the owner accepts, never an install from a token), `uninstall`, `publish`, `yank`, author keys; the Kennel operator's review |
| `braindog automations list\|show\|run\|cancel` · `actions run` · `scripts resume` | automations, scheduled actions and paused scripts; starting, cancelling and resuming are ADMIN and refused to a token |
| `braindog export [--kek <id> \| --redact-grants] [--sections …] [-o file] [--mirror <folder>] [--shape]` | the `.brainl` (41 §5.10's line format), checked on this machine; `--mirror` writes the record as plain files, only what changed; `--shape` a copy with every value made up |
| `braindog import <file.brainl> [--key <pubkey\|url>]` · `import <adapter> <export.json> …` · `import --map …` | a `.brainl` put back in place of everything the record holds (§9); or another tool's export moved in through an adapter or a map |
| `braindog verify <file> [--key <pubkey \| url>]` | offline: format, every table against its manifest, signature; without `--key` the output says `unpinned`, with it the key must match `dog_sig.key_id` |
| `braindog token create [--name <n>] [--scope read\|propose\|write] [--days <n>] [--inbox]` | an agent token, printed once; `--scope` is one word on the wire — the ladder's top. There is no `token list` or `token revoke`: listing and ending tokens is the app's (Settings) |
| `braindog people harvest` · `attach` · `today` · `widget share` · `signs` · `tidy` · `understand --dry-run` · `feed propose` · `private-terms` | reads and writes an agent or a person runs by hand: meet commit authors, put a page on a thing, Today's widgets, the vital signs, what went stale, what a pass would link, live feeds asked on Decide, the private list the public-clean check reads |
| `braindog mcp [--agent …] [--local]` · `hook start\|end\|beat\|prompt\|tool\|stop\|watch\|notify` · `statusline` | what an agent app runs: the stdio bridge to the host's `/mcp`, the session hooks, Claude Code's status line |
| `braindog install [--apply]` · `doctor` · `env diff\|apply\|pins\|check` · `update [--check]` | this machine's Claude Code profiles: hooks and the Agent Skill, what still names a replaced tool, profiles compared and set up, approved programs, the command replaced by the build that is out |
| `braindog sync inventory\|join\|push\|pull\|patches\|drill\|retire` | setup sync between machines, sealed under a key kept in the machine's own keychain |
| `braindog runner enrol <host>` · `runner repos add\|list` · `runner allow <kind>` · `runner run [--once]` · `runner service on\|off\|status` | tier C: the device grant with `reach = runner`, then the loop of §11 |
| `braindog init <slug> --owner <email>` · `braindog serve [<record file>]` | self-host only; both spawn the self-host entry with `process.execPath` (`BRAINDOG_SELFHOST`, or `apps/selfhost/src/main.ts` in a checkout) — the CLI never imports `apps/selfhost` and never links `packages/record`. `init` creates `<data>/<slug>/record.brain`, runs the migrations, writes the owner into the Directory and mints `<slug>/inbound.token` (0600), and refuses a data folder that already holds another record ([49](49-SPEC-SELFHOST.md) §5.22). There is no `dev` |
| `braindog --version` | `app <date>+<sha> · format 1 · kernel <n> · primitives 1` |

**ADMIN from the CLI is an operation grant** ([ADR-060](16-DECISIONS.md) as amended). The three commands that reach
an ADMIN method from a terminal — `export`, `import <file.brainl>` and `token create` (and `setup`'s tokens, which are
`token create` per agent) — start a device grant whose `reach` names the operation: `export`, `import`, `token`
(`OperationReach` in `apps/cli/src/login.ts`). The owner approves that one operation in the browser after seeing its
summary, and the bearer reaches exactly that method once, within ten minutes, with `ctx.op` set. Nothing is written
down, and `login`'s token is never widened. On a self-host, the command line's `BRAINDOG_TOKEN` set to the server's key skips the
approval. Installing an add-on or a starter from the CLI is a proposal the owner accepts in the app, not a grant.

Refusals print as one sentence: `register.invoices.fields[4].type 'currency' — did you mean 'money'?`
(`FIELD_TYPE_UNKNOWN`). A local error — a missing file, a bad flag — has no refusal code; under `--json` it is the
envelope's fourth variant ([48-SPEC-CLI](48-SPEC-CLI.md) §4.5). Exit codes: 0 ok · 1 refused, or a local error ·
2 conflict · 3 unreachable, or the host is the cause.

---

## 6 · The self-host process

One Node process, one artefact, `docker run`, no build step. Phase 2 ships it with the magic link and the server key,
polling in place of `/ws`, and inbound email through a forwarding webhook; passkeys are phase 3.

| Setting | Value |
|---|---|
| Runtime | Node **24.13.0**, pinned to the minor; `node:sqlite` is the only driver (FTS5 and JSON measured present) — no `better-sqlite3`, which is not built under the pin |
| Entry | `BRAINDOG_SELFHOST`, or `apps/selfhost/src/main.ts` relative to a checkout — what `braindog init` and `serve` spawn (§5); run directly as `node apps/selfhost/src/main.ts serve\|init\|backup\|restore` |
| Data | `BRAINDOG_DATA=/data` — `<slug>/record.brain` per record, plus `directory.sqlite` (§10); a request names its record by its session row, the bearer's hash, or its own path (§4) |
| Root key | `BRAINDOG_KEK_FILE=/data/kek` — 32 random bytes, 0600, created on first run; `BRAINDOG_KEK_PREV_FILE` is the second slot of the rotation ladder (§1) |
| Secrets | `BRAINDOG_SESSION_SECRET`, optional: what the Directory's session key is derived from by HKDF instead of the key file (§10); `BRAINDOG_ORIGIN`: the origin the app is served from, which names the cookie and the passkeys' relying party; `BRAINDOG_TRUST_PROXY=1`: count the lockout against the last `X-Forwarded-For` entry; `BRAINDOG_TOKENS_VALID_FROM` — the fleet lever that invalidates every bearer minted before an instant |
| Origin | `BRAINDOG_ORIGIN` — the public origin for magic-link URLs, the CSRF origin check and (phase 3) the WebAuthn `rpId`; default `http://localhost:<PORT>` |
| Auth | the magic link, and the server key `BRAINDOG_SERVER_KEY` (its old name `BRAINDOG_TOKEN` still read when it is unset) as an owner-level bearer for a private single-user instance; the owner's first sign-in is a one-time claim link written to `/data/claim-link` (0600), never to the log; passkeys in phase 3; sign-up is closed — `init` and invitations create people |
| Mail | outbound through `BRAINDOG_SMTP_URL` and `BRAINDOG_SMTP_FROM` — one small client over `node:tls` (implicit TLS on 465 or STARTTLS on 587, `AUTH PLAIN`), no dependency (49 §5); inbound through `POST /in/email/<token>` from a forwarding webhook, raw RFC 5322 in the body — the token lives at `<slug>/inbound.token` |
| Port | `PORT=8080` inside; Compose publishes it on `BRAINDOG_PORT` (default 8080). The interface is `BRAINDOG_LISTEN` (its old name `BRAINDOG_HOST` still read when it holds no `://`), loopback with no server key and every interface with one. TLS is the reverse proxy's job, or `BRAINDOG_TLS_CERT` and `BRAINDOG_TLS_KEY` |
| Per open | the adapter applies `journal_mode=WAL` · `synchronous=NORMAL` · `busy_timeout=5000` · `foreign_keys=OFF`, asserts `foreign_keys = 0`, and runs `measureCaps` and the boot probe (37 §13 D10) |
| Scheduler | one `setTimeout` over `MIN(due_at)` per record; one outbox poller per record, which `wake()` kicks (`setImmediate`); one nightly timer per process |
| Snapshots | nightly `VACUUM INTO` (permitted here) → keep 30, under `<slug>/snapshots/`. **A snapshot is a full copy that keeps the six `local` tables and never leaves the host** — disaster recovery, restored offline by putting the file back; **an export is the portable `.brain` without them** (§9) |
| Live channel | no `/ws` in phase 2 — 404, and the client polls `/api/version` |
| Web | the same static build the Worker serves, from disk, at the root (`apps/selfhost/src/shell.ts`): a missing file under `/_app/` is a 404, any other path the process does not answer itself is the shell, and a path under `/app`, where the app was from push A until October 29th 2026, is a `308` to the same path without it, whatever it asks for |
| Boot | `measureCaps` per record file; a build without FTS5 refuses to start, naming the driver. One sick record does not stop the host: `SCHEMA_MISMATCH` / `SCHEMA_NEWER` is per record, 503 on its routes only |
| Limits | the adapter enforces `DO_LIMITS` (§1) so a self-host never out-runs the Cloud |

The self-host is where a `.brain` is a *file*: the live database is a `.brain` with its `local` tables in it, a snapshot is
a byte-for-byte copy of that, and an export is the same content with `local` stripped, manifested and signed — the four
`dog_*` header tables are present in all three because migration 0001 created them.

---

## 7 · The Worker and its Durable Objects

**Three DO classes**, never a class per customer:

| Class | Instance | Holds |
|---|---|---|
| `Record` | `idFromName(rec_id)` | the record — 27 tables + 4 header tables; the named methods of `createRecordApi(deps)` (§2); the hibernatable WebSocket |
| `Slash` | `idFromName(rec_id)` | the `settings` and `call` tables of 46 §4.1 — no conversation table, no retrieval cache; the runner's doorbell socket. **No lease state and no alarm**: job leases are the record's (`claimJob`, §11) |
| `Directory` | `idFromName('directory')` | persons, passkeys, sessions, magic links, invitations, `slug → rec_id`, the login lockout — the tables and flows of `@braindog/record/directory` (§10) |

Classes extend `DurableObject`; `Record` exposes `createRecordApi(deps)`'s methods and `Slash` exposes
`createSlash(deps)`'s, by name. Everything both hosts would otherwise write twice lives in **`@braindog/host`**: the
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
    { "name": "SLASH",     "class_name": "Slash" },
    { "name": "DIRECTORY", "class_name": "Directory" } ] },
  "migrations": [ { "tag": "v1", "new_sqlite_classes": ["Record", "Slash", "Directory"] } ],
  "queues":   { "producers": [ { "binding": "OUTBOX_Q", "queue": "braindog-outbox" } ],
                "consumers": [ { "queue": "braindog-outbox", "max_batch_size": 10 } ] },
  "r2_buckets":     [ { "binding": "BLOBS", "bucket_name": "braindog-blobs" } ],
  "ai":             { "binding": "AI" },
  "send_email":     [ { "name": "MAIL" } ],
  "analytics_engine_datasets": [ { "binding": "TELEMETRY", "dataset": "…" } ],
  "ratelimits":     [ /* the two bindings of 51 §5 */ ],
  "triggers":       { "crons": ["17 3 * * *"] },                 // the nightly walk: snapshot, re-wrap, reconcile, the ladder
  "vars":           { "SLASH_ENDPOINT": "" },                    // unset = no Slash routes, `slash: false`
  "secrets_store_secrets": [ { "binding": "KEK",      "store_id": "…", "secret_name": "braindog-kek" },
                             { "binding": "KEK_PREV", "store_id": "…", "secret_name": "braindog-kek-prev" } ],
  // Worker secrets: SESSION_SECRET · TOKENS_VALID_FROM · AGE_RECIPIENT — the only age material the Worker holds
  "assets": { "directory": "apps/web/build", "binding": "ASSETS", "not_found_handling": "single-page-application",
              "run_worker_first": ["/api/*", "/mcp", "/a", "/a/*", "/in/*", "/s/*", "/ws", "/ws/*", "/auth/*", "/account/*",
                                   "/.well-known/*"] },
  "observability": { "enabled": true }
}
```

*(Amended September 23rd 2026 for push A of the one-domain move, read from `apps/worker/wrangler.jsonc` at `bb13a0b8`.)*
The skeleton is the design's, and the file differs from it in more than names; these are the differences that say
where the app lives. **Push A, live:** each environment's only route is its Custom Domain, `app.brain.dog` in
production and `app.alpha.brain.dog` in alpha; the app is under `/app` there; `PUBLIC_HOST` is still that name,
`LEGACY_HOSTS` is empty, and `RP_ID` is already the parent, `brain.dog` (`alpha.brain.dog` in alpha), so a passkey
made now is still offered on `brain.dog` after the move. `assets` has `not_found_handling: 'none'` and §4's
`run_worker_first`. `brain.dog` itself is still only the marketing site's. **Push A2, not made:** eight zone routes on
`brain.dog` (`/app`, `/app/*`, `/api/*`, `/mcp`, `/in/*`, `/auth/*`, `/account/*`, `/.well-known/braindog-build`) and
nothing else. **Push B, since reversed:** `PUBLIC_HOST` became `brain.dog` and `LEGACY_HOSTS` `app.brain.dog`. **Push C, the
file as it stands:** `PUBLIC_HOST` is `app.brain.dog` again and `LEGACY_HOSTS` is `brain.dog`, so a page load on
`brain.dog/app/...` (which reaches this Worker through the site's `APP` binding) is a `308` to
`https://app.brain.dog/app<path>`, path and query kept, while `/api/*`, `/mcp` and `/in/*` are served there with no
redirect. No route changed in either. *(Amended October 29th 2026.)* The app left `/app` for the root of its name:
`run_worker_first` is the doors and `/*`, with `!/_app/*` and `!/catalogue/*`, and every page load under `/app`, on
`app.brain.dog` and on `brain.dog` alike, is one `308` to `https://app.brain.dog<path>` with the `/app` taken off.

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
| `graph` | script | the package graph is acyclic and every import points down the thirteen-package order `render → ports → where → theme → fixtures → kernel → declare → extract → record → mcp → slash → connect → host` (31 §2); `mcp` imports `record`'s type only; apps import packages and never each other |
| `licence-closure` | script | `npm pack --dry-run --json` of both packages: no `@braindog/`, no `../../`, both LICENSE files start with the right words (31 §4) |
| `clean-room` | script | no identifier from `clean-room.txt` in any tracked text file outside `docs/` — the predecessor tripwire |
| `no-declarations-in-kernel` | script | the kernel declares no declaration of any kind (`KINDS` in `packages/kernel/src/declare.ts`) except `register.session` and `register.instructions` |
| `closed-lists` | script | every list in [34-GRAMMARS](34-GRAMMARS.md) §6 matches its owner's enumeration and its CHECK — the record's `DIALECT` constant against `render`'s kinds among them |
| `event-kinds` | script | the `event.kind` CHECK has forty members and the prose says forty |
| `refusal-fixtures` | script | every code in 30 §6 has a fixture that produces it, and no fixture lacks a code; the script checks the names, the `via`-keyed runners of 40 §6 check production |
| `router-groups` | script | every route declares its group; INTERNAL has no route; KEYCHAIN accepts no bearer; ADMIN accepts a bearer only with an operation grant, at exactly one ADMIN method |
| `slash-actor` | script | `event WHERE actor = 'slash' AND kind NOT IN ('suggest','propose','predict')` is empty over the `corpus` record |
| `grant-note` | script | no `grant.*` event note contains its grant's `label` or `opens`, over the `corpus` record (12 §8) |
| `mcp-budget` | test | not a gate script: `packages/mcp/test/budget.test.ts` holds `tools/list` at or under 2,600 tokens by `tokenBudget` (44 §5.8), measured at 2,311, each description under 200 and the instructions at or under 400 (44 §7) |
| `secret-grep` | script | no write path, log line, push payload or prompt template can carry a `grant` plaintext |
| `telemetry-allowlist` | script | the Analytics Engine blob allow-list of 08 §5 is exact |
| `shot-allowlist` | script | the screenshot-mode provenance allow-list ([ADR-050](16-DECISIONS.md)) equals the extraction from the markup, both ways |
| `harness-constants` | script | no host, port or URL literal in `apps/web/test/**` outside `env.ts` |
| `css-rules` | script | the CSS usage rules over first-party CSS and the emitted token set — the gate that stands where Stylelint would; there is no Stylelint |
| `conformance-count` | script | every host wrote `packages/ports/test/results/<host>.json` with the same number of cases; every skip printed |
| `compat-date` | script | `compatibility_date ≥ 2026-02-24` |
| `deploy-parity` | script | after `wrangler deploy`, fetch `/` and `/_app/version.json` from the live host, which must be `app.brain.dog` (`/app/` and `/app/_app/version.json` from push A until October 29th 2026, and on `brain.dog` the root paths are the site's); SHA-256 must equal `build/index.html` and `build/_app/version.json`; `/.well-known/braindog-build` answers the deployed `app`, with no credential, because the build id is the Worker version's and not a record's |
| `where-property` | test | the compiler and the evaluator agree on **1,000** random predicates in CI and **10,000** nightly; failing seeds committed |
| `boot-probe` | test | a build without FTS5 refuses with the exact message, naming the driver |
| `brain-roundtrip` | test | export → import → export over the `corpus` record differs by exactly one appended `import` event |
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

**Two containers, one content.** The `.brain` is a SQLite file. The `.brainl` is the canonical logical dump — header
lines, then one JCS array per row, tables in `dog_section` order, in the line format **41 §5.10** states once and every
other document cites — whose bytes are exactly what `dog_manifest` hashes ([34-GRAMMARS](34-GRAMMARS.md) §5). They
verify with the same key and import to the same rows.

| Operation | Procedure |
|---|---|
| **Export from Cloud** | the record pages the `.brainl` through `export({ cursor, sections?, redactGrants? })` (ADMIN, or `system` for the backup), ≤ 1,000 rows a page; `POST /api/export` answers one streamed `text/plain` body and the host — never the record — signs: one `sign()` over the record's `vault_key(purpose = 'signing')`, unwrapped with the KEK, and the `dog_sig` line emitted last. A Worker cannot build a SQLite file — no engine, no filesystem, 128 MB — so the `.brain` is materialised by the CLI or a self-host from the `.brainl`. The nightly R2 backup is `.brainl.age` |
| **Export from a self-host** | `VACUUM INTO`, strip the six `local` tables, vacuum again, write the manifest and signature into the copy — that is the export; the untouched `VACUUM INTO` copy is the snapshot (§6) |
| **What travels** | every table except `dog_section = 'local'` — six: `token device_grant auth_fail observation job job_event`; the other twenty-five travel. `grant` rows travel with `ciphertext` sealed, and `vault_key` travels — a KEK-wrapped key is nothing without the KEK, and a restored record must open its own Keychain; `--redact-grants` drops them; `--sections` narrows to `data`, `origin`, `governance` |
| **Import** | `POST /api/import` takes the whole `.brainl` as one `text/plain` body — there is no page protocol over HTTP; the record's batching (≤ 30 rows × ≤ 3 parameters) is internal to `importBrainl`. Only into an empty record (`IMPORT_NOT_EMPTY`); verify signature and manifest (`SIGNATURE_INVALID`, `CHECKSUM_MISMATCH`); refuse a `user_version` above the reader's (`FORMAT_NEWER_THAN_READER`); run kernel migrations on the imported rows; rebuild `entry_fts` from `entry`; write one `import` event — so export → import → export differs by exactly that one appended event. It is not the write path — `event` rows keep their actors — but nothing bypasses validation |
| **Restore** | `restore({ bookmark, at? })` is one ADMIN method: on Cloud the Worker performs `pitr(at)` first and then calls it, and it writes `restore.pitr` into the restored storage. A self-host has no PITR; it serves `restore` over its kept `VACUUM INTO` copies, a bookmark being a copy's id, and `braindog import` into a fresh record stays the path for anything else (§6). The Worker refuses `restore` with `NOT_IN_THIS_BUILD` until `pitr(at)` is wired (amended September 16th 2026) |
| **Migrations** | `packages/kernel/src/migrations/NNNN_<slug>.ts`, each exporting its SQL string; applied in numeric order by `applyMigrations` (INTERNAL) from the DO constructor under `blockConcurrencyWhile`, before any cache load — a fresh database never throws on open; each in one `transactionSync` that inserts its `migration` row; a module carrying `-- format-bump` sets `PRAGMA user_version` — best effort inside the record (a conformance case measures whether the DO permits it, and the refusal is swallowed explicitly), and set by the CLI or the self-host when a `.brain` is materialised; a checksum mismatch or a database newer than the code sets a module-level refusal (`SCHEMA_MISMATCH` \| `SCHEMA_NEWER`) that every RPC returns as 503 until a deploy fixes it — per record on a self-host. Never rolled back, never percentage-rolled: fix-forward |

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
| `passkey` | `id`, `person`, `jwk`, `alg` (ES256 or RS256), `sign_count`, `label`, `backed_up`, `created_at`, `last_used`; both hosts. The relying party is the Cloud's `RP_ID` when the host is under it (`brain.dog` in production since push A, so a passkey made at `app.brain.dog` is offered on either name, whichever the app is on) and otherwise the exact host, which is the self-host's case; an `RP_ID` the host is not under switches passkeys off (`relyingParty` in `packages/host/src/auth.ts`) |
| `session` | `id_hash` (HMAC-SHA-256 of `s:` and the id, under the host's session key), `person`, `record` (the record the session opened, so a browser holds one cookie), `expires`, `rotated_at`, `authed_at`, `prev_hash`, `prev_until`. The cookie: `__Host-bd_s`, `HttpOnly Secure SameSite=Lax`, 30 days sliding, rotated after 24 h of use; the replaced id answers for sixty seconds, because the app sends its first calls in parallel and the first to arrive rotates; `authed_at` records the last proof, rotation never moves it, and KEYCHAIN requires it within 15 minutes |
| `link` | `hash` (HMAC-SHA-256 of `l:` and the token), `person`, `purpose` (`magic`, 15 min; `claim`, 24 h), `expires`; single use, spent by the statement that deletes it |
| `challenge` | `hash` (HMAC-SHA-256 of `c:` and the challenge), `purpose`, `person`, `expires` (5 min): WebAuthn challenges in a table rather than in memory, so a ceremony survives the Directory object being evicted; single use, and minting refuses past 10,000 live rows |
| `invitation` | `hash`, `email`, `rec_id`, `levels`, `expires` (24 h), `accepted_at` |
| `record_dir` | `slug` UNIQUE, `rec_id`, `owner_person`, `billing ∈ active \| lapsed`, `lapsed_at` |
| `person_record` | `person_id`, `rec_id` |
| `fail` | `key`, `n`, `first`, `until`: the login lockout, reserve-before-compare, sticky, fail closed, and forgetting a first strike fifteen minutes old |

The record keeps `person` as a mirror (`id email name suspended_at`) so a `.brain` resolves its actors offline, plus
`member`, `token`, `device_grant` (with its `reach`) and its own `auth_fail` for device codes and share tokens. A browser
request's record is on its session row, set at sign-in to a record the person owns (else the first they joined),
and the host asks that record's own `member` table what the person may do, as it does for a bearer. A request under
`/<slug>/api/` is the exception: its record is the slug's, once the Directory has found the person on it (§4). In code the
tables are `dir_`-prefixed, at Directory version 3.

| Flow | Steps |
|---|---|
| Sign up | Cloud: email → magic link → `createRecord` (INTERNAL) writes the record first — the record row, the owner's `person` mirror, `member('*', 'owner')` — then the Directory rows `record_dir` and `person_record`; sign-up generates the record DEK, the connector DEK and the signing key ([12-SECURITY](12-SECURITY.md) §6); a passkey is registered after, from phase 3. Self-host: closed — `init` and invitations; an unknown email at `/auth/magic/start` gets 200 and no mail |
| Sign in | passkey first where one exists, the magic link as the fallback — the self-host's only path in phase 2; both produce a `session` row, which carries the record; a self-host also takes its server key at `/auth/token`; **no passwords** |
| Invite | `invite({ email, level?, registers? })` (ADMIN, the owner) mints an invitation — one address, 24 h, the token stored as `sha256` and answered once. No host mails it: the owner copies the link out of Settings. The invitee opens `<origin>/invite#<token>`, presses Accept, and `POST /auth/invite` signs them in and calls `acceptInvite` (INTERNAL) with the Directory's verified person, which writes the record's `person` mirror, the `member` rows and one `access.grant` event per register |
| Agent token | minted from a browser session (`createToken`) or by `braindog login`'s device flow; scoped `read` / `propose` / `write` — one word stored, the ladder's top; the bearer is `<rec_id>.<secret>` and the record's `token` table stores `sha256(secret)` with `last_used_at` and `last_surface`; one record |
| Device grant | six digits, ten minutes, five tries; `code_hash = sha256(id ‖ ':' ‖ user_code)` — `id` is the poll id, never the code; approved by the owner from a sign-in proved in the last 15 minutes (`deviceApprove`); `verification_uri` is `${origin}/<slug>/connect/approve`, or `${origin}/connect/approve` with no slug and on the self-host (§4); `device_grant.reach` names what the grant reaches — `login` or `runner` mint a 90-day bearer in `token_hash`; the CLI, an agent and a runner all enrol this way |
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
| Claim | runner | `claimJob { host?, seats? }` → `{ job, lease_until, bearer, mcp }`: the oldest `queued` row the runner can run where it is (its `job_place`, if any, names its machine and one of its profiles), `status = claimed`, the machine it was taken on kept as `ran_on`, in **one statement** that also sweeps expiry and re-claims a lost row once (46 §4.7); the **job bearer** is minted here as a `token` row — `read`+`propose`, one record, audience one job, expiring with it — for the child process's `/mcp` calls, and revoked at `end` |
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
