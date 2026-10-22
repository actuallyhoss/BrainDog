/**
 * The kernel schema, migration 27: `sign_reading`, a record's vital signs a row a day (PRF-A01).
 *
 * ONE ROW A SIGN A DAY. `sign` is an id from `VITAL_SIGNS` (`signs.ts`), `day` the record's local calendar day the
 * reading is of, `YYYY-MM-DD`. The night's handler writes the day that ended; a sign the record or the host files
 * through `fileSignReading` writes today's, and the latest filing of a day replaces the earlier one.
 *
 * `state` IS ONE OF THREE: green, red, and `none`, nothing to judge by. A day with nothing to judge by is not a green day.
 *
 * `value` the one number the sign is about (a count, an age in days), or NULL. `said` the one sentence a person reads.
 * `facts` a JSON list of short lines behind it. `rule` a hash of the reader's thresholds and version, so a reading made
 * under an older rule can be told from one made under today's. `hand` who filed it: `kernel` for the readers in
 * `signs.ts`, `record` or `host` for the four signs those layers own. `read_at` the instant it was read.
 *
 * `local`, AS `observation` IS IN SPIRIT, and not a format revision: a reading is about this installation's record on
 * this installation's clock, and a restored copy reads its own the next night. Pruned at 400 days by the night itself.
 *
 * `IF NOT EXISTS`, so `migrate.test.ts` can rewind the ledger and apply it again over itself.
 */
export default `
CREATE TABLE IF NOT EXISTS sign_reading (
  sign TEXT NOT NULL,
  day TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('green','red','none')),
  value INTEGER,
  said TEXT NOT NULL,
  facts TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(facts) AND json_type(facts) = 'array'),
  rule TEXT NOT NULL,
  hand TEXT NOT NULL,
  read_at TEXT NOT NULL,
  PRIMARY KEY (sign, day)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS sign_reading_day ON sign_reading(day);
INSERT OR IGNORE INTO dog_section (table_name, section) VALUES ('sign_reading', 'local');
`;
