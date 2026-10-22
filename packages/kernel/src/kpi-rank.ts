/**
 * A project's KPIs, ranked and shaped: which kind each one is, which chart draws it, whether it has stopped arriving,
 * which four lead Today, and which one leads its project's card (`loop/plans/kpis-2026-10-21/PLAN.md` 2.3 to 2.5).
 *
 * WHY THIS IS ITS OWN FILE. The `kpis` page source (K2-A) reads the rows and their readings; what it does with them is
 * a handful of rules the owner decided on 21 October, and a rule kept inside a reader that touches the store is a rule
 * no test can hold still. So every rule is here, pure: no clock (the moment is passed in), no store, and nothing
 * imported but the runtime's list of currencies.
 *
 * THE KERNEL NAMES NO LANE. Which projects are in play and which earn is Portfolio's word (`lane`), so a candidate
 * carries `inPlay` and `earning` as booleans and the reader maps the lane onto them.
 *
 * THE RULES, each one constant below:
 *   - KIND: the row's own `kind` when it is one of the five; else a currency is money over time (`flow`), `%` is a
 *     `share`, a figure worked out over lists or a count of days is a `count`, and anything else is a `level`.
 *   - CHART: under three points, the number alone (`SERIES_POINTS`). From three: money over time a line,
 *     a share a split, progress a bar with its target marked (a `level` without a target), a count the number and a
 *     sparkline, a level the number and a sparkline on a tile and a line on its page. A trend only from six.
 *   - STALE: the newest point older than two of its cadence (`FEED_LATE_PERIODS`, held equal by the test), fourteen
 *     days with no cadence. A KPI with no point has stopped nothing, and a figure is read live, so neither is stale.
 *   - TODAY: his pins first in his order, then one auto KPI per project in play, by tier: off target, stale, past its
 *     date and not met, a change of a fifth or more, money, the rest. Ties: earning before not, then his order, then
 *     the name. Four in all, two on a phone. Hidden, retired and draft KPIs never show.
 *   - HEADLINE: the KPI marked `headline`, else the project's top KPI by the same score, else none (the card falls back
 *     to what it says now).
 */

import { isCurrencyCode } from './coerce.ts';

/* ── the rules, one line each ─────────────────────────────────────────────────────────────────────── */

/** A chart is drawn from this many points, and under it the number alone (`SERIES_POINTS` in the renderer). */
export const KPI_CHART_POINTS = 3;
/** A trend is fitted from this many points (`TREND_POINTS`, `trend.ts`). */
export const KPI_TREND_POINTS = 6;
/** A KPI is stale when its newest point is older than this many of its cadence (`FEED_LATE_PERIODS`, `signs.ts`). */
export const KPI_LATE_PERIODS = 2;
/** With no cadence, a KPI is stale after this many days. */
export const KPI_STALE_DAYS = 14;
/** A change against its window is big from this share either way (08 §2.4's comparison gate, 20%). */
export const KPI_BIG_CHANGE = 0.2;
/** Today shows this many KPIs at most (`FIGURES_HOME_MOST`, `pages.ts`)... */
export const KPI_TODAY_MOST = 4;
/** ...and this many on a phone. */
export const KPI_TODAY_PHONE = 2;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** A cadence's unit in milliseconds. A month is thirty days, as the record's other windows count it. */
const EVERY_UNIT: Readonly<Record<string, number>> = { h: HOUR, d: DAY, w: 7 * DAY, m: 30 * DAY };

/* ── the row (2.1) ────────────────────────────────────────────────────────────────────────────────── */

export const KPI_SOURCES = ['numbers', 'figure', 'feed', 'agent', 'typed'] as const;
export const KPI_KINDS = ['level', 'flow', 'share', 'progress', 'count'] as const;

export type KpiSource = (typeof KPI_SOURCES)[number];
export type KpiKind = (typeof KPI_KINDS)[number];
export type KpiGood = 'up' | 'down';
export type KpiToday = 'auto' | 'pinned' | 'hidden';
export type KpiState = 'live' | 'retired';
/** Money as the record stores it: minor units and a currency. */
export type KpiMoney = { amount: number; currency: string };

/** A row of the `kpis` list, its field names exactly as 2.1 of the plan. Everything but `name` and `thing` may be absent. */
export type KpiRow = {
  name: string;
  thing: string;
  measures?: string | null;
  source?: KpiSource | null;
  measure?: string | null;
  figure?: string | null;
  unit?: string | null;
  kind?: KpiKind | null;
  good?: KpiGood | null;
  target?: number | KpiMoney | null;
  target_by?: string | null;
  every?: string | null;
  owner?: string | null;
  today?: KpiToday | null;
  headline?: boolean | null;
  order?: number | null;
  draft?: boolean | null;
  state?: KpiState | null;
};

/* ── kind ─────────────────────────────────────────────────────────────────────────────────────────── */

/** Whether a unit is a currency code, in either case. */
export const isMoneyUnit = (unit: string | null | undefined): boolean => {
  const u = (unit ?? '').trim();
  return /^[A-Za-z]{3}$/.test(u) && isCurrencyCode(u.toUpperCase());
};

/** Whether a KPI is money: its unit is a currency, or its target is a money value. */
export function kpiIsMoney(row: Pick<KpiRow, 'unit' | 'target'>): boolean {
  if (isMoneyUnit(row.unit)) return true;
  const t = row.target;
  return typeof t === 'object' && t !== null && isMoneyUnit(t.currency);
}

/** A KPI's kind: its own when it names one of the five, else the default from its source and unit. */
export function kpiKind(row: Pick<KpiRow, 'kind' | 'source' | 'unit' | 'target'>): KpiKind {
  if (row.kind && (KPI_KINDS as readonly string[]).includes(row.kind)) return row.kind;
  if (kpiIsMoney(row)) return 'flow';
  const unit = (row.unit ?? '').trim().toLowerCase();
  if (unit === '%') return 'share';
  if (row.source === 'figure' || unit === 'days' || unit === 'day') return 'count';
  return 'level';
}

/* ── chart ────────────────────────────────────────────────────────────────────────────────────────── */

/** `line` across the tile, `bars` by bucket, `split` a share bar, `bar` a bar to a target, `spark` the number and a sparkline, `number` the number alone. */
export type KpiChartKind = 'line' | 'bars' | 'split' | 'bar' | 'spark' | 'number';
/** How a target is drawn: a thin line across the chart, a mark on the bar, or not at all (said as text). */
export type KpiTargetMark = 'line' | 'mark' | null;
export type KpiChart = { chart: KpiChartKind; target: KpiTargetMark; trend: boolean };

/**
 * The chart for a KPI of this kind with this many points. `where` is a tile (Today, a card, the project's grid) or the
 * KPI's own page; only `level` and `flow` differ between the two. Under three points it is the number alone, whatever
 * the kind, its target said beside it. A progress KPI with no target has nothing to fill a bar to, so it draws as a level.
 */
export function kpiChart(input: { kind: KpiKind; points: number; target?: boolean; where?: 'tile' | 'page' }): KpiChart {
  const { kind, points } = input;
  const hasTarget = input.target === true;
  const page = input.where === 'page';
  if (!(points >= KPI_CHART_POINTS)) return { chart: 'number', target: null, trend: false };
  const trend = points >= KPI_TREND_POINTS;
  const line = (chart: KpiChartKind): KpiChart => ({ chart, target: hasTarget ? 'line' : null, trend });
  switch (kind) {
    case 'flow':
      return line(page ? 'bars' : 'line');
    case 'share':
      return { chart: 'split', target: hasTarget ? 'mark' : null, trend: false };
    case 'progress':
      return hasTarget ? { chart: 'bar', target: 'mark', trend: false } : line(page ? 'line' : 'spark');
    case 'count':
      return line('spark');
    case 'level':
      return line(page ? 'line' : 'spark');
  }
}

/* ── stale ────────────────────────────────────────────────────────────────────────────────────────── */

/** A cadence in milliseconds: `1h`, `1d`, `2w`, `1m`, or `null` when there is none or it does not read. */
export function everyMs(every: string | null | undefined): number | null {
  const m = /^\s*(\d+)\s*([hdwm])\s*$/i.exec(every ?? '');
  if (!m) return null;
  const n = Number(m[1]);
  const unit = EVERY_UNIT[m[2]!.toLowerCase()]!;
  return n > 0 ? n * unit : null;
}

/** What puts a stale KPI right, by where its values come from; the words are the app's. */
export type KpiFix = 'add-value' | 'ask-agent' | 'check-feed' | 'set-up';
export type KpiStale = { stale: boolean; days: number | null; fix: KpiFix | null };

/** The fix for a stale KPI: type it, ask the agent, check the feed, or, for readings nobody keeps, set it up to fill itself. */
export function kpiFix(row: Pick<KpiRow, 'source' | 'owner'>): KpiFix | null {
  switch (row.source ?? 'numbers') {
    case 'typed':
      return 'add-value';
    case 'agent':
      return 'ask-agent';
    case 'feed':
      return 'check-feed';
    case 'numbers':
      return (row.owner ?? '').trim() === '' ? 'set-up' : 'add-value';
    case 'figure':
      return null;
  }
}

/**
 * Whether a KPI has stopped arriving: its newest point (`newest`, ms) older than two of its cadence, or fourteen days
 * with none. `days` is whole days since the newest point, said whether stale or not. No point at all is not stale
 * (nothing stopped), and a figure is worked out live from lists, so it is never stale either.
 */
export function kpiStale(row: Pick<KpiRow, 'every' | 'source' | 'owner'>, newest: number | null | undefined, now: number): KpiStale {
  if (newest === null || newest === undefined || !Number.isFinite(newest)) return { stale: false, days: null, fix: null };
  const age = Math.max(0, now - newest);
  const days = Math.floor(age / DAY);
  if (row.source === 'figure') return { stale: false, days, fix: null };
  const every = everyMs(row.every);
  const after = every === null ? KPI_STALE_DAYS * DAY : KPI_LATE_PERIODS * every;
  const stale = age > after;
  return { stale, days, fix: stale ? kpiFix(row) : null };
}

/* ── verdict ──────────────────────────────────────────────────────────────────────────────────────── */

export type KpiVerdict = 'met' | 'missed' | null;

/** Met or missed, by which way is good; `null` with no value or no target. A money target is compared in minor units. */
export function kpiVerdict(latest: number | null | undefined, target: number | KpiMoney | null | undefined, good: KpiGood | null | undefined): KpiVerdict {
  if (latest === null || latest === undefined || !Number.isFinite(latest)) return null;
  const t = typeof target === 'object' && target !== null ? target.amount : target;
  if (t === null || t === undefined || !Number.isFinite(t)) return null;
  const met = good === 'down' ? latest <= t : latest >= t;
  return met ? 'met' : 'missed';
}

/* ── the Today score ──────────────────────────────────────────────────────────────────────────────── */

/**
 * One KPI as the ranking reads it: its row, plus what the reader worked out. `id` is the row's id. `verdict` and
 * `change` (a share, 0.34 for up 34%, `null` when the window gives no fair comparison) come from the figure engine;
 * `newest` is the newest point's moment in ms. `inPlay` defaults to true and `earning` to false.
 */
export type KpiCandidate = KpiRow & {
  id: string;
  verdict?: KpiVerdict;
  change?: number | null;
  newest?: number | null;
  inPlay?: boolean;
  earning?: boolean;
};

/** Why a KPI is where it is, in rank order; the words are the app's. */
export type KpiWhy = 'pinned' | 'off-target' | 'stale' | 'late' | 'change' | 'money' | 'rest';
const TIERS: readonly KpiWhy[] = ['pinned', 'off-target', 'stale', 'late', 'change', 'money', 'rest'];

/** The moment the score is read at, and the day it is (`YYYY-MM-DD`, the record's zone; UTC's day when absent). */
export type KpiNow = { now: number; today?: string };

const dayOf = (at: KpiNow): string => at.today ?? new Date(at.now).toISOString().slice(0, 10);

/** Whether a KPI shows anywhere: live and kept. */
export const kpiLive = (k: Pick<KpiRow, 'state' | 'draft'>): boolean => (k.state ?? 'live') === 'live' && k.draft !== true;

/** A KPI's place: its tier (lower leads) and why. A pin leads every tier; otherwise the first of its reasons that holds. */
export function kpiScore(k: KpiCandidate, at: KpiNow): { tier: number; why: KpiWhy } {
  const why = whyOf(k, at);
  return { tier: TIERS.indexOf(why), why };
}

function whyOf(k: KpiCandidate, at: KpiNow): KpiWhy {
  if (k.today === 'pinned') return 'pinned';
  if (k.verdict === 'missed') return 'off-target';
  if (kpiStale(k, k.newest, at.now).stale) return 'stale';
  if (k.target_by && k.target_by < dayOf(at) && k.verdict !== 'met' && k.target !== null && k.target !== undefined) return 'late';
  if (typeof k.change === 'number' && Number.isFinite(k.change) && Math.abs(k.change) >= KPI_BIG_CHANGE) return 'change';
  if (kpiIsMoney(k)) return 'money';
  return 'rest';
}

/** His order, absent last. */
const orderOf = (k: KpiCandidate): number => (typeof k.order === 'number' && Number.isFinite(k.order) ? k.order : Number.POSITIVE_INFINITY);
const byName = (a: KpiCandidate, b: KpiCandidate): number => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const byOrder = (a: KpiCandidate, b: KpiCandidate): number => orderOf(a) - orderOf(b) || byName(a, b);

export type KpiPick = { kpi: KpiCandidate; why: KpiWhy };

/** Every live KPI that may show on Today, best first: pins in his order, then by tier, earning before not, his order, the name. */
export function kpiRanked(kpis: readonly KpiCandidate[], at: KpiNow): KpiPick[] {
  const scored = kpis
    .filter((k) => kpiLive(k) && k.today !== 'hidden' && (k.today === 'pinned' || k.inPlay !== false))
    .map((k) => ({ k, ...kpiScore(k, at) }));
  scored.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a.why === 'pinned') return byOrder(a.k, b.k);
    const earn = Number(b.k.earning === true) - Number(a.k.earning === true);
    return earn || byOrder(a.k, b.k);
  });
  return scored.map(({ k, why }) => ({ kpi: k, why }));
}

/**
 * Today's KPIs: his pins first, then one auto KPI per project, `most` in all (four, two on a phone). A pin takes no
 * project's one place, so a project may show its pin and one more.
 */
export function kpisForToday(kpis: readonly KpiCandidate[], at: KpiNow, most: number = KPI_TODAY_MOST): KpiPick[] {
  const out: KpiPick[] = [];
  const projects = new Set<string>();
  for (const pick of kpiRanked(kpis, at)) {
    if (out.length >= most) break;
    if (pick.why !== 'pinned') {
      if (projects.has(pick.kpi.thing)) continue;
      projects.add(pick.kpi.thing);
    }
    out.push(pick);
  }
  return out;
}

/* ── the card's headline ──────────────────────────────────────────────────────────────────────────── */

/**
 * The KPI one project's card and hero lead with: the live one marked `headline` (by his order when he marked more than
 * one), else its top KPI by the Today score with hidden ones counted (a card is not Today), else `null`, and the card
 * says what it says now. Only the KPIs of `thing` are read, so the whole list may be passed.
 */
export function kpiHeadline(kpis: readonly KpiCandidate[], thing: string, at: KpiNow): KpiPick | null {
  const own = kpis.filter((k) => k.thing === thing && kpiLive(k));
  const marked = own.filter((k) => k.headline === true).sort(byOrder)[0];
  if (marked) return { kpi: marked, why: kpiScore(marked, at).why };
  const top = kpiRanked(
    own.map((k): KpiCandidate => ({ ...k, inPlay: true, today: k.today === 'hidden' ? 'auto' : (k.today ?? 'auto') })),
    at,
  )[0];
  if (!top) return null;
  return { kpi: own.find((k) => k.id === top.kpi.id)!, why: top.why };
}
