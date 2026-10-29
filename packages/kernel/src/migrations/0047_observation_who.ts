/**
 * The kernel schema, migration 47: page opens counted per person, so a shared record's suggestions are each person's own
 * (the widgets plan of 29 October, §6.4 and W8).
 *
 * `observation` COUNTS A PAGE'S OPENS FOR THE WHOLE RECORD, one row per kind, subject and day, with no person. On a record
 * one person uses that is that person's habit, and Today's suggestions read it there (`widget-signals.ts`). On a shared
 * record it is everybody's at once, so "You open Budgets most mornings" could be somebody else's mornings, and those
 * signals were held back on any record with a second person.
 *
 * `observation_who` IS THE SAME COUNT WITH THE PERSON BESIDE IT: one row per kind, subject, day and person, raised as the
 * record-wide row is. `who` is the person's id, never a name or an email. It is a table beside `observation` and not a
 * column on it, because a column cannot join `observation`'s key without rebuilding the table and every row in it, and
 * the record-wide count stays exactly what it was: a record one person uses reads it as before.
 *
 * `local`, AS `observation` IS: what somebody opened is a fact about this installation's use, and a copy carries none of
 * it. Pruned with `observation` at the same age (`purge`), and cleared with it by an erasure that names its subject. The
 * format is still 1.
 *
 * ADDITIVE ONLY: no row of any table is read, changed or moved, and `IF NOT EXISTS` and `OR IGNORE`, so it can run twice.
 * It starts empty and fills from the first open after the build that writes it.
 */
export default `
CREATE TABLE IF NOT EXISTS observation_who (
  kind TEXT NOT NULL,
  subject TEXT NOT NULL,
  day TEXT NOT NULL,
  who TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (kind, who, subject, day)
) WITHOUT ROWID;
INSERT OR IGNORE INTO dog_section (table_name, section) VALUES ('observation_who', 'local');
`;
