# 45 · `packages/record` — specification

The RPC surface of one record: six groups, `CallContext` in, `Result<T>` out. It hosts the kernel's write path,
runs the rules pass and the metric evaluator, drains the schedule and keeps the outbox protocol. Everything below
derives from [30-BLUEPRINT](30-BLUEPRINT.md) §4–§5, §8–§10, [33-CONTRACTS](33-CONTRACTS.md) §2, §11 and
[09-ALARMS](09-ALARMS-AND-NOTIFICATIONS.md); the symbols it calls are [41-SPEC-KERNEL](41-SPEC-KERNEL.md) §2,
[42-SPEC-DECLARE](42-SPEC-DECLARE.md) §2, [43-SPEC-EXTRACT](43-SPEC-EXTRACT.md) §2 and [38-SPEC-WHERE](38-SPEC-WHERE.md)
§2; where the design left a choice, §13 takes it.

Mode: ponytail. The laziest shape that meets the design, and a `ponytail:` line on every ceiling (§10).

---

## 1 · Purpose and boundary

**Does.** Exposes `RecordApi` — the forty-four methods of 30 §5 plus the eleven its hosts need and 30 §5 does
not list (§13 #1), every one `(args, ctx) => Promise<Result<T>>`. Derives `actor` and `ctx.scope` from
`CallContext` and refuses at step 1 (§5.1). Runs `kernel.write` inside `kernel.transaction`, then ARM, then WAKE
(30 §4 steps 11–12b). Runs the rules pass at step 9 through the kernel's `rules` hook (§5.7). Evaluates metrics
(§5.8). Drains the schedule as the alarm handler of 09 §1 (§5.9). Leases and acks the outbox, persisting the
write-backs that ride the ack (§5.10). Stores arrivals and runs the deterministic half of ingest (§5.11).

**Refuses to do.** Speak: no `Http`, `Dispatch`, `Inference`, `Blobs`, `KeyStore` — the ports are exactly
`{ Sql, Scheduler, Clock }` (31 §2). Decrypt: `openGrant` returns sealed material and nothing here holds a key
(ADR-062). Render: no import of `render`; `document` fields travel as strings (31 §2 "record ⇏ render"). Trust a
caller-supplied actor: the actor is derived, always (33 §2). Route: no HTTP, no MCP framing — `apps/*` host
`RecordApi`, `packages/mcp` wraps it. Hold identity: persons, passkeys, sessions and the login lockout are the
Directory's (ADR-061); this package has no `directory` export (§13 #2).

**May import.** `@braindog/ports` (types; the memory `Scheduler`/`Clock` in tests), `@braindog/where` and
`@braindog/where/sql`, `@braindog/theme` (31 §2's edge; reached only through `declare`), `@braindog/kernel`,
`@braindog/declare`, `@braindog/extract` (the deterministic half of ingest, §5.11). Never `render`, never `mcp`,
never `apps/*`, never `node:*` or `cloudflare:*`, never bare `fetch` (31 §3 layer 4).

---

## 2 · Public API

`packages/record/src/index.ts` exports exactly these. Every method is `async` because `Scheduler.set` and
`Scheduler.wake` are; reads are `async` too so the surface has one shape (§13 #5). Nothing throws across the
boundary: a refusal is `{ ok: false, refusals }`, a stale version is `{ ok: false, conflict }` (33 §2).
`CallContext`, `Result`, `Refusal`, `Entry`, `Level` are the kernel's types (41 §13 #1), re-exported here.

```ts
export function createRecordApi(deps: RecordDeps): RecordApi & { kernel: Kernel };   // kernel = openRecord(sql, clock) — 41 §2

export type RecordDeps = { sql: Sql; scheduler: Scheduler; clock: Clock; primitives?: number };   // primitives: PRIMITIVES_VERSION, default 1

export type RecordApi = {
  // DATA — 9
  index(args: IndexArgs, ctx: CallContext): Promise<Result<Index>>;
  search(args: SearchArgs, ctx: CallContext): Promise<Result<ProjectedRow[]>>;
  get(args: GetArgs, ctx: CallContext): Promise<Result<ProjectedRow | unknown | null>>;
  list(args: ListArgs, ctx: CallContext): Promise<Result<Page<ProjectedRow>>>;
  create(args: CreateArgs, ctx: CallContext): Promise<Result<Entry>>;
  update(args: UpdateArgs, ctx: CallContext): Promise<Result<Entry>>;
  propose(args: ProposeArgs, ctx: CallContext): Promise<Result<{ id: string }>>;
  log(args: LogArgs, ctx: CallContext): Promise<Result<EventRow>>;
  markRead(args: { upTo: number }, ctx: CallContext): Promise<Result<null>>;
  // RUNS: 2, added with the session register
  attach(args: AttachArgs, ctx: CallContext): Promise<Result<Attached>>;                               // which run this agent is, and its briefing
  handoff(args: HandoffArgs, ctx: CallContext): Promise<Result<Entry>>;                                // the next step, what was tried, the state
  // PEOPLE: 1, added with the agents pack
  meet(args: MeetArgs, ctx: CallContext): Promise<Result<Met>>;                                         // someone met in the work, matched or added, as the run
  // SEALED: 4, added October 22nd 2026 with Setup sync; the owner's alone, no MCP tool (§5.2, 12 §8)
  sealedPut(args: { key: string; part: number; parts: number; bytes: string; sha256: string; size: number }, ctx: CallContext): Promise<Result<{ key: string; part: number; parts: number; complete: boolean }>>;
  sealedGet(args: { key: string; part: number }, ctx: CallContext): Promise<Result<{ key: string; part: number; parts: number; size: number; sha256: string; bytes: string }>>;
  sealedList(args: { prefix?: string }, ctx: CallContext): Promise<Result<{ files: { key: string; parts: number; size: number; sha256: string; complete: boolean; at: string }[] }>>;
  sealedDelete(args: { key: string }, ctx: CallContext): Promise<Result<{ key: string; deleted: boolean }>>;
  // READ+ — 16
  page(args: { slug: string }, ctx: CallContext): Promise<Result<PageData>>;
  previewPage(args: { body: Record<string, unknown> }, ctx: CallContext): Promise<Result<PageData>>;   // added September 24th 2026: a body installed nowhere, drawn as `page` draws one; writes nothing
  previewChange(args: PreviewChangeArgs, ctx: CallContext): Promise<Result<ChangePreviewed>>;          // added September 26th 2026: a whole change installed in a rehearsal, every page it makes drawn, nothing kept
  metric(args: { id: string }, ctx: CallContext): Promise<Result<MetricResult>>;
  schema(args: { register: string }, ctx: CallContext): Promise<Result<unknown>>;
  dialect(args: Record<string, never>, ctx: CallContext): Promise<Result<DialectLine[]>>;
  digestToday(args: Record<string, never>, ctx: CallContext): Promise<Result<DigestPreview[]>>;
  sessionsLive(args: Record<string, never>, ctx: CallContext): Promise<Result<SessionsLive>>;
  context(args: Record<string, never>, ctx: CallContext): Promise<Result<Context>>;                     // in place of learningsFor, 30 §5
  whatsNew(args: { cursor?: number }, ctx: CallContext): Promise<Result<WhatsNew>>;
  recentHistory(args: { cursor?: number; limit?: number }, ctx: CallContext): Promise<Result<HistoryPage>>;
  inbox(args: { cursor?: number; limit?: number }, ctx: CallContext): Promise<Result<InboxPage>>;       // an owner's, no token's
  backlinks(args: { register: string; seq: number; limit?: number; cursor?: string }, ctx: CallContext): Promise<Result<Backlinks>>;   // what points at one row, held to what the caller reads
  project(args: ProjectArgs, ctx: CallContext): Promise<Result<Projection>>;
  boot(args: Record<string, never>, ctx: CallContext): Promise<Result<Boot>>;
  whoami(args: Record<string, never>, ctx: CallContext): Promise<Result<Whoami>>;                       // added — §13 #1
  views(args: { register?: string }, ctx: CallContext): Promise<Result<ViewRow[]>>;                      // added September 16th 2026 — the saved views of one list, or of every list in reach
  view(args: { register: string; id: string }, ctx: CallContext): Promise<Result<ViewRow>>;              // added September 16th 2026 — one saved view, whole
  // KEYCHAIN — 4
  listGrants(args: Record<string, never>, ctx: CallContext): Promise<Result<GrantRow[]>>;
  openGrant(args: { id: string; kek_id: string }, ctx: CallContext): Promise<Result<SealedGrant>>;
  bindGrant(args: BindGrantArgs, ctx: CallContext): Promise<Result<GrantRow>>;
  revokeGrant(args: { id: string }, ctx: CallContext): Promise<Result<null>>;
  // JOBS — 6 (33 §11; the shapes are 46 §4.7's)
  createJob(args: CreateJobArgs, ctx: CallContext): Promise<Result<Job>>;
  cancelJob(args: { job_id: string }, ctx: CallContext): Promise<Result<Job>>;
  listJobs(args: { status?: JobStatus; limit?: number }, ctx: CallContext): Promise<Result<JobRow[]>>;
  claimJob(args: { runner_id?: string }, ctx: CallContext): Promise<Result<Claim | Idle>>;
  postJobEvent(args: JobEventIn, ctx: CallContext): Promise<Result<Ack>>;
  readCancel(args: { job_id: string }, ctx: CallContext): Promise<Result<{ cancel: 0 | 1; lease_until: string | null }>>;
  // ADMIN — 24
  planPack(args: { doc: unknown; source?: PackSource }, ctx: CallContext): Promise<Result<Diff>>;
  installPack(args: { doc: unknown; source?: PackSource; planHash: string }, ctx: CallContext): Promise<Result<Applied>>;
  uninstallPack(args: { id: string }, ctx: CallContext): Promise<Result<Retired>>;
  setDeclaration(args: SetDeclarationArgs, ctx: CallContext): Promise<Result<DeclarationOutcome>>;
  invite(args: InviteArgs, ctx: CallContext): Promise<Result<MemberRow[] | Invited>>;   // an address in place of a person mints a link
  invitations(ctx: CallContext): Promise<Result<Invitation[]>>;                         // added September 16th 2026 — never a link
  revokeInvite(args: { id: string }, ctx: CallContext): Promise<Result<{ id: string; revoked_at: string }>>;   // added September 16th 2026
  export(args: ExportArgs, ctx: CallContext): Promise<Result<BrainlPage>>;
  import(args: { lines: string[] }, ctx: CallContext): Promise<Result<ImportReport>>;
  erase(args: EraseRequest, ctx: CallContext): Promise<Result<EraseReport>>;
  restore(args: { bookmark: string; at?: string }, ctx: CallContext): Promise<Result<Restored>>;                      // one method, 30 §5
  snapshot(args: { label?: string }, ctx: CallContext): Promise<Result<Snapshot>>;                         // added
  snapshots(ctx: CallContext): Promise<Result<Snapshot[]>>;                                                 // added September 16th 2026
  deleteRecord(args: { slug: string }, ctx: CallContext): Promise<Result<{ slug: string; deleted: true }>>; // added September 16th 2026
  createToken(args: { scope: Scope; name: string; expires_at?: string }, ctx: CallContext): Promise<Result<TokenMinted>>;   // added
  listTokens(args: Record<string, never>, ctx: CallContext): Promise<Result<TokenRow[]>>;              // added
  revokeToken(args: { id: string }, ctx: CallContext): Promise<Result<null>>;                          // added
  deviceLook(args: { user_code: string }, ctx: CallContext): Promise<Result<DeviceLooked>>;   // what is asking; nothing let in
  deviceApprove(args: { user_code: string; handle: string }, ctx: CallContext): Promise<Result<Approved>>;   // the owner, signed in within 15 minutes
  listDevices(ctx: CallContext): Promise<Result<DeviceRow[]>>;                               // by handle, never the poll id
  revokeDevice(args: { handle: string }, ctx: CallContext): Promise<Result<DeviceRow>>;       // a login's token goes with it
  fileArrival(args: { id: string; register: string; fields?: Patch }, ctx: CallContext): Promise<Result<ArrivalSettled>>;   // a row, and the arrival `matched`
  archiveArrival(args: { id: string }, ctx: CallContext): Promise<Result<ArrivalSettled>>;   // the arrival `ignored`, its bytes kept
  saveView(args: SaveViewArgs, ctx: CallContext): Promise<Result<ViewRow>>;                   // added September 16th 2026 — a view goes on the list for everybody who opens it
  retireView(args: { register: string; id: string }, ctx: CallContext): Promise<Result<{ register: string; id: string; retired: true }>>;   // added September 16th 2026
  // INTERNAL — 13
  drainSchedule(args: Record<string, never>, ctx: CallContext): Promise<Result<Drained>>;
  leaseOutbox(args: { kinds: OutboxKind[]; n: number }, ctx: CallContext): Promise<Result<OutboxRow[]>>;
  ackOutbox(args: { id: string; state: 'done' | 'failed'; result?: unknown; error?: string }, ctx: CallContext): Promise<Result<null>>;
  observe(args: { batch: { kind: ObservationKind; subject: string }[] }, ctx: CallContext): Promise<Result<null>>;
  applyMigrations(args: Record<string, never>, ctx: CallContext): Promise<Result<{ kernel: number; format: number; applied: number[] }>>;
  createRecord(args: CreateRecordArgs, ctx: CallContext): Promise<Result<{ id: string }>>;
  arrive(args: ArriveArgs, ctx: CallContext): Promise<Result<Arrived>>;                                // added — 33 §4's arrival write
  applyPull(args: PullPage, ctx: CallContext): Promise<Result<{ wrote: number; kept: number }>>;      // added — 47 §2
  ingestVerify(args: { ingest_id: string }, ctx: CallContext): Promise<Result<IngestVerify>>;          // added — 51 §5.4
  deviceStart(args: { reach: Reach; label: string; ua?: string; scope?: string }, ip: string): Promise<Result<DeviceCode> | Limited>;   // counted per address, 12 §6.1
  devicePoll(args: { device_code: string }): Promise<Result<DeviceWaiting | Exchanged>>;   // the bearer once, after approval
  vaultGrant(bearer: string): Promise<Result<VaultGrant>>;                                 // a Keychain reach's bearer, for the host's key doors
  acceptInvite(args: { token: string; person?: Invitee }): Promise<Result<Invited | MemberRow[]>>;   // `/auth/invite`, with the verified person; no person only looks
};

export const GROUPS: Record<keyof RecordApi, Group>;        // every method's group, for the router gate — §8
export type Group = 'DATA' | 'READ+' | 'KEYCHAIN' | 'JOBS' | 'ADMIN' | 'INTERNAL';

export function evaluateMetric(decl: MetricDecl, ctx: EvalCtx, kernel: Kernel, sql: Sql): MetricResult;       // §5.8, synchronous
export function runRules(fired: RulesFired, ctx: CallContext, opts?: RulesOpts): RulesOutcome;               // §5.7, the kernel's hook body
export function httpStatus(r: Result<unknown>): 200 | 401 | 403 | 409 | 422 | 503;                          // §4.2 — the one mapping both hosts share
export const DIALECT: readonly DialectLine[];                                                              // sixteen — §13 #12
export type { CallContext, Result, Refusal, Entry, Level, Scope, Projection, ProjectedRow, /* every args and value type above */ };
```

Seventy-nine methods: 16 · 16 · 4 · 6 · 24 · 13 — the forty-four of 30 §5, the eleven of §13 #1, and the twenty-four added since,
each noted where it is declared; DATA's sixteen are its nine plus the two RUNS, the one PEOPLE and the four SEALED methods above; `test/groups.test.ts`
counts `GROUPS`. *(An earlier draft of this spec said forty-four; the hosts' specs 47, 49 and 51 each named a method
the record had to have. Recounted September 16th 2026, when the sentence still claimed fifty-five against seventy declarations.)*

| Group | Reachable by (`principal.kind`, then §5.1's checks) | Where the gate runs |
|---|---|---|
| DATA | `person` · `token` — never `share`; `slash` on `propose` only; `markRead` is `person` only; the four sealed methods the owner himself only, in his session or with his own key, as a personal list (§5.2) | `auth.ts`, step 1 of every method |
| READ+ | `person` · `token`; `share` reaches `page` for its one slug and nothing else | `auth.ts` |
| KEYCHAIN | `person` with level `owner`, no `op`; a bearer of any kind is `NEEDS_BROWSER_SESSION` | `auth.ts` |
| JOBS | `createJob` `cancelJob` `listJobs`: `person` `owner`; `claimJob` `postJobEvent` `readCancel`: `runner` | `auth.ts` |
| ADMIN | `person` with level `owner`, or a `person` whose `op` names the method (an operation grant, 48 §13 D1); `createToken` `listTokens` `revokeToken` admit any `person`. `deviceApprove` admits only the owner, from a sign-in proved in the last 15 minutes: an approval hands out a 90-day bearer that works from anywhere, so it asks what KEYCHAIN asks. An earlier draft admitted any `person` | `auth.ts` |
| INTERNAL | `system` — no route exists (33 §4); any other principal is `FORBIDDEN`; `export` also admits `system` for the nightly backup | `auth.ts` |

`RecordApi` is what both hosts serve, one route per method, and what `packages/mcp` reaches through the tools its `TOOLS`
lists and its resources (10 §3, §6); 44 §2's `McpSurface<C>` names the subset the tools call, structurally.

---

## 3 · Files

Nine, counted. *(The indicative eight became nine because the ADMIN group's fourteen methods did not fit `api.ts`
without doubling it; 35 §2's "about eight" holds.)*

```
packages/record/
├── package.json            @braindog/record · private · "exports": { ".": "./src/index.ts" } · zero dependencies
├── src/
│   ├── index.ts            the exports of §2 and nothing else                                   ~20 lines
│   ├── api.ts              createRecordApi; the method table; DATA writes (create · update · propose · log · markRead);
│   │                       KEYCHAIN; JOBS; the ARM+WAKE tail every write shares                 ~380 lines
│   ├── auth.ts             principal → group gate; op reach; effective levels and scope; httpStatus   ~150 lines
│   ├── read.ts             index · search · get · list · whatsNew · boot · whoami · project · page · schema · DIALECT ·
│   │                       sessionsLive · context · digestToday; the projection mapper      ~420 lines
│   ├── metrics.ts          evaluateMetric: window, aggregate SQL, group_by/bucket, comparability, FX as-of,
│   │                       running, trend                                                         ~360 lines
│   ├── rules.ts            runRules: order, the ten actions, once_per, fill(), hits, dry run       ~280 lines
│   ├── schedule.ts         drainSchedule: claim, dispatch by kind, backoff, recurrence, quiet hours, arm   ~340 lines
│   ├── outbox.ts           leaseOutbox · ackOutbox · the per-kind write-backs · the dead-letter suggestion   ~180 lines
│   └── admin.ts            packs · declarations · invite · export · import · erase · restore · snapshot · tokens ·
│                           device grants · arrive · applyPull · ingestVerify · createRecord · applyMigrations · observe   ~480 lines
└── test/                   §9 — one file per row family; fixtures from @braindog/fixtures
```

About 2,600 lines of source. A file passing 500 lines is a review comment.

---

## 4 · Data structures

### 4.1 · `CallContext`, and what the record derives from it

41 §2's type (it lives in the kernel — 41 §13 #1), with two principal kinds, one token field and one context field
added here so every row of 30 §10's crosswalk and 48 §13 D1's operation grant have a shape (§13 #6):

```ts
type CallContext = {
  principal:
    | { kind: 'person'; id: string; level: Level }                       // a browser session, or BRAINDOG_TOKEN as owner
    | { kind: 'token';  id: string; scope: Scope[]; name: string; person: string }   // an agent bearer; person = token.person_id
    | { kind: 'runner'; id: string }                                     // a device grant with reach 'runner' — 12 §6.1
    | { kind: 'share';  slug: string; rows?: Predicate }                 // a share link — page(slug) only, empty ceiling
    | { kind: 'system' }
    | { kind: 'slash' };
  session?: { spoken?: string; client_id?: string; host?: string; repo?: string };
  op?: Exclude<Reach, 'login' | 'runner'>;                               // an operation grant: 'export' | 'import' | 'pack' | 'token' — 48 §13 D1
  now: number;
  surface: 'web' | 'mcp' | 'cli' | 'email' | 'webhook' | 'alarm';
};

type Level = 'read' | 'append' | 'write' | 'decide' | 'owner';          // ordered; member.level CHECK — 20 §1
type Scope = 'read' | 'propose' | 'write';                              // ordered; one word per token row — 30 §1
type Reach = 'login' | 'runner' | 'export' | 'import' | 'pack' | 'token' | 'vault';   // device_grant.reach, §13 #11; 'vault' since kernel migration 4
type Derived = { levels: Map<string, Level>; scope: CompileScope };     // computed once per call — 30 §10
type CompileScope = { registers: '*' | string[]; rows?: Predicate };    // where.compile's ctx.scope — 38 §2.5
```

Invariants a test checks:

- `Derived` is computed once per call, in `auth.ts`, before any SQL that reads a row.
- The record trusts only `member`, never `principal.level`: `levels` is `SELECT register, level FROM member WHERE person_id = ?`; the `'*'` row applies to every register without a row of its own.
- `scope.registers` for a `person` or `token` is every register whose effective level is `≥ read`; `append` is not `≥ read` (§13 #8), so an `append`-only register is absent.
- A `token`'s effective level on a register is `min(scopeLevel, memberLevel)` with `read → read`, `propose → append`, `write → write`; a token never reaches `decide` or `owner` (30 §10).
- `share`: `registers` = the page's `requires:`; `rows` = the link's predicate; `levels` empty. `system`, `slash`: `registers = '*'`.
- The actor is the kernel's: `kernel.write` derives it at step 1 (41 §5.4); for events this package appends itself it calls `kernel.actor(ctx)` (§4.7). A `person` actor is `person.id` (§13 #7).

### 4.2 · `Result<T>`, `Refusal`, and the HTTP mapping

41 §2's envelopes, unchanged. `httpStatus` is the one status mapping in the repository:

| `Result` | `httpStatus` |
|---|---|
| `ok` | 200 |
| `refusals[0].code === 'UNAUTHORIZED'` | 401 |
| `FORBIDDEN` · `NEEDS_BROWSER_SESSION` | 403 |
| `WRONG_KEY` · `PLAN_STALE` · `IMPORT_NOT_EMPTY` | 409 |
| `SCHEMA_MISMATCH` · `SCHEMA_NEWER` | 503 |
| any other refusal | 422 |
| `conflict` | 409 |

Invariants: `version` on an `ok` write is `kernel.version()` after the write; on a read, `kernel.version()` at read
time. A refusal list is never empty. `conflict` is produced only by the kernel's `VERSION_STALE`; `current` is the
row now, `actor` the row's last event's actor.

### 4.3 · Cursors

The kernel's: `list` delegates to `kernel.list`, whose cursor is base64url of the JCS array `[lastOrderValue,
lastId]` applied as `(k, id) < (?, ?)` (41 §5.8; 33 §2), and a bad cursor reads as no cursor. The record adds
nothing to it (§13 #3 asks 41 for one repair).

### 4.4 · The projection

```ts
type ProjectedRow = { id: string; register: string; seq: number; spoken: string; state: string | null;
                      version: number; updated_at: string; summary: string; fields: Record<string, unknown> };
type Projection = {
  rows: ProjectedRow[];
  index: { registers: { id: string; rows: number; open: number; fields: { id: string; type: string }[] }[]; open_questions: string[] };
  budget: { used: number; limit: number };                              // ≈ tokens: ceil(utf8Bytes(JCS(row)) / 4) — §13 #14
};
```

The shape 46 §4.6 declares structurally, plus `state`, `version`, `updated_at`. Invariants (30 §9):

1. `fields` holds only the register's `search:` ∪ `mobile:` ∪ `title` fields, plus `state`; never the whole document.
2. Every row carries `spoken`; rows of a `series: true` register have none and are never projected (§13 #14).
3. A `secret`-typed field is replaced by `grant.label` **inside the mapper**, before a `ProjectedRow` exists: `mapRow(entry, decl, labels)` reads `labels` from one `SELECT id, label FROM grant`. The same mapper serves `search`, `list`, `get` (levels `index`, `row`), `page` and `project`. `context` shows a `secret` field as what the kernel knows of its grant, `{ sealed, opened, last_opened, last_by }` (§5.3). Either way a `secret` never leaves DATA or READ+ as an id.
4. A `document` field is `{ words: n }` unless asked for: `get` with `level: 'full'` and a `path`. `project` never carries a document in v1 (46 §4.6: "documents: never").
5. `summary` is `spoken | <title> | <mobile values…>` joined by ` | `, money as `CUR 12.34` (11 §6 rule 1).

### 4.5 · Argument and value types

```ts
type IndexArgs   = { level?: 'index' | 'digest'; scope?: { repo: string } };                          // 10 §4
type Index       = { registers: { id: string; rows: number; open: number; fields: { id: string; type: string }[] }[];
                     open_questions: string[]; changed_since_your_last_call: number; same_repo: string[]; next: string[];
                     digest?: { register: string; rows: { spoken: string; title: string | null; state: string | null; words: number; document?: string }[]; truncated: boolean }[] };
type SearchArgs  = { q: string; limit?: number };                                                   // limit ≤ 100 (fts clamps); no vec: the record reranks by its own vectors
type GetArgs     = EntryRef & { path?: string; level?: 'index' | 'row' | 'full' };                    // EntryRef = { id } | { register, seq } | { spoken } — 41 §2
type ListArgs    = { register: string; where?: Predicate; order?: { field: string; dir: 'asc' | 'desc' }; limit?: number; cursor?: string; fields?: string[] };
type Page<T>     = { rows: T[]; cursor: string | null };
type CreateArgs  = { register: string; fields: Record<string, unknown>; op_id: string };
type UpdateArgs  = { register: string; seq?: number; id?: string; patch: Record<string, unknown>; version: number; op_id: string };
type ProposeArgs = { question: string; body_kind: 'options' | 'pattern' | 'rowset' | 'change'; body: object; op_id?: string };
type LogArgs     = { note: string; target?: string };                                                 // note ≤ 280
type ProjectArgs = ({ registers?: string[]; where?: Predicate; q?: string; limit?: number } | { metric: string }) & { budget: { tokens: number } };
type EventLine   = Omit<EventRow, 'rowid'> & { rowid?: number; settles?: string;                       // rowid: whole-record callers only
                   register: string | null; seq: number | null; title: string | null;                  // settles: a `decide` line's question
                   pass?: PassSaid; steps?: EventLine[] };                                             // pass, steps: the one `update` line a pass of BrainDog's own update is said as
type PassSaid    = { said: string; updated: number; asked: number; steps: number; at: string };
type ByWho       = { you: number; people: number; agents: number; rules: number; record: number };    // who wrote the lines answered; a folded pass is one, the record's
type Cursor      = number | string;                                        // a rowid, or `e.<id>` / `s.<sealed>` for a caller held to named lists
type WhatsNew    = { events: EventLine[]; upTo: Cursor | null; sinceCapped: boolean; byWho: ByWho };   // ≤ 60, newest first
type HistoryPage = { events: EventLine[]; cursor: Cursor | null; byWho: ByWho };                       // newest first
type Boot        = { registers: RegisterCount[]; now: string; sessions: LiveRun[]; waiting: Waiting[];
                     record: { slug; name; locale; currency; money } | null; currency: string | null; money: string[];
                     me: { kind; person; name; level };
                     pages: { slug; title; nav; icon; list; about: { register; seq } | null }[]; counts: { decide: number; inbox: number | null };
                     whatsNew: WhatsNew };
type Whoami      = { principal: CallContext['principal']; levels: { register: string; level: Level }[]; registers: '*' | string[] };
type SessionsLive = { sessions: { spoken: string; title: string | null; repo: string | null; host: string | null; state: string; last_seen: string | null; stale: boolean }[]; same_repo: string[] };
type Context     = {                                                                                  // where the caller stands, §5.3
  session: { spoken: string; state: string | null } | null;                                           // the caller's run, when it is a token that has one
  project: { spoken: string; name: string; mark: string | null; hue: number | null; how: 'remote' | 'folder' | 'repo' } | null;   // null is global
  ambiguous: string[];                                                                                // projects tied at the same strength
  handoff: { from: string; age_s: number; next: string; tried: string[]; head: string | null } | null;
  live: { same_repo: LiveBrief[]; elsewhere: LiveBrief[] };
  waiting: { id: string; question: string }[];                                                        // open suggestions, newest eight
  registers: { id: string; name: string; rows: Brief[]; inherited: Brief[]; truncated: boolean }[];   // twenty of each
  people: Brief[];                                                                                    // linked to this project, ten
  faded: number;                                                                                      // rows left out, unconfirmed in ninety days
  next: string;                                                                                       // one sentence: what to call next
};
type Brief       = { spoken: string; version: number; scope: 'project' | 'global'; state: string | null } & Record<string, unknown>;
type LiveBrief   = { spoken: string; state: string | null; doing: string | null; agent: string | null; repo: string | null;
                     project: string | null; stale: boolean; age_s: number };
type PageData    = { page: unknown; blocks: ({ kind: 'table'; heading?: string; rows: ProjectedRow[]; empty: string }
                   | { kind: 'stat'; cells: { metric: string; label: string; result: MetricResult }[] }
                   | { kind: string; heading?: string; body?: string; tone?: string; when: boolean })[] };
type DialectLine = { kind: string; cells: string[]; line: string };                                   // sixteen — 34 §2
type SealedGrant = { id: string; version: number; ciphertext: Uint8Array; nonce: Uint8Array; aad: string;   // aad = record_id ‖ grant_id ‖ version, '‖' literal
                     kdf: string; kek_id: string; wrapped_dek: { wrapped: Uint8Array; nonce: Uint8Array; wrapped_by: 'kek' | 'passphrase'; salt: Uint8Array | null } };
type BindGrantArgs = { id?: string; label: string; opens: string | null; kind: GrantKind; ciphertext: Uint8Array; nonce: Uint8Array;
                     kdf: string; wrapped_by: 'kek' | 'passphrase'; kek_id: string; bytes: number; hint: string; scopes?: string; expires_at?: string; rotate_every?: string };
type TokenMinted = { id: string; token: string; scope: Scope; name: string; created_at: string };      // token: shown once
type TokenRow    = { id: string; person_id: string; scope: Scope; label: string | null; created_at: string; last_used_at: string | null; last_surface: string | null; expires_at: string | null };
type DeviceCode  = { device_code: string; user_code: string; expires: string; interval: 5 };
type DeviceWaiting = { pending: true; interval: 5 };
type Exchanged   = { pending: false; bearer: string; reach: Reach; scope: string | null; expires: string };   // the bearer, once
type Approved    = { handle: string; reach: Reach; scope: string | null; label: string | null; ua: string | null };
type DeviceRow   = { handle: string; status: DeviceStatus; reach: Reach; scope: string | null; label: string | null; ua: string | null; tries: number; expires: string; approved_by: string | null; approved_at: string | null; last_used: string | null };   // never the poll id or a hash
type DeviceStatus = 'pending' | 'approved' | 'active' | 'expired' | 'denied' | 'revoked';
type Limited     = { ok: false; retryAfter: number };   // the eleventh start from one address in 15 minutes
type VaultGrant  = { handle: string; scope: string; person: string; expires: string };
type IngestVerify = { kind: 'path'; token: string } | { kind: 'hmac_sha256'; header: string; sealed: SealedGrant };
type ArriveArgs  = { channel: 'email' | 'webhook' | 'pull' | 'paste' | 'api'; ingest_id?: string; headers: Record<string, string>; body: string; sha256: string; verified: boolean };
type Arrived     = { raw: string; state: string; wrote: number };
type SetDeclarationArgs = { mode: 'set'; body: unknown } | { mode: 'retire'; id: string } | { mode: 'test'; body: unknown } | { mode: 'apply'; id: string; dry: boolean };   // §13 #16
type InviteArgs  = { person: { id: string; email: string | null; name: string | null }; levels: { register: string; level: Level }[]; why: string };
type ExportArgs  = { cursor?: string | null; sections?: ('data' | 'origin' | 'governance')[]; redactGrants?: boolean };   // → kernel.exportBrainl
type CreateRecordArgs = { id: string; slug: string; name: string; tz: string; locale: string; owner: { id: string; email: string | null; name: string | null };
                     keys: Record<'record' | 'connector' | 'signing', { wrapped: Uint8Array; nonce: Uint8Array; kek_id: string }> };
type Drained     = { claimed: number; done: number; failed: number; outbox: number };
type RulesFired  = { entry: Entry; before: Entry | null; changed: string[]; batch: string; kernel: Kernel };   // 41 §2 RulesHook's argument
type RulesOutcome = { fired: { rule: string; actions: string[] }[]; refused: Refusal[]; stopped: boolean };
type DryRun      = { matches: number; rows: number; won: number; lost: number; takenBy: Record<string, number>; suppressed: number;
                     sample: { spoken: string; would: string[]; reason?: string }[] };
type EvalCtx     = { now: number; tz: string; scope: CompileScope; asOf?: number };                   // asOf: the shifted `now` for compare and snapshot backfill
```

`Job JobRow JobStatus CreateJobArgs Claim Idle JobEventIn Ack EndBody` are 46 §4.7's, verbatim; `PullPage PullFinish`
are 47 §4.x's; `PackSource Diff Applied Retired Installed Host` are 42 §2's; `EraseRequest EraseReport BrainlPage ImportReport
EntryRef Entry` are 41 §2's.

### 4.6 · `MetricResult`

```ts
type MetricResult = {
  id: string; format: string; unit: string;                          // unit: currency code · 'count' · 'decimal' · 'pct' · 'days' · 'seconds'
  value: number | null; n: number;                                   // null when mixed currencies without a lookup, or no rows
  target: { met: boolean | null; op: string; value: number };
  compare: { mode: 'previous' | 'year_ago' | 'none'; prior: number | null; priorN: number; delta: number | null; comparable: boolean; why?: string };
  groups?: { key: string | null; value: number | null; n: number; status?: 'empty' | 'partial' | 'full' }[]; more?: number;
  mixed?: { currency: string; amount: number }[];                    // per-currency partials when value is null
  noRate?: { currency: string; amount: number }[];                    // FX rows left out — 08 §2.5
  running?: { sequence: { spoken: string; at: string | null; value: number }[]; crossed: string | null };
  trend?: { flat: boolean; why?: string; growth?: number; low?: number; high?: number; projection?: number; capped: boolean };
};
```

Invariants: `value` is an integer for `money` (minor units) and `count`; `delta` is present only when `comparable`;
`groups.length ≤ 50` and `more` is set when cut; `crossed = null` when no row satisfied `stop`; `trend.flat = true`
whenever `n < 6` or `|t| < 2.1`, with `why`.

### 4.7 · What `record` calls, by the names its neighbours export

The audit's interface lens (35 §5) checks each against its owner; two items are requests, marked.

| Package | Symbols this package calls |
|---|---|
| `@braindog/kernel` (41 §2) | `openRecord(sql, clock)`; `Kernel.transaction · write(register, id, patch, { ctx, opId, version, cascade, batch, mechanism, rules }) · get(ref) · list(q) · search(q) · count · declarations · register · installDeclarations · retireDeclarations · allocate · appendEvent · replay · observe · version · schedule · outbox · pendingWork · rebuildFts · purge · erase · exportBrainl · importBrainl · applyMigrations · refused`; `RulesHook`; `FORMAT_VERSION`. **Requested:** `actor(ctx: CallContext): string` — the ladder `write.ts` already runs (41 §3), exported so `log`, `propose`, `grant.*` and `access.*` events carry the same actor a row write would (§13 #4) |
| `@braindog/declare` (42 §2) | `normalise · lint · plan(pack, installed) · install(diff, host, approved) · uninstall(packId, host) · checksum`; `Installed` (built here, §5.6) and `Host` (four kernel methods with `ctx` bound) |
| `@braindog/where` (38 §2) | `validate(pred, schema, schemas) · jcs · searchText`; `./sql`: `compile(pred, { subject, register, schemas, now, tz, scope }) → { sql, params, uses }` — `sql` **begins `WHERE register = ? AND deleted_at IS NULL AND (…)`** (38 §5.7), so every SELECT here writes `FROM entry <compiled.sql>` and never a second `WHERE`; `jsonPath(field, key?)` |
| `@braindog/extract` (43 §2) | `matches(decl, raw, ctx) · extract(decl, raw, ctx) · isDuplicate(a, b, dedupe)`; `ExtractCtx` built here with `lookup` over `kernel.list` |
| `@braindog/ports` (37 §2) | the three port types; in tests `openNodeSqlite(':memory:')` from `@braindog/ports/node-sqlite` |

`RegisterSchema` for `where` is 42's projection of a register declaration (38 §2.2); the record caches
`schemas: Schemas` and rebuilds it whenever `kernel.declarations()` changes (compared by `[id, version]`).

---

## 5 · Algorithms

SQL is exact; `?` binds in order; `IN (…)` lists chunk at 64 (30 §7). `now` is the kernel's RFC 3339 of `ctx.now`.
Every method starts at §5.1; each method's numbered steps begin after it. `tx(fn)` means `kernel.transaction(fn)`
(41 §2: re-entrant, never nests the driver) followed by the tail of §5.2's `create` steps 5–6 when `fn` wrote.

### 5.1 · Step 1 of every method — gate, derive, dispatch (`auth.ts`)

```
call(method, args, ctx):
 0. SCHEMA   kernel.refused() → return it (503) — 33 §9
 1. GATE     group = GROUPS[method]. Allowed kinds per §2's table. A bearer (token · runner) at KEYCHAIN, ADMIN or the
             JOBS session half → NEEDS_BROWSER_SESSION. share on anything but page(its slug) → FORBIDDEN.
             INTERNAL from anything but system → FORBIDDEN (export admits system). Any other mismatch → FORBIDDEN.
 2. OP       ctx.op set (an operation grant): the method must be in its reach — export → export · import → import ·
             pack → planPack installPack uninstallPack · token → createToken listTokens revokeToken — else FORBIDDEN;
             KEYCHAIN with op set → NEEDS_BROWSER_SESSION, fix "Sign in again to open the Keychain" (49 §5.2 step 7 moved here).
 3. LEVELS   person, or token.person:  SELECT register, level FROM member WHERE person_id = ?
             → Map<register, Level>; the '*' row fills every register without its own row.
             KEYCHAIN · ADMIN (except the four person-level methods) · JOBS-session: the '*' level must be owner.
 4. VERB     the level the method needs on the register the args name — table below; a token also needs the scope
             word. Failure → FORBIDDEN at 'register' (or 'principal'), fix: "You hold <held>; this needs <needed>."
 5. SCOPE    derived.scope = { registers: every register with effective level ≥ read, rows: share.rows }
             — '*' for system and slash; the page's requires: for share.
 6. DISPATCH the method. The actor is the kernel's: write() derives it; events appended here use kernel.actor(ctx).
```

| Verb | Person level | Token scope | Methods |
|---|---|---|---|
| read | `≥ read` | any | `index` `search` `get` `list` `whatsNew` `recentHistory` `boot` `whoami` `project` `page` `metric` `schema` `dialect` `digestToday` `sessionsLive` `context` |
| propose | `≥ append` | `≥ propose` | `propose` `log` `attach` `handoff` `meet` (on `people`) |
| create | `≥ append` | `write` | `create` |
| update | `≥ write` | `write` | `update` |
| decide | `≥ decide`, person only | — | `update` on `suggestion` with `patch.decide` or `patch.resolved_as` |
| owner | `owner` on `'*'`, person only | — | KEYCHAIN · ADMIN (or `op` reach) · `createJob` `cancelJob` `listJobs` · `snapshot` · `deviceApprove` `listDevices` `revokeDevice`, the first from a sign-in proved in the last 15 minutes · `inbox`, a READ+ route whose every refusal below owner is `FORBIDDEN` |
| person | any level, person only | — | `markRead` `createToken` `listTokens` `revokeToken` |
| runner | — | the `runner` kind | `claimJob` `postJobEvent` `readCancel` |

Effective level for a token = `min(scopeLevel(scope), memberLevel)` with `read → read`, `propose → append`
(for `propose`/`log` only), `write → write`. `append` grants no read (§13 #8). Step 3 is the only SQL before dispatch.

### 5.2 · DATA

**`index`** (`read.ts`)

1. Registers: `SELECT register, COUNT(*) AS rows, SUM(CASE WHEN state IS NOT NULL AND state NOT IN (<terminal…>) THEN 1 ELSE 0 END) AS open FROM entry WHERE deleted_at IS NULL AND register IN (<scope>) GROUP BY register` — *terminal* = the `state` values with no `to:` in `transitions:`; no `transitions:` → `open = 0` (§13 #13). With `scope.repo`, registers declaring a `list<text>` field `repos` add `AND EXISTS (SELECT 1 FROM json_each(json_extract(fields, '$.repos')) WHERE value = ?)`; the rest count unchanged (10 §4). `fields` = `[{ id, type }]` from the declaration.
2. `open_questions`: `SELECT id FROM suggestion WHERE status = 'open' AND (defer_until IS NULL OR defer_until <= ?) ORDER BY opened_at LIMIT 50`.
3. `changed_since_your_last_call`: `SELECT COUNT(*) FROM event WHERE ts > COALESCE((SELECT seen_at FROM member WHERE person_id = ? AND register = '*'), '')`.
4. `same_repo`: §5.3 `sessionsLive` step 3.
5. `next`: three strings in 10 §4's shape from the register with the largest `open`, its schema resource, and the first open question.
6. `level: 'digest'`: per register in scope, `SELECT id, seq, fields, state FROM entry WHERE register = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 201` → `{ spoken, title, state, words }` (`words` = whitespace-split length of the first `document` field), `truncated` at 201; rows matched by `scope.repo` carry `document` inline (10 §4).
7. `kernel.observe([{ kind: 'register.read', subject }…])`.

**`search`**

1. `registers` = every declared register the caller may read (`readable`); none → `ok { hits: [], matched: {}, comments }`. A caller who may read them all is not scoped. *(September 28th 2026, as built: the caller names no `registers` and passes no `vec`.)*
2. `found = kernel.searchMatched(q, { registers?, limit? })`: the kernel quotes the phrase, ranks by `bm25` (41 §5.9) and answers the hits with how many matched per register; `limit` is `min(max(1, limit ?? 20), 100)` (`kernel/src/fts.ts`).
3. The hits are put in order again by meaning where the rows have vectors (`record/src/rerank.ts`): `SELECT id, model, dims, vec FROM entry_vec WHERE id IN (…)` in chunks of 64; the query's vector is the mean of the vectors of the three best-ranked hits that have one, from the model the best-ranked of them was embedded by, because the record never embeds a query (§13 #9); each such hit's int8 cosine to it; reciprocal-rank fusion (k = 60) of the word order and the cosine order. A hit with no vector, or one built by another model, keeps its place exactly, so a record with no vectors answers as the words alone ranked it. Then each hit the caller's row scope does not admit is dropped.
4. `mapRow` each (§4.4). Zero rows → `kernel.observe([{ kind: 'search.empty', subject: q.slice(0, 80) }])`.

**`get`**

1. Nothing asked (no `spoken`, `register` or `seq`) → `REQUIRED_MISSING` at `spoken`; asked by `register` and `seq` rather than `spoken`, a missing `register` or `seq` → `REQUIRED_MISSING` at that key; a `seq` that is not a whole number from 1 → `VALUE_MALFORMED` at `seq`. *(September 16th 2026: `get({})` answered `null` and `get()` threw.)*
2. `r = kernel.get(ref)` — the kernel resolves `{ spoken }` (`D` → decision, `SG` → suggestion, a prefix → its register, `tasks#7`); a bare `#7` is its `REGISTER_UNKNOWN` (41 §2). Not `ok` → pass through.
3. `r.value === null` → `ok, value: null` (§13 #10). `r.value.register ∉ scope.registers` → `FORBIDDEN`.
4. `level`: `index` → `{ spoken, title, state, register }`; `row` (default) → `mapRow` over **all** declared fields (`document → { words }`, `secret → label`); `full` → `path` required, else `REQUIRED_MISSING` at `path`, `wanted: 'a path when level is full'`, `fix: "Name the field you want: path: 'note'"`; the value at `path` (`<field>(.<key>)*` over `fields`; a missing key is `null`), a `document` whole.

**`list`**

1. No `register` named → `REQUIRED_MISSING` at `register`. Register ∈ scope and declared, else `REGISTER_UNKNOWN`. A `limit` that parses as a number below 1 → `OUT_OF_BOUNDS` at `limit`, *"A list shows from 1 to 500 rows at a time, and 0 is below 1."*; the kernel reads the rest as `min(limit ?? 50, 500)`. *(September 16th 2026: `limit: 0` came back as fifty rows and `limit: -3` as one. This line said `min(args.limit ?? 25, 200)`, which the kernel never did.)* The governance pseudo-registers `decision` · `suggestion` · `prediction` read their table with the same envelope (§13 #10), default order `ts desc` · `opened_at desc` · `score_at asc`, keyset on `(order, id)`.
2. `where.validate(pred, schemas[register], schemas)` → refusals as is; `compiled = compile(pred ?? null, { subject: 'entry', register, schemas, now, tz, scope })`; a filtered field absent from `compiled.uses.indexes` → `kernel.observe([{ kind: 'query.scan', subject: register + '.' + field }])`.
3. `order`: default `{ field: 'updated_at', dir: 'desc' }`; a kernel field or a declared field; unknown → `FIELD_UNKNOWN` at `order.field`.
4. `page = kernel.list({ register, where: compiled, order, limit, cursor })` — the keyset SELECT is 41 §5.8's; `scope.rows` is already inside `compiled.sql` (30 §7).
5. `mapRow` each; `fields` given → keep those keys, still through the mapper.
6. `kernel.observe([{ kind: 'register.read', subject: register }])`.

**`create` · `update`** (`api.ts`) — the write path's host

1. Verb per §5.1 (`create ≥ append`; `update ≥ write`). No `register` → `REQUIRED_MISSING` at `register`; an `update` with no `seq` → `REQUIRED_MISSING` at `seq`, and one that is not a whole number from 1 → `VALUE_MALFORMED` at `seq`. A `create` whose fields carry `deleted_at` → `FIELD_UNKNOWN` at `deleted_at`, *"deleted_at is kept by BrainDog, and a new row cannot arrive deleted. Create it, then delete it."* A row does not arrive deleted, and dropping the key quietly would be a write that did less than it was asked; `delete` is how a row goes. *(September 16th 2026.)*
2. REPLAY: `r = kernel.replay(op_id)` → defined → return it (41 §2: the row as it is now, the original rowid as `version`; 33 §2).
3. `out = kernel.transaction(() => kernel.write(register, id ?? null, patch, { ctx, opId: op_id, version, cascade: true, rules: fired => runRules(fired, ctx) }))` — 30 §4 steps 1–10 and 12a, one synchronous transaction; `update` passes `ref` through `kernel.update(register, ref, patch, w)` so `{ seq }` resolves inside (41 §2). A refusal is a return value, so the step-R observation commits; only a thrown `TypeError` or an unmapped `SqlError` rolls back and propagates to the host as a bare 500 (41 §2; 12 §8).
4. `{ nextDueMs, outboxPending } = kernel.pendingWork()`.
5. ARM: `cur = await scheduler.get()`; `nextDueMs === null` → `cur !== null && await scheduler.clear()`; else `target = max(nextDueMs, ctx.now)`, `cur !== target → await scheduler.set(target)` — set only on a difference (30 §4 step 11).
6. WAKE: `outboxPending → await scheduler.wake()` — the doorbell rings only when something waits (§13 #9).
7. Return `out` unchanged (`ok` · `refusals` · `conflict`).

Steps 4–6 are `tail()`; every method that writes through the kernel ends with it.

`update({ register: 'suggestion', id: 'SG23', patch })` — the decision gate (§13 #10):

- `patch.decide: { option, reason }` → verb `decide`; `reason` empty → `REQUIRED_MISSING` at `reason`; `status ≠ 'open'` → `TRANSITION_ILLEGAL` at `status` (found `resolved`, wanted `open`). tx: `D<n>` = `'D' + kernel.allocate('decision')`; `INSERT INTO decision(id, question, answer, reason, decided_by, ts, supersedes) VALUES (?, ?, ?, ?, ?, ?, NULL)`; `UPDATE suggestion SET status = 'resolved', resolved_as = 'addressed' WHERE id = ?`; `appendEvent` × 2 — `decide` (target `decision:D<n>`, `target_kind 'decision'`, `to_v` = JCS `{ question, answer }`) and `resolve` (target `suggestion:SG<n>`, `to_v 'addressed'`, `note` = reason cut at 280). A `rowset` body with option `accept` → each row through `kernel.write(register, null, fields, { ctx, cascade: true, mechanism: body.ingest ? 'ingest:' + body.ingest : undefined, batch })`; a `pattern` body accepted → `setDeclaration({ mode: 'set', body: body.ingest })`; a `change` body accepted → the same with `body.to`.
- `patch.defer: { until, why }` → `UPDATE suggestion SET defer_until = ?, defer_why = ? WHERE id = ?`; no event (32 §2.1's third verb).
- `patch.resolved_as: 'wont-fix' | 'incorrect'` (verb `decide`) → `UPDATE suggestion SET status = 'resolved', resolved_as = ? WHERE id = ?`; event `resolve`; `incorrect` also `kernel.observe([{ kind: 'suggestion.incorrect', subject: body_kind }])` — the brake's input (24 §4.3).

**`propose`**

1. Verb `propose`; `slash` is allowed here and nowhere else in DATA (30 §3).
2. `op_id` given → `kernel.replay(op_id)` → defined → return `{ id: target's SG }` (26 §2.4: a suggestion is written idempotently on the job id).
3. Body by kind (33 §2): `options { question, options: [{ id, label, because }] (≥ 2), requires_reason: true }` · `pattern { ingest, samples: [raw_id…] }` (`ingest` passes `declare.lint` as a one-declaration pack) · `rowset { register, rows: [{ fields }] }` (register ∈ scope, ≤ 200 rows) · `change { declaration_id, from, to }` (an active declaration). Shape faults → `REQUIRED_MISSING` · `FIELD_UNKNOWN` · `ENUM_VALUE_UNKNOWN` at `body.<key>`.
4. tx: `actor = kernel.actor(ctx)`; `'SG' + kernel.allocate('suggestion')`; `INSERT INTO suggestion(id, body_kind, body, status, opened_by, opened_at) VALUES (?, ?, ?, 'open', ?, ?)`; `appendEvent({ kind: 'suggest', actor, target: 'suggestion:SG<n>', target_kind: 'suggestion', to_v: question, op_id })`.
5. Return `{ id }`. MRTR's `input_required` round trip is `packages/mcp`'s; the record sees `propose`, then `update(suggestion, decide)`.

**`log`**

1. Verb `propose`. `note` length 1–280, else `OUT_OF_BOUNDS` at `note`, `wanted: '1–280 characters'`.
2. `target`: a spoken id or entry id → `kernel.get(ref)` → `entry:<id>` / `decision:` / `suggestion:` with `target_kind`; unresolvable → `REGISTER_UNKNOWN` at `target`.
3. tx: `appendEvent({ kind: 'note', actor: kernel.actor(ctx), target, target_kind, note })`. No schedule or outbox change, so no `tail()`. Return the event row.

**`markRead`**

1. `person` only. `UPDATE member SET seen_at = MAX(COALESCE(seen_at, ''), COALESCE((SELECT ts FROM event WHERE rowid = ?), '')) WHERE person_id = ? AND register = '*'` — RFC 3339 UTC strings order chronologically, so a smaller `upTo` never moves the mark back. Not an event (ADR-036). `value: null`.

   *The second `COALESCE` is an amendment. SQLite's scalar `max()` returns NULL if **any** argument
   is NULL, so an `upTo` naming an event that is not there — a replayed call after a restore, a
   client one migration behind — set `seen_at` to NULL and **erased the mark**: the exact failure
   the `MAX()` is written to prevent, arriving through the guard. Measured:
   `MAX(COALESCE(seen_at,''), (SELECT ts FROM e WHERE rowid = 999))` is `null`. An unknown id now
   leaves the mark where it was, which is what "never moves it back" has to mean.*

**`setPref({ key, value })`** *(as built, September 2026)*

1. `guard(ctx, 'read')`, then a `person` only: a token is `FORBIDDEN` at `principal`. Any key but
   `key` and `value` is `FIELD_UNKNOWN`.
2. `key` is one of `PREF_KEYS` (`packages/record/src/index.ts`), else `VALUE_MALFORMED` at `key` with
   the keys in `allowed`. Each key has its own shape, and a wrong one is `VALUE_MALFORMED` at `value` in
   that key's words:

   | Key | Shape |
   |---|---|
   | `nav.order`, `nav.hidden` | at most 500 addresses, each starting with `/` and at most 300 characters, kept once each |
   | `nav.shape` | `rail`, `bar` or `menu` |
   | `pen.suggest` | `true` or `false`; absent is on |
   | `pen.dismissed` | ids of what the holding pen offered and the person dismissed (`PenItem.id`, and the navigation shape's `shape:<shape>:<reason>`), each 1 to 300 characters; the newest `PEN_DISMISSED_MOST` are kept and the oldest let go |

3. `null` takes the key away. Kept in `pref` (migration 9) against the person; not an event.
   `value: { key, value }` as kept. `boot` answers every key on `me.prefs`.

**`sealedPut` · `sealedGet` · `sealedList` · `sealedDelete`** *(as built, October 22nd 2026; `methods/sealed.ts`)*

The owner's store for bytes the host cannot read ([12-SECURITY](12-SECURITY.md) §8, "Sealed files"). The bytes go to
the host's `SealedStore` (`RecordDeps.sealed`: R2 on the Cloud, `blobs/sealed/` on a self-host); the record keeps the
index, `sealed_file` (`data`) and `sealed_part` (`local`), from kernel migration 45.

1. `guard(ctx, 'write')` for a put or a delete, `guard(ctx, 'read')` for a get or a list, then `sealedStop`: the
   owner himself (`personalStop`'s rule), and no `preview`, `operation`, `grant`, `wheres` or `registers` short of
   every list; a token also by its own row, refused when it is an app's (`client_kind` `cimd` or `dcr`), has a
   `token_lens` row (a child or a narrowed key), or is a job's or a report key (`job:`, `report:`). `FORBIDDEN` at
   `principal`, or at `preview`.
2. `key` 1 to 200 characters matching `[a-z0-9][a-z0-9._/-]*`: absent `REQUIRED_MISSING`, too long `OUT_OF_BOUNDS`,
   any other shape `VALUE_MALFORMED`, each at `key`.
3. A put: `parts` 1 to 8 and `part` 0 to `parts - 1` (`OUT_OF_BOUNDS` at each); `size` a whole number, at most
   25 MiB and at most `parts` times 4 MiB (`OUT_OF_BOUNDS` at `size`); `sha256` 64 lower-case hex (`VALUE_MALFORMED` at
   `sha256`); `bytes` base64, weighed before it is decoded and at most 4 MiB after (`OUT_OF_BOUNDS` at `bytes`), and
   the parts held under this hash plus this one at most `size` (`OUT_OF_BOUNDS` at `bytes`). No store: `NOT_IN_THIS_BUILD`.
4. A part of a file held under another hash, count or size is refused `OUT_OF_BOUNDS` unless it is part 0, which
   replaces the file: one transaction drops every `sealed_part` row of the key and writes the new `sealed_file` row,
   `complete = 0`, then the old parts are dropped from the store. A file already whole answers `complete: true` and
   writes nothing. A host's `spend` is asked for a part not held under this hash, and its wait is `RATE_LIMITED` with
   `retry_after` at `bytes`.
5. The part goes to the store, then one transaction names it in `sealed_part` if its file is still the one held, or
   the bytes are dropped and the caller is told to put part 0 again. When every part is held and their lengths add up,
   they are read back and hashed: a different hash drops the file and every part, `CHECKSUM_MISMATCH` at `sha256`; the
   right one sets `complete = 1` and writes one event, `grant.add` the first time the key is kept and `grant.rotate`
   after, on `sealed:<key>` with `target_kind = 'sealed'` and a note naming the key, its parts and its size. `tail()`.
6. A get: no file `NOT_FOUND` at `key`; a part past the last, not put, or not in the store `NOT_FOUND` at `part`, the
   last of these also taking the part off the index and the file's `complete` down. A list: `prefix` compared with
   `substr`, never `LIKE`, by key; `at` is `updated_at`. A delete: one transaction drops the rows and writes
   `grant.revoke` when a file was there, then the store's parts go; a second delete answers `deleted: false`.

The kernel's `import` counts `complete` again from `sealed_part` after every import (`settleSealed`), so a record put
back on a host that holds none of its parts lists its sealed files as not whole.

### 5.3 · READ+

**`page(slug)`**

1. `page.<slug>` active, else `REGISTER_UNKNOWN` at `slug` (`wanted: 'a declared page'`). `share` → `slug` must equal `principal.slug`.
2. Every `requires:` register ∈ scope, else `FORBIDDEN` (20 §1: a projection only narrows).
3. Per block, in order: `table` → `compile(block.where ?? null, …)`, `order` (block's, else the register's first indexed date field `desc`, else `seq desc` — 06 §1.1), `limit = min(block.limit ?? 50, 500)`, `kernel.list` without a cursor, `mapRow`, `empty` filled through `fill()` (§5.7 step 5) when no rows; `stat` → `evaluateMetric` per cell; `when: { metric, <op>: v }` → the metric's value against the leaf in JS, `when: false` blocks return with no data; every other kind → `body` and `tone` as declared.
4. `kernel.observe([{ kind: 'page.render', subject: slug }])`.

**`metric(id)`** — `metric.<id>` active, its source register ∈ scope (a `series.<id>` source needs none), then `evaluateMetric(decl, { now, tz, scope }, kernel, sql)` (§5.8).

**`schema(register)`** — register ∈ scope → the active declaration body, unchanged.

**`dialect()`** — `DIALECT`, a constant of sixteen `{ kind, cells, line }` from 34 §2.2, held here because the record
may not import `render`; the `closed-lists` gate diffs it against `packages/render/kinds/*.json` (§13 #12).

**`digestToday()`** — for each active `digest` declaration, `buildDigest(decl, ctx)` (§5.9, kind `digest`, steps a–b) → `{ id, sections }`. Writes nothing.

**`sessionsLive()`**

1. `SELECT id, seq, fields, state FROM entry WHERE register = 'session' AND deleted_at IS NULL AND state IN ('active', 'idle', 'handoff') ORDER BY json_extract(fields, '$.last_seen') DESC LIMIT 100`.
2. `stale = last_seen < now − 45 min` (32 §2.1); never stored.
3. `same_repo` = non-stale sessions whose `repo = ctx.session?.repo`, minus `ctx.session?.spoken`.

**`context()`**: where the caller stands, in one call. A read, scoped as `boot`
is: it needs `read`, never writes, and opens no run, except for `topic` below. Every part is held to what the caller
may read.

`topic` is what the person is working on, in a few words, at most 60 characters (`TOPIC_MAX`): "Kiln works". An agent
with no folder sends it on its first call. Claude.ai, ChatGPT and any remote MCP client send no repository, remote or
folder, so it is the one thing that can place their run. When the caller is a token that may keep its own run
(`propose` on its run) and says nothing of where it is, `kernel.topicRun` settles it in one transaction:

- a run already in a project stays where it is;
- otherwise the one live project with that name, case and spaces aside, is where the run goes;
- on a record that has never had a project, the first project is formed from the topic as a draft, exactly as one
  is formed from a folder (`first-project.ts`): the name with its first letter raised, `lane` building, `draft` set,
  for the person to keep with one press or turn away;
- on a record that has projects, a topic never forms one, as a one-off folder never does;
- the run is placed there in place, or opened there when the caller has none (`opened: said what it works on`).

A topic that names nothing ("nothing", "general", "help") or one longer than 60 characters places nothing. A topic that
is not text, or too long, is refused at `topic`. A caller that may not keep its own run is briefed as if it sent none.
A caller with no folder then stands where its run was placed, so a later `context` without `topic` still finds the
project.

`ask` is one line for the agent to put to the person. It is sent to a token with no folder that stands in no project.
With no topic it says to ask what the person is working on and send it back as `topic`. With a topic that names no
project it says no project is called that, and to ask which one this is.

1. **The run.** For a token, the run the ladder finds from its hints (30 §3), without opening one: `session` is its
   `{ spoken, state }`, and `null` for a person or for a token with no run yet.
2. **The place.** The hints' `remote`, `repo` and `cwd`, or, when none was sent, the run's own. `resolveProject`
   reads the one register that declares `scopes:` and answers the project with `how`, the rung that placed it:
   `remote`, `folder` or `repo`. A tie is global, with the tied projects in `ambiguous`. A caller who may not read
   that register stands nowhere in particular, because naming the project would name a row it cannot see. `mark`
   and `hue` come from the register's `identity:` fields when it declares them.
3. **The handoff.** When the caller may read `session`: the newest other run in this project, or with no project in
   this repository, that has a `next`, as `{ from, age_s, next, tried, head }`.
4. **Who is live.** `sessionsLive()` less the caller's own run, split into `same_repo` and `elsewhere`, each run as
   `{ spoken, state, doing, agent, repo, project, stale, age_s }`.
5. **What waits.** The open suggestions the caller may see, newest first, eight of them, each `{ id, question }`.
6. **What applies here.** Every register with a scope field that the caller may read, through the kernel's
   nearer-wins `inScope`: `rows` are the project's open rows and `inherited` the global rows the nearer scope
   leaves, twenty of each, and `truncated` when there were more. A register whose scope field links rows to projects
   is who is here rather than what applies: its rows linked to this project, ten of them, are `people`.
7. **What fades.** A register with a `confirmed_on` day leaves out the rows nobody confirmed, or made, in ninety
   days, and `faded` counts them.
8. **`next`**, one sentence: open a run with the first write, start from the handoff, confirm the learnings that
   held, or work from what is open; and in every case, call `handoff` before stopping.

Each row is a brief: `{ spoken, version, scope, state }`, then the register's title and `mobile` fields, with a ref
given as its spoken id. A `secret` field is always shown, as `{ sealed, opened, last_opened, last_by }`, and the
grant's id never appears (§4.4 rule 3). The learnings `learningsFor` returned in an earlier revision arrive here, in
`registers`, beside every other register that says where a row applies.

**`whatsNew(cursor?)`**

1. `cursor ?? SELECT COALESCE(MIN(rowid), (SELECT COALESCE(MAX(rowid), 0) + 1 FROM event)) FROM event WHERE ts > COALESCE((SELECT seen_at FROM member WHERE person_id = ? AND register = '*'), '')` — the first rowid after the read mark; a token uses its person's.
2. Walk the log down from the newest event, `SELECT rowid, id, ts, actor, kind, target, target_kind, field, from_v, to_v, note FROM event WHERE rowid < ? ORDER BY rowid DESC LIMIT 500` a batch at a time, stopping below step 1's rowid, at 61 kept lines, or after 5,000 lines walked.
3. Keep a line when the caller may see it: an `entry` line when `readable` passes on its row's register (and it carries `register`, `seq` and the row's title); a `suggestion` or `decision` line when `holds` does not (with the question as its title); a line about access or keys (`grant.*`, `access.*`, `share.*`, a `token`, `member`, `device_grant` or `vault_key` target) for an owner only; a `register.<id>` declaration when that register is readable; any other line only for a caller who reads the whole record.
4. 61 kept → answer the newest 60, `sinceCapped: true`; the walk stopping early is `sinceCapped: true` too. `upTo` = the newest kept rowid for a caller who reads the whole record, and `e.<its id>` for anybody else, whose lines also leave without `rowid`. A cursor from such a caller is resolved by `SELECT rowid FROM event WHERE id = ?` and taken only when step 3 keeps that line for them. Values were redacted at write (20 §8).

*Amended September 22nd 2026: a caller held to named lists is sent no rowid and none is taken from them. Between two of her lines the rowid counted the events she was not shown, a whole-number cursor she chose was a probe that said which rowids were hers, and `markRead` answered the rowid it walked to.*

*Amended September 15th 2026: newest first, where it was oldest first with `cursor` = last + 1. A first screen draws the latest lines, and oldest first showed somebody away a month the first sixty things that happened after they left. The whole log in order is `recentHistory`, which walks the same way below its `cursor` and keeps the same lines.*

**`whoami()`** — `{ principal, levels: [...derived.levels], registers: derived.scope.registers }`. No SQL beyond §5.1's; the ladder does not run, so nothing is opened.

**`project(args)`**

1. `{ metric }` → `evaluateMetric` and `rows = []` (46 §4.7's *explain*); else candidates: `q` → `kernel.search({ q, registers ∩ scope, limit: min(limit ?? 100, 200) })`; else `compile(where ?? null, …)` + `kernel.list` per register (`limit` each). `series: true` registers are skipped (no spoken id — §4.4).
2. `labels = SELECT id, label FROM grant` once; `mapRow` — the `secret → label` substitution happens inside the mapper, before any `ProjectedRow` exists (30 §9 rule 3); no document body in v1.
3. Append rows while `used + ceil(bytes(JCS(row)) / 4) ≤ budget.tokens`; stop at the first that does not fit.
4. `index` = `index({ level: 'index' })` steps 1–2 with `fields`. Return `{ rows, index, budget: { used, limit: budget.tokens } }`.

**`boot()`** — one `kernel.transaction` holding a read snapshot: `index` (steps 1–5), `sessionsLive`, `SELECT id, body_kind, body, opened_by, opened_at, defer_until FROM suggestion WHERE status = 'open' ORDER BY opened_at LIMIT 50`, `whatsNew()` with the default cursor. One round trip, at most `registers + 6` statements.

As built, `boot` answers `registers`, `now`, `sessions` and `waiting` (20 open suggestions), and what the web shell
draws: `record`, `me` (with the member's name), `pages` filtered as `pages` filters them, `counts { decide, inbox }`
(`inbox` is `null` below owner), `whatsNew` with the default cursor, each held to what the caller may read, `names`, each person on the record by name and by id, sent only to a caller who may read the membership list (the owner) or the People list, with no address and no level, so who did what is said by name to them and as Someone on this record to anybody else *(added September 17th 2026)*, and
`signIn: boolean`, whether anybody signs in on this host. `signIn` is read off the host's `invitations` hook: an
invitation is spent by signing in, so a host that cannot take one has no sign-in, and a host that never said is `false`.
A self-host started without a key, or a Worker with no `SESSION_SECRET`, answers `/account/records` 401 on every load,
the same answer an ended session gets, so the app reads `signIn` instead and skips that read where it is `false`
(50 §5.13). *(`signIn` added September 16th 2026.)* `currency` and `money` are also sent at the top level, the same
values as `record.currency` and `record.money`, and they are sent when `record` is `null`: a record nobody named (a
self-host before its first run, the gates' record) still draws its money in the currency its own pack set, where it
had written "£39 GBP" in every sentence. `record` stays `null` there, since a reader tells an unprovisioned record by it.
*(Added October 2nd 2026.)* It is
not yet one transaction. A session's briefing comes from `context`, not `boot`.

*As built, September 2026:* `me.prefs` is every key the person set with
`setPref` (§5.2), key by key, to a person only. `counts.arrived` is every arrival the record ever received,
whatever became of it, to the owner, and `null` to anybody else. `pen` is the holding pen (`29 §5`, "As
built"): at most `PEN_MOST` items, strongest first, each `{ id, kind, register, title, why, change: { to } }`
with the whole declaration accepting it writes, built in `packages/record/src/emergent.ts`. It is offered
only to a person, or their token, who reads every list, is empty while their `pen.suggest` is `false`, and
never answers an id in their `pen.dismissed`.

**`views({ register? })`** — `scoped(ctx, 'read')` first, then `guard(ctx, 'read', register)` when one is named; any
other key is `FIELD_UNKNOWN`. `SELECT register, id, name, filter, search, sort, columns, created_by, created_at,
updated_at FROM view` for that register, or for every register when none is named, filtered by `readable` so an
unnamed call answers only the lists the caller reads. READ+ AND NOT DATA: the twelve DATA methods are verbs over
rows, and MCP exposes them as tools; a view holds no rows and is a saved question about a register, which is a
resource beside `schema` and `page`. Naming a register the caller may not read is refused rather than answered
empty, so a view is never how somebody learns which lists exist.

**`view({ register, id })`** — `guard(ctx, 'read', register)`, then the one row. `filter` comes back as the
predicate that was saved, `order` as `[{ field, dir }]` and `columns` as the field ids; the stored column is called
`sort`, because `order` is a reserved word in SQLite, and that is the only place the two names differ. A name this
register has no view for is `VIEW_UNKNOWN` at `id`, carrying the names it does have in `allowed`, so the answer
ends the search rather than starting one.

---

### 5.4 · KEYCHAIN (`api.ts`) — owner, browser session, no `op`; the record never decrypts (ADR-062)

**The two ways in, and why two.** These four are a browser session's at `/api/<method>`, except that the sealed
shape itself is not routed: `openGrant` answers material a browser cannot open and `bindGrant` takes material a
browser cannot make, so neither is in `ROUTES` (33 §4). What reaches them from a screen is the host, through
INTERNAL `depositGrant` and `openForGrant`, which a host calls with keychain access at `/api/vault/*` or with a
browser session at `/api/keys/*`. A session is held to this section's own gate wherever it comes in: an owner, no
token of any kind, and a proof under fifteen minutes old. *(The second pair of doors added September 16th 2026;
no method was added, and the counts of 30 §5 are unchanged.)*

**`listGrants()`** — `SELECT id, label, opens, kind, version, kdf, wrapped_by, scopes, kek_id, bytes, hint, opened, last_opened, created_at, expires_at, rotate_every, stale_at, rotated_at, revoked_at FROM grant ORDER BY label`. Never `ciphertext`, `nonce`, `prev_*`.

**`openGrant({ id, kek_id })`**

1. `SELECT * FROM grant WHERE id = ?` — none → `OUT_OF_BOUNDS` at `id`, `wanted: 'a grant'`; `revoked_at` set → `GRANT_REVOKED`.
2. `SELECT wrapped, nonce, wrapped_by, kek_id, salt FROM vault_key WHERE purpose = 'record'`; `wrapped_by = 'kek'` and `vault_key.kek_id ≠ args.kek_id` → `WRONG_KEY` (409, never "corrupt" — 12 §6.1).
3. tx: `UPDATE grant SET opened = opened + 1, last_opened = ? WHERE id = ?`; `appendEvent({ kind: 'grant.read', actor, target: 'grant:' + id, target_kind: 'grant', note: id + ' ' + kind })` — never `label` or `opens` (12 §8; the kernel enforces the shape, 41 §2).
4. Return `SealedGrant` (§4.5): `aad = record.id + '‖' + id + '‖' + version`. The Worker unwraps, derives by HKDF, decrypts, shows once.

**`bindGrant(args)`**

1. `args.id` absent → `INSERT INTO grant(id, label, opens, kind, version, ciphertext, nonce, kdf, wrapped_by, scopes, kek_id, bytes, hint, opened, created_at, expires_at, rotate_every) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`; event `grant.add`. Present → `UPDATE grant SET prev_ciphertext = ciphertext, prev_nonce = nonce, ciphertext = ?, nonce = ?, version = version + 1, kdf = ?, wrapped_by = ?, kek_id = ?, bytes = ?, hint = ?, scopes = COALESCE(?, scopes), rotated_at = ?, stale_at = NULL WHERE id = ? AND revoked_at IS NULL`; 0 rows → `GRANT_REVOKED`; event `grant.rotate`. Exactly two versions live — the schema says so (12 §6).
2. `rotate_every` → `kernel.schedule({ kind: 'rotate', key: 'grant:' + id, due_at: now + rotate_every, payload: { grant: id } })`; `expires_at` → `kernel.schedule({ kind: 'rotate', key: 'grant:' + id + ':expires', due_at: expires_at − 48 h, payload: { grant: id, urgent: true } })` (09 §5 rule 2).
3. Steps 1–2 in one tx; `tail()`. Return the `GrantRow` of `listGrants`.

**`revokeGrant({ id })`** — tx: `UPDATE grant SET ciphertext = NULL, nonce = NULL, prev_ciphertext = NULL, prev_nonce = NULL, revoked_at = ? WHERE id = ? AND revoked_at IS NULL` (02 §9); 0 rows → `GRANT_REVOKED`; `DELETE FROM schedule WHERE kind = 'rotate' AND state = 'pending' AND key IN (?, ?)`; event `grant.revoke`. `tail()`.

### 5.5 · JOBS (`api.ts`) — 33 §11; shapes 46 §4.7

**`createJob`** (owner) — `INSERT INTO job(id, kind, args, status, seq, cancel, session, created_at, expires) VALUES (?, ?, ?, 'queued', 0, 0, ?, ?, ?)`, `expires = args.expires ?? now + 24 h`. Return the row. Jobs are `local`; no event kind names them.

**`cancelJob({ job_id })`** (owner) — `UPDATE job SET cancel = 1, status = CASE WHEN status = 'queued' THEN 'cancelled' ELSE status END WHERE id = ? RETURNING *`. A running job's transcript stays.

**`listJobs`** (owner) — `SELECT * FROM job WHERE (? IS NULL OR status = ?) ORDER BY created_at DESC LIMIT ?` (`limit ≤ 100`); `lost = status = 'claimed' AND lease_until < now`, computed, never stored.

**`claimJob`** (runner; `args.runner_id`, when given, must equal `principal.id`) — one statement, so a double claim finds nothing:

```sql
UPDATE job SET status = 'claimed', runner_id = ?, claimed_at = ?, lease_until = ?
WHERE id = (SELECT id FROM job WHERE (status = 'queued' AND expires > ?)
                                 OR (status = 'claimed' AND lease_until < ?)      -- a lost job is reclaimable
            ORDER BY created_at LIMIT 1)
RETURNING *
```

`lease_until = now + 60 s` (26 §2.4). No row → `{ job: null, idle_ms: 1500 }`. A row → mint the job bearer (12 §3): `value` = base64url of 32 bytes from `crypto.getRandomValues`, `INSERT INTO token(id, person_id, hash, scope, label, created_at, expires_at) VALUES (?, <the '*' owner>, hex(sha256(value)), 'propose', 'job:' + job.id, ?, job.expires)`; return `{ job, lease_until, bearer: value, mcp: { url: '/mcp', tools: ['record_index', 'search', 'get', 'list', 'propose', 'log'] } }`. The 20-second long-poll is the host's.

**`postJobEvent`** (runner) — `SELECT runner_id, cancel FROM job WHERE id = ?`; `runner_id ≠ principal.id` → `FORBIDDEN`. tx: `INSERT INTO job_event(job_id, seq, kind, body, ts) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING` (a resent `seq` is idempotent); `UPDATE job SET seq = MAX(seq, ?), lease_until = ? WHERE id = ?` (the renewal); `kind = 'end'` → `UPDATE job SET status = ?, result = ?, error = ?, claude_session = ?, cost_minor = ?, turns = ?, ms = ? WHERE id = ?` from `EndBody`, `status` outside its five → `ENUM_VALUE_UNKNOWN` at `body.status`; `kind = 'error'` → `status = 'error'`. Return `{ seq, cancel, lease_until }`.

**`readCancel({ job_id })`** (runner) — `SELECT cancel, lease_until FROM job WHERE id = ? AND runner_id = ?`; none → `FORBIDDEN`.

### 5.6 · ADMIN (`admin.ts`) — owner (or `op` reach), browser session

**`installed()`** — the `Installed` 42 §2 asks for, built here: `format = PRAGMA user_version`; `primitives = deps.primitives`; `record_version = kernel.version()`; `packs = SELECT id, version FROM pack`; `declarations = kernel.declarations()` with `body` as `jcs(body)`; `rows = SELECT register, COUNT(*) FROM entry WHERE deleted_at IS NULL GROUP BY register`; `units` = per money/quantity field of every register, `SELECT DISTINCT json_extract(fields, '$.<f>.currency') FROM entry WHERE register = ? AND deleted_at IS NULL` (`.unit` for quantity). **`host(ctx)`** = `{ declarations: kernel.declarations, count: kernel.count, installDeclarations: b => kernel.installDeclarations(b, ctx), retireDeclarations: r => kernel.retireDeclarations(r, ctx) }`.

**`planPack({ doc, source })`** — read-only: `pack = declare.normalise(doc, source)` (refusals pass through) → `declare.plan(pack, installed())` → the `Diff` with its `planHash` (42 §13 D3 defines it; `PLAN_STALE` is the kernel's `planVersion` CAS).

**`installPack({ doc, source, planHash })`**

1. `pack = normalise(doc)`; `diff = await declare.plan(pack, installed())`; refusals pass through.
2. `applied = await declare.install(diff, host(ctx), planHash)` — `PLAN_STALE` when `diff.planHash ≠ planHash`; the kernel's `installDeclarations` writes the versions, indexes, counters, pack row, seeds (`cascade = false`) and events in one transaction (41 §5.6, 42 §5.x).
3. Then, in one `kernel.transaction`, the schedule rows the kernel does not know about: per installed `digest.<id>` → `kernel.schedule({ kind: 'digest', key: id, due_at: nextOccurrence(decl.schedule, now, tz), payload: { declaration: id } })`; `ingest.<id>` with `fetch.schedule` → `{ kind: 'pull', key: id, due_at: now + jitter(record.id + id), payload: { ingest: id, cursor: null } }`; `metric.<id>` with `snapshot:` → `{ kind: 'snapshot', key: id, due_at: next 00:05 in tz, payload: { metric: id } }`.
4. `tail()`. Return `applied`.

**`uninstallPack({ id })`** — `retired = declare.uninstall(id, host(ctx))` (retires, drops indexes, deletes the pack row, one `uninstall` event — 41 §2); then `DELETE FROM schedule WHERE state IN ('pending', 'paused') AND kind IN ('digest', 'pull', 'snapshot') AND key IN (<its declaration ids>)`; `tail()`. Rows stay (04 §4). Return `retired`.

**`setDeclaration(args)`** — `mode`:

- `set` → `pack = { manifest: { pack: '_inapp', … }, declarations: [body], seeds: [] }` through `declare.lint(pack, installed())` → refusals as is; `kernel.installDeclarations({ declarations: [{ id, kind, body, pack_id: null }] }, ctx)` (a new version, its indexes, one `declare` event); the schedule row of `installPack` step 3 for a digest, pull or snapshot; `tail()`.
- `retire` → `kernel.retireDeclarations({ ids: [id] }, ctx)` (`retired = 1`, indexes dropped, `retire` event); pending schedule rows deleted; `tail()`.
- `test` → lint, then `dryRun(rule)` (§5.7 step 9) — writes nothing.
- `apply` → for every active rule on `id`'s register, over live rows where the rule would `set` a field still missing: `dry: true` → the `DryRun`; `dry: false` → `runRules` per row inside one `kernel.transaction` per 100 rows, then `tail()`. No undo by design (07 §6).

**`invite({ person, levels, why })`** — `owner`, or `system` at invitation acceptance (§13 #8). tx: `INSERT INTO person(id, email, name) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET email = excluded.email, name = excluded.name`; `old = SELECT register, level FROM member WHERE person_id = ?`; `DELETE FROM member WHERE person_id = ?`; per `levels` row `INSERT INTO member(person_id, register, level, seen_at) VALUES (?, ?, ?, ?)` keeping the old `'*'` row's `seen_at`; per changed register: `appendEvent` `access.grant` (new or raised) or `access.revoke` (removed or lowered) — `target` = person id, `target_kind 'member'`, `field` = register, `from_v` = old level or NULL, `to_v` = new level or NULL, `note = why` (20 §1). `levels: []` revokes everything. Removing the last `owner` on `'*'` → `LEVEL_REQUIRED` at `levels` (`wanted: 'one owner'`). Return the rows.

**`invite({ email, level?, registers? })`** (amended September 16th 2026) — an ADDRESS in place of a person mints an invitation and puts nobody on the record yet. `credentialed === false` → `NEEDS_BROWSER_SESSION`, and a host where nobody can sign in → `NOT_IN_THIS_BUILD` with that host's own sentence, injected as the `invitations` dep, because the record cannot know whether a link would lead anywhere. An address already on the record → `ALREADY_KNOWN`. Then: `secret` = base64url of 32 random bytes, `hash = hex(await sha256(secret))` outside the transaction; tx: any live invitation for the same address withdrawn, `INSERT INTO invitation(id, hash, email, level, registers, invited_by, created_at, expires_at)` with `expires_at = now + 24 h`. **No event, because nobody's access changed yet.** Return `{ invitation, token }` where `token` is `<rec_id>.<secret>` — the only copy, answered once, and in no log. The `invitation` table is `local` in `dog_section`, so no link travels in an export.

**`invitations()`** — every row with `accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now`, newest first, without `hash`. **`revokeInvite({ id })`** — `UPDATE invitation SET revoked_at = ? WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL`; 0 rows → `OUT_OF_BOUNDS` at `id`.

**`acceptInvite({ token, person? })`** (INTERNAL, §5.11) — the host calls it at `POST /auth/invite` with the Directory's verified person. The token is split at the dot, the record id compared and the secret hashed; a row that is not live is `OUT_OF_BOUNDS` with the one sentence every dead link gets, which never says which of used, withdrawn or run out it was. With no `person` it only looks, spending nothing. With one, in one transaction: `invite` as `system`, `note = 'Accepted invitation <id>.'`, then `UPDATE invitation SET accepted_at = ?, accepted_by = ?`. The events are `invite`'s own `access.grant` rows, so acceptance adds no event kind.

**`export({ cursor, sections, redactGrants })`** — `owner`, `op: 'export'`, or `system` (the nightly backup): `cursor === null` → `appendEvent({ kind: 'export', actor, note: JCS { sections, redactGrants } })` in its own statement; then `kernel.exportBrainl(cursor, { sections, redactGrants })` — page 0 refreshes `dog_meta` and `dog_manifest`, then ≤ 1,000 row lines per page, `dog_sig` last for the signer (41 §5.10). The host signs and streams; the record never sees the signing key's plaintext.

**`import({ lines })`** — `owner` or `op: 'import'`: `kernel.importBrainl(lines, ctx)` — `IMPORT_NOT_EMPTY`, `FORMAT_NEWER_THAN_READER`, `CHECKSUM_MISMATCH`, `SIGNATURE_INVALID`, the copy in one transaction, `rebuildFts`, one `import` event (41 §5.11). Then `tail()` — imported schedule rows need an alarm.

**`erase({ subjects, personId, basis })`** — `report = await kernel.erase(req, ctx)` (the stores of 02 §10 in one transaction, one `erase` event, an `erase.r2` outbox row — 41 §2); `tail()`. Refused before anything is written: a subject under three characters or a non-list `subjects` (`VALUE_MALFORMED`), no basis (`REQUIRED_MISSING`), a basis that names a subject (`VALUE_MALFORMED`), a `personId` not on the record (`OUT_OF_BOUNDS`), and any matched person holding `owner` on `*` (`LEVEL_REQUIRED`). `to_v` is the SHA-256 of each subject, never the subject.

**`restore({ bookmark, at? })`** (amended September 16th 2026, one method as 30 §5 has it) — `admin(ctx)`; no `Snapshots` port → `NOT_IN_THIS_BUILD` (the Worker, until its `pitr(at)` is wired); a sign-in older than 15 minutes where the host knows one → `NEEDS_BROWSER_SESSION`; a `bookmark` that is not a kept copy → `OUT_OF_BOUNDS` with `allowed` the kept ids. Then `Snapshots.take('before-restore')`, `Snapshots.restore(bookmark)` (a copy it cannot put back throws a sentence, returned as `OUT_OF_BOUNDS`), `reload()`, `rebuildFts()`, and one `restore.pitr` event written after, into the restored record, `to_v` the bookmark; `tail()`. Returns `{ bookmark, at, kept }`. The self-host's bookmark is a copy's id; `import` into a fresh directory stays its path for anything else.

**`snapshot({ label? })`** (amended September 16th 2026) — `admin(ctx)`; no `Snapshots` port → `NOT_IN_THIS_BUILD` with a sentence pointing at Export (the Worker: its copy is a `.brainl.age` sealed to the operator's age recipient and delivered by `export.r2`, neither wired); `label` one lower-case word, default `now`. `Snapshots.take(label)`, one `export` event with `note = 'snapshot ' + id + ' ' + bytes + ' bytes'`; `tail()`. Returns `{ id, at, bytes }`. "Snapshot now" — 12 §8.

**`snapshots()`** — `admin(ctx)`; no port → `NOT_IN_THIS_BUILD`; else `Snapshots.list()`, newest first.

**`deleteRecord({ slug })`** — `admin(ctx)`; no `destroy` port → `NOT_IN_THIS_BUILD` (the Worker, until 53 §5.9 step 1's sealed final snapshot is wired); a sign-in older than 15 minutes → `NEEDS_BROWSER_SESSION`; `slug` absent → `REQUIRED_MISSING`, not the record's own → `VALUE_MALFORMED`. Then the host's `destroy()`, and nothing after it, not even `tail()`.

**`createToken({ scope, name, expires_at })`** — any `person` (a token is capped by its person — 20 §6), `op: 'token'` admitted. `value` = base64url of 32 random bytes; `hash = hex(await sha256(value))` (WebCrypto, outside the transaction); tx: `INSERT INTO token(id, person_id, hash, scope, label, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)` with `person_id = principal.id`; `appendEvent({ kind: 'access.grant', actor, target: 'token:' + id, target_kind: 'token', to_v: scope, note: name })`. Return `{ id, token: value, scope, name, created_at }` — the value once, never stored (12 §3). `scope` is one word; the host expands the ladder `read ⊂ propose ⊂ write` into the principal's `scope[]`.

**`listTokens()`** — `SELECT id, person_id, scope, label, created_at, last_used_at, last_surface, expires_at FROM token WHERE revoked_at IS NULL AND (? = 1 OR person_id = ?) ORDER BY created_at DESC` — `?` = 1 for an owner, else the caller sees their own.

**`revokeToken({ id })`** — `UPDATE token SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL AND (? = 1 OR person_id = ?)`; 0 rows → `OUT_OF_BOUNDS` at `id`; `appendEvent` `access.revoke` (target `token:<id>`).

**`deviceLook({ user_code })` then `deviceApprove({ user_code, handle })`**: the code alone lets nothing in, and the handle is the row the look showed. Both by the owner from a sign-in proved in the last 15 minutes, which the record checks because the kernel cannot know when somebody signed in (12 §6.1: an agent may not approve its own request, and a bearer never reaches ADMIN). A code that is not six digits is `VALUE_MALFORMED` and spends no try. `pending = SELECT id, code_hash, reach FROM device_grant WHERE status = 'pending' AND expires > ?`; the row whose `code_hash === hex(sha256(id + ':' + user_code))` (constant-time compare over every pending row) → `UPDATE device_grant SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ?`, `appendEvent({ kind: 'access.grant', actor, target: 'device:' + handle, target_kind: 'device_grant', to_v: reach, note: label })`, return `{ handle, reach, scope, label, ua }`, where `handle` is the first 16 hex of `sha256('device:' + id)`. No row → `UPDATE device_grant SET tries = tries + 1 WHERE status = 'pending'`; then `UPDATE device_grant SET status = 'denied' WHERE status = 'pending' AND tries >= 5 RETURNING id` — any → `DEVICE_CODE_TRIES`; else `FORBIDDEN` at `user_code`. A denied row is kept (12 §6.1).

**`listDevices({})`**, the owner's: every `device_grant` row as a `DeviceRow`, named by its handle and never by its id. **`revokeDevice({ handle })`**, the owner's: the row with that handle → `revoked`, a login's token revoked with it, and one `access.revoke` event naming the handle; no row → `OUT_OF_BOUNDS` at `handle`.

**`saveView({ register, id, name, filter?, search?, order?, columns? })`** — `admin(ctx)`. ADMIN AND NOT READ+, which
is the argument `setDeclaration` already makes: a saved view is not one person's bookmark, it goes on the list and
everybody who opens that list sees it, so it changes what the record offers. Then: the register must be one this
record declares (`REGISTER_UNKNOWN`); `id` matches `^[a-z][a-z0-9-]{0,39}$` (`VALUE_MALFORMED`); `name` is present
(`REQUIRED_MISSING`) and at most 80 characters (`OUT_OF_BOUNDS`); `filter` is compiled by `compile(predicate, schema)`
and the first refusal it collects is returned as it stands, so a view's filter is held to exactly the grammar `list`
holds a query to; `search` is at most 200 characters; every field named in `order` or `columns` is one the register
has (`FIELD_UNKNOWN`, with the addressable fields in `allowed`), and `columns` is at most 40; a register already
holding fifty views refuses a fifty-first (`OUT_OF_BOUNDS` at `id`). The upsert runs in one transaction and keeps
`created_by` and `created_at` from the row it replaces, so saving over a name is an edit and not a new view by a new
person. No `tail()`: a view arms nothing.

**`retireView({ register, id })`** — `admin(ctx)`; `DELETE FROM view WHERE register = ? AND id = ?` → `{ register, id,
retired: true }`. No row → `VIEW_UNKNOWN` at `id` with the names the register does have. The rows themselves are
untouched, because a view is a question and not a row.

**`slashDraft({ asked, page? })`** *(as built, September 2026)*: `admin(ctx)`, in
`packages/record/src/methods/slash-draft.ts`; any other key is `FIELD_UNKNOWN`, no `asked` is `REQUIRED_MISSING`, and
`asked` must be text of 1 to `SLASH_ASKED_MOST` characters once trimmed, counted in code points (`VALUE_MALFORMED`).
`page` is the slug the description is about; its declaration goes to the model, a page drawn per row being its
template's, and a page the caller cannot open is `PAGE_UNKNOWN` before anything is asked. With no model, or on a record
whose `previewChange` is not there, the answer is one sentence in `dropped` and nothing is asked. Otherwise the model is
handed the reading `slashPropose` hands it, `kinds: ['change']`, the words, the page, and `grammar` with the page, list,
figure and rule grammars (`describedGrammar` in `grammar.ts`). Each draft is held as a description's always was
(`fromModel`'s rules: a change, no ingest, no rule that reaches out), carries at most `SAMPLE_ROWS_MOST` sample rows a
list, and is drawn with `previewChange` as the caller; a lint refusal or a block that drew nothing goes back to the model
as `repair: { drafts, refusals: { at, fix }[] }`, at most `SLASH_REPAIRS_MOST` times, and a draft still refused is dropped
with the record's sentence. Every ask goes through `slashAsked`, so it is held and settled in Slash's ledger against
`ask_cap`, and that row is all the method writes. Answer `SlashDrafted`: `{ by, drafts: { question, change: { to }, rows,
preview: { pages } }[], dropped }`. **`slashPropose({ asked, page? })`** files what `slashDraft` would answer for the same
words, through the same checks as every Slash question (`SLASH_OPEN_CAP`, asked before), after `describedPresses` has
said whether the model may be asked at all.

### 5.7 · The rules pass (`rules.ts`) — step 9 of the write path, run here through the kernel's hook

`kernel.write` calls `w.rules(fired)` once, after step 8, only when `cascade !== false` (41 §5.4 step 9). `runRules`
runs inside the same transaction; every write it makes is `fired.kernel.write(register, id, patch, { ctx, cascade: false,
mechanism: 'rule:' + rule, batch: fired.batch })` — re-entry at step 2, so `immutable_when:` (`ROW_LOCKED`), `HUMAN_ONLY`,
coercion, validation and transitions all apply and step 9 never runs again (07 §6.1).

1. Rules: `kernel.declarations()` filtered `kind = 'rule' AND body.register === fired.entry.register`. *(Recomputed per call — §10 #1.)*
2. Order: `priority` ascending (default 100) → **longest literal** descending — the byte length of the longest string-valued `is`/`contains`/`starts`/`ends` literal in `when:`, 0 when none → `id` ascending (07 §6 — cited, not restated).
3. Match: `compiled = compile(rule.when, { subject: 'entry', register, schemas, now, tz, scope: { registers: '*' } })` → `SELECT 1 FROM entry <compiled.sql> AND id = ?`; no row → next rule.
4. `once_per` (mandatory on `notify` and `create` — 42 enforces at install): `key = rule.id + ':' + tuple.map(t => t === 'entry' ? entry.id : String(fields[t])).join(':')`; `SELECT 1 FROM schedule WHERE kind = 'rule' AND key = ?` → exists → `suppressed`, next rule; else the marker: `kernel.schedule({ kind: 'rule', key, due_at: now, payload: { rule, entry: entry.id, batch, notify?, note? } })` — `state 'pending'` when the payload carries alarm-side actions, else `UPDATE schedule SET state = 'done' WHERE kind = 'rule' AND key = ?` right after. One table, one uniqueness, one insertion path (09 §1).
5. Actions, in declared order, one patch per rule: `tag: x` → `patch.tags = ∪ {x}` (`hints.tags = 'tag'`); `untag: x` → `∖ {x}` (`'untag'`); `set: { field, to }` → skipped when `field ∈ setFields` (≤ 1 `set` per field per pass — the earlier rule won), else `patch[field] = fill(to, row)` and `setFields.add(field)`; `move: s` → `patch.state = s` (step 5 checks the transition); `link: { field, to: { register, by, value } }` → `SELECT id FROM entry WHERE register = ? AND deleted_at IS NULL AND json_extract(fields, '$.' || ?) = ? LIMIT 2` — exactly one → `patch[field] = id` (`hints[field] = 'link'`), else skipped and named in the dry run; `create: { register, each, bound, fields }` → the cross product of the row's `each` values, refused past `bound` (`CREATE_OVER_BOUND` at run time too), each combination → `kernel.write(register, null, fill(fields) ∪ { _rule: rule, _parent: entry.id, _each: jcs(combo) }, { ctx, cascade: false, mechanism, batch })` — a `noop` on the `entry_created_by` index is the idempotent re-run (41 §5.4 step 6); `notify` · `schedule` → into the marker payload (step 4) — `notify` gets `because = 'rule.' + rule + ' on register.' + register`, `to = spoken`, `key`; `suggest` → the suggestion now (`opened_by = 'rule:' + rule`, `options` body, event `suggest`); `stop` → apply this rule's patch, then end the pass.
6. Apply: `patch` non-empty → one re-entrant `kernel.write`. A refusal (`ROW_LOCKED`, `HUMAN_ONLY`, `TRANSITION_ILLEGAL`, …) is collected into `RulesOutcome.refused`, the kernel's step R already counted it, and the pass continues — the triggering write is never undone by a rule's refusal.
7. Every action's event names the rule: `event.actor = 'rule:' + rule`, `event.batch = fired.batch` (07 §6 property 3).
8. `hits` for a rule is derived, never stored: `SELECT COUNT(*) FROM event WHERE actor = ?` (§10 #2).
9. **Dry run** — `dryRun(candidate)`: rank the candidate among the register's real rules by step 2 with the id it would get; for every live row (`LIMIT 5000`), walk the ordered rules with `setFields` tracking and no writes: `matches` = rows the candidate's `when` selects; `won` = rows where it is the first to `set` its field (or has no `set`); `lost` = rows where an earlier rule set that field, `takenBy[thatRule] += 1`; `suppressed` = rows whose `once_per` marker exists; `sample` = the first 20 rows with `would: [actions]` and a `reason` for a skipped `link`.

**`fill(template, row)`** — `{{path}}` and the eight typed forms of 05 §7.2 as plain text: `{{f}}` → the canonical
value as text (money `CUR 12.34`, a list joined by `, `, a ref its spoken id); `{{money:f}}` `{{quantity:f}}`
`{{day:f}}` `{{date:f}}` `{{until:f}}` (`in 3 days` / `3 days ago`) `{{ago:f}}` `{{pct:f}}` `{{ref:f}}`; `{{id}}` →
spoken; `{{each.0}}` `{{each.1}}` → the combination. A missing value renders `—` (06 §1). ~40 lines; no locale
(§10 #17) — `render` owns the display form, this owns a sentence in an event.

### 5.8 · The metric evaluator (`metrics.ts`) — `evaluateMetric(decl, ctx, kernel, sql)`, synchronous

1. **Source.** `register.<id>` → `FROM entry e <compiled.sql>` with `compiled = compile(decl.where ?? null, { subject: 'entry', register, schemas, now: asOf ?? now, tz, scope })`; `series.<id>` → `FROM metric_point p WHERE p.series = ? AND p.grain = 'day'`.
2. **Window.** `window: <n>d|w|m` → `W` ms. Series: `AND p.at >= ? AND p.at < ?` for `[now − W, now)`. Register: the window does not filter the current value — `where` is the value's whole definition; the window is the comparison shift (§13 #3).
3. **Compare.** `previous` → re-run steps 4–6 with `asOf = now − W` (relative literals resolve against `asOf`; series bounds shift by `W`); `year_ago` → `asOf = now − 1 y`; `none` → skip. **Gate** (08 §2.4): `comparable = W ≥ 7 d AND n > 0 AND priorN > 0 AND priorN ≥ n / 2`; `delta = (value − prior) / prior` only when comparable, else `why` names the failed clause.
4. **Aggregate SQL.** One SELECT, two columns for a combinator; field expressions from `jsonPath` (money `.amount`, quantity `.value`); `present(f)` is the compiler's missing-value test (30 §7). `sum: f` → `SUM(<f>)`; `count: f` → `COUNT(CASE WHEN <present f> THEN 1 END)`, `count: id` → `COUNT(*)`; `avg` `min` `max` → theirs; `distinct: f` → `COUNT(DISTINCT <f>)`; `last` → `ORDER BY <at> DESC LIMIT 1` (series `p.at`; register: the register's first indexed date field, else `created_at`); `delta` → `last − first` over that order; `median` → `SELECT <f> AS v … ORDER BY v` and the middle in JS (SQLite has none — §10 #3); `ratio` → `per = 0 ? null : of / per` in JS over the two columns; `diff` · `product` likewise. Money: `GROUP BY json_extract(fields, '$.f.currency')`; one group → `value`, `unit = currency`; several and no `lookup` → `value: null`, `mixed: [{ currency, amount }]` (08 §2.5; §13 #15). **As built (2026-09-17):** the parts travel as `parts: [{ currency, amount }]` beside `fx: { into, home, asOf, forward, missing }`, with no refusal; a `sum` in a currency other than the one it is added up in (the home currency, else the declared one) is read row by row and handed to `fx.ts` `across`, which converts at the rate as of each row's day when a home currency is set and every rate is there, and otherwise returns the parts.
5. **FX as-of** (as built: automatic for every money `sum` once a home currency is set, in JS over the rows rather than a SQL subquery; see 08 §2.5) — `sum: { product: [amount, { lookup: fx, by: currency, as_of: day }] }`: `SUM(<amount> * COALESCE(<onOrBefore>, <after>))`, `<onOrBefore>` = `(SELECT json_extract(f.fields, '$.rate') FROM entry f WHERE f.register = 'fx' AND f.deleted_at IS NULL AND json_extract(f.fields, '$.currency') = <currency> AND json_extract(f.fields, '$.as_of') <= <day> ORDER BY json_extract(f.fields, '$.as_of') DESC LIMIT 1)`, `<after>` the mirror (`>=`, `ASC`); rows where both are NULL are excluded by `AND COALESCE(<onOrBefore>, <after>) IS NOT NULL` and listed by a second SELECT as `noRate: [{ currency, amount }]` (absolute, never netted); note `"No rate for AED — those rows are left out."`; `forward: true` when any row used `<after>`. The product is rounded to an integer minor unit per row.
6. **`group_by` / `bucket`.** `GROUP BY <expr>`: an enum/ref field's `jsonPath`, or for a date field with `bucket`: `day` → `substr(<d>, 1, 10)`; `week` → `date(<d>, '-' || ((strftime('%w', <d>) + 6) % 7) || ' days')` (the Monday); `month` → `substr(<d>, 1, 7)`; `quarter` → `substr(<d>, 1, 4) || '-Q' || ((CAST(substr(<d>, 6, 2) AS INTEGER) + 2) / 3)`; `year` → `substr(<d>, 1, 4)`. Categories: `ORDER BY 2 DESC LIMIT 51`, the 51st → `more = COUNT(DISTINCT <expr>) − 50`. Bucket walk: from the earliest bucket with a row to the current one, every bucket emitted; no rows → `status 'empty'`, `value null`; the bucket containing `now`, or the earliest, → `partial`; else `full`. Averages across buckets use `full` only (08 §2.4). **As built (2026-09-17):** each part is the whole query with one more clause (the date's `substr` between a bucket's first day and the next bucket's, or the field equal to one value), so a part refuses exactly as the whole does; the bucket keys and the walk come from `buckets.ts`, which the browser's reader imports; the walk runs from the earliest bucket with a row to the later of the last one and the current one, so due dates ahead are buckets too, and every bucket from the current one on is `partial`. The earliest bucket is not marked partial yet. The result is `{ key, value, rows, state }` on the reading's `groups`, beside `current` and `more`.
7. **`running`.** `SELECT id, seq, <f>, <order> FROM … ORDER BY <order> LIMIT 5000`; `acc = from` (a literal, or the first row's field); per row `acc += f` (`sum`) or `+= 1` (`count`); push `{ spoken, at, value: acc }`; `stop` (`lt gt lte gte`) satisfied → `crossed = spoken`, break.
8. **`trend`** (series only). Buckets from step 6 with `status ≠ 'empty'` and `value > 0`; `n < 6` → `flat`, `why: 'fewer than 6 buckets'`. OLS of `ln(value)` on bucket index: slope `b`, `t = b / se(b)`; `|t| < 2.1` → `flat`, `why: 't = <t>'`; else `growth = e^b − 1`, band `e^(b ± 2.1·se) − 1`, `projection = last full bucket × e^b`, capped at `10 × last` with `capped: true` (08 §2.3).
9. **Target.** `target: { <op>: v }` against `value` (money compares `amount` inside `currency`); `met` null when `value` is null.
10. **Snapshot** is not written here: §5.9 kind `snapshot` calls this evaluator with `asOf` and writes `metric_point`.

One aggregate scan per evaluation (two with `compare`), on the partial expression index when `where` names one.

### 5.9 · `drainSchedule()` — the alarm handler of 09 §1 (`schedule.ts`)

Every insertion into `schedule` goes through `kernel.schedule(row)` — `INSERT … ON CONFLICT (kind, key) DO UPDATE`
(41 §2), the one path 09 §1 demands. `arm()` is `tail()`'s steps 4–5 (§5.2).

```
drainSchedule():
 ── kernel.transaction ──
 1. claimed = UPDATE schedule SET state = 'firing'
              WHERE id IN (SELECT id FROM schedule WHERE state = 'pending' AND due_at <= ? ORDER BY due_at LIMIT 100)
              RETURNING id, kind, key, payload, attempts, due_at
 2. for each row: try { dispatch(kind) } catch → failed
 3. done:     recurring (digest · pull · purge · analyse · snapshot · rotate with rotate_every) →
                UPDATE schedule SET state = 'pending', due_at = <next>, attempts = 0 WHERE id = ?
              one-shot (reminder · rule · retry · score · rotate expiry) → UPDATE schedule SET state = 'done' WHERE id = ?
    failed:   attempts + 1 < 8 → UPDATE schedule SET state = 'pending', attempts = attempts + 1,
                                   due_at = now + min(2^(attempts + 1) minutes, 6 h) WHERE id = ?
              else → UPDATE schedule SET state = 'failed', attempts = attempts + 1 WHERE id = ?
                     + suggestion(body_kind 'change', opened_by 'system') — the visible item (09 §1)
 4. outbox rows were written by the dispatches, in this transaction, through kernel.outbox
 ── transaction ends ──
 5. tail(): pendingWork → ARM in a finally (a handler that fails to re-arm stops the schedule forever); WAKE if outboxPending.
    100 claimed → MIN(due_at) is still ≤ now, so ARM sets the alarm to now and the next fire drains the rest.
```

Dispatch by kind — ten, the `CHECK`'s count:

| Kind | Payload | Does | Next |
|---|---|---|---|
| `reminder` | `{ entry, field, offset }` — written by the kernel at step 10 | row live and field present, else drop; `say = fill('{{title}} · <field> {{until:<field>}}')`, `because = 'register.<r>.<f>.remind'`, `to = spoken`, `tone 'warn'`, `urgent false`, `key` = the row's key → **notify** | one-shot |
| `digest` | `{ declaration }` | **a.** per section: `metric.<id>` → `evaluateMetric`; `register.<id>` → `compile` + `kernel.list` with `columns`, `limit 50`; **b.** `omit_when_empty` drops empty sections; nothing left → not sent (09 §5 rule 4); **c.** `prose: slash` → `kernel.outbox({ kind: 'infer.prose', payload: { digest, sections, channels } })` and stop — §5.10 finishes on the ack; else **d.** per `channels`: `email` → `kernel.outbox({ kind: 'notify.email', payload: { to: <owner emails: person ⋈ member('*', 'owner')>, subject: name, text, html? } })`; `in-app` → `appendEvent` `note` by `digest:<id>` (the headings with counts, ≤ 280); `push` → `notify.push` `{ title: '<name>: <n> items', url: '/digest/<id>' }` — no content (09 §3); `webhook` → `notify.webhook` `{ url: decl.url, body: jcs(sections) }` | `nextOccurrence(decl.schedule, now, tz)` |
| `rule` | `{ rule, entry, batch, notify?, note? }` (§5.7 step 4) | `notify`: non-urgent inside quiet hours 21:00–08:00 in `record.tz` → `UPDATE schedule SET state = 'pending', due_at = <next 08:00> WHERE id = ?` and return; else `appendEvent({ kind: 'note', actor: 'rule:' + rule, target: 'entry:' + entry, target_kind: 'entry', note: say, to_v: jcs({ tone, urgent, key, because }), batch })`; urgent → one interrupt per hour per record: `SELECT COUNT(*) FROM outbox WHERE kind = 'notify.push' AND created > ?` (now − 1 h) `= 0` → `notify.push { title: 'Something needs attention', url: '/' + spoken }` and `notify.email { to, subject: say, text: say + '\n' + because + '\n' + url }`, else downgraded to the digest (09 §7). `note` (a `schedule:` action) → `note` event by the rule on the row; nothing re-evaluates (§10 #16) | one-shot |
| `retry` | `{ outbox }` | `UPDATE outbox SET state = 'pending' WHERE id = ? AND state = 'failed'` — leased again by the host (30 §8) | one-shot |
| `purge` | `{}`: the hourly sweep, key `'sweep'`, created by `createRecord` | `kernel.purge(now − 30 d, { limit: 100 })`; sessions: `SELECT id FROM entry WHERE register = 'session' AND deleted_at IS NULL AND state IN ('active', 'idle') AND json_extract(fields, '$.last_seen') < ?` (now − 12 h) → each `kernel.write('session', id, { state: 'abandoned' }, { ctx: system, cascade: false })`; jobs: `UPDATE job SET status = 'cancelled' WHERE status = 'queued' AND expires < ? RETURNING id` → one `note` event by `system` per id; `UPDATE device_grant SET status = 'expired' WHERE (status = 'pending' AND expires < ?) OR (status = 'active' AND reach IN ('login', 'runner') AND last_used < ?)` (now − 14 d); `DELETE FROM observation WHERE day < ?` (today − 400 d); embeddings, last and only while no `infer.embed` row is `pending`, `leased` or `failed` (`kernel/src/embed.ts`): `SELECT e.id, f.text FROM entry e JOIN entry_fts f ON f.rowid = e.rowid LEFT JOIN entry_vec v ON v.id = e.id WHERE e.deleted_at IS NULL AND f.text <> '' AND (v.id IS NULL OR v.built_at < e.updated_at) LIMIT 100` → one `infer.embed` row, payload `{ at, ids, texts }`, each text the row's full-text projection and `at` the instant it was read, which the ack stamps as `built_at` so a row edited while its job waited is queued again (§13 #9). The host's model pass leases it after the drafts and the prose, on the background allowance with half the month kept for them (`host/src/model-jobs.ts`), and only when the host's engine offers `embed`; as built neither host's does (`workerModelJobs` in `apps/worker/src/slash-jobs.ts` and `slashModelJobs` in `apps/selfhost/src/slash.ts` answer drafts and prose only), so the one job waits `pending`, no vector is written and `search` answers by words alone until one does; `search` fuses the word order with each hit's cosine to the mean vector of its three best word matches (`record/src/rerank.ts`), and a hit with no vector keeps its place | `+ 1 h` |
| `rotate` | `{ grant, urgent? }` | grant live (`revoked_at IS NULL`) else drop; `say = 'credential <id> (<kind>) is due for rotation'` — never the label (12 §8), `target 'grant:' + id`, `to = '/vault/' + id`, actor `system`, `urgent` from the payload → **notify** | `rotate_every` → `due_at + rotate_every`; the expiry row one-shot |
| `pull` | `{ ingest, cursor, slot? }` | declaration active (else drop) → `kernel.outbox({ kind: 'pull.fetch', payload: { ingest, cursor, slot, record: { id, tz } } })`. A paused connector is this row with `state = 'paused'` — never claimed (25 §9) | `every + jitter`, `jitter = fnv1a(record.id + ingest) mod min(every / 4, 15 min)` — deterministic (25 §9) |
| `analyse` | `{}` — weekly, key `'weekly'` | governors: activity floor (`> 20` live rows, `> 3` distinct `event` days, record ≥ 14 d old), `≤ 3` open `system` suggestions, `≤ 1` proposal per 7 d, the brake (`SELECT AVG(met) FROM (SELECT met FROM prediction WHERE scored_at IS NOT NULL ORDER BY scored_at DESC LIMIT 20)` with 20 rows and `< 0.6` → suspended: a `note` by `system` naming the precision). Detectors — deterministic SQL over `observation` with 24 §4.3's numbers: `ingest.unmatched` (`SUM(n) ≥ 3` per subject, 30 d), `search.empty` (`SUM(n) ≥ 5` on `≥ 3` distinct days, 90 d), `write.refused` (`SUM(n) ≥ 10` on `≥ 3` days, 30 d), `query.scan` (`SUM(n) ≥ 200`, 30 d). The best candidate → `kernel.outbox({ kind: 'infer.draft', payload: { signal, subject, n, window } })` — Slash drafts, the ack proposes (§5.10) | `+ 7 d` |
| `score` | `{ prediction }` | `SELECT * FROM prediction WHERE id = ? AND scored_at IS NULL`; `observed = evaluateMetric({ ...measure, window }, { now, tz, scope: '*' }).value`; `met = compare(observed, target)`; `UPDATE prediction SET scored_at = ?, observed = ?, met = ? WHERE id = ?`; event `score` (`target 'prediction:' + id`, `to_v = jcs({ observed, met })`); `met = 0 AND on_miss = 'suggest'` → suggestion `options { question: '<claim> — predicted <target>, observed <observed>. Supersede it, or say why you are keeping it.', options: [{ id: 'supersede' }, { id: 'keep' }], requires_reason: true }` by `system`, event `suggest` (24 §4.6) | one-shot |
| `snapshot` | `{ metric }` | `y = yesterday in tz`; `v = evaluateMetric(decl, { asOf: end of y })`; `INSERT INTO metric_point(series, grain, at, value, unit, n, source, wrote_at) VALUES (?, 'day', ?, ?, ?, ?, ?, ?) ON CONFLICT(series, grain, at) DO UPDATE SET value = excluded.value, unit = excluded.unit, n = excluded.n, wrote_at = excluded.wrote_at` (overwrite yesterday); backfill: for each of the 30 days before `y` without a point, evaluate at that day's end and `INSERT … ON CONFLICT DO NOTHING`; a null value → `missing + 1`, no row; today is never written — appended live and flagged by the reader (08 §2.6) | next `00:05` in tz |

**notify** (shared by `reminder`, `rotate`, `rule`): the six fields of 09 §4 — `tone say because to key urgent`,
`say ≤ 120` — as the `note` event above plus the urgent branch's two outbox rows; dedupe is the `schedule` key
(`UNIQUE (kind, key)`), which is `once_per` (09 §5 rule 1).

**Time helpers**, `Intl` only (31 §1): `localParts(ms, tz)` via `Intl.DateTimeFormat(…, { timeZone: tz, hourCycle: 'h23' }).formatToParts`; `nextOccurrence({ day?, at, tz }, fromMs)` — walk up to 8 local dates from today in tz (today and the 7 after it), and turn each date's `at` into an instant through `clock.ts`'s `nextCalendar`, so a skipped or repeated time reads as the monthly clock reads it (the skipped one as the same distance past the gap, the repeated one as its first); `inQuietHours(ms, tz)` — local hour `≥ 22 || < 8`; `nextOpening(ms, tz)` — the next local `08:00`.

### 5.10 · The outbox (`outbox.ts`) — 30 §8

**`leaseOutbox({ kinds, n })`** — one statement, so a double drain finds nothing:

```sql
UPDATE outbox SET state = 'leased',
  leased_until = CASE WHEN kind LIKE 'notify.%' THEN ? WHEN kind LIKE 'infer.%' THEN ? ELSE ? END
WHERE id IN (SELECT id FROM outbox WHERE kind IN (…) AND (state = 'pending' OR (state = 'leased' AND leased_until < ?))
             ORDER BY created LIMIT ?)
RETURNING id, kind, payload, attempts, leased_until
```

The three `?` are `now + 60 s` · `+ 120 s` · `+ 300 s` as RFC 3339; the `LIKE` patterns are literals under 50 bytes
(30 §13). `n ≤ 100`.

**`ackOutbox({ id, state, result, error })`** — one `kernel.transaction`:

1. `row = SELECT kind, payload, attempts FROM outbox WHERE id = ? AND state = 'leased'` — none → `OUT_OF_BOUNDS` at `id`.
2. `done` → `UPDATE outbox SET state = 'done', leased_until = NULL WHERE id = ?`, then the write-back for `row.kind`:

| Kind | `result` | Persisted in the ack's transaction (51 §13 D9; 47 §2) |
|---|---|---|
| `infer.embed` | `{ model, dims, vectors: Int8Array[] }` | per `payload.ids[i]`: `INSERT OR REPLACE INTO entry_vec(id, register, dims, vec, model, built_at) VALUES (?, ?, ?, ?, ?, ?)` |
| `infer.prose` | `{ text }` | `prose = first two sentences of text`; the digest's outbox rows of §5.9 step d, `text` prefixed by `prose`, attributed `— Slash` |
| `infer.draft` | `{ body: { question, body_kind, body } }` | the suggestion (`opened_by 'slash'`) and its event — `propose` when `payload.raw` names an arrival (an ingest pattern), else `suggest`; actor `slash` (30 §3) |
| `pull.fetch` | `PullFinish { outcome, points, cursor, due_at, slot }` | `points` → the `metric_point` upsert of §5.9 `snapshot` with `source = 'ingest.' + id`; `UPDATE schedule SET payload = json_set(payload, '$.cursor', ?, '$.slot', ?), due_at = COALESCE(?, due_at) WHERE kind = 'pull' AND key = ?`; `outcome = 'paused'` → `UPDATE schedule SET state = 'paused' WHERE …`, `UPDATE grant SET stale_at = ? WHERE id = ?`, an urgent **notify** by `ingest:<id>` (25 §9); event `pull` (actor `ingest:<id>`, `note` = the finish's one line) |
| `export.r2` | `{ key, bytes }` | event `export`, `note = 'snapshot ' + key + ' ' + bytes + ' bytes'` |
| `erase.r2` · `notify.*` | — | nothing |

3. `failed` → `UPDATE outbox SET state = 'failed', attempts = attempts + 1 WHERE id = ? RETURNING attempts`; `attempts < 8` → `kernel.schedule({ kind: 'retry', key: 'outbox:' + id, due_at: now + min(2^attempts min, 6 h), payload: { outbox: id } })` — the row's `attempts` mirrors the outbox's; `attempts ≥ 8` → `UPDATE outbox SET state = 'dead' WHERE id = ?` and the dead-letter suggestion (§13 #4): `'SG' + allocate('suggestion')`, `body_kind 'change'`, `opened_by 'system'`, `body = { declaration_id: payload.declaration ?? payload.ingest ?? 'kernel.outbox', from: { kind, error, attempts, payload: summary(payload) }, to: 'retry' }`, `question = '<kind> could not be delivered after 8 attempts: <error>. Retry it, or change what produces it.'`; event `suggest`. `kind = 'export.r2'` also writes the event `export` with `note = 'failed: ' + error` (12 §8).
4. `tail()`.

`summary(payload)` is the payload's keys and the first 120 characters of each string value — never `texts`, never a
body, never a credential (12 §6 rule 5).

### 5.11 · The remaining INTERNAL methods (`admin.ts`)

**`observe({ batch })`** — `kernel.observe(batch)`; `batch.length ≤ 200`; a `kind` outside the nine → `ENUM_VALUE_UNKNOWN`.

**`applyMigrations()`** — `await kernel.applyMigrations()`; the kernel holds the module-level refusal `kernel.refused()` reads (§5.1 step 0).

**`createRecord({ id, slug, name, tz, locale, owner, keys })`** — tx: `INSERT INTO record(singleton, id, slug, name, locale, tz, format_ver, created_at) VALUES (1, ?, ?, ?, ?, ?, ?, ?)` with `format_ver = FORMAT_VERSION`; a row already there → `IMPORT_NOT_EMPTY`; `INSERT INTO person(id, email, name) VALUES (?, ?, ?)`; `INSERT INTO member(person_id, register, level) VALUES (?, '*', 'owner')`; event `access.grant` (`target` owner id, `field '*'`, `to_v 'owner'`); `INSERT INTO vault_key(purpose, wrapped, nonce, wrapped_by, kek_id) VALUES (?, ?, ?, 'kek', ?)` × 3 from `keys`; `dog_meta` rows `format created_at producer record_slug tz locale`; `kernel.schedule` × 2 — `purge` (`key 'sweep'`, `due_at = now + 1 h`) and `analyse` (`key 'weekly'`, `due_at = nextOccurrence({ day: 'mon', at: '09:00' })`). `tail()`.

**`arrive({ channel, ingest_id, headers, body, sha256, verified })`** — one transaction: store → match → extract → write (07 §2, §7; 51 §13 D12 — no Workflow in v1):

1. `INSERT INTO inbox_raw(id, ts, channel, headers, body, sha256, state) VALUES (?, ?, ?, ?, ?, ?, 'untriaged') ON CONFLICT(channel, sha256) DO NOTHING` — headers lower-cased here again (30 §1); `rowsWritten = 0` → return the existing row's `{ raw, state, wrote: 0 }` (redelivery writes one row).
2. `appendEvent({ kind: 'arrive', actor: 'system', target: 'inbox_raw:' + id, target_kind: 'inbox_raw', note: channel })`.
3. `!verified` → return `{ raw, state: 'untriaged', wrote: 0 }` — stored, never matched (12 §3).
4. Candidates: `ingest_id` given → that declaration; else every active `ingest` whose `channel` matches, in id order; `ectx = { currencies, lookup: (register, field, value) => kernel.list(…) first row }` (43 §4.1); the first with `extract.matches(decl, raw, ectx)` claims it (07 §2). None → `kernel.observe([{ kind: 'ingest.unmatched', subject: channel + ':' + (headers.from ?? headers.host ?? '-') }])`; when that subject's 30-day count reaches 3 (24 §4.3's `n_min`) → `kernel.outbox({ kind: 'infer.draft', payload: { raw: id, kind: 'pattern', samples: [the three ids] } })`; `UPDATE inbox_raw SET reason = 'no ingest matched' WHERE id = ?`; return.
5. Matched: event `match` (actor `'ingest:' + decl.id`, target the raw row); `x = extract.extract(decl, raw, ectx)` → `{ rows, confidence }` (43 §2). `confidence ≠ 'exact'` → `UPDATE inbox_raw SET state = ? WHERE id = ?` (`review` for `needs-review`, `proposed` for `proposed`), a suggestion `rowset { register, rows, ingest: decl.id }` by `'ingest:' + decl.id`, event `suggest`; return.
6. `exact`: per row — `decl.dedupe` → `kernel.list` on the register with `all: dedupe.map(f => ({ field: f, is: row[f] }))`, a hit → `extract.isDuplicate` → skipped (`kept + 1`); else `kernel.write(decl.writes.register, null, row, { ctx, cascade: true, mechanism: 'ingest:' + decl.id, batch, rules: fired => runRules(fired, ctx) })`; a refusal → `state 'review'` and the `rowset` suggestion of step 5 for the refused rows. `INSERT INTO ingest_receipt(id, raw_id, ingest_id, wrote, confidence, ts) VALUES (?, ?, ?, ?, 'exact', ?)`; `UPDATE inbox_raw SET state = 'matched' WHERE id = ?`; event `extract` (`to_v` = the count).
7. `tail()`. Return `{ raw, state, wrote }`.

**`applyPull(args: PullPage)`** — `{ outbox, n, raw, rows?, ingest }` (47 §4.x): `SELECT state, leased_until FROM outbox WHERE id = ?` must be `leased` and unexpired, else `OUT_OF_BOUNDS` at `outbox` (47's `PULL_LEASE_EDGE` is its own); then steps 1, 5–6 of `arrive` with `channel 'pull'`, `verified: true`, the given declaration; `raw.body === null` stores headers and `sha256` only (25 §8); return `{ wrote, kept }`. `tail()` is the ack's.

**`runActions(execute, { limit })`** (`actions.ts`): claim the due `pull`, `call` and `poll` rows, lease their `pull.fetch` jobs, and hand each request to the host's executor outside every transaction. Every job ends in one `pull` event whose `to_v` is `{ channel, host, status, outcome, scope, usage: { runs, requests, bytes, ms, failures, held } }`, where `scope` is the action's project or `global`. A job that sent nothing (its declaration gone, its pack off, or held) counts `runs: 0`. The pass returns those rows as `usage` (`event`, `at`, `ingest`, `channel`, `scope`, `outcome`, `usage`), and the host adds each to the Directory's ledger with `directory.meter(record, row)`, which counts an event id once. **Limits are the host's to ask, because the record cannot see the Directory:** before sending, the executor calls `directory.mayRun(record, request.ingest)`, and when the record's plan is at its monthly allowance it sends nothing and answers `{ status: 0, body: '', bytes: 0, ms: 0, requests: 0, held: { until, say } }` instead. The job is `done`, the action's schedule row moves to `until` (the first of the next month, UTC) and stays `pending`, and the event's note is `say`, for example "npm downloads is waiting until 1 October. This record has used its 15,000 runs for September." No refusal code is raised. The allowance, the ledger and `usage(person, { from, to })` are `@braindog/record/directory`'s, at Directory version 4.

**`ingestVerify({ ingest_id })`** — the active `ingest` declaration, else `REGISTER_UNKNOWN` at `ingest_id`; `verify.kind = 'path'` → `{ kind: 'path', token: verify.token }`; `hmac_sha256` → the grant named by `verify.grant` → `openGrant` steps 1–3 as `system` (the `grant.read` event is the audit trail — 12 §6 rule 1) → `{ kind: 'hmac_sha256', header, sealed }`.

**`deviceStart({ reach, label, ua })`** — `user_code` = six digits from `crypto.getRandomValues`, `device_code` = base64url of 32 bytes; `INSERT INTO device_grant(id, code_hash, status, label, ua, tries, expires, reach) VALUES (?, hex(sha256(id + ':' + user_code)), 'pending', ?, ?, 0, now + 10 min, ?)` with `id = device_code` (the poll id is never the code — 12 §6.1); return `{ device_code, user_code, expires, interval: 5 }`.

**`devicePoll({ device_code })`** — `SELECT * FROM device_grant WHERE id = ?`; none → `FORBIDDEN`; `pending` and `expires < now` → `UPDATE … SET status = 'expired'`, `DEVICE_CODE_EXPIRED`; `pending` → `{ pending: true, interval: 5 }`; `denied` → `DEVICE_CODE_TRIES`; `approved` → `token` = 32 random bytes, `UPDATE device_grant SET status = 'active', token_hash = hex(sha256(token)), expires = ?, last_used = ? WHERE id = ?` — `expires = now + 90 d` for `login`/`runner`, `now + 10 min` for an operation reach (48 §13 D1) — return `{ pending: false, bearer, reach, scope, expires }`. A `login` exchange mints its bearer as a `token` row through `createToken` instead (scope `write`, 90 days, the device's label, owned by the approver), so there is one verifier; a second poll, and any other status → `FORBIDDEN`. `deviceStart` counts starts per address, given by the host, before it asks the kernel: ten in 15 minutes in `auth_fail`, then `Limited`.

---

## 6 · Refusals and errors

Only codes from 30 §6. Codes the kernel, `where`, `declare` and `extract` raise pass through unchanged inside the
same `Result`; this table is what **this layer** raises, with the `fix` a person reads.

| Code | Raised here when | `at` | `fix` |
|---|---|---|---|
| `FORBIDDEN` | the principal's kind, level, scope or `op` reach does not reach the method or register (§5.1 steps 1–4); `slash` outside `propose`; `share` outside its slug; a runner on another runner's job; a wrong device code (first four) | `principal` · `register` · `user_code` | `You hold <held>; this needs <needed>.` |
| `NEEDS_BROWSER_SESSION` | a `token` or `runner` at KEYCHAIN, ADMIN or the JOBS session half; an `op` grant at KEYCHAIN | `principal` | `Open this from the app; a token cannot reach it.` |
| `WRONG_KEY` | `openGrant` / `ingestVerify`: `vault_key.kek_id ≠ args.kek_id` | `kek_id` | `The Keychain was wrapped by another key — rotate the KEK forward; the data is intact.` |
| `GRANT_REVOKED` | `openGrant` / `bindGrant` / `revokeGrant` on a row with `revoked_at` | `id` | `This credential was revoked on <date>; bind a new one.` |
| `DEVICE_CODE_EXPIRED` | `devicePoll` on a pending row past its ten minutes | `device_code` | `The code expired; ask for a new one.` |
| `DEVICE_CODE_TRIES` | the fifth wrong `deviceLook`; `devicePoll` on a denied row | `user_code` | `Five wrong codes — every pending request was denied. Start again.` |
| `REGISTER_UNKNOWN` | an undeclared register, page, ingest or `log.target`; the kernel's bare `#n` passes through | `register` · `slug` · `ingest_id` · `target` | `Registers on this record: <list>.` |
| `FIELD_UNKNOWN` | `order.field`; a `body.<key>` the shape lacks; `deleted_at` in a `create` | the path | `Fields on this register: <list>.` |
| `REQUIRED_MISSING` | `get(level: full)` without `path`; `get` asking nothing; no `register` on `get` `list` `create` `update`, no `seq` on `update`; `decide` without `reason`; a body key absent | the path | `Name the field you want: path: 'note'.` |
| `OUT_OF_BOUNDS` | `note` outside 1–280; a `list` `limit` below 1; an unknown grant, token or outbox id; `applyPull` on an unleased outbox row | `note` · `limit` · `id` · `outbox` | `A note is one sentence: 1–280 characters.` |
| `ENUM_VALUE_UNKNOWN` | `body_kind`, an `observe` kind, a job `end` status, a `createToken` scope outside its list | the path | `One of: <list>.` |
| `TRANSITION_ILLEGAL` | `decide` / `resolved_as` on a suggestion that is not `open` | `status` | `SG23 was resolved on <date> as <resolved_as>.` |
| `LEVEL_REQUIRED` | `invite` would leave no `owner` on `'*'` | `levels` | `A BrainDog keeps one owner. Make somebody else an owner first.` |
| `CREATE_OVER_BOUND` | a rule's `create` would exceed `bound` at run time | `then[i].create.bound` | `<n> combinations for a bound of <bound>; raise the bound or narrow each:.` |
| `IMPORT_NOT_EMPTY` | `createRecord` on a record that has its row (the kernel raises it for `import`) | `record` | `This record exists; create a new one.` |
| `SCHEMA_MISMATCH` · `SCHEMA_NEWER` | `kernel.refused()` at step 0 — every method, 503 | `migration` | `Deploy the build that matches this database.` |
| `VERSION_STALE` | the kernel's CAS, surfaced as `conflict` (409) with `current` and `actor` — never a refusal list | — | the body is the fix: re-read `current`, re-apply |

`UNAUTHORIZED` is the host's — no `CallContext` is built without a credential; `httpStatus` maps it for the hosts.
`PLAN_STALE`, `FORMAT_NEWER_THAN_READER`, `CHECKSUM_MISMATCH`, `SIGNATURE_INVALID` and the write-path and grammar
codes arrive from 41, 42 and 38 and pass through. A thrown `TypeError` or unmapped `SqlError` (41 §2) is not a
refusal: it propagates and the host answers a bare 500 (12 §8). Every code above has a fixture under
`fixtures/refusals/<kebab>.yaml` that a §9 case produces (33 §8 `refusal-fixtures`).

---

## 7 · Performance budget

Measured by `test/perf.test.ts`: the fixture record (`@braindog/fixtures` seed, materialised through the real write
path into `openNodeSqlite(':memory:')` with an injected `Clock`), `performance.now()` around 20 runs, **p50**. The
numbers are the local budget on the reference machine; CI asserts `≤ 3 ×` each, because CI runners are slow and a
budget that fails on noise is a budget people delete.

| Operation | Budget (p50) | Statements | Also asserted |
|---|---|---|---|
| `boot()` on the fixture record | 20 ms | `registers + 6` | one `kernel.transaction`, one round trip |
| `list` 25 rows, default order | 3 ms | 2 | `EXPLAIN QUERY PLAN` contains `USING INDEX entry_live` |
| `list` 25 rows, `where` on an indexed field | 4 ms | 2 | plan contains `entry_i_<reg>__<field>` |
| `search` 25 rows over 5,000 | 8 ms | 2 | — |
| `get` by spoken id | 1 ms | 1 | — |
| `create` with 3 rules on the register | 6 ms | — | one transaction; `tail()` adds one `scheduler.get` |
| `evaluateMetric`, `sum` over 5,000 rows | 25 ms | 1 | the partial index when `where` names one |
| `evaluateMetric`, `group_by: month`, `compare: previous`, 5,000 rows | 60 ms | 2 | ≤ 51 groups |
| `runRules` per rule per write | 1 ms | 2 | — |
| `drainSchedule` claim | 2 ms | 1 | `LIMIT 100` |
| `drainSchedule` per row, all kinds but `digest` and `analyse` | 3 ms | ≤ 6 | — |
| `digest` with 3 sections | 60 ms | ≤ 8 | — |
| `arrive`, one exact row | 8 ms | ≤ 12 | one transaction |
| `leaseOutbox(10)` · `ackOutbox` | 2 ms each | 1 · ≤ 4 | — |
| `whatsNew` 60 events | 3 ms | 2 | `sinceCapped` at 61 |
| `project` with `budget.tokens: 6000` | 15 ms | ≤ 4 | — |
| `export` page of 1,000 rows | the kernel's (41 §7) + 1 ms | +1 | — |
| Memory | — | — | no method here materialises more than 5,000 rows |

---

## 8 · Security

| Boundary | Crossed by | Validated here |
|---|---|---|
| host → record | `CallContext` — an **authenticated** identity the host built from a cookie, bearer, device grant, `_meta` or the alarm | every authorisation decision: group gate, `op` reach, level, scope, verb (§5.1). The host authenticates (it reads `token.hash` and `device_grant.token_hash` for that, the one read it makes outside `RecordApi`); the record authorises. A check in a router is a check the CLI can be pointed around (30 §10), so `apps/*` hold none |
| record → `where` | `ctx.scope` | `scope.registers` and `scope.rows` are AND-ed **inside the SQL** by the compiler; nothing is filtered after ranking (30 §7, 11 §5) |
| record → kernel | `WriteContext` | the actor is the kernel's derivation, never the caller's word; `mechanism` is set only by the rules pass and ingest |
| record → host | `Result<T>` | never an exception; bodies carry codes, paths and fixes, never a field value the caller could not read |

What never travels: a plaintext credential — `openGrant` and `ingestVerify` return ciphertext and a wrapped DEK, and
the record has no key to open either (ADR-062); a `secret` field's grant id in any DATA or READ+ value — `mapRow`
replaces it with the label before a row object exists; a grant's `label` or `opens` in a `grant.*` event `note`
(12 §8; the kernel enforces the shape); content in a `notify.push` payload — a title and a URL (09 §3); a token's
or device bearer's value after the one reply that mints it; a `local` table in an export (03 §3); a row a `share`
link's predicate excludes (20 §1). What never happens: `slash` writing a row — refused at §5.1 and asserted by the
`slash-actor` gate; a token reaching KEYCHAIN, ADMIN or a job's session half; a `system` method from a routable
principal — INTERNAL has no route and refuses every other kind; a device approving itself — `deviceApprove` is a
browser session.

`GROUPS` is exported so the `router-groups` gate (33 §8) can walk `apps/*`'s routes and assert each names a group,
INTERNAL has none, and KEYCHAIN/ADMIN routes accept no bearer. Log lines from this package carry a code, an id and a
shape — never `fields`, `payload`, `note`, `body` or `ciphertext` (12 §8; the `secret-grep` gate reads this package).

---

## 9 · Tests and gates

`node:test` + `node:assert/strict`, `test/**/*.test.ts`, `node --test`. `Sql` is `openNodeSqlite(':memory:')` from
`@braindog/ports/node-sqlite` (37 §2); `Scheduler` and `Clock` are the memory ports; the fixture record is seeded
through `createRecord` + `installPack` + `create`. One case per method's happy path, then the rows below. Input → expected.

**`test/groups.test.ts`** — `Object.keys(GROUPS).length === 55`; per group `9 · 11 · 4 · 6 · 14 · 11`.

**`test/auth.test.ts`** — the matrix, every cell a case:

| Principal | DATA | READ+ | KEYCHAIN | JOBS session | JOBS runner | ADMIN | INTERNAL |
|---|---|---|---|---|---|---|---|
| person `read` | reads ok; `create` → `FORBIDDEN`; `markRead` ok | ok | `FORBIDDEN` | `FORBIDDEN` | `FORBIDDEN` | `createToken` ok; `installPack` → `FORBIDDEN` | `FORBIDDEN` |
| person `append` | `create` ok; `list` of that register → `FORBIDDEN`; `propose` ok | ok on read-level registers | `FORBIDDEN` | `FORBIDDEN` | `FORBIDDEN` | as above | `FORBIDDEN` |
| person `write` | `create` `update` ok; `decide` → `FORBIDDEN` | ok | `FORBIDDEN` | `FORBIDDEN` | `FORBIDDEN` | as above | `FORBIDDEN` |
| person `decide` | + `update(suggestion, decide)` ok | ok | `FORBIDDEN` | `FORBIDDEN` | `FORBIDDEN` | as above | `FORBIDDEN` |
| person `owner` | ok | ok | ok | ok | `FORBIDDEN` | ok | `FORBIDDEN` |
| person `owner`, `op: 'pack'` | ok | ok | `NEEDS_BROWSER_SESSION` | `FORBIDDEN` | `FORBIDDEN` | `planPack` ok; `export` → `FORBIDDEN` | `FORBIDDEN` |
| token `read` | reads ok; `propose` → `FORBIDDEN` | ok | `NEEDS_BROWSER_SESSION` | `NEEDS_BROWSER_SESSION` | `FORBIDDEN` | `NEEDS_BROWSER_SESSION` | `FORBIDDEN` |
| token `propose` | + `propose` `log` ok; `create` → `FORBIDDEN` | ok | `NEEDS_BROWSER_SESSION` | `NEEDS_BROWSER_SESSION` | `FORBIDDEN` | `NEEDS_BROWSER_SESSION` | `FORBIDDEN` |
| token `write` (person `write`) | + `create` `update` ok; `markRead` → `FORBIDDEN` | ok | `NEEDS_BROWSER_SESSION` | `NEEDS_BROWSER_SESSION` | `FORBIDDEN` | `NEEDS_BROWSER_SESSION` | `FORBIDDEN` |
| token `write` (person `read`) | `create` → `FORBIDDEN` — the person caps the token | ok | — | — | — | — | — |
| runner | `FORBIDDEN` | `FORBIDDEN` | `NEEDS_BROWSER_SESSION` | `NEEDS_BROWSER_SESSION` | ok | `NEEDS_BROWSER_SESSION` | `FORBIDDEN` |
| share | `FORBIDDEN` | `page(its slug)` ok; another slug → `FORBIDDEN`; `metric` → `FORBIDDEN` | `FORBIDDEN` | `FORBIDDEN` | `FORBIDDEN` | `FORBIDDEN` | `FORBIDDEN` |
| slash | `propose` ok; `create` → `FORBIDDEN` | ok | `FORBIDDEN` | `FORBIDDEN` | `FORBIDDEN` | `FORBIDDEN` | `FORBIDDEN` |
| system | — | — | — | — | — | `export` ok; `invite` ok | ok |

Plus: a person with `member(obligations, read)` and no `'*'` row → `list(services)` → `FORBIDDEN`, `list(obligations)`
ok; `httpStatus` over one `Result` per row of §4.2; `kernel.refused()` set → every method returns it.

**`test/data.test.ts`**

| Case | Input → expected |
|---|---|
| `list` pagination round trip | 60 rows, `limit 25` → 25 + cursor; cursor → 25 + cursor; cursor → 10 + `null`; the 60 ids distinct, in `updated_at desc, id desc`; `dir: asc` walks the reverse |
| `op_id` replay | `create(op_id X)` → `{ version: v }`; again → `ok`, the same row, `version: v`; `SELECT COUNT(*) FROM event WHERE op_id = X` is 1 |
| CAS | `update(version: 1)` after another `update` landed → `conflict.current.version = 2`, `conflict.actor` = the other actor; `httpStatus` 409 |
| ARM and WAKE | a `create` whose rule writes an outbox row → `scheduler.set` once, `wake` once; no outbox row → `wake` not called |
| `get` three keys | `{ spoken: 'obligations#7' }`, `{ register, seq: 7 }`, `{ id }` → the same row; `{ spoken: '#7' }` → `REGISTER_UNKNOWN`; `{ spoken: 'D1' }` → the decision; a missing row → `value: null`; a row outside scope → `FORBIDDEN` |
| `get` levels | `row` → `note: { words: 212 }`; `full` without `path` → `REQUIRED_MISSING`; `full, path: 'note'` → the document |
| `secret` never leaks | a register with a `secret` field: `list`, `get(row)`, `search`, `page`, `project` all return the grant's label; `JSON.stringify(result)` does not contain the grant id |
| `propose` four bodies | one ok case per kind; `options` with one option → `REQUIRED_MISSING` at `body.options`; the same `op_id` twice → the same `SG` |
| decide | `update(suggestion, { decide })` by `decide` → a `D<n>` row, `decide` + `resolve` events, `status resolved`; again → `TRANSITION_ILLEGAL`; by `write` → `FORBIDDEN`; a `rowset` accepted → its rows exist with `mechanism` actor |
| `log` | 281 chars → `OUT_OF_BOUNDS`; ok → an event `note` whose actor is the ladder's `S<n>` |
| `markRead` | `upTo: 40` then `upTo: 30` → `seen_at` stays at event 40's `ts` |
| tokens | `createToken` → a value once, `hash = sha256(value)` in `token`, an `access.grant`; `listTokens` by a non-owner → own rows only; `revokeToken` → `revoked_at` set, `access.revoke` |

**`test/read.test.ts`**

| Case | Input → expected |
|---|---|
| `whatsNew` cap | 70 events after the mark → the newest 60, `sinceCapped: true`, `upTo` = the newest rowid; with `cursor` = newest − 9 → 10, `false` |
| `whatsNew` scope | a token held to one register: an event on another register, its declaration, a question over its rows, a line about access and a whole-record line are absent; a question on its own register is present; `whatsNew` and `recentHistory` agree |
| `recentHistory` paging | pages of 3 join to the whole log newest first, no line twice, `cursor` `null` only on the last; a fractional `limit` is `VALUE_MALFORMED`; a caller who may only append to a register reads none of its lines |
| `inbox` | five unmatched arrivals with one `ignored` → the other four newest first, their count equal to `boot`'s `counts.inbox`; pages of 3 join to the whole, no arrival twice; no `sha256` or raw `headers` in the answer; a fractional `limit` and a `cursor` of 0 are `VALUE_MALFORMED`; a token held to one register, a record-wide token, a `write` person, a person with no level and an owner held to one register are each `FORBIDDEN` |
| `fileArrival` · `archiveArrival` | filing an arrival writes one row titled by its subject, with a `create` event and the arrival's `state` event in one batch, and the inbox and `counts.inbox` lose it; filing it again answers the same row and writes nothing; a refused row leaves the arrival waiting; archiving is `ignored`, twice is one event; archiving a filed arrival and filing an archived one are `OUT_OF_BOUNDS`; a token is `NEEDS_BROWSER_SESSION`, a writer is refused, and an owner held to one register is `FORBIDDEN` |
| `backlinks` | two fields of one register pointing at one row are two groups, ordered by register then field, each with `matched` for the whole and `rows` for the page; a row never lists itself; an archived row is not listed; pages of 2 join to the whole across the groups with no row twice, `cursor` `null` only on the last; a token held to one register reads only that register's group, and its `matched` counts only what it may read; a row the record does not hold is `from: []`; a `seq` of 0 and a cursor that is not one of ours are `VALUE_MALFORMED`; a caller who may not read the row's own register is refused before anything is counted |
| `boot` shell | `record`, `me` with the member's name, `counts.decide`, `counts.inbox` `null` below owner; the JSON of a scoped boot names no register, row or question outside the scope; `whatsNew` inside equals `whatsNew()` alone |
| `index` | `open` = rows in non-terminal states; a register without `transitions` has `open: 0`; `fields` lists `{ id, type }`; `scope.repo` narrows only registers with `repos` |
| `search` | a phrase with `"` and `OR` is matched literally; zero rows → one `search.empty` observation; with `vec` → the fused order |
| `context` | over the seed, in `test/context.test.ts`: the run, the project and how it was placed, the last handoff, who is live here and elsewhere, what waits, the project's open rows, a learning faded after ninety days and counted, the people linked, and no run opened by the read; nearer wins for a skill of the same name; a key by its label and sealed state, with no value anywhere; an append grant is no register in the answer, and a caller with nothing to read is refused |
| `sessionsLive` | `last_seen` 46 min ago → `stale: true`; `same_repo` excludes the caller |
| `attach` · `handoff` | in `test/session.test.ts`: attach opens a run signed by itself and resumes it for the same client; a person is never a run; re-attaching never overwrites the handoff and brings a finished run back; a handoff appends `tried` and `note`, keeps the last fifty of each, and moves `state` along the transitions; a token hands off only its own run |
| `meet` | in `test/meet.test.ts`: somebody new is added, signed by the run and linked to its project; somebody already there is matched and gains the line and the handle and nothing else; with People switched off it is `REGISTER_UNKNOWN` and nothing is written, a run included; a stray key is `FIELD_UNKNOWN`, a `read` token and a token that does not reach `people` are `FORBIDDEN`, and a person in the app links no project |
| `page` | `share` on its slug → ok; a `when: false` block → no rows; `empty` filled |
| `previewPage` | in `test/preview-page.test.ts`: over three task rows a proposed `table` of `register.tasks` answers three rows; a member invited to another list gets that block with no rows, no `source` and one `FORBIDDEN`, and her own list's block drawn; an unknown block kind is the lint's `KIND_UNKNOWN`, an unknown `requires` its `DEPENDENCY_UNRESOLVED`, and to the member a list she cannot read and one nobody declared are one answer, in `requires` and in a block's `source` alike, where a `where` over a field Tasks lacks draws the same held block as one over a field it has; `total_changes()`, the declaration count and the observation count are the same before and after; routed as a POST |
| `previewChange` | in `test/preview-change.test.ts`: the launch desk's Desk and part pages with the lists and figures they read and the pad's notes, tried in one call over sample rows, draw the Desk and a part page over the first part, and Numbers with its own in a second call draws too (the whole desk is more than one call takes); afterwards the declaration count, the record's version, the observation count and the list cache are what they were, and the desk's lists answer `REGISTER_UNKNOWN`; `about` fills the part page over the part it names; a change to an installed page answers the page as it stands in `was`; a member invited to Notes alone has the block over Tasks held and her Notes block drawn, and is refused a list she cannot read in `rows` before anything is linted; a lint refusal's `at` names its declaration; more than `PREVIEW_DECLARATIONS_MOST` declarations is `OUT_OF_BOUNDS` |
| `boot` pages | in `test/boot-about.test.ts`: a `for:` page over two projects is two pages, each with `about: { register: 'projects', seq }`; a written page has `about: null`; a member who cannot read Projects is sent no page about one |
| `project` budget | `budget.tokens: 500` → `used ≤ 500`, cut at the first row that does not fit; no `document` body; a `series` register contributes no rows; `{ metric }` → `rows: []` and the metric |
| `whoami` | a token → its person's `levels` and `registers`; no session row is opened |

**`test/rules.test.ts`**

| Case | Input → expected |
|---|---|
| order | rules `{ p: 100, literal 'UBER' }`, `{ p: 100, literal 'UBER EATS' }`, `{ p: 10 }` → fire order `p10, UBER EATS, UBER` |
| ≤ 1 set per field | two rules setting `category` → the first wins, the second's `set` skipped; both events name their rule |
| locked row | a rule's `set` on a row where `immutable_when` holds → outer write `ok`, `refused[0].code === 'ROW_LOCKED'`, `observation(write.refused, '<reg>.<field>:ROW_LOCKED').n === 1` |
| no cascade | a rule's `create` into `skus` where `skus` has a rule → the `skus` rule never fires; every created row has `event.batch` = the trigger's |
| `create` idempotent | the trigger written twice → 40 SKUs, not 80; `each` widened by one colour → 8 new rows |
| `once_per` | a `notify` rule matched twice for one tuple → one `schedule(rule)` row; one `note` event after drain |
| dry run | candidate ranked below an existing rule on 4 of 10 matching rows → `matches 10, won 6, lost 4, takenBy: { <rule>: 4 }`; nothing written |
| `stop` | later rules skipped for that row |
| `fill` | `{{money:cost}}` → `USD 52.01`; `{{until:renews}}` → `in 30 days`; a missing field → `—` |

**`test/metrics.test.ts`**

| Case | Input → expected |
|---|---|
| eleven aggregations | one fixture each over 5,000 rows, checked against a JS fold of the same rows |
| comparability gate | window `3d` → `comparable: false, why: 'window < 7 days'`; prior 4 rows against 9 → `false`; 9 against 9 → `true`, `delta` present |
| mixed currency | EGP + USD, no lookup → `value: null`, two `mixed` entries; with `lookup: fx` → an integer total, `noRate: [{ currency: 'AED', … }]`, `forward: true` when only a later rate exists |
| `group_by` cardinality | 60 categories → 50 groups, `more: 10` |
| bucket status | `partial` on the current and the first month; an empty month has `value: null` and is not averaged |
| `running` | `from: opening_balance`, `stop: { lt: 0 }` → `crossed` = the first negative row's spoken id |
| `trend` | 5 buckets → `flat`; 12 buckets on a 10 %/month curve → `growth ≈ 0.10 ± 0.02`, `capped: false`; a 400× jump → `capped: true` |
| `snapshot` | drain the `snapshot` row twice on one day → one point for yesterday, overwritten; 3 missing days backfilled; today absent |

**`test/schedule.test.ts`**

| Case | Input → expected |
|---|---|
| cancels before inserts | `remind: [-7d]`, `renews: 2026-10-01` → one `reminder` due 2026-09-24; `update(renews: 2026-11-01)` → the old row gone, one due 2026-10-25 (the kernel's step 10, asserted here because `tail()` must arm for it) |
| claim | 120 due rows → the first drain claims 100 and arms for `now`; the second claims 20 |
| re-entry | `drainSchedule` twice on the same rows → the second claims nothing |
| backoff | a throwing dispatch → `attempts 1`, `due_at = now + 2 min`; at the 8th → `state 'failed'` and one `system` suggestion |
| arm in finally | every dispatch throws → `scheduler.set` still called |
| quiet hours | a non-urgent `rule` notify due 23:30 record tz → re-armed to 08:00, no event; urgent → the event and a `notify.push` row at 23:30 |
| one interrupt per hour | two urgent notifications in 10 min → one `notify.push`, two `note` events |
| digest | `omit_when_empty` drops a section; all empty → no outbox row; email + in-app → one `notify.email`, one `note` by `digest:<id>`; `prose: slash` → one `infer.prose` row and no email until its ack; re-armed to the next Monday 08:00 in `Africa/Cairo` |
| `purge` sweep | a session `last_seen` 13 h ago → `abandoned` by `system`; a `queued` job past `expires` → `cancelled` + a `note`; observations over 400 d gone; changed rows → one `infer.embed` row with ≤ 100 ids |
| `score` | `baseline 11, target lte 1, observed 7` → `met 0`, an `options` suggestion by `system` |
| `pull` jitter | the same `record.id + ingest` → the same `due_at` twice |
| `analyse` governors | a 3-row record → nothing; 4 `write.refused` days totalling 12 → one `infer.draft` row; 20 predictions with 12 misses → suspended, a `note` names `0.4` |

**`test/outbox.test.ts`**

| Case | Input → expected |
|---|---|
| lease | 3 pending + 1 expired lease → `leaseOutbox(['notify.email'], 10)` returns 4; again → 0; `leased_until` per kind `+60 s` / `+120 s` / `+300 s` |
| retry ladder to `dead` | `ackOutbox(failed)` → outbox `failed, attempts 1`, a `retry` row due `+2 min`; drain it → `pending`; repeat to the 8th failure → `dead`, one `change` suggestion by `system` naming the kind and the error; no ninth retry row |
| write-backs | `infer.embed` done → `entry_vec` rows for `payload.ids`; `infer.draft` done → a suggestion by `slash` and a `suggest` event; `pull.fetch` done with `points` → `metric_point` rows and the `pull` row's `cursor`; `outcome 'paused'` → the row `paused`, `grant.stale_at` set |
| `export.r2` failure | also an `export` event with `note: 'failed: <error>'` |
| ack unknown or unleased | `ackOutbox` on an unknown or `pending` id → `OUT_OF_BOUNDS` |

**`test/vault.test.ts`** — `openGrant` → `opened + 1`, a `grant.read` event whose `note` is `<id> <kind>` and never the label; `kek_id` mismatch → `WRONG_KEY`; revoked → `GRANT_REVOKED`; `SealedGrant` has no key named `plaintext` and `ciphertext` equals what `bindGrant` stored; `bindGrant` twice → `version 2`, `prev_ciphertext` = the first; `revokeGrant` → ciphertext columns NULL, both `rotate` rows gone.

**`test/jobs.test.ts`** — two runners `claimJob` on one queued job → one `Claim` with a `bearer` whose hash is in `token` with `scope 'propose'` and `expires_at = job.expires`, the other `Idle`; a claimed job past `lease_until` → `listJobs` shows `lost: true` and a new claim takes it; a repeated `seq` → one `job_event` row; `cancelJob` → the next `Ack.cancel = 1`; another runner's job → `FORBIDDEN`.

**`test/admin.test.ts`** — `planPack` then `setDeclaration` then `installPack` with the old hash → `PLAN_STALE`; `installPack` → `pack`, declarations, `sqlite_master` has `entry_i_invoices__due`, seeds tagged `example`, one `install` event, `digest`/`pull`/`snapshot` schedule rows; `uninstallPack` → `retired = 1`, rows kept, indexes gone, its schedule rows gone; `invite` → `member` rows and one `access.grant` per register, `access.revoke` on removal, last owner → `LEVEL_REQUIRED`; `invite` as `system` ok; `export` → the kernel's pages plus one `export` event on page 0; `brain-roundtrip` (33 §8): export → import into a fresh record → export yields identical row lines apart from `dog_sig`; `erase` → the kernel's report, one `erase.r2` outbox row, `wake` called; `restore(request)` writes nothing, `restore(done)` writes `restore.pitr`; `snapshot` → one `export.r2` row; devices: `deviceStart` → six digits, a pending row with `code_hash ≠ user_code`; `deviceApprove` with a wrong code four times → `FORBIDDEN`, the fifth → `DEVICE_CODE_TRIES` and every pending row `denied`; a right code → `approved`; `devicePoll` → `{ token, expires: +90 d, reach }` and the row `active`; after 11 min pending → `DEVICE_CODE_EXPIRED`; `arrive`: a duplicate `(channel, sha256)` → one row; `verified: false` → `untriaged`, no match; an exact match → a row with actor `ingest:<id>`, `matched`, a receipt; `needs-review` → `review` and a `rowset` suggestion; the third unmatched arrival of one shape → one `infer.draft` row; `ingestVerify` → a `grant.read` event by `system`; `applyPull` on an unleased outbox row → `OUT_OF_BOUNDS`.

**`test/perf.test.ts`** — §7's table, p50 of 20, asserting `≤ 3 ×`.

**CI rows** (33 §8): `ci.yml` runs this suite; `router-groups` reads `GROUPS`; `refusal-fixtures` maps §6's codes to fixtures the cases produce; `slash-actor` runs over the fixture record after `test/data.test.ts`; `brain-roundtrip` is `test/admin.test.ts`'s case; `closed-lists` diffs `DIALECT` against `packages/render/kinds/*.json`; `secret-grep` includes `packages/record/src`.

---

## 10 · Deliberate ceilings

Twenty-one, each a `ponytail:` line in the file named.

1. `rules.ts` — `ponytail: rules recompiled on every write; cache by [id, version] of the declarations when a write with ten rules passes 5 ms.`
2. `rules.ts` — `ponytail: hits is a COUNT over event with no actor index; add event_actor or a counter when the rules screen passes 100 ms.`
3. `metrics.ts` — `ponytail: median, running, trend and the FX no-rate list fetch ≤ 5,000 rows into JS; window the query when a register passes it.`
4. `metrics.ts` — `ponytail: instant fields bucket in UTC; record-tz bucketing needs a per-row Intl offset — add when a customer far from UTC reports a bar on the wrong day.`
5. `auth.ts` — `ponytail: no row-scope rules for members (20 §1's scope layer); only share.rows is AND-ed. The compiler already takes rows; add the storage when the collaboration tier ships.`
6. `auth.ts` — `ponytail: append reads nothing, not even its own rows; own-row read needs a creator field on entry.`
7. `schedule.ts` — `ponytail: reminders are never urgent; 09 §5's domain/payment defaults need a declared marker on remind:. rotate inside 48 h is urgent.`
8. `schedule.ts` — `ponytail: a digest does not omit items the read mark already covered (20 §7); one join when the first duplicate complaint arrives.`
9. `schedule.ts` — `ponytail: "nothing needs you this week" is never sent; 09 §5 rule 4 allows monthly.`
10. `schedule.ts` — `ponytail: analyse runs four observation-only detectors; field-always-null, register-never-read, alarm-dismissed and the exploration draw arrive with 24 §8's phase. query.scan uses the count alone — observation has no scanned-rows column.`
11. `schedule.ts` — `ponytail: snapshot backfill covers 30 days and only metrics evaluable as-of; a stock metric's history starts the day its snapshot is declared.`
12. `schedule.ts` — `ponytail: embeddings are queued hourly by the sweep, ≤ 100 rows a pass; near is deferred past §1b (30 §7), so an hour of lag costs nothing yet.`
13. `auth.ts` — `ponytail: a suspended person's mirror is not refreshed here; the host refuses the session at the Directory. Refresh through invite when suspension gets a flow.`
14. `admin.ts` — `ponytail: arrive tries every active ingest of the channel in id order — O(ingests) matches per arrival; index by declared sender/host when a record passes twenty ingests.`
15. `rerank.ts`: search reranks its word hits by the rows' own vectors, the query's vector the mean of the best three, and never searches by meaning alone, because the record never embeds a query. *(September 28th 2026: this line said the caller passed `vec`, which no caller did. The file gives its reason in its header comment rather than a `ponytail:` line.)*
16. `schedule.ts` — `ponytail: a rule's schedule: action writes a note when it fires and re-evaluates nothing; re-running the rule needs a loop guard first.`
17. `rules.ts` — `ponytail: fill() renders the eight typed forms in English without a locale; render owns the display form. Localise when the second locale ships.`
18. `read.ts` — `ponytail: DIALECT is a sixteen-line constant kept equal to render's kinds by the closed-lists gate, not by an import — record ⇏ render.`
19. `read.ts` — `ponytail: whatsNew filters entry events by scope and passes every other kind; values were redacted at write.`
20. `metrics.ts` — `ponytail: trend is one log-linear fit; no seasonality, no changepoints. Six points cannot carry more.`
21. `index.ts` — `ponytail: a saved view is a local table and does not travel in a .brain export; a travelling table is FORMAT_VERSION 2 and every reader of the format. Make it travel when somebody moves a record and asks where their views went.`

*(Item 7, read September 22nd 2026.)* The fix item 7 names is the right
shape and the wrong default. The core should know only "a row a rule marks urgent": a declared
marker on `remind:` that whoever built the list sets. Which rows are urgent (a payment failing, a
domain expiring) is that person's or that pack's to declare, because payments and domains are use
cases, not primitives. The one urgent default the core keeps is the Keychain's own credential expiry
inside 48 hours, which the file already has.

---

## 11 · Dependencies

| Kind | Package | Version | Why |
|---|---|---|---|
| runtime | — | — | none (35 §2) |
| workspace | `@braindog/ports` `@braindog/where` `@braindog/theme` `@braindog/kernel` `@braindog/declare` `@braindog/extract` | `workspace:*` | 31 §2 row 10 |
| dev | `typescript` | 6.0.3 | type-check only |
| dev | `@braindog/fixtures` | `workspace:*` | the seed record for §7 and §9 |
| dev | `fast-check` | 4.9.0 | the keyset walk as a property: a random page size and order walks every row once |
| toolchain | Node | 24.13.0 | `node --test`; `openNodeSqlite(':memory:')` |

`exports: { ".": "./src/index.ts" }` — three lines, layer 2 of 31 §3.

---

## 12 · Build order

**Before this:** `ports` (37) for the three port types and `openNodeSqlite`; `where` (38) for `validate compile
jsonPath jcs searchText`; `theme` (39) only as `declare`'s need; `fixtures` (40) for the seed; `kernel` (41) for
everything in §4.7's first row; `declare` (42) for `normalise lint plan install uninstall`; `extract` (43) for
`matches extract isDuplicate`. `mcp` (44) is ninth in 31 §2 but not a dependency — `mcp ⇏ record`, `record ⇏ mcp`.

**Interface agreements the audit checks:** §4.7's rows against 41 §2, 42 §2, 43 §2, 38 §2, 37 §2; the two requests
of §13 #4 and #11 (`kernel.actor`, `device_grant.reach`); 46 §4.6 and 47 §2 against §2 here — `project(args, ctx)`
carries `budget` inside `args`, `ackOutbox` takes one object with `state` (§13 #1).

**This unblocks:** `apps/selfhost` (49) and `apps/worker` (51), which host `RecordApi` one line per method;
`packages/slash` (46), whose reads are `project()` and whose runner protocol is the JOBS group; `packages/connect`
(47), which writes back through `applyPull` and `ackOutbox`; `packages/mcp`'s integration tests over a real
`RecordApi` on `:memory:`; the `router-groups`, `slash-actor` and `brain-roundtrip` gates (52).

---

## 13 · Decisions taken here

Each amends the named document in the same revision (35 §1).

| # | Decision | Amends |
|---|---|---|
| 1 | **Fifty-five methods, not forty-four.** The hosts' specs name eleven the record must have: `whoami` (READ+); `snapshot`, `createToken`, `listTokens`, `revokeToken`, `deviceApprove` (ADMIN — the last four admit any `person`); `arrive`, `applyPull`, `ingestVerify`, `deviceStart`, `devicePoll` (INTERNAL). `export` admits `system` for the nightly backup. `ackOutbox` takes `{ id, state, result?, error? }` — 47's positional form and 49's `outcome` become this one shape; `project` takes `(args, ctx)` with `budget` inside `args`, so every method keeps 30 §5's two-argument form | 30 §5 (a counted row per group); 33 §4 (routes); 47 §2; 49 §5; 51 §13 D11 |
| 2 | **No Directory here.** Persons, passkeys, sessions, magic links and the lockout are many-record state and belong to a host or a `packages/directory` of their own; 51 D10's `@braindog/record/directory` does not exist | 51 §13 D10; 31 §2 if a package is cut |
| 3 | **The metric evaluator lives in `record/metrics.ts`.** `window` is the comparison shift for a register source (`compare` re-evaluates with `asOf = now − W`) and the `at` filter for a series source; the gate is 08 §2.4 verbatim. **`list` cursors are the kernel's** — one repair requested of 41 §5.8: missing order values must sort last in both directions and stay reachable across pages (`((k, id) op (?, ?) OR k IS NULL)`; `k IS NULL AND id op ?` once the cursor's `k` is null) | 08 §2 (`window` row), 08 §2.4; 41 §5.8 |
| 4 | **The rules engine lives in `record/rules.ts`** as the body of 41 §2's `RulesHook`; every rule write re-enters `kernel.write` with `cascade: false, mechanism: 'rule:<id>', batch`; `once_per` markers are `schedule(kind 'rule')` rows checked with a SELECT before `kernel.schedule`. **Requested of 41:** export the ladder as `actor(ctx)` so events this package appends carry the actor a row write would. **The dead-letter suggestion**: `change`, `system`, `from = { kind, error, attempts, payload: summary }`, `to = 'retry'`, question `"<kind> could not be delivered after 8 attempts: <error>. Retry it, or change what produces it."`; the eighth `failed` ack makes the row `dead`; retry rows never fail | 30 §4 step 9, §8; 41 §2; 09 §1 |
| 5 | **Every method returns a `Promise`**, reads included — `Scheduler` is async and one signature beats two | 33 §2 |
| 6 | **`CallContext` gains `runner`, `share`, `token.person` and `op`** — 30 §10's crosswalk and 48 §13 D1's operation grant each get a shape; the `op` reach check runs here, not in the host's router | 33 §2; 41 §2; 49 §5.2 step 7 |
| 7 | **A person actor is `person.id`**; the UI resolves it through the `person` mirror, which exists to resolve actors offline | 30 §3 |
| 8 | **`append` grants `create`, `propose`, `log` and no read** — the conservative half of 20 §1. **`invite`** runs as the owner at mint or as `system` at acceptance (49 §5.16), one method. **`restore` is two-phase** (`request` gates; `done` writes `restore.pitr` on the restored session) | 20 §1; 33 §9, §10 |
| 9 | **`search` reranks its word hits by the rows' own vectors** (`record/src/rerank.ts`); the record never embeds, not even a query, so a caller passes no `vec`. **Embeddings are queued by the hourly sweep** (one `infer.embed` row, ≤ 100 changed rows), not per write. **WAKE rings only when `pendingWork().outboxPending`**; ARM always | 10 §3; 30 §4 step 12b, §8 |
| 10 | **Governance rows are DATA pseudo-registers**: `list`/`get` read `decision suggestion prediction`; `update({ register: 'suggestion' })` carries `decide`, `defer` and `resolved_as`; an accepted `rowset` writes its rows, an accepted `pattern`/`change` calls `setDeclaration`. **`get` of a missing row is `value: null`**; replay is the kernel's (41 §13 #9) | 30 §5; 10 §5; 33 §2 |
| 11 | **`device_grant` gains `reach TEXT NOT NULL DEFAULT 'login'`** (48 §13 D1's six reaches) — one column in migration 0001, since v1 has not shipped; `code_hash = sha256(id ‖ ':' ‖ user_code)`, `id` is the poll id; an operation reach expires in 10 min, `login`/`runner` in 90 d | 30 §1; 41 §5.2 |
| 12 | **`DIALECT` is a constant in `read.ts`** and `fill()` a forty-line interpolator in `rules.ts`, because `record ⇏ render` and 42 exports neither; the `closed-lists` gate keeps `DIALECT` equal to render's kinds | 34 §2; 42 §2 (no `dialect`/`interpolate`) |
| 13 | **`index.open`** counts rows in non-terminal states (no `to:`); no `transitions:` → `0`; `index.registers[].fields` lists `{ id, type }` (46 §4.6) | 10 §4; 30 §9 |
| 14 | **`Projection.budget` counts ≈ tokens as `ceil(utf8 bytes / 4)`**; `series: true` rows are never projected (no spoken id); no document body in v1 | 30 §9; 11 §6 |
| 15 | **Mixed currencies at runtime without a lookup** yield `value: null` and per-currency `mixed` partials — refuse to guess, keep the parts | 08 §2.5 |
| 16 | **`setDeclaration.mode ∈ set · retire · test · apply`** carries `braindog rule test` and `rule apply --dry`; an in-app declaration is a one-declaration pack `_inapp` through `declare.lint` | 30 §5; 33 §5 |
| 17 | **A notification's in-app form is the `note` event** by `rule:<id>`, `digest:<id>` or `system` on the row, `to_v` = JCS `{ tone, urgent, key, because }`; no inbox table. Urgent adds `notify.push` (title + URL) and `notify.email`; one interrupt per hour per record; `prose: slash` routes the digest through `infer.prose` and finishes on the ack | 09 §3, §4, §6, §7 |
| 18 | **`arrive` is deterministic and one transaction**: store → first matching ingest → extract → exact rows written with `mechanism: 'ingest:<id>'`, else a `rowset` suggestion; an unmatched shape earns an `infer.draft` row at its third arrival in 30 days, never a model call per payload | 07 §7 ("is a Workflow" → "may become one"); 24 §4.3; 51 §13 D12 |
| 19 | **`openGrant` takes `kek_id`** and `SealedGrant` carries the wrapped DEK's `nonce`, `wrapped_by`, `salt`; `WRONG_KEY` compares against `vault_key(record).kek_id`; `ingestVerify` returns the same sealed shape to `system` with a `grant.read` event | 12 §6; 30 §5 |
| 20 | **The job bearer is a `token` row** with `scope 'propose'`, `label 'job:<id>'`, `person_id` = the `'*'` owner, `expires_at = job.expires`, minted by `claimJob` (46 §4.7's `Claim.bearer`); a token row holds one scope word and the host expands the ladder `read ⊂ propose ⊂ write` | 12 §3; 30 §1 (`token.scope`) |
| 21 | **Nine source files**, the ADMIN group in `admin.ts` | 35 §2's "about eight" holds; no amendment |

---

## 14 · Done when

- [ ] `createRecordApi({ sql, scheduler, clock })` returns `RecordApi & { kernel }` with 55 methods; `test/groups.test.ts` counts `9 · 11 · 4 · 6 · 14 · 11`.
- [ ] Every method authorises at §5.1 before any row read; the matrix of §9 is green, every cell, including the `op` row.
- [ ] `create`/`update` run `kernel.write` inside `kernel.transaction`, then `tail()`; `wake()` only when `outboxPending`; replay and CAS cases green.
- [ ] `runRules` fires in `priority → longest literal → id` order, ≤ 1 `set` per field, re-enters with `cascade: false`; the locked-row and no-cascade cases green; dry run reports `won / lost / takenBy`.
- [ ] `evaluateMetric` passes the eleven-aggregation fold, the comparability gate, FX as-of with `noRate`, `group_by` at 50 + `more`, `running` with `crossed`, `trend` gated at `n ≥ 6, |t| ≥ 2.1`.
- [ ] `drainSchedule` claims in one statement, dispatches all ten kinds, backs off `2^n` to 6 h, fails visibly at 8, arms in `finally`, rings last; cancels-before-inserts green.
- [ ] `leaseOutbox`/`ackOutbox` hold the per-kind leases; the ladder reaches `dead` at the eighth failure with one `system` suggestion; the six write-backs persist in the ack's transaction.
- [ ] `arrive` stores, matches, extracts and writes in one transaction; a duplicate is one row; unverified never matches.
- [ ] `openGrant` and `ingestVerify` return sealed material only; `grep -r plaintext packages/record/src` is empty; the `secret-grep` gate passes.
- [ ] Device grants: six digits, ten minutes, five tries, a denied row kept, a bearer minted once.
- [ ] `boot()` is one round trip within budget; every §7 row within `3 ×` on CI.
- [ ] `export → import → export` yields identical row lines apart from `dog_sig` on the fixture record.
- [ ] Every §6 code has a fixture a §9 case produces; `refusal-fixtures` passes; `DIALECT` passes `closed-lists`.
- [ ] Every §10 line is in the file it names, verbatim `ponytail:`.
- [ ] Every §13 amendment is applied to its design document in this revision; 41 exports `actor(ctx)` and carries `device_grant.reach`; 46, 47, 49 and 51 call the shapes of §2.

---

*Previous: [44-SPEC-MCP](44-SPEC-MCP.md). Next: [46-SPEC-SLASH](46-SPEC-SLASH.md).*
