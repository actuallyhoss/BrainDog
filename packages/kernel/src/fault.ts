/**
 * Faults: work BrainDog does for itself that keeps failing (AGT-C06).
 *
 * A FAULT IS NEVER A QUESTION. "Nothing an operator must fix is asked of him" (D40.53). A job that dies at the end of
 * the outbox's ladder, or a scheduled thing that never runs, used to file a question opened by `system`: "infer.resolve
 * could not be delivered after 8 attempts: No model answered. Retry it, or change what produces it." with Accept and
 * Decline under it, in Decide, beside the questions that were his to answer. He could do nothing with it but dismiss it,
 * and it came back the next night. So a dead job raises a fault here instead, and Decide never sees it.
 *
 * ONE LINE PER CAUSE. The cause is `outbox#<kind>` or `schedule#<kind>`, so a job that dies every night is one fault
 * whose count climbs and whose `last_at` moves, never a new line a night. A job of that kind that then completes
 * clears it, and the next death opens it again with its count and `first_at` kept: a fault that comes back is the same
 * fault, and how long it has been coming back is the thing worth knowing.
 *
 * `said` IS THE SENTENCE A PERSON READS, from a table of plain sentences keyed by the job's family: what BrainDog could
 * not do, and what happens next. No job name, no model id, no count of attempts, because none of the three is anything
 * he can act on. `error` keeps the raw failure for the operator's door, and is never the sentence.
 *
 * THE TABLE IS `local` (migration 30) AND DOES NOT TRAVEL: a fault is about this record's own machinery, and a `.brain`
 * file opened somewhere else has its own.
 */

import type { Sql } from '@braindog/ports';

/** One open or cleared fault, as the record answers it. */
export type Fault = {
  cause: string;
  kind: string;
  family: string;
  said: string;
  count: number;
  first_at: string;
  last_at: string;
  error: string;
};

/** The families a fault's sentence is keyed by. A kind outside them reads as `other`. */
export const FAULT_FAMILIES = ['infer', 'notify', 'pull', 'export', 'script', 'schedule', 'other'] as const;
export type FaultFamily = (typeof FAULT_FAMILIES)[number];

/**
 * The sentence for a family. Each says what BrainDog could not do and that it tries again, in words he would use.
 *
 * `infer` IS THE NIGHT'S CHECK FOR PEOPLE WHO ARE HERE TWICE, because that is the model job a person most often meets
 * dying. The other model jobs that can die into a fault do different work, so they read their own sentence (`SAID_KIND`)
 * rather than claim his people were not checked: `infer.embed` is queued every hour, and on a record with no model key
 * it dies beside `infer.resolve`, which would have been two lines saying the same untrue thing.
 */
export const SAID: Readonly<Record<FaultFamily, string>> = Object.freeze({
  infer: 'BrainDog could not check for people who are here twice. It tries again tonight.',
  notify: 'BrainDog could not send a notification. It tries again when the next one is due.',
  pull: 'BrainDog could not bring in new things from a connected app. It tries again on the next pull.',
  export: 'BrainDog could not save a copy of your record. It tries again tonight.',
  script: 'BrainDog could not run one of your scripts. It tries again the next time it is due.',
  schedule: 'BrainDog could not do something it had planned. It tries again the next time it is due.',
  other: 'BrainDog could not finish some work of its own. It tries again later.',
});

/** The model jobs whose work is not the family's: still no job name and no model id, only what was not done. */
export const SAID_KIND: Readonly<Record<string, string>> = Object.freeze({
  'infer.embed': 'BrainDog could not get your newest things ready for search. It tries again within the hour.',
  'infer.draft': 'BrainDog could not write up something it noticed for you. It tries again the next time it notices one.',
  'infer.prose': 'BrainDog could not write the words for your digest. It tries again with the next one.',
});

/** The sentence a cause is read as: its kind's own when it has one, else its family's. */
export const saidOf = (cause: string): string => SAID_KIND[kindOf(cause)] ?? SAID[familyOf(cause)];

/**
 * The family of a cause: every `schedule#` cause is `schedule`, and an outbox kind's family is the part before its dot.
 * `erase.r2` reads as `export`, because it is the other half of the copies the export keeps.
 */
export function familyOf(cause: string): FaultFamily {
  const [door, kind = ''] = cause.split('#', 2);
  if (door === 'schedule') return 'schedule';
  const head = kind.split('.', 1)[0] ?? '';
  if (head === 'erase') return 'export';
  return (FAULT_FAMILIES as readonly string[]).includes(head) ? (head as FaultFamily) : 'other';
}

/** The kind a cause names: `outbox#infer.resolve` is `infer.resolve`. */
const kindOf = (cause: string): string => cause.split('#', 2)[1] ?? cause;

const iso = (ms: number): string => new Date(ms).toISOString();

/** The longest raw error kept: enough for an operator to read, short of a page of stack. */
const ERROR_MAX = 500;

/**
 * Raise a fault, or count one more of it: the count goes up by one, `last_at` moves to now, and a cleared fault opens
 * again. `said` is written from the tables every time, so a sentence improved in a release reaches the faults already
 * open.
 */
export function raiseFault(sql: Sql, cause: string, kind: string, error: string, nowMs: number): void {
  const at = iso(nowMs);
  sql.exec(
    `INSERT INTO fault (cause, kind, first_at, last_at, count, error, said, cleared_at)
     VALUES (?, ?, ?, ?, 1, ?, ?, NULL)
     ON CONFLICT (cause) DO UPDATE SET kind = excluded.kind, last_at = excluded.last_at, count = count + 1,
       error = excluded.error, said = excluded.said, cleared_at = NULL`,
    cause,
    kind,
    at,
    at,
    error.slice(0, ERROR_MAX),
    saidOf(cause),
  );
}

/** Clear an open fault, as a job of its kind completing does. True when one was open. */
export function clearFault(sql: Sql, cause: string, nowMs: number): boolean {
  return (
    sql.one<{ cause: string }>(
      'UPDATE fault SET cleared_at = ? WHERE cause = ? AND cleared_at IS NULL RETURNING cause',
      iso(nowMs),
      cause,
    ) !== undefined
  );
}

/** One fault as a query answers it, before its family is read from its cause. */
type FaultRow = { cause: string; kind: string; said: string; count: number; first_at: string; last_at: string; error: string };

/**
 * The outbox kinds that died with no line in `fault`, one per kind (audit 36-37, finding 2).
 *
 * MIGRATION 30 CLOSED THE OLD DEAD-JOB QUESTIONS AND RAISED NOTHING IN THEIR PLACE, so the jobs behind them were in no
 * list at all until the next full eight-rung death, a day later or never. So a kind that has `dead` jobs and has never
 * had a fault row reads as a fault from the outbox itself: same cause, same sentence, the dead jobs counted, their
 * times the first and last. No raw error, because the outbox keeps none.
 *
 * ONLY THE DEATHS SINCE THE KIND LAST WORKED. A job of the kind created after a dead one and done is the outbox's way
 * of saying the kind works again, as `clearFault` says it for the table: a mail that died in March under a dozen sent
 * since is history, not a fault. `retryFault` queueing the newest dead job again is therefore what clears it, once
 * that job is done. A job a run was waiting on is left out, because its death ended its run instead (`deadLetter`).
 *
 * NO FAULT ROW AT ALL, NOT NO OPEN ONE. Once a kind has a row the table is the truth, and a cleared row over old dead
 * jobs must stay cleared. One query for every kind, never one a job.
 */
const UNFILED_OUTBOX = `
  WITH worked AS (SELECT kind, MAX(created) AS at FROM outbox
    WHERE state = 'done' AND kind IN (SELECT kind FROM outbox WHERE state = 'dead') GROUP BY kind)
  SELECT 'outbox#' || o.kind AS cause, o.kind AS kind, COUNT(*) AS count, MIN(o.created) AS first_at, MAX(o.created) AS last_at
  FROM outbox o LEFT JOIN worked w ON w.kind = o.kind
  WHERE o.state = 'dead' AND (w.at IS NULL OR o.created > w.at)
    AND NOT EXISTS (SELECT 1 FROM fault f WHERE f.cause = 'outbox#' || o.kind)
    AND NOT (o.kind IN ('infer.ask', 'pull.fetch') AND CASE WHEN json_valid(o.payload)
      THEN json_type(o.payload, '$.run') = 'text' AND json_type(o.payload, '$.step') IN ('integer', 'real') ELSE 0 END)
  GROUP BY o.kind`;

/**
 * The schedule kinds with `failed` rows and no line in `fault`, one per kind, for the same reason. A failed schedule
 * row never runs again until it is retried, so every one is still not working however old: counted, its due times the
 * first and last. `retryFault` puts the newest back, and it leaves this list when no row of the kind is failed.
 */
const UNFILED_SCHEDULE = `
  SELECT 'schedule#' || s.kind AS cause, s.kind AS kind, COUNT(*) AS count, MIN(s.due_at) AS first_at, MAX(s.due_at) AS last_at
  FROM schedule s
  WHERE s.state = 'failed' AND NOT EXISTS (SELECT 1 FROM fault f WHERE f.cause = 'schedule#' || s.kind)
  GROUP BY s.kind`;

/**
 * The faults open now, the one that failed last first: the open rows of `fault`, and the dead outbox kinds and failed
 * schedule kinds that never had one (`UNFILED_OUTBOX`, `UNFILED_SCHEDULE`), in the same shape. A record whose ledger has
 * no outbox or schedule (a test's bare database) reads the table alone.
 */
export function openFaults(sql: Sql): Fault[] {
  const rows = sql.all<FaultRow>(
    'SELECT cause, kind, said, count, first_at, last_at, error FROM fault WHERE cleared_at IS NULL',
  );
  const has = new Set(
    sql.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('outbox', 'schedule')").map((r) => r.name),
  );
  for (const [table, query] of [['outbox', UNFILED_OUTBOX], ['schedule', UNFILED_SCHEDULE]] as const) {
    if (!has.has(table)) continue;
    for (const r of sql.all<Omit<FaultRow, 'said' | 'error'>>(query))
      rows.push({ ...r, count: Number(r.count), said: saidOf(r.cause), error: '' });
  }
  return rows
    .sort((a, b) => (a.last_at === b.last_at ? (a.cause < b.cause ? -1 : a.cause > b.cause ? 1 : 0) : a.last_at < b.last_at ? 1 : -1))
    .map((r) => ({ ...r, kind: r.kind || kindOf(r.cause), family: familyOf(r.cause) }));
}
