/**
 * The kernel schema, migration 43: shares, groups, token narrowing and the access log (sharing plan §2.2).
 *
 * A SHARE IS ONE ROW: who, what, at which rung, with hidden fields and time, as an allow or a deny. `what`, `caps`,
 * `hide` and `hours` hold JSON (`lens.ts` reads them), and `what` names lists and rows by id, never by name, so renaming
 * a project never widens a share. A group is a name and its members. `token_lens` narrows one token further than its
 * person, and is a side table rather than columns on `token`: rebuilding `token` twice would null a child's parent and
 * quietly turn it into a root. `access_via` keeps which share admitted a write, `access_seen` counts reads by share.
 *
 * ADDITIVE ONLY, nothing is rebuilt. Shares and groups travel with `member` in `governance`, write provenance with
 * `event` in `origin`; token links and read counters belong to one installation, so they are `local`. An older reader
 * skips a table it has no shape for, so the format is still 1. The `access` counter is the access epoch, bumped with
 * every change to who holds what. It is not seeded here: like every register's counter it is made at its first bump
 * (`shares.ts`), so a fresh record holds no row an import would count as content.
 *
 * `IF NOT EXISTS` and `OR IGNORE`, so it can run twice, as `migrate.test.ts` runs every migration over itself.
 */
export default `
CREATE TABLE IF NOT EXISTS share (
  id TEXT PRIMARY KEY,
  bundle TEXT,
  effect TEXT NOT NULL DEFAULT 'allow' CHECK (effect IN ('allow','deny')),
  who_kind TEXT NOT NULL CHECK (who_kind IN ('person','group','email','link')),
  who TEXT NOT NULL,
  what TEXT NOT NULL CHECK (json_valid(what)),
  can TEXT NOT NULL CHECK (can IN ('view','comment','edit','manage')),
  caps TEXT CHECK (caps IS NULL OR json_valid(caps)),
  hide TEXT CHECK (hide IS NULL OR json_valid(hide)),
  starts_at TEXT, ends_at TEXT,
  hours TEXT CHECK (hours IS NULL OR json_valid(hours)),
  once INTEGER NOT NULL DEFAULT 0 CHECK (once IN (0,1)), first_used_at TEXT,
  template TEXT, note TEXT,
  parent_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  made_by TEXT NOT NULL, made_at TEXT NOT NULL, revoked_at TEXT, revoked_by TEXT
);
CREATE INDEX IF NOT EXISTS share_who ON share(who_kind, who) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS share_parent ON share(parent_id) WHERE parent_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS share_group (id TEXT PRIMARY KEY, name TEXT NOT NULL, made_by TEXT NOT NULL,
  made_at TEXT NOT NULL, retired_at TEXT);
CREATE TABLE IF NOT EXISTS share_group_member (group_id TEXT NOT NULL, person_id TEXT NOT NULL,
  added_by TEXT NOT NULL, added_at TEXT NOT NULL, PRIMARY KEY (group_id, person_id)) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS share_group_person ON share_group_member(person_id);
CREATE TABLE IF NOT EXISTS token_lens (token_id TEXT PRIMARY KEY, parent_id TEXT,
  narrow TEXT CHECK (narrow IS NULL OR json_valid(narrow)), made_by TEXT NOT NULL, made_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS token_lens_parent ON token_lens(parent_id) WHERE parent_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS access_via (batch TEXT PRIMARY KEY, who TEXT NOT NULL,
  via TEXT NOT NULL CHECK (json_valid(via)), at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS access_seen (day TEXT NOT NULL, who TEXT NOT NULL, via TEXT NOT NULL,
  what TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 1, last_at TEXT NOT NULL,
  PRIMARY KEY (day, who, via, what)) WITHOUT ROWID;
INSERT OR IGNORE INTO dog_section (table_name, section) VALUES
  ('share','governance'), ('share_group','governance'), ('share_group_member','governance'),
  ('access_via','origin'), ('token_lens','local'), ('access_seen','local');
`;
