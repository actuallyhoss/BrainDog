/**
 * The kernel schema, migration 24: `look`, the eleventh kind of declaration.
 *
 * A look is laid over a page as it is read: which of its blocks leads, their order, which are hidden, the headline line
 * and the one next action (`compose.ts`). It is composed from the record by a rule or by Slash, or set by the owner, and
 * it is a declaration like the page it is laid over, versioned, so a look can be undone and an owner's pins kept.
 *
 * ONE REBUILD AND NOT AN ALTER, because SQLite cannot change a CHECK in place. `declaration.kind` takes `look` beside
 * the kinds it held after migration 18, every row is copied across unchanged with its `checksum` and its `pack_id`, and
 * the one index the readers use is made again, exactly as `0018_jobs.ts` rebuilt the same table.
 *
 * NOT A FORMAT REVISION. An older file carries only the kinds it still takes. A newer file carrying a look fails the
 * CHECK of an older build, which is the refusal an older build should give for a kind it cannot draw.
 */
export default `
CREATE TABLE declaration_next (
  id       TEXT NOT NULL,
  version  INTEGER NOT NULL DEFAULT 1,
  kind     TEXT NOT NULL,
  pack_id  TEXT,
  body     TEXT NOT NULL,
  checksum TEXT NOT NULL,
  retired  INTEGER NOT NULL DEFAULT 0,
  superseded_at TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (id, version),
  CHECK (kind IN ('register','page','block','ingest','rule','metric','theme','digest','script','job','look'))
);
INSERT INTO declaration_next (id, version, kind, pack_id, body, checksum, retired, superseded_at, created_at)
  SELECT id, version, kind, pack_id, body, checksum, retired, superseded_at, created_at FROM declaration;
DROP TABLE declaration;
ALTER TABLE declaration_next RENAME TO declaration;
CREATE INDEX declaration_kind ON declaration(kind) WHERE superseded_at IS NULL AND retired = 0;
`;
