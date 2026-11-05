/**
 * WHAT A PROJECT'S PAGE SAYS, WORKED OUT FROM ITS SHAPE (`shape-answer.ts` reads it, `shape-hold.svelte.ts` holds it,
 * `ProjectPart.svelte` draws it): the hero's headline, which is a fact and never the next step again; the next step once,
 * as a checklist with its days as chips; the tile beside the hero by lane (money while it earns, the dated path while it
 * is built, what it costs to keep while parked); its numbers with their lines, how they moved and how old they are; its
 * dates; what it runs on and when each renews; the agents' sessions and how each ended; and what happened, in words,
 * with the edits to its own row folded into one line.
 *
 * PURE, AND NODE LOADS IT.
 */

import { article } from '../copy/english.ts';
import { nextSplit } from './next-split.ts';
import { cadenceOf, feedAgeOf } from './feed-age.ts';
import { isForecast } from '../home/card-kpi.ts';
import { ago, dayChip, daysBetween, endedAs, trailOf } from '../home/projects-board.ts';
import { laneInLine } from '../shell/side.ts';
import { AGENT_NAMES } from '../record/names.ts';

/* ── what is read ──────────────────────────────────────────────────────── */

export type Money = { minor: number; currency: string };
export type FactTask = { seq: number; title: string; state: string; by: string | null; doneOn: string | null; agent: string; done: boolean; waits: boolean; href: string; updated: string | null; created: string | null };
export type FactRun = { seq: number; agent: string; doing: string; at: string; started: string; state: string; closedAs: string; next: string; notes: readonly string[]; wrote: number | null; repo: string };
export type FactService = { seq: number; name: string; provider: string; kind: string; renews: string | null; cost: Money | null; cycle: string; state: string; note: string; href: string };
export type FactReading = { name: string; value: number | null; amount: Money | null; unit: string; at: string; source: string };
export type FactRecurring = { what: string; direction: string; amount: Money; every: string; nextDue: string | null; state: string; href?: string };
/** A key number's reading as the record answers it: a value, or an amount as "USD 4,815.00". */
export type KpiAt = { at: string; value?: number | null | undefined; amount?: string | null | undefined };
export type FactKpi = {
  name: string;
  measure: string;
  unit: string;
  every: string | null;
  headline: boolean;
  points: readonly KpiAt[];
  latest: KpiAt | null;
  change: number | null;
  target: number | string | null;
  targetBy: string | null;
  /**
   * WHAT TODAY SAYS FOR IT, where the renderer planned it (`kpiView`): a flow's figure is its last whole period, and its
   * change is on the one before, so the page says that figure and that period beside the change. Without it the page
   * said its newest reading beside the change of the period before ("32 … up 33%" while Today said "28 hours, Up 33%",
   * audit 2, B2).
   */
  shown?: { figure: string; when: string } | undefined;
};
export type FactDecided = { question: string; answer: string; at: string };
export type FactHistory = { note: string; by: string; at: string };

export type FactsIn = {
  name: string;
  lane: string;
  /** The lane in its list's own words, as the hero says it (Personal's `parked` is "On hold"). */
  laneWord?: string | undefined;
  next: string;
  about: string;
  since: string | null;
  domains: readonly string[];
  tasks: readonly FactTask[];
  runs: readonly FactRun[];
  services: readonly FactService[];
  readings: readonly FactReading[];
  recurring: readonly FactRecurring[];
  kpis: readonly FactKpi[];
  decided: readonly FactDecided[];
  history: readonly FactHistory[];
  money: { out: Money | null; owed: Money | null };
  now: number;
  today: string;
  format: (minor: number, currency: string) => string;
  /** Where the feed of numbers is set up, and where all its work opens. */
  hrefs: { feed: string; work: string | null };
  /** What one of its work and many of it are called mid-sentence, from the work list's own declaration ("job", "jobs"). */
  called: { one: string; many: string };
};

/* ── small words ───────────────────────────────────────────────────────── */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = MONTHS.map((m) => m.slice(0, 3));
const day10 = (s: string | null | undefined): string | null => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/u.test(s) ? s.slice(0, 10) : null);
/** "28 Sep", with its year when it is not this one. */
export const daySaid = (day: string, today: string): string => `${Number(day.slice(8, 10))} ${SHORT[Number(day.slice(5, 7)) - 1]}${day.slice(0, 4) === today.slice(0, 4) ? '' : ` ${day.slice(0, 4)}`}`;
const plural = (n: number, one: string, many: string): string => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;
const upper = (s: string): string => `${s.slice(0, 1).toUpperCase()}${s.slice(1)}`;
const lateSaid = (days: number): string => (days === 1 ? 'a day late' : `${days} days late`);
const quoted = (t: string): string => `“${t.length > 60 ? `${t.slice(0, 57).trimEnd()}…` : t}”`;
const fold = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/gu, ' ').trim();

/** A measure's name without the project's on its own page: "Players a day, Lantern" is "Players a day". */
export function stripName(label: string, project: string): string {
  const p = project.trim();
  if (p === '') return label;
  const esc = p.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const out = label.replace(new RegExp(`\\s*[,(–-]\\s*${esc}\\)?\\s*$`, 'iu'), '').replace(new RegExp(`^${esc}\\s*[:·–-]\\s*`, 'iu'), '').trim();
  return out === '' ? label : out;
}

/** An amount as a point holds it (`USD 8,750.00`), in minor units. */
export function amountOf(said: string | null | undefined): Money | null {
  const m = /^([A-Z]{3})\s+(-?[\d,]+(?:\.\d+)?)$/u.exec(typeof said === 'string' ? said.trim() : '');
  if (!m) return null;
  const n = Number(m[2]!.replace(/,/gu, ''));
  return Number.isFinite(n) ? { minor: Math.round(n * 100), currency: m[1]! } : null;
}

/* ── the next step, once, as a checklist ──────────────────────────────── */

export type CheckItem = { text: string; chip: string | null; late: boolean; href: string | null };

/**
 * THE NEXT STEP AS ITS JOBS (`next-split.ts`), each with its day as a chip, late past today. A job that is the title of an
 * open task opens it.
 */
export function checklistOf(next: string, tasks: readonly FactTask[], now: number, today: string): CheckItem[] {
  return nextSplit(next, now).map((x) => {
    const task = tasks.find((t) => !t.done && fold(t.title) === fold(x.text));
    const day = x.day ?? task?.by ?? null;
    const late = day !== null && day < today;
    return { text: x.text, chip: day === null ? null : late ? `due ${daySaid(day, today)}` : dayChip(day), late, href: task?.href ?? null };
  });
}

/* ── its numbers ───────────────────────────────────────────────────────── */

export type NumberCell = { label: string; figure: string; sub: string; points: readonly number[]; age: number; stale: boolean; trail: ReturnType<typeof trailOf> };
export type Numbers = {
  cells: NumberCell[];
  measures: number;
  readings: number;
  /** "Daily, last 28 Sep". */
  cadence: string;
  /** The feed stopped: how long, and what it was. */
  banner: { said: string; why: string } | null;
  more: number;
  /** The newest reading's day, and how old it is. */
  newest: string | null;
  age: number;
  /** What it plans for, said apart from what it measured: "Plan for a year out: bear 80 · base 300 · bull 950". */
  plan: string | null;
};

const SCENARIO_ORDER = ['bear', 'base', 'bull'];
/**
 * A PLAN IS SAID AS A PLAN (Q33 of 29 October): "Monthly revenue a year out: base", ": bear" and ": bull" stood beside the
 * measured revenue as three cut-off labels, each "one reading", so a forecast read as revenue. One line: what it plans
 * for, then each case with its figure, bear to bull.
 */
function planOf(plans: readonly Measure[], format: FactsIn['format']): string | null {
  if (plans.length === 0) return null;
  const parts = plans.map((m) => {
    const last = m.points.at(-1)!;
    const figure = figureOf(last.v, last.money, m.unit, format);
    const hit = /^(.*?)\s*:\s*(bear|base|bull)\b/iu.exec(m.label);
    return { head: hit ? hit[1]!.trim() : m.label, word: hit ? hit[2]!.toLowerCase() : '', figure };
  });
  const head = parts[0]!.head;
  if (parts.every((p) => p.word !== '' && p.head === head)) {
    const said = parts
      .slice()
      .sort((a, b) => SCENARIO_ORDER.indexOf(a.word) - SCENARIO_ORDER.indexOf(b.word))
      .map((p) => `${p.word} ${p.figure}`)
      .join(' · ');
    const out = head.replace(/^monthly revenue\s+/iu, '').trim();
    return `Plan${out ? ` for ${out.charAt(0).toLowerCase()}${out.slice(1)}` : ''}: ${said}`;
  }
  return `Plan: ${parts.map((p) => `${p.word ? `${p.head}, ${p.word}` : p.head} ${p.figure}`).join(' · ')}`;
}

const EVERY_DAYS: Readonly<Record<string, number>> = { '1h': 1, '1d': 1, '1w': 7, '1m': 31 };
const EVERY_WORD: Readonly<Record<number, string>> = { 1: 'Daily', 7: 'Weekly', 31: 'Monthly' };

type Measure = { label: string; points: { at: string; v: number; money: Money | null }[]; every: number; kpi: FactKpi | null; unit: string };

const figureOf = (v: number, money: Money | null, unit: string, format: FactsIn['format']): string =>
  money ? format(money.minor, money.currency) : `${Number.isInteger(v) ? v.toLocaleString('en-GB') : v.toLocaleString('en-GB', { maximumFractionDigits: 1 })}${unit === '%' ? '%' : ''}`;

/** How a measure moved over its last month of readings, in words: "up 1,445 since 20 Aug". */
function movedOf(m: Measure, format: FactsIn['format'], today: string): string {
  if (m.kpi?.change !== null && m.kpi?.change !== undefined && Number.isFinite(m.kpi.change)) {
    /* ROUNDED AS ITS TILE ON TODAY ROUNDS IT (`changeOf` in the renderer): a whole percent from ten, one place under. */
    const raw = Math.abs(m.kpi.change) * 100;
    const pct = raw >= 10 ? Math.round(raw) : Math.round(raw * 10) / 10;
    return pct === 0 ? 'no change' : `${m.kpi.change > 0 ? 'up' : 'down'} ${pct}%`;
  }
  const last = m.points.at(-1);
  if (!last || m.points.length < 2) return m.points.length === 1 ? 'one reading' : '';
  const from = m.points.find((p) => daysBetween(p.at.slice(0, 10), last.at.slice(0, 10)) <= 31) ?? m.points[0]!;
  const d = last.v - from.v;
  if (from === last || d === 0) return 'flat';
  const by = last.money && from.money ? format(Math.abs(last.money.minor - from.money.minor), last.money.currency) : Math.abs(d).toLocaleString('en-GB', { maximumFractionDigits: 1 });
  return `${d > 0 ? 'up' : 'down'} ${by} since ${daySaid(from.at.slice(0, 10), today)}`;
}

/**
 * ITS NUMBERS, FOUR AT MOST: its key numbers first, in its own order, then the measures its readings hold, the most read
 * first. Each says its newest value, how it moved, its line from its readings, and how old it is, stale past twice how
 * often it arrives. When every one is stale the feed has stopped, and a banner says so once.
 */
export function numbersOf(f: Pick<FactsIn, 'name' | 'readings' | 'today' | 'format'> & { kpis: readonly FactKpi[] }, most = 4): Numbers {
  const measures: Measure[] = [];
  const seen = new Set<string>();
  for (const k of f.kpis) {
    const pts = k.points.flatMap((p) => {
      const money = amountOf(p.amount);
      const v = typeof p.value === 'number' ? p.value : money ? money.minor / 100 : Number.NaN;
      return Number.isFinite(v) ? [{ at: p.at, v, money }] : [];
    });
    if (pts.length === 0) continue;
    measures.push({ label: stripName(k.name, f.name), points: pts, every: k.every ? (EVERY_DAYS[k.every] ?? cadenceOf(pts.map((p) => p.at))) : cadenceOf(pts.map((p) => p.at)), kpi: k, unit: k.unit });
    seen.add(fold(stripName(k.measure || k.name, f.name)));
    seen.add(fold(stripName(k.name, f.name)));
  }
  const byName = new Map<string, FactReading[]>();
  for (const r of f.readings) {
    const key = stripName(r.name, f.name);
    if (seen.has(fold(key))) continue;
    byName.set(key, [...(byName.get(key) ?? []), r]);
  }
  const fromReadings = [...byName.entries()]
    .map(([label, rs]): Measure => {
      const pts = rs
        .flatMap((r) => {
          const v = r.value ?? (r.amount ? r.amount.minor / 100 : Number.NaN);
          return Number.isFinite(v) ? [{ at: r.at, v, money: r.amount }] : [];
        })
        .sort((a, b) => a.at.localeCompare(b.at));
      return { label, points: pts, every: cadenceOf(pts.map((p) => p.at)), kpi: null, unit: rs[0]?.unit ?? '' };
    })
    .filter((m) => m.points.length > 0)
    .sort((a, b) => b.points.length - a.points.length || (b.points.at(-1)!.at ?? '').localeCompare(a.points.at(-1)!.at ?? ''));
  const every0 = [...measures, ...fromReadings];
  const all = every0.filter((m) => !isForecast(m.label) && !(m.kpi && isForecast(m.kpi.name)));
  const plan = planOf(
    every0.filter((m) => !all.includes(m)),
    f.format,
  );
  /* A NUMBER THAT HAS ONLY EVER SAID NOUGHT DRAWS NO CELL (leftovers9, the owner 2 Nov: "remove any $0 cards"): "Monthly
     revenue $0, flat" on a project that has earned nothing yet. It still counts as a number the feed sent, so the feed's
     age and Runs on read it as before; the kernel leaves such a measure and key number off the record's own tiles too. */
  const said = all.filter((m) => m.points.some((p) => p.v !== 0));
  const cells = said.slice(0, most).map((m): NumberCell => {
    const last = m.points.at(-1)!;
    const age = Math.max(0, daysBetween(last.at.slice(0, 10), f.today));
    const stale = age > Math.max(2 * m.every, 2);
    const pts = m.points.slice(-45).map((p) => p.v);
    const shown = m.kpi?.shown;
    const moved = movedOf(m, f.format, f.today);
    return {
      label: m.label,
      figure: shown ? shown.figure : figureOf(last.v, last.money, m.unit, f.format),
      /* THE PERIOD THE FIGURE IS OF, where it is a period's ("in the week of 24 Aug"), so the newest reading on Numbers is
         not read as this one. */
      sub: shown && shown.when !== '' ? (moved === '' ? shown.when : `${moved}, ${shown.when}`) : moved,
      points: pts,
      age,
      stale,
      trail: trailOf(pts, 120, 32),
    };
  });
  /* THE FEED'S AGE AND WHETHER IT STOPPED ARE THE ONE RULE THE PROJECTS BOARD READS TOO (`feed-age.ts`), over every
     measure and not only the cells drawn. */
  const feed = feedAgeOf(
    all.map((m) => ({ newest: m.points.at(-1)!.at, every: m.every })),
    f.today,
  );
  const newest = feed.newest;
  const age = feed.age;
  const every = all.length > 0 ? Math.min(...all.map((m) => m.every)) : 31;
  const allStale = feed.quiet;
  const fromImport = f.readings.length > 0 && f.readings.every((r) => /import/iu.test(r.source));
  return {
    cells,
    measures: all.length,
    readings: all.reduce((n, m) => n + m.points.length, 0),
    cadence: newest ? `${EVERY_WORD[every] ?? `Every ${every} days`}, last ${daySaid(newest, f.today)}` : '',
    banner: allStale
      ? { said: `Nothing has arrived for ${plural(age, 'day', 'days')}.`, why: fromImport ? `Every reading came from an import, and that stopped on ${daySaid(newest!, f.today)}.` : `The last came on ${daySaid(newest!, f.today)}.` }
      : null,
    more: Math.max(0, said.length - most),
    newest,
    age,
    plan,
  };
}

/* ── the hero ──────────────────────────────────────────────────────────── */

export type Act = { said: string; href: string } | null;
export type HeroFacts = { headline: string; lede: string | null; red: Act; soft: Act };

const lateOf = (tasks: readonly FactTask[], today: string): FactTask[] => tasks.filter((t) => !t.done && t.by !== null && t.by < today).sort((a, b) => a.by!.localeCompare(b.by!));
/** The day a task falls due as the hero says it: today and tomorrow in words, as the task's own page says them, else "Sat 7 Nov". */
const dueDay = (by: string, today: string): string => {
  const n = daysBetween(today, by);
  return n === 0 ? 'today' : n === 1 ? 'tomorrow' : dayChip(by);
};
const dueOf = (tasks: readonly FactTask[], today: string, days = 7): FactTask[] =>
  tasks.filter((t) => !t.done && t.by !== null && t.by >= today && daysBetween(today, t.by) <= days).sort((a, b) => a.by!.localeCompare(b.by!));

/** The money key number an earning project leads with, where it keeps one: its newest month and the one before. */
export function moneyKpiOf(kpis: readonly FactKpi[]): { kpi: FactKpi; now: Money; at: string; before: Money | null; points: number[] } | null {
  const k = kpis.find((x) => x.headline && /^[A-Z]{3}$/u.test(x.unit)) ?? kpis.find((x) => /^[A-Z]{3}$/u.test(x.unit));
  if (!k || !k.latest) return null;
  const now = amountOf(k.latest.amount) ?? (typeof k.latest.value === 'number' ? { minor: Math.round(k.latest.value * 100), currency: k.unit } : null);
  if (!now) return null;
  const pts = k.points.map((p) => amountOf(p.amount)?.minor ?? (typeof p.value === 'number' ? Math.round(p.value * 100) : Number.NaN)).filter((n) => Number.isFinite(n));
  const prev = k.points.length > 1 ? k.points[k.points.length - 2]! : null;
  const before = prev ? (amountOf(prev.amount) ?? (typeof prev.value === 'number' ? { minor: Math.round(prev.value * 100), currency: k.unit } : null)) : null;
  return { kpi: k, now, at: k.latest.at.slice(0, 10), before, points: pts };
}

/**
 * THE HERO'S HEADLINE, A FACT THE RECORD HOLDS, and never the next step (which the checklist under it says once): what
 * is late, else what it brought in while it earns, else its numbers gone quiet, else how long it has been parked, else
 * what falls due this week, else who worked on it last, else what it is. The lede says the next fact or two. The red
 * button is the most urgent thing to open; the soft one the next.
 */
export function heroFactsOf(f: FactsIn, numbers: Numbers): HeroFacts {
  const facts: string[] = [];
  const late = lateOf(f.tasks, f.today);
  const due = dueOf(f.tasks, f.today);
  const open = f.tasks.filter((t) => !t.done);
  if (late.length === 1) facts.push(`${quoted(late[0]!.title)} was due ${dayChip(late[0]!.by!)} and is ${lateSaid(daysBetween(late[0]!.by!, f.today))}.`);
  else if (late.length > 1) facts.push(`${late.length} tasks on ${f.name} are late, ${quoted(late[0]!.title)} by ${plural(daysBetween(late[0]!.by!, f.today), 'day', 'days')}.`);
  const money = f.lane === 'earning' ? moneyKpiOf(f.kpis) : null;
  if (money) {
    const month = MONTHS[Number(money.at.slice(5, 7)) - 1];
    const prevMonth = MONTHS[(Number(money.at.slice(5, 7)) + 10) % 12];
    let moved = '';
    if (money.before && money.before.currency === money.now.currency && money.before.minor > 0) {
      const pct = Math.round(((money.now.minor - money.before.minor) / money.before.minor) * 100);
      moved = pct === 0 ? `, the same as ${prevMonth}` : `, ${Math.abs(pct)}% ${pct > 0 ? 'more' : 'less'} than ${prevMonth}`;
    }
    facts.push(`${f.name} brought in ${f.format(money.now.minor, money.now.currency)} in ${month}${moved}.`);
  }
  if (numbers.banner && numbers.newest) facts.push(`No numbers have come from ${f.name} since ${daySaid(numbers.newest, f.today)}.`);
  if (f.lane === 'parked' && f.since) facts.push(`${f.name} has been ${laneInLine(f.laneWord ?? 'parked')} since ${f.since}.`);
  if (due.length > 0) facts.push(due.length === 1 ? `${quoted(due[0]!.title)} is due ${dueDay(due[0]!.by!, f.today)}.` : `${due.length} tasks fall due this week, the first ${dueDay(due[0]!.by!, f.today)}.`);
  const run = f.runs[0];
  if (run) facts.push(`${runSaid(run, f.now)}.`);
  if (f.about !== '' && fold(f.about) !== fold(f.next)) facts.push(/[.!?]$/u.test(f.about) ? f.about : `${f.about}.`);
  const kept = facts.filter((s) => fold(s) !== fold(f.next));
  /* A PROJECT WITH NO WORK YET SAYS SO (empty states, 2 Nov): a new project's hero read "Nothing on Launch site has a date
     yet." in its largest words, of tasks it did not have, and offered no way to add one. */
  const headline =
    kept[0] ??
    (open.length > 0
      ? `${plural(open.length, 'task is', 'tasks are')} open on ${f.name}.`
      : f.tasks.length === 0
        ? `No ${f.called.many} on ${f.name} yet.`
        : `Nothing on ${f.name} has a date yet.`);
  const lede = kept.slice(1, 3).join(' ') || null;

  const red: Act =
    late.length === 1
      ? { said: 'Open the late task', href: late[0]!.href }
      : late.length > 1 && f.hrefs.work
        ? { said: `Open the ${late.length} late tasks`, href: f.hrefs.work }
        : due.length > 0
          ? { said: 'Open the next task', href: due[0]!.href }
          : null;
  /* FIX THE NUMBERS FEED IS NEVER THE RED BUTTON (Q32 of 29 October): red here and grey on Projects, one act in two
     weights. It is the quiet one on both, and red is kept for late work. */
  const soft: Act =
    numbers.banner
      ? { said: 'Fix the numbers feed', href: f.hrefs.feed }
      : open.length > 1 && f.hrefs.work && red?.href !== f.hrefs.work
        ? { said: `Open all ${open.length} tasks`, href: f.hrefs.work }
        : f.tasks.length === 0 && f.hrefs.work
          ? { said: `Add a ${f.called.one}`, href: f.hrefs.work }
          : null;
  return { headline, lede, red, soft };
}

/** A run open and heard from inside this long is working: the kernel's `WORKING_MS` (`presenceOf`). */
const WORKING_MS = 15 * 60_000;

/**
 * A RUN IN ONE SENTENCE, FROM WHEN IT WAS LAST HEARD (31 October, AG14): "Claude is working on it now", "Claude went
 * quiet 2 h ago", or how it ended. The lead said "Claude worked on it 2 h ago, and the session is still open" of the
 * run its own page called "Gone quiet", and the Tasks tile "Claude, queued"; each part says this now.
 */
export function runSaid(run: Pick<FactRun, 'agent' | 'at' | 'state' | 'closedAs' | 'next' | 'notes'>, now: number): string {
  const who = agentName(run.agent);
  const ended = endedAs({ state: run.state, closedAs: run.closedAs, handed: run.next !== '' || run.notes.length > 0 });
  if (ended.open) {
    const heard = Date.parse(run.at);
    if (run.state === 'active' && Number.isFinite(heard) && now - heard <= WORKING_MS) return `${who} is working on it now`;
    return `${who} went quiet ${ago(run.at, now)}`;
  }
  return `${who} worked on it ${ago(run.at, now)}, and the session ${ended.said}`;
}

const agentName = (agent: string): string => {
  const a = agent.trim().toLowerCase();
  /* EVERY AGENT THE PRODUCT KNOWS, IN ITS OWN SPELLING (`AGENT_NAMES`): this list had no ChatGPT, and said "Chatgpt". */
  if (a === 'other') return 'An agent';
  if (Object.hasOwn(AGENT_NAMES, a)) return AGENT_NAMES[a]!;
  return agent.trim() === '' ? 'An agent' : agent.charAt(0).toUpperCase() + agent.slice(1);
};

/* ── the tile beside the hero, by lane ─────────────────────────────────── */

export type Stop = { day: string; title: string; sub: string | null; tone: 'late' | 'doing' | 'you' | 'done' | 'plain'; href: string };
export type SideTile =
  | { kind: 'money'; figure: string; sub: string; stale: string | null; bars: number[]; lines: { k: string; v: string }[] }
  | { kind: 'path'; end: string | null; stops: Stop[]; aim: string | null; empty: string | null }
  | { kind: 'keep'; about: string; lines: { k: string; v: string; href: string }[]; year: string | null; domain: FactService | null }
  | { kind: 'none' };

const PER_YEAR: Readonly<Record<string, number>> = { monthly: 12, month: 12, yearly: 1, year: 1, annual: 1, annually: 1, weekly: 52, quarterly: 4, fortnightly: 26 };
const PER_MONTH: Readonly<Record<string, number>> = { weekly: 52 / 12, fortnightly: 26 / 12, twice_monthly: 2, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };
const live = (s: FactService): boolean => !/cancel|ended|gone/u.test(s.state);

/**
 * WHEN A SERVICE RENEWS, OR THAT IT LAPSED (31 October, AG17): a renewal day gone by is no renewal. Kiln read
 * "kilnfonts.example renews 30 Aug" in the orange of the ones to come, on 3 Sep, beside the task four days late on it.
 */
const renewal = (renews: string | null, today: string): { said: string; gone: boolean } | null =>
  renews === null ? null : renews < today ? { said: `lapsed ${daySaid(renews, today)}`, gone: true } : { said: `renews ${daySaid(renews, today)}`, gone: false };

export function sideOf(f: FactsIn, numbers: Numbers): SideTile {
  if (f.lane === 'earning') {
    /* WHAT IT BROUGHT IN BY ITS MONEY KEY NUMBER where it keeps one, its repeating money as lines under it; else what
       repeats into it, a month. */
    const rec = f.recurring.filter((r) => r.direction === 'in' && r.state !== 'ended');
    const out = f.money.out;
    const paused = rec.find((r) => r.state === 'paused');
    const next = rec.filter((r) => r.state === 'live').map((r) => r.nextDue).filter((d): d is string => !!d).sort()[0];
    const recLines = [...(next ? [{ k: 'Next pay', v: dayChip(next) }] : []), ...rec.slice(0, 3).map((r) => ({ k: r.what, v: `${f.format(r.amount.minor, r.amount.currency)} ${r.every.replace('_', ' ')}` }))];
    const m = moneyKpiOf(f.kpis);
    if (m) {
      const month = SHORT[Number(m.at.slice(5, 7)) - 1];
      const age = Math.max(0, daysBetween(m.at, f.today));
      const stale = age > 45 ? `${age} days old` : null;
      const kept = out && out.currency === m.now.currency ? m.now.minor - out.minor : null;
      return {
        kind: 'money',
        figure: f.format(m.now.minor, m.now.currency),
        sub: `in ${month}`,
        stale,
        bars: m.points.slice(-13),
        lines: [
          ...(out ? [{ k: 'Out this month', v: f.format(out.minor, out.currency) }] : []),
          ...(kept !== null ? [{ k: 'Kept', v: `about ${f.format(kept, m.now.currency)}` }] : []),
          ...(f.money.owed ? [{ k: 'Still to come in', v: f.format(f.money.owed.minor, f.money.owed.currency) }] : []),
          ...recLines,
        ].slice(0, 5),
      };
    }
    if (rec.length > 0) {
      const cur = rec[0]!.amount.currency;
      const minor = rec.filter((r) => r.amount.currency === cur).reduce((n, r) => n + Math.round(r.amount.minor * (PER_MONTH[r.every] ?? 1)), 0);
      return {
        kind: 'money',
        figure: f.format(minor, cur),
        sub: 'a month',
        stale: paused ? `paused${paused.nextDue ? `, was due ${daySaid(paused.nextDue, f.today)}` : ''}` : null,
        bars: [],
        lines: [...(out ? [{ k: 'Out this month', v: f.format(out.minor, out.currency) }] : []), ...recLines],
      };
    }
    return { kind: 'none' };
  }
  if (f.lane === 'parked' || f.lane === 'retired') {
    const kept = f.services.filter(live);
    let year: Money | null = null;
    for (const s of kept) {
      if (!s.cost) continue;
      const k = PER_YEAR[s.cycle] ?? 1;
      if (year === null) year = { minor: 0, currency: s.cost.currency };
      if (s.cost.currency === year.currency) year.minor += Math.round(s.cost.minor * k);
    }
    const domain = kept.find((s) => s.kind === 'domain') ?? null;
    return {
      kind: 'keep',
      about: f.about,
      lines: kept.slice(0, 4).map((s) => ({ k: `${s.name}${s.provider && !sameName(s.provider, s.name) ? ` · ${s.provider}` : ''}`, v: s.renews ? renewal(s.renews, f.today)!.said : s.cost ? `${f.format(s.cost.minor, s.cost.currency)} ${s.cycle}` : '', href: s.href })),
      year: year && year.minor > 0 ? `${f.format(year.minor, year.currency)} a year to keep` : kept.length === 0 ? 'Nothing it runs on is still paid for.' : null,
      domain,
    };
  }
  /* BUILDING: the dated path from its tasks, the late and open first by day, the last one done before them. */
  const dated = f.tasks.filter((t) => t.by !== null);
  const openDated = dated.filter((t) => !t.done).sort((a, b) => a.by!.localeCompare(b.by!));
  const doneDated = dated.filter((t) => t.done).sort((a, b) => (b.doneOn ?? b.by!).localeCompare(a.doneOn ?? a.by!));
  const stops: Stop[] = [
    ...doneDated.slice(0, 1).map((t): Stop => ({ day: daySaid(t.doneOn ?? t.by!, f.today), title: t.title, sub: 'done', tone: 'done', href: t.href })),
    ...openDated.slice(0, 6).map((t): Stop => {
      const late = t.by! < f.today;
      return {
        day: daySaid(t.by!, f.today),
        title: t.title,
        sub: late ? lateSaid(daysBetween(t.by!, f.today)) : t.waits ? 'waits on you' : t.agent ? `${agentName(t.agent)} has it` : null,
        tone: late ? 'late' : t.waits ? 'you' : t.agent ? 'doing' : 'plain',
        href: t.href,
      };
    }),
  ];
  const aimK = f.kpis.find((k) => k.target !== null);
  const aimMoney = aimK && typeof aimK.target === 'string' ? amountOf(aimK.target) : null;
  /* AN AIM WHOSE MONTH HAS GONE BY SAYS SO, AND WHERE IT STANDS (31 October, AG24): "Aim: 500, the aim by Aug 2026"
     stood on 3 Sep at 318, as if August were still to come. */
  const aim = aimK ? aimSaid(aimK, f) : null;
  if (stops.length === 0 && aim === null) return { kind: 'path', end: null, stops: [], aim: null, empty: `No task on ${f.name} has a day yet. Give one a day and its path is drawn here.` };
  return { kind: 'path', end: openDated.at(-1) ? daySaid(openDated.at(-1)!.by!, f.today) : null, stops, aim, empty: null };
}

/** A key number's aim in one line: "Aim: 500 by Aug 2026", or once that month has gone, "Aimed for 500 by Aug; 318 now." */
function aimSaid(k: FactKpi, f: Pick<FactsIn, 'format' | 'today'>): string {
  const money = typeof k.target === 'string' ? amountOf(k.target) : null;
  const target = `${money ? f.format(money.minor, money.currency) : String(k.target)}${k.every === '1m' ? ' a month' : ''}`;
  if (!k.targetBy) return `Aim: ${target}`;
  const month = SHORT[Number(k.targetBy.slice(5, 7)) - 1];
  if (k.targetBy.slice(0, 7) >= f.today.slice(0, 7)) return `Aim: ${target} by ${month} ${k.targetBy.slice(0, 4)}`;
  const last = k.latest;
  const lastMoney = last && typeof last.amount === 'string' ? amountOf(last.amount) : null;
  const now = lastMoney ? f.format(lastMoney.minor, lastMoney.currency) : typeof last?.value === 'number' && Number.isFinite(last.value) ? last.value.toLocaleString('en-GB') : null;
  const by = k.targetBy.slice(0, 4) === f.today.slice(0, 4) ? month : `${month} ${k.targetBy.slice(0, 4)}`;
  return now === null ? `Aimed for ${target} by ${by}.` : `Aimed for ${target} by ${by}; ${now} now.`;
}

/* ── its dates ─────────────────────────────────────────────────────────── */

export type DateLine = { day: string; at: string; text: string; tone: 'late' | 'plain'; href: string | null };

/** WHAT FALLS DUE ON IT IN FOUR MONTHS, the late first: its tasks, the days in its next step, renewals and repeating money. */
export function datesOf(f: FactsIn, most = 6): DateLine[] {
  const ahead = (d: string) => daysBetween(f.today, d) <= 122;
  const out: DateLine[] = [];
  for (const t of f.tasks) if (!t.done && t.by !== null && ahead(t.by)) out.push({ at: t.by, day: dayChip(t.by), text: t.title, tone: t.by < f.today ? 'late' : 'plain', href: t.href });
  for (const x of nextSplit(f.next, f.now)) if (x.day && x.day >= f.today && ahead(x.day) && !out.some((o) => o.at === x.day && fold(o.text) === fold(x.text))) out.push({ at: x.day, day: dayChip(x.day), text: x.text, tone: 'plain', href: null });
  for (const s of f.services) if (live(s) && s.renews && s.renews >= f.today && ahead(s.renews)) out.push({ at: s.renews, day: dayChip(s.renews), text: `${s.name} renews${s.cost && s.cost.minor > 0 ? `, ${f.format(s.cost.minor, s.cost.currency)}` : ''}`, tone: 'plain', href: s.href });
  for (const r of f.recurring) if (r.state === 'live' && r.nextDue && r.nextDue >= f.today && ahead(r.nextDue)) out.push({ at: r.nextDue, day: dayChip(r.nextDue), text: `${r.what}, ${f.format(r.amount.minor, r.amount.currency)} ${r.direction === 'in' ? 'in' : 'out'}`, tone: 'plain', href: r.href ?? null });
  for (const k of f.kpis) if (k.targetBy && k.targetBy >= f.today && ahead(k.targetBy)) out.push({ at: k.targetBy, day: dayChip(k.targetBy), text: `${stripName(k.name, f.name)} should reach its target`, tone: 'plain', href: null });
  return out.sort((a, b) => Number(b.tone === 'late') - Number(a.tone === 'late') || a.at.localeCompare(b.at)).slice(0, most);
}

/* ── what it runs on, and when each renews ────────────────────────────── */

export type RunsOnLine = { name: string; sub: string; right: string; tone: 'bad' | 'warn' | 'good' | 'plain'; href: string | null };

/** Whether a provider only says the service's name again: "GitHub" for GitHub, "Amazon" for "Amazon Web Services" is not. */
const sameName = (provider: string | null | undefined, name: string): boolean => {
  const p = (provider ?? '').trim().toLowerCase();
  return p !== '' && p === name.trim().toLowerCase();
};

export function runsOnOf(f: Pick<FactsIn, 'today' | 'format'> & { services: readonly FactService[] }, numbers: Numbers): RunsOnLine[] {
  const lines: RunsOnLine[] = f.services
    .filter(live)
    .sort((a, b) => (a.renews ?? '9999').localeCompare(b.renews ?? '9999'))
    .map((s) => {
      const soon = s.renews !== null && daysBetween(f.today, s.renews) <= 30;
      const when = renewal(s.renews, f.today);
      return {
        name: s.name,
        /* THE PROVIDER ONCE (skills pass 2 Nov): "GitHub" over "GitHub · $40 monthly" and "Stripe" over "Stripe" said the
           name twice; a provider that is the name is left for the name to say. */
        sub: [sameName(s.provider, s.name) ? '' : s.provider || s.kind, s.cost && s.cost.minor > 0 ? `${f.format(s.cost.minor, s.cost.currency)} ${s.cycle}`.trim() : ''].filter(Boolean).join(' · '),
        right: when?.said ?? '',
        tone: when?.gone ? 'bad' : soon ? 'warn' : 'plain',
        href: s.href,
      };
    });
  if (numbers.measures > 0)
    lines.push({
      name: 'Numbers feed',
      sub: plural(numbers.readings, 'reading', 'readings'),
      right: numbers.banner && numbers.newest ? `quiet since ${daySaid(numbers.newest, f.today)}` : numbers.cadence,
      tone: numbers.banner ? 'warn' : 'good',
      href: null,
    });
  return lines;
}

/* ── the agents' sessions ─────────────────────────────────────────────── */

export type SessionLine = { seq: number; agent: string; title: string; when: string; said: string | null; ended: string; open: boolean };

/** Each session on it, newest first: what it did, when, what it left, and how it ended. */
export function sessionsOf(f: Pick<FactsIn, 'runs' | 'today' | 'name'>, most = 4): SessionLine[] {
  return f.runs.slice(0, most).map((r) => {
    const from = day10(r.started) ?? day10(r.at)!;
    const to = day10(r.at) ?? from;
    const ended = endedAs({ state: r.state, closedAs: r.closedAs, handed: r.next !== '' || r.notes.length > 0 });
    const doing = r.doing.trim();
    const generic = doing === '' || /^(claude|codex|cursor|agent)( code)? (run|in .*)$/iu.test(doing);
    return {
      seq: r.seq,
      agent: r.agent,
      title: generic ? `${agentName(r.agent)}${r.repo ? ` in ${r.repo}` : ''}` : summarySaid(doing),
      when: from === to ? daySaid(to, f.today) : `${daySaid(from, f.today)} to ${daySaid(to, f.today)}`,
      said: r.notes[0] ? summarySaid(r.notes[0]) : r.next !== '' ? `Next: ${summarySaid(r.next)}` : null,
      ended: `${ended.said}${r.wrote ? ` · ${plural(r.wrote, 'write', 'writes')}` : ''}`,
      open: ended.open,
    };
  });
}

/* ── what happened ─────────────────────────────────────────────────────── */

export type HappenedLine = { at: string; day: string; text: string; by: string | null; tone: 'plain' | 'warn' };

/**
 * WHAT HAPPENED ON IT, IN WORDS, newest first: work finished and added, sessions and what they left, the last numbers
 * that came in, and the edits to its own row folded into one line a day ("its note and next step were rewritten").
 */
/** A run's own title, "Mara Brain run S87": a source and a run id, never words for a person (Q14 of 29 October). */
const RUN_TITLE = /^(?:[\p{L}\p{N}][\p{L}\p{N}.-]*(?: [\p{L}\p{N}][\p{L}\p{N}.-]*)*) run(?: S[1-9][0-9]*)?\.?$/u;

/** A path to a file or a folder (`bake/site/docs/reviews/x.md`, `~/Developer/marrow`): kept under Show the data, never said. */
const PATH = /(?:(?:~\/|\.{1,2}\/|(?<![\w.])\/)(?:[\w.-]+\/)*[\w.-]+|(?:[\w.-]+\/){2,}[\w.-]+)\/?/gu;

/**
 * A LINE OF WHAT HAPPENED AS A PERSON WRITES IT (Q14 of 29 October): an imported run is "Imported from your old notes",
 * never its source and id; a path is "a file" or "a folder"; and a step that changed is "Next step changed to …", never
 * "from … to …" with both written out.
 */
export function happenedSaid(text: string): string {
  const t = text.trim();
  if (RUN_TITLE.test(t)) return 'Imported from your old notes.';
  const moved = /^(next step|status|lane|due|note)\s+from\s+.+?\s+to\s+(.+)$/isu.exec(t);
  const said = moved ? `${moved[1]!.charAt(0).toUpperCase()}${moved[1]!.slice(1).toLowerCase()} changed to ${moved[2]!}` : t;
  return said
    .replace(PATH, (p) => (/\.[A-Za-z0-9]{1,5}$/u.test(p) ? 'a file' : 'a folder'))
    /* A COMMIT'S HASH AND A RUN'S ID ARE THE RECORD'S, never the line's: "in 20baee4", "(S148)". */
    .replace(/\s*\((?:S[1-9][0-9]*|[0-9a-f]{7,40})\)/gu, '')
    .replace(/\b(?:commit\s+)?(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/gu, 'a commit')
    .replace(/\brun S[1-9][0-9]*\b/gu, 'a run');
}

/** How long a summary line runs before it stops at a word. */
const SUMMARY_MOST = 180;

/**
 * A RUN'S WORDS AS ONE SUMMARY LINE (Q14 of 29 October): a project drew a run's whole handoff, three thousand words of
 * env codes (`NODE_USE_ENV_PROXY`), commits and paths, as one line of What happened, and Marrow's Agents tile ended on
 * `~/Developer/marrow`. The first sentence, said as `happenedSaid` says it, with a setting's code as "a setting" and
 * no code marks, cut at a word past `SUMMARY_MOST`. The whole stays on the run, under Show the data.
 */
export function summarySaid(text: string): string {
  const t = text.trim().replace(/\s+/gu, ' ');
  const first = /^.+?[.!?](?=\s+[A-Z(])/u.exec(t)?.[0] ?? t;
  const plain = happenedSaid(first)
    .replace(/`([^`]*)`/gu, '$1')
    .replace(/\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/gu, 'a setting');
  if (plain.length <= SUMMARY_MOST) return plain;
  const cut = plain.slice(0, SUMMARY_MOST);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), SUMMARY_MOST / 2)).replace(/[\s,;:.\u2013\u2014-]+$/u, '')}…`;
}

export function happenedOf(f: FactsIn, numbers: Numbers, most = 6): HappenedLine[] {
  const out: HappenedLine[] = [];
  /* TASKS ADDED, ONE LINE A DAY: a plan written in one sitting is one line, its first two named. */
  const added = new Map<string, string[]>();
  for (const t of f.tasks) {
    if (t.done && t.doneOn) out.push({ at: t.doneOn, day: daySaid(t.doneOn, f.today), text: `Finished: ${t.title}.`, by: null, tone: 'plain' });
    else if (t.created) added.set(t.created.slice(0, 10), [...(added.get(t.created.slice(0, 10)) ?? []), t.title]);
  }
  for (const [d, titles] of added) {
    const text =
      titles.length === 1
        ? `${upper(article(f.called.one))} ${f.called.one} was added: ${titles[0]}.`
        : `${plural(titles.length, f.called.one, f.called.many)} were added: ${titles.slice(0, 2).join(', ')}${titles.length > 2 ? ` and ${titles.length - 2} more` : ''}.`;
    out.push({ at: d, day: daySaid(d, f.today), text, by: null, tone: 'plain' });
  }
  for (const r of f.runs.slice(0, 6)) {
    const d = day10(r.at);
    if (!d) continue;
    const what = r.notes[0] ?? (r.doing.trim() !== '' && !/ run$/iu.test(r.doing) ? r.doing : null);
    const text = what ? summarySaid(/[.!?]$/u.test(what) ? what : `${what}.`) : `A run ${endedAs({ state: r.state, closedAs: r.closedAs, handed: r.next !== '' }).said}.`;
    /* IMPORTED RUNS ARE ONE LINE, on the newest of their days: four of "Mara Brain run S87" read as a story of ids. */
    if (text === 'Imported from your old notes.' && out.some((o) => o.text === text)) continue;
    out.push({ at: d, day: daySaid(d, f.today), text, by: text === 'Imported from your old notes.' ? null : agentName(r.agent), tone: 'plain' });
  }
  if (numbers.newest && numbers.banner) out.push({ at: numbers.newest, day: daySaid(numbers.newest, f.today), text: 'The last numbers arrived. Nothing since.', by: null, tone: 'warn' });
  /* THE ROW'S OWN EDITS, ONE LINE A DAY: a tidy that rewrote its note and its next step is one line, not five. */
  const edits = new Map<string, string[]>();
  for (const h of f.history) {
    const d = day10(h.at);
    if (d) edits.set(d, [...(edits.get(d) ?? []), h.note.trim()]);
  }
  for (const [d, notes] of edits) {
    const said = notes.find((n) => n !== '') ?? '';
    const first = said.charAt(0).toUpperCase() + said.slice(1);
    const plainFirst = first === '' ? '' : happenedSaid(first).replace(/[.]$/u, '');
    const text = notes.length === 1 && plainFirst !== '' ? `${plainFirst}.` : `${plural(notes.length, 'change', 'changes')} to it${plainFirst !== '' ? `, among them: ${plainFirst}` : ''}.`;
    out.push({ at: d, day: daySaid(d, f.today), text, by: null, tone: 'plain' });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, most);
}
