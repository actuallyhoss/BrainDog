/**
 * `kpis`: a project's key numbers, read with their points, for one project's tile, for Today, or for the cards.
 *
 * A KEY NUMBER IS A ROW, AND ITS VALUES ARE READINGS IT ALREADY HAS. The row says where they come from (`source`): a
 * measure in the record's readings, matched whole or as "measure, project" (the rule Revenue bands reads by), or a
 * figure worked out over lists with the project filled into its `{{it}}`. This file reads the rows and their points and
 * hands each one to the rules in `kpi-rank.ts`, which arrive on the kit (`pages.ts` `SourceKit`), as everything a source
 * needs of the kernel at run time does (`sources/index.ts`).
 *
 * THE LISTS ARE FOUND BY THEIR SHAPE, NEVER BY THEIR IDS, since the kernel names no list a pack declares: the key numbers
 * are the list with a link to the projects and a `measure`, a `figure`, a `today` and a `headline`; the projects are the
 * list that link points at; the readings are every list with an `at`, a `value` or an `amount` and a link to the
 * projects, as a page's `<measure>.<period>` finds them (`readingShape` in `pages.ts`). A record with no list of key
 * numbers draws nothing and says nothing: calm before rich (2.8).
 *
 * THREE FORMS, by `for:`:
 *   project  every live key number of the one project `about:` names, or of the row the page is about, his order first
 *            and the one the card leads with marked `headline`.
 *   today    his pins, then one more a project in play, four at most (`kpisForToday`), each with why it is there.
 *   cards    the one each project leads with (`kpiHeadline`), a project at a time in the projects' own order.
 *
 * THE ANSWER IS THE RENDERER'S `KpiInput` (`packages/render/src/kpis.ts`), so a host hands `kpis` to `Kpis.svelte` as it
 * comes, with each project's colour slot taken from `hue`. A point is a plain number, or money in its stored form
 * (`GBP 1,200.50`), so a reading in another currency is told apart and left out of every sum by the drawer. Beside the
 * renderer's fields each answer carries what the rules worked out: `stale`, `change`, the `chart` its shape picks, and on
 * Today and the cards `rank`, the reason as a word, and `why`, the line said under it.
 *
 * IT READS ACROSS THE RECORD (`whole`): the key numbers, the projects, every list of readings and whatever list a figure
 * counts, which no block declaration names ahead of the rows. So a block over it is a read of the whole record, and a
 * reader held to some lists is shown its shell.
 */

import { refused, type Refusal } from '@braindog/ports';

import type { Json } from '../coerce.ts';
import type { Entry } from '../index.ts';
import type { KpiCandidate, KpiChart, KpiGood, KpiKind, KpiPick, KpiRow, KpiSource, KpiStale, KpiToday, KpiWhy } from '../kpi-rank.ts';
import type { MetricDecl } from '../metrics.ts';
import type { BlockResult, ListShape, PageBlock, PageDeps, SourceKit } from '../pages.ts';
import type { Also, Source } from './index.ts';

/* ── what is answered ─────────────────────────────────────────────────────────────────────────────── */

/** A cadence the renderer reads (`KpiEvery`). */
export type KpiEvery = '1h' | '1d' | '1w' | '1m';

/** One point: a plain number, or money as it is stored (`USD 8,750.00`), at an instant or a day. */
export type KpiPoint = { at: string; value?: number; amount?: string };

/**
 * One key number as a `kpis` block answers it: the renderer's `KpiInput` and what the rules worked out beside it.
 *
 * `kpi` is the row's id and `thing` the project's; `spoken` is the project said as a link holds it (`things#1`), which a host
 * opens the project's page by. `target` is whole units for a plain number or the stored amount for
 * money. `verdict` is `met` or `off` (off target), absent with no target or no value. `change` is a share (0.34 for up
 * 34%) against the period before, `null` when there is nothing fair to compare. `latest` is the newest point, whatever
 * window the points were cut to. `refusal` is why a figure could not be read, and the number is then drawn with none.
 */
export type KpiAnswer = {
  kpi: string;
  name: string;
  thing: string;
  spoken?: string;
  project?: string;
  mark: string | null;
  hue: number | null;
  measures?: string;
  source: KpiSource;
  unit?: string;
  kind: KpiKind;
  good: KpiGood;
  target?: number | string;
  target_by?: string;
  every?: KpiEvery;
  owner?: string;
  today: KpiToday;
  headline: boolean;
  order?: number;
  points: KpiPoint[];
  latest: KpiPoint | null;
  verdict?: 'met' | 'off';
  change: number | null;
  stale: KpiStale;
  chart: KpiChart;
  rank?: KpiWhy;
  why?: string;
  refusal?: Refusal;
};

/* ── the numbers this file holds ─────────────────────────────────────────────────────────────────── */

const DAY = 86_400_000;
/** How far back a level's points reach: ninety days (2.6). */
const BACK_DAYS = 90;
/** How far back a flow's, or a monthly number's, points reach: thirteen months, so a year's change has its month. */
const BACK_LONG_DAYS = 396;
/** The most key numbers a block answers, and how many it answers when it says no `limit:`. */
const MOST = 200;
const FALLBACK = 50;
/** Today shows at most this many, whatever its `limit:` (`MEASURES_MOST`). */
const TODAY_MOST = 12;
const EVERIES: readonly KpiEvery[] = ['1h', '1d', '1w', '1m'];
const NUMBER_TYPES: readonly string[] = ['decimal', 'int', 'integer', 'number'];
const AT_TYPES: readonly string[] = ['instant', 'day', 'date'];
/** The fields only the list of key numbers declares together, beside its link to the projects. */
const KPI_SHAPE: readonly (keyof KpiRow)[] = ['measure', 'figure', 'today', 'headline'];
/** A project not in play: put aside or finished (Portfolio's `lane`), which the kernel reads only to rank by. */
const OUT_OF_PLAY: readonly string[] = ['parked', 'retired'];
const EARNING = 'earning';

/* ── small readers ───────────────────────────────────────────────────────────────────────────────── */

const text = (v: Json | undefined): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);
const num = (v: Json | undefined): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const oneOf = <T extends string>(v: Json | undefined, of: readonly T[]): T | undefined => (typeof v === 'string' && (of as readonly string[]).includes(v) ? (v as T) : undefined);
/** A measure's name as it is matched: case and spacing folded, "Servers ,Oxbow.gg" is "servers, oxbow.gg". */
const folded = (s: string): string => s.toLowerCase().replace(/\s*,\s*/gu, ', ').replace(/\s+/gu, ' ').trim();
/** A money value as a list holds it, an object or its JSON text, or `null`. */
function moneyOf(v: unknown): { minor: number; currency: string } | null {
  let held = v;
  if (typeof held === 'string' && held.startsWith('{')) {
    try {
      held = JSON.parse(held) as unknown;
    } catch {
      return null;
    }
  }
  if (held === null || typeof held !== 'object') return null;
  const m = held as { amount?: unknown; currency?: unknown };
  if (typeof m.amount !== 'number' || !Number.isInteger(m.amount) || typeof m.currency !== 'string' || m.currency.trim() === '') return null;
  return { minor: m.amount, currency: m.currency.trim().toUpperCase() };
}
const instantOf = (at: unknown): number | null => {
  if (typeof at !== 'string' || at === '') return null;
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/u.test(at) ? `${at}T00:00:00Z` : at);
  return Number.isFinite(t) ? t : null;
};

/* ── the lists, by shape ─────────────────────────────────────────────────────────────────────────── */

type Live = ListShape['fields'][number];
const liveOf = (l: ListShape): Live[] => l.fields.filter((f) => !f.retired);

/** The list of key numbers and the projects it points at, or `null` on a record that keeps none. */
function kpiListOf(lists: readonly ListShape[], reads: ((list: string) => boolean) | undefined): { list: string; projects: string } | null {
  for (const l of lists) {
    if (reads && !reads(l.id)) continue;
    const live = liveOf(l);
    const thing = live.find((f) => f.id === ('thing' satisfies keyof KpiRow) && f.type === 'ref' && typeof f.to === 'string');
    if (thing && KPI_SHAPE.every((id) => live.some((f) => f.id === id))) return { list: l.id, projects: thing.to! };
  }
  return null;
}

type ReadingList = { list: string; value: string; amount: boolean; unit: boolean };

/** Every list of readings about the projects: an `at`, a `value` or an `amount`, and a link to the projects. */
function readingListsOf(lists: readonly ListShape[], projects: string, not: string, reads: ((list: string) => boolean) | undefined): ReadingList[] {
  return lists.flatMap((l): ReadingList[] => {
    if (l.id === not || (reads && !reads(l.id))) return [];
    const live = liveOf(l);
    const has = (id: string, types: readonly string[]): boolean => live.some((f) => f.id === id && types.includes(f.type));
    const value = has('value', NUMBER_TYPES);
    const amount = has('amount', ['money']);
    if (!live.some((f) => f.type === 'ref' && f.to === projects) || !has('at', AT_TYPES) || (!value && !amount)) return [];
    return [{ list: l.id, value: value ? 'value' : 'amount', amount, unit: has('unit', ['text']) }];
  });
}

/* ── the readings ────────────────────────────────────────────────────────────────────────────────── */

/** One reading: when, as money or as a plain number, the unit it was written in, and the project it was reported for. */
type Got = { t: number; at: string; money: { minor: number; currency: string } | null; n: number | null; unit: string; project: string | null };

/** Every reading since `since`, and each measure's newest before it, by the measure's folded name. */
function readingsOf(deps: PageDeps, kit: SourceKit, lists: readonly ReadingList[], since: string): Map<string, Got[]> {
  const by = new Map<string, Got[]>();
  const { isMoneyUnit } = kit.kpiRank;
  for (const l of lists) {
    const name = deps.titleOf(l.list);
    if (!name || !deps.readings) continue;
    const read = deps.readings({ register: l.list, when: 'at', value: l.value, name, ...(l.unit ? { unit: 'unit' } : {}), ...(l.amount ? { amount: 'amount' } : {}), since });
    if (!read.ok) continue;
    for (const r of [...read.value.latest, ...read.value.readings]) {
      const t = instantOf(r.at);
      if (t === null || typeof r.name !== 'string' || r.name.trim() === '') continue;
      const unit = typeof r.unit === 'string' ? r.unit.trim() : '';
      const n = typeof r.value === 'number' ? r.value : typeof r.value === 'string' && r.value.trim() !== '' ? Number(r.value) : Number.NaN;
      /* AN OLDER READING IS A DECIMAL WHOSE UNIT IS A CURRENCY, turned into minor units by that currency's digits. */
      const money = moneyOf(r.amount) ?? (Number.isFinite(n) && isMoneyUnit(unit) ? { minor: Math.round(n * 10 ** kit.exponentOf(unit)), currency: unit.toUpperCase() } : null);
      if (!money && !Number.isFinite(n)) continue;
      const got: Got = { t, at: String(r.at), money, n: money ? null : n, unit, project: typeof r.project === 'string' && r.project !== '' ? r.project : null };
      const key = folded(r.name);
      const all = by.get(key);
      if (all) all.push(got);
      else by.set(key, [got]);
    }
  }
  for (const all of by.values()) all.sort((a, b) => a.t - b.t);
  return by;
}

/* ── one key number ──────────────────────────────────────────────────────────────────────────────── */

type Project = { row: Entry; spoken: string | null; title: string; mark: string | null; hue: number | null; inPlay: boolean; earning: boolean };
type Kpi = KpiRow & { id: string };

/** A row of the key numbers as the rules read it, or `null` for one with no name or no project. */
function kpiOf(e: Entry, kit: SourceKit): Kpi | null {
  const f = e.fields;
  const name = text(f.name);
  const thing = text(f.thing);
  if (!name || !thing) return null;
  const amount = moneyOf(f.target_amount);
  const target = amount ? { amount: amount.minor, currency: amount.currency } : num(f.target);
  return {
    id: e.id,
    name,
    thing,
    measures: text(f.measures) ?? null,
    source: oneOf(f.source, kit.kpiRank.KPI_SOURCES) ?? 'numbers',
    measure: text(f.measure) ?? null,
    figure: text(f.figure) ?? null,
    unit: text(f.unit) ?? null,
    kind: oneOf(f.kind, kit.kpiRank.KPI_KINDS) ?? null,
    good: oneOf(f.good, ['up', 'down'] as const) ?? 'up',
    target: target ?? null,
    target_by: text(f.target_by) ?? null,
    every: text(f.every) ?? null,
    owner: text(f.owner) ?? null,
    today: oneOf(f.today, ['auto', 'pinned', 'hidden'] as const) ?? 'auto',
    headline: f.headline === true,
    order: num(f.order) ?? null,
    draft: f.draft === true,
    state: oneOf(f.state, ['live', 'retired'] as const) ?? 'live',
  };
}

/** What one key number's values worked out to: its points, the number it is judged by, its change and its newest. */
type Series = { unit: string | undefined; points: KpiPoint[]; latest: KpiPoint | null; judged: number | null; change: number | null; newest: number | null; count: number; met?: boolean | null; refusal?: Refusal };

type Period = 'day' | 'week' | 'month';
const periodOf = (every: string | null | undefined): Period => (every === '1w' ? 'week' : every === '1d' || every === '1h' ? 'day' : 'month');
/** The start of the period `t` falls in, in UTC as the drawer counts it. */
function startOf(t: number, p: Period): number {
  const d = new Date(t);
  if (p === 'month') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return p === 'day' ? day : day - ((d.getUTCDay() + 6) % 7) * DAY;
}
function nextOf(t: number, p: Period): number {
  if (p !== 'month') return t + (p === 'day' ? DAY : 7 * DAY);
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}
/**
 * ONE PERIOD BACK FROM `t`, a month back to the same day where it has one: the render's `backOf`, so a level's change is
 * against the reading one of its own periods before, as its tile on Today says it (recheck of 30 October, N7: Kiln's
 * downloads read "up 5%" on its page, a month back, and "Down 8.7%" on Today, a week back).
 */
function backOf(t: number, p: Period): number {
  if (p !== 'month') return t - (p === 'day' ? DAY : 7 * DAY);
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() - 1;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Date.UTC(y, m, Math.min(d.getUTCDate(), last), d.getUTCHours(), d.getUTCMinutes());
}

/** A point's number as a line draws it: a plain value, or money in whole units when it is in `currency`, else `null`. */
function pointNumber(p: KpiPoint, currency: string | null): number | null {
  if (typeof p.value === 'number' && Number.isFinite(p.value)) return p.value;
  const m = typeof p.amount === 'string' ? /^([A-Z]{3}) ([−-]?)([\d,]+(?:\.\d+)?)$/u.exec(p.amount.trim()) : null;
  if (!m || (currency !== null && m[1] !== currency)) return null;
  const n = Number(m[3]!.replace(/,/gu, ''));
  return Number.isFinite(n) ? (m[2] === '' ? n : -n) : null;
}

/**
 * A KEY NUMBER AS A CARD'S LINE (`pages.ts` `trendsOf`, a trend column with `kpi: headline`): its points over the last
 * `buckets` periods of its own cadence, the one still running among them, oldest first, as a figure's card trend is.
 * A flow's period is added up and a period with nothing in it is nought, as a count's is; anything else is its last
 * value in the period, and a gap where none came. Money is in whole units of the number's own currency, and a reading in
 * another is left out, as the drawer leaves it. `null` when nothing falls in the periods drawn, which draws no line.
 */
export function kpiTrend(a: { points: KpiPoint[]; kind: KpiKind; every?: KpiEvery; unit?: string }, now: number, buckets: number): (number | null)[] | null {
  const p = periodOf(a.every);
  const starts: number[] = [];
  for (let s = startOf(now, p); starts.length < buckets; s = startOf(s - 1, p)) starts.unshift(s);
  const first = starts[0];
  if (first === undefined) return null;
  const currency = a.unit !== undefined && /^[A-Z]{3}$/u.test(a.unit.toUpperCase()) ? a.unit.toUpperCase() : null;
  const flow = a.kind === 'flow';
  const out: (number | null)[] = starts.map(() => null);
  const timed = a.points.map((pt) => ({ t: instantOf(pt.at), n: pointNumber(pt, currency) })).sort((x, y) => (x.t ?? 0) - (y.t ?? 0));
  for (const { t, n } of timed) {
    if (t === null || n === null || t < first || t >= nextOf(starts.at(-1)!, p)) continue;
    let i = starts.length - 1;
    while (i > 0 && starts[i]! > t) i -= 1;
    out[i] = flow ? (out[i] ?? 0) + n : n;
  }
  if (out.every((v) => v === null)) return null;
  return flow ? out.map((v) => v ?? 0) : out;
}

/** A change from `was` to `now` as a share, or `null` when there is no fair comparison (nothing before, or nought). */
const shareOf = (now: number | null, was: number | null | undefined): number | null =>
  now === null || was === null || was === undefined || was === 0 ? null : (now - was) / Math.abs(was);

/**
 * A key number over readings: the readings of its measure about its project, its unit, one point a day, and what it
 * is judged by.
 *
 * ONE POINT A DAY, as a bucket of `measures.ts` keeps one: a level's last reading of the day, a flow's day added up, so
 * a year of hourly polls is a few hundred points on the wire. A FLOW IS JUDGED BY ITS LAST WHOLE PERIOD, the month
 * before this one for a monthly number, since a month still running is short of any target. A level is judged by its
 * newest, against its value a month before.
 */
function readSeries(k: Kpi, kind: KpiKind, project: Project, readings: Map<string, Got[]>, deps: PageDeps, kit: SourceKit): Series {
  const measure = k.measure ?? k.name;
  const whole = readings.get(folded(measure)) ?? [];
  const glued = readings.get(folded(`${measure}, ${project.title}`)) ?? [];
  const own = [...whole.filter((g) => g.project === k.thing || g.project === project.row.id), ...glued.filter((g) => g.project === null || g.project === k.thing || g.project === project.row.id)];
  own.sort((a, b) => a.t - b.t);

  /* ITS UNIT: the row's own, else its target's currency, else what its newest reading was written in. */
  const newestGot = own.at(-1);
  const targetCurrency = typeof k.target === 'object' && k.target !== null ? k.target.currency : undefined;
  const unit = k.unit ?? targetCurrency ?? newestGot?.money?.currency ?? (newestGot && newestGot.unit !== '' ? newestGot.unit : undefined);
  const money = kit.kpiRank.isMoneyUnit(unit);
  const currency = money ? unit!.toUpperCase() : undefined;
  const exp = currency ? kit.exponentOf(currency) : 0;
  const now = deps.ctx.nowMs;
  const back = kind === 'flow' || k.every === '1m' ? BACK_LONG_DAYS : BACK_DAYS;
  const from = now - back * DAY;

  /* EACH READING AS THIS NUMBER COUNTS IT: money in its own currency in minor units, a plain number on a money number as
     whole units of it, and money in another currency kept as a point the drawer leaves out and counts. */
  type Counted = { t: number; at: string; n: number };
  const counted: Counted[] = [];
  const others: KpiPoint[] = [];
  for (const g of own) {
    if (money) {
      const minor = g.money ? (g.money.currency === currency ? g.money.minor : null) : g.n !== null ? Math.round(g.n * 10 ** exp) : null;
      if (minor === null) {
        if (g.t >= from && g.money) others.push({ at: g.at, amount: kit.moneyText(g.money.minor, g.money.currency) });
        continue;
      }
      counted.push({ t: g.t, at: g.at, n: minor });
    } else {
      const n = g.money ? g.money.minor / 10 ** kit.exponentOf(g.money.currency) : g.n;
      if (n !== null) counted.push({ t: g.t, at: g.at, n });
    }
  }

  /* ONE A DAY, in the record's own days: a flow's day added up, anything else's last reading. */
  const dayOf = kit.localDays(kit.readableZone(deps.tz));
  const days: Counted[] = [];
  for (const c of counted) {
    const last = days.at(-1);
    if (last && dayOf(last.t) === dayOf(c.t)) days[days.length - 1] = kind === 'flow' ? { t: c.t, at: c.at, n: last.n + c.n } : c;
    else days.push(c);
  }
  const say = (c: Counted): KpiPoint => (currency ? { at: c.at, amount: kit.moneyText(c.n, currency) } : { at: c.at, value: c.n });
  let shown = days.filter((c) => c.t >= from);
  /* A NUMBER THAT STOPPED BEFORE THE WINDOW STILL SAYS ITS LAST VALUE, and its day, so a stale one is not a blank. */
  if (shown.length === 0 && days.length > 0) shown = [days.at(-1)!];
  const points = [...shown.map(say), ...others].sort((a, b) => (instantOf(a.at) ?? 0) - (instantOf(b.at) ?? 0));

  const newest = own.length > 0 ? own.at(-1)!.t : null;
  const latestDay = days.at(-1);
  let judged: number | null = null;
  let change: number | null = null;
  let count = shown.length;
  if (kind === 'flow') {
    const p = periodOf(k.every);
    const sums = new Map<number, number>();
    for (const c of days) sums.set(startOf(c.t, p), (sums.get(startOf(c.t, p)) ?? 0) + c.n);
    const done = [...sums.keys()].filter((s) => nextOf(s, p) <= now).sort((a, b) => a - b);
    const last = done.at(-1);
    if (last !== undefined) {
      judged = sums.get(last)!;
      const before = done.at(-2);
      change = before !== undefined && startOf(nextOf(before, p), p) === last ? shareOf(judged, sums.get(before)) : null;
    }
    count = [...sums.keys()].filter((s) => nextOf(s, p) > from).length;
  } else if (latestDay) {
    judged = latestDay.n;
    const was = [...days].reverse().find((c) => c.t <= backOf(latestDay.t, periodOf(k.every)));
    change = shareOf(judged, was?.n);
  }
  return { unit: currency ?? unit, points, latest: latestDay ? say(latestDay) : (points.at(-1) ?? null), judged, change, newest, count };
}

/**
 * A key number over a figure: the figure its row names, its `{{it}}` filled with the project's name, read live.
 *
 * A FIGURE BUCKETED BY A DATE IS ITS OWN HISTORY, one point a bucket (`project-in-by-month`), judged by its last whole
 * bucket. Any other figure is its reading now, and, when it waits for no project, the nightly points its snapshot kept
 * (`metric_point`), so a figure over the whole record has a line from the night it was first read.
 */
function figureSeries(k: Kpi, project: Project, deps: PageDeps, kit: SourceKit): Series {
  const none = (refusal?: Refusal): Series => ({ unit: k.unit ?? undefined, points: [], latest: null, judged: null, change: null, newest: null, count: 0, ...(refusal ? { refusal } : {}) });
  const named = k.figure ?? '';
  const colon = named.indexOf(':');
  const id = colon < 0 ? named : named.slice(0, colon);
  const decl = id === '' ? null : deps.metric(id);
  if (!decl) return none({ code: 'METRIC_UNKNOWN', fix: `${k.name} is worked out from a figure called ${named || 'nothing'}, and there is no figure called that.`, at: 'figure' });
  const waits = JSON.stringify(decl).includes('{{it}}');
  const param = colon < 0 ? (waits ? project.title : undefined) : named.slice(colon + 1);
  const filled = param === undefined ? decl : (kit.fill(decl, null, param) as MetricDecl);
  const read = deps.read(filled);
  if (!read.ok) return none(refused(read) ? read.refusal : undefined);
  const r = read.value;
  const currency = r.unit !== null && kit.kpiRank.isMoneyUnit(r.unit) ? r.unit.toUpperCase() : undefined;
  const unit = k.unit ?? currency ?? (decl.format === 'days' ? 'days' : undefined);
  const say = (at: string, n: number): KpiPoint => (currency ? { at, amount: kit.moneyText(Math.round(n), currency) } : { at, value: n });
  const now = deps.ctx.nowMs;
  const met = r.met;

  if (kit.isBucket(decl.bucket) && r.groups) {
    const bucket = decl.bucket;
    const parts = r.groups.filter((g): g is typeof g & { value: number } => typeof g.value === 'number' && Number.isFinite(g.value));
    const points = parts.map((g) => say(kit.bucketStart(g.key, bucket), g.value));
    /* A BUCKET THE CLOCK HAS LEFT, the first among them though the data began inside it: its money is that month's. */
    const full = parts.filter((g) => (r.current === undefined ? g.state !== 'partial' : g.key < r.current));
    const last = full.at(-1);
    const before = full.at(-2);
    const newest = points.length > 0 ? instantOf(points.at(-1)!.at) : null;
    return { unit, points, latest: points.at(-1) ?? null, judged: last?.value ?? null, change: shareOf(last?.value ?? null, before?.value), newest, count: points.length, met };
  }
  if (r.value === null) return { ...none(), unit, met };
  const at = new Date(now).toISOString();
  const back = new Date(now - BACK_DAYS * DAY).toISOString().slice(0, 10);
  const yesterday = new Date(now - DAY).toISOString().slice(0, 10);
  const kept = waits || !deps.points ? [] : deps.points(decl.metric, back, yesterday).filter((p) => Number.isFinite(p.value));
  const points = [...kept.map((p) => say(p.at, p.value)), say(at, r.value)];
  const was = [...kept].reverse().find((p) => (instantOf(p.at) ?? now) <= backOf(now, periodOf(k.every)));
  const change = typeof r.delta === 'number' && Number.isFinite(r.delta) ? r.delta : shareOf(r.value, was?.value);
  return { unit, points, latest: points.at(-1)!, judged: r.value, change, newest: now, count: points.length, met };
}

/* ── why it is here ──────────────────────────────────────────────────────────────────────────────── */

/** The line under a key number on Today and on a card, by why it is there. Money first and the rest say nothing. */
function whySaid(why: KpiWhy, a: KpiAnswer): string | undefined {
  switch (why) {
    case 'pinned':
      return 'Pinned to Today';
    case 'off-target':
      return 'Off target';
    case 'stale': {
      const days = a.stale.days ?? 0;
      return `Not updated for ${String(days)} day${days === 1 ? '' : 's'}`;
    }
    case 'late':
      return 'Past its target day';
    case 'change': {
      const c = a.change ?? 0;
      return `${c >= 0 ? 'Up' : 'Down'} ${String(Math.round(Math.abs(c) * 100))}%`;
    }
    case 'money':
    case 'rest':
      return undefined;
  }
}

/* ── the block ───────────────────────────────────────────────────────────────────────────────────── */

const invalid = (base: BlockResult, also: Also, fix: string, at: string, allowed?: string[]): BlockResult => ({
  ...base,
  refusals: also({ code: 'DECLARATION_INVALID', fix, at, ...(allowed ? { allowed } : {}) }),
});

function kpisBlock(deps: PageDeps, block: PageBlock, base: BlockResult, also: Also, kit: SourceKit): BlockResult {
  const rank = kit.kpiRank;
  if (block.kind !== 'kpis') return invalid(base, also, `kpis is drawn by a kpis block, and a ${block.kind} block has no key numbers to draw it with.`, 'kind');
  const fault = kit.kpisFault(block as unknown as Readonly<Record<string, unknown>>, 'This kpis block');
  if (fault) return invalid(base, also, fault.fix, fault.at, fault.allowed);
  for (const key of ['where', 'order', 'columns', 'cells'] as const)
    if (block[key] !== undefined) return invalid(base, also, `The key numbers come in their own order, each with what it needs, so a kpis block takes no ${key}:.`, key);
  if (!deps.lists || !deps.readings) return { ...base, refusals: also({ code: 'NOT_IN_THIS_BUILD', fix: 'This BrainDog does not read its key numbers onto a page yet.', at: 'source' }) };

  const reads = deps.ctx.reads;
  const lists = deps.lists();
  const found = kpiListOf(lists, reads);
  if (!found) return { ...base, kpis: [], matched: 0 };

  /* THE PROJECTS, by row id and by spoken id, since a link may hold either and `about:` says the spoken one. */
  const projectRows = kit.everyRow(deps, found.projects, undefined);
  if (!projectRows.ok) return { ...base, refusals: refused(projectRows) ? also(projectRows.refusal) : also() };
  const titleField = deps.titleOf(found.projects);
  const identity = deps.identityOf?.(found.projects) ?? null;
  const projects = new Map<string, Project>();
  const ordered: Project[] = [];
  const bySeq = (a: Entry, b: Entry): number => (a.seq ?? Number.POSITIVE_INFINITY) - (b.seq ?? Number.POSITIVE_INFINITY);
  for (const row of [...projectRows.value.rows].sort(bySeq)) {
    const lane = text(row.fields.lane);
    const { mark, hue } = kit.markOf(row, identity);
    const p: Project = {
      row,
      spoken: row.seq !== null ? `${found.projects}#${String(row.seq)}` : null,
      title: titleField ? (text(row.fields[titleField]) ?? '') : '',
      mark,
      hue,
      inPlay: row.fields.draft !== true && !(lane !== undefined && OUT_OF_PLAY.includes(lane)),
      earning: lane === EARNING,
    };
    ordered.push(p);
    projects.set(row.id, p);
    if (row.seq !== null) projects.set(`${found.projects}#${String(row.seq)}`, p);
  }

  /* WHICH PROJECT, for one project's tile: the one `about:` names, else the row the page is about. */
  let only: Project | null = null;
  if (block.for === 'project') {
    const about = typeof block.about === 'string' ? block.about.trim() : '';
    if (about === '' && deps.here?.register !== found.projects)
      return { ...base, refusals: also({ code: 'REQUIRED_MISSING', fix: 'A kpis block for one project names it with about:, by its row, such as things#1.', at: 'about' }) };
    only = projects.get(about === '' ? deps.here!.id : about) ?? null;
    if (!only) return { ...base, refusals: also({ code: 'VALUE_MALFORMED', fix: `${about || 'This page'} is not a row of ${found.projects}, so there is no project to read.`, at: 'about' }) };
  }

  const kpiRows = kit.everyRow(deps, found.list, undefined);
  if (!kpiRows.ok) return { ...base, refusals: refused(kpiRows) ? also(kpiRows.refusal) : also() };
  const kpis = kpiRows.value.rows
    .map((e) => kpiOf(e, kit))
    .filter((k): k is Kpi => k !== null && rank.kpiLive(k) && projects.has(k.thing) && (only === null || projects.get(k.thing) === only));

  const now = deps.ctx.nowMs;
  const tz = kit.readableZone(deps.tz);
  const at = { now, today: kit.localDays(tz)(now) };
  const since = new Date(now - (BACK_LONG_DAYS + 1) * DAY).toISOString().slice(0, 10);
  const readings = kpis.some((k) => k.source !== 'figure') ? readingsOf(deps, kit, readingListsOf(lists, found.projects, found.list, reads), since) : new Map<string, Got[]>();

  /* EACH KEY NUMBER READ ONCE, whichever form draws it, and handed to the rules as they read one (`KpiCandidate`). */
  const answers = new Map<string, KpiAnswer>();
  const candidates: KpiCandidate[] = [];
  for (const k of kpis) {
    const project = projects.get(k.thing)!;
    const guessed = rank.kpiKind(k);
    const s = k.source === 'figure' ? figureSeries(k, project, deps, kit) : readSeries(k, guessed, project, readings, deps, kit);
    const kind = rank.kpiKind({ ...k, unit: s.unit ?? null });
    /* A NUMBER THAT HAS ONLY EVER SAID NOUGHT IS LEFT OFF (leftovers9, Sam 2 Nov: "remove any $0 cards"): a tile reading
       "$0" over a line along nought tells nobody anything. One with a target is kept, since there nought answers whether
       it is met, and so is one that could not be read, which says why. */
    if (!s.refusal && (k.target === null || k.target === undefined) && s.points.length > 0 && s.points.every((p) => pointNumber(p, null) === 0)) continue;
    /* THE TARGET IN THE UNITS IT IS JUDGED IN: minor units of its currency for money, and none in another currency. */
    const money = rank.isMoneyUnit(s.unit);
    const currency = money ? s.unit!.toUpperCase() : null;
    const t = k.target;
    const target =
      t === null || t === undefined ? null : typeof t === 'number' ? (currency ? Math.round(t * 10 ** kit.exponentOf(currency)) : t) : currency === null || t.currency === currency ? t.amount : null;
    const judged = target !== null ? rank.kpiVerdict(s.judged, target, k.good) : s.met === true ? 'met' : s.met === false ? 'missed' : null;
    /* NOT MISSED BEFORE ITS DAY: a target with a day still to come and not yet met is open, not off. Read as missed, a
       count aiming for 60 by December was "Off target" in September at 52. Its day passed, it is missed. */
    const verdict = judged === 'missed' && typeof k.target_by === 'string' && k.target_by >= at.today ? null : judged;
    const stale = rank.kpiStale(k, s.newest, now);
    const chart = rank.kpiChart({ kind, points: s.count, target: target !== null });
    const said = t === null || t === undefined ? undefined : typeof t === 'number' ? t : kit.moneyText(t.amount, t.currency);
    const every = oneOf(k.every ?? undefined, EVERIES);
    const answer: KpiAnswer = {
      kpi: k.id,
      name: k.name,
      thing: project.row.id,
      ...(project.spoken ? { spoken: project.spoken } : {}),
      ...(project.title ? { project: project.title } : {}),
      mark: project.mark,
      hue: project.hue,
      ...(k.measures ? { measures: k.measures } : {}),
      source: k.source ?? 'numbers',
      ...(s.unit ? { unit: s.unit } : {}),
      kind,
      good: k.good ?? 'up',
      ...(said !== undefined ? { target: said } : {}),
      ...(k.target_by ? { target_by: k.target_by } : {}),
      ...(every ? { every } : {}),
      ...(k.owner ? { owner: k.owner } : {}),
      today: k.today ?? 'auto',
      headline: k.headline === true,
      ...(typeof k.order === 'number' ? { order: k.order } : {}),
      points: s.points,
      latest: s.latest,
      ...(verdict === 'met' ? { verdict: 'met' as const } : verdict === 'missed' ? { verdict: 'off' as const } : {}),
      change: s.change,
      stale,
      chart,
      ...(s.refusal ? { refusal: s.refusal } : {}),
    };
    answers.set(k.id, answer);
    candidates.push({ ...k, thing: project.row.id, unit: s.unit ?? null, kind, verdict, change: s.change, newest: s.newest, inPlay: project.inPlay, earning: project.earning });
  }

  const ranked = (pick: KpiPick): KpiAnswer => {
    const a = answers.get(pick.kpi.id)!;
    const why = whySaid(pick.why, a);
    return { ...a, rank: pick.why, ...(why ? { why } : {}) };
  };
  const most = (fallback: number, cap: number): number =>
    typeof block.limit === 'number' && Number.isFinite(block.limit) ? Math.min(cap, Math.max(0, Math.floor(block.limit))) : fallback;

  if (block.for === 'today') {
    const picks = rank.kpisForToday(candidates, at, most(rank.KPI_TODAY_MOST, TODAY_MOST));
    return { ...base, kpis: picks.map(ranked), matched: rank.kpiRanked(candidates, at).length, kpi_list: found.list };
  }

  if (block.for === 'cards') {
    const out: KpiAnswer[] = [];
    for (const p of ordered) {
      const pick = rank.kpiHeadline(candidates, p.row.id, at);
      if (pick) out.push(ranked(pick));
    }
    return { ...base, kpis: out.slice(0, most(FALLBACK, MOST)), matched: out.length, kpi_list: found.list };
  }

  /* ONE PROJECT: his order, then the name, and the one its card leads with marked, which the tile draws large. */
  const lead = rank.kpiHeadline(candidates, only!.row.id, at)?.kpi.id ?? null;
  const order = (k: KpiCandidate): number => (typeof k.order === 'number' && Number.isFinite(k.order) ? k.order : Number.POSITIVE_INFINITY);
  const own = [...candidates].sort((a, b) => order(a) - order(b) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const out = own.map((k) => ({ ...answers.get(k.id)!, headline: k.id === lead }));
  return { ...base, kpis: out.slice(0, most(FALLBACK, MOST)), matched: out.length, kpi_list: found.list };
}

/* IT DRAWS AS ITS OWN KIND (`computed-set.ts` reads `drawsAs`), so the add-block picker asks for kpis and spells no source. */
export const kpisSource: Source & { drawsAs: string } = {
  drawsAs: 'kpis',
  says: "a project's key numbers with their points, for: project, today or cards",
  whole: true,
  read: kpisBlock,
};
