/**
 * The kernel schema, migration 1.
 *
 * The DDL of `30-BLUEPRINT` §1, VERBATIM. It is copied rather than restated because a schema written
 * twice is a schema that disagrees with itself, and the disagreement would show up as a column
 * somebody added to the document and not to the database. A test reads that section out of the
 * document and compares, so the copy cannot drift.
 *
 * `CREATE TABLE migration` is the one omission, and it is deliberate: the runner owns that table,
 * because it has to read the ledger before it can apply the migration that would create it.
 *
 * A `.ts` module and not a `.sql` file, because this package has no build step and may not import
 * `node:fs` — a string is the only way a package under `packages/**` can carry SQL at all. The
 * backticks inside the SQL comments are escaped and nothing else is: the DDL holds no backslash and
 * no `${`, so the escape is the whole of the difference.
 *
 * THE SQL BELOW STILL SAYS `.dog`, AND THAT IS NOT AN OVERSIGHT. An applied migration is never
 * edited: its checksum is pinned and `migrate.test.ts` holds the pin. So when the whole-record file
 * gave the name `.dog` to a page's source and became a `.brain` (`03 §1`), three SQL comments in
 * here could not follow it, and `30 §1` carries the same frozen words because a test compares the
 * two verbatim. The `dog_` header tables below keep their names for the same reason.
 */

export default `
-- format-bump 1
-- ─── IDENTITY AND SHAPE ────────────────────────────────────────────────────
CREATE TABLE record (
  singleton   INTEGER PRIMARY KEY CHECK (singleton = 1),   -- exactly one row, and the CHECK says so
  id          TEXT NOT NULL UNIQUE,          -- rec_ + 26-char ULID — the record id every other document
                                             --   already uses: R2 keys, the vault AAD, dog_meta. Never 'self'
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
  retired  INTEGER NOT NULL DEFAULT 0,       -- uninstall sets 1 and emits \`uninstall\`
  superseded_at TEXT,                        -- set on the PRIOR row, in the same transaction as the new version
  created_at TEXT NOT NULL,
  PRIMARY KEY (id, version),
  CHECK (kind IN ('register','page','block','ingest','rule','metric','theme','digest'))
);
-- active = superseded_at IS NULL AND retired = 0, and the index carries the predicate:
CREATE INDEX declaration_kind ON declaration(kind) WHERE superseded_at IS NULL AND retired = 0;


-- ─── IDENTITY: PEOPLE, TOKENS, COUNTERS ────────────────────────────────────
-- The DIRECTORY lives OUTSIDE the record (ADR-061): email → person, credential_id → passkey, person → records,
-- slug → rec_id, browser sessions, magic links, the login lockout. It is the third Durable Object class,
-- \`Directory\`, one instance; on the self-host it is \`directory.sqlite\` in the same process, same schema, same
-- Sql port. The record keeps what a .dog must resolve offline and what is scoped to one record.
CREATE TABLE person (                       -- a MIRROR of the Directory row: actors and member.person_id resolve here
  id TEXT PRIMARY KEY,                      -- 'p_' + 26-char ULID, minted by the Directory
  email TEXT, name TEXT, suspended_at TEXT
);

CREATE TABLE token (                        -- agent tokens. Every token is scoped to ONE record — 10 §2
  id TEXT PRIMARY KEY, person_id TEXT NOT NULL, hash TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('read','propose','write')),   -- no \`admin\` scope, ever — ADR-060.
                                            --   ONE word; the host expands the ladder read ⊂ propose ⊂ write (45)
  label TEXT, created_at TEXT NOT NULL,
  last_used_at TEXT, last_surface TEXT,     -- listed with a revoke button — 12 §3
  expires_at TEXT, revoked_at TEXT
);                                          -- the runner's job bearer is a \`token\` row too, minted by \`claimJob\` with an
                                            --   audience of ONE job and revoked at the job's \`end\` — §5; 46 §4.7

CREATE TABLE auth_fail (                    -- per-record lockouts: device codes, share tokens. Never exported (local)
  key TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0, until TEXT
);

CREATE TABLE counter (                      -- 'seq:<register>' | 'decision' | 'suggestion'
  name TEXT PRIMARY KEY, next INTEGER NOT NULL DEFAULT 1
);
-- Allocation is UPDATE counter SET next = next + 1 WHERE name = ? RETURNING next - 1, inside the write
-- transaction — race-free because the object is single-writer. A purged row's number is never reissued.
-- \`counter\` TRAVELS in every export: seq allocation must survive the file.

-- ─── THE ROWS ──────────────────────────────────────────────────────────────
CREATE TABLE entry (
  id         TEXT PRIMARY KEY,               -- 26-char ULID. never spoken
  register   TEXT NOT NULL,                  -- ^[a-z][a-z0-9_]{0,31}$ — 34-GRAMMARS §4
  seq        INTEGER,                        -- per register, from 1, allocated from \`counter\`. NULL when series: true
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
-- Rule-generated rows carry \`_rule\`, \`_parent\`, \`_each\` in \`fields\` — 07 §6.1's idempotency key, so a re-run
-- is a no-op. Field ids beginning \`_\` are reserved to the kernel.
CREATE UNIQUE INDEX entry_created_by ON entry(
  json_extract(fields,'$._rule'), json_extract(fields,'$._parent'), json_extract(fields,'$._each'))
  WHERE json_extract(fields,'$._rule') IS NOT NULL;
-- plus three index families added by declaration (the names are 34-GRAMMARS §4; \`__\` separates reg from field):
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
-- DELETE FROM entry_fts WHERE rowid = ? then INSERT — never a scan on the UNINDEXED id. \`search:\` may name only
-- text · document · enum · url · email · list<text> fields (SEARCH_FIELD_TYPE); the projected text is the
-- \`search:\` values in order, a list joined by a space, fields joined by LF, whitespace collapsed. \`matches:\`
-- reads it; \`contains:\` never does (§7). Import rebuilds it from \`entry\`.

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
  field   TEXT,                              -- NULL on a \`create\` row: to_v is then the whole \`fields\`, as JCS
  from_v  TEXT,                              -- '--redacted--' when the redaction list withheld it at write (20 §8);
  to_v    TEXT,                              --   '--erased--' after an erasure (02 §10); NULL ONLY when there was
                                             --   no prior value. One rule, three values — never NULL for two of them
  note    TEXT,                              -- mandatory, ≤ 280 chars, on a \`note\` row; '--erased--' after an erasure
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
                                             -- \`pull\`, never \`cron\`: the kernel's word for the scheduled channel is
                                             --   the same word as the schedule kind, the outbox kind and the event kind
  headers TEXT, body TEXT,                   -- headers lower-cased on arrival; \`from\`/\`to\`/\`subject\` are read from them — §7
  sha256  TEXT NOT NULL,
  state   TEXT NOT NULL DEFAULT 'untriaged'
          CHECK (state IN ('untriaged','matched','skipped','review','proposed','ignored','erased')),
  reason  TEXT,                              -- why \`skipped\`, why \`review\` — the one place a wrong skip shows, 07 §2
  UNIQUE (channel, sha256)                   -- redelivery writes one row
);

CREATE TABLE ingest_receipt (
  id TEXT PRIMARY KEY, raw_id TEXT NOT NULL, ingest_id TEXT NOT NULL,
  wrote TEXT NOT NULL,                       -- json array of entry ids
  confidence TEXT NOT NULL CHECK (confidence IN ('exact','proposed','needs-review')),
                                             -- derived per row from the run's outcomes; a declaration's
                                             --   \`writes.confidence\` is a CEILING, never the value — 43
  ts TEXT NOT NULL
);

CREATE TABLE observation (
  kind TEXT NOT NULL CHECK (kind IN (        -- the nine signals — 24 §4
    'ingest.unmatched','decision.superseded','suggestion.incorrect','write.refused','search.empty',
    'register.read','page.render','tool.retry','query.scan')),
  subject TEXT NOT NULL, day TEXT NOT NULL,  -- subject = register id | page slug | '<register>.<field>:<code>'
  n INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (kind, subject, day)
) WITHOUT ROWID;                             -- pre-aggregated daily, PRUNED at 400 days by the \`purge\` row, never rolled up.
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
  body_kind TEXT NOT NULL,                   -- options | pattern | rowset | change — the four bodies, 33-CONTRACTS §2
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
                                             -- there is no \`reopen\`: a miss opens a suggestion to SUPERSEDE the decision
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
  rotate_every TEXT,                         -- puts a \`rotate\` row in schedule — 12 §6 rule 4
  stale_at TEXT,                             -- set on 401/403 by a connector run; the paused connector is its
                                            --   schedule row with state = 'paused' — 25 §9
  rotated_at TEXT, revoked_at TEXT
);                                          -- rows TRAVEL sealed by default; --redact-grants drops the ciphertext — 03 §5

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
);                                          -- TRAVELS, sealed — not one of the six \`local\` tables (below; 12 §8).
                                            --   An earlier draft's trailing comment said "never exported"

CREATE TABLE device_grant (                 -- RFC 8628: the device shows six digits; the owner
  id TEXT PRIMARY KEY,                      --   approves from a session already authenticated. \`id\` is the poll id
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
CREATE TABLE job (                          -- a remote Claude run — 26 §4. The closed \`kind\` is the runner's
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
  attempts INTEGER NOT NULL DEFAULT 0,       -- a paused connector is its \`pull\` row with state = 'paused'; a fire moves
                                             --   a \`pull\` row to 'firing' and inserts ONE outbox row (47). There is no
                                             --   'cancelled': an erased schedule or outbox row is 'done', payload '--erased--'
  UNIQUE (kind, key),
  CHECK (kind IN ('digest','reminder','rule','retry','purge','rotate','pull','analyse','score','snapshot'))
);                                           -- ten. \`snapshot\` is a metric's snapshot: (08 §2.6); the 12-hour session
CREATE INDEX schedule_due ON schedule(state, due_at);   -- sweep is a \`purge\` row, hourly, run by \`system\` — \`list\` never writes
-- Purge (kind \`purge\`) is one transaction per RUN over at most 100 rows: DELETE FROM entry_vec WHERE id = ?; DELETE
-- FROM entry_fts WHERE rowid = ?; DELETE FROM entry WHERE id = ? AND deleted_at < cutoff — and the observation prune.
-- \`event\` rows are kept; \`seq\` is never reused; one \`purge\` event by \`system\` per run (41). Nothing here promises
-- what the adapter disables — there is no cascade to rely on.

CREATE TABLE outbox (
  id TEXT PRIMARY KEY, created TEXT NOT NULL, kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','leased','done','failed','dead')),
  leased_until TEXT, attempts INTEGER NOT NULL DEFAULT 0,   -- mirrors the retry row; \`dead\` when that row fails at 8 — §8
  CHECK (kind IN ('notify.email','notify.push','notify.webhook','pull.fetch','export.r2','erase.r2',
                  'infer.embed','infer.prose','infer.draft'))   -- nine
);
CREATE INDEX outbox_ready ON outbox(state, created);

-- ─── THE .dog HEADER — four tables migration 0001 creates in EVERY live record, DO and file alike (03 §3) ──
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
-- live file's 31 tables export as 25 and \`braindog verify\` prints "✓ 25 tables". vault_key TRAVELS, sealed: a
-- KEK-wrapped key opens nothing without the KEK, and a restored record must open its own vault (12 §8). \`dog_section\` lists an
-- omitted table as \`local\`, so a reader tells omitted from missing.

-- ─── SEED ──────────────────────────────────────────────────────────────────
-- 41-SPEC-KERNEL section 5.2's closing statements. dog_section says which of the thirty-one
-- tables travel in an export and which are local to one machine, and it is data rather than a list
-- in code because the export reads it and so does the import.
INSERT INTO dog_meta (key, value) VALUES ('format', '1');
INSERT INTO dog_section (table_name, section) VALUES
  ('record','data'), ('migration','data'), ('counter','data'), ('person','data'), ('entry','data'),
  ('entry_fts','data'), ('entry_vec','data'), ('metric_point','data'), ('schedule','data'), ('outbox','data'),
  ('event','origin'), ('inbox_raw','origin'), ('ingest_receipt','origin'),
  ('pack','governance'), ('declaration','governance'), ('decision','governance'), ('suggestion','governance'),
  ('prediction','governance'), ('grant','governance'), ('vault_key','governance'), ('member','governance'),
  ('token','local'), ('device_grant','local'), ('auth_fail','local'), ('observation','local'), ('job','local'), ('job_event','local'),
  ('dog_meta','header'), ('dog_section','header'), ('dog_manifest','header'), ('dog_sig','header');
INSERT INTO counter (name, next) VALUES ('decision', 1), ('suggestion', 1);
`;
