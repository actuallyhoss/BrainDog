/**
 * The kernel schema, migration 38: `pack.waiting` (SHL-A08).
 *
 * A PART OF AN ADD-ON CAN WAIT FOR WHAT THE RECORD HOLDS (`when: { holds }`): a plan takes it out until the record has
 * the thing it names, and says so in `waiting`, one `{ at, holds }` per part. The plan is gone the moment the install
 * lands, so the record had nowhere to read afterwards which add-ons still have parts held back, and so nothing to plan
 * again when People arrives. This column is that fact, kept beside the add-on it is about.
 *
 * JSON, `[{ "at": ..., "holds": [...] }]`, AND NULL WHEN NOTHING WAITS, never `[]`: the read that asks who to plan
 * again is `WHERE waiting IS NOT NULL`, and one spelling of "nothing" keeps it honest.
 *
 * A COLUMN AND NOT A TABLE, as migration 3's `disabled_at` is, and NULL on every existing row, because no add-on
 * installed before this migration could say `when`. An older `.brain` file has no such column and imports with nothing
 * waiting, which is what it had when it was written, so the format is still 1.
 *
 * A REBUILD AND NOT AN `ADD COLUMN`, for migration 25's reason: `migrate.test.ts` rewinds the ledger and applies this
 * again over itself, and `ADD COLUMN` is the one shape that cannot run twice. Every row is copied with its `rowid` and
 * every column it had, the new one last, where `ADD COLUMN` would have put it, so a positional read is the same either
 * way. Applied again, `waiting` starts over at NULL, since SQL cannot name a column that may not be there yet: the next
 * install writes it again, and nothing in production applies a migration twice. `pack` has no index but its key's own,
 * no trigger, and nothing points at it with a foreign key, so there is nothing to make again after the rename.
 */
export default `
CREATE TABLE pack_next (
  id           TEXT PRIMARY KEY,
  version      TEXT NOT NULL,
  source       TEXT NOT NULL,
  source_ref   TEXT,
  manifest     TEXT NOT NULL,
  installed_at TEXT NOT NULL,
  checksum     TEXT NOT NULL,
  disabled_at  TEXT,
  waiting      TEXT
);
INSERT INTO pack_next (rowid, id, version, source, source_ref, manifest, installed_at, checksum, disabled_at, waiting)
  SELECT rowid, id, version, source, source_ref, manifest, installed_at, checksum, disabled_at, NULL
  FROM pack;
DROP TABLE pack;
ALTER TABLE pack_next RENAME TO pack;
`;
