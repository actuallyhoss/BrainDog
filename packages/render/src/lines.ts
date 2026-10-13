/**
 * What `lines` decides, as functions both drawers call.
 *
 * A `lines` block is a measure over time, drawn as a line, with the same measure over the period before
 * drawn under it as a quiet dashed line, so a reader sees at a glance whether this month is ahead of the
 * last. The fence is a header row, then a row a point:
 *
 *     Day | Monthly recurring revenue | was: Previous 30 days
 *     18 Aug | £4,000.00 | £3,600.00
 *
 * A header cell written `was: <label>` is a comparison line, drawn dashed in a quiet ink beside the line
 * before it. The first line that is not a comparison is the one accent series a chart may have. At most
 * four lines draw. A missing value is a gap and never a zero, because a zero is a claim.
 *
 * The cells arrive as plain text, already drawn, so both renderers hand this the same strings and
 * everything they print comes back from here. No import from the app: this package is MIT and embeddable.
 */

import { MISSING } from './format.ts';
import { signedOf } from './bridge.ts';
import { amountLike } from './series.ts';

/** At most this many lines draw; a fifth column is left out of the drawing and the numbers alike. */
export const LINES_MOST = 4;

/** Two decimals at most, and no trailing zeros, so an attribute stays short and exact. */
const at = (n: number): string => String(Math.round(n * 100) / 100);

export type LinesLine = {
  label: string;
  /** A comparison line: the same measure over the period before, dashed and quiet. */
  was: boolean;
  /** Which line this is among its own kind, from 0, so a host styles the first current line as the accent. */
  step: number;
  /** The path in the `0 0 1000 100` box, broken at a gap. Empty when fewer than one point has a value. */
  d: string;
  /** A dot at the last point that has a value. */
  end: string;
};

export type LinesPlan = {
  /** What the first column names: `Day`. */
  axis: string;
  lines: LinesLine[];
  /** Every point, as printed: its label and each line's value, `—` for a gap. */
  points: { label: string; values: string[]; at: string }[];
  /** At most five labels along the bottom, each placed by `at` from 0 to 1. `minor` ones hide when narrow. */
  ticks: { label: string; at: string; minor: boolean }[];
  /** The highest and lowest value any line reaches, as printed, or '' when nothing drew. */
  top: string;
  bottom: string;
  /**
   * The lead: the first current line's last value, the comparison line's value at the same point, and the
   * change between them as a signed percentage. Each '' when it cannot be said.
   */
  now: string;
  then: string;
  change: string;
  /** Which way the change went, for a glyph a host may draw beside it. Never a colour: a rise is not a verdict. */
  trend: 'up' | 'down' | 'flat' | '';
  /** The label of the comparison line the change is measured against. */
  against: string;
  /** No value anywhere: the chart is a sentence. */
  empty: boolean;
  /**
   * ONE VALUE ANYWHERE, AND NOTHING TO SET IT AGAINST: the measure is a figure, and not a chart of one dot. `value` is
   * the reading as printed, `label` the point it was read at, and `line` the line it is on, which `was` says is the
   * period before and `alone` says is the chart's one current line, the one its heading names. `null` whenever there is
   * a line to draw.
   */
  single: { value: string; label: string; line: string; was: boolean; alone: boolean } | null;
  /** The chart's accessible name: each line's first and last value and its highest. */
  sentence: string;
};

/** A cell's number, signed, or `null` for a gap. */
export const linesValue = (cell: string): number | null => {
  const t = cell.trim();
  if (t === '' || t === MISSING) return null;
  const n = signedOf(t);
  return Number.isFinite(n) ? n : null;
};

/** A change as a reader says it: `+7.7%`, `−3.1%`, `0%`. The minus is a real minus sign. */
export function changeSaid(now: number, then: number): string {
  if (!Number.isFinite(now) || !Number.isFinite(then) || then === 0) return '';
  const pct = ((now - then) / Math.abs(then)) * 100;
  const rounded = Math.round(pct * 10) / 10;
  if (rounded === 0) return '0%';
  const body = Math.abs(rounded).toLocaleString('en-u-nu-latn', { maximumFractionDigits: 1 });
  return `${rounded > 0 ? '+' : '−'}${body}%`;
}

/** The index of the last point with a value, or -1. */
const lastOf = (values: (number | null)[]): number => {
  for (let i = values.length - 1; i >= 0; i--) if (values[i] !== null) return i;
  return -1;
};

/**
 * The lines, the lead and every printed figure, from the header row and the body rows as text.
 */
export function linesPlan(rows: readonly (readonly string[])[], home?: string | null): LinesPlan {
  const [head = [], ...body] = rows;
  const steps = { now: 0, was: 0 };
  const named = head.slice(1, LINES_MOST + 1).map((cell) => {
    const m = /^was:\s*(.*)$/iu.exec(cell.trim());
    const was = Boolean(m);
    return { label: m ? m[1]!.trim() : cell.trim(), was, step: was ? steps.was++ : steps.now++ };
  });

  const values = named.map((_, k) => body.map((r) => linesValue(r[k + 1] ?? '')));
  const every = values.flat().filter((v): v is number => v !== null);
  const hi = every.length ? Math.max(...every) : 0;
  const lo = every.length ? Math.min(...every) : 0;
  /* A FLAT RUN SITS IN THE MIDDLE, rather than on the top edge where a line reads as a ceiling. */
  const span = hi - lo;
  const n = body.length;
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * 1000 : 500);
  const y = (v: number) => (span > 0 ? ((hi - v) / span) * 100 : 50);

  const lines: LinesLine[] = named.map((line, k) => {
    let d = '';
    let open = false;
    values[k]!.forEach((v, i) => {
      if (v === null) {
        open = false;
        return;
      }
      d += `${d ? ' ' : ''}${open ? 'L' : 'M'}${at(x(i))} ${at(y(v))}`;
      open = true;
    });
    const last = lastOf(values[k]!);
    const end = last < 0 ? '' : `M${at(x(last))} ${at(y(values[k]![last]!))}h0`;
    return { ...line, d, end };
  });

  /* THE TEMPLATE A COMPUTED FIGURE IS WRITTEN IN: the first cell that holds a number, so a currency keeps its symbol. */
  const template = body.flatMap((r) => r.slice(1, named.length + 1)).find((c) => linesValue(c) !== null) ?? '';

  const points = body.map((r, i) => ({
    label: (r[0] ?? '').trim(),
    values: named.map((_, k) => (values[k]![i] === null ? MISSING : (r[k + 1] ?? '').trim())),
    at: at(n > 1 ? i / (n - 1) : 0.5),
  }));

  /* FIVE TICKS AT MOST: the ends and three between, the between ones minor so a narrow chart keeps the ends. */
  const tickAt = n <= 5 ? body.map((_, i) => i) : [0, Math.round((n - 1) / 4), Math.round((n - 1) / 2), Math.round((3 * (n - 1)) / 4), n - 1];
  const ticks = [...new Set(tickAt)].map((i) => ({
    label: (body[i]?.[0] ?? '').trim(),
    at: at(n > 1 ? i / (n - 1) : 0.5),
    minor: i !== 0 && i !== n - 1,
  }));

  /* THE LEAD IS THE FIRST CURRENT LINE, and the comparison beside it is the first `was:` line. */
  const primary = named.findIndex((l) => !l.was);
  const compared = named.findIndex((l) => l.was);
  let now = '';
  let then = '';
  let change = '';
  let trend: LinesPlan['trend'] = '';
  if (primary >= 0) {
    const last = lastOf(values[primary]!);
    if (last >= 0) {
      now = (body[last]?.[primary + 1] ?? '').trim();
      if (compared >= 0) {
        /* THE SAME POINT OF THE PERIOD BEFORE, or its last value before that point when the day itself is a gap. */
        const earlier = values[compared]!.slice(0, last + 1);
        const k = lastOf(earlier);
        if (k >= 0) {
          then = (body[k]?.[compared + 1] ?? '').trim();
          const a = values[primary]![last]!;
          const b = values[compared]![k]!;
          change = changeSaid(a, b);
          trend = change === '' ? '' : a > b ? 'up' : a < b ? 'down' : 'flat';
        }
      }
    }
  }

  const sentence = lines
    .map((line, k) => {
      const got = values[k]!.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
      if (!got.length) return `${line.label}, ${LINES_NOTHING}`;
      const first = got[0]!;
      const last = got[got.length - 1]!;
      const top = got.reduce((a, b) => (b.v > a.v ? b : a));
      const cell = (i: number) => (body[i]?.[k + 1] ?? '').trim();
      const label = (i: number) => (body[i]?.[0] ?? '').trim();
      return `${line.label}, ${label(first.i)} ${cell(first.i)} to ${label(last.i)} ${cell(last.i)}, highest ${cell(top.i)} on ${label(top.i)}`;
    })
    .join('; ');

  /* ONE READING IS A FIGURE. 227 of the 261 measures a real record had read that month held exactly one point, its import's,
     and a page of them drew each as a dot in an empty box over a fold of that one point. */
  const lone = every.length === 1 ? values.findIndex((v) => v.some((x) => x !== null)) : -1;
  const at1 = lone < 0 ? -1 : values[lone]!.findIndex((x) => x !== null);
  const single =
    lone < 0 || at1 < 0
      ? null
      : {
          value: (body[at1]?.[lone + 1] ?? '').trim(),
          label: (body[at1]?.[0] ?? '').trim(),
          line: named[lone]!.label,
          was: named[lone]!.was,
          alone: named.filter((l) => !l.was).length === 1,
        };

  return {
    axis: (head[0] ?? '').trim(),
    lines,
    points,
    ticks,
    top: every.length ? amountLike(template, hi, home, 'axis') : '',
    bottom: every.length && span > 0 ? amountLike(template, lo, home, 'axis') : '',
    now,
    then,
    change,
    trend,
    against: compared >= 0 ? named[compared]!.label : '',
    empty: every.length === 0,
    single,
    sentence,
  };
}

/**
 * WHAT A FIGURE OF ONE READING SAYS BESIDE ITS VALUE: when it was read, and that it is the only reading, which is why
 * there is no line. The line is named where the figure does not say which it is: under no heading, in the period before,
 * or on a chart of two lines or more, where "Revenue and costs" over a lone £5 read as the revenue it was not.
 */
export function linesOnly(single: NonNullable<LinesPlan['single']>, headed: boolean): string {
  const which = single.was || !single.alone || !headed ? `${single.line}, ` : '';
  const said = `${which}${single.label ? `${single.label}, ` : ''}${LINES_ONLY}`;
  return `${said.charAt(0).toUpperCase()}${said.slice(1)}`;
}

/** The point a pointer at `fraction` along the chart is nearest, or -1 when there are none. */
export function linesNearest(plan: Pick<LinesPlan, 'points'>, fraction: number): number {
  const n = plan.points.length;
  if (n === 0 || !Number.isFinite(fraction)) return -1;
  return Math.max(0, Math.min(n - 1, Math.round(fraction * (n - 1))));
}

/** The renderer's own words, as `series.ts` keeps its own: it imports nothing from the app. */
export const LINES_NONE = 'Nothing to draw yet: no point here has a value.';
export const LINES_NOTHING = 'no values';
/** NOT "The numbers", which is what a page of tiles is headed: a chart's fold holds the points it was drawn from. */
export const LINES_NUMBERS = 'Points on this chart';
export const LINES_AGAINST = 'against';
/** Beside a figure of one reading: why it is a figure and not a line. */
export const LINES_ONLY = 'the only reading';
