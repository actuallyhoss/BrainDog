/**
 * The kernel schema, migration 31: a question has a cause (AGT-C07, D40.50).
 *
 * `suggestion.cause` IS THE KEY FOR WHAT A QUESTION IS ABOUT, and one open question holds a cause at a time: a unique
 * index over the cause of the open ones, so the database refuses a second even when a caller forgot to look. A closed
 * question keeps its cause, and any number of closed ones may share it, since asking again after an answer is allowed.
 *
 * `decision.cause` IS THE SAME KEY ON THE ANSWER, so a question asked again can be found with the answer it was given
 * (AGT-C08). Indexed with the decision's time, newest answer first. A decision filled from the question it settled,
 * paired as `govern.ts`'s `SETTLED` pairs them, when that question carried one.
 *
 * TWO REBUILDS AND NOT TWO `ADD COLUMN`S, for migration 25's reason: `migrate.test.ts` rewinds the ledger and applies
 * this again over itself. Every row is copied with its `rowid`, and the new column comes last. Applied again, a cause is
 * read from the bodies once more and the data step derives the rest, since the text cannot name a column it adds.
 *
 * THE CAUSES ALREADY WRITTEN ARE COPIED FIRST: a bank message's question carries its own in its body
 * (`body.cause`, `ingest.ts`). An open question whose cause an older open one already holds is copied without it, and
 * the data step below closes it as merged into the older one, since the index would refuse it.
 *
 * NOT A FORMAT REVISION. Both columns are nullable and last, so an older file imports without them and reads NULL.
 *
 * THE TRIGGER AND THE DERIVED CAUSES ARE `causeSteps`, run once after this applies (`migrate.ts`). The trigger because
 * the runner cuts a script at every `;` outside a literal, and a trigger's body has one; the causes because a derived
 * cause is a hash worked out by code (`cause.ts`) that SQL cannot run, and a merge writes a line in history whose id is
 * minted.
 */

import type { Sql } from '@braindog/ports';

import { causeOf } from '../cause.ts';

/** A body's own `cause`, read only where the body is JSON: an erased body is the literal `--erased--`. */
const bodyCause = (t: string): string =>
  `CASE WHEN json_valid(${t}.body) THEN CASE WHEN json_type(${t}.body, '$.cause') = 'text' THEN json_extract(${t}.body, '$.cause') END END`;

export default `
CREATE TABLE suggestion_next (
  id TEXT PRIMARY KEY,
  body_kind TEXT NOT NULL,
  body TEXT NOT NULL, status TEXT NOT NULL,
  opened_by TEXT NOT NULL, opened_at TEXT NOT NULL,
  resolved_as TEXT,
  defer_until TEXT, defer_why TEXT,
  drafted_by TEXT,
  kind TEXT,
  cause TEXT,
  CHECK (body_kind IN ('options','pattern','rowset','change','pack','settings','arrange'))
);
INSERT INTO suggestion_next (rowid, id, body_kind, body, status, opened_by, opened_at, resolved_as, defer_until, defer_why, drafted_by, kind, cause)
  SELECT s.rowid, s.id, s.body_kind, s.body, s.status, s.opened_by, s.opened_at, s.resolved_as, s.defer_until, s.defer_why, s.drafted_by, s.kind,
    CASE WHEN s.status = 'open' AND EXISTS (
      SELECT 1 FROM suggestion o WHERE o.status = 'open' AND ${bodyCause('o')} = ${bodyCause('s')}
        AND (o.opened_at < s.opened_at OR (o.opened_at = s.opened_at AND o.rowid < s.rowid))
    ) THEN NULL ELSE ${bodyCause('s')} END
  FROM suggestion s;
DROP TABLE suggestion;
ALTER TABLE suggestion_next RENAME TO suggestion;
CREATE UNIQUE INDEX IF NOT EXISTS suggestion_cause_open ON suggestion(cause) WHERE status = 'open' AND cause IS NOT NULL;
CREATE TABLE decision_next (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL, answer TEXT NOT NULL,
  reason TEXT NOT NULL,
  decided_by TEXT NOT NULL, ts TEXT NOT NULL,
  supersedes TEXT REFERENCES decision(id),
  cause TEXT
);
INSERT INTO decision_next (rowid, id, question, answer, reason, decided_by, ts, supersedes, cause)
  SELECT d.rowid, d.id, d.question, d.answer, d.reason, d.decided_by, d.ts, d.supersedes,
    (SELECT s.cause FROM event e JOIN event r ON r.rowid = e.rowid + 1 JOIN suggestion s ON r.target = 'suggestion:' || s.id
      WHERE e.target = 'decision:' || d.id AND e.kind = 'decide' AND r.kind = 'resolve' LIMIT 1)
  FROM decision d;
DROP TABLE decision;
ALTER TABLE decision_next RENAME TO decision;
CREATE INDEX IF NOT EXISTS decision_cause ON decision(cause, ts DESC) WHERE cause IS NOT NULL;
`;

/** What a person reads when anything but an erasure tries to change a decision. */
export const DECISION_KEPT = 'A decision is kept as it was made. Supersede it with a new decision instead.';

/**
 * A decision is never rewritten: only erasure may turn its words into tombstones (`erase.ts`, `ERASED`), and nothing
 * else of it moves. A decision that could be edited is a record of nothing (AGT-C09). Its cause may go the same way,
 * since a cause a filer typed can carry a name.
 */
export const DECISION_TRIGGER = `CREATE TRIGGER IF NOT EXISTS decision_kept BEFORE UPDATE ON decision
WHEN NOT (
  NEW.id IS OLD.id AND NEW.decided_by IS OLD.decided_by AND NEW.ts IS OLD.ts AND NEW.supersedes IS OLD.supersedes
  AND (NEW.cause IS OLD.cause OR NEW.cause IS '--erased--')
  AND (NEW.question IS OLD.question OR NEW.question IS '--erased--')
  AND (NEW.answer IS OLD.answer OR NEW.answer IS '--erased--')
  AND (NEW.reason IS OLD.reason OR NEW.reason IS '--erased--')
)
BEGIN SELECT RAISE(ABORT, '${DECISION_KEPT}'); END`;

/** A run's spoken id, `S12`: the openers whose questions get a derived cause. */
const RUN = /^S[1-9]\d*$/u;

/**
 * Migration 31's data step: the trigger, then a cause for each open question that has none, oldest first.
 *
 * AN OPEN QUESTION A RUN OPENED gets the cause its body carries, or else the one `causeOf` derives from its body and
 * its words. A rule's, an ingest's or a person's question is left as it is: those did not ask twice by mistake, and a
 * cause derived for them would join questions their opener meant as two.
 *
 * A LATER ONE WITH A CAUSE AN EARLIER OPEN ONE HOLDS IS MERGED: it closes as `merged`, and its line in history names
 * the one kept ("Merged into SG89"). On the owner's record that is SG90 into SG89.
 *
 * Keyed on what is missing, so it changes nothing the second time. Answers how many it gave a cause and how many it
 * merged.
 */
export function causeSteps(sql: Sql, mint: () => string, at: string): { caused: number; merged: number } {
  sql.exec(DECISION_TRIGGER);
  const open = sql.all<{ id: string; body_kind: string; body: string; opened_by: string; cause: string | null }>(
    "SELECT id, body_kind, body, opened_by, cause FROM suggestion WHERE status = 'open' ORDER BY opened_at, rowid",
  );
  let caused = 0;
  let merged = 0;
  for (const q of open) {
    if (q.cause !== null) continue;
    const body = parsed(q.body);
    if (body === null) continue;
    const own = typeof body.cause === 'string' ? body.cause : null;
    const cause = own ?? (RUN.test(q.opened_by) ? causeOf(q.body_kind, body, wordsOf(sql, q.id)) : null);
    if (cause === null) continue;
    const kept = sql.one<{ id: string }>("SELECT id FROM suggestion WHERE status = 'open' AND cause = ?", cause)?.id;
    if (kept === undefined) {
      sql.exec('UPDATE suggestion SET cause = ? WHERE id = ?', cause, q.id);
      caused++;
      continue;
    }
    sql.exec("UPDATE suggestion SET status = 'resolved', resolved_as = 'merged', cause = ? WHERE id = ?", cause, q.id);
    sql.exec(
      "INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v, note) VALUES (?, ?, 'system', 'resolve', ?, 'suggestion', 'merged', ?)",
      mint(),
      at,
      `suggestion:${q.id}`,
      `Merged into ${kept}: the same question, asked again.`,
    );
    merged++;
  }
  return { caused, merged };
}

/** The words a question was asked in: its `suggest` line, which is the only copy (`govern.ts`). */
function wordsOf(sql: Sql, id: string): string | undefined {
  return sql.one<{ q: string | null }>("SELECT to_v AS q FROM event WHERE target = ? AND kind = 'suggest' ORDER BY rowid LIMIT 1", `suggestion:${id}`)?.q ?? undefined;
}

function parsed(text: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(text) as unknown;
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
