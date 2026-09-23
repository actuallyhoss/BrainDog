# 53 · Operations — specification

Cross-cutting. Derives from [03-DOG-FORMAT](03-DOG-FORMAT.md), [12-SECURITY](12-SECURITY.md) §6–§9,
[33-CONTRACTS](33-CONTRACTS.md) §6–§10, [30-BLUEPRINT](30-BLUEPRINT.md) §11 and §13, [02-DATA-MODEL](02-DATA-MODEL.md)
§9–§10, [09-ALARMS](09-ALARMS-AND-NOTIFICATIONS.md) §1, [ADR-052](16-DECISIONS.md), [ADR-053](16-DECISIONS.md),
[ADR-059](16-DECISIONS.md), [25-CONNECTORS](25-CONNECTORS.md) §9, [26-BYO-INTELLIGENCE](26-BYO-INTELLIGENCE.md) §5 and
[31-STACK](31-STACK.md) §6. Where the Worker (51) or the CLI (48) already fixed a mechanism this spec uses it by name.

> A runbook is a numbered list a tired person can follow at 3 a.m. Every procedure in §5 has a precondition, steps,
> a verification and a rollback, in that order, and names the command rather than describing it. Where the corpus
> decided a mechanism this spec cites it; where it did not, §13 decides and names the document to amend.

---

## 1 · Purpose and boundary

**What it does.** The complete set of procedures an operator runs against BrainDog Cloud — one Worker, three Durable
Object classes (33 §7) — and against a self-host — one Node process (33 §6) — and the surface those procedures use.
It is the runbook set. There is no `docs/ops/` directory; this document is it.

**What it refuses.**

- No operator console and no admin token (ADR-060). Every per-record action runs as the owner — a browser session, or
  an operation grant the owner approved (48 §5.2) — or as `system` from the Worker's own schedule. The operator's
  tools are `wrangler`, `age`, `braindog` and `docker`.
- Never a read of a customer's rows without a named reason written first (12 §7).
- Never a restore over a live record: a restore is PITR to a bookmark, or an `import` into an empty record
  (`IMPORT_NOT_EMPTY`).
- Never a downgrade: kernel migrations are forward-only (02 §7). A downgrade is a restore.
- Never a request for a vault passphrase (12 §7).

**Boundary.** The code the procedures lean on lives elsewhere: the nightly `scheduled()` and `deleteCustomer` in the
Worker (51 §5.12–§5.14), the walk's additions in `apps/worker/src/ops.ts` (51, required by §12), the gates in
`tools/gates/` (52), the CLI (48), the self-host process (49). §12 names what each must provide; this spec owns the
procedure.

## 2 · Public API

The operator's surface: two command sets, one log stream with its dashboards, and one container.

### 2.1 · `braindog` (33 §5; 48)

*Amended September 16th 2026.* Two of the commands below exist today: `login` and `init`. 48 §2 names the eleven the
CLI dispatches, and `export`, `import`, `verify`, `token` and `runner` are not among them, while `--version` answers
that it is not built yet. The rows stay because they specify the operator's surface, not because a procedure can call
them. `braindog verify` in particular answers `braindog has no command called verify`, prints the usage and exits 1, so
the "every backup check" beside it names no check that runs today, and the procedures that call these commands say so
where they call them (§5.4, §5.5).

| Command | Used in | Note |
|---|---|---|
| `braindog login <host>` | every Cloud procedure the CLI runs | RFC 8628; a `read`+`write` token in `hosts.json`. An ADMIN command answered `NEEDS_BROWSER_SESSION` asks for an **operation grant** — ten minutes, one command, approved by the owner in the browser for the named subject, held in memory, never written (48 §5.2, D1) |
| `braindog export [--redact-grants] [--sections …] [-o file]` | backup verification, handover | streams the `.brainl`, materialises a signed `.brain`; operation grant |
| `braindog import <file.brain \| file.brainl>` | restore | empty record only; operation grant |
| `braindog verify <file> --key <pubkey \| url>` | every backup check | offline: `application_id`, format, manifest, signature |
| `braindog init <slug>` | self-host restore | `<data>/<slug>/record.brain`, migration 0001 |
| `braindog token list` · `token revoke <id>` | incident response | operation grant; the owner's browser may do the same |
| `braindog runner enroll` · `runner run` | runner lifecycle | 26 §2.3 |
| `braindog --version` | every support call | the tuple, 31 §6 |

Exit codes: 0 ok · 1 refused · 2 conflict · 3 unreachable. `--json` is not built: it is specified in
[48-SPEC-CLI](48-SPEC-CLI.md) §4.5 and no command accepts the flag, so every procedure on this page reads the
readable output.

### 2.2 · `wrangler` 4.128.0 (31 §3)

| Command | Used in |
|---|---|
| `wrangler deploy` | §5.2 — from `deploy.yml`, never by hand for a forward deploy |
| `wrangler rollback [<VERSION_ID>] --message "<reason>"` | §5.2 — forbidden after a kernel migration, §5.3 |
| `wrangler versions list --json` | §5.2, §5.15 |
| `wrangler tail --format json [--search <text>] [--status error]` | §5.2, §5.3, §5.15 |
| `wrangler secret put SESSION_SECRET` · `wrangler secret put TOKENS_VALID_FROM` | §5.11 — the value at the prompt, never an argument |
| `wrangler secrets-store secret get \| update <STORE_ID> --secret-id <ID> --remote` | §5.6 — `braindog-kek` and `braindog-kek-prev` |
| `wrangler r2 object get \| delete braindog-blobs/<key> [--file <path>]` | §5.4, §5.8 |

### 2.3 · The Worker's observability

A log line carries the code, the id and the shape — never a field value, a credential, a prompt or a payload (12 §8;
35 §2). Every line is JSON with an `op` field. Five the operator reads:

| `op` | Emitted | Fields |
|---|---|---|
| `boot` | the first open of a record after a deploy — the boot probe, 30 §13 | `rec` `app` `sqlite` `fts5` `kernel` `format` |
| `refuse` | every 503 | `rec` `code` ∈ `SCHEMA_MISMATCH SCHEMA_NEWER` |
| `outbox` | every `ackOutbox` | `rec` `kind` `state` ∈ `done failed dead` `attempts`; for `pull.fetch` also `ingest` and `http` (the status class) |
| `walk` | per record, nightly | `rec` `kek` ∈ `ok rewrapped straggler` · `backup` = `{ rows, bytes, ms }` or `failed` · `erase_open` · `billing` · `ms` |
| `walk.done` | once, nightly | `records` `stragglers` `backups_failed` `erase_open` `lapsed` `ms` |

Dashboards: **Workers Logs** (`observability.enabled: true`, 33 §7) for the lines above; **Analytics Engine** for counts
and durations with the record id salted monthly (12 §7; ADR-014); **the ops record** — the operator's own BrainDog
record, where the walk writes its summary as a `log` note (§5.1). Three, counted.

Alerts are five saved Workers Logs queries. Each names the runbook that answers it:

| Alert | Query | Fires when | Runbook |
|---|---|---|---|
| Migration refusal | `op=refuse` | any row in 15 min | §5.3 |
| Failed snapshot | `op=walk backup=failed` | any | §5.4 |
| Dead outbox row | `op=outbox state=dead` | `kind=erase.r2`: any · other kinds: ≥ 3 records in 24 h (a provider, not a customer) | §5.8 · §5.15 |
| Connector paused | `op=outbox kind=pull.fetch http∈{401,403}` | ≥ 3 records on one `ingest` in 24 h — a provider changed | §5.12 |
| KEK straggler | `op=walk.done stragglers>0` | two consecutive nights | §5.6 |

The owner sees a different set, inside the record, and the operator does not: a failed snapshot's `export` event with
`note: 'failed: <reason>'` and its suggestion (12 §8); the dead-letter `suggestion` — `body_kind = 'change'`,
`opened_by = 'system'` (30 §8); a paused connector's urgent item (25 §9).

### 2.4 · The self-host (33 §6)

```
docker run -d --name braindog --restart unless-stopped \
  -p 127.0.0.1:8080:8080 \
  -v /srv/braindog:/data \
  --env-file /srv/braindog.env \
  ghcr.io/<org>/braindog:<date>-<sha>
```

`/srv/braindog.env` holds `BRAINDOG_DATA=/data`, `BRAINDOG_KEK_FILE=/data/kek`, `BRAINDOG_KEK_PREV_FILE=/data/kek.prev`,
`PORT=8080`, and optionally `BRAINDOG_TOKEN` (a private single-user instance) and `BRAINDOG_SQLITE=better-sqlite3`.
TLS is the reverse proxy's. The image tag is the `app` version with `-` for `+`, because a Docker tag cannot carry `+`.

Health: `GET /healthz`, unauthenticated (§13 #9) — 200 `{ app, format, kernel, primitives }` once the boot probe has
passed, 503 `{ code }` under a module-level refusal, never a slug. `/api/version` stays what 33 §4 and 51 D22 make it:
the record version for the polling fallback, behind auth. The Dockerfile's check needs no curl:

```
HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
```

## 3 · Files

The runbooks are sections of this document. The files an operator edits or reads:

| File | Owner | The operator touches it for |
|---|---|---|
| `apps/worker/wrangler.jsonc` | 51 | `triggers.crons: ["17 3 * * *"]` · `secrets_store_secrets` (`KEK`, `KEK_PREV`) · `vars.AGE_RECIPIENT` · `r2_buckets` · `compatibility_date` ≥ 2026-02-24 (gated) · DO migrations: `new_sqlite_classes`, `transferred_classes`, **never `deleted_classes`** (12 §8) |
| Worker secrets `SESSION_SECRET`, `TOKENS_VALID_FROM` | 51 | §5.11 |
| Secrets Store `braindog-kek`, `braindog-kek-prev` | 51 | §5.6 |
| `apps/worker/src/ops.ts` | 51 | what the walk adds to 51's `scheduled()`, ~120 lines: `rewrap` · `reconcile` · `ladder` · the `walk` lines |
| `tools/gates/deploy-parity.mjs` · `.github/workflows/deploy.yml` | 52 | every deploy |
| `apps/selfhost/Dockerfile` | 49 | the `HEALTHCHECK`; the `<date>-<sha>` tag |
| `/srv/braindog.env` · `/data/kek` · `/data/kek.prev` · `<slug>/snapshots/` | the self-hoster | §5.14, §5.5 |
| the ops record | this spec | slug `ops`, owned by the operator: one `log` note per procedure run (§8) |

**The procedures** — fifteen, counted: §5.1 the nightly walk · §5.2 deploy · §5.3 migration rollout · §5.4 backup ·
§5.5 restore · §5.6 KEK rotation · §5.7 passphrase · §5.8 erasure request · §5.9 customer deletion · §5.10 billing
lapse · §5.11 incident response · §5.12 connector paused · §5.13 runner · §5.14 self-host upgrade · §5.15 support
diagnosis.

## 4 · Data structures

The artefacts an operator handles, each with invariants a test can check.

*Amended September 16th 2026.* Two rows below name something an operator cannot reach today. In the `.brain` /
`.brainl` row, "`braindog verify` passes offline" is the property the format is built to have and not a check anybody
can run from the CLI: `verify` is specified in 48 §5.6 and is none of the eleven commands the CLI dispatches (§2.1). What
an operator can run is Settings → export's **Check an exported file**, which checks a `.brainl` in the browser with the
import's own `checkBrainl` (format, every table against the manifest, the signature against the key inside the file) and
sends nothing (03 §4). It does not read a `.brain`, and it cannot pin the key. In the signing
key row, "the public half in Settings → export and at the well-known URL 03 §4 names" is true of the built-in sample
alone. The export screen draws that key on the demo only, and tells a live record that its exports and backups are
signed and that the public half is not shown there yet; `03 §4`'s well-known URL is served by none of the three apps.
On Cloud "generated on first run" does not hold either, because the key store is opened only when the `KEK` secret is
bound and it is unset, so no record there has a signing key at all.

| Artefact | Shape | Invariants |
|---|---|---|
| **`.brainl.age`** | an age-sealed `.brainl`. R2 keys `rec_<id>/snapshots/nightly-<YYYY-MM-DD>.brainl.age` and `rec_<id>/snapshots/latest.brainl.age`; `customMetadata { bookmark, rows, bytes, at }` (51 §5.12) | 25 tables — 31 less the six `local` (03 §3); `grant.ciphertext` sealed; `vault_key` present and wrapped; never a KEK, token, device grant, lockout, observation or job row; the 30 newest dated keys plus `latest`; ≤ 40 MiB (51 §5.12); sealed to exactly one recipient, `AGE_RECIPIENT` |
| **`.brain` / `.brainl`** | 03 §2–§3 | `application_id` 1145193761; `user_version` 1; `dog_manifest` hashes the canonical projection (34 §5); `dog_sig` is Ed25519 by the producing record; `braindog verify` passes offline |
| **PITR bookmark** | the string `getBookmarkForTime(ts)` or `getCurrentBookmark()` returns | valid ≤ 30 days; the `restore.pitr` event names the bookmark and the instant (51 D15); every snapshot's metadata carries the bookmark it pairs with |
| **The KEK** | two Secrets Store secrets — `braindog-kek` (binding `KEK`) and `braindog-kek-prev` (`KEK_PREV`), each 32 random bytes, base64 (51 §13 D18); self-host `/data/kek` and `/data/kek.prev`, 0600 | `kek_id` = first 18 hex of SHA-256(raw key) (34 §5); every `vault_key` row `wrapped_by = 'kek'` carries a `kek_id` ∈ {`KEK`, `KEK_PREV`}; rotations ≥ 30 days apart; `KEK_PREV` holds the previous key, or equals `KEK` once that key is retired; an id is never reused |
| **The wrapped DEKs** | `vault_key` rows `record` · `connector` · `signing` (30 §1) | exactly one wrapping per row; `connector` is always `kek` (ADR-052); a `passphrase` row has `salt` and `kek_id NULL`; `grant.kek_id` = `vault_key('record').kek_id` while `wrapped_by = 'kek'` |
| **The signing key** | `vault_key('signing')`, Ed25519; `key_id` = first 16 hex of SHA-256(public key) | generated on first run; the public half in Settings → export and at the well-known URL 03 §4 names; a new key after a vault loss changes `key_id`, and old backups still verify with the old public key |
| **The version tuple** | `app <date>+<sha> · format <user_version> · kernel <migration> · primitives <PRIMITIVES_VERSION>` (31 §6) | `format` moves only with `-- format-bump`; `kernel` = `MAX(migration.version)`; a bug report without it is sent back for it |
| **A device grant** | a `device_grant` row (30 §1) | `pending approved active expired denied revoked`; `token_hash`, never the token; `expires` rewritten to +90 d on activation; `last_used` older than 14 d → `expired`, the customer told (26 §2.4); a `denied` row is never purged |
| **The dead-letter suggestion** | a `suggestion` row, `body_kind = 'change'`, `opened_by = 'system'` (30 §8) | names kind, error and a payload summary — never a payload value; one per `dead` outbox row |
| **Billing state** | Directory `record_dir.billing` ∈ `active lapsed`, `lapsed_at` (§13 #5) | `lapsed` caps every principal at `read` except the owner's `export`; deletion at `lapsed_at + 90 d` |
| **An operator audit line** | a `note` event in the ops record | `note` ≤ 280 chars: `<procedure> <rec_id> — <reason>`; written **before** the action |

Eleven, counted.

## 5 · Algorithms

Every procedure: **Precondition → Steps → Verify → Rollback.** "The owner" is the record's owner in a browser
session; "the operator" is us, with `wrangler`.

### 5.1 · The nightly walk

Every scheduled operator duty hangs off one cron invocation. Cloud: the Worker's `scheduled()` at `17 3 * * *`
(51 §5.12), extended by `ops.ts`. Self-host: the same function from the process's own timer at 03:00 local, over its
own records.

1. `DIRECTORY.listRecords(cursor)` in pages of 500 (51 §5.12); `ops.ts` moves the ops record to the front of the first
   page, so a bad night reaches the operator's record before a customer's.
2. Resolve `KEK.get()` and `KEK_PREV.get()`; `current` = the `kek_id` of `KEK`.
3. For each record, in order, under the `SYSTEM` `CallContext` 51 uses for `snapshot` — ADMIN's browser-only rule is
   the router's, and `system` never passes the router:
   - a. `opsReport()` (INTERNAL, §13 #4) → `{ vault_key: [{ purpose, wrapped_by, kek_id }], erase_r2: [{ id, state,
     created, keys }], billing }`.
   - b. **Re-wrap** if any `wrapped_by = 'kek'` row has `kek_id ≠ current` — §5.6 step 5. On the first failure stop
     the walk, log `walk.done`, let the alert fire.
   - c. **Snapshot**: `stub.call('snapshot', { label: 'nightly' }, SYSTEM)` — one `export.r2` outbox row; the queue
     consumer pages `export(cursor)`, signs, seals to `AGE_RECIPIENT`, puts the dated key and `latest.brainl.age`, keeps
     the 30 newest (51 §5.12). A failure walks the one retry ladder to `dead`, and the record writes the `export` event
     `note: 'failed: <reason>'` and the suggestion (12 §8); the walk logs `backup=failed` from the ack.
   - d. **Reconcile**: for every `erase.r2` row `done` in the last 30 days, `BLOBS.get(key) === null` for each key; a
     hit re-enqueues the deletion and counts in `erase_open`. A `dead` `erase.r2` row counts too.
   - e. **Ladder**: if `billing = 'lapsed'`, apply §5.10's day rules from `lapsed_at`.
   - f. Log `walk`.
4. Log `walk.done`, and write it as one `log` note in the ops record: `walk <date> · <records> records · <stragglers>
   stragglers · <backups_failed> failed · <erase_open> open`.
5. **Morning check** — a person, daily, five minutes: open the ops record; read the five alert queries of §2.3. Each
   red row opens its runbook.

Verify: `walk.done.records` = the count `listRecords` returned; `stragglers = 0`; `backups_failed = 0`;
`erase_open = 0`.
Rollback: none needed — every step is idempotent: the re-wrap is a CAS on `kek_id`, a snapshot overwrites `latest`, a
reconcile re-deletes.

`ponytail:` one cron invocation; `snapshot` and `opsReport` are two subrequests per record, so the fan-out stops at
450 records (51's 900 halved) — page the rest across `scheduled()` runs when `walk.done.records` nears it. To run the
walk *now*: deploy once with `triggers.crons: ["*/10 * * * *"]`, wait one fire, deploy the normal config. That is the
one emergency lever, and §5.6 and §5.11 use it.

### 5.2 · Deploy

Precondition: `gates.yml` and `ci.yml` green on `main`; yesterday's `walk.done` clean; `wrangler deploy --dry-run`
passes; you know whether `packages/kernel/migrations/` or the DO migrations in `wrangler.jsonc` changed since the
deployed sha (`git diff --stat <deployed-sha>..HEAD -- packages/kernel/migrations apps/worker/wrangler.jsonc`). If they
did, §5.3 applies as well.

1. `wrangler versions list --json` → note the active `<prev-version-id>`. `log` in the ops record: `deploy <sha> —
   replaces <prev-version-id>`.
2. `deploy.yml` runs `wrangler deploy` with the CI token scoped to deploy only (12 §8).
3. The same job runs the parity gate: fetch `/app/` and `/app/_app/version.json` from the live host (`/` and `/_app/version.json` before push A of the one-domain move); each SHA-256 must equal the
   `build/` output (33 §8 `deploy-parity`; 18 §6). A mismatch fails the job — the deploy is **live and wrong**. Go to
   Rollback.
4. Open the ops record in a browser. It is the first open after the deploy, so its boot probe runs.
5. `wrangler tail --format json --search '"op":"boot"'` → one line with `"app":"<date>+<sha>"`, `"fts5":true` and the
   expected `"kernel"`.
6. `wrangler tail --format json --status error` for 15 minutes: no `op=refuse`.

Verify: `GET /healthz` returns the new tuple; the `boot` line's `kernel` equals the highest migration file in the
tree; the parity gate is green.
Rollback: **only if no kernel migration shipped** — `wrangler rollback <prev-version-id> --message "<reason>"`, then
steps 3–6 against the old build. After a kernel migration a rollback is forbidden: every record that migrated answers
the old code with `SCHEMA_NEWER` (503). Fix forward (§5.3).

`ponytail:` no gradual rollout (`wrangler versions deploy --percentage`) — with per-record forward-only migrations, a
record the new version touched refuses the old one, so a traffic split is an outage split. The canary is a record — the
ops record — not a percentage.

### 5.3 · Migration rollout

A kernel migration is forward-only and checksummed, applied per record in the DO constructor under
`blockConcurrencyWhile` on that record's first request after the deploy (02 §7; 33 §9). The fleet migrates lazily, one
record at a time, as records wake — which is what makes the ops record a real canary.

Precondition: the file is `NNNN_<slug>.sql`, numbered next; kernel tests and `brain-roundtrip` pass against it in CI; a
`-- format-bump` line only if an older reader would *misread* the file (30 §11); no `deleted_classes` in
`wrangler.jsonc`; last night's snapshots clean (§5.4) — they are the rollback.

1. Deploy (§5.2). The ops record migrates at its step 4.
2. Its `boot` line shows `kernel` = the new number.
3. Exercise the ops record for five minutes: a write, a search, a page render.
4. Let the fleet follow. Watch `op=refuse` for 24 hours — the alert fires on any row.
5. A record that never wakes never migrates until it does. That is correct, not a straggler.

Verify: after 24 h, `op=refuse` count 0; every `boot` line since carries the new `kernel`.
Rollback: fix forward — a new file `NNNN+1` that undoes what must be undone, deployed by §5.2.

**Recovering a record that refuses:**

| Code | Cause | Recovery |
|---|---|---|
| `SCHEMA_NEWER` | the code is older than the record — a rollback after a migration, or a stale self-host image | deploy the newer build (Cloud) · pull the newer image (self-host). The data is intact |
| `SCHEMA_MISMATCH` | a migration file's bytes differ from the checksum the record stored — the file was edited after it shipped | restore the file's original bytes from git and redeploy. Never edit an applied migration; a change is a new numbered file |

Both are module-level: every RPC returns 503 until a deploy fixes it (02 §7). There is no SQL console into a Durable
Object, and this spec does not add one.

### 5.4 · Backup

Three mechanisms, one contract: nightly, sealed, thirty kept, restorable.

| Where | Mechanism | Trigger | Keeps |
|---|---|---|---|
| Cloud | `.brainl.age` to R2 under `rec_<id>/snapshots/` (03 §5; 51 §5.12) | the walk, `17 3 * * *` UTC (§5.1) | the 30 newest + `latest` |
| Cloud | PITR bookmarks | the platform, continuous (01 §2) | any point in 30 days |
| Self-host | `VACUUM INTO` → sign → `<slug>/snapshots/<date>.brain` (33 §6) | the process's timer, 03:00 local | 30 |

The owner's two routes (12 §8) are `POST /api/snapshot` — *snapshot now* — and `GET /api/snapshots` — *what is kept,
with counts* — both cookie, ADMIN (51 D8); Settings → backups draws them. A self-host snapshot is the whole live file —
31 tables, the six `local` ones included, because it is a backup of the instance and not an export — signed over the 25
the manifest covers; `verify` reports 25 (§13 #10).

*Amended September 16th 2026.* A self-host takes one on demand as well as nightly: `snapshot` runs `VACUUM INTO <slug>/snapshots/<time>Z-<label>.brain` (0600, thirty kept, a `before-restore` copy never the one that prunes), writes one `export` event, and `GET /api/snapshots/<id>` streams the file to whoever `snapshots` answers. Settings → backups → *Restore this copy* calls `restore({ bookmark: <id> })`: the owner, from a sign-in in the last 15 minutes where the host knows one; the record is kept as a `before-restore` copy first, the copy's tables are put back in one transaction, the search index is rebuilt, and one `restore.pitr` event is written into the restored record. A copy written by other migrations is refused `OUT_OF_BOUNDS` and changes nothing. Cloud serves none of the three yet: the `.brainl.age` needs the operator's age recipient and the `export.r2` delivery, and (a)'s bookmark dance is not wired, so `snapshot`, `snapshots` and `restore` refuse `NOT_IN_THIS_BUILD` with a sentence, and nothing is written.

**Verifying a backup is restorable** — the operator, monthly, one random record plus the ops record (§9).

Precondition: the age identity on the operator's machine (§8); `braindog` and `docker` installed; a `log` note naming the
record and `drill`.

*Amended September 16th 2026.* This drill cannot be run today, and what follows is the specification of one rather than
a procedure on the calendar. Steps 3 and 4 call `braindog verify`, `braindog import` and `braindog export`: §2.1 above
lists all three and 48 specifies them (`verify` in 48 §5.6), but 48 names the eleven commands built today and none of
the three is among them. `braindog verify` answers `braindog has no command called verify`, prints the usage and exits
1. Step 3's `--key` has no source either: Settings → export shows a public key on the sample only, because no record
publishes its own key yet, `boot` does not carry it and `03 §4`'s well-known URL is served by none of the three apps.
There is nothing on that screen for an operator to copy.

1. `wrangler r2 object get braindog-blobs/rec_<id>/snapshots/latest.brainl.age --file latest.brainl.age`
2. `age -d -i ~/.config/braindog/backup.key latest.brainl.age > latest.brainl`
3. `braindog verify latest.brainl --key <the record's public key, Settings → export>` → four `✓` lines; 25 tables.
4. The restore drill: a scratch self-host (`docker run … -v "$(mktemp -d)":/data`); `braindog init drill`;
   `braindog import latest.brainl`; `braindog export -o roundtrip.brain`; `braindog verify roundtrip.brain --key <same>`;
   the `dog_manifest` rows of both containers equal — `sqlite3 roundtrip.brain 'select * from dog_manifest order by 1'`
   against the `.brainl` header lines. Equal manifests are `brain-roundtrip` (33 §8) by hand, on a real backup.
5. Time steps 1–4; `log`: `drill rec_<id> — <rows> rows · <bytes> · restore <mm:ss>`.
6. `shred -u latest.brainl roundtrip.brain`; remove the scratch container and directory.

Verify: `✓` at step 3 and at step 4. Rollback: none — a drill touches no live record. On a self-host the same drill
starts at step 3 with `<slug>/snapshots/<date>.brain`.

### 5.5 · Restore

| Situation | Path |
|---|---|
| a bad write, rule, import or corruption inside 30 days, Cloud | **(a) PITR** |
| older than 30 days, or the object is gone, Cloud | **(b) from `.brainl.age`** |
| self-host | **(c) `restore` from a kept copy (§5.4), or `import` into a fresh directory** |

*Amended September 16th 2026.* None of the three paths can be walked today, and what follows is the specification of a
restore rather than steps to take now. (b) and (c) both call `braindog import`, (b)'s precondition is §5.4's drill,
which §5.4 says cannot be run, and (b)'s Verify line calls `braindog export` and `braindog verify`; none of the three
is among the eleven commands the CLI dispatches (§2.1). (a) calls `restore`, and §5.4 above says Cloud refuses
`snapshot`, `snapshots` and `restore` with `NOT_IN_THIS_BUILD` and writes nothing.

**(a) PITR.** The owner, Settings → backups → *restore to a time* — `POST /api/restore { at }`, cookie, ADMIN
(51 §5.14).

Precondition: the owner knows the last good instant — `/audit` shows every write with its time; support has logged the
reason.

1. The owner picks the instant.
2. Two calls (51 D15): `pitr(at)` — `getBookmarkForTime(at)`, `onNextSessionRestoreBookmark(b)`, `ctx.abort()` — then,
   on the fresh object, `restore({ bookmark, at })`, which writes `restore.pitr` into the restored storage. Two, because
   an event written before the restore would be rewound with everything else; this spec asserts the order.
3. The owner reloads: `/audit` ends at the chosen instant plus the `restore.pitr` row.

Verify: the `restore.pitr` event exists; `record_version` is what the owner expects; `/ws` announced the new version.
Rollback: restore to the instant just before step 2. It is itself a point in time, valid for 30 days.

**(b) From `.brainl.age`, Cloud.** `import` needs an empty record.

Precondition: §5.4 steps 1–3 done for the chosen night; the owner reachable; the reason logged.

1. If a live record exists and is unrecoverable, the owner deletes it (§5.9) and signs in again — `createRecord`
   mints an empty record with a new `rec_id` under the same slug (33 §10).
2. The operator runs `braindog import latest.brainl` against the host. `import` answers `NEEDS_BROWSER_SESSION`; the CLI
   asks for an operation grant and the owner approves *import* from their browser (48 §5.2) — ten minutes, this
   command, never written.
3. The import: 25 tables in batches of ≤ 30 rows × ≤ 3 params, `entry_fts` rebuilt, one `import` event (33 §9).
4. Tokens, device grants, observations and jobs did not travel (`local`). The owner re-mints agent tokens and re-enrols
   runners. The vault opens if `vault_key('record')` is KEK-wrapped under `KEK` or `KEK_PREV` (§5.6), or
   passphrase-wrapped and the owner has the passphrase; otherwise §5.7's *lost* script.

Verify: `braindog verify` on a fresh `braindog export` of the restored record carries the same `dog_manifest` as the
imported file; the `import` event is present.
Rollback: the record is new — delete it (§5.9) and repeat.

**(c) Self-host.**

Precondition: the process stopped; a verified `<date>.brain` or a decrypted `.brainl`; `/data/kek` intact — without it no
vault opens.

1. `mv /data/<slug> /data/<slug>.broken.<date>` — the pre-restore file is kept beside (03 §7 rule 3).
2. `braindog init <slug>` · `braindog import <snapshot>`.
3. Start the process. `docker inspect --format '{{.State.Health.Status}}' braindog` → `healthy`.

Verify: `braindog --version` shows the expected `kernel`; the owner signs in with the same passkey — the Directory is
`directory.sqlite`, untouched.
Rollback: `mv` the broken directory back.

### 5.6 · KEK rotation

The KEK wraps three DEKs per record (12 §6). A rotation re-wraps them and nothing else; it does not replace a DEK, so
it re-encrypts no grant (§10). The store has two slots — `KEK` and `KEK_PREV` (51 §13 D18) — and this is the ladder 51
hands to 53: two keys, rotations at least 30 days apart.

Precondition: last night's walk clean and `stragglers = 0`; ≥ 30 days since the last rotation, else the key about to
leave `KEK_PREV` is still needed by a straggler or a backup — for an incident, rotate anyway and accept that a restore
from before the previous rotation needs a vault reset (§5.7); `wrangler secrets-store secret list <STORE_ID> --remote`
shows both secrets; a `log` note: `rotation quarterly` or `rotation incident <id>`; a trusted machine with a tmpfs
working directory.

1. `head -c 32 /dev/urandom | base64 -w0 > new.key`; `kek_id` = `base64 -d new.key | sha256sum | cut -c1-18`; note it.
2. `wrangler secrets-store secret get <STORE_ID> --secret-id <KEK_ID> --remote > cur.key` — the current key.
3. `wrangler secrets-store secret update <STORE_ID> --secret-id <PREV_ID> --remote` — paste `cur.key` at the prompt.
   `KEK_PREV` now holds the key that was current. Between this step and the next both slots hold it; that is harmless.
4. `wrangler secrets-store secret update <STORE_ID> --secret-id <KEK_ID> --remote` — paste `new.key`. `shred -u new.key
   cur.key`. Secrets Store serves the new values on the next `get()`; no deploy.
5. New wraps use `current` at once (`KeyStore.current()`, 33 §1). Existing rows re-wrap on the next walk (§5.1 step
   3b): per record, the Worker unwraps each `vault_key` row `wrapped_by = 'kek'` with `KeyStore.byId(old)` — resolved
   through `KEK_PREV` — wraps with `current`, and calls `rewrapKeys({ from, to, rows })` — one record transaction that
   sets `wrapped`, `nonce`, `kek_id`, `rewrapped_at` on each row and runs `UPDATE grant SET kek_id = :to WHERE
   wrapped_by = 'kek'`, all guarded by `WHERE kek_id = :from` (a CAS), and writes one `grant.rotate` event — actor
   `system`, `target_kind = 'vault_key'`, `from_v`/`to_v` the two ids (§13 #4). For an incident, force the walk with
   §5.1's lever.
6. **The straggler check** is the walk: per record `SELECT purpose FROM vault_key WHERE wrapped_by = 'kek' AND kek_id
   <> :current`; the fleet count is `walk.done.stragglers`. Two consecutive nights above zero is the alert. The usual
   cause is a record in the 503 state (§5.3): fix that and the next walk catches it.
7. **Retire the old key** 30 days after the first night with `stragglers = 0`: `secret update` `braindog-kek-prev` with
   the *current* key's value, so the retired key exists nowhere. Not a day sooner — a PITR restore or a `.brainl.age`
   import from inside the window carries `vault_key` rows under the old `kek_id`, and `KeyStore.byId` must still answer.
   Share links minted under the retired key answer 404 from then on (51 D5); owners re-share.
8. Self-host: the same two files, `/data/kek` and `/data/kek.prev`; steps 5–7 run from the process's timer.

Verify: on the ops record open one grant (Settings → vault) — plaintext, no `WRONG_KEY`; `walk.done.stragglers = 0`;
`opsReport().vault_key[*].kek_id = current` for every `kek` row.
Rollback: swap the slots back — `KEK` ← the value in `KEK_PREV`, `KEK_PREV` ← the new key — and the walk re-wraps
toward it. Nothing is lost while both keys are present.

### 5.7 · Passphrase enable and disable

The owner's act, in the browser. Support has two scripts.

**Enable** (12 §6): the DEK is unwrapped with the KEK once, re-wrapped under PBKDF2-SHA-256 — 600,000 iterations,
16-byte salt — and the KEK-wrapped copy is overwritten and zeroised **in the same transaction**. `vault_key('record')`
becomes `wrapped_by = 'passphrase'`, `kek_id NULL`. `connector` stays `kek` (ADR-052), and the bind screen says so in
words. Support says, in these words: *turning the passphrase on removes our access going forward, and removes it from
the backups thirty days later* (12 §7). Never a shorter sentence — the honesty table is only worth having if it is
believed.
Verify: `opsReport()` shows `record → passphrase`; the walk's `kek` reads `ok` — a passphrase row is never a straggler.

**Disable**: the same operation in reverse, and it requires the passphrase (12 §6).

**Lost passphrase** — the script: *The vault is gone. The record is not.* There is exactly one wrapping of the DEK and
we do not hold its key. A backup inside 30 days does not help unless the enable was inside it, and we do not restore a
record to before an enable to get around the owner's choice. The owner's steps: Settings → vault → *reset vault*:
`revokeGrant` on every row — ciphertext zeroed, rows kept with `revoked_at` (02 §9) — a new `record` DEK generated and
KEK-wrapped, then each credential re-bound from its issuer. `opens` is their list of issuers to visit. Rollback: none;
say so before they click.

### 5.8 · Erasure request

A data-subject request lands on the controller — the owner. Cloud is the processor: a request that reaches us is
forwarded to the owner within 3 working days with this procedure. We never run `erase` on a customer's record.

Precondition: the owner has the subject value(s) — a name, an email — and a legal basis. `erase` is ADMIN: browser
session only.

1. Owner: Settings → people & sharing → *Erase a person* (50 draws it) → subject, basis → `erase`.
2. The record runs 02 §10's cascade in **one transaction** over sixteen stores: `entry` (`deleted_at`),
   `event.from_v`/`to_v`/`note` → `--erased--`, `inbox_raw.body`/`headers`, `ingest_receipt`, `entry_fts`, `entry_vec`,
   `decision.reason` → `--erased--`, `suggestion.body`, `prediction.claim`, `grant.label`, `device_grant.label`/`ua`,
   `schedule` payloads (cancelled), `outbox` payloads (cancelled), `member` (deleted; `access.revoke` stays),
   `observation` rows with that `subject` (deleted), and the `person` mirror's `email`/`name` → `--erased--` (§13 #11).
   It inserts one `erase.r2` outbox row per attachment key of the subject and one `erase` event: `target` the erasure
   id, `to_v` the SHA-256 of the subject value, `note` the basis and the row count.
3. The Worker drains `erase.r2` inside its 300 s lease: `BLOBS.delete` per key, then `BLOBS.get` must be null, else
   `ackOutbox(failed)` and the one retry ladder (30 §8; 51 §5.11).
4. The walk reconciles for 30 nights (§5.1 step 3d). A `dead` `erase.r2` row is a compliance alert, not only the
   owner's item: the operator deletes the key by hand — `wrangler r2 object delete braindog-blobs/rec_<id>/<sha256>` —
   and the next walk confirms.
5. The owner answers the subject. **Kept, and why** — the fact, not the payload (ADR-033): row positions and sequence,
   `ts`, `actor`, `kind`, `target`, field names, `inbox_raw.ts`/`channel`/`sha256`, decision ids and answers, the
   `erase` event. **Lagging**: backups and PITR hold the payload for 30 more days, beyond use (02 §10). The answer
   reads: *erased from the live record on <date>; from backups by <date + 30 days>.*

Verify: `SELECT count(*) FROM entry_fts WHERE entry_fts MATCH :subject` = 0; `near` over the subject's text returns
nothing; the `erase` event exists; `erase_open = 0` on the next walk.
Rollback: none. Erasure is the one operation PITR must not be used to undo; the confirm screen says so.

### 5.9 · Customer deletion

`deleteCustomer(env, rec)` is 51 §5.13's function: `destroy()` — `deleteAlarm()` then `deleteAll()` — the R2 prefix in
pages of 1,000, then the Directory's `record.forget`. This spec fixes when it runs and in what order the rest happens.

Precondition: the owner asked — Settings → billing → *delete record*, `POST /api/deleteRecord`, cookie, ADMIN, the slug
typed to confirm (§13 #17) — or the lapse ladder reached day 90 (§5.10); a `log` note; for the ladder, the owner has
been told three times that export is available.

1. `snapshot({ label: 'final' })` → `rec_<id>/snapshots/final-<date>.brainl.age` — inside the prefix, so step 4 removes
   it with everything else. It exists so a same-day "wait" is answerable, and for nothing longer.
2. `destroy()` on the `Record` object: `deleteAlarm()` first — belt and braces; at `compatibility_date ≥ 2026-02-24`
   `deleteAll()` deletes the alarm too, and the `compat-date` gate holds the date (09 §1) — then `deleteAll()`. Alarm
   before storage, so a timer never wakes a dead record.
3. `Spark`: nothing in phase 5 — it holds no durable state (51 §5.13). When it gains storage (46), the same two calls,
   after `Record`, so Spark cannot write back into an emptied record.
4. The R2 prefix `rec_<id>/`, paged — attachments and snapshots alike (02 §9).
5. Directory: `record.forget` removes `record_dir` and `person_record` (51 §5.13). The fact that a record existed under
   that slug, and when, is the ops record's note — not a Directory row.
6. `log`: `delete rec_<id> — <reason>`.

Verify: the slug resolves to nothing; `BLOBS.list({ prefix: 'rec_<id>/' })` is empty; `getAlarm() === null` before the
storage went (51 §9).
Rollback: none after step 2. Before it, stop. After it, the platform's own 30-day window is the last trace, and by day
+30 nothing of the record remains anywhere.

*Amended September 16th 2026.* On a self-host `deleteRecord` is steps 2, 4 and 5 for one file: the scheduler stops, the record file with its `-wal`, `-shm` and `snapshots/` goes (the whole `<slug>/` directory when it is the record's own), the Directory releases the slug, and every later request answers 503 `RECORD_UNAVAILABLE`. There is no step 1, because the final copy would sit in the directory being removed. The Worker refuses `NOT_IN_THIS_BUILD`, and deletes nothing, until step 1's sealed snapshot is wired.

### 5.10 · Billing lapse

ADR-059 in days, states and words.

| Day | `billing` | The record | The customer sees — email and in-app, `urgent` |
|---|---|---|---|
| 0 | `lapsed` | read-only; connectors and digests paused; export and MCP reads work | *Payment didn't go through. Your record is read-only. Update your card to resume. Export any time.* |
| 60 | `lapsed` | unchanged | *Your record is deleted on <day-90 date>. Export it or update your card.* |
| 83 | `lapsed` | unchanged | *7 days left. Export or update your card.* |
| 90 | deleted | §5.9 | *Your record was deleted on <date>. Backups are gone within 30 days.* |
| any | `active` | everything resumes on the next request | *Welcome back.* |

**Mechanism** (§13 #6), all in the Worker and nothing in the record, so the record package stays billing-agnostic —
51 §10 leaves exactly this gap for 53: Stripe's webhook sets `record_dir.billing` and `lapsed_at`. While `lapsed`, the
Worker builds every `CallContext` with the principal capped at `read` — a person at level `read`, a token at
`scope ∩ {read}` — and admits `export` for the owner's session only. A write is refused `FORBIDDEN` (403) with
`fix: "Read-only until billing resumes. Export is available."` The drain acks `pull.fetch`, `infer.*` and any
`notify.*` whose `because` starts `digest.` as `done`, unsent; reminders still deliver — a lapsed card is the commonest
reason a renewal is missed, and the record's job is to say so. The walk applies the day rules (§5.1 step 3e) and runs
§5.9 at day 90.

Verify: under a test clock the four messages fire once each at days 0, 60, 83 and 90 (§9); a write returns 403
`FORBIDDEN`; `export` succeeds; a `pull.fetch` row goes `done` with no `Http.fetch`.
Rollback: `billing = 'active'`. Nothing was written to the record, so nothing is undone.

**Held is not lapsed.** A scheduled action on an `active` record that has used its month's allowance is `held`: the run is counted, the `pull` event says the day it runs again, and the record stays writable. While `lapsed`, runs are held too, and the lapse outranks the allowance: the event says the lapse sentence, and nothing runs again until `billing = 'active'`, whatever the month.

### 5.11 · Incident response

Four incidents. The first step of each is a `log` note with the time you noticed; the last is the customer message.

**(a) A leaked agent token.**

1. Revoke: `braindog token revoke <id>` — an operation grant the owner approves — or Settings → agents. `revoked_at`
   is set; the next call is `UNAUTHORIZED`.
2. What it touched — an agent write resolves to a session `S<n>` (30 §3), and the `session` register records the token
   that opened it (§13 #12):

   ```sql
   SELECT ts, kind, target, field FROM event
   WHERE actor = 'agent:<name>'
      OR actor IN (SELECT 'S' || seq FROM entry
                   WHERE register = 'session' AND json_extract(fields, '$.token_id') = :id)
   ORDER BY ts;
   ```

   `grant.read` cannot appear in that list: no token reaches VAULT (ADR-060).
3. Hand the owner the row list. They decide what to revert — `/audit`, supersession. Nothing is reverted for them.

**(b) A leaked device grant.** As (a), with `actor = 'runner:<id>'` or the CLI's sessions. Revoke from Settings →
agents — the grant sits in the same list (26 §2.3); status `revoked`; the runner's next `claimJob` is `UNAUTHORIZED`.

**(c) A suspected Worker compromise.** A compromised Worker can read the KEK and every DEK it unwraps (12 §6.1).
Containment, then rotation, then honesty.

1. A known-good build: `wrangler rollback <version-id>` if the suspect code is a deploy; otherwise `wrangler deploy`
   from a reviewed, pinned commit.
2. `wrangler secret put SESSION_SECRET` — 32 new random bytes at the prompt. Every browser session, magic link and
   pending device code is invalid at once, because each is HMAC'd under it (§13 #12). Everyone re-logs in with their
   passkey.
3. `wrangler secret put TOKENS_VALID_FROM` — the instant the compromise began, or now if unknown. Every agent token and
   device grant created before it is refused `UNAUTHORIZED`; the owner's list shows them as revoked by the operator.
   Owners re-mint. Self-host: the same two names in `/srv/braindog.env`, then restart.
4. Rotate the KEK (§5.6, the incident exception) and force the walk. The old KEK alone opens nothing: the wrapped DEKs
   live in the objects, and in snapshots sealed to a recipient whose identity was never in the Worker (§8).
5. Say precisely what was exposed. Rows of every Cloud record — readable by the Worker at any time (12 §7). Credentials
   in vaults with the passphrase **off**, if the attacker unwrapped DEKs — treat as exposed: *rotate every credential in
   your vault at its issuer; the vault's `opens` column is your list.* Connector credentials in every record, passphrase
   on or off (ADR-052). Prompts: not stored (12 §7). Vaults with the passphrase on: not exposed through the Worker.
6. The post-mortem is a `log` note within 7 days.

**(d) A leaked export.** Precision is the whole job here. A `.brain` or `.brainl` is a plaintext SQLite database: every row
in `data`, `origin` and `governance` is readable by whoever holds the file. Not readable: `grant.ciphertext` —
AES-256-GCM under a key derived from a DEK the file does not carry — and `vault_key.wrapped`, which opens nothing
without the KEK, and the KEK is never in any file (12 §8). A leaked `.brainl.age` is ciphertext to anyone without the
age identity. The message: *the rows are exposed; the credentials are not; the connector credentials are not.* Nothing
is rotated at an issuer for an export alone. If `--with-grants` was used (03 §5), the grants are under the export
passphrase and stand or fall with it.

Verify, all four: the revoked principal's next call is `UNAUTHORIZED`; `wrangler tail --status error` is quiet; the ops
record holds the timeline.
Rollback: (c) steps 2 and 3 are irreversible by design. A wrong `TOKENS_VALID_FROM` is corrected by setting an earlier
instant.

### 5.12 · Connector paused

A 401/403 from a provider is `fatal_when` — never retried: `grant.stale_at` is set, the ingest's `schedule` row goes
`state = 'paused'`, one urgent item (25 §9).

Precondition: the owner sees `paused` on the connector with `[Reconnect]`.

1. Owner: `[Reconnect]` → `bindGrant` with a new credential. The bind-time probe proves `require_scopes` (25 §7); a
   credential that fails the probe is refused there, before anything is stored.
2. On a successful bind the Worker clears `stale_at` and sets the schedule row `pending`, `due_at = now` — un-paused.
3. `[Retry now]` runs it; the chart's stale badge clears on the next point.

Verify: a `pull` event within one run; the urgent item resolves.
Rollback: none — `[Reconnect]` with the old credential re-pauses on the same 401.

### 5.13 · Runner

Enrolment is the vault's device grant (26 §2.3); there is no second flow.

**Enrol**: on the machine, `braindog runner enroll` prints six digits; the owner approves in Settings → agents (browser
only — a bearer gets `NEEDS_BROWSER_SESSION`); the poll exchanges `approved` for a 90-day grant, shown once;
`braindog runner run` under the hardened systemd unit (26 §5). The runner refuses Claude Code below v2.1.248 at
enrolment and at every job.
**Deregister**: automatic at 14 silent days — `last_used` older than 14 d → `expired`, and the customer is told
(26 §2.4). Re-enrol the same way.
**Revoke**: Settings → agents → revoke → `revoked`. The next `claimJob` is `UNAUTHORIZED`; a running job posts
`interrupted` and its transcript stays — `cancel` is a flag, never a delete (26 §5).

Verify: the `device_grant` row's status; `last_used` moves on the first claim. Rollback: enrol again.

### 5.14 · Self-host upgrade

Precondition: `<slug>/snapshots/<today>.brain` exists — Settings → backups → *snapshot now*, or wait for 03:00;
`/data/kek` and `/data/kek.prev` backed up offline; the release note read for a `-- format-bump`.

1. `docker pull ghcr.io/<org>/braindog:<new>`
2. `docker stop braindog && docker rm braindog`, then the `docker run` of §2.4 with the new tag.
3. Migrations apply on boot, per record file, under the same forward-only rules (33 §9); the boot probe measures FTS5
   first (30 §13).
4. `docker inspect --format '{{.State.Health.Status}}' braindog` → `healthy`; `curl -fsS localhost:8080/healthz` shows
   the new `kernel`.

Verify: sign in; `braindog --version`; one write.
Rollback: **downgrade is not supported.** The old image answers a migrated file with `SCHEMA_NEWER` (503). Restore
instead: stop, §5.5(c) from the pre-upgrade snapshot into a fresh directory, start the *old* image against it. The
file the new image wrote stays beside as `<slug>.broken.<date>` (03 §7).

If the container exits at boot with the text of 30 §13 — *This SQLite build cannot host a .brain file* — the host's
SQLite lacks FTS5 (`NO_SUCH_MODULE`): Node 24.13+ or the official image, and nothing else. There is no degraded mode.

### 5.15 · Support diagnosis

The order is fixed so two people reach the same answer (§13 #7).

1. **The tuple.** Ask for `braindog --version` or Settings → about. Compare `app` to `wrangler versions list` and
   `kernel` to the tree. A stale self-host image explains most reports.
2. **Is the record refusing?** `wrangler tail --format json --search '"rec":"rec_<id>"' --status error` — an
   `op=refuse` line is §5.3. Self-host: the container log's boot output.
3. **`observation`** — the first place to look *inside* a record, because it holds no values (30 §1):
   `opsReport({ observation: 7 })` returns the week's `write.refused` by `<register>.<field>:<code>`, `tool.retry`,
   `search.empty`, `query.scan`, `ingest.unmatched`. A `write.refused` spike names the refusal that is confusing them.
   Reading it needs the `log` note first: `support rec_<id> — <ticket>: read observation` (12 §7).
4. **`event`** for the target the customer names — by the owner in `/audit`, or by us under a second named reason.
5. **`suggestion WHERE opened_by = 'system'`** — dead letters and failed snapshots the owner has not acted on.
6. Answer with the refusal's `fix` sentence when there is one. Every code has one (30 §6).

Verify: the ticket names the tuple and the step that found the cause. Rollback: none.

## 6 · Refusals and errors

Codes an operator meets, every one from 30 §6 or the adapter's list in 30 §13. None is new.

| Code | HTTP | When | Means to the operator | The `fix` a person reads |
|---|---|---|---|---|
| `SCHEMA_NEWER` | 503 | the record's `MAX(migration.version)` exceeds the code's | a rollback or a stale image met a migrated record | *Deploy the newer build; the data is intact.* |
| `SCHEMA_MISMATCH` | 503 | a migration file's checksum differs from the stored one | someone edited a shipped migration | *Restore the file's original bytes and redeploy; a change is a new numbered file.* |
| `NO_SUCH_MODULE` | — (boot) | the SQLite build lacks FTS5 | the wrong runtime — Bun, an old Node | *Use Node 24.13+ or the official image.* |
| `FORMAT_NEWER_THAN_READER` | 422 | a file's `user_version` above the reader's | a `.brain` from a newer build | *Upgrade this instance, then import.* |
| `SIGNATURE_INVALID` | 422 | `dog_sig` does not verify | the wrong `--key`, or a tampered or truncated file | *Verify with the record's current public key; if it still fails, use another night's backup.* |
| `CHECKSUM_MISMATCH` | 422 | `dog_manifest` disagrees with the rows; or a migration file with its row | a corrupt or edited file | *Use another backup; never edit a `.brain` by hand.* |
| `IMPORT_NOT_EMPTY` | 422 | `import` into a record with rows | the target is not fresh | *Import into a new record or a fresh directory.* |
| `WRONG_KEY` | 409 | a `kek_id` in neither `KEK` nor `KEK_PREV` | a retired KEK, or a restore from before two rotations — never *corrupt* (12 §6.1) | *Put the key back in `KEK_PREV` if you still hold it; else reset the vault.* |
| `NEEDS_BROWSER_SESSION` | 403 | a bearer at VAULT, ADMIN or the JOBS session half | a token where the owner's browser is required; the CLI turns it into an operation grant request (48 §5.2) | *Do this from the owner's browser.* |
| `FORBIDDEN` | 403 | a write on a `lapsed` record | billing | *Read-only until billing resumes. Export is available.* |
| `UNAUTHORIZED` | 401 | revoked, expired, or created before `TOKENS_VALID_FROM` | the body says only this (12 §8); the reason is in `wrangler tail` | — |
| `DEVICE_CODE_EXPIRED` · `DEVICE_CODE_TRIES` | 422 | an enrolment past ten minutes · the fifth wrong code | re-run `enroll` | *Run enroll again and approve within ten minutes.* |

Twelve, counted. A `500` is bare and a `401` says one word; the operator reads reasons in the log, never in a response.

## 7 · Performance budget

| Objective | Cloud | Self-host | Measured how |
|---|---|---|---|
| RPO — recovery point | PITR: any point in 30 days (01 §2) · `.brainl.age`: ≤ 24 h + the walk's duration | ≤ 24 h | `walk.done.ms`; the snapshot's `at` |
| RTO — PITR, §5.5(a) | ≤ 15 min by the runbook; the platform restore completes on restart | — | timed, in the ops record |
| RTO — from `.brainl.age`, §5.5(b), ≤ 100,000 rows | ≤ 1 h end to end; the import itself ≤ 5 min (100 pages of ≤ 1,000 rows) | ≤ 30 min | the monthly drill, §5.4 step 5 |
| Backup size per record | `.brainl` ≈ 300–600 B per row — the 03 §4 record, 3,118 rows, ≈ 1–2 MB; age adds ≈ 200 B plus 16 B per 64 KiB; the consumer throws above 40 MiB (51 §5.12) | as a `.brain`, page-padded, ≈ 1.5× | `customMetadata.bytes`; `walk.backup.bytes` |
| The walk | ≤ 10 min end to end; ≤ 450 records per invocation at two subrequests each; ≤ 2 s per record at 10,000 rows | — | `walk.done.ms`; alert above 10 min |
| Re-wrap per record | 3 rows, one transaction, ≤ 50 ms | same | `walk.ms` on a rotation night |
| Erase cascade | one transaction ≤ 2 s at 100,000 events; `erase.r2` inside one 300 s lease | same | the `erase` event's `ts` against the ack |
| Lapse ladder | days 0 · 60 · 83 · 90; nothing remains by day 120 | — | the test clock, §9 |
| Deploy to a verified boot line | ≤ 10 min; the 15-min error watch follows | — | `deploy.yml` duration |

Nine, counted. `ponytail:` RTO is a drill number, not an SLO — the drill log is the measurement until a customer count
justifies automating it.

## 8 · Security

**Who may run what.**

| Actor | May | Through |
|---|---|---|
| The owner | ADMIN, VAULT, the JOBS session half; PITR restore; erase; delete; the passphrase | a browser session — never a token (ADR-060) |
| The owner's CLI | DATA and READ+ on its token; `export import planPack installPack uninstallPack token create list revoke` under an operation grant — ten minutes, one command, approved in the browser (48 §5.2, D1) | `braindog login`, then the grant per command |
| `system` — the walk | snapshot, re-wrap, reconcile, ladder, deletion at day 90 | the Worker's cron; every write it makes is an `event` with `actor = 'system'` |
| The operator | `wrangler` — deploy, rollback, secrets, R2; `age -d` on snapshots; the ops record | the Cloudflare account under 2FA; the age identity |
| Nobody | an admin token; a read of a customer's rows without a named reason; a request for a passphrase | — |

**What a backup contains, and does not.** Twenty-five tables: `data`, `origin`, `governance`, plus `counter` and
`vault_key` (03 §3; 33 §9). Not `token`, `device_grant`, `auth_fail`, `observation`, `job`, `job_event`.
`grant.ciphertext` is sealed; `vault_key.wrapped` is wrapped. **The KEK is never in a backup, never in a `.brain`, never
in a log**: it lives in Secrets Store (Cloud) or `/data/kek` (self-host) and nowhere else (12 §6), and the Worker
imports it as a non-extractable `CryptoKey` (51 §8). The age identity that opens `.brainl.age` lives outside Cloudflare —
two copies, the operator's password manager — and the Worker holds only the recipient, `AGE_RECIPIENT`; a Worker
compromise yields sealed snapshots (§13 #13). A self-hoster backs up `/data/kek` and `/data/kek.prev` *separately* from
the snapshots: a snapshot without them opens no vault.

**Audit of operator actions.** Two ledgers. The customer's: every `system` write is an `event` in their record —
`migrate`, `purge`, `grant.rotate`, `export` with its counts or `note: 'failed: …'` — and every read we make is preceded
by a named reason (12 §7). Ours: the ops record, one `note` per procedure (§4), which is itself a BrainDog record with
`/audit` (§13 #15). `secret-grep` (33 §8) keeps every path this spec names free of a plaintext credential.

**Refusals do not leak** (12 §8): `/healthz` returns a tuple, never a slug; a `401` body is one word; the reason is in
`wrangler tail`.

## 9 · Tests and gates

| Gate or drill | Kind | Cadence | Asserts |
|---|---|---|---|
| `deploy-parity` | script, `deploy.yml` | every deploy | `/app/` and `/app/_app/version.json` SHA-256 = `build/app/` (33 §8) |
| `boot-probe` | vitest | CI | a build without FTS5 refuses with the exact text (30 §13) |
| `compat-date` | script | CI | `compatibility_date ≥ 2026-02-24` |
| `brain-roundtrip` | vitest | CI | export → import → export: identical canonical dump |
| `secret-grep` | script | CI | no KEK, token or passphrase in a log line, push payload or prompt |
| `refusal-fixtures` | script | CI | every code in §6 has a fixture |
| `ops-walk` | vitest, 51 | CI | memory `KeyStore` with `KEK` and `KEK_PREV`: `stragglers` counts rows with `kek_id ≠ current`; the re-wrap is a CAS; a row under neither key is `WRONG_KEY` |
| `ops-ladder` | vitest, 51 | CI | an injected `Clock` at days 0 · 60 · 83 · 90: four messages, once each; a write is `FORBIDDEN`; `export` allowed; `pull.fetch` acked `done` unsent |
| `ops-erase` | vitest, 51 | CI | erase on a fixture: sixteen stores tombstoned in one transaction; `erase.r2` drained; `BLOBS.get` null; a planted surviving key raises `erase_open` |
| `ops-revoke` | vitest, 51 | CI | a token created before `TOKENS_VALID_FROM` is `UNAUTHORIZED`; a new `SESSION_SECRET` invalidates a session and a pending code |
| Restore drill | manual, §5.4 | monthly — one random record and the ops record | `✓` twice; round-trip manifests equal; the RTO logged |
| KEK rotation | manual, §5.6 | quarterly, for real | `stragglers = 0` within two nights; a grant opens on the ops record |
| Erasure drill | manual, §5.8 | quarterly, on the ops record | a planted person; FTS and `near` return nothing; `erase_open = 0` |
| Self-host upgrade drill | manual, §5.14 | every release | upgrade, then restore-to-old from the snapshot |

Fourteen, counted. Every drill ends in a `log` note carrying its numbers. A drill without a note did not happen.

## 10 · Deliberate ceilings

- `ponytail:` no operator console — the owner's browser, an owner-approved operation grant, `system` from the cron, and
  `wrangler`. Add an Access-guarded `/ops/*` route when "ask the owner to click" becomes the support bottleneck.
- `ponytail:` no staging environment — the ops record in production is the canary and the drill target. Add
  `env.staging` in `wrangler.jsonc` when a second person deploys.
- `ponytail:` one cron invocation, ≤ 450 records; page across `scheduled()` runs past that or past 10 min.
- `ponytail:` the emergency trigger is a tighter cron deployed for one cycle. Replace it with the `/ops/*` route the
  second time it is used in a quarter.
- `ponytail:` a KEK rotation re-wraps DEKs and re-encrypts no grant; a DEK rotation — new DEK, every grant re-encrypted,
  both versions kept — is not built. Add it when a post-mortem needs it; §5.11(c)'s customer message is the substitute.
- `ponytail:` two KEK slots and rotations ≥ 30 days apart; a third slot when an incident forces two rotations in a
  month and the restores from between them must keep their vaults.
- `ponytail:` no gradual rollout — full deploy, record canary. Revisit only with an RPC that lets old code read a newer
  schema.
- `ponytail:` one R2 bucket; the key layout separates attachments from snapshots. A second bucket when lifecycle rules
  or a separate access policy are needed.
- `ponytail:` one age identity, no rotation schedule; rotate when it leaves the password manager. The cost is re-sealing
  30 nights × N records.
- `ponytail:` lapse is enforced in the Worker while the record's schedule keeps firing; pause the rows in the record if
  the lapsed population's alarm wakes show in the bill.
- `ponytail:` the operator audit is `note` events in the ops record; a dedicated store when a second operator exists.
- `ponytail:` a self-host restore is `import` and loses the `local` tables — tokens and device grants are re-minted; a
  `cp` of a verified snapshot over `record.brain` keeps them in one line. Add it to §5.5(c) when the re-mint cost bites.
- `ponytail:` backups are verified by a monthly manual drill, not nightly by machine — the Worker holds no age identity,
  so a nightly check needs a second runtime. Add a scheduled self-host that decrypts and imports `latest` past ~200
  records.

Thirteen, counted.

## 11 · Dependencies

Runtime: none — this is a document. The procedures use:

| Tool | Version | For |
|---|---|---|
| `wrangler` | 4.128.0 (31 §3) | deploy, rollback, tail, secrets, R2 |
| `age` | ≥ 1.2 | `age -d` on `.brainl.age`; the Worker seals with `age-encryption@0.3.1` (33 §7) |
| Node | 24.13.0, pinned minor | `braindog-cli`; the scratch self-host |
| Docker | current | the self-host image |
| `sqlite3` | 3.50.x | reading `dog_manifest` in a drill; optional |
| `braindog-cli` | the deployed `app` version | export, import, verify, token, runner |

Dev: none beyond 52's. A new tool here is a review finding, not an install.

## 12 · Build order

Before this spec is executable: 41 — the erase cascade and migrations; 45 — `opsReport` and `rewrapKeys` (§13 #4) and
`session.token_id` (§13 #12); 48 — the CLI and its operation grant; 49 — `/healthz`, the `HEALTHCHECK`, the snapshot
timer, `BRAINDOG_KEK_PREV_FILE`; 51 — `scheduled()`, `deleteCustomer`, `pitr`/`restore`, `KEK_PREV`, `AGE_RECIPIENT`
(all present in 51), plus `ops.ts`, `/healthz`, `POST /api/deleteRecord`, `SESSION_SECRET`, `TOKENS_VALID_FROM`, the
lapse cap and the `record_dir.billing` column (§13); 52 — the gates. It is written now so that those specs build
toward it rather than discover it.

Unblocks: the first production deploy — §5.2 is its checklist; the "Cloud: Stripe, signup, backups" row of the Phase A
plan (15 §1b); and the launch answer to *"can you read my data, and what happens if you disappear"* — §8 and §5.5 are
that answer.

## 13 · Decisions taken here

| # | Decision | Amend |
|---|---|---|
| 1 | Drill cadence: restore monthly (one random record + the ops record); KEK rotation quarterly, for real; erasure drill quarterly on the ops record; self-host upgrade drill every release; parity on every deploy | 12 §8 Backups row; 33 §8 (four drill rows) |
| 2 | The KEK ladder 51 hands to 53: two slots, `KEK` and `KEK_PREV`; rotations ≥ 30 days apart; the straggler check is the nightly walk — `vault_key.kek_id ≠ current`, `walk.done.stragglers`, alert after two nights; retirement = `KEK_PREV` overwritten with the current key 30 days after the first clean night, never sooner, because PITR and snapshots inside the window carry the old id; share links under a retired key answer 404 | 12 §6 (a *Rotation* paragraph); 33 §1 `KeyStore`; 33 §7 (`KEK_PREV`) |
| 3 | ADMIN from the CLI is 48's operation grant — ten minutes, one command, owner-approved in the browser, never written — and it reaches exactly `export import planPack installPack uninstallPack` and the three `token` methods; never `erase restore invite setDeclaration`. This is ADR-060's "the CLI's install path is a device grant" made precise, and it is what lets §5.5(b) exist | ADR-060; 33 §4 (an operation-grant row); 33 §5 `login` |
| 4 | Two INTERNAL methods added to 51 D11's list: `opsReport({ observation? })` and `rewrapKeys({ from, to, rows })`. The re-wrap's event is `grant.rotate`, `target_kind = 'vault_key'`, `from_v`/`to_v` the two `kek_id`s, actor `system` — no 41st kind. `snapshot` and `export` may be called by `system` from the walk | 30 §5 (INTERNAL row; ADMIN row); 30 §2; 33 §2 |
| 5 | Billing lives in the Directory: `record_dir.billing ∈ active lapsed`, `lapsed_at`. The ladder is day 0 · 60 · 83 · 90; the five messages of §5.10 verbatim | ADR-059; 33 §10 `record_dir` |
| 6 | Lapse is enforced in the Worker: every principal capped at `read`, `export` admitted for the owner's session, `FORBIDDEN` with the fix sentence; the drain acks `pull.fetch`, `infer.*` and `because: digest.*` notifications `done` unsent; reminders deliver; the record package stays billing-agnostic | ADR-059 (a *Mechanism* paragraph) |
| 7 | Support diagnosis order: tuple → refusal state → `observation` → `event` → `system` suggestions. `observation` first because it holds no values | 30 §13 (after the boot probe); 12 §7 (the named-reason rule points at §5.15) |
| 8 | The nightly walk is 51's `scheduled()` at `17 3 * * *` extended by `ops.ts` with re-wrap, reconcile and the ladder; the ops record leads the first `listRecords` page; snapshot keys and metadata are 51 §5.12's; the `.brainl.age` sits under the record prefix so deletion is one prefix | 33 §1 `Snapshots`; 33 §7 (`triggers.crons`); 03 §6 *Back up*; 12 §8 |
| 9 | `GET /healthz`, unauthenticated: 200 `{ app, format, kernel, primitives }` once the boot probe passed, 503 `{ code }` under a module-level refusal, never a slug. It is the self-host `HEALTHCHECK`. `/api/version` stays the authenticated record-version cursor (33 §4; 51 D22) | 33 §4 (a `/healthz` row) |
| 10 | `vault_key` travels, sealed — 03 §3, 12 §6/§8 and 33 §9 are the reading: six `local` tables, twenty-five travel. A self-host snapshot keeps the six `local` tables (a backup of the instance); an export strips them | 02 §1 ("Seven … `vault_key`" → six, without it); 30 §1 `vault_key` comment (`local: never exported` → travels; `HKDF` → PBKDF2); 32 §2.3; 33 §6 Snapshots |
| 11 | The `person` mirror joins the erase cascade — `email`, `name` → `--erased--`, row kept — sixteen stores in one transaction, R2 the seventeenth. The `erase` event stores the subject as SHA-256, never the value | 02 §10 (cascade table; the event row); ADR-033 |
| 12 | Fleet levers: `session.id_hash`, `magic_link.hash` and `device_grant.code_hash` are HMAC-SHA-256 under the Worker secret `SESSION_SECRET`; `token.hash` and `device_grant.token_hash` are plain SHA-256, and `TOKENS_VALID_FROM` refuses anything created before it. The `session` register carries `token_id`, so a token's writes are one query | 12 §3, §6.1; 33 §7, §10; 02 §1 `session`; 32 §2.1 |
| 13 | The age identity for `.brainl.age` lives outside Cloudflare — two copies in the operator's password manager; the Worker holds only `AGE_RECIPIENT` | 12 §6 (hierarchy), §8 Backups; 33 §7 |
| 14 | No staging environment: the ops record (slug `ops`) in production is canary, drill target and the operator's audit ledger — the "staging record" 51 §14 already restores | 33 §7; 31 §8 |
| 15 | A deploy carrying a kernel migration is never rolled back and never percentage-rolled; the canary is the ops record; recovery is fix-forward | 33 §9 Migrations; 12 §8 Migrations |
| 16 | `schedule.state` has five values — `pending firing done failed paused`; 25 §9 and 30 §1 already use `paused` | 09 §1 (DDL comment and *four states*) |
| 17 | Customer deletion is 51 §5.13's `deleteCustomer`, run by the ladder at day 90 or by the owner through one cookie route, `POST /api/deleteRecord` (ADMIN, the slug typed to confirm); order: a `final` snapshot inside the prefix → `destroy()` on `Record` (alarm, then storage) → `Spark` when it has storage → the R2 prefix → `record.forget`; the fact of the deletion is the ops record's note | 02 §9; 09 §1 *Deleting a record*; 33 §4 (the route); 33 §10 |

Seventeen, counted. Each amendment lands in the same revision-loop iteration (35 §5).

## 14 · Done when

- [ ] §5.2 has run once for real: the `boot` line, the parity result and both version ids are in the ops record.
- [ ] `walk.done` has logged 7 consecutive clean nights with `records` = what `listRecords` returned.
- [ ] One restore drill (§5.4 steps 1–6) completed on the ops record: `✓` twice, the RTO in the note.
- [ ] One KEK rotation (§5.6) completed: `stragglers = 0`, a grant opened, `KEK_PREV` holding the previous key with its
      retirement date noted.
- [ ] One erasure drill (§5.8) on the ops record: FTS and `near` empty, `erase_open = 0`.
- [ ] `ops-walk`, `ops-ladder`, `ops-erase`, `ops-revoke` green in CI; `deploy-parity` is the last step of `deploy.yml`.
- [ ] `SESSION_SECRET`, `TOKENS_VALID_FROM` (unset = the epoch) and `AGE_RECIPIENT` exist; `braindog-kek` and
      `braindog-kek-prev` exist and their `kek_id`s are known.
- [ ] The age identity is in the password manager twice and nowhere else, and has decrypted one `.brainl.age`.
- [ ] `/healthz` answers unauthenticated on Cloud and on a self-host container whose `HEALTHCHECK` reads `healthy`.
- [ ] The five lapse messages and the two passphrase sentences are in the UI copy, verbatim from §5.10 and §5.7.
- [ ] Every §13 amendment is applied in its document.

Eleven, counted.

---

*Previous: [52-SPEC-TESTING](52-SPEC-TESTING-AND-CI.md). Back to the index: [00-README](00-README.md).*
