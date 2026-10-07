/**
 * A ring's geometry: a track circle and an arc from twelve o'clock, clockwise, as long as the share.
 *
 * THE STROKE FOLLOWS THE SIZE: 8px from 96px up (Decide's 140px ring), thinner below, never
 * under 3px. The arc is a dash on a full circle rotated to the top, so a share of 1 is a closed
 * circle and a share of 0 draws nothing at all (a round cap on a zero-length dash would draw a dot
 * that says "a little"). The gap after the dash is a whole circle, so the arc can be swept in by its offset.
 */

import { clamp, figure, r2, sentence } from './shared.ts';

export interface RingGeometry {
  size: number;
  c: number;
  r: number;
  stroke: number;
  /** The share, 0 to 1. */
  share: number;
  /** `stroke-dasharray` for the arc, or null when there is no arc to draw. */
  dash: string | null;
  /** The arc's length in px, which its first draw sweeps round from (`viz.css`). */
  arc: number;
  /** Is there room inside for the figure? */
  roomy: boolean;
  /** And for a caption under it? */
  captioned: boolean;
}

export function ring(value: number, max: number, size: number): RingGeometry {
  const s = Math.max(8, size);
  const stroke = s >= 96 ? 8 : Math.max(3, Math.round(s / 12));
  const r = (s - stroke) / 2;
  const share = max > 0 && Number.isFinite(value) ? clamp(value / max, 0, 1) : 0;
  const len = 2 * Math.PI * r;
  return {
    size: s,
    c: s / 2,
    r: r2(r),
    stroke,
    share,
    dash: share > 0 ? `${r2(share * len)} ${r2(len)}` : null,
    arc: r2(share * len),
    roomy: s >= 72,
    captioned: s >= 112,
  };
}

/** "Filed by your rules: 53 of 58". The caption, when there is one, closes the sentence. */
export function describeRing(
  value: number,
  max: number,
  subject: string | undefined,
  label?: string,
  format: (n: number) => string = figure,
): string {
  const reading = `${format(value)} of ${format(max)}${label ? `, ${label}` : ''}`;
  return subject ? `${subject}: ${reading}` : sentence(undefined, reading);
}
