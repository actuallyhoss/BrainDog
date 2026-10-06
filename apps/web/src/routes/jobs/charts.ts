/**
 * What `/jobs` and `/jobs/<id>` say about their runs: the title row's sentence, the runs grouped by day, the machines'
 * lanes over the last day or week, the outcome split, and the tools one run called.
 *
 * EVERY FIGURE IS A COUNT OF THE RUNS THE SCREEN READ. `listJobs` answers pages of fifty, so a chart sees the pages
 * loaded and no more, and says so ("Latest 50 runs") when older runs exist that it has not seen. Nothing here guesses a
 * run's end: a finished run's span is its claim plus the `ms` its machine reported, and a run with neither is not drawn.
 *
 * PURE, for the reason `lib/record/jobs.ts` gives: `node --test` holds it without a component in sight. The clock is an
 * argument, and days are the viewer's own local days.
 */

import { duration, isLive, runName, startedAt, statusOf, type JobRow, type Step } from '../../lib/record/jobs.ts';
import { listed } from '../../lib/viz/shared.ts';
import type { Lane } from '../../lib/viz/swimlanes.ts';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** The most machine lanes drawn; past it the quietest machines share one lane. */
const LANES_MOST = 5;
/** The most tools the run's chart names; the rest share one bar. */
const TOOLS_MOST = 5;

/* ── what a run came to ─────────────────────────────────────────────────── */

/**
 * Where a run stands, as the list groups and colours it. `look` is a run that ended short of done without failing (out of
 * turns, interrupted, stopped for a decision), which is worth a look and is not a failure.
 */
export type Outcome = 'running' | 'waiting' | 'done' | 'failed' | 'look' | 'stopped';

export function outcomeOf(r: Pick<JobRow, 'status'>): Outcome {
  if (r.status === 'claimed') return 'running';
  if (r.status === 'queued') return 'waiting';
  if (r.status === 'ok') return 'done';
  if (r.status === 'cancelled') return 'stopped';
  return statusOf(r.status).tone === 'bad' ? 'failed' : 'look';
}

/** The glyph in a run's well: what it is doing, or how it ended. */
export function iconOf(r: Pick<JobRow, 'status' | 'cancel'>): 'play' | 'clock' | 'check' | 'alert' | 'stop' | 'decide' {
  if (isLive(r.status) && r.cancel) return 'stop';
  if (r.status === 'needs_decision') return 'decide';
  const o = outcomeOf(r);
  return o === 'running' ? 'play' : o === 'waiting' ? 'clock' : o === 'done' ? 'check' : o === 'stopped' ? 'stop' : 'alert';
}

const ms = (iso: string | null): number | null => {
  if (iso === null) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

/**
 * How long a run took, or has been going: the machine's own `ms` once it has ended, the time since it was taken while it
 * runs, and the wait so far while it waits. `null` for an ended run whose machine reported no time.
 */
export function tookOf(r: Pick<JobRow, 'status' | 'ms' | 'claimed_at' | 'created_at'>, now: number): string | null {
  if (r.ms !== null) return duration(r.ms);
  if (!isLive(r.status)) return null;
  const from = ms(startedAt(r));
  return from === null ? null : duration(Math.max(0, now - from));
}

/* ── days, on the viewer's clock ────────────────────────────────────────── */

const pad = (n: number): string => String(n).padStart(2, '0');

/** The local day an instant falls on, `2026-09-29`. */
export function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const LONG_DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
const SHORT_DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short' });
const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'long' });
const CLOCK = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** "09:12", on the viewer's clock. */
export const clockOf = (t: number): string => CLOCK.format(t);

/** A day as a group heading says it: "Today", "Yesterday", "Monday 28 September", and the year once it is not this one. */
export function dayTitle(t: number, now: number): string {
  const key = dayKey(t);
  if (key === dayKey(now)) return words.today;
  const before = new Date(now);
  before.setDate(before.getDate() - 1);
  if (key === dayKey(before.getTime())) return words.yesterday;
  const year = new Date(t).getFullYear();
  return year === new Date(now).getFullYear() ? LONG_DAY.format(t) : `${LONG_DAY.format(t)} ${year}`;
}

/** Local midnight of the day an instant falls on. */
function midnight(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/* ── the groups on the ground ───────────────────────────────────────────── */

export type Group = { key: string; title: string; live: boolean; rows: JobRow[] };

/**
 * The runs as the list groups them: the live ones first under one heading, then the rest by the day each started,
 * newest day first, each day in the order it came (newest first).
 */
export function groupsOf(rows: readonly JobRow[], now: number): Group[] {
  const live = rows.filter((r) => isLive(r.status));
  const out: Group[] = live.length ? [{ key: 'live', title: words.live, live: true, rows: live }] : [];
  const byDay = new Map<string, Group>();
  for (const r of rows) {
    if (isLive(r.status)) continue;
    const t = ms(startedAt(r));
    const key = t === null ? 'undated' : dayKey(t);
    let g = byDay.get(key);
    if (!g) {
      g = { key, title: t === null ? words.undated : dayTitle(t, now), live: false, rows: [] };
      byDay.set(key, g);
    }
    g.rows.push(r);
  }
  /* Keys are ISO days, so a plain sort is the calendar's; an undated group goes last. */
  const days = [...byDay.values()].sort((a, b) => (a.key === 'undated' ? 1 : b.key === 'undated' ? -1 : b.key.localeCompare(a.key)));
  return [...out, ...days];
}

/**
 * THE MACHINE BY ITS NAME, NOT ITS ADDRESS: a runner that reported `Sam-MacBook-Pro.local` or `build-box.lan` is said as
 * the part a person named it, and a bare network address is not a name at all, so it reads as an unnamed machine.
 */
export function machineOf(runner: string | null | undefined): string | null {
  const name = (runner ?? '').trim();
  if (name === '') return null;
  if (/^[\d.]+$|:/u.test(name)) return words.aMachine;
  return name.split('.')[0] || words.aMachine;
}

/** A run's meta line after its status: the machine, when it started, and its turns once it has any. */
export function detailOf(r: Pick<JobRow, 'runner' | 'status' | 'claimed_at' | 'created_at' | 'turns'>): string[] {
  const t = ms(startedAt(r));
  const when = t === null ? null : r.status === 'queued' ? words.askedAt(clockOf(t)) : clockOf(t);
  return [machineOf(r.runner) ?? words.noMachine, when, r.turns === null ? null : words.turns(r.turns)].filter((p): p is string => p !== null);
}

/* ── the title row's sentence ───────────────────────────────────────────── */

/** A sentence in pieces: `live` wears the live dot before it, `needs` is the phrase in red. */
export type Said = { text: string; tone?: 'live' | 'needs' | undefined }[];

/**
 * "2 running now, and 1 failed today." The running clause wears the live dot, and the failed clause is the red one:
 * a failure is the one thing on this screen that needs him.
 */
export function sentenceOf(rows: readonly JobRow[], now: number): Said | null {
  if (rows.length === 0) return null;
  const today = dayKey(now);
  const on = (r: JobRow): boolean => {
    const t = ms(startedAt(r));
    return t !== null && dayKey(t) === today;
  };
  const running = rows.filter((r) => r.status === 'claimed').length;
  const waiting = rows.filter((r) => r.status === 'queued').length;
  const failed = rows.filter((r) => outcomeOf(r) === 'failed' && on(r)).length;
  const finished = rows.filter((r) => outcomeOf(r) === 'done' && on(r)).length;

  const out: Said = [];
  if (running > 0) {
    out.push({ text: words.runningNow(running), tone: 'live' });
    if (waiting > 0) out.push({ text: ` ${words.andWaiting(waiting)}` });
  } else if (waiting > 0) out.push({ text: words.waiting(waiting) });
  else out.push({ text: words.nothingRunning });

  if (failed > 0) out.push({ text: ', and ' }, { text: words.failedToday(failed), tone: 'needs' });
  else if (finished > 0) out.push({ text: `, and ${words.finishedToday(finished)}` });
  out.push({ text: '.' });
  return out;
}

/** The sentence as plain words, for a test or a title. */
export const plain = (said: Said): string => said.map((p) => p.text).join('');

/* ── who ran what: the machines' lanes ──────────────────────────────────── */

export type LaneView = {
  lanes: Lane[];
  start: number;
  end: number;
  now: number;
  /** The window: the last 24 hours when anything ran in them, else the last 7 days. */
  span: 'day' | 'week';
  /** Whether older runs exist that this window reaches back past, so the chart has not seen them. */
  partial: boolean;
  /** What the reading line is built from. */
  byMachine: { label: string; runs: number }[];
  running: number;
  waiting: number;
  failed: { name: string; at: number } | null;
};

type Interval = { lane: string; from: number; to: number; live: boolean; row: JobRow };

/**
 * A run as a span on its machine's lane: from its claim to its claim plus the time its machine reported, or to now while
 * it runs. A waiting run is a span on the waiting lane from when it was asked for. A run no machine ever took is on no
 * lane, since it never ran anywhere.
 */
function intervalOf(r: JobRow, now: number): Interval | null {
  if (r.status === 'queued') {
    const from = ms(r.created_at);
    return from === null ? null : { lane: words.waitingLane, from, to: now, live: false, row: r };
  }
  const from = ms(r.claimed_at);
  if (from === null) return null;
  const lane = machineOf(r.runner) ?? words.noMachine;
  if (r.status === 'claimed') return { lane, from, to: now, live: true, row: r };
  return { lane, from, to: from + (r.ms ?? 0), live: false, row: r };
}

/**
 * The machines' lanes over the last day, or over the last week when nothing ran in the day, or `null` when nothing ran
 * in either.
 *
 * `oldest` is when the oldest run read started, given only while older runs exist: a window reaching back past it is a
 * window the chart has only partly seen.
 */
export function lanesOf(rows: readonly JobRow[], now: number, oldest: number | null = null): LaneView | null {
  const all = rows.flatMap((r) => intervalOf(r, now) ?? []);
  const within = (start: number): Interval[] => all.filter((i) => i.to >= start && i.from <= now);
  let span: 'day' | 'week' = 'day';
  let start = now - DAY;
  let seen = within(start);
  if (seen.length === 0) {
    span = 'week';
    start = now - 7 * DAY;
    seen = within(start);
  }
  if (seen.length === 0) return null;

  const counts = new Map<string, number>();
  for (const i of seen) if (i.lane !== words.waitingLane) counts.set(i.lane, (counts.get(i.lane) ?? 0) + 1);
  const machines = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  /* FIVE LANES AT MOST: past it the four busiest keep theirs and the rest share one. */
  const kept = machines.length > LANES_MOST ? machines.slice(0, LANES_MOST - 1) : machines;
  const shown = new Set(kept.map(([m]) => m));
  const laneOf = (i: Interval): string => (i.lane === words.waitingLane || shown.has(i.lane) ? i.lane : words.otherMachines);
  const order = [...kept.map(([m]) => m), ...(machines.length > kept.length ? [words.otherMachines] : []), ...(seen.some((i) => i.lane === words.waitingLane) ? [words.waitingLane] : [])];

  const lanes: Lane[] = order.map((label) => ({
    label,
    spans: seen
      .filter((i) => laneOf(i) === label)
      .sort((a, b) => a.from - b.from)
      .map((i) => ({ from: i.from, to: i.to, live: i.live })),
  }));

  const byMachine = [...kept.map(([label, runs]) => ({ label, runs }))];
  if (machines.length > kept.length) byMachine.push({ label: words.otherMachines, runs: machines.slice(kept.length).reduce((s, [, n]) => s + n, 0) });

  const lastFailed = seen
    .filter((i) => outcomeOf(i.row) === 'failed')
    .sort((a, b) => b.from - a.from)
    .at(0);

  return {
    lanes,
    start,
    end: now,
    now,
    span,
    partial: oldest !== null && oldest > start,
    byMachine,
    running: seen.filter((i) => i.live).length,
    waiting: seen.filter((i) => i.lane === words.waitingLane).length,
    failed: lastFailed ? { name: runName(lastFailed.row), at: lastFailed.from } : null,
  };
}

/** An axis tick or the now pill: a weekday at midnight, so the day's edge is named, and the hour otherwise. */
export function laneTime(t: number): string {
  const d = new Date(t);
  return d.getHours() === 0 && d.getMinutes() === 0 ? SHORT_DAY.format(t) : clockOf(t);
}

/** "claude-mac ran 6 jobs in the last 24 hours; 1 is still going and weekly review failed at 09:12." */
export function lanesSaid(v: LaneView): string {
  const period = v.span === 'day' ? words.lastDay : words.lastWeek;
  const [first, second, ...rest] = v.byMachine;
  let lead: string;
  if (!first) lead = words.noneTaken(period);
  else if (!second) lead = `${first.label} ran ${words.jobs(first.runs)} ${period}`;
  else if (rest.length === 0) lead = `${first.label} ran ${words.jobs(first.runs)} and ${second.label} ${second.runs} ${period}`;
  else lead = `${first.label} ran ${words.jobs(first.runs)}, ${second.label} ${second.runs} and ${words.others(rest.reduce((s, m) => s + m.runs, 0))} ${period}`;

  const clauses: string[] = [];
  if (v.running > 0) clauses.push(words.stillGoing(v.running));
  if (v.waiting > 0) clauses.push(words.waitFor(v.waiting));
  if (v.failed) clauses.push(`${v.failed.name} failed ${v.span === 'day' || dayKey(v.failed.at) === dayKey(v.now) ? `at ${clockOf(v.failed.at)}` : `on ${WEEKDAY.format(v.failed.at)}`}`);
  return clauses.length ? `${lead}; ${listed(clauses)}.` : `${lead}.`;
}

/** What a screen reader hears for the lanes: each machine and its runs over the window, never a clock that repeats. */
export function lanesSummary(v: LaneView): string {
  const each = v.lanes.map((l) => `${l.label}: ${words.runs(l.spans.length)}${l.spans.some((s) => s.live) ? `, ${words.stillGoing(l.spans.filter((s) => s.live).length)}` : ''}`);
  return `${words.lanesSubject} ${v.span === 'day' ? words.lastDay : words.lastWeek}. ${each.join('. ')}.`;
}

/* ── how they went: the outcome split ───────────────────────────────────── */

export type Split = { label: string; value: number; tone: 'ink' | 'danger' | 'warn' | 'g3' | 'live' | 'g4' }[];

/** The runs read, split by outcome: done in ink, failed in red, a look in amber, stopped grey, running live, waiting quiet. */
export function splitOf(rows: readonly JobRow[]): Split {
  const n = (o: Outcome): number => rows.filter((r) => outcomeOf(r) === o).length;
  return [
    { label: words.split.done, value: n('done'), tone: 'ink' },
    { label: words.split.failed, value: n('failed'), tone: 'danger' },
    { label: words.split.look, value: n('look'), tone: 'warn' },
    { label: words.split.stopped, value: n('stopped'), tone: 'g3' },
    { label: words.split.running, value: n('running'), tone: 'live' },
    { label: words.split.waiting, value: n('waiting'), tone: 'g4' },
  ];
}

/** "18 of 21 finished; 2 failed, both weekly review, and 1 is still going." */
export function splitSaid(rows: readonly JobRow[]): string {
  const total = rows.length;
  if (total === 0) return '';
  const count = (o: Outcome): number => rows.filter((r) => outcomeOf(r) === o).length;
  const done = count('done');
  const lead = done === total ? words.allFinished(total) : `${done} of ${total} finished`;
  const failedRows = rows.filter((r) => outcomeOf(r) === 'failed');
  const names = [...new Set(failedRows.map((r) => runName(r)))];
  const clauses: string[] = [];
  if (failedRows.length === 1) clauses.push(`${names[0]} failed`);
  else if (failedRows.length > 1) clauses.push(names.length === 1 ? `${failedRows.length} failed, ${failedRows.length === 2 ? 'both' : 'all'} ${names[0]}` : `${failedRows.length} failed`);
  const look = count('look');
  if (look > 0) clauses.push(words.needLook(look));
  const stopped = count('stopped');
  if (stopped > 0) clauses.push(`${stopped} stopped`);
  const going = count('running');
  if (going > 0) clauses.push(words.stillGoing(going));
  const waiting = count('waiting');
  if (waiting > 0) clauses.push(words.waitFor(waiting));
  return clauses.length ? `${lead}; ${listed(clauses)}.` : `${lead}.`;
}

/* ── one run: the tools it called ───────────────────────────────────────── */

export type Tally = { items: { label: string; value: number; tone?: 'ink' | undefined; note?: string | undefined }[]; calls: number; failed: number; top: { name: string; n: number } | null };

/** The tools a run called, busiest first, the busiest in ink, the rest after the fifth sharing one bar. */
export function toolsOf(steps: readonly Step[]): Tally {
  const counts = new Map<string, { n: number; failed: number }>();
  for (const s of steps) {
    if (s.kind !== 'tool' || !s.tool) continue;
    const c = counts.get(s.tool.name) ?? { n: 0, failed: 0 };
    c.n += 1;
    if (s.tool.out?.failed) c.failed += 1;
    counts.set(s.tool.name, c);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]));
  const kept = ranked.length > TOOLS_MOST ? ranked.slice(0, TOOLS_MOST - 1) : ranked;
  const rest = ranked.slice(kept.length);
  const note = (failed: number): string | undefined => (failed > 0 ? words.callsFailed(failed) : undefined);
  const items: Tally['items'] = kept.map(([label, c], i) => ({ label, value: c.n, ...(i === 0 ? { tone: 'ink' as const } : {}), ...(note(c.failed) ? { note: note(c.failed) } : {}) }));
  if (rest.length) {
    const n = rest.reduce((s, [, c]) => s + c.n, 0);
    const failed = rest.reduce((s, [, c]) => s + c.failed, 0);
    items.push({ label: words.otherTools, value: n, ...(note(failed) ? { note: note(failed) } : {}) });
  }
  const calls = ranked.reduce((s, [, c]) => s + c.n, 0);
  const failed = ranked.reduce((s, [, c]) => s + c.failed, 0);
  const top = ranked[0] ? { name: ranked[0][0], n: ranked[0][1].n } : null;
  return { items, calls, failed, top };
}

/** What the tool chart means: "It called tools 23 times, Read most (9); 1 call failed." */
export function toolsSaid(tally: Tally): string {
  if (tally.calls === 0 || tally.top === null) return '';
  if (tally.calls === 1) return `It called one tool, ${tally.top.name}${tally.failed ? ', and the call failed' : ''}.`;
  const most = tally.top.n > 1 ? `, ${tally.top.name} most (${tally.top.n})` : '';
  const failed = tally.failed > 0 ? `; ${words.callsFailed(tally.failed)}` : '';
  return `It called tools ${tally.calls} times${most}${failed}.`;
}

/**
 * The rest of the title row's sentence after the status word: where it runs and since when while live, and how long,
 * where and in how many turns once it has ended. "Done" then " in 6m on claude-mac, 14 turns."
 */
export function runTail(status: JobRow['status'], lost: boolean, row: Pick<JobRow, 'runner' | 'turns' | 'ms' | 'claimed_at' | 'created_at'> | null): string {
  const machine = machineOf(row?.runner);
  const on = machine ? ` on ${machine === words.aMachine ? 'an unnamed machine' : machine}` : '';
  if (status === 'queued') {
    const t = row ? ms(row.created_at) : null;
    return t === null ? '.' : `, ${words.askedAt(clockOf(t))}.`;
  }
  if (status === 'claimed') {
    const t = row ? ms(startedAt(row)) : null;
    const since = t === null ? '' : ` since ${clockOf(t)}`;
    return lost ? `. It was running${on}${since}.` : `${on}${since}.`;
  }
  const took = row?.ms == null ? '' : ` in ${duration(row.ms)}`;
  const turns = row?.turns == null ? '' : `, ${words.turns(row.turns)}`;
  return `${took}${on}${turns}.`;
}

/* ── words ──────────────────────────────────────────────────────────────── */

const plural = (n: number, one: string, many: string): string => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

export const words = {
  live: 'Live',
  today: 'Today',
  yesterday: 'Yesterday',
  undated: 'No date',
  noMachine: 'No machine yet',
  aMachine: 'Unnamed machine',
  askedAt: (at: string) => `asked for at ${at}`,
  turns: (n: number) => plural(n, 'turn', 'turns'),
  runs: (n: number) => plural(n, 'run', 'runs'),
  jobs: (n: number) => plural(n, 'job', 'jobs'),
  /* The sentence. */
  runningNow: (n: number) => `${n.toLocaleString('en-GB')} running now`,
  andWaiting: (n: number) => `and ${n.toLocaleString('en-GB')} waiting for a machine`,
  waiting: (n: number) => `${n.toLocaleString('en-GB')} waiting for a machine`,
  nothingRunning: 'Nothing is running now',
  failedToday: (n: number) => `${n.toLocaleString('en-GB')} failed today`,
  finishedToday: (n: number) => `${n.toLocaleString('en-GB')} finished today`,
  /* The lanes. */
  lanesTitle: 'Who ran what',
  lanesSubject: 'Runs by machine',
  waitingLane: 'Waiting for a machine',
  otherMachines: 'Other machines',
  lastDay: 'in the last 24 hours',
  lastWeek: 'in the last 7 days',
  dayMeta: 'Last 24 hours',
  weekMeta: 'Last 7 days',
  latest: (n: number) => `Latest ${plural(n, 'run', 'runs')}`,
  noneTaken: (period: string) => `No machine took a run ${period}`,
  others: (n: number) => `the others ${n.toLocaleString('en-GB')}`,
  stillGoing: (n: number) => `${n.toLocaleString('en-GB')} ${n === 1 ? 'is' : 'are'} still going`,
  waitFor: (n: number) => `${n.toLocaleString('en-GB')} ${n === 1 ? 'waits' : 'wait'} for a machine`,
  /* The split. */
  splitTitle: 'How they went',
  splitSubject: 'Runs by how they went',
  split: { done: 'Done', failed: 'Failed', look: 'Needs a look', stopped: 'Stopped', running: 'Running', waiting: 'Waiting' },
  allFinished: (n: number) => (n === 1 ? 'The one run finished' : `All ${n.toLocaleString('en-GB')} finished`),
  needLook: (n: number) => `${n.toLocaleString('en-GB')} ${n === 1 ? 'needs' : 'need'} a look`,
  /* One run. */
  runTitle: 'This run',
  toolsSubject: 'Tools it called',
  otherTools: 'Other tools',
  callsFailed: (n: number) => `${plural(n, 'call', 'calls')} failed`,
  transcript: 'Transcript',
  cost: 'Cost',
};
