# 41 · packages/kernel — specification

The record's core: the one migration that creates the twenty-seven tables and the four header tables, the write
path of [30-BLUEPRINT](30-BLUEPRINT.md) §4 with the exact SQL of every step, counters, events, `entry_fts`, the
schedule rows a date field derives, purge, erase, and the `.dogl` export and import. Everything the record owns
and nothing it says: no RPC, no auth, no rules evaluation, no outbound call.

Derives from [30-BLUEPRINT](30-BLUEPRINT.md) §1–§4, §6, §8, §11, §13 · [02-DATA-MODEL](02-DATA-MODEL.md) ·
[34-GRAMMARS](34-GRAMMARS.md) §3–§5 · [33-CONTRACTS](33-CONTRACTS.md) §1–§2, §9 · [12-SECURITY](12-SECURITY.md)
§6, §8 · [20-COLLABORATION](20-COLLABORATION.md) §8 · [24-SELF-IMPROVEMENT](24-SELF-IMPROVEMENT.md) §4 ·
[09-ALARMS](09-ALARMS-AND-NOTIFICATIONS.md) §1–§2. Mode: ponytail — lazy about structure, exact about the write path.
Clean room: nothing here is ported.

---

## 1 · Purpose and boundary

**Does.** Owns the schema (one migration), applies migrations under a checksum ledger, runs the write path
synchronously inside one `transactionSync`, allocates spoken numbers from `counter`, appends events with the
redaction list applied, keeps `entry_fts` in step with `entry`, derives `schedule` rows from `remind:` and
`repeat:`, inserts the outbox rows a hook queues, counts refusals into `observation`, purges soft-deleted rows,
erases a subject across every store, streams the record as `.dogl` pages and imports one into an empty record.

**Refuses to do.** Auth, scopes and the six RPC groups (`record`, spec 45). Rule evaluation — the kernel exposes
the step-9 hook and the `cascade = false` re-entry; the engine is `record`'s. YAML, lint, the install plan
(`declare`, spec 42). Predicate parsing and compilation (`where`, spec 38). Re-arming the alarm and ringing the
doorbell — `Scheduler` is `record`'s port; the kernel reports what is pending. Embeddings — `infer.embed` is an
outbox job. Decryption or any sight of a plaintext credential ([ADR-062](16-DECISIONS.md)). Signing an export —
the private key is wrapped in `vault_key`, and the record has no `KeyStore`.

**May import.** Types from `@braindog/ports` (`Sql`, `Param`, `Row`, `Cursor`, `Clock`); `compile` from
`@braindog/where/sql`; `evaluate`, `jsonPath`, `jcs` from `@braindog/where`. Nothing else. Under `packages/**`
the banned surface of [31-STACK](31-STACK.md) §1 applies: no `node:*`, no `cloudflare:*`, no `fetch`, no
`Buffer`. WebCrypto (`crypto.subtle.digest`, `crypto.subtle.verify`, `crypto.getRandomValues`), `TextEncoder`,
`Intl` and `URL` are the whole platform the kernel uses.

**Trust.** `CallContext` is trusted — the Worker built it. Every `patch` value is untrusted. Register and field
ids are trusted only after they match `^[a-z][a-z0-9_]{0,31}$`, because they are inlined into index names and
`json_extract` paths ([34-GRAMMARS](34-GRAMMARS.md) §4); every value is bound.

**Where it runs.** workerd, Node 24.13 and a bare test process, unchanged. Nothing is compiled from strings — the
coercers are plain functions, so the module-top-level rule of [31-STACK](31-STACK.md) §9 has nothing to bite.

---

## 2 · Public API

Every symbol below is exported from `packages/kernel/src/index.ts`; the package's `exports` map has that one entry.

```ts
import type { Sql, Clock, Param } from '@braindog/ports';

export const FORMAT_VERSION = 1 as const;            // PRAGMA user_version at v1 — 30 §11
export const KERNEL_MIGRATION = 1 as const;          // MIGRATIONS.length — one file at v1

/** Synchronous. Reads schemaState and the active declarations. Does not migrate: call applyMigrations first. */
export function openRecord(sql: Sql, clock: Clock): Kernel;

export interface Kernel {
  // ── lifecycle ───────────────────────────────────────────────────────────────────────────────
  applyMigrations(): Promise<Result<{ kernel: number; format: number; applied: number[] }>>;
  refused(): Refusal | null;                         // the module-level SCHEMA_MISMATCH | SCHEMA_NEWER, else null
  transaction<T>(fn: () => T): T;                    // transactionSync that permits kernel re-entry; never nests the driver

  // ── rows ────────────────────────────────────────────────────────────────────────────────────
  write(register: string, id: string | null, patch: Patch, w: WriteContext): Result<Entry>;
  create(register: string, fields: Patch, w: WriteContext): Result<Entry>;            // write(register, null, …)
  update(register: string, ref: EntryRef, patch: Patch, w: WriteContext): Result<Entry>;
  get(ref: EntryRef, opts?: { includeDeleted?: boolean }): Result<Entry | null>;
  list(q: ListQuery): Result<{ rows: Entry[]; cursor: string | null }>;
  search(q: { q: string; registers?: string[]; limit?: number }): Result<Entry[]>;
  count(register: string): number;

  // ── declarations ────────────────────────────────────────────────────────────────────────────
  declarations(): Declaration[];                     // active: superseded_at IS NULL AND retired = 0
  register(id: string): RegisterDecl | undefined;    // by register id, from the cache
  installDeclarations(batch: InstallBatch, ctx: CallContext): Promise<Result<{ versions: Record<string, number> }>>;
  retireDeclarations(req: { ids: string[]; pack?: string }, ctx: CallContext): Result<{ retired: number }>;
  disablePack(id: string, opts?: { alsoDisable?: string[]; actor?: string }): Result<PackToggle>;
  enablePack(id: string, opts?: { actor?: string }): Promise<Result<PackToggle>>;

  // ── provenance ──────────────────────────────────────────────────────────────────────────────
  allocate(counter: string): number;                 // in a transaction only, else TypeError
  appendEvent(e: NewEvent): { id: string; rowid: number };
  replay(opId: string): Result<Entry> | undefined;
  observe(batch: { kind: ObservationKind; subject: string }[]): void;
  version(): number;                                 // MAX(event.rowid), 0 on an empty record

  // ── queues (in a transaction; the rules hook and the record use them) ───────────────────────
  schedule(row: ScheduleRow): void;                  // INSERT … ON CONFLICT (kind, key) DO UPDATE
  outbox(row: OutboxRow): string;                    // returns the new id
  pendingWork(): { nextDueMs: number | null; outboxPending: boolean };   // the caller arms and wakes from this

  // ── projection ──────────────────────────────────────────────────────────────────────────────
  project(entryId: string): void;                    // rebuild one row's entry_fts line
  rebuildFts(): number;                              // import's rebuild; returns rows written

  // ── housekeeping ────────────────────────────────────────────────────────────────────────────
  purge(cutoff: string, opts?: { limit?: number }): Result<{ purged: number; remaining: boolean }>;
  erase(req: EraseRequest, ctx: CallContext): Promise<Result<EraseReport>>;   // async: hashes the subject first

  // ── format ──────────────────────────────────────────────────────────────────────────────────
  exportDogl(cursor: string | null, opts?: ExportOptions): Promise<Result<DoglPage>>;
  importDogl(lines: Iterable<string> | AsyncIterable<string>, ctx: CallContext): Promise<Result<ImportReport>>;
}
```

| Function | One sentence | Error contract |
|---|---|---|
| `applyMigrations` | applies `MIGRATIONS` in order, one `transactionSync` each, and sets the module-level refusal on a checksum or version disagreement | `SCHEMA_MISMATCH` · `SCHEMA_NEWER`; never throws |
| `refused` | the refusal every method returns while the schema is wrong | — |
| `transaction` | runs `fn` inside `sql.transactionSync` unless one is already open, in which case it runs `fn` directly | rethrows `fn`'s throw after rollback |
| `write` | the twelve steps of §5.4 | every write-path code of §6 as `refusals`; `VERSION_STALE` as `conflict` |
| `create` · `update` | the two DATA shapes over `write`; `update` resolves `ref` first | as `write`; an unresolvable `ref` is `VALUE_MALFORMED` at `id` |
| `get` | one row by id, `(register, seq)` or spoken id; deleted rows only on request | a bare `#7` is `REGISTER_UNKNOWN` |
| `list` | rows of one register under a **compiled** `where:`, one order key, keyset cursor | none — a bad cursor reads as no cursor |
| `search` | FTS5 phrase search over `entry_fts`, live rows, optional register filter | none |
| `installDeclarations` | new declaration versions, their indexes and counters, the pack row, and the events, in one transaction | `PLAN_STALE` · `UNIQUE_VIOLATION` (an index over duplicates) |
| `retireDeclarations` | sets `retired = 1`, drops the indexes, deletes the pack row when `pack` is given | none |
| `disablePack` | retires a pack's active declarations and any in `alsoDisable`, sets `pack.disabled_at`, keeps every row, in one transaction | `PACK_REQUIRED` · `SCOPES_IN_USE` · `DECLARATION_UNKNOWN` · `PROVIDES_CONFLICT` (the kernel) |
| `enablePack` | reinstalls the declarations the pack went off with, through §5.6, and clears `pack.disabled_at` | the install path's own refusals · `DECLARATION_UNKNOWN` |
| `packConfig` | one pack's declared settings and the value each holds: the chosen one, else the default, else null | `DECLARATION_UNKNOWN` |
| `setPackConfig` | checks each value against the pack's `config:`, stores the chosen values on `pack.manifest`, and writes one `edit` event; reinstalls nothing | `DECLARATION_UNKNOWN` · `REQUIRED_MISSING` · `FIELD_UNKNOWN` · `ENUM_VALUE_UNKNOWN` · `OUT_OF_BOUNDS` · the write path's coercion codes |
| `allocate` | `UPDATE counter … RETURNING next - 1` | `TypeError` outside a transaction |
| `appendEvent` | one row into `event`, redaction applied, the `grant.*` note shape enforced | `TypeError` on a malformed internal call (a defect, not a refusal) |
| `replay` | the original result of a write whose `op_id` was seen | — |
| `observe` | one upsert per `{ kind, subject }` into today's observation row | none |
| `schedule` · `outbox` | insert a queue row inside the open transaction | `TypeError` outside a transaction |
| `purge` | deletes ≤ `limit` (default 100) rows soft-deleted before `cutoff`, each from three stores, one event | none |
| `erase` | tombstones a subject in nineteen stores in one transaction and queues `erase.r2` | `VALUE_MALFORMED` on a subject under three characters |
| `exportDogl` | page 0 refreshes `dog_meta` and `dog_manifest`, then ≤ 1,000 row lines per page | `CHECKSUM_MISMATCH` when the record moved mid-export |
| `importDogl` | verifies format, manifest and signature, then copies every table in one transaction | `IMPORT_NOT_EMPTY` · `FORMAT_NEWER_THAN_READER` · `CHECKSUM_MISMATCH` · `SIGNATURE_INVALID` · `SCHEMA_NEWER` |

**The rule for exceptions.** A refusal is a value, always. The kernel throws only a `TypeError` for a programming
error (an in-transaction helper called outside one; an internal event with a wrong shape), and rethrows a
`SqlError` it does not map — `CONSTRAINT` is mapped to `UNIQUE_VIOLATION`; every other adapter code is a defect
the record's 500 handler reports. Nothing else crosses the boundary.

*(Added September 15th 2026.)* `runActions(execute, { limit?, scheduler? }) → Promise<ActionsRun>` runs one pass
of the scheduled actions with the host's executor. `resumeAction(ingest, actor) → Result<{ ingest, kind }>`
starts a paused one again. `actionOrigins() → string[]` names every https origin an active `pull`, `call` or
`poll` declares. `arrive(arrival, only?)` takes the one declaration a scheduled answer is offered to.

### The types

```ts
export type Json   = null | boolean | number | string | Json[] | { [k: string]: Json };
export type Fields = Record<string, Json>;                          // no key holds null, "" or []
export type Patch  = Record<string, Json | null>;                   // null clears the key; deleted_at is the delete/restore signal
export type EntryRef = { id: string } | { register: string; seq: number } | { spoken: string };

export type Entry = {
  id: string; register: string; seq: number | null; spoken: string | null;   // spoken = seq_prefix + seq, null on a series
  fields: Fields; state: string | null; version: number;
  created_at: string; updated_at: string; deleted_at: string | null;
};

export type WriteContext = {
  ctx: CallContext;
  opId?: string;                          // idempotency key; carried by the write's FIRST event row
  version?: number;                       // compare-and-set for an update; absent = no CAS
  cascade?: boolean;                      // default true. false = a re-entrant rule write: step 9 is skipped
  batch?: string;                         // inherited by re-entrant writes; minted when absent
  mechanism?: `rule:${string}` | `ingest:${string}`;   // the actor of a mechanism write; system principals and the hook only
  hints?: Record<string, 'tag' | 'untag' | 'link'>;     // event kind per field; default edit
  note?: string;                          // ≤ 280 chars; on the create row only
  rules?: RulesHook;                      // step 9; the record passes its engine
};
export type RulesHook = (fired: {
  entry: Entry; before: Entry | null; changed: string[]; batch: string; kernel: Kernel;
}) => void;

export type EventKind = (typeof EVENT_KINDS)[number];               // the forty of 30 §2, as const
export type Event = {
  id: string; ts: string; actor: string; kind: EventKind;
  target: string | null; target_kind: string | null; field: string | null;
  from_v: string | null; to_v: string | null; note: string | null; batch: string | null; op_id: string | null;
};
export type NewEvent = Omit<Event, 'id' | 'ts'>;

export type DeclKind = 'register' | 'page' | 'block' | 'ingest' | 'rule' | 'metric' | 'theme' | 'digest';
export type Declaration = {
  id: string; version: number; kind: DeclKind; pack_id: string | null;
  body: Json; checksum: string; created_at: string;
};
export type RegisterDecl = Declaration & { kind: 'register'; body: RegisterBody };
export type RegisterBody = {                                          // the keys the kernel reads; the schema is spec 42
  register: string; name: string; seq_prefix?: string; series?: boolean; key?: string[];
  fields: FieldDecl[]; search?: string[]; title?: string;
  immutable_when?: Json; delete?: 'refuse_while_referenced';
  pairs?: { on: string[]; opposite: string; across: string; within: string; date?: string; mark: string };
  identity?: { mark: string; accent: string }; predicates?: Record<string, Json>;
};
export type FieldDecl = {
  id: string; type: FieldType; of?: FieldDecl; register?: string; values?: string[]; default?: Json;
  required?: boolean; required_when?: Json; unique?: boolean; immutable?: boolean; index?: boolean;
  min?: number; max?: number; derive?: Json; retired?: boolean; redact?: boolean;
  transitions?: Record<string, { to: string[]; by?: Level; requires?: string[] }>;
  remind?: string[]; repeat?: Repeat;
};
export type Repeat = {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly'; interval?: number;
  byday?: ('MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU')[]; bymonthday?: number[];
  until?: string; count?: number; workday?: 'previous' | 'next' | 'none';
};

export type InstallBatch = {
  declarations: { id: string; kind: DeclKind; body: Json; pack_id: string | null }[];
  pack?: { id: string; version: string; source: string; source_ref: string | null; manifest: Json; checksum: string };
  planVersion?: number;                   // record_version when the plan was made; a difference is PLAN_STALE
};
export type ListQuery = {
  register: string; where?: { sql: string; params: Param[] };      // compile()'s output, 34 §1.11
  order?: { field: string; dir: 'asc' | 'desc' };                  // default { field: 'updated_at', dir: 'desc' }
  limit?: number; cursor?: string | null; includeDeleted?: boolean;
};
export type ScheduleRow = { kind: ScheduleKind; key: string; due_at: string; payload: Json };
export type OutboxRow   = { kind: OutboxKind; payload: Json };
export type EraseRequest = { subjects: string[]; personId?: string; basis: string };
export type EraseReport  = { values: number; stores: Record<string, number>; attachments: number };
export type ExportOptions = { sections?: ('data' | 'origin' | 'governance')[]; redactGrants?: boolean };
export type DoglPage     = { lines: string[]; next: string | null };
export type ImportReport = { tables: number; rows: number; skippedTables: string[]; skippedColumns: string[] };
export type ObservationKind = (typeof OBSERVATION_KINDS)[number];   // nine — 30 §1
export type ScheduleKind    = (typeof SCHEDULE_KINDS)[number];      // ten
export type OutboxKind      = (typeof OUTBOX_KINDS)[number];        // nine
export type Level = 'read' | 'append' | 'write' | 'decide' | 'owner';

// The envelopes of 33 §2 live HERE, because record sits above kernel and both need them (§13 #1).
export type CallContext = {
  principal:
    | { kind: 'person'; id: string; level: Level }
    | { kind: 'token'; id: string; scope: ('read' | 'propose' | 'write')[]; name: string }
    | { kind: 'system' } | { kind: 'spark' };
  session?: { spoken?: string; client_id?: string; host?: string; repo?: string };
  now: number; surface: 'web' | 'mcp' | 'cli' | 'email' | 'webhook' | 'alarm';
};
export type Refusal = { code: string; at: string; found?: unknown; wanted?: string; fix: string };
export type Result<T> =
  | { ok: true; value: T; version: number }
  | { ok: false; refusals: Refusal[] }
  | { ok: false; conflict: { version: number; current: Entry; actor: string } };
export const KERNEL_REFUSAL_CODES: readonly string[];               // the twenty-seven of §6, as const
```

---

## 3 · Files

```
packages/kernel/
├── package.json            @braindog/kernel · private · "exports": { ".": "./src/index.ts" } · zero dependencies
├── src/
│   ├── migrations/0001_kernel.ts   the DDL of 30 §1 plus the seed rows, as one exported string
│   ├── migrations/0002_session.ts  register.session, the kernel's one register, as its canonical bytes
│   ├── migrations/0004_device.ts   device_grant rebuilt: the seventh reach, vault, and its scope
│   ├── migrations/0005_schedule_actions.ts   schedule rebuilt with call and poll: twelve kinds
│   ├── actions.ts                  scheduled actions: fire, prepare, finish, meter, resume; the host passes the executor
│   ├── migrate.ts                  the runner, the checksum, the ledger, schemaState
│   ├── device.ts                   device grants, RFC 8628: start, approve, poll, list, revoke, vaultGrant, the sweep
│   ├── coerce.ts                   the sixteen types → canonical JSON; TEXT_* detection; ULID; spoken ids; derive
│   ├── write.ts                    steps 1–10 and 12a; the actor ladder; validate; transition; pairs; persist
│   ├── events.ts                   appendEvent, the redaction list, JCS values, op_id replay, observe
│   ├── fts.ts                      the projected-text rule; delete + insert by rowid; rebuild
│   ├── schedule.ts                 remind: and repeat: → schedule rows; the range cancel; the queue inserts; the session sweep
│   ├── session.ts                  the session register's envelope, the ladder's reading rungs, staleness
│   ├── dogl.ts                     the canonical projection, manifest refresh, export pages, import
│   ├── erase.ts                    purge and erase
│   └── index.ts                    openRecord, the Kernel object, get/list/search, the declaration cache, the types
└── test/                           §9
```

Ten modules and two migrations, counted. Two over the template's "about eight": `schedule.ts` and `erase.ts` are
each a page of logic with its own test file and share nothing with `write.ts` but a transaction, and `session.ts`
holds what the kernel knows about the one register it declares (§5.4 step 1.4).

| File | Responsibility | Size |
|---|---|---|
| `migrations/0001_kernel.ts` | `export default \`…\`` — the DDL of [30-BLUEPRINT](30-BLUEPRINT.md) §1 **verbatim, cited not restated**, minus `CREATE TABLE migration` (the runner owns it), plus the additions of §5.2. Carries `-- format-bump 1`. A `.ts` module because a package with no build step and no `node:fs` cannot load a `.sql` file (§13 #2) | ~320 lines, mostly DDL |
| `migrate.ts` | `MIGRATIONS` (an ordered array of `{ version, slug, sql }`), `canon()`, `checksum()`, `applyMigrations`, `schemaState` | ~90 |
| `device.ts` | `deviceStart`, `deviceApprove`, `devicePoll`, `deviceList`, `deviceRevoke`, `vaultGrant`, `deviceSweep` over `device_grant`, each taking the token path's deps (SQL, clock, randomness, digest) so it is tested without a kernel; the rules of [12-SECURITY](12-SECURITY.md) §6.1 | ~330 |
| `coerce.ts` | `coerce(field, value) → Json \| Refusal` per type; `isJsonQuoted`, `hasEscapedNewline`; `ulid()`; `spoken()`/`parseSpoken()`; `deriveValue()` for the seven shapes; `instant(ms)` | ~260 |
| `write.ts` | `writeInTxn()` — the numbered steps of §5.4 with their SQL; `resolveActor()`; `validate()`; `transition()`; `pairs()`; `persist()` | ~420 |
| `events.ts` | `appendEvent`, `REDACTED`, `redactedValue()`, `eventRows()` for a write, `replay`, `observe` | ~110 |
| `fts.ts` | `projectedText(decl, fields)`, `project(rowid, entry)`, `rebuildFts()` | ~50 |
| `schedule.ts` | `reminderRows(decl, entry, now)`, `expandRepeat()`, `cancelRange()`, `schedule()`, `outbox()`, `sweepSessions()` (§5.8) | ~200 |
| `actions.ts` | `fireAction`, `prepareAction`, `finishAction`, `meter`, `runActions`, `resumeAction`, `originsOf`, `actionJitterMs`: the scheduled actions of [09-ALARMS](09-ALARMS-AND-NOTIFICATIONS.md) §1, with no network in them; the host passes the executor | ~550 |
| `session.ts` | `sessionDeclaration()`, read from migration 0002's bytes and never retyped; `findSession()`, rungs 1 to 4 of the ladder; `opening()`; `KERNEL_WRITTEN`; `isStale()` at 45 minutes; the `SessionHints` type | ~120 |
| `dogl.ts` | `TABLES` (31 rows: name · section · columns · pk), `projection()`, `refreshManifest()`, `exportDogl()`, `importDogl()`, `verifySig()` | ~300 |
| `erase.ts` | `purge()`, `erase()` — the store list of §5.9 as data | ~150 |
| `index.ts` | `openRecord`, the `Kernel` object literal, `get`/`list`/`search`/`count`, the declaration cache and compiled-lock cache, `transaction()`, the types and closed lists | ~220 |

---

## 4 · Data structures

The stored shapes are the DDL of [30-BLUEPRINT](30-BLUEPRINT.md) §1 and the canonical JSON of
[34-GRAMMARS](34-GRAMMARS.md) §3. What this section adds is the invariants, each a sentence a test checks.

**Rows and fields**

- K1 · `entry.version` increases by exactly one per accepted write of that row. The session heartbeat (§5.4 step 6) is not a write: it changes neither `version` nor `updated_at`.
- K2 · No key in `entry.fields` holds JSON `null`, the empty string or the empty list; step 3 removes them, because [34-GRAMMARS](34-GRAMMARS.md) §1.3 makes all three *missing*.
- K3 · `entry.state` equals `json_extract(fields, '$.state')` on a register that declares a `state` enum, and is `NULL` on every other row.
- K4 · `entry.seq` is `NULL` if and only if the register is `series: true`; every other live row's `seq` is unique within its register.
- K5 · A field with `unique: true` holds a given value on at most one live row of its register — including a derived field, whose value is the only derivation stored.
- K6 · Every `fields` key on a row is a declared, non-derived, non-retired field id, or one of the kernel's `_rule`, `_parent`, `_each`, `_pair`, or a kernel-written field (`last_seen`, an identity accent) — nothing else, ever.
- K7 · Every stored instant is `YYYY-MM-DDTHH:MM:SS.mmmZ`; every day is a valid calendar `YYYY-MM-DD`; every `money.amount` is an integer with `|n| ≤ 2^53 − 1`.
- K8 · A `secret` field's value matches `^g_[0-9A-HJKMNP-TV-Z]{26}$` and names a `grant` row; no other string is ever stored in a `secret` field (§13 #16).

**Counters and ids**

- K9 · `counter.next` never decreases; a number returned by `allocate` is never returned again — including after a purge, an export and an import.
- K10 · `entry.id`, `event.id`, `schedule.id`, `outbox.id` are 26-character Crockford ULIDs; two ids minted in the same millisecond are strictly increasing.

**Events**

- K11 · Every `event.kind` is one of the forty; `event WHERE actor = 'spark' AND kind NOT IN ('suggest','propose','predict')` is empty.
- K12 · An `event.op_id` value appears at most once, and only on the first row a write produces; every other row of the same write carries the same `batch` and a `NULL` `op_id`.
- K13 · A write's event rows share one `batch`; a re-entrant rule write shares its trigger's `batch`.
- K14 · A redacted value is the literal `--redacted--`; an erased value is the literal `--erased--`; `from_v IS NULL` means only that the field had no prior value. `to_v` on an `edit`, `state`, `tag`, `untag` or `link` row is never `NULL` — a cleared field is the four characters `null`.
- K15 · `MAX(event.rowid)` is monotonic and equals the `version` of every `ok` result returned after that write.
- K16 · A `grant.*` event's `note` matches `^g_[0-9A-HJKMNP-TV-Z]{26} (api_token|password|ssh_key|recovery_codes|note)$` — the id and the kind, never a label ([12-SECURITY](12-SECURITY.md) §8).

**Refusals**

- K17 · A refused write leaves no new or changed row in `entry`, `entry_fts`, `entry_vec`, `event`, `schedule` or `outbox`, and exactly one increment in `observation(kind = 'write.refused')`.

**Projection and queues**

- K18 · `entry_fts` holds exactly one row per live, non-series entry whose projected text is non-empty, keyed by that entry's `rowid`; a soft-deleted or purged row has none.
- K19 · For a `day`/`instant` field with `remind:` or `repeat:`, the `pending` reminder rows whose key starts `<id>:<field>:` are exactly the rows §5.4 step 10 derives from the field's current value; a soft-deleted row has none.
- K20 · `entry_vec` never holds an id that `entry` does not.

**Declarations and migrations**

- K21 · A `declaration` row is never deleted; after insert only `superseded_at` (once, `NULL` → instant) and `retired` (once, `0` → `1`) change.
- K22 · Exactly one active `register` declaration per register id; exactly one row with `pack_id = 'kernel'`, and it is `register.session` version 1 unless the owner has superseded it.
- K23 · `MAX(migration.version) = KERNEL_MIGRATION` and each ledger row's checksum equals its module's; otherwise every `Result`-returning method returns the module-level refusal.

**Format**

- K24 · Two exports of a record with no write between them produce identical bytes apart from `dog_sig`; export → import → export produces an identical canonical dump.
- K25 · `dog_manifest` has one row per table in the file except `dog_manifest` and `dog_sig`, and each `sha256` is the SHA-256 of that table's row lines joined by LF.
- K26 · Every `Sql.exec` the kernel issues binds ≤ 24 parameters (the `grant` insert) — under the 100 ceiling by a factor of four; import batches bind ≤ 90.

---

## 5 · Algorithms

Conventions: `now` is `clock.now()` read once per call and formatted `instant(now)`; `?` is a bound parameter; a
`<reg>` or `<f>` inlined into SQL has already matched the identifier grammar; `$.f` paths come from
`where.jsonPath(f)` so the index and the predicate are the same string ([31-STACK](31-STACK.md) §2).

### 5.1 · `openRecord` and the caches

1. `openRecord(sql, clock)` builds the `Kernel` object and loads the declaration cache:
   `SELECT id, version, kind, pack_id, body, checksum, created_at FROM declaration WHERE superseded_at IS NULL AND retired = 0`.
   Bodies are parsed once; registers are indexed by register id and by `seq_prefix`.
2. A compiled lock is cached per `(declaration id, version)` on first use: `compile(body.immutable_when, { subject: 'entry', register, now, tz, scope: { registers: '*' } })`. Temporal literals in a lock resolve at compile time ([34-GRAMMARS](34-GRAMMARS.md) §1.4), so a lock naming `today` is recompiled when the UTC day changes — the cache key carries the day.
3. The cache is rebuilt after `applyMigrations`, `installDeclarations`, `retireDeclarations` and `importDogl`. Nothing else changes declarations.
4. `transaction(fn)`: a depth counter on the object. Depth 0 → `sql.transactionSync(() => { depth++; try { return fn() } finally { depth-- } })`; depth > 0 → `fn()` directly. Every kernel method that writes goes through it, which is what lets the rules hook call `write` again without nesting the driver ([33-CONTRACTS](33-CONTRACTS.md) §1: `nestedTransactions: false`).

### 5.2 · `applyMigrations`

Two migrations. `0001_kernel.ts` exports the DDL of [30-BLUEPRINT](30-BLUEPRINT.md) §1 in the order printed there,
omitting `CREATE TABLE migration`, and ending with these seed statements:

```sql
-- format-bump 1
INSERT INTO dog_meta (key, value) VALUES ('format', '1');
INSERT INTO dog_section (table_name, section) VALUES
  ('record','data'), ('migration','data'), ('counter','data'), ('person','data'), ('entry','data'),
  ('entry_fts','data'), ('entry_vec','data'), ('metric_point','data'), ('schedule','data'), ('outbox','data'),
  ('event','origin'), ('inbox_raw','origin'), ('ingest_receipt','origin'),
  ('pack','governance'), ('declaration','governance'), ('decision','governance'), ('suggestion','governance'),
  ('prediction','governance'), ('grant','governance'), ('vault_key','governance'), ('member','governance'),
  ('token','local'), ('device_grant','local'), ('auth_fail','local'), ('observation','local'), ('job','local'), ('job_event','local'),
  ('dog_meta','header'), ('dog_section','header'), ('dog_manifest','header'), ('dog_sig','header');   -- 31 rows; 25 travel
INSERT INTO counter (name, next) VALUES ('decision', 1), ('suggestion', 1);
```

`0002_session.ts` declares the kernel's one register, [32-PARITY](32-PARITY.md) §2.1, and nothing else. It adds a
row and its indexes and no table, so it carries no format bump:

```sql
UPDATE declaration SET superseded_at = '2026-09-11T00:00:00.000Z' WHERE id = 'register.session' AND superseded_at IS NULL;
INSERT INTO declaration (id, version, kind, pack_id, body, checksum, retired, superseded_at, created_at)
  SELECT 'register.session', coalesce(max(version), 0) + 1, 'register', 'kernel', '<JCS of 32-PARITY §2.1>', '<sha256>', 0, NULL, '2026-09-11T00:00:00.000Z'
  FROM declaration WHERE id = 'register.session';
CREATE UNIQUE INDEX IF NOT EXISTS entry_u_session__client_id ON entry (json_extract(fields, '$.client_id')) WHERE register = 'session' AND deleted_at IS NULL;
-- and entry_i_session__<f> for token_id, agent, project, repo, host, state and last_seen, the same shape
```

The body is written into the migration as its canonical bytes, not built by `jcs` when the module loads: a
migration's checksum is over its text, so SQL assembled by a function would change with the function, and every
record would then refuse to open with `SCHEMA_MISMATCH`. `test/session-register.test.ts` asserts that
`installDeclarations` on a record without the row produces an identical row and identical index names and
statements, so the hand-written copy and the code path cannot drift. The body spells the register's id `id`, the
code's spelling of `register:`, because the declaration cache keys registers on it.

Three details are deliberate. The `UPDATE` and the `coalesce(max(version), 0) + 1` let a record that declared a
`register.session` of its own before this build take the kernel's as that id's next version and keep its rows,
where a plain insert would collide on the primary key and the record would not open. No `seq:session` counter is
seeded: `allocate` creates a register's counter at its first row, and a seeded one would make every new record
look non-empty to an import. And an import replaces the `declaration` table with the file's, so when the file
carries no kernel row, because it was written before migration 2, `importDogl` runs the same two statements;
`notEmpty` does not count the kernel's row as content. `dog_meta`'s other keys (`created_at`, `producer`,
`record_slug`, `tz`, `locale`) are written by export's refresh from the `record` row, not by a migration.

The runner:

1. `execScript('CREATE TABLE IF NOT EXISTS migration (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL, checksum TEXT NOT NULL)')`.
2. `applied = exec('SELECT version, checksum FROM migration ORDER BY version').toArray()`.
3. For every module `m` in `MIGRATIONS`: `sum = hex(await crypto.subtle.digest('SHA-256', utf8(canon(m.sql))))` where `canon` is CRLF → LF, then every line's trailing spaces and tabs stripped ([34-GRAMMARS](34-GRAMMARS.md) §5). The module's `version` must equal its index + 1, else `TypeError` (a mis-numbered file is a defect).
4. For every applied row: no module with that version, or `applied.version > MIGRATIONS.length` → `schemaState.refusal = SCHEMA_NEWER`; a module whose checksum differs → `SCHEMA_MISMATCH`. Return `{ ok: false, refusals: [it] }`. The refusal is module-level: every `Result`-returning method short-circuits on `refused()` until a deploy replaces the code.
5. For every module with `version > MAX(applied)`, in order, one `transactionSync`:
   ```sql
   -- execScript(m.sql)
   INSERT INTO migration (version, applied_at, checksum) VALUES (?, ?, ?);
   -- if m.sql matches /^-- format-bump (\d+)$/m with n = the previous format + 1:
   PRAGMA user_version = <n>;                              -- best effort, §13 #12
   UPDATE record SET format_ver = <n>;                     -- no-op on a record with no row yet
   INSERT INTO dog_meta (key, value) VALUES ('format', '<n>') ON CONFLICT (key) DO UPDATE SET value = excluded.value;
   ```
   `PRAGMA application_id = 1145193761` is issued the same way in the first migration.
6. Reload the declaration cache; return `{ kernel: MIGRATIONS.length, format: FORMAT_VERSION, applied }`.

`0004_device.ts` rebuilds `device_grant` (create `device_grant_next`, copy every row, drop, rename), because
SQLite cannot change a `CHECK` in place: `reach` gains `vault`, seven values, and a nullable `scope` holds a
project row id or `*`. The table is `local` and travels in no file, so there is no format bump. Migration 1's DDL
and [30-BLUEPRINT](30-BLUEPRINT.md) §1 still print the six-value table migration 4 replaces.

The caller runs this from the Durable Object constructor under `blockConcurrencyWhile`, or at self-host open; the
kernel does not know which.

### 5.3 · `allocate(name)`

```sql
INSERT OR IGNORE INTO counter (name, next) VALUES (?, 1);
UPDATE counter SET next = next + 1 WHERE name = ? RETURNING next - 1;
```

Two statements, one transaction, no branch. Names: `seq:<register>`, `decision`, `suggestion`. Called outside a
transaction it throws `TypeError` — an allocation that could commit without its row is how a number goes missing.

### 5.4 · `write(register, id, patch, w)` — the write path

`write` opens `transaction()` and runs `writeInTxn`; a re-entrant call (depth > 0) runs `writeInTxn` directly.
Steps 1–5 read; nothing below step R writes a row until step 6. On a refusal `writeInTxn` returns it as a value —
nothing to roll back — and step R runs.

**0 · REPLAY.** If `w.opId`: `SELECT rowid, target FROM event WHERE op_id = ?`. A hit returns
`{ ok: true, value: get(target), version: rowid }` — the row as it is now, the version as it was (§13 #9).

**1 · RESOLVE.**

1. `decl = register(register)`; none or retired → `REGISTER_UNKNOWN`.
2. The current row. By id: `SELECT rowid, id, register, seq, fields, state, version, created_at, updated_at, deleted_at FROM entry WHERE id = ?`; none → `VALUE_MALFORMED` at `id`. On a `series: true` create, by key — `WHERE register = ? AND json_extract(fields, '$.a') = ? AND json_extract(fields, '$.b') = ?` over the coerced key values (the `entry_k_<reg>` index); a hit turns the create into an update of that row, `deleted_at` cleared (§13 #8).
3. Every `patch` key: `deleted_at` is accepted as the delete/restore signal; another reserved id (`id seq register created_at updated_at version spoken title`) or a `_`-prefixed id → `FIELD_UNKNOWN`, except `_rule`, `_parent`, `_each` when `w.mechanism` starts `rule:` and `w.cascade === false`; an id the declaration lacks → `FIELD_UNKNOWN`; a derived, retired or kernel-written field → `IMMUTABLE_FIELD`. The kernel-written fields are the `session` register's `last_seen`, `project` and `token_id` (`KERNEL_WRITTEN` in `session.ts`), refused from every caller, a person included; the ladder below writes them through `w.stamp`, past this check. A `secret` field, or a `list` of them, is refused the same way and from every caller, because the vault door (after step 12a) is the one write that sets one.
4. The actor, by principal:
   - `person` → `ctx.principal.id` (`p_…`, resolved to a name through the `person` mirror at read — §13 #4).
   - `system` → `w.mechanism ?? 'system'`.
   - `spark` → `FORBIDDEN` (30 §3: Spark never writes a row).
   - `token` → the ladder of [32-PARITY](32-PARITY.md) §2.1, in `session.ts`. `WriteContext` carries it as `principal: { kind: 'token', token }` and `session: SessionHints`; the hints are `spoken` and any of the register's `client_id agent doing repo remote cwd host branch head`. Each reading rung is one indexed read on `register = 'session' AND deleted_at IS NULL`, and the first that answers wins:
     1. `spoken` names a row, `WHERE seq = ?`, whose state is not `done` or `abandoned`: that run gets the heartbeat.
     2. A name that matches nothing, or names a finished run, is dropped and never recorded, and the next rung is tried.
     3. `client_id` → `json_extract(fields,'$.client_id') = ?`, in any state: that run, **re-attached**.
     4. Only when the hints carry no `client_id`: `json_extract(fields,'$.host') = ? AND json_extract(fields,'$.repo') = ? AND state IN ('active','idle') AND json_extract(fields,'$.last_seen') > ?` (now minus 45 minutes), newest `last_seen` first: **adopted**. A caller whose client id matched nothing is a different run, and adopting it would merge two agents working side by side in one checkout.
     5. Otherwise **open one**: a re-entrant `write('session', null, <every hint but spoken>, { actor: 'S<n>', cascade: false, batch, note: 'opened: auto', stamp: { last_seen: now, token_id } })`, where `<n>` is read from `counter` before the row takes it, so the `create` event is authored by the new `S<n>` itself. What the run is doing goes in `doing`, from the hints, as `attach` and `handoff` write it: the plan's `title` is `doing` because `title` is a reserved field id ([32-PARITY](32-PARITY.md) §2.1). `state` takes its default, `active`.

     The rungs read, and nothing is written until every check of the write they serve has passed: `attribute` runs at the head of step 6, so a refused write opens no run, re-attaches none and moves no heartbeat. A run found at rung 1, 3 or 4 in `idle`, `done` or `abandoned` is moved to `active` by a re-entrant `state` write that it signs itself; `handoff` is left as it is, because it is a request waiting for the next run. If opening is refused (a hint the host should have dropped, such as an `agent` outside its enum), the write it serves still goes in under the caller's `actor`, which for a token is `agent:<name>` ([30-BLUEPRINT](30-BLUEPRINT.md) §3), and an observation `write.refused` on `session.<field>:<code>` records the defect. A `session` hint on any principal but a token is ignored: a person in a browser is never a run.
   - A `w.mechanism` on a `token` or `person` principal → `TypeError`: only the record's system paths and the in-transaction hook name a mechanism.

**2 · LOCK.** If `decl.immutable_when`: for an update, `SELECT 1 FROM entry WHERE id = ? AND (<lock.sql>)` with `lock.params`; a row → `ROW_LOCKED`, `found` = the printed predicate. For a create, the same compiled SQL over the candidate:

```sql
SELECT 1 FROM (SELECT ? AS id, ? AS register, NULL AS seq, ? AS fields, ? AS state, 1 AS version,
                      ? AS created_at, ? AS updated_at, NULL AS deleted_at) AS entry
WHERE (<lock.sql>)
```

with `fields` the raw merged candidate — a value the lock misreads is refused one step later by COERCE, so the
design's order costs nothing. The `via:` hop inside `lock.sql` still reads the real `entry` table. Spec 38 must
emit bare column names, never `entry.`-qualified ones (§12).

**2b · PINNED.** Only when the actor is a mechanism — `rule:` or `ingest:` (§13 #5). For each changed field `f`:

```sql
SELECT actor FROM event
WHERE target = ? AND kind IN ('create','edit','state','tag','untag','link')
  AND (field = ? OR (field IS NULL AND json_extract(to_v, ?) IS NOT NULL))     -- ?, ?, '$.f'
ORDER BY rowid DESC LIMIT 1
```

An actor matching `^p_` → `HUMAN_ONLY`. A `create` row's `to_v` is the whole `fields` as JCS, so a field set at
creation by a person pins too; a redacted value inside it is the string `--redacted--`, still non-null.

**3 · COERCE.** `merged = { ...current.fields }`; for each patch key: `null` deletes the key; else `coerce(field, value)`. On a create, every declared field with `default:` and no value takes the default first. On an existing row, a field declared `by: decide` that the patch clears, or whose coerced value differs from the stored one compared as JSON the way `immutable` is, → `FORBIDDEN` from every caller, unless the write carries out an accepted proposal (the `decided` door, after step 12a). Per type ([34-GRAMMARS](34-GRAMMARS.md) §3), the accepted inputs and the canonical output:

| Type | Accepts | Refuses |
|---|---|---|
| `text` · `document` | a string; `document` gets CRLF → LF | first, `VALUE_MALFORMED` with `found` omitted when the text looks like a key (`looksLikeCredential` in `coerce.ts`: an issuer's prefix such as a PEM private-key header, `sk_live_`, `ghp_`, `github_pat_`, `xoxb-` or `AKIA`, a JWT, a webhook address, a password in a URL, or, outside a URL's path, a run of 32 or more base64 characters that mixes cases and digits and reads as random); then `TEXT_JSON_QUOTED` when `s.length ≥ 2 && s[0] === '"' && s.at(-1) === '"'` and `JSON.parse(s)` yields a string; `TEXT_ESCAPED_NEWLINE` when `s.includes('\\n') && !s.includes('\n')` — the two characters backslash, `n`, with no real newline anywhere. Checked in that order; a non-string is `VALUE_MALFORMED` |
| `int` · `duration` | an integer number, or a string matching `^-?\d+$` | non-integer → `VALUE_MALFORMED`; `\|n\| > 2^53 − 1` → `INT_OUT_OF_RANGE` |
| `decimal` | a finite number, or a numeric string | > 15 significant digits in `String(n)` → `VALUE_MALFORMED` |
| `money` | `{ amount, currency }` — `amount` an integer (or integer string), `currency` `^[A-Za-z]{3}$` upper-cased | a non-integer `amount` — a float is the exact bug minor units exist to stop — `minor` instead of `amount`, a missing currency → `VALUE_MALFORMED`; the range rule of `int` |
| `quantity` | `{ value: finite number, unit: non-empty string }` | `VALUE_MALFORMED` |
| `day` | `^\d{4}-\d{2}-\d{2}$` that round-trips through `Date.UTC` | a non-existent date, an instant → `VALUE_MALFORMED` |
| `instant` | RFC 3339 with any offset; output `new Date(s).toISOString()` | unparseable → `VALUE_MALFORMED` |
| `bool` | `true`/`false`, or the strings `'true'`/`'false'` | `VALUE_MALFORMED` |
| `enum` | a string | a non-string → `VALUE_MALFORMED`; membership in `values:` is step 4's `ENUM_VALUE_UNKNOWN` |
| `ref` | a 26-char ULID, or a spoken id resolved through `get` — the target must be a row of the declared register | an unresolvable spoken id → `VALUE_MALFORMED`; a resolved row of another register → `REF_REGISTER_MISMATCH` (step 4) |
| `file` | `{ sha256: /^[0-9a-f]{64}$/, mime: string, bytes: int ≥ 0, name: string }` | `VALUE_MALFORMED` |
| `url` | `new URL(s)` succeeds and `protocol ∈ { 'https:', 'mailto:' }`; stored as `url.href` | `VALUE_MALFORMED` |
| `email` | one `local@domain`, no spaces, one `@`; domain lower-cased | `VALUE_MALFORMED` |
| `secret` | no patch: step 1.3 refuses one, and the vault door sets the grant id itself. `coerce` on its own checks `^g_[0-9A-HJKMNP-TV-Z]{26}$` and `SELECT 1 FROM grant WHERE id = ?` | anything else → `VALUE_MALFORMED` with `found` **omitted** — the value might be the credential itself (§8) |
| `list<T>` | an array; each element coerced as `of:`; a refusal's `at` is `<f>[i]` | a non-array → `VALUE_MALFORMED`; element refusals as T |
| `json` | any JSON | — |

After coercion a value that is `null`, `""` or `[]` removes its key (K2).

**3b · SCOPE.** On a token's write to a register with a `scope:` field (`scope.ts`), after coercion: the run is found by the ladder's reading rungs and nothing is written; a create that leaves a `ref` scope field out takes the run's project; then, on a create or when the patch touched the field, `scopeFault` refuses `FORBIDDEN` for a `widen: person` row created in another project or moved out of its own, and for a `links: true` list that loses a project. A person's and the system's writes skip this step: scope says where a row applies, and levels say who may write it.

**4 · VALIDATE**, in this order, stopping at the first refusal:

1. `required: true` on a non-retired, non-derived field with no value in `merged` → `REQUIRED_MISSING` (on an update, only when the patch touched it or it was already missing — a stale row is not refused for a rule it predates).
2. `required_when: { field, is }`: `is` coerced as `field` and compared with `merged[field]` as JSON; equal, this field missing, and the write a create or one that touched either field → `REQUIRED_MISSING` at this field.
3. `enum` membership — a value, or a `list<enum>` element, outside `values:` → `ENUM_VALUE_UNKNOWN`, `wanted` = the list.
4. `min:`/`max:`, measured by `measure` in `coerce.ts`: UTF-8 bytes for `text`/`document`, the number for `int`/`decimal`/`duration`, `amount` for `money`, `value` for `quantity`; on a create, or a field the patch touched, outside them → `OUT_OF_BOUNDS` at the field, the declared bounds in the sentence. `declare` refuses a bound on `url`/`email`/`json`/`list<T>` as `NOT_IN_THIS_BUILD`, and this build does not yet enforce the default caps (`text` 16,384 bytes, `document` 524,288, `json` 65,536, `url`/`email` 2,048, `list` 1,000 elements) or the whole-`fields` ceiling of 1,048,576 bytes (§13 #14).
5. `immutable: true` — the field had a value on `current` and `merged` differs → `IMMUTABLE_FIELD`.
6. `ref` targets — every changed `ref` and `list<ref>` value, chunked ≤ 64: `SELECT id, register FROM entry WHERE id IN (?, …)`; a row of another register → `REF_REGISTER_MISMATCH`. A missing target is allowed — a reference is soft ([02-DATA-MODEL](02-DATA-MODEL.md) §5).
7. `unique: true` — for every changed unique field, including a derived one computed by `deriveValue` here:
   ```sql
   SELECT seq, id FROM entry WHERE register = ? AND deleted_at IS NULL AND json_extract(fields, '$.f') = ? AND id <> ?
   ```
   A hit on a register with `seq` → `ALREADY_KNOWN`, `found` = its spoken id; on a series → `UNIQUE_VIOLATION`. The partial unique index stays as the backstop: a `CONSTRAINT` from step 6 maps to `UNIQUE_VIOLATION` (§13 #3).
8. `delete: refuse_while_referenced` — when the patch sets `deleted_at` from `NULL`: for every field in every active register declared `ref`/`list<ref>` to this register, `SELECT count(*) AS n FROM entry WHERE register = ? AND deleted_at IS NULL AND json_extract(fields, '$.f') = ?` (a `list<ref>`: `EXISTS (SELECT 1 FROM json_each(json_extract(fields, '$.f')) WHERE value = ?)`); any `n > 0` → `DELETE_WHILE_REFERENCED`, `found` = `{ register, n }` per referrer.
9. The CAS — `w.version !== undefined && w.version !== current.version` → the `conflict` result with `current` and `actor = SELECT actor FROM event WHERE target = ? ORDER BY rowid DESC LIMIT 1`.

**5 · TRANSITION.** Only when a `state` enum is declared and `merged.state !== current?.state` on an update (a create may set any declared value — transitions govern moves, §13 #19). `t = field.transitions?.[from]`; if `t` exists and `to ∉ t.to` → `TRANSITION_ILLEGAL`; `t.by === 'decide'` and the write does not carry out an accepted proposal → `FORBIDDEN` at the state field, whoever asks; a field in `t.requires` missing on `merged` → `REQUIRED_MISSING` at that field. A missing `transitions:` means every move is legal.

**R · OBSERVE.** On any refusal or conflict above:

```sql
INSERT INTO observation (kind, subject, day, n) VALUES ('write.refused', ?, ?, 1)
ON CONFLICT (kind, subject, day) DO UPDATE SET n = n + 1;                -- subject '<register>.<field or ->:<CODE>', day = UTC date
```

At depth 0 the statement runs after the (empty) transaction returns, in autocommit; inside a hook it runs where it
is. The one write a refusal makes ([24-SELF-IMPROVEMENT](24-SELF-IMPROVEMENT.md) §4.2).

**6 · PERSIST.** At its head, after `attribute`: on the vault door's write only, `bindGrant` runs with the run as its actor, rotating the live grant the row's secret field already names or minting one (a revoked one is replaced), and `merged[field]` takes the grant id. A refusal there is returned like any other, and the savepoint the door opened rolls back the run with it.

1. A rule-generated create (`_rule` present): `SELECT id FROM entry WHERE json_extract(fields,'$._rule') = ? AND json_extract(fields,'$._parent') = ? AND json_extract(fields,'$._each') = ?` (the `entry_created_by` index); a hit returns that row `ok` with no event — a re-run is a no-op ([07-INGEST](07-INGEST-AND-RULES.md) §6.1).
2. `seq = decl.series ? null : allocate('seq:' + register)` on a create.
3. Identity accent on a create: `merged[decl.identity.accent] = Math.round(seq * 137.508) % 360` — the golden angle spreads hues without a query; the theme owns contrast (§13 #11). Skipped on a series.
4. Every `derive:` field with `unique: true`: `merged[f] = deriveValue(f, merged)` — the only stored derivation. The seven shapes in JS: `sum` = Σ `(v ?? 0)`; `diff` = a − b; `product` = a × b; `ratio` = `per === 0 ? missing : of / per`; `band` = the value at the first edge `x < e`, else the last; `via` = `SELECT json_extract(fields, ?) FROM entry WHERE id = ?`; `normalise` = `lower(trim(f))` with `\s+` → one space.
5. `state = decl.stateField ? merged.state ?? null : null`.
6. Create:
   ```sql
   INSERT INTO entry (id, register, seq, fields, state, version, created_at, updated_at, deleted_at)
   VALUES (?, ?, ?, ?, ?, 1, ?, ?, NULL) RETURNING rowid;
   ```
   Update:
   ```sql
   UPDATE entry SET fields = ?, state = ?, version = version + 1, updated_at = ?, deleted_at = ?
   WHERE id = ? AND version = ? RETURNING rowid, version;                 -- rowsWritten = 0 → VERSION_STALE, the belt
   ```
   `fields` is the JCS string of `merged`.
7. Heartbeat, written by `attribute` at the head of this step once the ladder has found the run: when the target is not that session row, `UPDATE entry SET fields = json_set(fields, '$.last_seen', ?) WHERE id = ?`, with no version, no `updated_at` and no event (K1, §13 #6). When the target *is* the session row, `last_seen` is set in `merged` beside `w.stamp`, and because it is not in the patch it writes no `edit` row of its own.

**6b · PAIRS.** When `decl.pairs` and `merged[opposite]` is present with `amount ≠ 0` and `_pair` is missing. The candidate predicate is built as a `where:` tree and compiled — the compiler already inlines derived fields:

```
all: [ { field: <opposite>, is: { amount: -a, currency: c } },
       { field: <across>,   not: <this row's across> },
       { field: <date>,     between: [d − within, d + within] },
       …one { field, is } leaf per further `on:` entry… ]
```

```sql
SELECT id, rowid FROM entry
WHERE register = ? AND deleted_at IS NULL AND id <> ? AND json_extract(fields, '$._pair') IS NULL AND (<compiled>)
ORDER BY abs(julianday(json_extract(fields, '$.<date>')) - julianday(?)) ASC, id ASC LIMIT 1
```

`date` is `pairs.date` or the register's sole `day` field (§13 #10). On a hit, unless the partner's `mark` field is
person-pinned under step 2b's query: `UPDATE entry SET fields = json_set(fields, '$._pair', ?, '$.<mark>', json('true')), version = version + 1, updated_at = ? WHERE id = ?` on **both** rows, and one `edit` event per row on `<mark>` (from_v `NULL` or `false`, to_v `true`), sharing the batch. Marked, never hidden; a third equal row finds no unpaired partner and stays unpaired.

**7 · PROJECT.** Not on a series. `DELETE FROM entry_fts WHERE rowid = ?`; then, if `deleted_at IS NULL` and the projected text is non-empty, `INSERT INTO entry_fts (rowid, id, register, text) VALUES (?, ?, ?, ?)`. Projected text: for each `search:` field in declared order, the value (a list joined by one space) with `\s+` collapsed to one space and trimmed; empty values dropped; fields joined by LF.

**8 · EVENT.** `batch = w.batch ?? ulid()`. A create: one row, `kind = 'create'`, `field NULL`, `from_v NULL`, `to_v = jcs(redacted(merged))`, `note = w.note`. An update: one row per changed field in declared order — `kind` = `state` for the state field, `delete`/`restore` for `deleted_at` (field `deleted_at`, `to_v` the instant or `null`), else `w.hints[f] ?? 'edit'`; `from_v = jcs(old)` or `NULL` when absent; `to_v = jcs(new)` (`null` when cleared). Redaction: a field typed `secret` or `money`, or declared `redact: true`, writes `--redacted--` for both values where a value exists (§13 #7). `op_id` on the first row only (K12):

```sql
INSERT INTO event (id, ts, actor, kind, target, target_kind, field, from_v, to_v, note, batch, op_id)
VALUES (?, ?, ?, ?, ?, 'entry', ?, ?, ?, ?, ?, ?) RETURNING rowid;                       -- target 'entry:<id>'
```

**9 · RULES.** `if (w.cascade !== false && w.rules) w.rules({ entry, before, changed, batch, kernel })`. The engine
re-enters `write` with `{ cascade: false, mechanism: 'rule:<id>', batch }`, so a rule's `set` meets steps 2, 2b
and 4 like a human and never reaches step 9 again. Ordering, `≤ 1 set per field` and `once_per` are the engine's
([07-INGEST](07-INGEST-AND-RULES.md) §6; spec 45).

**10 · SCHEDULE.** For each `day`/`instant` field with `remind:` or `repeat:` whose value, or the row's `deleted_at`, changed:

```sql
DELETE FROM schedule WHERE kind = 'reminder' AND state = 'pending' AND key >= ? AND key < ?;   -- '<id>:<f>:' , '<id>:<f>;'
INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES (?, ?, 'reminder', ?, ?, 'pending', 0)
ON CONFLICT (kind, key) DO NOTHING;                                                          -- per derived row
```

`;` is `:` + 1, so the range is an index scan on `(kind, key)` with no `LIKE`. A soft delete cancels the range
`'<id>:'`…`'<id>;'` and inserts nothing. Key `= '<id>:<f>:<at>:<offset>'`, payload
`{ entry, register, field, at, offset }`. `done` rows keep their key, so a date moved away and back does not fire
twice — that is `once_per: [entry, <field>]` ([09-ALARMS](09-ALARMS-AND-NOTIFICATIONS.md) §2) as a unique index.
The derived rows: occurrences × offsets. Occurrences are the value itself, or `expandRepeat` for `repeat:` —
`freq`/`interval`/`byday`/`bymonthday` (negative from month end, clamped)/`until`/`count`, `workday` shifting a
Saturday or Sunday to Friday (`previous`) or Monday (`next`) — from the anchor forward, within `now + 400 days`.
Offsets are `remind:` — `^[+-]?\d{1,4}[hdw]$` — or `[0]` when `repeat:` has no `remind:`. A `day` due is
`<day ± offset>T12:00:00.000Z`, noon UTC, the render rule of [02-DATA-MODEL](02-DATA-MODEL.md) §4; the etiquette
layer owns quiet hours. At most 100 rows per field per write, nearest first (§10).

**12a · OUTBOX.** Rows a hook queued through `kernel.outbox(row)` are already inserted —
`INSERT INTO outbox (id, created, kind, payload, state, attempts) VALUES (?, ?, ?, ?, 'pending', 0)` — inside this transaction. Nothing else is in the step; it is named so the boundary below has a last statement.

**The two doors only the kernel opens.** `write` takes a fifth argument that the kernel's public `write`, `create` and `update` never pass, so nothing a caller fills in can set it. `decided` is set by governance's accept path on the rows an accepted proposal writes, and is the one way a field or a move declared `by: decide` changes. `seal` is set by `depositGrant({ register, ref?, field, fields?, grant }, w)`, the vault door's half in the record. It is INTERNAL and routed nowhere: a host's vault door calls it once it has sealed a key with the key store and dropped the value, handing over the sealed bytes and what they open. It runs this write path under a savepoint, creating the row or updating `ref`, binds the grant at the head of step 6, and returns the row and the grant. So `grant.add` and `create` are both signed by the run, a refusal anywhere rolls back the grant and the run together, and step 8 writes the field as `--redacted--`.

**═ transaction ends ═** `transaction()` returns `{ ok: true, value: entry, version: version() }` — `MAX(event.rowid)` after this write's rows. Then the **caller** — `record` — does **11 · ARM** (`pendingWork().nextDueMs` → `await scheduler.set(min)` on a difference) and **12b · WAKE** (`outboxPending` → `await scheduler.wake()`). Both are async and outside the kernel by construction ([30-BLUEPRINT](30-BLUEPRINT.md) §4).

### 5.5 · Read helpers

- `get`: by id `WHERE id = ?`; by `(register, seq)` `WHERE register = ? AND seq = ?`; by spoken: a prefixed id is resolved against the installed prefixes held by the cache of §5.1: it must start with a register's `seq_prefix` and the rest must be `[1-9][0-9]*`, so `S42` is row 42 of `session`. No single pattern parses it, because `^([A-Z][A-Z0-9]{0,3})([1-9][0-9]*)$` is greedy and reads `S42` as `S4` and 2. One prefix may not overlap another in speech, and install refuses one that does `SEQ_PREFIX_TAKEN` ([34-GRAMMARS](34-GRAMMARS.md) §4), so at most one matches; qualified `^([a-z][a-z0-9_]*)#([1-9][0-9]*)$` → register + seq; `#7` → `REGISTER_UNKNOWN`. `deleted_at IS NULL` unless `includeDeleted`. Nine columns plus `rowid`; `spoken` and `fields` (parsed) are computed.
- `list`: `k` = a kernel column or `json_extract(fields, '$.f')`:
  ```sql
  SELECT rowid, id, register, seq, fields, state, version, created_at, updated_at, deleted_at FROM entry
  WHERE register = ? AND deleted_at IS NULL AND (<where.sql>) AND (<k>, id) < (?, ?)     -- desc; '>' for asc; omitted without a cursor
  ORDER BY <k> DESC, id DESC LIMIT ?                                                       -- limit + 1; the extra row means a next cursor
  ```
  Cursor = base64url of `jcs([lastK, lastId])` ([33-CONTRACTS](33-CONTRACTS.md) §2). `limit` default 25, max 200.
- `search`: operand = `'"' + q.replace(/"/g, '""').replace(/\s+/g, ' ').trim().slice(0, 200) + '"'` — one quoted phrase, no FTS5 syntax reachable ([34-GRAMMARS](34-GRAMMARS.md) §1.2):
  ```sql
  SELECT e.rowid, e.id, … FROM entry_fts f JOIN entry e ON e.rowid = f.rowid
  WHERE entry_fts MATCH ? AND e.deleted_at IS NULL AND f.register IN (?, …)               -- the IN only with registers, ≤ 64
  ORDER BY rank LIMIT ?                                                                    -- max 50
  ```
- `count`: `SELECT count(*) AS n FROM entry WHERE register = ? AND deleted_at IS NULL`.
- `version`: `SELECT coalesce(max(rowid), 0) AS v FROM event`.
- `pendingWork`: `SELECT min(due_at) AS d FROM schedule WHERE state = 'pending'` and `SELECT 1 FROM outbox WHERE state = 'pending' LIMIT 1`.

### 5.6 · `installDeclarations(batch, ctx)`

1. Before the transaction: `checksum_i = hex(sha256(jcs(body_i)))` for every declaration ([34-GRAMMARS](34-GRAMMARS.md) §5). Before that, `validate` refuses a `register.session` that is not migration 0002's bytes under `pack: 'kernel'`, with `PROVIDES_CONFLICT` at `register.session`: the migration is that declaration's one writer, and every agent write resolves to a row of it. The kernel's own bytes pass, and installing them changes nothing.
2. In one `transaction()`:
   1. `batch.planVersion !== undefined && version() !== batch.planVersion` → `PLAN_STALE`.
   2. If `batch.pack`: `INSERT INTO pack (id, version, source, source_ref, manifest, installed_at, checksum) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET version = excluded.version, source = excluded.source, source_ref = excluded.source_ref, manifest = excluded.manifest, installed_at = excluded.installed_at, checksum = excluded.checksum`.
   3. Per declaration: `prior = SELECT version, checksum, body FROM declaration WHERE id = ? AND superseded_at IS NULL AND retired = 0`; `v = prior ? prior.version + 1 : 1`; a prior with the same checksum is skipped (nothing changed).
      ```sql
      UPDATE declaration SET superseded_at = ? WHERE id = ? AND version = ?;                     -- when prior
      INSERT INTO declaration (id, version, kind, pack_id, body, checksum, retired, superseded_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?);
      ```
   4. A `register` declaration: `INSERT OR IGNORE INTO counter (name, next) VALUES ('seq:<reg>', 1)` unless `series`; then the index set — `index: true` → `entry_i_<reg>__<f>` (two for `money`/`quantity`: `$.f.amount`,`$.f.currency` / `$.f.value`,`$.f.unit`), `unique: true` → `entry_u_<reg>__<f>`, `key:` → `entry_k_<reg>`, each exactly the statement of [30-BLUEPRINT](30-BLUEPRINT.md) §1 with `CREATE … IF NOT EXISTS`; indexes the prior version had and this one lacks → `DROP INDEX IF EXISTS`. A unique index over existing duplicates raises `CONSTRAINT` → `UNIQUE_VIOLATION` at `register.<reg>.fields.<f>.unique`, and the transaction rolls back — a validation failure at declaration 6 of 7 leaves nothing behind ([04-PACKS](04-PACKS.md) §3).
   5. One event per declaration: `kind` = `declare` when `pack_id` is null, else `install` for `v = 1` or `upgrade`; `target = 'declaration:<id>'`, `target_kind = 'declaration'`, `from_v` = the prior checksum or `NULL`, `to_v` = the checksum.
3. Rebuild the cache. Return `{ versions }`.

`retireDeclarations`: `UPDATE declaration SET retired = 1 WHERE id = ? AND superseded_at IS NULL AND retired = 0`
per id; drop the register's index families; one `retire` event per declaration; with `pack`: `DELETE FROM pack WHERE id = ?`
and one `uninstall` event, `target = 'pack:<id>'`. Rows are untouched ([04-PACKS](04-PACKS.md) §4).

A batch naming a disabled pack is refused `PACK_DISABLED` at `pack` before step 1, by `installDeclarations` and by
the pack path's staged install alike.

`disablePack(id, { alsoDisable })`: a pack already disabled is a no-op that says so. Otherwise, before any write, with
the set being `id` and every enabled pack in `alsoDisable`: (1) any active declaration of another pack whose body names
a register the set owns (a field's `to:`, any `register.<id>` string), or any enabled `pack` row whose
`manifest.requires.packs` names one of the set → `PACK_REQUIRED` at `alsoDisable`, `allowed` the dependents; (2) when
the set owns the register declaring `scopes:`, any active field outside the set with `scope:` → `SCOPES_IN_USE` at
`register.<reg>.<field>`. Then in one `transaction()`, per pack: `retireDeclarations` over its active ids,
`UPDATE pack SET disabled_at = ?`, and one `retire` event, `target = 'pack:<id>'`, `target_kind = 'pack'`, `from_v` the
pack version, `to_v` the JCS list of retired ids. A declaration belongs to a pack by `pack_id`, or by its body's `pack:`
when the seed installed it without the pack path; such a pack has no `pack` row, that event is then the only record
that it is off, and enabling keeps `pack_id` as it was.

`enablePack(id)`: an enabled pack is a no-op that says so. Otherwise the ids in the last `retire` event's `to_v`, read
back from their retired rows and staged through §5.6 as one batch, so each returns as a new version with the same
checksum (K21: `retired` never goes back to 0); then `UPDATE pack SET disabled_at = NULL` and one `install` event with
`to_v` the same list, all in one transaction; then the cache is rebuilt and derived schedule rows re-armed. The pack's
version and every `entry` row are unchanged. It reads no pack setting: each body comes back exactly as it went off.

**Pack settings** (`declare.ts`, the 2026-09-15 build). `readConfig(config)` checks a manifest's `config:` map: at most
32 keys matching `^[a-z][a-z0-9_]{0,31}$` (`OUT_OF_BOUNDS`, `PACK_MALFORMED`), the sub-keys `type`, `values`, `default`,
`label` and `note` (`FIELD_UNKNOWN`), a type from text, enum, bool, money, day and duration (`CONFIG_TYPE_UNSUPPORTED`
otherwise), an enum's one to 64 distinct values (`VALUE_MALFORMED`), and a default `configValue` accepts. `configValue`
is `coerce` for a field of that type, then enum membership (`ENUM_VALUE_UNKNOWN`) and at most 1024 bytes of text
(`OUT_OF_BOUNDS`). `fillConfig` replaces each `{{config:<key>}}` in a body, and `validate` refuses `FIELD_UNKNOWN` at
the placeholder for a body that still carries one, so only the pack path, which fills them, installs such a body.

`setPackConfig(id, values)`: the pack must be known (`DECLARATION_UNKNOWN`); `values` is a non-empty map
(`REQUIRED_MISSING`) of declared keys (`FIELD_UNKNOWN`, `allowed` the declared keys); each value passes `configValue`,
and `null` removes the chosen value so the default applies. When something changed, one `transaction()` rewrites
`pack.manifest.config_values` and inserts one `edit` event, `target = 'pack:<id>'`, `target_kind = 'pack'`, `from_v` and
`to_v` the JCS of the changed settings' values before and after. No declaration is touched: a setting is read only
when the pack document is next planned and installed. `packSettings()` returns the chosen values by pack id, which
the record hands a plan as `Installed.config`.

### 5.7 · `appendEvent` · `observe`

`appendEvent(e)`: `id = ulid()`, `ts = instant(now)`; a `grant.*` kind whose `note` fails K16 → `TypeError`; a `note`
kind without a note, or any note over 280 characters → `TypeError` (the record validated the DATA call; this is a
defect). The INSERT of step 8, `RETURNING rowid`. `observe(batch)`: one upsert per element, the SQL of step R with
the given `kind`, inside `transaction()`.

### 5.8 · `purge(cutoff, { limit = 100 })`

One `transaction()`:

```sql
SELECT id, rowid FROM entry WHERE deleted_at IS NOT NULL AND deleted_at < ? ORDER BY deleted_at LIMIT ?;   -- limit + 1
-- per row:
DELETE FROM entry_vec WHERE id = ?;
DELETE FROM entry_fts WHERE rowid = ?;
DELETE FROM schedule WHERE kind = 'reminder' AND state = 'pending' AND key >= ? AND key < ?;               -- '<id>:', '<id>;'
DELETE FROM entry WHERE id = ?;
-- once:
DELETE FROM observation WHERE day < ?;                                                                    -- today − 400 days, 24 §4.2
INSERT INTO event (…) VALUES (…, 'system', 'purge', NULL, NULL, NULL, NULL, NULL, 'purged <n> rows deleted before <cutoff>', ?, NULL);
```

`event` rows are kept; `counter` is untouched, so a purged number is never reissued (K9). Returns
`{ purged: n, remaining: rows.length > limit }`; the caller re-arms to `now` while `remaining`.

**The session sweep** runs in the same hourly `purge` row, after the rows above: `sweepSessions` in `schedule.ts`
takes every `session` row in `active` or `idle` whose `coalesce(json_extract(fields,'$.last_seen'), updated_at)` is
more than twelve hours old, at most 100, and moves it to `abandoned` through a re-entrant write as `system`, with
`note: 'Nothing heard from this run in twelve hours.'`, so each is an ordinary `state` event. `handoff` is skipped,
because it is a request waiting for the next run. `done` is never written, because a run that crashes never marks
itself dead, and the sweep knows only that it went quiet, not that its work finished. Staleness at 45 minutes is
never stored: `isStale` derives it at read. The `purge` method runs the same function and adds the count as
`sessions`.

### 5.9 · `erase({ subjects, personId?, basis }, ctx)`

Every `subject` is lower-cased in JS and matched as an ASCII-case-folded substring, `instr(lower(col), ?) > 0`; a
subject under three characters is `VALUE_MALFORMED` (it would erase the record). One `transaction()` over nineteen
stores — the sixteen of [02-DATA-MODEL](02-DATA-MODEL.md) §10 plus `person`, `job` and `job_event` (§13 #15):

| Store | Statement |
|---|---|
| `entry` | `SELECT rowid, id, register, fields, deleted_at FROM entry WHERE instr(lower(fields), ?) > 0`; in JS every string value (including list elements and document text) containing the subject becomes `--erased--`; then `UPDATE entry SET fields = ?, version = version + 1, updated_at = ? WHERE id = ?`; `DELETE FROM entry_fts WHERE rowid = ?` and re-project (step 7); `DELETE FROM entry_vec WHERE id = ?`; the `sha256` of every `file` value on a touched row is collected |
| `event` | `UPDATE event SET from_v = '--erased--' WHERE from_v IS NOT NULL AND instr(lower(from_v), ?) > 0`; the same for `to_v` and `note` |
| `inbox_raw` | `UPDATE inbox_raw SET body = NULL, headers = NULL, reason = '--erased--', state = 'erased' WHERE instr(lower(coalesce(body,'') \|\| coalesce(headers,'')), ?) > 0` |
| `ingest_receipt` | no column can hold a subject (`wrote` is entry ids); listed so the count of stores is honest |
| `decision` | `UPDATE decision SET reason = '--erased--' WHERE instr(lower(reason), ?) > 0`; `question` and `answer` likewise, each its own statement |
| `suggestion` · `prediction` · `grant` · `device_grant` | `body` · `claim` · `label` and `hint` · `label` and `ua` → `--erased--` where matched |
| `schedule` · `outbox` | `UPDATE schedule SET state = 'done', payload = '--erased--' WHERE state = 'pending' AND instr(lower(payload), ?) > 0`; outbox likewise over `state IN ('pending','leased','failed')` — cancelled, and `done` is the state that never fires (§13 #15) |
| `observation` | `DELETE FROM observation WHERE instr(lower(subject), ?) > 0` |
| `person` | `UPDATE person SET email = '--erased--', name = '--erased--' WHERE id = ? OR instr(lower(coalesce(email,'') \|\| coalesce(name,'')), ?) > 0` |
| `member` | with `personId`: `DELETE FROM member WHERE person_id = ? RETURNING register, level`; one `access.revoke` event per row (`target = 'member:<personId>'`, `from_v` the level, `to_v NULL`, `note = basis`) |
| `job` · `job_event` | `args`, `result`, `error` · `body` → `--erased--` where matched |
| `metric_point` | out of scope, stated: aggregates name nobody |

Then `INSERT INTO outbox (…, 'erase.r2', '{"keys":[…]}', 'pending', 0)` when any `sha256` was collected — the
attachments are erased within the outbox lease window, not in this transaction ([02-DATA-MODEL](02-DATA-MODEL.md) §10);
and one `erase` event by the caller's actor whose note is
`erased <values> values in <stores> stores; subject sha256:<first 16 hex of SHA-256(subject)>; basis: <basis>` —
the subject itself is never written again (§13 #15). Returns `{ values, stores, attachments }`.

### 5.10 · `exportDogl(cursor, opts)` — the `.dogl` stream

**The line format** (§13 #4). LF-terminated lines, UTF-8, no BOM:

```
#dogl 1                                          ← the format revision, FORMAT_VERSION
#table dog_meta key,value                        ← a table header: name, then the columns in DDL order
["created_at","2026-08-31T15:04:11.000Z"]        ← one JCS array per row, columns in header order
…
#table entry id,register,seq,fields,state,version,created_at,updated_at,deleted_at
["01J…","obligations",7,"{\"amount\":…}","open",3,"2026-…","2026-…",null]
…
#table dog_sig alg,key_id,public_key,sig,signed_at   ← always the last header; the kernel writes no row under it
```

A line starting `#` is structure; every other line starts `[`. Values: `NULL` → `null`, INTEGER → number, REAL → JCS number, TEXT → string, BLOB → `{"b64":"<RFC 4648 §4, padded>"}` ([34-GRAMMARS](34-GRAMMARS.md) §5). A table's row lines joined by LF are exactly its canonical projection — so `dog_manifest.sha256` is checkable with `sed`, `sha256sum` and nothing else.

**Table order.** Header first, then sections: `dog_meta`, `dog_section`, `dog_manifest`; the `data` tables; `origin`; `governance`; and `dog_sig` last so the signer appends one line ([33-CONTRACTS](33-CONTRACTS.md) §9: the Worker or the CLI signs). Within a section the order of `TABLES` — the DDL order of [30-BLUEPRINT](30-BLUEPRINT.md) §1. `local` never travels; `opts.sections` narrows the three middle sections; the header always travels.

**Rows are ordered by primary key**, columns in DDL order: `SELECT <cols> FROM <T> ORDER BY <pk>`; `entry_fts` (no PK) by `id`; `dog_sig` by `key_id`; `metric_point` by `(series, grain, at)`.

**Page 0 — refresh.** `cursor === null`:

1. For every table to be exported except `dog_manifest` and `dog_sig`: `lines = projection(T)` (synchronous, full read); `rows = lines.length`; `sha = hex(await sha256(utf8(lines.join('\n'))))` — the empty table hashes the empty string. `grant` under `redactGrants` projects `ciphertext`, `nonce`, `prev_ciphertext`, `prev_nonce` as `null` before hashing, so the manifest matches the file.
2. One `transaction()`:
   ```sql
   DELETE FROM dog_manifest;  INSERT INTO dog_manifest (table_name, rows, sha256) VALUES (?, ?, ?);   -- per table, ≤ 23 rows
   DELETE FROM dog_sig;
   INSERT INTO dog_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value;
     -- format = FORMAT_VERSION; created_at, record_slug, tz, locale from the record row; producer = 'braindog kernel <KERNEL_MIGRATION>'
   ```
   No `exported_at` — that is `dog_sig.signed_at`, so an unchanged record exports identical bytes (K24).
3. `v0 = version()`; the first cursor is `{ t: 0, after: null, v: v0 }`, base64url of its JCS.

**Every page.** `version() !== cursor.v` → `CHECKSUM_MISMATCH` (the manifest no longer describes the rows; fix: export again). Else emit up to 1,000 row lines: `#dogl 1` on the very first line; at each table start its `#table` header;

```sql
SELECT <cols> FROM <T> WHERE (<pk>) > (?, …) ORDER BY <pk> LIMIT 1000        -- the row-value form; a single-column pk is pk > ?
```

`after` is the last row's pk values. When a table is exhausted, `t + 1`; after `dog_sig`'s header, `next = null`.

### 5.11 · `importDogl(lines, ctx)` — into an empty record only

1. **Empty?** `SELECT count(*) FROM entry` · `event` · `pack` · `decision` · `suggestion` · `grant`, and `SELECT count(*) FROM declaration WHERE pack_id IS NOT 'kernel'` — any non-zero → `IMPORT_NOT_EMPTY`. A `record` row, the owner's `person`/`member` rows and `register.session` may exist: import replaces them.
2. **Read everything into memory** — header, then per table its row lines — verifying as it goes: line 1 must be `#dogl <n>`; `n > FORMAT_VERSION` → `FORMAT_NEWER_THAN_READER`; `n < FORMAT_VERSION` → upgrade on import (none exists at v1). An unknown table name is skipped and reported; a column the reader lacks is dropped and reported; a column the file lacks takes the DDL default — the additive rule of [03-DOG-FORMAT](03-DOG-FORMAT.md) §7. Each table's `sha256(lines.join('\n'))` (awaited) must equal its `dog_manifest` row → `CHECKSUM_MISMATCH` naming the table; a table in the file with no manifest row, or a manifest row for a table missing from the file whose `dog_section` is not `local`, is the same refusal.
3. **Signature.** `dog_sig` has one row: `crypto.subtle.verify({ name: 'Ed25519' }, importKey(public_key), sig, utf8(projection(dog_manifest ordered by table_name)))` → false, or no row → `SIGNATURE_INVALID`. The embedded key proves integrity; origin is `braindog verify --key`'s job.
4. **Kernel version.** The file's `migration` rows: `MAX(version) > KERNEL_MIGRATION` → `SCHEMA_NEWER`; the rows are not copied — the reader's ledger stands.
5. **Write**, one `transaction()`: for every table except `entry_fts`, `migration`, `dog_manifest`, `dog_sig`:
   ```sql
   INSERT OR REPLACE INTO <T> (<known cols>) VALUES (?, …), (?, …), …      -- rows × cols ≤ 90 and rows ≤ 30 per statement
   ```
   A BLOB arrives as `{"b64"}` and is bound as `Uint8Array`; `null` as `NULL`. Then `rebuildFts()` — `DELETE FROM entry_fts` and one INSERT per live non-series row with non-empty projected text — and one `import` event: actor from `ctx`, `note = 'imported <rows> rows in <tables> tables from <file record id>'`. `event` rows keep their original actors and ids: this is a copy, not a replay.
6. Rebuild the declaration cache; return the report. A refused import writes nothing (steps 1–4 read only), so the record is still empty and the fix is to retry with a good file.

`.dog` files are not read here: the CLI and the self-host turn a `.dog` into `.dogl` lines with their real SQLite
and hand the lines over ([03-DOG-FORMAT](03-DOG-FORMAT.md) §2, ADR-034).

---

## 6 · Refusals and errors

Twenty-seven codes, all from [30-BLUEPRINT](30-BLUEPRINT.md) §6 plus the one this spec adds (`VALUE_MALFORMED`, §13 #13). `at` is
`register.<reg>.<field>` for a field, `register.<reg>#<seq>` for a row, `id` for an unresolvable reference, the
table name for the format codes. `fix` is one imperative sentence; the values in angle brackets are filled at write.

| Code | Where | Trigger | `fix` |
|---|---|---|---|
| `REGISTER_UNKNOWN` | 1 · `get` | no active `register.<reg>`; a bare `#7` | "Install a pack that declares register.<reg>, or check the id." · "Say which register: tasks#7." |
| `FIELD_UNKNOWN` | 1 | a key the declaration lacks; a reserved or `_` id from the boundary | "register.<reg> declares <a, b, c>; remove '<f>' or add it to the declaration." · "'<f>' is the kernel's; leave it out." |
| `FORBIDDEN` | 1 | `principal.kind = 'spark'` on a write | "Spark proposes; it never writes a row. Use propose." |
| `ROW_LOCKED` | 2 | `immutable_when:` matches the current row, or the create | "This row matches immutable_when — <clause>. Change what the clause reads, or write a new row." |
| `HUMAN_ONLY` | 2b | a `rule:`/`ingest:` actor on a field a person last set | "A person set <f> on <ts>; a rule or ingest may not overwrite it. Leave it, or ask them." |
| `TEXT_JSON_QUOTED` | 3 | a string wrapped in its own JSON quotes | "Send the string itself, not its JSON encoding: strip the outer quotes." |
| `TEXT_ESCAPED_NEWLINE` | 3 | the characters `\n` and no real newline | "Send a real newline (U+000A), not the two characters backslash-n." |
| `INT_OUT_OF_RANGE` | 3 | `\|n\| > 2^53 − 1` on int, duration, amount | "Integers must fit 53 bits (±9,007,199,254,740,991); store a larger figure as text." |
| `VALUE_MALFORMED` | 3 · 1 · erase | a value that is not the type's shape and cannot be coerced; an unresolvable id or spoken ref; a `secret` that is not a grant id (`found` omitted); an erase subject under three characters | "A <type> is <shape from 34 §3>." · "No row <ref> in register.<reg>." · "A secret field holds a grant id; bind the credential in the vault first." |
| `REQUIRED_MISSING` | 4 · 5 | a required field missing; `required_when:` true and missing; `requires:` on the entered state | "Set <f>." · "<f> is required when <leaf>." · "Entering <state> requires <f, g>." |
| `ENUM_VALUE_UNKNOWN` | 4 | a value outside `values:` | "One of: <values>." |
| `OUT_OF_BOUNDS` | 4 | outside `min:`/`max:` or a default cap | "<f> takes <min>–<max> <bytes\|elements\|units>; found <n>." |
| `IMMUTABLE_FIELD` | 4 · 1 | `immutable: true` changed; a derived, retired or kernel-written field written | "<f> is set once, on create; write a new row." · "<f> is computed from <derive>; write its inputs." · "<f> is retired; add a new field." |
| `UNIQUE_VIOLATION` | 4 · 6 · install | a duplicate on a series; the index backstop; an index over existing duplicates | "Another live row of register.<reg> already holds this <f>." · "<n> rows already share a <f>; fix them before declaring unique." |
| `ALREADY_KNOWN` | 4 | a duplicate on a register with `seq`; `found` = the spoken id | "<spoken> already holds this <f>. Update it instead." |
| `REF_REGISTER_MISMATCH` | 4 | a `ref` whose target is a row of another register | "<f> refers to register.<a>; <id> is a row of register.<b>." |
| `DELETE_WHILE_REFERENCED` | 4 | `delete: refuse_while_referenced` and referrers exist | "<n> rows in register.<r> refer to this row. Archive it, or repoint them." |
| `VERSION_STALE` | 4 | `w.version ≠ entry.version` — the `conflict` shape, HTTP 409 | "Re-read the row and re-apply your change; <actor> changed it." |
| `LEVEL_REQUIRED` | 5 | a transition's `by:` not held; every token | "Moving <from> → <to> needs a person at level <by>." |
| `TRANSITION_ILLEGAL` | 5 | `to ∉ transitions[from].to` | "state cannot move <from> → <to>; legal from <from>: <list>." |
| `PLAN_STALE` | install | `version() ≠ planVersion` | "The record changed since this plan was made; plan again." |
| `FORMAT_NEWER_THAN_READER` | import | `#dogl n` with `n > FORMAT_VERSION` | "This file is format <n>; this build reads <m>. Update BrainDog." |
| `CHECKSUM_MISMATCH` | import · export | a table's hash ≠ its manifest row; the record moved between pages | "<table>: the file's rows do not match its manifest; re-export from the source." · "The record changed during export; export again." |
| `SIGNATURE_INVALID` | import | no `dog_sig` row, or Ed25519 fails | "The manifest signature does not verify; re-export, and check the key with braindog verify." |
| `IMPORT_NOT_EMPTY` | import | rows exist | "Import into a new record." |
| `SCHEMA_MISMATCH` | migrations — every method, 503 | a ledger checksum ≠ the module's | "Deploy the build whose migration <n> has checksum <x…>, or restore." |
| `SCHEMA_NEWER` | migrations · import — 503 | the ledger, or the file, is past `KERNEL_MIGRATION` | "This record was migrated to <n>; this build knows <m>. Deploy a newer build." |

`SqlError` mapping: `CONSTRAINT` → `UNIQUE_VIOLATION` at the field the statement was about (steps 6 and install
know which). Every other adapter code is rethrown. Fixtures: `fixtures/refusals/<kebab-case>.yaml`, one per code,
run by §9.

---

## 7 · Performance budget

Measured on `node:sqlite` `:memory:` through `@braindog/ports`' adapter, Node 24.13.0, in `test/bench.test.ts`:
200 warm-up calls, then 2,000 timed with `performance.now()`; the test prints p50/p95 and **asserts** the CI column,
which is three times the budget so a noisy runner does not fail the build. The fixture register: 8 fields, 3 partial
indexes, one `day` with `remind: [-30d, -7d, -1d]`, 10,000 live rows, no rules hook.

| Measure | Budget | CI assertion | How |
|---|---|---|---|
| `update`, one text field | p50 ≤ 2 ms · p95 ≤ 5 ms | p95 ≤ 15 ms | bench, above |
| `create`, three reminders | p95 ≤ 8 ms | p95 ≤ 24 ms | bench |
| `write` refused at step 4 | p95 ≤ 1 ms | ≤ 3 ms | bench |
| `get` by spoken id | p95 ≤ 0.3 ms | ≤ 1 ms | bench |
| `search`, one phrase, 10k rows | p95 ≤ 5 ms | ≤ 15 ms | bench |
| `exportDogl` throughput | ≥ 20,000 row lines/s | ≥ 7,000 | 100k-row fixture, all pages |
| manifest refresh | ≤ 1.5 s per 100k rows | ≤ 4.5 s | same run, page 0 alone |
| `importDogl` | ≥ 10,000 rows/s | ≥ 3,500 | the exported fixture |
| `erase`, one subject | ≤ 1 s per 1M `event` rows | informational | 1M-row synthetic |
| page size | 1,000 row lines | — | [33-CONTRACTS](33-CONTRACTS.md) §9 |
| import statement | rows × columns ≤ 90, rows ≤ 30 | asserted per statement | `entry` 10 rows · `event` 7 · `grant` 3 · 3-column tables 30 |
| parameters per kernel statement | ≤ 24 (`grant` insert); `IN` chunks ≤ 64 | a test walks every SQL literal in `src/` | the 100 ceiling, four times over |
| statement length | ≤ 4 KB except a compiled `where:` | asserted | 100,000-byte ceiling |
| reminder rows per field per write | ≤ 100, horizon 400 days | unit | §10 |
| purge batch | 100 rows per call | unit | 09 §1's alarm batch |
| `fields` per row | ≤ 1 MB JCS; `document` ≤ 512 KB | `OUT_OF_BOUNDS` | 2 MB row ceiling |
| declaration cache | rebuilt on install only; O(registers) | — | 64 registers max |

Complexity where it matters: a write is O(changed fields + declared indexes + reminders); PINNED is one indexed
read per changed field for mechanism actors only; `delete: refuse_while_referenced` is one indexed count per
referring field, a scan where the referrer has no `index: true` (stated in the declaration's install diff — spec 42);
`pairs` is one indexed probe; erase and refresh are full scans by design.

---

## 8 · Security

**Boundaries crossed.** `record` → kernel (trusted `ctx`, untrusted `patch`); kernel → `Sql` (every value bound;
identifiers inlined only after the grammar check); kernel ↔ the rules hook (in-transaction, trusted code, its
writes re-enter the checks); export → the world (sealed grants, no `local` table); import → the record (verified
before the first row lands).

**What the kernel refuses to see.** A `secret` field holds a grant id and nothing else (K8): a value that does not
match `^g_[0-9A-HJKMNP-TV-Z]{26}$` is refused with `found` omitted from the refusal and from the log line, because
the value may be the credential the caller meant to bind. `grant.ciphertext` is bytes the kernel copies; there is
no decrypt, no `KeyStore`, no key material anywhere in the package ([ADR-062](16-DECISIONS.md)). `vault_key` and
`grant` are stored and exported sealed ([12-SECURITY](12-SECURITY.md) §6); `--redact-grants` nulls the four
ciphertext columns before the manifest is computed, so a redacted file verifies.

**What it logs.** The kernel emits no log lines of its own; it returns codes. A host that logs a refusal logs
`code`, `at`, the register and the id — never `found`, never a field value, never a payload
([12-SECURITY](12-SECURITY.md) §8, [35-SPEC-OVERVIEW](35-SPEC-OVERVIEW.md) §2). The `secret-grep` gate walks
`src/` for any template that could interpolate a value into a string that leaves the package.

**The redaction list** ([20-COLLABORATION](20-COLLABORATION.md) §8): by type — every `secret`, every `money`; by
declaration — a field with `redact: true`; by shape — a `grant.*` event's `note` is the id and the kind, enforced
by K16. Redaction happens at step 8, before the INSERT, so the number is never in `event`, the export or a backup.
An erase writes `--erased--` retroactively and records a hash of the subject, never the subject.

**Actors are derived, never supplied.** `ctx` carries no actor string; the ladder of step 1 derives it; a
`mechanism` override is accepted only from a `system` principal or the in-transaction hook, and a `TypeError` —
not a refusal — meets any other caller, because that is a defect in the record, not a request to answer.

**Injection.** Register and field ids enter SQL text only via `where.jsonPath` and the index-name templates,
after `^[a-z][a-z0-9_]{0,31}$`; every other value, including the `MATCH` phrase, is a bound parameter; string
literals in emitted SQL are single-quoted (`node:sqlite` reads a double-quoted one as an identifier).

**Nothing is deleted that must not be.** `event` has no foreign key and is touched only by erase's tombstones;
`counter` only increases; `declaration` rows are never deleted; the `pack` row is the one deletion uninstall makes.

---

## 9 · Tests and gates

`node:test` + `node:assert/strict`, `test/**/*.test.ts`, against the `node:sqlite` adapter of `@braindog/ports`
(spec 37) on `:memory:`, with an injected `Clock` and a seeded ULID randomness source. Every test opens a fresh
record: `applyMigrations`, then the fixture declarations through `installDeclarations`.

**Refusal fixtures** — `test/refusals.test.ts` reads `fixtures/refusals/<code>.yaml`
(`{ code, setup: { declarations, rows }, call: { method, args }, expect: { code, at } }`) for the twenty-seven codes
of §6 and asserts the code and `at`; the `refusal-fixtures` gate ([33-CONTRACTS](33-CONTRACTS.md) §8) asserts every
code in `KERNEL_REFUSAL_CODES` has a file and every file a code.

**Write-path ordering** — `test/write.test.ts`, input → expected:

| Case | Input | Expected |
|---|---|---|
| lock beats a rule | `postings` with `immutable_when: { field: state, is: posted }`; a posted row; a rules hook whose `set` targets it | the hook's `write` returns `ROW_LOCKED`; the outer write is `ok`; the row has one event, the trigger's |
| lock on create | a create whose candidate matches the lock | `ROW_LOCKED`; `SELECT count(*) FROM entry` unchanged |
| pinned survives a re-sync | a person sets `category`; an `ingest:x` write patches `category` | `HUMAN_ONLY`; a `system` write to the same field is `ok` |
| create rows are validated | a hook `create` into `skus` with an unknown enum value | the generated row is `ENUM_VALUE_UNKNOWN`; the trigger row commits |
| no cascade | a rule creates a row into a register with its own rule | the generated row has no rule-authored event; the hook was called once |
| a moved date cancels the old reminder | `renews: 2026-10-01`, `remind: [-30d]`; update to `2026-11-01` | one pending `reminder`, `due_at = 2026-10-02T12:00:00.000Z`; the `09-01` row is gone |
| once_per over a moved-back date | fire the `-30d` row (`state = 'done'`), move the date away and back | the `done` row stays; no second pending row for that `at` |
| a refused write leaves one observation | a `REQUIRED_MISSING` create | `entry`, `event`, `schedule`, `entry_fts` counts unchanged; `observation('write.refused','obligations.amount:REQUIRED_MISSING', today).n = 1`; a second attempt makes it 2 |
| state is mirrored and checked | `transitions: { draft: { to: [posted], requires: [date] } }`; `draft → void` · `draft → posted` without `date` · with `date` | `TRANSITION_ILLEGAL` · `REQUIRED_MISSING` · `ok` and `entry.state = 'posted'` with one `state` event |
| `by:` needs a person | `proposed → active, by: decide` from a `write` token · from a `decide` person | `LEVEL_REQUIRED` · `ok` |
| CAS | two updates with the same `version` | second is `conflict` with `current.version = n + 1` and the first writer's actor; `observation` incremented |
| unique names the row | `client_id` unique; a second session with the same id | `ALREADY_KNOWN` at `client_id`, whose sentence names `S1`; `Refusal` has no `found` key, so the spoken id travels in `fix` |
| unique on a series | `key: [campaign, channel, day]`; a second create with the same key | the first row updated in place, `version = 2`, one row total |
| the only stored derivation | `fingerprint: derive normalise(lesson), unique` | `fields.fingerprint` is `lower(trim(lesson))`; a second row with the same normalised text is `ALREADY_KNOWN` |
| text corruption refused | `'"hello"'` · `'a\\nb'` (no U+000A) · `'a\nb'` | `TEXT_JSON_QUOTED` · `TEXT_ESCAPED_NEWLINE` · `ok` |
| nulls never stored | `{ note: null, tags: [], what: '' }` | none of the three keys is in `fields`; `from_v` on the `note` edit is the prior JCS, `to_v = 'null'` |
| money is redacted | update `amount` | the `edit` row has `from_v = to_v = '--redacted--'`; a create's `to_v` JSON has `"amount":"--redacted--"` |
| the heartbeat is not a write | a token write from `S3` to `tasks#1` | the session row's `last_seen` = now, `version` unchanged, no new event for it |
| the ladder opens a session | a token write with no `session` block | a `session` row exists; its `create` event's actor is its own `S<n>` and `note = 'opened: auto'`; the task's event actor is `S<n>` |
| identity accent | `identity: { accent: hue }`, three creates | hues `138, 275, 53`; a fourth write patching `hue` → `IMMUTABLE_FIELD` |
| pairs | two transactions, `−1000 EGP`/`+1000 EGP`, different accounts, 2 days apart; a third `+1000 EGP` | the first two carry `moved: true` and each other's id in `_pair`; the third is unmarked |
| delete while referenced | `accounts` with `delete: refuse_while_referenced`; one transaction referring | `DELETE_WHILE_REFERENCED`, `found = [{ register: 'transactions', n: 1 }]`; after deleting the transaction, `ok` |
| deleted rows leave the index | soft-delete a row, then `search` its title · restore it | no hit · a hit |

**Counters, events, replay** — `test/events.test.ts`: `allocate` returns 1, 2, 3; purge the row with `seq 3`;
the next create is `seq 4` (never reissues). `op_id` replay: the same `opId` twice returns the same `id`, `seq`
and `version`, and `SELECT count(*) FROM event WHERE op_id = ?` is 1. A three-field update writes three rows with
one `batch` and `op_id` on the first only. `event WHERE actor='spark'` is empty over every fixture (the `spark-actor`
gate); a `spark` principal on `write` is `FORBIDDEN`. The `event.kind` CHECK has forty members and `EVENT_KINDS.length === 40`
(the `event-kinds` gate); every `CHECK (… IN (…))` in `0001_kernel.ts` matches its `as const` list (`closed-lists`).

**Erase** — `test/erase.test.ts`: a person named in a task title, an event note, a decision reason, an inbox body,
an observation subject, a pending reminder payload and a `grant.label`; `erase({ subjects: ['Amina Farouk'], personId })`
→ every one reads `--erased--` (or is gone: observation, member), the FTS search for the name returns nothing,
`entry_vec` has no row for the task, one `erase.r2` outbox row lists the task's `file` sha256, one `erase` event
whose note contains `sha256:` and not the name, `member` rows gone with one `access.revoke` each. `erase({ subjects: ['am'] })` → `VALUE_MALFORMED`.

**Format** — `test/dogl.test.ts`: export → import into a fresh record → export: the two `.dogl` streams are
byte-identical ignoring the `dog_sig` block (the `dog-roundtrip` gate); `sha256` of each table's row lines equals
its manifest row; `--redact-grants` verifies; a flipped byte in a row → `CHECKSUM_MISMATCH` naming the table; a
missing `dog_sig` → `SIGNATURE_INVALID`; `#dogl 2` → `FORMAT_NEWER_THAN_READER`; import into a record with one
entry → `IMPORT_NOT_EMPTY`; a write between two pages → `CHECKSUM_MISMATCH` on the second; a `migration` row in
the file numbered past this build's last → `SCHEMA_NEWER`; an unknown column in `#table entry …` is reported and dropped.

**Scheduled actions**: `test/actions.test.ts`: each of the five `ACTION_` refusals at install, arming at install, deterministic jitter, a request that names its key and never carries it, a 401 or 403 that pauses and resumes only through `resumeAction`, one usage event per run scoped to a project or `global`, a poll that reaches its rule only on a change, the ladder on a 5xx, and a pack turned off, on and uninstalled.

**Migrations**: `test/migrate.test.ts`: a fresh database → `kernel = 5`, `format = 1`, `applied = [1, 2, 3, 4, 5]` (migration 5 rebuilds `schedule` with `call` and `poll`); migration 4 copies every `device_grant` row and its `CHECK` takes `vault` and refuses an eighth reach;
`dog_meta.format = '1'`, 31 `dog_section` rows of which 6 are `local`; `applyMigrations` twice applies nothing and
changes no row, index or ledger line; the checksums of `0001_kernel.ts` and `0002_session.ts` equal constants in
the test (an edit to an applied migration fails here first); a record at migration 1 with registers, rows and
events takes migration 2 on open, keeps every one of them and speaks `S1`; a record that declared its own
`register.session` keeps its rows, and the kernel's arrives as version 2; a ledger row with a wrong checksum →
`SCHEMA_MISMATCH` and `write` returns the same refusal (the record maps it to 503); a ledger row past the last
migration → `SCHEMA_NEWER`. `test/session-register.test.ts`: `installDeclarations(SESSION_BODY)` on a record
without the kernel's row produces an identical row and identical indexes; `S1` and `session#1` name the same row,
and `S12` is row 12. The `no-declarations-in-kernel` gate: the only `INSERT INTO declaration` under
`src/migrations` is `register.session`.

**Sessions**: `test/session.test.ts`. A token write naming no run opens `S1`, whose `create` event is signed `S1`
with `note = 'opened: auto'`, and the task's event is signed `S1`. A token write from `S3` moves its `last_seen`
and leaves its `version`, `updated_at` and events alone, so the next edit of `S3` on the version read before is not
a conflict. A name matching nothing, or a finished run, is dropped and never becomes a row. A client id re-attaches
a `done` run to `active` and leaves a `handoff` waiting. A live run on one host and repo is adopted, but not by a
caller with its own client id and not after 45 minutes. A person carrying session hints opens nothing. A refused
write opens no run and spends no number. An open refused on a bad hint leaves the write in under the caller's
actor, with a `write.refused` observation on `session.agent:ENUM_VALUE_UNKNOWN`. A run writing its own row carries
`last_seen` in that write and gets no `edit` row for it. `last_seen`, `project` and `token_id` are
`IMMUTABLE_FIELD` from a person and from a run. The twelve-hour sweep moves `active` and `idle` to `abandoned` as
`system`, leaves `handoff`, writes no `done`, and the swept run re-attaches. `register.session` from a person, from
a pack, or from a pack named `kernel` with other bytes is `PROVIDES_CONFLICT`, and the kernel's own bytes change
nothing.

**Coercion table** — `test/coerce.test.ts`: one row per line of the step-3 table, input → canonical or code;
`deriveValue` for the seven shapes against `where`'s compiled SQL over the same fixture rows (the two must agree);
ULIDs monotonic within one millisecond; spoken ids round-trip.

**Bench** — `test/bench.test.ts`: the CI column of §7.

---

## 10 · Deliberate ceilings

- `ponytail:` **manifest refresh reads every travelling table in one pass** — a request's CPU budget is exceeded somewhere past ~500 MB of rows. Upgrade: a `snapshot`-kind schedule row that refreshes the manifest one table per firing and stores it, so page 0 only reads `dog_manifest`.
- `ponytail:` **import buffers the whole file in memory** so a refused import writes nothing; 128 MB in a Durable Object caps it near 50 MB of `.dogl`. Upgrade: a two-pass streaming import (verify pass, then write pass) when a Cloud customer's file outgrows it; the self-host has no such ceiling.
- `ponytail:` **`repeat:` occurrences are materialised at write, 400 days ahead, ≤ 100 rows per field** — a monthly rule for a decade lands its later years only when the row is written again. Upgrade: a nightly `purge`-kind sweep that re-runs step 10 over rows with `repeat:`.
- `ponytail:` **`instant` repeats keep the anchor's UTC time of day**; a weekly 09:00 Cairo appointment drifts an hour across a DST change. Upgrade: expand in `record.tz` with `Intl` when a customer notices.
- `ponytail:` **erase is a full scan of nine text columns with `instr`** — a second per million events. Upgrade: none planned; erasure is rare and a one-month clock is generous.
- `ponytail:` **`delete: refuse_while_referenced` scans referrers without `index: true`**. Upgrade: the install diff already says so; add `index: true` to the referring field.
- `ponytail:` **the `op_id` replay returns the row as it is now** with the original version number, not a stored snapshot of the original result. Upgrade: a `result` column on `event`'s first row if exact replay is ever required.
- `ponytail:` **`TEXT_ESCAPED_NEWLINE` has a false positive** — a single-line value legitimately containing backslash-n (a Windows path `C:\new`). Refusing names the caller's likeliest bug; a caller with a real backslash-n sends a real newline elsewhere in the string or escapes differently. Upgrade: never — the design chose refuse over repair.
- `ponytail:` **`lower()` is ASCII** in SQLite without ICU; erase and `contains` fold ASCII case only. Arabic has no case; other scripts match exactly. Upgrade: none.
- `ponytail:` **compiled locks are cached per UTC day**, so a lock with `today` recompiles at most once a day and may be stale by up to a day's `tz` offset around midnight. Upgrade: key the cache on the record's local day if a lock ever hinges on it.
- `ponytail:` **done reminder rows are never pruned** — they are the once_per memory. Upgrade: purge `done` rows older than a year when the table is measured to matter.
- `ponytail:` **one hash function, four async methods**: WebCrypto's `digest` is one-shot and async, so `applyMigrations`, `installDeclarations`, `exportDogl`, `importDogl` and `erase` are `async` and hash before their transaction; the write path stays synchronous. Upgrade: a pure-JS SHA-256 (~40 lines) would make them synchronous; not worth owning until an `await` between hash and transaction is shown to bite.

---

## 11 · Dependencies

| Kind | Package | Version | Why |
|---|---|---|---|
| runtime | — | — | none. `@braindog/ports` is a type-only import (erased); `@braindog/where` is a `workspace:*` internal package |
| workspace | `@braindog/ports` | `workspace:*` | `Sql`, `Param`, `Row`, `Cursor`, `Clock` types; the `node:sqlite` adapter in tests |
| workspace | `@braindog/where` | `workspace:*` | `compile` (`/sql`), `evaluate`, `jsonPath`, `jcs` |
| dev | `typescript` | 6.0.3 | type-check only ([31-STACK](31-STACK.md) §3) |
| dev | Node | 24.13.0 | `node --test`, `node:sqlite` for the adapter under test |
| dev | `fast-check` | 4.9.0 | one property: coerce → JCS → parse → coerce is a fixed point for every type |

Platform surface: WebCrypto, `TextEncoder`/`TextDecoder`, `btoa`/`atob`, `URL`, `Intl`. Nothing from `node:*`.

---

## 12 · Build order

**Needs first.** `packages/ports` (spec 37): the `Sql` type and a `node:sqlite` adapter reachable from tests.
`packages/where` (spec 38) exporting exactly: `compile(predicate, ctx) → { sql, params, uses }` from `./sql`,
whose SQL names bare columns and `json_extract(fields, …)` so it runs over the aliased candidate of step 2;
`evaluate(predicate, row, ctx) → boolean` (the reference evaluator, used for `required_when:`);
`jsonPath(fieldId) → "'$.<id>'"` (the one string the index and the predicate share); and `jcs(value) → string`
(RFC 8785). If spec 38 names any of these differently, its name wins and this spec is amended in the same round.

**Unblocks.** `packages/record` (spec 45 — the six groups over `write`/`get`/`list`/`search`, the outbox drain,
`arm()` from `pendingWork()`); `apps/cli` (spec 48 — `init`, `export`, `import`, `verify` materialise `.dogl`
through this kernel and a real SQLite); `apps/selfhost` (spec 49). `declare` (spec 42) does not depend on the
kernel and may be written in parallel; `record` marries the two.

**Order within the package.** `coerce.ts` → `migrate.ts` + `0001_kernel.ts` → `events.ts` → `fts.ts` →
`schedule.ts` → `write.ts` → `index.ts` → `erase.ts` → `dogl.ts`. The write path is testable at step six of nine.

---

## 13 · Decisions taken here

Twenty, counted. Each amends the named document in the same revision loop ([35-SPEC-OVERVIEW](35-SPEC-OVERVIEW.md) §5).

| # | Decision | Amend |
|---|---|---|
| 1 | **The envelopes live in the kernel.** `CallContext`, `Result<T>`, `Refusal`, `Level` are declared in `@braindog/kernel` exactly as 33 §2 writes them; `record` re-exports them. A package below `record` cannot import them from it | 33 §2 (owner note) · 35 §4 rows 41, 45 |
| 2 | **Migrations are `.ts` modules exporting the SQL string**, `src/migrations/NNNN_<slug>.ts`; the checksum is over the exported text after CRLF → LF and trailing-whitespace strip; `-- format-bump <n>` carries the new revision. A package with no build step and no `node:fs` cannot load a `.sql` file. The `migration` table is created by the runner, not the file | 02 §7 · 33 §9 · 30 §11 |
| 3 | **`unique:` is a pre-check with the index as backstop.** One indexed SELECT names the existing row (`ALREADY_KNOWN` with its spoken id; `UNIQUE_VIOLATION` on a series or from the index). Driver messages are never parsed — three SQLite builds phrase them three ways | 30 §6 (the two rows) |
| 4 | **The `.dogl` line format**: `#dogl <n>`, `#table <name> <cols>`, JCS row arrays, header first, `dog_sig` last, `local` omitted; the manifest covers every exported table except itself and `dog_sig`; `dog_meta` carries no `exported_at`. The `dog_section` assignment of all 31 tables is §5.2's INSERT | 03 §2–§3 · 33 §9 · 34 §5 |
| 5 | **PINNED applies to mechanism actors only** — `rule:` and `ingest:`. Sessions, `agent:` tokens and `system` are exempt: a person's instruction to an agent is a person's write, and an exempt `system` is what lets the twelve-hour sweep move a state a person once set. The literal reading would forbid an agent editing any field a person ever created | 30 §4 step 2b · 30 §6 `HUMAN_ONLY` · 07 §6 |
| 6 | **The session heartbeat is not a write**: `last_seen` is `json_set` in place, no `version` bump, no `updated_at`, no event — otherwise every agent write would spuriously conflict the next edit of its session row and flood `whatsNew` | 02 §1 · 32 §2.1 · 30 §4 step 6 |
| 7 | **The redaction list is by type and by option**: `secret` and `money` always; `redact: true` on any other field. Inside a `create` row's `to_v`, a redacted field's value is the string `--redacted--` | 20 §8 · 02 §5 (`redact:`) |
| 8 | **A `series` upsert resolves the row by its key at step 1 and then INSERTs or UPDATEs by id**; `entry_k_<reg>` stays as the backstop. Resolving first is what lets LOCK, PINNED and VALIDATE see the row the design says they must; a conflicting soft-deleted row is revived | 30 §1 (the `key:` comment) · 30 §4 step 6 · 02 §5 |
| 9 | **`op_id` sits on the first event row of a write only** (the unique index admits one); the replay returns the current row with the original rowid as `version` | 33 §2 (idempotency) · 30 §1 `event_op` |
| 10 | **`pairs:` semantics**: `mark` names a `bool` field set `true` on both rows; the kernel writes `_pair` (the partner's id) on both; the window runs over `pairs.date`, defaulting to the register's sole `day` field; `on:` entries beyond the money field are equality leaves; the candidate predicate is compiled by `where`; a person-pinned `mark` skips the pairing | 02 §5 · 32 §3 |
| 11 | **The identity accent is `round(seq × 137.508) mod 360`** — the kernel guarantees distinct, well-spread hues with no query and no theme dependency; the theme's generator owns contrast and the dichromat check at render | ADR-028 · 32 §4.4 · 13 §2.1b |
| 12 | **`PRAGMA user_version` and `application_id` are best effort inside the record**; `record.format_ver`, `dog_meta.format` and the `#dogl` header are authoritative there, and the CLI/self-host set both pragmas when they materialise a `.dog`. An adapter that refuses `PRAGMA` (the Durable Object allow-list) does not fail the migration | 30 §11 · 33 §9 · 03 §2 |
| 13 | **One new code, `VALUE_MALFORMED`**: a value outside its type's shape that cannot be coerced, an unresolvable id or spoken reference, a non-grant `secret`, an erase subject under three characters. 34 §3 says a 16-digit decimal "is refused" and named no code; the write path had none for a malformed instant. Write path becomes eighteen, the total seventy-six; fixture `value-malformed` | 30 §6 · 34 §3 |
| 14 | **Default caps**: `text` 16 KB, `json` 64 KB, `url`/`email` 2 KB, `list` 1,000 elements, `fields` 1 MB — the 2 MB row ceiling with headroom, all `OUT_OF_BOUNDS` | 02 §5 (caps table) |
| 15 | **Erase**: subjects match as ASCII-folded substrings; nineteen stores — the sixteen plus `person`, `job`, `job_event`; a cancelled `schedule`/`outbox` row is `state = 'done'` with payload `--erased--` (there is no `cancelled` state); the `erase` event carries `sha256:<16 hex>` of the subject, never the subject; `entry.fields` values are tombstoned in place so every row keeps its existence and sequence | 02 §10 · 30 §1 |
| 16 | **Grant ids are `g_` + ULID**, minted by `bindGrant`; a `secret` field's value must match and exist. The grammar table gains the row | 12 §6 · 34 §4 |
| 17 | **`installDeclarations` is a batch with a `planVersion` CAS**, and the kernel raises `PLAN_STALE` — only the transaction that writes can check it atomically; the kernel also writes the `pack` row and the `install`/`upgrade`/`declare`/`retire`/`uninstall` events; uninstall deletes the `pack` row (the table has no `uninstalled_at`) | 30 §5 · 04 §3–§4 |
| 18 | **A write from a `spark` principal is `FORBIDDEN` at step 1**; a bare `#7` to `get` is `REGISTER_UNKNOWN`; a derived, retired or kernel-written field in a patch is `IMMUTABLE_FIELD`; a `_`-prefixed or reserved key from the boundary is `FIELD_UNKNOWN` — the mapping of four unnamed refusals onto existing codes | 30 §3 · 30 §6 · 34 §4 |
| 19 | **A create may set any declared `state` value; `transitions:` govern moves.** A person's actor string is the person id `p_<ULID>`, resolved to a name through the `person` mirror at read — that is what the mirror is for. An auto-opened session's `create` event is authored by its own `S<n>` with `note: 'opened: auto'`, since the register has no `source` field | 02 §5 · 30 §3 · 32 §2.1 |
| 20 | **Reminders**: key `<id>:<field>:<at>:<offset>` under the `(kind, key)` unique index — `ON CONFLICT DO NOTHING` is `once_per`; cancel is a key-range delete of `pending` rows; a `day` reminder is due at noon UTC; `repeat:` without `remind:` means offset `0`; horizon 400 days, ≤ 100 rows per field per write. Purge is one transaction per run over ≤ 100 rows with one event, and prunes `observation` past 400 days | 09 §2 · 02 §4 · 30 §1 (purge) · 24 §4.2 |

---

## 14 · Done when

- [ ] `applyMigrations` on an empty `:memory:` database creates 31 tables, 31 `dog_section` rows, three counters and `register.session`; `kernel = 1`, `format = 1`; a second run is a no-op.
- [ ] The twenty-seven refusal fixtures pass and the `refusal-fixtures` gate is green for `KERNEL_REFUSAL_CODES`.
- [ ] Every row of the §9 write-path table passes; K1–K26 each have a test that fails when the invariant is broken.
- [ ] `event-kinds` (40), `closed-lists`, `no-declarations-in-kernel`, `spark-actor`, `secret-grep` gates are green.
- [ ] `dog-roundtrip`: export → import → export is byte-identical apart from `dog_sig`; every manifest hash re-computes with `sha256sum` over the row lines.
- [ ] A checksum-mismatched ledger makes every `Result`-returning method return `SCHEMA_MISMATCH`.
- [ ] `test/bench.test.ts` passes its CI column and prints the budget column's numbers for the log.
- [ ] `tsc --noEmit` clean under `strict`, `verbatimModuleSyntax`, `erasableSyntaxOnly`; no `node:*`, `cloudflare:*`, `fetch`, `Buffer` under `src/` (the path-scoped lint).
- [ ] `graph` gate: `kernel` imports only `ports` (types) and `where`.
- [ ] Every decision in §13 is written into its design document, and [BUILD.md](../BUILD.md) records the iteration.

---

*Previous: [40-SPEC-FIXTURES](40-SPEC-FIXTURES.md). Next: [42-SPEC-DECLARE](42-SPEC-DECLARE.md).*

