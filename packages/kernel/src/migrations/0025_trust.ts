/**
 * The kernel schema, migration 25: what the ladder of trust stands on ("staff who earn trust").
 *
 * `suggestion.kind` IS THE KIND OF CHANGE A QUESTION IS, stamped when it is filed (`change-kind.ts`'s `stampOf`): one key
 * such as `tasks:move:done`, or a JSON list of them, dearest first, when it is several. "The share of suggestions
 * accepted unchanged, by kind of change" is the one number §37 judges the agent side by, and with the kind on the row it
 * is one `GROUP BY`. NULL is a question filed before this, which says nothing about its kind.
 *
 * `token` GAINS WHO THE APP IS: `client_id` (its metadata document's address, or the id it registered under),
 * `client_kind` (`cimd` when it came with a metadata document the server fetched, `dcr` when it registered itself,
 * `device` from the CLI's login, `key` minted by hand for a script), and `host`, the host its metadata names, so
 * Settings can say "Claude · claude.ai · verified" and the ladder can drop a grant whose client changes. NULL on every
 * token minted before, which is what was known of them.
 *
 * TWO INDEXES ON `event`, because the ladder and undo read the log by who wrote it and by the write that caused it: a
 * run's changes are `actor = 'S42'`, and a decision's or a rule's cascade is one `batch`. Before this both were scans of
 * the whole log. The batch index leaves out the rows that have none, which are most of them.
 *
 * `ladder` IS ONE RUNG PER AGENT AND KIND: `agent` is a token's id, or `slash`; `kind` a key from `change-kind.ts`;
 * `rung` Ask, Do and tell, or Do quietly; `accepted_unchanged` how many of that kind the owner has kept as filed since
 * `since`; `dropped_at` when an undo, three declines, an anomaly or a new client took it back to Ask. No row is Ask.
 *
 * `undone` IS ONE LINE PER BATCH PUT BACK: the batch, the batch the undo wrote, who made the change (a run, a rule,
 * Slash) and the agent the ladder knows them as, the kinds it was, who undid it and when. The ladder reads "none
 * undone" from it, and a second undo of the same batch finds it already there.
 *
 * BOTH TABLES ARE `local` AND NEITHER TRAVELS. Trust is in a grant, and grants are `token` rows, which no `.brain` file
 * carries; a record restored from a file starts every agent at Ask, which is the safe end to be wrong at.
 *
 * TWO REBUILDS AND NOT TWO `ADD COLUMN`S, so this migration applies again over itself, as `0023`'s `IF NOT EXISTS` does:
 * `migrate.test.ts` rewinds the ledger past it to run the migrations below it again, and `ADD COLUMN` is the one shape
 * that cannot be written to allow that. Every row is copied with its `rowid`, which `suggestion`'s order falls back on,
 * and the new columns come last, where `ADD COLUMN` would have put them, so a positional read is the same either way.
 *
 * EXISTING WRITE TOKENS KEEP WHAT THEY DID. The rungs they earned before the ladder existed are set once this applies,
 * in `migrate.ts`, because a kind is worked out by code (`seedLadder`) that SQL cannot run.
 *
 * NOT A FORMAT REVISION. `suggestion.kind` is nullable and comes last, so an older file imports without it and reads
 * NULL; the rest is `local`.
 */
export default `
CREATE TABLE suggestion_next (
  id TEXT PRIMARY KEY,
  body_kind TEXT NOT NULL,
  body TEXT NOT NULL, status TEXT NOT NULL,
  opened_by TEXT NOT NULL, opened_at TEXT NOT NULL,
  resolved_as TEXT,
  defer_until TEXT, defer_why TEXT,
  drafted_by TEXT,
  kind TEXT,
  CHECK (body_kind IN ('options','pattern','rowset','change','pack','settings','arrange'))
);
INSERT INTO suggestion_next (rowid, id, body_kind, body, status, opened_by, opened_at, resolved_as, defer_until, defer_why, drafted_by)
  SELECT rowid, id, body_kind, body, status, opened_by, opened_at, resolved_as, defer_until, defer_why, drafted_by FROM suggestion;
DROP TABLE suggestion;
ALTER TABLE suggestion_next RENAME TO suggestion;
CREATE TABLE token_next (
  id TEXT PRIMARY KEY, person_id TEXT NOT NULL, hash TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('read','propose','write')),
  label TEXT, created_at TEXT NOT NULL,
  last_used_at TEXT, last_surface TEXT,
  expires_at TEXT, revoked_at TEXT,
  reach TEXT CHECK (reach IS NULL OR (json_valid(reach) AND json_type(reach) = 'array')),
  client_id TEXT,
  client_kind TEXT CHECK (client_kind IS NULL OR client_kind IN ('cimd','dcr','device','key')),
  host TEXT
);
INSERT INTO token_next (rowid, id, person_id, hash, scope, label, created_at, last_used_at, last_surface, expires_at, revoked_at, reach)
  SELECT rowid, id, person_id, hash, scope, label, created_at, last_used_at, last_surface, expires_at, revoked_at, reach FROM token;
DROP TABLE token;
ALTER TABLE token_next RENAME TO token;
CREATE INDEX IF NOT EXISTS event_actor ON event(actor);
CREATE INDEX IF NOT EXISTS event_batch ON event(batch) WHERE batch IS NOT NULL;
CREATE TABLE IF NOT EXISTS ladder (
  agent TEXT NOT NULL,
  kind TEXT NOT NULL,
  rung TEXT NOT NULL DEFAULT 'ask' CHECK (rung IN ('ask','tell','quiet')),
  accepted_unchanged INTEGER NOT NULL DEFAULT 0,
  since TEXT NOT NULL,
  dropped_at TEXT,
  PRIMARY KEY (agent, kind)
);
CREATE TABLE IF NOT EXISTS undone (
  batch TEXT PRIMARY KEY,
  by_batch TEXT NOT NULL,
  actor TEXT,
  agent TEXT,
  kinds TEXT CHECK (kinds IS NULL OR (json_valid(kinds) AND json_type(kinds) = 'array')),
  undone_by TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS undone_agent ON undone(agent, at) WHERE agent IS NOT NULL;
INSERT OR IGNORE INTO dog_section (table_name, section) VALUES ('ladder', 'local');
INSERT OR IGNORE INTO dog_section (table_name, section) VALUES ('undone', 'local');
`;
