/**
 * A waffle's geometry: one small rounded square a unit, filled part by part in reading order ("part
 * of a whole", such as open tasks by tier).
 *
 * ONE SQUARE A THING while there are at most 200 of them. Past that each square stands for an equal
 * share and the counts are rounded by largest remainder, so the squares still add up to the whole and
 * no part rounds away while it has any.
 *
 * SQUARES ARE 10PX, 3PX APART, as many a row as fit. With `columns` the rows are that long and the
 * squares grow to fill the width, up to 16px.
 */

import { clamp, figure, listed } from './shared.ts';

export interface WaffleCell {
  /** Index of the part the square belongs to. */
  part: number;
  x: number;
  y: number;
}

export interface WaffleGeometry {
  cells: WaffleCell[];
  size: number;
  columns: number;
  height: number;
  /** How many things one square stands for (1 until the whole passes `most`). */
  per: number;
}

const GAP = 3;
const SIZE = 10;
export const MOST_CELLS = 200;

/** Squares per part: the counts themselves, or their shares of `most` by largest remainder. */
export function waffleUnits(values: readonly number[], most = MOST_CELLS): { units: number[]; per: number } {
  const vs = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const total = vs.reduce((s, v) => s + v, 0);
  if (total <= most && vs.every(Number.isInteger)) return { units: vs, per: 1 };
  const cells = Math.min(most, Math.max(1, Math.round(total)));
  const exact = vs.map((v) => (total > 0 ? (v / total) * cells : 0));
  const units = exact.map(Math.floor);
  let left = cells - units.reduce((s, u) => s + u, 0);
  const order = exact.map((e, i) => ({ i, rem: e - Math.floor(e) })).sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    units[i] = (units[i] ?? 0) + 1;
    left--;
  }
  /* A part with any share keeps a square, taken from the largest part. */
  for (const [i, v] of vs.entries())
    if (v > 0 && units[i] === 0) {
      const big = units.indexOf(Math.max(...units));
      units[big] = (units[big] ?? 1) - 1;
      units[i] = 1;
    }
  return { units, per: total / cells };
}

export function waffle(values: readonly number[], width: number, columns?: number): WaffleGeometry {
  const { units, per } = waffleUnits(values);
  const total = units.reduce((s, u) => s + u, 0);
  const size = columns && columns > 0 ? clamp(Math.floor((width - GAP * (columns - 1)) / columns), 6, 16) : SIZE;
  const fit = Math.max(1, Math.floor((width + GAP) / (size + GAP)));
  const cols = columns && columns > 0 ? Math.min(columns, fit) : Math.max(1, Math.min(total, fit));
  const pitch = size + GAP;

  const cells: WaffleCell[] = [];
  units.forEach((u, part) => {
    for (let k = 0; k < u; k++) {
      const n = cells.length;
      cells.push({ part, x: (n % cols) * pitch, y: Math.floor(n / cols) * pitch });
    }
  });
  const rows = Math.ceil(total / cols);
  return { cells, size, columns: cols, height: Math.max(0, rows * pitch - GAP), per };
}

/** "23 open tasks: 1 urgent, 6 high, 11 medium and 5 low". */
export function describeWaffle(parts: readonly { label: string; value: number }[], subject?: string): string {
  const kept = parts.filter((p) => Number.isFinite(p.value) && p.value > 0);
  const total = kept.reduce((s, p) => s + p.value, 0);
  if (kept.length === 0) return subject ? `No ${subject}` : 'None';
  const lead = subject ? `${figure(total)} ${subject}` : `${figure(total)} in all`;
  return `${lead}: ${listed(kept.map((p) => `${figure(p.value)} ${p.label}`))}`;
}
