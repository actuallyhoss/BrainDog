# 53 · Operations — specification

Cross-cutting. Derives from [03-DOG-FORMAT](03-DOG-FORMAT.md), [12-SECURITY](12-SECURITY.md) §6–§9,
[33-CONTRACTS](33-CONTRACTS.md) §6–§10, [30-BLUEPRINT](30-BLUEPRINT.md) §11 and §13, [02-DATA-MODEL](02-DATA-MODEL.md)
§9–§10, [09-ALARMS](09-ALARMS-AND-NOTIFICATIONS.md) §1, [ADR-052](16-DECISIONS.md), [ADR-053](16-DECISIONS.md),
[ADR-059](16-DECISIONS.md), [25-CONNECTORS](25-CONNECTORS.md) §9, [26-BYO-INTELLIGENCE](26-BYO-INTELLIGENCE.md) §5 and
[31-STACK](31-STACK.md) §6. Where the Worker (51) or the CLI (48) already fixed a mechanism this spec uses it by name.

> A runbook is a numbered list a tired person can follow at 3 a.m. Every procedure in §5 has a precondition, steps,
> a verification and a rollback, in that order, and names the command rather than describing it. Where the corpus
> decided a mechanism this spec cites it; where it did not, §13 decides and names the document to amend.

*Rewritten on September 28th 2026 against the tree.* The amendments of September 16th said which
commands and doors did not exist yet; they do now, so those notes are folded into the text and removed. Every step
below names a command, a script or a screen that runs in this tree, and where something is still not built the step
says so where it is taken. Where the build departs from what this spec first decided, the section says what was built
and why, and §13 keeps the decision with its amendment.

---

## 1 · Purpose and boundary

**What it does.** The complete set of procedures an operator runs against BrainDog Cloud — one Worker, three Durable
Object classes (33 §7) — and against a self-host — one Node process (33 §6) — and the surface those procedures use.
It is the runbook set. There is no `docs/ops/` directory; this document is it.

**What it refuses.**

- No operator console and no admin token (ADR-060). Every per-record action runs as the owner (a browser session, or
  an operation grant the owner approved, 48 §5.2) or as `system` from the Worker's own schedule. The operator's one
  key, the Worker secret `PROVISION_KEY`, opens three doors, `/auth/provision`, `/auth/claim/mint` and
  `/auth/suspend`, and none of them reads a record's rows. The operator's tools are `wrangler`, `node` with this
  repository's scripts, `braindog` and `docker`.
- Never a read of a customer's rows without a named reason written first (12 §7).
- Never a restore that loses what it replaced: a restore goes back to a kept copy and keeps the record as it stood as a
  `before-restore` copy first (§5.5), and `braindog import` replaces a record only with a copy of that same record.
- Never a downgrade: kernel migrations are forward-only (02 §7). A downgrade is a restore.
- Never a request for a keychain password (12 §7).

**Boundary.** The code the procedures lean on lives elsewhere, and there is no `ops.ts`: what this spec once asked of
one file is spread over the Worker's own modules. The nightly walk is `apps/worker/src/nightly.ts`, wired in
`nightly()` in `apps/worker/src/index.ts`, with the re-wrap in `rewrap.ts`, the lapse ladder in `ladder.ts`, the copies
in `snapshots.ts`, `copies.ts`, `seal.ts` and `directory-copy.ts`, and deletion in `destroy.ts`. The lapse cap is
`lapse.ts`, the token cut-off `cut-off.ts`, the log lines `oplog.ts`, the liveness door `health.ts`. The self-host's
halves are `apps/selfhost/src/backup.ts`, `snapshots.ts`, `restore.ts`, `keys.ts` and `smtp.ts`. The operator's
scripts are `apps/cli/scripts/restore-drill.mjs`, `apps/cli/scripts/migration-rehearsal.mjs`,
`apps/worker/scripts/rollback.mjs` and `apps/worker/scripts/smoke.mjs`, and the deploy is
`.github/workflows/deploy.yml`. The gates are in `tools/gates/` (52), the CLI is 48, the self-host 49, and the
settings every one of these reads are listed in `DEPLOYMENT.md`. This spec owns the procedure.

## 2 · Public API

The operator's surface: two command sets, one log stream with its dashboards, and one container.

### 2.1 · `braindog` (33 §5; 48)

Every command below is dispatched by `apps/cli/src/main.ts`; `braindog help` prints the full list.

| Command | Used in | Note |
|---|---|---|
| `braindog login <host>` | every Cloud procedure the CLI runs | the device grant; a token in `hosts.json`. An ADMIN command asks for an **operation grant**: ten minutes, one command, approved by the owner in the browser for the named subject, held in memory, never written (48 §5.2, D1) |
| `braindog export [--redact-grants] [-o <file.brainl>] [--key <pubkey\|url>] [--host <host>]` | the restore point before a push (§5.2), handover | operation grant. The sealed grants travel unless `--redact-grants` is given, so the file can put the Keychain back; the file is checked with `verify` as it lands |
| `braindog import <file.brainl> [--key <pubkey\|url>] [--host <host>]` | §5.5 (b) | operation grant. It always replaces the record, and the record refuses a file that is not its own copy, naming both ids; the file is verified on this machine before anything is sent |
| `braindog verify <file> [--key <pubkey\|url>]` | every backup check, §5.4 | offline: format, every table against the manifest, the signature; a self-host `.brain` is checked against its `.brain.sig` |
| `braindog init <slug> --owner <email>` · `init <slug> --from <copy>` | a new self-host record; §5.4's drill; §5.5 (c) | spawns the self-host's entry (48 §5.14) |
| `braindog token create [--name] [--scope read\|propose\|write] [--days <n>] [--host]` | the canary's token (`DEPLOYMENT.md`) | operation grant. There is no `token list` or `token revoke` in the CLI; revoking is Settings > Agents in the owner's browser (§5.11) |
| `braindog runner enrol <host>` · `runner run` | §5.13 | 26 §2.3 |
| `braindog --version` | every support call | the tuple, 31 §6 |

Exit codes: 0 ok · 1 refused · 2 conflict · 3 unreachable. `--json` is accepted by the commands 48 §4.5 lists and
answers one envelope; the procedures on this page read the readable output.

### 2.2 · `wrangler` (31 §3)

The version `apps/worker/package.json` pins, run as `pnpm exec wrangler` in `apps/worker` (or `apps/site` for the
marketing site), always with `--env production` for the live deployment.

| Command | Used in |
|---|---|
| `wrangler deploy --env production` | §5.2: only from `deploy.yml`, never by hand for a forward deploy; `--dry-run` by hand checks without deploying |
| `wrangler deployments list --env production` | §5.2, a rollback by hand; `deploy.yml` reads `deployments status --json` |
| `wrangler rollback <version-id> --env production --message "<why>"` | §5.2: forbidden after a kernel migration, a Durable Object class migration or a `DIRECTORY_VERSION` change |
| `wrangler tail --env production --format json [--search <text>] [--status error]` | §5.2, §5.3, §5.15 |
| `wrangler secret put <NAME> --env production` | §5.6 (`KEK`), §5.11 (`SESSION_SECRET`, `TOKENS_VALID_FROM`): the value at the prompt, never an argument |
| `wrangler r2 object get braindog-blobs/<key> --remote --file <path>` | §5.4, §5.5 |
| `wrangler r2 object delete braindog-blobs/<key> --remote` | §5.8 |

### 2.3 · The Worker's observability

A log line carries the code, the id and the shape, never a field value, a credential, a prompt or a payload (12 §8;
35 §2). Every line the Worker writes is one JSON object with `op` first, written by `op()` in
`apps/worker/src/oplog.ts`, which also replaces anything shaped like an address and cuts a string at 300 characters, so
a caller who slips cannot publish a person's words. Under that, `installLogFloor` (`packages/host/src/log-floor.ts`)
takes every console line either host writes, whoever wrote it, and strikes what is shaped like a key, an address, a query
string or a regular expression a runtime quoted, and cuts it at 2,000 characters; `crashed` and the ops mail read through
the same floor, and an alarm or a cron that throws is thrown on with its words floored, because the platform logs what
escapes. No list of shapes is every key, so a line still carries no value on purpose. Workers Logs keeps them
(`observability.enabled` in `apps/worker/wrangler.jsonc`). The lines an operator reads:

| `op` | Emitted | Fields |
|---|---|---|
| `boot` | the first open of a record after a deploy, the boot probe (30 §13) | `rec` `app` `kernel` `fts5` |
| `refuse` | a record whose migrations disagree with this build: every call 503 | `rec` `code` ∈ `SCHEMA_MISMATCH SCHEMA_NEWER` |
| `crash` | anything a door did not catch: a bare 500 carrying only a reference | `ref` (the reference the person was shown) `where` (the door, never the whole path) `error` |
| `outbox` | every ack of an outbox row | `rec` `kind` `state` ∈ `done failed dead` `attempts` `ok`, `code` when the ack was refused; for `pull.fetch` also `ingest` and `http`, the status the provider answered |
| `walk` | per record, nightly; `rec: "directory"` for the Directory's own copy | `rec`; `kek` ∈ `ok rewrapped straggler failed`; `backup` ∈ `ok failed` with `rows` `bytes` `backup_ms`, or `why`; the erasure check; the ladder's `billing` step with `ok` and `days`; the expiry of a closed record's copies (`closed`, `expired`); the ledger replay |
| `walk.done` | once, nightly, `error` level when anything in it is a problem | `records` `backups` `backups_failed`; `stragglers`; `erase_open`; `lapsed` `lapse_letters` `lapse_deleted` `lapse_failed`; `expired_objects` `expiry_failed`; `replayed_runs` `replay_lost` `replay_failed`; each only when its step ran; `ms` |
| `mail` | every send | `kind` `ok`, `why` when it did not go; never the address or the letter |
| `auth` | a refused sign-in | `flow` `ok: false` `why` |
| `cut-off` | an unreadable `TOKENS_VALID_FROM`, once per isolate | `ok: false` `why` `fix` |
| `limit` | the rate limiter threw, so the door stayed open | `class` `error` |
| `restore` | a restore the record answered and the Worker could not finish | `bookmark` `why` `fix` or `error` |
| `billing` | the checkout, portal and webhook doors, and what the webhook did | `door` or `did`, `ok`, `why`, `rec`, Stripe's `status` and `code` |

Dashboards: **Workers Logs** for the lines above; **Analytics Engine** for counts and durations, one point per request
with the record id hashed under a key that changes every month, once `TELEMETRY` is bound (12 §7; 51 §5.18;
`apps/worker/src/telemetry.ts`); **the ops record**, the operator's own BrainDog record named by `OPS_RECORD`, where the
walk writes the night as one note (§5.1). Three, counted.

**The alerts** are the saved Workers Logs queries in `DEPLOYMENT.md` "Alerts", each naming the runbook here that answers
it: a crash (§5.11 or a rollback, §5.2), a migration refusal (§5.3), a failed copy (§5.4), an erasure left open (§5.8),
a dead outbox row (§5.15), a paused connector (§5.12) and a KEK straggler (§5.6). No Cloudflare notification fires on a
query today, so they are read by a person at the morning check (§5.1 step 5); the one alert that pushes is the uptime
check on `/healthz`.

The owner sees a different set, inside the record, and the operator does not: a failed copy's `export` event and its
suggestion (12 §8); the dead-letter `suggestion`, `body_kind = 'change'`, `opened_by = 'system'` (30 §8); a paused
connector's urgent item (25 §9); and the lapse letters and banner (§5.10).

### 2.4 · The self-host (33 §6)

```
docker run -d --name braindog --restart unless-stopped \
  -p 127.0.0.1:8080:8080 \
  -v /srv/braindog:/data \
  --env-file /srv/braindog.env \
  ghcr.io/<owner>/braindog-selfhost:<date>-<sha>
```

The image is built by `.github/workflows/image.yml` from `apps/selfhost/Dockerfile` and pushed to ghcr.io only when
the repository variable `IMAGE_PUSH` is `true`; its tag is the UTC date and the first eight characters of the commit,
and a `v*` tag also moves `latest`. The image sets `BRAINDOG_DATA=/data` and `PORT=8080`, runs as `node`, and holds no
key, token or host. `/srv/braindog.env` holds `BRAINDOG_HOST=0.0.0.0` (the process listens on loopback by default, which
inside a container is unreachable; the `-p 127.0.0.1:` above keeps the published port on the machine's own loopback),
`BRAINDOG_ORIGIN=https://<the name the proxy serves>`, and optionally `BRAINDOG_SESSION_SECRET`,
`BRAINDOG_SMTP_URL` with `BRAINDOG_MAIL_FROM`, `BRAINDOG_TOKENS_VALID_FROM` and `BRAINDOG_TOKEN` (a private single-user
instance). The root key is `/data/kek`, made on first run, and during a rotation the previous one sits beside it as
`/data/kek.prev` (§5.6). `DEPLOYMENT.md` lists every name. TLS is the reverse proxy's.

Health: `GET /healthz`, unauthenticated (§13 #9): 200 `{ ok, app, format, kernel, primitives }` once the boot probe has
passed, 503 `{ code }` under a module-level refusal, never a slug. The Worker answers the same door from the Worker
alone, without waking a record or the Directory (`apps/worker/src/health.ts`), which is what the uptime check reads.
`/api/version` stays what 33 §4 and 51 D22 make it: the record version for the polling fallback, behind auth. The
Dockerfile's check needs no curl:

```
HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
```

## 3 · Files

The runbooks are sections of this document. The files an operator edits or reads:

| File | Owner | The operator touches it for |
|---|---|---|
| `apps/worker/wrangler.jsonc` | 51 | `triggers.crons: ["17 3 * * *"]` · `vars` (`AGE_RECIPIENT`, `OPS_RECORD`, `BILLING` and the rest `DEPLOYMENT.md` lists) · `r2_buckets` · `ratelimits` · `compatibility_date` ≥ 2026-02-24 (gated) · DO migrations: `new_sqlite_classes`, `transferred_classes`, **never `deleted_classes`** (12 §8) |
| Worker secrets `SESSION_SECRET`, `TOKENS_VALID_FROM`, `PROVISION_KEY` | 51 | §5.11; the operator's three doors (§1) |
| Worker secret `KEK`, one key or two | 51 | §5.6. A Secrets Store binding of the same name may stand in for it, drafted and commented in `wrangler.jsonc`; never a second name |
| `apps/worker/src/nightly.ts` and its neighbours (§1) | 51 | what the walk does each night, §5.1 |
| `apps/cli/scripts/restore-drill.mjs` · `migration-rehearsal.mjs` | 48 | §5.4's drill; §5.3's rehearsal |
| `.github/workflows/deploy.yml` · `apps/worker/scripts/rollback.mjs` · `smoke.mjs` · `tools/gates/deploy-parity.mjs` | 52 | every deploy, §5.2 |
| `apps/selfhost/Dockerfile` · `.github/workflows/image.yml` | 49 | the `HEALTHCHECK`; the `<date>-<sha>` tag |
| `/srv/braindog.env` · `/data/kek` · `/data/kek.prev` · `<slug>/snapshots/` · `directory-snapshots/` | the self-hoster | §5.14, §5.5 |
| the ops record | this spec | the record `OPS_RECORD` names, owned by the operator: the walk's nightly note, and one `log` note per procedure run (§8) |

**The procedures**, sixteen, counted: §5.1 the nightly walk · §5.2 deploy · §5.3 migration rollout · §5.4 backup ·
§5.5 restore · §5.6 KEK rotation · §5.7 passphrase · §5.8 erasure request · §5.9 customer deletion · §5.10 billing
lapse · §5.11 incident response · §5.12 connector paused · §5.13 runner · §5.14 self-host upgrade · §5.15 support
diagnosis · §5.16 account recovery and closing.

## 4 · Data structures

The artefacts an operator handles, each with invariants a test can check.

| Artefact | Shape | Invariants |
|---|---|---|
| **`.brainl.age`** | an age-sealed `.brainl`. R2 keys `<rec_id>/snapshots/nightly-<YYYY-MM-DD>.brainl.age` and `<rec_id>/snapshots/latest.brainl.age`, and a copy the record takes itself (`now-`, `before-restore-`, `final-`) under the same prefix; `customMetadata` carries the PITR bookmark, rows, bytes and time (`apps/worker/src/snapshots.ts`) | 25 tables, 31 less the six `local` (03 §3); `grant.ciphertext` sealed; `vault_key` present and wrapped; never a KEK, token, device grant, lockout, observation or job row; the 30 newest dated copies plus `latest`; ≤ 40 MiB; sealed to exactly one recipient, `AGE_RECIPIENT` |
| **The Directory's copy** | the Directory's durable tables, sealed the same way, under `directory/snapshots/`, outside every record's prefix (`apps/worker/src/directory-copy.ts`) | taken first each night, before any record; 30 kept, so a closed account ages out of the copies in 30 days (§5.16) |
| **`.brain` / `.brainl`** | 03 §2–§3 | `application_id` 1145193761; `user_version` 1; `dog_manifest` hashes the canonical projection (34 §5); `dog_sig` is Ed25519 by the producing record; `braindog verify` passes offline. A self-host copy is a `.brain` with a detached `<id>.brain.sig` beside it |
| **PITR bookmark** | the string `getCurrentBookmark()` returns as a copy is dumped | recorded in that copy's metadata; a copy is gone back to by its own bookmark and never by looking one up for its instant; valid for 30 days, and a copy older than that is refused for an in-place restore |
| **The KEK** | the Worker secret `KEK`: 32 bytes as 64 hex characters or base64url, or two such keys separated by a space during a rotation, the new one first; self-host `/data/kek` and, during a rotation, `/data/kek.prev`, 0600 | `kek_id` = first 18 hex of SHA-256(raw key) (34 §5); `current()` is the first key and `byId` knows both; every `vault_key` row `wrapped_by = 'kek'` carries a `kek_id` the store knows; at most two keys at once; an id is never reused |
| **The wrapped DEKs** | `vault_key` rows `record` · `connector` · `signing` (30 §1) | exactly one wrapping per row; `connector` is always `kek` (ADR-052); a `passphrase` row has `salt` and `kek_id NULL`; `grant.kek_id` = `vault_key('record').kek_id` while `wrapped_by = 'kek'` |
| **The signing key** | `vault_key('signing')`, Ed25519; `key_id` = first 16 hex of SHA-256(public key) | made with the record when `KEK` is bound; a record made before that, or with `PROVISION_WITHOUT_KEYS`, has none. The public half is served at `https://app.brain.dog/<slug>/.well-known/braindog-key` (`{ key_id, public_key }`), which is what `--key` names; without `--key`, `verify` checks the file against the key it carries and says that proves nothing about whose key it is. Settings > Export does not draw the key yet |
| **The version tuple** | `app <date>+<sha> · format <user_version> · kernel <migration> · primitives <PRIMITIVES_VERSION>` (31 §6) | `format` moves only with `-- format-bump`; `kernel` = `MAX(migration.version)`; a bug report without it is sent back for it |
| **A device grant** | a `device_grant` row (30 §1) | `pending approved active expired denied revoked`; `token_hash`, never the token; `expires` rewritten to +90 d on activation; `last_used` older than 14 d → `expired`, the customer told (26 §2.4); a `denied` row is never purged |
| **The dead-letter suggestion** | a `suggestion` row, `body_kind = 'change'`, `opened_by = 'system'` (30 §8) | names kind, error and a payload summary, never a payload value; one per `dead` outbox row |
| **Billing state** | a Directory `dir_billing` row, one per record somebody pays for or was given a plan: `state` ∈ `active past_due lapsed comp`, `lapsed_at`, `told` ∈ `'' 0 0,60 0,60,83 0,60,83,90` (§13 #5) | a record with no row is never capped and never deleted; `comp` never lapses; `lapsed` caps every principal at `read`, export admitted; deletion only at `lapsed_at + 90 d` with `told = 0,60,83` (§5.10) |
| **An operator audit line** | a `note` in the ops record | ≤ 280 chars: `<procedure> <rec_id> · <reason>`; written **before** the action. The walk's own note and the drill's line are the two that are written after |

Twelve, counted.

## 5 · Algorithms

Every procedure: **Precondition → Steps → Verify → Rollback.** "The owner" is the record's owner in a browser
session; "the operator" is us, with `wrangler`.

### 5.1 · The nightly walk

Every scheduled operator duty hangs off one cron invocation. Cloud: the Worker's `scheduled()` at `17 3 * * *` UTC
runs `nightly()` in `apps/worker/src/index.ts`, which hands `nightlyWalk` (`apps/worker/src/nightly.ts`) its steps.
Self-host: `nightlyBackups` in `apps/selfhost/src/backup.ts` at `BRAINDOG_BACKUP_AT` (03:20 UTC by default), caught up
on start when the machine was off, over its own records; it copies and does nothing else, because the self-host
re-wraps at start (§5.6) and has no billing.

1. **The Directory's copy first**, because every record depends on it: its durable tables, sealed to `AGE_RECIPIENT`,
   under `directory/snapshots/`, thirty kept (`directory-copy.ts`). A failure is one `walk` line with
   `rec: "directory"` and makes the invocation red once the records have had their turn.
2. **The records**: every open record the Directory's `listRecords` pages through. A closed record is not listed, so
   its prefix is visited only by step 4's expiry.
3. **Each record, in order**, one failure never costing another record its night:
   - a. **Re-wrap** its keys under the current root key (`rewrapRecord`, `rewrap.ts`): `kek` is `ok` (nothing to move),
     `rewrapped`, or `straggler` (a row under a key the store no longer holds); a throw is `failed`. Before the copy, so
     tonight's copy holds the keys under tonight's key.
   - b. **The copy**: the record dumps itself, and the Worker seals the dump to `AGE_RECIPIENT`, puts the dated key and
     `latest.brainl.age`, and keeps the 30 newest (`snapshots.ts`). A failure is `backup: "failed"` with its `why`.
   - c. **The erasures checked against the bucket**: each `erase.r2` row pending longer than a day, dead, or done with
     its object still in R2 counts in `erase_open`, and a key still there is put back on the record's outbox.
   - d. One `walk` line for the record.
4. **After the records**: the lapse ladder, once, over the Directory's lapsed rows (`ladder.ts`, §5.10); then every
   record closed more than `FINAL_KEPT_DAYS` (30) ago has its prefix emptied, the final copy included (§5.9); then each
   record hands the Directory its last forty days of metered runs again, and a run already counted adds nothing. Last,
   **`walk.done`**, on every night including an empty one, and, when `OPS_RECORD` is set, the night as one note in the
   ops record: `walk <date> · <records> records · <stragglers> stragglers · <failed> failed · <open> open`. A night
   where every record's copy failed, or the Directory's did, makes the invocation itself red.
5. **Morning check**, the ops walk: a person, daily, five minutes.
   - Open the ops record and read last night's `walk` note. No note is a red row: the walk did not run or could not
     write, and `wrangler tail` or Workers Logs says which.
   - Open each saved query of `DEPLOYMENT.md` "Alerts". Each red row opens its runbook.
   - Read the host's last restore test, which the Directory keeps (§5.4 step 3): Settings > Backups on any record says
     `This host's last restore test: passed 12 days ago` (`GET /account/drill`, `{ at, pass, records }`), and with
     `OPS_RECORD` set the ops record holds the same as a `drill <date> · pass · <n> records` note. A test that opened no
     record's copy (`records` 0) reads `This host's last restore test, 12 days ago: the Directory's copy opened; no
     record's copy was tried`, marked `Not proven`, and is a fault. The drill is monthly:
     a pass more than 35 days old reads Overdue, a failed one reads failed, and "Never tested" means no drill has ever
     reported; each is in the fault tone, a red row, and the day's work is §5.4. The walk cannot write this fact for
     you: the Worker holds no age identity and never opens a copy, so the drill is the only thing that does, and its
     report is the only record that it did.
   - Once a quarter the same look finds the last `rotation` note (§5.6) and the last erasure drill (§9).

Verify: `walk.done.records` = the records the Directory lists as open; `backups_failed = 0`; `stragglers = 0`;
`erase_open = 0`; `lapse_failed = 0`; the note is in the ops record; the host's last drill passed and is at most 35 days old.
Rollback: none needed, every step is idempotent: the re-wrap is a compare-and-set on `kek_id`, a copy overwrites
`latest`, an erasure check re-deletes, the ladder sends each notice once (`told`), and a replay counts nothing twice.

`ponytail:` one cron invocation. To run the walk *now*: in the dashboard, Workers & Pages > `braindog-production` >
Settings > Trigger events, add the cron `*/10 * * * *`, wait for one fire in `wrangler tail`, and remove it. The next
deploy writes `wrangler.jsonc`'s triggers back anyway, so a trigger left behind lasts one deploy at most. That is the one
emergency lever, and §5.6 and §5.11 use it.

### 5.2 · Deploy

A deploy is `.github/workflows/deploy.yml` and nothing else; `DEPLOYMENT.md` "How a change reaches production" is the
route and "Pushing a workflow" the checklist around it. This section is what the operator does at each step.

Precondition: the change is a pull request, and `ci` and `gates` are green on it (a workflow's pull request carries
the `full-gates` label); yesterday's `walk.done` clean; you know whether the diff from the deployed sha (the tail of
`curl -s https://brain.dog/.well-known/braindog-build`) touches `packages/kernel/src/migrations/`, the `migrations`
block of `apps/worker/wrangler.jsonc`, or `DIRECTORY_VERSION` in `packages/record/src/directory.ts`. If the first, §5.3
applies too; any of the three makes the deploy one that cannot be rolled back.

1. **A restore point** on the live record: Settings > Backups > "Back up now", and
   `braindog export -o <slug>-<date>.brainl --host https://app.brain.dog/<slug>` on your own machine. `log` in the ops
   record: `deploy <sha> · replaces <live sha>`.
   The deploy also takes its own: the "Take a restore point" step of `deploy.yml` asks the Worker to open every record
   written in the last seven days, and to copy each when a migration changed. A missing `PROVISION_KEY` is red when a migration changed and "not run"
   otherwise. A 404 from that door before the deploy is "not run" either way, said as a warning when a migration
   changed, because the deploy that first ships the door has to be able to run; after the deploy the same 404 is red
   once a migration shipped. A walk that asked nobody is red while `SMOKE_SLUG` names the canary. Going back is proven monthly on the canary by `node apps/worker/scripts/go-back.mjs`, from
   `watch.yml`.
2. **Merge.** `ci` runs on `master`; `deploy.yml` starts on its success and waits for the reviewer.
3. **Approve** in the run's page. The job records the live app and site versions and the live sha, deploys the app
   with `BRAINDOG_BUILD` set, then runs Parity: `/` and `/_app/version.json` from the live host must hash to the
   build's output (33 §8 `deploy-parity`; 18 §6). A mismatch is a deploy **live and wrong**.
4. The site deploys, then Smoke: `/healthz`'s `kernel` must equal the count of files in `packages/kernel/src/migrations/`,
   and with `SMOKE_TOKEN` set, `boot` on the canary record must answer 200. The sandbox smoke runs one script on
   `OPS_RECORD` when it is set.
5. Open the ops record in a browser. If nothing opened it since the deploy, its boot probe runs now.
6. `wrangler tail --env production --format json --search '"op":"boot"'`: one line with `"app":"<date>+<sha>"`,
   `"fts5":true` and the expected `"kernel"`.
7. For fifteen minutes, `wrangler tail --env production --format json` filtered to `"op":"crash"`, `"op":"refuse"`
   and `"op":"mail"`. Then open the live record on a phone and on a laptop: Home, Money, one write, one search, one
   sign-in.

Verify: `GET /healthz` returns the new tuple; the `boot` line's `kernel` equals the highest migration file in the
tree; Parity and Smoke are green.
Rollback: `deploy.yml` does it. After a red Parity or Smoke, `apps/worker/scripts/rollback.mjs decide` reads the diff
from the recorded live sha and answers `ROLL` (the app back to its recorded version, and the site too after a red
Smoke) or `HOLD`, which it answers when a kernel migration, a Durable Object class migration or a `DIRECTORY_VERSION`
change is in the diff, or when anything it needs is unknown. The run stays red either way. After a `HOLD`, fix forward:
every record that migrated answers the old code with `SCHEMA_NEWER` (503), and an older Worker refuses the newer
Directory. If the live record itself is broken, restore it to step 1's point (§5.5 (a)). By hand, when the automatic
step could not act: `wrangler deployments list --env production`, then
`wrangler rollback <version-id> --env production --message "<why>"`, never after one of the three. A hand rollback lasts
until the next green `ci` on `master`, which deploys again; `git revert` of the bad commit is what keeps one.

`ponytail:` no gradual rollout (`wrangler versions deploy --percentage`) — with per-record forward-only migrations, a
record the new version touched refuses the old one, so a traffic split is an outage split. The canary is a record — the
ops record — not a percentage.

### 5.3 · Migration rollout

A kernel migration is forward-only and checksummed, applied per record in the DO constructor under
`blockConcurrencyWhile` on that record's first request after the deploy (02 §7; 33 §9). The fleet migrates lazily, one
record at a time, as records wake — which is what makes the ops record a real canary.

Precondition: the file is in `packages/kernel/src/migrations/`, numbered next; kernel tests and `brain-roundtrip` pass
against it in CI; a `-- format-bump` line only if an older reader would *misread* the file (30 §11); no
`deleted_classes` in `wrangler.jsonc`; last night's copies clean (§5.4), because they are the rollback; and the
**rehearsal** has passed on last night's copy of the live record:

```
wrangler r2 object get braindog-blobs/<rec_id>/snapshots/latest.brainl.age --remote --file <tmp>/night.brainl.age
node apps/cli/scripts/migration-rehearsal.mjs <tmp>/night.brainl.age --identity <age identity file> --deployed <live sha>
```

It checks out the deployed sha as a `git worktree` under the OS temp folder, restores the night there with the deployed
kernel, opens that file with this tree's kernel so every new migration runs over the real rows, compares every table
count and list, and calls `boot` and one `list` per register. It prints PASS or FAIL, naming a migration that threw,
and removes the worktree. An identity path inside the repository is refused before it is read. FAIL stops the merge.

1. Deploy (§5.2). The ops record migrates at its step 5.
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
| Cloud | `.brainl.age` to R2 under `<rec_id>/snapshots/` (03 §5; `apps/worker/src/snapshots.ts`) | the walk, `17 3 * * *` UTC (§5.1) | the 30 newest nightly copies + `latest` |
| Cloud | the Directory's `.dirl.age` under `directory/snapshots/` (`apps/worker/src/directory-copy.ts`) | the walk, first | 30 + `latest` |
| Cloud | PITR history | the platform, continuous (01 §2) | 30 days, reached through a kept copy's bookmark |
| Self-host | `VACUUM INTO` → `<slug>/snapshots/<time>Z-nightly.brain` with `<id>.brain.sig` beside it, and the Directory to `directory-snapshots/` (33 §6) | `BRAINDOG_BACKUP_AT`, 03:20 UTC by default, caught up on start | 30 nightly, apart from the 30 a person takes |

The owner's doors (12 §8) are `snapshot` (*Back up now*), `snapshots` (*what is kept*) and `restore`, all ADMIN, on
both hosts; Settings > Backups draws them. On Cloud a copy the record takes itself goes through `copies.ts`, inside the
object, and is sealed through the same path as the night's. `GET /api/snapshots/<id>` streams a self-host copy; on
Cloud it answers a sentence instead, because the copy is sealed to a key the Worker never holds. A self-host copy is the
whole live file, the six `local` tables included, because it is a backup of the instance and not an export; its
signature covers the 25 tables the manifest covers, and `verify` reports 25 (§13 #10).

**The restore drill: proving a copy opens.** The operator, **monthly**, on the live record, and on one other record
chosen at random once there are customers (§9). It is the only thing that ever opens a Cloud copy, because the Worker
holds only the recipient.

Precondition: the age identity where a command can print it (the keychain, or the password manager's command line),
never a plain file in this repository (§8); `wrangler` signed in as the operator; this repository checked out at the
deployed sha, or at least at the same kernel migration count, with its dependencies installed; and, to send the
result, `PROVISION_KEY` in the environment of that one command.

1. Run the drill. It fetches the night's sealed copies itself, with `wrangler r2 object get --remote` from
   `braindog-blobs` (`--bucket` names another), into a folder under the OS temp directory that goes when it ends:
   `node apps/cli/scripts/restore-drill.mjs --record <rec_id> --directory --identity-cmd "<a command that prints the age identity>" --report https://brain.dog`.
   `--record` is repeatable: the live record first, then the canary and the sample. `--directory` fetches
   `directory/snapshots/latest.dirl.age`, loads it into an empty Directory in memory, and asks, for every open record it
   lists, whether that record has an owner who can sign in.
2. What it does to each record's `<rec_id>/snapshots/latest.brainl.age`, in order, stopping at the first failure:
   opens it with the identity (printing only the recipient, which must equal `AGE_RECIPIENT`); runs `braindog verify`;
   restores it with `braindog init drill --from` into a throwaway data directory with a root key of its own; asks, for
   every person on the record, whether the restored Directory and record let them in; exports the restored record and
   compares its manifest with the copy's, table by table (count and hash), and every list's rows; then the round trip
   (`apps/cli/scripts/drill-trip.mjs`): exports twice and compares the bytes, exports with keys left out and counts the
   sealed tables at zero, reads the export for the local tables and the push addresses, imports into a second fresh
   record and searches it, and expects the two refusals for a raised version and a changed byte. `--no-round-trip`
   leaves the round trip out and says so on the verdict line. It prints `PASS` or `FAIL` per copy, then
   `ALL PASS · <n> copies` or `FAIL · <red> of <n> copies ...`, and removes the folder, the plaintext and the records.
3. `--report <origin>` posts the counts, and only counts, `{ at, pass, copies, rows, lists, people, records }`, to the
   operator door `POST /account/ops/drill` with `PROVISION_KEY` as the bearer. The Directory keeps it as the host's
   last drill; with `OPS_RECORD` set the door also writes the note `drill <date> · pass · <n> records` in the ops
   record. The line it prints says what became of it: `not sent: no key`, `not sent: no door`, `not sent: the host
   refused the key`, or `sent to <host>`. Every record's Settings > Backups then reads `This host's last restore test: passed
   just now` from `GET /account/drill`, the same line for every person, because the fact is the host's. A drill that
   opened no record's copy (`records` 0) reads `This host's last restore test, just now: the Directory's copy opened;
   no record's copy was tried`, marked `Not proven`, and is a fault: run it again with a record's copy.
4. Monthly, by itself: `node apps/cli/scripts/restore-drill.mjs --print-timer` with the same arguments prints a launchd
   file (`dog.brain.restore-drill`, the first of the month at 09:17, its log in
   `~/Library/Logs/braindog-restore-drill.log`). Save it in `~/Library/LaunchAgents/` and `launchctl load` it. It holds
   no secret: the identity comes from the command it names, and with no `PROVISION_KEY` its log says `not sent: no key`.

A copy fetched by hand still works: `node apps/cli/scripts/restore-drill.mjs <file>.brainl.age --identity <a file
outside this repository> [--key <pubkey|url>]`, and an already opened `.brainl` needs no identity.

Verify: `ALL PASS`, and Settings > Backups reads `passed` with today's age. A FAIL is an incident on the backups
themselves: open §5.11's timeline, try the night before with its dated key, and do not deploy a migration until a drill
passes. "Never tested" on Settings > Backups is true until the first `--report` lands, and stays in the fault tone.
Rollback: none; a drill touches no live record. On a self-host, `braindog verify <slug>/snapshots/<id>.brain` checks a
copy against its `.brain.sig`, and the drill script runs unchanged on a `braindog export` of the record, which is a
`.brainl` and needs no `--identity`. A self-host has no `/account/drill` door, so its Backups area draws no drill line.

### 5.5 · Restore

| Situation | Path |
|---|---|
| a bad write, rule, import or corruption, Cloud, and a kept copy inside 30 days is before it | **(a) Restore this copy** |
| the copies inside 30 days are all after it, or the copy's PITR history has aged out, Cloud | **(b) from `.brainl.age` with `braindog import`** |
| the record's Durable Object is gone (deleted, §5.9) | **(b′) onto a self-host** |
| self-host | **(c) Restore this copy, or `init --from` into a fresh directory** |

**(a) Restore this copy, Cloud.** The owner, Settings > Backups > a copy > *Restore*: `restore({ bookmark: <copy id> })`,
ADMIN, a sign-in within the last 15 minutes. There is no *restore to a time*: a copy is gone back to by the PITR
bookmark it recorded when it was dumped, never by looking one up for an instant (`copies.ts`).

Precondition: the owner knows which copy is before the damage (`/audit` shows every write with its time); support has
logged the reason.

1. The owner picks the copy and confirms.
2. The record takes a `before-restore` copy, then arms the chosen copy's bookmark with `onNextSessionRestoreBookmark`,
   inside the object, in the same call, so the kept copy and the armed bookmark are one moment. A copy older than 30
   days is refused `OUT_OF_BOUNDS` and nothing changes.
3. The Worker resets the object and, on the object that comes back, calls `restored`, which writes `restore.pitr`
   there (51 D15). Two calls, because an event written before the restore would be rewound with everything else. A
   restore refused after it was armed is reset too, back to the moment of the first arm, and writes no event.
4. The owner reloads: `/audit` ends at the copy's moment plus the `restore.pitr` row.

Verify: the `restore.pitr` event names the copy and the `before-restore` copy kept; no `op: "restore"` line in the log.
Rollback: restore the `before-restore` copy from the same list. It is itself a copy, restorable for 30 days.

**(b) From `.brainl.age`, Cloud, into the same record.** `braindog import` always replaces, and the record refuses a
file that is not its own copy (`import` with `replace` in `packages/kernel/src/index.ts`). Into any other record the
rule is `brainl.ts`'s: an import opens a file only into an empty record and refuses one that holds rows
(`IMPORT_NOT_EMPTY`), so a copy of another record goes to a fresh one with `init --from`, never over a live one. This is
the path the drill runs on every copy it opens (`apps/cli/scripts/drill-trip.mjs`, steps 5, 6 and 10): the export put
back over the record it came from exports again to the same bytes, the same file opens as a fresh record with
`init --from`, and a second import into that record, no longer empty, is refused.

Precondition: the chosen night fetched with `wrangler r2 object get braindog-blobs/<rec_id>/snapshots/nightly-<date>.brainl.age
--remote --file <tmp>/night.brainl.age`, and the drill passed on that file (§5.4, the file form); the owner reachable; the reason
logged. The opened `.brainl` comes from `age -d -i <identity> <copy> > <tmp>/night.brainl`
where `age` is installed; the drill itself deletes the plaintext it makes.

1. `braindog import <tmp>/night.brainl --host https://app.brain.dog/<slug> --key https://app.brain.dog/<slug>/.well-known/braindog-key`.
   The CLI verifies the file first and sends nothing if it fails. The record answers `NEEDS_BROWSER_SESSION`; the CLI
   asks for an operation grant and the owner approves *import* from their browser (48 §5.2): ten minutes, this command,
   never written.
2. The record replaces its rows with the file's and rebuilds `entry_fts`. The `export` events the record kept are put
   back beside the file's rows, and the kernel then writes one `import` event, on a replace as on a merge
   (`index.ts`, `import`), so the next export carries that one event past the file it came from. It refuses a file without `vault_key` rows or sealed
   grants when it holds some, because that import would throw every key away.
3. Tokens, device grants, observations and jobs did not travel (`local`). The owner re-mints agent tokens and re-enrols
   runners. The Keychain opens if `vault_key('record')` is wrapped under a key `KEK` still holds (§5.6), or
   passphrase-wrapped and the owner has the passphrase; otherwise §5.7's *lost* script.
4. Delete `<tmp>/night.brainl`.

Verify: `braindog export -o <tmp>/after.brainl` of the restored record verifies, and its manifest is the night's,
table for table.
Rollback: take the restore point first (`braindog export` before step 1) and import it the same way.

**(b′) A deleted record, from its final copy.** Nothing on Cloud can put a record whose object is gone back under its
name: the name is released for good (§5.9), and `import` refuses a copy of another record. What remains is the copy
itself, for `FINAL_KEPT_DAYS` after the deletion. Fetch `<rec_id>/snapshots/final-<date>.brainl.age`, open it as in
(b), and `braindog init <slug> --from <file>` on a self-host (the owner's, or a scratch one the operator hands over as a
file). Log the reason first; this is the one restore that reads a deleted customer's rows, and only on the owner's
request.

**(c) Self-host.** In place, the same as (a): Settings > Backups > a copy > *Restore*. The record is kept as a
`before-restore` copy first, the copy's tables are put back in one transaction, the search index is rebuilt, and one
`restore.pitr` event is written; credentials the live record has ended are not brought back. A copy written by other
migrations is refused `OUT_OF_BOUNDS` and changes nothing. Into a fresh directory, when the record's directory itself
is lost or will not open: `init --from` reads a `.brainl` (an export, or a Cloud copy opened as in (b)), not the
host's own `.brain` copies, which go back in place as above.

Precondition: the process stopped; a `.brainl` that `braindog verify` passes; `/data/kek` intact, since without it no
Keychain opens.

1. `mv /data/<slug> /data/<slug>.broken.<date>`: the pre-restore file is kept beside (03 §7 rule 3).
2. `braindog init <slug> --from <file.brainl>`.
3. Start the process. `docker inspect --format '{{.State.Health.Status}}' braindog` → `healthy`.

Verify: `braindog --version` shows the expected `kernel`; the owner signs in with the same passkey, because the
Directory is `directory.sqlite`, untouched, or is itself put back from `directory-snapshots/`.
Rollback: `mv` the broken directory back.

### 5.6 · KEK rotation

The KEK wraps three DEKs per record (12 §6). A rotation re-wraps them and nothing else; it does not replace a DEK, so
it re-encrypts no grant (§10). There is one secret, `KEK`, and during a rotation it holds two keys: the new one, a
space, and the old one (`keyStoreOf` in `apps/worker/src/keys.ts`). The first is current and wraps everything new;
`byId` still opens every row wrapped under the second. There is no `KEK_PREV`: the second binding this section once
named is read by nothing (§13 #2, amended). Two keys at most, rotations at least 30 days apart.

Precondition: last night's walk clean and `stragglers = 0`; `KEK` holds one key, so the last rotation's old key was
retired (step 6); at least 30 days since the last rotation, or, for an incident, rotate anyway and accept that a copy
from before the previous rotation opens its Keychain only with that key put back; **the current key's value, from where
it was kept when it was set** (the password manager), because a Worker secret cannot be read back from Cloudflare; a
note in the ops record: `rotation quarterly` or `rotation incident <id>`.

1. Make the new key on a trusted machine, into a file outside the repository and never onto the screen:
   `node -e "require('node:fs').writeFileSync(process.argv[1], require('node:crypto').randomBytes(32).toString('hex'), { mode: 0o600 })" <file>`.
   Its `kek_id` is the first 18 hex of SHA-256 over the 32 raw bytes:
   `node -e "const c=require('node:crypto');console.log(c.createHash('sha256').update(Buffer.from(require('node:fs').readFileSync(process.argv[1],'utf8').trim(),'hex')).digest('hex').slice(0,18))" <file>`.
   Note it, and keep the new key where the current one is kept.
2. `wrangler secret put KEK --env production`, and at the prompt paste the new key, one space, and the current key. The
   put deploys a new version with the secret, and every new wrap from then on is under the new key. Every grant still
   opens: the hosts offer the kernel the id a record's rows were wrapped under whenever the store holds it.
3. The next walk re-wraps every record (§5.1 step 3a): `rewrapRecord` unwraps each `vault_key` row under the old id in
   the Worker, wraps it under the new, and calls `rewrapKeys`, one record transaction guarded by `kek_id = :from` (a
   compare-and-set) that writes one `grant.rotate` event, actor `system`, naming the two ids (§13 #4). Each record's
   line says `kek: "rewrapped"`. For an incident, force the walk with §5.1's lever.
4. **The straggler check** is the walk: `kek: "straggler"` is a record with a row under a key the store no longer holds,
   and `kek: "failed"` one whose re-wrap threw; both count in `walk.done.stragglers`. Two nights in a row above zero is
   the alert. The usual cause is a record in the 503 state (§5.3): fix that and the next walk catches it.
5. Wait. Not a day less than 30 days after the first night with `stragglers = 0`: a copy restored from inside that
   window carries `vault_key` rows under the old id, and `byId` must still answer for it.
6. **Retire the old key**: `wrangler secret put KEK --env production` with the new key alone. Note in the ops record:
   `rotation <new kek_id> · retired <old kek_id> · <date>`, and remove the old key from the password manager. Share
   links minted under the retired key answer 404 from then on (51 D5); owners re-share.

**Self-host.** Stop the process; `mv /data/kek /data/kek.prev`; write the new key as exactly 32 raw bytes to `/data/kek`,
mode 0600; start. The start re-wraps every record under the new key before anything is served (`rewrapAtStart`), and
says so. Unless `BRAINDOG_SESSION_SECRET` is set, the session key is derived from the key file, so a new key file signs
everybody out, and the boot line says that too. Retire by deleting `/data/kek.prev` after step 5's wait.

Verify: on the ops record open one grant (Settings > Keychain): plaintext, no `WRONG_KEY`; `walk.done.stragglers = 0`;
every record's line reads `kek: "ok"` on the night after the re-wrap.
Rollback: put the pair back in the other order, the old key first and the new one second, and the next walk re-wraps
toward the old key. Nothing is lost while both keys are present.

### 5.7 · Passphrase enable and disable

The owner's act, in the browser. Support has two scripts.

**Enable** (12 §6): the DEK is unwrapped with the KEK once, re-wrapped under PBKDF2-SHA-256 — 600,000 iterations,
16-byte salt — and the KEK-wrapped copy is overwritten and zeroised **in the same transaction**. `vault_key('record')`
becomes `wrapped_by = 'passphrase'`, `kek_id NULL`. `connector` stays `kek` (ADR-052), and the bind screen says so in
words. Support says, in these words: *turning the passphrase on removes our access going forward, and removes it from
the backups thirty days later* (12 §7). Never a shorter sentence — the honesty table is only worth having if it is
believed.
Verify: Settings > Keychain says the passphrase is on; the walk's `kek` reads `ok` for the record, because a passphrase
row is never a straggler.

**Disable**: the same operation in reverse, and it requires the passphrase (12 §6).

**Lost passphrase** — the script: *The Keychain is gone. The record is not.* There is exactly one wrapping of the DEK and
we do not hold its key. A backup inside 30 days does not help unless the enable was inside it, and we do not restore a
record to before an enable to get around the owner's choice. The owner's steps: Settings → Keychain → *reset Keychain*:
`revokeGrant` on every row — ciphertext zeroed, rows kept with `revoked_at` (02 §9) — a new `record` DEK generated and
KEK-wrapped, then each credential re-bound from its issuer. `opens` is their list of issuers to visit. Rollback: none;
say so before they click.

### 5.8 · Erasure request

A data-subject request lands on the controller — the owner. Cloud is the processor: a request that reaches us is
forwarded to the owner within 3 working days with this procedure. We never run `erase` on a customer's record.

Precondition: the owner has the subject value(s) — a name, an email — and a legal basis. `erase` is ADMIN: browser
session only.

1. Owner: Settings > People > *Erase a person* → subject, basis → `erase`.
2. The record runs 02 §10's cascade in **one transaction** over nineteen stores (`packages/kernel/src/erase.ts`): an
   entry's fields, an event's `from_v`/`to_v`/`note`, an arrival's body and headers, a receipt, a decision's words, a
   suggestion's body, a prediction's claim, a grant's label and hint, a device's label and user agent, a job's
   arguments and output, an invitation's address, a saved view's name, search and filter, a rule run's variables, words
   and step answers, a token's label, an uninstalled pack's kept settings, and the `person` mirror's `email` and `name`
   become `--erased--`; `observation` rows with that `subject`, the entries' `entry_fts` and `entry_vec` lines and the
   person's `member` rows are deleted (`access.revoke` stays); pending `schedule` and `outbox` work naming the subject is
   cancelled (§13 #11). It inserts one `erase.r2` outbox row per attachment key of the subject and one `erase` event:
   `target` the erasure id, `to_v` the SHA-256 of the subject value, `note` the basis and the row count.
3. The Worker drains `erase.r2`: it deletes `<rec_id>/a/<sha256>`, then the object must be gone, else the ack is
   `failed` and the one retry ladder runs (30 §8; `apps/worker/src/deliver.ts`).
4. The walk checks every `erase.r2` row of the last 30 days against the bucket each night (§5.1 step 3c): pending
   longer than a day, dead, or done with its object still there counts in `erase_open`, and a key still there goes back
   on the outbox. `erase_open > 0` is the "Erasure open" alert, a compliance alert and not only the owner's item: the
   operator deletes the key by hand, `wrangler r2 object delete braindog-blobs/<rec_id>/a/<sha256> --remote`, and the
   next walk confirms.
5. The owner answers the subject. **Kept, and why** — the fact, not the payload (ADR-033): row positions and sequence,
   `ts`, `actor`, `kind`, `target`, field names, `inbox_raw.ts`/`channel`/`sha256`, decision ids and answers, the
   `erase` event. **Lagging**: backups and PITR hold the payload for 30 more days, beyond use (02 §10). The answer
   reads: *erased from the live record on <date>; from backups by <date + 30 days>.*

Verify: `SELECT count(*) FROM entry_fts WHERE entry_fts MATCH :subject` = 0; `near` over the subject's text returns
nothing; the `erase` event exists; `erase_open = 0` on the next walk.
Rollback: none. Erasure is the one operation PITR must not be used to undo; the confirm screen says so.

### 5.9 · Customer deletion

`deleteRecord` in the record checks the caller; `destroyRecord` in `apps/worker/src/destroy.ts` is the host's half,
in an order decided when restore was built. This spec fixes when it runs and what is kept.

Precondition: the owner asked (Settings > Delete this record, `deleteRecord`, ADMIN, a sign-in within 15 minutes, the
slug typed to confirm, §13 #17), or the lapse ladder reached day 90 (§5.10); for the ladder, the owner has been sent
three notices that export is available and the row is still `lapsed` when asked again.

1. **The final copy**, while there is still a record to copy: `<rec_id>/snapshots/final-<date>.brainl.age`, sealed
   like every night's. It is kept `FINAL_KEPT_DAYS` (30) and exists so a deletion somebody regrets can be answered from
   it by §5.5 (b′), and for nothing longer.
2. **Every other copy and every file** under the record's prefix, paged, the final copy excepted. A sweep that fails
   throws here, before anything irreversible: the record is whole, the owner is told it did not delete, and asking
   again runs the same steps.
3. **The alarm**, by name, then **every byte** the object holds (`deleteAll()`). At this Worker's compatibility date
   `deleteAll()` clears the alarm too; the explicit call keeps that true if the date is ever moved back.
4. **The Directory's names for it**, last, and its refusal is thrown: a name that opens an empty record would be worse
   than one that still opens the whole one. The slug is released for good and never given out again.
5. Thirty nights later the walk empties the prefix, the final copy with it (§5.1 step 4).
6. For a deletion the operator ran or was asked about, a note in the ops record: `delete <rec_id> · <reason>`. The fact
   that a record existed under that slug is otherwise the Directory's closed row, which keeps no content.

Verify: the slug resolves to nothing; the prefix holds only `final-<date>.brainl.age` until step 5 and nothing after;
the ladder's `walk` line reads `billing: "deleted"` for a ladder deletion.
Rollback: none after step 3. Before it, the thrown sweep leaves the record whole. After it, only (b′) and only until
the final copy expires; by day +30 nothing of the record remains anywhere.

On a self-host `deleteRecord` is steps 3 and 4 for one file: the scheduler stops, the record file with its `-wal`,
`-shm` and `snapshots/` goes (the whole `<slug>/` directory when it is the record's own), the Directory releases the
slug, and every later request answers 503 `RECORD_UNAVAILABLE`. There is no final copy, because it would sit in the
directory being removed; the owner's export before pressing is the copy.

### 5.10 · Billing lapse

ADR-059 in days, states and words, as built in `apps/worker/src/billing.ts`, `lapse.ts`, `ladder.ts` and `mail.ts`.
Only a verified Stripe event writes a `lapsed` row, so a record with no `dir_billing` row, which is every record nobody
pays for through Stripe, is never capped and never deleted by anything here. The days are counted from `lapsed_at` by
the walk's one clock; the deletion day is `LAPSE_DELETES_DAYS` (90), the same constant Settings reads, so the date in
a letter, on the banner and in Settings > Billing is one date.

**The states and their order are [ADR-059](16-DECISIONS.md)'s amendment of October 15th 2026**, which this section follows: a row is
`active`, `past_due`, `lapsed` or `comp`, and a record with no row is not billed. The Directory decides the state from
a verified Stripe event; `lapse.ts` refuses writes with its one sentence and keeps export; the nightly walk mails and
deletes. A paid plan cancelled goes **back to Free** instead of lapsing when the record fits Free (one person on it,
and no other record of its owner's on Free): writable, off the ladder, its row keeping the Stripe customer and losing
the subscription. A `comp` row is a plan given by the operator's door `POST /account/ops/plan`, with no Stripe
customer: it never lapses and is never charged, and taking it back goes through the same back to Free rule.

| Day | State | The record | The letter, to the payer and every owner (`lapse.*` in `mail.ts`) | In the app |
|---|---|---|---|---|
| 0 | `lapsed` | read-only; connectors, inference and digests paused; export and reads work | "<name> is read-only until billing resumes": the last payment did not go through, everything is still there, export any time, and it is deleted on the day-90 date if billing has not resumed | the banner: "Read-only until billing resumes. Export is available.", and Settings > Billing: "Read-only since <day>, and deleted on <day 90> unless it is paid. Export is always available." |
| 60 | `lapsed` | unchanged | "<name> will be deleted": read-only since billing stopped, deleted on <day 90> unless billing resumes, export first | unchanged |
| 83 | `lapsed` | unchanged | "Last notice: <name> will be deleted", the same words | unchanged |
| 90 | deleted | §5.9 | "<name> has been deleted": deleted today because billing did not resume, and one final copy is kept until <day 120> | the name no longer opens |
| any | `active` | everything resumes on the next request | "<name> can be written again": nothing in it was lost | the banner goes |

**Mechanism** (§13 #6), all in the Worker and nothing in the record, so the record package stays billing-agnostic.
Stripe's webhook, checked against `STRIPE_WEBHOOK_SECRET`, writes the Directory's `dir_billing` row: `state`,
`lapsed_at` on entering `lapsed`, cleared on `active`, and `told` emptied. While `lapsed`, the doors in `session.ts`
cap the caller: a person at `read` (and `append` at nothing, since `append` is the one level that does not read), a
token at `scope ∩ {read}`. Every write, on `/api`, `/mcp` and the app alike, is refused `403 FORBIDDEN` with
`LAPSED_FIX`, "Read-only until billing resumes. Export is available."; the owner's export and every read pass. The
object's alarm runs the drain and nothing else, and the drain acks `pull.fetch`, `infer.*` and any `notify.*` that is
part of a digest as `done`, unsent (`lapseDrops`); reminders still deliver, because a lapsed card is the commonest
reason a renewal is missed and the record's job is to say so.

**The ladder** (`ladder.ts`), once a night after the copies: each `lapsed` row is sent the earliest notice it is still
owed, one a night, so a walk that missed a week sends day 0 tonight and day 60 tomorrow, which can only push the
deletion later. A notice is written to `told` only once a letter went; a failed one is tried the next night. **A
deletion happens only for a row that is still `lapsed` when asked again right before, whose `told` is `0,60,83`, and
whose `lapsed_at` is 90 days old**: a record with no row, or a notice that never went, is never deleted. The deletion
is §5.9, then the `lapse.90` letter.

**The one departure from this section as first written**: runs do not start while lapsed, and no per-run held
event is written. This section said a lapsed record's scheduled runs are held and each writes a `pull` event carrying
the lapse sentence; as built, the alarm starts nothing (no connector, call, poll, script, automation or Slash ask) and
the lapse sentence on the banner and in each refused write is the record's one message. A run a month would otherwise
write one event a schedule a night into a record that nobody can write to, and every one of them would say the same
sentence the banner already says.

Verify: under a fake clock the four notices fire once each at days 0, 60, 83 and 90 (`apps/worker/test/ladder.test.ts`);
a record paid again on day 70 is never deleted; a record with no billing row is never touched; a write returns 403
`FORBIDDEN` with `LAPSED_FIX`; the owner's export succeeds; the alarm starts nothing; unlapsing resumes on the next
alarm.
Rollback: the webhook's `active`, or by hand in Stripe (pay the invoice). Nothing was written to the record, so
nothing is undone.

**Held is not lapsed.** A scheduled action on an `active` record that has used its month's allowance is `held`: the
run is counted, the `pull` event says the day it runs again, and the record stays writable. A lapsed record starts no
runs at all, so it holds none.

**Setting billing up.** The plans and the credit packs are made in Stripe from the one table (`PLAN_TABLE` and `PACKS`
in `packages/record/src/plans.ts`) by one command, with the key on standard input and never as an argument:

1. `pbpaste | node tools/ops/stripe-setup.mjs` with a test key (`sk_test_` or `rk_test_`). It asks Stripe for each
   price by its `lookup_key` (`braindog-hosted-month`, `braindog-plus-month`, `braindog-credits-100`,
   `braindog-credits-500`), creates only the products and prices that are missing, and never edits or archives one
   that exists. A price whose figure differs from the table is named and left for a person to settle in Stripe. Run
   again, it makes nothing. The extra-usage meters are listed and skipped until their migration is built.
2. Each price line names the setting its id goes into (`STRIPE_PRICE_HOSTED`, `STRIPE_PRICE_PLUS`,
   `STRIPE_PRICE_PACK_100`, `STRIPE_PRICE_PACK_500`); those ids go into `apps/worker/wrangler.jsonc` for that
   environment, and the checkout refuses a plan whose Stripe price does not agree with the table.
3. A live key is refused with nothing sent unless `--live-ok` is given, which is the owner's word in the one live
   sitting. The only line that names the key says its mode and its last four characters.

### 5.11 · Incident response

Four incidents. The first step of each is a `log` note with the time you noticed; the last is the customer message.

**(a) A leaked agent token.**

1. Revoke: the owner, Settings > Agents, the token's row, *Revoke*. `revoked_at` is set; the next call is
   `UNAUTHORIZED`. The CLI has no `token revoke`, so this is a browser act, which is what ADR-060 wants of it.
2. What it touched: an agent's write is an event whose actor is its session, `S<n>` (30 §3), or `agent:<name>`, and the
   `session` register records the token that opened each session (§13 #12). The owner reads those rows in `/audit`,
   by the agent's name and the sessions it opened. `grant.read` cannot be among them: no token reaches KEYCHAIN (ADR-060).
3. The owner decides what to revert (`/audit`, supersession). Nothing is reverted for them.

**(b) A leaked device grant.** As (a), with the runner's or the CLI's sessions. Revoke from Settings > Agents, where
the grant sits in the same list (26 §2.3); status `revoked`; the runner's next `claimJob` is `UNAUTHORIZED`.

**(c) A suspected Worker compromise.** A compromised Worker can read the KEK and every DEK it unwraps (12 §6.1).
Containment, then rotation, then honesty.

1. A known-good build: `wrangler rollback <version-id> --env production --message "<incident>"` if the suspect code is
   a deploy and no migration came with it (§5.2); otherwise a reviewed fix through `deploy.yml`, approved by the
   reviewer.
2. `wrangler secret put SESSION_SECRET --env production`: 32 or more new random characters at the prompt. Every
   browser session, magic link and pending device code is invalid at once, because each is an HMAC under it (§13 #12).
   Everyone signs in again with their passkey.
3. `wrangler secret put TOKENS_VALID_FROM --env production`: the instant the compromise began, or now if unknown, as an
   ISO instant with its zone, such as `2026-09-25T12:00:00Z`. Every agent token, device grant and operation grant
   created before it is refused `UNAUTHORIZED`; the owner's token list shows them "ended by the operator". An
   unreadable value refuses every bearer and writes one `cut-off` line, so read `wrangler tail` once after the put.
   Owners re-mint. Self-host: `BRAINDOG_SESSION_SECRET` and `BRAINDOG_TOKENS_VALID_FROM` in `/srv/braindog.env`, then
   restart.
4. Rotate the KEK (§5.6, the incident exception) and force the walk (§5.1's lever). The old KEK alone opens nothing:
   the wrapped DEKs live in the objects, and in copies sealed to a recipient whose identity was never in the Worker (§8).
5. Say precisely what was exposed. Rows of every Cloud record — readable by the Worker at any time (12 §7). Credentials
   in vaults with the passphrase **off**, if the attacker unwrapped DEKs — treat as exposed: *rotate every credential in
   your Keychain at its issuer; the Keychain's `opens` column is your list.* Connector credentials in every record, passphrase
   on or off (ADR-052). Prompts: not stored (12 §7). Vaults with the passphrase on: not exposed through the Worker.
6. The post-mortem is a `log` note within 7 days.

**(d) A leaked export.** Precision is the whole job here. A `.brain` or `.brainl` is a plaintext SQLite database: every row
in `data`, `origin` and `governance` is readable by whoever holds the file. Not readable: `grant.ciphertext` —
AES-256-GCM under a key derived from a DEK the file does not carry — and `vault_key.wrapped`, which opens nothing
without the KEK, and the KEK is never in any file (12 §8). A leaked `.brainl.age` is ciphertext to anyone without the
age identity. The message: *the rows are exposed; the credentials are not; the connector credentials are not.* Nothing
is rotated at an issuer for an export alone. `braindog export` carries the sealed grants unless `--redact-grants` was
given, and they are still sealed under a key the file does not carry; the answer is the same.

Verify, all four: the revoked principal's next call is `UNAUTHORIZED`; `wrangler tail --env production --status error`
is quiet; the ops record holds the timeline.
Rollback: (c) step 2 is irreversible by design. A wrong `TOKENS_VALID_FROM` is corrected by setting an earlier instant,
or by deleting the secret: nothing was written to any record, so every token it ended comes back.

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

Enrolment is the Keychain's device grant (26 §2.3); there is no second flow.

**Enrol**: on the machine, `braindog runner enrol <host>` prints six digits; the owner approves in Settings > Agents (browser
only — a bearer gets `NEEDS_BROWSER_SESSION`); the poll exchanges `approved` for a 90-day grant, shown once;
`braindog runner run` under the hardened systemd unit (26 §5). The runner refuses Claude Code below v2.1.248 at
enrolment and at every job.
**Deregister**: automatic at 14 silent days — `last_used` older than 14 d → `expired`, and the customer is told
(26 §2.4). Re-enrol the same way.
**Revoke**: Settings → agents → revoke → `revoked`. The next `claimJob` is `UNAUTHORIZED`; a running job posts
`interrupted` and its transcript stays — `cancel` is a flag, never a delete (26 §5).

Verify: the `device_grant` row's status; `last_used` moves on the first claim. Rollback: enrol again.

### 5.14 · Self-host upgrade

Precondition: a copy from today in `<slug>/snapshots/`: Settings > Backups > *Back up now*, or wait for
`BRAINDOG_BACKUP_AT`; `/data/kek` (and `/data/kek.prev` during a rotation) backed up offline, apart from the copies; the
release note read for a `-- format-bump`.

1. `docker pull ghcr.io/<owner>/braindog-selfhost:<new>`
2. `docker stop braindog && docker rm braindog`, then the `docker run` of §2.4 with the new tag.
3. Migrations apply on boot, per record file, under the same forward-only rules (33 §9); the boot probe measures FTS5
   first (30 §13).
4. `docker inspect --format '{{.State.Health.Status}}' braindog` → `healthy`; `curl -fsS localhost:8080/healthz` shows
   the new `kernel`.

Verify: sign in; `braindog --version`; one write.
Rollback: **downgrade is not supported.** The old image answers a migrated file with `SCHEMA_NEWER` (503). Restore
instead: stop; `mv /data/<slug> /data/<slug>.broken.<date>`; make `/data/<slug>/` again with the pre-upgrade copy from
the broken directory's `snapshots/` as its `record.brain` (a copy is the whole live file at the old migration count,
its `local` tables included); start the *old* image against it. The file the new image wrote stays beside (03 §7).

If the container exits at boot with the text of 30 §13 — *This SQLite build cannot host a .brain file* — the host's
SQLite lacks FTS5 (`NO_SUCH_MODULE`): Node 24.13+ or the official image, and nothing else. There is no degraded mode.

### 5.15 · Support diagnosis

The order is fixed so two people reach the same answer (§13 #7).

1. **The tuple.** `curl -s https://brain.dog/healthz` for the host's (`app`, `format`, `kernel`, `primitives`), and
   `braindog --version` from the customer for their CLI's. Compare `app` to `wrangler deployments list --env production`
   and `kernel` to the tree. A stale self-host image or CLI explains most reports. Settings does not show the tuple yet
   (the About area is not built), so a person without the CLI is asked for the time and the screen instead.
2. **The reference.** A crash showed the person a sentence ending "the reason is in this host's log under <ref>". The
   line with that `ref` (`op: "crash"`) names the door and the error; if it began with a deploy, §5.2's rollback.
3. **Is the record refusing?** In Workers Logs, or
   `wrangler tail --env production --format json --search '"rec":"<rec_id>"'`: an `op: "refuse"` line is §5.3; the
   record's `boot` line says which build opened it. Self-host: the container log's boot output and `/healthz`'s code.
4. **The record's other lines**, by `rec`, newest first: `outbox` lines with `state: "dead"` or a `code` (a job that
   failed, and the provider's `http` for a connector, §5.12); last night's `walk` line (its copy, its re-wrap, its
   ladder step); `mail` lines by `kind`, never the address, for "I never got the email"; `auth` lines by `flow` for "I
   cannot sign in"; `billing` lines for a payment. Every one carries a code and an id and never a value (§2.3), so
   reading them needs no named reason.
5. **Inside the record**, only after a note in the ops record, `support <rec_id> · <ticket>: <what will be read>`
   (12 §7), and only by asking the owner first: `event` rows for the target the customer names, read by the owner in
   `/audit` or by us with them; the `suggestion` rows opened by `system`, the dead letters and failed copies the owner
   has not acted on. `observation` is kept for this and has no reader yet (§10).
6. Answer with the refusal's `fix` sentence when there is one. Every code has one (30 §6).

Verify: the ticket names the tuple and the step that found the cause. Rollback: none.

### 5.16 · Account recovery, closing and suspension

**A lost mailbox**: sign in by passkey or the operator's claim link, then Settings > Identity > Change email.
The claim link is `POST /auth/claim/mint` with `PROVISION_KEY` as the bearer: a 24-hour link to the record, handed to
its owner by a channel the operator has already verified is theirs. Log the reason first.

**A lost passkey**: a second device, or the mailed link (`/auth/magic/start`), then Settings > Recovery. Sign-in asks
for user verification, so a security key with no PIN is refused: set a PIN on the key, or use the mailed link.

**Closing an account** is the person's own act: Settings > Identity > *Close your account*, the address typed to
confirm, a sign-in within 15 minutes (`POST /account/close`). It is refused while they are the only owner of an open
record ("Delete <slug>, or make somebody else its owner, first."). Otherwise their passkeys, sessions, links, pending
rows, lockout keys and memberships go and the Directory forgets the person, after one `sessions.ended` letter. Each
record keeps its own history of what they did there, which its owner can erase (§5.8). The Directory's nightly copies
still hold the account for up to 30 days, and then it is gone from them too; Settings says so.

**Suspending an abusive account**: `POST /auth/suspend` with `PROVISION_KEY` as the bearer and `{ "email": "<address>" }`
stops the person signing in and ends every session they hold; `{ "email": "<address>", "suspended": false }` lets them
in again. It writes `dir_person.suspended_at`, and the same instant on the person's row in each record they are on, so
their agent keys and machines stop with their sessions; the answer's `unreached` counts the records it could not reach,
and sending the same call again carries it to them. A note in the ops record first:
`suspend <person> · <reason>`.

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
| `IMPORT_NOT_EMPTY` | 422 | an import that does not replace, into a record with rows | the kernel's merge refusal; `braindog import` always replaces its own record's copy, so an operator meets this only from another caller | *Import into a new record or a fresh directory.* |
| `WRONG_KEY` | 409 | a `kek_id` neither key in `KEK` answers to | a retired KEK, or a restore from before two rotations, never *corrupt* (12 §6.1) | *Put the old key back as `KEK`'s second key if you still hold it; else reset the Keychain.* |
| `NEEDS_BROWSER_SESSION` | 403 | a bearer at KEYCHAIN, ADMIN or the JOBS session half | a token where the owner's browser is required; the CLI turns it into an operation grant request (48 §5.2) | *Do this from the owner's browser.* |
| `FORBIDDEN` | 403 | a write on a `lapsed` record | billing | *Read-only until billing resumes. Export is available.* |
| `UNAUTHORIZED` | 401 | revoked, expired, or created before `TOKENS_VALID_FROM` | the body says only this (12 §8); the reason is in `wrangler tail` | — |
| `DEVICE_CODE_EXPIRED` · `DEVICE_CODE_TRIES` | 422 | an enrolment past ten minutes · the fifth wrong code | re-run `enroll` | *Run enroll again and approve within ten minutes.* |

Twelve, counted. A `500` is bare and a `401` says one word; the operator reads reasons in the log, never in a response.

## 7 · Performance budget

| Objective | Cloud | Self-host | Measured how |
|---|---|---|---|
| RPO — recovery point | PITR: any point in 30 days (01 §2) · `.brainl.age`: ≤ 24 h + the walk's duration | ≤ 24 h | `walk.done.ms`; the snapshot's `at` |
| RTO: a kept copy, §5.5 (a) | ≤ 15 min by the runbook; the platform restore completes on restart | the same, in one transaction | timed, in the ops record |
| RTO: from `.brainl.age`, §5.5 (b), ≤ 100,000 rows | ≤ 1 h end to end | ≤ 30 min | the monthly drill's `restore <time>`, §5.4 step 3 |
| Backup size per record | `.brainl` ≈ 300–600 B per row — the 03 §4 record, 3,118 rows, ≈ 1–2 MB; age adds ≈ 200 B plus 16 B per 64 KiB; the consumer throws above 40 MiB (51 §5.12) | as a `.brain`, page-padded, ≈ 1.5× | `customMetadata.bytes`; `walk.backup.bytes` |
| The walk | ≤ 10 min end to end; ≤ 2 s per record at 10,000 rows | — | `walk.done.ms` |
| Re-wrap per record | 3 rows, one transaction, ≤ 50 ms | same, at start | the `walk` lines on a rotation night |
| Erase cascade | one transaction ≤ 2 s at 100,000 events; `erase.r2` inside one 300 s lease | same | the `erase` event's `ts` against the ack |
| Lapse ladder | days 0 · 60 · 83 · 90; the final copy expires at day 120, and nothing remains after it | — | the test clock, §9 |
| Deploy to a verified boot line | ≤ 10 min; the 15-min error watch follows | — | `deploy.yml` duration |

Nine, counted. `ponytail:` RTO is a drill number, not an SLO — the drill log is the measurement until a customer count
justifies automating it.

## 8 · Security

**Who may run what.**

| Actor | May | Through |
|---|---|---|
| The owner | ADMIN, KEYCHAIN, the JOBS session half; restore; erase; delete; the passphrase; closing their account | a browser session, never a token (ADR-060) |
| The owner's CLI | DATA and READ+ on its token; `export`, `import`, the pack installs and `token create` under an operation grant: ten minutes, one command, approved in the browser (48 §5.2, D1) | `braindog login`, then the grant per command |
| `system`, the walk | copy, re-wrap, the erasure check, the ladder with its deletion at day 90, expiring closed records' copies | the Worker's cron; every write it makes in a record is an `event` with `actor = 'system'` |
| The operator | `wrangler` (secrets, R2, tail, a rollback by hand); the restore drill and the rehearsal on copies; `PROVISION_KEY`'s three doors; the ops record | the Cloudflare account under 2FA; the age identity; a deploy only through `deploy.yml` and the reviewer |
| Nobody | an admin token; a read of a customer's rows without a named reason; a request for a passphrase | none |

**What a backup contains, and does not.** Twenty-five tables: `data`, `origin`, `governance`, plus `counter` and
`vault_key` (03 §3; 33 §9). Not `token`, `device_grant`, `auth_fail`, `observation`, `job`, `job_event`.
`grant.ciphertext` is sealed; `vault_key.wrapped` is wrapped. **The KEK is never in a backup, never in a `.brain`, never
in a log**: it lives in the Worker secret `KEK` (Cloud), the operator's password manager, and `/data/kek` (self-host),
and nowhere else (12 §6), and the Worker imports it as a non-extractable `CryptoKey` and zero-fills the bytes (51 §8).
The age identity that opens `.brainl.age` lives outside Cloudflare, in two copies in the operator's password manager,
and the Worker holds only the recipient, `AGE_RECIPIENT`; a Worker compromise yields sealed copies (§13 #13). The drill
reads the identity file where it is kept and refuses a path inside the repository. A self-hoster backs up `/data/kek`
(and `/data/kek.prev` during a rotation) *separately* from the copies: a copy without it opens no Keychain.

**Audit of operator actions.** Two ledgers. The customer's: every `system` write is an `event` in their record —
`migrate`, `purge`, `grant.rotate`, `export` with its counts or `note: 'failed: …'` — and every read we make is preceded
by a named reason (12 §7). Ours: the ops record, one `note` per procedure (§4), which is itself a BrainDog record with
`/audit` (§13 #15). `secret-grep` (33 §8) keeps every path this spec names free of a plaintext credential.

**Refusals do not leak** (12 §8): `/healthz` returns a tuple, never a slug; a `401` body is one word; a `500` carries
only a reference; the reason is in the log line with the same reference.

## 9 · Tests and gates

| Gate or drill | Kind | Cadence | Asserts |
|---|---|---|---|
| `deploy-parity` | script, `deploy.yml` | every deploy | `/` and `/_app/version.json` SHA-256 = `build/` (33 §8) |
| `boot-probe` | vitest | CI | a build without FTS5 refuses with the exact text (30 §13) |
| `compat-date` | script | CI | `compatibility_date ≥ 2026-02-24` |
| `brain-roundtrip` | vitest | CI | export → import → export: identical canonical dump |
| `secret-grep` | script | CI | no KEK, token or passphrase in a log line, push payload or prompt |
| `refusal-fixtures` | script | CI | every code in §6 has a fixture |
| `ops-walk` | `apps/worker/test/ops-walk.test.ts` | CI | keys made under KEK A; the store rebuilt on B with A second: every grant opens before the re-wrap; after it every row is under B and the store opens them without A |
| `ladder`, `nightly` | `apps/worker/test/ladder.test.ts`, `nightly.test.ts` | CI | a fake clock at days 0 · 60 · 83 · 90: four notices, once each; a record paid again on day 70 is never deleted; a record with no billing row is never touched; the walk's lines and closing tally; final copies expire after `FINAL_KEPT_DAYS` |
| `ops-erase` | `apps/worker/test/ops-erase.test.ts` | CI | erase on a fixture: the next sealed copy holds nothing of the person, the search index included |
| `ops-revoke` | `packages/kernel/src/api/ops-revoke.test.ts` | CI | a token minted before `TOKENS_VALID_FROM` is refused; one after passes |
| `rollback`, `deploy-workflow`, `smoke` | `apps/worker/scripts/*.test.mjs` | CI | a shipped migration, a DO class migration and a Directory version each hold; a red Smoke rolls back both, a red Parity the app alone; the record step precedes Deploy |
| `restore-drill`, `migration-rehearsal` | `apps/cli/test/` | CI | the drill opens, verifies, restores and compares a sealed copy made in the test; the rehearsal passes a night at an older migration count and names a migration that throws |
| Restore drill | manual, §5.4 | **monthly**, on the live record, and one random record once there are customers | PASS; the note in the ops record, whose date the morning check reads |
| KEK rotation | manual, §5.6 | quarterly, for real | `stragglers = 0` within two nights; a grant opens on the ops record |
| Erasure drill | manual, §5.8 | quarterly, on the ops record | a planted person; search returns nothing; `erase_open = 0` |
| Self-host upgrade drill | manual, §5.14 | every release | upgrade, then restore-to-old from the copy |

Sixteen, counted. Every drill ends in a note in the ops record carrying its numbers. A drill without a note did not
happen, and the morning check reads the restore drill's date from its note (§5.1 step 5).

## 10 · Deliberate ceilings

- `ponytail:` no operator console — the owner's browser, an owner-approved operation grant, `system` from the cron, and
  `wrangler`. Add an Access-guarded `/ops/*` route when "ask the owner to click" becomes the support bottleneck.
- `ponytail:` no staging environment — the ops record in production is the canary and the drill target. Add
  `env.staging` in `wrangler.jsonc` when a second person deploys.
- `ponytail:` one cron invocation for the whole fleet; page across `scheduled()` runs once `walk.done.ms` nears the
  platform's limit for one invocation.
- `ponytail:` the emergency trigger is a cron added in the dashboard for one fire. Replace it with the `/ops/*` route
  the second time it is used in a quarter.
- `ponytail:` a KEK rotation re-wraps DEKs and re-encrypts no grant; a DEK rotation — new DEK, every grant re-encrypted,
  both versions kept — is not built. Add it when a post-mortem needs it; §5.11(c)'s customer message is the substitute.
- `ponytail:` two keys in one `KEK` secret and rotations ≥ 30 days apart (`ROOT_KEYS` in `keys.ts`); a third when an
  incident forces two rotations in a month and the restores from between them must keep their vaults.
- `ponytail:` no gradual rollout — full deploy, record canary. Revisit only with an RPC that lets old code read a newer
  schema.
- `ponytail:` one R2 bucket; the key layout separates attachments from snapshots. A second bucket when lifecycle rules
  or a separate access policy are needed.
- `ponytail:` one age identity, no rotation schedule; rotate when it leaves the password manager. The cost is re-sealing
  30 nights × N records.
- `ponytail:` lapse is enforced in the Worker; a lapsed record's alarm still wakes to drain its outbox and starts
  nothing else. Pause the rows in the record if the lapsed population's alarm wakes show in the bill.
- `ponytail:` the operator audit is notes in the ops record; a dedicated store when a second operator exists.
- `ponytail:` `observation` is written and nothing an operator runs reads it: there is no `opsReport`. Support reads
  the op lines instead (§5.15), which hold no values either. Add a reader when a ticket needs the week's refusals by
  field.
- `ponytail:` the restore drill's date is a note a person writes and the morning check reads; the Worker cannot learn
  it, because it holds no age identity. Automate it with the scheduled drill below.
- `ponytail:` backups are verified by a monthly manual drill, not nightly by machine — the Worker holds no age identity,
  so a nightly check needs a second runtime. Add a scheduled self-host that decrypts and imports `latest` past ~200
  records.

Fourteen, counted.

## 11 · Dependencies

Runtime: none — this is a document. The procedures use:

| Tool | Version | For |
|---|---|---|
| `wrangler` | as `apps/worker/package.json` pins it (4.129.0 today) | a rollback by hand, tail, secrets, R2 |
| Node | as the root `engines` pins it | the drill, the rehearsal and the CLI, run from this repository |
| `braindog-cli` | this repository at the deployed sha | export, import, verify, token, runner, init |
| Docker | current | the self-host image |
| `age` | ≥ 1.2, optional | `age -d` on a `.brainl.age` for §5.5 (b); the drill opens copies with Node alone. The Worker seals with its own age v1 writer (`apps/worker/src/seal.ts`) |

Dev: none beyond 52's. A new tool here is a review finding, not an install.

## 12 · Build order

Built so far: the erase cascade and migrations (41); `rewrapKeys` (§13 #4) and the operation grant (45,
48); the CLI's `export`, `import`, `verify`, `token create` and `init --from` (48); `/healthz`, the `HEALTHCHECK`, the
nightly copy with its signature, SMTP and the `.prev` key file (49); the walk, the copies, restore, deletion, the lapse
cap and ladder, `SESSION_SECRET`, `TOKENS_VALID_FROM`, the two-key `KEK` and the Directory's `dir_billing` (51); the
deploy, its rollback and smoke, and the gates (52). Not built: `opsReport` (§10), a *restore to a time* (§5.5), and the
Settings > About area that would show the tuple (§5.15).

Unblocks: the first production deploy — §5.2 is its checklist; the "Cloud: Stripe, signup, backups" row of the Phase A
plan (15 §1b); and the launch answer to *"can you read my data, and what happens if you disappear"* — §8 and §5.5 are
that answer.

## 13 · Decisions taken here

| # | Decision | Amend |
|---|---|---|
| 1 | Drill cadence: restore monthly (one random record + the ops record; **amended:** the live record until there are customers, with its date read at the morning check, §5.1 step 5); KEK rotation quarterly, for real; erasure drill quarterly on the ops record; self-host upgrade drill every release; parity on every deploy | 12 §8 Backups row; 33 §8 (four drill rows) |
| 2 | The KEK ladder 51 hands to 53: two slots, `KEK` and `KEK_PREV`; rotations ≥ 30 days apart; the straggler check is the nightly walk — `vault_key.kek_id ≠ current`, `walk.done.stragglers`, alert after two nights; retirement = `KEK_PREV` overwritten with the current key 30 days after the first clean night, never sooner, because PITR and snapshots inside the window carry the old id; share links under a retired key answer 404. **Amended:** one secret, `KEK`, holding the new key, a space, and the old one during a rotation, and never a second binding, so none of `keyStoreOf`'s callers changed; retirement is putting `KEK` back with the new key alone; the self-host's previous key is `<kek file>.prev` | 12 §6 (a *Rotation* paragraph); 33 §1 `KeyStore`; 33 §7 (`KEK_PREV`) |
| 3 | ADMIN from the CLI is 48's operation grant — ten minutes, one command, owner-approved in the browser, never written — and it reaches exactly `export import planPack installPack uninstallPack` and the three `token` methods; never `erase restore invite setDeclaration`. This is ADR-060's "the CLI's install path is a device grant" made precise, and it is what lets §5.5(b) exist. **Amended:** the CLI builds `token create` alone of the three; listing and revoking are Settings > Agents | ADR-060; 33 §4 (an operation-grant row); 33 §5 `login` |
| 4 | Two INTERNAL methods added to 51 D11's list: `opsReport({ observation? })` and `rewrapKeys({ from, to, rows })`. The re-wrap's event is `grant.rotate`, `target_kind = 'vault_key'`, `from_v`/`to_v` the two `kek_id`s, actor `system` — no 41st kind. `snapshot` and `export` may be called by `system` from the walk. **Amended:** `rewrapKeys` is built (`packages/kernel/src/api/keys.ts`, an INTERNAL method in `packages/record/src/methods/keys.ts`); `opsReport` is not, and the walk asks each record for its dump, its re-wrap and its open erasures directly (§5.1) | 30 §5 (INTERNAL row; ADMIN row); 30 §2; 33 §2 |
| 5 | Billing lives in the Directory: `record_dir.billing ∈ active lapsed`, `lapsed_at`. The ladder is day 0 · 60 · 83 · 90; the five messages of §5.10 verbatim. **Amended:** the table is `dir_billing`, one row per record somebody pays for, `state ∈ active past_due lapsed` with `lapsed_at` and `told`; the letters are `mail.ts`'s, whose words §5.10 now quotes | ADR-059; 33 §10 `record_dir` |
| 6 | Lapse is enforced in the Worker: every principal capped at `read`, `export` admitted for the owner's session, `FORBIDDEN` with the fix sentence; the drain acks `pull.fetch`, `infer.*` and `because: digest.*` notifications `done` unsent; reminders deliver; the record package stays billing-agnostic. **Amended:** while lapsed the alarm runs the drain and starts no run at all, so no per-run held event is written; the lapse sentence is the record's one message (§5.10) | ADR-059 (a *Mechanism* paragraph) |
| 7 | Support diagnosis order: tuple → refusal state → `observation` → `event` → `system` suggestions. `observation` first because it holds no values. **Amended:** with no `opsReport` to read `observation`, the order is tuple → the crash's reference → refusal state → the record's op lines → `event` and `system` suggestions with the owner (§5.15); the op lines come before anything inside a record for the same reason `observation` did, they hold no values | 30 §13 (after the boot probe); 12 §7 (the named-reason rule points at §5.15) |
| 8 | The nightly walk is 51's `scheduled()` at `17 3 * * *` extended by `ops.ts` with re-wrap, reconcile and the ladder; the ops record leads the first `listRecords` page; snapshot keys and metadata are 51 §5.12's; the `.brainl.age` sits under the record prefix so deletion is one prefix. **Amended:** there is no `ops.ts`; the walk is `nightly.ts`, the Directory is copied before any record, the ops record is not moved to the front, and a re-wrap that fails is a straggler and never stops the walk, so one record never costs another its copy | 33 §1 `Snapshots`; 33 §7 (`triggers.crons`); 03 §6 *Back up*; 12 §8 |
| 9 | `GET /healthz`, unauthenticated: 200 `{ app, format, kernel, primitives }` once the boot probe passed, 503 `{ code }` under a module-level refusal, never a slug. It is the self-host `HEALTHCHECK`. `/api/version` stays the authenticated record-version cursor (33 §4; 51 D22) | 33 §4 (a `/healthz` row) |
| 10 | `vault_key` travels, sealed — 03 §3, 12 §6/§8 and 33 §9 are the reading: six `local` tables, twenty-five travel. A self-host snapshot keeps the six `local` tables (a backup of the instance); an export strips them | 02 §1 ("Seven … `vault_key`" → six, without it); 30 §1 `vault_key` comment (`local: never exported` → travels; `HKDF` → PBKDF2); 32 §2.3; 33 §6 Snapshots |
| 11 | The `person` mirror joins the erase cascade — `email`, `name` → `--erased--`, row kept — sixteen stores in one transaction, R2 the seventeenth. The `erase` event stores the subject as SHA-256, never the value. **Amended:** nineteen stores, R2 the twentieth: an invitation's address, a saved view, a rule run's words and step answers, a token's label and an uninstalled pack's kept settings joined the cascade | 02 §10 (cascade table; the event row); ADR-033 |
| 12 | Fleet levers: `session.id_hash`, `magic_link.hash` and `device_grant.code_hash` are HMAC-SHA-256 under the Worker secret `SESSION_SECRET`; `token.hash` and `device_grant.token_hash` are plain SHA-256, and `TOKENS_VALID_FROM` refuses anything created before it. The `session` register carries `token_id`, so a token's writes are one query | 12 §3, §6.1; 33 §7, §10; 02 §1 `session`; 32 §2.1 |
| 13 | The age identity for `.brainl.age` lives outside Cloudflare — two copies in the operator's password manager; the Worker holds only `AGE_RECIPIENT` | 12 §6 (hierarchy), §8 Backups; 33 §7 |
| 14 | No staging environment: the ops record (slug `ops`) in production is canary, drill target and the operator's audit ledger — the "staging record" 51 §14 already restores | 33 §7; 31 §8 |
| 15 | A deploy carrying a kernel migration is never rolled back and never percentage-rolled; the canary is the ops record; recovery is fix-forward | 33 §9 Migrations; 12 §8 Migrations |
| 16 | `schedule.state` has five values — `pending firing done failed paused`; 25 §9 and 30 §1 already use `paused` | 09 §1 (DDL comment and *four states*) |
| 17 | Customer deletion is 51 §5.13's `deleteCustomer`, run by the ladder at day 90 or by the owner through one cookie route, `POST /api/deleteRecord` (ADMIN, the slug typed to confirm); order: a `final` snapshot inside the prefix → `destroy()` on `Record` (alarm, then storage) → `Slash` when it has storage → the R2 prefix → `record.forget`; the fact of the deletion is the ops record's note. **Amended:** the host's half is `destroyRecord` (`destroy.ts`), and the order is the final copy, every other copy and file, the alarm, the storage, the Directory's names; the final copy is kept `FINAL_KEPT_DAYS` (30) outside the sweep and the walk expires it, so a deletion is answerable for thirty days and not only for the day (§5.9) | 02 §9; 09 §1 *Deleting a record*; 33 §4 (the route); 33 §10 |

Seventeen, counted. Each amendment lands in the same revision round (35 §5).

## 14 · Done when

- [ ] §5.2 has run once for real: the `boot` line, the parity result and both version ids are in the ops record.
- [ ] `walk.done` has logged 7 consecutive clean nights with `records` = what `listRecords` returned.
- [ ] One restore drill (§5.4) passed on a production night of the live record, its note in the ops record, and the
      morning check reading its date.
- [ ] One KEK rotation (§5.6) completed: `stragglers = 0`, a grant opened, the old key retired with its date noted.
- [ ] One erasure drill (§5.8) on the ops record: search empty, `erase_open = 0`.
- [ ] `ops-walk`, `ladder`, `nightly`, `ops-erase`, `ops-revoke`, `rollback` and `deploy-workflow` green in CI.
- [ ] `SESSION_SECRET`, `KEK` and `AGE_RECIPIENT` set in production, `OPS_RECORD` naming the ops record, and the
      current `KEK`'s value and `kek_id` kept in the password manager.
- [ ] The age identity is in the password manager twice and nowhere else, and has opened one `.brainl.age`.
- [ ] `/healthz` answers unauthenticated on Cloud and on a self-host container whose `HEALTHCHECK` reads `healthy`.
- [ ] The lapse letters, the lapse banner and the two passphrase sentences say what §5.10 and §5.7 say, and the
      deletion sentence in Settings agrees with `FINAL_KEPT_DAYS`.
- [ ] Every §13 amendment is applied in its document.

Eleven, counted.

---

*Previous: [52-SPEC-TESTING](52-SPEC-TESTING-AND-CI.md). Back to the index: [00-README](00-README.md).*
