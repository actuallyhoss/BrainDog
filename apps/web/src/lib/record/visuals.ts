/**
 * The drawings a project's page carries inside it: its roadmap, and the few visuals its own data earns.
 *
 * CHOSEN BY WHAT THE PROJECT HAS, never by which project it is: money in and out by month when the record answers those
 * figures, a dues calendar when a repeating list declaring a direction and a cadence holds outgoings pointing at the
 * project, a revenue trend when the project declares two earned amounts. A visual with nothing to draw is not returned,
 * so nothing is drawn empty. Pure and relative-imported so `visuals.test.ts` can hold the rules without a component.
 */

import { dayShort, monthShort } from 'braindog-render';
import type { DataRow } from './project.ts';

/** A reading of money by month, as `figures.ts` hands it. */
export type Months = { currency: string; months: readonly { key: string; value: number; partial: boolean }[]; total: number };

/** What of a list's declaration is read here: its state, which states end it, and its fields. */
export type ListDecl = {
  state?: string | undefined;
  done?: readonly string[] | undefined;
  title?: string | undefined;
  fields: readonly { id: string; type: string; deadline?: boolean | undefined; values?: readonly string[] | undefined }[];
};

/** A list that points at the project, with its rows' stored fields. */
export type Listing = { decl: ListDecl | undefined; rows: readonly Readonly<Record<string, unknown>>[] };

export type Project = { fields: Readonly<Record<string, unknown>>; decl: ListDecl | undefined };
export type VisualData = {
  inByMonth: Months | null;
  outByMonth: Months | null;
  listings: readonly Listing[];
  /** The reader's day, YYYY-MM-DD. */
  today: string;
  format: (minor: number, currency: string) => string;
};

const DAY = 86_400_000;
const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/u.test(v);
const ms = (day: string): number => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
const dayOf = (t: number): string => new Date(t).toISOString().slice(0, 10);
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/* ── the roadmap ───────────────────────────────────────────────────────────── */

export type MarkState = 'done' | 'late' | 'next' | 'later';
export type Mark = { key: string; title: string; day: string; state: MarkState; milestone: boolean; at: number };
export type Roadmap = { marks: Mark[]; today: string; todayAt: number };

/** How many ahead are named "next", how many finished and open ones are kept, so a long list stays drawable. */
export const NEXT_SHOWN = 3;
const KEEP_DONE = 5;
const KEEP_OPEN = 10;

/* A dated list that declares a flag field marks its lines with it; a list that declares none has none, and none is drawn. */
const milestoneField = (d: ListDecl): string | null => d.fields.find((f) => f.type === 'bool' || f.type === 'flag')?.id ?? null;

/**
 * THE PROJECT'S TASKS WITH A DAY, on one line of time: finished behind, late ones, then the next few and the rest. A list
 * counts as tasks when it declares a state and a deadline day. Fewer than two dated tasks draw nothing.
 */
export function roadmapOf(listings: readonly Listing[], today: string): Roadmap | null {
  const all: Omit<Mark, 'at'>[] = [];
  for (const l of listings) {
    const d = l.decl;
    const deadline = d?.fields.find((f) => f.deadline === true && f.type === 'day')?.id;
    if (!d || !d.state || !d.done?.length || !deadline) continue;
    const flag = milestoneField(d);
    const finish = d.done[0]!;
    l.rows.forEach((r, i) => {
      const day = r[deadline];
      const title = text(r[d.title ?? 'what']);
      const state = text(r[d.state!]);
      /* A DROPPED TASK IS NOT ON THE ROAD: only the list's first finishing state is, the rest are left out. */
      if (!isDay(day) || title === '' || (d.done!.includes(state) && state !== finish)) return;
      const done = state === finish;
      const d10 = day.slice(0, 10);
      all.push({ key: `${i}:${title}`, title, day: d10, state: done ? 'done' : d10 < today ? 'late' : 'later', milestone: flag !== null && r[flag] === true });
    });
  }
  if (all.length < 2) return null;
  all.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  const done = all.filter((m) => m.state === 'done').slice(-KEEP_DONE);
  const open = all.filter((m) => m.state !== 'done').slice(0, KEEP_OPEN);
  let ahead = 0;
  for (const m of open) if (m.state === 'later' && ahead++ < NEXT_SHOWN) m.state = 'next';
  const kept = [...done, ...open].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  const days = [...kept.map((m) => ms(m.day)), ms(today)];
  const lo = Math.min(...days);
  const span = Math.max(...days) - lo;
  const at = (t: number) => (span === 0 ? 0.5 : (t - lo) / span);
  return { marks: kept.map((m) => ({ ...m, at: at(ms(m.day)) })), today, todayAt: at(ms(today)) };
}

/**
 * WHICH LINE UNDER THE ROAD EACH LABEL HANGS ON, so no two run into each other (the audit of 20 October: "Proofing press,
 * 5 of 8" over "Settle how Kiln is licensed" on Kiln). Each label is its span across the tile, `left` to `right` in
 * pixels as drawn; it takes the first line whose last label ends `gap` before it starts, else a new line. In the order
 * handed, which is the road's, so the soonest label keeps the top line.
 */
export function lanesOf(spans: readonly { left: number; right: number }[], gap = 12): number[] {
  const ends: number[] = [];
  return spans.map(({ left, right }) => {
    let lane = ends.findIndex((end) => end + gap <= left);
    if (lane === -1) lane = ends.push(right) - 1;
    else ends[lane] = right;
    return lane;
  });
}

/* ── the path ───────────────────────────────────────────────────────────── */

/**
 * A STOP ON THE PATH (proj F3): done, the one now, late or waiting on a person in the red, or later. Its line under it
 * is a day ("3 Sep"), "Late", "Waits on you", or "Agent at work" for the one an agent holds; the agent is named once, in the
 * hero and the Work tile (proj F1), so the path says only that one holds it.
 */
export type StopKind = 'done' | 'now' | 'late' | 'waits' | 'later';
export type Stop = { key: string; seq: number | null; title: string; kind: StopKind; sub: string; red: boolean };
export type Path = { stops: Stop[]; total: number };

/** What of the work list the path reads, from its declaration (`figures.ts` `viaOf` hands most of it). */
export type PathRead = {
  title: string;
  state: string;
  /** The states that end a row; the first is finished, the rest (dropped) leave the path. */
  done: readonly string[];
  deadline: string | null;
  agent: string | null;
  /** The states a row waits on a person in (handed back, blocked). */
  waits: readonly string[];
  /** The day a finished row was finished on, where the list keeps one. */
  doneOn: string | null;
};

/** At most this many stops: the last two done, the one now, the next three. */
export const PATH_STOPS = 6;
const PATH_DONE = 2;
const PATH_NEXT = 3;
/**
 * THE FEWEST STOPS A PATH IS DRAWN WITH: three, SINCE the audit of 22 October (U-B12). A path of two was the same two rows
 * the work tile under it lists, a tile of scaffolding on a page that should end under 1,500px.
 */
const PATH_LEAST = 3;

/** "3 Sep", from the renderer's one table of months (P16): Intl's en-GB writes "3 Sept". */
export const shortDay = (day: string): string => dayShort(day.slice(0, 10));

/**
 * THE PROJECT'S WORK AS A STEPPER, NOT A TIME AXIS (proj F3): its own tasks only, never its bills. The last two finished,
 * the one under way now (one an agent holds or one being done, else the soonest open), then the next three by day.
 * Fewer than three stops draw nothing (`PATH_LEAST`). `total` is every row on the path, finished or not, for the "All
 * 17" link.
 */
export function pathOf(rows: readonly { seq?: number | undefined; fields: Readonly<Record<string, unknown>> }[], p: PathRead, today: string): Path | null {
  const finish = p.done[0];
  type Item = { key: string; seq: number | null; title: string; state: string; day: string; agent: string };
  const items: Item[] = [];
  rows.forEach((r, i) => {
    const f = r.fields;
    const title = text(f[p.title]);
    const state = text(f[p.state]);
    if (title === '' || (p.done.includes(state) && state !== finish)) return;
    const due = p.deadline && isDay(f[p.deadline]) ? (f[p.deadline] as string).slice(0, 10) : '';
    const on = state === finish && p.doneOn && isDay(f[p.doneOn]) ? (f[p.doneOn] as string).slice(0, 10) : due;
    items.push({ key: typeof r.seq === 'number' ? `s${r.seq}` : `i${i}`, seq: typeof r.seq === 'number' ? r.seq : null, title, state, day: on, agent: p.agent ? text(f[p.agent]) : '' });
  });
  const byDay = (a: Item, b: Item) => (a.day === b.day ? (a.seq ?? 0) - (b.seq ?? 0) : a.day === '' ? 1 : b.day === '' ? -1 : a.day < b.day ? -1 : 1);
  const done = items.filter((x) => x.state === finish).sort(byDay);
  const open = items.filter((x) => x.state !== finish).sort(byDay);
  const total = items.length;
  const moving = open.find((x) => x.agent !== '') ?? open.find((x) => /doing|progress|active/u.test(x.state)) ?? open[0];
  const after = open.filter((x) => x !== moving).slice(0, PATH_NEXT);
  const late = (x: Item) => x.day !== '' && x.day < today;
  const stop = (x: Item, now: boolean): Stop => {
    if (x.state === finish) return { key: x.key, seq: x.seq, title: x.title, kind: 'done', sub: x.day ? shortDay(x.day) : 'Done', red: false };
    const waits = p.waits.includes(x.state);
    const kind: StopKind = now ? 'now' : waits ? 'waits' : late(x) ? 'late' : 'later';
    if (waits) return { key: x.key, seq: x.seq, title: x.title, kind, sub: 'Waits on you', red: true };
    if (late(x)) return { key: x.key, seq: x.seq, title: x.title, kind, sub: 'Late', red: true };
    if (x.agent !== '') return { key: x.key, seq: x.seq, title: x.title, kind, sub: now ? 'Agent at work' : 'With an agent', red: false };
    return { key: x.key, seq: x.seq, title: x.title, kind, sub: x.day ? shortDay(x.day) : now ? 'Now' : '', red: false };
  };
  const stops = [...done.slice(-PATH_DONE).map((x) => stop(x, false)), ...(moving ? [stop(moving, true)] : []), ...after.map((x) => stop(x, false))];
  return stops.length < PATH_LEAST ? null : { stops: stops.slice(-PATH_STOPS), total };
}

/**
 * WHETHER MONEY BY MONTH IS A SHAPE (proj F8): three months or more, and at least two of them above nought. Otherwise
 * the total is said as a line and nothing is drawn.
 */
export const monthsDrawn = (m: Months | null | undefined): m is Months => !!m && m.months.length >= 3 && m.months.filter((x) => x.value > 0).length >= 2;

/* ── dues ───────────────────────────────────────────────────────────────── */

export type Due = { day: string; late: boolean; what: string };
export type Month = { key: string; lead: number; days: number; dues: ReadonlyMap<number, { late: boolean; what: string }> };

const STEP_DAYS: Record<string, number> = { weekly: 7, fortnightly: 14 };
const STEP_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, yearly: 12 };
/** How far ahead the calendar looks, in whole months from the month it opens on. */
export const CALENDAR_MONTHS = 3;

const plusMonths = (day: string, n: number): string => {
  const y = +day.slice(0, 4);
  const m = +day.slice(5, 7) - 1 + n;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return dayOf(Date.UTC(y, m, Math.min(+day.slice(8, 10), last)));
};

/** Every day one repeating line lands on from its next day to `until`, the day it was missed first when it is past. */
function lands(next: string, every: string, until: string): string[] {
  const out: string[] = [];
  const dayStep = STEP_DAYS[every];
  const monthStep = STEP_MONTHS[every];
  for (let i = 0, d = next; d <= until && i < 60; i++) {
    out.push(d);
    if (dayStep !== undefined) d = dayOf(ms(d) + dayStep * DAY);
    else if (monthStep !== undefined) d = plusMonths(next, monthStep * (i + 1));
    else if (every === 'twice_monthly') d = +d.slice(8, 10) < 15 ? `${d.slice(0, 8)}15` : plusMonths(`${d.slice(0, 8)}01`, 1);
    else break;
  }
  return out;
}

/**
 * THE DAYS MONEY GOES OUT ON, from the project's repeating lines. A list is one when it declares a direction, a cadence and
 * a day it is next due; its rows count when they go out and are not ended. A line already past its day is late, and is the
 * one dot in the accent; the rest follow from it by the cadence over the months the calendar opens on.
 */
export function duesOf(listings: readonly Listing[], today: string): Due[] {
  const until = plusMonths(`${today.slice(0, 8)}01`, CALENDAR_MONTHS);
  const out: Due[] = [];
  for (const l of listings) {
    const d = l.decl;
    const due = d?.fields.find((f) => f.deadline === true && f.type === 'day')?.id;
    if (!d || !due || !d.fields.some((f) => f.id === 'direction') || !d.fields.some((f) => f.id === 'every')) continue;
    for (const r of l.rows) {
      const next = r[due];
      const stopped = d.state !== undefined && (d.done?.includes(text(r[d.state])) === true || text(r[d.state]) === 'paused');
      if (r.direction !== 'out' || !isDay(next) || stopped) continue;
      const what = text(r[d.title ?? 'what']);
      for (const day of lands(next.slice(0, 10), text(r.every), until)) out.push({ day, late: day < today, what });
    }
  }
  return out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

/** The dues as the months a calendar draws: how many blank cells lead, how many days, and which carry a dot. */
export function calendarOf(dues: readonly Due[], today: string): Month[] {
  if (dues.length === 0) return [];
  const first = dues[0]!.day < today ? dues[0]!.day : today;
  const months: Month[] = [];
  for (let n = 0; n < CALENDAR_MONTHS; n++) {
    const start = plusMonths(`${first.slice(0, 8)}01`, n);
    const key = start.slice(0, 7);
    const t = ms(start);
    const map = new Map<number, { late: boolean; what: string }>();
    for (const p of dues) {
      if (!p.day.startsWith(key)) continue;
      const at = +p.day.slice(8, 10);
      const held = map.get(at);
      map.set(at, { late: p.late || held?.late === true, what: held ? `${held.what}, ${p.what}` : p.what });
    }
    months.push({ key, lead: (new Date(t).getUTCDay() + 6) % 7, days: new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7), 0)).getUTCDate(), dues: map });
  }
  return months;
}

/* ── revenue ───────────────────────────────────────────────────────────────── */

export type Trend = { currency: string; before: number; now: number };

const held = (v: unknown): { amount: number; currency: string } | null => {
  if (typeof v !== 'object' || v === null) return null;
  const { amount, currency } = v as { amount?: unknown; currency?: unknown };
  return typeof amount === 'number' && Number.isFinite(amount) && typeof currency === 'string' ? { amount, currency } : null;
};

/**
 * THE PROJECT'S REVENUE AGAINST THE PERIOD BEFORE, from the two money fields its list declares for it: the first earning
 * field and the one after it, in one currency. Two currencies are never one scale, and two zeros are no trend.
 */
export function trendOf(p: Project): Trend | null {
  const earns = (p.decl?.fields ?? []).filter((f) => f.type === 'money' && /revenue|earn/u.test(f.id));
  const a = earns[0] ? held(p.fields[earns[0].id]) : null;
  const b = earns[1] ? held(p.fields[earns[1].id]) : null;
  if (!a || !b || a.currency !== b.currency || (a.amount <= 0 && b.amount <= 0)) return null;
  return { currency: a.currency, now: a.amount, before: b.amount };
}

/* ── the choice ────────────────────────────────────────────────────────────── */

export type Visual =
  | { kind: 'revenue'; title: string; trend: Trend; rows: DataRow[] }
  | { kind: 'in' | 'out'; title: string; months: Months; rows: DataRow[] }
  | { kind: 'dues'; title: string; calendar: Month[]; dues: Due[]; rows: DataRow[] };

const label = (key: string): string => `${monthShort(+key.slice(5, 7) - 1)} ${key.slice(0, 4)}`;

const monthRows = (kind: string, m: Months, format: VisualData['format']): DataRow[] =>
  m.months.map((x) => ({ key: `${kind}#${x.key}`, title: label(x.key), detail: format(x.value, m.currency), href: null }));

/** The visuals this project earns, in one order: revenue, money in, money out, dues. Those with nothing to draw are absent. */
export function visualsFor(project: Project, data: VisualData): Visual[] {
  const out: Visual[] = [];
  const trend = trendOf(project);
  if (trend) {
    out.push({
      kind: 'revenue',
      title: 'Revenue',
      trend,
      rows: [
        { key: 'revenue#now', title: 'This period', detail: data.format(trend.now, trend.currency), href: null },
        { key: 'revenue#before', title: 'The period before', detail: data.format(trend.before, trend.currency), href: null },
      ],
    });
  }
  /* A SERIES NEEDS TWO MONTHS TO BE A SHAPE: one bar says what the money block already says. */
  if (data.inByMonth && data.inByMonth.total > 0 && data.inByMonth.months.length >= 2) out.push({ kind: 'in', title: 'Money in by month', months: data.inByMonth, rows: monthRows('in', data.inByMonth, data.format) });
  if (data.outByMonth && data.outByMonth.total > 0 && data.outByMonth.months.length >= 2) out.push({ kind: 'out', title: 'Money out by month', months: data.outByMonth, rows: monthRows('out', data.outByMonth, data.format) });
  const dues = duesOf(data.listings, data.today);
  const calendar = calendarOf(dues, data.today);
  if (dues.length > 0) {
    out.push({
      kind: 'dues',
      title: 'Coming due',
      calendar,
      dues,
      rows: dues.slice(0, 12).map((p, i) => ({ key: `dues#${i}`, title: p.what, detail: p.late ? `${p.day}, late` : p.day, href: null })),
    });
  }
  return out;
}
