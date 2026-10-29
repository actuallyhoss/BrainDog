/**
 * What `progress` decides, as functions both drawers call.
 *
 * A progress row is one track filled toward a target: a savings goal filled by what is saved, a goal by what is done,
 * a project by the steps finished. The `budget` form reads the same row as a limit, where filling it is not the aim:
 * spending past the limit is marked beyond a line at the limit and said as how much over, and close to it is a watch.
 *
 * THE INTENT IS THE READING, as a gauge's is, and a row that is fine is not coloured: a goal is `good` only once it
 * is reached, a budget is `warn` from nine tenths and `bad` past the limit. A tone the host wrote on a row wins.
 *
 * The geometry and the words live here, as `split.ts` keeps its cuts, so both renderers draw the same fill and a test
 * can check it without a DOM.
 */

import type { Tone } from './kinds.ts';
import { signedOf } from './bridge.ts';
import { amountLike } from './series.ts';
import { MISSING } from './format.ts';

export type ProgressForm = 'goal' | 'budget' | 'range';

/** One row as the plan reads it: the value and target as drawn, and a tone the host wrote, if any. */
export type ProgressInput = { value: string; target: string; tone?: Tone };

export type ProgressBar = {
  /** Whether there is a target above zero to measure against. A row without one keeps its words and draws no fill. */
  drawable: boolean;
  /** How much of the track is filled, `0.00` to `1.00`. */
  fill: string;
  /** On a budget spent past its limit: where the limit falls along the track, the part after it being the overspend. */
  limit: string | null;
  /** The value as a share of the target, as printed: `67%`. */
  share: string;
  intent: Tone | undefined;
  /** What is left to go, left to spend, or how far over, in the target's own shape. Empty when it cannot be said. */
  left: string;
};

const fixed = (v: number): string => Math.max(0, Math.min(1, v)).toFixed(2);

/** At or past this share a budget is a watch. */
export const PROGRESS_NEAR = 0.9;

/** Each row's fill, share, intent and what is left, for the form the fence names. */
export function progressPlan(rows: readonly ProgressInput[], form: ProgressForm = 'goal', home?: string | null): ProgressBar[] {
  return rows.map(({ value, target, tone }) => {
    const t = signedOf(target);
    const read = signedOf(value);
    /* NO VALUE YET IS NOTHING SO FAR, so a goal with nothing saved draws an empty track rather than no track. */
    const v = Number.isFinite(read) ? read : 0;
    if (!Number.isFinite(t) || t <= 0) return { drawable: false, fill: '0.00', limit: null, share: MISSING, intent: tone, left: '' };
    const ratio = v / t;
    const share = `${Math.round(ratio * 100)}%`;
    if (form === 'budget') {
      if (v > t) return { drawable: true, fill: '1.00', limit: fixed(t / v), share, intent: tone ?? 'bad', left: progressOver(amountLike(target, v - t, home, 'read')) };
      return { drawable: true, fill: fixed(ratio), limit: null, share, intent: tone ?? (ratio >= PROGRESS_NEAR ? 'warn' : undefined), left: progressLeft(amountLike(target, t - v, home, 'read')) };
    }
    if (v >= t) return { drawable: true, fill: '1.00', limit: null, share, intent: tone ?? 'good', left: PROGRESS_REACHED };
    return { drawable: true, fill: fixed(ratio), limit: null, share, intent: tone, left: progressToGo(amountLike(target, t - v, home, 'read')) };
  });
}

/** A track's accessible name: the label, the value of the target, and the share. */
export const progressSentence = (label: string, value: string, target: string, share: string): string =>
  `${label || PROGRESS_PART}: ${value || MISSING} ${PROGRESS_OF} ${target || MISSING}, ${share}`;

/** The renderer's own words, as `split.ts` keeps `SPLIT_ZERO`: it imports nothing from the app. */
export const PROGRESS_NONE = 'Nothing to measure yet.';
export const PROGRESS_OF = 'of';
export const PROGRESS_PART = 'Part';
export const PROGRESS_REACHED = 'Reached';
/** The heads of the fold's table after the part: a goal's so far and target, a budget's spent and limit, then the share. */
export const PROGRESS_SO_FAR = 'So far';
export const PROGRESS_TARGET = 'Target';
export const PROGRESS_SPENT = 'Spent';
export const PROGRESS_LIMIT = 'Limit';
export const PROGRESS_SHARE = 'Share';
export const progressToGo = (figure: string): string => `${figure} to go`;
export const progressLeft = (figure: string): string => `${figure} left`;
export const progressOver = (figure: string): string => `${figure} over`;
export const PROGRESS_NOT_SPENT = 'Not spent';
export const PROGRESS_TOTAL = 'Total';
export const progressSpentSaid = (figure: string): string => `${figure} spent`;
export const progressRangeSaid = (low: string, high: string): string => `${low || MISSING} to ${high || MISSING}`;

/** The budget form's first line, over every row under it. */
export const PROGRESS_ALL_BUDGETS = 'All budgets';

/**
 * WHAT EVERY BUDGET UNDER IT COMES TO, AS ONE MORE ROW AT THE TOP, SINCE 30 October (budgets as Coin Fish draws them):
 * what was spent of all of them against all they allow, so the page answers "how is the month going" before any one
 * category. Added up here from the rows as drawn, as the range form's total is (`rangePlan`), so it cannot disagree
 * with them; a row not yet spent adds nothing. Two rows or more, every limit a number, and every figure in one unit, or
 * no total: money in two currencies is never added, and one row is its own total.
 */
export function budgetTotal(rows: readonly ProgressInput[], home?: string | null): ProgressInput | null {
  if (rows.length < 2) return null;
  const figures = rows.flatMap((r) => [r.value, r.target]).filter((c) => Number.isFinite(signedOf(c)));
  if (new Set(figures.map(unitOf)).size > 1) return null;
  const targets = rows.map((r) => signedOf(r.target));
  const values = rows.map((r) => (Number.isFinite(signedOf(r.value)) ? signedOf(r.value) : 0));
  if (!targets.every(Number.isFinite)) return null;
  const places = Math.max(0, ...figures.map(placesOf));
  const shape = figures.find((c) => placesOf(c) === places) ?? '';
  const units = (vs: number[]): number => vs.reduce((a, v) => a + Math.sign(v) * Math.round(Math.abs(v) * 10 ** places), 0) / 10 ** places;
  return { value: amountLike(shape, units(values), home, 'read'), target: amountLike(shape, units(targets), home, 'read') };
}

/* ── the range form ───────────────────────────────────────────────────────── */

/** One row of a range as the plan reads it: the three figures as drawn, and a tone the host wrote. */
export type RangeInput = { spent: string; low: string; high: string; tone?: Tone };

export type RangeBar = {
  /** Whether the low and the high both read, the high is above zero and not below the low. A row that is not keeps its words. */
  drawable: boolean;
  /** Where the band starts and ends along the one scale, `0.00` to `1.00`. */
  from: string;
  to: string;
  /** Where what was spent sits on the same scale, or null when nothing was. */
  at: string | null;
  /** Past the high is `bad`; anything inside the band or under it is not coloured. A tone the host wrote wins. */
  intent: Tone | undefined;
  /** The band in words, `£100.00 to £200.00`. */
  range: string;
  /** What was spent in words, or that nothing was. */
  spent: string;
};

/**
 * What a figure is counted in, read off how it is written: the symbol or code around the number.
 *
 * `£1,200.00` is in `£`, `GBP 150.00` in `GBP`, `1200` in nothing. Two cells in two units cannot be added or drawn on
 * one scale. Crude on purpose: it has to tell two units apart, not name either.
 */
const unitOf = (figure: string): string => figure.replace(/[\d.,\s−-]/gu, '');

/** How many decimals a figure is written to: `£120.50` two, `0.333` three, `10,000` none. */
const placesOf = (figure: string): number => /\d[\d,]*(?:\.(\d+))?/u.exec(figure)?.[1]?.length ?? 0;

/**
 * Said in place of the scale and the total when the figures are not all in one unit.
 *
 * MEASURED BEFORE IT WAS WRITTEN: a spend in money beside a low and a high in plain numbers (pence written as ints)
 * drew `£120.50` as 120.5 on a scale of 30,000, so every mark sat at the start of its track and the drawing said
 * nothing had been spent. The record refuses two currencies (`MIXED_CURRENCY`) but not money beside a plain number,
 * and a hand-built fence is refused by nobody, so the drawer says it too.
 */
export const RANGE_MIXED = 'These figures are not all in one unit, money beside plain numbers or two currencies, so they are not drawn on one scale or added up.';

/**
 * Each row's band and mark on one scale, and the total line.
 *
 * ONE SCALE FOR THE BLOCK, THE LARGEST FIGURE ON IT, which the survey wrote as the largest high: measured against the
 * largest high alone, a line overspent past every estimate put its mark past the end of its own track. The largest of
 * the highs and the spends keeps every mark on the track and every band where it was.
 *
 * THE TOTAL IS ADDED UP HERE AND NOT WRITTEN BY THE HOST, so it cannot disagree with the rows above it: a total line
 * the evaluator wrote could be read from a different moment than the rows. A column with a figure that does not read
 * has no total, and nothing spent is nothing, so an unspent row adds zero to what was spent.
 *
 * AND IT IS DRAWN TO THE PLACE OF THE FINEST FIGURE ON THE BLOCK, added in whole units of that place. It took the first
 * cell of its column as the shape and rounded the sum to that cell's decimals, so a budget whose first line was a
 * whole number drew the launch desk's lines as `Total 181 spent 251 to 421` where they add to 181.499, 250.989 and
 * 421.499. Money is written to its currency's minor unit in every cell, so for money the finest place is that unit.
 *
 * FIGURES IN TWO UNITS ARE REFUSED WITH `refused`, and not drawn: no row gets a track and there is no total, and each
 * figure is still said as written, because each cell is right on its own and only the arithmetic across them is not.
 * A cell that does not read as a number (blank, or the dash) is no unit at all, so a gap does not refuse the block.
 */
export function rangePlan(rows: readonly RangeInput[], home?: string | null): { bars: RangeBar[]; total: { spent: string; low: string; high: string }; refused: string | null } {
  const read = rows.map((r) => ({ spent: signedOf(r.spent), low: signedOf(r.low), high: signedOf(r.high) }));
  const figures = rows.flatMap((r) => [r.spent, r.low, r.high]).filter((c) => Number.isFinite(signedOf(c)));
  const refused = new Set(figures.map(unitOf)).size > 1 ? RANGE_MIXED : null;
  const scale = refused ? 0 : Math.max(0, ...read.flatMap((r) => [r.high, r.spent]).filter(Number.isFinite));
  const at = (v: number): string => fixed(v / scale);

  const bars = rows.map((r, i): RangeBar => {
    const { spent, low, high } = read[i]!;
    const drawable = scale > 0 && Number.isFinite(low) && Number.isFinite(high) && high > 0 && low <= high;
    const spentAt = Number.isFinite(spent) && scale > 0 ? at(Math.max(0, spent)) : null;
    /* OVER IS ARITHMETIC ACROSS TWO CELLS TOO, so a refused block calls no row over: `£120.50` read against a plain high
       of 100 came back `bad`, where that high in pence was £100 and the same spend against 10,000 would have been fine. */
    const over = !refused && Number.isFinite(spent) && Number.isFinite(high) && spent > high;
    return {
      drawable,
      from: drawable ? at(Math.max(0, low)) : '0.00',
      to: drawable ? at(high) : '0.00',
      at: drawable ? spentAt : null,
      intent: r.tone ?? (over ? 'bad' : undefined),
      range: progressRangeSaid(r.low, r.high),
      spent: r.spent.trim() === '' ? PROGRESS_NOT_SPENT : progressSpentSaid(r.spent),
    };
  });

  const places = Math.max(0, ...figures.map(placesOf));
  const shape = figures.find((c) => placesOf(c) === places) ?? '';
  const sum = (column: 'spent' | 'low' | 'high'): string => {
    if (refused || rows.length === 0) return MISSING;
    const cells = rows.map((r) => r[column]);
    const values = read.map((r, i) => (column === 'spent' && cells[i]!.trim() === '' ? 0 : r[column]));
    if (!values.every(Number.isFinite)) return MISSING;
    /* WHOLE UNITS OF THE FINEST PLACE, each rounded once from the figure as written, so 0.333 three times is 999
       thousandths and not 0.9990000000000001. */
    const units = values.reduce((a, v) => a + Math.sign(v) * Math.round(Math.abs(v) * 10 ** places), 0);
    return amountLike(shape, units / 10 ** places, home, 'read');
  };
  return { bars, total: { spent: sum('spent'), low: sum('low'), high: sum('high') }, refused };
}

/** A range track's accessible name: the label, what was spent, and the band. */
export const rangeSentence = (label: string, spent: string, range: string): string => `${label || PROGRESS_PART}: ${spent}, ${range}`;
