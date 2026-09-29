/**
 * The kernel schema, migration 8: `suggestion` rebuilt with three more bodies, `pack`, `settings` and `arrange`.
 *
 * They are how an agent, or Slash, asks to change what a record is: install, turn on or turn off a pack, change a
 * pack's settings such as its voice, or several of those and pages as one arrangement. Each is applied only when the
 * owner accepts it (`govern.ts`).
 *
 * A REBUILD AND NOT AN ALTER, because SQLite cannot change a CHECK in place, and the list of bodies is a
 * CHECK so that the database refuses one nothing can apply. Every row is copied across unchanged. The format
 * stays 1: a file written before this build carries only the four bodies, which this table still takes.
 */
export default `
CREATE TABLE suggestion_next (
  id TEXT PRIMARY KEY,
  body_kind TEXT NOT NULL,
  body TEXT NOT NULL, status TEXT NOT NULL,
  opened_by TEXT NOT NULL, opened_at TEXT NOT NULL,
  resolved_as TEXT,
  defer_until TEXT, defer_why TEXT,
  CHECK (body_kind IN ('options','pattern','rowset','change','pack','settings','arrange'))
);
INSERT INTO suggestion_next (id, body_kind, body, status, opened_by, opened_at, resolved_as, defer_until, defer_why)
  SELECT id, body_kind, body, status, opened_by, opened_at, resolved_as, defer_until, defer_why FROM suggestion;
DROP TABLE suggestion;
ALTER TABLE suggestion_next RENAME TO suggestion;
`;
