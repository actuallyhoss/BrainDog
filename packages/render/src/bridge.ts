/**
 * What `bridge` decides, as functions both drawers call.
 *
 * A bridge walks from a start to an end: the first row is where it starts, the last where it ends,
 * and every row between is a movement up or down. The bars float from one level to the next. The
 * arithmetic is checked here, because a bridge whose rows do not add up is a drawing of a sum that
 * is wrong, and the reader is owed the sentence rather than a tidy picture.
 */

import { MISSING, magnitudeOf, quantity } from './format.ts';

/** Two decimals at most, and no trailing zeros, so an attribute stays short and exact. */
const at = (n: number): string => String(Math.round(n * 100) / 100);

/**
 * The signed number in a cell as drawn.
 *
 * `magnitudeOf` reads `GBP −1,600.00` and `-1600`, but a symbol figure is written `−£1,600.00`, the
 * sign in front of the symbol, and the digits alone read as a positive 1,600: a movement down drawn
 * as a movement up. A minus followed by at most a symbol or a code before the digits is the sign.
 */
export function signedOf(text: string): number {
  const n = magnitudeOf(text);
  if (!Number.isFinite(n) || n <= 0) return n;
  const first = text.search(/\d/u);
  return /^\s*[−-]\s*[^\s\d]{0,3}\s*$/u.test(text.slice(0, first)) ? -n : n;
}

export type BridgeMove = 'start' | 'up' | 'down' | 'end';

/** One bar, twice: standing in a column of the `0 0 1000 100` chart, and lying along an inline row. */
export type BridgeBar = {
  move: BridgeMove;
  /** The column chart: a slot per row, the bar in the middle of it. */
  x: string;
  width: string;
  y: string;
  height: string;
  /** The inline bar: the same level, across the row. */
  from: string;
  span: string;
};

export type BridgePlan = {
  /** One per row, or null when there is nothing to draw: under two rows, a row with no number, or nothing but zero. */
  bars: BridgeBar[] | null;
  /** The zero line in the column chart, when the walk crosses it. */
  zero: string | null;
  /** What is wrong with the arithmetic, in words, or null when the rows add up. */
  warn: string | null;
};

/** How a number reads in a sentence here, with a real minus. */
const said = (n: number): string => quantity(Math.round(n * 100) / 100, '');

/** The move a row makes, by where it sits in the walk. */
export const moveOf = (i: number, rows: number, value: number): BridgeMove =>
  i === 0 ? 'start' : i === rows - 1 ? 'end' : value < 0 ? 'down' : 'up';

/**
 * The bars and the check, from each row's signed number.
 *
 * START AND END STAND ON ZERO and a movement floats from the level before it, so every bar is to one
 * scale and the zero is in view. A row with no number draws nothing at all, because every level
 * after it would be a guess; the rows still print their words and the warn line says why.
 */
export function bridgePlan(values: readonly number[]): BridgePlan {
  const n = values.length;
  if (n < 2) return { bars: null, zero: null, warn: null };
  if (values.some((v) => !Number.isFinite(v))) return { bars: null, zero: null, warn: BRIDGE_UNKNOWN };

  const levels: [number, number][] = [];
  let level = values[0]!;
  values.forEach((v, i) => {
    if (i === 0 || i === n - 1) levels.push([0, v]);
    else {
      levels.push([level, level + v]);
      level += v;
    }
  });
  const end = values[n - 1]!;
  const warn = Math.abs(level - end) > 1e-9 * Math.max(1, Math.abs(end)) ? bridgeOff(level, end) : null;

  const all = levels.flat();
  const lo = Math.min(0, ...all);
  const hi = Math.max(0, ...all);
  if (hi === lo) return { bars: null, zero: null, warn };
  const s = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const slot = 1000 / n;
  const bars = levels.map(([a, b], i) => {
    const top = s(Math.max(a, b));
    const bottom = s(Math.min(a, b));
    return {
      move: moveOf(i, n, values[i]!),
      x: at(i * slot + slot * 0.2),
      width: at(slot * 0.6),
      y: at(100 - top),
      height: at(top - bottom),
      from: at(bottom * 10),
      span: at((top - bottom) * 10),
    };
  });
  return { bars, zero: lo < 0 && hi > 0 ? at(100 - s(0)) : null, warn };
}

/** The chart's accessible name: every row, its label and its amount as drawn. */
export const bridgeSentence = (rows: readonly { label: string; value: string }[]): string =>
  rows.map((r) => `${r.label} ${r.value || MISSING}`.trim()).join(', ');

/** The renderer's own words, as `cards.ts` keeps `CARDS_NONE`: it imports nothing from the app. */
/** The heads of the fold's table: each row's label, then its amount as written. */
export const BRIDGE_STEP = 'Step';
export const BRIDGE_AMOUNT = 'Amount';
export const BRIDGE_UNKNOWN = 'A row here has no number, so the bars are not drawn.';
export const bridgeOff = (sum: number, end: number): string =>
  `These rows do not add up: the start and the movements come to ${said(sum)}, and the end says ${said(end)}.`;
