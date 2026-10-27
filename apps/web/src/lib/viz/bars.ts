/**
 * Horizontal bars' geometry: one row per item, its label at the left, its bar, an optional note at
 * the bar's end, and its value at the right.
 *
 * TWO SHAPES. Alone, each bar is 8px on a full-width track (the "since you were here" rows). Paired,
 * each row holds two 7px bars, this period over the last, and no track, because the second bar is
 * the comparison a track would only blur ("September against August").
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
  /** The note's baseline where the label is over its bar, on the bar's line; else the label's (`textY`). */
  noteY?: number;
}

export interface BarsGeometry {
  rows: BarRow[];
  /** The track behind each lone bar: x and width; its y and height are each row's bar's. */
  track: { x: number; w: number } | null;
  /** The x the values are anchored to (their end). */
  valueX: number;
  height: number;
  /** Each label is over its bar, since one would not fit two fifths of the width. */
  stacked: boolean;
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
/** A row whose label sits over its bar: the label's line, then the bar (or the two) under it. */
export const ROW_STACKED = 34;
export const ROW_STACKED_PAIRED = 40;
const GAP = 12;
/** The size a bar's label, value and note are drawn at (`viz.css`, `--fs-meta`). */
const LABEL = 13;

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
  /* AT 13, the size the labels are drawn at (P29): at 12 a bar's name was the smallest words on its page. */
  const longest = Math.max(0, ...items.map((it) => textWidth(it.label, LABEL))) + GAP;
  const valueCol = Math.max(0, ...values.map((v) => textWidth(v, LABEL))) + GAP;
  const noteCol = Math.max(0, ...items.map((it) => (it.note ? textWidth(it.note, LABEL) + 8 : 0)));

  /* A LABEL WIDER THAN TWO FIFTHS GOES OVER ITS BAR: held to the column, "File a Ledger
     entry in its account's book" ran on under its own bar at 390 and the bar was drawn over the words. Over the bar it
     has the width but the value's, and is cut with an ellipsis only past that. */
  const stacked = longest > Math.round(o.width * 0.4);
  const gutter = stacked ? 0 : longest;
  const space = Math.max(0, o.width - gutter - (stacked ? 0 : valueCol) - noteCol);

  const all = [...items.map((it) => it.value), ...(o.paired ?? [])].filter(Number.isFinite);
  const max = o.max !== undefined && o.max > 0 ? o.max : Math.max(0, ...all);

  const pitch = stacked ? (paired ? ROW_STACKED_PAIRED : ROW_STACKED) : paired ? ROW_PAIRED : ROW_ALONE;
  /* Under its label a bar starts a line down: 20 alone, 18 and 27 paired. */
  const drop = stacked ? 17 : 0;
  const rows = items.map((it, i): BarRow => {
    const y = i * pitch;
    const bar = paired ? barRect(gutter, y + drop + 1, it.value, max, space, 7) : barRect(gutter, y + (stacked ? 20 : 6), it.value, max, space, 8);
    const pair = paired ? barRect(gutter, y + drop + 10, o.paired?.[i] ?? 0, max, space, 7) : null;
    return {
      label: stacked ? fitted(it.label, o.width - valueCol) : it.label,
      textY: y + 13,
      bar,
      pair,
      value: values[i] ?? '',
      noteX: r2(gutter + Math.max(bar.w, pair?.w ?? 0) + 6),
      ...(stacked ? { noteY: y + (paired ? 31 : 29) } : {}),
    };
  });

  return {
    rows,
    track: paired ? null : { x: gutter, w: r2(space) },
    valueX: o.width,
    height: Math.max(0, items.length * pitch - (pitch - (stacked ? pitch - 2 : 17))),
    stacked,
  };
}

/** A label cut to `room` px with an ellipsis, by the same measure the columns are made with. */
function fitted(label: string, room: number): string {
  if (textWidth(label, LABEL) <= room) return label;
  const chars = [...label];
  while (chars.length > 1 && textWidth(`${chars.join('').trimEnd()}…`, LABEL) > room) chars.pop();
  return `${chars.join('').trimEnd()}…`;
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
