/**
 * The tidy ("how good is braindog's mcp at cleaning up stale stuff?"): one list of what went stale.
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
 *
 * THE HOURLY PASS IS `tidyHour`: the same run, one line a finder a day kept in `tidy_line` for 90 days, and a question
 * answered with a plain "Do it" asked again when more things went stale than that answer was about.
 */

import type { Sql } from '@braindog/ports';

import { RECHECK_BOUND, causeFault, moot } from './cause.ts';
import { openFaults } from './fault.ts';
import { EXPIRE_MS, PASSED_HEAD, passedSql } from './handoff.ts';
import { ABANDON_MS, unheardRuns } from './presence.ts';
import { SWEPT_NO_SESSION_NOTE, SWEPT_NOTE, SWEPT_STEP_NOTE } from './schedule.ts';
import { SESSION } from './session.ts';
/* `tidy-keys.ts` IMPORTS ONLY THIS FILE'S TYPES, so the finder it lends adds no load ring. */
import { keysUnopened } from './tidy-keys.ts';
/* `tidy-same.ts` LIKEWISE, and it reads `same.ts`, which this file's importers already load through the write path. */
import { rowsSame } from './tidy-same.ts';

const DAY_MS = 86_400_000;

/** How far back `did` looks: the last day, since the tick keeps one line a finder a day. */
export const DID_MS = DAY_MS;
/** An ended run that wrote nothing is stale once this old. */
export const EMPTY_RUN_MS = 30 * DAY_MS;
/** An open question is old once it has waited this long. */
export const OLD_QUESTION_MS = 14 * DAY_MS;

/** What a finder would ask: the question as the person reads it, and one sentence for what "Do it" does. */
export type TidyAsk = { question: string; does: string };

/** One place a finder's things are, as a person reads it: its line, how many, and the address that shows only them. */
export type FoundAt = { said: string; count: number; href: string };

/**
 * What a finder answers. `stale`: how many now. `did`: how many the record cleared in the last day. A finder may also
 * say its count in a sentence of its own (`said`, "3 things are here twice") and where they are, a place each (`at`),
 * which a reader draws in place of its name and number. Neither is kept in `tidy_line`, and neither asks anything.
 */
export type Found = {
  stale: number;
  did: number;
  ask: TidyAsk | null;
  said?: string | undefined;
  at?: readonly FoundAt[] | undefined;
};

/**
 * `name` is what the finder counts, in plain words, as its figure is called: "Ended runs that wrote nothing". `counted`
 * says a count of them as a sentence a person reads ("64 runs ended without writing anything"), where a list of what
 * went stale says it.
 */
export type Finder = { id: string; name?: string | undefined; counted?: ((n: number) => string) | undefined; find(sql: Sql, nowMs: number): Found };

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
  name: 'Runs that stopped answering',
  counted: (n) => `${many(n, 'run has', 'runs have')} stopped answering`,
  find(sql, nowMs) {
    /* COUNTED BY THE ONE CLOCK (`presence.ts` `unheardRuns`), which is the only file that compares a run's last seen with the time. */
    const stale = unheardRuns(sql, nowMs, ABANDON_MS, ['active', 'idle']);
    const did = count(
      sql,
      "SELECT COUNT(*) AS n FROM event WHERE kind = 'state' AND actor = 'system' AND note IN (?, ?, ?) AND ts > ? AND ts <= ?",
      SWEPT_NOTE,
      SWEPT_STEP_NOTE,
      SWEPT_NO_SESSION_NOTE,
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
  name: 'Ended runs that wrote nothing',
  counted: (n) => `${many(n, 'run', 'runs')} ended without writing anything`,
  find(sql, nowMs) {
    const stale = unheardRuns(sql, nowMs, EMPTY_RUN_MS, ['done', 'abandoned'], "json_extract(fields, '$.wrote') = 0");
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
 * left over thirty days ago that `expire` has not reached yet. Did: the steps that expired or the sweep closed as passed
 * over in the last day.
 *
 * THE SAME PLACE, with no caller to stand in: the step's own project, or with none on either run its repository.
 */
/* THE TIDY COUNTS RUNS AND STEPS, THE RECORD'S OWN BOOKKEEPING, AND ACTS ON ALL OF THEM: owner-level by design, no private-row clause. */
const stepsOld: Finder = {
  id: 'steps-old',
  name: 'Steps passed over or left too long',
  counted: (n) => `${many(n, 'step was', 'steps were')} passed over or left too long`,
  find(sql, nowMs) {
    const stale = count(
      sql,
      `SELECT COUNT(*) AS n FROM entry h WHERE h.register = ? AND h.deleted_at IS NULL AND h.state = 'handoff'
         AND trim(coalesce(json_extract(h.fields, '$.next'), '')) <> ''
         AND (coalesce(julianday(${leftAt('h')}), julianday(h.updated_at)) < julianday(?)
           OR EXISTS (SELECT 1 FROM entry l WHERE ${passedSql('h', 'l')}
             AND ((${project('h')} <> '' AND ${project('l')} = ${project('h')})
               OR (${project('h')} = '' AND ${project('l')} = '' AND ${repo('h')} <> '' AND ${repo('l')} = ${repo('h')}))))`,
      SESSION,
      iso(nowMs - EXPIRE_MS),
    );
    const did = count(
      sql,
      `SELECT COUNT(*) AS n FROM entry e WHERE e.register = ? AND e.deleted_at IS NULL
         AND (json_extract(e.fields, '$.closed_as') = 'expired'
           OR (json_extract(e.fields, '$.closed_as') = 'dropped' AND EXISTS (SELECT 1 FROM event v WHERE v.target = 'entry:' || e.id
             AND v.kind = 'state' AND v.actor = 'system' AND v.note LIKE ?)))
         AND julianday(json_extract(e.fields, '$.closed_at')) > julianday(?) AND julianday(json_extract(e.fields, '$.closed_at')) <= julianday(?)`,
      SESSION,
      /* AND THE ONES THE SWEEP CLOSED AS PASSED OVER (`closePassed`), told from a person's drop by the sweep's own note. */
      `${PASSED_HEAD}%`,
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
  name: 'Questions open more than 14 days',
  counted: (n) => `${many(n, 'question has', 'questions have')} been open more than 14 days`,
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

/** The kinds `moot` can find already so, as `cause.ts` `recheck` walks them. */
const MOOTABLE = "status = 'open' AND body_kind IN ('rowset', 'change', 'pack', 'settings')";

/**
 * `questions-moot`: open questions that are already so, or that ask about things since deleted (`cause.ts` `moot`).
 * Stale: the ones the sweep's `recheck` would close if it ran now, so it reads the same questions in the same order
 * from the same place in the queue, and never more than `RECHECK_BOUND` of them. On a queue longer than the bound
 * that is this hour's stretch of it, not the whole.
 *
 * COUNTED ONLY. It closes none: `recheck` does, each hour, and signs the close. And it asks nothing: a question about
 * questions that need no answer is one more thing waiting on the person.
 */
const questionsMoot: Finder = {
  id: 'questions-moot',
  name: 'Questions that no longer need you',
  counted: (n) => `${many(n, 'question no longer needs', 'questions no longer need')} you`,
  find(sql, nowMs) {
    const total = count(sql, `SELECT COUNT(*) AS n FROM suggestion WHERE ${MOOTABLE}`);
    if (total === 0) return { stale: 0, did: 0, ask: null };
    type Open = { body_kind: string; body: string };
    const read = (offset: number, limit: number): Open[] =>
      limit <= 0 ? [] : sql.all<Open>(`SELECT body_kind, body FROM suggestion WHERE ${MOOTABLE} ORDER BY opened_at ASC, id ASC LIMIT ? OFFSET ?`, limit, offset);
    const from = total <= RECHECK_BOUND ? 0 : (Math.floor(nowMs / 3_600_000) * RECHECK_BOUND) % total;
    const walked = [...read(from, RECHECK_BOUND), ...read(0, Math.min(from, from + RECHECK_BOUND - total))];
    return { stale: walked.filter((q) => moot(q, sql)).length, did: 0, ask: null };
  },
};

/**
 * `faults-open`: work of the record's own that failed and has not gone through since, as the Faults list reads it
 * (`fault.ts` `openFaults`: the open ones, and the dead or failed kinds no fault was filed for). Counted only: a fault
 * clears when its work next succeeds, and nothing here clears one or asks about one.
 */
const faultsOpen: Finder = {
  id: 'faults-open',
  name: 'Faults still open',
  counted: (n) => `${many(n, 'fault is', 'faults are')} still open`,
  find: (sql) => ({ stale: openFaults(sql).length, did: 0, ask: null }),
};

/* AND THE SEALED KEYS NOBODY OPENS, and the things held twice in a list that says what makes two one
   (`rows-same`, C13's clashes): both counted only, and each file says why it asks nothing. */
for (const finder of [runsStopped, runsEmpty, stepsOld, questionsOld, questionsMoot, faultsOpen, keysUnopened, rowsSame]) registerFinder(finder);

/** What a finder found, or `null` when it threw: one finder that cannot count never stops the others being counted. */
function counted(finder: Finder, sql: Sql, nowMs: number): Found | null {
  try {
    return finder.find(sql, nowMs);
  } catch {
    return null;
  }
}

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

/** The newest question a finder's cause ever held, open or closed. */
type Was = { id: string; status: string; body: string; resolved_as: string | null; opened_at: string };

/** Whether a closed question may be asked again now. `tidy` alone never does; the hourly pass knows the floor. */
type Again = (finder: Finder, found: Found, was: Was) => boolean;

/**
 * Run every finder once and answer one line each. Run it inside the caller's transaction: `allocate` is the record's
 * counter, which gives a number only there.
 *
 * THE QUESTION, AT MOST ONE A FINDER. Filed when the finder has something stale, offers a question, and no question
 * with its cause was ever asked. One still open is kept to the count it would act on and is the line's `asked`. One
 * the person answered is their answer, so nothing is filed and `asked` is `null`: "Leave them" is not asked again an
 * hour later. Called by itself it never asks twice; `tidyHour` is the pass that asks again after a plain "Do it".
 *
 * FILED AS THE RECORD'S OWN (`system`), the way an arrival's question is filed: straight into `suggestion`, with the
 * question's words on its `suggest` line, which is where every question's words are read from.
 */
export function tidy(deps: TidyDeps, list: readonly Finder[] = finders()): TidyLine[] {
  return pass(deps, list, () => false);
}

function pass(deps: TidyDeps, list: readonly Finder[], again: Again): TidyLine[] {
  const at = iso(deps.nowMs);
  return list.flatMap((finder): TidyLine[] => {
    /* A FINDER THAT THROWS HAS NO LINE THIS PASS, rather than a line saying nothing is stale, which nobody counted. */
    const found = counted(finder, deps.sql, deps.nowMs);
    if (found === null) return [];
    const cause = causeOfFinder(finder.id);
    const was = deps.sql.one<Was>(
      'SELECT id, status, body, resolved_as, opened_at FROM suggestion WHERE cause = ? ORDER BY rowid DESC LIMIT 1',
      cause,
    );
    const line = { finder: finder.id, stale: found.stale, did: found.did };
    if (was?.status === 'open') {
      if (found.ask !== null && found.stale > 0) {
        const body = JSON.stringify(bodyOf(finder.id, { ...found, ask: found.ask }));
        if (body !== was.body) deps.sql.exec('UPDATE suggestion SET body = ? WHERE id = ?', body, was.id);
      }
      return [{ ...line, asked: was.id }];
    }
    if (found.ask === null || found.stale <= 0) return [{ ...line, asked: null }];
    if (was !== undefined && !again(finder, found, was)) return [{ ...line, asked: null }];
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
    return [{ ...line, asked: id }];
  });
}

/* ── the hourly pass, and its line a finder a day ───────────────────────── */

/** How many days of lines are kept. */
export const KEEP_DAYS = 90;

/**
 * The tidy's own table: one line a finder a day. `stale` and `did` are the day's last pass, so `did` (the last 24
 * hours, as the finder counts it) read at the end of a day is that day's. `low` is the fewest any pass counted that
 * day, and on a day the person answers the finder's question it is counted from the answer on. `at` is the last pass.
 *
 * LOCAL, AND MADE BY THE PASS. It has no line in `dog_section`, so a copy of the record does not carry it: it is what
 * this record counted about itself, and a restored record starts counting again. `IF NOT EXISTS`, so the pass can make
 * it and a migration that later runs these same words changes nothing.
 */
export const TIDY_LINE_DDL =
  'CREATE TABLE IF NOT EXISTS tidy_line (finder TEXT NOT NULL, day TEXT NOT NULL, stale INTEGER NOT NULL, did INTEGER NOT NULL, low INTEGER NOT NULL, at TEXT NOT NULL, PRIMARY KEY (finder, day)) WITHOUT ROWID';

/** One finder's kept line for one day. */
export type TidyDay = { finder: string; day: string; stale: number; did: number; low: number; at: string };

/** The day a line is kept under: the UTC date, the one day every reader of the table agrees on. */
const dayOf = (ms: number): string => iso(ms).slice(0, 10);

/** What the person last said to a finder's question, when they picked one of its answers: the answer and when. */
function saidTo(sql: Sql, cause: string): { answer: string; ts: string } | undefined {
  return sql.one<{ answer: string; ts: string }>('SELECT answer, ts FROM decision WHERE cause = ? ORDER BY ts DESC, rowid DESC LIMIT 1', cause);
}

/**
 * The tidy as the hourly tick calls it: every finder once, its question kept or filed, and today's line written. Run
 * it inside the caller's transaction, as `tidy` is. Calling it twice in an hour is safe: the second call writes the
 * same line and files nothing new.
 *
 * ASKED AGAIN AFTER A PLAIN "DO IT", WHEN NEW THINGS WENT STALE. "Do it" is for the things the question counted, so
 * more of them later are a new question; "Always do this" and "Leave them" are answers for good and are never asked
 * again, and neither is a question the person declined or the record withdrew. NEW is more than the floor: the fewest
 * the finder has counted since the answer, starting from the count the answered question was about. So an answer that
 * cleared everything asks again at the first new one, and an answer nothing has acted on yet asks again only when
 * there are more than it was about, never every hour for the same ones.
 *
 * WHAT IT CANNOT SEE: things cleared and as many new ones turning up between two passes read as no change.
 */
export function tidyHour(deps: TidyDeps, list: readonly Finder[] = finders()): TidyLine[] {
  const { sql, nowMs } = deps;
  sql.exec(TIDY_LINE_DDL);
  const lines = pass(deps, list, (finder, found, was) => {
    const said = saidTo(sql, causeOfFinder(finder.id));
    if (was.resolved_as !== 'addressed' || said?.answer !== 'do' || Date.parse(said.ts) < Date.parse(was.opened_at)) return false;
    const about = Number((JSON.parse(was.body) as { count?: unknown }).count);
    const low = sql.one<{ n: number | null }>(
      'SELECT MIN(low) AS n FROM tidy_line WHERE finder = ? AND julianday(at) > julianday(?)',
      finder.id,
      said.ts,
    )?.n;
    const floor = Math.min(Number.isFinite(about) ? about : found.stale, low ?? Infinity);
    return found.stale > floor;
  });
  const at = iso(nowMs);
  for (const line of lines) {
    /* A line last written before the person's answer starts its `low` again, so the floor is counted from the answer. */
    sql.exec(
      `INSERT INTO tidy_line (finder, day, stale, did, low, at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (finder, day) DO UPDATE SET stale = excluded.stale, did = excluded.did, at = excluded.at,
         low = CASE WHEN julianday(tidy_line.at) < julianday(?) THEN excluded.low ELSE min(tidy_line.low, excluded.low) END`,
      line.finder,
      dayOf(nowMs),
      line.stale,
      line.did,
      line.stale,
      at,
      saidTo(sql, causeOfFinder(line.finder))?.ts ?? null,
    );
  }
  sql.exec('DELETE FROM tidy_line WHERE day <= ?', dayOf(nowMs - KEEP_DAYS * DAY_MS));
  return lines;
}

/**
 * The kept lines of the last `days` days, today included, oldest first and by finder within a day. Empty on a
 * record the pass has not run on yet. What a figure a finder and the "Tidied this week" line read.
 */
export function tidyDays(sql: Sql, nowMs: number, days = 7): TidyDay[] {
  if (sql.one("SELECT 1 AS n FROM sqlite_master WHERE type = 'table' AND name = 'tidy_line'") === undefined) return [];
  return sql.all<TidyDay>(
    'SELECT finder, day, stale, did, low, at FROM tidy_line WHERE day > ? AND day <= ? ORDER BY day, finder',
    dayOf(nowMs - Math.max(1, days) * DAY_MS),
    dayOf(nowMs),
  );
}

/* ── the two numbers a figure reads ─────────────────────────────────────── */

/**
 * How many things are stale now: every finder's `stale`, added up. A READ: it files no question, keeps no line and makes
 * no table, so a figure or a page may call it at any moment and the hourly pass is still the only thing that asks.
 * A finder that throws adds nothing, and the others are still counted.
 */
export function staleNow(sql: Sql, nowMs: number, list: readonly Finder[] = finders()): number {
  let n = 0;
  for (const finder of list) n += counted(finder, sql, nowMs)?.stale ?? 0;
  return n;
}

/**
 * How many things the record cleared in the last `days` days, today included: the kept lines' `did`, added up, for
 * every finder or the one named. 0 on a record the pass has not run on yet. A READ, as `tidyDays` under it is.
 *
 * WHAT IT COUNTS TWICE: a line's `did` looks back a day from its last pass (`DID_MS`), so today's line, written at
 * nine, still holds what was cleared yesterday after nine, which yesterday's line holds too. The sum is right again
 * once today's pass is later in the day than the clearing was. At most one day's clearing, for less than a day.
 */
export function tidied(sql: Sql, nowMs: number, days = 7, finder?: string): number {
  let n = 0;
  for (const line of tidyDays(sql, nowMs, days)) if (finder === undefined || line.finder === finder) n += line.did;
  return n;
}
