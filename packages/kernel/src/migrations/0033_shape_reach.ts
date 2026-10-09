/**
 * The kernel schema, migration 33: `device_grant` rebuilt with an eighth reach, `shape` (PRF-A13).
 *
 * `shape` IS A STANDING GRANT THAT TAKES SHAPE COPIES AND READS NOTHING ELSE. Approved once with six digits, it lets the
 * owner's own machine take a copy of the record whose words, numbers and dates are scrambled (`shape.ts`), so the look
 * and the gates can draw a record shaped like his without a word of it. Its bearer is held only as `token_hash` on its
 * row, as every reach but `login` is, so no door that reads `token` takes it.
 *
 * A REBUILD AND NOT AN ALTER, for migration 4's reason: the list of reaches is a CHECK, and SQLite cannot change one in
 * place. Every row is copied with its `rowid` and every column it had, `scope` included, so applied again over itself
 * (`migrate.test.ts` rewinds the ledger) it leaves the rows as they were.
 *
 * NOT A FORMAT REVISION. `device_grant` is `local` and no `.brain` file carries it.
 */
export default `
CREATE TABLE device_grant_next (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','active','expired','denied','revoked')),
  reach TEXT NOT NULL DEFAULT 'login'
        CHECK (reach IN ('login','runner','export','import','pack','token','vault','shape')),
  scope TEXT,
  label TEXT, ua TEXT,
  token_hash TEXT, tries INTEGER NOT NULL DEFAULT 0,
  expires TEXT NOT NULL,
  approved_by TEXT, approved_at TEXT, last_used TEXT
);
INSERT INTO device_grant_next (rowid, id, code_hash, status, reach, scope, label, ua, token_hash, tries, expires, approved_by, approved_at, last_used)
  SELECT rowid, id, code_hash, status, reach, scope, label, ua, token_hash, tries, expires, approved_by, approved_at, last_used FROM device_grant;
DROP TABLE device_grant;
ALTER TABLE device_grant_next RENAME TO device_grant;
`;
