/**
 * The kernel schema, migration 17: `automation_watch`, the side of its line a watched figure was last read on, and two
 * indexes two readers were scanning without.
 *
 * A `metric` TRIGGER STARTS A RUN WHEN ITS FIGURE CROSSES A LINE, AND A CROSSING IS A CHANGE OF SIDE. One reading says
 * where a figure is and nothing about whether it moved, so the side read last has to be kept between the hourly sweeps
 * that read it (`flow.ts`'s `onMetrics`). One row per rule and per key, the key being the figure's id, so a rule edited
 * to watch another figure starts again from a first reading, which sets the side and starts nothing. `at` is when the
 * figure was last read, and the sweep reads the longest unread first.
 *
 * `side` IS NULL UNTIL A READING SAYS ONE. A figure whose reading says nothing (no such figure, mixed currencies) is
 * still read, and its row keeps when, so it sorts behind the figures not yet read: with no row at all it would sort
 * first every hour, and more than one sweep's worth of such rules would keep every other figure unread.
 *
 * NO CHECK ON `side`. The words are the runner's (`above`, `below`), and a CHECK would make a third one a table rebuild
 * and a migration, where a new word in the runner is a line.
 *
 * `inbox_raw(state)`: the inbox and its counts read arrivals by state, and the table had no index but its key.
 * `automation_step(answer)`: `chainOfJob` finds the runs that queued a script job by the job's id, which a step keeps as
 * its answer, and read every script step the record keeps to do it.
 *
 * `IF NOT EXISTS`, AS 11 IS, for its reason: a test that stands in for an older record rewinds the ledger and leaves the
 * tables, so this runs again over them.
 *
 * `local`, AS `automation_run` IS, and not a format revision: a watch says where a figure stood at this installation's
 * last sweep, which a restored copy reads again at its own first sweep. It holds a rule id, a figure id, a word and an
 * instant, and none of a person's words.
 */
export default `
CREATE TABLE IF NOT EXISTS automation_watch (
  rule TEXT NOT NULL,
  key TEXT NOT NULL,
  side TEXT,
  at TEXT NOT NULL,
  PRIMARY KEY (rule, key)
);
CREATE INDEX IF NOT EXISTS inbox_raw_state ON inbox_raw(state);
CREATE INDEX IF NOT EXISTS automation_step_answer ON automation_step(answer) WHERE answer IS NOT NULL;
INSERT OR IGNORE INTO dog_section (table_name, section) VALUES ('automation_watch', 'local');
`;
