/**
 * A TREND THAT REFUSES NOISE: the straight line through a `lines` chart's current readings, drawn only when the
 * readings hold one.
 *
 * The line is a least-squares fit to the first current line's readings, each placed at its point, so a gap leaves its
 * gap and never reads as a zero. It draws only when there are six readings or more and the slope sits 2.1 standard
 * errors or more from nought, the same gate the kernel's trend keeps (`packages/kernel/src/trend.ts`). Short of that,
 * the chart says there is no clear trend in so many readings, so a wobble is never drawn as news. Under six readings
 * nothing is said at all: too few to call either way.
 *
 * It reads only what `linesPlan` already holds, the printed points, and places the line in the same `0 0 1000 100` box
 * with the same x and y, so it lies over the line it was fitted to. No import from the app or the kernel: this package
 * is MIT and embeddable, so it keeps its own copy of the two numbers, and a test holds them to the kernel's.
 */

import { linesValue, type LinesPlan } from './lines.ts';

/** The fewest readings a trend is read from: the kernel's `TREND_POINTS`. */
export const LINES_TREND_POINTS = 6;
/** How many standard errors from nought the slope must be: the kernel's `TREND_BAND`. */
export const LINES_TREND_T = 2.1;

/** A trend drawn as a dashed path in the chart's box, or the sentence said when the readings hold none. */
export type LinesTrend = { d: string } | { said: string };

/** What a chart whose readings hold no trend says under it. */
export const noTrendSaid = (n: number): string => `No clear trend in ${n} reading${n === 1 ? '' : 's'}`;

/** Two decimals at most, and no trailing zeros, as `lines.ts` writes its paths. */
const at = (n: number): string => String(Math.round(n * 100) / 100);

/**
 * The trend of the chart's first current line: `{ d }` when its readings hold one, `{ said }` when they do not, and
 * `null` when there are fewer than six readings or no current line.
 */
export function linesTrend(plan: LinesPlan): LinesTrend | null {
  const k = plan.lines.findIndex((l) => !l.was);
  if (k < 0) return null;
  const read = plan.points.map((p) => p.values.map((v) => linesValue(v)));
  const got = read.flatMap((vs, i) => (vs[k] === null || vs[k] === undefined ? [] : [{ x: i, v: vs[k]! }]));
  const n = got.length;
  if (n < LINES_TREND_POINTS) return null;

  /* THE SAME BOX AS THE LINES: x by the point's place, y between every line's highest and lowest value. */
  const every = read.flatMap((vs) => vs.slice(0, plan.lines.length)).filter((v): v is number => v !== null);
  const hi = Math.max(...every);
  const lo = Math.min(...every);
  const span = hi - lo;
  const count = plan.points.length;
  const x = (i: number) => (count > 1 ? (i / (count - 1)) * 1000 : 500);
  const y = (v: number) => (span > 0 ? ((hi - v) / span) * 100 : 50);

  /* MEASURED FROM THE FIRST READING, so the same value every time sums to exactly nought and a slope of exactly nought. */
  const x0 = got[0]!.x;
  const v0 = got[0]!.v;
  const xs = got.map((p) => p.x - x0);
  const ys = got.map((p) => p.v - v0);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i]! - mx) ** 2;
    sxy += (xs[i]! - mx) * (ys[i]! - my);
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  const start = my - slope * mx;
  let left = 0;
  for (let i = 0; i < n; i++) left += (ys[i]! - start - slope * xs[i]!) ** 2;
  const error = Math.sqrt(left / (n - 2) / sxx);
  /* AN EXACT FIT HAS NO ERROR TO DIVIDE BY: any slope at all is then plainly a trend, and none is plainly not. */
  const sure = slope !== 0 && (error === 0 || Math.abs(slope / error) >= LINES_TREND_T);
  if (!sure) return { said: noTrendSaid(n) };

  const first = got[0]!.x;
  const last = got[n - 1]!.x;
  const fitted = (i: number) => v0 + start + slope * (i - x0);
  return { d: `M${at(x(first))} ${at(y(fitted(first)))} L${at(x(last))} ${at(y(fitted(last)))}` };
}
