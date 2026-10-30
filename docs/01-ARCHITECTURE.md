# 01 · Architecture

The whole design follows from one choice: **a customer's record is one SQLite-backed Durable
Object.** Everything else in this document is a consequence of it.

---

## 1 · The shape

```
                  ┌──────────────────────────────────────────────────────────────────┐
   browser ──────▶│                                                                  │
   MCP client ───▶│   EDGE WORKER  (stateless, one deployment)                       │
   webhook ──────▶│   auth · routing · rate limit · the static shell                 │
   inbound email ▶│                                                                  │
   runner ───────▶│                                                                  │
                  └───────┬──────────────────────┬─────────────────────┬─────────────┘
                          │ RPC                  │                     │
              ┌───────────▼──────────┐   ┌───────▼──────────┐   ┌──────▼───────────┐
              │  RECORD DO (per      │   │  SLASH DO        │   │  DIRECTORY DO    │
              │  customer)           │   │  (per customer)  │   │  (one instance)  │
              │  ─────────────────   │   │  ────────────    │   │  ──────────────  │
              │  SQLite 10 GB        │   │  settings · call │   │  email → person  │
              │  FTS5 · PITR 30d     │   │  model calls     │   │  passkeys        │
              │  1 alarm → schedule  │   │  proposals only  │   │  sessions, links │
              │  live WebSocket      │   │  runner socket   │   │  slug → rec_id   │
              │  NO outbound calls   │   │  no write access │   │  login lockout   │
              └───────────┬──────────┘   └───────┬──────────┘   └──────────────────┘
                          │                      │
        ┌─────────────────┼──────────────┬───────┴────────┐
        ▼                 ▼              ▼                ▼
   R2 (exports,      Queues          Workers AI      Analytics Engine
   attachments,      (ingest; no     via AI Gateway  (OUR telemetry,
   nightly .brainl.age Workflow in v1) (inference)      never theirs)
   backups)
```

Eight moving parts, counted: one Worker deployment for every customer; **three Durable Object
classes** — a `Record` and a `Slash` instance per customer, and one `Directory` for the whole
deployment ([ADR-061](16-DECISIONS.md)); and the four platform services beneath them. No per-customer
provisioning step at all. *An earlier draft said five parts and two classes; the Directory is what
holds identity outside the record — §3.*

Both hosts — the Worker here and the self-host of §4 — route through one platform-neutral package,
`@braindog/host`: the route table as data, the status mapping, request-context parsing and `serveApi`
over standard `Request`/`Response`, so the two can never drift ([ADR-064](16-DECISIONS.md);
[31-STACK](31-STACK.md) §2).

---

## 2 · Why the record is a Durable Object and not a database

The prior plan said *"one Worker and one D1 per customer, provisioned by script, 4–6 days."*
The reason given was correct and still holds: **ids are spoken out loud.** A customer says
"#125" and "LN7"; in a shared database the second customer's first task is #4,732. Per-customer
isolation is not a nicety, it is a naming requirement.

But D1 is the wrong instrument for it.

| | D1 per customer | **SQLite Durable Object per customer** |
|---|---|---|
| Provisioning | REST call, wait, store the id, handle failure | `env.RECORD.get(env.RECORD.idFromName(rec_id))` — no step at all; the `Directory` resolves a slug to its `rec_id` first (§3) |
| Account ceiling | 50,000 databases (raisable on request) | unlimited instances |
| Size ceiling | 10 GB per database | 10 GB per object |
| Point-in-time recovery | build it | **built in, any point in the last 30 days, via bookmarks** |
| Full-text search | build it or ship a LIKE | **FTS5 compiled in** |
| Scheduling | a cron Worker that fans out across all tenants | **an alarm that belongs to the customer** |
| Read latency | network hop per query | storage is *in the same thread as the code* |
| Consistency | eventual on replicas | serialised per object by construction |
| Deleting a customer | delete a database, hope | `deleteAlarm()` then `deleteAll()` |

The provisioning line is the one that matters most. Signup latency for a per-customer D1 is a
control-plane API call that can fail, retry, half-succeed and leave an orphan. Signup latency
for a Durable Object is zero, because the object is created by being addressed. **Naming is
provisioning.**

PITR is the second. "Backups and point-in-time restore, per customer" was listed in the record
as one of the five things that make $12/mo worth paying, and described as *"the least exciting
reason, and most often the actual one."* On SQLite-backed Durable Objects it is a platform
feature with a 30-day window, reachable through `getBookmarkForTime()` and
`onNextSessionRestoreBookmark()`. It costs zero days to build.

> **Measured constraint:** PITR is not available in local development, because the durable
> change log is not kept locally. Restore is therefore a Cloud-only feature and the
> self-hosted build must ship its own snapshot mechanism — see [03-DOG-FORMAT](03-DOG-FORMAT.md) §6.

### The limits this buys, and what each one forces

Read from the platform on 2026-08-31. Each one changes a design decision, so each is stated with
its consequence rather than listed.

| Limit | Value | What it forces |
|---|---|---|
| SQLite per object | 10 GB | A record is text and rows; **attachments go to R2, never into the object** |
| Columns per table | **100** | Applies to the **kernel's own 27 tables only** (plus the four `dog_*` header tables every live record carries) — a register's fields live in JSON and are indexed by partial *expression* index, so they cost no columns. See [02-DATA-MODEL](02-DATA-MODEL.md) §1, which corrects an earlier draft that derived the field cap from this limit |
| SQL parameters per statement | **100** | The `where:` compiler chunks any `IN (…)` over 64 values |
| LIKE/GLOB pattern | **50 bytes** — workerd's `sqlite3_limit`, not SQLite's default | full text is `matches:`, which compiles to FTS5; `contains:` is a field-scoped `instr()` substring test capped at 40 bytes; only `starts`/`ends` emit a `LIKE`, capped at 40 ([34-GRAMMARS](34-GRAMMARS.md) §1). Never a `LIKE` for a phrase — a 50-byte silent ceiling is the kind of bug that ships |
| Statement size | 100 KB | Generated SQL is bounded and asserted in tests |
| Row size / BLOB per row | 2 MB | A document field is capped at 512 KB and chunked above that |
| **Alarms per object** | **1** | The entire schedule is one alarm plus a table. [09-ALARMS](09-ALARMS-AND-NOTIFICATIONS.md) is about this |
| Throughput per object | **soft limit** ~1,000 req/s | Documented as a *soft* limit, and the Rules page says 500–1,000 for simple operations. Irrelevant for one customer; it is also a natural per-tenant rate limit |
| Memory per object | 128 MB | Embeddings are streamed and scored in batches, never all loaded |
| CPU per request | 30 s default, 300 s max | A long import is paged — the host streams the body and the record's `importBrainl` batches internally ([48-SPEC-CLI](48-SPEC-CLI.md) §13 D3). No Workflow in v1 |
| DO classes | 500 | We use **three** — `Record`, `Slash`, `Directory` ([ADR-061](16-DECISIONS.md)). Never a class per customer. *An earlier draft said two* |
| JS number precision | 53-bit | Any id that could exceed 2^53 is stored as `TEXT` |
| **Compound `SELECT` terms** | **5** | **undocumented by Cloudflare** — read from workerd's source. A `UNION ALL` chain of six fails |
| **Expression depth** | **100** | **undocumented.** A deeply nested `any:`/`all:` predicate reaches it, which is why [30-BLUEPRINT](30-BLUEPRINT.md) §7 caps nesting at 3 and the property test asserts depth |
| **Trigger depth** | **10** | **undocumented.** No trigger is declared today; recorded so nobody adds a cascade |

### The rule that falls out of the concurrency model

Cloudflare's own guidance states it exactly: *“Input gates only protect during storage
operations. Non-storage I/O like `fetch()` or writing to R2 allows other requests to
interleave.”* (Rules of Durable Objects, read 2026-09-01.) SQLite storage calls are synchronous
and do not yield the event loop, so a multi-statement transaction is atomic on its own — but the
moment application logic awaits a network call between two writes, another request runs in the
gap. The clean way to never think about this again:

> **The record object makes no outbound network calls. Ever.**

Inference, webhooks out, email out and pack fetching all happen in the Worker or in the Slash
object, which then writes back through a normal RPC call. This is a correctness rule that
happens to be identical to the security rule in [12-SECURITY](12-SECURITY.md) §4 — the record
cannot exfiltrate because the record cannot speak. Two problems, one line.

> **Note that this is a self-imposed rule, not a platform limit.** Cloudflare documents that an
> `alarm()` handler *“can do work, read from the Storage API, make HTTP calls and set future
> alarms”*. We decline the HTTP call. Saying so matters: a rule presented as a platform
> constraint gets quietly broken by the next person who reads the docs and finds it isn't one.

### The outbox, which is what makes that rule survivable

An earlier draft had a hole in it, and it is the kind that is only visible when two documents are
read together. [09-ALARMS](09-ALARMS-AND-NOTIFICATIONS.md) fires the schedule **inside the record
object**; a digest has to reach an email service, a push has to reach a push service, and a pull
connector ([25-CONNECTORS](25-CONNECTORS.md)) has to reach somebody's API. All three are outbound
calls, from the one place that may not make them. As written, nothing could ever be sent.

One kernel table closes it:

```sql
outbox (
  id       TEXT PRIMARY KEY,
  created  TEXT NOT NULL,
  kind     TEXT NOT NULL,     -- notify.email | notify.push | notify.webhook | pull.fetch | export.r2 | erase.r2
                              --   | infer.embed | infer.prose | infer.draft — nine; the CHECK is in 30 §1
  payload  TEXT NOT NULL,     -- json: everything the Worker needs, and nothing it doesn't
  state    TEXT NOT NULL,     -- pending | leased | done | failed | dead — five, CHECK-enforced (30 §8)
  leased_until TEXT,
  attempts INTEGER DEFAULT 0
);
```

The alarm handler writes rows here inside the same `transactionSync` as everything else it did.
Nothing is sent from inside the object. Then the transaction ends, the alarm is re-armed, and exactly
one call leaves — through the `Scheduler` port's `wake()`, which on Cloud is a queue **binding**, not
a `fetch()`, and on the self-host a no-op:

```
alarm():
  … claim, dispatch, write outbox rows …                 (synchronous SQLite, one transactionSync)
  ── transaction ends ──
  await scheduler.set(min)                                (re-arm: an async storage op, still under the input gate)
  await scheduler.wake()                                  (Cloud: OUTBOX_Q.send({ record }) — the only I/O, and the last statement)
```

> An earlier draft put re-arm inside an "(all synchronous SQLite)" bracket. On a Durable Object
> `getAlarm()`/`setAlarm()` return Promises, so re-arm cannot sit inside `transactionSync`; it is step
> 11 of the write path, after commit and before the doorbell ([30-BLUEPRINT](30-BLUEPRINT.md) §4,
> [33-CONTRACTS](33-CONTRACTS.md) §1).

Four properties, and the ordering of the first is the whole point:

| Property | Why |
|---|---|
| **The send is the last statement, after every write** | it is non-storage I/O, so it opens the gate. There is nothing left to interleave *with*, because the object has finished |
| The message carries **only the record id** | not the payload. The Worker leases from the outbox by RPC, so a queue message is never a copy of a notification that might have changed |
| A lost queue message costs latency, never a notification | the Worker also drains any expired lease on the record's next request, and the alarm re-arms on a short retry while `pending` rows exist. The outbox is the source of truth; the queue is a doorbell |
| Draining leases rather than deletes | *“In rare cases, alarms may fire more than once”* (Cloudflare, read 2026-09-01). A lease with an expiry makes at-least-once delivery survivable; a delete-on-send does not |

This is also the seam that makes self-hosting work: the self-hosted build has no Queues, so `wake()`
is a no-op there and its loop polls the same table directly. Same rows, same states, no second code path — which is why
the outbox is a kernel table rather than a Cloud detail.

---

## 3 · The second object: Slash

Model calls and the projection reader live in a **separate** Durable Object per customer. Its own
storage is two tables — `settings` and `call` ([46-SPEC-SLASH](46-SPEC-SLASH.md) §4.1) — no
conversation table and no retrieval cache: the drafted predicate is stored on the `call` row and
re-projected on the second pass; nothing accumulates.

Why separate rather than a method on the record:

1. The record may not call out (above). Inference is an outbound call.
2. A 300-second CPU limit spent on a model call must not block the record's writes.
3. Slash holds **no write capability**. It reads through a narrow projection and returns
   *proposals*. A compromised prompt cannot become a write, because there is no write path to
   compromise. See [12-SECURITY](12-SECURITY.md) §5.
4. Slash's `call` rows are disposable and separately deletable; the record is not.
5. It is also the **tier-C dispatcher**: the connected machine's hibernatable WebSocket terminates on
   Slash ([26-BYO-INTELLIGENCE](26-BYO-INTELLIGENCE.md) §2.2) — as a doorbell. The claim is always
   the record's `claimJob()`, which mints the job-scoped bearer; `job` and `job_event` are kernel
   tables, and Slash holds no lease state and no alarm in v1 ([46-SPEC-SLASH](46-SPEC-SLASH.md)
   §4.7; [51-SPEC-WORKER](51-SPEC-WORKER.md) §13 D13). *(An earlier draft had Slash holding the
   leases.)*

### The third object: Directory

Identity lives **outside** the record, in one `Directory` instance for the whole deployment
([ADR-061](16-DECISIONS.md)): email → person, passkeys, browser sessions, magic links, slug → `rec_id`,
and the login lockout. The record keeps what a `.brain` must resolve offline and what is scoped to one
record — a `person` mirror, its own agent `token` rows, and `auth_fail` for device codes and share
tokens ([02-DATA-MODEL](02-DATA-MODEL.md) §1). On the self-host the Directory is `directory.sqlite`
in the same process, same schema, same `Sql` port ([33-CONTRACTS](33-CONTRACTS.md) §6). The Worker
resolves a slug there, then `idFromName(rec_id)`.

---

## 4 · Self-host parity is an architectural constraint, not a promise

D41 requires self-hosting to be **free and complete**. That word does the work: any feature that
cannot exist in the self-hosted build either does not ship, or is explicitly a Cloud
convenience with the difference documented.

This kills several otherwise attractive choices:

| Tempting | Refused because |
|---|---|
| Vectorize for semantic search | No self-host equivalent, and a shared index breaks the isolation proof. Embeddings live in the customer's own SQLite — [ADR-006](16-DECISIONS.md) |
| KV for hot config | A second store to replicate; the record already answers in microseconds |
| Workers for Platforms | Only needed if customers deploy code. They never do — extensions are data |
| Hyperdrive / external Postgres | The record is a single-writer document, not a shared OLTP database |
| Analytics Engine for customer metrics | 3-month retention. A business record keeps figures for years — [08-METRICS](08-METRICS-AND-ANALYTICS.md) |

The portability surface is therefore deliberately tiny:

| Capability | Cloud | Self-hosted |
|---|---|---|
| Record storage | SQLite in a Durable Object | a `.brain` SQLite file on disk |
| Compute | Worker | Node 24.13, pinned to the minor ([33-CONTRACTS](33-CONTRACTS.md) §6) — **the FTS5 finding below decides the driver.** Bun is unsupported |
| Scheduling | DO alarm | one `setTimeout` loop over the same `schedule` table |
| Search | FTS5 | FTS5 — **measured at boot; a build without it is refused** (below) |
| Inference | Workers AI via AI Gateway | **bring your own key**: any OpenAI-compatible endpoint, Ollama included |
| Inbound email / webhook | Cloudflare Email + a public URL | paste, or your own reverse proxy. **This is what Cloud sells** |
| Object storage | R2 | the filesystem |
| PITR | platform, 30 days | scheduled `.brain` snapshots |

**Nine ports**, one interface each — and the count in an earlier draft was wrong twice over. It said
*"six"* above an eight-row table; **search is not a seam** (FTS5 is a feature of `Sql`), **compute is
not an interface** (it is which app you deploy), and **three were missing entirely**: a `Clock`, a
`KeyStore`, and a constrained `Http` door for connectors. The nine are `Sql` · `Scheduler` ·
`Clock` · `Blobs` · `Inference` · `Dispatch` · `Http` · `KeyStore` · `Snapshots`, plus `Ingress` as
an entrypoint contract rather than an interface — all in `packages/ports`, with
[33-CONTRACTS](33-CONTRACTS.md) §1 as the signatures and [31-STACK](31-STACK.md) §5 naming each port's
Cloud and self-host implementation. `Scheduler` carries the outbox doorbell, `wake()` — Cloud
`OUTBOX_Q.send({ record })`, self-host a no-op — so the record's ports stay exactly
`{ Sql, Scheduler, Clock }`. That is the entire porting layer, and it is designed before the first line
rather than discovered after it.

### The FTS5 finding, which was nearly a false promise — and then nearly a false alarm

> **An earlier draft of this section said official Node.js builds compile `node:sqlite` WITHOUT
> FTS5, "verified 2026-09-01".** That was wrong. Measured on 2026-09-02 on the official Node
> **v24.13.0** build: SQLite **3.50.4**, compile options include **`ENABLE_FTS5`**, and
> `CREATE VIRTUAL TABLE … USING fts5` succeeds. nodejs/node#56476 was closed because FTS5 had been
> *enabled*, not refused; the draft read a closed issue as a rejection.

The finding still matters, because **`matches:` compiling to FTS5 is a correctness requirement**, not
an optimisation ([02-DATA-MODEL](02-DATA-MODEL.md) §6): Durable Objects cap a `LIKE` pattern at 50
bytes — workerd's `sqlite3_limit`, not SQLite's default — so the grammar was designed to never emit
one for a phrase. An earlier draft of the table below said *"FTS5 — the same extension"* on both sides
without having measured it. It happens to be true, and it is now true because a probe says so on every
start rather than because a table asserted it.

| Driver | FTS5 | Verdict |
|---|---|---|
| Durable Objects SQLite | ✅ compiled in | Cloud. No change |
| **`node:sqlite`** | ✅ **on official Node ≥ 24.13 — measured: `ENABLE_FTS5` and JSON1 present** | **the self-host default.** Zero native dependencies. Still Stability 1.1, so the Node minor is pinned ([31-STACK](31-STACK.md) §3) and the boot probe measures FTS5 on every start ([ADR-038](16-DECISIONS.md)) |
| `better-sqlite3` | ✅ bundles its own SQLite with `SQLITE_ENABLE_FTS5` and `SQLITE_ENABLE_JSON1` on by default | **not built.** The Node minor is pinned, so the older Node it would serve does not arise; `node:sqlite` is the only driver ([37-SPEC-PORTS](37-SPEC-PORTS.md) §13 D9; [ADR-038](16-DECISIONS.md)). *An earlier draft kept it as the alternative* |
| `bun:sqlite` | ⚠️ on macOS it links Apple's system `libsqlite3`, which *"doesn't support extensions"*; it nests transactions via `SAVEPOINT`; its parameter ceilings differ | **unsupported.** Node bundles its own SQLite on every platform — the *"on macOS Node loads Apple's libsqlite3"* sentence an earlier draft carried applies to Bun alone |

**The resolution, and it makes the adapter design stronger rather than weaker:** a build without FTS5
is **refused when the record opens** — **there is no degraded mode.** The kernel meets a missing `fts5` at
migration 1's `CREATE VIRTUAL TABLE entry_fts`, or, for a file migrated on another machine, at a `LIMIT 0`
read of that table, and from then on every method answers `RECORD_UNAVAILABLE` at `sqlite.fts5`, naming
the SQLite version and what to run instead, the message of [30-BLUEPRINT](30-BLUEPRINT.md) §13
(`packages/kernel/src/migrate.ts`, held by `packages/kernel/test/boot-probe.test.ts`). The port also
measures `caps` — SQLite version, FTS5, JSON1 — by doing (`measureCaps` and `bootProbe` in
`packages/ports/src/sql.ts`, held by `packages/ports/test/sql.test.ts`). An earlier
draft had `contains` falling back to `LIKE` on such a build; that sentence is deleted, because a third
compilation with different semantics is exactly the *"two backends refuse identically"* rule of
[02-DATA-MODEL](02-DATA-MODEL.md) §6 being broken quietly. `Capabilities.fts5` is therefore always true
past boot.

The Durable Object's other ceilings travel with it. `DO_LIMITS` (`packages/ports/src/sql.ts`) is
enforced **above the driver** by `guard`: the parameter count (100), the statement's length in UTF-8
bytes (100,000) and its compound-select terms (5) before the statement runs, and the LIKE pattern's
length (50 bytes) on every bound pattern. Expression depth (100) needs a parser, so the guard names it
after the driver refuses it. Both hosts wrap their port in it (`guarded`: the self-host's `node:sqlite`
in `apps/selfhost/src/server.ts`, the Durable Object's storage in `apps/worker/src/index.ts`), and so
does every kernel test (`packages/kernel/test/sqlite.ts`), each throwing the same closed error
vocabulary ([33-CONTRACTS](33-CONTRACTS.md) §1). *That* is what "Node refuses first" means. `node:sqlite` has no `limits` constructor option and no `setLimit`;
an earlier draft of [30-BLUEPRINT](30-BLUEPRINT.md) §13 passed one, and it was silently ignored.

> **No conformance suite runs yet.** [33-CONTRACTS](33-CONTRACTS.md) §3 specifies one: the same record
> cases run on both hosts, a reference result from the Durable Object, and a gate that every host ran the
> same number of cases. None of it is built. Every record test runs on `node:sqlite` behind the guard, and
> so does the Worker's own harness (`apps/worker/test/cloud-harness.ts` runs `Record$` over `node:sqlite`,
> because local workerd cannot rewind a Durable Object). The ceilings above were measured once on local
> workerd through Miniflare (wrangler 4.129.0) and are held by `packages/ports/test/sql.test.ts`, not
> measured again on each run. So a statement the guard passes and the Durable Object still refuses, for a
> reason the guard does not count, is found on the Worker and not by a test. A portability claim that is
> only ever asserted in a table is a claim nobody has run, in either direction; building the suite is
> open work (F30 of the finish queue). See [30-BLUEPRINT](30-BLUEPRINT.md) §13.

---

## 5 · Request paths

**A browser read.** Worker validates the session cookie at the `Directory`, which also resolves the
slug to a `rec_id` → RPC to the record
→ record runs the page declaration against its own SQLite → returns rows → the shell draws them in
the browser; no server renders a request ([ADR-066](16-DECISIONS.md)). No network hop between the
query and the data.

**An MCP call.** Worker validates the bearer token, reads `Mcp-Method` and `Mcp-Name` from the
headers (2026-07-28 spec, no session handshake) → resolves customer → RPC. Stateless, so it load
balances on plain round-robin. See [10-MCP](10-MCP.md).

**An inbound email.** Email Worker receives the message (≤ 5 MiB) → resolves the customer from
the address → writes the raw payload to `inbox_raw` **untriaged** → enqueues a triage job. The
email handler itself does no parsing, because a handler that parses is a handler that can be
made to crash by a stranger.

**A webhook.** Same shape. Verify signature if the ingest declares one, store raw, enqueue.

**An ingest triage.** Queue consumer → the record's `arrive`: store → match the declared patterns →
extract → write rows with `confidence: exact` → outbox, in one transaction and with no model in it.
An unmatched shape earns an `infer.draft` outbox row at its third arrival in 30 days — never a
model call per payload — and Slash's draft opens a suggestion. Never a write from an unmatched
payload. See [07-INGEST](07-INGEST-AND-RULES.md).

**A scheduled digest.** The record's single alarm fires → drains every row in `schedule` that is
due → emits notifications → re-arms to the next due row. See [09-ALARMS](09-ALARMS-AND-NOTIFICATIONS.md).

---

## 6 · Why ingest is a queue consumer and not a Workflow — in v1

An earlier draft made ingest a Workflow, on the argument that its steps fail independently and a
model call should not be repeated after a failure at the write step. Both premises fell away in the
specification: `arrive` is deterministic — store → match → extract → write → outbox in **one
transaction**, with no model in it — so there is nothing to retry step by step, and the one model
call, the pattern draft, rides the outbox as `infer.draft`, leased and acked like every other
outbound job. **No Workflow in v1** ([51-SPEC-WORKER](51-SPEC-WORKER.md) §13 D12;
[45-SPEC-RECORD](45-SPEC-RECORD.md) §13 #18). Queues stay the front door — they absorb the burst
and hand the consumer one record id at a time. A Workflow may return the day a step becomes
genuinely multi-stage; the seam is the outbox.

---

## 7 · The surfaces

One API, five ways in. Nothing bypasses the record object. These are *surfaces*; the ingest
*channels* are a different five — `inbox_raw.channel` is `email | webhook | pull | paste | api`
([30-BLUEPRINT](30-BLUEPRINT.md) §1) — and the scheduled `pull` is the one that leaves through the
outbox of §2.

| Surface | Transport | Notes |
|---|---|---|
| Web app | HTTP + a **hibernatable WebSocket** on the `Record` object carrying `{ version, registers }`; fallback 15 s polling of `GET /api/version` ([22-FRONTEND](22-FRONTEND.md) §6, [ADR-044](16-DECISIONS.md)) — never SSE, which holds the object resident | The primary. A static shell — one `build/` served unchanged by both hosts; no server renders a request ([ADR-066](16-DECISIONS.md)) |
| MCP | Streamable HTTP, 2026-07-28 | The agent surface. Per-customer dynamic tools |
| CLI | HTTP + bearer token | For scripts and CI. Ships as one file, no dependencies |
| Inbound email | Email Worker | An address per record |
| Webhook | HTTP POST | A URL per ingest declaration |

The web app is a **client of the same API the agents use**. Any screen that needs an endpoint no
agent can call is a design error — it means the record cannot describe something it displays.

---

## 8 · What this architecture is bad at

Stated because an architecture document that lists only strengths is marketing.

| Weakness | Severity | Mitigation |
|---|---|---|
| One object is a single point of failure for one customer | real | Cloudflare handles failover; PITR covers corruption. But a bug in the record class affects every customer at once |
| No cross-customer queries | by design | Aggregate product telemetry goes to Analytics Engine instead |
| 10 GB ceiling per customer | acceptable | A text record with R2 attachments will not reach it. A customer who does needs a different product |
| Cold start on first request after eviction | ~50–200 ms | Optimise the constructor, lazy-init, and never load embeddings eagerly |
| A DO class migration cannot be rolled back | real | `--dry-run` every migration; `transferred_classes`, never `deleted_classes` |
| Team tier concurrency | ~1K req/s per object | Five people on one record will not approach it |

---

*Platform facts read 2026-08-31 from Cloudflare's Durable Objects, D1, Vectorize, Workers AI,
Analytics Engine and Email Service documentation. Where the bundled `cloudflare` skill's
reference files disagreed with the live docs, the docs won — as that skill instructs.*
