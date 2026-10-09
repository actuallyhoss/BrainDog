/**
 * The kernel schema, migration 34: `rule_stat`, how often each rule has done something and what it last did (SHL-D07).
 *
 * ONE ROW A RULE, keyed by the rule's own name (`body.rule`, the same name `rule:<name>` carries as an actor and
 * `automation_run.rule` holds). `fired` is how many times its work landed: an inline rule's patch on one row, or a run
 * opened. `last_at` is when it last did, and `last_row` the row it last did it on, by its id, a handle and never words.
 * A rule with no row here has never fired, which is what "never" on the Automations page reads (`rules.ts` and
 * `flow.ts` raise the count from now on).
 *
 * THE BACK-FILL IS FROM WHAT IS ALREADY KEPT, once, here. A run is its `automation_run` row, with the row its trigger
 * named. An inline rule's work is its writes in the event log: every line by `rule:<name>` on a row, outside a note,
 * counted once per row per triggering write (`batch`), since one patch writes a line per field. A rule that has runs is
 * counted by its runs alone, because a run's steps write as `rule:<name>` too and would count twice.
 *
 * `local`, AS `fault` IS (migration 30): a count of this installation's own machinery. An export carries none, and a
 * restored copy counts from its own start.
 *
 * `IF NOT EXISTS` AND `OR IGNORE`, so `migrate.test.ts` can rewind the ledger and apply it again over itself, and a count
 * already raised since is kept as it is.
 */
export default `
CREATE TABLE IF NOT EXISTS rule_stat (
  rule TEXT PRIMARY KEY,
  fired INTEGER NOT NULL,
  last_at TEXT,
  last_row TEXT
) WITHOUT ROWID;
INSERT OR IGNORE INTO dog_section (table_name, section) VALUES ('rule_stat', 'local');
INSERT OR IGNORE INTO rule_stat (rule, fired, last_at, last_row)
  SELECT rule, count(*), max(at), on_row FROM (
    SELECT r.rule AS rule, r.started_at AS at,
      CASE WHEN json_valid(r.trigger) THEN json_extract(r.trigger, '$.entry') END AS on_row
    FROM automation_run r
    UNION ALL
    SELECT substr(e.actor, 6) AS rule, max(e.ts) AS at, substr(e.target, 7) AS on_row
    FROM event e
    WHERE e.actor LIKE 'rule:%' AND e.target_kind = 'entry' AND e.target LIKE 'entry:%' AND e.kind <> 'note'
      AND NOT EXISTS (SELECT 1 FROM automation_run r WHERE r.rule = substr(e.actor, 6))
    GROUP BY e.actor, coalesce(e.batch, e.id), e.target
  )
  WHERE rule <> ''
  GROUP BY rule;
`;
