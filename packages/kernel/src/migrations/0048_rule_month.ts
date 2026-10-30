/**
 * The kernel schema, migration 48: `rule_month`, how often each rule did its work in each calendar month (sec-follow M5).
 *
 * `rule_stat` (migration 34) KEEPS ONE COUNT A RULE, FOR EVER, and no date but the last. So a screen that said "this
 * month" over a rule could only say whether its last firing fell in the month, never how many times it fired in it,
 * and "Ran 17 times" stood beside "1 run this month" with nothing to tell the two apart (finish F53). This keeps the
 * same count by month: one row a rule a month, `month` as `YYYY-MM` in UTC, the clock every count of runs this month is
 * kept on (`automations.ts`). Raised beside `rule_stat` wherever the work lands (`rules.ts` `raiseStat`).
 *
 * A TABLE BESIDE `rule_stat` AND NOT A COLUMN ON IT, for migration 47's reason: a column holds one month and would be
 * rewritten every first of the month, and `ADD COLUMN` is the one shape that cannot be written `IF NOT EXISTS`.
 *
 * THE BACK-FILL IS MIGRATION 34'S, BY MONTH, from what is already kept, once, here: a run is its `automation_run` row,
 * an inline rule's work its writes in the event log, once per row per triggering write, and a rule with runs counted
 * by its runs alone. Each month's count is what the log holds of that month.
 *
 * `local`, AS `rule_stat` IS: a count of this installation's own machinery, which no export carries, and a restored copy
 * counts from its own start. The format is still 1.
 *
 * ADDITIVE ONLY: no row of any other table is changed or moved, only read, and `IF NOT EXISTS` and `OR IGNORE`, so it can
 * run twice and a count already raised since is kept as it is.
 */
export default `
CREATE TABLE IF NOT EXISTS rule_month (
  rule TEXT NOT NULL,
  month TEXT NOT NULL,
  fired INTEGER NOT NULL,
  PRIMARY KEY (rule, month)
) WITHOUT ROWID;
INSERT OR IGNORE INTO dog_section (table_name, section) VALUES ('rule_month', 'local');
INSERT OR IGNORE INTO rule_month (rule, month, fired)
  SELECT rule, substr(at, 1, 7), count(*) FROM (
    SELECT r.rule AS rule, r.started_at AS at
    FROM automation_run r
    UNION ALL
    SELECT substr(e.actor, 6) AS rule, max(e.ts) AS at
    FROM event e
    WHERE e.actor LIKE 'rule:%' AND e.target_kind = 'entry' AND e.target LIKE 'entry:%' AND e.kind <> 'note'
      AND NOT EXISTS (SELECT 1 FROM automation_run r WHERE r.rule = substr(e.actor, 6))
    GROUP BY e.actor, coalesce(e.batch, e.id), e.target
  )
  WHERE rule <> '' AND at IS NOT NULL AND length(at) >= 7
  GROUP BY rule, substr(at, 1, 7);
`;
