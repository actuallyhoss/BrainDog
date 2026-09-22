/**
 * What `roadmap` decides, as a function its drawers will call.
 *
 * A roadmap is dated work on one time axis: a window from a start day to an end day is a bar, and a
 * row with no start is a single date drawn as a stem with its label above. The kind is not
 * registered yet; this is the arithmetic under it, written first so both drawers have one answer.
 *
 * WINDOWS PACK FIRST-FIT INTO TRACKS, taken in order of start, so the number of tracks is how much
 * overlaps: three tracks means three things were in hand on one day. Taken in order of start this is
 * the optimal packing for intervals, not a heuristic, and the test checks the track count against a
 * brute count of the busiest day over forty seeded sets of windows. A window ends at the END of its
 * last day, because `by` is the day a task is due and it is worked on that day, so one ending on the
 * 10th and one starting on the 10th overlap.
 *
 * THE SPAN IS WHOLE MONTHS, from the first of the earliest month to the first of the month after the
 * latest, so every month band is a full month and none is a sliver at an edge. It does not stretch to
 * take in today: a plan wholly next summer would otherwise squeeze into the far tenth of the box
 * behind months of empty track. Today's line is simply absent when today is outside the span.
 *
 * POSITIONS ARE MEASURED FROM THE START EDGE, in the `0 0 1000 100` box every chart shares. How a time
 * axis reads in a right-to-left layout is still open (`research-modules.md` §8 risk 9), so this plan
 * does not decide it: a drawer that mirrors draws each mark at `1000 - x - width` and each line at
 * `1000 - x`, and the packing, the bands and the label lines are unchanged, because none of them
 * depends on which edge is first.
 *
 * A ROW THAT CANNOT BE PLACED IS SKIPPED BY INDEX, never guessed. An unreadable date, or an end before
 * its start (a `by` minus an `effort` written the wrong way round), would otherwise have to be drawn
 * somewhere it does not belong, and the reader could not tell it from a real date.
 */

import type { Tone } from './kinds.ts';
import { isDay } from './days.ts';
import { addDays, daysBetween } from './forecast.ts';

/** One row as the plan reads it. An empty `start` makes it a single date at `end`. */
export type RoadmapRow = { start: string; end: string; title: string; tone?: Tone };

/** A window, as a bar on its track. `row` is its index in the rows handed in. */
export type RoadmapBar = { row: number; track: number; start: string; end: string; title: string; tone?: Tone; x: string; width: string };

/** A single date, as a stem at the middle of its day, and where its label sits. */
export type RoadmapStem = { row: number; day: string; title: string; tone?: Tone; x: string; label: { x: string; line: number } };

/** One month of the span, alternately shaded, `odd` being the second, fourth and so on. */
export type RoadmapBand = { month: string; label: string; x: string; width: string; odd: boolean };

export type RoadmapPlan = {
  /** The first day of the span, and the day after its last, both the first of a month. */
  from: string;
  to: string;
  /** How many tracks the windows need, which is the most of them in hand on any one day. */
  tracks: number;
  bars: RoadmapBar[];
  stems: RoadmapStem[];
  /** How many lines the stem labels need. */
  lines: number;
  bands: RoadmapBand[];
  /** The today line's x, at the middle of today, or `null` when today is not in the span. */
  today: string | null;
  /** The rows that could not be placed, by index. */
  skipped: number[];
  /** Nothing to draw: the block is its sentence. */
  empty: boolean;
};

/** How wide a stem label is taken to be, in the box's units, when the drawer does not say. */
export const ROADMAP_LABEL = 150;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Two decimals at most, and no trailing zeros, as `series.ts` writes an attribute. */
const at = (n: number): string => String(Math.round(n * 100) / 100);

/** The first of the month after the one this day is in. */
const nextMonth = (day: string): string => {
  const [y, m] = day.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
};

/**
 * The plan: bars on tracks, stems with their labels spaced, month bands and a today line.
 *
 * `labelWidth` is how wide the drawer expects a stem label to be, in the box's units. The words sit in
 * an HTML layer over the box, so only the drawer knows how many units a label takes at its current
 * width; it passes that in and the labels are spaced to it.
 */
export function roadmapPlan(rows: readonly RoadmapRow[], today: string, labelWidth = ROADMAP_LABEL): RoadmapPlan {
  const skipped: number[] = [];
  const windows: { row: number; r: RoadmapRow }[] = [];
  const singles: { row: number; r: RoadmapRow }[] = [];
  /* THE TRIMMED DATES ARE THE ONES KEPT. The start used to be trimmed only to test it and then used
     as written, so ` 2026-09-01` passed the test, started the span at ` 2026-0-01` and drew every
     position as NaN under ten month bands nobody asked for. */
  rows.forEach((row0, row) => {
    const start = row0.start.trim();
    const end = row0.end.trim();
    const r = { ...row0, start, end };
    if (!isDay(end) || (start !== '' && (!isDay(start) || start > end))) skipped.push(row);
    else (start === '' ? singles : windows).push({ row, r });
  });

  const days = [...windows.flatMap(({ r }) => [r.start, r.end]), ...singles.map(({ r }) => r.end)];
  if (days.length === 0) return { from: '', to: '', tracks: 0, bars: [], stems: [], lines: 0, bands: [], today: null, skipped, empty: true };

  const sorted = [...days].sort();
  const from = `${sorted[0]!.slice(0, 7)}-01`;
  const to = nextMonth(sorted.at(-1)!);
  const span = daysBetween(from, to);
  const x = (day: string, offset = 0): number => ((daysBetween(from, day) + offset) / span) * 1000;

  /* FIRST-FIT BY START, then by end, then by row, so the packing is the same whatever order the rows
     came in and a tie is settled the same way every time. A track holds the last day it is busy. */
  const order = [...windows].sort((a, b) => a.r.start.localeCompare(b.r.start) || a.r.end.localeCompare(b.r.end) || a.row - b.row);
  const busy: string[] = [];
  const placed = new Map<number, number>();
  for (const { row, r } of order) {
    let track = busy.findIndex((last) => last < r.start);
    if (track < 0) track = busy.push(r.end) - 1;
    else busy[track] = r.end;
    placed.set(row, track);
  }
  const bars: RoadmapBar[] = windows.map(({ row, r }) => ({
    row,
    track: placed.get(row)!,
    start: r.start,
    end: r.end,
    title: r.title,
    ...(r.tone ? { tone: r.tone } : {}),
    x: at(x(r.start)),
    width: at(x(addDays(r.end, 1)) - x(r.start)),
  }));

  /* LABELS SPACED BY THE SAME FIRST-FIT, left to right, a line at a time: a label goes on the first
     line whose last label has ended before it begins. A label that would run past the end edge is
     pulled back inside it, and the overlap is judged on where it is drawn, not where its stem is. */
  const ends: number[] = [];
  const stems: RoadmapStem[] = [...singles]
    .sort((a, b) => a.r.end.localeCompare(b.r.end) || a.row - b.row)
    .map(({ row, r }) => {
      const stem = x(r.end, 0.5);
      const left = Math.max(0, Math.min(stem, 1000 - labelWidth));
      let line = ends.findIndex((end) => end <= left);
      if (line < 0) line = ends.push(0) - 1;
      ends[line] = left + labelWidth;
      return {
        row,
        day: r.end,
        title: r.title,
        ...(r.tone ? { tone: r.tone } : {}),
        x: at(stem),
        label: { x: at(left), line },
      };
    });

  const bands: RoadmapBand[] = [];
  for (let month = from, i = 0; month < to; month = nextMonth(month), i++) {
    const name = MONTHS[Number(month.slice(5, 7)) - 1]!;
    const withYear = i === 0 || month.slice(5, 7) === '01';
    bands.push({
      month: month.slice(0, 7),
      label: withYear ? `${name} ${month.slice(0, 4)}` : name,
      x: at(x(month)),
      width: at(x(nextMonth(month)) - x(month)),
      odd: i % 2 === 1,
    });
  }

  return {
    from,
    to,
    tracks: busy.length,
    bars,
    stems,
    lines: ends.length,
    bands,
    today: isDay(today) && today >= from && today < to ? at(x(today, 0.5)) : null,
    skipped,
    empty: false,
  };
}
