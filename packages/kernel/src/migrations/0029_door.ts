/**
 * The kernel schema, migration 29: `door_mark`, how each run met the agent door (AGT-B01).
 *
 * ONE ROW A RUN A KIND. `run` is who the door heard: a run's name, `S42`, or `token:` and the token's id when the caller
 * has no run, because a mark never opens one. `kind` is one of `DOOR_KINDS` (`door.ts`). `at` the instant it was last
 * heard, ISO, so the signs count the sessions whose marks fall in a window.
 *
 * `n` ADDS UP, and for two kinds it is a size. A hello, a call, an INTERNAL answer each add their `n` (1 when the mark
 * gives none), so `called` holds the calls a session made. `listed` keeps the most tools a session was sent and `card`
 * the most words its card held, because adding two lists' lengths says nothing. `ms` keeps the slowest the run took,
 * for the start hook and a list of resources. `build` and `client` keep the latest a mark named, so a session that
 * updates its command mid-way reads as the build it ended on.
 *
 * `local`, AS `sign_reading` IS: a mark is about this installation's door on this installation's clock, an export
 * carries none and a restored copy starts its own. Swept at 30 days by the hourly sweep (`sweepDoorMarks`).
 *
 * `IF NOT EXISTS`, so `migrate.test.ts` can rewind the ledger and apply it again over itself.
 */
export default `
CREATE TABLE IF NOT EXISTS door_mark (
  run TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('hello','listed','called','hook','resource','card','internal')),
  at TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  ms INTEGER,
  build TEXT,
  client TEXT,
  PRIMARY KEY (run, kind)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS door_mark_at ON door_mark(at);
INSERT OR IGNORE INTO dog_section (table_name, section) VALUES ('door_mark', 'local');
`;
