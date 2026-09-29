/**
 * The kernel schema, migration 18: `job`, the tenth kind of declaration, and a job's kind as the id of one.
 *
 * A job is a run of Claude Code on the owner's own machine. What a run may do (its prompt, its tools, the folder it
 * works in, its turns and how it asks) is a `job.<id>` declaration, approved once in Decide as any change is, versioned
 * and carried in a pack like every other kind (`jobs.ts`). A row of `job` names one of those declarations and fills its
 * arguments.
 *
 * TWO REBUILDS AND NOT TWO ALTERS, because SQLite cannot change a CHECK in place. `declaration.kind` takes `job` beside
 * the kinds it held after migration 12, and every row is copied across unchanged, with its `checksum` and its `pack_id`,
 * and the one index the readers use is made again, the way `0012_script.ts` rebuilt the same table.
 *
 * `job.kind` LOSES ITS CHECK. The first design closed it on a fixed list of kinds, each checked against a template the
 * runner held, and none was ever built: no code before this migration wrote a row of it, so nothing is lost with the
 * list. A kind is now whatever the owner approved, and its id is checked where a job is started (`createJob`), against
 * the live declarations, which a CHECK of names could never know. `status` keeps its list, since the queue writes
 * exactly those.
 *
 * TWO NEW COLUMNS, BOTH NULLABLE. `about` is the row a job was started about, by its spoken id (`clients#4`, `S47`),
 * which `createJob` takes and nothing had a column for. `cost_currency` is the currency of `cost_minor`, which migration
 * 1 kept without one: a cost is an amount in minor units, and the runner that reports it says which currency it is in,
 * since the record has no way to choose one for it. Every other column is kept as migration 1 wrote it, and each row
 * is copied into the one of the same name; no row held a cost, so none is left without its currency.
 *
 * `job_status` IS THE ONE INDEX. A claim takes the oldest queued job and the sweep finds the ones waiting past their
 * day and the ones whose runner stopped answering, all three by `status` and then by age.
 *
 * NOT A FORMAT REVISION. `job` and `job_event` are `local`, so no `.brain` file carries either, and an older file carries
 * only the declaration kinds it still takes. A newer file carrying a `job` declaration fails the CHECK of an older
 * build, which is the refusal an older build should give for a kind it cannot run.
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
  CHECK (kind IN ('register','page','block','ingest','rule','metric','theme','digest','script','job'))
);
INSERT INTO declaration_next (id, version, kind, pack_id, body, checksum, retired, superseded_at, created_at)
  SELECT id, version, kind, pack_id, body, checksum, retired, superseded_at, created_at FROM declaration;
DROP TABLE declaration;
ALTER TABLE declaration_next RENAME TO declaration;
CREATE INDEX declaration_kind ON declaration(kind) WHERE superseded_at IS NULL AND retired = 0;

CREATE TABLE job_next (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  args TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued','claimed','ok','needs_decision','refused','limit','error','interrupted','cancelled')),
  runner_id TEXT, claimed_at TEXT, lease_until TEXT,
  seq INTEGER NOT NULL DEFAULT 0,
  cancel INTEGER NOT NULL DEFAULT 0,
  session TEXT,
  created_at TEXT NOT NULL, expires TEXT NOT NULL,
  claude_session TEXT, result TEXT, error TEXT,
  cost_minor INTEGER, turns INTEGER, ms INTEGER,
  about TEXT,
  cost_currency TEXT
);
INSERT INTO job_next (id, kind, args, status, runner_id, claimed_at, lease_until, seq, cancel, session, created_at, expires,
                      claude_session, result, error, cost_minor, turns, ms)
  SELECT id, kind, args, status, runner_id, claimed_at, lease_until, seq, cancel, session, created_at, expires,
         claude_session, result, error, cost_minor, turns, ms FROM job;
DROP TABLE job;
ALTER TABLE job_next RENAME TO job;
CREATE INDEX job_status ON job(status, created_at);
`;
