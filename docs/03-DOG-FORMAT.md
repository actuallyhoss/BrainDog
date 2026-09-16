# 03 · The `.brain` format

The file a customer owns. One file, self-describing, openable with tooling that already exists
on their machine, and the physical proof behind the claim *"your data, your database."*

---

## 1 · The acronym, and why the extension moved

> ### **Data, Origin, Governance** — the three sections, and `.brain` the file

Not a backronym. The file has exactly three layers and they are those three, because those three
are what makes this product different from a notes app:

| Layer | Holds | Why it is a layer and not a table |
|---|---|---|
| **Data** | the rows — obligations, domains, services, people, tasks | what every competitor has |
| **Origin** | where each row came from: actor, ingest receipt, arrival time, raw payload | *no vendor's memory store records who wrote a fact* |
| **Governance** | decisions with mandatory reasons, suggestions, packs, grants | the decision gate is the differentiator, so it is structural |

The three sections are addressable independently, which is what makes the useful operations
cheap: export data without origin (a clean handover), export origin without data (an audit),
export governance alone (share a way of working — that is a **pack**).

**The sections are named for what they hold. The extension is not, and it moved.** The file was
`.dog` because the three sections spell it, and that is the one thing the acronym could not keep:
**`.dog` now names a page's source** — one page, one file, `project.dog`, the text somebody gets when
they open the source of a page ([06-PAGES](06-PAGES.md) §1) — so the whole record takes the name it
was always describing, **`.brain`**, and its canonical dump **`.brainl`**. Data, Origin and Governance
are untouched: they are this file's sections, they are what `dog_section` assigns every table to, and
they were never the extension.

**The bytes keep the old spelling, on purpose.** `application_id` is `DOG!` (§2), the dump's magic
line is `#dogl <n>` (§2), and the four header tables are `dog_meta`, `dog_section`, `dog_manifest`
and `dog_sig` (§3). Those sit inside files that already exist and are checked by readers that already
ship; renaming them would be a format revision (§7) bought for nothing, and §7 rule 4 is that the
format's identity never changes. What a file is **called** and how a reader **recognises** it are two
different facts, and only the first one changed. *(This document keeps its own file name for the same
reason: every `03 §n` citation and link in the other fifty resolves.)*

**Runner-up, rejected:** *Declarative Object Graph*. Accurate about the shape, and it reads well
to an engineer — but the store is relational, not a graph, and naming it a graph is the kind of
imprecision that gets repeated in a README forever. **Data, Origin, Governance** also gives the
format its section names, which an acronym that only describes shape does not.

---

## 2 · It is a SQLite database, and that is the whole trick

```
$ file portfolio.brain
portfolio.brain: SQLite 3.x database, application id 1145193761

$ sqlite3 portfolio.brain "select seq, json_extract(fields,'$.what'), json_extract(fields,'$.due')
                         from entry where register='obligations' and state='open' order by 3"
7|Cloudflare Workers Paid|2026-09-01
9|brain.dog renewal|2027-08-30
```

No SDK. No import step. No proprietary reader. A customer can verify what we hold about them
with a tool that ships with macOS.

**Typed by the platform's own mechanism**, not by a convention:

| Header field | Offset | Value |
|---|---|---|
| Magic string | 0 | `SQLite format 3\0` |
| `PRAGMA user_version` | 60 | the `.brain` **format revision** — `1` at v1, bumped only when an older reader would misread (§7). *An earlier draft printed `3`* |
| `PRAGMA application_id` | 68 | `0x444F4721` = `DOG!` = 1145193761 |

`application_id` at offset 68 is SQLite's documented field for exactly this purpose, with a
registry in the SQLite source's `magic.txt`. Setting it means `file(1)` names the format and any
tool can refuse a file that is not one, before reading a byte of content.

Inside a Durable Object the two PRAGMAs are **best effort** — whether they take is measured by a
conformance case, never assumed — so the format number that is authoritative is the one written three
ways as data: `record.format_ver`, `dog_meta.format` and the `#dogl` header line. The CLI and the
self-host set both PRAGMAs when they materialise a `.brain` ([41-SPEC-KERNEL](41-SPEC-KERNEL.md) §5.2,
[48-SPEC-CLI](48-SPEC-CLI.md) §5.5).

### Why not a zip container

`.docx`, `.epub` and `.sketch` are zips. It is a perfectly good design and it is wrong here:

| | Zip of JSON/CSV | **SQLite** |
|---|---|---|
| Query without unpacking | no | **yes** |
| Partial read of a 400 MB file | no | yes |
| Incremental write | rewrite the archive | a transaction |
| Corruption blast radius | the whole member file | one page, and WAL recovers it |
| Matches the live store | needs a serialiser and a parser, both of which can drift | **the live store already is this** |
| Human-openable | needs unzip plus a JSON viewer | `sqlite3` |

The last row is decisive. The record lives in a SQLite Durable Object, so the export **is** the
live store rather than a rendering of it. There is no serialiser to write, therefore no serialiser
to have a bug in, therefore no way for the exported file to disagree with the record. **A format
that cannot drift from its source is worth more than a format that is prettier.**

> ### But not by `VACUUM INTO`, and an earlier draft said so
>
> *"Export is `VACUUM INTO`; import is `ATTACH` and copy."* **Neither works inside a Durable
> Object.** Verified 2026-09-01: the supported-extension list is FTS5, JSON and math functions;
> ATTACH is not on it, workerd sets `sqlite3_limit(SQLITE_LIMIT_ATTACHED, 0)`, and its source
> comments that *"we do not support attached databases. It seems unlikely that we ever will."*
> `VACUUM INTO` needs a second database and is expected to fail for the same reason.
>
> **So the record never writes a SQLite file. It streams a canonical logical dump** — `.brainl`: a
> `#dogl <format>` first line, which is the magic a reader checks, then for each table a `#table` header
> and one JCS array per row — header tables first, `dog_sig` last, `local` omitted — in pages of ≤ 1,000
> rows through `export(cursor)`. The line format has one home, [41-SPEC-KERNEL](41-SPEC-KERNEL.md) §5.10,
> and every other spec cites it. The `.brain` is **materialised outside the object** by something that has a real
> SQLite: `braindog export` on the CLI, and the self-host, which is writing to disk anyway. Cloud's
> nightly R2 backup is the dump sealed with age, `.brainl.age`. The property survives intact because both
> containers carry the *same tables and the same rows* under the *same manifest*; what changes is
> **where the bytes are written**, and therefore where the round-trip test lives. *(An earlier draft had
> the Worker "assembling the file through the storage adapter" — workerd has no SQLite engine outside a
> Durable Object and no filesystem, so there was nothing to assemble it with. ADR-034.)*
>
> One consequence worth stating: **"byte-identical round trip" needs a qualifier.** Three runtimes
> run three SQLite versions, and page layout is not portable across them. The gate is a canonical
> *logical* dump — rows ordered by primary key, columns in declared order, NULLs normalised — plus
> matching manifest hashes. Literal byte identity is asserted nightly, on one pinned build, because
> it is a property of a *build* rather than of the *format*.

### Two containers, one content, one manifest

| | `.brain` | `.brainl` |
|---|---|---|
| Is | the SQLite file this document is about | the canonical logical dump of [41-SPEC-KERNEL](41-SPEC-KERNEL.md) §5.10: `#dogl` first, one JCS array per row, tables in section order, `dog_sig` last |
| Made by | the CLI and the self-host, from a `.brainl` or from a live file | the record, streamed in pages of ≤ 1,000 rows |
| Opens with | `sqlite3` | any text tool |
| Signed over | the same `dog_manifest` | the same `dog_manifest` |
| Cloud's backup | — | `.brainl.age`, nightly, 30 days |

`braindog verify` and `braindog import` accept either. The `.brain` is the thing a customer keeps; the
`.brainl` is how it leaves a Durable Object. [33-CONTRACTS](33-CONTRACTS.md) §9 has both procedures.

---

## 3 · Layout

The schema is the kernel's twenty-seven tables from [02-DATA-MODEL](02-DATA-MODEL.md) §1 plus four
header tables — **thirty-one in a live record**, DO and file alike, because migration 0001 creates the
header tables in every live database and the self-host's live file *is* its `.brain`. Section membership
is a property of each table, declared in `dog_section` so a reader can project without knowing our
table names.

```sql
CREATE TABLE dog_meta     (key TEXT PRIMARY KEY, value TEXT NOT NULL);   -- format, created_at, producer, record_slug, tz, locale — no export timestamp
CREATE TABLE dog_section  (table_name TEXT PRIMARY KEY,
                           section TEXT NOT NULL CHECK (section IN ('data','origin','governance','local','header')));
CREATE TABLE dog_manifest (table_name TEXT PRIMARY KEY, rows INTEGER NOT NULL, sha256 TEXT NOT NULL);
CREATE TABLE dog_sig      (alg TEXT NOT NULL CHECK (alg = 'ed25519'), key_id TEXT NOT NULL,
                           public_key TEXT NOT NULL, sig TEXT NOT NULL, signed_at TEXT NOT NULL);
```

`dog_manifest` and `dog_sig` are refreshed by an export and sit **empty in a live DO**; `dog_meta`
carries no export timestamp — that is `dog_sig.signed_at` — so an unchanged record exports identical
bytes. The fifth section, **`local`, never travels**: `token`, `device_grant`, `auth_fail`, `observation`, `job`,
`job_event` — six tables that are either lockouts and bearer hashes, or telemetry and transient work that is
the record's business and nobody else's. **`vault_key` travels, sealed**: a wrapped key opens nothing without
the root KEK it is wrapped by, and a backup a record can be restored from must carry it, or the sealed grants
beside it are noise. `dog_section` still lists each of them, as `local`, so a reader
can tell an *omitted* table from a *missing* one. `counter` travels, because `seq` allocation must
survive a move. Twenty-five tables in an export, then: thirty-one, less the six. *(An earlier draft
had three sections and no rule for what stays behind.)*

`dog_manifest` hashes a **canonical projection** — rows by primary key, each row the JCS array of its
column values in declared order (NULL → `null`, BLOB → `{"b64": …}`), LF-joined, SHA-256 in lower-case
hex ([34-GRAMMARS](34-GRAMMARS.md) §5) — not the raw page bytes. SQLite page layout varies with vacuum
state and version, so hashing bytes would make every export a different file for the same content.
Hashing content means two exports of an unchanged record are provably identical, which is what lets a
customer diff their own backups — and it is why a `.brain` and a `.brainl` of the same record carry the same
manifest.

---

## 4 · Signing, and what a signature does and does not claim

`dog_sig` holds an Ed25519 signature by the **producing instance's** key over the **signed bytes**: the
canonical projection (§3) of `dog_manifest`, ordered by `table_name`. Keys are raw 32-byte Ed25519 in
base64url; `key_id` is the first 16 hex characters of SHA-256 over the public key.

It claims: *this file was produced by that instance, and no row has changed since.*
It does not claim: the contents are true, or that we vouch for a third party's file.

The private key lives in the record's own vault — `vault_key(purpose = 'signing')`, wrapped like the
DEK ([12-SECURITY](12-SECURITY.md) §6) — and is generated on first run, self-host and Cloud alike.
Cloud shows the public half in the UI and serves it at a well-known URL — `GET /.well-known/braindog-key`
→ `{ key_id, public_key }`, on both hosts — so a customer can verify a backup they downloaded a year ago
against a key they can independently fetch. **That sentence is specified and not built, in both of its
halves.** No host serves the path: the only thing answered under `/.well-known/` is `braindog-build`, a fact
about the deployment rather than about a record, and the self-host's own route table does not carry the key
route either ([49-SPEC-SELFHOST](49-SPEC-SELFHOST.md) §4.7). Nor does a record publish the key in the UI:
`boot` does not carry it, so the export screen draws one for the built-in sample alone and tells a live
record that the public half is not shown there yet ([53-SPEC-OPERATIONS](53-SPEC-OPERATIONS.md) §4). The
path, the body and the reason stand as specified, and they keep them when they land.

Verification is offline and dependency-free, and accepts either container. `--key` is optional: without
it the signature is checked against the key the file carries and reported as **`unpinned`**, which is a
weaker claim and says so ([48-SPEC-CLI](48-SPEC-CLI.md) §5.6):

```
braindog verify portfolio.brain --key <pubkey|url>
  ✓ application_id  DOG!            ✓ format 1
  ✓ 25 tables, 3,118 rows           ✓ manifest hashes match
  ✓ signature valid                 produced 2026-08-31T15:04:11Z by rec_01J…
```

Twenty-five is the thirty-one of a live record less the six `local` tables that never travel (§3);
`dog_section` names each omitted table as `local`, so the count is a check, not a surprise. *(An earlier
draft printed `format 3`; v1 ships at `1` — §7.)*

---

## 5 · Encryption: the file is readable, the grants are not

Whole-file encryption would destroy the property that makes the format worth having — that a
customer can open it with `sqlite3`. So the file is plaintext **except** the one thing that must
never be:

- Every other table is readable. That is the point.
- `grant.ciphertext` is **AES-256-GCM** and stays encrypted inside the export. The key is not in
  the file and never has been.
- An export therefore carries the *shape* of the vault — labels, what each key opens, when it
  was rotated — and none of its secrets. This is the right default: a backup you can inspect,
  that cannot leak a token if it ends up in the wrong Dropbox.
- The `local` section (§3) is not in the file at all: agent tokens, device grants, lockouts, observations
  and the job tables never leave the record. Sealed grants travel, and so does `vault_key` — wrapped keys
  that open nothing without the root KEK, which is a Worker secret and is never in any file. A restored
  record can read its own vault; a thief with the file cannot.

```
braindog export --with-grants    # requires the passphrase, re-wraps to a passphrase-derived key — CLI: later (48 §10)
braindog export                  # default: grants present but sealed
braindog export --redact-grants  # grant rows kept, ciphertext dropped entirely
```

For at-rest paranoia there is a sealed variant — `.brain.age`, or `.brainl.age` for the dump — the whole
file encrypted with [age](https://age-encryption.org) to a recipient key. It is a wrapper, not a
second format: unwrap and you have a `.brain` or a `.brainl`. Cloud's nightly backups to R2 are
`.brainl.age`, so an R2 compromise yields ciphertext.

See [12-SECURITY](12-SECURITY.md) §6 for the key hierarchy.

---

## 6 · What the format is *for*

Five operations. Each one is a promise from D41 made mechanical.

| Operation | Command | Note |
|---|---|---|
| **Leave** | `braindog export` | Complete. Not a CSV dump — the running record, packs and history included. There is no lock-in to argue about |
| **Arrive** | `braindog import portfolio.brain` | Into Cloud or a self-host. Same file both directions |
| **Back up** | Cloud: nightly `.brainl.age` to R2 under the record's own prefix, 30 days — so deleting a record is one prefix. Self-host: the `Snapshots` port — nightly `VACUUM INTO` (permitted there), keep 30 | Cloud additionally has platform PITR at any point in 30 days. **A snapshot is not an export**: it is a full copy that keeps the six `local` tables and never leaves the host — disaster recovery, not portability. An export is the `.brain` without them ([53-SPEC-OPERATIONS](53-SPEC-OPERATIONS.md) §5.4, [49-SPEC-SELFHOST](49-SPEC-SELFHOST.md)) |
| **Fork** | `braindog export --sections governance` | Governance alone *is* a pack. This is how a way of working gets shared — see [04-PACKS](04-PACKS.md) |
| **Audit** | `braindog export --sections origin` | Hand an accountant the provenance without the data |

### Export and import, in one table

| | Export | Import |
|---|---|---|
| Who | the record streams `.brainl` pages of ≤ 1,000 rows through `export(cursor)`; the CLI or the self-host writes the `.brain` | `import`, into an **empty** record only (`IMPORT_NOT_EMPTY`) |
| Checks | signs the manifest with `vault_key(purpose = 'signing')` | verifies signature and manifest; refuses a `user_version` above its own (`FORMAT_NEWER_THAN_READER`) |
| Rows | every table not in `local`; grants sealed unless `--redact-grants` | tables copied in batches of ≤ 30 rows × ≤ 3 params; `entry_fts` rebuilt from `entry`; one `import` event |
| Not | the six `local` tables | the write path — this is *"no import that bypasses validation"*, not a replay of every write. `restore` is PITR-only and one ADMIN method — on Cloud the Worker performs the platform's point-in-time step before calling it ([51-SPEC-WORKER](51-SPEC-WORKER.md) §5.14) |

The full procedure, both directions, is [33-CONTRACTS](33-CONTRACTS.md) §9.

> **PITR is Cloud-only and this is documented, not hidden.** SQLite Durable Object
> point-in-time recovery is a platform feature with a 30-day window and it does not exist in
> local development or on a self-hosted Node instance. The self-hosted build therefore ships a
> scheduled `.brain` snapshotter with configurable retention. Parity in *capability*, different in
> *mechanism* — and [01-ARCHITECTURE](01-ARCHITECTURE.md) §4 lists it as the `Snapshots` port, one
> of nine, rather than leaving it to be discovered.

---

## 7 · Versioning

Three numbers, one home each — and an earlier draft had them sharing a slot:

| Number | Lives in | At v1 | Moves when |
|---|---|---|---|
| the `.brain` **format revision** | `record.format_ver INTEGER`, `dog_meta.format` and the `#dogl` header — authoritative; `PRAGMA user_version` carries the same number, set by the CLI and the self-host when they materialise a file and best effort inside the record (§2) | **1** | an older reader would **misread** the file — a migration module carrying `-- format-bump` |
| the **kernel migration number** | `MAX(migration.version)` | 1 | every applied kernel migration ([02-DATA-MODEL](02-DATA-MODEL.md) §7) |
| the **primitives version** | `PRIMITIVES_VERSION` in the renderer | 1 | the eight primitives change ([31-STACK](31-STACK.md) §6) |

`braindog --version` prints the tuple — `app <date>+<sha> · format <user_version> · kernel <migration> ·
primitives <PRIMITIVES_VERSION>` — and the app has no semver. The rules are the boring ones, which is
correct for a file format people trust with financial records:

1. **Additive changes do not bump the format.** A new table or column is a kernel migration and moves
   `MAX(migration.version)`; `user_version` moves only when a reader that knows the old revision would
   read the new file *wrongly*, not merely incompletely.
2. **A reader refuses a `user_version` above the one it knows** (`FORMAT_NEWER_THAN_READER`). Silently
   ignoring unknown governance is how a decision gate stops gating.
3. **A reader accepts every version below.** Upgrade on import, in a transaction, with the
   pre-upgrade file kept beside it.
4. **`application_id` never changes.** It is the format's identity, not its version.

*(An earlier draft printed `3` at v1; another document made `user_version` the migration number; a third
typed `format_ver` as a semver string. The review found three definitions, and this table is the one.)*

---

## 8 · Attachments

Attachments do not go in the file. A `document` field is capped at 512 KB by the row ceiling, and
a record with fifty PDF invoices in it would blow the 10 GB object budget and make every export
enormous.

Instead: attachments live in R2 (Cloud) or on disk (self-host), keyed by
`sha256(content)` **prefixed by the record id**.

> The prefix is not decoration. Content-addressed keys in a *shared* bucket leak whether another
> tenant already holds a given file — upload a PDF, observe a dedupe, learn something you were
> never shown. This was found in the prior research as task 210 and it is the class of bug that
> only turns up by thinking about it. Keys are `rec_<id>/<sha256>`, always, and dedupe is
> per-record only.

`braindog export --with-attachments` produces `portfolio.brain` plus `portfolio.brain.files/<sha256>`, one
file per digest, and **the content address is the check**: a `file` field names its bytes by SHA-256, so
a missing or altered attachment is detectable rather than silent, and nothing is added to the signed
manifest ([48-SPEC-CLI](48-SPEC-CLI.md) §5.4). *(An earlier draft had the manifest hash the set.)*

### What refers to one, which an earlier draft never said

This section described a **store** and the record had no **type** — so nothing in a register
declaration could say *"this row has a picture"*, and an audit modelling a fashion label found it
got a list of hex digests. [02-DATA-MODEL](02-DATA-MODEL.md) §5 now has `file`:

```json
{ "sha256": "9f2c…", "mime": "image/avif", "bytes": 184320, "name": "AW26-look-04.avif" }
```

The field holds the digest; the bytes are in R2 under the record's prefix; a first-party
`GET /a/<sha256>` route serves them and `PUT /a/<sha256>` uploads them — the client names the hash, the
server verifies it, and a mismatch is `CHECKSUM_MISMATCH` ([51-SPEC-WORKER](51-SPEC-WORKER.md) §5.5,
[12-SECURITY](12-SECURITY.md) §8). *(An earlier draft had a store and no way in.)* **That route is same-origin, which is the distinction the
security rule always turned on** — [04-PACKS](04-PACKS.md) §7 bans a *remote* asset because a
remote image URL is a callback carrying the record id, and it explicitly permits same-origin
paths. Attachments were deferred on cost, and the deferral was later read back as a position.

Two consequences for this format:

| | |
|---|---|
| A `.brain` stays a text database | the 2 MB row ceiling is never in play, and `sqlite3` output stays readable |
| An erasure ([02-DATA-MODEL](02-DATA-MODEL.md) §10) deletes the R2 key **and** the `file` field still names the digest | a missing attachment is already detectable rather than silent, which turns out to be exactly the behaviour a lawful deletion needs |

---

*Next: [04-PACKS](04-PACKS.md) — the extension format, and why no code ever runs.*
