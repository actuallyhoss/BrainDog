/**
 * A MEASURED TREND over a bucketed figure: is it growing, by how much a bucket, and how sure is that.
 *
 * The published shape (docs/32-PARITY.md, the `trend` row): a log-linear fit, gated on significance, that answers
 * compound growth with a band, or flat, and a projection capped at ten times with the cap reported.
 *
 * HOW IT IS FITTED. A figure that grows by the same share every bucket is a straight line once each bucket is replaced
 * by its logarithm, and the slope of that line is the logarithm of one plus the rate. So the line is fitted to the
 * logarithms by least squares, over the FULL buckets only: an unfinished bucket reads low and would bend the line down,
 * and an empty one is not a nought (`08 §2.4`). A bucket left out keeps its place, so the buckets after a gap stay one
 * further along.
 *
 * WHEN IT SAYS GROWTH. With six or more full buckets, every one above nought, and a slope at least 2.1 of its own
 * standard errors away from nought. Anything less is `flat`, with the reason, because a rate read off five points or
 * off noise is a guess said as a measurement. A logarithm has no answer for nought or less, so one such bucket is flat.
 *
 * THE BAND is the slope 2.1 standard errors either way, the same 2.1 the gate uses. So "growth" and "the band leaves
 * nought out" are one statement, and a band can never straddle nought under the word growth.
 *
 * A SURE FALL IS `growth` WITH A RATE BELOW NOUGHT. The gate is on the size of t, either way.
 *
 * THE CAP. Each bucket ahead is held at ten times the last full bucket, and says `capped` when any of its three
 * numbers was held. The trend says `capped` when any bucket did, and `cap` is the line they were held at. A cap is
 * never silent: a compounding line run far enough ahead is a number nobody measured.
 *
 * Pure: no clock, no store, nothing imported but the bucket walk that names the buckets ahead.
 */

import { nextBucket, type Bucket } from './buckets.ts';

/** The fewest full buckets a trend is read from. */
export const TREND_POINTS = 6;
/** How many standard errors from nought the slope must be, and how many either way the band reaches. */
export const TREND_BAND = 2.1;
/** A bucket ahead is held at this many times the last full bucket. */
export const TREND_CAP = 10;

/** One bucket of a figure, as a grouped figure answers it. `value` is `null` where two currencies gave no one number. */
export type TrendBucket = {
  key: string;
  value: number | null;
  state: 'empty' | 'partial' | 'full';
};

/** One bucket ahead of the last full one: the line's reading, and the band's two edges, each held at the cap. */
export type TrendAhead = {
  /** 1 for the bucket after the last full one, 2 for the one after that. */
  step: number;
  /** The bucket's key, when `trendOf` was told what a bucket is. */
  key?: string;
  value: number;
  low: number;
  high: number;
  /** True when the cap held any of the three. */
  capped: boolean;
};

export type TrendGrowth = {
  kind: 'growth';
  /** The share the figure grows by each bucket: 0.05 is five in a hundred. Below nought for a fall. */
  rate: number;
  low: number;
  high: number;
  /** How many full buckets the line was fitted to. */
  n: number;
  /** The slope over its standard error. `Infinity` when the buckets sit on the line exactly. */
  t: number;
  ahead: TrendAhead[];
  /** True when the cap held any bucket ahead. */
  capped: boolean;
  /** The line the buckets ahead are held at: ten times the last full bucket. */
  cap: number;
};

/**
 * No trend that may be said. `few` is fewer than six full buckets, `nought` is a full bucket of nought or less or with
 * no single number, and `unsure` is a slope the buckets cannot tell from nought.
 */
export type TrendFlat = { kind: 'flat'; n: number; why: 'few' | 'nought' | 'unsure' };

export type Trend = TrendGrowth | TrendFlat;

/**
 * The trend of `buckets`, in the order they run, and `ahead` buckets past the last full one. `bucket` says what a
 * bucket is, so the buckets ahead can be keyed; without it they carry their step alone.
 */
export function trendOf(buckets: readonly TrendBucket[], ahead: number, bucket?: Bucket): Trend {
  /* x is the bucket's place in the run, so a bucket left out leaves its gap in the line. */
  const points: { x: number; value: number | null }[] = [];
  buckets.forEach((b, x) => {
    if (b.state === 'full') points.push({ x, value: b.value });
  });
  const n = points.length;
  if (n < TREND_POINTS) return { kind: 'flat', n, why: 'few' };
  if (points.some((p) => p.value === null || !Number.isFinite(p.value) || p.value <= 0)) return { kind: 'flat', n, why: 'nought' };

  /* MEASURED FROM THE FIRST POINT, NOT FROM NOUGHT. The same amount every bucket then gives logarithms of exactly
     nought and a slope of exactly nought. Summed as they are, six equal logarithms and their mean differ in the last
     bit, and the same amount every month would read as a growth of nothing with a t of anything. */
  const x0 = points[0]!.x;
  const y0 = Math.log(points[0]!.value as number);
  const xs = points.map((p) => p.x - x0);
  const ys = points.map((p) => Math.log(p.value as number) - y0);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const slope = sxy / sxx;
  const at = my - slope * mx;
  /* What the line leaves, which rounding can carry a hair below nought on an exact fit. */
  const left = Math.max(0, syy - slope * sxy);
  const error = Math.sqrt(left / (n - 2) / sxx);
  const t = slope === 0 ? 0 : error === 0 ? (slope > 0 ? Infinity : -Infinity) : slope / error;
  if (!(Math.abs(t) >= TREND_BAND)) return { kind: 'flat', n, why: 'unsure' };

  const reach = TREND_BAND * error;
  const last = points[n - 1]!;
  const cap = TREND_CAP * (last.value as number);
  /* The line's own reading of the last full bucket: the buckets ahead start from the line, not from one bucket's luck. */
  const base = y0 + at + slope * (last.x - x0);
  const steps = Number.isFinite(ahead) ? Math.max(0, Math.floor(ahead)) : 0;
  const out: TrendAhead[] = [];
  let key = buckets[last.x]!.key;
  for (let step = 1; step <= steps; step++) {
    const read = [slope, slope - reach, slope + reach].map((s) => Math.exp(base + s * step));
    const held = read.map((v) => Math.min(v, cap));
    const one: TrendAhead = { step, value: held[0]!, low: held[1]!, high: held[2]!, capped: read.some((v) => v > cap) };
    if (bucket !== undefined) {
      key = nextBucket(key, bucket);
      one.key = key;
    }
    out.push(one);
  }
  return {
    kind: 'growth',
    rate: Math.expm1(slope),
    low: Math.expm1(slope - reach),
    high: Math.expm1(slope + reach),
    n,
    t,
    ahead: out,
    capped: out.some((a) => a.capped),
    cap,
  };
}
