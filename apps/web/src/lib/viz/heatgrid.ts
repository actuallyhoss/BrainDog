/**
 * A heat grid's geometry: rows by columns of rounded squares, each shaded by how much, with the row
 * names at the left and every few column names on top ("intensity over time",
 * such as changes by hour).
 *
 * FIVE STEPS, NOT A GRADIENT: nothing, then four quarters of the busiest cell, drawn as the track and
 * then four steps of the accent, from a wash (`h1`) through its two tints to the full accent. Four
 * steps are what an eye can tell apart; a continuous scale is a promise of precision the squares
 * cannot keep. None of them is the grey for "other", because a quiet hour is not another kind of thing.
 *
 * THE SQUARES FIT THE WIDTH, between 6px and 18px, 3px apart, so a phone gets smaller squares and a
 * wide tile does not get huge ones; the column labels thin out to stay 6px apart. A row is never
 * under 11px tall, because its name is 12px type: on a phone the squares become upright bars.
 */

import { clamp, figure, r2, textWidth } from './shared.ts';

export type HeatLevel = 0 | 1 | 2 | 3 | 4;

export interface HeatCell {
  r: number;
  c: number;
  x: number;
  y: number;
  v: number;
  level: HeatLevel;
}

export interface HeatGeometry {
  cells: HeatCell[];
  /** A cell's width, which is its height too unless the row needs more room for its name. */
  size: number;
  /** A cell's height: its width, but never under 11px, so the row names never touch. */
  tall: number;
  rowLabels: { y: number; text: string }[];
  colLabels: { x: number; text: string }[];
  height: number;
  /** The grid's own width, which may be less than the chart's. */
  gridW: number;
}

const GAP = 3;
const TOP = 18;
const STEPS = [1, 2, 3, 4, 6, 8, 12, 24] as const;

/** 0 for nothing, then 1 to 4 by quarter of `max`. */
export function heatLevel(v: number, max: number): HeatLevel {
  if (!(v > 0) || !(max > 0)) return 0;
  return (1 + Math.min(3, Math.floor((v / max) * 4 - 1e-9))) as HeatLevel;
}

/** The tone each level is drawn in. */
export const HEAT_TONES = ['track', 'h1', 'g3', 'g2', 'ink'] as const;

export function heatgrid(rows: readonly string[], cols: readonly string[], values: readonly (readonly number[])[], width: number): HeatGeometry {
  const gutter = Math.max(0, ...rows.map((r) => textWidth(r))) + 8;
  const n = Math.max(1, cols.length);
  const size = clamp(Math.floor((width - gutter + GAP) / n - GAP), 6, 18);
  const pitch = size + GAP;
  const tall = Math.max(size, 11);
  const rowPitch = tall + GAP;
  const max = Math.max(0, ...values.flat().filter(Number.isFinite));

  const cells: HeatCell[] = [];
  rows.forEach((_, r) =>
    cols.forEach((__, c) => {
      const v = values[r]?.[c] ?? 0;
      cells.push({ r, c, x: gutter + c * pitch, y: TOP + r * rowPitch, v, level: heatLevel(v, max) });
    }),
  );

  /* Every `step` columns, the smallest step at which the widest label clears the next by 6px. */
  const widest = Math.max(0, ...cols.map((c) => textWidth(c)));
  const step = STEPS.find((s) => s * pitch >= widest + 6) ?? n;
  const colLabels = cols.flatMap((text, c) => (c % step === 0 ? [{ x: r2(gutter + c * pitch + size / 2), text }] : []));
  const rowLabels = rows.map((text, r) => ({ y: r2(TOP + r * rowPitch + tall / 2 + 4), text }));

  return {
    cells,
    size,
    tall,
    rowLabels,
    colLabels,
    height: TOP + rows.length * rowPitch - GAP,
    gridW: gutter + n * pitch - GAP,
  };
}

/** "Changes by hour, last 7 days: busiest Tue 09 (14), quietest Sat 03 (0)". Ties go to the first. */
export function describeHeat(
  rows: readonly string[],
  cols: readonly string[],
  values: readonly (readonly number[])[],
  subject?: string,
  format: (n: number) => string = figure,
): string {
  let hi: [number, number, number] | null = null;
  let lo: [number, number, number] | null = null;
  for (let r = 0; r < rows.length; r++)
    for (let c = 0; c < cols.length; c++) {
      const v = values[r]?.[c];
      if (v === undefined || !Number.isFinite(v)) continue;
      if (!hi || v > hi[2]) hi = [r, c, v];
      if (!lo || v < lo[2]) lo = [r, c, v];
    }
  const at = (p: [number, number, number]): string => `${rows[p[0]]} ${cols[p[1]]} (${format(p[2])})`;
  const reading = hi && lo ? `busiest ${at(hi)}, quietest ${at(lo)}` : 'nothing yet';
  return subject ? `${subject}: ${reading}` : reading.charAt(0).toUpperCase() + reading.slice(1);
}
