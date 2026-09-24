/**
 * The pointer's half of a roadmap drag: which part of a bar was taken, how many whole days the pointer has moved, where
 * the bar is drawn while it moves, and the drop the host is handed when it lets go.
 *
 * `dragPatch` IN `src/roadmap.ts` IS THE OTHER HALF, and this file never does its sum. It turns a drop into the two
 * fields a task keeps, from the fields as the record stores them, and only the host holds those: the drawer reads the
 * row as the page drew it, where an effort is `1.5 d` and a third of a day is `0.33 d`. A patch worked out from that
 * text would write the rounding back into the record every time a bar was touched, which is the loss `dragPatch`'s own
 * header forbids. So the drop carries the gesture and `dragPatch` bound to it, and the host runs it once, on the values
 * it read.
 *
 * NOT IN `src/`, because none of it is drawn by `toHTML`: the mirror has no pointer, and the parity tests compare the two
 * renderers without a callback, where a roadmap has no grips at all.
 */

import { addDays, daysBetween } from '../../src/forecast.ts';
import { dragPatch, type DragMode, type DragPatch, type DragRow, type RoadmapPlan } from '../../src/roadmap.ts';

/**
 * How many pixels in from each end of a bar take that end rather than the whole bar.
 *
 * EIGHT, the reach of a resize edge on a desktop window. A finger is wider, and a phone gets the same eight because a
 * bar on a phone is mostly narrower than two fingers; `dragModeAt` gives a narrow bar's middle back to moving it.
 */
export const DRAG_EDGE = 8;

/**
 * The part of a bar a pointer took, from where it landed, in pixels from the bar's start edge, and the bar's width.
 *
 * A QUARTER EACH AT MOST. A day on a year-long roadmap is a bar about twelve pixels wide, and with two eight-pixel edges
 * every pixel of it would have been an edge: the bar could be resized and never moved.
 */
export function dragModeAt(offset: number, width: number): DragMode {
  const edge = Math.min(DRAG_EDGE, width / 4);
  if (offset <= edge) return 'start';
  if (offset >= width - edge) return 'end';
  return 'move';
}

/**
 * The whole days a pointer has moved: `dx` pixels over a box `box` pixels wide that draws the plan's span.
 *
 * ROUNDED TO THE NEAREST DAY, because `dragPatch` takes whole days and does not round for the drawer. `|| 0` turns the
 * `-0` that `Math.round` gives a small leftward move into the zero it is.
 */
export function dragDays(dx: number, box: number, plan: Pick<RoadmapPlan, 'from' | 'to'>): number {
  const span = plan.from && plan.to ? daysBetween(plan.from, plan.to) : 0;
  if (!(box > 0) || !(span > 0) || !Number.isFinite(dx)) return 0;
  return Math.round((dx / box) * span) || 0;
}

/**
 * The window a drag draws, from the window as drawn: `start` empty is a date, which only moves.
 *
 * THE SAME CLAMP `dragPatch` MAKES, in drawn days: an edge stops at a window of one day. `dragPatch` clamps on the
 * effort rounded up to whole days, and a window drawn from that effort is exactly that many days long, so the two agree
 * on every shape, which the test drives over seven efforts, three modes and twenty-nine shifts.
 */
export function dragWindow(w: { start: string; end: string }, mode: DragMode, days: number): { start: string; end: string } {
  if (w.start === '') return { start: '', end: mode === 'move' ? addDays(w.end, days) : w.end };
  const drawn = daysBetween(w.start, w.end) + 1;
  if (mode === 'move') return { start: addDays(w.start, days), end: addDays(w.end, days) };
  if (mode === 'start') return { start: addDays(w.start, Math.min(days, drawn - 1)), end: w.end };
  return { start: w.start, end: addDays(w.end, Math.max(days, 1 - drawn)) };
}

/** Two decimals at most, as `src/roadmap.ts` writes an attribute, so a bar not yet moved is the same bar to the byte. */
const at = (n: number): string => String(Math.round(n * 100) / 100);

/**
 * Where a bar or a date is drawn while it is dragged, in the plan's box: a bar's `x` and `width`, a date's stem `x`.
 *
 * IN THE SPAN THE PLAN WAS DRAWN OVER, not the one the write will make. A bar dragged past the last month runs off the
 * box until the pointer lets go, and the re-read then draws a span that takes it in.
 */
export function dragDrawn(w: { start: string; end: string }, mode: DragMode, days: number, plan: Pick<RoadmapPlan, 'from' | 'to'>): { x: string; width: string } {
  const span = daysBetween(plan.from, plan.to);
  const to = dragWindow(w, mode, days);
  if (to.start === '') return { x: at(((daysBetween(plan.from, to.end) + 0.5) / span) * 1000), width: '0' };
  return {
    x: at((daysBetween(plan.from, to.start) / span) * 1000),
    width: at(((daysBetween(to.start, to.end) + 1) / span) * 1000),
  };
}

/**
 * What a host is handed when a drag lets go: the gesture, and the patch it means over the row as the record keeps it.
 *
 * `patch` IS `dragPatch` AND NOTHING ELSE, so a host that holds the stored `by` and `effort` has one call to make and
 * no arithmetic of its own. It answers `null` for a drop that means no write, and the host then writes nothing.
 */
export type RoadmapDrop = { mode: DragMode; days: number; patch: (row: DragRow) => DragPatch | null };

export const dropOf = (mode: DragMode, days: number): RoadmapDrop => ({ mode, days, patch: (row) => dragPatch(row, mode, days) });
