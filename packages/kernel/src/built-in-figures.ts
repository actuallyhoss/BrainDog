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
 * the way it reaches every figure (`fill` in `fill.ts`): the figure holds `about: '{{it}}'`, and the reader fills the
 * hole. Read with no parameter the hole is still there, and the count is the whole record's.
 *
 * AND ONE LIST'S QUESTIONS, `questions-open-in:<list>`: the open questions whose `body.about` names a row of
 * that list by its spoken id (`tasks#4` is on `tasks`), the rule a queue's `where: list is <list>` keeps
 * (`QueueQuestion.list`, `listOf` in `pages.ts`). So Work says "2 wait on you" of the questions about its own tasks, and
 * gates its 'Waiting on you' on the same count, while a question about a person waits on People's page instead. Read
 * with no parameter it counts the questions about a row of any list. NOT SAVED DAILY, as `questions-open` is not: no
 * built-in figure is armed for the night (`snapshot:` is a declaration's), and a past day read from the queue would
 * count today's open questions on it.
 *
 * A DECLARED FIGURE OF THE SAME ID WINS. The record asks its declarations first and these second, so a pack that
 * declares its own `questions-open` is read as it declared it, and nothing here can take a name from a pack.
 *
 * NOTHING HERE IMPORTS `govern.ts`, because `metrics.ts` reads these and `govern.ts`, which holds the queue, imports
 * `metrics.ts`. The count is `govern.ts`'s `countOpenQuestions` predicate written once more, and
 * `test/built-in-figures.test.ts` holds the two to one answer.
 *
 * AND FIVE SIGNS OF A LIVING RECORD, each of which names no list: how many messages wait on a person, how long
 * the oldest has waited, how long since anything came in, how many feeds are behind, and how many rules ran this week.
 * His record stood still for nine days after the move and no check saw it, because nothing could say so.
 *
 * AND `runs-working`, HOW MANY AGENTS ARE AT WORK NOW: the runs working with no working parent, by the one
 * clock in `presence.ts`, so a lead note that says "{{runs-working}} agents working" and the cards under it count the
 * same runs. One agent with four helpers is one.
 *
 * AND THE RECORD'S HEALTH IN TWO NUMBERS: `signs-red`, how many vital signs (`signs.ts`) read red now, and
 * `green-days`, how many days in a row, in the record's zone, the kept readings held none red. A Health page and a Today
 * line read these by name. AND `rates-age-days`: how old the newest exchange rate is, so a page can say the
 * rates stopped before a converted figure quietly goes stale. All three say nothing, never nought, with nothing to read.
 *
 * AND `handoffs-open`, HOW MANY NEXT STEPS WAIT TO BE TAKEN: the runs waiting in `handoff` with a step left,
 * read by `handoff.ts`'s `openHandoffs`, the read the briefing hands a new session its step from, so the Agents page
 * and the card count the same steps. With `about` filled, one project's.
 *
 * AND THE TIDY AS NUMBERS: `gone-stale`, how many things every finder in `tidy.ts` counts stale now, one
 * figure a finder beside it (`stale-runs-empty` and the rest, built from the registry when asked for), and `tidied-week`,
 * how many the record cleared in seven days, from the lines the hourly pass keeps. Both are reads and write nothing.
 * One finder's week is `tidied-runs-empty` and the rest, built when asked for as the stale ones are, and both totals
 * carry `names`, their count said finder by finder ("41 empty runs hidden and 3 steps nobody took closed").
 *
 * AND WHERE THINGS APPLY: `projects-unplaced`, the projects that name no repository and no folder, so no run
 * can land in them, `keys-unopenable`, the keys whose sealed value names a grant revoked or gone, and `keys-unopened`,
 * the sealed keys nobody has opened in six months, the tidy's finder of that name as a number. The agents add-on
 * cannot declare either, since it does not know another list's field names. AND `record.door`, the reader the add-on's
 * figures over the agent door's signs read.
 *
 * AND `marks-unknown`, THE ROWS WEARING A WORD THAT DRAWS NOTHING: on every list that declares an identity, the
 * rows whose mark names no glyph, so an import that carried another system's icon names is a number a page can show and
 * a tidy can bring to nought. `marks.ts` says what names a glyph, and imports nothing, so it adds no load ring.
 *
 * AND `held-twice`, THE PEOPLE HELD MORE THAN ONCE: how many would go if every plain pair he has not answered
 * were one person, and each one marked as the record's own person beyond the first. His own record held him twice and
 * nothing could say so. `people.ts` counts, by the rules its nightly questions ask by, so the two never disagree.
 * AND `held-twice-shown`, THE PEOPLE THAT COUNT IS ABOUT: two of one name are 1 too many and 2 people to look at, so a note
 * can say both ("3 people, 2 too many"). Read from the same pass, and nothing at all where nobody is held twice.
 *
 * AND THE LOG AS THREE NUMBERS: `activity-by-who`, `activity-by-kind` and `activity-by-hour`, the
 * record's own log over thirty days cut by who wrote each line, by the kind of write and by the hour of the day, each a
 * figure in parts. Activity's three side tiles were worked out inside one screen, from the page of the log the browser
 * had read; now any page draws them and any agent reads them. A feed's own lines only (`readActivity`).
 *
 * `signs.ts` IS NOT IMPORTED, only its types. It reaches `flow.ts` and `digest.ts`, which import `metrics.ts`, which
 * imports this, and the loop that made broke the kernel's own load (`flow.ts` read a pattern before it was set). So the
 * signs now come in through the reader, `EvalContext.signs`, as the rates come in through `fx`; the kept readings are
 * read here from `sign_reading`, which `signs.ts` writes for its closed list, and `hold.ts` writes a `hand` row a day for an operator's hand.
 */

import type { Result, Sql } from '@braindog/ports';
import { unprivate, unprivateLine } from '@braindog/where';
import { no, ok } from '@braindog/ports';

import { DOOR_KEPT_DAYS, DOOR_WINDOW_DAYS, doorMarks } from './door.ts';
import { openHandoffs, type OpenHandoff } from './handoff.ts';
import type { EvalContext, MetricDecl, Reading } from './metrics.ts';
import { liveStateOf, presentRuns, workingRuns } from './presence.ts';
import { SESSION, SESSION_PREFIX, agentOf, isRunName } from './session.ts';
import type { Json } from './coerce.ts';
import { intervalMs } from './pull.ts';
/* `key-scan.ts` IMPORTS ONLY `coerce.ts` AT RUN TIME, and `coerce.ts` only types, so this adds no load ring. */
import { KEYS_IN_TEXT } from './key-scan.ts';
import { holdDays } from './hold.ts';
import { isUnknownMark } from './marks.ts';
import { finderOf, finders, tidied, tidyDays, type Finder } from './tidy.ts';
import { apartJson, NOT_APART } from './govern.ts';
/* `tidy-keys.ts` IMPORTS NOTHING AT RUN TIME, only `tidy.ts`'s types, so this adds no load ring. */
import { countKeysUnopened, fieldOf, sealedLists } from './tidy-keys.ts';
/* `people.ts` REACHES `ingest.ts` AND THROUGH IT MUCH OF THE KERNEL. Only a function is taken, called on a read and never
   as this file loads, so the ring it closes meets no word before it is set. */

/** The source a built-in figure over the open questions reads, the same word a `queue` block's source is. */
export const GOVERNANCE_OPEN = 'governance.open';

/** The hole a parameter fills, as `fill` in `fill.ts` reads it. Still there, the figure was read with no parameter. */
const PARAM = '{{it}}';

/**
 * The open questions' figure: a figure, and what its questions are about. `about` is not a key a pack writes (a
 * declared figure over a list narrows with `where`); it is this figure's own, and it holds `{{it}}` until a parameter
 * fills it.
 */
export type OpenQuestionsDecl = MetricDecl & { about?: string | undefined; list?: string | undefined };

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

/** The open questions about one list's rows: `list` holds `{{it}}` until a list's name fills it. */
const QUESTIONS_OPEN_IN: OpenQuestionsDecl = {
  metric: 'questions-open-in',
  name: 'Questions about this list waiting on you',
  source: GOVERNANCE_OPEN,
  value: { count: 'id' },
  target: { lte: 0 },
  window: '7d',
  compare: 'none',
  format: 'int',
  list: PARAM,
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

/**
 * THE TWO OTHER NUMBERS OF THE AGENTS PAGE'S LINE, over the same source, so its "12 at work on 4 machines, 1 waiting on
 * you" is said by the record and agrees with the rail: `part` names which. NO TARGET, for `runs-working`'s reason.
 */
export type RunsDecl = MetricDecl & { part?: 'machines' | 'waiting' };

/**
 * How many machines the agents at work are on: the machines the working runs name (`host`), each once, and the runs
 * that name none together as one, since they are on some machine. Nought exactly while nobody is at work.
 */
const MACHINES_WORKING: RunsDecl = { ...RUNS_WORKING, metric: 'machines-working', name: 'Machines agents are at work on', part: 'machines' };

/**
 * How many agents wait on him: open runs whose turn is over or that have not called in fifteen minutes, which the live
 * read calls waiting (`liveStateOf`), each counted once whatever helpers it has.
 */
const RUNS_WAITING: RunsDecl = { ...RUNS_WORKING, metric: 'runs-waiting', name: 'Agents waiting on you', part: 'waiting' };

/* ── the steps left for the next run ─────────────────────────── */

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
export type OpenStep = OpenHandoff & { project: string | null; repo: string | null; client: string | null; next_said: string };

/**
 * A file path or a folder in a step: one that starts at a root, at home or here, or two slashes or more, or a last part
 * with a file ending. "and/or" is words. The same rule as the run panel's notes (apps/web run-talk.ts `noteSaid`).
 */
const isPath = (w: string): boolean =>
  /[\\/]/u.test(w) && (/^(?:~|\.{1,2}|[A-Za-z]:)?[\\/]/u.test(w) || (w.match(/[\\/]/gu)?.length ?? 0) >= 2 || /[\\/][^\\/]*\.[A-Za-z][A-Za-z0-9]{0,7}$/u.test(w));

/** A handle the record or a tool gave, never words: a ULID, a UUID, a hash or a commit (`8b1fe59`), `tools#8`, `S42`, `wf_3fa9c2`. */
const IDLIKE = /^(?:[0-9A-HJKMNP-TV-Z]{26}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|[0-9a-f]{12,}|(?=[0-9a-f]*[0-9])(?=[0-9a-f]*[a-f])[0-9a-f]{7,}|[a-z][a-z0-9_]*#[1-9][0-9]*|S[1-9][0-9]*|[a-z]+_(?=[0-9a-z]*[0-9])[0-9a-z]{6,})$/u;

/** A path's last plain words: the last part that holds a letter and is not a handle, its ending and joins said as spaces. */
function lastPlainWords(path: string): string {
  for (const part of path.split(/[\\/]+/u).reverse()) {
    const words = part.replace(/\.[A-Za-z0-9]{1,8}$/u, '').replace(/[-_.]+/gu, ' ').trim();
    if (/\p{L}/u.test(words) && !IDLIKE.test(part.replace(/\.[A-Za-z0-9]{1,8}$/u, ''))) return words;
  }
  return '';
}

/**
 * A STEP AS A PERSON READS IT (`next_said`): each file-path word said by its last plain words and each handle left out,
 * falling back to the step as written when nothing plain is left.
 */
export function stepSaid(next: string): string {
  const said = next
    .split(/\s+/u)
    .map((word) => {
      const bare = word.replace(/^[("'`]+|[)"'`,.;:]+$/gu, '');
      if (IDLIKE.test(bare)) return '';
      return isPath(bare) ? lastPlainWords(bare) : word;
    })
    .filter((w) => w !== '')
    .join(' ')
    .trim();
  return said === '' ? next : said;
}

/**
 * The open steps in one project (`project`, a spoken id as a run holds it), or with none every open step on the record,
 * newest first, each marked `next` or `earlier` by `openHandoffs` in the place it was left.
 *
 * THE WHOLE RECORD IS EACH PLACE IN TURN, because whether a step was passed over is asked of the runs in its own place:
 * every place a waiting run was left in is read once, a project first and its repository only for a run in none.
 */
export function openSteps(sql: Sql, nowMs: number, project?: string | null, viewer?: string): OpenStep[] {
  if (typeof project === 'string' && project !== '' && project !== PARAM) return clientsOf(sql, openHandoffs(sql, { project }, null, nowMs, viewer).map((h) => ({ ...h, project, repo: null })));
  const places = sql.all<{ project: string | null; repo: string | null }>(
    `SELECT DISTINCT nullif(json_extract(fields, '$.project'), '') AS project,
       CASE WHEN coalesce(json_extract(fields, '$.project'), '') = '' THEN nullif(json_extract(fields, '$.repo'), '') END AS repo
     FROM entry WHERE register = ? AND deleted_at IS NULL AND state = 'handoff'${viewer === undefined ? '' : ` AND ${unprivate()}`}`,
    SESSION,
    ...(viewer === undefined ? [] : [viewer]),
  );
  const seen = new Set<string>();
  const out: Omit<OpenStep, 'client' | 'next_said'>[] = [];
  for (const place of places)
    for (const h of openHandoffs(sql, place.project ? { project: place.project } : { repo: place.repo }, null, nowMs, viewer))
      if (!seen.has(h.id)) {
        seen.add(h.id);
        out.push({ ...h, project: place.project, repo: place.project ? null : place.repo });
      }
  return clientsOf(sql, out.sort((a, b) => Date.parse(b.left_at) - Date.parse(a.left_at) || (a.spoken < b.spoken ? 1 : -1)));
}

/** Each step with its run's client, in one read over the runs that left them, their ids bound as one array. */
function clientsOf(sql: Sql, steps: Omit<OpenStep, 'client' | 'next_said'>[]): OpenStep[] {
  if (steps.length === 0) return [];
  const rows = sql.all<{ id: string; client: string | null }>(
    `SELECT id, json_extract(fields, '$.client') AS client FROM entry WHERE register = ? AND id IN (SELECT value FROM json_each(?))`,
    SESSION,
    JSON.stringify(steps.map((s) => s.id)),
  );
  const client = new Map(rows.map((r) => [r.id, typeof r.client === 'string' && r.client !== '' ? r.client : null]));
  return steps.map((s) => ({ ...s, client: client.get(s.id) ?? null, next_said: stepSaid(s.next) }));
}

/** How many next steps wait, on the record or in the one project `about` names. Always now, as the briefing reads them. */
export function readHandoffsOpen(sql: Sql, ctx: Pick<EvalContext, 'nowMs' | 'viewer'>, decl?: MetricDecl): Result<Reading> {
  const about = (decl as HandoffsDecl | undefined)?.about;
  const n = openSteps(sql, ctx.nowMs, typeof about === 'string' ? about : null, ctx.viewer).length;
  return ok({ value: n, unit: null, rows: n, held: n, delta: null, why: 'no comparison asked for', met: null, refusals: [] });
}

/* ── the tidy as numbers ─────────────────────────────────────── */

/** The source the tidy's figures read: what the finders count now, and what the hourly pass kept. No list holds either. */
export const RECORD_TIDY = 'record.tidy';

/**
 * A figure over the tidy. `stale`: what is stale now, for every finder or the one `finder` names. `tidied`: what the
 * record cleared over the figure's window, read from the lines the pass keeps.
 */
export type TidyDecl = MetricDecl & { tidy: 'stale' | 'tidied'; finder?: string | undefined };

/** How many things are stale now, every finder's count added up. THE TARGET IS NONE: a stale thing is one to clear. */
const GONE_STALE: TidyDecl = {
  metric: 'gone-stale',
  name: 'Things gone stale',
  source: RECORD_TIDY,
  value: { count: 'id' },
  target: { lte: 0 },
  window: '1d',
  compare: 'none',
  format: 'int',
  tidy: 'stale',
};

/** How many things the record cleared in seven days. NO TARGET: a quiet week with nothing to clear is not a bad one. */
const TIDIED_WEEK: TidyDecl = {
  metric: 'tidied-week',
  name: 'Things tidied this week',
  source: RECORD_TIDY,
  value: { count: 'id' },
  window: '7d',
  compare: 'none',
  format: 'int',
  tidy: 'tidied',
};

const STALE_PREFIX = 'stale-';

/** The id of one finder's figure: `stale-runs-empty` for the finder `runs-empty`. */
export const staleFigureOf = (finder: string): string => `${STALE_PREFIX}${finder}`;

/**
 * One finder's figure, or `null` when no finder has that id. BUILT WHEN ASKED FOR, never kept in the table: the registry
 * is open, so a finder another part registers later has its figure without a line here. Its name is the finder's own
 * words, and with none its id said as words, so a tile never shows a key.
 */
function staleFigure(id: string): TidyDecl | null {
  if (!id.startsWith(STALE_PREFIX)) return null;
  const finder = finderOf(id.slice(STALE_PREFIX.length));
  if (finder === undefined) return null;
  const words = finder.id.replaceAll('-', ' ');
  return { ...GONE_STALE, metric: id, name: finder.name ?? `Stale: ${words}`, finder: finder.id };
}

const TIDIED_PREFIX = 'tidied-';

/** The id of what one finder cleared this week: `tidied-runs-empty` for the finder `runs-empty`. */
export const tidiedFigureOf = (finder: string): string => `${TIDIED_PREFIX}${finder}`;

/**
 * What one finder cleared in seven days, BUILT WHEN ASKED FOR as `staleFigure` is. `tidied-week` is the table's own, so
 * no finder called `week` is ever read through here.
 */
function tidiedFigure(id: string): TidyDecl | null {
  if (!id.startsWith(TIDIED_PREFIX)) return null;
  const finder = finderOf(id.slice(TIDIED_PREFIX.length));
  if (finder === undefined) return null;
  return { ...TIDIED_WEEK, metric: id, name: `Tidied this week: ${lowerFirst(finder.name ?? finder.id.replaceAll('-', ' '))}`, finder: finder.id };
}

const lowerFirst = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);
/** "1 empty run" or "41 empty runs", and what was done to them after: "41 empty runs hidden". */
const sayN =
  (one: string, many: string, after?: string) =>
  (n: number): string =>
    `${n} ${n === 1 ? one : many}${after === undefined ? '' : ` ${after}`}`;

/** How a finder's count is said in a sentence: what waits (`stale`), and what the record cleared (`cleared`). */
type TidyWords = { stale: (n: number) => string; cleared: (n: number) => string };

/**
 * THE WORDS OF THE KERNEL'S OWN FINDERS, said for one and for many. A finder's `name` is a heading ("Ended runs that
 * wrote nothing"), plural, and says nothing of what clearing did, so these are held beside its figure. A finder
 * registered later and not here is said by its own name, lower-cased after the number.
 */
const TIDY_WORDS: Readonly<Record<string, TidyWords>> = {
  'runs-stopped': { stale: sayN('silent run', 'silent runs'), cleared: sayN('silent run', 'silent runs', 'written off') },
  'runs-empty': { stale: sayN('empty run', 'empty runs'), cleared: sayN('empty run', 'empty runs', 'hidden') },
  'steps-old': { stale: sayN('step nobody took', 'steps nobody took'), cleared: sayN('step nobody took', 'steps nobody took', 'closed') },
  'questions-old': { stale: sayN('question left open', 'questions left open'), cleared: sayN('old question', 'old questions', 'closed') },
  'questions-moot': {
    stale: sayN('question that no longer needs you', 'questions that no longer need you'),
    cleared: sayN('settled question', 'settled questions', 'closed'),
  },
  'faults-open': { stale: sayN('fault still open', 'faults still open'), cleared: sayN('fault', 'faults', 'cleared') },
  'keys-unopened': { stale: sayN('key nobody has opened', 'keys nobody has opened'), cleared: sayN('unused key', 'unused keys', 'retired') },
  'rows-same': { stale: sayN('thing here twice', 'things here twice'), cleared: sayN('thing here twice', 'things here twice', 'folded') },
};

/** How many of a figure's finders `names` says before "and more". */
const NAMED_MOST = 4;

/**
 * `names`, A FIGURE'S COUNT SAID FINDER BY FINDER: each finder above nought as "<n> <its words>", the largest first (in
 * the order registered at a tie), at most four and then "and more". `undefined` when every finder reads nought, so a
 * sentence over it says nothing, as `{{projects-need-you.names}}` does over no project.
 */
function namesSaid(parts: readonly { id: string; name?: string | undefined; n: number; at: number }[], how: keyof TidyWords): string | undefined {
  const said = parts
    .filter((p) => p.n > 0)
    .sort((a, b) => b.n - a.n || a.at - b.at)
    .map((p) => TIDY_WORDS[p.id]?.[how](p.n) ?? `${p.n} ${lowerFirst(p.name ?? p.id.replaceAll('-', ' '))}`);
  if (said.length === 0) return undefined;
  if (said.length > NAMED_MOST) return `${said.slice(0, NAMED_MOST).join(', ')} and more`;
  return said.length === 1 ? said[0]! : `${said.slice(0, -1).join(', ')} and ${said.at(-1)!}`;
}

/** A reading over the tidy, which may say its count finder by finder (`namesSaid`), so a note writes `{{tidied-week.names}}`. */
export type TidyReading = Reading & { names?: string };

/** What one finder counts stale now, or nought when it cannot count. */
function staleOf(finder: Finder, sql: Sql, nowMs: number): number {
  try {
    return finder.find(sql, nowMs).stale;
  } catch {
    return 0;
  }
}

/** A reading with its `names`, left off when there are none. */
function withNames(read: Result<Reading>, names: string | undefined): Result<Reading> {
  if (!read.ok || names === undefined) return read;
  const named: TidyReading = { ...read.value, names };
  return ok(named);
}

/**
 * The tidy's numbers. ALWAYS NOW, as the finders count and as the open steps are read: a kept day's stale count is in
 * the pass's own lines, which `tidyDays` reads. A figure naming a finder that is gone reads nothing, never nought, and so
 * does one whose finder could not count: `staleNow` skips a finder that throws so the others are still added up, which
 * for a figure of that one finder alone would be a nought nobody counted.
 */
export function readTidy(sql: Sql, ctx: Pick<EvalContext, 'nowMs'>, decl: MetricDecl): Result<Reading> {
  const d = decl as TidyDecl;
  if (d.tidy === 'tidied') {
    const days = Math.max(1, Math.round((intervalMs(decl.window ?? '7d') ?? 7 * 86_400_000) / 86_400_000));
    const read = judged(decl, tidied(sql, ctx.nowMs, days, d.finder), `cleared by BrainDog in ${days === 1 ? 'the last day' : `${days} days`}`);
    /* EACH FINDER'S SHARE, from the same kept lines: a finder no longer registered is said by its id's own words. */
    if (d.finder !== undefined) return read;
    const by = new Map<string, number>();
    for (const line of tidyDays(sql, ctx.nowMs, days)) by.set(line.finder, (by.get(line.finder) ?? 0) + line.did);
    const order = finders().map((f) => f.id);
    const at = (id: string): number => (order.includes(id) ? order.indexOf(id) : order.length);
    return withNames(read, namesSaid([...by].map(([id, n]) => ({ id, name: finderOf(id)?.name, n, at: at(id) })), 'cleared'));
  }
  if (d.finder === undefined) {
    /* EVERY FINDER COUNTED ONCE, the total and its parts from the same counts, so the two never disagree. One that
       throws adds nothing and the others are still counted, as `staleNow` does. */
    const parts = finders().map((f, at) => ({ id: f.id, name: f.name, n: staleOf(f, sql, ctx.nowMs), at }));
    const total = parts.reduce((n, p) => n + p.n, 0);
    return withNames(judged(decl, total, 'stale now, every kind added up'), namesSaid(parts, 'stale'));
  }
  const finder = finderOf(d.finder);
  if (finder === undefined) return judged(decl, null, 'nothing here counts these');
  let one: number;
  try {
    one = finder.find(sql, ctx.nowMs).stale;
  } catch {
    return judged(decl, null, 'this could not be counted here');
  }
  return judged(decl, one, 'stale now');
}

/* ── the log as numbers ─────────────────────────────── */

/** The source the three figures over the record's own log read. No list holds a line of it. */
export const RECORD_ACTIVITY = 'record.activity';

/** How a figure over the log cuts it: by who wrote each line, by the kind of write, or by the hour of the day. */
export const ACTIVITY_BY = ['who', 'kind', 'hour'] as const;
export type ActivityBy = (typeof ACTIVITY_BY)[number];

/** A figure over the log: which cut it is. Its window is how far back it reads, in whole days ending today. */
export type ActivityDecl = MetricDecl & { activity: ActivityBy };

/** NO TARGET: a busy month is not a good one or a bad one, so none of the three is ever judged. */
const activity = (id: string, name: string, by: ActivityBy): ActivityDecl => ({
  metric: id,
  name,
  source: RECORD_ACTIVITY,
  value: { count: 'id' },
  window: '30d',
  compare: 'none',
  format: 'int',
  activity: by,
});

/**
 * Who a line is by, as a feed groups it (`FEED_BY` in `sources/activity.ts`), and what a feed calls each group, with
 * BrainDog's own work as a fourth part after You, as Today's "What changed" draws it (`FEED_OWN` in the renderer).
 */
const WHO_SAID = { agent: 'Agents', rule: 'Rules', you: 'You', braindog: 'BrainDog' } as const;

/**
 * BRAINDOG'S OWN WORK: what the record wrote of itself (`system`), the sample's own hand (`p_seed`), and the rules it
 * answers for itself with (`rule:handled`, `rule:additive`, `rule:update`). A feed signs them as rules and says each
 * one's who as BrainDog (`actor` in the app's `names.ts`, `OWN_RULE`), so "Who worked" counted them under Rules beside a
 * feed that groups them as BrainDog (polish-g W1). The trust ladder keeps its own name there, and so it is a rule here.
 */
export const ownWork = (actor: string): boolean =>
  actor === 'system' || actor === 'p_seed' || actor === 'rule:handled' || actor === 'rule:additive' || actor === 'rule:update';

/**
 * What each kind of write a feed holds is called, the words Activity says them in. A kind with no word here is said by
 * its key, which is a word already. The owner's kinds (keys, access, links) are never counted, so they need none.
 */
export const KIND_SAID: Readonly<Record<string, string>> = {
  create: 'Created',
  edit: 'Changed',
  state: 'Moved',
  link: 'Linked',
  tag: 'Tagged',
  untag: 'Untagged',
  delete: 'Deleted',
  restore: 'Restored',
  purge: 'Purged',
  note: 'Noted',
  decide: 'Decided',
  supersede: 'Superseded',
  suggest: 'Asked',
  resolve: 'Closed',
  predict: 'Predicted',
  score: 'Scored',
  install: 'Installed',
  uninstall: 'Uninstalled',
  upgrade: 'Upgraded',
  declare: 'Changed the page',
  retire: 'Retired',
  arrive: 'Arrived',
  match: 'Matched',
  extract: 'Read a message',
  propose: 'Proposed',
  pull: 'Fetched',
  export: 'Backed up',
  import: 'Imported',
  erase: 'Erased',
  migrate: 'Migrated',
  'restore.pitr': 'Put back to an earlier copy',
};

/** How many kinds "What changed" says by name before the rest are one part, and that part's key, which no kind is. */
const KINDS_SAID = 8;
const KINDS_REST = 'other';

/** A quarter of an hour: every zone's offset is a whole number of them, so a quarter falls in one hour of one day. */
const QUARTER_MS = 900_000;

/** As `STAMP_MS` in `index.ts`: how far an agent's clock may sit from the record's for an instant it wrote to be a stamp. */
const ACTIVITY_STAMP_MS = 10 * 60_000;

/**
 * THE LINES A FEED NEVER SHOWS, as `activity` in `index.ts` leaves them out, written once more here because that read
 * is the kernel's own and this file is read by `metrics.ts`, which the kernel imports. The owner's lines (keys, access,
 * links, members, sealed files), a script's quiet night, and the sweep writing a run off. `test/activity-figures.test.ts` holds this
 * and the kernel's `bookkeeping` to one answer.
 */
const ACTIVITY_SHOWN = `e.kind NOT LIKE 'grant.%' AND e.kind NOT LIKE 'access.%' AND e.kind NOT LIKE 'share.%'
  AND COALESCE(e.target_kind, '') NOT IN ('grant', 'vault_key', 'device_grant', 'member', 'person', 'sealed')
  AND NOT (e.kind = 'pull' AND substr(COALESCE(e.target, ''), 1, 19) = 'declaration:script.'
           AND COALESCE(CASE WHEN json_valid(e.to_v) THEN json_type(e.to_v, '$.quiet') = 'integer' AND json_extract(e.to_v, '$.quiet') = 1 END, 0))
  AND NOT (e.kind = 'state' AND e.actor = 'system' AND substr(COALESCE(e.target, ''), 1, 6) = 'entry:'
           AND COALESCE((SELECT r.register FROM entry r WHERE r.id = substr(e.target, 7)), '') = '${SESSION}')`;

/** A value of the log as it was written: JSON, or the words themselves where it is not. As `read` in `index.ts`. */
const logged = (v: string | null): unknown => {
  if (v === null) return null;
  try {
    return JSON.parse(v) as unknown;
  } catch {
    return v;
  }
};

/**
 * Who a line is by, as a feed groups it: `byOf` in `pages.ts`, which is not imported here (that file imports `metrics.ts`),
 * with BrainDog's own work (`ownWork`) apart from the rules.
 */
const activityBy = (actor: string): keyof typeof WHO_SAID => {
  if (ownWork(actor)) return 'braindog';
  if (/^S\d+$/u.test(actor) || actor.startsWith('agent:') || actor === 'slash') return 'agent';
  if (actor.startsWith('rule:') || actor.startsWith('ingest:') || actor.startsWith('script:') || actor === 'system' || actor === 'p_seed') return 'rule';
  return 'you';
};

/**
 * The record's own log over the figure's window, cut one of three ways: who wrote each line (`activity-by-who`), what
 * kind of write it was (`activity-by-kind`), and the hour of the day it was written in (`activity-by-hour`).
 *
 * THE ANSWER IS A FIGURE IN PARTS, the shape `events.<list>` and every grouped figure answer: `value` is every line
 * counted and `groups` the cut. Who is always four parts (Agents, Rules, You and BrainDog), in a feed's own order, and
 * the hours always twenty-four, in the order of the day, so a chart of either keeps its places on a quiet month; a
 * nought there is a count, not a gap.
 * The kinds are the ones that happened, the largest first, the eight largest by name and the rest as one part.
 *
 * WHAT A FEED LEAVES OUT IS LEFT OUT (`ACTIVITY_SHOWN`, and a run's stamp below), so "Who worked" and the feed beside
 * it count the same lines, and a sweep that wrote ten runs off at three in the morning is not a busy hour.
 *
 * THE WINDOW IS WHOLE DAYS ENDING TODAY, in the record's zone, as `events.<list>` reads its own: `30d` is today so far
 * and the twenty-nine days before it. The hour is the record's too. Read as of a past day it counts what the log held
 * then, since the log keeps every line.
 *
 * COUNTED IN THE DATABASE, a quarter of an hour at a time, never line by line: his record wrote thousands of lines a
 * month. Only a run's edits of an instant field are read one by one, to tell a stamp from a change.
 */
export function readActivity(sql: Sql, ctx: Pick<EvalContext, 'nowMs' | 'asOfMs' | 'tz' | 'viewer'>, decl: MetricDecl): Result<Reading> {
  const cut = (decl as ActivityDecl).activity;
  if (!(ACTIVITY_BY as readonly unknown[]).includes(cut))
    return no<Reading>('VALUE_MALFORMED', `${decl.metric}: activity names how the log is cut, one of ${ACTIVITY_BY.join(', ')}.`, {
      at: 'activity',
      allowed: [...ACTIVITY_BY],
    });
  const DAY = 86_400_000;
  const days = Math.max(1, Math.round((intervalMs(decl.window ?? '30d') ?? 30 * DAY) / DAY));
  const clock = ctx.asOfMs ?? ctx.nowMs;
  const local = new Intl.DateTimeFormat('en-CA', { timeZone: ctx.tz ?? 'UTC', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' });
  /** The day and the hour an instant falls in, on the record's clock. */
  const placed = (ms: number): { day: string; hour: number } => {
    const p = Object.fromEntries(local.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24 };
  };
  const first = new Date(Date.parse(`${placed(clock).day}T12:00:00Z`) - (days - 1) * DAY).toISOString().slice(0, 10);
  /* A DAY MORE THAN THE WINDOW IS READ AND THE FIRST DAY CUT BY ITS NAME, so no start of a day is worked out in a zone. */
  const since = new Date(clock - (days + 1) * DAY).toISOString();
  const until = new Date(clock).toISOString();
  const quarters = new Map<number, { day: string; hour: number }>();
  const at = (quarter: number): { day: string; hour: number } => {
    let got = quarters.get(quarter);
    if (got === undefined) quarters.set(quarter, (got = placed(quarter * QUARTER_MS)));
    return got;
  };

  const who = { agent: 0, rule: 0, you: 0, braindog: 0 };
  const kinds = new Map<string, number>();
  const hours = Array.from({ length: 24 }, () => 0);
  let total = 0;
  const count = (quarter: number, actor: string, kind: string, n: number): void => {
    const slot = at(quarter);
    if (slot.day < first) return;
    who[activityBy(actor)] += n;
    kinds.set(kind, (kinds.get(kind) ?? 0) + n);
    hours[slot.hour]! += n;
    total += n;
  };
  /* LINES ABOUT A ROW SOMEBODY ELSE KEPT PRIVATE ARE NOT COUNTED for this viewer, as the feed leaves them out. */
  const kept = ctx.viewer === undefined ? '' : ` AND ${unprivateLine('e.target')}`;
  const keptWho = ctx.viewer === undefined ? [] : [ctx.viewer];
  const counted = sql.all<{ quarter: number; actor: string; kind: string; n: number }>(
    `SELECT CAST(strftime('%s', e.ts) AS INTEGER) / 900 AS quarter, e.actor AS actor, e.kind AS kind, COUNT(*) AS n
       FROM event e WHERE e.ts >= ? AND e.ts <= ? AND ${ACTIVITY_SHOWN}${kept} GROUP BY 1, 2, 3`,
    since,
    until,
    ...keptWho,
  );
  for (const c of counted) count(Number(c.quarter), c.actor, c.kind, Number(c.n));

  /*
   * A RUN'S STAMP IS TAKEN BACK OUT (`bookkeeping` in `index.ts`): an agent's run writing when it last saw something, an
   * edit of an instant field to the moment of the write over an earlier moment it held. Told by the line's shape, so a
   * pack's own stamp is quiet with no pack named. A run setting a day ahead, and an instant a person writes, stay in.
   */
  const instants = new Set<string>();
  const stamped = new Set<string>();
  for (const r of sql.all<{ body: string }>("SELECT body FROM declaration WHERE kind = 'register' AND superseded_at IS NULL AND retired = 0 AND json_valid(body)")) {
    const body = JSON.parse(r.body) as { id?: unknown; fields?: unknown };
    if (typeof body.id !== 'string' || !Array.isArray(body.fields)) continue;
    for (const f of body.fields as { id?: unknown; type?: unknown }[]) {
      if (typeof f?.id !== 'string' || f.type !== 'instant') continue;
      instants.add(`${body.id}\n${f.id}`);
      stamped.add(f.id);
    }
  }
  if (stamped.size > 0) {
    /* THE FIELD IDS ARE ONE BOUND ARRAY, so a record with many instant fields stays inside the Durable Object's 100. */
    const edits = sql.all<{ ts: string; actor: string; field: string; from_v: string | null; to_v: string | null; list: string }>(
      `SELECT e.ts AS ts, e.actor AS actor, e.field AS field, e.from_v AS from_v, e.to_v AS to_v, r.register AS list
         FROM event e JOIN entry r ON r.id = substr(e.target, 7)
        WHERE e.ts >= ? AND e.ts <= ? AND e.kind = 'edit' AND substr(e.target, 1, 6) = 'entry:'
          AND COALESCE(e.target_kind, '') NOT IN ('grant', 'vault_key', 'device_grant', 'member', 'person', 'sealed')
          AND e.field IN (SELECT value FROM json_each(?))${kept}`,
      since,
      until,
      JSON.stringify([...stamped]),
      ...keptWho,
    );
    for (const e of edits) {
      if (!isRunName(e.actor) || !instants.has(`${e.list}\n${e.field}`)) continue;
      const to = logged(e.to_v);
      const from = logged(e.from_v);
      if (typeof to !== 'string' || typeof from !== 'string') continue;
      const wrote = Date.parse(e.ts);
      const moment = Date.parse(to);
      if (!Number.isFinite(moment) || Math.abs(moment - wrote) > ACTIVITY_STAMP_MS || !(Date.parse(from) < moment)) continue;
      count(Math.floor(Math.floor(wrote / 1000) / 900), e.actor, 'edit', -1);
    }
  }
  for (const [kind, n] of kinds) if (n <= 0) kinds.delete(kind);

  const part = (key: string, label: string, n: number): NonNullable<Reading['groups']>[number] => ({ key, label, value: n, rows: n, state: 'full' });
  const two = (h: number): string => String(h).padStart(2, '0');
  const span = days === 1 ? 'today' : `in the last ${days} days`;
  let groups: NonNullable<Reading['groups']>;
  let why: string;
  if (cut === 'who') {
    /* ON A RECORD MORE THAN ONE PERSON HOLDS, A PERSON'S WRITES ARE "People", not "You": a colleague read "you 395" for the
       owner's month. The key stays `you`, so a chart keeps its places. */
    const team = (sql.one<{ n: number }>('SELECT COUNT(DISTINCT person_id) AS n FROM member')?.n ?? 0) > 1;
    groups = (Object.keys(WHO_SAID) as (keyof typeof WHO_SAID)[]).map((by) => part(by, by === 'you' && team ? 'People' : WHO_SAID[by], who[by]));
    why = `changes written ${span}, by who wrote them`;
  } else if (cut === 'hour') {
    groups = hours.map((n, h) => part(two(h), `${two(h)}:00`, n));
    why = `changes written ${span}, by the hour of the day`;
  } else {
    /* THE LARGEST FIRST, THEN THE KEY, as every grouping by a word is drawn (`largestFirst` in `metrics.ts`). */
    const ranked = [...kinds].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    groups = ranked.slice(0, KINDS_SAID).map(([kind, n]) => part(kind, KIND_SAID[kind] ?? kind, n));
    const rest = ranked.slice(KINDS_SAID).reduce((sum, [, n]) => sum + n, 0);
    if (rest > 0) groups.push(part(KINDS_REST, 'Everything else', rest));
    why = `changes written ${span}, by what kind of change`;
  }
  /* HELD IS WHETHER THERE WAS ANYTHING TO READ, as `judged` has it: a month with no line is nothing to draw. */
  return ok({ value: total, unit: null, rows: total, held: total, delta: null, why, met: null, refusals: [], groups });
}

/* ── the signs of a living record ────────────────────────────── */

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

/* ── the record's health, over the vital signs and the rates ── */

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
   judge by yet is nothing wrong, and a fresh record told it missed a mark is the same fault again. */
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

/* ── the agent door's signs, and where things apply ─── */

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

/** The source of `keys-unopenable`: every list with a sealed field, against the keychain's grants. */
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

/**
 * Keys nobody has opened in six months: sealed more than 180 days ago and never opened since, or last opened
 * before that. Read by the same count as the tidy's `keys-unopened` finder, so the figure and the finder never disagree.
 */
const KEYS_UNOPENED: MetricDecl = {
  metric: 'keys-unopened',
  name: 'Sealed keys nobody has opened',
  source: RECORD_KEYS,
  value: { count: 'id' },
  target: { lte: 0 },
  window: '30d',
  compare: 'none',
  format: 'int',
};

/** The source of `marks-unknown`: every list that declares `identity.mark`, read by the field it names. */
export const RECORD_MARKS = 'record.marks';

/**
 * Rows whose mark names no picture. A page draws the row's own first letter for these, so nothing is broken to look at,
 * but the picture somebody chose in another system is gone, and the count is how a person learns there are any to pick.
 */
const MARKS_UNKNOWN: MetricDecl = {
  metric: 'marks-unknown',
  name: 'Pictures that name nothing we draw',
  source: RECORD_MARKS,
  value: { count: 'id' },
  target: { lte: 0 },
  window: '30d',
  compare: 'none',
  format: 'int',
};

/**
 * The source of `held-twice`: the list that plays `meets:`, read by the fields it names. Said by the part and never by
 * a list's own name, since a record may call its people anything.
 */
export const RECORD_PEOPLE = 'record.meets';

/**
 * People the record holds more than once, as far as the plain rules can tell. Each is a question on Decide that he
 * answers, so the figure falls to nought by his yes (one person now) or his no (two people of one name).
 */
const PEOPLE_TWICE: MetricDecl = {
  metric: 'held-twice',
  name: 'People held more than once',
  source: RECORD_PEOPLE,
  value: { count: 'id' },
  target: { lte: 0 },
  window: '30d',
  compare: 'none',
  format: 'int',
};

/**
 * The people `held-twice` is about, each once: both of a pair, all three of three who share a name. Always more than
 * `held-twice` says, which counts only how many would go. It carries the same target, since both fall to nought together.
 */
const PEOPLE_TWICE_SHOWN: MetricDecl = {
  metric: 'held-twice-shown',
  name: 'People who may be held more than once',
  source: RECORD_PEOPLE,
  value: { count: 'id' },
  target: { lte: 0 },
  window: '30d',
  compare: 'none',
  format: 'int',
};

/* ── what the night counts ────────────── */

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

/* ── when a project was last worked on ─────── */

/** The source of `project-worked`: a project's work list and its runs, read together. */
export const RECORD_WORKED = 'record.worked';

/** A figure over when a project was last worked on, and the project it reads when `about` is filled: its name or spoken id. */
export type WorkedDecl = MetricDecl & { about?: string | undefined };

/**
 * When a project was last worked on: the days, and beside them the moment itself (`at`) and the agent whose run it was
 * (`by`), or `null` where the newest sign of work was a task written.
 */
export type WorkedReading = Reading & { at?: string; by?: string | null };

/**
 * HOW LONG SINCE ANYBODY WORKED ON A PROJECT, ITS TASKS AND ITS RUNS TOGETHER: Projects
 * said "Worked on 4 days ago" from the tasks alone while Today said "Claude worked on it 20 minutes ago" from the runs,
 * of the same project in the same minute. One figure now reads both, the newest stamp on a task of the project and the
 * newest a run in it was heard from, so every screen says one time. Quiet past thirty days, as Work's tasks-only
 * `project-last-worked` is. A project with no task and no run reads nothing, never nought.
 */
const PROJECT_WORKED: WorkedDecl = {
  metric: 'project-worked',
  name: 'Last worked',
  source: RECORD_WORKED,
  value: { count: 'id' },
  target: { lte: 30 },
  window: '30d',
  compare: 'none',
  format: 'days',
  about: PARAM,
};

/** The figures the record answers by id when no declaration holds that id. */
export const BUILT_IN_FIGURES: Readonly<Record<string, MetricDecl>> = {
  'questions-open': QUESTIONS_OPEN,
  'questions-open-in': QUESTIONS_OPEN_IN,
  'runs-working': RUNS_WORKING,
  'machines-working': MACHINES_WORKING,
  'runs-waiting': RUNS_WAITING,
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
  'gone-stale': GONE_STALE,
  'tidied-week': TIDIED_WEEK,
  'projects-unplaced': PROJECTS_UNPLACED,
  'keys-unopenable': KEYS_UNOPENABLE,
  'keys-unopened': KEYS_UNOPENED,
  'keys-in-text': KEYS_IN_TEXT,
  'marks-unknown': MARKS_UNKNOWN,
  'held-twice': PEOPLE_TWICE,
  'held-twice-shown': PEOPLE_TWICE_SHOWN,
  'lists-shrunk': LISTS_SHRUNK,
  'documents-dead-paths': DOCUMENTS_DEAD_PATHS,
  'activity-by-who': activity('activity-by-who', 'Who worked', 'who'),
  'activity-by-kind': activity('activity-by-kind', 'What changed', 'kind'),
  'activity-by-hour': activity('activity-by-hour', 'Busy hours', 'hour'),
  'project-worked': PROJECT_WORKED,
};

/** The built-in figure called `id`, or `null`; never one `Object.prototype` lends. */
export const builtInFigure = (id: string): MetricDecl | null =>
  Object.hasOwn(BUILT_IN_FIGURES, id) ? BUILT_IN_FIGURES[id]! : (staleFigure(id) ?? tidiedFigure(id));

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
  const d = decl as OpenQuestionsDecl | undefined;
  const said = d?.about;
  const about = typeof said === 'string' && said !== PARAM ? said : null;
  /* AGENTS' SUGGESTIONS ON THEIR SHELF ARE NOT WAITING ON ANYBODY (`govern.ts` `apartOf`), as the queue counts them. */
  const apart = apartJson({ sql, nowMs: ctx.asOfMs ?? ctx.nowMs });
  const open = `SELECT COUNT(*) AS n FROM suggestion WHERE status = 'open' AND (defer_until IS NULL OR defer_until <= ?) AND ${NOT_APART}`;
  const counted = (n: number): Result<Reading> =>
    ok({ value: n, unit: null, rows: n, held: n, delta: null, why: 'no comparison asked for', met: n <= 0, refusals: [] });
  if (typeof d?.list === 'string') return counted(openOnList(sql, at, d.list === PARAM ? null : d.list, apart));
  const row =
    about === null
      ? sql.one<{ n: number }>(open, at, apart)
      : sql.one<{ n: number }>(`${open} AND (CASE WHEN json_valid(body) THEN json_extract(body, '$.about') END) = ?`, at, apart, about);
  return counted(Number(row?.n ?? 0));
}

/** A row's spoken id, `tasks#4`, as `listOf` in `pages.ts` reads one: the list is what comes before the `#`. */
const SPOKEN_ROW = /^([a-z][a-z0-9_]*)#([1-9][0-9]*)$/;

/**
 * How many open questions at `at` are about a row of `list`, or of any list with `null`. THE QUEUE'S RULE, NOT A
 * PATTERN OF ITS OWN: `about` is a spoken id and its list is the part before the `#` (`QueueQuestion.list`), so a word
 * such as `Box`, a body this record cannot parse, and an `about` that is not text are on no list.
 *
 * AND A QUESTION THAT ADDS OR CHANGES ROWS OF A LIST IS ON IT, where it names no row of its own (`ROWSET_LIST_SQL`): "Add Priya to People?" and "Link Priya Raman to Lumen?" are rowsets on People with no `about`,
 * and People's page said "no questions open" while both waited in Needs you.
 */
function openOnList(sql: Sql, at: string, list: string | null, apart: string): number {
  const rows = sql.all<{ about: string | null; on_list: string | null }>(
    `SELECT CASE WHEN json_valid(body) THEN CASE WHEN json_type(body, '$.about') = 'text' THEN json_extract(body, '$.about') END END AS about,
            ${ROWSET_LIST_SQL} AS on_list
       FROM suggestion WHERE status = 'open' AND (defer_until IS NULL OR defer_until <= ?) AND ${NOT_APART}`,
    at,
    apart,
  );
  return rows.filter((r) => {
    const m = r.about === null ? null : SPOKEN_ROW.exec(r.about);
    const on = m !== null ? m[1]! : r.on_list;
    return on !== null && on !== '' && (list === null || on === list);
  }).length;
}

/**
 * THE LIST A ROWSET QUESTION ADDS TO OR CHANGES, as SQL over `suggestion`: its body's `register`, and `NULL` for any other
 * body. What `openOnList` counts a question on where its `about` names no row, and what a queue's `list is` reads too.
 */
export const ROWSET_LIST_SQL =
  "CASE WHEN body_kind = 'rowset' AND json_valid(body) AND json_type(body) = 'object' AND json_type(body, '$.register') = 'text' THEN json_extract(body, '$.register') END";

/**
 * How many agents are working now, read off `workingRuns`, which every other reader of "working" reads too. Always now,
 * even on a read of a past day: which runs were working at some earlier moment is not kept anywhere to be read back.
 */
export function readRunsWorking(sql: Sql, ctx: Pick<EvalContext, 'nowMs'>, decl?: MetricDecl): Result<Reading> {
  const part = (decl as RunsDecl | undefined)?.part;
  const said = (v: Json | undefined): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
  let n: number;
  if (part === 'machines') n = new Set(workingRuns(sql, ctx.nowMs).map((r) => said(r.fields.host) ?? '')).size;
  else if (part === 'waiting') {
    const present = presentRuns(sql, ctx.nowMs);
    const open = new Set(present.map((r) => `${SESSION_PREFIX}${String(r.seq)}`));
    n = present.filter((r) => liveStateOf(r, ctx.nowMs) === 'waiting' && !open.has(said(r.fields.parent) ?? '')).length;
  } else {
    const runs = workingRuns(sql, ctx.nowMs);
    n = runs.length;
    const read: Reading = { value: n, unit: null, rows: n, held: n, delta: null, why: 'no comparison asked for', met: null, refusals: [] };
    return withNames(ok(read), workingSaid(sql, runs));
  }
  return ok({ value: n, unit: null, rows: n, held: n, delta: null, why: 'no comparison asked for', met: null, refusals: [] });
}

/** A spoken id, `things#4`: the list before the `#` and the row's number after it. */
const SPOKEN_ROW_AT = /^([a-z][a-z0-9_]{0,31})#([1-9][0-9]*)$/;

/** The name of the row a spoken id names, by its list's title field, or `null` where it names none. */
function spokenTitle(sql: Sql, spoken: string): string | null {
  const m = SPOKEN_ROW_AT.exec(spoken.trim());
  if (!m) return null;
  const title = sql.one<{ t: string | null }>(
    "SELECT json_extract(body, '$.title') AS t FROM declaration WHERE id = ? AND superseded_at IS NULL AND retired = 0 AND json_valid(body) ORDER BY version DESC LIMIT 1",
    `register.${m[1]!}`,
  )?.t;
  if (typeof title !== 'string' || !/^[a-z][a-z0-9_]*$/.test(title)) return null;
  const row = sql.one<{ v: string | null }>(`SELECT json_extract(fields, '$.${title}') AS v FROM entry WHERE register = ? AND seq = ? AND deleted_at IS NULL`, m[1]!, Number(m[2]));
  return typeof row?.v === 'string' && row.v.trim() !== '' ? row.v.trim() : null;
}

/**
 * WHO IS AT WORK ON WHAT, IN WORDS, for `{{runs-working.names}}`: "Claude Code on BrainDog and Codex on Kiln", each agent
 * and project once, the agent alone where its run is in no project, and past three "and 2 more".: the Agents page's line counted machines ("1 at work on one machine") and never said who or on what.
 */
function workingSaid(sql: Sql, runs: readonly { fields: Readonly<Record<string, Json>> }[]): string | undefined {
  const said = (v: Json | undefined): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);
  /* ONE PROJECT IS SAID ONCE, with every agent at work on it before it: "Claude and Codex on Kiln", not "Claude on Kiln
     and Codex on Kiln". */
  const on = new Map<string, Set<string>>();
  for (const r of runs) {
    const who = agentOf({ agent: said(r.fields.agent), client: said(r.fields.client) }).name;
    const project = said(r.fields.project);
    const title = project === undefined ? '' : (spokenTitle(sql, project) ?? (SPOKEN_ROW_AT.test(project) ? '' : project));
    on.set(title, (on.get(title) ?? new Set<string>()).add(who));
  }
  const and = (words: readonly string[]): string => (words.length === 1 ? words[0]! : `${words.slice(0, -1).join(', ')} and ${words.at(-1)!}`);
  const each = [...on].map(([title, who]) => (title === '' ? and([...who]) : `${and([...who])} on ${title}`));
  if (each.length === 0) return undefined;
  if (each.length > 3) return `${each.slice(0, 2).join(', ')} and ${each.length - 2} more`;
  return each.length === 1 ? each[0]! : `${each.slice(0, -1).join(', ')} and ${each.at(-1)!}`;
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
      if (doors.length === 0) return reading(null, 'no door: nothing here takes messages in');
      const patterns = said === null ? null : doors.filter((d) => d.ingest === said || d.door === said).map((d) => `ingest:${d.ingest}`);
      if (patterns !== null && patterns.length === 0) return reading(null, `no door called ${said} here`);
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
      if (feeds.length === 0) return reading(null, 'no feed: nothing here runs on a clock');
      const behind = feeds.filter((f) => nowMs - f.lastGoodMs > 2 * f.everyMs).length;
      return reading(behind, 'feeds whose last good run is older than twice their period');
    }
    case 'rules-fired-7d': {
      const rules = sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM declaration WHERE kind = 'rule' AND superseded_at IS NULL AND retired = 0")?.n ?? 0;
      if (rules === 0) return reading(null, 'no rule: nothing here runs by itself');
      const since = new Date(nowMs - 7 * 86_400_000).toISOString();
      const fired = sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM automation_run WHERE state = 'done' AND finished_at >= ?", since)?.n ?? 0;
      return reading(fired, 'rule runs that ended well in the last seven days');
    }
    default:
      return reading(null, 'not a sign BrainDog reads');
  }
}

/** A reading of a count with no comparison, judged against the figure's own target, or no verdict with no value. */
function judged(decl: MetricDecl, value: number | null, why: string): Result<Reading> {
  const t = decl.target;
  const met = value === null || t === undefined ? null : 'lte' in t ? value <= t.lte : value >= t.gte;
  /* HELD IS WHETHER THERE WAS ANYTHING TO READ, NEVER THE VALUE: a tile hides a figure that held
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
    /* THE HOLD'S RULES, NOT A LOOSER COUNT OF ITS OWN: a day counts only when every hold sign read green under
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
    if (all.length === 0) return judged(decl, null, 'there are no vital signs to read');
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
  if (newest === null) return judged(decl, null, 'no exchange rate yet');
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
  if (places === null) return judged(decl, null, 'no list holds projects');
  if (places.fields.length === 0) return judged(decl, null, 'the projects name no repository or folder field');
  const n = sql.one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM entry WHERE register = ? AND deleted_at IS NULL
       AND coalesce(state, '') NOT IN (SELECT value FROM json_each(?)) AND ${places.fields.map(emptyField).join(' AND ')}`,
    places.list,
    JSON.stringify(places.done),
  )?.n;
  return judged(decl, Number(n ?? 0), 'projects with no repository and no folder');
}

/** A field's JSON path, quoted, for a field name a declaration gave. */
const pathOf = (field: string): string => `$."${field.replaceAll('"', '""')}"`;

/** The local day of an instant in the record's zone, `YYYY-MM-DD`. */
function dayIn(ms: number, tz: string | undefined): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz ?? 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

/**
 * `project-worked:<project>`: the newest of two stamps, the last write on a task of the project and the last a run in it
 * was heard from (`last_seen`). THE TASKS ARE THE LISTS THAT HAND WORK OUT (`hand:`) and point at the projects list (the
 * one that declares `scopes:`), found by what they declare and never by a name. A RUN NAMES ITS PROJECT by its spoken id,
 * its row id or its name, as Today's cards read it. On a read of a past day nothing after it counts. NOTHING, NEVER
 * NOUGHT, for a project with neither, or a name no project has.
 */
export function readWorked(sql: Sql, ctx: Pick<EvalContext, 'nowMs' | 'asOfMs' | 'tz' | 'viewer' | 'walks'>, decl: MetricDecl): Result<Reading> {
  const about = (decl as WorkedDecl).about;
  const said = typeof about === 'string' && about !== PARAM ? about.trim() : '';
  const none = (why: string): Result<Reading> => judged(decl, null, why);
  if (said === '') return none('no project named');
  const head = sql.one<{ body: string }>(
    "SELECT body FROM declaration WHERE kind = 'register' AND superseded_at IS NULL AND retired = 0 AND json_valid(body) AND json_extract(body, '$.scopes') IS NOT NULL ORDER BY id LIMIT 1",
  );
  const projects = head === undefined ? null : (JSON.parse(head.body) as { id?: unknown; title?: unknown });
  if (projects === null || typeof projects.id !== 'string') return none('no list holds projects');
  const list = projects.id;
  const title = typeof projects.title === 'string' ? projects.title : 'name';
  const spoken = SPOKEN_ROW_AT.exec(said);
  const bySeq = spoken !== null && spoken[1] === list;
  const project = sql.one<{ id: string; seq: number; title: string | null }>(
    `SELECT id, seq, json_extract(fields, ?) AS title FROM entry WHERE register = ? AND deleted_at IS NULL
       AND (${bySeq ? 'seq = ?' : 'id = ? OR lower(trim(json_extract(fields, ?))) = lower(?)'}) ORDER BY seq LIMIT 1`,
    pathOf(title),
    list,
    ...(bySeq ? [Number(spoken[2])] : [said, pathOf(title), said]),
  );
  if (project === undefined) return none(`no project is called ${said}`);
  const viewer = ctx.viewer === undefined ? '' : ` AND ${unprivate()}`;
  const seen = ctx.viewer === undefined ? [] : [ctx.viewer];
  const until = ctx.asOfMs === undefined ? null : new Date(ctx.asOfMs).toISOString();
  const before = until === null ? '' : ' AND at <= ?';
  const upTo = until === null ? [] : [until];
  const stamps: { at: string; agent: string | null }[] = [];
  /*
   * EACH LIST IS WALKED ONCE FOR A READ, NOT ONCE A PROJECT (`ctx.walks`, the read's own memo): a row of project cards
   * asked this figure a project at a time, and each asked walked every run's row and every task's again, which on a
   * record of a thousand runs was most of Today's time. The newest stamp of each project is grouped in one walk, and a
   * read that keeps no memo groups it for the one project as well.
   */
  const memo = <T>(key: unknown[], make: () => T): T => {
    const memo = ctx.walks;
    return memo === undefined ? make() : memo.once(JSON.stringify(['worked', ...key, ctx.viewer ?? null, until]), make);
  };

  /* THE TASKS: each list that hands work out and points at the projects, its newest write on a row of this one. */
  const works = memo(['works'], () =>
    sql
      .all<{ body: string }>("SELECT body FROM declaration WHERE kind = 'register' AND superseded_at IS NULL AND retired = 0 AND json_valid(body) AND json_extract(body, '$.hand') IS NOT NULL")
      .map((r) => JSON.parse(r.body) as { id?: unknown; fields?: unknown }),
  );
  for (const work of works) {
    if (typeof work.id !== 'string' || !Array.isArray(work.fields)) continue;
    for (const f of work.fields as { id?: unknown; type?: unknown; to?: unknown }[]) {
      if (f.type !== 'ref' || f.to !== list || typeof f.id !== 'string') continue;
      const [register, field] = [work.id, f.id];
      const newest = memo(['handed', register, field], () => {
        const by = new Map<string, string>();
        for (const r of sql.all<{ v: unknown; at: string | null }>(
          `SELECT v, max(at) AS at FROM (SELECT json_extract(fields, ?) AS v, updated_at AS at, id FROM entry WHERE register = ? AND deleted_at IS NULL${viewer})
            WHERE at IS NOT NULL AND v IS NOT NULL${before} GROUP BY v`,
          pathOf(field),
          register,
          ...seen,
          ...upTo,
        ))
          if (typeof r.v === 'string' && typeof r.at === 'string') by.set(r.v, r.at);
        return by;
      });
      const got = newest.get(project.id);
      if (typeof got === 'string') stamps.push({ at: got, agent: null });
    }
  }

  /* THE RUNS: the newest heard from in this project, by any of the three ways a run names it. */
  const names = [`${list}#${project.seq}`, project.id, ...(typeof project.title === 'string' && project.title.trim() !== '' ? [project.title.trim()] : [])].map((n) => n.toLowerCase());
  const runs = memo(['runs'], () => {
    const by = new Map<string, { at: string; agent: string | null }>();
    /* THE AGENT IS THE NEWEST ROW'S: beside a lone `max`, SQLite reads a bare column from the row the max came from. */
    for (const r of sql.all<{ p: unknown; at: string | null; agent: string | null }>(
      `SELECT p, max(at) AS at, agent FROM (SELECT lower(trim(json_extract(fields, '$.project'))) AS p, coalesce(json_extract(fields, '$.last_seen'), updated_at) AS at,
         json_extract(fields, '$.agent') AS agent, id FROM entry WHERE register = ? AND deleted_at IS NULL${viewer})
       WHERE at IS NOT NULL AND p IS NOT NULL${before} GROUP BY p`,
      SESSION,
      ...seen,
      ...upTo,
    ))
      if (typeof r.p === 'string' && typeof r.at === 'string') by.set(r.p, { at: r.at, agent: r.agent });
    return by;
  });
  const run = names
    .map((n) => runs.get(n))
    .filter((r): r is { at: string; agent: string | null } => r !== undefined)
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))[0];
  if (typeof run?.at === 'string') stamps.push({ at: run.at, agent: typeof run.agent === 'string' && run.agent.trim() !== '' ? run.agent.trim() : 'other' });

  const newest = stamps.filter((s) => Number.isFinite(Date.parse(s.at))).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  if (newest === undefined) return none(`nothing on ${said} was worked on`);
  const atMs = Date.parse(newest.at);
  const days = Math.max(0, Math.round((Date.parse(`${dayOfRead(ctx)}T00:00:00Z`) - Date.parse(`${dayIn(atMs, ctx.tz)}T00:00:00Z`)) / 86_400_000));
  const read = judged(decl, days, newest.agent === null ? 'the newest write on its tasks' : 'the newest run in it');
  if (!read.ok) return read;
  const out: WorkedReading = { ...read.value, at: new Date(atMs).toISOString(), by: newest.agent };
  return ok(out);
}

/**
 * `keys-unopenable`: rows of any list with a sealed field, not deleted and not finished, whose sealed field names a
 * grant that was revoked or is gone. An empty sealed field is not counted here: a key that holds no value says so in
 * its own figure. NOTHING, NEVER NOUGHT, on a record where no list seals a value.
 *
 * AND `keys-unopened`, the same lists read for the keys nobody has opened in six months, counted by
 * `tidy-keys.ts` `countKeysUnopened`, the count the tidy's finder of that name answers.
 */
export function readKeysUnopenable(sql: Sql, ctx: Pick<EvalContext, 'nowMs'>, decl: MetricDecl): Result<Reading> {
  if (decl.metric === KEYS_UNOPENED.metric) {
    const unopened = countKeysUnopened(sql, ctx.nowMs);
    return judged(decl, unopened, unopened === null ? 'no list seals a value' : 'sealed keys nobody has opened in six months');
  }
  const lists = sealedLists(sql);
  if (lists.length === 0) return judged(decl, null, 'no list seals a value');
  let n = 0;
  for (const { list, sealed, done } of lists) {
    const named = sealed.map(fieldOf);
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

/**
 * `marks-unknown`: rows not deleted, on every list that declares `identity.mark`, whose mark is a word the set does not
 * draw. An empty mark is not counted: nothing was chosen. A FINISHED ROW IS COUNTED, unlike the two above, because a
 * project that shipped is still drawn on Projects with its mark. NOTHING, NEVER NOUGHT, where no list marks its rows.
 *
 * READ BY THE DISTINCT WORDS, never row by row: a record holds a few dozen marks over any number of rows, and what
 * names a glyph is `marks.ts`'s to say, which SQL cannot ask.
 */
export function readMarksUnknown(sql: Sql, _ctx: unknown, decl: MetricDecl): Result<Reading> {
  const lists = sql
    .all<{ body: string }>("SELECT body FROM declaration WHERE kind = 'register' AND superseded_at IS NULL AND retired = 0 AND json_valid(body)")
    .flatMap((r) => {
      const body = JSON.parse(r.body) as { id?: unknown; identity?: { mark?: unknown } | null };
      const mark = body.identity?.mark;
      return typeof body.id === 'string' && typeof mark === 'string' && mark !== '' ? [{ list: body.id, mark }] : [];
    });
  if (lists.length === 0) return judged(decl, null, 'no list gives its things a picture');
  let n = 0;
  for (const { list, mark } of lists) {
    const words = sql.all<{ word: unknown; n: number }>(
      `SELECT json_extract(fields, '$."${mark.replaceAll('"', '""').replaceAll("'", "''")}"') AS word, COUNT(*) AS n
         FROM entry WHERE register = ? AND deleted_at IS NULL GROUP BY 1`,
      list,
    );
    for (const w of words) if (isUnknownMark(w.word)) n += Number(w.n);
  }
  return judged(decl, n, 'pictures that name nothing the set draws');
}

/**
 * The counts `held-twice` and `held-twice-shown` read, handed in by the module that owns them when it loads, so this
 * file imports no list's module. `shown` is the people the first count is about, from the same pass.
 */
let heldTwice: ((sql: Sql) => number | null) | null = null;
let heldTwiceShown: ((sql: Sql) => number | null) | null = null;
export function countHeldTwiceBy(count: (sql: Sql) => number | null, shown?: (sql: Sql) => number | null): void {
  heldTwice = count;
  if (shown !== undefined) heldTwiceShown = shown;
}

/**
 * `held-twice`: the people held more than once, on the list that plays `meets:` (`peopleTwiceIn` in `people.ts`, the
 * count the nightly questions are asked by). Never somebody another member added, never a pair he answered, and nobody
 * counted twice. NOTHING, NEVER NOUGHT, on a record with no people list.
 *
 * AND `held-twice-shown`, read here too since it shares the source: how many people that count is about. NOTHING where
 * nobody is held twice, so a note that says both numbers is not drawn as "0 people, 0 too many".
 */
export function readPeopleTwice(sql: Sql, _ctx: unknown, decl: MetricDecl): Result<Reading> {
  if (decl.metric === PEOPLE_TWICE_SHOWN.metric) {
    const shown = heldTwiceShown ? heldTwiceShown(sql) : null;
    if (shown === null) return judged(decl, null, 'no list holds people');
    if (shown === 0) return judged(decl, null, 'nobody is held more than once');
    return judged(decl, shown, 'people who may be held more than once, by name or marked as you');
  }
  const n = heldTwice ? heldTwice(sql) : null;
  if (n === null) return judged(decl, null, 'no list holds people');
  return judged(decl, n, 'people held more than once, by name or marked as you');
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

/* ── the night's counts, read back ────── */

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
  if (Number(whole?.n ?? 0) > 0) return judged(decl, 0, 'something was erased or put back between the two nights, so nothing fell unexplained');
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
