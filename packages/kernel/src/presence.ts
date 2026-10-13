/**
 * One clock for a run: whether it is working, quiet, left a step, ended, stopped, or is from before (AGT-C02).
 *
 * EIGHT READERS WORKED IT OUT EIGHT WAYS. The rail, Today, the Agents headline, a page's mark on the row an agent is on,
 * the record's live read and the briefings each compared `last_seen` with the clock in their own words, so on the
 * owner's record the foot of the rail said 4 working while two of the four were last heard from two and four hours
 * before. Every reader now asks here, and a reader that compares a run's `last_seen` with a time anywhere else is the
 * defect.
 *
 * THREE NUMBERS. Working is 15 minutes: what a person reads. Stale is 45 minutes, his number: past it the ladder stops
 * adopting a run for a write that names none. Written off is 12 hours, his number: the hourly sweep. Working and stale
 * mean different things, so they stay two.
 *
 * WORKED OUT WHEN READ, NEVER STORED, because a run that crashed never says so.
 */

import type { Sql } from '@braindog/ports';

import type { Json } from './coerce.ts';

/** A run active and heard from inside fifteen minutes is working. */
export const WORKING_MS = 15 * 60_000;

/**
 * A run not heard from in 45 minutes is stale: the ladder no longer adopts it for a write that names no run, and no
 * reader lists it as live.
 */
export const STALE_MS = 45 * 60_000;

/** A run not heard from in twelve hours is written off by the hourly sweep. */
export const ABANDON_MS = 12 * 3_600_000;

/**
 * The mark past which an open run reads quiet, which is the working window itself: open and not working is quiet. The
 * name is kept so every reader that imports it moves with the clock at once.
 */
export const QUIET_MS = WORKING_MS;

/** The one word every run reads as. */
export type Presence = 'working' | 'quiet' | 'left' | 'ended' | 'stopped' | 'before';

/** A run as `workingRuns` and `liveRuns` answer it: its row, with its fields read. */
export type RunRow = { id: string; seq: number; state: string | null; fields: Record<string, Json>; created_at: string; updated_at: string };

/** A working run with no working parent, and how many of its helpers are working with it. */
export type WorkingRun = RunRow & { helpers: number };

/** The register runs live in, named here so this file reads nothing of `session.ts`, which reads it. */
const RUNS = 'session';

/** What a run is called out loud, `S` for `S42`: the register's `seq_prefix`, which no version of it has changed. */
const PREFIX = 'S';

/** The states a run is open in. */
const OPEN: readonly string[] = ['active', 'idle'];

/** A run's state, from its column, or from its fields for a reader handed the fields alone. */
export const stateOf = (row: { state?: string | null; fields: Record<string, Json> }): string =>
  row.state ?? (typeof row.fields.state === 'string' ? row.fields.state : '');

/**
 * When a run was last heard from, in milliseconds: its `last_seen`; else the day it was last seen where it was carried in
 * from (`seen_before`, AGT-C10); else when its row last changed.
 *
 * THE CARRIED DAY BEFORE THE ROW'S OWN, because an imported run's row changed on the morning of the import, and read
 * that way 295 runs of the owner's were all last seen the same day. `runAge` reads this, so it follows with no change.
 */
export function heardAt(row: { fields: Record<string, Json>; updated_at: string }): number {
  const seen = row.fields.last_seen;
  if (typeof seen === 'string' && seen !== '') return Date.parse(seen);
  const before = row.fields.seen_before;
  const changed = Date.parse(row.updated_at);
  /* NEVER LATER THAN THE ROW THAT CARRIES IT: an adapter's clock or zone that runs ahead would otherwise keep a run
     carried in fresh, offered as company and never stale, until the day it named. */
  return typeof before === 'string' && before !== '' ? Math.min(Date.parse(before), changed) : changed;
}

/** `heardAt` in SQL, for the rows a query keeps and orders: `min` with a null in it is null, so `coalesce` falls on. */
const HEARD_SQL = "coalesce(json_extract(fields, '$.last_seen'), min(json_extract(fields, '$.seen_before'), updated_at), updated_at)";

/**
 * The one word for a run now.
 *
 * `before`: never heard from here, no `last_seen` (a run carried in from somewhere else). `working`: active and heard
 * from inside `WORKING_MS`. `quiet`: active or idle, otherwise. `left`: it ended and left a step (`handoff`). `ended`:
 * done. `stopped`: the sweep wrote it off (`abandoned`).
 */
export function presenceOf(run: { state?: string | null; fields: Record<string, Json> }, nowMs: number): Presence {
  const seen = run.fields.last_seen;
  if (typeof seen !== 'string' || seen === '') return 'before';
  const state = stateOf(run);
  if (state === 'handoff') return 'left';
  if (state === 'done') return 'ended';
  if (state === 'abandoned') return 'stopped';
  return state === 'active' && Date.parse(seen) >= nowMs - WORKING_MS ? 'working' : 'quiet';
}

/** Whether a run is open, active or idle, and not working. A finished run, or one that left a step, is never quiet. */
export function isQuiet(row: { state?: string | null; fields: Record<string, Json> }, nowMs: number): boolean {
  return OPEN.includes(stateOf(row)) && presenceOf(row, nowMs) !== 'working';
}

/** Whether a run has gone stale. A row with no `last_seen` is judged by when it last changed. */
export function isStale(row: { fields: Record<string, Json>; updated_at: string }, nowMs: number): boolean {
  return heardAt(row) < nowMs - STALE_MS;
}

/** A beat closer to the last than this moves nothing: one statement a minute at most, however often an agent calls. */
export const BEAT_MS = 60_000;

/**
 * A run says it is still working: its `last_seen` moves to now, in place, and answers whether it moved (AGT-C03).
 *
 * A HEARTBEAT IS NOT A WRITE (P.132): no version, no `updated_at`, no event, the same in-place statement the ladder
 * gives a found run (`attribute` in `index.ts`), so a session that reads, thinks or edits files reads as working without
 * a line in its history or a conflict on its next edit of its own row.
 *
 * ONLY AN OPEN RUN THAT HAS A CLOCK. Active or idle, never one that ended, left a step or was written off: a beat
 * revives nothing. And never a run with no `last_seen`, one carried in from before, whose clock this would start. A
 * `last_seen` under `BEAT_MS` old stays, so a beat on every tool call is one statement a minute.
 */
export function beatRun(sql: Sql, id: string, nowMs: number): boolean {
  const moved = sql.one<{ id: string }>(
    `UPDATE entry SET fields = json_set(fields, '$.last_seen', ?)
     WHERE id = ? AND register = '${RUNS}' AND deleted_at IS NULL AND state IN ('active', 'idle')
       AND json_extract(fields, '$.last_seen') IS NOT NULL AND json_extract(fields, '$.last_seen') <= ?
     RETURNING id`,
    new Date(nowMs).toISOString(),
    id,
    new Date(nowMs - BEAT_MS).toISOString(),
  );
  return moved !== undefined;
}

/** The rows of the runs register that `where` keeps, newest heard from first (as `heardAt` reads it), with their fields read. */
function runsWhere(sql: Sql, where: string, ...params: string[]): RunRow[] {
  return sql
    .all<Omit<RunRow, 'fields'> & { fields: string }>(
      `SELECT id, seq, state, fields, created_at, updated_at FROM entry
       WHERE register = '${RUNS}' AND deleted_at IS NULL AND ${where}
       ORDER BY ${HEARD_SQL} DESC`,
      ...params,
    )
    .map((r) => ({ ...r, fields: JSON.parse(r.fields) as Record<string, Json> }));
}

/**
 * The runs working now that no working run started, each with how many of its helpers are working too.
 *
 * ONE AGENT WITH FOUR SUBAGENTS IS ONE AGENT AT WORK, and a person counting five would be counting the helpers of one
 * session as sessions. A helper whose parent is not working, because it ended or went quiet, stands on its own.
 * Read through the index on `last_seen`, so the cost is the working runs and not the record's history of runs.
 */
export function workingRuns(sql: Sql, nowMs: number): WorkingRun[] {
  const since = new Date(nowMs - WORKING_MS).toISOString();
  const working = runsWhere(sql, "state = 'active' AND json_extract(fields, '$.last_seen') >= ?", since).filter(
    (r) => presenceOf(r, nowMs) === 'working',
  );
  const spoken = new Map(working.map((r) => [`${PREFIX}${String(r.seq)}`, r]));
  const parentOf = (r: RunRow): string | null => {
    const p = r.fields.parent;
    return typeof p === 'string' && p !== `${PREFIX}${String(r.seq)}` && spoken.has(p) ? p : null;
  };
  const helpers = new Map<string, number>();
  for (const r of working) {
    const p = parentOf(r);
    if (p !== null) helpers.set(p, (helpers.get(p) ?? 0) + 1);
  }
  return working.filter((r) => parentOf(r) === null).map((r) => ({ ...r, helpers: helpers.get(`${PREFIX}${String(r.seq)}`) ?? 0 }));
}

/**
 * How many runs in one of `states` were last heard from more than `olderMs` ago, for a reader that counts what has gone
 * quiet (the tidy's finders, `tidy.ts`): the runs the sweep is about to write off, and the ended ones nobody has heard
 * from in a month. `also` is one more SQL condition on the row, with no parameter of its own.
 *
 * HEARD IS `last_seen`, ELSE THE ROW'S LAST CHANGE, which is how the sweep reads it (`schedule.ts`), so what this counts
 * as about to be written off is what the next tick writes off. The comparison with the clock is made here, in the one
 * file that may make it (the `one-clock` gate).
 */
export function unheardRuns(sql: Sql, nowMs: number, olderMs: number, states: readonly string[], also = ''): number {
  const before = new Date(nowMs - olderMs).toISOString();
  const row = sql.one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM entry WHERE register = '${RUNS}' AND deleted_at IS NULL AND state IN (SELECT value FROM json_each(?))
       ${also === '' ? '' : `AND ${also} `}AND coalesce(json_extract(fields, '$.last_seen'), updated_at) < ?`,
    JSON.stringify(states),
    before,
  );
  return row?.n ?? 0;
}

/**
 * The runs still open, active or idle, heard from inside `STALE_MS`: what an agent starting here is told is around it.
 * A run silent longer is no company, whatever its state says, so a briefing names no dead run, and a run carried in this
 * morning that was last seen in September is not one either.
 */
export function liveRuns(sql: Sql, nowMs: number): RunRow[] {
  const since = new Date(nowMs - STALE_MS).toISOString();
  return runsWhere(sql, `state IN ('active', 'idle') AND ${HEARD_SQL} >= ?`, since);
}
