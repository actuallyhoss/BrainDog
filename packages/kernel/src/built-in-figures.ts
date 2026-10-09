/**
 * The figures every record has without a pack declaring them: facts about the record itself rather than about a list.
 *
 * `questions-open`: how many questions are waiting on the person. A page gates a block on it with
 * `when: { metric: questions-open, gt: 0 }`, so Money's 'Waiting on you' is drawn only while something is waiting,
 * and a heading or a lead note can say it as `{{questions-open}}`. Before it, no figure could count the queue, because
 * a figure reads a list and the questions are not rows of one, and the tile drew its cleared line on an empty record.
 *
 * AND ONE THING'S QUESTIONS, `questions-open:<what>`: the open questions whose `body.about` is that word, which is what a
 * queue's `where: about is <what>` keeps. So a project page gates its 'Waiting on you' with
 * `when: { metric: 'questions-open:{{spoken}}', gt: 0 }` (or `{{name}}`, whichever its queue's `about is` names), and the
 * queue is not drawn as 'Nothing matched' while other projects have questions waiting. The parameter reaches the count
 * the way it reaches every figure (`fill` in `pages.ts`): the figure holds `about: '{{it}}'`, and the reader fills the
 * hole. Read with no parameter the hole is still there, and the count is the whole record's.
 *
 * A DECLARED FIGURE OF THE SAME ID WINS. The record asks its declarations first and these second, so a pack that
 * declares its own `questions-open` is read as it declared it, and nothing here can take a name from a pack.
 *
 * NOTHING HERE IMPORTS `govern.ts`, because `metrics.ts` reads these and `govern.ts`, which holds the queue, imports
 * `metrics.ts`. The count is `govern.ts`'s `countOpenQuestions` predicate written once more, and
 * `test/built-in-figures.test.ts` holds the two to one answer.
 *
 * AND FIVE SIGNS OF A LIVING RECORD (REC-A01), each of which names no list: how many messages wait on a person, how long
 * the oldest has waited, how long since anything came in, how many feeds are behind, and how many rules ran this week.
 * His record stood still for nine days after the move and no check saw it, because nothing could say so.
 *
 * AND `runs-working`, HOW MANY AGENTS ARE AT WORK NOW (AGT-C02): the runs working with no working parent, by the one
 * clock in `presence.ts`, so a lead note that says "{{runs-working}} agents working" and the cards under it count the
 * same runs. One agent with four helpers is one.
 *
 * AND THE RECORD'S HEALTH IN TWO NUMBERS (PRF-A05): `signs-red`, how many vital signs (`signs.ts`) read red now, and
 * `green-days`, how many days in a row, in the record's zone, the kept readings held none red. A Health page and a Today
 * line read these by name. AND `rates-age-days` (REC-B02): how old the newest exchange rate is, so a page can say the
 * rates stopped before a converted figure quietly goes stale. All three say nothing, never nought, with nothing to read.
 *
 * AND `handoffs-open`, HOW MANY NEXT STEPS WAIT TO BE TAKEN (AGT-C05): the runs waiting in `handoff` with a step left,
 * read by `handoff.ts`'s `openHandoffs`, the read the briefing hands a new session its step from, so the Agents page
 * and the card count the same steps. With `about` filled, one project's.
 *
 * AND WHERE THINGS APPLY (AGT-D01): `projects-unplaced`, the projects that name no repository and no folder, so no run
 * can land in them, and `keys-unopenable`, the keys whose sealed value names a grant revoked or gone. The agents add-on
 * cannot declare either, since it does not know another list's field names. AND `record.door`, the reader the add-on's
 * figures over the agent door's signs read (AGT-B01).
 *
 * `signs.ts` IS NOT IMPORTED, only its types. It reaches `flow.ts` and `digest.ts`, which import `metrics.ts`, which
 * imports this, and the loop that made broke the kernel's own load (`flow.ts` read a pattern before it was set). So the
 * signs now come in through the reader, `EvalContext.signs`, as the rates come in through `fx`; the kept readings are
 * read here from `sign_reading`, which only `signs.ts` writes, and only its closed list.
 */

import type { Result, Sql } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import { DOOR_KEPT_DAYS, DOOR_WINDOW_DAYS, doorMarks } from './door.ts';
import { openHandoffs, type OpenHandoff } from './handoff.ts';
import type { EvalContext, MetricDecl, Reading } from './metrics.ts';
import { workingRuns } from './presence.ts';
import { SESSION } from './session.ts';
import { intervalMs } from './pull.ts';
/* `key-scan.ts` IMPORTS ONLY `coerce.ts` AT RUN TIME, and `coerce.ts` only types, so this adds no load ring. */
import { KEYS_IN_TEXT } from './key-scan.ts';
import { holdDays } from './hold.ts';

/** The source a built-in figure over the open questions reads, the same word a `queue` block's source is. */
export const GOVERNANCE_OPEN = 'governance.open';

/** The hole a parameter fills, as `fill` in `pages.ts` reads it. Still there, the figure was read with no parameter. */
const PARAM = '{{it}}';

/**
 * The open questions' figure: a figure, and what its questions are about. `about` is not a key a pack writes (a
 * declared figure over a list narrows with `where`); it is this figure's own, and it holds `{{it}}` until a parameter
 * fills it.
 */
export type OpenQuestionsDecl = MetricDecl & { about?: string | undefined };

const QUESTIONS_OPEN: OpenQuestionsDecl = {
  metric: 'questions-open',
  name: 'Questions waiting on you',
  source: GOVERNANCE_OPEN,
  value: { count: 'id' },
  target: { lte: 0 },
  window: '7d',
  compare: 'none',
  format: 'int',
  about: PARAM,
};

/** The source the working-runs figure reads, the same word the page source over the same runs is. */
export const SESSIONS_WORKING = 'sessions.working';

/**
 * How many agents are working now. NO TARGET: a count of who is at work is neither good nor bad, so it is never met and
 * never missed, and a tile draws it with no verdict.
 */
const RUNS_WORKING: MetricDecl = {
  metric: 'runs-working',
  name: 'Agents working now',
  source: SESSIONS_WORKING,
  value: { count: 'id' },
  window: '1d',
  compare: 'none',
  format: 'int',
};

/* ── the steps left for the next run (AGT-C05) ─────────────────────────── */

/** The source the open steps are read from, the same word the page source over the same steps is. */
export const HANDOFFS_OPEN = 'handoffs.open';

/** A figure over the open steps, and the project it counts when `about` is filled: a project row's spoken id. */
export type HandoffsDecl = MetricDecl & { about?: string | undefined };

/**
 * How many next steps wait to be taken. NO TARGET: a step left is how one run hands work to the next, neither good nor
 * bad, so the figure is never met and never missed. A step nobody takes closes by itself at thirty days.
 */
const HANDOFFS: HandoffsDecl = {
  metric: 'handoffs-open',
  name: 'Next steps waiting to be taken',
  source: HANDOFFS_OPEN,
  value: { count: 'id' },
  window: '30d',
  compare: 'none',
  format: 'int',
  about: PARAM,
};

/**
 * One open step with the place it was left (the project's spoken id, else the repository) and the client its run said it
 * was, so a page calls the run "Claude Code" as the run's own name does and not only "Claude".
 */
export type OpenStep = OpenHandoff & { project: string | null; repo: string | null; client: string | null };

/**
 * The open steps in one project (`project`, a spoken id as a run holds it), or with none every open step on the record,
 * newest first, each marked `next` or `earlier` by `openHandoffs` in the place it was left.
 *
 * THE WHOLE RECORD IS EACH PLACE IN TURN, because whether a step was passed over is asked of the runs in its own place:
 * every place a waiting run was left in is read once, a project first and its repository only for a run in none.
 */
export function openSteps(sql: Sql, nowMs: number, project?: string | null): OpenStep[] {
  if (typeof project === 'string' && project !== '' && project !== PARAM) return clientsOf(sql, openHandoffs(sql, { project }, null, nowMs).map((h) => ({ ...h, project, repo: null })));
  const places = sql.all<{ project: string | null; repo: string | null }>(
    `SELECT DISTINCT nullif(json_extract(fields, '$.project'), '') AS project,
       CASE WHEN coalesce(json_extract(fields, '$.project'), '') = '' THEN nullif(json_extract(fields, '$.repo'), '') END AS repo
     FROM entry WHERE register = ? AND deleted_at IS NULL AND state = 'handoff'`,
    SESSION,
  );
  const seen = new Set<string>();
  const out: Omit<OpenStep, 'client'>[] = [];
  for (const place of places)
    for (const h of openHandoffs(sql, place.project ? { project: place.project } : { repo: place.repo }, null, nowMs))
      if (!seen.has(h.id)) {
        seen.add(h.id);
        out.push({ ...h, project: place.project, repo: place.project ? null : place.repo });
      }
  return clientsOf(sql, out.sort((a, b) => Date.parse(b.left_at) - Date.parse(a.left_at) || (a.spoken < b.spoken ? 1 : -1)));
}

/** Each step with its run's client, in one read over the runs that left them, their ids bound as one array (AGT-B03). */
function clientsOf(sql: Sql, steps: Omit<OpenStep, 'client'>[]): OpenStep[] {
  if (steps.length === 0) return [];
  const rows = sql.all<{ id: string; client: string | null }>(
    `SELECT id, json_extract(fields, '$.client') AS client FROM entry WHERE register = ? AND id IN (SELECT value FROM json_each(?))`,
    SESSION,
    JSON.stringify(steps.map((s) => s.id)),
  );
  const client = new Map(rows.map((r) => [r.id, typeof r.client === 'string' && r.client !== '' ? r.client : null]));
  return steps.map((s) => ({ ...s, client: client.get(s.id) ?? null }));
}

/** How many next steps wait, on the record or in the one project `about` names. Always now, as the briefing reads them. */
export function readHandoffsOpen(sql: Sql, ctx: Pick<EvalContext, 'nowMs'>, decl?: MetricDecl): Result<Reading> {
  const about = (decl as HandoffsDecl | undefined)?.about;
  const n = openSteps(sql, ctx.nowMs, typeof about === 'string' ? about : null).length;
  return ok({ value: n, unit: null, rows: n, held: n, delta: null, why: 'no comparison asked for', met: null, refusals: [] });
}

/* ── the signs of a living record (REC-A01) ────────────────────────────── */

/**
 * The source the record's own signs read: facts about what arrives and what runs, which no list holds. Each figure names
 * the one sign it is (`sign`), and `arrivals-waiting` may be narrowed to one door (`door`, filled as `about` is).
 */
export const RECORD_SIGNS = 'record.signs';

/** The five signs, by id. */
export const SIGNS = ['arrivals-waiting', 'arrivals-oldest-days', 'arrivals-newest-hours', 'feeds-behind', 'rules-fired-7d'] as const;
export type Sign = (typeof SIGNS)[number];

/** A sign's figure: which sign, and for `arrivals-waiting` the door it counts at, `{{it}}` until a parameter fills it. */
export type SignDecl = MetricDecl & { sign: Sign; door?: string | undefined };

const sign = (id: Sign, name: string, target: { lte: number } | { gte: number }, format: string, more: Partial<SignDecl> = {}): SignDecl => ({
  metric: id,
  name,
  source: RECORD_SIGNS,
  value: { count: 'id' },
  target,
  window: '7d',
  compare: 'none',
  format,
  sign: id,
  ...more,
});

/* ── the record's health, over the vital signs (PRF-A05) and the rates (REC-B02) ── */

/** The source the two figures over the vital signs read: the signs now, and the readings kept a row a day. */
export const RECORD_VITALS = 'record.vitals';

/** Which of the three a figure is: how many signs read red now, how many are not read yet, or how many days in a row held none red. */
export type VitalsDecl = MetricDecl & { vitals: 'red-now' | 'green-days' | 'unread-now' };

const SIGNS_RED: VitalsDecl = {
  metric: 'signs-red',
  name: 'Vital signs that read red',
  source: RECORD_VITALS,
  value: { count: 'id' },
  target: { lte: 0 },
  window: '1d',
  compare: 'none',
  format: 'int',
  vitals: 'red-now',
};

/* HOW MANY SIGNS HAVE NOTHING TO JUDGE BY YET (health-words-43): Health says nought red as "No vital sign needs a look",
   and this is the count that says how much of the record that line has not seen. NO TARGET: a sign with nothing to
   judge by yet is nothing wrong, and a fresh record told it missed a mark is audit 38-39 #11 again. */
const SIGNS_UNREAD: VitalsDecl = {
  metric: 'signs-unread',
  name: 'Vital signs not read yet',
  source: RECORD_VITALS,
  value: { count: 'id' },
  window: '1d',
  compare: 'none',
  format: 'int',
  vitals: 'unread-now',
};

const GREEN_DAYS: VitalsDecl = {
  metric: 'green-days',
  name: 'Days in a row with every watched sign green',
  source: RECORD_VITALS,
  value: { count: 'id' },
  target: { gte: 1 },
  window: '1d',
  compare: 'none',
  format: 'days',
  vitals: 'green-days',
};

/** The source the rates' age reads: the rows of the list that declares `rates:`, through the reader's `fx`. */
export const RECORD_RATES = 'record.rates';

/**
 * Old past a week, the age `fx.ts` marks a converted figure stale at (`RATE_STALE_DAYS`). WRITTEN AND NOT IMPORTED: this
 * object is built as the file loads, and `fx.ts` reaches back here through `ingest.ts`, so importing it made loading
 * `fx.ts` or `forecast.ts` first throw. `test/built-in-rates-age.test.ts` holds the two to one number.
 */
const RATES_AGE_DAYS: MetricDecl = {
  metric: 'rates-age-days',
  name: 'Days since the newest exchange rate',
  source: RECORD_RATES,
  value: { count: 'id' },
  target: { lte: 7 },
  window: '7d',
  compare: 'none',
  format: 'days',
};

/* ── the agent door's signs (AGT-B01), and where things apply (AGT-D01) ─── */

/**
 * The source a figure over the agent door's own signs reads: what its marks add up to over the figure's window
 * (`door.ts`), the count `doorSigns` answers. The figure names the one sign it is (`sign`). The agents add-on declares
 * these, so no figure of this source is built in here.
 */
export const RECORD_DOOR = 'record.door';

/** The door's signs a figure may name: the counts and times of `DoorSigns`, by their own names. */
export const DOOR_FIGURE_SIGNS = ['hello', 'listed', 'called', 'calls', 'behind', 'internal', 'hookMedianMs', 'hookSlowestMs', 'resourceSlowestMs', 'cardWordsMost'] as const;
export type DoorFigureSign = (typeof DOOR_FIGURE_SIGNS)[number];

/** A figure over the door: which of its signs. */
export type DoorDecl = MetricDecl & { sign: DoorFigureSign };

/** The source of `projects-unplaced`: the list that declares `scopes:`, read by its two place fields. */
export const RECORD_PLACES = 'record.places';

/**
 * Projects that name no repository and no folder. A run is placed in a project by where it works, so a project with
 * neither is one no run can ever land in. Read off the list that declares `scopes:`, as the hourly rules read theirs.
 */
const PROJECTS_UNPLACED: MetricDecl = {
  metric: 'projects-unplaced',
  name: 'Projects with no repository or folder',
  source: RECORD_PLACES,
  value: { count: 'id' },
  target: { lte: 0 },
  window: '30d',
  compare: 'none',
  format: 'int',
};

/** The source of `keys-unopenable`: every list with a sealed field, against the vault's grants. */
export const RECORD_KEYS = 'record.keys';

/** Keys whose sealed value cannot be opened: the field names a grant that was revoked, or that is gone. */
const KEYS_UNOPENABLE: MetricDecl = {
  metric: 'keys-unopenable',
  name: 'Keys whose sealed value cannot be opened',
  source: RECORD_KEYS,
  value: { count: 'id' },
  target: { lte: 0 },
  window: '30d',
  compare: 'none',
  format: 'int',
};

/* ── what the night counts (REC-A17 job 3, REC-A13 job 1) ────────────── */

/** The source of `lists-shrunk`: the night's counts of each list (`night-counts.ts`, `countLists`). */
export const RECORD_LISTS = 'record.lists';

/** The source of `documents-dead-paths`: the night's walk over the documents (`night-counts.ts`, `deadPaths`). */
export const RECORD_PATHS = 'record.paths';

/** The series a list's count is kept under, a point a night: `counts:<list>:live` and `counts:<list>:deleted`. */
export const countsSeries = (list: string, part: 'live' | 'deleted'): string => `counts:${list}:${part}`;

/** The series the dead placeholders are kept under, a point a night. */
export const DEAD_PATHS_SERIES = 'paths:dead';

/**
 * Lists holding fewer than the night before with nothing deleted to say why. A list a person deleted from, or one a
 * sweep cleared of what was deleted long ago, is not counted: the first is in the log, and the second never touches
 * what is live. What is left is a loss nobody made, which is the class of fault his rows must never meet.
 */
const LISTS_SHRUNK: MetricDecl = {
  metric: 'lists-shrunk',
  name: 'Lists that shrank with nothing deleted',
  source: RECORD_LISTS,
  value: { count: 'id' },
  target: { lte: 0 },
  window: '1d',
  compare: 'none',
  format: 'int',
};

/** Placeholders in the record's documents (`{{...}}`) that name nothing here. It names no list. */
const DOCUMENTS_DEAD_PATHS: MetricDecl = {
  metric: 'documents-dead-paths',
  name: 'Placeholders in notes that name nothing',
  source: RECORD_PATHS,
  value: { count: 'id' },
  target: { lte: 0 },
  window: '1d',
  compare: 'none',
  format: 'int',
};

/** The figures the record answers by id when no declaration holds that id. */
export const BUILT_IN_FIGURES: Readonly<Record<string, MetricDecl>> = {
  'questions-open': QUESTIONS_OPEN,
  'runs-working': RUNS_WORKING,
  'arrivals-waiting': sign('arrivals-waiting', 'Messages waiting on you', { lte: 0 }, 'int', { door: PARAM }),
  'arrivals-oldest-days': sign('arrivals-oldest-days', 'Days the oldest waiting message has waited', { lte: 1 }, 'days'),
  'arrivals-newest-hours': sign('arrivals-newest-hours', 'Hours since the last message came in', { lte: 72 }, 'int'),
  'feeds-behind': sign('feeds-behind', 'Feeds that are behind', { lte: 0 }, 'int'),
  'rules-fired-7d': sign('rules-fired-7d', 'Rules that ran this week', { gte: 1 }, 'int'),
  'signs-red': SIGNS_RED,
  'signs-unread': SIGNS_UNREAD,
  'green-days': GREEN_DAYS,
  'rates-age-days': RATES_AGE_DAYS,
  'handoffs-open': HANDOFFS,
  'projects-unplaced': PROJECTS_UNPLACED,
  'keys-unopenable': KEYS_UNOPENABLE,
  'keys-in-text': KEYS_IN_TEXT,
  'lists-shrunk': LISTS_SHRUNK,
  'documents-dead-paths': DOCUMENTS_DEAD_PATHS,
};

/** The built-in figure called `id`, or `null`; never one `Object.prototype` lends. */
export const builtInFigure = (id: string): MetricDecl | null => (Object.hasOwn(BUILT_IN_FIGURES, id) ? BUILT_IN_FIGURES[id]! : null);

/**
 * How many questions are open now: not answered, and not put off past this moment. A deferred question is not waiting
 * on anybody until its day, which is how the queue counts it.
 *
 * WITH `about` FILLED, ONLY THE QUESTIONS ABOUT THAT ONE THING, by the test a queue's `about is <what>` makes: the body's
 * `about` is that word exactly. A body this record cannot parse is about nothing (`hydrate` in `govern.ts` hands it
 * back as a string), so it is never one thing's question and it never stops the count.
 */
export function readOpenQuestions(sql: Sql, ctx: Pick<EvalContext, 'nowMs' | 'asOfMs'>, decl?: MetricDecl): Result<Reading> {
  const at = new Date(ctx.asOfMs ?? ctx.nowMs).toISOString();
  const said = (decl as OpenQuestionsDecl | undefined)?.about;
  const about = typeof said === 'string' && said !== PARAM ? said : null;
  const open = "SELECT COUNT(*) AS n FROM suggestion WHERE status = 'open' AND (defer_until IS NULL OR defer_until <= ?)";
  const row =
    about === null
      ? sql.one<{ n: number }>(open, at)
      : sql.one<{ n: number }>(`${open} AND (CASE WHEN json_valid(body) THEN json_extract(body, '$.about') END) = ?`, at, about);
  const n = Number(row?.n ?? 0);
  return ok({ value: n, unit: null, rows: n, held: n, delta: null, why: 'no comparison asked for', met: n <= 0, refusals: [] });
}

/**
 * How many agents are working now, read off `workingRuns`, which every other reader of "working" reads too. Always now,
 * even on a read of a past day: which runs were working at some earlier moment is not kept anywhere to be read back.
 */
export function readRunsWorking(sql: Sql, ctx: Pick<EvalContext, 'nowMs'>): Result<Reading> {
  const n = workingRuns(sql, ctx.nowMs).length;
  return ok({ value: n, unit: null, rows: n, held: n, delta: null, why: 'no comparison asked for', met: null, refusals: [] });
}

/**
 * One of the record's signs, read now. NO VALUE, NEVER NOUGHT, where there is nothing to measure: a record with no door
 * has no arrivals waiting or late, one with no feed has none behind, and one with no rule fired none. A zero there would
 * draw a dead record green, which is how the owner's record stood still for nine days with every check passing.
 *
 * WITH A DOOR, A COUNT OF NONE IS A TRUE ZERO, and so is an oldest wait of none: nothing waits.
 */
export function readSign(sql: Sql, ctx: Pick<EvalContext, 'nowMs' | 'asOfMs'>, decl: MetricDecl): Result<Reading> {
  const nowMs = ctx.asOfMs ?? ctx.nowMs;
  const s = decl as SignDecl;
  const said = typeof s.door === 'string' && s.door !== PARAM && s.door !== '' ? s.door : null;
  const reading = (value: number | null, why: string): Result<Reading> => {
    const bound = decl.target && 'lte' in decl.target ? decl.target.lte : decl.target && 'gte' in decl.target ? decl.target.gte : null;
    const met = value === null || bound === null ? null : decl.target && 'lte' in decl.target ? value <= bound : value >= bound;
    return ok({ value, unit: null, rows: value ?? 0, held: value === null ? 0 : 1, delta: null, why, met, refusals: [] });
  };
  switch (s.sign) {
    case 'arrivals-waiting':
    case 'arrivals-oldest-days':
    case 'arrivals-newest-hours': {
      const doors = doorsOf(sql);
      if (doors.length === 0) return reading(null, 'no door: nothing on this record takes messages in');
      const patterns = said === null ? null : doors.filter((d) => d.ingest === said || d.door === said).map((d) => `ingest:${d.ingest}`);
      if (patterns !== null && patterns.length === 0) return reading(null, `no door called ${said} on this record`);
      if (s.sign === 'arrivals-newest-hours') {
        const newest = sql.one<{ ts: string | null }>("SELECT max(ts) AS ts FROM inbox_raw WHERE state <> 'erased' AND (state <> 'untriaged' OR reason IS NULL OR reason <> ?)", UNVERIFIED_REASON)?.ts;
        if (newest === null || newest === undefined) return reading(null, 'nothing has come in yet');
        return reading(Math.max(0, Math.floor((nowMs - Date.parse(newest)) / 3_600_000)), 'hours since the newest message came in');
      }
      /* THE INBOX'S TWO WAITING STATES, AND A HELD TEXT'S THIRD: what no pattern read (`untriaged`), what a pattern held
         for a person (`review`), and what it read and proposes (`proposed`), each of which waits on a press. An arrival
         nothing verified is the sender's fault, not his to deal with, and is not counted. At one door, a held text by the
         pattern that held it and an unread one by the door it was sent to. */
      const waiting = sql
        .all<{ id: string; ts: string; state: string }>(
          "SELECT id, ts, state FROM inbox_raw WHERE state IN ('untriaged', 'review', 'proposed') AND (state <> 'untriaged' OR reason IS NULL OR reason <> ?) ORDER BY ts",
          UNVERIFIED_REASON,
        )
        .filter((r) => {
          if (patterns === null) return true;
          const kind = r.state === 'untriaged' ? 'arrive' : 'match';
          const actor = sql.one<{ actor: string }>('SELECT actor FROM event WHERE kind = ? AND target = ? ORDER BY rowid DESC LIMIT 1', kind, `inbox_raw:${r.id}`)?.actor ?? '';
          return r.state === 'untriaged' ? actor === `ingest:${said}` : patterns.includes(actor);
        });
      if (s.sign === 'arrivals-waiting') return reading(waiting.length, 'messages held for a person');
      const oldest = waiting[0];
      return reading(oldest === undefined ? 0 : Math.max(0, Math.floor((nowMs - Date.parse(oldest.ts)) / 86_400_000)), 'days the oldest held message has waited');
    }
    case 'feeds-behind': {
      const feeds = feedsOf(sql);
      if (feeds.length === 0) return reading(null, 'no feed: nothing on this record runs on a clock');
      const behind = feeds.filter((f) => nowMs - f.lastGoodMs > 2 * f.everyMs).length;
      return reading(behind, 'feeds whose last good run is older than twice their period');
    }
    case 'rules-fired-7d': {
      const rules = sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM declaration WHERE kind = 'rule' AND superseded_at IS NULL AND retired = 0")?.n ?? 0;
      if (rules === 0) return reading(null, 'no rule: nothing on this record runs by itself');
      const since = new Date(nowMs - 7 * 86_400_000).toISOString();
      const fired = sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM automation_run WHERE state = 'done' AND finished_at >= ?", since)?.n ?? 0;
      return reading(fired, 'rule runs that ended well in the last seven days');
    }
    default:
      return reading(null, 'not a sign this record reads');
  }
}

/** A reading of a count with no comparison, judged against the figure's own target, or no verdict with no value. */
function judged(decl: MetricDecl, value: number | null, why: string): Result<Reading> {
  const t = decl.target;
  const met = value === null || t === undefined ? null : 'lte' in t ? value <= t.lte : value >= t.gte;
  /* HELD IS WHETHER THERE WAS ANYTHING TO READ, NEVER THE VALUE (audit 38-39 #4): a tile hides a figure that held
     nothing, so `held: value` hid `signs-red` at 0, the one reading Health exists to show. */
  return ok({ value, unit: null, rows: value ?? 0, held: value === null ? 0 : 1, delta: null, why, met, refusals: [] });
}

/**
 * The day a read is about, `YYYY-MM-DD`: the record's own today, or on a read of a past day that day. A past day comes
 * as noon UTC of its local date (`snapshot`, `clockOf`), so its UTC date is the day meant in every zone.
 */
function dayOfRead(ctx: Pick<EvalContext, 'nowMs' | 'asOfMs' | 'tz'>): string {
  if (ctx.asOfMs !== undefined) return new Date(ctx.asOfMs).toISOString().slice(0, 10);
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: ctx.tz ?? 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ctx.nowMs));
  } catch {
    return new Date(ctx.nowMs).toISOString().slice(0, 10);
  }
}

/**
 * `signs-red`, `signs-unread` and `green-days`.
 *
 * SIGNS RED NOW is the signs read as Health reads them (`readSigns`, handed in as `ctx.signs`), and a sign that reads
 * `none` is not counted either way. A reader with no signs handed in says nothing rather than guess. On a read of a past day it is that day's kept readings, since what a sign read on a day is not read again
 * later. NOTHING, NEVER NOUGHT, when no sign has anything to judge by: an empty record has no red sign and is not well.
 *
 * GREEN DAYS is the seven-day hold's count (`holdDays`, `hold.ts`): back from yesterday, the days on which every hold
 * sign read green under an unchanged rule and no hand touched the record. A red, a `none`, a missing reading, a moved
 * rule or a hand mark ends the run, so a night that stopped reads nought and not the run before it. Today is never
 * counted, since it is not over. NOTHING, NEVER NOUGHT, when no kept day ever held a sign green or red.
 */
export function readVitals(sql: Sql, ctx: Pick<EvalContext, 'nowMs' | 'asOfMs' | 'tz' | 'signs'>, decl: MetricDecl): Result<Reading> {
  const today = dayOfRead(ctx);
  if ((decl as VitalsDecl).vitals === 'green-days') {
    const judgedOnce = sql.one<{ x: number }>("SELECT 1 AS x FROM sign_reading WHERE day < ? AND state IN ('red', 'green') LIMIT 1", today);
    if (judgedOnce === undefined) return judged(decl, null, 'no kept day has a sign that read green or red yet');
    /* THE HOLD'S RULES, NOT A LOOSER COUNT OF ITS OWN (PRF-A18): a day counts only when every hold sign read green under
       the rule of the day after and no hand touched the record (`hold.ts`), so the run Health says and the seven-day
       hold the scorecard reads are one number. Its sentence says why the run ended. */
    const hold = holdDays(sql, today);
    return judged(decl, hold.days, hold.said);
  }
  /* SIGNS NOT READ YET are the signs that read `none`, the ones Health puts under Not read yet. On a past day it is that
     day's kept readings, the person's own marks left out (a `hand` row is not a sign). NOTHING, NEVER NOUGHT, with no
     signs to count: nought would say every sign was read on a record nobody has read. */
  if ((decl as VitalsDecl).vitals === 'unread-now') {
    if (ctx.asOfMs !== undefined) {
      const kept = sql.one<{ unread: number | null; kept: number | null }>(
        `SELECT SUM(state = 'none') AS unread, COUNT(*) AS kept FROM sign_reading WHERE day = ? AND sign <> 'hand'`,
        today,
      );
      if (!Number(kept?.kept ?? 0)) return judged(decl, null, 'no sign was kept that day');
      return judged(decl, Number(kept?.unread ?? 0), 'signs not read that day');
    }
    if (ctx.signs === undefined) return judged(decl, null, 'the vital signs are not read here yet');
    const all = ctx.signs();
    if (all.length === 0) return judged(decl, null, 'this record has no vital signs to read');
    return judged(decl, all.filter((s) => s.state === 'none').length, 'signs not read yet');
  }
  if (ctx.asOfMs !== undefined) {
    const kept = sql.one<{ red: number | null; judged: number | null }>(
      `SELECT SUM(state = 'red') AS red, SUM(state <> 'none') AS judged FROM sign_reading WHERE day = ?`,
      today,
    );
    if (!Number(kept?.judged ?? 0)) return judged(decl, null, 'no sign had anything to judge by that day');
    return judged(decl, Number(kept?.red ?? 0), 'signs kept red that day');
  }
  if (ctx.signs === undefined) return judged(decl, null, 'the vital signs are not read here yet');
  const signs = ctx.signs().filter((s) => s.state !== 'none');
  if (signs.length === 0) return judged(decl, null, 'no sign has anything to judge by yet');
  return judged(decl, signs.filter((s) => s.state === 'red').length, 'signs that read red now');
}

/**
 * `rates-age-days`: how many days old the newest exchange rate is, by the rows of the list that declares `rates:`, read
 * through the same `fx` every converted figure reads. NOTHING, NEVER NOUGHT, with no rate: nought would say the rates
 * are fresh on a record that has none. On a read of a past day, a rate dated after it does not count. A rate dated
 * ahead of today is nought days old.
 */
export function readRatesAge(ctx: Pick<EvalContext, 'nowMs' | 'asOfMs' | 'tz' | 'fx'>, decl: MetricDecl): Result<Reading> {
  const today = dayOfRead(ctx);
  const rates = ctx.fx?.().rates ?? [];
  const newest = rates.reduce<string | null>((n, r) => (ctx.asOfMs !== undefined && r.as_of > today ? n : n === null || r.as_of > n ? r.as_of : n), null);
  if (newest === null) return judged(decl, null, 'no exchange rate on this record');
  const days = Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${newest}T00:00:00Z`)) / 86_400_000));
  return judged(decl, days, 'days since the newest exchange rate');
}

/**
 * One of the agent door's signs over the figure's window, as `doorSigns` answers it (`door.ts`). The window is the
 * figure's own, in days or weeks, and never longer than the 30 days the marks are kept.
 *
 * NOTHING, NEVER NOUGHT, with no session marked in the window: "no INTERNAL answers" over a door nobody reached would
 * draw green over nothing. A time no session sent is nothing too, as `doorSigns` answers it. `behind` asks the build
 * this host runs (`ctx.build`), and says nothing without it.
 */
export function readDoor(sql: Sql, ctx: Pick<EvalContext, 'nowMs' | 'asOfMs' | 'build'>, decl: MetricDecl): Result<Reading> {
  const sign = (decl as DoorDecl).sign;
  if (!(DOOR_FIGURE_SIGNS as readonly unknown[]).includes(sign))
    return no<Reading>('VALUE_MALFORMED', `${decl.metric}: sign names which of the door's signs it reads, one of ${DOOR_FIGURE_SIGNS.join(', ')}.`, {
      at: 'sign',
      allowed: [...DOOR_FIGURE_SIGNS],
    });
  const nowMs = ctx.asOfMs ?? ctx.nowMs;
  const said = /^(\d+)([dw])$/u.exec(decl.window ?? '');
  const days = said ? Math.min(DOOR_KEPT_DAYS, Math.max(1, Number(said[1]) * (said[2] === 'w' ? 7 : 1))) : DOOR_WINDOW_DAYS;
  const since = nowMs - days * 86_400_000;
  const marked = sql.one<{ x: number }>('SELECT 1 AS x FROM door_mark WHERE at >= ? AND at <= ? LIMIT 1', new Date(since).toISOString(), new Date(nowMs).toISOString());
  if (marked === undefined) return judged(decl, null, 'no session reached the agent door in this window');
  const signs = doorMarks(sql, since, nowMs, typeof ctx.build === 'string' ? ctx.build : undefined);
  const value = signs[sign];
  return judged(decl, typeof value === 'number' ? value : null, sign === 'behind' && value === null ? 'the build this host runs is not known here' : signs.said);
}

/** The list that declares `scopes:`, with the place fields it names, or `null` with none. */
function placesList(sql: Sql): { list: string; done: string[]; fields: string[] } | null {
  const row = sql.one<{ body: string }>(
    "SELECT body FROM declaration WHERE kind = 'register' AND superseded_at IS NULL AND retired = 0 AND json_valid(body) AND json_extract(body, '$.scopes') IS NOT NULL ORDER BY id LIMIT 1",
  );
  if (row === undefined) return null;
  const body = JSON.parse(row.body) as { id?: unknown; done?: unknown; scopes?: { repos?: unknown; folders?: unknown } };
  if (typeof body.id !== 'string') return null;
  const fields = [body.scopes?.repos, body.scopes?.folders].filter((f): f is string => typeof f === 'string' && f !== '');
  const done = Array.isArray(body.done) ? body.done.filter((d): d is string => typeof d === 'string') : [];
  return { list: body.id, done, fields };
}

/** A field read as empty: unset, blank, or a list with nothing in it. */
const emptyField = (field: string): string =>
  `coalesce(trim(CAST(json_extract(fields, '$."${field.replaceAll('"', '""').replaceAll("'", "''")}"') AS TEXT)), '') IN ('', '[]')`;

/**
 * `projects-unplaced`: the projects not deleted and not finished whose repositories and folders are both empty, on the
 * list that declares `scopes:`. NOTHING, NEVER NOUGHT, on a record with no such list, or one that names no place field.
 */
export function readProjectsUnplaced(sql: Sql, _ctx: unknown, decl: MetricDecl): Result<Reading> {
  const places = placesList(sql);
  if (places === null) return judged(decl, null, 'no list on this record holds projects');
  if (places.fields.length === 0) return judged(decl, null, 'the projects name no repository or folder field');
  const n = sql.one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM entry WHERE register = ? AND deleted_at IS NULL
       AND coalesce(state, '') NOT IN (SELECT value FROM json_each(?)) AND ${places.fields.map(emptyField).join(' AND ')}`,
    places.list,
    JSON.stringify(places.done),
  )?.n;
  return judged(decl, Number(n ?? 0), 'projects with no repository and no folder');
}

/**
 * `keys-unopenable`: rows of any list with a sealed field, not deleted and not finished, whose sealed field names a
 * grant that was revoked or is gone. An empty sealed field is not counted here: a key that holds no value says so in
 * its own figure. NOTHING, NEVER NOUGHT, on a record where no list seals a value.
 */
export function readKeysUnopenable(sql: Sql, _ctx: unknown, decl: MetricDecl): Result<Reading> {
  const lists = sql
    .all<{ body: string }>("SELECT body FROM declaration WHERE kind = 'register' AND superseded_at IS NULL AND retired = 0 AND json_valid(body)")
    .flatMap((r) => {
      const body = JSON.parse(r.body) as { id?: unknown; done?: unknown; fields?: unknown };
      const sealed = (Array.isArray(body.fields) ? (body.fields as { id?: unknown; type?: unknown; retired?: unknown }[]) : [])
        .filter((f) => f?.type === 'secret' && f.retired !== true && typeof f.id === 'string')
        .map((f) => f.id as string);
      const done = Array.isArray(body.done) ? body.done.filter((d): d is string => typeof d === 'string') : [];
      return typeof body.id === 'string' && sealed.length > 0 ? [{ list: body.id, sealed, done }] : [];
    });
  if (lists.length === 0) return judged(decl, null, 'no list on this record seals a value');
  let n = 0;
  for (const { list, sealed, done } of lists) {
    const named = sealed.map((f) => `json_extract(fields, '$."${f.replaceAll('"', '""').replaceAll("'", "''")}"')`);
    const broken = named.map((g) => `(coalesce(${g}, '') <> '' AND NOT EXISTS (SELECT 1 FROM grant WHERE id = ${g} AND revoked_at IS NULL))`);
    n += Number(
      sql.one<{ n: number }>(
        `SELECT COUNT(*) AS n FROM entry WHERE register = ? AND deleted_at IS NULL AND coalesce(state, '') NOT IN (SELECT value FROM json_each(?)) AND (${broken.join(' OR ')})`,
        list,
        JSON.stringify(done),
      )?.n ?? 0,
    );
  }
  return judged(decl, n, 'keys whose sealed value names a grant revoked or gone');
}

/** `ingest.ts`'s `UNVERIFIED`, the one reason an arrival nothing vouched for carries, written once more for the import rule above. */
export const UNVERIFIED_REASON = 'nothing verified this arrival, so no pattern was offered it';

/** The installed patterns that take messages in, and the door each reads at. A pull is a feed, not a door. */
function doorsOf(sql: Sql): { ingest: string; door: string | null }[] {
  return sql
    .all<{ ingest: string | null; door: string | null }>(
      `SELECT json_extract(body, '$.ingest') AS ingest, json_extract(body, '$.door') AS door FROM declaration
        WHERE kind = 'ingest' AND superseded_at IS NULL AND retired = 0 AND json_valid(body)
          AND json_extract(body, '$.channel') IN ('email', 'webhook', 'api', 'paste')`,
    )
    .flatMap((r) => (typeof r.ingest === 'string' ? [{ ingest: r.ingest, door: r.door }] : []));
}

/**
 * Every feed on a clock: a scheduled action or script whose declaration says how often it runs, with its period and
 * when it last ran well. A feed that never ran well counts from when it was armed. A paused one is still a feed: nothing
 * lets a person pause one, so a pause is always the record stopping it, and that is behind.
 */
function feedsOf(sql: Sql): { everyMs: number; lastGoodMs: number }[] {
  const rows = sql.all<{ kind: string; key: string }>("SELECT kind, key FROM schedule WHERE kind IN ('pull', 'call', 'poll', 'script') AND state <> 'done'");
  const out: { everyMs: number; lastGoodMs: number }[] = [];
  for (const row of rows) {
    const id = `${row.kind === 'script' ? 'script' : 'ingest'}.${row.key}`;
    const decl = sql.one<{ body: string; created_at: string }>(
      'SELECT body, created_at FROM declaration WHERE id = ? AND superseded_at IS NULL AND retired = 0 ORDER BY version DESC LIMIT 1',
      id,
    );
    if (decl === undefined) continue;
    let body: { every?: unknown; runs?: { every?: unknown } } = {};
    try {
      body = JSON.parse(decl.body) as typeof body;
    } catch {
      continue;
    }
    const every = intervalMs(String((row.kind === 'script' ? body.runs?.every : body.every) ?? ''));
    if (every === null) continue;
    const good = sql.one<{ ts: string | null }>(
      `SELECT max(ts) AS ts FROM event WHERE kind = 'pull' AND target = ? AND json_valid(to_v) AND json_extract(to_v, '$.outcome') = 'ok'`,
      `declaration:${id}`,
    )?.ts;
    const filed = row.kind === 'script' ? null : sql.one<{ ts: string | null }>('SELECT max(ts) AS ts FROM ingest_receipt WHERE ingest_id = ?', row.key)?.ts;
    const last = [good, filed, decl.created_at].filter((t): t is string => typeof t === 'string').map((t) => Date.parse(t));
    out.push({ everyMs: every, lastGoodMs: Math.max(...last) });
  }
  return out;
}

/* ── the night's counts, read back (REC-A17 job 3, REC-A13 job 1) ────── */

/** What a person calls a list: its declared name, or its id with `_` as a space. */
function listNamed(sql: Sql, list: string): string {
  const name = sql.one<{ name: unknown }>(
    "SELECT json_extract(body, '$.name') AS name FROM declaration WHERE kind = 'register' AND superseded_at IS NULL AND json_valid(body) AND json_extract(body, '$.id') = ?",
    list,
  )?.name;
  const words = list.replace(/_/g, ' ');
  return typeof name === 'string' && name.trim() !== '' ? name.trim() : words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * `lists-shrunk`: the lists whose live count fell between the two newest nights counted, by more than the deletes the
 * log holds for that list between them. A list counted the night before and not the last night fell to nought.
 *
 * A DELETE IN THE LOG EXPLAINS A FALL, whoever made it, and so does a record-wide erase or a restore to an earlier
 * moment, each a person's own act. THE SWEEP NEVER COUNTS: it clears what was deleted thirty days ago, which is the
 * `deleted` count and never the live one. NOTHING, NEVER NOUGHT, before two nights are counted: one night has nothing
 * to fall from.
 */
export function readListsShrunk(sql: Sql, ctx: Pick<EvalContext, 'nowMs' | 'asOfMs' | 'tz'>, decl: MetricDecl): Result<Reading> {
  const live = "grain = 'day' AND substr(series, 1, 7) = 'counts:' AND substr(series, -5) = ':live'";
  const days = sql.all<{ at: string }>(`SELECT DISTINCT at FROM metric_point WHERE ${live} AND at <= ? ORDER BY at DESC LIMIT 2`, dayOfRead(ctx)).map((d) => d.at);
  if (days.length < 2) return judged(decl, null, 'the lists have not been counted on two nights yet');
  const [last, before] = days as [string, string];
  const points = sql.all<{ series: string; at: string; value: number; wrote_at: string }>(
    `SELECT series, at, value, wrote_at FROM metric_point WHERE ${live} AND at IN (?, ?)`,
    last,
    before,
  );
  const listOf = (series: string): string => series.slice('counts:'.length, -':live'.length);
  const then = new Map(points.filter((p) => p.at === before).map((p) => [listOf(p.series), p]));
  const now = new Map(points.filter((p) => p.at === last).map((p) => [listOf(p.series), p]));
  const from = [...then.values()].reduce((m, p) => (p.wrote_at > m ? p.wrote_at : m), '');
  const to = [...now.values()].reduce((m, p) => (p.wrote_at > m ? p.wrote_at : m), '');
  const whole = sql.one<{ n: number }>("SELECT count(*) AS n FROM event WHERE kind IN ('erase', 'restore.pitr') AND ts > ? AND ts <= ?", from, to);
  if (Number(whole?.n ?? 0) > 0) return judged(decl, 0, 'the record was erased from or restored between the two nights, so nothing fell unexplained');
  const shrunk: string[] = [];
  for (const [list, p] of then) {
    const fell = Number(p.value) - Number(now.get(list)?.value ?? 0);
    if (fell <= 0) continue;
    /* A ROW DELETED AND SWEPT THE SAME NIGHT IS NO LONGER IN `entry`, so its list is the one its sweep wrote down. */
    const deleted = sql.one<{ n: number }>(
      `SELECT count(*) AS n FROM event ev LEFT JOIN entry e ON e.id = substr(ev.target, 7)
        WHERE ev.kind = 'delete' AND substr(ev.target, 1, 6) = 'entry:' AND ev.ts > ? AND ev.ts <= ?
          AND COALESCE(e.register, (SELECT json_extract(p.from_v, '$') FROM event p
                                     WHERE p.target = ev.target AND p.kind = 'purge' AND p.field = 'register' LIMIT 1)) = ?`,
      p.wrote_at,
      now.get(list)?.wrote_at ?? to,
      list,
    );
    if (fell > Number(deleted?.n ?? 0)) shrunk.push(listNamed(sql, list));
  }
  if (shrunk.length === 0) return judged(decl, 0, 'no list holds fewer than the night before without a delete to say why');
  const why = 'than the night before with nothing deleted to say why';
  return judged(decl, shrunk.length, shrunk.length === 1 ? `${shrunk[0]} holds fewer ${why}` : `${shrunk.length} lists hold fewer ${why}, ${shrunk[0]} among them`);
}

/**
 * `documents-dead-paths`: how many placeholders in the record's documents name nothing here, by the newest night the
 * walk kept (`deadPaths`). NOTHING, NEVER NOUGHT, before the walk has been over every document once.
 */
export function readDeadPaths(sql: Sql, ctx: Pick<EvalContext, 'nowMs' | 'asOfMs' | 'tz'>, decl: MetricDecl): Result<Reading> {
  const kept = sql.one<{ value: number }>(
    "SELECT value FROM metric_point WHERE series = ? AND grain = 'day' AND at <= ? ORDER BY at DESC LIMIT 1",
    DEAD_PATHS_SERIES,
    dayOfRead(ctx),
  );
  if (kept === undefined) return judged(decl, null, 'the notes have not all been read for placeholders yet');
  const n = Number(kept.value);
  if (n === 0) return judged(decl, 0, 'every placeholder in the notes names something here');
  return judged(decl, n, n === 1 ? 'one placeholder in the notes names nothing here' : `${n} placeholders in the notes name nothing here`);
}
