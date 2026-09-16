/**
 * The kernel schema, migration 5: `schedule` rebuilt with two more kinds, `call` and `poll`.
 *
 * `call` is an outbound POST a schedule fires, and `poll` fetches an endpoint and acts through a rule
 * when the answer changes (`loop/DIRECTION.md` §0b, `07 §1`, `09 §1`). Both are declared inside an
 * `ingest`, like `pull`, and both are armed and drained like it.
 *
 * A REBUILD AND NOT AN ALTER, because SQLite cannot change a CHECK in place, and the list of kinds is
 * a CHECK so that the database refuses a thirteenth. Every row is copied across unchanged, and the
 * index the claim reads is made again. The format stays 1: no `.brain` carries a schedule row.
 */
export default `
CREATE TABLE schedule_next (
  id TEXT PRIMARY KEY, due_at TEXT NOT NULL, kind TEXT NOT NULL,
  key TEXT NOT NULL, payload TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','firing','done','failed','paused')),
  attempts INTEGER NOT NULL DEFAULT 0,
  UNIQUE (kind, key),
  CHECK (kind IN ('digest','reminder','rule','retry','purge','rotate','pull','call','poll','analyse','score','snapshot'))
);
INSERT INTO schedule_next (id, due_at, kind, key, payload, state, attempts)
  SELECT id, due_at, kind, key, payload, state, attempts FROM schedule;
DROP TABLE schedule;
ALTER TABLE schedule_next RENAME TO schedule;
CREATE INDEX schedule_due ON schedule(state, due_at);
`;
