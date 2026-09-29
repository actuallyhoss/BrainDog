/**
 * What the Work screen says about the tasks as a whole, with no network and no runes: whose each task is, the title
 * row's one sentence, the open work by tier as yours against the agents', and what has not moved in a long while.
 *
 * READ FROM THE LIST'S SHAPE, like `board.ts`: a list with no priority has no tier chart, a list with no agent field
 * has no agents, and every figure here counts rows the record returned. Nothing is estimated and nothing is invented,
 * so a clause whose count is zero is left out rather than said as "0".
 *
 * PURE, so `work-tiles.test.ts` drives every rule over the founder record's own tasks list.
 */

import type { Fields } from '../record/schema.ts';
import { addDays, bandOf, dayIn, daysBetween, isDone, type Band, type Shape } from './board.ts';

const text = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

type Task = { seq: number; fields: Fields };

/* ── whose it is ───────────────────────────────────────────────────────── */

/** The toolbar's three views: work nobody else holds, work an agent took, and all of it. */
export const WHOSE = ['yours', 'agents', 'all'] as const;
export type Whose = (typeof WHOSE)[number];

/** Who holds a task: an agent by the name it signs with, the reader, or another person. */
export type Hold = 'agent' | 'you' | 'other';

/**
 * Who holds a task. An agent named on it holds it; a person linked as its owner holds it, and that is the reader when
 * `mine` says so; a task nobody holds is the reader's, which is what the list's own words say ("Empty is you").
 */
export function holdOf(f: Fields, s: Shape, mine: (owner: number) => boolean): Hold {
  if (s.agent && text(f[s.agent]).trim() !== '') return 'agent';
  const owner = s.owner ? f[s.owner.field] : null;
  if (typeof owner === 'number') return mine(owner) ? 'you' : 'other';
  return 'you';
}

export function inWhose(f: Fields, s: Shape, whose: Whose, mine: (owner: number) => boolean): boolean {
  if (whose === 'all') return true;
  const h = holdOf(f, s, mine);
  return whose === 'agents' ? h === 'agent' : h === 'you';
}

/** How many open tasks each view holds, for the toolbar's counts. */
export function whoseCounts(rows: readonly Task[], s: Shape, mine: (owner: number) => boolean): Record<Whose, number> {
  const out: Record<Whose, number> = { yours: 0, agents: 0, all: 0 };
  for (const r of rows) {
    if (r.seq <= 0 || isDone(r.fields, s)) continue;
    out.all++;
    const h = holdOf(r.fields, s, mine);
    if (h === 'agent') out.agents++;
    else if (h === 'you') out.yours++;
  }
  return out;
}

/* ── an agent's task, and what it waits on ─────────────────────────────── */

/**
 * Whether a state is the one where work waits on a person to check it: "To check", "Review". Found by its value or
 * its word among the states the list says wait, so a list calling it `to_check` still counts.
 */
export function isReview(f: Fields, s: Shape): boolean {
  if (!s.state) return false;
  const v = text(f[s.state]);
  if (!s.waiting.includes(v)) return false;
  return /review|check/i.test(v) || /review|check/i.test(s.said[v] ?? '');
}

/** The agent holding a task, lower-cased as it signs, or `''`. */
export const agentOf = (f: Fields, s: Shape): string => (s.agent ? text(f[s.agent]).trim().toLowerCase() : '');

/**
 * What an agent's task is doing, for the row's end: waiting on your review (it needs you, so it is red), stuck (a soft
 * warning), queued (the state new work is in), or working (the one hue that means alive).
 */
export function agentSaid(f: Fields, s: Shape): { words: string; tone: 'danger' | 'warn' | 'live' | '' } {
  const v = s.state ? text(f[s.state]) : '';
  if (isReview(f, s)) return { words: 'waits on your review', tone: 'danger' };
  if (s.waiting.includes(v)) return { words: (s.said[v] ?? v).toLowerCase(), tone: 'warn' };
  if (v === '' || v === s.fresh) return { words: 'queued', tone: '' };
  return { words: 'working', tone: 'live' };
}

/**
 * The band a task is drawn in on Work, which is `bandOf`'s with one move: an agent's task that waits on your review is
 * drawn with the agents, whose band says what each is on, rather than among the tasks waiting on somebody else.
 */
export function drawnBand(f: Fields, s: Shape, today: string): Band {
  const b = bandOf(f, s, today);
  return b === 'waiting' && agentOf(f, s) !== '' ? 'agent' : b;
}

/* ── the sentence under the title ──────────────────────────────────────── */

export type Stats = {
  /** Open tasks that are yours, and of those the late and the due today. */
  yours: number;
  late: number;
  today: number;
  /** The agents with work waiting on your review, most first. */
  reviews: string[];
};

export function statsOf(rows: readonly Task[], s: Shape, today: string, mine: (owner: number) => boolean): Stats {
  let yours = 0;
  let late = 0;
  let due = 0;
  const reviews = new Map<string, number>();
  for (const r of rows) {
    if (r.seq <= 0 || isDone(r.fields, s)) continue;
    const h = holdOf(r.fields, s, mine);
    if (h === 'agent') {
      if (isReview(r.fields, s)) {
        const a = agentOf(r.fields, s);
        reviews.set(a, (reviews.get(a) ?? 0) + 1);
      }
      continue;
    }
    if (h !== 'you') continue;
    yours++;
    const b = bandOf(r.fields, s, today);
    if (b === 'overdue') late++;
    else if (b === 'today') due++;
  }
  return { yours, late, today: due, reviews: [...reviews].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([a]) => a) };
}

const are = (n: number): string => (n === 1 ? 'is' : 'are');

/** "claude", "claude and codex", "3 agents". */
function agentsSaid(names: readonly string[]): string {
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.length} agents`;
}

/**
 * The title row's one sentence, and the phrase in it that needs you (drawn red): "3 of your 50 are late and 1 is due
 * today; claude waits on your review." With nothing late, the review is the phrase that needs you. With nothing open
 * and nothing to review, there is no sentence.
 */
export function sentenceOf(st: Stats): { text: string; needs: string } | null {
  const review = st.reviews.length === 0 ? '' : `${agentsSaid(st.reviews)} ${st.reviews.length === 1 ? 'waits' : 'wait'} on your review`;
  if (st.yours === 0 && review === '') return null;
  if (st.late > 0) {
    const needs = `${st.late} of your ${st.yours} ${are(st.late)} late`;
    const due = st.today > 0 ? ` and ${st.today} ${are(st.today)} due today` : '';
    return { text: `${needs}${due}${review ? `; ${review}` : ''}.`, needs };
  }
  const first = st.yours === 0 ? 'Nothing of yours is open.' : 'Nothing of yours is late.';
  const due = st.today > 0 ? ` ${st.today} ${are(st.today)} due today.` : '';
  if (review === '') return { text: `${first}${due}`, needs: '' };
  const said = `${review.charAt(0).toUpperCase()}${review.slice(1)}`;
  return { text: `${first}${due} ${said}.`, needs: said };
}

/* ── open work by tier ─────────────────────────────────────────────────── */

/** A chart tone: a named one from `lib/viz`. */
export type TierTone = 'danger' | 'ink' | 'g1' | 'g2' | 'g3' | 'g4';

export type TierPart = {
  /** The priority's value, or `null` for the tasks nobody ranked. */
  value: string | null;
  label: string;
  /** Open tasks at this tier held by you (or by people, see `TierChart.people`), and by agents. */
  yours: number;
  agents: number;
  /** Of the agents' tasks, those waiting on your review. */
  review: number;
  tone: TierTone;
};

export type TierChart = {
  parts: TierPart[];
  /** Whether the left side holds other people's work too, which is when it is named "People" and not "Yours". */
  people: boolean;
  yours: number;
  agents: number;
};

const URGENT = /urgent|critical|asap|blocker|now/i;

/**
 * The tones down the tiers: `danger` for the first when it says urgent (red means it needs you, never a rank), then
 * ink and the greys, one step apart, so the tiers read top to bottom. The unranked ones are the palest.
 */
export function tierTones(values: readonly string[], said: Readonly<Record<string, string>>): TierTone[] {
  const steps: TierTone[] = ['ink', 'g2', 'g3', 'g4'];
  const urgent = values.length > 1 && URGENT.test(`${values[0]} ${said[values[0]!] ?? ''}`);
  return values.map((_, i) => (urgent ? (i === 0 ? 'danger' : steps[Math.min(i - 1, steps.length - 1)]!) : steps[Math.min(i, steps.length - 1)]!));
}

/**
 * The open tasks by tier, yours against the agents', in the list's own order of tiers and then the unranked. `null`
 * when the list has no priority. Tasks another person holds join the left side, which is then named "People".
 */
export function tierCounts(rows: readonly Task[], s: Shape, mine: (owner: number) => boolean): TierChart | null {
  const p = s.priority;
  if (!p) return null;
  const tones = tierTones(p.values, p.said);
  const parts: TierPart[] = p.values.map((v, i) => ({ value: v, label: p.said[v] ?? v, yours: 0, agents: 0, review: 0, tone: tones[i]! }));
  const none: TierPart = { value: null, label: 'unranked', yours: 0, agents: 0, review: 0, tone: 'g4' };
  let people = false;
  for (const r of rows) {
    if (r.seq <= 0 || isDone(r.fields, s)) continue;
    const i = p.values.indexOf(text(r.fields[p.field]));
    const part = i < 0 ? none : parts[i]!;
    const h = holdOf(r.fields, s, mine);
    if (h === 'agent') {
      part.agents++;
      if (isReview(r.fields, s)) part.review++;
    } else {
      part.yours++;
      if (h === 'other') people = true;
    }
  }
  const all = none.yours + none.agents > 0 ? [...parts, none] : parts;
  return { parts: all, people, yours: all.reduce((n, t) => n + t.yours, 0), agents: all.reduce((n, t) => n + t.agents, 0) };
}

const tasks = (n: number): string => (n === 1 ? 'task' : 'tasks');

/**
 * The tier chart's one line: who holds the top tier, and how many of the agents' ones wait on your review. "Agents hold
 * 7 of the 8 urgent tasks. One of them waits on your review." When the top tier is empty, the first tier that is not.
 */
export function tierReading(t: TierChart): string {
  const ranked = t.parts.filter((x) => x.value !== null);
  const top = ranked[0];
  if (!top) return '';
  const word = top.label.toLowerCase();
  const total = top.yours + top.agents;
  if (total === 0) {
    const next = ranked.find((x) => x.yours + x.agents > 0);
    if (!next) return `Nothing open is ranked yet.`;
    const n = next.yours + next.agents;
    return `Nothing is ${word}. The most pressing ${n === 1 ? 'is 1' : `are ${n}`} ${next.label.toLowerCase()}.`;
  }
  const mine = t.people ? 'with people' : 'yours';
  let first: string;
  if (top.agents === 0) first = total === 1 ? `The one ${word} task is ${mine}.` : `All ${total} ${word} tasks are ${mine}.`;
  else if (top.yours === 0) first = total === 1 ? `An agent holds the one ${word} task.` : `Agents hold all ${total} ${word} tasks.`;
  else first = `Agents hold ${top.agents} of the ${total} ${word} ${tasks(total)}.`;
  if (top.review === 0) return first;
  const which = top.agents === 1 ? 'It waits' : top.review === 1 ? 'One of them waits' : `${top.review} of them wait`;
  return `${first} ${which} on your review.`;
}

/**
 * How many columns each side of the tier chart takes, so the two waffles stand the same height: about five rows for a
 * hundred-odd tasks, never more than eight, and the whole scaled to 200 squares past that (`lib/viz/waffle.ts`).
 */
export function tierColumns(yours: number, agents: number): { yours: number; agents: number; scale: number } {
  const total = yours + agents;
  const scale = total > 200 ? 200 / total : 1;
  const rows = Math.min(8, Math.max(1, Math.ceil((total * scale) / 26)));
  const cols = (n: number) => Math.max(1, Math.ceil(Math.round(n * scale) / rows));
  return { yours: cols(yours), agents: cols(agents), scale };
}

/* ── what has not moved ────────────────────────────────────────────────── */

/** A task with no change in this many days has not moved. */
export const STALE_DAYS = 90;

/**
 * The open tasks that have not changed in `STALE_DAYS`, by number, and the day before which that is. `moved` gives the
 * day a task last changed (or, where the record did not say, the day it was added).
 */
export function staleOf(rows: readonly Task[], s: Shape, moved: (seq: number) => string | undefined, today: string): { seqs: Set<number>; since: string } {
  const since = addDays(today, -STALE_DAYS);
  const seqs = new Set<number>();
  for (const r of rows) {
    if (r.seq <= 0 || isDone(r.fields, s)) continue;
    const at = dayIn(moved(r.seq));
    if (at !== '' && at < since) seqs.add(r.seq);
  }
  return { seqs, since };
}

/* ── days ──────────────────────────────────────────────────────────────── */

/** How late a day is, said as the row says it: "1 day late", "5 days late". */
export function lateBy(due: string, today: string): string {
  const n = daysBetween(due, today);
  return n === 1 ? '1 day late' : `${n} days late`;
}
