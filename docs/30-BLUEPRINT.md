# 30 · The implementation blueprint

Everything above this document describes *what* BrainDog is. This one describes what you type.

It exists because an audit of the other twenty-nine asked a simple question — *what would block an
implementer on day one?* — and produced ten answers. Each section here closes one of them. Where a
decision was already made upstream it is cited, not re-argued; where the corpus had prose and no
contract, this is the contract.

> **Nothing here is code. It is the set of decisions that stop being negotiable once code exists.**

---

## 1 · The kernel schema

Twenty-seven tables, and four header tables the format adds to every live record, each named in [02-DATA-MODEL](02-DATA-MODEL.md) §1 with a comment. Two were new to the parity pass: `member`, which [20-COLLABORATION](20-COLLABORATION.md) §1 called *materialised* and no DDL ever had, and `device_grant`, which the parity trace added. **Seven are new to the 2026-09-02 review**, each because some document wrote to a store that had no DDL under it: `person`, `token`, `auth_fail` and `counter` (who, with what, and the number a human says), `vault_key` (the wrapped DEKs and the signing key), `job` and `job_event` (tier C). Four had
real bodies. **`entry` — the table everything runs on — had no column list**, which is where day one
stops.

> *An earlier draft said twenty. Six lenses read the corpus against that DDL and found columns in 12, 20, 25 and 26
> with no table beneath them — a token's `last_used_at`, a wrapped DEK, a job's `claimed_at`, the counter that keeps
> `#7` from being reissued after a purge. The count is now the enumeration below, and a test counts the enumeration.
> The DIRECTORY — email → person, passkeys, browser sessions, magic links, slug → record, the login lockout — is
> deliberately **not** here: it lives in the third Durable Object class, `Directory` (ADR-061), and on the self-host in
> `directory.sqlite` beside the records. The record keeps only what a `.brain` must resolve offline.*

```sql
-- ─── IDENTITY AND SHAPE ────────────────────────────────────────────────────
CREATE TABLE record (
  singleton   INTEGER PRIMARY KEY CHECK (singleton = 1),   -- exactly one row, and the CHECK says so
  id          TEXT NOT NULL UNIQUE,          -- rec_ + 26-char ULID — the record id every other document
                                             --   already uses: R2 keys, the Keychain AAD, dog_meta. Never 'self'
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  locale      TEXT NOT NULL DEFAULT 'en',
  tz          TEXT NOT NULL DEFAULT 'UTC',   -- IANA. drives digests, never plain days
  format_ver  INTEGER NOT NULL,              -- mirrors PRAGMA user_version — the .dog format revision, §11
  created_at  TEXT NOT NULL
);

CREATE TABLE pack (
  id           TEXT PRIMARY KEY,             -- ^[a-z][a-z0-9-]{1,63}$ — globally unique in the Kennel
  version      TEXT NOT NULL,                -- the RESOLVED semver, pinned at install
  source       TEXT NOT NULL,                -- kennel | url | git | paste | local
  source_ref   TEXT,
  manifest     TEXT NOT NULL,                -- json
  installed_at TEXT NOT NULL,
  checksum     TEXT NOT NULL                 -- SHA-256 of JCS(manifest + declarations) — 34-GRAMMARS §5
);

CREATE TABLE declaration (
  id       TEXT NOT NULL,                    -- 'register.obligations' — kind.id, the spoken form
  version  INTEGER NOT NULL DEFAULT 1,       -- a new version is a NEW ROW; rows are never edited, never deleted
  kind     TEXT NOT NULL,                    -- one of the eight
  pack_id  TEXT,                             -- NULL = authored in-app; 'kernel' only for register.session (02 §1)
  body     TEXT NOT NULL,                    -- json, canonical form (RFC 8785)
  checksum TEXT NOT NULL,
  retired  INTEGER NOT NULL DEFAULT 0,       -- uninstall sets 1 and emits `uninstall`
  superseded_at TEXT,                        -- set on the PRIOR row, in the same transaction as the new version
  created_at TEXT NOT NULL,
  PRIMARY KEY (id, version),
  CHECK (kind IN ('register','page','block','ingest','rule','metric','theme','digest'))
);
-- active = superseded_at IS NULL AND retired = 0, and the index carries the predicate:
CREATE INDEX declaration_kind ON declaration(kind) WHERE superseded_at IS NULL AND retired = 0;

CREATE TABLE migration (
  version    INTEGER PRIMARY KEY,            -- MAX(version) is the kernel migration number — §11
  applied_at TEXT NOT NULL,
  checksum   TEXT NOT NULL                   -- SHA-256 of the SQL after CRLF→LF and trailing-whitespace strip
);

-- ─── IDENTITY: PEOPLE, TOKENS, COUNTERS ────────────────────────────────────
-- The DIRECTORY lives OUTSIDE the record (ADR-061): email → person, credential_id → passkey, person → records,
-- slug → rec_id, browser sessions, magic links, the login lockout. It is the third Durable Object class,
-- `Directory`, one instance; on the self-host it is `directory.sqlite` in the same process, same schema, same
-- Sql port. The record keeps what a .brain must resolve offline and what is scoped to one record.
CREATE TABLE person (                       -- a MIRROR of the Directory row: actors and member.person_id resolve here
  id TEXT PRIMARY KEY,                      -- 'p_' + 26-char ULID, minted by the Directory
  email TEXT, name TEXT, suspended_at TEXT
);

CREATE TABLE token (                        -- agent tokens. Every token is scoped to ONE record — 10 §2
  id TEXT PRIMARY KEY, person_id TEXT NOT NULL, hash TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('read','propose','write')),   -- no `admin` scope, ever — ADR-060.
                                            --   ONE word; the host expands the ladder read ⊂ propose ⊂ write (45)
  label TEXT, created_at TEXT NOT NULL,
  last_used_at TEXT, last_surface TEXT,     -- listed with a revoke button — 12 §3
  expires_at TEXT, revoked_at TEXT
);                                          -- the runner's job bearer is a `token` row too, minted by `claimJob` with an
                                            --   audience of ONE job and revoked at the job's `end` — §5; 46 §4.7

CREATE TABLE auth_fail (                    -- per-record lockouts: device codes, share tokens. Never exported (local)
  key TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0, until TEXT
);

CREATE TABLE counter (                      -- 'seq:<register>' | 'decision' | 'suggestion'
  name TEXT PRIMARY KEY, next INTEGER NOT NULL DEFAULT 1
);
-- Allocation is UPDATE counter SET next = next + 1 WHERE name = ? RETURNING next - 1, inside the write
-- transaction — race-free because the object is single-writer. A purged row's number is never reissued.
-- `counter` TRAVELS in every export: seq allocation must survive the file.

-- ─── THE ROWS ──────────────────────────────────────────────────────────────
CREATE TABLE entry (
  id         TEXT PRIMARY KEY,               -- 26-char ULID. never spoken
  register   TEXT NOT NULL,                  -- ^[a-z][a-z0-9_]{0,31}$ — 34-GRAMMARS §4
  seq        INTEGER,                        -- per register, from 1, allocated from `counter`. NULL when series: true
  fields     TEXT NOT NULL DEFAULT '{}',     -- json. every declared field lives here
  state      TEXT,                           -- MIRRORED from fields.state — 02 §1. NULL if undeclared
  version    INTEGER NOT NULL DEFAULT 1,     -- bumped at step 6; a write on a stale version is VERSION_STALE, 409 — §4
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE (register, seq)
);
CREATE INDEX entry_live   ON entry(register, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX entry_state  ON entry(register, state)           WHERE deleted_at IS NULL;
-- Rule-generated rows carry `_rule`, `_parent`, `_each` in `fields` — 07 §6.1's idempotency key, so a re-run
-- is a no-op. Field ids beginning `_` are reserved to the kernel.
CREATE UNIQUE INDEX entry_created_by ON entry(
  json_extract(fields,'$._rule'), json_extract(fields,'$._parent'), json_extract(fields,'$._each'))
  WHERE json_extract(fields,'$._rule') IS NOT NULL;
-- plus three index families added by declaration (the names are 34-GRAMMARS §4; `__` separates reg from field):
--   index: true   → CREATE INDEX entry_i_<reg>__<field> ON entry(json_extract(fields,'$.<field>'))
--                     WHERE register = '<reg>' AND deleted_at IS NULL;
--                   a money field gets TWO — '$.<field>.amount' and '$.<field>.currency' — and quantity
--                   likewise ('.value', '.unit'), because the value is an object — §7. The pair takes a third
--                   name segment: entry_i_<reg>__<field>__amount / __currency, __value / __unit (42; 34 §4)
--   unique: true  → CREATE UNIQUE INDEX entry_u_<reg>__<field> ON entry(json_extract(fields,'$.<field>'))
--                     WHERE register = '<reg>' AND deleted_at IS NULL;
--                   on a derived field the value is MATERIALISED at step 6 — the only stored derivation
--   key: [a, b]   → CREATE UNIQUE INDEX entry_k_<reg> ON entry(json_extract(fields,'$.a'), json_extract(fields,'$.b'))
--                     WHERE register = '<reg>';   a series upsert resolves the row by its key FIRST (step 1) and
--                     writes as INSERT … ON CONFLICT DO UPDATE; the index is the backstop, never the lookup (41)

CREATE VIRTUAL TABLE entry_fts USING fts5(
  id UNINDEXED, register UNINDEXED, text,
  tokenize = 'unicode61 remove_diacritics 2'   -- Arabic and English in one record
);
-- CONTENTFUL, and rowid = entry.rowid: INSERT INTO entry_fts(rowid, id, register, text). Step 7 is
-- DELETE FROM entry_fts WHERE rowid = ? then INSERT — never a scan on the UNINDEXED id. `search:` may name only
-- text · document · enum · url · email · list<text> fields (SEARCH_FIELD_TYPE); the projected text is the
-- `search:` values in order, a list joined by a space, fields joined by LF, whitespace collapsed. `matches:`
-- reads it; `contains:` never does (§7). Import rebuilds it from `entry`.

CREATE TABLE entry_vec (
  id       TEXT PRIMARY KEY,                 -- = entry.id. NO FK: foreign keys are OFF on every adapter (§13),
                                             --   so a cascade would never fire. Purge and erase delete this row
                                             --   explicitly — 02 §10. An earlier draft wrote ON DELETE CASCADE
  register TEXT NOT NULL,
  dims     INTEGER NOT NULL,
  vec      BLOB NOT NULL,                    -- int8, dims bytes
  model    TEXT NOT NULL,
  built_at TEXT NOT NULL
);

CREATE TABLE metric_point (
  series TEXT NOT NULL, grain TEXT NOT NULL, at TEXT NOT NULL,
  value INTEGER NOT NULL, unit TEXT NOT NULL, n INTEGER,
  source TEXT NOT NULL, wrote_at TEXT NOT NULL,
  PRIMARY KEY (series, grain, at)
) WITHOUT ROWID;                             -- the series' KIND (gauge | flow | cumulative | unique | fact) lives on
CREATE INDEX metric_point_at ON metric_point(at);   -- the declaring ingest, never here — 25 §8

-- ─── ORIGIN ────────────────────────────────────────────────────────────────
CREATE TABLE event (
  id      TEXT PRIMARY KEY,
  ts      TEXT NOT NULL,
  actor   TEXT NOT NULL,                     -- §3
  kind    TEXT NOT NULL,                     -- §2 — closed
  target      TEXT,                          -- 'entry:01J…'
  target_kind TEXT,                          -- 'entry' | 'decision' | 'pack' | …  (20 §8 requires it)
  field   TEXT,                              -- NULL on a `create` row: to_v is then the whole `fields`, as JCS
  from_v  TEXT,                              -- '--redacted--' when the redaction list withheld it at write (20 §8);
  to_v    TEXT,                              --   '--erased--' after an erasure (02 §10); NULL ONLY when there was
                                             --   no prior value. One rule, three values — never NULL for two of them
  note    TEXT,                              -- mandatory, ≤ 280 chars, on a `note` row; '--erased--' after an erasure
  batch   TEXT,                              -- the ULID of the TRIGGERING write, shared by everything it caused —
                                             --   rule sets, generated rows — so "undo this expansion" is one query
  op_id   TEXT,                              -- client-generated; a replayed op_id returns the original result
  CHECK (kind IN (                           -- the 40 in §2. A new kind is a migration.
    'create','edit','state','link','tag','untag','delete','restore','purge','note',
    'decide','supersede','suggest','resolve','predict','score',
    'install','uninstall','upgrade','declare','retire',
    'grant.add','grant.read','grant.rotate','grant.revoke','grant.bind',
    'arrive','match','extract','propose','pull',
    'access.grant','access.revoke','share.open','share.close',
    'export','import','erase','migrate','restore.pitr'))   -- 40, and a test counts them
);
CREATE INDEX event_ts     ON event(ts DESC);
CREATE INDEX event_target ON event(target, ts DESC);
CREATE UNIQUE INDEX event_op ON event(op_id) WHERE op_id IS NOT NULL;
-- op_id sits on the FIRST event row of a write only — the unique index admits one — and a replayed op_id returns
-- the current row with the original rowid as its version (41).
-- NO foreign key to entry. Deleting a row must not delete its history — 02 §1.
-- record_version = MAX(event.rowid) — append-only and per-mutation, so no changelog table is needed;
-- the live channel's changelog is SELECT DISTINCT target FROM event WHERE rowid > ?  (22 §5, 33-CONTRACTS §2).

CREATE TABLE inbox_raw (
  id      TEXT PRIMARY KEY,
  ts      TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email','webhook','pull','paste','api')),
                                             -- `pull`, never `cron`: the kernel's word for the scheduled channel is
                                             --   the same word as the schedule kind, the outbox kind and the event kind
  headers TEXT, body TEXT,                   -- headers lower-cased on arrival; `from`/`to`/`subject` are read from them — §7
  sha256  TEXT NOT NULL,
  state   TEXT NOT NULL DEFAULT 'untriaged'
          CHECK (state IN ('untriaged','matched','skipped','review','proposed','ignored','erased')),
  reason  TEXT,                              -- why `skipped`, why `review` — the one place a wrong skip shows, 07 §2
  UNIQUE (channel, sha256)                   -- redelivery writes one row
);

CREATE TABLE ingest_receipt (
  id TEXT PRIMARY KEY, raw_id TEXT NOT NULL, ingest_id TEXT NOT NULL,
  wrote TEXT NOT NULL,                       -- json array of entry ids
  confidence TEXT NOT NULL CHECK (confidence IN ('exact','proposed','needs-review')),
                                             -- derived per row from the run's outcomes; a declaration's
                                             --   `writes.confidence` is a CEILING, never the value — 43
  ts TEXT NOT NULL
);

CREATE TABLE observation (
  kind TEXT NOT NULL CHECK (kind IN (        -- the nine signals — 24 §4
    'ingest.unmatched','decision.superseded','suggestion.incorrect','write.refused','search.empty',
    'register.read','page.render','tool.retry','query.scan')),
  subject TEXT NOT NULL, day TEXT NOT NULL,  -- subject = register id | page slug | '<register>.<field>:<code>'
  n INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (kind, subject, day)
) WITHOUT ROWID;                             -- pre-aggregated daily, PRUNED at 400 days by the `purge` row, never rolled up.
                                             -- observe(batch) = INSERT … ON CONFLICT DO UPDATE SET n = n + 1

-- ─── GOVERNANCE ────────────────────────────────────────────────────────────
CREATE TABLE decision (
  id TEXT PRIMARY KEY,                       -- 'D41' — the integer from counter('decision')
  question TEXT NOT NULL, answer TEXT NOT NULL,
  reason TEXT NOT NULL,                      -- never empty at write; an erasure writes the literal '--erased--' — 02 §10
  decided_by TEXT NOT NULL, ts TEXT NOT NULL,
  supersedes TEXT REFERENCES decision(id)    -- documentary; not enforced, foreign keys are OFF (§13)
);

CREATE TABLE suggestion (
  id TEXT PRIMARY KEY,                       -- 'SG23' — the integer from counter('suggestion')
  body_kind TEXT NOT NULL,                   -- options | pattern | rowset | change at first — seven now, 33-CONTRACTS §2
  body TEXT NOT NULL, status TEXT NOT NULL,
  opened_by TEXT NOT NULL, opened_at TEXT NOT NULL,   -- 'system' opens the dead-letter suggestion — §8
  resolved_as TEXT,                          -- addressed | wont-fix | incorrect  → the brake, 24 §4.3
  defer_until TEXT, defer_why TEXT,          -- the third verb between decide and dismiss — 32 §2.1
  CHECK (body_kind IN ('options','pattern','rowset','change'))
);

CREATE TABLE prediction (
  id TEXT PRIMARY KEY, for_decl TEXT NOT NULL,
  claim TEXT NOT NULL,
  measure TEXT NOT NULL,                     -- json: { source, where, value } — a metric body without target/window, 24 §4.6
  baseline INTEGER NOT NULL, unit TEXT NOT NULL,   -- FROZEN at acceptance, never recomputed. The (value, unit) rule of
                                                   --   metric_point — never REAL; a money measure is minor units
  target TEXT NOT NULL, window TEXT NOT NULL,
  score_at TEXT NOT NULL, scored_at TEXT, observed INTEGER, met INTEGER,
  on_miss TEXT NOT NULL DEFAULT 'suggest' CHECK (on_miss IN ('suggest','none'))
                                             -- there is no `reopen`: a miss opens a suggestion to SUPERSEDE the decision
);

CREATE TABLE member (                       -- 20-COLLABORATION §1 said the ceiling is "materialised"
  person_id TEXT NOT NULL,                  --   and this DDL never had it. → person.id
  register  TEXT NOT NULL,                  -- '*' for the record
  level     TEXT NOT NULL CHECK (level IN ('read','append','write','decide','owner')),
  seen_at   TEXT,                           -- the READ MARK. Written with MAX() only, so a late device
                                            --   never moves it back; not an entry row, so a read is
                                            --   never a write to the record — 32-PARITY §2.1. markRead writes it (§5)
  PRIMARY KEY (person_id, register)
);

CREATE TABLE grant (
  id TEXT PRIMARY KEY, label TEXT NOT NULL, opens TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('api_token','password','ssh_key','recovery_codes','note')),
  version INTEGER NOT NULL DEFAULT 1,        -- in the AAD: record_id ‖ grant_id ‖ version — 12 §6
  ciphertext BLOB, nonce BLOB,
  prev_ciphertext BLOB, prev_nonce BLOB,     -- the one prior version. EXACTLY two versions, and the schema says so — 12 §6.1
  kdf TEXT NOT NULL, wrapped_by TEXT NOT NULL,  -- kek | passphrase
  scopes TEXT,                               -- the PROVEN set, from the bind-time probe — 25 §7
  kek_id TEXT NOT NULL,                      -- fingerprint of the wrapping key: a rotation reads as
                                            --   409 WRONG_KEY, never as corruption — 12 §6
  bytes INTEGER, hint TEXT,                  -- "a 3.2 KB env file" vs "a 64-char token", unopened
  opened INTEGER NOT NULL DEFAULT 0,         -- every decrypt counted AND visible. One per request.
  last_opened TEXT,                          -- WHO opened it is the grant.read event, never a column
  created_at TEXT NOT NULL, expires_at TEXT,
  rotate_every TEXT,                         -- puts a `rotate` row in schedule — 12 §6 rule 4
  stale_at TEXT,                             -- set on 401/403 by a connector run; the paused connector is its
                                            --   schedule row with state = 'paused' — 25 §9
  rotated_at TEXT, revoked_at TEXT
);                                          -- rows TRAVEL sealed by default; --redact-grants drops the ciphertext — 03 §5
                                            -- and `sealed_under` joins it in kernel migration 10 — 12 §6

CREATE TABLE vault_key (                    -- the wrapped record DEKs and the signing key — 12 §6, §7; 03 §4
  purpose    TEXT PRIMARY KEY CHECK (purpose IN ('record','connector','signing')),
  wrapped    BLOB NOT NULL, nonce BLOB NOT NULL,
  wrapped_by TEXT NOT NULL CHECK (wrapped_by IN ('kek','passphrase')),
                                            -- EXACTLY one wrapping per key: enabling the passphrase re-wraps and
                                            --   destroys the KEK copy in one transaction. 'connector' is always
                                            --   kek (Q13, ADR-052); 'signing' is the record's Ed25519 private key
  kek_id     TEXT, salt BLOB,               -- salt only under a passphrase: PBKDF2-SHA-256 — 12 §6. HKDF is not a
                                            --   passphrase KDF, and an earlier draft here named it
  rewrapped_at TEXT
);                                          -- TRAVELS, sealed — not one of the six `local` tables (below; 12 §8).
                                            --   An earlier draft's trailing comment said "never exported"

CREATE TABLE device_grant (                 -- RFC 8628: the device shows six digits; the owner
  id TEXT PRIMARY KEY,                      --   approves from a session already authenticated. `id` is the poll id
  code_hash TEXT NOT NULL,                  -- sha256(id ‖ ':' ‖ user_code) — never the code, and no host secret in the
                                            --   formula (12 §6.1). A leaked table cannot approve itself
  status TEXT NOT NULL CHECK (status IN ('pending','approved','active','expired','denied','revoked')),
  reach TEXT NOT NULL DEFAULT 'login'       -- what the approval reaches: a device's login, the runner's grant, or ONE
        CHECK (reach IN ('login','runner','export','import','pack','token')),
                                            --   named ADMIN operation — the OPERATION GRANT of §5 and §10 (ADR-060)
  label TEXT, ua TEXT,                      -- client-supplied — label · subject — shown to the approver, trusted for nothing
  token_hash TEXT, tries INTEGER NOT NULL DEFAULT 0,   -- the 90-day bearer, hashed. No keypair anywhere
  expires TEXT NOT NULL,                    -- the code's life (10 min) while pending; REWRITTEN to +90 d when the
                                            --   device's poll exchanges an approved row for its token (approved → active).
                                            --   An operation reach expires in 10 min, approved or not, and is single-use
  approved_by TEXT, approved_at TEXT, last_used TEXT   -- auto-deregistered after 14 silent days
);                                          -- a DENIED row is kept: "I said no to a request I did not make"

-- ─── JOBS (tier C) ─────────────────────────────────────────────────────────
CREATE TABLE job (                          -- a remote Claude run — 26 §4. The closed `kind` is the runner's
  id TEXT PRIMARY KEY,                      --   key security control: its own templates check it
  kind TEXT NOT NULL CHECK (kind IN ('triage','explain','propose','draft')),
  args TEXT NOT NULL,                       -- json
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued','claimed','ok','needs_decision','refused','limit','error','interrupted','cancelled')),
                                            -- *lost* is DERIVED from a stale claimed_at, never stored
  runner_id TEXT, claimed_at TEXT, lease_until TEXT,
  seq INTEGER NOT NULL DEFAULT 0,           -- event high-water mark: the last job_event.seq the runner posted
  cancel INTEGER NOT NULL DEFAULT 0,        -- the runner polls it: readCancel (§5)
  session TEXT,                             -- the S<n> the run resolves to — §3
  created_at TEXT NOT NULL, expires TEXT NOT NULL,   -- queued beyond 24 h → cancelled, with a notice
  claude_session TEXT, result TEXT, error TEXT,
  cost_minor INTEGER, turns INTEGER, ms INTEGER
);

CREATE TABLE job_event (                    -- one distilled line per stream-json event — 26 §5
  job_id TEXT NOT NULL, seq INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('start','say','think','tool','out','limit','note','end','error')),
  body TEXT, ts TEXT NOT NULL,
  PRIMARY KEY (job_id, seq)
);

-- ─── THE QUEUES ────────────────────────────────────────────────────────────
CREATE TABLE schedule (
  id TEXT PRIMARY KEY, due_at TEXT NOT NULL, kind TEXT NOT NULL,
  key TEXT NOT NULL, payload TEXT NOT NULL,  -- a retry row: key = 'outbox:' || outbox.id, payload = { outbox: id } — §8
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','firing','done','failed','paused')),   -- five
  attempts INTEGER NOT NULL DEFAULT 0,       -- a paused connector is its `pull` row with state = 'paused'; a fire moves
                                             --   a `pull` row to 'firing' and inserts ONE outbox row (47). There is no
                                             --   'cancelled': an erased schedule or outbox row is 'done', payload '--erased--'
  UNIQUE (kind, key),
  CHECK (kind IN ('digest','reminder','rule','retry','purge','rotate','pull','analyse','score','snapshot'))
);                                           -- ten. `snapshot` is a metric's snapshot: (08 §2.6); the 12-hour session
CREATE INDEX schedule_due ON schedule(state, due_at);   -- sweep is a `purge` row, hourly, run by `system` — `list` never writes
-- Purge (kind `purge`) is one transaction per RUN over at most 100 rows: DELETE FROM entry_vec WHERE id = ?; DELETE
-- FROM entry_fts WHERE rowid = ?; DELETE FROM entry WHERE id = ? AND deleted_at < cutoff — and the observation prune.
-- `event` rows are kept; `seq` is never reused; one `purge` event by `system` per run (41). Nothing here promises
-- what the adapter disables — there is no cascade to rely on.

CREATE TABLE outbox (
  id TEXT PRIMARY KEY, created TEXT NOT NULL, kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','leased','done','failed','dead')),
  leased_until TEXT, attempts INTEGER NOT NULL DEFAULT 0,   -- mirrors the retry row; `dead` when that row fails at 8 — §8
  CHECK (kind IN ('notify.email','notify.push','notify.webhook','pull.fetch','export.r2','erase.r2',
                  'infer.embed','infer.prose','infer.draft'))   -- nine
);
CREATE INDEX outbox_ready ON outbox(state, created);

-- ─── THE .brain HEADER — four tables migration 0001 creates in EVERY live record, DO and file alike (03 §3) ──
CREATE TABLE dog_meta     (key TEXT PRIMARY KEY, value TEXT NOT NULL);   -- format, created_at, producer, record_slug, tz, locale
CREATE TABLE dog_section  (table_name TEXT PRIMARY KEY,
                           section TEXT NOT NULL CHECK (section IN ('data','origin','governance','local','header')));
CREATE TABLE dog_manifest (table_name TEXT PRIMARY KEY, rows INTEGER NOT NULL, sha256 TEXT NOT NULL);
CREATE TABLE dog_sig      (alg TEXT NOT NULL CHECK (alg = 'ed25519'), key_id TEXT NOT NULL, public_key TEXT NOT NULL,
                           sig TEXT NOT NULL, signed_at TEXT NOT NULL);
-- dog_manifest and dog_sig are refreshed by export and EMPTY in a live DO. The signed bytes are the canonical
-- projection of dog_manifest ordered by table_name; keys are raw 32-byte Ed25519 in base64url; key_id is the first
-- 16 hex of SHA-256(public key) — 34-GRAMMARS §5, 33-CONTRACTS §9.
-- section = 'local' NEVER TRAVELS: token · device_grant · auth_fail · observation · job · job_event — six, so a
-- live file's 31 tables export as 25 and `braindog verify` prints "✓ 25 tables". vault_key TRAVELS, sealed: a
-- KEK-wrapped key opens nothing without the KEK, and a restored record must open its own Keychain (12 §8). `dog_section` lists an
-- omitted table as `local`, so a reader tells omitted from missing.
```

The block above is migration 1, verbatim, so a column added later is named here and not in it. `member.row_where TEXT`
joins in kernel migration 19: one `where` (34 §1, as JSON text) narrowing a list grant to the rows it matches. NULL is
every row, it is never set on `'*'`, and one that cannot be read reaches no row. It has no CHECK, because `invite` reads
it against its list first.

Five things worth naming, because they are decisions rather than transcription:

| | |
|---|---|
| **`CHECK` constraints carry every closed list** | the corpus's closed lists are its security argument. A list enforced only by a validator is a list one code path forgets. **Twenty-four of them are `CHECK (… IN (…))`** — twenty-three in the DDL above, which is migration 1, and one added since — the eleven pack kinds (the ninth, `script`, from kernel migration 12, the tenth, `job`, from kernel migration 18, and the eleventh, `look`, from kernel migration 24), the three token scopes, the forty event kinds, `inbox_raw`'s five channels and seven states, the three confidences, the nine observation signals, the seven suggestion bodies (the last three — `pack`, `settings` and `arrange` — from kernel migration 8), the two `on_miss` verbs, the five member levels, the five grant kinds, the two keys a grant may be `sealed_under` (from kernel migration 10, and the one that decides whether a scheduled run may open a credential at all — 12 §6), `vault_key`'s three purposes and two wrappings, the six device-grant statuses and eight reaches (the seventh, `vault`, from kernel migration 4, and the eighth, `shape`, from kernel migration 33: a standing grant that takes a scrambled shape copy of the record and reads nothing else), nine job statuses and nine job-event kinds (kernel migration 18 took out the four job kinds: a job's kind is the id of a `job` declaration), the thirteen schedule kinds (`call` and `poll` from kernel migration 5, `script` from kernel migration 12) and five schedule states, the twelve outbox kinds (`script.run` from kernel migration 12, `infer.ask` from kernel migration 13, `infer.resolve` from kernel migration 23) and five outbox states, and the five `.brain` sections — so the *database* refuses a twelfth pack kind, not merely the validator. Two more `CHECK`s are equalities, not lists: `record.singleton = 1` and `dog_sig.alg = 'ed25519'`. *An earlier draft said four and a fifth over a DDL that already had seven; fourteen more arrived with the seven new tables and this review's constraints; two more with the second revision — `device_grant.reach`, and `schedule.state`, a list the comment beside it had used without enforcing. The `event.kind` list is still the largest, at forty* |
| **`event.batch`** | the ULID of the *triggering* write, shared by everything it caused — rule `set`s and generated rows alike — which is what makes *"undo this expansion"* one query rather than a heuristic. [07-INGEST](07-INGEST-AND-RULES.md) §6.1 promised it and nothing carried it. It is a `batch`, never a shared event *id*: `event.id` is the primary key and cannot be shared |
| **One sentinel rule, three values** | a value withheld at write by the redaction list is the literal `--redacted--` (20 §8); a value removed later by an erasure is the literal `--erased--` (02 §10); `NULL` means only *"there was no prior value"*. Hence **`decision.reason` is `NOT NULL`**, never empty at write, and erasure writes `--erased--`: the invariant *"a decision always has a reason field"* survives erasure, and a reader can still tell **that** it was erased — [02-DATA-MODEL](02-DATA-MODEL.md) §10. *An earlier draft made `''` the sentinel, which is indistinguishable from an empty reason, and made `from_v` NULL for both cases* |
| **`counter`, not `MAX(seq) + 1`** | `MAX(seq) + 1` reissues a spoken id the first time the highest-numbered row is purged, and `D41`/`SG23` had no counter at all. One table, three name families, one `UPDATE … RETURNING` inside the write transaction (§4) |
| **`section = 'local'` never travels** | `token` · `device_grant` · `auth_fail` · `observation` · `job` · `job_event` stay in the live record, and `dog_section` says so — which is how `braindog verify` prints *"✓ 25 tables"* against a 31-table file (`vault_key` travels sealed — a wrapped key is nothing without the KEK, and a restored record must open its own Keychain) and a reader tells omitted from missing. `grant` rows travel sealed by default, `counter` travels because seq allocation must survive an export — [03-DOG-FORMAT](03-DOG-FORMAT.md) §5 |

---

## 2 · The `event.kind` vocabulary, closed

[20-COLLABORATION](20-COLLABORATION.md) §8 requires this *"in one place"* and cites Retool's ~120
types as the bar. It did not exist; kinds were scattered across six documents. **This is the place.**

| Group | Kinds |
|---|---|
| Rows | `create` · `edit` · `state` · `link` · `tag` · `untag` · `delete` · `restore` · `purge` · `note` |
| Governance | `decide` · `supersede` · `suggest` · `resolve` · `predict` · `score` |
| Declarations | `install` · `uninstall` · `upgrade` · `declare` · `retire` |
| Credentials | `grant.add` · `grant.read` · `grant.rotate` · `grant.revoke` · `grant.bind` |
| Ingest | `arrive` · `match` · `extract` · `propose` · `pull` |
| Access | `access.grant` · `access.revoke` · `share.open` · `share.close` |
| Lifecycle | `export` · `import` · `erase` · `migrate` · `restore.pitr` |

**Forty, counted — 10 row · 6 governance · 5 declaration · 5 credential · 5 ingest · 4 access · 5 lifecycle — and the list is closed by a `CHECK`.**

`note` is the `log` tool's kind — the one row a person or an agent writes *on purpose*. Its rule: `note` is
mandatory and ≤ 280 characters, `target` is optional, and the actor is the resolved session (§3). Two strings
other documents once used are **not** kinds: `access.changed` is `access.grant` / `access.revoke` with the levels in
`from_v`/`to_v` and the reason in `note`; `blocker` is an `export` event carrying `note: 'failed: <reason>'` plus a
suggestion to re-run. Two more that looked like new kinds are not: a KEK re-wrap of `vault_key` is a `grant.rotate`
row with `target_kind = 'vault_key'`, `from_v`/`to_v` the two `kek_id`s and actor `system` (53); a write to a `tags`
list is `tag`/`untag`, one row per element added or removed (42). There is no forty-first kind.

> *An earlier draft of this section said thirty-four over a table enumerating thirty-nine. It is the
> exact failure this corpus keeps finding in itself, made once more, and caught the same way: by
> counting the enumeration instead of reading the sentence. The next draft said thirty-nine, correctly, and had
> no kind the eighth MCP tool could write — `note` is the fortieth. **The `CHECK` constraint is now the
> count** — the database and the prose cannot drift, because one is generated from the other.* Two rules that make it stay useful:

1. **A new kind is a kernel migration**, not a string somebody passes. That is the whole point of
   the Retool precedent — a vocabulary that drifts is not queryable in five years.
2. **`grant.read` is an event, always.** Every decryption, with its actor. A Keychain whose reads are
   unaudited cannot answer *"did anything get out."*

---

## 3 · The `actor` grammar

One string, three shapes, parsed by prefix:

| Shape | Example | Means |
|---|---|---|
| a person | `p_01J…` | **the person id** — `person.id`, never the display name; the UI resolves it through the `person` mirror, which exists so an actor resolves offline (41, 45). *An earlier draft showed a name here* |
| **`S<n>`** | `S42` | **a session**, the kernel register's spoken id, read against the installed prefixes ([34-GRAMMARS](34-GRAMMARS.md) §4). This is what an agent write resolves to, *always*: a named session that exists and is not finished, else the one holding the caller's client id, else, for a caller with no client id, a live session on the same host and repo, else one the write opens, whose `create` event is signed by the new `S<n>` itself with `note: 'opened: auto'` (the register has no `source` field). A person in a browser is never a session. `agent:<name>` below is what you see only when no session could be opened, which the write path records as a `write.refused` observation on `session` ([41-SPEC-KERNEL](41-SPEC-KERNEL.md) §5.4) |
| `agent:<name>` | `agent:claude` · `agent:codex` | a token, named at creation — the fallback, never the norm |
| `<mechanism>:<id>` | `rule:renewal-30d` · `ingest:hsbc-sms` · `ingest:npm-downloads` · `runner:rnr_9k2` | something declared. A pull connector is an `ingest` declaration, so its run is `ingest:<id>` — there is no `pull:` prefix; *an earlier draft had one* |
| `system` | `system` | migrations, purges, the scheduler itself, the dead-letter suggestion |
| `slash` | `slash` | the assistant — **only ever on `suggest`, `propose` or `predict`, and on the `declare` of a look that says it is its own; never on a row write** |

That last row is an invariant with a test: **`event WHERE actor='slash' AND kind NOT IN
('suggest','propose','predict') AND NOT (kind = 'declare' AND target LIKE 'declaration:look.%')` must always be
empty.** The one exception is a look: an arrangement of a page that already exists, whose body says `by: slash` and
which no add-on carries. A page, a list, a rule, a script and an add-on are never Slash's to install or retire, and the
write path refuses each before its `declare` line (`slashMayWrite`, [ADR-072](16-DECISIONS.md)). It is the architectural claim in
[11-ASSISTANT](11-ASSISTANT.md) §2, expressed as a query anyone can run against a real record. Two refusals the
grammar implies, named so no spec invents a code for them (41): a row write from a `slash` principal is `FORBIDDEN`
at step 1, and a bare `#7` with no register before it is `REGISTER_UNKNOWN`.

---

## 4 · The write path, in order

The corpus specified each stage and never their sequence. `create` must not trigger rules,
`immutable_when:` must refuse a rule's `set`, and `transitions:` must be checked before the `state`
column is mirrored — **none of which is decidable without a fixed order.**

```
write(register, id?, patch, ctx)          -- ctx: CallContext, built by the Worker on every RPC — 33-CONTRACTS §2
 ├─ 1  RESOLVE     declaration, and the actor by the §3 ladder; refuse an unknown register or field
 │                                                       → REFUSE  REGISTER_UNKNOWN · FIELD_UNKNOWN
 ├─ 2  LOCK        immutable_when: over the CURRENT row  → REFUSE  ROW_LOCKED
 ├─ 2b PINNED      a MECHANISM actor (`rule:` · `ingest:`) may not `set` a field whose last event.actor is a person
 │                 — 07 §6, 32 §3.2; a token is not pinned out (41)   → REFUSE  HUMAN_ONLY
 ├─ 3  COERCE      per-type parse (34-GRAMMARS §3); TEXT_JSON_QUOTED / TEXT_ESCAPED_NEWLINE refused HERE;
 │                 money/quantity to minor units; an integer past 2^53 is INT_OUT_OF_RANGE   → REFUSE
 ├─ 4  VALIDATE    required, required_when:, enum membership, caps, min/max (OUT_OF_BOUNDS), list<T> element,
 │                 immutable: on a changed field, unique: (ALREADY_KNOWN / UNIQUE_VIOLATION),
 │                 a ref into the wrong register (REF_REGISTER_MISMATCH), delete: refuse_while_referenced when
 │                 deleted_at is being set, version CAS (VERSION_STALE → 409)          → REFUSE
 ├─ 5  TRANSITION  if state changes: legal move? `by:` level held? `requires:` satisfied?
 │                                                       → REFUSE  TRANSITION_ILLEGAL · LEVEL_REQUIRED
 │   ─── nothing above this line has written a ROW ───
 ├─ R  OBSERVE     on any REFUSE: INSERT … ON CONFLICT DO UPDATE SET n = n + 1 into
 │                 observation(kind = 'write.refused', subject = '<register>.<field>:<code>')
 │                 — the one write a refusal makes, and it is not a row write (24 §4.2)
 ├─ 6  PERSIST     upsert entry (INSERT … ON CONFLICT DO UPDATE on the register's key:, the row resolved by that key
 │                 at step 1); mirror fields.state → entry.state; bump version and updated_at; allocate seq from
 │                 `counter`; at create under `identity:`, store accent(existingHues) — the INJECTED chooser, the
 │                 kernel computes no hue (ADR-028); materialise a derived field that carries unique: true — THE
 │                 ONLY STORED DERIVATION; touch session.last_seen for the resolved session — a HEARTBEAT, not a
 │                 write: no version bump, no event (41); a session row made here is stamped `started`, once
 ├─ 6b PAIRS       the register's pairs: self-join for this row; mark, never hide
 ├─ 7  PROJECT     entry_fts by rowid — DELETE, then INSERT the declared `search:` text
 ├─ 8  EVENT       one `create` row (field NULL, to_v = JCS of fields), or one `edit` row per changed field;
 │                 `state` for the state field; batch = the ULID of the triggering write; op_id;
 │                 the redaction list writes --redacted--
 ├─ 9  RULES       one pass, priority asc → longest literal → id; ≤ 1 `set` per field.
 │                 Rule writes — `set` and `create` alike — re-enter at step 2 with cascade = false, the
 │                 mechanism `rule:<id>` and this write's batch, so a rule cannot write a locked row and cannot
 │                 trigger another rule; a `once_per` marker is a schedule(kind 'rule') row (45)
 ├─ 10 SCHEDULE    reminders from `remind:` AND occurrences from `repeat:`; CANCEL any whose date or rule moved
 ├─ 12a OUTBOX     INSERT the rows that must leave the object
 │   ═══ transactionSync ends here — steps 1–10 and 12a are ONE synchronous transaction ═══
 ├─ 11 ARM         await scheduler.set(MIN(due_at)) — an async storage op, still under the input gate;
 │                 set only on a difference, but considered on EVERY write
 └─ 12b WAKE       await scheduler.wake() — the outbox doorbell, rung only when this write left an outbox row:
                   Cloud OUTBOX_Q.send({ record }), self-host a kick to the in-process poller (49). The only I/O,
                   and the LAST statement, after commit  → 01 §2
     ─── entry_vec is NOT here: embeddings are an infer.embed outbox job, queued by the hourly sweep over the
         rows that changed (≤ 100 a row), never on the write path (45) ───
```

`write` is what `create` and `update` call; the caller's `version` and `op_id` arrive with their arguments
([33-CONTRACTS](33-CONTRACTS.md) §2) and travel with the patch. *An earlier draft's signature ended in `actor`;
the actor is derived from `ctx` at step 1, never passed.* The kernel that runs it is opened once —
**`openRecord({ sql, clock, random, accent })`** — and everything non-deterministic is injected: `random` feeds every
ULID and nonce, so a fixture record is byte-stable ([33-CONTRACTS](33-CONTRACTS.md) §3), and `accent` is the theme
package's `nextAccentHue` ([13-UI](13-UI.md) §2.1b), so the kernel never computes a hue. `applyMigrations` runs before
any cache load, and a fresh database never throws on open (41).

Twelve consequences, each of which was previously ambiguous:

| | |
|---|---|
| **Steps 1–5 write no row** | a refusal never leaves a partial row, so "validation failed" and "half-applied" cannot be confused. The one thing it writes is an observation (step R), which is how [24-SELF-IMPROVEMENT](24-SELF-IMPROVEMENT.md) §4.2 counts rejected writes at all |
| **Every validator used at step 3–5 is constructed at module top level** | measured: `new Function` works at module scope in workerd and throws `EvalError: Code generation from strings disallowed for this context` inside `fetch()` **and inside the Durable Object constructor**. A validator compiled in the constructor fails on the first request, not at build — [31-STACK](31-STACK.md) §9 |
| **`create` rows re-enter at step 2 with `cascade = false`** | every generated row is locked, coerced, validated and transition-checked like any write; the flag skips step 9 only, so generated rows never trigger rules — the no-cascade rule made load-bearing rather than theoretical. *An earlier draft said "enters at step 6", which skipped four checks* |
| **A rule's `set` re-enters at step 2** | so `immutable_when:` refuses it, exactly as it refuses a human. One lock, one code path |
| **Step 10 cancels before it inserts** | changing a renewal date must cancel the old date's reminders. This is the named test in [09-ALARMS](09-ALARMS-AND-NOTIFICATIONS.md) §2 and it is an *ordering* property |
| **The transaction ends after 12a, and nothing async sits inside it** | `getAlarm()`/`setAlarm()` return Promises on a Durable Object, so re-arm cannot live inside `transactionSync` (its callback is `NotPromise<T>`). Steps 1–10 and the outbox INSERT commit together; then `await scheduler.set(min)`; then `await scheduler.wake()`. The alarm handler has the same shape. [01-ARCHITECTURE](01-ARCHITECTURE.md) §2's "(all synchronous SQLite)" excludes re-arm |
| **CAS is on `entry.version`** | a write on a stale `version` is `VERSION_STALE`: **409** with the current row and the other actor's name; the caller re-reads and re-applies. There is no 412, and there is no whole-document copy to resend |
| **The only stored derivation** | a derived field with `unique: true` is materialised into `fields` at step 6 so its partial unique index has an expression to cover; every other `derive:` is computed at read and inlined by the compiler (§7) |
| **The compiler's clause is the whole `WHERE`** | `compile()` returns `WHERE register = ? AND deleted_at IS NULL AND (…)` entire, and the kernel composes `SELECT … FROM entry <compiled.sql> AND <its own terms>` — at LOCK, at PAIRS, at `list`. It never splices a fragment into a `WHERE` of its own, so `deleted_at IS NULL` is spelled in one place; `includeDeleted` is a flag on `compile`'s `ctx`, not a kernel rewrite (§7; 38, 41) |
| **`document` fields are not parsed at write** | the dialect degrades at render to a visible fence — [05-BLOCKS](05-BLOCKS-AND-THEMES.md) invariant 1. A write-up is never refused for its dialect, because the fence is the feedback channel |
| **`seq` comes from `counter`, inside the transaction** | `UPDATE counter SET next = next + 1 WHERE name = ? RETURNING next - 1` — race-free because the object is single-writer, and a purged row's number is never reissued. `D<n>` and `SG<n>` use the same table |
| **Embeddings are off the write path** | a 400 ms model call inside a write is how a record becomes slow, and `entry_vec` is a derived index that may lag. The Worker fills it through the `infer.embed` outbox kind (§8) |

---

## 5 · The record's RPC surface

[ADR-018](16-DECISIONS.md) says the web app is a client of the agent API. That is enforceable if the
surface is split by *who may reach it* rather than by convenience:

| Group | Methods | Reachable by |
|---|---|---|
| **DATA** (57) | `index` · `boardSteps`, a board's edits laid on it as one new version: the owner's on any board, a member's on Today alone, kept as their own Today · `widgetDraft`, a widget put on Today as a draft with the caller's name and reason, for the owner to keep or throw away · `myShares`, what has been shared with you here, each as one sentence, a person only and never an agent · `shareOnward`, share on what you manage with somebody on the record, at most Edit and never past your own share, a person only · `search` · `get` · `list` · `countBy`, how many entries of one list hold each value of one field, in one read held to what the caller may read · `create` · `capture`, one sentence kept as the one to eight entries it became across lists, all or none, under one batch so one Undo takes every one of them back; a field may point at an earlier entry of the same call, and an op_id sent again answers the first call's batch · `update` · `propose` · `log` · `markRead` · `setPref` · `pushTest`, one test notification to each of a person's own devices, a person only and once a minute, saying nothing of the record · `actionRun`, `actionRun({ ingest })`, Run now on one scheduled action: its pending run is due at once and one event names who pressed, and the press makes no request; an owner's in a browser or a token that may write in the action's project; one press an action a minute and twenty a record an hour, past which `RATE_LIMITED` with `retry_after`, sent as 429 and `Retry-After` · `attach` · `handoff`, which also takes or drops another run's open step, each a call of its own: a take is an agent's, the first taker wins and the second is told who took it and when, and a drop closes a step that is no longer true and says why in words, by an agent or a person · `end`, a closed session's run ended once, the record picking done or handoff from what it left · `beat`, a session saying it is still working between writes, its run's last seen moved in place with no version and no history, an agent only · `meet` · `report` · `triage`, one arrival from the inbox filed as a row or set aside · `comment` · `resolveComment` · `createOwnToken`, a colleague's own agent key, capped by their own levels, the secret answered once and stored nowhere · `ownTokens`, their own agent keys, never the key · `revokeOwnToken`, one of their own keys revoked, the second call the same answer as the first · `renamePerson`, their own name as every record they belong to shows it, refusing a braced or bracketed placeholder in one sentence · `retypeField`, a field retyped or narrowed, filed as one change body and landed at once or held in Decide by who asked · `giveHues`, everything in one list with no colour of its own given a hue once, each the theme's next unlike its neighbours, in one batch signed by the person that one Undo takes back; a thing with a hue is never touched and a token is refused · `heard`, how long an agent's start hook took, counted against its run or its key and never opening a run; the door's own marks (hello, the tool list, a call, an INTERNAL answer) are refused here in one sentence and kept only through INTERNAL's doorHeard · `withdraw`, `withdraw({ id })`, a question taken back while it is still open, by the run that asked it or a later run on the same key, closed as withdrawn; anybody else is told that only the run that asked can take it back · `makePrivate`, `makePrivate({ ref, on? })`, a row you made kept to yourself, or shared with the record again; only its maker can, and a private row is left out of every read, export and figure of anybody else · `undoOwn`, `undoOwn({ batch, dry? })`, one of your own writes taken back by the batch its receipt gave, or only shown with `dry`; only your own run's writes, anything else is refused · `sameOne`, `sameOne({ register, rows })`, a person asking whether two or more people they hold are one, filed as the one question the nightly pass would file and merging nothing · `askFoldTwice`, `askFoldTwice({ register, rows? })`, a person's press on a list that says what makes two of its rows the same: one question on Decide, signed by the person who pressed and never by the record, that folds everything the list holds twice into one of each by the list's keep, with one Undo; with rows, the ones picked, only what they are here twice with is asked about, none of them held twice is refused at rows, and a fold of the whole list already open is answered instead; pressed again while it is open it answers the same question and files nothing, nothing twice files nothing and says so, and a token is refused · `askNamedSame`, `askNamedSame({ pair })`, a person's press on one pair the read of names held twice offers: one question on Decide, signed by the person who pressed and never by the record, asking whether the two are one in the list's own word, with one Undo; pressed again it answers the question already open, a token is refused `NEEDS_BROWSER_SESSION`, and a pair that cannot be folded (a name only seen, or two projects) is refused in words · `proposeScopes`, `proposeScopes({ register? })`, a person putting those moves to Decide as one question a list, each thing with its reason, and the things left in a finished project as one question of three answers (Retire them, Keep them for every project, Leave them), each signed by her and moving nothing until she answers; an open one for the same list is answered again and never filed twice, a move she declined is not asked again, nothing asks it by itself, and every token is refused NEEDS_BROWSER_SESSION · `promoteLearnings`, a person asking on Decide whether each lesson two projects learned on their own is kept once for everywhere, one question a pair signed by whoever pressed, never by a key and never by the night, at most five waiting, a pair asked or declined never asked again; accepting clears the older one's project and marks the newer one replaced, and one Undo takes it back · `toolsSeen`, `toolsSeen({ machine, found })`, the servers, command lines and integrations one machine holds, at most 50, each matched to its row by what it runs: the same program is stamped Seen on and Last seen and asks nothing, a known name that runs something else is one question signed by the run and asked once, and anything new is added directly, signed by the caller's run, as meet adds a person; a project's tool goes to the run's project, and a value that looks like a key is never written · `instruct`, a person telling an agent something from the app, to a run, a kind of agent, whoever is next or a task, or stopping, pausing, resuming or redirecting a run, every token refused `NEEDS_BROWSER_SESSION` · `withdrawInstruction`, the same person taking one back before a run takes it · `instructionsMine`, an agent reading what it was told and marking it seen, taking one compare and set, or answering one with done, needs_you or declined, on its own run · `sendTo`, one request sent from a row to Slash, Claude on a machine, a session open now or whoever starts next, with the rows it carries and whether it may change files, a person only and never a token · `sendWithdraw`, a request taken back, or its job stopped on the machine, a person only · `sendReply`, a follow-up to a request, to the same run while it is open, else the same way the first went, a person only · `pulse`, an agent's bridge saying its session is open, with no version and no event, answered with its run's stamp, what is pending and whether it is stopped · `sealedPut`, `sealedGet`, `sealedList` and `sealedDelete`, the owner's sealed files: bytes his own machines seal and only they open, kept beside the record where the host keeps large bytes, in parts of at most 4 MiB and a file of at most 25 MiB, whole once its parts read back together hash to what each said; his own session or his own key alone, never a share, a grant, a link, a child or narrowed key, an app signed in through OAuth or See as · `attachVisual`, a page hung on a task, a project, a question or a decision, or a new version of one it carries: written as lines in the thing's own log signed by who made it, so Undo puts it back, its page at most 512 KB in the call and its pictures put first through the file door; asked as `log` asks of a task and `propose` of a question; with `draft: true` the version waits beside the one the visual stands at and never replaces it · `settleVisual`, `settleVisual({ id, version, as })`, a person's Keep, Throw away or Try again on a visual's draft: Keep makes the visual stand at it, Throw away leaves the kept one, and Try again throws it away and tells the run that drew it to draw it again, as a draft; it names the version pressed on and is refused on one no longer waiting, and every token is refused `NEEDS_BROWSER_SESSION` | any token, subject to scope, except a report key, which reaches `report` and nothing else: `report` takes one row's fields or `{ rows }` up to 100 and 256 KB of JSON from a report key only, writes them in one transaction into the register the key is bound to, with the key's fixed fields over what was sent and its stamp filled when nothing was, signed `report:<token id>`; `markRead` is person principals only — it advances `member.seen_at` with `MAX()` and is not an event. `setPref({ key, value })` is person principals only too, and not an event: `key` is `nav.order` or `nav.hidden`, `value` a list of addresses or `null`, kept in the `local` table `pref` and answered on `boot`'s `me.prefs`. `attach` is a token's alone, because a person is never a run, and `handoff` names a run only when a person calls it; both need `propose`, and they are how an agent keeps the run §3 signs its writes with ([44-SPEC-MCP](44-SPEC-MCP.md) §4.2); `attach` answers with the briefing READ+'s `context` gives. `meet` is someone an agent came across in the work, a commit author or a sender: matched by email or handle, or added, with where they were met, and linked to the project of the caller's run. It needs `propose` on `people`, and a record with People switched off refuses it `REGISTER_UNKNOWN` and writes nothing. **The MCP tools reach these by the same names** ([10-MCP](10-MCP.md) §3), except that the method `index` is the tool `record_index`, and the two names are stated here and there and nowhere else. `markRead` and `attach` are not tools: a person marks what they have read, and the start hook attaches. Nor are the four sealed methods: they are the owner's alone, held to him as a personal list is, and an agent has nothing to do with bytes it cannot open. Nor is `settleVisual`: an agent hands a draft in, and the person keeps it or throws it away. The governance rows — decisions, suggestions, predictions — are DATA pseudo-registers read and written through these same verbs, and `get` of a row that does not exist is `ok` with `value: null`, never a refusal (45); the MCP `get` tool refuses it `ROW_UNKNOWN`, with `try` naming the list |
| **READ+** (93) | `widgetGallery`, every widget this record can show on Today, each drawn small on its own data · `widgetSuggest`, the widgets suggested from use, each with its reason · `widgetCompose`, a widget made from what was said, as a draft, changing nothing · `page`, which asked with shape on a project's page also carries what its shape's parts draw, each part its own method's answer to the caller, and whose blocks may also name the computed sources signs, the record's vital signs now, one each with its state, number and sentence, held to a reader of the whole record as `signs` is, and handoffs.open, the steps runs left and nobody has taken, newest first, each marked next or earlier, in one project or on the whole record, which takes no order · `signs`, the record's vital signs now with their last 14 days, to a caller who reads the whole record · `previewPage`, a page body nobody has installed, drawn as `page` would draw it: held to the install's own check first, each block held to what the caller may read exactly as `page` holds a declared one, and nothing written, not even the line that counts a page's opens · `previewChange`, a whole change drawn as it would stand: its declarations installed and its sample rows written inside the kernel's rehearsal, every page it makes read by `page`'s own reader, a page per row filled over the row named or the first its `where` admits, each block held to the caller as `previewPage` holds one, and every write rolled back before it answers; a caller who does not read every list may try only lists, figures and pages, each naming only lists they read · `handled`, what BrainDog arranged by itself today, each in one plain line with its reason and the decision that puts it back, newest first and twenty at most; it changes nothing · `todayReminders`, the reminder lines automations have put on Today, and `automationSentence`, an automation written as a sentence, turned into the body it means and read back in the person's words, with what it would have done over the last 30 days of rows the caller may read; it installs and runs nothing · `metric`, a figure's reading, which also answers by id the figures the record builds in when no declaration holds that id, among them `signs-red`, the vital signs that read red now, `green-days`, the days in a row none read red, and `rates-age-days`, the days since the newest exchange rate · `metrics`, several figures in one read, each answered by `metric` itself or refused as `metric` would refuse it, at most fifty a call, so a screen's figures go as one request · `reads`, several reads in one request, at most thirty-two, each answered by its own route with its own checks and its status as it would be asked alone, a write refused inside it; a POST that writes nothing, so a screen's first reads pass the doors in front of the record once · `today`, Today's body drawn as `previewPage` draws it with each tile's part beside it, what BrainDog did itself, what is shared out and the project cards' late work, runs and key numbers, each its own method's answer to the same caller; a POST that writes nothing, so Today's tiles are one turn of the record · `figures`, every figure the record declares that the caller may read, each with its id, name, format, list and pack and whether it takes a value, which is what MCP's `record_index` names · `offered`, everything the caller may read, in one read: the fixed addresses, each decided by the check its own reader asks and never by running the read, the lists, the pages and the figures they may read, and the skills by name with when to use each, never their text, which is what MCP's `resources/list` names · `schema` · `schemas`, what several lists hold in one read, each answered as `schema` answers it or refused as `schema` would refuse it, the installed kinds said once, at most a hundred lists a call, or every list the caller reads, the lists boot names them by the same check, so a first screen asks it beside boot · `dialect` · `digestToday` · `sessionsLive` · `context`, where an agent stands in one call: its run and its project, the last handoff there, who else is live, what waits on a person, and every register with a scope field, the project's rows first and then the global ones nearer-wins leaves, each held to the caller's level; a key by its label and whether it is sealed, never a value. It never writes and opens no run, except that `topic`, what an agent with no folder says the person is working on, places that agent's run in the project of that name, or in the first project formed from it as a draft on a record that has none · `whatsNew`, newest first, at most sixty, since the caller's read mark · `recentHistory`, the whole log newest first a page at a time, each line held to what the caller may read · `inbox`, what arrived and no rule filed, newest first a page at a time, an arrival set aside as a repeat carrying the id of the row it repeats as a handle for "It is a second one", and given `repeats: true` only those, so a page of skipped balance alerts cannot push a real second charge out of sight, given `digest: true` every state at once, the newest 100 of each with the body cut to 180 characters, and given an arrival's id that one whole, each of the two asked alone; the inbox holds whatever was sent in, so only an owner reads it, and every token and every other level is refused as forbidden · `inboxPatterns`, what each pattern did with the last 14 days of arrivals or the days asked for, door by door: filed, skipped with its reason, waiting, and how many no pattern read, each pattern by its description and never its id, to whoever may read the inbox · `project` (§9) · **`boot`** — the index, live sessions, open suggestions, the record's name, who is asking, the pages they may open, the Decide and Inbox counts and `whatsNew` since the caller's read mark, **in one round trip**, because the predecessor measured that a first screen assembled from four calls is a first screen that flickers · `whoami` — the caller's principal, scope and record · `ruleTest` — a rule run dry against named rows, writing nothing · `scriptTry`, a draft script run now in the sandbox, answering the writes it would make, its log and any refusal, and writing none of them. It is at the propose rung, because an agent tries a script before it proposes one; its reads are the caller's own and never the system's; a key is opened only for an owner, since a draft is approved by nobody; and it is asked of the plan's allowance first and counted as a run, because it fetched. MCP reaches it through propose: a script change that carries try is run now and filed nowhere, and one without it is filed and never run, because a trial sends real requests and spends a run · `packConfig`, one pack's settings and the value each holds now · `arrangement`, how the record is arranged and what may be proposed about it, compactly: its packs on and off, what the host's catalogue offers, the use case's voice and other pack settings, the pages the caller may open and the arrangements already waiting; given a page, that page's declaration as installed, to write a changed layout from; given a grammar, what a page body or a pack, settings or arrange proposal may contain · `exportUseCase`, the record's arrangement as a use-case file somebody else can install: the first-party modules that are on, the enabled use case's lists and pages, the pages placed by hand, the voice and the labels, for a caller who reads the whole record, and no row unless its examples name it by list and number; the file is read back through the shared-file check before it is answered, so a picked row holding a credential is refused · `exportPack`, what the record made of its own that it can share as an add-on, or the add-on file made from the ones ticked, with what each brings along and why; it carries no entry, name or key of the person's own, and it changes nothing · `addons`, the add-on store and what this record holds, searched by words or shelf, each with who made it, how far it is trusted, its newest version and what it reaches of the person's · `addon`, one add-on whole: what it asks of the person's, its versions, and when it is here its settings and what it may do, with its file to a reader of the whole record · `addonNew`, a starter add-on file from an id, a title and fields, writing nothing · `addonCheck`, an add-on file planned against this record as `planPack` plans it, to a reader of the whole record, filing, installing and arming nothing · `automations`, every automation with what starts it (a write, an arrival, a clock or a Run now button), whether it runs inside the write or as a run after it, when it runs next and this month's runs; or one, with its body and its last ten runs, each step with its outcome. Held one automation at a time to the lists the caller reads, and one with no row to be about only to a caller who reads every list, since its steps may write to any · `actions`, every scheduled action with its state, its last and next run and this month's counts from its own events, a key by its label and never a value · `scripts`, every installed script with the lists it may read and write, the origins it may fetch from and its keys by label, whether three refused runs in a row have paused it, its last run in the record's own sentence, the refused runs in a row it has now and this month's runs. Held one script at a time to a caller who reads every list it reads and writes, since a run's log may quote them, and it carries no log and no value · `backlinks`, what points at one row: the rows of other registers whose reference fields name it, one group per field and not per register, newest first a page at a time, each group with the whole count beside the page of it. Nothing is added to the data model — the inverse of every reference is already stated once, on the field that declares `to:` — and a register the caller may not read is not asked about, so its rows cannot be inferred from a count either · **`views`**, the saved ways of looking at a list: every one on one list, or on every list the caller can read, with a list out of reach left out rather than refused, because which lists exist is itself something a caller may not know · **`view`**, one of them whole — the filter it holds, the text it searched for, the order it sorted by and the columns it kept. A saved view belongs to a register, which is what `02 §5` asks of it and what the page declaration it replaced could not say · `subscribePush`, this browser asking to be told when something needs the person using it, with the subscription the browser gave, and `unsubscribePush`, the same browser no longer asking. Each is a person's own: a token is refused, because an agent has no lock screen; any level may, because a push says one fixed line and opens only what the person could already open; and the subscription is kept against the person in a table no file carries. Both are POSTs, because each keeps or removes that row, and neither is an event · `usedBy`, which runs used one key or one tool, the one that used it last first: at most `USED_BY_MOST` of them, each with when it last used it and how often among that key's or tool's newest `USED_BY_WALK` uses (both in `packages/record/src/methods/agents.ts`), and with its agent and machine only for a caller who reads the runs. A key's uses are the Keychain's counted opens of its sealed value and a tool's are the writes of its last-seen stamp, each signed by the run that made it; a person's own open is in the key's history and is not a run. A key or a tool the caller cannot read is answered in the sentence one that is not there gets · `visuals`, the visuals one thing the caller may see carries, each by title, version and who made it · `visual`, one visual's page and pictures by hash, at the version asked, with every version · `comments`, every comment and reply on one row, question or decision the caller may see, oldest first, each with how it was resolved · `sharedPage`, the one page a shared link opens, read-only and one level deep, reached only with `Authorization: Share` and a link's token · `checkAutomation`, whether an automation body would install, installing nothing · `tryAutomation`, an automation body's steps taken now over a sample and every write rolled back, nothing sent · `automationVersions`, one automation's versions, newest first · `flowGrammar`, what an automation may say: every trigger and step, the arguments each takes and which the lint requires, what each picks from, and the ceilings, to whoever reads automations · `pageVersions`, one page's versions newest first, each with its source, when it was applied and by whom, held as `arrangement({ page })` is; each version is cut to the lists the caller may read and says how many parts were left out (its cut, a count and never a list's name) when any were, a block over a figure since taken out of the record is left out too for a reader who does not read every list, since nothing says any more which lists it read, and a body is answered with its page key first, so it can be put back as it came · `tryPattern`, a pattern tried on up to ten messages from the inbox and shown against each, writing nothing · `anchorsFor`, the ways to find text selected in one message again, each tried on every sample · `previewRetype`, a field's retype or narrow drawn over the rows its list holds, every failing row answered, writing nothing · `huesWanted`, how many things in each list that names an accent have no colour of their own, with up to five names, held to the lists the caller reads and writing nothing · `quietHours`, the record's quiet hours, when a summary that comes due is held until they end, in the record's time zone · `understandPlan`, the next slice of the nightly walk as a dry understand answers it: what it would link to who and what each thing is about and what it would ask on Decide, in names, taking nothing and writing, filing and moving nothing, so the command line and an agent working for the owner can see how the record reads the people and projects in the work before meeting anyone; who may read it is the record's to say · `doorSigns`, the door's own signs over the last seven days: the sessions that said hello, were given the tools and made a call, the builds seen, the slowest start and the longest card, to a caller who reads the whole record · `faults`, what is not working in BrainDog itself, each in its plain sentence with how many times and since when, to the owner or an agent on the owner's key; the raw error only to the owner of a self-hosted record in person · `engineHealth`, whether the model answers, read from Slash's own ledger of thirty days: answering, not answering since a date, never asked, off, or its key closed, in one sentence that says whose it is to fix · `engineReadings`, what Slash’s model was asked and answered in the last 30 days, purpose by purpose, and what the record does not yet understand · `pagesCensus`, each page the caller may open counted (its blocks, how many draw, each refusal, each placeholder that names nothing, each glyph no host draws and each dash, the dashes as the page lint counts them), with totals, writing nothing · `checkPaths`, given a document, each placeholder it holds and whether the record has anything by that name, a path over a list the caller may not read said as naming nothing · `trust`, how far each agent is trusted with each kind of change (Ask, Do and tell, Do quietly), since when and whether it was put back to Ask, to the owner only (a person at owner level or a grant of theirs, every list), writing nothing · `imports`, every import made into the record, newest first, each with its run, when it first wrote, how many it brought into each list and whether the owner said it is his own; the owner's over the whole record, as `trust` is, and it writes nothing · `heldTwice`, `heldTwice({ register })`, which people, or which rows of a list that says what makes two of its rows the same, may be on the record twice, by their numbers in the list, lowest first; nothing for any other list, held to what the caller may read, writing nothing · `namedTwice`, `namedTwice({ limit? })`, which organisations and projects the record may hold twice, twenty pairs at most and best first, each by both names, the list, their numbers in it, the one sentence why they look the same and whether a press can ask; a pair is left out when the caller cannot read either side, never an id, writing nothing · `briefing`, what matters on the record now as a few cards, each one line and the thing it opens, the most pressing first: what is late, what is asked, a step an agent left and what falls due this week; the cards a model wrote that morning or evening where the host has one and the facts have not moved since, and the rules' otherwise, with the one sentence why the rules wrote them where a model would have (said beside the cards, and nothing when a model's cards stand); worked out when asked, held to what the caller may read, writing nothing · `exceptions`, what stopped on the record: a list that took something most days and then nothing, a way in that went quiet, a feed that missed its time and anything older than its page allows, each by its name in one sentence with the day it stopped; worked out when asked and kept in no table, a list only to a caller who reads it whole and the ways in and feeds only to a caller who reads every list, writing nothing and asking nothing · `about`, what one thing is, asked by its name or by its number in a list: its kind, its name, what else it goes by and where it was seen; when two things answer to the name both are offered and neither is picked, held to the lists the caller may read and silent about the rest, writing nothing · `matched`, who the record matched on its own and still holds as one: who was folded into whom by name, one sentence of evidence, when, and the batch an Undo takes, newest first and fifty at most; a merge the owner answered a question with is left out, nothing on a record that keeps no people, held to what the caller may read, writing nothing · `stale`, what went stale where you stand, each kind in one sentence with how many and the one call that clears it, held to the lists the caller may read, taking nothing and writing nothing · `scopeProposals`, `scopeProposals({ register? })`, where the things of each list with a scope field that apply everywhere seem to belong: a list each, with its name, how many, the one question it would be asked in and at most 200 of them, each by its name with the project by name and every reason in one sentence, worked out by the four votes of `packages/record/src/scope-propose.ts` and how many are left in a finished project; held to the lists the caller may read, a list held from her never named, writing nothing · `learnings`, what the record's agents learned and still stands, a method before a fact, the project the caller stands in before everywhere, newest first, forty at most unless a limit is given, saying when there were more and how many faded; one that was replaced, taken back or faded is left out, refused to a caller who may not read them, writing nothing · `learningsTwice`, which lessons two of the caller's projects each learned on their own, the older first, at most twenty, each with the question it would be put as, held to what the caller may read and writing nothing · `textFaults`, every fault in the words of the pages the caller may open and the documents of the lists they may read: a path that names nothing with the nearest name that exists, a typed value that does not parse, a block shown as written, a bar of typed numbers with no date, a path two rules read, a pinned note unchanged in thirty days and a page with more than two red phrases, each with its place by name and its fix, and the one sentence they come to; held to what the caller may read, taking nothing and writing nothing · `learned`, what the record will not ask again because of an answer, each in one plain sentence: two people kept apart (a merge answered no, or a fold put back) by both names, an offer the pen was told no about by its own title, and a question answered no by its question; newest first and fifty at most, with how many more were held back; held to what the caller may read, writing nothing and asking nothing · `inboxHints`, what each arrival named in the Inbox is (a payment, or someone writing), who it is from by the record's name for them and the amount it says, worked out by rules and stored nowhere; fifty at most, the Inbox's own reach, and nothing for anybody else, writing nothing and asking nothing · `skillsBehind`, which skills have standing lessons about them (the lesson's topic is the skill's name, and it applies in the skill's project or everywhere) that their Learnings behind it does not name yet, most behind first and twenty at most, each with those lessons by their first words; nothing from a list the caller may not read, writing nothing, asking nothing and calling no model · `presence`, the sessions open now, each with its agent, machine, project, branch, what it is doing, what it holds from the owner and how a stop reaches it · `instructionList`, the owner's threads of what he told agents, each with who saw it and how and the receipts read from the log · `sendTargets`, who the owner can send a request to from a row now · `sent`, one request he sent with its reply, what it is doing and its receipts · `sentList`, what he sent that is still in flight, or every request about one row from the last week · `agentProfiles`, the owner's settings rows, one per kind of agent, each with what it lets an agent do | any token. Exposed over MCP as **resources**, which is how the web app stays inside ADR-018 — [10-MCP](10-MCP.md) §6. *An earlier draft had five resources with no method behind them* |
| **KEYCHAIN** (12) | `listGrants` · `openGrant` · `bindGrant` · `revokeGrant` · `setVaultPassphrase` · `clearVaultPassphrase` · `keyAccess`, the lock window and which machine may open which key · `setKeyAccess`, one key always, after asking, or never, for one machine or every machine · `keyAsks`, the machines waiting on a key · `keyUses`, which tools need which key, names only · `answerKeyAsk`, once, always or deny · `setLockAfter`, 5, 15 or 60 minutes (keychain access, [12-SECURITY](12-SECURITY.md) §6.3) | **a browser session only**, re-auth over 15 minutes ([12-SECURITY](12-SECURITY.md) §6 rule 2); every token is refused `403 NEEDS_BROWSER_SESSION` — rule 3, *not scoped, absent* — and no operation grant reaches here. `openGrant` logs `grant.read`, counts `opened`, and returns **sealed** material `{ ciphertext, nonce, aad, kek_id, wrapped_dek }`; the host unwraps via `KeyStore`, derives the grant key, decrypts, and returns plaintext once. The record never sees a plaintext credential (ADR-062); `bindGrant` is the mirror. *(Amended September 26th 2026: `setVaultPassphrase({ passphrase })` puts the record DEK behind a passphrase and `clearVaultPassphrase({ passphrase })` takes it off with it, each one compare-and-set on `vault_key` and one `grant.rotate` event on `vault_key:record`; the host takes the passphrase off the arguments and hands the record a step, so the record is handed wrapped bytes and a salt and never the passphrase ([12-SECURITY](12-SECURITY.md) §6, "The optional second factor").)* |
| **JOBS** (7) | `createJob` · `cancelJob` · `listJobs` · `jobEvents` — a browser session (`jobEvents({ id, after })` is the job view's poll; `listJobs({ status?, limit? })` lists) · `claimJob` · `postJobEvent` · `readCancel` — the runner's grant, `device_grant.reach = 'runner'` | **refused to every MCP token, with a reason** — the predecessor's job-surface refusal, [10-MCP](10-MCP.md) §8; a job is code execution. `claimJob` sweeps expired queued jobs, re-claims a lost one **once**, and mints the job bearer — a `token` row with an audience of one job; `postJobEvent` holds the runner to `seq + 1`; `readCancel` renews the lease ([26-BYO-INTELLIGENCE](26-BYO-INTELLIGENCE.md) §4; the SQL is 46 §4.7's, adopted verbatim by 45) |
| **ADMIN** (87) | `planPack` · `sharing`, every share on the record, live and ended in the last 30 days, each as one sentence · `share`, part of the record shared with somebody or a share changed, never with an owner, held to the grammar's rules and confirmed inline when it widens · `unshare`, one share stopped with every share made onward from it · `sharePreview`, a share as its sentence and the rows of each list it reaches now, kept nowhere; all four an owner's or an Admin's in a browser · `groupPut`, a group of people to share with made, renamed, or retired with every share it holds ended · `groupMember`, somebody on the record put in a group or taken out, one access event per share the group holds; both an owner's or an Admin's in a browser · `groups`, every live group with its people and how many shares it holds · `shareActivity`, `shareActivity({ person?, days? })`, Seen and changed: what people who are not owners read and changed in the last 30 days, at most 400, one line for each person and the shares that allowed it, in plain words and names and never ids, read off the read counters and the writes' lines; an owner's or an Admin's in a browser · `sharedOut`, what is shared out, for Today's one line: how many shares, with how many people and groups, those made today by their own words, and whether one needs him (a wide share made today on an account with no passkey to have confirmed it) · `setup`, the first run as one call: the add-ons in order, then the owner's name, their words, the settings and their starting entries, answered `{ done, failed }`, and asked again it writes only what is missing; a browser session and the owner only · `slash`, what Slash noticed about how the record is used (which lists grow, which pages are opened, what nothing has touched in ninety days, what agents write) and the pack, settings and arrange proposals it would file, each marked with the question it already is; it writes nothing and asks no model · `slashPropose`, Slash's proposals filed as slash through the proposal door's own checks, a configured model's when it answers something valid and the rules' otherwise, never one already asked and never more than three waiting; given `asked`, a description, and `page`, the page it is about, it files what `slashDraft` would answer · `slashDraft`, `slashDraft({ asked, page? })`, what the owner described drafted by the model in the page, list, figure and rule grammars it is handed, each draft drawn with `previewChange` and handed back to be mended at most `SLASH_REPAIRS_MOST` times, answered with its rows and what it drew and filed nowhere; it writes only the ask ledger's row for each ask ([45-SPEC-RECORD](45-SPEC-RECORD.md) §5.6) · `slashDaily`, `slashDaily({ on })`, whether Slash looks once a day on its own and files what it finds the same way, on unless the owner turns it off; the host's tick calls the record's unrouted `slashTick`, which runs at most once a UTC day · `slashReads`, `slashReads({ on })`, whether Slash reads in the background, on unless the owner turns it off, and with no argument the state as it stands; an owner's in a browser, kept as Slash's own pref and not an event; off stops the background jobs and never the owner's own ask · `engineProbe`, each model of the answer route asked a fixed question that holds nothing of the record, answered with which answered, whether strictly, how fast, or why not in the house's words and never the provider's; one ledger row a model under purpose probe that spends nobody's month; the owner's in a browser, one every ten minutes a record, kept as Slash's own pref · `trustTakeBack`, `trustTakeBack({ agent, kind? })`, an agent put back to asking on one kind it was lifted on, or on every such kind when none is named, by the name and the words the trust read says them, answered with where that agent stands after; an owner's in a browser and never a token, so no agent sets a rung · `importAdopt`, `importAdopt({ run, yes })`, the owner's press saying an import is his own or outside text, answered as the imports read says it; an owner's in a browser and never a token, and it files no question · `slashForm`, `slashForm({ usecase, said })`, a first plan for what the owner said a project is, asked of a configured model with only that sentence and the use case's list limits, checked row by row and filed as Slash's arrangement of rows, asked once per record; with no model, a failure or an answer outside the limits nothing is filed and the caller keeps the use case's own plan · `planUseCase` · `fetchShared`, the text of a shared use case or add-on at an https address or `git:owner/repo@ref:path`, read by the host with no credentials, no private or local address, at most 300 KB and ten seconds, answered for the shared-file check and the plan to read like a file, and writing nothing; `fetchUseCase` is its name for one release, kept as an alias · `installPack` · `uninstallPack` · `packsRemoved`, the add-ons taken out within the window a reinstall still puts back, newest first, each with the lists that stayed and how many entries each holds · `disablePack` · `enablePack` · `resumeAction` · `resumeScript` · `automationRun`, Run now for an automation that declares the button, which arms one run for the next drain · `cancelRun`, which stops a run that has not finished and takes its wake with it · `fileArrival` · `fileAsSecond`, a text skipped as a repeat filed after all by the pattern that skipped it, its repeat check set aside this once, and only a skipped text · `archiveArrival` · `ingestMint`, `ingestMint({ ingest })`, a webhook ingest's path token for one that declares `verify: { kind: path }`, answered once with the record id and the whole path to post to (its rec and path, null while the record has no identity) and kept only as its SHA-256, a second mint replacing the first · `doors`, every live webhook ingest as `{ id, description, verify, held, register }`, whether a token is held but never its digest (September 22nd, for the generic doors screen) · `doorSwitch`, `doorSwitch({ ingest, on })`, one webhook door switched off or on by the owner: off answers every arrival 410 and stores nothing, and its address and token are kept, so on again is the same door · `setPackConfig` · `setDeclaration` · `ruleApply` · `invite` · `invitations` · `revokeInvite` · `suspendMember`, somebody stopped without being taken off, or let back in, with everything they held kept and never the last owner · `handOver`, `handOver({ person, why? })`, somebody already on the record made an owner and the owner asking stepped down to Can decide, in one write, from a sign-in proved in the last 15 minutes and never by an agent, the bypass switch included · `export` · `import` · `erase` · `restore` · `snapshot` · `snapshots` · `createToken` · `listTokens` · `revokeToken` · `createReportKey` · `reportKeys` · `deviceApprove` · `listDevices` · `revokeDevice` · `renameDevice`, one machine named anew by its handle, which its sign-in and its key then read · `setDecider`, `setDecider({ id, to? })`, one open question handed to the one person who decides it, a member who holds Decides or an owner, or taken back when nobody is named; anybody else who may decide is then answered "This one is Ada's to decide." · `deleteRecord` · `saveView` · `retireView` · `examples`, the example rows setting up planted that nobody has touched, counted by list, which writes nothing · `clearExamples`, every untouched example row deleted together, leaving a row somebody edited and any example one of their own rows points at · `openShare`, a read-only link to one page, shown once · `closeShare`, one such link closed for good · `shares`, the links this record opened, open and closed, never a link itself · `shareable`, whether this BrainDog can make a read-only link to a page, and why not · `setAutomation`, one automation switched on or off as a new version · `retryRun`, a finished run started again under the automation as installed now · `setQuietHours`, the record's quiet hours set to a start and an end, turned off, or put back to 21:00 to 08:00 · `setZone`, the time zone the record counts its days in, set to a place such as Europe/London · `undoLook`, `undoLook({ page })`, a page put back the way it was before Slash arranged it, only while that arrangement is still Slash's · `keepLook`, `keepLook({ page })`, Slash's arrangement of a page kept once its Undo has passed, so the page says who kept it · `undo`, `undo({ batch?, decision?, dry?, hash? })`, one change or one accepted decision put back, given one of the two, answered first as a plan in names with its hash and applied only with that hash, each step compare-and-set so a row changed since is skipped and named; a batch that matched two people into one goes back whole, both people with what each held, never narrowed to one row (`VALUE_MALFORMED`), and the batch that put a match back is not itself undone (`NOT_IN_THIS_BUILD`) · `undoRun`, `undoRun({ run, dry?, hash? })`, everything one agent's run wrote put back the same way, rule cascades in its batches included, the owner's alone because a run may touch any row · `understand`, `understand({ dry?, undo? })`, the next slice of the nightly walk over what the record holds run now: payments linked to who they were with, runs and services placed in their projects, what it would not do on its own filed on Decide once; a dry call answers the slice in names with nothing written, filed or moved, and the owner's alone in a browser because it writes on every list it reads · `retryFault`, `retryFault({ cause })`, the job behind one fault queued again now rather than at the night's retry · `doorHealth`, every connection that can act on the record (a key by how it was made, or a runner machine) with the app and version its newest run named, the build of the command behind it, its last call and last tool call, how many days its build is older than `min_cli` and its runs this week, and the agent door's seven signs, each a count or null where there is nothing yet to judge: keys that opened a run in the last day and called no tool since, connections behind `min_cli`, ending within 14 days, silent for 30, apps that signed in at the address and made a call, runner machines heard from in the last 40 seconds, and jobs lost this week; it takes nothing and changes nothing · `setAgentProfile`, an owner in a browser making, changing or retiring one agent's settings row, one event per change | **a browser session — or a bearer carrying an operation grant for that one operation**, once, within ten minutes of the owner approving it in a browser (§10). **No standing token reaches here; there is no admin scope** (ADR-060, amended by its own reversal clause). `planPack(pack) → Diff` is read-only; `disablePack({ id, alsoDisable? })` turns a pack off and keeps its `pack` row and every row under it, `enablePack({ id })` turns it back on, and their refusals `PACK_REQUIRED` (naming the dependents), `SCOPES_IN_USE` and `PACK_DISABLED` are 422 ([04-PACKS](04-PACKS.md) §4); `fileArrival({ id, register, fields? })` files one arrival from the inbox as a row, written like any row, and marks the arrival `matched` in the same batch, and `archiveArrival({ id })` marks it `ignored` and keeps its bytes; both are an owner's on the whole record, as `inbox` is, a second call is the same answer with nothing written, and an arrival the inbox no longer shows is `OUT_OF_BOUNDS`; `installPack(pack, planHash, approve?)` refuses `PLAN_STALE` if the record moved since the plan or if `approve` is not the plan's own `approve` lines, and `REQUIRED_MISSING` at `approve` when the plan calls out a new or changed action and nothing was approved (a token never reaches it, so an agent's actions arrive through `propose`) — `planHash` is `<record_version>.<sha256(jcs({ pack, base }))>` (42); `import` only into an empty record (`IMPORT_NOT_EMPTY`) — both refusals, 422, never 409 — [33-CONTRACTS](33-CONTRACTS.md) §9. `restore({ bookmark, at? })` is **one method**; on Cloud the Worker performs `pitr(at)` before calling it. `invite({ email, levels })` mints an invitation, by the owner, and answers the only copy of its link; the record mails nothing, and the app then asks its host to mail the link to that address (`POST /auth/invite` with `send: true`, a signed-in session, the proof inside it for an address new to the host, amended 2 November 2026); `invitations` lists the ones still waiting, never a link, and `revokeInvite({ id })` withdraws one; `setDeclaration` has no `mode`; `ruleApply` is a rule's run over existing rows, dry or real; `deviceApprove` is the approving half of RFC 8628 and of every operation grant, by the owner from a sign-in proved in the last 15 minutes, and `listDevices` and `revokeDevice` name a device by its handle, never by the id it polls with; `deleteRecord` is self-service deletion — re-auth, the typed slug, and on Cloud `destroy()` plus the R2 prefix ([02-DATA-MODEL](02-DATA-MODEL.md) §9); `snapshot` and `export` may also be called by `system` from the nightly walk (53); `saveView({ register, id, name, filter?, search?, order?, columns? })` puts one saved view on a list, or replaces the one already under that name and keeps who first saved it and when, and `retireView({ register, id })` takes one off, leaving every row where it was. Both are an owner's in a browser for the reason `setDeclaration` is: a saved view goes on the list for everybody who opens it rather than into one person's bookmarks, so it changes what the record offers. A filter is compiled against its register before it is stored, an order or a column naming a field that is not there is `FIELD_UNKNOWN`, and a name a list has no view for is `VIEW_UNKNOWN` carrying the names it does have |
| **INTERNAL** (26) | `drainSchedule` · `leaseOutbox` · `ackOutbox` · `observe` · `applyMigrations` · `createRecord` · `arrive` · `ingestVerify` · `applyPull` · `sealedGrant` · `changed` · `acceptInvite` · `deviceStart` · `devicePoll` · `vaultGrant` · `depositGrant` · `openForGrant` · `unlockVault` · `rewrapKeys` · `opsReport` · `doorHeard` · `shapeGrant` · `shapeExport` · `chatApp` · `chatAnswerMint` · `chatAnswer` | **the host only.** Not routable from outside. `createRecord` writes the `record` row and the owner's `member('*', 'owner')` row; `arrive` is the ingest pipeline — store → match → extract → write → outbox — in one transaction, no model; `ingestVerify` hands the host a webhook's verification material, sealed, under a `grant.read` event; `applyPull` writes a connector's page and refuses `PULL_LEASE_EDGE` on a lease no longer the runner's; `sealedGrant(grant_id)` returns the sealed material to the host for a connector run (§8); `changed(since)` feeds the live channel; `acceptInvite` is called at acceptance with the Directory's verified person; `deviceStart`/`devicePoll` are internal because the device has no credential yet, so the host's `/auth/device` and `/auth/device/token` routes call them, and `deviceStart` counts starts per address; `vaultGrant` checks a `vault` reach's bearer for the host, which `verifyToken` never accepts; `depositGrant` and `openForGrant` are the key doors' record halves, called by a host with one of exactly two callers: keychain access, at `/api/vault/deposit` and `/api/vault/open` after `vaultGrant`, which reaches only a key whose row's project is the grant's scope; or a browser session, at the app's own `/api/keys/put` and `/api/keys/open` (added September 16th 2026), which is held to the KEYCHAIN gate here — an owner, no token, a proof under fifteen minutes old — and reaches every key the record holds. `depositGrant` names the grant id, version and AAD, the host seals under its `KeyStore`, and only sealed bytes are bound; `openForGrant` logs `grant.read` signed by the caller's run, or by the person where there is none, and returns sealed material, which the host opens and answers once ([12-SECURITY](12-SECURITY.md) §6 rule 9); `unlockVault` is the key doors' third record half, behind the keychain password: it puts the KEYCHAIN gate first for a person, counts the try, and calls the host's step, which opens the record key in the host for one request and answers only whether it opened; `rewrapKeys({ from, to, rows })` is the record's half of a root key rotation: the host unwraps each key the record holds under `from` and wraps it under `to`, and the record swaps each row only while it still names `from`, every such row together or none, in one transaction with one `grant.rotate` event (`target_kind = 'vault_key'`), leaving a key behind a passphrase alone ([53-SPEC-OPERATIONS](53-SPEC-OPERATIONS.md) §5.6); `opsReport` serves the runbooks (45, 53); `doorHeard` is the agent door's own mark (hello, listed, called, internal), and a key's `called` moves its `last_tool_at`; `shapeGrant` checks a `shape` reach's bearer for the host, which `verifyToken` never accepts, and `shapeExport` is the shape door's record half, called by a host at `/api/shape` with that bearer, which it checks again before it reads a row, answering the record's export with the keys left out and every value scrambled; `chatApp`, `chatAnswerMint` and `chatAnswer` are the MCP door's, for a decision card in Claude or ChatGPT: the first says which chat app holds the caller's key, the second mints the card's one-time grant for a key the app holds, while the owner's "Answer from inside chat apps" is on, and the third answers one press with it as the owner's own `decide`, which `admin` and `vault` refuse ([12-SECURITY](12-SECURITY.md) §5.1) |

**All methods: 57 · 93 · 12 · 7 · 85 · 26.** *(Amended October 30th 2026 for widgets: DATA gains `boardSteps`, which a member reaches for their own Today since each person's Today is their own, and `widgetDraft`, and READ+ gains `widgetGallery`, `widgetSuggest` and `widgetCompose`, with their rows in `packages/host/src/routes/board.ts` and `packages/host/src/routes/widgets.ts`.)* *(Amended October 28th 2026 for sending a request from a row: DATA gains `sendTo`, `sendWithdraw` and `sendReply`, and READ+ gains `sendTargets`, `sent` and `sentList`, in `packages/record/src/methods/send.ts` with their rows in `packages/host/src/routes/agents.ts`.)* *(Amended October 26th 2026 for keychain access (ADR-077): VAULT gains `keyAccess`, `setKeyAccess`, `keyAsks`, `answerKeyAsk` and `setLockAfter`, written in `packages/record/src/methods/keychain-access.ts` with their rows in `packages/host/src/routes/keychain-access.ts`. Lock now is the sign-in route `/auth/keychain/lock` and no method here; migration 46 keeps the rules and the asks.)* *(Amended October 24th 2026 for drafts in place: DATA gains `settleVisual`, a person's Keep, Throw away or Try again on a visual's draft, written in `packages/record/src/methods/visuals.ts` with its row in `packages/host/src/routes/visuals.ts`. A draft is a mark in the version line's own body, so no migration.)* *(Amended October 24th 2026: READ+ gains `reads`, several reads in one request, each answered by its own route, written in `packages/record/src/methods/reads.ts` with its row in `packages/host/src/routes/reads.ts`.) (Amended October 24th 2026: READ+ gains `today`, Today's tiles in one read, written in `packages/record/src/today.ts` with its row in `packages/host/src/routes/today.ts`.)* *(Amended October 23rd 2026 for visuals: DATA gains `attachVisual`, READ+ gains `visuals` and `visual`.)* *(Amended October 22nd 2026: READ+ is recounted from its row, 78.)* *(Amended October 22nd 2026 for Setup sync: DATA gains `sealedPut`, `sealedGet`, `sealedList` and `sealedDelete`, the owner's sealed files ([12-SECURITY](12-SECURITY.md) §8), written in `packages/record/src/methods/sealed.ts` with their rows in `packages/host/src/routes/sealed.ts`. None is an MCP tool, and `sealedPut` is the one `/api` body allowed past a mebibyte, six.)* *(Amended October 22nd 2026 for answering a decision inside Claude or ChatGPT: INTERNAL gains `chatApp`, which chat app holds the caller's key, asked before `answer` is listed; `chatAnswerMint`, the one-time grant the MCP door hides in a decision card's `_meta`, and `chatAnswer`, the card's press answered with it as the person's own `decide`. The door in the host is their only caller, so no key asks for a grant itself; both are written in `packages/record/src/methods/chat-answer.ts`, and [12-SECURITY](12-SECURITY.md) §5.1 says why a press counts and the model cannot press.)* *(Amended October 23rd 2026 after the owner's record was overloaded by a page's burst: READ+ gains `metrics`, several figures in one read, each answered by `metric`, written in `packages/record/src/methods/metrics.ts` with its row in `packages/host/src/routes/metrics.ts`.)* *(Amended October 21st 2026 for Today's first open: READ+ gains `schemas`, several lists' declarations in one read, each held to the caller as `schema` holds it, written in `packages/record/src/methods/schemas.ts` with its row in `packages/host/src/routes/schemas.ts`.)* *(Amended October 21st 2026, sharing batch 9: ADMIN gains `sharedOut`, Today's one line about what is shared out, asked after Today has drawn so an owner's `boot` stays the bytes it was.)* *(Amended October 20th 2026, sharing slice 10: ADMIN gains `groups`, the Sharing page's list of groups.)* *(Amended October 20th 2026, sharing slice 12: ADMIN gains `shareActivity`, what people who are not owners saw and changed and through which share. A write by somebody who is not an owner keeps one `access_via` line naming the shares that admitted it, each read they make is counted on today's `access_seen` row, an owner's reads count nothing, and the night says each share that ran out once in the ledger, "Ended on its date".)* *(Amended October 20th 2026, sharing slice 8: ADMIN gains `groupPut` and `groupMember`. Taking somebody out of a group ends the group's shares for them, one `access.revoke` a share; a share to an address waits for its person, and an invitation carrying no level is good while one does.)* *(Amended October 21st 2026 for instructing agents and their settings (agents and MCP plan §8.2): DATA gains `instruct`, `withdrawInstruction`, `instructionsMine` and `pulse`; READ+ gains `presence`, `instructionList` and `agentProfiles`; ADMIN gains `setAgentProfile`. Each is written in `packages/record/src/methods/instructions.ts`, `agent-profile.ts` or `agents.ts`, with its row in `packages/host/src/routes/agents.ts`.)* *(Amended October 20th 2026, sharing slice 7: DATA gains `myShares` and `shareOnward`; ADMIN gains `sharing`, `share`, `unshare` and `sharePreview`. Every one refuses a token `NEEDS_BROWSER_SESSION`: agents never share.)* *(Amended October 20th 2026: DATA gains `makePrivate`, a row kept to its maker, and `undoOwn`, one of your own writes taken back by its receipt; READ+ gains `handled`, what BrainDog settled by itself today. The table's two counts are recounted from the routes.)* *(Amended October 15th 2026: DATA gains `pushTest`, a person ringing their own devices once to see that they ring.)* *(Amended October 15th 2026: DATA gains `actionRun`, Run now on one scheduled action.)* *(Amended October 15th 2026: DATA gains `giveHues` and READ+ gains `huesWanted`, a colour of its own for the things that have none, offered and pressed.)* *(Amended October 15th 2026: ADMIN gains `engineProbe`, the owner's press asking whether the model answers now.)* *(Amended October 15th 2026: ADMIN gains `setDecider`, the owner naming who decides one question.)* *(Amended October 15th 2026: ADMIN gains `doorSwitch`, one webhook door turned off without losing its address.)* *(Amended October 15th 2026: READ+ gains `flowGrammar`, what an automation may say, read from the kernel's own lists.)* *(Amended October 15th 2026: ADMIN gains `packsRemoved`, the add-ons taken out that a reinstall still puts back.)* *(Amended October 14th 2026: ADMIN gains `renameDevice`, the owner naming one machine anew by its handle.)* *(Amended October 14th 2026: ADMIN gains `shareable`, whether this host can make a read-only link to a page, and why not; it reads and changes nothing.)* *(Amended October 14th 2026: READ+ gains `exportPack`, the add-on made from what the record made of its own; it reads and changes nothing.)* *(Amended October 14th 2026: READ+ gains `imports`, every import made into the record and what it brought in; ADMIN gains `importAdopt`, the owner's own press saying an import is his or outside text. The adoption is his press and not a filed question.)* *(Amended October 14th 2026: READ+ gains `namedTwice`, which organisations and projects the record may hold twice, by both names; DATA gains `askNamedSame`, a person's press that puts one pair to Decide as a question signed by that person.)* *(Amended October 14th 2026: DATA gains `toolsSeen`, what one machine holds, matched by what each tool runs inside the record.)* *(Amended October 14th 2026: READ+ gains `skillsBehind`, which skills have lessons their text does not take in yet.)* *(Amended October 14th 2026: ADMIN gains `trustTakeBack`, the owner's "Ask again" that puts an agent back to asking on a kind it does on its own.)* *(Amended October 14th 2026: READ+ gains `inboxHints`, what each arrival in the Inbox is and who it is from, worked out by rules.)* *(Amended October 14th 2026: READ+ gains `learned`, what the record will not ask again because of an answer, each in one plain sentence.)* *(Amended October 14th 2026: READ+ gains `offered`, everything the caller may read in one read, which MCP's `resources/list` names.)* *(Amended October 14th 2026: DATA gains `askFoldTwice`, a person's press that files one question folding what a list holds twice; `heldTwice` also answers for a list that declares `same:`.)* *(Amended October 14th 2026: READ+ gains `scopeProposals`, where the things of each list that apply everywhere seem to belong; DATA gains `proposeScopes`, a person putting those moves to Decide.)* *(Amended October 14th 2026: READ+ gains `learningsTwice`, which lessons two projects each learned on their own; DATA gains `promoteLearnings`, a person asking on Decide whether one is kept once, for everywhere.)* *(Amended October 14th 2026: READ+ gains `textFaults`, every fault in the words of the record's pages and documents, each with its place and its fix.)* *(Amended October 14th 2026: no count moves. `inbox` takes `digest`, every state at once, and `id`, one arrival whole.)* *(Amended October 14th 2026: READ+ gains `learnings`, what the record's agents learned and still stands, in the order a session should read it.)* *(Amended October 14th 2026: no count moves. `briefing` answers `said` beside its cards, and `undo` puts a match back whole from the batch `matched` names.)* *(Amended October 14th 2026: READ+ gains `stale`, what went stale where you stand, each kind with how many and the one call that clears it.)* *(Amended October 14th 2026: READ+ gains `briefing`, what matters on the record now as a few cards, which Today draws first.)* *(Amended October 14th 2026: READ+ gains `exceptions`, what stopped on the record, each by its name with the day it stopped.)* *(Amended October 14th 2026: READ+ gains `about`, what one thing is and where it was seen, asked by its name.)* *(Amended October 14th 2026: READ+ gains `matched`, who the record matched on its own and still holds as one, each with the batch an Undo takes.)* *(Amended October 13th 2026: READ+ gains `heldTwice`, which people may be on the record twice, by their numbers in the list.)* *(Amended October 13th 2026: DATA gains `sameOne`, a person asking whether people they hold are one.)* *(Amended October 13th 2026: READ+ gains `engineReadings`.)* *(Amended October 13th 2026: READ+ gains `pageVersions`, the read a page's History in the source view is drawn from.)* *(Amended October 13th 2026: ADMIN gains `slashReads`, the one switch for Slash's background reading.)* *(Amended October 13th 2026: READ+ gains `trust`, each agent's standing on the ladder by kind.)* *(Amended October 13th 2026: ADMIN gains `setup`, the first run as one call where the browser ran a script of a dozen.)* *(Amended October 13th 2026: DATA gains `countBy`, the list screen's pills counted in one read where it asked `list` once a value.)* *(Amended October 9th 2026: DATA gains `capture`, one sentence kept as several entries under one batch; READ+ gains `pagesCensus` and `checkPaths`.)* *(Amended October 9th 2026: INTERNAL gains `doorHeard`; DATA's `heard` takes only the start hook's mark.)* *(Amended October 9th 2026: DATA's handoff also takes or drops another run's open step, each a call of its own; a page block may name the computed source handoffs.open beside signs; and a device grant may carry an eighth reach, shape, from kernel migration 33, for a scrambled shape copy and nothing else.)* *(Amended October 9th 2026: ADMIN gains `doorHealth`, the agent door's connections and seven signs, the owner's in a browser, its `min_cli` and the host's build handed in by the host because the record cannot import the door; `inbox` gains the repeats mark on an arrival and the `repeats: true` filter; a page block may name the computed source `signs`; and `metric` answers three more built-in figures, `signs-red`, `green-days` and `rates-age-days`.)* *(Amended October 9th 2026: DATA gains `heard` and `withdraw`; READ+ gains `doorSigns`, `faults` and `engineHealth`; ADMIN gains `retryFault`, so a fault in BrainDog is told to its owner and never asked as a question.)* *(Amended October 8th 2026: READ+ gains `inboxPatterns`, what each pattern did with what came in, which an agent reads as `braindog:inbox/patterns`; ADMIN gains `fileAsSecond`, the Inbox's "It is a second one".)* *(Amended October 8th 2026: DATA gains `end`, READ+ gains `signs`.)* *(Amended October 7th 2026: READ+ gains `understandPlan`, the dry half of `understand` as a read, so seeing what the walk would link no longer needs a browser; doing it still does.)* *(Amended October 6th 2026 for Undo on what Slash and agents changed: ADMIN gains `undoLook` and `keepLook`, an owner's in a browser for `setDeclaration`'s reason, since a look is a declaration, and `undo` and `undoRun`, a person's in a browser who can write every row the plan touches, which for a run means the owner. No token reaches any of the four (ADR-060), so an agent cannot quietly take back what it or another agent did, and a member's plan leaves out the rows they cannot read. ADMIN also gains `understand`, the nightly walk asked for by hand, no token reaching it.)* *(Amended September 28th 2026: DATA gains *(Amended October 9th 2026: DATA gains `beat`, a session's still-working mark that moves its run's last seen in place.)* *(Amended October 9th 2026: INTERNAL gains shapeGrant and shapeExport, the shape door's record half.)*
`createOwnToken`, `ownTokens` and `revokeOwnToken` (a colleague's own agent key), `renamePerson` and
`retypeField`; READ+ gains `tryPattern` and `anchorsFor` (the ingest pattern builder), `previewRetype`
and `quietHours`; ADMIN gains `fetchShared`, with `fetchUseCase` kept as its name for one release,
and `setQuietHours`. Each is written in its unit's file under `packages/record/src/methods/` with
its row under `packages/host/src/routes/`.)* *(Amended September 27th 2026: DATA gains `triage({ arrival })`, and `comment({ on, body, reply_to? })` and `resolveComment({ id, as, why })`, which are DATA because a comment changes no row and anybody who reads a thing may say something about it (`docs/20` §5); READ+ gains `comments({ on })`, `sharedPage`, which only a shared link's token reaches, and `checkAutomation`, `tryAutomation` and `automationVersions`; ADMIN gains `suspendMember`, `openShare`, `closeShare`, `shares`, `setAutomation` and `retryRun`; INTERNAL gains `unlockVault`. Each is written in its unit's file under `packages/record/src/methods/` with its row under `packages/host/src/routes/`.)* *(Amended September 26th 2026 for drawing a whole change: READ+ gains `previewChange({ to, rows?, about? })`, written in `packages/record/src/methods/preview-change.ts` with its row in `packages/host/src/routes/preview-change.ts`. It is READ+ beside `previewPage` because it draws what `page` would draw once the change landed, held block by block to the same caller, and keeps nothing; it is routed as a POST for `previewPage`'s reason. The count above is recounted from the table.)* *(Amended September 25th 2026 for who used a key or a tool: READ+ gains `usedBy({ spoken })`, the first method written in its own file under `packages/record/src/methods/` with its row under `packages/host/src/routes/`, where every method and row added from here on is written. It is READ+ because an agent asks it about the keys and tools its own project uses, and it names only runs, never a person.)* *(Amended September 24th 2026 for drawing a proposed page: READ+ gains `previewPage({ body })`, which Decide draws an agent's proposed page with before anybody accepts it. It is READ+ beside `page` because it draws what `page` draws, held block by block to the same caller; a `requires` naming a list the caller cannot read is refused in the sentence a list that is not there gets, so the method is no way to learn which lists a record keeps. It is routed as a POST although it writes nothing, as `scriptTry` is, because a page body is no query string.)* *(Amended September 24th 2026 for agents reading every figure: READ+ gains `figures`, the metric declarations a caller may read, held by the same check `metric` is, so an agent is not limited to the figures some page happens to draw.)* *(Amended September 24th 2026 for Web Push: READ+ gains `subscribePush({ endpoint, expirationTime?, keys })` and `unsubscribePush({ endpoint })`, a person's own, kept in the `local` table `push_sub` and erased with the person. They are READ+ and not DATA because they are verbs over no row of the record, as `boot` and `whoami` are, and they are routed as POSTs because each writes. An urgent notice or a digest's push channel then queues one `notify.push` per owner subscription, `{ sub: { id } }`, and a push service's 404 or 410 deletes that subscription through the ack (51 §5).)* *(Amended September 22nd 2026 for listing scripts: READ+ gains `scripts`, which `braindog scripts list` prints. Nothing listed a script before it, since `actions` stops at pull, call and poll, so the id `resumeScript` takes was only in the event that paused one.)* *(Amended September 22nd 2026 for trying a script: READ+ gains `scriptTry({ body, input? })`, which brings the six rows to a hundred and twelve; they already summed to a hundred and eleven under the heading "Hundred methods", so the heading names no number now. It is READ+ and not ADMIN because ADMIN admits no token and an agent is the caller it is for; it is routed as a POST although it writes nothing to the record, because it spends a run of the plan and may send a POST of its own to a provider.)* *(Amended September 22nd 2026 for automations: READ+ gains `automations({ rule? })`, the list the canvas and `braindog:automations` draw, or one automation with its last ten runs for `braindog:automation/<id>`; ADMIN gains `automationRun({ rule })` and `cancelRun({ run })`, both an owner's in a browser as `installPack` is, because a run writes rows as the rule and notifies. No method is added for the dry run: `dryRun` answers a body that runs as a run with what starts it and each step as a line, beside the rows it already walked for a body that runs inside the write, and MCP puts that answer on `propose`'s for a rule change.)* *(Amended September 22nd 2026 for scripts: ADMIN gains `resumeScript({ script })`, an owner's in a browser, which starts a script paused by three refused runs in a row again, now. It is guarded as `resumeAction` is and for its reason: the same source on the same input fails the same way, so nothing restarts one on its own, and three more refused runs pause it again.)* *(Amended September 22nd 2026 for the generic doors screen: ADMIN gains `doors`, the live webhook ingests and whether each holds a token, never a digest.)* *(Amended September 22nd 2026 for a door a phone can post to: ADMIN gains `ingestMint({ ingest })`, an owner's in a browser, so a webhook ingest declaring `verify: { kind: path }` has a token its sender puts in the URL, `/in/webhook/<record>/<ingest>/<token>`; the record keeps only the digest, and retiring the ingest or dropping its `verify:` forgets it. Amended September 17th 2026 for clearing the example rows: ADMIN gains `examples` and `clearExamples`, an owner's in a browser, so a record set up with examples beside imported or typed rows can be cleared of the ones nobody touched in one gesture. Amended September 17th 2026 for a first plan from a model: ADMIN gains `slashForm({ usecase, said })`, an owner's in a browser, a separate path from Slash's look at use, which waits two weeks; an `arrange` body may carry `rows` with links to earlier rows by position, which only Slash files. Amended September 17th 2026 for Slash looking on its own: ADMIN gains `slashDaily({ on })`, an owner's in a browser, kept as Slash's own pref and not an event; a host ticks the record's `slashTick`, which files through `slashPropose`'s path once a day. Amended September 17th 2026 for a rail that follows a person: DATA gains `setPref`, their own nav order and the pages hidden from it, kept per person rather than per device (`19 §3`, `50 §10`). Recounted September 16th 2026 from the six rows above rather than by adding to the previous total. Amended September 17th 2026 for Slash reading how a record is used: ADMIN gains `slash` and `slashPropose`, both an owner's in a browser, because the reading covers every list; a model a host configures drafts behind a port and never writes. Amended September 17th 2026 for installing a use case from an address: ADMIN gains `fetchUseCase({ url })`, so a site that sends no CORS header can still be read; a refused address is `PULL_ORIGIN_REFUSED`, the code a scheduled action's refused origin already carries, and `exportUseCase` takes `step`, `nav`, `signals` and `skills`. Amended September 17th 2026 for sharing a use case as a file: READ+ gains `exportUseCase`, and ADMIN gains `planUseCase({ doc | text, modules? })`, which reads a shared file through `readShared` (size, credentials, the format, block kinds) and plans the modules it needs and the pack it carries in order, writing nothing; installing one is `installPack`, a document at a time, with the plan's own hash and calls-out lines, so a shared use case has no door of its own. Amended September 17th 2026 for projects that report their own numbers: DATA gains `report`, and ADMIN gains `createReportKey({ register, fixed?, stamp?, name?, days? })` and `reportKeys`. A report key is an ordinary `write` token whose label, `report:` and a JSON binding, names one register, the fields every row it sends carries and a field stamped with the moment a row arrives; only `createReportKey` writes such a label, and `createToken` refuses one. The record reads the label from the token row on every call, so every other method refuses the key `FORBIDDEN` whichever host built the context, and no fourth token scope is added. Amended September 17th 2026 for arranging a record by proposal: READ+ gains `arrangement({ page?, grammar? })`, and no method is added to ADMIN. Installing a pack, turning one on or off and changing its settings stay an owner's in a browser; an agent asks for them with `propose`, whose `pack`, `settings` and `arrange` bodies are applied by `decide` when an owner accepts one. Amended September 16th 2026 for saved views, which stop being pages: READ+ gains `views({ register? })` and `view({ register, id })`, and ADMIN gains `saveView` and `retireView`. `02 §5` says a saved view IS a named predicate on its register, and the record now holds one as that — a register, a filter, the text that was searched for, an order and the columns kept — where the app had been saving a page declaration through `setDeclaration` because the kernel had nowhere to put a view. The two reads are READ+ rather than DATA because DATA's twelve are verbs over rows and a view holds none: it is a saved question about a register, beside `schema` and `page`, and MCP exposes it as a resource. The two writes are ADMIN because a saved view goes on the list for everybody who opens it, which is the argument `setDeclaration` already makes, and is the door the gesture already went through. Amended September 16th 2026 for what points at a row: READ+ gains `backlinks({ register, seq, limit?, cursor? })`, the rows of other registers whose `ref` fields hold this row's id, grouped by the field that holds it, newest first, `limit` 20 and at most 200 rows across the whole answer, and a cursor naming the relation it stopped in as well as the position. A `list<ref>` is left out: a list of references is a JSON array, so answering it is a scan rather than an equality one index can serve. Amended September 16th 2026 for inviting somebody by address: ADMIN gains `invitations`, every invitation still waiting and never its link, and `revokeInvite({ id })`, which withdraws one; `invite` takes an address where it took a person and mints a single-use link, good for 24 hours, stored only as a SHA-256 hash and handed back once. No host mails it: the owner copies it out of Settings and sends it. `POST /auth/invite` spends it once, after the invitee is signed in, through INTERNAL `acceptInvite`. And KEYCHAIN's `revokeGrant` is routed at last, now that both hosts prove a browser session from the session row: `openGrant` and `bindGrant` stay unrouted, because they carry the sealed shape a browser can neither make nor open. Amended September 16th 2026 for putting a key in from the app: no method is added, and INTERNAL's `depositGrant` and `openForGrant` gain a second caller, a browser session, through the host's own `/api/keys/put` and `/api/keys/open`. That is where the sealing a screen cannot do happens, which is why `openGrant` and `bindGrant` are still not routed. Amended September 16th 2026 for backups you can take and use: ADMIN gains `snapshots`, the copies a host keeps of the whole record, newest first, each with when it was taken and its size, which is the list `restore`'s `bookmark` names one of. A self-host keeps them as `VACUUM INTO` files beside the record (53 §5.4); a host that keeps none, the Worker today, refuses `snapshot`, `snapshots` and `restore` with `NOT_IN_THIS_BUILD`, and `deleteRecord` the same until its sealed final copy is wired. Amended September 16th 2026 for the Inbox's two gestures: ADMIN gains `fileArrival({ id, register, fields? })`, one arrival filed as a row through the ordinary write path with the arrival marked `matched` in the same batch, and `archiveArrival({ id })`, the arrival marked `ignored` with its bytes kept; both an owner's on the whole record, as `inbox` is, and both the same answer a second time. Amended September 15th 2026 for the Inbox screen: READ+ gains `inbox({ cursor?, limit? })`, what arrived and no rule filed, newest first a page at a time, the list `boot`'s `counts.inbox` counts, and an owner's alone for the same reason that count is. Amended September 11th 2026 for the agent path: DATA gains `attach` and `handoff`, and READ+'s `learningsFor` becomes `context`, which carries the learnings for where a session stands along with everything else that applies there. Amended September 15th 2026: DATA gains `meet`. Amended September 15th 2026 for modularity: ADMIN gains `disablePack` and `enablePack`. Amended September 15th 2026 for signing a machine in: ADMIN gains `listDevices` and `revokeDevice`, and INTERNAL gains `vaultGrant`. Amended September 15th 2026 for the key doors: INTERNAL gains `depositGrant` and `openForGrant`. Amended September 15th 2026 for pack settings: READ+ gains `packConfig`, and ADMIN gains `setPackConfig`, which changes a pack's settings and reinstalls nothing. Amended September 15th 2026 for scheduled actions: ADMIN gains `resumeAction({ ingest })`, which starts a paused `pull`, `call` or `poll` again, now; a 401 or a 403 pauses one and nothing else restarts it. Amended September 15th 2026 for the list of actions: READ+ gains `actions`, each scheduled action's state, last run, next run and this month's counts from its own events; and a key the host cannot open, `WRONG_KEY`, pauses an action the way a 401 does. Amended September 15th 2026 for the shell's reads: READ+ gains `recentHistory({ cursor?, limit? })`, the record's log newest first a page at a time; `whatsNew` answers newest first, so a first screen shows the latest sixty rather than the oldest; and `boot` carries what the layout draws, the record's name, the caller, their pages and the two counts on the rail.)* *An earlier draft counted forty-four, and six specs then counted six
different totals from it; this is the enumeration, and the router test counts it.* **Every method is
`(args, ctx: CallContext) => Promise<Result<T>>`** — `ok` with the value and the record version, or `refusals`, or
`conflict` — and every argument is one object, so `ackOutbox` takes `{ id, state, result?, error? }` and never a
positional list. Over HTTP the envelope returns **unchanged** and the status is one function of it, `httpStatus(result)`:
a refusal is **422** `{ refusals }`, a conflict is **409** `{ conflict: { version, current, actor } }`, a bearer with no
grant at a browser-only group is **403** `NEEDS_BROWSER_SESSION`. The argument objects, `CallContext` — whose
`principal.kind` is one of six, `person · token · runner · share · system · slash`, with `op` naming an operation
grant — `Result<T>`, the suggestion bodies and the pagination cursors are [33-CONTRACTS](33-CONTRACTS.md) §2; the route
table (`POST /api/<method>`, dispatched by property lookup on the api object; the GET aliases; `/mcp`;
`/in/webhook/<ingest-id>`) is [33-CONTRACTS](33-CONTRACTS.md) §4. Neither host re-declares any of this: the route
table as data, `httpStatus` and context resolution live in one platform-neutral package both hosts import
([31-STACK](31-STACK.md) §2).

**The file store sits beside the methods, not among them.** `PUT /api/files/<sha256>` keeps a file at the address its
hash makes: the host hashes the body again and refuses a difference with **422** `CHECKSUM_MISMATCH`, writing nothing.
`PUT /api/files` stays, the host naming the hash. `GET /api/files/<sha256>` serves the file with the sandbox policy,
`nosniff` and `noindex`, and `GET /api/files/` is **405** ([51-SPEC-WORKER](51-SPEC-WORKER.md) §5.5).

**The rule that keeps it honest:** *if a screen needs something outside DATA and READ+, it is either a
browser-session group — KEYCHAIN, JOBS, ADMIN — or it is a design error.* There is no third case, and the router
asserts it — every route declares its group, and a CI test walks the router and fails on a route with no group, and
on an ADMIN route that admits a `token` principal without an operation grant whose reach names it. The **operation
grant** is the one door a CLI has into ADMIN, and it is the owner's approval of one command — `pack install`,
`export`, `import`, `token create`, `token revoke` — after seeing its summary (the plan diff, the export scope, the
token's scope): single-use, ten minutes, recorded in `device_grant.reach` and an `access.grant` event, and the bearer
then reaches exactly that method once with `ctx.op` set (§10; [12-SECURITY](12-SECURITY.md) §3; 33 §4).
*An earlier draft had four groups and a token scope `admin`; `openGrant`, the job routes and `import` belonged to
none of them, so the CI test could not have passed.*

---

## 6 · The refusal model

Every document demands refusals that name the field and what was expected. That only stays true if
there is one shape:

```
Refusal {
  code:   'FIELD_TYPE_UNKNOWN'                    -- enumerated, stable, greppable
  at:     'ingest.hsbc_sms.extract.due.date.format'  -- a path into the thing being validated
  found:  'currency'
  wanted: 'one of the sixteen value types'
  fix:    "Did you mean 'money'?"                 -- one sentence, imperative
}
```

A code is `UPPER_SNAKE`, always. The lower-case forms that appear in other documents — `already_known`,
`wrong_key`, `needs_browser_session`, `human_only` — were the earlier draft, and the table below is the only
list. The storage adapter has its **own** closed vocabulary (`TOO_MANY_PARAMS` and twelve more, §13); it is a
separate list because it names what the *driver* refused, not what the *format* refused. *None of the thirteen
reaches a caller as a `code`* (37 §6): a host answers a `SqlError` as a 500 `INTERNAL`, and the one driver fact a caller
must hear, a SQLite without FTS5, reaches them as `RECORD_UNAVAILABLE` below. So a code on §13's list is not an invented
refusal code, and `INT_OUT_OF_RANGE`, which is on both, is this table's.

**One vocabulary, four renderings** — the same pattern as one grammar, seven consumers:

| Surface | Becomes |
|---|---|
| CLI | `register.invoices.fields[4].type 'currency' — did you mean 'money'?` |
| HTTP | the `Result` envelope, unchanged, and a status that is one function of it — `httpStatus(result)`, shared by both hosts: `422` for any refusal the exceptions below do not name (`PLAN_STALE` and `IMPORT_NOT_EMPTY` included — refusals, never 409); `409` for a `conflict` (`VERSION_STALE`; `WRONG_KEY` per [12-SECURITY](12-SECURITY.md) §6.1); `401` with an empty body for `UNAUTHORIZED`; `403` with the envelope for `FORBIDDEN` and `NEEDS_BROWSER_SESSION`; `429` with `Retry-After` for `RATE_LIMITED`; `404` for `ROUTE_UNKNOWN` and `400` for `BODY_MALFORMED`, which are the router's own and no method returns, and `404` with the envelope for `page`'s `PAGE_UNKNOWN`, a page that is not there (the code tells it from a missing route; `PAGE_UNKNOWN` on any other method stays `422`, amended 31 Oct 2026), and for `metric`'s `METRIC_UNKNOWN` at `metric`, a figure that is not there (one that walks from a missing figure stays `422`); `501` for `NOT_IN_THIS_BUILD`; `503` for `SCHEMA_MISMATCH`, `SCHEMA_NEWER` and `RECORD_UNAVAILABLE`. `X-Request-Id` is echoed |
| MCP | an error result carrying `code` and `fix`, so **the refusal teaches the agent** — [10-MCP](10-MCP.md) §7 rule 4. A call outside its published schema is the protocol's own `-32602`, `message` the fix and `data` `{ at, found, wanted, fix }` — a vocabulary, not a code (below) |
| UI | the sentence, next to the field, plus in the summary — [06-PAGES](06-PAGES.md) §8 |

*The HTTP row said `422` for **any** refusal and then listed five exceptions, which is a sentence that contradicts
itself and — worse — contradicted the tree, where `httpStatus`'s table had grown four more. The exceptions are
enumerated because each is a different INSTRUCTION: 401 says the credential is wrong, 403 that it is the wrong kind
and retrying will never work, 404 that the method does not exist, 400 that the body was never read, 501 that the
declaration is right and the build is behind, 503 that a deploy or an un-suspension fixes it, 409 that somebody got
there first. Everything else is a value the caller can fix, and that is the 422. A code outside §6's table is a code
outside this map: `RECORD_UNAVAILABLE` answered 422 for two months for exactly that reason (53).*

Two refusal codes exist because of corruption the predecessor shipped, and they **refuse rather than
repair**: `TEXT_JSON_QUOTED`, a string value that arrived wrapped in its own quotes, and
`TEXT_ESCAPED_NEWLINE`, a string containing a literal backslash-n and no real newline. Both reached
the predecessor's record on 2026-08-30 and were invisible on read-back. Repairing would have hidden
the caller's bug; refusing names it. A value that reads whole as a Windows path (`C:\Work\notes`) is
exempt from the second: a real export was refused on two agent runs' `cwd` for it, and "send a real
newline" is a repair nobody can apply to a path. The exemption and the false negatives it costs are
in 41 §5.4 step 3 and its `ponytail:` note.

### The codes

One hundred and thirty-six, counted, in nine families — 54 pack and declaration · 14 grammar · 24 write path · 12 auth and
keychain · 8 format and lifecycle · 2 dialect · 6 slash · 12 connector · 4 host and client. Every fixture lives at
`fixtures/refusals/<name>.yaml`; the
name is the code in kebab-case, and each fixture is keyed by the `via` that raises it — `install`, `lint`, `where`,
`write`, `rpc` and the rest; the split per `via` is the fixtures spec's to count (40 §6), not this table's. *An
earlier draft called the code "enumerated" and enumerated three; the next said seventy-five, and six specs then each
added their own to seventy-five, so the corpus briefly held six totals. Their twenty-four proposals are all accepted
here, once.*

*Ninety-nine became a hundred and twelve on 2026-09-08, and the thirteen are named in the rows they sit in. The
occasion was an audit against the tree rather than a wish-list: `refusals.mjs` found **twenty-four codes the source
emits that this table does not have** — twenty-six once its pattern was widened to see past a ternary — and each of the
twenty-six had to be sorted by hand, because the difference between a missing concept, a synonym and a placeholder is a
judgement about a call site and not a rename.*

***Six were renamed onto codes that already existed here**, and that is the repair this table prefers.
`WHERE_UNSUPPORTED` · `WHERE_OPERATOR_UNSUPPORTED` · `OPERATOR_UNSUPPORTED` and a leaf carrying no test at all are five
spellings of `MATCH_OP_UNSUPPORTED`, whose row was already written as the general case rather than `inbox_raw`'s.
`WHERE_MALFORMED` was three facts under one word and is `VALUE_MALFORMED` for an empty `in` and a one-sided `between`,
`RELATIVE_LITERAL_UNKNOWN` for `due before soon`, `MATCH_OP_UNSUPPORTED` for a leaf with no operator.
`RECORD_NOT_EMPTY` is `IMPORT_NOT_EMPTY`. `PERSON_REQUIRED` is `FORBIDDEN`, with the remedy in the sentence where the
other three facts that code carries already keep theirs. **A registry that grows whenever somebody needs a word is not
a closed list**, and these went away by being read rather than by being admitted.*

***Five more were renamed onto three of the new codes**, because the name was wrong about its own subject rather than
redundant: `SCHEMA_UNAVAILABLE` involved no schema; `MALFORMED_FILE` and `IMPORT_FAILED` were two names for one answer
to the caller; `UNIMPLEMENTED` and `NOT_IMPLEMENTED` named nothing at all — not what is unimplemented, not by whom, not
what to do about it, which is a `fix` sentence with a shouty prefix.*

***Ten kept their names and were admitted**, having no equivalent here. They cluster: **six things a declaration can
name and this record has not got** (a page, a metric, a source, a factor table, a factor, a declaration); **three for a
ninth family**, the surface every caller actually talks to; and `REF_UNKNOWN`, which was so nearly a synonym of
`VALUE_MALFORMED` that it WAS renamed onto it — until `declare`'s rule linter turned out to branch on it, which is the
one test that settles whether two refusals are one. Not whether the sentences read alike: whether a caller has to tell
them apart.*

*The ninth family is the hole this audit is proudest of finding. `30 §6` was written about what a record refuses and
never about the boundary a request arrives through, so both hosts and the client each minted a word — `ROUTE_UNKNOWN`,
`BODY_MALFORMED`, `UNREACHABLE`, and a code named after a schema for a record with no owner. That last one, being in no
registry, was in no row of `httpStatus`'s table either, and answered **422** where `49 §5.1` step 5.3 says 503. A code
outside this table is a code outside the status map, which is the concrete cost of an open list and not a stylistic
one.*

*Seven names are still outside, and `refusals.mjs` holds the number as a budget that may only go down.
`DECLARATION_INVALID` is 32 of them and a project of its own; `INTERNAL` is a crash rather than a refusal and is
deliberately not admitted (below); `RECORD_NOT_EMPTY`, `WHERE_OPERATOR_UNSUPPORTED` and `SCOPE_INSUFFICIENT` each have
one straggler site the same change could not reach; and `NOPE` and `SOMETHING_NOBODY_MAPPED` live only in tests, the
second of them as the SUBJECT of its test — "a code nobody enumerated is still a 422" — so replacing it would delete
the assertion. Two of the seven should therefore never go, and the honest floor is two rather than zero.*

*Four documents quoted the old total and were amended in the revision after this one —
[04-PACKS](04-PACKS.md) §5's closing line, [16-DECISIONS](16-DECISIONS.md)'s ADR on the enumeration,
[18-BUILD-TOOLKIT](18-BUILD-TOOLKIT.md) §6's fixture row and [33-CONTRACTS](33-CONTRACTS.md) §8's
`refusal-fixtures` row. Two of them now cite the count instead of repeating it, which is the better repair: this
table is the home, and a citation that carries the number is a fifth place for it to be wrong. A corpus that
briefly held six totals is what the paragraph above is about, and repeating a count is how it starts.*

The type `Refusal` (with `RefusalCode`) is a type-only export of `@braindog/ports`, the lowest shared package,
because `where` raises one and sits below the kernel; **this table stays the list's home**, and every package
imports the type — none re-declares it. Two things that look like codes are not: JSON-RPC's `-32602` (a call outside
its published schema, [10-MCP](10-MCP.md) §3) and the `Http` port's four error names — `PrivateRange` · `TooLarge` ·
`Timeout` · `Network` ([33-CONTRACTS](33-CONTRACTS.md) §1) — are **vocabularies**, mapped onto a code where one
applies (`PULL_ORIGIN_REFUSED`) and otherwise never on the wire as a refusal. The adapter's own thirteen (§13) are
the third list, and it stays thirteen.

**Pack and declaration** — refused at install, by `declare`. The first twenty-four are [04-PACKS](04-PACKS.md) §5's
rows, in order; the nine after them are the 2026-09-02 review's; the eight after those are the second revision's; the six after
those are the 2026-09-08 audit's; the three after those are the 2026-09-15 pack lifecycle's, turning a pack off and on; the last two are the 2026-09-15 pack settings', a setting of a type no setting takes and a list nothing holds. Seven
write-path codes are raised here too, for the same fact in a declaration's seed or default — `FIELD_UNKNOWN`
`REQUIRED_MISSING` `ENUM_VALUE_UNKNOWN` `OUT_OF_BOUNDS` `REGISTER_UNKNOWN` `INT_OUT_OF_RANGE` `VALUE_MALFORMED` — one
code, two moments (42).

*The family is named for what its codes are ABOUT and not for the moment they are raised, which is what makes room for
the last six: `TRANSITION_ILLEGAL` has said "at install; §4 step 5 at write — one code, two moments" since the first
draft. A page read at 7am and a metric asked for by a `stat` cell are both a caller naming a DECLARATION this record
has not got, which is this family's subject; filing them under the write path — where `REGISTER_UNKNOWN`, their exact
analogue for a register, already sits — would put a read-only refusal in a family whose first line is "refused before
any row is written".*

| Code | Raised where | Fixture |
|---|---|---|
| `KIND_UNKNOWN` | 04 §5 | `kind-unknown` |
| `FIELD_TYPE_UNKNOWN` | 04 §5 | `field-type-unknown` |
| `FIELDS_OVER_CAP` | 04 §5; the caps table, 02 §5 | `fields-over-cap` |
| `INDEXES_OVER_CAP` | 04 §5; 02 §5 | `indexes-over-cap` |
| `PATTERN_OVER_CAP` | 04 §5; the 40-byte cap, 02 §6 — measured on the **escaped** `starts`/`ends` literal, and on a `matches` phrase over 200 bytes (38) | `pattern-over-cap` |
| `METRIC_NEEDS_TARGET_OR_WINDOW` | 04 §5; 08 §2 | `metric-needs-target-or-window` |
| `MIXED_CURRENCY` | 04 §5; 08 §4 | `mixed-currency` |
| `CONTRAST_FLOOR` | 04 §5; 28 §4.4 | `contrast-floor` |
| `REQUIRED_ON_POPULATED` | 04 §5; 02 §7 | `required-on-populated` |
| `ID_RENAMED` | 04 §5; 02 §2 | `id-renamed` |
| `COLOUR_OUTSIDE_THEME` | 04 §5; 13 §6 | `colour-outside-theme` |
| `DEPENDENCY_UNRESOLVED` | 04 §5; 04 §2 | `dependency-unresolved` |
| `CREATE_UNBOUNDED` | 04 §5; 07 §6.1 | `create-unbounded` |
| `CREATE_OVER_BOUND` | 04 §5; 07 §6.1 | `create-over-bound` |
| `CREATE_FOREIGN_REGISTER` | 04 §5; 07 §6.1 | `create-foreign-register` |
| `TRANSITION_ILLEGAL` | 04 §5 at install; §4 step 5 at write — one code, two moments | `transition-illegal` |
| `GROUP_BY_TWICE` | 04 §5; 08 §2 | `group-by-twice` |
| `GROUP_BY_CARDINALITY` | 04 §5; 08 §2 | `group-by-cardinality` |
| `RATIO_MIXED_SOURCE` | 04 §5; 08 §2.2 | `ratio-mixed-source` |
| `RATIO_MIXED_CURRENCY` | 04 §5; 08 §2.2 | `ratio-mixed-currency` |
| `QUANTITY_MIXED_UNIT` | 04 §5; 08 §2.2 | `quantity-mixed-unit` |
| `STATE_NOT_ENUM` | 04 §5; 02 §1 | `state-not-enum` |
| `FORMAT_OUT_OF_RANGE` | 04 §5; `requires.format` against `user_version`, §11 | `format-out-of-range` |
| `PRIMITIVES_OUT_OF_RANGE` | 04 §5; `requires.primitives` against `PRIMITIVES_VERSION`, 31 §6 | `primitives-out-of-range` |
| `BAND_EDGES_MISMATCH` | `derive: band` — n edges need n+1 `values:`, 02 §5; 34 §1 | `band-edges-mismatch` |
| `SERIES_HAS_NO_TEXT` | `contains`/`matches`/`starts`/`ends`/`near` over a `series: true` register, 02 §5 | `series-has-no-text` |
| `REQUIRED_WHEN_OP_UNSUPPORTED` | `required_when:` with an operator outside its list, 02 §5 | `required-when-op-unsupported` |
| `PREDICATE_CYCLE` | a named predicate that expands to itself, 02 §5–§6 | `predicate-cycle` |
| `SEQ_PREFIX_TAKEN` | a non-`#` `seq_prefix` already held by an installed register, 02 §2; 34 §4 | `seq-prefix-taken` |
| `SEARCH_FIELD_TYPE` | `search:` naming a field outside `text document enum url email list<text>`, §1 | `search-field-type` |
| `FIELD_TYPE_CHANGED` | a declaration version changing a field's type — retire it and add a new field, 02 §7 | `field-type-changed` |
| `PROVIDES_MISMATCH` | a manifest `provides` that is not the declarations' `kind.id` set, 04 §2 | `provides-mismatch` |
| `PLAN_STALE` | `installPack(pack, planHash)` after the record moved, or with `approve` lines that are not the plan's, §5 — a refusal, 422 | `plan-stale` |
| `THEME_VALUE_INVALID` | a theme dialect value outside [28-THEMING](28-THEMING.md) §1's closure — a colour off the grammar, an alpha, an achromatic seed (39) | `theme-value-invalid` |
| `INTENT_INSEPARABLE` | no palette keeps two intents apart by the ΔE floor after dichromat simulation, 28 §3 — searched, never repaired (39) | `intent-inseparable` |
| `THEME_LADDER_ORDER` | a surface or elevation ladder out of order — `sm ≤ md ≤ lg`, L monotonic, 28 §3 (39) | `theme-ladder-order` |
| `PACK_MALFORMED` | not a well-formed pack: a YAML fault, two kinds or two ids in one declaration, a structural rule of 04 §4 (42) | `pack-malformed` |
| `PROVIDES_CONFLICT` | an id another installed pack provides; 04 §2 promised the refusal and coded nothing (42); also a `register.session` declared by anybody but the kernel, whose migration is its one writer (41 §5.6) | `provides-conflict` |
| `REMOTE_ASSET` | a pack asset fetched from elsewhere — a URL, `data:`, a script — 04 §7's enumeration; the one name for the banned-token refusal (42) | `remote-asset` |
| `SECRET_IN_PACK` | a credential inside a pack — 25 §7's enumeration (42) | `secret-in-pack` |
| `WOULD_ORPHAN` | an install that would retire a register with rows under it — 04 §5's downgrade rule; no `--force` in v1 (42) | `would-orphan` |
| `DECLARATION_UNKNOWN` | `retire(ids)` naming nothing installed — the one refusal `declare` had no code for, and it was reaching callers as a word invented on the line (53) | `declaration-unknown` |
| `PAGE_UNKNOWN` | a slug no page declaration resolves to, 06 §2 — `allowed` carries the slugs that do, so the answer ends the search rather than starting one (53) | `page-unknown` |
| `METRIC_UNKNOWN` | a `stat` cell, a digest section or `record.metric` naming a metric nobody declared, 08 §2 — **and a metric over a register the caller cannot reach, said in the same words**, because answering `FORBIDDEN` for one that exists and this for one that does not is an enumeration oracle, one probe per guess (45 §13) | `metric-unknown` |
| `SOURCE_UNKNOWN` | a `source:` outside the namespaces this record reads — a metric's, a page block's, a digest section's, 08 §2 — as distinct from `REGISTER_UNKNOWN`, which is the namespace being right and the register not installed; both are raised two lines apart in `metrics.ts` and they are two repairs (53) | `source-unknown` |
| `LOOKUP_UNKNOWN` | a `product:` naming a factor table the metric does not carry under its own `lookups`, 08 §2.5; refused at install since 2026-09-16. Fix the name, or add the table | `lookup-unknown` |
| `LOOKUP_MISSING` | the factor table is right and does not cover the data: a `by` value present in the rows with no factor for it, 08 §2.5. **Two codes and not one**, because a row multiplied by one is a wrong number rather than a missing one — the failure that came out 9.25 times too low — and "fix the name" and "add a factor for `yearly`" go to different people; `allowed` lists the values the table does know (53) | `lookup-missing` |
| `PACK_DISABLED` | an install or upgrade naming a pack that is disabled, 04 §4; enable it first, so an upgrade's diff is taken against declarations that are active (41 §5.6) | `pack-disabled` |
| `PACK_REQUIRED` | disabling a pack another active pack leans on, by a field's `to:`, a `register.<id>` it names, or its manifest's `requires.packs`; `allowed` names the dependents, which `alsoDisable` turns off in the same call (41 §5.6) | `pack-required` |
| `SCOPES_IN_USE` | disabling the pack whose register declares `scopes:` while a field left on still has `scope:` pointing at its projects, 02 §5 (41 §5.6) | `scopes-in-use` |
| `CONFIG_TYPE_UNSUPPORTED` | a manifest's `config:` setting whose type is not text, enum, bool, money, day, duration, number or list; a ref, a secret and a file are refused on purpose, 04 §2 (41 §5.7) | `config-type-unsupported` |
| `REGISTER_UNRESOLVED` | planning or installing a pack whose field `to:`, page `requires` or block source, or metric `source` names a list the record does not hold and the pack does not declare; the sentence names the first-party pack that declares it when there is one, 04 §5 (42 §6) | `register-unresolved` |
| `PACK_OVER_CAP` | a shared use-case file larger than a shared use case may be (256 KB), refused before it is parsed | `pack-over-cap` |
| `VIEW_UNKNOWN` | `view` or `retireView` naming a saved view the register has not got, §5 — `allowed` carries the names it does have, so the answer ends the search rather than starting one, as `PAGE_UNKNOWN` does with its slugs. A seventh of the same kind as the six above it, and here for the same reason: the family is named for what its codes are about, and a saved view is a thing the record was told to hold (2026-09-16) | `view-unknown` |

**Grammar** — refused when a `where:`, an `extract:` form or a connector path is compiled or validated
([34-GRAMMARS](34-GRAMMARS.md) §1, §3, §6); three of the four at the end are raised at install, by `declare`, before
`extract` ever sees the declaration (42, 43); the last is raised by the sentence parser and read by `declare` (53):

| Code | Raised where | Fixture |
|---|---|---|
| `PREDICATE_TOO_DEEP` | a fourth nesting level, §7 | `predicate-too-deep` |
| `VIA_TWICE` | a second `via:` hop, 02 §6 | `via-twice` |
| `VIA_NESTED_SUBQUERY` | a `via:` leaf carrying `matches` or `has`, §7 | `via-nested-subquery` |
| `MONEY_LITERAL_NEEDS_CURRENCY` | a money literal without `currency`, §7 | `money-literal-needs-currency` |
| `QUANTITY_LITERAL_NEEDS_UNIT` | a quantity literal without `unit`, §7 | `quantity-literal-needs-unit` |
| `MATCH_FIELD_UNKNOWN` | a `match:` field outside `from to subject body channel state ts`, 02 §6 | `match-field-unknown` |
| `MATCH_OP_UNSUPPORTED` | the one code for *this test cannot apply here*: `via has near matches starts ends` on the `inbox_raw` backend (02 §6), an operator outside its type's set, `lacks` on a non-list, `near` anywhere but the last leaf (38) | `match-op-unsupported` |
| `CONTAINS_TOO_LONG` | a `contains` literal over 40 bytes, §7 | `contains-too-long` |
| `RELATIVE_LITERAL_UNKNOWN` | a temporal literal outside the anchors and offsets, §7 | `relative-literal-unknown` |
| `RELATIVE_UNIT_FOR_DAY` | an `h` or minute offset against a `day` field, §7 — raised by `declare` on a `remind:`, which the compiler cannot reach, so the fixture has a producer (38) | `relative-unit-for-day` |
| `EXTRACTOR_UNKNOWN` | an `extract:` form key outside the thirteen, 34 §3 (43) | `extractor-unknown` |
| `DATE_FORMAT_INVALID` | a `format:` outside its token rules, on a `date` extractor form or on a `map:` day, 34 §3 (43) | `date-format-invalid` |
| `PATH_INVALID` | a response path outside the one `Path` grammar that serves `map`, `read`, `probe`, `expect` and `page.from`, 25 §3 (43) | `path-invalid` |
| `REF_UNKNOWN` | a `ref` written by name against a register that holds no row of that name — `thing is Kiln`, 34 §1.1's spoken form. **It is not `VALUE_MALFORMED`**, though that row already reads "an unresolvable id or spoken reference", and the test is not whether the sentences read alike but whether a caller has to tell them apart: `declare` lints every rule's `when:` and survives this refusal and no other, because a name that resolves to nothing today may be written tomorrow while a grammar fault is a fault whenever it is read. Merge them and the exemption swallows a real shape error and installs a rule that fires on nothing, in silence, for ever. Nor is it `REF_REGISTER_MISMATCH`, which resolves to a row of the wrong register — repoint that one; this one has nothing to point at (53) | `ref-unknown` |

**Write path** — refused before any row is written (§4); the step is named:

| Code | Raised where | Fixture |
|---|---|---|
| `REGISTER_UNKNOWN` | step 1 — a register not installed, or a bare `#7` with no register before it (41) | `register-unknown` |
| `ROW_UNKNOWN` | MCP `get`, `history` and `governance` by id, and a prefixed id that names no row: deleted, never there, or in a list the caller cannot open, all said in one sentence so a hidden row reads like a missing one (10 §3) | `row-unknown` |
| `FIELD_UNKNOWN` | step 1 — also a reserved `_` field, an unknown `predicate:` name, a `via:` target that is not installed; the path and `fix` disambiguate (38, 41) | `field-unknown` |
| `ROW_LOCKED` | step 2, `immutable_when:` | `row-locked` |
| `HUMAN_ONLY` | step 2b, a mechanism actor (`rule:` · `ingest:`) on a person-pinned field — never a token: the literal reading would forbid an agent editing any field a person ever created (41) | `human-only` |
| `TEXT_JSON_QUOTED` | step 3 | `text-json-quoted` |
| `TEXT_ESCAPED_NEWLINE` | step 3 | `text-escaped-newline` |
| `INT_OUT_OF_RANGE` | step 3 — the same code the adapter throws for the same fact (§13) | `int-out-of-range` |
| `VALUE_MALFORMED` | step 3 — a value outside its type's shape that cannot be coerced, an unresolvable id or spoken reference, a non-grant `secret`, an erase subject under three characters; at install too, for a seed (41, 42) | `value-malformed` |
| `REQUIRED_MISSING` | step 4 | `required-missing` |
| `ENUM_VALUE_UNKNOWN` | step 4 | `enum-value-unknown` |
| `CURRENCY_UNKNOWN` | step 3 — a `money` value whose currency is three letters and is not one `Intl.supportedValuesOf('currency')` lists. Its own code and not `VALUE_MALFORMED`, because the shape is right and the damage is elsewhere: no rate can ever exist for a code that does not, so every figure over that register falls to `value: null` and any target on it stops being evaluated (34 §52) | `currency-unknown` |
| `OUT_OF_BOUNDS` | step 4, `min:`/`max:` — both bounds named | `out-of-bounds` |
| `IMMUTABLE_FIELD` | step 4, `immutable:` on a changed field; also a derived, retired or kernel-written field (41) | `immutable-field` |
| `UNIQUE_VIOLATION` | step 4, `unique:` on a series row, or from the index as the backstop — driver messages are never parsed (41) | `unique-violation` |
| `ALREADY_KNOWN` | step 4, the `unique:` pre-check, naming the row that already holds the value by its spoken id; also a taken slug at sign-up (41; 51) | `already-known` |
| `REF_REGISTER_MISMATCH` | step 4, a `ref` into a register the field does not declare | `ref-register-mismatch` |
| `DELETE_WHILE_REFERENCED` | step 4, `delete: refuse_while_referenced` as `deleted_at` is set | `delete-while-referenced` |
| `VERSION_STALE` | step 4, the CAS — HTTP 409 | `version-stale` |
| `LEVEL_REQUIRED` | step 5, a transition's `by:` level not held | `level-required` |
| `CURRENCY_FIXED` | step 4, `currency_fixed:` on a money field whose stored code a write would change; the number stays free. Its own code and not `IMMUTABLE_FIELD`, because the repair is to delete the row and add it again in the other currency | `currency-fixed` |
| `PATCH_EMPTY` | MCP `update` with a patch that changes nothing, before the ladder: it would have written a version, or been filed as a question, for nothing. A note alone is `log`, which its `try` names (agents and MCP plan §6.5). Added October 21st 2026 | `patch-empty` |
| `NAME_AMBIGUOUS` | MCP `get` by a name more than one thing the caller may read is called: `allowed` names each by its handle and `try` reads the first (§6.5). Added October 21st 2026 | `name-ambiguous` |
| `NOT_FOUND` | `sealedGet` for a sealed file the record holds under no such name, at `key`, or a part of one that was never put or is not on this host, at `part`. Its own code and not `ROW_UNKNOWN`, whose sentence is about rows a caller may not see: a sealed file is the owner's alone, and the command asking for one branches on its absence to put it (Setup sync, [12-SECURITY](12-SECURITY.md) §8). Added October 22nd 2026 | `not-found` |

**Auth and keychain** ([12-SECURITY](12-SECURITY.md) §3, §6):

| Code | Raised where | Fixture |
|---|---|---|
| `UNAUTHORIZED` | no credential, or a bad one — 401, and the body says only this | `unauthorized` |
| `FORBIDDEN` | a credential outside its scope, level or ceiling — 403, §10; a row write from a `slash` principal (41); a token naming, re-attaching or writing a run another token opened (41 §5.4); a runner posting out of `seq` order (46) | `forbidden` |
| `NEEDS_BROWSER_SESSION` | a bearer at KEYCHAIN, the session half of JOBS, or ADMIN without an operation grant whose reach names the method — 403, §5 | `needs-browser-session` |
| `WRONG_KEY` | `kek_id` mismatch on open — 409, never "corrupt", 12 §6.1 | `wrong-key` |
| `GRANT_REVOKED` | `openGrant` on a row with `revoked_at` | `grant-revoked` |
| `DEVICE_CODE_EXPIRED` | a poll past the ten-minute life, 12 §6.1 | `device-code-expired` |
| `DEVICE_CODE_TRIES` | the fifth wrong code — every pending row goes `denied` | `device-code-tries` |
| `RATE_LIMITED` | a credential past its budget for now: a report key's rows a minute (`REPORT_ROWS_PER_MINUTE`, `budgets.json` `report.rowsPerMinute`). 429, and the refusal carries `retry_after`, the whole seconds to wait, which the host also sends as `Retry-After`. Added September 17th 2026 | `rate-limited` |
| `RUN_STOPPED` | a change by a run the owner stopped from the app (agents and MCP plan §2.4), for every client: the run may still answer with `instructionsMine`, hand off, log on itself and end, and every other change is refused in his words, "Reply with instructions, then end". 403, because retrying never works until he resumes it, and not `FORBIDDEN`, which sends an agent after a bigger token. Added October 21st 2026 | `run-stopped` |
| `RUN_PAUSED` | the same for a run he paused: its changes wait until he resumes it, and the sentence says to wait. 403. Added October 21st 2026 | `run-paused` |
| `TOOL_OFF` | an MCP tool he switched off for this kind of agent in Settings > Agents, refused at the door before it runs, for a client whose cached list still has it: the sentence names the settings row, and `allowed` the tools it has. Not `FORBIDDEN`, since no bigger key turns it on (§6.5). Added October 21st 2026 | `tool-off` |
| `KEY_ASKED` | `openForGrant` for a keychain grant on a key whose access is `ask` for that machine ([12-SECURITY](12-SECURITY.md) §6.3): the owner has been asked, once, and the same call opens the key after he allows it, so the CLI waits and tries again. Not `FORBIDDEN`, which a `deny` rule or answer still is. 403. Added October 26th 2026 | `key-asked` |

**Format and lifecycle** ([03-DOG-FORMAT](03-DOG-FORMAT.md); [33-CONTRACTS](33-CONTRACTS.md) §9):

| Code | Raised where | Fixture |
|---|---|---|
| `FORMAT_NEWER_THAN_READER` | a `user_version` above the reader's, §11 | `format-newer-than-reader` |
| `CHECKSUM_MISMATCH` | `dog_manifest` against the rows; a migration file against its `migration` row | `checksum-mismatch` |
| `SIGNATURE_INVALID` | `dog_sig` against the manifest, 03 §4 | `signature-invalid` |
| `IMPORT_NOT_EMPTY` | `import` into a record that has rows, §5 — a refusal, 422 | `import-not-empty` |
| `SCHEMA_MISMATCH` | a migration checksum the code does not recognise — module-level, every RPC 503 | `schema-mismatch` |
| `SCHEMA_NEWER` | a database migrated past the code — module-level, every RPC 503 | `schema-newer` |
| `FILE_MALFORMED` | a `.brainl` that is not one: no `#dogl` first line, a version that is not a number, a line that is not a row, a row the record cannot hold. **Nothing has been checksummed**, so `CHECKSUM_MISMATCH` would send a person looking for a manifest that was never read, and `33 §9`'s import row names three refusals and had no word for the commonest way a file arrives wrong. Spelled artefact-then-fault like `PACK_MALFORMED` and `VALUE_MALFORMED` (53) | `file-malformed` |
| `NOT_IN_THIS_BUILD` | a declaration that is correct against a document and ahead of the code: one of `08 §2.2`'s eleven aggregations this build does not compute, a `group_by` or `bucket`, a computed page source, an outbox kind this deployment wired no sender for. **The repair is a deploy, not an edit** — which is what `FORMAT_NEWER_THAN_READER` and `SCHEMA_NEWER` already say about a version integer, and why it is filed beside them. It is not `VALUE_MALFORMED`: `median` is a published word, and telling its author it is malformed sends them to check a spelling that is right (53) | `not-in-this-build` |

**Dialect** — render-time degradation, never a write refusal ([34-GRAMMARS](34-GRAMMARS.md) §2):

| Code | Raised where | Fixture |
|---|---|---|
| `DIALECT_ARITY` | a row with more cells than its kind takes; names kind and row — a block over its row cap too, `at: "rows"` (36) | `dialect-arity` |
| `DIALECT_KIND_UNKNOWN` | an info string naming no installed kind — `table` inside a write-up included (36) | `dialect-kind-unknown` |

**Slash** — the assistant's own refusals, raised by `slash` before anything is filed ([11-ASSISTANT](11-ASSISTANT.md)
§4; [23-ASSISTANT-UI](23-ASSISTANT-UI.md) §5–§6; [24-SELF-IMPROVEMENT](24-SELF-IMPROVEMENT.md) §4.6):

| Code | Raised where | Fixture |
|---|---|---|
| `PROPOSAL_UNCITED` | a proposal citing a figure or path outside the projection it was given — 23 §5's one hard rule | `proposal-uncited` |
| `PROPOSAL_NO_ROWS` | a proposal over an empty projection, or a body with no citation at all — never filed, 23 §6 | `proposal-no-rows` |
| `PROPOSAL_SCHEMA` | structured output that fails its kind's schema — a tier-C `end.result` included | `proposal-schema` |
| `PREDICTION_UNMEASURABLE` | a `change` body whose prediction names no measurable, or one twelve observations cannot settle in thirty days, 24 §4.6 | `prediction-unmeasurable` |
| `SLASH_BUDGET_SPENT` | an ask past `ask_cap` this month — the meter, 11 §4 | `slash-budget-spent` |
| `ANSWER_UNREADABLE` | an automation's question the model answered with a 200 the host could not read (too large, not JSON, broken off) or did not finish within the timeout: counted as an ask, since a provider bills it, and final, so the run stops rather than ask again. A status that is not `ok` is not this code: no completion was served, and it is `UNREACHABLE`, retried and not counted. *(Admitted September 23rd 2026, where it had borrowed `PROPOSAL_SCHEMA`, which is output read and failing its schema.)* | `answer-unreadable` |

**Connector** — a pull run's refusals, raised by `connect` and acked to the outbox; every one ends the run with a reason
a person reads ([25-CONNECTORS](25-CONNECTORS.md) §5, §7, §9). The five `ACTION_` codes are the scheduled actions'
refusals at install, raised by the kernel's declaration check. *(Amended September 15th 2026:
seven became twelve.)*

| Code | Raised where | Fixture |
|---|---|---|
| `PULL_AUTH_REJECTED` | the provider rejected the credential — 401/403 at token, probe or page; the connector pauses, 25 §9 | `pull-auth-rejected` |
| `PULL_PROVIDER_UNAVAILABLE` | the provider is down — a timeout, the network, an `error_when` status | `pull-provider-unavailable` |
| `PULL_REQUEST_REFUSED` | a 4xx the declaration did not expect; a body over its byte cap | `pull-request-refused` |
| `PULL_EXPECT_FAILED` | an `expect:` assertion failed — the cursor does not advance, 25 §5.1 | `pull-expect-failed` |
| `PULL_SHAPE_MISMATCH` | `read.rows` / `map:` do not fit the page — a non-JSON body, rows that are not a list, a repeated cursor | `pull-shape-mismatch` |
| `PULL_ORIGIN_REFUSED` | the `Http` adapter refused the origin — a private range, size, timeout — or a URL off `base`, 25 §7; the one code the `Http` vocabulary maps onto | `pull-origin-refused` |
| `PULL_LEASE_EDGE` | the run stopped at its lease's edge; `applyPull` on a lease no longer this runner's | `pull-lease-edge` |
| `ACTION_NOT_HTTPS` | a `call` or `poll` whose `url:` is not an `https://` address, refused at install ([25-CONNECTORS](25-CONNECTORS.md) §3.3) | `action-not-https` |
| `ACTION_HOST_COMPUTED` | a `call` or `poll` whose host is not written out in full: a placeholder, a user name, or anything computed from data, refused at install, 25 §7 rule 4 | `action-host-computed` |
| `ACTION_GRANT_MISSING` | a `call` or `poll` that names no key by its Keychain label, refused at install | `action-grant-missing` |
| `ACTION_INTERVAL_TOO_SHORT` | a `pull`, `call` or `poll` whose `every:` is under fifteen minutes or under the provider's own higher `floor:`, refused at install, 25 §9 | `action-interval-too-short` |
| `ACTION_EVALUATES` | a `call`'s `url:` or `body:` that computes rather than substitutes: a `${…}`, an operator after `{since}`, or a placeholder a scheduled action has nothing for, 25 §3.1 | `action-evaluates` |

**Host and client** — the boundary itself, raised by `serveApi` and by the client before or after any method runs
([33-CONTRACTS](33-CONTRACTS.md) §4; [49-SPEC-SELFHOST](49-SPEC-SELFHOST.md) §5):

*A ninth family, added 2026-09-08, and the argument for a family rather than four rows scattered across the other
eight is that the other eight are all about the record's CONTENT. This table was written from the inside out — what a
pack may declare, what a predicate may ask, what a write may do — and never once about the surface a request arrives
through, which is the only part of the record most callers ever touch. The consequence was not theoretical: the two
hosts and the client each minted their own word, `httpStatus` grew a table of four codes this document had never
heard of, and `RECORD_UNAVAILABLE` — outside the registry, therefore outside that table — answered 422 for a
record nobody may act on, where `49 §5.1` step 5.3 says 503. There is nowhere among the eight that
"there is no method called `nonsense`" belongs; filing it beside `REF_REGISTER_MISMATCH` would teach a reader that
the groups mean nothing.*

*`INTERNAL` IS DELIBERATELY NOT HERE, and it is the one code in the tree left outside this table on purpose. A
refusal names the field and what was expected; a handler that threw names neither and there is nothing a caller can
fix, so 500 is a crash report wearing the envelope's shape rather than a refusal. Admitting it would make the
registry the list of everything that can appear in a `code`, which is a different and much weaker promise.*

| Code | Raised where | Fixture |
|---|---|---|
| `ROUTE_UNKNOWN` | a path that is not `/api/<method>` for a method in `ROUTES` — 404, and `allowed` carries the method names; also an MCP tool or resource URI that resolves to nothing, 10 §3 (53) | `route-unknown` |
| `BODY_MALFORMED` | a POST body that is not a JSON object — 400, refused before anything reads an argument off it (53) | `body-malformed` |
| `RECORD_UNAVAILABLE` | the record cannot be acted on and it is not the caller's fault: every owner suspended — 503, `49 §5.1` step 5.3; or a SQLite with no `fts5` or no `json`, at `sqlite.fts5` or `sqlite.json`, found by the migration runner's boot probe on a new file and on one already migrated (§13), and sticky like `SCHEMA_NEWER`. **Named for the record and not for a schema**, which is what it said while borrowing the word from `SCHEMA_MISMATCH` to look like something that earns a 503 (53) | `record-unavailable` |
| `UNREACHABLE` | the client could not reach the record at all — DNS, the socket, a body that is not JSON, an answer carrying neither a refusal nor a conflict. **The one code the record never produces**, and it exists so that a caller told "the record refused" does not go looking for a problem with its arguments while the network is down. It is the inbound half of the same treatment the `Http` vocabulary gets outbound, where four error names map onto the single code `PULL_ORIGIN_REFUSED` (53) | `unreachable` |

And the test that stops the enumeration rotting: **every `code` has a fixture that produces it.** A
code with no fixture fails CI; a refusal path with no code fails review; a code in this table that no
fixture directory carries fails the same gate ([33-CONTRACTS](33-CONTRACTS.md) §8). The gate is one script and a
runner per `via`: the script owns the enumeration — a code per fixture, a fixture per code — and compares it against
the union of the packages' exported code lists, so a family added in a package and not here fails the same way (52).

---

## 7 · The `where:` compiler contract

Seven consumers, two backends, and it was described only in prose. The contract:

```
compile(predicate | null, ctx) → { sql, params, uses }
  predicate = the JSON tree — the storage form, 34-GRAMMARS §1. YAML→JSON happens in `declare`, the one
              package with a YAML parser; `where.parse` accepts JSON and `where.print` emits RFC 8785.
              `null` is the absent `where:` — every row
  sql       = the WHOLE clause — WHERE register = ? AND deleted_at IS NULL AND (…) — and the caller composes
              SELECT … FROM entry <sql> AND <its own terms>, never splicing a fragment; `includeDeleted` is a
              ctx flag here, not a rewrite by the caller (§4)
  ctx       = { subject: 'entry' | 'inbox_raw', register, schemas, now, tz, scope, includeDeleted? }
              schemas is REQUIRED — a RegisterSchema per register, built by where.toSchema(declarationBody), so
              the compiler needs nothing from `declare`; now is an RFC 3339 UTC string
  scope     = { registers: '*' | string[]; rows?: Predicate }   -- AND-ed in, inside the SQL
  uses      = { fts: bool, vec: bool, indexes: [...] }   -- what the planner should have picked
```

| Rule | Value |
|---|---|
| Max nesting depth | **3**, counting the root group as level 1; a fourth level is `PREDICATE_TOO_DEEP` at install. [21-AUTHORING](21-AUTHORING.md) §4.4 capped it and [02-DATA-MODEL](02-DATA-MODEL.md) §6 states it. A predicate is a group or a single leaf; an absent `where:` is every row; same-quantifier nesting is flattened on save |
| `IN` chunking | at **64** values; past 64, a field with no currency or unit binds the list as one parameter, `IN (SELECT value FROM json_each(?))`, and money and quantity keep their chunks, whose 100-parameter ceiling is the adapter's (§13). Chunks of `in` are joined with `OR`, chunks of `not_in` with `AND`, inside one parenthesis — a 130-value `not_in` is three `NOT IN`s `AND`-ed, never `OR`-ed |
| Legal internal subqueries | **these, and only these**: the FTS5 set-membership test for `matches`; the single `via:` hop, `IN (SELECT id FROM entry WHERE register = ? AND deleted_at IS NULL AND <leaf>)` where `<leaf>` compiles by the target register's rules (so `state` reads the column); `EXISTS (SELECT 1 FROM json_each(…))` for `has`/`lacks`; and `IN (SELECT value FROM json_each(?))` for an `in` or `not_in` past 64 values. Each is correlated to the current row or one register; none is author-writable. A `via:` leaf may not itself carry `matches` or `has` — `VIA_NESTED_SUBQUERY` |
| `contains` | field-scoped, ASCII-case-folded **substring**: `instr(lower(x), lower(?)) > 0`, literal ≤ 40 bytes (`CONTAINS_TOO_LONG`), **identical on both backends**. Never `LIKE`, never FTS5 — ADR-055 |
| `matches` | register-wide **FTS5 token match** over the register's `search:` fields, entry backend only: `id IN (SELECT id FROM entry_fts WHERE register = ? AND entry_fts MATCH ?)`. The operand is one quoted phrase with `"` doubled, so no prefix, column or boolean operator is reachable from an author; the same whitespace collapse is applied at index time (§1) |
| Missing values | an absent key, JSON `null`, `""` and `[]` are **missing**. `empty: true` matches, `present: true` does not. Positive operators (`is in gt gte lt lte before after between has contains matches starts ends`) are **false** on missing; **negative operators (`not not_in lacks`) are true** and compile to `(expr IS NULL OR expr <> ?)`; `none:` is `NOT(any)` over branches already two-valued by this rule; `bool` literals bind as 1/0. This is what lets the reference evaluator and the SQL agree — ADR-058 |
| Temporal literals | `YYYY-MM-DD`, RFC 3339, or relative (anchors `today tomorrow yesterday bom eom boy eoy`, offsets `<sign><1–4 digits><d|w|m>`) — resolved **once**, at compile time, against `ctx.now` in `ctx.tz`, every one a **bound parameter**, never in SQL, so a query is reproducible and testable. `RELATIVE_LITERAL_UNKNOWN`, `RELATIVE_UNIT_FOR_DAY`; the full grammar is [34-GRAMMARS](34-GRAMMARS.md) §1 |
| Money and quantity | **two expressions** — `$.f.amount` and `$.f.currency`; `$.f.value` and `$.f.unit`; `index: true` creates both. A comparison compiles to `currency = ? AND amount <op> ?`, so a row in another currency does not match; a literal without its currency or unit is refused at install (`MONEY_LITERAL_NEEDS_CURRENCY`, `QUANTITY_LITERAL_NEEDS_UNIT`) |
| Literals | single-quoted only, and every value is bound. Double-quoted string literals are **off** in `node:sqlite` (`"$.due"` parses as an identifier), and a conformance case asserts the compiler never emits one |
| `derive:` | inlined at compile — `sum` → `COALESCE(a,0)+…`, `ratio` → `CASE WHEN per = 0 THEN NULL ELSE of*1.0/per END`, `band` → a `CASE` over exclusive upper bounds, `normalise` → `lower(trim(f))`, `via` → the hop above — so `{ field: tier, is: urgent }` works on a derived field. The shapes are [34-GRAMMARS](34-GRAMMARS.md) §1, and the functions are `where`'s — `derive`, `searchText`, `normalise` (`lower(trim(f))`, no whitespace collapse) are imported by the kernel, so the stored `unique:` fingerprint and the compiled inline share one definition (38, 41) |
| `near` | **ranking, not filtering, and out of the property test**: legal only as the last leaf of a root `all:`; SQL yields ≤ 5,000 candidate ids, int8 cosine runs in JS, truncate to `k` (default 20, max 100). It has its own fixture, and it is deferred past §1b |
| Scope | `ctx.scope` is `AND`-ed in **inside** the SQL, never filtered after ranking — [11-ASSISTANT](11-ASSISTANT.md) §5 |

> *An earlier draft counted two subqueries and compiled `contains` to FTS5. `has`/`lacks` were always a third
> subquery that nothing counted; and `contains` is substring while `matches` is full-text, because a
> field-scoped test over one FTS column projected from the whole `search:` list has no legal compilation.*

**The test that makes it trustworthy is a property, not an example:** generate a random predicate and
a random row set, evaluate the predicate in a reference in-memory interpreter, run the compiled SQL
against the same rows, and assert the sets are identical. That catches the whole class of bug where
the compiler and the format drift apart — and it is why the missing-value rule had to be written first:
until it was, the oracle and the compiler were guaranteed to disagree on every row lacking a field. It runs
**1,000 times in CI and 10,000 nightly**, every committed seed replayed first — both numbers true, both stated (38, 52).
The oracle folds ASCII case and the generator emits ASCII, so the two agree by construction (38). A malformed tree is a
`SyntaxError` from `parse`, never a `Refusal`: a malformed body is 400 at the record, not 422.

---

## 8 · The outbox protocol

Given, previously: a table and four properties. Missing: the actual protocol.

| | |
|---|---|
| **Kinds** | **nine**: `notify.email` · `notify.push` · `notify.webhook` · `pull.fetch` · `export.r2` · `erase.r2` · `infer.embed` · `infer.prose` · `infer.draft`. States `pending` · `leased` · `done` · `failed` · `dead`, and both lists are a `CHECK` (§1). *An earlier draft had six kinds and no way for an embedding, a digest sentence or the analyser's draft to leave the object* |
| **Lease** | per kind, because one number cannot serve all: **60 s** for `notify.*`; **300 s** for `pull.fetch`, which can span forty pages, and for `export.r2` and `erase.r2`, because an R2 prefix delete is paged — and [02-DATA-MODEL](02-DATA-MODEL.md) §10's erasure guarantee is stated in that window; **120 s** for `infer.*` |
| **Drain** | `leaseOutbox(kinds, n)` claims up to *n* rows with `state='pending' OR leased_until < now`, sets `leased_until`, returns them. One statement, so a double-drain finds nothing |
| **Ack** | `ackOutbox({ id, state: 'done' \| 'failed', result?, error? })` — one object, never a positional list (45 wins over every other shape). A `failed` ack sets `failed`, `attempts + 1`, and inserts `schedule(kind = 'retry', key = 'outbox:' \|\| id, due_at = now + min(2^attempts min, 6 h), payload = { outbox: id })` — one jitter formula, the connector spec's (47). The outbox row is never retried in place |
| **Who retries** | the **schedule**, not the Worker. The `retry` row firing resets the outbox row to `pending`; `outbox.attempts` mirrors it. When the retry row itself goes `failed` — at 8 attempts, one ladder ([09-ALARMS](09-ALARMS-AND-NOTIFICATIONS.md) §1) — the outbox row goes `dead` and a `suggestion(body_kind = 'change', opened_by = 'system')` is opened naming the kind, the error and a payload summary — **the visible item**. Retry policy lives in one place. *An earlier draft gave the outbox its own ladder beside the schedule's (09 §1 said `failed` at 8); there is one ladder, and it is here* |
| **`infer.*`** | the host calls the `Inference` port and the write-back rides `ackOutbox.result`, persisted in the ack's transaction: `infer.embed` into `entry_vec`, `infer.prose` into the digest row (51). The `infer.draft` ack carries its result and files nothing — a tier-A proposal is filed once, by `propose`, from Slash (45, 46). Embeddings are queued by the hourly sweep — one `infer.embed` row over the rows that changed, ≤ 100 a row — never per write (45). `search` reranks its word hits by those vectors where they exist, and answers as the words ranked it where they do not (45 §`purge`). The record itself never calls a model — [01-ARCHITECTURE](01-ARCHITECTURE.md) §3 |
| **`pull.fetch`** | the payload is `{ ingest_id, declaration_version, grant_id }` and carries nothing sealed: `connect`'s `runPull(job, deps)` fetches the sealed grant through `sealedGrant`, unwraps the connector DEK with `KeyStore`, writes pages through `applyPull` and acks itself; the `pull` schedule row goes `firing` when it fires and inserts this one row, and `paused` on `PULL_AUTH_REJECTED` (§1; [25-CONNECTORS](25-CONNECTORS.md) §9; 47). A `call` a rule runs adds `rule`, `entry` and `row`, where `row` holds only the fields the call's `sends:` names, copied when the rule fired and never a `secret` or a `file`; the dead-letter summary withholds `row`, and each action makes at most 100 of these a day ([07-INGEST-AND-RULES](07-INGEST-AND-RULES.md) §6) |
| **The doorbell** | `Scheduler.wake()` — Cloud: `OUTBOX_Q.send({ record })`; self-host: a kick to the in-process poller, which otherwise ticks every 15 s (49). It is step 12b of the write path, after commit, the only I/O, rung only when the write left an outbox row; and it is a method on a port, because `cloudflare:*` is banned under `packages/**` |
| **Belt and braces** | the Worker also drains expired leases on the record's next ordinary request. A lost queue message costs latency, never a notification |

---

## 9 · The projection Slash reads through

Named in four documents, specified in none. It is a READ+ method — `project({ query, budget }, ctx)`, `read` scope,
§5 — and it is the security boundary, so it is a *type*:

```
Projection {
  rows:  [{ id, register, seq, spoken, state, version, updated_at, summary, fields: {…} }]   -- projected, never whole documents
  index: { registers: [{ id, rows, open, fields: [{ id, type }] }], open_questions: [...] }
                                             -- open = non-terminal rows; fields = id and type, never a schema in full
  budget: { used, limit }                    -- ≈ tokens, ceil(utf8 bytes / 4)
}
```

Five rules, and the third is the one that must never be relaxed:

1. **Fields are projected by the register's `search:` and `mobile:` lists**, not by taking everything.
2. **Every row carries its spoken id**, so every claim can be cited and the UI can link it.
3. **`secret`-typed fields are replaced by their label before the projection is built** — not before
   it is *sent*. There is no code path where a plaintext credential is in the same object as a
   prompt.
4. **`document` fields come only when the question is about the document**, decided by the caller,
   never by the model.
5. **`series: true` rows are never projected** — a series is read through its metric, not row by row (45).

---

## 10 · Authorisation, and the crosswalk that was missing

Two ladders exist in the corpus and nothing mapped them:
[10-MCP](10-MCP.md) has `read` / `write` / `propose`; [20-COLLABORATION](20-COLLABORATION.md) has
`read` / `append` / `write` / `decide` / `owner`. And four principals from [12-SECURITY](12-SECURITY.md) §3 and
[26-BYO-INTELLIGENCE](26-BYO-INTELLIGENCE.md) §2.3 had no row at all.

| Token scope | Person level | May |
|---|---|---|
| `read` | `read` | DATA reads, READ+ |
| `propose` | — | + `propose`, `log` |
| `write` | `append` | + `create` into registers in scope |
| `write` | `write` | + `update` |
| — | `decide` | + resolve a suggestion into a decision. **No token grants this; a decision needs a person** |
| — | `owner` | + ADMIN, KEYCHAIN and the session half of JOBS — **a browser session. No token scope reaches them, because there is no `admin` scope** (ADR-060); ADMIN alone also admits the operation grant below |
| `share` principal — `{ kind: 'share', id, slug }` | — | `page(slug)` for one slug; `ctx.scope` is the link's projection (20 §1: an empty ceiling); nothing else. Stateless, terminally revoked by `share.close` (49) |
| `runner` principal — `{ kind: 'runner', id, name }`, built only from a verified device grant (`reach = 'runner'`) or its socket | — | as `propose`, plus `claimJob` · `postJobEvent` · `readCancel`; the job bearer `claimJob` mints is a `token` with an audience of one job and the job's deadline as expiry (46) |
| **shape grant** — a bearer of a standing device grant with `reach = 'shape'` (kernel migration 33) | the approver is the owner, once, with six digits | **a shape copy of the record and nothing else**: words, numbers and dates scrambled, so the look and the gates can draw a record shaped like the owner's without a word of it. Standing, not spent, for ninety days, each copy writing `last_used`; its bearer is held only on `device_grant`, so no door that reads `token` finds it, and `vaultGrant`, the operation grant and the runner's check each refuse it. The kernel's `shapeGrant` is its one reader, called by the host before it takes the copy |
| **operation grant** — a bearer whose `ctx.op` names an approved operation | the approver is the owner, in a browser | **one ADMIN method, once**, within ten minutes: the method the grant's `reach` names — `pack` · `export` · `import` · `token` — after the owner saw its summary (the plan diff, the export scope, the token's scope). Recorded in `device_grant.reach` and an `access.grant` event. ADR-060's reversal clause — *a signed single-use plan hash* — met, and no standing token minted (§5; 12 §3) |
| `BRAINDOG_TOKEN` | owner | everything a browser session may — self-host, single user only |
| invited person | the levels the invitation names | an invitation link (24 h, bound to one email) → a passkey → `member` rows and one `access.grant` event per register |

**Enforced in one place: the record object, at step 1 of the write path and inside the compiler for
reads.** Not in the Worker — a check in the router is a check the CLI can be pointed around. The
effective set is `token.scope ∩ person.level ∩ register.ceiling`, computed once per call and passed
in `ctx.scope` (§7). `CallContext.principal.kind` is one of six — `person · token · runner · share · system · slash` —
and `runner` and `share` are kinds, never fields beside the principal ([33-CONTRACTS](33-CONTRACTS.md) §2). A billing
lapse is a ceiling too: read-only, held in the record and not in a host (ADR-059; 53). *An earlier draft had a sixth
token scope, `admin`, mapped to `owner`. No such scope exists; §12 #4 records the decision.*

**Agents add metadata too, by proposal (September 22nd 2026).** `setDeclaration` is
an owner's in a browser, and that is right for a direct write. It does not mean an agent cannot add
a field, a list or a relation to a record: it files `propose` with `body_kind: 'change'`, and the
owner's Accept is what calls `setDeclaration` ([45-SPEC-RECORD](45-SPEC-RECORD.md) §13 #10). The
code ships the primitives; use cases, integrations and metadata are added at run time by people or
agents through that path, or brought by a pack.

---

## 11 · `.brain` versioning

`user_version` was already at 3 with no migration list, and three documents gave it three meanings. The rule —
**three version numbers, one home each**:

| | |
|---|---|
| `PRAGMA application_id` | `0x444F4721` — **never changes** |
| `PRAGMA user_version` | the **`.brain` format revision** — bumped only when an older reader would *misread* the file. **1 at v1.** An additive migration — a new table, a new column — does not bump it; a migration is a `.ts` module under `src/migrations/`, and the one that must bump carries `-- format-bump <n>` (41; [33-CONTRACTS](33-CONTRACTS.md) §9) |
| The kernel migration number | `MAX(migration.version)` — every applied migration, 1 at v1. Not a PRAGMA, not a column |
| `record.format_ver INTEGER` | mirrors `user_version`, for a reader without PRAGMA access |
| What a pack requires | `requires: { format: <int>, primitives: <int>, packs: { <id>: <semver-range> } }` — the format revision, `PRIMITIVES_VERSION`, other packs. Never an app version: **the app has no semver** (`FORMAT_OUT_OF_RANGE`, `PRIMITIVES_OUT_OF_RANGE`) |
| The tuple `braindog --version` prints | `app <date>+<sha> · format <user_version> · kernel <migration> · primitives <PRIMITIVES_VERSION>` — `PRIMITIVES_VERSION = 1` at stage 0 |
| Reading an older file | upgrade on import, in one transaction, and say so |
| Reading a **newer** file | refuse, naming both versions (`FORMAT_NEWER_THAN_READER`). A partial read of a format you do not know is data loss with a progress bar |

A `PRAGMA` inside a migration is best effort: an adapter that refuses it (the Durable Object's allow-list) does not
fail the migration — the refusal is swallowed explicitly, and a conformance case measures that it is (41, 37).

**And v1 ships at `user_version = 1`.** Starting at 3 with no 1 or 2 to migrate from is a fiction
that costs nothing to remove now and cannot be removed later.

> *An earlier draft of this table made `user_version` the kernel migration number and `record.format_ver` a semver
> string — in the same document whose DDL typed it INTEGER; 03 said "format 3"; 31 printed format and kernel as two
> numbers. The table above is the one reading all of them now share.*

---

## 12 · What is still open

Honestly, because a blueprint that answers everything has stopped being a blueprint. The 2026-09-02 review closed
the four this section held and opened three. *(The section keeps its number and moves to sit after §11, where a
reader walking the document expects it — 02 and others cite §13 and §14 by number, so nothing is renumbered.)*

| # | Was open | Closed by |
|---|---|---|
| 1 | The block dialect's formal grammar — column counts per kind, escaping a literal `\|`, where the tone token sits, how `{{path}}` interacts with the parser | [34-GRAMMARS](34-GRAMMARS.md) §2: the info string, `\|` and `\\` unescaped before the split, the tone as a trailing cell, a row shape per kind, `{{path}}` substituted per cell *after* splitting and never re-parsed, over-arity degrading to the fence with `DIALECT_ARITY` |
| 2 | Billing lifecycle — what happens on lapse. Does the record go read-only? Do connectors pause? Is export still guaranteed? | ADR-059: the record goes read-only; connectors and digests pause; export and MCP reads stay available for 90 days; then the erasure ladder. **Export is always guaranteed** — which is the load-bearing half for the no-lock-in argument |
| 3 | The seed data for the first-party packs | the packs are **six** — `agents` · `work` · `portfolio` · `money-core` · `estate` · `people` — and their seeds are the first task of B2, not a day-one dependency. Fixtures are text; the `.brain` is materialised through the real write path at test time with an injected `Clock` and a seeded RNG ([33-CONTRACTS](33-CONTRACTS.md) §3): the instant is `2031-01-05T09:00:00.000Z`, one second per row; the RNG is `sfc32` seeded `[1, 2, 3, 4]` with fifteen outputs discarded, injected through `openRecord`'s `random` (40, 41). *An earlier draft said four* |
| 4 | Whether `admin` may ever be granted to an agent token | ADR-060: **no** standing grant — there is no `admin` scope, and KEYCHAIN is a browser session only. The second revision met ADR-060's own reversal clause instead: an **operation grant**, the owner's single-use ten-minute approval of one named ADMIN operation, reaches that one method once (§5, §10) |

| # | Open | Blocks |
|---|---|---|
| 5 | The DO planner measurement — does the Durable Object's SQL API use a partial expression index for both the bound and the literal `register` form? Node: yes, measured (§13). [Q12](17-OPEN-QUESTIONS.md) | the index model — conformance cases #20, #21 and #30, run against the DO in week one, not a spike (37); a disagreement amends §13's divergence table |
| 6 | The OAuth 2.1 authorization server behind RFC 9728. When built, BrainDog is its own AS on the Worker — passkey or magic-link consent, PKCE, no refresh tokens for CLI clients; Phase A ships agent tokens only and the well-known document is deferred with that reason | MCP clients that will not take an agent token |
| 7 | The type-change conversion preview — v1 refuses a type change (`FIELD_TYPE_CHANGED`: retire the field, add a new one) | the authoring tier, 15 §1b |

*Row 3, read September 22nd 2026: the six first-party packs are examples in a
shared catalogue, not the set the product is defined by. Money, estate and portfolio are one owner's
use cases. The code ships primitives, and use cases, integrations and metadata are added at run time
by people or agents, or brought by a pack the person chose to install ([04-PACKS](04-PACKS.md) §6).*

---

## 13 · The storage adapter, and the test that makes self-host real

Everything about portability is a claim until this runs. It is **the first thing to build**, before
the first register.

```ts
export interface Sql {                       // the port's name in 01, 31 §5 and 33-CONTRACTS §1 —
                                             //   an earlier draft here called it StorageAdapter
  /** EXACTLY one statement, always — a second is MULTI_STATEMENT_PARAMS, with or without parameters. `?` placeholders.
   *  NEVER BEGIN/COMMIT/END/ROLLBACK/SAVEPOINT/RELEASE — six keywords, refused by statement-prefix check → TXN_STATEMENT_FORBIDDEN. */
  exec<T = Row>(query: string, ...params: Param[]): Cursor<T>;
  /** Zero-parameter, multi-statement text. The migration runner only. */
  execScript(sql: string): void;
  /** Synchronous callback only — NotPromise<T> closes the async hole at compile time. Rolls back on throw. Does NOT nest. */
  transactionSync<T>(fn: () => NotPromise<T>): T;
  /** Measured at open: sqlite, fts5, json, the five enforced ceilings, expressionIndexUsed, nestedTransactions: false. */
  readonly caps: Capabilities;
}
// Param = null | number | bigint | string | Uint8Array — no boolean, no undefined. A non-Param value is refused by the
// ADAPTER before any driver sees it (SYNTAX); an earlier draft said node:sqlite would coerce — it throws, and the DO
// rejects. Row, Cursor<T> (toArray · one · first · rowsRead · rowsWritten) and Capabilities: 33-CONTRACTS §1.
```

`Sql` is one of nine ports. The other eight — `Scheduler` (`get` · `set` · `clear` · `wake`, the outbox doorbell),
`Clock`, `Blobs`, `Inference`, `Dispatch`, `Http`, `KeyStore`, `Snapshots` — and the `Ingress` entrypoint contract
have their signatures in [33-CONTRACTS](33-CONTRACTS.md) §1. The record's ports are exactly `{ Sql, Scheduler,
Clock }`; Slash's are `{ Sql, Clock, Inference }`.

**Three deliberate absences, each because the cloud cannot do it** and the interface must not let
the self-host quietly out-run it:

| Absent | Because |
|---|---|
| `begin()` / `commit()` | workerd refuses: *"`sql.exec()` cannot execute transaction-related statements like `BEGIN TRANSACTION` or `SAVEPOINT`."* Bun's `db.transaction()` nests via SAVEPOINT; a DO cannot. Node **allows** a raw `SAVEPOINT a; RELEASE a` — measured — so every adapter refuses the six keywords `BEGIN COMMIT END ROLLBACK SAVEPOINT RELEASE` by statement prefix, and a conformance case proves every adapter refuses identically; a nested `transactionSync`, or a callback returning a thenable, is the same `TXN_STATEMENT_FORBIDDEN` (37). **Nesting is out of the interface** |
| `attach()`, user-defined functions | ATTACH is denied and there is no API to register a function. §11 of [03-DOG-FORMAT](03-DOG-FORMAT.md) now routes export around it |
| **anything async** | both DO SQL and `node:sqlite` are synchronous. An async interface invites an `await` between two writes — **exactly the input-gate hazard [01-ARCHITECTURE](01-ARCHITECTURE.md) §2 exists to prevent.** The type system enforces the rule |

### Which driver

`node:sqlite` is the self-host default on Node ≥ 24.13 — zero native dependencies, FTS5 and JSON1 present.
Measured 2026-09-02 on the official v24.13.0 build: SQLite **3.50.4**, compile options include **`ENABLE_FTS5`**,
and `CREATE VIRTUAL TABLE … USING fts5` succeeds. It is still Stability 1.1, so the Node minor is pinned and the
boot probe below measures FTS5 on every start. There is no alternative driver at v1 — `better-sqlite3` is not shipped, and an older Node is refused at boot, not accommodated (37, 49).
`bun:sqlite` is **unsupported**: it links Apple's system libsqlite3 on macOS, nests via SAVEPOINT, and has
different parameter ceilings. **There is no degraded mode.** A build without FTS5 is refused at boot — ADR-038.

> *An earlier draft (2026-09-01) said official Node builds compile `node:sqlite` without FTS5, made `better-sqlite3`
> the default, and documented a `LIKE` fallback for `contains`. The measurement was wrong — nodejs/node#56476 was
> closed because FTS5 had been **enabled** — and 22 §9's reading was the right one. The fallback would have been a
> third compilation with different semantics, which 02 §6's "the two backends refuse identically" forbids.*

### Parity is enforced by tightening Node, not by hoping

The failure this prevents is specific: *a batch insert of 200 rows × 3 params works on Node and
fails on Cloudflare.* Testing both does not catch it — **making Node refuse first does.** An earlier draft did
that with a `limits:` option on `DatabaseSync`. **Measured: no such option exists** — unknown option keys are
silently ignored, and there is no `setLimit`; the prototype is `open close prepare exec function createTagStore
location aggregate createSession applyChangeset enableLoadExtension enableDefensive loadExtension setAuthorizer`.
So `DO_LIMITS` survives as a **constant our adapter enforces above the driver**:

```ts
export const DO_LIMITS = {
  length: 2 * 1024 * 1024,   // docs say 2 MB; workerd source sets 4 MB. Take the tighter one.
  sqlLength: 100_000, column: 100, variableNumber: 100, likePatternLength: 50,
  exprDepth: 100, compoundSelect: 5, triggerDepth: 10,   // ← all three UNDOCUMENTED
  attach: 0, vdbeOp: 25_000, functionArg: 32,
} as const;

new DatabaseSync(path, {
  enableForeignKeyConstraints: false,   // node:sqlite defaults this TRUE; DO leaves SQLite's OFF, and 02 §1 relies
                                        // on OFF — `event` has no FK to `entry`. Measured: accepted, foreign_keys = 0.
});                                     // no `limits:` key. The table below is how each ceiling is held.
```

| Ceiling | Held by the adapter, above the driver |
|---|---|
| `variableNumber` 100 | parameters counted before `prepare` → `TOO_MANY_PARAMS` |
| `likePatternLength` 50 | the parameter bound at a `LIKE ?` or `GLOB ?` is measured at bind time — positional, not every string in the statement (37) → `LIKE_TOO_LONG`. The validator already caps `starts`/`ends` at 40, so an author never meets this one |
| `compoundSelect` 5 · `exprDepth` 100 | compound terms are guarded by keyword count before `prepare` → `COMPOUND_TOO_LONG`; expression depth is not guarded — it is a property of the compiler's output, asserted by the §7 property test (1,000 runs in CI, 10,000 nightly), and `EXPR_TOO_DEEP` is what the driver's own refusal maps to (37) |
| `sqlLength` 100 k | statement bytes measured before `exec` → `STATEMENT_TOO_LONG` |
| an INTEGER beyond 2⁵³ | refused before `prepare` → `INT_OUT_OF_RANGE`, so the DO's silent precision loss and Node's throw become one refusal |
| the rest — `length`, `column`, `triggerDepth`, `attach`, `vdbeOp`, `functionArg` | the envelope the fixed DDL and the compiler are designed under; nothing approaches them at runtime. SQLite's own *too many columns* maps to `TOO_MANY_COLUMNS`; ATTACH and functions are not in the interface at all |

`caps` declares exactly the five enforced ceilings (`maxParams` · `maxLikePattern` · `maxSqlBytes` ·
`maxCompoundSelect` · `maxExprDepth`) plus what is measured at open (`sqlite` · `fts5` · `json` ·
`expressionIndexUsed` · `nestedTransactions: false`). Both adapters map a driver's message onto the same closed
vocabulary through one table of twelve SQLite message fragments, substring-matched, that lives in `ports` — never a
message parsed twice (37). **That is what "Node refuses first" means now** — a mechanism in our code, not an option we hoped
the driver had.

### The divergences it pins, because every one of them is silent

| | DO | `node:sqlite` 24.13.0 | `bun:sqlite` |
|---|---|---|---|
| INTEGER beyond 2⁵³ | silent precision loss | **throws** | silent rounding |
| Max bound params | **100** | 32,766 | 250,000 (Linux) |
| LIKE pattern | **50 bytes** — workerd's `sqlite3_limit`, not SQLite's default of 50,000 | 50,000 | 50,000 |
| Compound SELECT | **5** | default | default |
| Foreign keys | off | **on** by default → opened with `enableForeignKeyConstraints: false` | off |
| Raw `SAVEPOINT` | denied | **allowed** → the adapter refuses by prefix check, `TXN_STATEMENT_FORBIDDEN` | used internally |
| Double-quoted string literals | — | **off**: `"$.due"` parses as an identifier → the compiler emits single quotes and binds values | — |
| **FTS5** | **✅ documented** | **✅ on 24.13+** — measured, 3.50.4 with `ENABLE_FTS5` | ⚠️ platform-dependent |

> **And the sharpest one is Bun's alone:** on macOS `bun:sqlite` `dlopen`s **Apple's system `libsqlite3.dylib`**,
> which has been observed at SQLite 3.43.2 — a version with a known FTS5 defect where UPDATE or DELETE on an FTS5
> table returns `SQLITE_CORRUPT_VTAB`. **Node bundles its own SQLite on every platform**; *an earlier draft said
> Node loaded the system library too, and it does not.* Never assert parameter counts or FTS5 behaviour from a Bun
> run — which is one of the reasons Bun is unsupported.

### The suite is differential, which is the part that matters

Two green suites prove nothing — they can both be green while disagreeing. So: **one corpus of
cases, executed against every adapter, producing one normalised trace each, and the assertion is
that the traces are equal.** The reference trace is generated from the **DO adapter**, because the
cloud is the tighter implementation, and it is committed as `conformance/reference.json`, regenerated only by the
workers-plugin job. A case is `{ id, requires?: (keyof Capabilities)[], run(sql): TraceLine[] }` with
`TraceLine = ['rows', unknown[]] | ['err', SqlErrorCode] | ['n', number]`; `Assert` has four methods — `ok` · `equal` · `deepEqual` · `fail`; *an earlier draft said six, and `throws` and `skip` had no caller*; CI asserts
equal case counts per host and prints every skip — [33-CONTRACTS](33-CONTRACTS.md) §3.

Two design rules carry it:

1. **Errors are results.** Two adapters must fail *the same way*, not merely both fail. Each error
   maps to a closed vocabulary of **thirteen** — `TOO_MANY_PARAMS` · `LIKE_TOO_LONG` · `EXPR_TOO_DEEP` ·
   `INT_OUT_OF_RANGE` · `TXN_STATEMENT_FORBIDDEN` · `NO_SUCH_MODULE` · `MULTI_STATEMENT_PARAMS` · `STATEMENT_TOO_LONG` ·
   `TOO_MANY_COLUMNS` · `COMPOUND_TOO_LONG` · `CONSTRAINT` · `SYNTAX` · `UNKNOWN` — and the list is closed. *An
   earlier draft's ended in an ellipsis, and a vocabulary ending in "…" is not closed.* It is the adapter's own
   list, separate from §6's refusal codes (`INT_OUT_OF_RANGE` sits in both because the same fact is refused at
   step 3 and at the driver). Comparing raw messages across three SQLite builds is comparing noise.
2. **A declared capability is measured.** Every adapter ships a `caps` manifest; the suite measures
   each limit with a pass-at-N / fail-at-N+1 pair and **fails if the declaration and the measurement
   disagree.** That is what stops a fourth adapter shipping with an optimistic manifest.

**[Q12](17-OPEN-QUESTIONS.md), half answered here.** On Node the planner uses the partial expression index with
`register` bound as a parameter *and* as a literal — `SEARCH e USING INDEX i (<expr><?)`, measured. The DO half
is the week-one assertion (§12 #5); `caps.expressionIndexUsed` records the answer per adapter, and the suite fails
if an adapter's declaration and its plan disagree.

### The boot probe, which is the same code in production

CI cannot have run on the machine a self-hoster is using. Ten lines at startup, reusing
`measureCaps`:

```
This SQLite build cannot host a .brain file:
  driver: node:sqlite 24.13.0 · SQLite 3.50.4
  fts5: required, not available
  json: required, available
On macOS, Bun loads Apple's libsqlite3.dylib and is unsupported. Use Node 24.13+, which bundles its own SQLite.
```

**That turns a missing FTS5 from a corruption bug into a refusal at boot** — and there is nothing behind the
refusal: no degraded mode, no `LIKE` fallback. `json` is required beside `fts5`, and the probe names the driver it
measured (37). It is the mechanism the FTS5 paragraph in [01-ARCHITECTURE](01-ARCHITECTURE.md) §4 now depends on.

*As built (24 September 2026), the probe is in the kernel's `applyMigrations` and not at the adapter's open,
because neither host opens through `openNodeSqlite`, and a throw at open is the failure it replaces: measured,
an adapter refusing `USING fts5` made migration 1 throw `no such module: fts5` and `openRecord` threw with it. It runs
`SELECT json('{}')` after the ledger and a `LIMIT 0` read of `entry_fts` once the schema is whole, and a missing module
from either, or from migration 1's `CREATE VIRTUAL TABLE`, is the sticky `RECORD_UNAVAILABLE` of §6 at `sqlite.fts5` or
`sqlite.json`, 503, whose `fix` is the block above in one sentence with `sqlite_version()` in it. The read is the half
that matters: a file migrated on one machine and opened on another is not re-migrated, and without it such a file
opened clean and failed at its first search. On a new file the runner answers the refusal and `openRecord` still
throws, at `makeKernel`'s unconditional read of `declaration`, a table the refused migration 1 never made; that
read has to wait on the refusal before a new file opens as one.*

When a self-hoster writes in, the order of diagnosis is fixed too: the version tuple (§11) → the refusal state
(`SCHEMA_MISMATCH` / `SCHEMA_NEWER`) → `observation` → `event` → the `system` suggestions — and nothing else is asked
for first (53).

---

## 14 · The three things to build first

Not the first three stages — the first three *artefacts*, because each one changes a design decision
if it fails, and all three fail cheaply now and expensively later.

| # | | Why first |
|---|---|---|
| **1** | **The conformance suite and two adapters** | Everything about self-host parity is a claim until it runs, and it turns [Q12](17-OPEN-QUESTIONS.md) — *does the planner actually use a partial expression index?* — from a risk into a green check. **The whole index model rests on one `EXPLAIN QUERY PLAN` assertion.** Q12's Node half is done — both the bound and the literal `register` form use the index (§13); the DO half is the week-one assertion |
| **2** | **The `where:` property test with its reference evaluator** | Seven consumers and two backends break together. The oracle is ~80 lines: evaluate the predicate in plain JS over plain objects, run the compiled SQL over the same rows, assert the sets are equal — 1,000 runs in CI, 10,000 nightly (§7) |
| **3** | **The deploy parity gate** | It has already failed three times in the prior system — a green deploy with a fresh version id, serving a stale asset. It costs an afternoon, and *"any step whose failure mode is silence gets checked against the thing itself"* |

**And one rule that shapes the rest of the suite:** every property test's failing `{seed, path}` is
committed as a permanent example. A property test whose counter-examples are not captured is a
lottery, not a regression suite.

---

*Next: [31-STACK](31-STACK.md) — languages, repository layout, and the toolchain.*
