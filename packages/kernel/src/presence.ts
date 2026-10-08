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

/** When a run was last heard from, in milliseconds: its `last_seen`, or when its row last changed when it has none. */
export function heardAt(row: { fields: Record<string, Json>; updated_at: string }): number {
  return Date.parse(typeof row.fields.last_seen === 'string' ? row.fields.last_seen : row.updated_at);
}

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

/** The rows of the runs register that `where` keeps, newest heard from first, with their fields read. */
function runsWhere(sql: Sql, where: string, ...params: string[]): RunRow[] {
  return sql
    .all<Omit<RunRow, 'fields'> & { fields: string }>(
      `SELECT id, seq, state, fields, created_at, updated_at FROM entry
       WHERE register = '${RUNS}' AND deleted_at IS NULL AND ${where}
       ORDER BY coalesce(json_extract(fields, '$.last_seen'), updated_at) DESC`,
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
 * The runs still open, active or idle, heard from inside `STALE_MS`: what an agent starting here is told is around it.
 * A run silent longer is no company, whatever its state says, so a briefing names no dead run.
 */
export function liveRuns(sql: Sql, nowMs: number): RunRow[] {
  const since = new Date(nowMs - STALE_MS).toISOString();
  return runsWhere(sql, "state IN ('active', 'idle') AND coalesce(json_extract(fields, '$.last_seen'), updated_at) >= ?", since);
}
