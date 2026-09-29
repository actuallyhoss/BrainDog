/**
 * Horizontal bars' geometry: one row per item, its label at the left, its bar, an optional note at
 * the bar's end, and its value at the right.
 *
 * TWO SHAPES. Alone, each bar is 8px on a full-width track (the "since you were here" rows). Paired,
 * each row holds two 7px bars, this period over the last, and no track, because the second bar is
 * the comparison a track would only blur (Light-Money's "September against August").
 *
 * THE SCALE STARTS AT ZERO, always: a bar's length is its value. `max` fixes the scale when several
 * charts must share one; otherwise the largest value, paired ones included, fills the row.
 */

import { clamp, figure, r2, textWidth } from './shared.ts';

export interface BarRect {
  x: number;
  y: number;
  w: number;
  h: number;
  rx: number;
}

export interface BarRow {
  label: string;
  /** Baseline of the label and the value. */
  textY: number;
  bar: BarRect;
  /** The comparison bar, when the chart is paired. */
  pair: BarRect | null;
  value: string;
  /** Where the note starts, just past the longer of the two bars. */
  noteX: number;
}

export interface BarsGeometry {
  rows: BarRow[];
  /** The track behind each lone bar: x and width; its y and height are each row's bar's. */
  track: { x: number; w: number } | null;
  /** The x the values are anchored to (their end). */
  valueX: number;
  height: number;
}

export interface BarsInput {
  label: string;
  value: number;
  note?: string | undefined;
}

export interface BarsOptions {
  width: number;
  max?: number | undefined;
  paired?: readonly number[] | undefined;
  format?: ((n: number) => string) | undefined;
}

export const ROW_ALONE = 22;
export const ROW_PAIRED = 20;
const GAP = 12;

/** A bar's rectangle: never under 2px when its value is above zero, and its radius never more than half of it. */
export function barRect(x: number, y: number, value: number, max: number, space: number, h: number): BarRect {
  const v = clamp(Number.isFinite(value) ? value : 0, 0, max > 0 ? max : 0);
  const w = max > 0 && v > 0 ? Math.max(2, (v / max) * space) : 0;
  return { x: r2(x), y: r2(y), w: r2(w), h, rx: r2(Math.min(3, w / 2, h / 2)) };
}

export function bars(items: readonly BarsInput[], o: BarsOptions): BarsGeometry {
  const format = o.format ?? figure;
  const paired = o.paired !== undefined;
  const values = items.map((it) => format(it.value));

  /* The label column is the longest label, and never more than two fifths of the chart. */
  const gutter = Math.min(Math.max(0, ...items.map((it) => textWidth(it.label))) + GAP, Math.round(o.width * 0.4));
  const valueCol = Math.max(0, ...values.map((v) => textWidth(v))) + GAP;
  const noteCol = Math.max(0, ...items.map((it) => (it.note ? textWidth(it.note) + 8 : 0)));
  const space = Math.max(0, o.width - gutter - valueCol - noteCol);

  const all = [...items.map((it) => it.value), ...(o.paired ?? [])].filter(Number.isFinite);
  const max = o.max !== undefined && o.max > 0 ? o.max : Math.max(0, ...all);

  const pitch = paired ? ROW_PAIRED : ROW_ALONE;
  const rows = items.map((it, i): BarRow => {
    const y = i * pitch;
    const bar = paired ? barRect(gutter, y + 1, it.value, max, space, 7) : barRect(gutter, y + 6, it.value, max, space, 8);
    const pair = paired ? barRect(gutter, y + 10, o.paired?.[i] ?? 0, max, space, 7) : null;
    return {
      label: it.label,
      textY: y + 13,
      bar,
      pair,
      value: values[i] ?? '',
      noteX: r2(gutter + Math.max(bar.w, pair?.w ?? 0) + 6),
    };
  });

  return {
    rows,
    track: paired ? null : { x: gutter, w: r2(space) },
    valueX: o.width,
    height: Math.max(0, items.length * pitch - (pitch - 17)),
  };
}

/**
 * "September against August: Household 9,800 against 11,200; Outing 7,400 against 5,300, up 40%".
 * A note rides with its item, since it is usually the reason that item is highlighted.
 */
export function describeBars(
  items: readonly BarsInput[],
  subject: string | undefined,
  paired?: readonly number[],
  format: (n: number) => string = figure,
): string {
  if (items.length === 0) return subject ? `${subject}: nothing yet` : 'Nothing yet';
  const said = items.map((it, i) => {
    const against = paired && paired[i] !== undefined ? ` against ${format(paired[i])}` : '';
    return `${it.label} ${format(it.value)}${against}${it.note ? `, ${it.note}` : ''}`;
  });
  return `${subject ? `${subject}: ` : ''}${said.join('; ')}`;
}
