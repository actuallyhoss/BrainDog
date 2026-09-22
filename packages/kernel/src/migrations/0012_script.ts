/**
 * The kernel schema, migration 12: `script`, the ninth kind of declaration, with its schedule kind and its outbox kind.
 *
 * `loop/research-shell-scripts.md` Brief 2. A script is stored as `declaration` rows like the other eight, so it is
 * versioned, attributable, retirable and carried in a pack; its `every:` is a `schedule` row of kind `script`; and a
 * fire writes one `script.run` outbox row that a host leases and runs in a sandbox. The record never runs it.
 *
 * THREE REBUILDS AND NOT THREE ALTERS, because SQLite cannot change a CHECK in place, and each of these lists is a
 * CHECK so that the database refuses a name nothing handles. Every row is copied across unchanged and every index the
 * readers use is made again, the way `0005` rebuilt `schedule` for `call` and `poll`.
 *
 * ONLY SCRIPT'S NAMES. The automations design (`loop/research-shell-automations.md` section 4.5) planned `flow` on the
 * `schedule` CHECK and `infer.ask` on the `outbox` one, and said whichever migration landed second should carry both
 * sets. Migration 11 as written adds neither: a run is a `rule` row told apart by its payload, and it says so because
 * two rebuilds of one table in one batch would drop each other's names. So nothing writes `flow` or `infer.ask`, and a
 * CHECK that admitted them would be a list the database holds and no code does.
 *
 * NOT A FORMAT REVISION, AND ONE DIRECTION IS WORTH SAYING. An older `.brain` file has no `script` rows and imports
 * unchanged. A newer file that carries a `script` declaration fails the CHECK of an older build, which is the
 * refusal an older build should give for a kind it cannot run.
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
  CHECK (kind IN ('register','page','block','ingest','rule','metric','theme','digest','script'))
);
INSERT INTO declaration_next (id, version, kind, pack_id, body, checksum, retired, superseded_at, created_at)
  SELECT id, version, kind, pack_id, body, checksum, retired, superseded_at, created_at FROM declaration;
DROP TABLE declaration;
ALTER TABLE declaration_next RENAME TO declaration;
CREATE INDEX declaration_kind ON declaration(kind) WHERE superseded_at IS NULL AND retired = 0;

CREATE TABLE schedule_next (
  id TEXT PRIMARY KEY, due_at TEXT NOT NULL, kind TEXT NOT NULL,
  key TEXT NOT NULL, payload TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','firing','done','failed','paused')),
  attempts INTEGER NOT NULL DEFAULT 0,
  UNIQUE (kind, key),
  CHECK (kind IN ('digest','reminder','rule','retry','purge','rotate','pull','call','poll','analyse','score','snapshot',
                  'script'))
);
INSERT INTO schedule_next (id, due_at, kind, key, payload, state, attempts)
  SELECT id, due_at, kind, key, payload, state, attempts FROM schedule;
DROP TABLE schedule;
ALTER TABLE schedule_next RENAME TO schedule;
CREATE INDEX schedule_due ON schedule(state, due_at);

CREATE TABLE outbox_next (
  id TEXT PRIMARY KEY, created TEXT NOT NULL, kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','leased','done','failed','dead')),
  leased_until TEXT, attempts INTEGER NOT NULL DEFAULT 0,
  CHECK (kind IN ('notify.email','notify.push','notify.webhook','pull.fetch','export.r2','erase.r2',
                  'infer.embed','infer.prose','infer.draft','script.run'))
);
INSERT INTO outbox_next (id, created, kind, payload, state, leased_until, attempts)
  SELECT id, created, kind, payload, state, leased_until, attempts FROM outbox;
DROP TABLE outbox;
ALTER TABLE outbox_next RENAME TO outbox;
CREATE INDEX outbox_ready ON outbox(state, created);
`;
