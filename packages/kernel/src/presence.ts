/**
 * One clock for a run: whether it is working, quiet, left a step, ended, stopped, or is from before.
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

/**
 * The one word every run reads as on the board of runs. The finer words for a session open now, read with the
 * bridge's pulse, are `LiveState` (`liveStateOf`) below.
 */
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
 * from (`seen_before`); else when its row last changed.
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
 *
 * AND A RUN WHOSE BRIDGE STOPPED PULSING IS NOT WORKING (`GONE_MS`), as `liveStateOf` reads it gone: the Agents page drew
 * no row for it while the rail still counted it, so the two said different numbers. A run that never pulsed is read by
 * its calls alone, as before.
 */
export function presenceOf(run: { state?: string | null; fields: Record<string, Json> }, nowMs: number): Presence {
  const seen = run.fields.last_seen;
  if (typeof seen !== 'string' || seen === '') return 'before';
  const state = stateOf(run);
  if (state === 'handoff') return 'left';
  if (state === 'done') return 'ended';
  if (state === 'abandoned') return 'stopped';
  const pulse = run.fields.pulse_at;
  const gone = typeof pulse === 'string' && pulse !== '' && nowMs - Date.parse(pulse) > GONE_MS;
  return state === 'active' && !gone && Date.parse(seen) >= nowMs - WORKING_MS ? 'working' : 'quiet';
}

/** Whether a run is open, active or idle, and not working. A finished run, or one that left a step, is never quiet. */
export function isQuiet(row: { state?: string | null; fields: Record<string, Json> }, nowMs: number): boolean {
  return OPEN.includes(stateOf(row)) && presenceOf(row, nowMs) !== 'working';
}

/** Whether a run has gone stale. A row with no `last_seen` is judged by when it last changed. */
export function isStale(row: { fields: Record<string, Json>; updated_at: string }, nowMs: number): boolean {
  return heardAt(row) < nowMs - STALE_MS;
}

/**
 * A RUN WITH NO SESSION HAS NO END TO LOSE: no host session's id and no pulse, so no window, no end hook and no bridge
 * that could ever say it closed, and not a helper working for a run that can. An app with no hooks, or a script that opens
 * `braindog mcp` for a few calls and goes: one run a folder, shared by every call within 45 minutes (`STALE_MS`), since one
 * run a call would be a hundred rows a day. The sweep closes it as done, and `runs-true` does not judge it. 10 of the 28
 * runs on his record that read abandoned in the week of 4 November were these. A Claude Code window always names its session.
 */
export const sessionless = (fields: Record<string, Json>): boolean =>
  !isSet(fields.client_id) && !isSet(fields.pulse_at) && !isSet(fields.parent);

const isSet = (v: Json | undefined): boolean => typeof v === 'string' && v !== '';

/** `sessionless` in SQL, over a run's `fields`. */
export const SESSIONLESS_SQL =
  "(coalesce(json_extract(fields, '$.client_id'), '') = '' AND coalesce(json_extract(fields, '$.pulse_at'), '') = '' AND coalesce(json_extract(fields, '$.parent'), '') = '')";

/** A beat closer to the last than this moves nothing: one statement a minute at most, however often an agent calls. */
export const BEAT_MS = 60_000;

/**
 * A run says it is still working: its `last_seen` moves to now, in place, and answers whether it moved.
 *
 * A HEARTBEAT IS NOT A WRITE: no version, no `updated_at`, no event, the same in-place statement the ladder
 * gives a found run (`attribute` in `index.ts`), so a session that reads, thinks or edits files reads as working without
 * a line in its history or a conflict on its next edit of its own row.
 *
 * ONLY AN OPEN RUN THAT HAS A CLOCK. Active or idle, never one that ended, left a step or was written off: a beat
 * revives nothing. And never a run with no `last_seen`, one carried in from before, whose clock this would start. A
 * `last_seen` under `BEAT_MS` old stays, so a beat on every tool call is one statement a minute.
 */
export function beatRun(sql: Sql, id: string, nowMs: number): boolean {
  const now = new Date(nowMs).toISOString();
  /* BACK AFTER AN HOUR'S SILENCE IS A NEW STRETCH (`RESUMED_MS`): `stretch_at` moves with the clock, so how long a
     session open for two days has been at it is counted from when it came back, not from when it opened. */
  const moved = sql.one<{ id: string }>(
    `UPDATE entry SET fields = CASE WHEN json_extract(fields, '$.last_seen') <= ?
         THEN json_set(fields, '$.last_seen', ?, '$.stretch_at', ?) ELSE json_set(fields, '$.last_seen', ?) END
     WHERE id = ? AND register = '${RUNS}' AND deleted_at IS NULL AND state IN ('active', 'idle')
       AND json_extract(fields, '$.last_seen') IS NOT NULL AND json_extract(fields, '$.last_seen') <= ?
     RETURNING id`,
    new Date(nowMs - RESUMED_MS).toISOString(),
    now,
    now,
    now,
    id,
    new Date(nowMs - BEAT_MS).toISOString(),
  );
  return moved !== undefined;
}

/**
 * A run silent this long that calls again has begun a new stretch of work (`beatRun`), as one that comes back from an
 * end does (`REVIVED`). An hour: longer than a turn spent thinking, shorter than a night with the terminal left open.
 */
export const RESUMED_MS = 60 * 60_000;

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
       ${also === '' ? '' : `AND ${also} `}AND ${HEARD_OR_OPEN_SQL} < ?`,
    JSON.stringify(states),
    before,
  );
  return row?.n ?? 0;
}

/**
 * When a run was last heard from or last said it was open: the later of its `last_seen` (else its last change) and its
 * `pulse_at`. What the sweep writes off by, and what `unheardRuns` counts by, so both read one clock.
 *
 * A PULSE IS HEARD FOR THE SWEEP. A Claude Code window left open on a question for twelve hours calls nothing, and the
 * bridge keeps saying it is open; read by `last_seen` alone the sweep wrote it off as abandoned thirteen seconds after
 * a pulse, and the runs-true sign counted every such window as a run whose end was lost.
 */
const HEARD_OR_OPEN_SQL =
  "max(coalesce(json_extract(fields, '$.last_seen'), updated_at), coalesce(json_extract(fields, '$.pulse_at'), ''))";

/**
 * The open runs, active or idle, neither heard from nor pulsed in `olderMs`, oldest first, at most `limit`: what the
 * hourly sweep writes off (`sweepSessions` in `schedule.ts`).
 */
export function quietRuns(sql: Sql, nowMs: number, olderMs: number, limit: number): { id: string; fields: string }[] {
  return sql.all<{ id: string; fields: string }>(
    `SELECT id, fields FROM entry WHERE register = '${RUNS}' AND deleted_at IS NULL AND state IN ('active', 'idle')
       AND ${HEARD_OR_OPEN_SQL} < ? ORDER BY ${HEARD_OR_OPEN_SQL} LIMIT ?`,
    new Date(nowMs - olderMs).toISOString(),
    Math.max(0, Math.floor(limit)),
  );
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

/* ── live presence: the pulse (agents and MCP plan §4.4) ─────────────────── */

/**
 * The words the Agents page and Today read a session in, from its two clocks: `last_seen`, which a tool call moves and
 * which means working, and `pulse_at`, which the bridge moves every 15 seconds while the session is open and which
 * means open. A finer reading than `presenceOf`, which the board of runs still reads, for the rows that are open now.
 *
 *   - `working`: a call inside `CALL_MS` (2 minutes).
 *   - `thinking`: open, no call for 2 to 15 minutes (`THINKING_MS`).
 *   - `waiting`: open, no call for more than 15 minutes: waiting on him.
 *   - `ended`: it closed (`done`), left a step (`handoff`) or was written off (`abandoned`).
 *   - `gone`: open by its state, with no pulse for `GONE_MS` (2 minutes) and no end.
 *
 * A SESSION WITH NO PULSE AT ALL is a bridge from before the pulse: it is read by its calls alone, open while the
 * ladder would still adopt it (`STALE_MS`), so an old command line reads as thinking or waiting and not as gone.
 */
export type LiveState = 'working' | 'thinking' | 'waiting' | 'ended' | 'gone';

/** A call this recent is working. */
export const CALL_MS = 2 * 60_000;
/** Open with no call for longer than this is waiting on him. */
export const THINKING_MS = 15 * 60_000;
/** An open run whose bridge has not pulsed in this long is gone. */
export const GONE_MS = 2 * 60_000;
/** The bridge pulses every 15 s; a pulse closer than this to the last moves nothing (once per 10 s a run). */
export const PULSE_MIN_MS = 10_000;

/** The one live word for a run now (`LiveState`). */
export function liveStateOf(run: { state?: string | null; fields: Record<string, Json> }, nowMs: number): LiveState {
  const state = stateOf(run);
  if (!OPEN.includes(state)) return 'ended';
  const parse = (v: Json | undefined): number => (typeof v === 'string' && v !== '' ? Date.parse(v) : NaN);
  const call = parse(run.fields.last_seen);
  const pulse = parse(run.fields.pulse_at);
  /* GONE BEFORE ANYTHING ELSE, so a run whose bridge stopped pulsing is never working, as `presenceOf` reads it. */
  if (Number.isFinite(pulse)) {
    if (nowMs - pulse > GONE_MS) return 'gone';
  } else if (!Number.isFinite(call) || nowMs - call > STALE_MS) return 'gone';
  /* AN IDLE RUN WAITS ON HIM, however lately it called: its end hook said its turn is over, so it is open and not at
     work, which is what `presenceOf` says of it too. Drawn as working, ten idle runs made the Agents page say 22 at
     work beside the rail's 12. */
  if (state === 'idle') return 'waiting';
  if (Number.isFinite(call) && nowMs - call <= CALL_MS) return 'working';
  return Number.isFinite(call) && nowMs - call <= THINKING_MS ? 'thinking' : 'waiting';
}

/** Whether a run is there to be told now: open, and working, thinking or waiting. */
export const isPresent = (run: { state?: string | null; fields: Record<string, Json> }, nowMs: number): boolean => {
  const s = liveStateOf(run, nowMs);
  return s === 'working' || s === 'thinking' || s === 'waiting';
};

/**
 * The bridge says the session is open: the run's `pulse_at` moves to `nowMs`, in place, and answers whether it moved
 * (`pulseRun` in §8.3).
 *
 * A PULSE IS NOT A WRITE, for a heartbeat's reason (`beatRun`): no version, no `updated_at`, no event, so a session
 * open for a day leaves no line in its history. Only an open run, active or idle: a pulse revives nothing, so a run
 * that ended stays ended and a stopped run is still told it is stopped by the answer, not woken. A pulse under
 * `PULSE_MIN_MS` after the last moves nothing, so ten sessions pulsing every 15 s cost what the plan budgets.
 */
export function pulseRun(sql: Sql, id: string, nowMs: number): boolean {
  const moved = sql.one<{ id: string }>(
    `UPDATE entry SET fields = json_set(fields, '$.pulse_at', ?)
     WHERE id = ? AND register = '${RUNS}' AND deleted_at IS NULL AND state IN ('active', 'idle')
       AND (json_extract(fields, '$.pulse_at') IS NULL OR json_extract(fields, '$.pulse_at') <= ?)
     RETURNING id`,
    new Date(nowMs).toISOString(),
    id,
    new Date(nowMs - PULSE_MIN_MS).toISOString(),
  );
  return moved !== undefined;
}

/**
 * The Claude Code profile a run is under, as a pulse says it, written once onto a run that has none, in place, for a
 * pulse's reason: no version, no event. Answers whether it wrote (migration 44, `seat` in `session.ts`).
 *
 * ONCE, AND NEVER MOVED: a session runs under one profile for its whole life, so a run that has one keeps it, and a
 * pulse sent under another is not this run's to rename.
 */
export function seatRun(sql: Sql, id: string, seat: string): boolean {
  const moved = sql.one<{ id: string }>(
    `UPDATE entry SET fields = json_set(fields, '$.seat', ?)
     WHERE id = ? AND register = '${RUNS}' AND deleted_at IS NULL AND json_extract(fields, '$.seat') IS NULL
     RETURNING id`,
    seat,
    id,
  );
  return moved !== undefined;
}

/**
 * The open runs that are there now, newest heard from first: the rows of `presence` (Today's "Working now", the Agents
 * page, a project's "Working here now"). Read through the pulse index and the `last_seen` index, so the cost is the
 * open runs and not the record's history of them; each row is held to `isPresent`, so a gone run is not a row.
 */
export function presentRuns(sql: Sql, nowMs: number): RunRow[] {
  const pulsed = new Date(nowMs - GONE_MS).toISOString();
  const called = new Date(nowMs - STALE_MS).toISOString();
  return runsWhere(
    sql,
    `state IN ('active', 'idle') AND (json_extract(fields, '$.pulse_at') >= ? OR json_extract(fields, '$.last_seen') >= ?)`,
    pulsed,
    called,
  ).filter((r) => isPresent(r, nowMs));
}

/**
 * When each of the runs `ids` last came back, from an end or a rest to `active`: its newest `state` event out of idle,
 * handoff, done or abandoned (the ladder's `REVIVED`). One read over the history, the ids bound as one array; a run
 * that never came back is not in the map.
 *
 * HOW LONG A RUN HAS BEEN AT IT COUNTS FROM HERE, not from when it first opened: a session resumed after two days read
 * "for 2 days" on the Agents page beside its first five minutes of work.
 */
export function revivedAt(sql: Sql, ids: readonly string[]): Map<string, string> {
  if (ids.length === 0) return new Map();
  const rows = sql.all<{ target: string; ts: string }>(
    `SELECT target, max(ts) AS ts FROM event
      WHERE kind = 'state' AND to_v = '"active"' AND from_v IN ('"idle"', '"handoff"', '"done"', '"abandoned"')
        AND target IN (SELECT 'entry:' || value FROM json_each(?))
      GROUP BY target`,
    JSON.stringify(ids),
  );
  return new Map(rows.map((r) => [r.target.slice('entry:'.length), r.ts]));
}

/**
 * The machines, profiles and agents runs were heard on inside the last `withinMs`, newest heard first and at most
 * `most`: where and to whom the composer offers to send an instruction. A run that names none of them is left out, and
 * every run is a row, so the caller holds each to what its reader may see.
 */
export function placesHeard(sql: Sql, nowMs: number, withinMs: number, most: number): { id: string; host: string | null; seat: string | null; agent: string | null }[] {
  const since = new Date(nowMs - withinMs).toISOString();
  return sql.all<{ id: string; host: string | null; seat: string | null; agent: string | null }>(
    `SELECT id, json_extract(fields, '$.host') AS host, json_extract(fields, '$.seat') AS seat, json_extract(fields, '$.agent') AS agent FROM entry
      WHERE register = 'session' AND deleted_at IS NULL AND json_extract(fields, '$.last_seen') >= ?
        AND (json_extract(fields, '$.host') IS NOT NULL OR json_extract(fields, '$.seat') IS NOT NULL OR json_extract(fields, '$.agent') IS NOT NULL)
      ORDER BY json_extract(fields, '$.last_seen') DESC LIMIT ?`,
    since,
    most,
  );
}
