/**
 * A handoff is an object that closes: the next step a run left in a place, and how that step ended.
 *
 * A STEP IS OPEN WHILE ITS RUN WAITS IN `handoff`, and it closes one of three ways, each written on the run that left
 * it: `taken` by the run that picks it up (`taken_by`, and the taker gets `took`), `dropped` by an agent or a person
 * with a reason in words, or `expired` by the hourly sweep once thirty days old. In all three the run moves to `done`
 * and the step's words stay on the row, so its history says what was left and what became of it. Before this a starting
 * session was given the newest step left here at any age, whether or not it had shipped: on the owner's record a
 * working card carried a step from a batch that went live hours earlier, and one run sat in `handoff` for two days.
 *
 * NEXT OR EARLIER. Of the open steps in a place, one under a day old that no later run has passed over is `next`:
 * the step a new session is handed. Passed over means a later run, working for no other, that wrote something has
 * ended in that place since the step was left: it worked here and quit, so whatever it was handed is behind it. Later
 * is its stretch of work (`stretch_at`, else `started`) beginning once the step was there: a run working alongside
 * that ends after it was never handed it. A session that wrote nothing and quit passes nothing over. Every other open
 * step is `earlier`, still there to take, never offered as the one thing to do.
 *
 * THE WRITES ARE THE CALLER'S, as the sweep's `move` is (`sweepSessions`): each close goes through the write path, so
 * it is a `state` event with its note like any other, and the record's history keeps it. Runs have no `ended_at`;
 * `last_seen`, which `endRun` stamps, is when a run that ended was last heard from.
 */

import { unprivate } from '@braindog/where';
import type { Result, Sql } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import type { Json } from './coerce.ts';
import { SESSION, SESSION_PREFIX } from './session.ts';

/**
 * THE STATES A RUN'S OWN `handoff` WRITES, AND NO OTHER: resting (`idle`), leaving a step for the next run (`handoff`)
 * and finished (`done`). One constant, which the record's `handoff` and the agent door's tool read, so the three never
 * list different states. `active` is not one (a run is active because it writes) and `abandoned` is the sweep's word.
 */
export const HANDOFF_STATES = ['idle', 'handoff', 'done'] as const;

const DAY_MS = 86_400_000;
/**
 * A step older than this reads `earlier`, never `next`. A DAY, NOT A WEEK: on the owner's record a 39-hour-old step to
 * "run full CI on master" led every card and the Agents page while master moved a hundred commits past it. A step that
 * old is one to check, which `earlier` says, not the one thing to do.
 */
export const EARLIER_MS = DAY_MS;
/** A step nobody took in this long is closed by the sweep. */
export const EXPIRE_MS = 30 * DAY_MS;

/** The note on a step the sweep closes. */
export const EXPIRED_NOTE = 'Nobody took this step in thirty days.';

/** A later run still at work passes a step over once its stretch here, begun after the step, has lasted this long. */
export const PASSED_ACTIVE_MS = 12 * 3_600_000;

/** The note on a passed-over step the sweep closes, naming the run that worked past it. */
export const PASSED_HEAD = 'Passed over:';
export const passedNote = (by: string): string => `${PASSED_HEAD} ${by} worked here after this step was left.`;

/**
 * Whether run `l` passed over the step on run `h`, as SQL: it works for no other run, wrote, began its stretch once the
 * step was there, and has ended since or, still at work, kept at it for twelve hours without taking it (scope D11). The
 * place is the caller's to add.
 */
export function passedSql(h: string, l: string): string {
  return `${l}.register = ${h}.register AND ${l}.deleted_at IS NULL AND ${l}.id <> ${h}.id
         AND coalesce(json_extract(${l}.fields, '$.parent'), '') = ''
         AND coalesce(json_extract(${l}.fields, '$.wrote'), 0) > 0
         AND julianday(coalesce(json_extract(${l}.fields, '$.stretch_at'), json_extract(${l}.fields, '$.started'))) >= julianday(${leftAt(h)})
         AND (${l}.state IN ('done', 'handoff', 'abandoned') AND julianday(json_extract(${l}.fields, '$.last_seen')) > julianday(${leftAt(h)})
           OR julianday(json_extract(${l}.fields, '$.last_seen')) >= julianday(coalesce(json_extract(${l}.fields, '$.stretch_at'), json_extract(${l}.fields, '$.started'))) + ${PASSED_ACTIVE_MS / 86_400_000})`;
}

/** Where a step was left: the project, or with none the repository. A run naming no project but this repository is here too. */
export type HandoffPlace = { project?: string | null | undefined; repo?: string | null | undefined };

/** One open step, as `openHandoffs` reads it. `id` is a handle; a person is told `spoken`. */
export type OpenHandoff = {
  id: string;
  /** The run that left it, said out loud: `S12`. */
  spoken: string;
  agent: string | null;
  next: string;
  tried: string[];
  head: string | null;
  /** When the step was left. */
  left_at: string;
  age_s: number;
  /** `next`: the one a new session is handed. `earlier`: older than a day, or passed over since. */
  mark: 'next' | 'earlier';
};

/**
 * One write a close makes, for the caller to send through the write path: a move to `done` (or none), the fields only
 * the record writes, the line's note, and who signs it.
 */
export type HandoffChange = { state?: 'done'; stamp: Record<string, Json>; note: string | null; actor: string };
export type HandoffWrite = (id: string, change: HandoffChange) => Result<unknown>;

const iso = (ms: number): string => new Date(ms).toISOString();
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const spokenOf = (seq: number | null): string => `${SESSION_PREFIX}${String(seq ?? '')}`;

/** The SQL that holds a run to a place, and its parameters, or null when the caller is nowhere. `t` is the alias. */
function placeSql(t: string, place: HandoffPlace): { where: string; params: string[] } | null {
  const project = text(place.project);
  const repo = text(place.repo);
  const p = `json_extract(${t}.fields, '$.project')`;
  const r = `json_extract(${t}.fields, '$.repo')`;
  if (project && repo) return { where: `(${p} = ? OR (coalesce(${p}, '') = '' AND ${r} = ?))`, params: [project, repo] };
  if (project) return { where: `${p} = ?`, params: [project] };
  if (repo) return { where: `${r} = ?`, params: [repo] };
  return null;
}

/**
 * Whether a run stands in a place, by the rule `placeSql` holds it to in SQL: the project when the place names one, or
 * with none on the run the repository. A caller who is nowhere holds no run. `take` and `drop` ask it through `may`, so
 * a key placed in one project cannot close another project's step.
 */
export function inPlace(place: HandoffPlace, run: { fields: Record<string, Json> }): boolean {
  const project = text(place.project);
  const repo = text(place.repo);
  const p = run.fields.project;
  const r = run.fields.repo;
  /* No project as `coalesce(p, '') = ''` reads it: absent, null or empty, never some other value that is not text. */
  if (project && repo) return p === project || ((p === undefined || p === null || p === '') && r === repo);
  if (project) return p === project;
  if (repo) return r === repo;
  return false;
}

/** The place a run stands in, read from its own fields, for a taker's `may`: `(run) => inPlace(runPlace(taker), run)`. */
export function runPlace(run: { fields: Record<string, Json> }): HandoffPlace {
  return { project: text(run.fields.project), repo: text(run.fields.repo) };
}

/**
 * When a step was left, on one alias: `next_at`, else (a run from before that field) when it was last heard from, else
 * its last change.
 */
const leftAt = (t: string): string =>
  `coalesce(json_extract(${t}.fields, '$.next_at'), json_extract(${t}.fields, '$.last_seen'), ${t}.updated_at)`;

/**
 * The open steps in a place, newest first, each marked `next` or `earlier`; the caller's own run (`self`) left out.
 *
 * PLAIN SQL OVER `entry`, ONE READ. Whether a later run passed a step over is a correlated `EXISTS` on the same place:
 * a run that began its stretch of work after the step was left and has ended since (done, waiting with a step of its
 * own, or written off), that wrote at least once and works for no other run. Times are compared through `julianday`, so an instant written with milliseconds and
 * one written without order as the moments they are and not as strings.
 */
export function openHandoffs(sql: Sql, place: HandoffPlace, self: string | null, nowMs: number, viewer?: string): OpenHandoff[] {
  const h = placeSql('h', place);
  const l = placeSql('l', place);
  if (!h || !l) return [];
  const rows = sql.all<{ id: string; seq: number | null; fields: string; left_at: string; updated_at: string; passed: number }>(
    `SELECT h.id, h.seq, h.fields, ${leftAt('h')} AS left_at, h.updated_at,
       EXISTS (SELECT 1 FROM entry l WHERE ${passedSql('h', 'l')}
         AND ${l.where}) AS passed
     FROM entry h WHERE h.register = ? AND h.deleted_at IS NULL AND h.state = 'handoff' AND h.id <> ?
       AND trim(coalesce(json_extract(h.fields, '$.next'), '')) <> '' AND ${h.where}${viewer === undefined ? '' : ` AND ${unprivate('h.id')}`}
     ORDER BY julianday(left_at) DESC, h.seq DESC`,
    ...l.params,
    SESSION,
    self ?? '',
    ...h.params,
    ...(viewer === undefined ? [] : [viewer]),
  );
  return rows.map((row) => {
    const fields = JSON.parse(row.fields) as Record<string, Json>;
    /* A time that does not parse reads as old, never as just now: such a step would otherwise be `next` for good. Its
       age is then since its last change, and never under a day. */
    const at = Date.parse(row.left_at);
    const changed = Date.parse(row.updated_at);
    const age = Number.isFinite(at)
      ? Math.max(0, nowMs - at)
      : Math.max(EARLIER_MS, Number.isFinite(changed) ? nowMs - changed : 0);
    return {
      id: row.id,
      spoken: spokenOf(row.seq),
      agent: text(fields.agent),
      next: String(fields.next).trim(),
      tried: Array.isArray(fields.tried) ? fields.tried.filter((t): t is string => typeof t === 'string') : [],
      head: text(fields.head),
      left_at: row.left_at,
      age_s: Math.floor(age / 1000),
      mark: age < EARLIER_MS && row.passed === 0 ? 'next' : 'earlier',
    };
  });
}

/** A run as `take` and `drop` read it, and as their `may` is asked about it. */
export type RunRow = { id: string; seq: number | null; state: string | null; fields: Record<string, Json> };

/**
 * The refusal for a run that is not there, and for one the caller may not touch: the same words, so a key learns
 * nothing of a run outside its place.
 */
const unknownRun = (left: string): Result<never> =>
  no<never>('ROW_UNKNOWN', `There is no run called ${left.trim()} here. Name one of the open steps.`, { at: 'left' });

/** A run by its spoken name (`S12`) or its id, live or finished, or null. */
function runOf(sql: Sql, left: string): RunRow | null {
  const said = left.trim();
  const bySeq = said.startsWith(SESSION_PREFIX) && /^\d+$/.test(said.slice(SESSION_PREFIX.length));
  const row = sql.one<{ id: string; seq: number | null; state: string | null; fields: string }>(
    `SELECT id, seq, state, fields FROM entry WHERE register = ? AND deleted_at IS NULL AND ${bySeq ? 'seq' : 'id'} = ?`,
    SESSION,
    bySeq ? Number(said.slice(SESSION_PREFIX.length)) : said,
  );
  return row ? { ...row, fields: JSON.parse(row.fields) as Record<string, Json> } : null;
}

/** How long ago, in words: " just now", " 5 minutes ago", " 2 days ago"; empty when the moment is not known. */
function ago(at: Json | undefined, nowMs: number): string {
  const ms = typeof at === 'string' ? Date.parse(at) : NaN;
  if (!Number.isFinite(ms)) return '';
  const s = Math.max(0, Math.floor((nowMs - ms) / 1000));
  const say = (n: number, unit: string): string => ` ${String(n)} ${unit}${n === 1 ? '' : 's'} ago`;
  if (s < 60) return ' just now';
  if (s < 3600) return say(Math.floor(s / 60), 'minute');
  if (s < 86_400) return say(Math.floor(s / 3600), 'hour');
  return say(Math.floor(s / 86_400), 'day');
}

/**
 * What a run that has no step waiting says to a caller who asked to take or drop one: who took it and when, that it was
 * dropped or closed after thirty days, or that the run left none. The second of two agents racing for one step reads
 * the first of these, "S12 already took this 2 minutes ago.", with the run's spoken name.
 */
export function notOpenSaying(run: { seq: number | null; state: string | null; fields: Record<string, Json> }, nowMs: number): string {
  const f = run.fields;
  const when = ago(f.closed_at, nowMs);
  if (f.closed_as === 'taken') return `${text(f.taken_by) ?? 'Another run'} already took this${when}.`;
  if (f.closed_as === 'dropped') return `This step was dropped${when}.`;
  if (f.closed_as === 'expired') return `Nobody took this step in thirty days, so it closed${when}.`;
  const name = spokenOf(run.seq);
  return run.state === 'active' || run.state === 'idle' ? `${name} is still working and has no step waiting.` : `${name} left no step waiting.`;
}

/** What a take answers: the run whose step it was, the step's words and the kind of agent that left it. */
export type Taken = { left: string; next: string; agent: string | null };

/** Thrown to undo a take whose second write failed, and caught here. */
const UNDO = Symbol('undo');

/**
 * `taker` picks up the step `left` left (its spoken name or its id). The run that left it is done, `closed_as: taken`,
 * with `taken_by` and `closed_at`, and the taker gets `took`.
 *
 * THE FIRST WINS. The read of the run in `handoff` and the move out of it are one transaction, and SQLite runs one
 * writer at a time, so of two agents taking one step the first closes it and the second finds it done and is answered
 * who took it, by name, and when. A taker's own step is not its to take: a resumed session carries on with it.
 *
 * `may` says which runs the taker may reach (`inPlace` on its own place): one outside it is answered as one that is
 * not there. Without it every run is in reach, as for the record's own callers.
 */
export function take(
  sql: Sql,
  taker: { id: string; spoken: string },
  left: string,
  nowMs: number,
  write: HandoffWrite,
  may?: (run: RunRow) => boolean,
): Result<Taken> {
  let failed: Result<never> | null = null;
  try {
    return sql.transactionSync((): Result<Taken> => {
      const run = runOf(sql, left);
      if (!run || (may && !may(run))) return unknownRun(left);
      const name = spokenOf(run.seq);
      if (run.id === taker.id) return no('FORBIDDEN', `${name} is your own run. Carry on with its step; there is nothing to take.`, { at: 'left' });
      if (run.state !== 'handoff') return no('TRANSITION_ILLEGAL', notOpenSaying(run, nowMs), { at: 'left' });
      const now = iso(nowMs);
      const closed = write(run.id, {
        state: 'done',
        stamp: { closed_as: 'taken', closed_at: now, taken_by: taker.spoken },
        note: `Taken by ${taker.spoken}.`,
        actor: taker.spoken,
      });
      if (!closed.ok) return closed;
      const took = write(taker.id, { stamp: { took: name }, note: null, actor: taker.spoken });
      if (!took.ok) {
        failed = took;
        throw UNDO;
      }
      return ok({ left: name, next: String(run.fields.next ?? ''), agent: text(run.fields.agent) });
    });
  } catch (e) {
    if (e === UNDO && failed) return failed;
    throw e;
  }
}

/**
 * `by` closes the step `left` left without taking it, saying why: the run is done, `closed_as: dropped`, and the reason
 * is the line's note. A reason is required, because a step closed with none leaves its history asking what happened.
 * An agent drops a step that is no longer true; a person drops one from the app. `may` holds an agent to its place, as
 * in `take`.
 */
export function drop(
  sql: Sql,
  by: string,
  left: string,
  why: string,
  nowMs: number,
  write: HandoffWrite,
  may?: (run: RunRow) => boolean,
): Result<{ left: string; next: string }> {
  const reason = why.trim();
  if (reason === '')
    return no('REQUIRED_MISSING', 'Say in a few words why this step is dropped, so whoever reads its history knows.', { at: 'why' });
  return sql.transactionSync((): Result<{ left: string; next: string }> => {
    const run = runOf(sql, left);
    if (!run || (may && !may(run))) return unknownRun(left);
    if (run.state !== 'handoff') return no('TRANSITION_ILLEGAL', notOpenSaying(run, nowMs), { at: 'left' });
    const closed = write(run.id, { state: 'done', stamp: { closed_as: 'dropped', closed_at: iso(nowMs) }, note: reason, actor: by });
    if (!closed.ok) return closed;
    return ok({ left: spokenOf(run.seq), next: String(run.fields.next ?? '') });
  });
}

/**
 * The hourly sweep's part: every step left over thirty days ago and still open is closed, `closed_as: expired`, with
 * the note "Nobody took this step in thirty days.", signed by `system`, oldest first and `limit` an hour. Its words
 * stay on the run. Answers how many closed. A step whose left time does not parse is aged from its last change, since
 * `julianday` of a bad time is NULL and would keep it open for good.
 */
export function expire(sql: Sql, nowMs: number, write: HandoffWrite, limit = 100): number {
  const at = `coalesce(julianday(${leftAt('h')}), julianday(h.updated_at))`;
  const old = sql.all<{ id: string }>(
    `SELECT h.id FROM entry h WHERE h.register = ? AND h.deleted_at IS NULL AND h.state = 'handoff'
       AND ${at} < julianday(?)
     ORDER BY ${at}, h.seq LIMIT ?`,
    SESSION,
    iso(nowMs - EXPIRE_MS),
    Math.max(0, Math.floor(limit)),
  );
  const now = iso(nowMs);
  let n = 0;
  for (const row of old)
    if (write(row.id, { state: 'done', stamp: { closed_as: 'expired', closed_at: now }, note: EXPIRED_NOTE, actor: 'system' }).ok) n++;
  return n;
}

/**
 * The hourly sweep's other part: every open step a later run in the same place passed over (`passedSql`) is closed as
 * dropped, signed by `system`, with a note naming that run, so a stale step stops showing to every run within the hour
 * and not after thirty days. `dropped` and not a new value: `closed_as` is an enum migration 28 declares. Answers how
 * many closed.
 */
export function closePassed(sql: Sql, nowMs: number, write: HandoffWrite, limit = 100): number {
  const project = (t: string): string => `coalesce(json_extract(${t}.fields, '$.project'), '')`;
  const repo = (t: string): string => `coalesce(json_extract(${t}.fields, '$.repo'), '')`;
  const passed = sql.all<{ id: string; by: number | null }>(
    `SELECT id, by FROM (SELECT h.id, h.seq, (SELECT l.seq FROM entry l WHERE ${passedSql('h', 'l')}
         AND ((${project('h')} <> '' AND ${project('l')} = ${project('h')})
           OR (${project('h')} = '' AND ${project('l')} = '' AND ${repo('h')} <> '' AND ${repo('l')} = ${repo('h')}))
         ORDER BY l.seq LIMIT 1) AS by
     FROM entry h WHERE h.register = ? AND h.deleted_at IS NULL AND h.state = 'handoff'
       AND trim(coalesce(json_extract(h.fields, '$.next'), '')) <> '')
     WHERE by IS NOT NULL ORDER BY seq LIMIT ?`,
    SESSION,
    Math.max(0, Math.floor(limit)),
  );
  const now = iso(nowMs);
  let n = 0;
  for (const row of passed) {
    if (row.by === null) continue;
    if (write(row.id, { state: 'done', stamp: { closed_as: 'dropped', closed_at: now }, note: passedNote(spokenOf(row.by)), actor: 'system' }).ok) n++;
  }
  return n;
}
