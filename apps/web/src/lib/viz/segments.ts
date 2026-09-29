/**
 * Segments' geometry: one cell per step or part, done ones filled, the current one outlined, the rest
 * quiet (the design system: "progress").
 *
 * THE CELLS SHARE THE WIDTH, 3px apart, 8px tall with a radius of 3. Many steps in a narrow box close
 * the gap to 1px and then to none rather than drawing cells thinner than their gaps; past about a
 * third of the width in steps, a `Stacked` or a `Ring` reads better, and the caller should use one.
 */

import { ordinal, r2 } from './shared.ts';

export type SegmentState = 'done' | 'current' | 'rest';

export interface Segment {
  x: number;
  w: number;
  state: SegmentState;
  rx: number;
}

export const SEG_HEIGHT = 8;

export function segments(total: number, done: number, width: number, current = false): Segment[] {
  const n = Math.max(0, Math.floor(Number.isFinite(total) ? total : 0));
  if (n === 0 || width <= 0) return [];
  const d = Math.min(Math.max(0, Math.floor(Number.isFinite(done) ? done : 0)), n);
  const room = width / n;
  const gap = room >= 12 ? 3 : room >= 4 ? 1 : 0;
  const w = (width - gap * (n - 1)) / n;
  return Array.from({ length: n }, (_, i): Segment => ({
    x: r2(i * (w + gap)),
    w: r2(w),
    state: i < d ? 'done' : current && i === d ? 'current' : 'rest',
    rx: r2(Math.min(3, w / 2)),
  }));
}

/** "Lina, parts paid: 10 of 23, the 11th current". */
export function describeSegments(total: number, done: number, subject: string | undefined, current = false): string {
  const n = Math.max(0, Math.floor(total));
  const d = Math.min(Math.max(0, Math.floor(done)), n);
  const now = current && d < n ? `, the ${ordinal(d + 1)} current` : '';
  return `${subject ? `${subject}: ` : ''}${d} of ${n} done${now}`;
}
