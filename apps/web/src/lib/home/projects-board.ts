/**
 * THE PROJECTS PAGE AS ONE BOARD: a headline that is a fact, what they earn a month, this week's four counts, one sorted
 * list in three groups, and the parked and finished folded into a strip. Worked out here from what the board reads
 * (`projects-board-read.ts`), and drawn by `ProjectsBoard.svelte`.
 *
 * THE HEADLINE IS WHAT THE RECORD KNOWS, NEVER A GUESS: the work that is late, by project; what falls due in seven days;
 * the projects whose numbers went quiet; the questions waiting about projects; what renews inside thirty days. It names
 * the projects, so "Nothing needs a push" is never said over two late projects. The same sentence on every width.
 *
 * ONE ORDER: earning first, then the projects building that are moving or due, then the quiet ones; inside each group
 * what is late first, then what is due soonest, then what was worked on last. The parked ask nothing; one says something
 * only when a thing of it is due.
 *
 * LAST REAL WORK IS A RUN TAGGED TO THE PROJECT OR A CHANGE TO ITS TASKS, never an edit of the project's own row: a tidy
 * that rewrote every project's note moved them all at once and was nobody's work on any of them.
 *
 * PURE, AND NODE LOADS IT.
 */

import { nextSplit } from '../page/next-split.ts';

const DAY = 86_400_000;
/** How many days ahead "due" reaches, and how many back a run or a task change still makes a project moving. */
export const WEEK_DAYS = 7;
/** How far ahead a renewal is said. */
export const RENEW_DAYS = 30;
/** A number with no cadence is quiet past this many days. */
export const QUIET_DAYS = 14;

/** One project as the board reads it. */
export type BoardProject = {
  seq: number;
  /** The row's id and its spoken id (`things#4`): what a task, a run or a key number points at it by. */
  id: string | null;
  spoken: string;
  name: string;
  mark: string;
  hue: number | null;
  lane: string;
  next: string;
  health: string;
  href: string;
  /** What it said it earned in a year, in minor units, where the row says. */
  year: { minor: number; currency: string } | null;
  /** The names its code and folders go by (`repos`, `folders`), which a run's repository or folder is matched to. */
  repos: readonly string[];
};

/** An open task, with the project it points at. */
export type BoardTask = { seq: number; project: string; title: string; by: string | null; href: string };
/** A task written to: made, moved or finished. */
export type BoardMove = { project: string; at: string };
/** An agent's run, as the runs list holds it. */
export type BoardRun = {
  seq: number;
  agent: string;
  /** What it names its project by: the spoken id, the row id or the name, where it was tagged. */
  project: string;
  repo: string;
  remote: string;
  cwd: string;
  at: string;
  state: string;
  closedAs: string;
  handed: boolean;
};
/** A key number a project leads with, as the board draws it. */
export type BoardKpi = {
  project: string;
  name: string;
  figure: string;
  /** The newest value as money in minor units, where it is money. */
  money: { minor: number; currency: string } | null;
  every: string | null;
  latestAt: string | null;
  points: readonly number[];
  move: string | null;
  stale: string | null;
  /** The target it aims for, said ("$300"), and by when ("Sep 2027"), where it keeps one. */
  aim: { said: string; by: string | null } | null;
  /** How many readings it was drawn from. */
  readings: number;
};
/** A question waiting on a person, about a project. */
export type BoardAsk = { project: string; question: string; href: string };
/** A service that renews soon, and the project it is on, where it is on one. */
export type BoardRenewal = { project: string | null; name: string; day: string; href: string };
/** Money that comes in again and again, linked to a project. */
export type BoardRecurring = { project: string; minor: number; currency: string; every: string; state: string; nextDue: string | null };

export type BoardInput = {
  projects: readonly BoardProject[];
  tasks: readonly BoardTask[];
  moves: readonly BoardMove[];
  runs: readonly BoardRun[];
  kpis: readonly BoardKpi[];
  asks: readonly BoardAsk[];
  renewals: readonly BoardRenewal[];
  recurring: readonly BoardRecurring[];
  /** The record's clock, and its day as YYYY-MM-DD. */
  now: number;
  today: string;
  format: (minor: number, currency: string) => string;
  /** The record's home currency, which money is summed in. */
  home: string | null;
  /** Where the late work, the questions and the numbers' setup open. */
  hrefs: { late: string | null; asks: string; feed: string; numbers: string };
};

export type Chip = { tone: 'late' | 'warn' | 'plain'; text: string } | null;
export type NumberCell =
  | { kind: 'kpi'; figure: string; sub: string; stale: boolean; points: readonly number[] }
  | { kind: 'aim'; said: string; sub: string }
  | { kind: 'none'; said: string };
export type WorkCell = { agent: string | null; said: string; sub: string | null; none: boolean };
export type BoardRow = {
  key: string;
  name: string;
  mark: string;
  hue: number | null;
  href: string;
  lane: string;
  next: string;
  chip: Chip;
  number: NumberCell;
  work: WorkCell;
};
export type BoardGroup = { id: 'earning' | 'moving' | 'quiet'; name: string; said: string; rows: BoardRow[] };
export type WeekLine = { day: string | null; project: string; text: string; href: string };
export type WeekTile = { count: number; said: string; lines: WeekLine[]; more: number };
export type EarnLine = { name: string; hue: number | null; minor: number; said: string; status: string; warn: boolean; href: string };
export type Earning = { total: string | null; year: string | null; currency: string | null; lines: EarnLine[]; empty: string | null; also: string | null };
export type Parked = { name: string; mark: string; hue: number | null; href: string; due: string | null };
export type Board = {
  date: string;
  headline: string;
  lede: string | null;
  acts: { late: { said: string; href: string } | null; feed: { said: string; href: string } | null; asks: { said: string; href: string } | null };
  earning: Earning;
  week: { late: WeekTile; due: WeekTile; quiet: WeekTile; renewals: WeekTile };
  groups: BoardGroup[];
  parked: Parked[];
  finished: { count: number; names: string[] };
};

/* ── words ─────────────────────────────────────────────────────────────── */

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
/** A small count in words, as a sentence says it ("three projects"); a large one in figures. */
export const counted = (n: number): string => (n >= 0 && n < WORDS.length ? WORDS[n]! : n.toLocaleString('en-GB'));
const plural = (n: number, one: string, many: string): string => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;
/** "A", "A and B", "A, B and C", or "A, B and 2 more". */
export function names(list: readonly string[], most = 3): string {
  const all = [...new Set(list)];
  if (all.length <= 1) return all[0] ?? '';
  if (all.length <= most) return `${all.slice(0, -1).join(', ')} and ${all.at(-1)}`;
  return `${all.slice(0, most - 1).join(', ')} and ${all.length - (most - 1)} more`;
}
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const noonOf = (day: string): number => Date.parse(`${day.slice(0, 10)}T12:00:00Z`);
/** Whole days from `a` to `b`, both YYYY-MM-DD. */
export const daysBetween = (a: string, b: string): number => Math.round((noonOf(b) - noonOf(a)) / DAY);
/** "Sat 31 Oct". */
export function dayChip(day: string): string {
  const d = new Date(noonOf(day));
  return `${WEEKDAYS[d.getUTCDay()]!.slice(0, 3)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]!.slice(0, 3)}`;
}
/** "Mon 26", the strip's short day. */
const dayShortest = (day: string): string => {
  const d = new Date(noonOf(day));
  return `${WEEKDAYS[d.getUTCDay()]!.slice(0, 3)} ${d.getUTCDate()}`;
};
/** "Tuesday 27 October". */
export const dateLine = (today: string): string => {
  const d = new Date(noonOf(today));
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
/** "30 min ago", "6 h ago", "3 days ago". */
export function ago(at: string, now: number): string {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return '';
  const min = Math.max(0, Math.round((now - t) / 60_000));
  if (min < 2) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}
const lateWords = (days: number): string => (days === 1 ? 'a day late' : `${counted(days)} days late`);

/* ── who points at which project ──────────────────────────────────────── */

const fold = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/gu, '');
const lastPart = (s: string): string =>
  s
    .replace(/\\/gu, '/')
    .replace(/\.git$/u, '')
    .replace(/\/+$/u, '')
    .split('/')
    .pop() ?? '';

/**
 * The project something names, by its spoken id, its row id or its name; `null` where it names none of them.
 */
export function projectOf(said: string, projects: readonly BoardProject[]): BoardProject | null {
  const t = said.trim();
  if (t === '') return null;
  const low = t.toLowerCase();
  return projects.find((p) => p.spoken === t || (p.id !== null && p.id === t) || p.name.toLowerCase() === low) ?? null;
}

/**
 * THE PROJECT A RUN WAS IN: the one it was tagged to, else the one whose code or folder it ran in, matched loosely (the
 * repository's name, the last part of its remote, or of the folder it ran from, against a project's `repos` and its
 * name). A run in a folder no project names is no project's.
 */
export function runProject(run: Pick<BoardRun, 'project' | 'repo' | 'remote' | 'cwd'>, projects: readonly BoardProject[]): BoardProject | null {
  const tagged = projectOf(run.project, projects);
  if (tagged) return tagged;
  const tries = [run.repo, lastPart(run.remote), lastPart(run.cwd)].map(fold).filter((s) => s.length >= 3);
  if (tries.length === 0) return null;
  for (const p of projects) {
    const own = [...p.repos.map((r) => fold(lastPart(r))), fold(p.name)].filter((s) => s.length >= 3);
    if (tries.some((t) => own.includes(t))) return p;
  }
  return null;
}

/** How a run ended, in words: still open, handed off, dropped, done, or ended without a handoff. */
export function endedAs(run: Pick<BoardRun, 'state' | 'closedAs' | 'handed'>): { said: string; open: boolean } {
  if (run.state === 'active' || run.state === 'idle') return { said: 'still open', open: true };
  if (run.state === 'handoff') return { said: 'handed off', open: false };
  if (run.closedAs === 'dropped') return { said: 'dropped', open: false };
  if (run.handed) return { said: 'done, with a handoff', open: false };
  return { said: 'ended without a handoff', open: false };
}

/* ── the board ─────────────────────────────────────────────────────────── */

type Facts = {
  p: BoardProject;
  late: BoardTask[];
  lateDays: number;
  open: number;
  due: { day: string; text: string; href: string }[];
  kpi: BoardKpi | null;
  quiet: boolean;
  quietDays: number;
  asks: BoardAsk[];
  renews: BoardRenewal[];
  runs: BoardRun[];
  lastRun: BoardRun | null;
  lastMove: string | null;
  runsWeek: number;
};

const EVERY_DAYS: Readonly<Record<string, number>> = { '1h': 1, '1d': 1, '1w': 7, '1m': 31 };
/** Whether a key number's newest reading is past twice its cadence (or past `QUIET_DAYS` with none), and how old it is. */
export function quietOf(k: Pick<BoardKpi, 'every' | 'latestAt'>, today: string): { quiet: boolean; days: number } {
  if (!k.latestAt) return { quiet: false, days: 0 };
  const days = daysBetween(k.latestAt.slice(0, 10), today);
  const every = k.every ? (EVERY_DAYS[k.every] ?? null) : null;
  const limit = every === null ? QUIET_DAYS : Math.max(2 * every, every === 31 ? 45 : 2);
  return { quiet: days > limit, days };
}

/** A monthly amount from money that comes every `every`. */
const MONTHLY: Readonly<Record<string, number>> = { day: 30, daily: 30, week: 52 / 12, weekly: 52 / 12, fortnight: 26 / 12, fortnightly: 26 / 12, biweekly: 26 / 12, twice_monthly: 2, month: 1, monthly: 1, quarter: 1 / 3, quarterly: 1 / 3, year: 1 / 12, yearly: 1 / 12, annual: 1 / 12 };
const monthlyOf = (minor: number, every: string): number | null => {
  const k = every.toLowerCase().replace(/^1/u, '').replace(/^every\s+/u, '');
  const f = MONTHLY[k] ?? (k === 'm' ? 1 : k === 'w' ? 52 / 12 : k === 'y' ? 1 / 12 : null);
  return f === null ? null : Math.round(minor * f);
};
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function factsOf(input: BoardInput): Facts[] {
  const { projects, today, now } = input;
  const weekOn = new Date(noonOf(today) + WEEK_DAYS * DAY).toISOString().slice(0, 10);
  const weekBack = now - WEEK_DAYS * DAY;
  const by = <T>(rows: readonly T[], key: (r: T) => string) => {
    const out = new Map<number, T[]>();
    for (const r of rows) {
      const p = projectOf(key(r), projects);
      if (p) out.set(p.seq, [...(out.get(p.seq) ?? []), r]);
    }
    return out;
  };
  const tasks = by(input.tasks, (t) => t.project);
  const moves = by(input.moves, (m) => m.project);
  const asks = by(input.asks, (a) => a.project);
  const renewals = by(input.renewals, (r) => r.project ?? '');
  const kpis = by(input.kpis, (k) => k.project);
  const runs = new Map<number, BoardRun[]>();
  for (const r of input.runs) {
    const p = runProject(r, projects);
    if (p) runs.set(p.seq, [...(runs.get(p.seq) ?? []), r]);
  }
  return projects.map((p) => {
    const mine = tasks.get(p.seq) ?? [];
    const late = mine.filter((t) => t.by !== null && t.by.slice(0, 10) < today).sort((a, b) => a.by!.localeCompare(b.by!));
    const lateDays = late.length > 0 ? daysBetween(late[0]!.by!.slice(0, 10), today) : 0;
    const dueTasks = mine.filter((t) => t.by !== null && t.by.slice(0, 10) >= today && t.by.slice(0, 10) <= weekOn).map((t) => ({ day: t.by!.slice(0, 10), text: t.title, href: t.href }));
    /* A DAY WRITTEN INTO ITS NEXT STEP COUNTS AS DUE TOO, since fifteen projects keep their dated work there alone. */
    const dueSaid = nextSplit(p.next, now)
      .filter((x) => x.day !== null && x.day >= today && x.day <= weekOn)
      .map((x) => ({ day: x.day!, text: x.text, href: p.href }));
    const due = [...dueTasks, ...dueSaid].sort((a, b) => a.day.localeCompare(b.day));
    const ks = kpis.get(p.seq) ?? [];
    const kpi = ks[0] ?? null;
    const q = kpi ? quietOf(kpi, today) : { quiet: false, days: 0 };
    const rs = (runs.get(p.seq) ?? []).slice().sort((a, b) => b.at.localeCompare(a.at));
    const ms = (moves.get(p.seq) ?? []).map((m) => m.at).sort();
    return {
      p,
      late,
      lateDays,
      open: mine.length,
      due,
      kpi,
      quiet: q.quiet,
      quietDays: q.days,
      asks: asks.get(p.seq) ?? [],
      renews: (renewals.get(p.seq) ?? []).filter((r) => daysBetween(today, r.day) <= RENEW_DAYS),
      runs: rs,
      lastRun: rs[0] ?? null,
      lastMove: ms.at(-1) ?? null,
      runsWeek: rs.filter((r) => Date.parse(r.at) >= weekBack).length,
    };
  });
}

const PARKED = 'parked';
const FINISHED = 'retired';
const inPlay = (lane: string): boolean => lane !== PARKED && lane !== FINISHED;

/** The one chip a row wears: what is late, else a day due, else numbers gone quiet, else a renewal, else a question. */
function chipOf(f: Facts, today: string): Chip {
  if (f.late.length > 0) return { tone: 'late', text: f.open > f.late.length ? `${f.late.length} late · ${f.open} open` : lateWords(f.lateDays) };
  if (f.due.length > 0) return { tone: 'plain', text: f.due[0]!.day === today ? 'today' : dayChip(f.due[0]!.day) };
  if (f.quiet) return { tone: 'warn', text: `numbers ${f.quietDays} days old` };
  if (f.renews.length > 0) return { tone: 'warn', text: `renews in ${plural(Math.max(0, daysBetween(today, f.renews[0]!.day)), 'day', 'days')}` };
  if (f.asks.length > 0) return { tone: 'plain', text: plural(f.asks.length, 'question', 'questions') };
  return null;
}

function numberOf(f: Facts): NumberCell {
  const k = f.kpi;
  if (k && k.readings > 0) {
    /* ONE SHORT LINE: how old it is when it went quiet, else how it moved, else what it counts. */
    const sub = f.quiet ? `${f.quietDays} days old` : (k.move ?? (monthOrAge(k) !== '' ? `${k.name}, ${monthOrAge(k)}` : k.name));
    return { kind: 'kpi', figure: k.figure, sub, stale: f.quiet, points: k.points };
  }
  if (k?.aim) return { kind: 'aim', said: 'Not measured yet', sub: `aim ${k.aim.said}${k.aim.by ? ` by ${k.aim.by}` : ''}` };
  return { kind: 'none', said: 'No key number' };
}
const monthOrAge = (k: BoardKpi): string => (k.every === '1m' && k.latestAt ? MONTH_SHORT[Number(k.latestAt.slice(5, 7)) - 1]! : '');

function workOf(f: Facts, now: number): WorkCell {
  const run = f.lastRun;
  const move = f.lastMove;
  const runAt = run ? Date.parse(run.at) : -Infinity;
  const moveAt = move ? Date.parse(move) : -Infinity;
  if (run && runAt >= moveAt) {
    const n = f.runsWeek;
    const ended = endedAs(run);
    const sub = n > 1 ? `${n} sessions this week` : ended.open ? 'still open' : ended.said;
    return { agent: run.agent, said: ago(run.at, now), sub, none: false };
  }
  if (move) return { agent: null, said: `Tasks changed ${ago(move, now)}`, sub: null, none: false };
  return { agent: null, said: 'No session tagged', sub: null, none: true };
}

/** Whether a project building is moving or due: late, due within the week, a run or a task change this week, or asked. */
const moving = (f: Facts, now: number): boolean =>
  f.late.length > 0 || f.due.length > 0 || f.asks.length > 0 || (f.lastRun !== null && Date.parse(f.lastRun.at) >= now - WEEK_DAYS * DAY) || (f.lastMove !== null && Date.parse(f.lastMove) >= now - WEEK_DAYS * DAY);

/** Late first, then due soonest, then worked on last, then by name. */
function ordered(fs: Facts[]): Facts[] {
  const lastAt = (f: Facts) => Math.max(f.lastRun ? Date.parse(f.lastRun.at) : 0, f.lastMove ? Date.parse(f.lastMove) : 0);
  return fs.slice().sort(
    (a, b) =>
      Number(b.late.length > 0) - Number(a.late.length > 0) ||
      b.lateDays - a.lateDays ||
      (a.due[0]?.day ?? '9999').localeCompare(b.due[0]?.day ?? '9999') ||
      lastAt(b) - lastAt(a) ||
      a.p.name.localeCompare(b.p.name),
  );
}

/* ── what they earn a month ───────────────────────────────────────────── */

function earningOf(input: BoardInput, fs: Facts[]): Earning {
  const earning = fs.filter((f) => f.p.lane === 'earning');
  const lines: (EarnLine & { currency: string })[] = [];
  for (const f of earning) {
    const rec = input.recurring.filter((r) => projectOf(r.project, input.projects)?.seq === f.p.seq);
    const live = rec.filter((r) => r.state !== 'ended');
    if (live.length > 0) {
      const currency = live[0]!.currency;
      const minor = live.filter((r) => r.currency === currency).reduce((s, r) => s + (monthlyOf(r.minor, r.every) ?? 0), 0);
      const paused = live.find((r) => r.state === 'paused');
      const next = live.map((r) => r.nextDue).filter((d): d is string => !!d).sort()[0];
      const status = paused ? `paused${paused.nextDue ? `, was due ${dayChip(paused.nextDue).slice(4)}` : ''}` : next ? `next pay ${dayChip(next)}` : 'repeats';
      lines.push({ name: f.p.name, hue: f.p.hue, minor, said: input.format(minor, currency), status, warn: !!paused, href: f.p.href, currency });
      continue;
    }
    const k = f.kpi;
    if (k?.money && (k.every === '1m' || /month/iu.test(k.name))) {
      const when = k.latestAt ? MONTH_SHORT[Number(k.latestAt.slice(5, 7)) - 1]! : '';
      const status = f.quiet ? `${when}, ${f.quietDays} days old` : when;
      lines.push({ name: f.p.name, hue: f.p.hue, minor: k.money.minor, said: input.format(k.money.minor, k.money.currency), status, warn: f.quiet, href: f.p.href, currency: k.money.currency });
      continue;
    }
    if (f.p.year) {
      const minor = Math.round(f.p.year.minor / 12);
      lines.push({ name: f.p.name, hue: f.p.hue, minor, said: input.format(minor, f.p.year.currency), status: 'a twelfth of its year', warn: false, href: f.p.href, currency: f.p.year.currency });
    }
  }
  if (lines.length === 0)
    return {
      total: null,
      year: null,
      currency: null,
      lines: [],
      empty: earning.length === 0 ? 'No project is earning yet.' : 'No money is linked to the earning projects yet. A key number of monthly money, or a repeating payment set to the project, fills this.',
      also: null,
    };
  /* ONE CURRENCY ADDED UP, the home one where any line is in it: two currencies are never summed. */
  const currency = lines.some((l) => l.currency === input.home) && input.home ? input.home : lines[0]!.currency;
  const summed = lines.filter((l) => l.currency === currency).sort((a, b) => b.minor - a.minor);
  const other = lines.filter((l) => l.currency !== currency);
  const total = summed.reduce((s, l) => s + l.minor, 0);
  const unlinked = earning.length - lines.length;
  return {
    total: input.format(total, currency),
    year: `about ${input.format(Math.round((total * 12) / 100_000) * 100_000, currency)} a year`,
    currency,
    lines: [...summed, ...other].map(({ currency: _c, ...l }) => l),
    empty: null,
    also: [other.length > 0 ? `${names(other.map((l) => l.name))} in another currency, not added` : '', unlinked > 0 ? `${plural(unlinked, 'project', 'projects')} with no money linked` : '']
      .filter(Boolean)
      .join(' · ') || null,
  };
}

/* ── the headline ──────────────────────────────────────────────────────── */

function headlineOf(fs: Facts[], renewals: readonly BoardRenewal[], input: BoardInput): { headline: string; lede: string | null } {
  const live = fs.filter((f) => inPlay(f.p.lane));
  const late = ordered(live.filter((f) => f.late.length > 0));
  const quiet = live.filter((f) => f.quiet);
  const due = live.filter((f) => f.late.length === 0 && f.due.length > 0).sort((a, b) => a.due[0]!.day.localeCompare(b.due[0]!.day));
  const asks = live.filter((f) => f.asks.length > 0);
  const soon = renewals.filter((r) => daysBetween(input.today, r.day) <= RENEW_DAYS).sort((a, b) => a.day.localeCompare(b.day));
  const clauses: string[] = [];
  if (late.length > 0) {
    const days = late.map((f) => f.lateDays);
    const same = days.every((d) => d === days[0]);
    const verb = late.length === 1 ? 'is' : 'are';
    clauses.push(late.length > 3 ? `${counted(late.length)} projects are late, ${names(late.map((f) => f.p.name))} among them` : `${names(late.map((f) => f.p.name))} ${verb} ${same ? lateWords(days[0]!) : 'late'}`);
  }
  if (quiet.length > 0) clauses.push(quiet.length === 1 ? `${quiet[0]!.p.name} stopped sending numbers` : `${counted(quiet.length)} projects stopped sending numbers`);
  if (due.length > 0 && clauses.length < 2) {
    const first = due[0]!.due[0]!;
    clauses.push(due.length === 1 ? `${due[0]!.p.name} has work due ${first.day === input.today ? 'today' : dayChip(first.day)}` : `${counted(due.length)} projects have work due this week`);
  }
  if (asks.length > 0 && clauses.length < 2) {
    const n = asks.reduce((s, f) => s + f.asks.length, 0);
    clauses.push(`${plural(n, 'question waits', 'questions wait')} on ${names(asks.map((f) => f.p.name))}`);
  }
  if (soon.length > 0 && clauses.length < 2) {
    const r = soon[0]!;
    const d = daysBetween(input.today, r.day);
    clauses.push(`${r.name} renews ${d <= 0 ? 'today' : `in ${plural(d, 'day', 'days')}`}`);
  }
  if (clauses.length === 0) {
    const n = live.length;
    return { headline: n === 0 ? 'Nothing is in play.' : 'Nothing is late, due this week or gone quiet.', lede: null };
  }
  const headline = `${cap(clauses.length === 1 ? clauses[0]! : `${clauses[0]}, and ${clauses[1]}`)}.`;
  /* THE LEDE SAYS WHAT THE HEADLINE COUNTED: the late work by name, and how long the numbers have been quiet. */
  const lede: string[] = [];
  for (const f of late.slice(0, 2)) {
    const t = f.late[0]!;
    lede.push(`${f.p.name}: “${t.title}” was due ${dayChip(t.by!.slice(0, 10))}${f.late.length > 1 ? `, and ${plural(f.late.length - 1, 'more is', 'more are')} late` : ''}.`);
  }
  if (quiet.length > 0) {
    const longest = Math.max(...quiet.map((f) => f.quietDays));
    lede.push(`${names(quiet.map((f) => f.p.name))} ${quiet.length === 1 ? 'has' : 'have'} sent no numbers for ${plural(longest, 'day', 'days')}.`);
  }
  if (due.length > 0 && !clauses.some((c) => c.includes('due'))) lede.push(`Due this week: ${names(due.map((f) => f.p.name))}.`);
  return { headline, lede: lede.length > 0 ? lede.join(' ') : null };
}

/** The board, from what was read. */
export function boardOf(input: BoardInput): Board {
  const fs = factsOf(input);
  const live = fs.filter((f) => inPlay(f.p.lane));
  const parked = fs.filter((f) => f.p.lane === PARKED);
  const finished = fs.filter((f) => f.p.lane === FINISHED);
  const { headline, lede } = headlineOf(fs, input.renewals, input);

  const rowOf = (f: Facts): BoardRow => ({
    key: f.p.spoken,
    name: f.p.name,
    mark: f.p.mark,
    hue: f.p.hue,
    href: f.p.href,
    lane: f.p.lane,
    next: f.p.next,
    chip: chipOf(f, input.today),
    number: numberOf(f),
    work: workOf(f, input.now),
  });
  const earningFs = ordered(live.filter((f) => f.p.lane === 'earning'));
  const building = live.filter((f) => f.p.lane !== 'earning');
  const movingFs = ordered(building.filter((f) => moving(f, input.now)));
  const quietFs = building
    .filter((f) => !moving(f, input.now))
    .sort((a, b) => Number(chipOf(b, input.today) !== null) - Number(chipOf(a, input.today) !== null) || a.p.name.localeCompare(b.p.name));
  const earning = earningOf(input, fs);
  const groups: BoardGroup[] = [
    { id: 'earning' as const, name: 'Earning', said: `${earningFs.length}${earning.total ? ` · about ${earning.total} a month` : ''}`, rows: earningFs.map(rowOf) },
    { id: 'moving' as const, name: 'Building, moving or due', said: `${movingFs.length} of ${building.length}`, rows: movingFs.map(rowOf) },
    { id: 'quiet' as const, name: 'Building, quiet', said: `${quietFs.length} · no session, change or date in ${WEEK_DAYS} days`, rows: quietFs.map(rowOf) },
  ].filter((g) => g.rows.length > 0);

  /* ── this week ── */
  const lateLines = ordered(live.filter((f) => f.late.length > 0)).flatMap((f) => f.late.map((t) => ({ day: dayShortest(t.by!.slice(0, 10)), project: f.p.name, text: t.title, href: t.href })));
  const lateDays = live.filter((f) => f.late.length > 0).map((f) => f.lateDays);
  const dueLines = live
    .flatMap((f) => f.due.map((d) => ({ at: d.day, day: dayShortest(d.day), project: f.p.name, text: d.text, href: d.href })))
    .sort((a, b) => a.at.localeCompare(b.at))
    .map(({ at: _a, ...l }) => l);
  const dueProjects = new Set(dueLines.map((l) => l.project)).size;
  const quietFsAll = live.filter((f) => f.quiet);
  const quietSince = quietFsAll.map((f) => f.kpi?.latestAt?.slice(0, 10) ?? '').filter(Boolean).sort().at(-1);
  const renewLines = input.renewals
    .filter((r) => daysBetween(input.today, r.day) <= 60)
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((r) => {
      const p = r.project ? projectOf(r.project, input.projects) : null;
      return { day: `${Number(r.day.slice(8, 10))} ${MONTH_SHORT[Number(r.day.slice(5, 7)) - 1]}`, project: r.name, text: p ? `${p.lane === PARKED ? 'parked ' : ''}${p.name}, in ${plural(daysBetween(input.today, r.day), 'day', 'days')}` : `in ${plural(daysBetween(input.today, r.day), 'day', 'days')}`, href: r.href };
    });

  const lateCount = lateLines.length;
  const lateTile: WeekTile = {
    count: lateCount,
    said: lateCount === 0 ? 'nothing late' : `${lateCount === 1 ? 'task' : 'tasks'}, ${lateDays.length > 0 && Math.max(...lateDays) === Math.min(...lateDays) ? `${plural(lateDays[0]!, 'day', 'days')} over` : `up to ${plural(Math.max(...lateDays), 'day', 'days')} over`}`,
    lines: lateLines.slice(0, 4),
    more: Math.max(0, lateLines.length - 4),
  };
  const asksAll = live.flatMap((f) => f.asks);

  return {
    date: `${dateLine(input.today)} · ${live.length} in play · ${parked.length} parked · ${finished.length} finished`,
    headline,
    lede,
    acts: {
      late: lateCount > 0 && input.hrefs.late ? { said: lateCount === 1 ? 'Open the late task' : `Open the ${lateCount} late tasks`, href: lateCount === 1 ? lateLines[0]!.href : input.hrefs.late } : null,
      feed: quietFsAll.length > 0 ? { said: 'Fix the numbers feed', href: input.hrefs.feed } : null,
      asks: asksAll.length > 0 ? { said: asksAll.length === 1 ? `1 question waits: ${asksAll[0]!.question}` : `${asksAll.length} questions wait on projects`, href: asksAll.length === 1 ? asksAll[0]!.href : input.hrefs.asks } : null,
    },
    earning,
    week: {
      late: lateTile,
      due: { count: dueLines.length, said: dueLines.length === 0 ? 'nothing due' : `across ${plural(dueProjects, 'project', 'projects')}`, lines: dueLines.slice(0, 4), more: Math.max(0, dueLines.length - 4) },
      quiet: {
        count: quietFsAll.length,
        said: quietFsAll.length === 0 ? 'all reporting' : quietSince ? `since ${Number(quietSince.slice(8, 10))} ${MONTH_SHORT[Number(quietSince.slice(5, 7)) - 1]}` : '',
        lines: quietFsAll.slice(0, 4).map((f) => ({ day: null, project: f.p.name, text: `${f.kpi!.readings > 1 ? `${f.kpi!.readings.toLocaleString('en-GB')} readings, then none` : `${f.kpi!.name.toLowerCase()}, typed once`}`, href: f.p.href })),
        more: Math.max(0, quietFsAll.length - 4),
      },
      renewals: { count: renewLines.length, said: renewLines.length === 0 ? 'none in 60 days' : 'in 60 days', lines: renewLines.slice(0, 4), more: Math.max(0, renewLines.length - 4) },
    },
    groups,
    parked: parked
      .map((f) => {
        const r = f.renews[0];
        const t = f.due[0] ?? null;
        const due = r ? `${r.name} renews ${dayChip(r.day).slice(4)}` : f.late.length > 0 ? lateWords(f.lateDays) : t ? `due ${dayChip(t.day)}` : f.asks.length > 0 ? plural(f.asks.length, 'question', 'questions') : null;
        return { name: f.p.name, mark: f.p.mark, hue: f.p.hue, href: f.p.href, due };
      })
      .sort((a, b) => Number(b.due !== null) - Number(a.due !== null) || a.name.localeCompare(b.name)),
    finished: { count: finished.length, names: finished.map((f) => f.p.name).sort() },
  };
}

/**
 * A SMALL LINE OF A NUMBER'S READINGS in a box `w` by `h`, oldest left: its path, the area under it and its last point.
 * `null` under three readings, since a line of two says nothing a figure does not.
 */
export function sparkOf(points: readonly number[], w: number, h: number): { line: string; area: string; end: [number, number] } | null {
  const vs = points.filter((v) => Number.isFinite(v));
  if (vs.length < 3) return null;
  const lo = Math.min(...vs);
  const hi = Math.max(...vs);
  const span = hi - lo || 1;
  const pad = 2;
  const pts = vs.map((v, i) => [pad + (i / (vs.length - 1)) * (w - 2 * pad), pad + (1 - (v - lo) / span) * (h - 2 * pad)] as [number, number]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  return { line, area: `${line} L${pts.at(-1)![0].toFixed(1)} ${h} L${pts[0]![0].toFixed(1)} ${h} Z`, end: pts.at(-1)! };
}
