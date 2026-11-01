/**
 * What `series` decides, as functions both drawers call.
 *
 * A series is bars by bucket: money in stands up from a zero rule and money out hangs under it, on
 * one scale, so a month that took more than it brought is visibly longer below the line. The `net`
 * form draws what was left, in minus out, as one line. The current bucket is `partial` and drawn
 * faint, or `due` when it also holds money due later in it, drawn faint inside a dashed edge; a bucket
 * still to come is `ahead` and drawn as an outline. A missing value is a gap and
 * never a zero, because a zero is a claim.
 *
 * The cells arrive as plain text, already drawn, so both renderers hand this the same strings and
 * everything they print comes back from here.
 */

import { MISSING, axisFigure, exponentOf, totalSaid } from './format.ts';
import { signedOf } from './bridge.ts';
import { figureLike, wholeMinor, wholeShape } from './figure.ts';
import { type AmountSetting, currencyOfFigure, writeAmount } from './money.ts';

/** Two decimals at most, and no trailing zeros, so an attribute stays short and exact. */
const at = (n: number): string => String(Math.round(n * 100) / 100);

export type SeriesDir = 'in' | 'out';
export type SeriesState = '' | 'partial' | 'due' | 'ahead';

/** At most this many series draw; a fifth column is left out of the drawing and the numbers alike. */
export const SERIES_MOST = 4;

/**
 * One bar of a bucket's stack, in the `0 0 1000 100` box: `y` and `height` are shares of the plot's height in
 * hundredths, which is what the drawers write as `--y` and `--h`. `end` marks the outermost bar of its stack, the one
 * whose free end is rounded.
 */
export type SeriesBar = { bucket: number; series: number; dir: SeriesDir; step: number; state: SeriesState; x: string; y: string; width: string; height: string; end: boolean; up?: boolean };

/** A line of the scale: where it sits, in hundredths of the plot's height from the top, and the figure it says. */
export type SeriesTick = { y: string; label: string; zero: boolean };

/** A series' total, for a tile with too few buckets to draw: the figure in the cells' own form, and its name. */
export type SeriesTotal = { label: string; value: string };

export type SeriesPlan = {
  /** What the first column names: `Month`. */
  axis: string;
  /** `running` where each cell is the total so far, whose total is its last cell and never the cells added. */
  series: { label: string; dir: SeriesDir; step: number; running?: boolean }[];
  buckets: {
    label: string;
    /** The first word of the label, for a narrow container. */
    short: string;
    state: SeriesState;
    /** The state as words beside the bucket, or '' when it is complete. */
    said: string;
    /** Each series' value as printed: the cell, or `—` for a gap. */
    values: string[];
    /** In minus out as printed, or `—` when every value in the bucket is a gap. */
    net: string;
    /** In the `net` form, whether more went out than came in: the one bucket whose bar wears the late red's cap. */
    under: boolean;
  }[];
  bars: SeriesBar[];
  /** The zero rule's y, in the `0 0 1000 100` box. */
  zero: string;
  /** The net line's path, broken at a gap, and a dot at every point. Empty without the `net` form. */
  netLine: string;
  netDots: string;
  /** The top and the foot of the scale, as printed, or '' when nothing stands on that side. */
  top: string;
  bottom: string;
  /** The scale's three lines: the top, the middle or zero, and zero or the foot (`seriesScale`). */
  ticks: SeriesTick[];
  /** No value anywhere above zero: the chart is a sentence. */
  empty: boolean;
  /**
   * Whether there is a chart to draw: at least `SERIES_POINTS` buckets hold a value. Fewer is not a trend, and two bars
   * side by side read as a comparison nobody asked for, so the tile says each series' total instead (`totals`).
   */
  drawn: boolean;
  /** Each series added up over every bucket, written like its cells. */
  totals: SeriesTotal[];
  /** The chart's accessible name. */
  sentence: string;
};

/** The day a week begins on and its month, inside a bucket's label: `20 Jul` of `Week of 20 Jul`. */
const WEEK_DAY = /\b(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/u;

/** A cell's magnitude, or `null` for a gap. */
export const seriesValue = (cell: string): number | null => {
  const t = cell.trim();
  if (t === '' || t === MISSING) return null;
  const n = signedOf(t);
  return Number.isFinite(n) ? Math.abs(n) : null;
};

const stateOf = (cell: string | undefined): SeriesState => {
  const t = (cell ?? '').trim().toLowerCase();
  return t === 'partial' || t === 'due' || t === 'ahead' ? t : '';
};

/**
 * The bars, the net and every printed figure, from the header row and the body rows as text.
 *
 * `net` is the fence's `net` form.
 */
export function seriesPlan(rows: readonly (readonly string[])[], net = false, home?: string | null): SeriesPlan {
  const [head = [], ...body] = rows;
  const stated = head.length > 1 && head[head.length - 1]!.trim().toLowerCase() === 'state';
  const named = head.slice(1, stated ? -1 : undefined).slice(0, SERIES_MOST);
  const steps = { in: 0, out: 0 };
  const series = named.map((cell) => {
    /* `in running: Paid in all` is a line whose every cell is the total so far (the kernel's `running:`). */
    const m = /^(in|out)( running)?:\s*(.*)$/iu.exec(cell.trim());
    const dir: SeriesDir = m && m[1]!.toLowerCase() === 'out' ? 'out' : 'in';
    return { label: m ? m[3]! : cell.trim(), dir, step: steps[dir]++, ...(m?.[2] ? { running: true } : {}) };
  });
  const stateAt = stated ? head.length - 1 : -1;
  /* A CHART OF MONEY OUT ALONE STANDS UP: with nothing coming in to stand over it, money out hung under a zero line read
     as below nothing ("−£25" under a week's software, the validator's recheck of 30 October, N1). It keeps money out's
     colour; only where money in shares the chart does money out hang down. */
  const stands = series.length > 0 && series.every((x) => x.dir === 'out');
  const way = (d: SeriesDir): SeriesDir => (stands ? 'in' : d);

  const values = body.map((r) => series.map((_, i) => seriesValue(r[i + 1] ?? '')));
  const sums = values.map((v) => ({
    up: v.reduce<number>((s, x, i) => s + (way(series[i]!.dir) === 'in' ? (x ?? 0) : 0), 0),
    down: v.reduce<number>((s, x, i) => s + (way(series[i]!.dir) === 'out' ? (x ?? 0) : 0), 0),
    gap: v.every((x) => x === null),
  }));
  const template = body.flatMap((r) => r.slice(1, series.length + 1)).find((c) => seriesValue(c) !== null) ?? '';
  /* THE SCALE ENDS ON A ROUND FIGURE, so its three lines say figures a person reads at a glance: 2, 1 and 0 under a
     week of two, not 2.3 and 1.15. A whole-number series keeps its middle line whole. */
  const whole = !/[.,]\d{1,2}(?!\d)/u.test(template.replace(/,\d{3}/gu, ''));
  const hi = seriesNice(Math.max(0, ...sums.map((s) => s.up)), whole);
  const lo = seriesNice(Math.max(0, ...sums.map((s) => s.down)), whole);
  const netOf = (i: number): number | null => (sums[i]!.gap ? null : sums[i]!.up - sums[i]!.down);

  const n = body.length;
  const slot = n ? 1000 / n : 1000;
  const span = hi + lo;
  const y = (v: number) => (span ? ((hi - v) / span) * 100 : 50);
  /* A BAR IS NO WIDER THAN IT IS AT TEN BUCKETS. A new record's weekly count has one week, and its bar filled six tenths of
     the chart, a green slab rather than a bar. It stays centred in its slot, under its label. */
  const barWidth = Math.min(slot * 0.6, 60);
  const bars: SeriesBar[] = [];
  if (span > 0)
    body.forEach((r, i) => {
      const state = stateOf(stated ? r[stateAt] : undefined);
      const stack: SeriesBar[] = [];
      let up = 0;
      let down = 0;
      series.forEach((s, k) => {
        const v = values[i]![k];
        if (v === null || v === undefined || v === 0) return;
        const d = way(s.dir);
        const from = d === 'in' ? up : -down;
        const to = d === 'in' ? up + v : -down - v;
        if (d === 'in') up += v;
        else down += v;
        const top = y(Math.max(from, to));
        stack.push({ bucket: i, series: k, dir: s.dir, step: s.step, state, x: at(i * slot + (slot - barWidth) / 2), y: at(top), width: at(barWidth), height: at(y(Math.min(from, to)) - top), end: false, ...(stands ? { up: true } : {}) });
      });
      /* THE OUTERMOST BAR EACH WAY carries the rounded end, so a stack reads as one bar with one cap. */
      for (const dir of ['in', 'out'] as const) {
        const last = stack.findLast((b) => b.dir === dir);
        if (last) last.end = true;
      }
      bars.push(...stack);
    });

  let netLine = '';
  let netDots = '';
  if (net && span > 0) {
    let open = false;
    body.forEach((_, i) => {
      const v = netOf(i);
      if (v === null) {
        open = false;
        return;
      }
      const px = at(i * slot + slot / 2);
      const py = at(y(v));
      netLine += `${netLine ? ' ' : ''}${open ? 'L' : 'M'}${px} ${py}`;
      netDots += `${netDots ? ' ' : ''}M${px} ${py}h0`;
      open = true;
    });
  }

  const shortOf = (label: string): string => {
    const words = label.split(/\s+/u);
    return words.length > 2 ? (words.at(-2) ?? label) : (words[0] ?? label);
  };
  /* A WEEK SAYS ITS MONTH ON THE FIRST TICK AND WHERE THE MONTH CHANGES: "20 Jul", "27", "3 Aug". The phone's ticks were
     bare day numbers, "20 27 3 10", which never said which month they were in (visual review 3). */
  const weekOf = (label: string): { day: string; month: string } | null => {
    const m = WEEK_DAY.exec(label);
    return m ? { day: m[1]!, month: m[2]! } : null;
  };
  const weeks = body.map((r) => weekOf((r[0] ?? '').trim()));
  const shortAt = (label: string, i: number): string => {
    const w = weeks[i];
    if (!w) return shortOf(label);
    return i === 0 || weeks[i - 1]?.month !== w.month ? `${w.day} ${w.month}` : w.day;
  };
  /* THE CELL WRITTEN TO THE MOST PLACES, so a net is said as finely as what it is the net of. */
  const placesIn = (c: string): number => /\d\.(\d+)(?!\d)/u.exec(c)?.[1]?.length ?? 0;
  const fine = body
    .flatMap((r) => r.slice(1, series.length + 1))
    .filter((c) => seriesValue(c) !== null && unitOf(c) === unitOf(template))
    .reduce((best, c) => (placesIn(c) > placesIn(best) ? c : best), template);
  const drawnBuckets = body.map((r, i) => {
    const label = (r[0] ?? '').trim();
    const state = stateOf(stated ? r[stateAt] : undefined);
    const v = netOf(i);
    return {
      label,
      /* The first word (`Sep` of `Sep 2026`), or the day a week begins on (`20` of `Week of 20 Jul`), with its month
         where it is the first or a new one (`shortAt`). */
      short: shortAt(label, i),
      state,
      said: state === 'partial' ? SERIES_PARTIAL : state === 'due' ? SERIES_DUE : state === 'ahead' ? SERIES_AHEAD : '',
      values: series.map((_, k) => (values[i]![k] === null ? MISSING : (r[k + 1] ?? '').trim())),
      /* SAID TO THE PENCE THE TABLE'S CELLS CARRY (`fine`), never rounded to the first cell's whole pounds: £11,050 in and
         £19,516.90 out netted "−£8,467", a figure the two cells beside it do not make. */
      net: v === null ? MISSING : amountLike(fine, v, home, 'exact'),
      under: net && v !== null && v < 0,
    };
  });
  /* ONE TABLE SAYS ITS MONEY ONE WAY (audit of 31 October, 23): a month's row read "£19,516.90" beside "−£8,467", the
     cells as the record wrote them beside a net said whole. Where any amount of a currency carries pence, every amount
     of that currency in the table does (`evenPlaces`). */
  const even = evenPlaces(drawnBuckets.flatMap((b) => [...b.values, b.net]));
  const width = series.length + 1;
  const buckets = drawnBuckets.map((b, i) => ({ ...b, values: even.slice(i * width, i * width + series.length), net: even[i * width + series.length]! }));

  /* A TOTAL IS ADDED IN ONE UNIT AND IN WHOLE MINOR UNITS. Each series is summed in its own cells' form, not the first
     series', so hours under money stay hours; a series whose cells name two currencies, or a currency and none, has no
     total, because two currencies are never added, and then the tile draws its bars rather than drop the series. The
     sum is taken in hundredths (or whatever the cells write) as integers, so £0.10 and £0.20 are £0.30 exactly. */
  let mixed = false;
  const totals = series.flatMap((sr, k) => {
    const cells = body.map((r) => (r[k + 1] ?? '').trim()).filter((c) => seriesValue(c) !== null);
    if (!cells.length) return [];
    if (new Set(cells.map(unitOf)).size > 1) {
      mixed = true;
      return [];
    }
    /* A RUNNING LINE'S TOTAL IS ITS LAST CELL (audit j, AJ4): each cell is already the total so far, so adding them
       said "£11,250 Paid in all" over a plan whose quarters ran £3,750 then £7,500. */
    if (sr.running) return [{ label: sr.label, value: amountLike(cells[0]!, seriesValue(cells[cells.length - 1]!)!, home, 'read') }];
    const places = Math.max(0, ...cells.map((c) => /\.(\d+)/u.exec(c.replace(/,/gu, ''))?.[1]?.length ?? 0));
    const minor = cells.reduce((t, c) => t + Math.round(seriesValue(c)! * 10 ** places), 0);
    return [{ label: sr.label, value: amountLike(cells[0]!, minor / 10 ** places, home, 'read') }];
  });

  const sentence = buckets
    .map((b) => {
      const parts = series.map((s, k) => `${s.label} ${b.values[k]}`);
      if (net) parts.push(`${SERIES_NET} ${b.net}`);
      return `${b.label}${b.said ? ` ${b.said}` : ''}, ${parts.join(', ')}`;
    })
    .join('; ');

  return {
    axis: (head[0] ?? '').trim(),
    series,
    buckets,
    bars,
    zero: at(y(0)),
    netLine,
    netDots,
    top: hi > 0 ? amountLike(template, hi, home, 'axis') : '',
    bottom: lo > 0 ? amountLike(template, -lo, home, 'axis') : '',
    ticks: span > 0 ? seriesScale(hi, lo, y, template, home) : [],
    empty: span <= 0,
    drawn: span > 0 && (sums.filter((x) => !x.gap).length >= SERIES_POINTS || mixed),
    totals,
    sentence,
  };
}

/**
 * A figure a chart worked out, written by the one writer (`money.ts`) once the host has said the record's home.
 *
 * `home` is the record's home currency, `null` when it has none, and `undefined` when the caller was never told:
 * then, and for a cell that is not stored money (hours, a count, a figure a page drew itself), the figure copies
 * the cell's own shape as it always has. The amount is rounded once, to the currency's own minor unit, and only
 * `axis` is compact.
 */
export function amountLike(template: string, value: number, home: string | null | undefined, setting: AmountSetting): string {
  const copied = (): string => (setting === 'axis' ? axisFigure(figureLike(template, value)) : figureLike(template, value));
  /* A CELL DRAWN BY ITS SIGN ALONE SAYS ITS CURRENCY TOO (`currencyOfFigure`): "$1,950", as the writer now draws another
     currency, was copied as a shape and its net and axis never written by the one writer. */
  const currency = home === undefined || !Number.isFinite(value) ? null : currencyOfFigure(template, home);
  if (!currency) return copied();
  const minor = Math.sign(value) * Math.round(Math.abs(value) * 10 ** exponentOf(currency));
  if (!Number.isSafeInteger(minor)) return copied();
  /* WHOLE WHERE THE CELL WAS WHOLE (AO11), as `figureLike` keeps it: "£2,400" is never written again as "£2,400.00". */
  if (wholeShape(template) && setting !== 'axis') return writeAmount({ minor: wholeMinor(minor, currency), currency }, home ?? null, setting === 'exact' ? 'read' : setting)?.text ?? copied();
  return writeAmount({ minor, currency }, home ?? null, setting)?.text ?? copied();
}

/** What a cell says around its figure, its sign aside: `£#` of `−£1,200.00`, `GBP #`, `#h`. */
const unitOf = (cell: string): string => cell.replace(/^[+−-]\s*/u, '').replace(/[−-]?\d[\d,]*(?:\.\d+)?/u, '#').replace(/\s+/gu, ' ');

/** The fewest buckets with a value that make a chart: fewer is a figure, not a trend. */
export const SERIES_POINTS = 3;

/**
 * The round figure at or above `v` that a scale ends on: 1, 2, 3, 4, 5, 6, 8 or 10 times a power of ten, so a short
 * scale does not jump from 5 to 10. Never 2.5: its middle line, 12.5 or 1.25, was printed rounded (`axisFigure`) and
 * said a figure the line was not at. Nor a step whose middle would not print as itself: a count's 1, 3 or 5 (a half),
 * or 0.3 (0.15, printed 0.2).
 */
export function seriesNice(v: number, whole = false): number {
  if (!(v > 0) || !Number.isFinite(v)) return 0;
  const power = 10 ** Math.floor(Math.log10(v));
  /* THE MIDDLE MUST PRINT AS ITSELF: whole for a count, and to the one decimal `axisFigure` keeps under ten. */
  const exact = (n: number): boolean => Math.abs(n - Math.round(n)) < 1e-9;
  const steps = [1, 2, 3, 4, 5, 6, 8, 10].filter((x) => {
    const mid = (x * power) / 2;
    return whole || mid >= 10 ? exact(mid) : exact(mid * 10);
  });
  const f = v / power;
  /* A hair of rounding slack, so 3.0000000004 of a float is still 3's step and not the next; and the product rounded,
     so 3 tenths is 0.3 and not 0.30000000000000004. */
  const step = steps.find((x) => f <= x * (1 + 1e-9)) ?? 10;
  return Number((step * power).toPrecision(12));
}

/**
 * The scale's three lines, top first: the top, its middle and zero where nothing goes out; the top, zero and the foot
 * where something does; zero, the middle and the foot where nothing comes in.
 */
function seriesScale(hi: number, lo: number, y: (v: number) => number, template: string, home: string | null | undefined): SeriesTick[] {
  const marks = hi > 0 && lo > 0 ? [hi, 0, -lo] : hi > 0 ? [hi, hi / 2, 0] : [0, -lo / 2, -lo];
  /* ZERO IS 0 IN ANY CURRENCY: "EGP 0" on the rule read as an amount of nothing (the look's words check), where the
     lines above and below it already say the currency. */
  return marks.map((v) => ({ y: at(y(v)), label: v === 0 ? '0' : amountLike(template, v, home, 'axis'), zero: v === 0 }));
}

/** The renderer's own words, as `split.ts` keeps `SPLIT_ZERO`: it imports nothing from the app. */
export const SERIES_NONE = 'Nothing to draw yet.';
export const SERIES_NET = 'Net';
/** The key of the red cap on a month whose net is below zero, so the red always has its word. */
export const SERIES_UNDER = 'More out than in';

/**
 * Amounts as one table says them: where one amount of a currency is written to its pence, each amount of that currency
 * is, `−£8,467` beside `£19,516.90` read as `−£8,467.00`. A currency is told by its marks with the digits taken out, as
 * `barFigures` tells one, and a cell with no digits (`—`) or no mark of a currency (an hour count) is left as it is.
 */
export function evenPlaces(cells: readonly string[]): string[] {
  /* NO LONGER PADDED, SINCE 1 NOV: a table of months is totals, said by the one rule for cents (`totalSaid`): whole from a
     thousand up, to the cent under it, never ".00". The name stays for its callers. */
  return cells.map((c) => (/\d/u.test(c) ? totalSaid(c) : c));
}
/** The key for a bar drawn at half strength: a month not over yet, or still to come. */
export const SERIES_PALER = 'Paler: not over yet';
export const SERIES_PARTIAL = 'so far';
export const SERIES_AHEAD = 'expected';
/** The current bucket when it counts money due later in it beside what was paid so far. */
export const SERIES_DUE = 'so far, and due';
export const SERIES_NUMBERS = 'The numbers';
