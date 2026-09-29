/**
 * A sparkline's geometry: where each value sits, the low and the high, the last point, and the words
 * it reads as.
 *
 * THE SCALE IS THE DATA'S OWN RANGE, not zero-based: a sparkline shows a shape, and the stat it
 * sits beside carries the figure (SYSTEM §7). A threshold widens the range so its rule is always on
 * the chart.
 *
 * PADDING IS THE DOT'S. The last point wears a 3px dot with a 1.5px ring, so 4px on every side keeps
 * it inside the box, and a mark label asks for a line's worth more on the side it sits.
 */

import { figure, r2, sentence, textWidth } from './shared.ts';

export type TrendMark = 'last' | 'low' | 'high';

export interface TrendPoint {
  /** The value's index in the list it came from. */
  i: number;
  v: number;
  x: number;
  y: number;
}

export interface TrendLabel {
  x: number;
  y: number;
  anchor: 'start' | 'end';
}

export interface TrendGeometry {
  points: TrendPoint[];
  /** `points` for the solid `<polyline>`. */
  line: string;
  /** `points` for the dashed projection, or '' when nothing is projected. */
  projection: string;
  /** `points` for the area under the solid line, down to the foot of the plot. */
  area: string;
  last: TrendPoint | null;
  low: TrendPoint | null;
  high: TrendPoint | null;
  /** The y of the dashed threshold rule, or null. */
  threshold: number | null;
  /** Where the marked point's label goes, when one was asked for. */
  label: TrendLabel | null;
}

export interface TrendOptions {
  width: number;
  height: number;
  mark?: TrendMark | undefined;
  /** A value to draw as a dashed rule (a target, a floor). */
  threshold?: number | undefined;
  /** The index from which the values are a projection, drawn dashed. */
  projectFrom?: number | undefined;
  /** The label for the marked point; its presence reserves a line for it. */
  markLabel?: string | undefined;
}

/** The room a label takes above or below the plot: 12px type and a little air. */
export const LABEL_ROOM = 16;
const PAD = 4;

const joined = (ps: readonly TrendPoint[]): string => ps.map((p) => `${r2(p.x)},${r2(p.y)}`).join(' ');

/** Which point the mark names. The first low and the first high, so a flat run is marked where it began. */
export function marked(points: readonly TrendPoint[], mark: TrendMark): TrendPoint | null {
  if (points.length === 0) return null;
  if (mark === 'last') return points[points.length - 1] ?? null;
  let best = points[0]!;
  for (const p of points) if (mark === 'low' ? p.v < best.v : p.v > best.v) best = p;
  return best;
}

/**
 * Does the label go below its point? The low's label goes under it and the high's over it. The last
 * point's goes on the side the line did not come from: under it when the line came down to it.
 */
export function labelBelow(values: readonly number[], mark: TrendMark): boolean {
  if (mark === 'low') return true;
  if (mark === 'high') return false;
  const finite = values.filter(Number.isFinite);
  const last = finite[finite.length - 1];
  const before = finite[finite.length - 2];
  return last !== undefined && before !== undefined && before > last;
}

export function sparkline(values: readonly number[], o: TrendOptions): TrendGeometry {
  const mark = o.mark ?? 'last';
  const below = o.markLabel ? labelBelow(values, mark) : false;
  const top = PAD + (o.markLabel && !below ? LABEL_ROOM : 0);
  const bottom = o.height - PAD - (o.markLabel && below ? LABEL_ROOM : 0);

  const finite = values.map((v, i) => ({ v, i })).filter((p) => Number.isFinite(p.v));
  const range = finite.map((p) => p.v);
  if (o.threshold !== undefined && Number.isFinite(o.threshold)) range.push(o.threshold);
  const lo = Math.min(...range);
  const hi = Math.max(...range);

  const n = values.length;
  const x = (i: number): number => (n <= 1 ? o.width - PAD : PAD + (i * (o.width - 2 * PAD)) / (n - 1));
  const y = (v: number): number => (hi === lo ? (top + bottom) / 2 : top + ((hi - v) / (hi - lo)) * (bottom - top));

  const points: TrendPoint[] = finite.map(({ v, i }) => ({ i, v, x: x(i), y: y(v) }));
  const p = o.projectFrom;
  const cut = p === undefined || !Number.isFinite(p) ? points.length : points.findIndex((pt) => pt.i >= p);
  const solid = cut < 0 ? points : points.slice(0, Math.max(cut + 1, 1));
  const projected = cut < 0 || cut >= points.length - 1 ? [] : points.slice(Math.max(cut, 0));

  const first = solid[0];
  const end = solid[solid.length - 1];
  const area =
    first && end && solid.length > 1
      ? `${r2(first.x)},${r2(bottom)} ${joined(solid)} ${r2(end.x)},${r2(bottom)}`
      : '';

  const at = marked(points, mark);
  let label: TrendLabel | null = null;
  if (at && o.markLabel) {
    const right = at.x > o.width * 0.5;
    const w = textWidth(o.markLabel);
    /* Anchored away from the edge it is nearer, and pulled in if it would still spill. */
    const anchor = right ? 'end' : 'start';
    const lx = right ? Math.max(at.x - 6, w) : Math.min(at.x + 6, o.width - w);
    label = { x: r2(lx), y: r2(below ? at.y + 16 : at.y - 8), anchor };
  }

  return {
    points,
    line: joined(solid),
    projection: joined(projected),
    area,
    last: points[points.length - 1] ?? null,
    low: marked(points, 'low'),
    high: marked(points, 'high'),
    threshold: o.threshold !== undefined && Number.isFinite(o.threshold) && range.length > 0 ? r2(y(o.threshold)) : null,
    label,
  };
}

/**
 * The sentence a sparkline reads as: "acme.example takings a day, 9 weeks, from 138 to 96, low 95".
 * `last` names both ends of the range, `low` and `high` the one they mark.
 */
export function describeSparkline(
  values: readonly number[],
  subject: string | undefined,
  mark: TrendMark = 'last',
  format: (n: number) => string = figure,
): string {
  const finite = values.filter(Number.isFinite);
  const first = finite[0];
  const last = finite[finite.length - 1];
  if (first === undefined || last === undefined) return sentence(subject, 'no figures yet');
  if (finite.length === 1) return sentence(subject, format(first));
  const lo = format(Math.min(...finite));
  const hi = format(Math.max(...finite));
  const ends = `from ${format(first)} to ${format(last)}`;
  const tail = mark === 'low' ? `low ${lo}` : mark === 'high' ? `high ${hi}` : `low ${lo}, high ${hi}`;
  return sentence(subject, `${ends}, ${tail}`);
}
