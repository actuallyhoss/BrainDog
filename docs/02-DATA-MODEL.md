# 02 · The data model

One SQLite schema per customer, inside that customer's Durable Object. Two layers: a **kernel**
that BrainDog owns and every record has, and **registers** that packs declare.

---

## 1 · The kernel

Twenty-seven tables (migration 0042 adds `instruction_seen` and `agent_profile`, below), and four header tables the format adds to every live record — thirty-one in
the file. Nothing a pack declares can alter them, and nothing in them is optional. *(An earlier draft
said twenty. The review proved seven missing: the people, tokens, lockouts and counters a `.brain` must
resolve offline, the Keychain's wrapped keys, and the two job tables of tier C.)*

```sql
-- IDENTITY AND SHAPE ------------------------------------------------------------
record        -- one row (singleton = 1). id 'rec_' + ULID, slug, name, locale, tz, format_ver (mirrors PRAGMA user_version), created_at,
              --   quiet (the record's quiet hours, 09 §5 rule 3: NULL reads as 21:00 to 08:00, 'off', or {"from":"HH:MM","to":"HH:MM"} in tz; migration 0020)
pack          -- installed packs: id, version, source, installed_at, manifest json, checksum
declaration   -- every declared thing: kind, id, version, pack_id, body json, checksum, superseded_at, retired. PRIMARY KEY (id, version)
migration     -- applied kernel migrations: version, applied_at, checksum

-- IDENTITY: PEOPLE, TOKENS, COUNTERS --------------------------------------------
-- The DIRECTORY (email → person, credential_id → passkey, person → records, slug → rec_id, browser
-- sessions, magic links, the login lockout) lives OUTSIDE the record in the third Durable Object class,
-- `Directory`, one instance; on the self-host it is `directory.sqlite` in the same process, same schema, same Sql
-- port. The record keeps what a .brain must resolve offline and what is scoped to one record.
person        -- id ('p_' + ULID, minted by the Directory), email, name, suspended_at. Mirror; actors and members resolve here
              -- CORE, not a pack: "who are you" is answered here at sign-in, independent of whether
              -- the `people` pack is installed or enabled
token         -- agent tokens, one record each: id, person_id, hash, scope CHECK (read|propose|write), label, created_at,
              -- last_used_at, last_surface, expires_at, revoked_at
auth_fail     -- per-record lockouts (device codes, share tokens): key, n, until. Never exported
counter       -- name ('seq:<register>' | 'decision' | 'suggestion'), next. Allocation is
              -- UPDATE counter SET next = next + 1 WHERE name = ? RETURNING next - 1 — race-free because the object is
              -- single-writer; a purged row's seq is never reissued

-- THE ROWS ---------------------------------------------------------------------
entry         -- the universal row: id, register, seq, fields json, state, version, deleted_at
entry_fts     -- FTS5 virtual table over the projected text of every entry; rowid = entry.rowid
entry_vec     -- id, register, dims, vec BLOB (int8), model, built_at. No FK: purge and erase delete it explicitly
metric_point  -- (series, grain, at) -> integer value. WITHOUT ROWID. see 25-CONNECTORS §8

-- ORIGIN -----------------------------------------------------------------------
event         -- append-only audit: ts, actor, kind, target, target_kind, field, from_v, to_v, note, batch, op_id
inbox_raw     -- untriaged arrivals: ts, channel, headers json, body, state, reason, sha256
ingest_receipt-- which pattern matched which raw payload, and what it wrote; confidence
observation   -- how the record is actually used: kind, subject, day, n. PRUNABLE, 400 days, never rolled up

-- GOVERNANCE -------------------------------------------------------------------
decision      -- immutable. id, question, answer, reason (NOT NULL), decided_by, ts
suggestion    -- open questions with options json, status, opened_by
prediction    -- a falsifiable claim about an accepted change: measure, frozen baseline (INTEGER, with unit), score_at, on_miss
grant         -- the credential Keychain. label, opens, kind, version, ciphertext, nonce, kdf, rotated_at, stale_at
device_grant  -- a device asking in: code_hash, status, tries, expires, reach — six values, login | runner | export | import |
              -- pack | token; an operation reach is the owner's ten-minute grant of 12-SECURITY §3. see 12-SECURITY §6.1
member        -- who may do what, per register: person_id, register, level, seen_at (the READ MARK, MAX only)
schedule      -- the single-alarm work queue: due_at, kind, payload json, state CHECK (five: pending | firing | done | failed | paused)
outbox        -- work that must leave the object: kind, payload json, state, leased_until

-- KEYCHAIN ---------------------------------------------------------------------
vault_key     -- purpose CHECK (record|connector|signing), wrapped BLOB, nonce BLOB, wrapped_by CHECK (kek|passphrase),
              -- kek_id, salt, rewrapped_at. Exactly one wrapping per key; 'connector' is always kek (Q13); 'signing' is
              -- the record's Ed25519 private key (03 §4)

-- JOBS (tier C) ----------------------------------------------------------------
instruction_seen -- (instruction, run, how, at): which run was shown which instruction, and how. Migration 0042. Local
agent_profile -- one settings row per kind of agent, or per token or machine, and a 'default' row. Migration 0042. Owner-written only
job           -- id, kind CHECK (four), args, status CHECK (nine), runner_id, claimed_at, lease_until, seq (event high-water
              -- mark), cancel, session, created_at, expires, claude_session, result, error, cost_minor, turns, ms
job_event     -- (job_id, seq) PK, kind CHECK (start|say|think|tool|out|limit|note|end|error), body, ts
job_place     -- job_id PK, machine, seat, ran_on: the machine and Claude Code profile a job must run on and under, by
              -- name, and the machine it was taken on. Migration 0044. Local

-- SEALED FILES (migration 0045) -------------------------------------------------
sealed_file   -- the owner's sealed files, by key: parts, size, sha256, complete, made_at, updated_at, made_by. Travels in data
sealed_part   -- (key, part) PK: which parts this host holds, under which file hash, how long. Local. The bytes are never here
```

**And four header tables, which are not the kernel's but are in every live record.** Migration 0001
creates `dog_meta` · `dog_section` · `dog_manifest` · `dog_sig` in every live database, DO and file
alike, because on the self-host the live file *is* the `.brain` ([03-DOG-FORMAT](03-DOG-FORMAT.md) §3).
`dog_manifest` and `dog_sig` are refreshed by an export and sit empty in a live DO. Six of the
twenty-seven carry `dog_section = 'local'` and **never travel**: `token`, `device_grant`, `auth_fail`,
`observation`, `job`, `job_event`. `counter` travels, because `seq` allocation must survive a move.
`vault_key` travels **sealed**: a KEK-wrapped key opens nothing without the KEK, and a record restored
from its own backup must be able to open its own Keychain ([12-SECURITY](12-SECURITY.md) §8). *(An earlier
draft listed it as `local`, which would have made every restored Keychain unreadable.)*

> **`observation` and `prediction` are the two that make [24-SELF-IMPROVEMENT](24-SELF-IMPROVEMENT.md)
> possible, and they are deliberately not one table.** An observation is *Origin* — it is prunable,
> pre-aggregated daily, and never travels in an export. A prediction is *Governance* — it sits beside
> `decision` because it is a decision's falsifiable half, and it is the only thing in the record that
> can say an accepted change did not work. `event` could carry neither: it is append-only forever, it
> travels in every export, and a drifting event vocabulary is unqueryable in five years.
>
> `outbox` — an earlier draft called it "the fifteenth", of fifteen — exists because the record object may make no outbound call
> while the alarm that must send a digest fires *inside* it. The alarm writes rows; the Worker
> leases and sends them. [01-ARCHITECTURE](01-ARCHITECTURE.md) §2 has the mechanism and the
> ordering rule it depends on.

### Three deliberate choices in that list

**`entry` is one table, not one per register.** A register is a *declaration*, not a DDL
statement. Fields live in a JSON column, and a field a register marks indexable gets a **partial
expression index** over `json_extract(...)` — never a column. The next subsection is entirely
about why, because an earlier draft said generated columns here and was wrong.

Why: a pack that creates real tables can only be uninstalled by dropping them, which destroys
the customer's rows — and the pack contract in [04-PACKS](04-PACKS.md) is that *declarations
belong to the pack, rows belong to you*. One table makes uninstall a metadata operation, and it
makes the `.brain` file's schema stable across every possible pack combination, which is what makes
the format [readable by plain `sqlite3`](03-DOG-FORMAT.md).

### How an indexed field is actually indexed — and why it is NOT a generated column

**An earlier draft of this document said generated columns, and that was wrong in a way that would
have failed at the twelfth installed pack.** The arithmetic: `entry` is *one shared table*, so every
register's indexed fields compete for the same 100-column SQLite ceiling. At 8 indexed fields per
register and 64 registers that is up to **512 generated columns on a 100-column table** — and a
`money` field needs two, so the wall arrives sooner. Worse, it fails in the worst possible order:
the author with five packs never sees it, and the first studio customer with twelve packs — exactly
the persona the $29 tier is priced for — gets an install refusal naming the wrong cause.

**So an indexed field gets a partial expression index instead, and no column at all:**

```sql
CREATE INDEX entry_i_obligations__due
  ON entry (json_extract(fields, '$.due'))
  WHERE register = 'obligations' AND deleted_at IS NULL;
```

The name is `entry_i_<reg>__<field>` — the double underscore keeps `a_b` + `c` apart from `a` + `b_c`
(§2). A `unique: true` field gets `entry_u_<reg>__<field>` on the same shape; a `series: true` register's
`key:` gets one `entry_k_<reg>` over the key fields (§5).

SQLite has indexed *expressions* since 3.9 and *partial* indexes since 3.8. This costs zero columns,
so the count of indexed fields is bounded only by storage; the predicate compiler emits the same
`json_extract(…)` expression, so the planner uses the index; and `WHERE register = …` keeps each
index the size of one register rather than the whole table.

> **This is on the must-verify list** ([17-OPEN-QUESTIONS](17-OPEN-QUESTIONS.md) Q12): confirm the
> Durable Object's SQL API accepts an expression index and that the planner picks it. It is a
> half-day spike and it gates the whole index model, so it happens in week one.

The remaining cost is honest: an unindexed field is a scan through `json_extract`. At thousands of
rows per register that is microseconds; the ceiling is stated in
[22-FRONTEND](22-FRONTEND.md) §4 and it is a rendering ceiling long before it is a query one.

### `session` and `instructions` are the two registers the kernel declares, and they are the second exception

The predecessor's most-used coordination feature — agent sessions with a spoken id, a handoff, and
derived liveness — had no counterpart here. It becomes **a kernel-declared register**, for
the same kind of reason `state` is the one promoted column: it is the register whose rows *are* the
agents, so it cannot live in a pack a user might not install, and making it a plain table would cost
a ninth MCP tool. [32-PARITY](32-PARITY.md) §2.1 has the declaration and the rules —
`S42` is spoken; staleness is derived at 45 minutes and never stored; death is **written** at 12 hours
by a `schedule` row of kind `purge`, hourly, run by `system` — `list` never writes, and the declared
transitions allow `active → abandoned` so the sweep's own write is legal; `last_seen` is a plain
`instant` the kernel writes at step 6 of the write path on every write whose resolved actor is that
session — a kernel-written field, not a derivation (§5), and **the heartbeat is not a write**: it is set
in place with no `version` bump, no `updated_at` and no event ([41-SPEC-KERNEL](41-SPEC-KERNEL.md) §5.4);
the row also carries `token_id`, so a token's writes are one query, and `project`, the project the run was
placed in by where it runs (§5), absent when the run is global; and **every agent write resolves to a
session or opens one.** Its `declaration` row carries `pack_id = 'kernel'` — the only row that does, so a
kernel-declared row and a user-authored one (`pack_id NULL`) are never confused. The CI rule *"the
kernel contains no register declaration"* gains this named exception, and a second (below). It arrives by migration 0002
([41-SPEC-KERNEL](41-SPEC-KERNEL.md) §5.2), which writes the declaration row and its eight indexes and
nothing else. A record created before that migration takes the register on its next open with every row
it held untouched, and a record that had declared a `register.session` of its own keeps its rows while
the kernel's declaration becomes that id's next version.

**The second kernel register is `instructions` (migration 0042, 21 October 2026).** It holds what the owner tells an
agent from the app, spoken `IN4`. It is core for the same reason `session` is: it is how the owner reaches the runs,
so it cannot depend on a pack being installed, and it has one writer. Its declaration row also carries
`pack_id = 'kernel'`. No pack or person may declare `register.instructions`: `validate` refuses it with
`PROVIDES_CONFLICT` unless it is the kernel's own bytes. A token cannot write it. The delivery fields (who took it,
when it was seen, the reply) are written only by the kernel. The CI rule is now: the kernel contains no register
declaration except `register.session` and `register.instructions`, each with `pack_id = 'kernel'`, and
`no-declarations-in-kernel` reads both from one list. The same migration adds two tables, `instruction_seen` (which run
was shown which instruction, and how) and `agent_profile` (one settings row per kind of agent, ADR-074). The first is
`local` and the second is `governance` in the `.brain`'s sections.

**Migration 0044 (22 October 2026) places a run, an instruction and a job.** It seats a new version of each kernel
register: `session` gains `seat`, the Claude Code profile a run is under, by name (`studio`, `default`), which the
kernel writes alone, stamped as the run opens or learned once from a later call or pulse; `instructions` gains
`machine` and `seat`, where an instruction must land. The field is `seat` because `profile` already names a run's
settings row. It adds one table, `job_place`, beside `job` rather than a column in it, so the migration can run again
and a job placed nowhere has no row. Names only: no folder is held anywhere ([44-SPEC-MCP](44-SPEC-MCP.md) §15.13).

### `state` is the one promoted field, and an earlier draft never said so

`entry` has a `state` column. A register also declares `state` as an ordinary `enum` field inside
`fields`. **Both are in the corpus, and nothing said which one `{ field: state, is: open }`
compiles against** — which for a state machine is not a detail, it is the whole thing.

The resolution, and it is a deliberate special case:

> **`state` is mirrored.** A register that declares a field with the id `state` must type it
> `enum`; the write path copies its value into the `entry.state` column in the same statement that
> writes `fields`. The predicate compiles against the **column**. A register that declares no
> `state` field stores `NULL` there.

Three reasons it earns its exception, in a model that is otherwise uniform:

1. It is the most-filtered field in every register anybody has written, so it gets a **native
   index** instead of an expression index — the one place that is worth a special case.
2. It keeps the README's promise literally true. `sqlite3 portfolio.brain "select seq … where
   register='obligations' and state='open'"` is the product's opening argument, and it only works
   if `state` is a column.
3. `move` — one of the nine rule actions — is defined as changing a state. An action that
   operates on a field the kernel does not know about cannot be validated at install.

The cost is stated rather than hidden: **`state` is a reserved field id.** A register cannot use
it for anything but its enum, and the validator refuses `{ id: state, type: text }` by name.

Everything else a row is *tagged* with lives in `fields` as a `list<text>` and is matched with
`has`/`lacks` — including the `example` marker that a pack's seed rows carry: it is the value `example`
in a declared `list<text>` field named `tags`, nothing more ([42-SPEC-DECLARE](42-SPEC-DECLARE.md) §4.4),
which is why clearing the seeds is one predicate rather than a special code path.

**`seq` is per register, and it is the number a human says.** `entry.id` is an opaque ULID
(`TEXT` — 53-bit precision makes numeric snowflakes unsafe). `entry.seq` is a per-register
counter: obligation #7, task #125. Two customers both have a #1. This is the naming requirement
that forced per-customer isolation in the first place, and it is finally cheap. The number comes from
the `counter` table inside the write transaction — `UPDATE counter SET next = next + 1 WHERE name =
'seq:<register>' RETURNING next - 1` — race-free because the object is single-writer, and **never from
`MAX(seq) + 1`**, which would reissue a spoken id the first time the highest-numbered row was purged.
`D<n>` and `SG<n>` draw from the same table.

**`event` is append-only and never has a foreign key to `entry`.** Deleting an entry must not
delete its history. A record whose audit log can be pruned by a delete is a record that cannot
answer "what happened to that". SQLite in Durable Objects does not enable `PRAGMA foreign_keys`
by default — that is a documented behaviour we rely on rather than fight, and the self-host adapter
opens with `foreign_keys = OFF` to match. The corollary is that **no table promises a cascade**:
`entry_vec` has no `REFERENCES … ON DELETE CASCADE`, because with constraints off it would never fire;
purge and erasure delete its row explicitly (§9, §10). `decision.supersedes REFERENCES` is documentary.

---

## 2 · Ids, and what each is for

| Id | Type | Shape | Spoken? |
|---|---|---|---|
| Record | `TEXT` | `rec_` + 26-char ULID — `record.id`, `NOT NULL UNIQUE`. The one row is pinned by `singleton INTEGER PRIMARY KEY CHECK (singleton = 1)`, never by `CHECK (id = 'self')` | no |
| Entry | `TEXT` | 26-char ULID | no |
| Entry seq | `INTEGER` | per register, from 1, allocated from `counter` | **yes** — "#125" |
| Decision | `TEXT` | `D` + integer, per record, from `counter` | **yes** — "D41" |
| Suggestion | `TEXT` | `SG` + integer, per record, from `counter` | **yes** — "SG23" |
| Session | `INTEGER` | the `seq` of a row in the kernel's `session` register, said with its `seq_prefix` | **yes**: "S42" |
| Person | `TEXT` | `p_` + 26-char ULID, minted by the `Directory` object and mirrored into `person` | no |
| Declaration | `TEXT` | `kind.id`, e.g. `register.obligations` | yes, by authors |
| Pack | `TEXT` | kebab-case, `^[a-z][a-z0-9-]{1,63}$`, globally unique in the Kennel | yes |

A spoken id is **stable forever**. Renaming a display label is free; changing an id breaks the
audit trail and every `#125` written into a note. This is stated in the pack validator as a
refusal, not a warning.

### Spoken ids have a grammar, and `#` never resolves bare

Two forms, and `get` accepts either — `{ spoken }`, `{ register, seq }` or `{ id }`:

| Form | Pattern | Example |
|---|---|---|
| **Prefixed** | `^([A-Z][A-Z0-9]{0,3})([1-9][0-9]*)$` | `D41` · `SG23` · `S42` · `LN7` |
| **Qualified** | `^([a-z][a-z0-9_]*)#([1-9][0-9]*)$` | `tasks#125` · `obligations#7` |

`#` is the display default (`seq_prefix: "#"`) and **never resolves bare** — every register has a `#7`,
so a bare `#7` is ambiguous the moment two registers keep the default, and the kernel refuses it rather
than guessing. A non-`#` prefix must be unique among installed registers; a second register claiming
`LN` is refused at install (`SEQ_PREFIX_TAKEN`). `D` and `SG` are governance's and `S` is the session
register's, so a register claiming one of them is refused the same way. So is a prefix that another
followed by a number spells: `P` and `P2` would both read `P21`. That rule is what lets a prefixed id
resolve against the installed prefixes with one match at most, where the pattern alone is greedy and
reads `S42` as `S4` and 2. The full grammar is [34-GRAMMARS](34-GRAMMARS.md) §4.

### Identifiers

| Thing | Grammar |
|---|---|
| register and field ids | `^[a-z][a-z0-9_]{0,31}$` — so `json_extract(fields, '$.<id>')` never needs quoting |
| pack ids | `^[a-z][a-z0-9-]{1,63}$` |
| index names | `entry_i_<reg>__<field>` for `index: true` · `entry_u_<reg>__<field>` for `unique: true` · `entry_k_<reg>` for a `key:` |
| reserved field ids | `id` `seq` `register` `created_at` `updated_at` `deleted_at` `version` `spoken` `title`; `state` unless it is the register's `enum` (§1); anything starting `_`, which is the kernel's — `_rule` `_parent` `_each` on a rule-generated row |

---

## 3 · Money

> **Money is always an integer in minor units, with its own currency. Never a float. Never a
> bare number.**

```json
{ "amount": 131624600, "currency": "EGP" }
```

That is the canonical JSON of a `money` value — `amount` and `currency`, never `minor`, never a
string. Every one of the sixteen types has one such shape, byte-exact; the list is
[34-GRAMMARS](34-GRAMMARS.md) §3 and §5 below summarises it.

Three rules, all enforced at the validator rather than by convention:

1. **Divide by 100 only at the point of display.** A currency's exponent (JPY is 0, KWD is 3) is never
   assumed to be 2. It comes from a short table, held in the renderer and in the kernel alike, which
   names every exponent that is not 2; a code the table does not name is read as 2, which is what most
   currencies are and what every unknown one is.

   **A table, and not the runtime's own currency data, which is the part worth knowing.** `Intl` carries CLDR, which is what a person
   in that country expects to SEE; ISO 4217 carries the minor unit, which is what a record STORES. They
   disagree on real currencies, and each disagreement is a hundred- or thousandfold error: CLDR gives
   `IQD` 0 where ISO gives 3, and `MGA` 0 where ISO gives 2. So the table carries ISO's values, and
   nothing in the exponent path calls `Intl` at all. The two copies are byte-identical, and they are two
   copies rather than one module because `braindog-render` is the published block dialect and depends on
   no `@braindog/*` package, while the kernel must not depend on a published renderer; a test compares
   the UNION of their keys against ISO on every run, because agreement between two copies is not
   correctness. **A third copy is not allowed**, and nothing in an app reads `maximumFractionDigits` for
   itself: one did, and drew 1.5 Iraqi dinars as `IQD 0.002`.

   **Knowing how to draw a code is not the same as accepting it**, and the two lists differ on purpose.
   The table names three codes a record will not store: `CLF`, `UYI` and `UYW`, which are ISO 4217
   index and fund units rather than tender. `Intl.supportedValuesOf('currency')` is the tender list, it
   is what `CURRENCY_UNKNOWN` is checked against, and it omits all three. So a `money` value in `CLF` is
   refused at the write, while `money(1_000_000, 'CLF')` still draws `CLF 100.0000` correctly, because
   the renderer is public API and is handed codes nobody validated. Narrow at the door, complete at the
   pen. `extract` owns only a symbol → code map
   for detection and refuses an ambiguous bare `$` ([34-GRAMMARS](34-GRAMMARS.md) §3).
   *(An earlier draft said "comes from a table"; the draft after it said no table is shipped, which was
   wrong in the other direction and is what let the third copy in.)*
2. **Two currencies are never added.** A metric summing a mixed-currency field is *refused at
   install*, not silently converted. A total across currencies must name its FX source and date.
3. **An FX rate is a dated row**, not a live lookup. A figure that changes when you reload it is
   not a figure you can act on.

`fx` is a kernel-adjacent register shipped by the `money-core` pack: `currency`, `base`, `rate`,
`as_of`, `source` — a lookup spells `{ lookup: fx, by: currency, as_of: day }`
([08-METRICS](08-METRICS-AND-ANALYTICS.md) §2.5). *(An earlier draft gave it a `pair` field, which
nothing could look a row up by.)* A converted total renders as `~$41,420 at 48.9 EGP/USD, 26 Aug 2026` — the
approximation sign and the date are part of the value, not decoration.

*(September 22nd 2026: the kernel owns the money type and the rule that two
currencies are never added, because those are primitives. Which register holds rates, and which
setting names a home currency, belong to whoever installed that use case, and should be passed in
rather than named by the kernel. Measured on that date, `packages/kernel/src/fx.ts:242` still
exports `HOME_CURRENCY_SETTING = 'home_currency'`, so the code names a use-case setting this
paragraph says it should not.)*

---

## 4 · Time

| Field kind | Stored as | Why |
|---|---|---|
| Instant | `TEXT` RFC 3339 UTC | sortable as text, unambiguous |
| Plain day | `TEXT` `YYYY-MM-DD` | a renewal date has no time zone |
| Recurrence | RRULE subset on a `day`/`instant` field | `FREQ`, `INTERVAL`, `BYDAY`, `BYMONTHDAY`, `UNTIL`, `COUNT` |

### Recurrence is a property of a date field, not a type — and `BYDAY` was missing

An audit called the old subset *the most revealing line in the data model*, and it was right:
**`BYMONTHDAY` with no `BYDAY`** is the recurrence of a subscription renewal, not of a person's
calendar. *"Every Tuesday and Thursday for six weeks"* could not be written. The word "recurrence"
appeared exactly once in twenty-four documents, and `recurrence` was not one of the value types —
so the row in the table above described something that did not exist.

It is not a seventeenth type. It is a key on a `day` or `instant` field, sitting beside `remind:`,
which is already the same shape:

```yaml
- id: starts
  type: instant
  repeat: { freq: weekly, byday: [TU, TH], count: 12 }
  remind: [-1d, -1h]
```

> **What a `repeat:` produces is `schedule` rows, not `entry` rows.** Twelve reminders off one
> appointment is free. Twelve *appointments*, each separately editable with its own notes and its
> own state, is row generation — a different problem, answered by the `create` action in
> [07-INGEST-AND-RULES](07-INGEST-AND-RULES.md) §6. Conflating the two is how a calendar feature
> becomes a data model.

Those rows are keyed by entry, field, occurrence and offset, so writing the row again is idempotent —
`once_per` is the key, not a second table; a `day` reminder is due at noon UTC; the horizon is 400 days
and one write materialises at most 100 rows per field ([41-SPEC-KERNEL](41-SPEC-KERNEL.md) §5.4).

**A plain day renders at noon UTC.** This is not pedantry: rendering `2026-08-17` as midnight
UTC displays as 16 August anywhere west of Greenwich, and a renewal reminder that fires on the
wrong day is worse than no reminder. The record's own timezone is stored on `record` and used for
digest scheduling; plain days are never shifted by it.

---

## 5 · A register declaration

```yaml
register: obligations
name: Obligations             # REQUIRED — the header title; the id is never shown
pack: money-core
seq_prefix: "#"
fields:
  - { id: what,     type: text,     required: true, index: true }
  - { id: to,       type: ref,      register: people }
  - { id: amount,   type: money,    required: true }
  - { id: due,      type: day,      required: true, index: true }
  - { id: state,    type: enum,     values: [open, part, paid, void], default: open, index: true }
  - { id: note,     type: document, max: 512000 }
search: [what, note]          # what `matches` searches — text document enum url email list<text> only (SEARCH_FIELD_TYPE)
title: what                   # what a row is called in a list
mobile: [what, amount, due]   # the three fields the phone view keeps — see 19-INTERFACE §8
one: obligation               # the singular, for "New obligation". ASKED FOR, never derived —
                              # English heuristics fail on people/fx/series, and this ships Arabic.
                              # Absent: a validator warning, and the header reads "New row"
```

### `series: true` — the registers that are facts, not things

Every register above pays what an audit called a **named-business-record tax**: a `seq` that is
spoken and stable forever, a `title` because a row is called something, three fields for a phone
view, an FTS5 projection, and a 1,024-byte embedding.

For a register of daily measurements that is all wrong, and one line of it is absurd: a marketing
record with twelve campaigns across six channels writes ~26,000 rows a year, which is **fine** —
about 6 MB in a 10 GB object, and the partial index is per-register so it never touches anything
else. But it also generates **26 MB of int8 embeddings of integers**, five times the size of the
data, polluting every `near` search with rows whose entire content is a number. And `seq` promises
that `campaign_day #18,432` is a name a human says, which nobody ever will.

```yaml
register: campaign_day
series: true          # no seq, no title, no mobile view, no FTS, no vector
key: [campaign, channel, day]     # what makes a row unique; upsert, never duplicate
```

| `series: true` turns off | Because |
|---|---|
| `seq` | a spoken id for an observation is a promise nobody wants kept |
| `title` and `mobile` | a Tuesday's ad spend is not a thing with a name |
| the FTS5 projection | there is no text |
| the vector | see the 26 MB |
| single-row create in the UI | these arrive from a connector, in batches |
| `matches`, `contains`, `near`, `starts`, `ends` in any `where:` over the register | refused at install: a series has no text (`SERIES_HAS_NO_TEXT`) |
| `series: true` turns **on**: `key:` | an idempotent upsert — one `CREATE UNIQUE INDEX entry_k_<reg>` over the key fields; the write resolves the row by its key first and then inserts or updates it by id, and a soft-deleted row with that key is revived rather than duplicated ([41-SPEC-KERNEL](41-SPEC-KERNEL.md) §5.4) — so re-fetching yesterday corrects it rather than duplicating it, which is the single most common failure of every analytics importer ever written |

**The storage was never the problem and no second table is needed** — this is the one-table
decision working exactly as designed. What was wrong was charging a fact the same tax as a thing.

### The field types, and the list is closed

`text` · `document` · `int` · `decimal` · `money` · **`quantity`** · `day` · `instant` ·
`duration` · `bool` · `enum` · `ref` · **`file`** · `url` · `email` · `secret` ·
`list<T>` · `json`

**Sixteen value types, plus two meta.** The two meta are `list<T>`, a *container* over a value
type, and `json`, the escape hatch. Counted: text, document, int, decimal, money, quantity, day,
instant, duration, bool, enum, ref, file, url, email, secret. They are counted separately because
the UI shows the count — a type picker of *n* cells — and a closed list whose stated number
disagrees with its own enumeration is the kind of imprecision that gets repeated in a README
forever.

### The canonical JSON of each, in one line apiece

| Type | Stored as | Type | Stored as |
|---|---|---|---|
| `text` | string — never JSON-quoted (`TEXT_JSON_QUOTED`, `TEXT_ESCAPED_NEWLINE` refuse at step 3) | `enum` | a string in `values` |
| `document` | string, the dialect, LF line endings | `ref` | the target `entry.id` |
| `int` | JSON integer, \|n\| ≤ 2^53 − 1 (`INT_OUT_OF_RANGE`) | `file` | `{ "sha256", "mime", "bytes", "name" }` |
| `decimal` | JSON number, ≤ 15 significant digits | `url` | absolute, `https:` or `mailto:` only |
| `money` | `{ "amount": int, "currency": "EGP" }` — never `minor` | `email` | one addr-spec, domain lower-cased |
| `quantity` | `{ "value": number, "unit": "m" }` | `secret` | the `grant.id` |
| `day` | `"YYYY-MM-DD"` | `list<T>` | a JSON array of T |
| `instant` | RFC 3339 UTC, `Z`, millisecond precision | `json` | any JSON |
| `duration` | integer seconds (displayed `3d 4h`) | | |
| `bool` | `true` / `false`, bound to SQL as `1`/`0` | | |

Byte-exact, and the authority is [34-GRAMMARS](34-GRAMMARS.md) §3; step 3 of the write path (COERCE)
parses to these shapes and nothing else, and the `where:` compiler compares against them.

*(Amended September 15th 2026: a pack's settings, its manifest's `config:` ([04-PACKS](04-PACKS.md) §2), take these
types, `text`, `enum`, `bool`, `money`, `day`, `duration` and `number` (a decimal), and are coerced to the same shapes by the same
step. A `ref`, a `secret`, a `file` and every other type are refused `CONFIG_TYPE_UNSUPPORTED`. The chosen values are
stored on the `pack` row's manifest, not in `entry`. Amended September 27th 2026: one more, `list`, lines of
text, at most 20 (a `max` narrows this), each coerced as a text setting's own line is.)*

**A text never holds a key.** A `text` or `document` value, or a `list<text>` element, that looks like
a credential is refused at step 3 as `VALUE_MALFORMED`, from every caller, with no `found` and a
sentence that says to deposit the key in the Keychain. Looking like one means an issuer's own prefix (a
private key's PEM header, `sk_live_`, `ghp_`, `github_pat_`, `xoxb-`, `AKIA` and the others
[25-CONNECTORS](25-CONNECTORS.md) §7 names), a JWT, a webhook address, a password in a URL, or a run of
32 or more base64 characters that mixes cases and digits and reads as random. Hex digests, git hashes,
ULIDs, UUIDs, a link's path and anything shorter pass. A public key or a wallet address does not,
because nothing tells it apart from a key.

Each type is a validator, a form control, a renderer, a `where:` compilation and a line in the MCP
schema. **A seventeenth is five pieces of work and a new way to be wrong**, which is the same
argument the pack kinds rest on, and it is why the two below were added only after a stress
test showed exactly what their absence cost.

> ### The two that were added, and why an earlier draft was wrong to stop at fourteen
>
> **`file` — `{ sha256, mime, bytes, name }`.** The audit's sharpest structural finding: BrainDog
> had an attachment **store** and no attachment **type**. R2 keys, per-record prefixes, a manifest
> that hashes the set, a `media` primitive sitting right there — and nowhere in a register
> declaration to say *"this row has a picture."* A fashion label got a list of hex digests.
>
> The security objection does not reach it. [04-PACKS](04-PACKS.md) §7 bans a **remote** asset,
> because a remote image URL is a callback with the record id in the query string. It explicitly
> permits same-origin paths. A first-party `/a/<sha256>` route serving bytes out of the record's
> own R2 prefix is not the banned thing, and never was. Attachments were deferred on **cost**, and
> the deferral was then read back as a position.
>
> **`quantity` — `{ value, unit }`.** Structurally identical to `money`, with a unit where `money`
> has a currency code, and the **same refusal**: two units are never added. `decimal` is
> a bare number, so `1.4` metres of fabric and `1.4` grams of trim were the same value and nothing
> stopped a metric summing them. This is not a fashion nicety — a dose recorded as `5` with the
> unit in an adjacent enum field is a patient-safety defect, and it is the exact class of bug
> money-as-minor-units exists to prevent. It reuses `money`'s validator, renderer and refusal
> almost entirely, which is why it costs far less than a genuinely new type.

Four of them are special:

- **`secret`** never stores a value in `fields`. It stores a `grant` id. The row shows *what the
  key opens*; the key itself is in the Keychain. See [12-SECURITY](12-SECURITY.md) §6. No caller writes
  it, a person included: the Keychain door seals a key and points the field at its grant in one write
  ([41-SPEC-KERNEL](41-SPEC-KERNEL.md) §5.4), and a create or update naming the field is
  `IMMUTABLE_FIELD`. So a secret is never `required`, never given a `default`, never searched and
  never a row's title.
- **`file`** never stores bytes in `fields` either — same pattern, one indirection. It stores the
  digest, and the bytes are in R2 under the record's prefix. So a `.brain` stays a text database,
  the 2 MB row ceiling is never in play, and an export's manifest can report a missing attachment
  rather than silently shipping a broken reference.
- **`ref`** is a soft reference to an `entry.id` in a named register. Deleting the target does
  not cascade; the reference renders as "deleted", because a dangling reference is information.
- **`quantity`** carries its unit into every comparison and every aggregation. `gt` between two
  quantities of different units is refused at install, exactly as it is for money.

### `list<T>`, and the syntax an earlier draft never wrote down

`list<ref>` is used throughout the corpus and **the declaration for its target register appeared
nowhere** — a plain `ref` takes `register:`, and nothing said where that goes inside a container.
It goes in `of:`, and a container declares its element the same way an element declares itself:

```yaml
- { id: tags,     type: list, of: { type: text } }
- { id: fabrics,  type: list, of: { type: ref, register: materials } }
```

**And the cost of using it for a relationship is now stated, because it is not obvious.** `has` /
`lacks` compile to `EXISTS (SELECT 1 FROM json_each(…))`, which **cannot use an index** — so the
*forward* read is free (the ids are on the row) and the *reverse* lookup is a full scan of the
register. For a handful of tags that is nothing. For "which styles use this fabric" across
thousands of rows it is the wrong instrument, and the right one is a junction register. The
validator does not refuse it; the register editor says so at the point of choosing.

### Field options added by the parity trace — `derive:`, `required_when:`, `unique:`, `immutable:`

[32-PARITY](32-PARITY.md) traced the working predecessor and found the gaps were not scattered:
nearly every one was a case where the brain **derives** something the record does not store, and
this model had no row-level derivation. These four options close most of the list. Each is a key on
a field declaration that already exists; none is a new type.

```yaml
fields:
  - { id: rev,     type: int }          # four judgements, 0–30 each
  - { id: unblock, type: int }
  - { id: clock,   type: int }
  - { id: cheap,   type: int }
  - { id: score,   type: int,  derive: { sum: [rev, unblock, clock, cheap] } }
  - { id: tier,    type: enum, values: [low, medium, high, urgent],
      derive: { band: { of: score, edges: [40, 60, 80] } } }
  - { id: tier_why, type: text, required_when: { field: tier, is: urgent } }
  - { id: currency, type: text, immutable: true, derive: { via: account, field: currency } }
  - { id: fingerprint, type: text, unique: true, derive: { normalise: lesson } }
```

| Option | Does | Refuses |
|---|---|---|
| **`derive:`** | a **row-level** derived value. **Seven shapes, and the list is closed:** `sum: [f, …]` and `diff: [a, b]` — a missing operand counts as 0 · `product: [a, b]` and `ratio: { of, per }` — a missing operand yields missing, and a zero `per` yields missing, never 0 · `band: { of, edges }` — the edges exclusive upper bounds mapped onto the field's `values:` in order, *n* edges ↔ *n*+1 values, else `BAND_EDGES_MISMATCH`; a missing input yields missing · `via: <ref>, field: <far field>` → the one-hop subquery of §6 · `normalise: f` → lower-cased and trimmed, whitespace kept. **The inlines are `where`'s** — one definition, [38-SPEC-WHERE](38-SPEC-WHERE.md) §5.6 — and the kernel imports them, so the stored `unique:` fingerprint and the compiled inline can never disagree. Operands are this row's field ids (numeric for the arithmetic four) or one `lookup` — never aggregations. **Never stored**: worked out when a row is read (`get` and every list page), never written into `fields`. A `where:` or an `order` that names a derived field is refused `MATCH_OP_UNSUPPORTED` in this build ("tier is worked out at read and never stored, so it cannot be filtered or sorted on."), because nothing stored could match it; the compiler does not inline it yet. Three of the shapes are the metric grammar's combinators (`diff` · `product` · `ratio`) and four are row-scoped only (`sum` over named fields, `band`, `via`, `normalise`); depth one; a derivation may not read another row except through one `via:` hop. **Kernel-written fields are not derivations**: `session.last_seen` is written at step 6 on every write from that session, and the identity accent is chosen at create by `@braindog/theme`'s `nextAccentHue` and stored frozen (ADR-028) — neither is a shape here, and an earlier draft of the kernel's own register used two operators (`touched_by`, `hue_from`) that this list never had | a derived field cannot be written, `index: true`, or `required`. **One exception:** `unique: true` on a derived field materialises the value into `fields` at step 6 of the write path so the partial unique index has an expression to cover — **the only stored derivation** |
| **`required_when:`** | a conditional requirement, `{ field, is }`: required while another field of the same row holds that value. `field` is a `text`, `enum`, `bool` or `int` of the register, and `is` is a value it can hold. *"An urgent tier says why"* was prose in the brain; here it is a refusal that names both fields. The leaf's other comparisons (`not in not_in gt gte lt lte before after between empty present has lacks`) are published and not read by this build (`NOT_IN_THIS_BUILD`), and `contains`, `matches`, `near` and `via:` never are (`REQUIRED_WHEN_OP_UNSUPPORTED`). **It borrows the leaf syntax and is not an eighth consumer**: it never compiles to SQL, and is one comparison against the row being written, made when either of the two fields is written, the way `transitions:` is | `REQUIRED_MISSING`, naming both fields |
| **`unique: true`** | a partial unique index over the register — `CREATE UNIQUE INDEX entry_u_<reg>__<field> ON entry(json_extract(fields, '$.<field>')) WHERE register = '<reg>' AND deleted_at IS NULL`. The refusal names the existing row by its spoken id — `ALREADY_KNOWN: LN7` — which is what makes it useful rather than merely correct | — |
| **`immutable: true`** | set once, on create. A later write to the field is refused with the reason. Distinct from `immutable_when:`, which locks a whole row by predicate | — |

**Why `derive:` is the important one, and why it is safe.** The brain parses a task's priority score
out of a *sentence* — `"Rev 30 + unblock 14 + clock 20 + cheap 20"` — because storing the number
would let it drift from the reasoning. That instinct is right and the mechanism is fragile. Four
`int` fields and a derived `score` keep the reasoning as data and the number as a consequence, which
is the brain's own philosophy — *derived, never stored* — applied to the one thing it stores. And it
cannot become a formula language: three of the seven shapes are the metric grammar's combinators, there
is no nesting, and a derivation over another register is a **metric**, not a field.

### Register options added by the same trace — `delete:`, `pairs:`, `repeat:` extensions

```yaml
register: accounts
delete: refuse_while_referenced        # 409, naming the count and the register. Archive instead.

register: transactions
pairs: { on: [currency, abs(amount)], opposite: amount, across: account, within: 4d, mark: moved }
```

| Option | Carries |
|---|---|
| **`delete: refuse_while_referenced`** | *"an account with transactions cannot be deleted — archive instead."* A reverse-reference check at delete time. `ref` stays soft everywhere else, because *deleting the target does not cascade* is the right default for a record and the wrong one for a ledger |
| **`pairs:`** | transfer detection: two rows with the same `|amount|` and currency, opposite signs, different accounts, within a window, **paired once** — a third equal row stays unpaired, and zero never matches. Rows are **marked, never hidden**: `mark:` names a `bool` field set `true` on both rows, and the kernel writes `_pair` beside it; the window runs over `date:`, which defaults to the register's sole `day` field ([41-SPEC-KERNEL](41-SPEC-KERNEL.md) §5.4; the keys are [42-SPEC-DECLARE](42-SPEC-DECLARE.md) §4.4). A bounded self-join the kernel implements, because a `where:` cannot say it and every ledger needs it |
| **`repeat:` gains `bymonthday: [15, -1]` and `workday: previous \| next \| none`** | *"a salary paid twice a month has DAYS"*: the 15th and the last day, each moved back to Friday off a weekend. RRULE cannot express the weekend shift; one post-rule can. Monthly on the 31st clamps to the month's end |
| **`name`** (required) and **`one:`** | the header title, and the singular for *"New obligation"*. `name` absent is a refusal at install — the id is never shown; `one:` absent is a warning, and the header reads *"New row"* ([29-EMERGENT-PAGES](29-EMERGENT-PAGES.md) §5) |
| **`identity: { mark?: <text field>, accent?: <int field>, picture?: <file field> }`** | the register's rows carry a mark and one accent hue, chosen once at create and validated distinct — [13-UI](13-UI.md) §2.1b, [32-PARITY](32-PARITY.md) §4.4, ADR-028. The hue is `@braindog/theme`'s `nextAccentHue` — the farthest point on the hue circle from every existing accent and from the three intent hues, deterministic — handed to the kernel as an injected chooser; the kernel stores it frozen and never computes a hue ([39-SPEC-THEME](39-SPEC-THEME.md)). *(An earlier draft put a golden-angle rule in the kernel.)* **`picture`** names the `file` field a row's picture is kept in, a project's logo or a person's photo, drawn in place of the mark or the first letter wherever the row is (the owner's word of 4 and 9 November). Projects declare all three; People and Organisations declare a picture alone, since a person is drawn as a face and wears no mark, and an organisation as its letter |
| **`predicates: { overdue: { … } }`** | named predicates in the `where:` grammar, referenced from any `where:` on the same register as the leaf `{ predicate: overdue }` — §6. A saved view **is** a named predicate, and since September 16th 2026 the record holds one as that rather than as a page: a view belongs to this register, carries its filter, the text that was searched for, its order and its columns, and is read back and listed by `view` and `views` ([45-SPEC-RECORD](45-SPEC-RECORD.md) §5.3). Saving one is `saveView` and taking one off is `retireView`, both the owner's, which is where the declaration write through `setDeclaration` had put it. **The order IS stored**, against an earlier draft that called it URL state: a view somebody saved while sorted by what is most overdue is not the same view re-opened in the record's own order, and the part that was lost was the part they had adjusted. The `{ predicate: … }` leaf is still refused by the grammar, so a saved view is not yet reachable from another register's `where:` ([50-SPEC-WEB](50-SPEC-WEB.md) §4.6) |

**`by: decide`, on a transition and on a field**, is the last addition, and it generalises two of the
brain's hard-coded routes:

```yaml
transitions:
  superseded: { to: [active], by: decide }                    # made only by an accepted proposal
fields:
  - { id: body, type: document, required: true, by: decide }  # a skill's text
```

The brain refuses an agent promoting a learning, and an agent deciding a question, with a
`HUMAN_ONLY` 403 on two specific routes. Here it is one word, and it works for any register. On a
transition it is a move only an accepted proposal makes. On a field it is a value set freely when the
row is made and changed afterwards only by an accepted proposal, which is how a skill's text and
version move: an agent proposes the new text, and the owner's one press applies it. A direct write
that would make the move or change the value is `FORBIDDEN` from every caller, the owner included, and
its sentence says to propose it. Who may accept is the level ladder's
([20-COLLABORATION](20-COLLABORATION.md) §1); `decide` is the one word the kernel reads.

### `transitions:` — an enum that knows which moves are legal

An `enum` gave a set of values and nothing else, so a generated form offered every value at every
moment. Nothing prevented `proto → top`, `paid → open`, or `discharged → admitted`; the
append-only log then recorded the illegal move faithfully, forever.

```yaml
- id: state
  type: enum
  values: [draft, posted, void]
  transitions:
    draft:  { to: [posted, void], requires: [date, narrative] }
    posted: { to: [void] }
    void:   { to: [] }
```

| Property | Consequence |
|---|---|
| A missing `transitions:` means **every move is legal** | additive. Every register written before this existed keeps working |
| A `create` may set **any** declared `state` value | `transitions:` govern *moves*, and the first value is not a move ([41-SPEC-KERNEL](41-SPEC-KERNEL.md) §5.4) |
| `requires:` names fields that must be filled for a move out of that state | the "you cannot post an incomplete entry" rule, declared; `REQUIRED_MISSING` names the first one missing |
| The generated form **omits** illegal targets rather than disabling them | a disabled control invites a question the UI cannot answer |
| The `move` rule action is validated against it at install | a rule that could never fire is caught in the diff, not in production |
| A refusal names both ends | `register.transactions: state cannot move draft → void … it can` reads as feedback |

It is a key inside a declaration that already exists: no new type, no new block kind, no parser
change. That ratio is why it is in the kernel rather than in a phase.

### `min:` / `max:`, `retired: true`, and what a type change is

Three field options the review found used and never defined, and one that was defined too loosely:

| Option | Does | Refuses |
|---|---|---|
| **`min:` / `max:`** | bounds on a field: UTF-8 bytes for `text` and `document`, the value for `int`, `decimal` and `duration`, the `amount` in minor units for `money` and the `value` for `quantity`. A `max` lowers a type's cap below and never raises it, and a `default` sits inside its own bounds. Checked on a create and on a field a write sets, so a row is not refused for a bound it predates. `url`, `email`, `json` and `list<T>` have sizes the caps below describe, and this build bounds none of them (`NOT_IN_THIS_BUILD`). The default caps for `text`, `document`, `url` and `email` are enforced on every write, in a list's elements too (`TEXT_CAPS` in `coerce.ts`, September 17th 2026); those for `json`, a list's length and a row's `fields` are not yet | `OUT_OF_BOUNDS`, naming the declared bounds |
| **`retired: true`** | the field stops rendering and stops being writable; the data stays in `fields` (§7). A retired field may not be `required`, `index`, `unique`, or in `search`/`mobile` | — |
| **`redact: true`** | withholds the field's values from the audit log at write — `from_v`/`to_v` are the literal `--redacted--` ([20-COLLABORATION](20-COLLABORATION.md) §8). `secret` and `money` fields are redacted always, with or without the key; `redact:` is how any other field joins the list | — |
| **a type change** | does not exist in v1: retire the field and add a new one. The conversion preview is authoring-tier scope | `FIELD_TYPE_CHANGED` |
| **removing `index: true`** | drops the index in the same transaction; nothing else changes | — |

### `scopes:` and `scope:`, where a row applies

A row applies everywhere, or in one project. There are two scopes and no third, as the owner set it. A project is a row of the one register that declares `scopes:`, which in the
shipped packs is `things`, labelled Projects.

```yaml
register: things
scopes: { repos: repos, folders: folders }   # the fields listing where each project lives
fields:
  - { id: repos,   type: list, of: { type: text } }   # github.com/acme/shop, or a bare name: shop
  - { id: folders, type: list, of: { type: text } }   # C:\Repos\shop

register: skills
fields:
  - { id: project, type: ref, register: things, scope: { widen: person, same: nearer } }
```

| Key | Does | Refuses |
|---|---|---|
| **`scopes: { repos?, folders? }`** | on a register: its rows are the projects. Each key names a `list<text>` field of the same register. One active register declares it, and a series cannot, because a run carries its project's spoken id | `DECLARATION_INVALID`; `FIELD_UNKNOWN` for a field the register lacks |
| **`scope: {}`** | on a field: it names the project a row belongs to, and absent is global. It is a `ref` to the register declaring `scopes:`, or a list of them, and a register has one. When a token's create leaves a `ref` out, the record fills it with the run's project | `DECLARATION_INVALID` |
| **`widen: person`** | a token's create lands in its run's project and names no other. A token may narrow a global row to a project, and never moves a row out of its project, to global or to another. That move is the owner's: one press, an `edit` event like any other. `any`, the default, holds a token to nothing | `FORBIDDEN`, whose sentence says to propose the move |
| **`same: nearer`** | when a run reads by scope, a project row hides a global row with the same title, so a project's own skill replaces the one of that name that applies everywhere. A finished project row hides nothing. `both`, the default, reads both | — |
| **`links: true`** | on a list of refs: a token may add a project and never remove one, which is how a person met in two projects stays linked to both | `FORBIDDEN` |

**How a run learns its project.** The record places a run when the ladder opens it, and again when it
re-attaches by its client id from a place it names:

1. A remote equal to a `repos` entry, compared without the scheme, the `user@` or a trailing `.git`, with
   the host lower-cased and `git@host:a/b` read as `host/a/b`.
2. Else a `folders` entry the working folder is in, with `\` read as `/`, the drive letter lower-cased, a
   trailing `/` dropped, and case ignored on a drive-letter path. The longest folder wins.
3. Else a `repos` entry with no slash equal to the repository's folder name, ignoring case.
4. Two projects matching at the same rung, or through folders of the same length, leave the run global
   and are both reported: filing work under a guess is worse than filing it nowhere. No match is global.

The answer is the run's `project`, the spoken id of the project row (`things#3`), written by the record
and by no caller. A run named by its spoken id keeps the project it was placed in, so a later write cannot
move it by sending other hints. **Scope is not access**: scope says where a row applies, and member levels
([20-COLLABORATION](20-COLLABORATION.md) §1) say who may read it, so a global key still opens only on a grant.

*(Amended September 15th 2026 for modularity: the register declaring `scopes:` is load-bearing rather
than an ordinary module, because every other pack's `scope: {}` field is a `ref` into it. Disabling or
uninstalling it while such a field still points at it is refused, naming what would orphan.)*

### The caps, and where they come from

| Cap | Value | Source |
|---|---|---|
| Fields per register | **64** | **a product decision, not a platform limit.** Fields live in JSON, so nothing in SQLite constrains this — a register with 65 fields is a database, and its owner needs a different product. Stated as a choice because deriving it from the 100-column ceiling was the error described above |
| Indexed fields per register | 8 | each is a partial expression index, which costs storage and write time rather than a column. Unbounded indexing is how a 10 GB budget and a write-row bill disappear. `INDEXES_OVER_CAP` counts the fields marked `index` or `unique`; a series' `key:` is one index and is not counted ([42-SPEC-DECLARE](42-SPEC-DECLARE.md) §5.3) |
| `document` field size | 512 KB | 2 MB row ceiling, with headroom for the rest of the row |
| Default value caps | `text` 16 KB · `json` 64 KB · `url`/`email` 2 KB · `list<T>` 1,000 elements · a row's `fields` 1 MB | every one refused as `OUT_OF_BOUNDS`, naming the bound; `max:` above may lower a cap, never raise it ([41-SPEC-KERNEL](41-SPEC-KERNEL.md) §5.4) |
| Registers per record | 64 | not a platform limit; a record with 65 registers is a database, and its owner needs a different product |
| Predicate nesting depth | 3 | counting the root group as level 1 — §6, [21-AUTHORING](21-AUTHORING.md) §4.4, [30-BLUEPRINT](30-BLUEPRINT.md) §7 |
| Blocks per page | 24 | [21-AUTHORING](21-AUTHORING.md) §11 |
| `limit` on a page block · on `list` | default 50, max 500 · default 25, max 200 | a page renders; an agent pages. [22-FRONTEND](22-FRONTEND.md) §4 has the rendering ceiling |

---

## 6 · The `where:` grammar — built once, used by seven things

This is the highest-leverage decision in the data model, and it is taken on precedent:
**Firefly III has 33 action classes and zero trigger classes**, because its triggers feed the
same search grammar that powers transaction search. One grammar, seven consumers:

| Consumer | Uses it for |
|---|---|
| **Pages** | which rows a block shows |
| **Rules** | when X, do Y |
| **Metrics** | what to aggregate over |
| **Alarms** | what makes something due |
| **Locks** | which rows have stopped being writable — §6.1 |
| **Predictions** | what an accepted change claimed it would do to a number — [24-SELF-IMPROVEMENT](24-SELF-IMPROVEMENT.md) §4.6 |
| **Ingest `match:`** | which raw payload a pattern claims — **and it is the one that runs against `inbox_raw`, not `entry`**, which is why it has a second compilation backend |

> **Seven, and this list is canonical.** Other documents have enumerated it as four, five, six and
> seven, and two of them named a different seven. **When a count is needed, cite this table rather
> than re-counting** — [ADR-013](16-DECISIONS.md), [06-PAGES](06-PAGES.md) §2 and
> [21-AUTHORING](21-AUTHORING.md) §4.1 all point here now. Register validation, digest sections and
> collaboration scopes *use* the grammar but are not separate consumers: they are the same compiler
> reached through a different declaration.

"New filter", "new trigger" and "new metric predicate" become **the same commit**. It saves
roughly two days of build and, more importantly, it is one thing to secure instead of seven.

### The grammar

```yaml
where:
  all:                                  # all | any | none
    - { field: state,  is: open }
    - { field: due,    before: "+30d" }
    - { field: amount, gt: { amount: 100000, currency: EGP } }
    - any:
        - { field: what, contains: "hosting" }
        - { field: tags, has: infra }
```

**The root production, which five documents used and none stated.** A predicate is a **group** —
`all:` / `any:` / `none:` over a list of predicates — **or a single leaf**, so
`where: { field: paid, is: false }` is legal at the root. An absent `where:` means every row
([08-METRICS](08-METRICS-AND-ANALYTICS.md) §2). Groups nest to **depth 3**, counting the root group
as level 1; a fourth level is refused at install (`PREDICATE_TOO_DEEP`), and same-quantifier nesting is
flattened on save ([21-AUTHORING](21-AUTHORING.md) §4.4). The EBNF, and every compile rule on this
page stated formally, is [34-GRAMMARS](34-GRAMMARS.md) §1.

| Operator | Applies to | Compiles to |
|---|---|---|
| `is` / `not` | all | `=` on `json_extract(fields, '$.<id>')`, which is the indexed expression; `not` is `(expr IS NULL OR expr <> ?)` — see *Missing values* |
| `in` / `not_in` | enum, ref, text | `IN (…)` up to 64 values; past 64, `IN (SELECT value FROM json_each(?))` with the whole list as one parameter. Money and quantity are still **chunked at 64 values**, chunks of `in` joined with `OR` and of `not_in` with `AND` inside one parenthesis, and the adapter's 100-parameter ceiling holds them because each value binds two |
| `gt` `gte` `lt` `lte` | int, decimal, money, quantity, day, instant, duration | comparison; money and quantity compare inside one currency or unit — see *Money and quantity* |
| `before` / `after` / `between` | day, instant | a bound parameter, resolved once at compile — see *Temporal literals*. `between: [a, b]` is inclusive of both ends |
| `contains` | text, document | **a field-scoped substring**, ASCII-case-folded: `instr(lower(json_extract(…)), lower(?)) > 0`. The literal is ≤ 40 bytes (`CONTAINS_TOO_LONG`). **Identical on both backends** |
| `matches` | the register | **register-wide full text**: `id IN (SELECT id FROM entry_fts WHERE register = ? AND entry_fts MATCH ?)` over the register's `search:` fields — the projected text is the `search:` values in order, lists joined by a space, fields by LF, whitespace collapsed. The operand is **one quoted phrase** with `"` doubled, so no FTS5 syntax is reachable from an author. Entry backend only; it takes no `field:` |
| `starts` / `ends` | text | `LIKE ? ESCAPE '\'` with `%` and `_` escaped in the literal; case-insensitive for ASCII only. The pattern is **hard-capped at 40 bytes** by the validator |
| `empty: true` / `present: true` | all | missing or not — `json_extract` yields NULL for an absent key and a JSON `null` alike, and the compiled test also catches `""` and `[]`, so the SQL and the prose agree ([38-SPEC-WHERE](38-SPEC-WHERE.md) §5). The value is always the literal `true` |
| `has` / `lacks` | `list<T>` | `EXISTS (SELECT 1 FROM json_each(…))`, and `NOT EXISTS` for `lacks`, which is true on a missing list |
| `near: { text, k }` | text, document | **ranking, not filtering** — see *`near`* below |
| `{ predicate: <name> }` | the register | a named predicate from the register's `predicates:` (§5), expanded at compile; the expansion counts toward depth 3; a cycle is refused (`PREDICATE_CYCLE`) |

**And one modifier, which is not an operator:**

| Modifier | Applies to | Does |
|---|---|---|
| `via: <ref field>` with `field: <far field>` | a `ref` field | dereferences **exactly one** hop, then applies the operator to `field:` on the target row. `{ via: period, field: state, is: closed }` reads *"the period this row points at is closed"* — **`via:` names the hop, `field:` names the field on the far side**, and `derive: { via: account, field: currency }` (§5) uses the same two keys the same way round. Compiles to `id IN (SELECT id FROM entry WHERE register = ? AND deleted_at IS NULL AND <leaf>)`, where `<leaf>` is compiled by the same rules as any leaf on that register — so `state` reads the column, and a soft-deleted period does not lock its postings. A second `via:` is refused (`VIA_TWICE`); a `via:` leaf may not itself carry `matches` or `has` — a subquery inside a subquery — and is refused `VIA_NESTED_SUBQUERY`. *(An earlier draft wrote `{ field: period, via: state }`, the two keys the other way round from `derive:`.)* |

**Six kernel fields are addressable in any `where:` and any aggregation** without being declared:
`id` `seq` `state` `created_at` `updated_at` `version`. `count: id` counts rows. They are typed — `id`
a `ref`, `seq` and `version` `int`, `created_at` and `updated_at` `instant`, and `state` the register's
own `enum`, only when it declares one ([38-SPEC-WHERE](38-SPEC-WHERE.md) §4).

#### Missing values

An absent key, a JSON `null`, `""` and `[]` are all **missing**. `empty: true` matches a missing value;
`present: true` does not. Every **positive** operator — `is in gt gte lt lte before after between has
contains matches starts ends` — is **false** on a missing value. Every **negative** operator — `not`,
`not_in`, `lacks` — is **true** on it, and compiles to `(expr IS NULL OR expr <> ?)` so the SQL agrees
with the reference evaluator the property test runs beside it. `none:` is `NOT (any: …)` over branches
already made two-valued by this rule. `bool` literals bind as `1`/`0`, because `json_extract` yields
integers and the `Sql` port's `Param` excludes booleans. SQL's three-valued surprises stop at the
compiler (ADR-058).

#### Temporal literals

A `day` literal is `YYYY-MM-DD`; an `instant` literal is RFC 3339. A **relative** literal is an anchor —
`today` `tomorrow` `yesterday` `bow` (the Monday of this week) `bom` `eom` `boy` `eoy` — or an offset `<sign><1–4 digits><d|w|m>`, where
`m` is a calendar month, clamped (`+1m` from 31 January is 28 February). It is resolved **once, at
compile time**, against `ctx.now` in `ctx.tz`, and every resolved literal is a bound parameter, never
inline SQL. Against a `day` field an anchor resolves to a calendar day; against an `instant` field `today`
is 00:00 in `ctx.tz` expressed as a UTC instant, and offsets apply to `ctx.now`. An unknown literal is
refused by name (`RELATIVE_LITERAL_UNKNOWN`); hours (`-1h`) are legal only in `remind:`, and an hour
offset against a `day` field is `RELATIVE_UNIT_FOR_DAY` — raised by `declare` at install, on the `remind:`
key, not by the compiler.

#### Money and quantity

A `money` field is read as **two expressions**, `json_extract(fields, '$.<id>.amount')` and
`json_extract(fields, '$.<id>.currency')`; `index: true` on a money field creates both. `gt gte lt lte
is not` on money compile to `currency = ? AND amount <op> ?` — a row in another currency does not match,
and is counted in `uses.currency_excluded`. A money literal without `currency`, or a `quantity` literal
without `unit`, is refused at install (`MONEY_LITERAL_NEEDS_CURRENCY` / `QUANTITY_LITERAL_NEEDS_UNIT`).
`quantity` reads `$.<id>.value` and `$.<id>.unit` the same way.

#### `near` is ranking, not filtering

`near: { text: "…", k: 20 }` is legal only as the **last leaf of a root `all:`** — never inside `any:` or
`none:`, never in a rule, a lock, a prediction or a `match:`. It orders the rows the rest of the predicate
already selected: the SQL yields ≤ 5,000 candidate ids, the record scores int8 cosine over `entry_vec` in
JS, and the result is truncated to `k` (default 20, max 100). It is outside the property test and covered
by its own fixture, and the operator is deferred past the §1b shape of [15-ROADMAP](15-ROADMAP.md).
[11-ASSISTANT](11-ASSISTANT.md) §5 has the embeddings.

> **`contains` is a substring test and `matches` is full text, and an earlier draft had one operator
> doing both.** `contains` compiled to FTS5 `MATCH`, which is register-wide and token-based — so
> `{ field: what, contains: "hosting" }` was satisfied by a `note`, and could not match half a word.
> The split is ADR-055: `contains` is `instr(lower(x), lower(?))` on one named field, the same SQL on
> `entry` and on `inbox_raw`; `matches` is the FTS5 set-membership test over the register's `search:`
> fields, and exists on the entry backend alone. Neither uses `LIKE`. `starts`/`ends` do, and that is
> where the platform's cap matters: Durable Objects cap a LIKE/GLOB pattern at **50 bytes** — and the
> attribution matters: **this is Cloudflare's limit, not SQLite's.** Stock SQLite defaults
> `SQLITE_MAX_LIKE_PATTERN_LENGTH` to **50,000**; workerd calls `sqlite3_limit(…, 50)`. **A thousand
> times tighter**, which is why the self-host adapter has to apply it deliberately rather than inherit
> it — [30-BLUEPRINT](30-BLUEPRINT.md) §13. A pattern longer than that fails as a query error, on a
> page that worked yesterday with a shorter phrase. So `starts`/`ends` — and `contains`, so that the
> two backends refuse identically — are capped at **40 bytes** by the validator, and the refusal
> happens at install, in a message naming the field, rather than at render. *(An earlier draft's
> refusal text quoted the 50-byte platform limit rather than the 40-byte validator cap; the message
> now states the cap it is enforcing.)*

### The second backend, which an earlier draft did not admit

**The ingest `match:` consumer predicates over `inbox_raw`, not over `entry`** — an email's sender
and subject are not register fields, have no expression index, and are not in `entry_fts`. So the
grammar has **two backends**, and they differ in exactly two things: **how a field is addressed**, and
**which operators exist**.

| | `entry` — pages · rules · metrics · alarms · locks · predictions | `inbox_raw` — ingest `match:` |
|---|---|---|
| a `field:` | a declared field, `json_extract(fields, '$.<id>')`; `state` and the six kernel fields read their columns | exactly `from` `to` `subject` `body` `channel` `state` `ts`. `from`/`to`/`subject` are `json_extract(headers, '$.<name>')` — headers are lower-cased on arrival; the rest are columns. Anything else is `MATCH_FIELD_UNKNOWN` |
| `contains` | `instr(lower(…), lower(?)) > 0`, ≤ 40 bytes | **the same** — same SQL, same cap |
| absent | — | `matches` `via` `has` `near` `starts` `ends`, refused at install (`MATCH_OP_UNSUPPORTED`) |

`instr()` has no pattern-length ceiling and no wildcard semantics, which is exactly right for
matching a sender or a subject literal — and it is now the same instrument on both backends. The
40-byte cap stays on both so that they refuse identically and an author never learns the difference.
*(An earlier draft compiled `contains` to FTS5 on one backend and `instr()` on the other, and called
them the same operator.)*

**And one note on the subquery ban.** The author-facing grammar refuses subqueries. The *compiler*
emits these internal subquery forms and no others — the FTS5 set-membership test for `matches`, the
`IN (SELECT id …)` hop for `via:`, `EXISTS (SELECT 1 FROM json_each(…))` for `has`/`lacks`, and
`IN (SELECT value FROM json_each(?))` for an `in` or `not_in` past 64 values — each
correlated to the current row or to a single register, none author-writable. That is what lets
`matches` sit inside `any:` and `none:` branches at all, and it is why a `via:` leaf may not carry
`matches` or `has` (`VIA_NESTED_SUBQUERY`). An earlier draft said one form, five paragraphs after
defining a second; the list above is the whole of them.

### 6.1 · `immutable_when:` — the fifth consumer, and it costs one predicate

An audit modelled a bookkeeping operation against this schema and found no way to freeze a closed
period. It enumerated every candidate and every one was the wrong instrument: `decision` is
immutable but is the wrong table, `retired` applies to a *field*, `deleted_at` is a soft delete
which is the opposite direction, and **no rule action refuses a write** — `stop` halts rule
evaluation, not the write itself. Its verdict: *"a ledger that cannot enforce its one invariant is
not a ledger,"* and *"for a bookkeeping product this is not a missing feature, it is a missing
control, and it is the one an auditor asks about first."*

The fix is one line on a register, and it is the grammar that already exists:

```yaml
register: postings
immutable_when:
  any:
    - { field: state, is: posted }
    - { via: period, field: state, is: closed }   # ONE ref hop — see below
```

> **An earlier draft wrote `in_state: closed` here, and that operator does not exist.** It was not
> in §6's table, and no operator in that table performs a ref hop — so the one control
> [ADR-019](16-DECISIONS.md) leans on to cover bookkeeping could not be written. **The fix is a
> modifier, not an operator:** `via: <ref field>` names the hop and `field:` names the field on the
> far side, and the *existing* operator applies to it. It compiles to a single indexed subquery on
> the target register (`deleted_at IS NULL` included), it is bounded by the same one-hop rule the
> grammar already states, and it adds **no** new operator to the closed list. `via:` is the one row
> of §6's modifier table.

A row matching the predicate refuses every write — field edit, state move, rule `set`, agent
`update`, and `create` into it. The refusal names the clause that caught it, so *"this posting is
locked because its period is closed"* is the message, never *"forbidden"*.

| It gives | Which vertical asked |
|---|---|
| A closed accounting period | bookkeeping |
| A posted journal that can be voided but never edited | bookkeeping, and it pairs with `transitions:` |
| A litigation hold, and a signed-off clinical record | clinic, law |
| A finalised invoice | freelancing — the one already in scope |

**Three things it is not.** It is not row-level security: a locked row is fully readable, and
[20-COLLABORATION](20-COLLABORATION.md) §1 still owns who can see what. It is not a delete guard —
`deleted_at` is a write, so a locked row cannot be deleted either, which is the point. And it is
not retention: making a row *un*deletable forever is a different declaration and a legal
liability, so `immutable_when` never blocks the erasure path in §10. **Compliance outranks the
lock**, and an erasure over locked rows writes its own event saying so.

The reason it is worth having at all is the ratio: it reuses the compiler, the validator, the
refusal vocabulary and the test harness of a grammar that was already built for four other things.
The whole feature is a predicate evaluated on the write path.

### What the grammar cannot express, on purpose

| Refused | Because |
|---|---|
| Arbitrary SQL | an `eval` by another name |
| Joins across registers beyond a single `ref` hop | unbounded query cost from a declaration a validator cannot reason about |
| Subqueries | same |
| Regular expressions | catastrophic backtracking from a text field somebody else can write into |
| Correlated aggregates | a metric over a metric is a report generator; that is a different product. §2.2 of [08-METRICS](08-METRICS-AND-ANALYTICS.md) adds a *closed* two-operand ratio, which is not this: both operands read one query |
| **A cross-row constraint** — "these postings must sum to zero" | it is a correlated aggregate evaluated on the write path, which is the most expensive thing on this list. See [ADR-019](16-DECISIONS.md): **BrainDog is not a ledger**, and says so |

A declaration that needs more than this is an **agent**, not a page. That is the escape hatch,
and it is the one the platform's governing rule already provides.

---

## 7 · Migrations

Two independent ladders, and conflating them is how a pack ecosystem breaks a database.

**Kernel migrations** are ours: `packages/kernel/src/migrations/NNNN_<slug>.ts`, numbered, forward-only —
**a `.ts` module exporting its SQL as a string**, never a loose `.sql` file, so the bundle carries it and
nothing reads a filesystem — applied in numeric order from the record object's constructor inside
`blockConcurrencyWhile()` so no request sees a half-migrated schema. The runner creates the `migration`
table itself, so no migration has to. Each runs in one `transactionSync` that also inserts its
`migration` row — `version`, `applied_at`, and a checksum that is the SHA-256 of the exported SQL after
CRLF→LF and trailing-whitespace strip ([34-GRAMMARS](34-GRAMMARS.md) §5), so a fixture hashes the same on
Windows and on Linux CI. A migration whose SQL carries the `-- format-bump` marker also sets
`PRAGMA user_version`; the rest do not, because the format revision and the kernel migration number are
different numbers ([03-DOG-FORMAT](03-DOG-FORMAT.md) §7). The runner is [41-SPEC-KERNEL](41-SPEC-KERNEL.md) §5.2.
*(An earlier draft said `.sql` files.)* A checksum mismatch, or a database newer than
the code, does not "refuse to start" in some vague sense: the runner sets a module-level refusal —
`SCHEMA_MISMATCH` | `SCHEMA_NEWER` — that every RPC returns as **503**, because a silently-diverged
schema is worse than an outage. The procedure is [33-CONTRACTS](33-CONTRACTS.md) §9, and
`applyMigrations` stays INTERNAL for the self-host path.

**Declaration changes** are anyone's who goes through the proposal path, not only a pack's
(corrected September 22nd 2026). A person in the register editor, or an agent
with a `change` proposal the person accepts, adds a field, a list or a relation to a live record
at run time; a pack is one way to bring several at once. The core ships a thing with an identity
and a history, and the metadata on it is added. Whoever makes the change, it never runs DDL **on a table** — no `CREATE TABLE`, no
`ALTER TABLE`, no `DROP`. Adding a field marked `index: true` does create an *index*, which is the
one exception and it is a narrow one: an index is derived, additive, droppable without touching a
row, and rebuildable from the data. The rule is therefore *"a declaration never changes the shape of
a table"*, which is what it was always for. An earlier draft said "never runs DDL" flatly, which the
expression-index model in §1 contradicts. Adding a field is a declaration edit;
existing rows simply lack it, and a `required` field added to a populated register is
**refused** — whoever adds it (a pack, a person or an agent's proposal) must supply a default or a migration *rule* that fills it, and the rule runs
through the same approval gate everything else does.

**A declaration is versioned by supersession, never edited.** `declaration` is keyed
`PRIMARY KEY (id, version)`; a new version inserts a row and sets `superseded_at` on the prior one in
the same transaction; the active declaration is `superseded_at IS NULL AND retired = 0`, and rows are
never deleted. Uninstalling a pack sets `retired = 1` on its declarations and emits one `uninstall`
event. *(An earlier draft keyed the table on `id` alone, under which a second version could not be
inserted, and said uninstall "removes" the rows.)*

Removing a field marks it `retired: true`: it stops rendering and stops being writable, and the data
stays in `fields`; a retired field may not be `required`, `index`, `unique`, or in `search`/`mobile`.
Changing a field's type is refused in v1 (`FIELD_TYPE_CHANGED` — retire it and add a new field), and
removing `index: true` drops the index in the same transaction. Nothing a pack does deletes a
customer's data. Uninstalling a pack retires its declarations and leaves every row it ever created,
orphaned but exportable — which is the promise, and it is only keepable because of the one-table
decision in §1.

---

## 8 · Provenance: every row knows where it came from

`event` is not a log we keep for support. It is a first-class part of the record and it is why
the `.brain` format has a whole section named for it.

Every write carries:

| Column | Example |
|---|---|
| `actor` | `sam` · `agent:claude` · `ingest:hsbc-sms` · `rule:renewal-30d` · `slash` — a pull connector is an `ingest` declaration, so its actor is `ingest:<id>`, never `pull:<id>` |
| `kind` | `create` · `edit` · `state` · `delete` · `decide` · `install` · `grant.read` · `note` — one of the **forty** kinds the `CHECK` in [30-BLUEPRINT](30-BLUEPRINT.md) §2 admits |
| `target` | `entry:01J…` · `decision:D41` · `pack:money-core` |
| `from_v` / `to_v` | the old and new value, when something changed (`from` is a SQL keyword). `--redacted--` when the redaction list withheld it at write ([20-COLLABORATION](20-COLLABORATION.md) §8); `--erased--` after an erasure (§10); `NULL` only when there was no prior value |
| `note` | one sentence a human reads in six weeks |
| `batch` · `op_id` | `batch` is the ULID of the triggering write, shared by everything it caused — a rule's `set`s, a `create` expansion — so undo is one query. `op_id` is the client's idempotency key: `CREATE UNIQUE INDEX event_op ON event(op_id) WHERE op_id IS NOT NULL`, and a replayed `op_id` returns the original result |

**How many rows a write makes.** A `create` is **one** row — `field` NULL, `to_v` the canonical JSON
(JCS) of the whole `fields`. An `edit` is one row **per changed field**, `from_v`/`to_v` the JCS of each
value. A state change is the `state` kind, for the `state` field alone. `record_version` is
`MAX(event.rowid)`, and the live channel's changelog is `SELECT DISTINCT target FROM event WHERE rowid > ?`
— `event` is append-only and per-mutation, so no second table is needed.

**The three-minute grace window, the one line that is rewritten.** An update by the row's creator within three
minutes of its `created_at` writes no `edit`: it rewrites the row's `create` line to the row as it now stands, so
the history says the row was created as it ended up, and typos fixed a moment later do not pile up. The line keeps
its `id`, `ts`, `batch` and `op_id` and moves to the end of the log (a new `rowid`), so `record_version` still moves
and the live channel still sees it. Nothing another actor read is ever folded: the fold happens only while the
`create` is the row's one line and is signed by the same actor, nothing another actor signed shares its batch, and no
other member's read mark (`member.seen_at`) has reached it. A rule's, an ingest's or a script's write, a state move,
a delete or restore, a write carrying a note or an `op_id`, and any write on a register that declares `pairs:` always
leave their lines. The kernel keeps the rule in `write` in `packages/kernel/src/index.ts`, beside the per-field lines.

Two consequences worth stating:

1. **`grant.read` is an event.** Every decryption of a credential is logged with the actor. A
   Keychain whose reads are not audited is a Keychain that cannot answer "did anything get out".
2. **An agent's writes are attributable.** `actor` distinguishes Claude from Codex from a rule
   from a human. This is the thing no vendor's memory store gives you, and it is cheap here.

---

## 9 · Deleting

| Level | Mechanism | Recoverable |
|---|---|---|
| A field | `retired` in the declaration | yes, data untouched |
| A row | `deleted_at` set, excluded from every query | yes, until purge |
| A row, really | the `purge` schedule kind, after 30 days | via PITR for 30 days |
| A pack | declarations retired (`retired = 1`), rows kept | yes |
| A credential | ciphertext zeroed, `grant` row kept with `revoked_at` | no, by design |
| **A customer** | **`deleteRecord`** — an ADMIN method, browser session, re-authenticated, the slug typed: a final snapshot into the record's prefix, then `destroy()` on the record (the alarm, then the storage), Slash's object, the R2 prefix, and the Directory forgets the slug ([53-SPEC-OPERATIONS](53-SPEC-OPERATIONS.md) §5.9, [51-SPEC-WORKER](51-SPEC-WORKER.md) §5.13). Self-service, because deletion is table stakes | no |
| **A person inside a customer's record** | §10. It is a different mechanism and this table used to omit it | no |

**Purge is one transaction, and every step is explicit** because nothing cascades by foreign key:
`DELETE FROM entry_vec WHERE id = ?`, `DELETE FROM entry_fts WHERE rowid = ?`, then
`DELETE FROM entry WHERE deleted_at < :cutoff`. `event` rows are kept, `seq` is never reissued (§1),
and one `purge` event by `system` records the count.

**`deleteAll()` removes the alarm too, at `compatibility_date >= 2026-02-24`** — verified
2026-09-01. Below that date it does not, and a deleted object leaves a timer that wakes a dead
record. The two-step procedure stays because it is correct under both, but see
[09-ALARMS](09-ALARMS-AND-NOTIFICATIONS.md) §1: **the real enforcement is a lint on the
compatibility date**, not a sentence here.

---

## 10 · Erasing a person, which is not the same as deleting a row

**This section fixes a contradiction, and the contradiction was structural rather than an
oversight.** An adversarial audit modelled a clinic against this schema and found that the model
has a *tenant* erasure story and no *data-subject* erasure story. The table in §9 had a row for "a
customer" and no row for "a person inside a customer's record" — and the difference is not
academic, because the second one is a legal obligation with a one-month clock on it.

Erasure was audited store by store. Three of them could not comply, **by construction**:

| Store | Holds a person's data | As designed |
|---|---|---|
| `entry.fields` | yes | ✅ `deleted_at`, purged at 30 days |
| `event.from_v` / `event.to_v` | **yes** — §8 stores the old and new *values* | ❌ append-only, no purge path |
| `event.note` | free text somebody typed | ❌ |
| `inbox_raw.body` | the original email, headers and all | ❌ no purge path documented anywhere |
| `ingest_receipt` | what was extracted from it | ❌ |
| `entry_fts` | the projected text | ❌ **undefined** — nothing said FTS rows are removed on purge |
| `entry_vec` | an embedding of that text, which is derived personal data | ❌ **undefined** |
| `decision.reason` | a sentence a human wrote about a person | ❌ **`NOT NULL`.** The schema forbade compliance |
| R2 attachment | the scan, the photo | ✅ delete the key |
| Backups and PITR | everything | 30-day lag — defensible; regulators accept backups being beyond use pending rotation |

> **`decision.reason NOT NULL` is the sharpest one.** A mandatory-reason column is the product's
> governance thesis, and as written it meant an erasure request could not be honoured without
> violating the schema. A rule that cannot bend at the one point the law requires is a rule that
> gets switched off entirely.

### The resolution: tombstone the payload, keep the fact

The append-only principle survives intact, because **the principle was never "keep the values
forever" — it was "nobody can rewrite what happened."** Those are different claims, and only the
second is load-bearing.

| Kept, always | Erased |
|---|---|
| `ts`, `actor`, `kind`, `target`, and the **name** of the field that changed | `from_v`, `to_v`, `note` → `--erased--` |
| `inbox_raw.ts`, `channel`, `sha256` | `body`, `headers` |
| `decision.id`, `decided_by`, `ts` | `reason` → `--erased--`, and `question` and `answer` likewise where they name the subject; the column stays `NOT NULL` and is never empty at write, so the invariant *"a decision always has a reason field"* still holds |
| the `ingest_receipt` row | what it extracted |
| the `suggestion`, `prediction`, `grant` and `device_grant` rows | `suggestion.body`, `prediction.claim`, `grant.label`/`hint`, `device_grant.label`/`ua` naming the subject → `--erased--` |
| the `person` mirror row | `email`, `name` → `--erased--` |
| the `job` and `job_event` rows | `job.args`/`result`/`error` and `job_event.body` naming the subject → `--erased--` |
| — | `observation` rows whose `subject` is the erased value: **deleted** |
| — | pending `schedule` and `outbox` payloads naming the subject: **cancelled**, payload → `--erased--` |
| the `access.revoke` event | the subject's `member` row: **deleted** |
| every row's existence, position and sequence | its content |
| **a new `erase` event** carrying the legal basis, the actor, the counts — and the subject only as a hash, so the value is never written again | — |

**One rule for the three sentinels.** A value withheld at write by the redaction list is the literal
`--redacted--` ([20-COLLABORATION](20-COLLABORATION.md) §8); a value removed later by an erasure is the
literal `--erased--`; `NULL` means only *"there was no prior value"*. Three states, three spellings —
an earlier draft used `NULL` for two of them, and a reader could not tell *nothing* from *removed*.

The erasure is itself the most auditable thing in the record. You cannot tell what was erased; you
can always tell **that** it was, by whom, under what basis, and when. That is a stronger position
than either extreme, and it is the same instrument as the per-field redaction list in
[20-COLLABORATION](20-COLLABORATION.md) §8 — **applied retroactively instead of prospectively.**
One mechanism, two directions, one new event kind.

### Why the existing redaction list did not already cover this

Because it is a **design-time opt-out**. It requires having decided, before the person existed,
that a given field is sensitive. It cannot answer a request about somebody whose name a user typed
into a free-text `note` in 2024. Prospective redaction and retroactive erasure are not the same
control, and the audit found the corpus treating them as if they were.

### And the cascade, which is the part that gets forgotten

`erase(subject)` touches **twenty** stores. **Nineteen are one transaction; the twentieth cannot be.**
An earlier draft counted eight and audited seven, a later one sixteen — and before that claimed all of
them were one transaction; the review kept finding places a person can be named. The enumeration is
[41-SPEC-KERNEL](41-SPEC-KERNEL.md) §5.9's:

| | |
|---|---|
| **One transaction — nineteen** | `entry` · `entry_fts` · `entry_vec` · `event` · `inbox_raw` · `ingest_receipt` · `decision` · `suggestion.body` · `prediction.claim` · `grant.label`/`hint` · `device_grant.label`/`ua` · `schedule` payloads · `outbox` payloads (both cancelled) · `observation` (rows whose `subject` is the value, deleted) · `person` (`email`, `name` → `--erased--`, the row kept) · `member` (the row deleted; the `access.revoke` event stays) · `job` (`args`, `result`, `error`) · `job_event` (`body`) · `metric_point` (aggregates only, no row names a person — walked so the count is honest) |
| **Not in it — the twentieth** | **the R2 prefix.** Deleting an object is an outbound call, and [01-ARCHITECTURE](01-ARCHITECTURE.md) §2 forbids the record making one. It goes on the **outbox** as `erase.r2`, drained by the Worker |

So the honest guarantee is: **the record is erased atomically; the attachments are erased within the
outbox lease window, and a reconciliation job asserts it.** Saying "one transaction" over a store
the object cannot reach is the kind of claim that is only false on the one path where it matters.

The two stores that were *undefined* are the two that would have leaked: an FTS index still answers a
search for a name whose row is gone, and a vector still answers `near`. Both are now explicit steps
with their own tests.

> **This is not a clinic feature.** Any B2C marketing list has unsubscribed leads with the same
> right; any HR use has ex-employees; any agency holds a former client's contacts. The audit found
> this blocks four verticals, not one. It is the cheapest item on the whole remediation list and it
> is a correctness fix, so it ships in the kernel rather than in a phase.

---

*Next: [03-DOG-FORMAT](03-DOG-FORMAT.md) — the file this schema exports to, and the acronym.*
