/**
 * The tidy (AGT-C18, "how good is braindog's mcp at cleaning up stale stuff?", D40.10): one list of what went stale.
 *
 * WHAT WAS THERE BEFORE. One hourly sweep (`sweepRecord`) that writes runs off and closes old steps, and no read that
 * says what is stale now or what was cleaned. So nobody could say how the record was keeping itself, and the only
 * things ever cleaned were the ones the sweep was written for.
 *
 * A FINDER IS A READ. `{ id, find(sql, nowMs) }` answers `{ stale, did, ask }`: how many of its things are stale now,
 * how many the record cleared in the last day, and the one question it would put to the person, or `null`. A finder
 * WRITES NOTHING: the sweep's functions go on doing the sweep's writes, and each finder here starts from the query one
 * of them runs, counted instead of acted on. What a finder may do when the person says "Always do this" is its own
 * later part.
 *
 * AT MOST ONE QUESTION A FINDER, held by its cause, `tidy#<finder>`. `tidy` files it the first time the finder has
 * something stale and a question to ask, and never again: an open one is found and kept to its count, and an answered
 * one is the person's answer. Ten finders can so ask ten questions and no more, which is the risk this part names.
 */

import type { Sql } from '@braindog/ports';

import { causeFault } from './cause.ts';
import { EXPIRE_MS } from './handoff.ts';
import { ABANDON_MS } from './presence.ts';
import { SWEPT_NOTE, SWEPT_STEP_NOTE } from './schedule.ts';
import { SESSION } from './session.ts';

const DAY_MS = 86_400_000;

/** How far back `did` looks: the last day, since the tick keeps one line a finder a day. */
export const DID_MS = DAY_MS;
/** An ended run that wrote nothing is stale once this old. */
export const EMPTY_RUN_MS = 30 * DAY_MS;
/** An open question is old once it has waited this long. */
export const OLD_QUESTION_MS = 14 * DAY_MS;

/** What a finder would ask: the question as the person reads it, and one sentence for what "Do it" does. */
export type TidyAsk = { question: string; does: string };

/** What a finder answers. `stale`: how many now. `did`: how many the record cleared in the last day. */
export type Found = { stale: number; did: number; ask: TidyAsk | null };

export type Finder = { id: string; find(sql: Sql, nowMs: number): Found };

/** What `tidy` needs to file a question: the record's counter and its mint, as the write path holds them. */
export type TidyDeps = { sql: Sql; nowMs: number; mint: () => string; allocate: (name: string) => number };

/** One finder's line for one tick. `asked` is its question, open or just filed, or `null` when it has none open. */
export type TidyLine = { finder: string; stale: number; did: number; asked: string | null };

/** The three answers every tidy question carries, in the order they are offered. */
export const TIDY_OPTIONS = [
  { id: 'do', label: 'Do it' },
  { id: 'always', label: 'Always do this' },
  { id: 'leave', label: 'Leave them' },
] as const;

/** The cause a finder's one question is held by. */
export const causeOfFinder = (id: string): string => `tidy#${id}`;

const iso = (ms: number): string => new Date(ms).toISOString();
const count = (sql: Sql, query: string, ...params: (string | number | null)[]): number =>
  Number(sql.one<{ n: number }>(query, ...params)?.n ?? 0);
/** "1 run" or "3 runs". */
const many = (n: number, one: string, more = `${one}s`): string => `${n} ${n === 1 ? one : more}`;

/* ── the registry ───────────────────────────────────────────────────────── */

const registry = new Map<string, Finder>();

/**
 * Add a finder. Its id is a short key of lower-case words and hyphens, because it sits in a cause and names a figure,
 * and it is refused when the registry already holds it: two finders under one cause would share one question.
 */
export function registerFinder(finder: Finder): void {
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(finder.id) || causeFault(causeOfFinder(finder.id)) !== null)
    throw new TypeError(`A finder's id is lower-case words joined by hyphens, such as runs-empty. This one is ${JSON.stringify(finder.id)}.`);
  if (registry.has(finder.id)) throw new TypeError(`The tidy already holds a finder called ${finder.id}.`);
  registry.set(finder.id, finder);
}

/** Every finder, in the order registered. */
export const finders = (): Finder[] => [...registry.values()];

export const finderOf = (id: string): Finder | undefined => registry.get(id);

/* ── this part's finders ────────────────────────────────────────────────── */

const heard = (t: string): string => `coalesce(json_extract(${t}.fields, '$.last_seen'), ${t}.updated_at)`;
/** When a step was left, as `handoff.ts` reads it: `next_at`, else when the run was last heard from, else its last change. */
const leftAt = (t: string): string =>
  `coalesce(json_extract(${t}.fields, '$.next_at'), json_extract(${t}.fields, '$.last_seen'), ${t}.updated_at)`;
const project = (t: string): string => `coalesce(json_extract(${t}.fields, '$.project'), '')`;
const repo = (t: string): string => `coalesce(json_extract(${t}.fields, '$.repo'), '')`;

/**
 * `runs-stopped`, the sweep's count. Stale: the runs not heard from in twelve hours that still read as working, which
 * is `sweepSessions`' own query, so it is what the next tick writes off. Did: the runs the sweep wrote off or left
 * waiting with their step in the last day, read from the lines it signed.
 */
const runsStopped: Finder = {
  id: 'runs-stopped',
  find(sql, nowMs) {
    const stale = count(
      sql,
      `SELECT COUNT(*) AS n FROM entry e WHERE e.register = ? AND e.deleted_at IS NULL AND e.state IN ('active', 'idle') AND ${heard('e')} < ?`,
      SESSION,
      iso(nowMs - ABANDON_MS),
    );
    const did = count(
      sql,
      "SELECT COUNT(*) AS n FROM event WHERE kind = 'state' AND actor = 'system' AND note IN (?, ?) AND ts > ? AND ts <= ?",
      SWEPT_NOTE,
      SWEPT_STEP_NOTE,
      iso(nowMs - DID_MS),
      iso(nowMs),
    );
    return { stale, did, ask: null };
  },
};

/**
 * `runs-empty`: a run that ended, wrote nothing, and was last heard from over thirty days ago. Ended is done or written
 * off; a run waiting with a step is not ended. Wrote nothing is a `wrote` of 0 and never a missing one: a run migration
 * 28's data steps have not reached yet is not known to be empty. It asks once whether to delete them, and deletes none.
 */
const runsEmpty: Finder = {
  id: 'runs-empty',
  find(sql, nowMs) {
    const stale = count(
      sql,
      `SELECT COUNT(*) AS n FROM entry e WHERE e.register = ? AND e.deleted_at IS NULL AND e.state IN ('done', 'abandoned')
         AND json_extract(e.fields, '$.wrote') = 0 AND ${heard('e')} < ?`,
      SESSION,
      iso(nowMs - EMPTY_RUN_MS),
    );
    if (stale === 0) return { stale, did: 0, ask: null };
    const runs = many(stale, 'run');
    return {
      stale,
      did: 0,
      ask: {
        question: `${runs} ended more than 30 days ago and wrote nothing. Delete ${stale === 1 ? 'it' : 'them'}?`,
        does: `Deletes the ${runs}. Nothing they wrote is lost, because they wrote nothing.`,
      },
    };
  },
};

/**
 * `steps-old`: steps passed over, and steps expired. Stale: an open step that a later run in the same place passed
 * over (`openHandoffs`' own test: it began after the step was left, wrote, ended, and works for no other run), or one
 * left over thirty days ago that `expire` has not reached yet. Did: the steps that expired in the last day.
 *
 * THE SAME PLACE, with no caller to stand in: the step's own project, or with none on either run its repository.
 */
const stepsOld: Finder = {
  id: 'steps-old',
  find(sql, nowMs) {
    const stale = count(
      sql,
      `SELECT COUNT(*) AS n FROM entry h WHERE h.register = ? AND h.deleted_at IS NULL AND h.state = 'handoff'
         AND trim(coalesce(json_extract(h.fields, '$.next'), '')) <> ''
         AND (coalesce(julianday(${leftAt('h')}), julianday(h.updated_at)) < julianday(?)
           OR EXISTS (SELECT 1 FROM entry l WHERE l.register = h.register AND l.deleted_at IS NULL AND l.id <> h.id
             AND l.state IN ('done', 'handoff', 'abandoned')
             AND coalesce(json_extract(l.fields, '$.parent'), '') = ''
             AND coalesce(json_extract(l.fields, '$.wrote'), 0) > 0
             AND julianday(coalesce(json_extract(l.fields, '$.stretch_at'), json_extract(l.fields, '$.started'))) >= julianday(${leftAt('h')})
             AND julianday(json_extract(l.fields, '$.last_seen')) > julianday(${leftAt('h')})
             AND ((${project('h')} <> '' AND ${project('l')} = ${project('h')})
               OR (${project('h')} = '' AND ${project('l')} = '' AND ${repo('h')} <> '' AND ${repo('l')} = ${repo('h')}))))`,
      SESSION,
      iso(nowMs - EXPIRE_MS),
    );
    const did = count(
      sql,
      `SELECT COUNT(*) AS n FROM entry e WHERE e.register = ? AND e.deleted_at IS NULL
         AND json_extract(e.fields, '$.closed_as') = 'expired'
         AND julianday(json_extract(e.fields, '$.closed_at')) > julianday(?) AND julianday(json_extract(e.fields, '$.closed_at')) <= julianday(?)`,
      SESSION,
      iso(nowMs - DID_MS),
      iso(nowMs),
    );
    return { stale, did, ask: null };
  },
};

/**
 * `questions-old`: open for more than fourteen days. Counted only: an old question is the person's to answer, and the
 * tidy asking about it would be a question about a question. One the person put off to a day still ahead is not old.
 */
const questionsOld: Finder = {
  id: 'questions-old',
  find(sql, nowMs) {
    const stale = count(
      sql,
      "SELECT COUNT(*) AS n FROM suggestion WHERE status = 'open' AND julianday(opened_at) < julianday(?) AND (defer_until IS NULL OR julianday(defer_until) <= julianday(?))",
      iso(nowMs - OLD_QUESTION_MS),
      iso(nowMs),
    );
    return { stale, did: 0, ask: null };
  },
};

for (const finder of [runsStopped, runsEmpty, stepsOld, questionsOld]) registerFinder(finder);

/* ── the tick's part ────────────────────────────────────────────────────── */

/** A tidy question's body: an `options` body, with the finder it is for and how many things it is about. */
function bodyOf(finder: string, found: Found & { ask: TidyAsk }): Record<string, unknown> {
  const because: Record<(typeof TIDY_OPTIONS)[number]['id'], string> = {
    do: found.ask.does,
    always: 'The same, now and each time more turn up, without asking again.',
    leave: 'Nothing changes, and this is not asked again.',
  };
  return {
    cause: causeOfFinder(finder),
    finder,
    count: found.stale,
    options: TIDY_OPTIONS.map((o) => ({ id: o.id, label: o.label, because: because[o.id] })),
  };
}

/**
 * Run every finder once and answer one line each. Run it inside the caller's transaction: `allocate` is the record's
 * counter, which gives a number only there.
 *
 * THE QUESTION, AT MOST ONE A FINDER. Filed when the finder has something stale, offers a question, and no question
 * with its cause was ever asked. One still open is kept to the count it would act on and is the line's `asked`. One
 * the person answered is their answer, so nothing is filed and `asked` is `null`: "Leave them" is not asked again an
 * hour later, and what "Do it" and "Always do this" then do is the part that acts on answers.
 *
 * FILED AS THE RECORD'S OWN (`system`), the way an arrival's question is filed: straight into `suggestion`, with the
 * question's words on its `suggest` line, which is where every question's words are read from.
 */
export function tidy(deps: TidyDeps, list: readonly Finder[] = finders()): TidyLine[] {
  const at = iso(deps.nowMs);
  return list.map((finder) => {
    const found = finder.find(deps.sql, deps.nowMs);
    const cause = causeOfFinder(finder.id);
    const was = deps.sql.one<{ id: string; status: string; body: string }>(
      'SELECT id, status, body FROM suggestion WHERE cause = ? ORDER BY rowid DESC LIMIT 1',
      cause,
    );
    const line = { finder: finder.id, stale: found.stale, did: found.did };
    if (was !== undefined) {
      if (was.status !== 'open') return { ...line, asked: null };
      if (found.ask !== null && found.stale > 0) {
        const body = JSON.stringify(bodyOf(finder.id, { ...found, ask: found.ask }));
        if (body !== was.body) deps.sql.exec('UPDATE suggestion SET body = ? WHERE id = ?', body, was.id);
      }
      return { ...line, asked: was.id };
    }
    if (found.ask === null || found.stale <= 0) return { ...line, asked: null };
    const id = `SG${deps.allocate('suggestion')}`;
    deps.sql.exec(
      "INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at, cause) VALUES (?, 'options', ?, 'open', 'system', ?, ?)",
      id,
      JSON.stringify(bodyOf(finder.id, { ...found, ask: found.ask })),
      at,
      cause,
    );
    deps.sql.exec(
      "INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v) VALUES (?, ?, 'system', 'suggest', ?, 'suggestion', ?)",
      deps.mint(),
      at,
      `suggestion:${id}`,
      found.ask.question,
    );
    return { ...line, asked: id };
  });
}
