/**
 * The kernel schema, migration 32: a key keeps its command's build and its last tool call.
 *
 * `token.last_build` IS THE BUILD OF THE COMMAND BEHIND A KEY, as the command last said it (`x-braindog-cli`, a day and
 * a commit, `2026.10.09+1a2b3c4`, or `dev+` and a commit from a checkout). Written by `verifyToken` in the statement that
 * already writes `last_used_at`, so a call costs no write more. A value that is not a build is never stored: the column
 * holds no key, no path and no host.
 *
 * `token.last_tool_at` IS WHEN A SESSION ON THIS KEY LAST CALLED A TOOL, written by `noteTool` and by nothing else. A key
 * that is used but calls nothing is the week his record had no tools and nothing said so.
 *
 * A REBUILD AND NOT TWO `ADD COLUMN`S, for migration 25's reason: `migrate.test.ts` rewinds the ledger and applies this
 * again over itself. Every row is copied with its `rowid` and every column it had, the two new ones last, where
 * `ADD COLUMN` would have put them. Applied again, the two start over at NULL, since SQL cannot name a column that may
 * not be there yet: they are marks of use, which the next call writes again, and nothing in production applies a
 * migration twice (an import seats its rows and never rewinds the ledger, `brainl.ts`).
 *
 * NOT A FORMAT REVISION. `token` is `local` and no `.brain` file carries it.
 */
export default `
CREATE TABLE token_next (
  id TEXT PRIMARY KEY, person_id TEXT NOT NULL, hash TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('read','propose','write')),
  label TEXT, created_at TEXT NOT NULL,
  last_used_at TEXT, last_surface TEXT,
  expires_at TEXT, revoked_at TEXT,
  reach TEXT CHECK (reach IS NULL OR (json_valid(reach) AND json_type(reach) = 'array')),
  client_id TEXT,
  client_kind TEXT CHECK (client_kind IS NULL OR client_kind IN ('cimd','dcr','device','key')),
  host TEXT,
  last_build TEXT,
  last_tool_at TEXT
);
INSERT INTO token_next (rowid, id, person_id, hash, scope, label, created_at, last_used_at, last_surface, expires_at, revoked_at, reach, client_id, client_kind, host, last_build, last_tool_at)
  SELECT rowid, id, person_id, hash, scope, label, created_at, last_used_at, last_surface, expires_at, revoked_at, reach, client_id, client_kind, host, NULL, NULL
  FROM token;
DROP TABLE token;
ALTER TABLE token_next RENAME TO token;
`;

