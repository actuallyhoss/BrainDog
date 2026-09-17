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
import { figureLike } from './figure.ts';
import { MISSING } from './format.ts';

export type ProgressForm = 'goal' | 'budget';

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
export function progressPlan(rows: readonly ProgressInput[], form: ProgressForm = 'goal'): ProgressBar[] {
  return rows.map(({ value, target, tone }) => {
    const t = signedOf(target);
    const read = signedOf(value);
    /* NO VALUE YET IS NOTHING SO FAR, so a goal with nothing saved draws an empty track rather than no track. */
    const v = Number.isFinite(read) ? read : 0;
    if (!Number.isFinite(t) || t <= 0) return { drawable: false, fill: '0.00', limit: null, share: MISSING, intent: tone, left: '' };
    const ratio = v / t;
    const share = `${Math.round(ratio * 100)}%`;
    if (form === 'budget') {
      if (v > t) return { drawable: true, fill: '1.00', limit: fixed(t / v), share, intent: tone ?? 'bad', left: progressOver(figureLike(target, v - t)) };
      return { drawable: true, fill: fixed(ratio), limit: null, share, intent: tone ?? (ratio >= PROGRESS_NEAR ? 'warn' : undefined), left: progressLeft(figureLike(target, t - v)) };
    }
    if (v >= t) return { drawable: true, fill: '1.00', limit: null, share, intent: tone ?? 'good', left: PROGRESS_REACHED };
    return { drawable: true, fill: fixed(ratio), limit: null, share, intent: tone, left: progressToGo(figureLike(target, t - v)) };
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
