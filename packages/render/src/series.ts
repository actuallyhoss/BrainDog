/**
 * What `series` decides, as functions both drawers call.
 *
 * A series is bars by bucket: money in stands up from a zero rule and money out hangs under it, on
 * one scale, so a month that took more than it brought is visibly longer below the line. The `net`
 * form draws what was left, in minus out, as one line. The current bucket is `partial` and drawn
 * faint, or `due` when it also holds money due later in it, drawn faint inside a dashed edge; a bucket
 * still to come is `ahead` and drawn as an outline. A missing value is a gap and
 * never a zero, because a zero is a claim.
 *
 * The cells arrive as plain text, already drawn, so both renderers hand this the same strings and
 * everything they print comes back from here.
 */

import { MISSING, axisFigure } from './format.ts';
import { signedOf } from './bridge.ts';
import { figureLike } from './figure.ts';

/** Two decimals at most, and no trailing zeros, so an attribute stays short and exact. */
const at = (n: number): string => String(Math.round(n * 100) / 100);

export type SeriesDir = 'in' | 'out';
export type SeriesState = '' | 'partial' | 'due' | 'ahead';

/** At most this many series draw; a fifth column is left out of the drawing and the numbers alike. */
export const SERIES_MOST = 4;

export type SeriesBar = { series: number; dir: SeriesDir; step: number; state: SeriesState; x: string; y: string; width: string; height: string };

export type SeriesPlan = {
  /** What the first column names: `Month`. */
  axis: string;
  series: { label: string; dir: SeriesDir; step: number }[];
  buckets: {
    label: string;
    /** The first word of the label, for a narrow container. */
    short: string;
    state: SeriesState;
    /** The state as words beside the bucket, or '' when it is complete. */
    said: string;
    /** Each series' value as printed: the cell, or `—` for a gap. */
    values: string[];
    /** In minus out as printed, or `—` when every value in the bucket is a gap. */
    net: string;
  }[];
  bars: SeriesBar[];
  /** The zero rule's y, in the `0 0 1000 100` box. */
  zero: string;
  /** The net line's path, broken at a gap, and a dot at every point. Empty without the `net` form. */
  netLine: string;
  netDots: string;
  /** The largest stack up and down, as printed, or '' when nothing stands on that side. */
  top: string;
  bottom: string;
  /** No value anywhere above zero: the chart is a sentence. */
  empty: boolean;
  /** The chart's accessible name. */
  sentence: string;
};

/** A cell's magnitude, or `null` for a gap. */
export const seriesValue = (cell: string): number | null => {
  const t = cell.trim();
  if (t === '' || t === MISSING) return null;
  const n = signedOf(t);
  return Number.isFinite(n) ? Math.abs(n) : null;
};

const stateOf = (cell: string | undefined): SeriesState => {
  const t = (cell ?? '').trim().toLowerCase();
  return t === 'partial' || t === 'due' || t === 'ahead' ? t : '';
};

/**
 * The bars, the net and every printed figure, from the header row and the body rows as text.
 *
 * `net` is the fence's `net` form.
 */
export function seriesPlan(rows: readonly (readonly string[])[], net = false): SeriesPlan {
  const [head = [], ...body] = rows;
  const stated = head.length > 1 && head[head.length - 1]!.trim().toLowerCase() === 'state';
  const named = head.slice(1, stated ? -1 : undefined).slice(0, SERIES_MOST);
  const steps = { in: 0, out: 0 };
  const series = named.map((cell) => {
    const m = /^(in|out):\s*(.*)$/iu.exec(cell.trim());
    const dir: SeriesDir = m && m[1]!.toLowerCase() === 'out' ? 'out' : 'in';
    return { label: m ? m[2]! : cell.trim(), dir, step: steps[dir]++ };
  });
  const stateAt = stated ? head.length - 1 : -1;

  const values = body.map((r) => series.map((_, i) => seriesValue(r[i + 1] ?? '')));
  const sums = values.map((v) => ({
    up: v.reduce<number>((s, x, i) => s + (series[i]!.dir === 'in' ? (x ?? 0) : 0), 0),
    down: v.reduce<number>((s, x, i) => s + (series[i]!.dir === 'out' ? (x ?? 0) : 0), 0),
    gap: v.every((x) => x === null),
  }));
  const hi = Math.max(0, ...sums.map((s) => s.up));
  const lo = Math.max(0, ...sums.map((s) => s.down));
  const template = body.flatMap((r) => r.slice(1, series.length + 1)).find((c) => seriesValue(c) !== null) ?? '';
  const netOf = (i: number): number | null => (sums[i]!.gap ? null : sums[i]!.up - sums[i]!.down);

  const n = body.length;
  const slot = n ? 1000 / n : 1000;
  const span = hi + lo;
  const y = (v: number) => (span ? ((hi - v) / span) * 100 : 50);
  /* A BAR IS NO WIDER THAN IT IS AT TEN BUCKETS. A new record's weekly count has one week, and its bar filled six tenths of
     the chart, a green slab rather than a bar. It stays centred in its slot, under its label. */
  const barWidth = Math.min(slot * 0.6, 60);
  const bars: SeriesBar[] = [];
  if (span > 0)
    body.forEach((r, i) => {
      const state = stateOf(stated ? r[stateAt] : undefined);
      let up = 0;
      let down = 0;
      series.forEach((s, k) => {
        const v = values[i]![k];
        if (v === null || v === undefined || v === 0) return;
        const from = s.dir === 'in' ? up : -down;
        const to = s.dir === 'in' ? up + v : -down - v;
        if (s.dir === 'in') up += v;
        else down += v;
        const top = y(Math.max(from, to));
        bars.push({ series: k, dir: s.dir, step: s.step, state, x: at(i * slot + (slot - barWidth) / 2), y: at(top), width: at(barWidth), height: at(y(Math.min(from, to)) - top) });
      });
    });

  let netLine = '';
  let netDots = '';
  if (net && span > 0) {
    let open = false;
    body.forEach((_, i) => {
      const v = netOf(i);
      if (v === null) {
        open = false;
        return;
      }
      const px = at(i * slot + slot / 2);
      const py = at(y(v));
      netLine += `${netLine ? ' ' : ''}${open ? 'L' : 'M'}${px} ${py}`;
      netDots += `${netDots ? ' ' : ''}M${px} ${py}h0`;
      open = true;
    });
  }

  const shortOf = (label: string): string => {
    const words = label.split(/\s+/u);
    return words.length > 2 ? (words.at(-2) ?? label) : (words[0] ?? label);
  };
  const buckets = body.map((r, i) => {
    const label = (r[0] ?? '').trim();
    const state = stateOf(stated ? r[stateAt] : undefined);
    const v = netOf(i);
    return {
      label,
      /* The first word (`Sep` of `Sep 2026`), or the day a week begins on (`20` of `Week of 20 Jul`). */
      short: shortOf(label),
      state,
      said: state === 'partial' ? SERIES_PARTIAL : state === 'due' ? SERIES_DUE : state === 'ahead' ? SERIES_AHEAD : '',
      values: series.map((_, k) => (values[i]![k] === null ? MISSING : (r[k + 1] ?? '').trim())),
      net: v === null ? MISSING : figureLike(template, v),
    };
  });

  const sentence = buckets
    .map((b) => {
      const parts = series.map((s, k) => `${s.label} ${b.values[k]}`);
      if (net) parts.push(`${SERIES_NET} ${b.net}`);
      return `${b.label}${b.said ? ` ${b.said}` : ''}, ${parts.join(', ')}`;
    })
    .join('; ');

  return {
    axis: (head[0] ?? '').trim(),
    series,
    buckets,
    bars,
    zero: at(y(0)),
    netLine,
    netDots,
    top: hi > 0 ? axisFigure(figureLike(template, hi)) : '',
    bottom: lo > 0 ? axisFigure(figureLike(template, -lo)) : '',
    empty: span <= 0,
    sentence,
  };
}

/** The renderer's own words, as `split.ts` keeps `SPLIT_ZERO`: it imports nothing from the app. */
export const SERIES_NONE = 'Nothing to draw yet: every bucket here is empty or zero.';
export const SERIES_NET = 'Net';
export const SERIES_PARTIAL = 'so far';
export const SERIES_AHEAD = 'expected';
/** The current bucket when it counts money due later in it beside what was paid so far. */
export const SERIES_DUE = 'so far, and due';
export const SERIES_NUMBERS = 'The numbers';
