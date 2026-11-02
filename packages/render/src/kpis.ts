/**
 * What a `kpis` block decides, as functions the drawer calls: each KPI's figure, its change on the period before, its
 * target, whether it has stopped arriving, and the chart its shape picks (2.4 and 2.8).
 *
 * A KPI arrives as the page source answers it (2.1's field names): a name, a unit, a shape (`kind`), which way is good,
 * a target and its day, a cadence, and its readings. Everything printed comes back from here, so a test reads the
 * block without a DOM.
 *
 * THE SHAPE PICKS THE CHART:
 *
 *   flow      revenue a month, orders    summed per period, an area, the period still running faint
 *   level     MRR, servers, players      the last reading per point, a line
 *   count     open bugs, days quiet      a line, small
 *   share     conversion %, churn %      a ring of the latest share, 0 to 100
 *   progress  users to 1,000 by 1 Dec    a bar toward the target with a mark where it stands
 *
 * THE THREE-POINT RULE: under three points the KPI is its number, its date and its target, never a chart.
 *
 * MONEY IS WRITTEN BY `money.ts` AND NEVER ADDED ACROSS CURRENCIES. A money KPI's unit is its currency; a reading in
 * another currency is left out of every sum and every line, and the KPI says how many were left out.
 *
 * No import from the app or the kernel: this package is MIT and embeddable.
 */

import { readAmount, moneyWhole, writeAmount, type WrittenAmount } from './money.ts';
import { exponentOf } from './format.ts';

/* ---- What arrives -------------------------------------------------------------------------------------------- */

export type KpiKind = 'level' | 'flow' | 'share' | 'progress' | 'count';
export type KpiSource = 'numbers' | 'figure' | 'feed' | 'agent' | 'typed';
export type KpiEvery = '1h' | '1d' | '1w' | '1m';

/**
 * One reading. `value` is a plain number, in whole units for money (`1200.5` is £1,200.50); `amount` is the stored form
 * a Numbers row holds (`GBP 1,200.50`), read by `money.ts` and left out when its currency is not the KPI's.
 */
export type KpiPoint = { at: string; value?: number | null; amount?: string | null; by?: string };

/** A KPI as the page source answers it. Field names are the `kpis` list's (2.1). */
export type KpiInput = {
  /** The KPI row's id, for the key and the fix. */
  kpi?: string;
  name: string;
  /** The project's name, said on Today's rows. */
  project?: string;
  /** The project's colour slot (`blue`, `teal`), drawn as `--chart-1` on Today's rows. Inside a project the page sets it. */
  slot?: string;
  measures?: string;
  source?: KpiSource;
  /** `USD`, `GBP`, `players`, `%`, `days`. A currency code makes it money. */
  unit?: string;
  kind?: KpiKind;
  good?: 'up' | 'down';
  /** What good looks like: whole units, or a stored amount (`GBP 10,000.00`). */
  target?: number | string | null;
  target_by?: string | null;
  every?: KpiEvery | null;
  headline?: boolean;
  /** The source's own verdict, which wins over the one worked out here. */
  verdict?: 'met' | 'on' | 'off' | null;
  /** Why it is on Today ("Up 34% on last month"), from the ranking. */
  why?: string;
  points: readonly KpiPoint[];
};

/* ---- What is drawn ------------------------------------------------------------------------------------------- */

/** A figure in parts: the code before (`EGP`), the figure, and what comes after it (`USD`, `players`, `days`). */
export type KpiFigure = { text: string; before: string; main: string; after: string };

export type KpiChange = {
  dir: 'up' | 'down' | 'flat';
  /** `good` when it moved the way that is good, `warn` the other way; `null` when flat. Never colour alone: `said` has the word. */
  tone: 'good' | 'warn' | null;
  /** `Up 12%`, `Down £450`, `No change`. */
  said: string;
  /** `on Sep`, `since 2 Sep`. */
  against: string;
};

export type KpiTarget = {
  value: string;
  /** `by 1 Dec`, or '' with no day. */
  by: string;
  /** `met` good, `off` the one red a KPI may say, `open` neither. */
  state: 'met' | 'open' | 'off';
  said: string;
};

export type KpiStale = { said: string; fix: string };

/** A tick along the bottom of the lead's chart, placed from 0 to 1. */
export type KpiTick = { at: string; label: string; align: 'start' | 'middle' | 'end' };

export type KpiChart = {
  form: 'line' | 'area' | 'ring' | 'bar';
  /** In the `0 0 1000 100` box: the line, broken at a gap. */
  line: string;
  /** The period still running, a faint dot where it stands so far (flow). */
  partial: string;
  /** The fill under an area, closed to the floor. */
  area: string;
  /** A dot at the last whole value. */
  end: string;
  /** The target across the chart, y from 0 to 100, labelled once. */
  target: { y: string; label: string } | null;
  ticks: KpiTick[];
  /** The highest and lowest the scale reaches, written for an axis. */
  top: string;
  bottom: string;
  /** A share's ring: the arc of 100, and where the target sits on it. */
  ring: { dash: string; mark: string | null } | null;
  /** A progress bar: how much is filled, where the target falls when it is passed, and the share of it reached. */
  bar: { fill: string; mark: string | null; share: string } | null;
};

export type KpiView = {
  key: string;
  name: string;
  project: string;
  slot: string;
  kind: KpiKind;
  headline: boolean;
  /** `null` when nothing has arrived. */
  figure: KpiFigure | null;
  /** When the figure is from: `21 Oct`, `in Sep`. */
  when: string;
  /** A flow's period still running: `£1,100 so far in Oct`. */
  sofar: string;
  change: KpiChange | null;
  target: KpiTarget | null;
  stale: KpiStale | null;
  /** `Last reading 2 Sep`, when the newest reading is older than `KPI_AGED_DAYS` and the KPI is not stale, else ''. */
  aged: string;
  chart: KpiChart | null;
  /** `2 readings in EUR left out`, when a money KPI was handed another currency. */
  left: string;
  why: string;
  /** The KPI in one sentence, the chart's accessible name. */
  sentence: string;
  input: KpiInput;
};

export type KpisPlan = { lead: KpiView | null; rest: KpiView[]; rows: KpiView[] };

/* ---- The numbers the plan holds ------------------------------------------------------------------------------- */

/** Under this many points a KPI is its number, never a chart (2.4). */
export const KPI_CHART_POINTS = 3;
/** A KPI is stale when its newest point is older than this many periods of its cadence (`FEED_LATE_PERIODS`). */
export const KPI_LATE_PERIODS = 2;
/** With no cadence, stale after this many days. */
export const KPI_QUIET_DAYS = 14;
/**
 * A reading older than this many days says its day, stale or not ("a number older than a
 * week says how old it is"). Stale is the rhythm's verdict, with a fix; this is only the age, said once beside the figure.
 */
export const KPI_AGED_DAYS = 7;
export const kpiAgedSaid = (day: string): string => `Last reading ${day}`;
/** The project page's tile: the lead and at most this many more. */
export const KPIS_MORE = 5;
/** Today: at most this many rows. */
export const KPIS_TODAY = 4;

/** The fix a stale KPI offers, chosen by where its values come from (2.3). */
export const KPI_FIX: Readonly<Record<KpiSource, string>> = {
  typed: "Add today's value",
  agent: 'Ask Claude to report it',
  feed: 'Check the feed',
  numbers: 'Set it up to fill itself',
  figure: 'Check the lists it reads',
};

export const KPI_NO_VALUE = 'No reading yet';
export const kpiStaleSaid = (day: string): string => `Not updated since ${day}`;
export const kpiLeftSaid = (n: number, currency: string): string => `${n} reading${n === 1 ? '' : 's'} in ${currency} left out`;

/* ---- Small pieces -------------------------------------------------------------------------------------------- */

const DAY = 86_400_000;
const MINUS = '−';
const EVERY_MS: Record<KpiEvery, number> = { '1h': 3_600_000, '1d': DAY, '1w': 7 * DAY, '1m': 30 * DAY };

/** Two decimals at most, and no trailing zeros, so an attribute stays short and exact. */
const at = (n: number): string => String(Math.round(n * 100) / 100);

let currencies: Set<string> | undefined;
/** A unit is money when it is a currency code the runtime knows. */
export const isMoneyUnit = (unit: string | undefined): boolean =>
  typeof unit === 'string' && /^[A-Z]{3}$/u.test(unit) && (currencies ??= new Set(Intl.supportedValuesOf('currency'))).has(unit);

const time = (s: string | null | undefined): number | null => {
  if (!s) return null;
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/u.test(s) ? `${s}T00:00:00Z` : s);
  return Number.isFinite(t) ? t : null;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2 Oct`, with the year when it is not this year's. */
export function kpiDay(t: number, now: number): string {
  const d = new Date(t);
  const y = d.getUTCFullYear();
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${y === new Date(now).getUTCFullYear() ? '' : ` ${y}`}`;
}

const monthSaid = (t: number, now: number): string => {
  const d = new Date(t);
  const y = d.getUTCFullYear();
  return `${MONTHS[d.getUTCMonth()]}${y === new Date(now).getUTCFullYear() ? '' : ` ${y}`}`;
};

/** A plain number as a figure: whole from a thousand, one place from ten, two under, no trailing zeros, a true minus. */
function plain(n: number): string {
  const a = Math.abs(n);
  const most = a >= 1000 ? 0 : a >= 10 ? 1 : 2;
  const said = new Intl.NumberFormat('en-GB', { maximumFractionDigits: most }).format(a);
  return `${n < 0 && said !== '0' ? MINUS : ''}${said}`;
}

/** A plain number for an axis: `12k`, `1.6m`. */
function compactPlain(n: number): string {
  const a = Math.abs(n);
  const steps: [number, string][] = [
    [1e9, 'bn'],
    [1e6, 'm'],
    [1e3, 'k'],
  ];
  const sign = n < 0 && a > 0 ? MINUS : '';
  for (const [size, word] of steps) {
    if (a >= size) {
      const v = a / size;
      return `${sign}${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10}${word}`;
    }
  }
  return `${sign}${a >= 10 ? Math.round(a) : Math.round(a * 10) / 10}`;
}

/* ---- Reading the readings ------------------------------------------------------------------------------------ */

type Read = { t: number; n: number };

/**
 * Each reading as a time and a number, oldest first. For money the number is whole MINOR units, so a sum is exact
 * and is handed back to `money.ts` as it is. A reading in another currency is counted in `left`, never added.
 */
function readPoints(k: KpiInput, money: boolean): { reads: Read[]; left: number } {
  const unit = k.unit ?? '';
  const exp = money ? exponentOf(unit) : 0;
  const reads: Read[] = [];
  let left = 0;
  for (const p of k.points) {
    const t = time(p.at);
    if (t === null) continue;
    if (typeof p.amount === 'string' && p.amount.trim() !== '') {
      const a = readAmount(p.amount.trim());
      if (!a) continue;
      if (money && a.currency !== unit) {
        left += 1;
        continue;
      }
      reads.push({ t, n: money ? Number(a.minor) : Number(a.minor) / 10 ** exponentOf(a.currency) });
      continue;
    }
    if (typeof p.value === 'number' && Number.isFinite(p.value)) reads.push({ t, n: money ? Math.round(p.value * 10 ** exp) : p.value });
  }
  reads.sort((a, b) => a.t - b.t);
  return { reads, left };
}

/** The target in the same units as the readings (minor for money), or `null`. A stored amount in another currency is none. */
function readTarget(k: KpiInput, money: boolean): number | null {
  const t = k.target;
  if (t === null || t === undefined || t === '') return null;
  if (typeof t === 'number') return Number.isFinite(t) ? (money ? Math.round(t * 10 ** exponentOf(k.unit ?? '')) : t) : null;
  const a = readAmount(t.trim());
  if (a) return money && a.currency === k.unit ? Number(a.minor) : money ? null : Number(a.minor) / 10 ** exponentOf(a.currency);
  const n = Number(t.replace(/,/gu, ''));
  return Number.isFinite(n) ? (money ? Math.round(n * 10 ** exponentOf(k.unit ?? '')) : n) : null;
}

/* ---- Periods ------------------------------------------------------------------------------------------------- */

type Period = 'day' | 'week' | 'month';

const periodOf = (every: KpiEvery | null | undefined): Period => (every === '1w' ? 'week' : every === '1d' || every === '1h' ? 'day' : 'month');

function startOf(t: number, p: Period): number {
  const d = new Date(t);
  if (p === 'month') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return p === 'day' ? day : day - ((d.getUTCDay() + 6) % 7) * DAY;
}

function nextOf(t: number, p: Period): number {
  if (p === 'month') {
    const d = new Date(t);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  }
  return t + (p === 'day' ? DAY : 7 * DAY);
}

/** One period back from `t`, a month back to the same day where it has one. */
function backOf(t: number, p: Period): number {
  if (p !== 'month') return t - (p === 'day' ? DAY : 7 * DAY);
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() - 1;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Date.UTC(y, m, Math.min(d.getUTCDate(), last), d.getUTCHours(), d.getUTCMinutes());
}

const periodSaid = (t: number, p: Period, now: number): string =>
  p === 'month' ? monthSaid(t, now) : p === 'week' ? `the week of ${kpiDay(t, now)}` : kpiDay(t, now);

/* ---- The figure ---------------------------------------------------------------------------------------------- */

/** A number in the KPI's unit, in parts. `axis` writes it compact, for a chart's scale. */
export function kpiFigure(n: number, unit: string | undefined, home: string | null, axis = false): KpiFigure {
  if (unit !== undefined && isMoneyUnit(unit)) {
    const w: WrittenAmount | null = axis ? writeAmount({ minor: Math.round(n), currency: unit }, home, 'axis') : moneyWhole(Math.round(n), unit, home);
    if (w) {
      const before = w.codePlace === 'before' ? w.code : '';
      const after = w.codePlace === 'after' ? w.code : '';
      return { text: w.text, before, main: `${w.minus}${w.sign}${w.whole}${w.fraction}`, after };
    }
  }
  const main = axis ? compactPlain(n) : plain(n);
  const u = (unit ?? '').trim();
  if (u === '%') return { text: `${main}%`, before: '', main: `${main}%`, after: '' };
  if (u === '' || isMoneyUnit(u)) return { text: main, before: '', main, after: '' };
  /* ONE OF A UNIT IS ONE DAY, not one days. */
  const word = Math.abs(n) === 1 && /s$/u.test(u) ? u.slice(0, -1) : u;
  return { text: `${main} ${word}`, before: '', main, after: word };
}

/** A figure without its unit word, for "33 of 50 people": money keeps its code, which is what says the currency. */
const bare = (f: KpiFigure): string => (f.after === '' || /^[A-Z]{3}$/u.test(f.after) ? f.text : f.main);

/** An axis figure: compact, money with its code, a count without its word. */
const axisSaid = (n: number, unit: string | undefined, home: string | null): string => {
  const f = kpiFigure(n, unit, home, true);
  return isMoneyUnit(unit) ? f.text : f.main;
};

/* ---- The plan ------------------------------------------------------------------------------------------------ */

export type KpisOptions = {
  home?: string | null;
  now?: string | number | Date;
  /** A Today row's small chart: whole periods only, with no dot for the one still running (`kpisPlan` sets it). */
  spark?: boolean;
};

const nowOf = (now: KpisOptions['now']): number => {
  if (now instanceof Date) return now.getTime();
  if (typeof now === 'number') return now;
  return time(now) ?? Date.now();
};

/** The kind a KPI is drawn as, from what it says, else from its unit: a share in `%`, money a flow, the rest a level. */
export const kpiKindOf = (k: KpiInput): KpiKind => k.kind ?? (k.unit === '%' ? 'share' : isMoneyUnit(k.unit) ? 'flow' : 'level');

type Plot = { t: number; n: number | null; partial: boolean };

/** One KPI, planned. */
export function kpiView(k: KpiInput, opts: KpisOptions = {}): KpiView {
  const home = opts.home ?? null;
  const now = nowOf(opts.now);
  const money = isMoneyUnit(k.unit);
  const kind = kpiKindOf(k);
  const up = (k.good ?? 'up') === 'up';
  const period = periodOf(k.every);
  const { reads, left } = readPoints(k, money);
  const target = readTarget(k, money);
  const by = time(k.target_by ?? null);
  const fig = (n: number) => kpiFigure(n, k.unit, home);

  /* THE PLOTTED POINTS: a flow's sums per period, from its first to its last, a period with no reading a gap; any
     other shape its readings as they came. */
  let plots: Plot[];
  if (kind === 'flow' && reads.length) {
    const sums = new Map<number, number>();
    for (const r of reads) {
      const s = startOf(r.t, period);
      sums.set(s, (sums.get(s) ?? 0) + r.n);
    }
    const first = startOf(reads[0]!.t, period);
    const last = startOf(reads[reads.length - 1]!.t, period);
    const running = startOf(now, period);
    plots = [];
    for (let s = first; s <= last; s = nextOf(s, period)) plots.push({ t: s, n: sums.get(s) ?? null, partial: s === running });
  } else {
    plots = reads.map((r) => ({ t: r.t, n: r.n, partial: false }));
  }

  /* THE FIGURE. A flow says its last WHOLE period, with the one still running said beside it as so far; anything else
     says its newest reading. */
  const whole = plots.filter((p) => !p.partial && p.n !== null);
  const running = plots.find((p) => p.partial && p.n !== null) ?? null;
  const lastWhole = whole.at(-1) ?? null;
  const shown = kind === 'flow' ? (lastWhole ?? running) : (plots.at(-1) ?? null);
  const figure = shown && shown.n !== null ? fig(shown.n) : null;
  const newest = reads.at(-1)?.t ?? null;
  let when = '';
  if (shown) {
    if (kind === 'flow') when = shown.partial ? `so far in ${periodSaid(shown.t, period, now)}` : `in ${periodSaid(shown.t, period, now)}`;
    else when = startOf(shown.t, 'day') === startOf(now, 'day') ? 'today' : kpiDay(shown.t, now);
  }
  const sofar = kind === 'flow' && running && running !== shown && running.n !== null ? `${fig(running.n).text} so far in ${periodSaid(running.t, period, now)}` : '';

  /* THE CHANGE ON THE PERIOD BEFORE: a flow's last whole period on the one before it; anything else the newest reading
     on the last one at least a period older. Up or down is good or not by `good`, and said in words. */
  let change: KpiChange | null = null;
  if (shown && shown.n !== null) {
    let prev: { n: number; against: string } | null = null;
    if (kind === 'flow') {
      const i = plots.indexOf(shown);
      const before = i > 0 ? plots[i - 1]! : null;
      if (before && before.n !== null) prev = { n: before.n, against: `on ${periodSaid(before.t, period, now)}` };
    } else {
      const edge = backOf(shown.t, period);
      const before = [...reads].reverse().find((r) => r.t <= edge);
      if (before) prev = { n: before.n, against: `since ${kpiDay(before.t, now)}` };
    }
    if (prev) change = changeOf(shown.n, prev.n, prev.against, kind, up, k.unit, home);
  }

  /* THE TARGET, met when the figure reaches it the good way, off when its day has passed without that or the source
     says so. Off is the one red a KPI says, with its words. */
  let targetView: KpiTarget | null = null;
  if (target !== null) {
    const value = fig(target).text;
    const n = shown?.n ?? null;
    const met = n !== null && (up ? n >= target : n <= target);
    const past = by !== null && by < startOf(now, 'day');
    const state: KpiTarget['state'] = k.verdict === 'off' ? 'off' : k.verdict === 'met' || met ? 'met' : past ? 'off' : 'open';
    const byText = by !== null ? `by ${kpiDay(by, now)}` : '';
    const said =
      state === 'met'
        ? `Target ${value} met`
        : state === 'off'
          ? `Off target: ${n !== null ? `${bare(fig(n))} of ` : ''}${value}${byText ? ` ${byText}` : ''}`
          : `Target ${value}${byText ? ` ${byText}` : ''}`;
    targetView = { value, by: byText, state, said };
  }

  /* STALE: the newest point older than two of its periods, or fourteen days with no cadence. Nothing at all is stale too. */
  const limit = k.every ? KPI_LATE_PERIODS * EVERY_MS[k.every] : KPI_QUIET_DAYS * DAY;
  const fix = KPI_FIX[k.source ?? 'typed'];
  const stale: KpiStale | null =
    newest === null ? { said: KPI_NO_VALUE, fix } : now - newest > limit ? { said: kpiStaleSaid(kpiDay(newest, now)), fix } : null;
  /* OLD BUT NOT STALE SAYS ITS DAY: a weekly number read nine days ago is on its rhythm and still nine days old. */
  const aged = stale === null && newest !== null && now - newest > KPI_AGED_DAYS * DAY ? kpiAgedSaid(kpiDay(newest, now)) : '';

  /* A TODAY ROW'S SPARK IS WHOLE PERIODS ONLY. The period still running is a faint dot past the last whole one, which a
     tile explains with its "so far" line; a row says no "so far", so on Hours billed it was a stray dot right of the
     line, half cut by the row's edge. */
  const charted = opts.spark === true ? plots.filter((p) => !p.partial) : plots;
  const chart = charted.filter((p) => p.n !== null).length >= KPI_CHART_POINTS ? chartOf(charted, kind, target, k.unit, home, now, period) : null;

  const whenSaid = when === '' || when === 'today' || kind === 'flow' ? when : `on ${when}`;
  const sentence = [
    `${k.name}: ${figure ? `${figure.text}${whenSaid ? ` ${whenSaid}` : ''}` : KPI_NO_VALUE}`,
    change ? `${change.said} ${change.against}` : '',
    targetView ? targetView.said : '',
    stale && newest !== null ? stale.said : '',
  ]
    .filter(Boolean)
    .join(', ');

  return {
    key: k.kpi ?? k.name,
    name: k.name,
    project: k.project ?? '',
    slot: k.slot ?? '',
    kind,
    headline: k.headline === true,
    figure,
    when,
    sofar,
    change,
    target: targetView,
    stale,
    aged,
    chart,
    left: money && left > 0 ? kpiLeftSaid(left, otherCurrency(k)) : '',
    why: k.why ?? '',
    sentence,
    input: k,
  };
}

/** The one other currency a money KPI was handed, or "other currencies" when there were several. */
function otherCurrency(k: KpiInput): string {
  const others = new Set(k.points.flatMap((p) => (p.amount ? [readAmount(p.amount.trim())?.currency] : [])).filter((c): c is string => !!c && c !== k.unit));
  return others.size === 1 ? [...others][0]! : 'other currencies';
}

function changeOf(n: number, prev: number, against: string, kind: KpiKind, up: boolean, unit: string | undefined, home: string | null): KpiChange {
  const delta = n - prev;
  if (delta === 0) return { dir: 'flat', tone: null, said: 'No change', against };
  const dir = delta > 0 ? 'up' : 'down';
  const tone = (dir === 'up') === up ? 'good' : 'warn';
  let amount: string;
  if (kind === 'share') {
    /* A SHARE MOVES IN POINTS, not in a share of itself: 3% to 4% is one point, never "up 33%". */
    amount = `${plain(Math.abs(delta))} pt${Math.abs(delta) === 1 ? '' : 's'}`;
  } else if (prev !== 0 && Math.sign(prev) === Math.sign(n)) {
    const pct = Math.abs(delta / prev) * 100;
    amount = `${pct >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10}%`;
  } else {
    amount = kpiFigure(Math.abs(delta), unit, home).text;
  }
  return { dir, tone, said: `${dir === 'up' ? 'Up' : 'Down'} ${amount}`, against };
}

/** The chart a KPI's shape picks, in the `0 0 1000 100` box. Only called from three points. */
function chartOf(plots: Plot[], kind: KpiKind, target: number | null, unit: string | undefined, home: string | null, now: number, period: Period): KpiChart {
  const values = plots.flatMap((p) => (p.n === null ? [] : [p.n]));
  const latest = [...plots].reverse().find((p) => p.n !== null)!.n!;
  const none = { line: '', partial: '', area: '', end: '', target: null, ticks: [], top: '', bottom: '', ring: null, bar: null };

  if (kind === 'share') {
    const v = Math.max(0, Math.min(100, latest));
    const mark = target !== null ? at(Math.max(0, Math.min(100, target))) : null;
    return { ...none, form: 'ring', ring: { dash: `${at(v)} 100`, mark } };
  }
  if (kind === 'progress' && target !== null && target > 0) {
    const scale = Math.max(target, latest);
    return { ...none, form: 'bar', bar: { fill: at(Math.max(0, latest) / scale), mark: latest > target ? at(target / scale) : null, share: `${Math.round((latest / target) * 100)}%` } };
  }

  /* THE SCALE: every value and the target, a flow from the floor (an area is an amount), anything else from just under
     its lowest so 38 to 44 servers is a shape and not a flat line along the top, with a little room above so the line's
     dot is never cut. */
  const all = target !== null ? [...values, target] : values;
  let hi = Math.max(...all);
  let lo = kind === 'flow' ? Math.min(0, ...all) : Math.min(...all);
  if (hi === lo) {
    hi += Math.abs(hi) * 0.1 || 1;
    lo -= Math.abs(lo) * 0.1 || 1;
  }
  const span = hi - lo;
  hi += span * 0.08;
  if (kind !== 'flow') {
    const down = lo - span * 0.08;
    lo = lo >= 0 && down < 0 ? 0 : down;
  }
  const y = (v: number) => ((hi - v) / (hi - lo)) * 100;

  /* X: a flow by its periods, evenly; a level by when each reading came, so a fortnight's silence reads as one. */
  const t0 = plots[0]!.t;
  const t1 = plots[plots.length - 1]!.t;
  const x = (i: number) =>
    kind === 'flow' ? (plots.length > 1 ? (i / (plots.length - 1)) * 1000 : 500) : t1 > t0 ? ((plots[i]!.t - t0) / (t1 - t0)) * 1000 : 500;

  /* THE LINE, broken at a gap, and the period still running drawn on its own, dashed, from the last whole point. */
  let line = '';
  let pen = false;
  let lastWhole = -1;
  plots.forEach((p, i) => {
    if (p.partial) return;
    if (p.n === null) {
      pen = false;
      return;
    }
    line += `${pen ? 'L' : 'M'}${at(x(i))} ${at(y(p.n))}`;
    pen = true;
    lastWhole = i;
  });
  const runningAt = plots.findIndex((p) => p.partial && p.n !== null);
  /* A DOT, NOT A LINE: a line from the last whole month down to the half of this one drew a fall that is only a month
     not over yet. */
  const partial = runningAt >= 0 ? `M${at(x(runningAt))} ${at(y(plots[runningAt]!.n!))}l0 0` : '';

  let area = '';
  if (kind === 'flow') {
    /* The fill under each unbroken run of whole periods, closed to the floor. */
    const floor = at(y(Math.max(lo, 0)));
    let run: number[] = [];
    const close = () => {
      if (run.length > 1) area += `M${at(x(run[0]!))} ${floor}${run.map((i) => `L${at(x(i))} ${at(y(plots[i]!.n!))}`).join('')}L${at(x(run[run.length - 1]!))} ${floor}Z`;
      run = [];
    };
    plots.forEach((p, i) => (p.partial || p.n === null ? close() : run.push(i)));
    close();
  }

  const end = lastWhole >= 0 ? `M${at(x(lastWhole))} ${at(y(plots[lastWhole]!.n!))}l0 0` : '';
  const targetLine = target !== null ? { y: at(y(target)), label: `Target ${kpiFigure(target, unit, home).text}` } : null;

  /* TICKS: a flow names its periods, the last always and at most five; a level names its first, middle and last day. */
  let ticks: KpiTick[] = [];
  if (kind === 'flow') {
    const n = plots.length;
    const step = Math.max(1, Math.ceil(n / 5));
    for (let i = n - 1; i >= 0; i -= step) {
      const p = plots[i]!;
      const label = period === 'month' ? MONTHS[new Date(p.t).getUTCMonth()]! : kpiDay(p.t, now);
      ticks.unshift({ at: at(n > 1 ? i / (n - 1) : 0.5), label, align: n > 1 && i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle' });
    }
  } else if (t1 > t0) {
    ticks = [
      { at: '0', label: kpiDay(t0, now), align: 'start' },
      { at: '0.5', label: kpiDay(t0 + (t1 - t0) / 2, now), align: 'middle' },
      { at: '1', label: kpiDay(t1, now), align: 'end' },
    ];
  }

  return {
    form: kind === 'flow' ? 'area' : 'line',
    line,
    partial,
    area,
    end,
    target: targetLine,
    ticks,
    top: axisSaid(Math.max(...values), unit, home),
    bottom: axisSaid(Math.min(...values), unit, home),
    ring: null,
    bar: null,
  };
}

/**
 * The block: on a project page the lead (the KPI marked `headline`, else the first) and at most five more; on Today the
 * rows, at most four, in the order the source ranked them.
 */
export function kpisPlan(kpis: readonly KpiInput[], opts: KpisOptions = {}): KpisPlan {
  const views = kpis.map((k) => kpiView(k, opts));
  const leadAt = Math.max(0, views.findIndex((v) => v.headline));
  const lead = views[leadAt] ?? null;
  const rest = views.filter((_, i) => i !== leadAt).slice(0, KPIS_MORE);
  const rows = kpis.slice(0, KPIS_TODAY).map((k, i) => (views[i]!.chart?.partial ? kpiView(k, { ...opts, spark: true }) : views[i]!));
  return { lead, rest, rows };
}

