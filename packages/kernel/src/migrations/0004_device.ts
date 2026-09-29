/**
 * The kernel schema, migration 4: `device_grant` rebuilt with a seventh reach and a scope.
 *
 * `vault` is the reach an agent's machine asks for to open keys, and `scope` says which: a project's
 * row id, or `*` for the keys that belong to no project.
 *
 * A REBUILD AND NOT AN ALTER, because SQLite cannot change a CHECK in place, and the list of reaches
 * is a CHECK so that the database refuses an eighth. The table is `local`: it never travels, no
 * `.brain` carries it, and the format stays 1. Every row is copied across unchanged.
 */
export default `
CREATE TABLE device_grant_next (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','active','expired','denied','revoked')),
  reach TEXT NOT NULL DEFAULT 'login'
        CHECK (reach IN ('login','runner','export','import','pack','token','vault')),
  scope TEXT,                               -- a vault reach only: a project row id, or '*'
  label TEXT, ua TEXT,
  token_hash TEXT, tries INTEGER NOT NULL DEFAULT 0,
  expires TEXT NOT NULL,
  approved_by TEXT, approved_at TEXT, last_used TEXT
);
INSERT INTO device_grant_next (id, code_hash, status, reach, label, ua, token_hash, tries, expires, approved_by, approved_at, last_used)
  SELECT id, code_hash, status, reach, label, ua, token_hash, tries, expires, approved_by, approved_at, last_used FROM device_grant;
DROP TABLE device_grant;
ALTER TABLE device_grant_next RENAME TO device_grant;
`;
