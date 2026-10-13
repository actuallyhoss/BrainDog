/**
 * A MEASURED TREND over a bucketed figure: is it growing, by how much a bucket, and how sure is that.
 *
 * The published shape (docs/32-PARITY.md, the `trend` row): a log-linear fit, gated on significance, that answers
 * compound growth with a band, or flat, and a projection capped at ten times with the cap reported. One answer is
 * added to it here, `steady`, for a figure that moves by the same amount each bucket and not by the same share.
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
 * WHEN IT SAYS STEADY. One more every bucket, 1 2 3 up to 8, passes the gate above with ease, and the curve would call
 * it a third more each bucket and run it ahead compounding. So a straight line is fitted to the amounts as well, and
 * each is judged on its own ground, by the share of the spread it explains: the curve among the logarithms, the
 * straight line among the amounts. When the straight line explains as much as the curve does, the answer is `steady`: the same AMOUNT each bucket, with its own band and its
 * buckets ahead on the straight line. A tie goes to the straight line, the plainer thing to say. It is as sure as the
 * curve it beat, since over the same buckets the line that explains more has the larger t.
 *
 * t IS ALWAYS A NUMBER THAT CAN BE WRITTEN DOWN. Buckets that sit on the line exactly leave no error to divide by, so
 * t is held at a million either way, and a fit a rounding away from exact reads the same.
 *
 * THE CAP. Each bucket ahead is held at ten times the last full bucket, and at nought below (every fitted bucket was
 * above nought, so less than nought is nothing that was measured), and says `capped` when any of its three numbers was
 * held. The trend says `capped` when any bucket did, and `cap` is the line they were held at. A cap is
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
/** The most t is ever said to be, either way: an exact fit reads this, not a number with no end. */
export const TREND_T_MOST = 1e6;

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
  /** True when any of the three was held, at the cap or at nought. */
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
  /** The slope over its standard error, never past `TREND_T_MOST` either way. */
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

/** The same amount each bucket: a straight line fits the buckets as well as the curve does. */
export type TrendSteady = {
  kind: 'steady';
  /** The amount the figure moves by each bucket, in the figure's own units. Below nought for a fall. */
  step: number;
  low: number;
  high: number;
  /** How many full buckets the line was fitted to. */
  n: number;
  /** The slope over its standard error, never past `TREND_T_MOST` either way. */
  t: number;
  ahead: TrendAhead[];
  /** True when any bucket ahead was held. */
  capped: boolean;
  /** The line the buckets ahead are held at: ten times the last full bucket. */
  cap: number;
};

export type Trend = TrendGrowth | TrendSteady | TrendFlat;

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
  const v0 = points[0]!.value as number;
  const y0 = Math.log(v0);
  const xs = points.map((p) => p.x - x0);
  const curve = lineOf(xs, points.map((p) => Math.log(p.value as number) - y0));
  if (!(Math.abs(curve.t) >= TREND_BAND)) return { kind: 'flat', n, why: 'unsure' };

  const last = points[n - 1]!;
  const cap = TREND_CAP * (last.value as number);
  const steps = Number.isFinite(ahead) ? Math.max(0, Math.floor(ahead)) : 0;
  const out: TrendAhead[] = [];
  let key = buckets[last.x]!.key;
  /* One bucket ahead from the three numbers the line gives it: held at the cap above and at nought below. */
  const push = (step: number, read: number[]): void => {
    const held = read.map((v) => Math.min(Math.max(v, 0), cap));
    const one: TrendAhead = { step, value: held[0]!, low: held[1]!, high: held[2]!, capped: read.some((v) => v > cap || v < 0) };
    if (bucket !== undefined) {
      key = nextBucket(key, bucket);
      one.key = key;
    }
    out.push(one);
  };

  /* THE STRAIGHT LINE, fitted to the amounts as they are. Each line is judged on its own ground, by the share of the
     spread it explains: the curve among the logarithms, the straight line among the amounts. Judged both in the
     amounts, the straight line would win whenever the largest buckets were the noisy ones. */
  const straight = lineOf(xs, points.map((p) => (p.value as number) - v0));
  if (straight.fit >= curve.fit) {
    /* It needs no gate of its own: over the same buckets, the line that explains more has the larger t. */
    const reach = TREND_BAND * straight.error;
    const base = v0 + straight.at + straight.slope * (last.x - x0);
    for (let step = 1; step <= steps; step++) {
      push(step, [straight.slope, straight.slope - reach, straight.slope + reach].map((s) => base + s * step));
    }
    return {
      kind: 'steady',
      step: straight.slope,
      low: straight.slope - reach,
      high: straight.slope + reach,
      n,
      t: straight.t,
      ahead: out,
      capped: out.some((a) => a.capped),
      cap,
    };
  }

  const { slope, at, error, t } = curve;
  const reach = TREND_BAND * error;
  /* The line's own reading of the last full bucket: the buckets ahead start from the line, not from one bucket's luck. */
  const base = y0 + at + slope * (last.x - x0);
  for (let step = 1; step <= steps; step++) {
    push(step, [slope, slope - reach, slope + reach].map((s) => Math.exp(base + s * step)));
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

/**
 * A least-squares line through the points: its slope, where it starts, the slope's standard error, the share of the
 * spread it explains, and t held finite.
 */
function lineOf(xs: readonly number[], ys: readonly number[]): { slope: number; at: number; error: number; fit: number; t: number } {
  const n = xs.length;
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
  /* What the line leaves, summed point by point: taken as one spread less another, an exact fit leaves rounding. */
  let left = 0;
  for (let i = 0; i < n; i++) left += (ys[i]! - at - slope * xs[i]!) ** 2;
  const error = Math.sqrt(left / (n - 2) / sxx);
  /* An exact fit has no error to divide by, and a fit a rounding away from exact divides by next to nothing. */
  const raw = slope === 0 ? 0 : error === 0 ? Math.sign(slope) * TREND_T_MOST : slope / error;
  return { slope, at, error, fit: syy === 0 ? 0 : 1 - left / syy, t: Math.max(-TREND_T_MOST, Math.min(TREND_T_MOST, raw)) };
}
