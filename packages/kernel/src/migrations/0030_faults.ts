/**
 * The kernel schema, migration 30: `fault`, work BrainDog does for itself that keeps failing (AGT-C06, DIRECTION §40).
 *
 * ONE ROW A CAUSE. `cause` is `outbox#<kind>` or `schedule#<kind>` (`fault.ts`), so a job that dies every night is one
 * row whose `count` climbs and whose `last_at` moves. `said` is the plain sentence a person reads, written from the
 * job's family; `error` the raw failure, for the operator's door only. `cleared_at` is set when a job of the kind next
 * completes, and a fault raised again opens with it cleared and its `first_at` and count kept.
 *
 * `local`, AS `entity_key` IS (migration 23): a fault is about this installation's machinery on this installation's
 * clock, an export carries none, and a restored copy starts its own.
 *
 * AND THE QUESTIONS THE OLD LADDER FILED CLOSE HERE, ON EVERY RECORD. Until this migration a job dead at the eighth
 * attempt, or a scheduled thing that could not run, opened a `change` question by `system`: "infer.resolve could not be
 * delivered after 8 attempts: ...", "A pull due ... could not run after 8 attempts: ...". Each still open is resolved
 * as `fault`, which is not a decline, so the ladder counts it as nothing, and a `resolve` event by `system` carries the
 * reason as a decision's does. The event's id is a ULID made in SQL: ten characters of the clock in Crockford's
 * alphabet, then sixteen of hex, which the alphabet holds. Events first, while the questions are still open to find.
 *
 * `IF NOT EXISTS`, so `migrate.test.ts` can rewind the ledger and apply it again over itself. The data step finds
 * nothing open the second time.
 */
export default `
CREATE TABLE IF NOT EXISTS fault (
  cause TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  first_at TEXT NOT NULL,
  last_at TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  error TEXT NOT NULL DEFAULT '',
  said TEXT NOT NULL,
  cleared_at TEXT
) WITHOUT ROWID;
INSERT OR IGNORE INTO dog_section (table_name, section) VALUES ('fault', 'local');
INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v, note)
  SELECT
    substr(A.z, ((c.ms >> 45) & 31) + 1, 1) ||
    substr(A.z, ((c.ms >> 40) & 31) + 1, 1) ||
    substr(A.z, ((c.ms >> 35) & 31) + 1, 1) ||
    substr(A.z, ((c.ms >> 30) & 31) + 1, 1) ||
    substr(A.z, ((c.ms >> 25) & 31) + 1, 1) ||
    substr(A.z, ((c.ms >> 20) & 31) + 1, 1) ||
    substr(A.z, ((c.ms >> 15) & 31) + 1, 1) ||
    substr(A.z, ((c.ms >> 10) & 31) + 1, 1) ||
    substr(A.z, ((c.ms >> 5) & 31) + 1, 1) ||
    substr(A.z, ((c.ms >> 0) & 31) + 1, 1) ||
    upper(hex(randomblob(8))),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'system', 'resolve', 'suggestion:' || s.id, 'suggestion', 'fault',
    'This was a fault in BrainDog, not a question for you.'
  FROM suggestion s,
    (SELECT CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER) AS ms) c,
    (SELECT '0123456789ABCDEFGHJKMNPQRSTVWXYZ' AS z) A
  WHERE s.status = 'open' AND s.opened_by = 'system' AND s.body_kind = 'change'
    AND (instr(s.body, 'could not be delivered after') > 0 OR instr(s.body, 'could not run after') > 0)
  ORDER BY s.rowid;
UPDATE suggestion SET status = 'resolved', resolved_as = 'fault'
  WHERE status = 'open' AND opened_by = 'system' AND body_kind = 'change'
    AND (instr(body, 'could not be delivered after') > 0 OR instr(body, 'could not run after') > 0);
`;
