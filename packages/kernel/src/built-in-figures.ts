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
 * NOTHING HERE IMPORTS THE REST OF THE KERNEL BUT TYPES AND `pull.ts`'s INTERVAL, because `metrics.ts` reads these and
 * `govern.ts`, which holds the queue, imports `metrics.ts`; `pull.ts` imports neither. The count is `govern.ts`'s
 * `countOpenQuestions` predicate written once more, and `test/built-in-figures.test.ts` holds the two to one answer.
 *
 * AND FIVE SIGNS OF A LIVING RECORD (REC-A01), each of which names no list: how many messages wait on a person, how long
 * the oldest has waited, how long since anything came in, how many feeds are behind, and how many rules ran this week.
 * His record stood still for nine days after the move and no check saw it, because nothing could say so.
 *
 * AND `runs-working`, HOW MANY AGENTS ARE AT WORK NOW (AGT-C02): the runs working with no working parent, by the one
 * clock in `presence.ts`, so a lead note that says "{{runs-working}} agents working" and the cards under it count the
 * same runs. One agent with four helpers is one.
 */

import type { Result, Sql } from '@braindog/ports';
import { ok } from '@braindog/ports';

import type { EvalContext, MetricDecl, Reading } from './metrics.ts';
import { workingRuns } from './presence.ts';
import { intervalMs } from './pull.ts';

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

/** The figures the record answers by id when no declaration holds that id. */
export const BUILT_IN_FIGURES: Readonly<Record<string, MetricDecl>> = {
  'questions-open': QUESTIONS_OPEN,
  'runs-working': RUNS_WORKING,
  'arrivals-waiting': sign('arrivals-waiting', 'Messages waiting on you', { lte: 0 }, 'int', { door: PARAM }),
  'arrivals-oldest-days': sign('arrivals-oldest-days', 'Days the oldest waiting message has waited', { lte: 1 }, 'days'),
  'arrivals-newest-hours': sign('arrivals-newest-hours', 'Hours since the last message came in', { lte: 72 }, 'int'),
  'feeds-behind': sign('feeds-behind', 'Feeds that are behind', { lte: 0 }, 'int'),
  'rules-fired-7d': sign('rules-fired-7d', 'Rules that ran this week', { gte: 1 }, 'int'),
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
    return ok({ value, unit: null, rows: value ?? 0, held: value ?? 0, delta: null, why, met, refusals: [] });
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
