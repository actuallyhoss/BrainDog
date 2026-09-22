/**
 * The kernel schema, migration 11: `automation_run` and `automation_step`, a run of an automation and what each of its
 * steps did (`loop/research-shell-automations.md` §4.5).
 *
 * WHAT WAS MISSING WAS A RUN THAT SURVIVES BETWEEN STEPS. Rules finish inside one write, scheduled actions hand off and
 * forget, and neither can wait an hour and then carry on. A run is a row that says which step comes next, and each step
 * it has taken is a row of its own, so a restart in the middle of a wait loses nothing: the drain reads the row and
 * continues. Nothing about a run is kept in memory.
 *
 * `version` PINS THE DECLARATION FOR THE RUN'S LIFE. A run that waits a day while somebody edits the rule finishes the
 * steps it started with, because `step` is an index into THAT version's steps, and the same index into an edited list
 * would be a different step.
 *
 * `n` IS THE STEP'S PLACE IN THE FLATTENED PLAN, not a counter. A plan has no loops, so each place is reached at most
 * once per run and `(run, n)` is a key; a branch that was not taken simply has no rows.
 *
 * NO NEW SCHEDULE KIND, AND SO NO `schedule` REBUILD. A run due now or waking from a wait is a `rule` row keyed
 * `flow.run:<id>`, and a clock trigger one keyed `flow.every:<rule>`, told apart from a rule's own reminders by the
 * payload, which is how `snapshot` already carries the ledger's night. The scripts migration beside this one rebuilds
 * the `schedule` CHECK for its own kind, and two rebuilds of one table in one batch, each listing the kinds it knew, is
 * a CHECK that silently drops the other's.
 *
 * `IF NOT EXISTS`, AS 6, 7 AND 9 ARE. The tests that stand in for an older record rewind the ledger and leave the
 * tables, so every later migration is applied again over them; a bare `CREATE TABLE` fails that with "already exists".
 *
 * `local`, NOT A TRAVELLING SECTION, and not a format revision. §4.5 calls runs origin data; carrying a table in a
 * `.brain` file means a format revision and a reader for it in `brainl.ts`, and that is a decision for whoever owns the
 * file format, taken with the run history there is to carry. Until then a run's one lasting line is its metered `pull`
 * event, which does travel.
 */
export default `
CREATE TABLE IF NOT EXISTS automation_run (
  id TEXT PRIMARY KEY,
  rule TEXT NOT NULL,
  version INTEGER NOT NULL,
  trigger TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','running','waiting','done','failed','cancelled')),
  step INTEGER NOT NULL DEFAULT 0,
  vars TEXT NOT NULL DEFAULT '{}',
  depth INTEGER NOT NULL DEFAULT 0,
  project TEXT,
  actor TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  say TEXT
);
CREATE INDEX IF NOT EXISTS automation_run_rule ON automation_run(rule, started_at);
CREATE INDEX IF NOT EXISTS automation_run_finished ON automation_run(finished_at) WHERE finished_at IS NOT NULL;
CREATE TABLE IF NOT EXISTS automation_step (
  run TEXT NOT NULL,
  n INTEGER NOT NULL,
  kind TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('done','waiting','failed','skipped')),
  answer TEXT,
  ms INTEGER,
  at TEXT NOT NULL,
  PRIMARY KEY (run, n)
);
INSERT OR IGNORE INTO dog_section (table_name, section) VALUES ('automation_run', 'local');
INSERT OR IGNORE INTO dog_section (table_name, section) VALUES ('automation_step', 'local');
`;
