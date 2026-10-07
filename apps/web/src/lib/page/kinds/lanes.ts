/**
 * A `lanes` block, written from the record's answer: the window first, then `name | start | end` a lane, drawn by
 * `braindog-render` as one lane a row on a single time axis with a line at now (`packages/render/src/lanes.ts`).
 *
 * THE RECORD HAS ALREADY READ THE WINDOW AND NAMED EVERY LANE. Its answer carries `lanes`, each a title, the instant
 * it started, the instant it ended or `null` while it is still going, and perhaps a tone and where it opens; and
 * `window`, the two instants the axis runs between and the record's own now. So nothing is looked up here: a lane is
 * written as it was answered, never cut to the window, and one still going leaves its end blank for the drawer to run
 * to now.
 *
 * THE WINDOW IS THE FIRST ROW, `window | from | to | now`, which is how the drawer is told one. An answer whose window
 * does not read writes none, and the drawer takes the lanes' own first start to last end.
 *
 * EVERY INSTANT IS WRITTEN ON THE READER'S OWN CLOCK, `2026-10-07T11:00:00+02:00`. It is the same moment however it is
 * spelled, so no bar moves; the drawer says its hours in the offset the window was written in, because it does not
 * know where the reader is and this app does, as a calendar's writer puts an instant on the reader's day.
 *
 * A lane whose start does not read, or that ends before it starts, is not written: there is nowhere on an axis to
 * put it. A tone that is not one of the four and a door that is not a path of this BrainDog are left off, and the lane
 * is still drawn.
 */

import { LANES_WINDOW, TONES, lanesInstant } from 'braindog-render';

import type { KindDrawer } from './index.ts';
import { escapeCell, fenced } from './dialect.ts';

const two = (n: number): string => String(n).padStart(2, '0');

/** An instant as the reader's clock has it, with the offset that makes it one moment wherever it is read. */
export function written(at: number): string {
  const offset = Math.round(-new Date(at).getTimezoneOffset());
  const wall = new Date(at + offset * 60_000).toISOString().slice(0, 19);
  const abs = Math.abs(offset);
  return `${wall}${offset === 0 ? 'Z' : `${offset < 0 ? '-' : '+'}${two(Math.floor(abs / 60))}:${two(abs % 60)}`}`;
}

/** The furthest a clock is asked about: past it a date has no wall clock to write, and asking for one throws. */
const FURTHEST = 8.6e15;

/** Whether a moment can be written so the drawer reads it back: a year of four figures on the reader's clock too. */
const writable = (at: number): boolean => Number.isFinite(at) && Math.abs(at) < FURTHEST && lanesInstant(written(at)) !== null;

/**
 * An instant as epoch milliseconds, or null for a value that is none.
 *
 * READ AS THE DRAWER READS ONE (`lanesInstant`), so a time with no offset is no instant here either: this machine
 * would take it for its own clock's and write a moment the record never said. And one the drawer could not read back
 * once written is none, rather than a lane named under the drawing as a fault.
 */
const instant = (v: unknown): number | null => {
  if (typeof v !== 'string') return null;
  const at = lanesInstant(v)?.at ?? null;
  return at !== null && writable(at) ? at : null;
};

/** A path of this BrainDog that a link can be written around: nothing that would end the link early. */
const PATH = /^\/(?!\/)[^\s()[\]|\\]*$/u;

/** A lane's name, as a door where the record said where it opens and the words can carry one (`dialect.ts` `linked`). */
function named(title: string, href: unknown): string {
  const cell = escapeCell(title);
  return typeof href === 'string' && PATH.test(href) && title !== '' && !/[[\]]/u.test(title) ? `[${cell}](${href})` : cell;
}

/** The rows a lanes block writes, one a lane the answer holds that can be placed on an axis. */
export function lanesRows(result: unknown): string[] {
  const lanes = result !== null && typeof result === 'object' ? (result as { lanes?: unknown }).lanes : null;
  if (!Array.isArray(lanes)) return [];
  return lanes.flatMap((l) => {
    if (l === null || typeof l !== 'object') return [];
    const { title, start, end, tone, href } = l as { title?: unknown; start?: unknown; end?: unknown; tone?: unknown; href?: unknown };
    const from = instant(start);
    if (from === null) return [];
    /* `null` IS STILL RUNNING. An end that is there and does not read is not: the lane is left out rather than drawn
       as running until now, which would say something the record did not. */
    const to = end === null || end === undefined ? null : instant(end);
    if (end !== null && end !== undefined && (to === null || to < from)) return [];
    const name = typeof title === 'string' ? title.replace(/\s+/gu, ' ').trim() : '';
    const said = typeof tone === 'string' && Object.hasOwn(TONES, tone) ? ` | ${tone}` : '';
    return [`${named(name, href)} | ${written(from)} | ${to === null ? '' : written(to)}${said}`];
  });
}

/**
 * The window the record read, as the row the drawer reads one from, or null where the answer carries none that reads:
 * two instants in order, and its now, which is `fallback` (the clock the block was read at) where its own does not read.
 */
export function windowRow(result: unknown, fallback: number): string | null {
  const w = result !== null && typeof result === 'object' ? (result as { window?: unknown }).window : null;
  if (w === null || typeof w !== 'object') return null;
  const { from, to, now } = w as { from?: unknown; to?: unknown; now?: unknown };
  const a = instant(from);
  const b = instant(to);
  if (a === null || b === null || b <= a) return null;
  const at = instant(now) ?? (writable(fallback) ? fallback : null);
  return `${LANES_WINDOW} | ${written(a)} | ${written(b)} | ${at === null ? '' : written(at)}`;
}

export const lanes: KindDrawer = {
  draw(result, opts) {
    /* NO LANE IS THE EMPTY STATE EVERY KIND SAYS, whatever the window: an axis with nothing on it says less. */
    const rows = lanesRows(result);
    if (rows.length === 0) return fenced('lanes', [], opts);
    const window = windowRow(result, opts.now);
    return fenced('lanes', window === null ? rows : [window, ...rows], opts);
  },
};
