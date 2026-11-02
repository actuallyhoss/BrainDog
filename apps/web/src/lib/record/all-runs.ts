/**
 * Every run on the record in one list, newest first, for the Agents page's "Today's runs" (`panel: run-list`), and the
 * day of agent runs over it as lanes, one a kind of agent (`agentDay`).
 *
 * FIVE READS, ONE LIST. Automations, scheduled actions and scripts are merged by `runLines` (`routes/automations/hub.ts`),
 * as the Runs page merged them before it moved here; agent runs come from the record's list of runs and jobs from its
 * list of jobs, each worded into the same `RunLine`. A source that cannot be read is said once and is not fatal: only
 * when every source refuses is the list a refusal.
 *
 * AN AGENT RUN IS TITLED BY WHAT IT DID, in its own words (`didOf`), and its agent, where it stands and when are the
 * line under it: forty lines titled "Gemini CLI" over "Agent run · Last heard just now" said nothing a person could tell
 * apart. NO UNDO ON THE LIST: a run's way back is on its own page, where what it changed is read first.
 */

import { since } from 'braindog-render';
import { onMachine, presenceOf } from '@braindog/kernel';
import { createClient } from '@braindog/client';
import { rowOf, rowsOf as rulesOf, type AutomationRow, type RunRow } from '../flow/source.ts';
import { ruleMonthOf, type ActionRow } from './actions.ts';

/** A list read as a screen opens on it: its answer, and whether the host has no such read at all. */
type Opened<T = AutomationRow[]> = { first: { ok: true; value: T } | { ok: false; refusal: { code: string; fix: string } }; absent: boolean };
import { readScripts, type Script } from './scripts.ts';
import { readJobs, runName, startedAt, statusOf } from './jobs.ts';
import { runWho } from './api.ts';
import { runLines, type Counted, type RunLine } from '../../routes/automations/hub.ts';

/** How many automations have their own runs read, newest last run first; past these a rule is its last run alone. */
const DEEP = 20;
/** How many runs each of those asks for. */
const EACH = 10;
/** How many agent runs are read, the newest by when they were last heard. */
const AGENTS = 40;

export const runsWords = {
  /** The line over the list when a source could not be read. */
  short: 'Some runs could not be read, so this list may be short.',
  none: 'Nothing has run yet.',
  runAJob: 'Start a job',
  agentWorking: 'at work now',
  agentOpen: (when: string) => `open, last heard ${when}`,
  agentLeft: (when: string) => `left a step ${when}`,
  agentEnded: (when: string) => `finished ${when}`,
  agentStopped: (when: string) => `stopped ${when}`,
  agentName: 'An agent',
  /* HOW AN AGENT RUN STANDS, WITHOUT WHEN, for a row that says when in a column of its own (the Agents page's Recent runs).
     A RUN STILL OPEN BUT SILENT IS QUIET (pages pass, 2 Nov), the word Working now and the list of runs use: "Last heard 2h
     ago" read as a state beside Finished and Stopped, and the when column already says how long. */
  outcome: { working: 'At work', left: 'Left a step', ended: 'Finished', stopped: 'Stopped', open: 'Quiet' },
  /** A run that said nothing of what it did, where it worked. */
  agentIn: (who: string, repo: string) => `${who} in ${repo}`,
  /** A run that said nothing of what it did: its agent's run. */
  agentRun: (who: string) => `${who} run`,
  jobSaid: (word: string, when: string) => `${word} ${when}.`,
  /* THE LANES' OWN WORDS. */
  since: (n: number) => (n === 1 ? '1 run since midnight' : `${n.toLocaleString('en')} runs since midnight`),
  finished: 'finished',
  running: 'at work',
  now: (hm: string) => `now ${hm}`,
} as const;

const isBag = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * WHAT A RUN DID, in its own words: what the record says it said (`doing_said`), else what it is doing, unless that is
 * the record's own name for it ("Claude Code in BrainDog", "Codex run, 3 Sep", its repository and branch) or holds a
 * path or an id, which no line prints. `null` for a run that said nothing a person reads.
 */
export function didOf(f: Readonly<Record<string, unknown>>): string | null {
  const said = text(f.doing_said);
  if (said) return said;
  const doing = text(f.doing);
  if (!doing || /[\\/]|[a-z][a-z0-9_]*#\d|\b[0-9a-f]{12,}\b/u.test(doing)) return null;
  const repo = text(f.repo);
  const own = (name: string | null) => !!name && (doing === `${name} run` || doing.startsWith(`${name} in `) || doing.startsWith(`${name} run, `) || onMachine(doing, name));
  if (own(runWho(f)) || own(text(f.agent)) || /^Agent run\b/u.test(doing) || onMachine(doing, 'Agent') || (repo !== '' && (doing === repo || doing.startsWith(`${repo} on `)))) return null;
  return doing;
}

/** Agent runs as lines: the ones that did something (`wrote` not nought), not helpers, by when they were last heard. */
export function agentLines(rows: readonly unknown[], now: number): RunLine[] {
  const out: RunLine[] = [];
  for (const r of rows) {
    if (!isBag(r) || typeof r.seq !== 'number' || !isBag(r.fields)) continue;
    const f = r.fields;
    if (text(f.parent) !== '' || f.wrote === 0) continue;
    const at = text(f.last_seen) || text(f.started);
    if (!Number.isFinite(Date.parse(at))) continue;
    const state = typeof r.state === 'string' ? r.state : text(f.state);
    const where = presenceOf({ state, fields: { ...f, last_seen: at } as never }, now);
    const when = since(at, now);
    const stands =
      where === 'working'
        ? runsWords.agentWorking
        : where === 'left'
          ? runsWords.agentLeft(when)
          : where === 'ended'
            ? runsWords.agentEnded(when)
            : where === 'stopped'
              ? runsWords.agentStopped(when)
              : runsWords.agentOpen(when);
    const who = runWho(f) ?? runsWords.agentName;
    const did = didOf(f);
    const agent = text(f.agent);
    const project = text(f.project);
    const repo = text(f.repo);
    const outcome = where === 'working' || where === 'left' || where === 'ended' || where === 'stopped' ? runsWords.outcome[where] : runsWords.outcome.open;
    out.push({
      key: `r:${r.seq}`,
      kind: 'agent',
      name: did ?? (repo ? runsWords.agentIn(who, repo) : runsWords.agentRun(who)),
      at,
      said: did ? `${who}, ${stands}` : stands,
      bad: false,
      path: `/r/session/${r.seq}`,
      outcome,
      live: where === 'working',
      ...(agent ? { agent } : {}),
      ...(project ? { project } : {}),
    });
  }
  return out;
}

/* ── the day as lanes, one a kind of agent ──────────────────────────────── */

/** One span of a lane: where it starts and how wide, as shares of the window, the lane's row it is drawn on, and whether it is at work. */
export type LaneSpan = { at: number; width: number; row: number; live: boolean };
/** One lane: a kind of agent by its id and name, its runs today as spans, and how many rows they are drawn on. */
export type AgentLane = { agent: string; name: string; spans: LaneSpan[]; rows: number };
/** The day so far: its lanes, the hours named along the foot as shares of it, the clock, and how many runs it holds. */
export type AgentDay = { lanes: AgentLane[]; ticks: { at: number; label: string }[]; now: string; runs: number };

const HM = (ms: number): string => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);

const HOUR = 3_600_000;

/** The most rows a lane is drawn on; past these, a run shares the row that frees first. */
export const LANE_ROWS = 3;

/** The least share of the window a span is drawn across, so a run of a minute is still a mark. */
const LEAST = 0.6;

/** The share of the window two spans on one row keep between them, so two runs never read as one bar. */
const APART = 0.8;

/**
 * THE SPANS OF ONE LANE ON ITS ROWS: each run on the first row free at its start, so runs that overlap or sit side by
 * side are drawn one over another and read as several, up to `LANE_ROWS`; past that, on the row that frees first.
 */
export function rowsOf(spans: readonly Omit<LaneSpan, 'row'>[]): { spans: LaneSpan[]; rows: number } {
  const ends: number[] = [];
  const placed = [...spans]
    .sort((a, b) => a.at - b.at)
    .map((sp) => {
      let row = ends.findIndex((end) => end + APART <= sp.at);
      if (row === -1 && ends.length < LANE_ROWS) row = ends.push(-Infinity) - 1;
      if (row === -1) row = ends.indexOf(Math.min(...ends));
      ends[row] = Math.max(ends[row]!, sp.at + sp.width);
      return { ...sp, row };
    });
  return { spans: placed, rows: Math.max(1, ends.length) };
}

/**
 * TODAY'S AGENT RUNS AS LANES, ONE A KIND OF AGENT (the board's At work chart): each run a span from when it started to
 * when it was last heard, or to now while it is at work, on the reader's clock. A lane a run was forty bars on a busy
 * day; a lane an agent is four, each holding its day, its runs on up to three rows where they overlap (`rowsOf`).
 * Helpers are their parent's. `null` when no run was heard today.
 *
 * THE AXIS RUNS FROM THE HOUR THE FIRST RUN STARTED, not from midnight, so a day whose runs all fall in its last hours
 * spreads them across the tile instead of stacking them on now's line. It shows two hours at the least and never
 * reaches back past midnight, and names its hours every one, two, three or six, whichever keeps the foot to six names.
 */
export function agentDay(rows: readonly unknown[], now: number): AgentDay | null {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const day = midnight.getTime();
  const seen: { agent: string; start: number; end: number; live: boolean }[] = [];
  for (const r of rows) {
    if (!isBag(r) || !isBag(r.fields)) continue;
    const f = r.fields;
    if (text(f.parent) !== '') continue;
    const heard = Date.parse(text(f.last_seen));
    if (!Number.isFinite(heard) || heard < day) continue;
    const begun = Date.parse(text(f.started));
    const state = typeof r.state === 'string' ? r.state : text(f.state);
    const live = presenceOf({ state, fields: f as never }, now) === 'working';
    const start = Number.isFinite(begun) ? Math.max(begun, day) : heard;
    seen.push({ agent: text(f.agent) || 'other', start, end: live ? now : Math.max(heard, start), live });
  }
  if (seen.length === 0) return null;
  const first = Math.min(...seen.map((s) => s.start), now - 2 * HOUR);
  const from = Math.max(day, new Date(first).setMinutes(0, 0, 0));
  const length = Math.max(now - from, 60_000);
  const share = (ms: number) => Math.min(100, Math.max(0, ((ms - from) / length) * 100));
  const lanes = new Map<string, { agent: string; name: string; spans: Omit<LaneSpan, 'row'>[] }>();
  for (const s of seen) {
    const lane = lanes.get(s.agent) ?? { agent: s.agent, name: runWho({ agent: s.agent }) ?? runsWords.agentName, spans: [] };
    const width = Math.max(share(s.end) - share(s.start), LEAST);
    /* A RUN THAT BEGAN A MOMENT AGO STILL SITS INSIDE THE TRACK, its mark ending at now. */
    lane.spans.push({ at: Math.min(share(s.start), 100 - width), width, live: s.live });
    lanes.set(s.agent, lane);
  }
  const step = [1, 2, 3, 6].find((h) => length / (h * HOUR) <= 6) ?? 6;
  const ticks: { at: number; label: string }[] = [];
  for (let t = from; t <= now; t += HOUR) {
    if (new Date(t).getHours() % step !== 0) continue;
    const at = share(t);
    if (at < 88) ticks.push({ at, label: HM(t) });
  }
  const drawn = [...lanes.values()].map((l) => ({ agent: l.agent, name: l.name, ...rowsOf(l.spans) }));
  return { lanes: drawn.sort((a, b) => b.spans.length - a.spans.length || a.name.localeCompare(b.name)), ticks, now: HM(now), runs: seen.length };
}

/** Jobs as lines. A job opens its own transcript at `/jobs/<id>`. */
export function jobLines(rows: readonly { id: string; title: string | null; kind: string; status: string; lost: boolean; cancel: boolean; claimed_at: string | null; created_at: string }[], now: number): RunLine[] {
  return rows.map((j) => {
    const at = startedAt(j);
    const s = statusOf(j.status, j.lost, j.cancel);
    return { key: `j:${j.id}`, kind: 'job', name: runName(j), at, said: runsWords.jobSaid(s.word, since(at, now)), bad: s.tone === 'bad', path: `/jobs/${encodeURIComponent(j.id)}`, outcome: s.word };
  });
}

/**
 * WHETHER A REFUSED SOURCE IS ONE THIS READER CANNOT HAVE, which is not a list cut short: a host with no such read
 * (`ROUTE_UNKNOWN`), and a read that is not theirs, jobs above all, which are an owner's in a browser (`listJobs`, ADMIN)
 * and so refused to every key and every member (`NEEDS_BROWSER_SESSION`, `FORBIDDEN`). Said as "Some runs could not be
 * read", the Agents page told the live look, which reads with a key, that its list might be short (24 Oct).
 */
export const notTheirs = (code: string): boolean => code === 'ROUTE_UNKNOWN' || code === 'NEEDS_BROWSER_SESSION' || code === 'FORBIDDEN';

/** `agentRuns` is how many runs the record's list of runs holds, the count its door says, or `null` where it was not read. */
export type AllRuns =
  | {
      from: 'ready';
      lines: RunLine[];
      short: boolean;
      day: AgentDay | null;
      agentRuns: number | null;
      /** How many times the record's own rules ran this month, as each rule's month counts it (`ruleMonthOf`). */
      rulesMonth: number;
    }
  | { from: 'refused'; fix: string };

/** Reads every source side by side and merges them, newest first. */
export async function readAllRuns(base: string, now: number): Promise<AllRuns> {
  const client = createClient({ base });
  /* EVERY READ GOES THROUGH THE ONE CLIENT, so the reads asked at once go as one `reads` (scope 2026-10-24): the rules and
     the scheduled actions went by a fetch of their own, and each rule's last runs after them, twenty requests in a wave
     of their own on the Agents page. */
  const opened = <T>(got: Awaited<ReturnType<typeof client.call<unknown>>>, value: (raw: unknown) => T): Opened<T> => {
    if (got.ok) return { first: { ok: true, value: value(got.value) }, absent: false };
    const refusal = 'refusal' in got ? got.refusal : { code: 'VERSION_STALE', fix: 'Something changed while it was being read.' };
    return { first: { ok: false, refusal }, absent: notTheirs(refusal.code) };
  };
  const rules = async (): Promise<Opened> => opened(await client.call<unknown>('automations'), rulesOf);
  const scheduled = async (): Promise<Opened<ActionRow[]>> =>
    opened(await client.call<unknown>('actions'), (raw) => (Array.isArray(raw) ? (raw as ActionRow[]) : []));
  const [autos, actions, scripts, sessions, jobs] = await Promise.all([
    rules(),
    scheduled(),
    readScripts(base),
    client.list({ register: 'session', limit: AGENTS, order: [{ field: 'last_seen', dir: 'desc' }] }),
    readJobs(base),
  ]);

  /* A READ THE HOST DOES NOT HAVE IS NOT A FAILURE, only a kind this record does not list yet. */
  const autoRows: AutomationRow[] = autos.first.ok ? autos.first.value : [];
  const actionRows: ActionRow[] = actions.first.ok ? actions.first.value : [];
  const scriptRows: Script[] = scripts.ok ? scripts.value : [];
  const scriptsAbsent = !scripts.ok && 'refusal' in scripts && notTheirs(scripts.refusal.code);
  const sessionsAbsent = !sessions.ok && 'refusal' in sessions && notTheirs(sessions.refusal.code);
  const jobsAbsent = !jobs.ok && 'refusal' in jobs && notTheirs(jobs.refusal.code);
  const failed = [
    autos.first.ok || autos.absent ? null : autos.first.refusal.fix,
    actions.first.ok || actions.absent ? null : actions.first.refusal.fix,
    scripts.ok || scriptsAbsent ? null : 'refusal' in scripts ? scripts.refusal.fix : '',
    sessions.ok || sessionsAbsent ? null : 'refusal' in sessions ? sessions.refusal.fix : '',
    jobs.ok || jobsAbsent ? null : 'refusal' in jobs ? jobs.refusal.fix : '',
  ].filter((f): f is string => f !== null);
  /* EVERY SOURCE REFUSED, AND NOT ONE FOR BEING SOMEBODY ELSE'S, is a list that could not be read at all. */
  if (failed.length === 5) return { from: 'refused', fix: failed[0] ?? '' };

  /* A RULE THAT RAN, by its last run or by the record's count of it (`last_at`), when it keeps no last run. */
  const lastOf = (a: AutomationRow): number => Date.parse(a.last?.at ?? (a as Counted).last_at ?? '');
  const deep = autoRows
    .filter((a) => Number.isFinite(lastOf(a)))
    .sort((a, b) => lastOf(b) - lastOf(a))
    .slice(0, DEEP);
  const runs = new Map<string, readonly RunRow[]>();
  const each = await Promise.all(deep.map((a) => client.call<unknown>('automations', { rule: a.id.startsWith('rule.') ? a.id.slice('rule.'.length) : a.id, limit: EACH })));
  each.forEach((got, i) => {
    const rule = deep[i];
    const row = got.ok ? rowOf(got.value) : null;
    if (rule && row) runs.set(rule.id, row.runs);
  });

  const sessionRows: readonly unknown[] = sessions.ok && isBag(sessions.value) && Array.isArray(sessions.value.rows) ? sessions.value.rows : [];
  const agents = agentLines(sessionRows, now);
  const jobRows = jobs.ok ? jobLines(jobs.value.jobs, now) : [];
  const lines = [...runLines(autoRows, runs, actionRows, scriptRows, now), ...agents, ...jobRows].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const agentRuns = sessions.ok && isBag(sessions.value) && typeof sessions.value.matched === 'number' ? sessions.value.matched : null;
  const rulesMonth = autoRows.reduce((n, a) => n + ruleMonthOf(a as Parameters<typeof ruleMonthOf>[0]), 0);
  return { from: 'ready', lines, short: failed.length > 0, day: agentDay(sessionRows, now), agentRuns, rulesMonth };
}
