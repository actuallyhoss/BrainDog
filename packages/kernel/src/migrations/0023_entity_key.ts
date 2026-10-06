/**
 * The kernel schema, migration 23: `entity_key`, the identities the record knows, and `infer.resolve` on the outbox.
 *
 * ONE LIVE ROW PER KEY. A key is `kind:value` (`identity-keys.ts`): an email, a login, a payee, a domain. The table is
 * derived from the rows of the lists that play `meets:` or `org:`, kept in the write path in the same transaction as the
 * row, the way `entry_fts` is (`entities.ts`'s `rekey`). It is what makes a duplicate person impossible by construction:
 * meeting an address the record already holds finds its row here, and never makes a second. A merged row's keys point at
 * the row it was folded into, so a second address of somebody already merged still finds them.
 *
 * `entity_mention` IS A NAME MET WITH NOTHING THAT IDENTIFIES IT. A name alone never makes a person, because two people
 * share a name often enough that joining on it folds strangers together, so it is kept here with where it was seen, one
 * line per name, kind, project and source, for a later pass that finds a key or a relationship.
 *
 * BOTH ARE `local` AND NEITHER TRAVELS. Each is rebuilt from rows that do travel: an import keys every row again when
 * it ends (`rebuildKeys`), so a `.brain` file carries no copy that could disagree with its rows, and an older file
 * imports unchanged. The backfill of the rows already here runs in `migrate.ts` once this has applied, because a key
 * is normalised by code (Gmail's dots, GitHub's private address) that SQL cannot run.
 *
 * `IF NOT EXISTS` ON THE TWO NEW TABLES, so a ledger rewound past this migration (as `migrate.test.ts` rewinds one to
 * re-run the outbox rebuilds) applies it again over tables that are already there.
 *
 * `infer.resolve` JOINS THE OUTBOX'S `CHECK`, the nightly batch of doubtful pairs a model is asked about, as `0013`
 * rebuilt it for `infer.ask`: every row copied across unchanged and its one index made again. Not a format revision,
 * for `0012`'s reason: an older file has no such rows.
 */
export default `
CREATE TABLE IF NOT EXISTS entity_key (
  key TEXT PRIMARY KEY,
  register TEXT NOT NULL,
  row_id TEXT NOT NULL,
  source TEXT,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS entity_key_row ON entity_key(row_id);
CREATE TABLE IF NOT EXISTS entity_mention (
  name_key TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  project TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY (name_key, kind, project, source)
);
INSERT OR IGNORE INTO dog_section (table_name, section) VALUES ('entity_key', 'local');
INSERT OR IGNORE INTO dog_section (table_name, section) VALUES ('entity_mention', 'local');
CREATE TABLE outbox_next (
  id TEXT PRIMARY KEY, created TEXT NOT NULL, kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','leased','done','failed','dead')),
  leased_until TEXT, attempts INTEGER NOT NULL DEFAULT 0,
  CHECK (kind IN ('notify.email','notify.push','notify.webhook','pull.fetch','export.r2','erase.r2',
                  'infer.embed','infer.prose','infer.draft','script.run','infer.ask','infer.resolve'))
);
INSERT INTO outbox_next (id, created, kind, payload, state, leased_until, attempts)
  SELECT id, created, kind, payload, state, leased_until, attempts FROM outbox;
DROP TABLE outbox;
ALTER TABLE outbox_next RENAME TO outbox;
CREATE INDEX outbox_ready ON outbox(state, created);
`;
