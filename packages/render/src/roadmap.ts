/**
 * What `roadmap` decides, as a function its drawers will call.
 *
 * A roadmap is dated work on one time axis: a window from a start day to an end day is a bar, and a
 * row with no start is a single date drawn as a stem with its label above. The arithmetic here came
 * before the kind, so both drawers would have one answer; `toHTML` draws it (`html.ts`) and so does its
 * Svelte twin (`svelte/p/Roadmap.svelte`), and the pointer drag is the next wave's.
 *
 * A ROW IS A TASK: `title | by | effort`, the two fields a task already carries (`work.ts` in the
 * seed). `by` is the last day and `effort` how long, so `roadmapRow` turns them into the window drawn,
 * and `dragPatch` turns a drop on that window back into the two fields to write.
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
import { MISSING, day } from './format.ts';

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

/**
 * The first of the month after the one this day is in.
 *
 * THE YEAR IS PADDED TO FOUR. It was written as the number it is, so the month after `0950-03` came back
 * `950-04-01`, which no date reads: every position in the box was `NaN`, and the month label, read from the
 * wrong two characters, was `undefined` and threw out of `toHTML` (measured once the kind could be typed).
 */
const nextMonth = (day: string): string => {
  const [y, m] = day.split('-').map(Number) as [number, number];
  const year = (n: number): string => String(n).padStart(4, '0');
  return m === 12 ? `${year(y + 1)}-01-01` : `${year(y)}-${String(m + 1).padStart(2, '0')}-01`;
};

/**
 * Whether a day can be drawn: a real day, in a month that has a first of the month after it.
 *
 * DECEMBER 9999 IS THE ONE THAT DOES NOT. The span runs to the first of the next month, `10000-01-01`, which
 * no four-digit date says, so a row there is skipped like any other date the span cannot be built around.
 */
const drawable = (day: string): boolean => isDay(day) && isDay(nextMonth(day));

/**
 * `addDays`, or `''` when the answer is not a day.
 *
 * A SHIFT PAST WHAT A `Date` HOLDS THROWS. `999999999` days of effort reads as an effort, and `toISOString`
 * threw a RangeError out of `toHTML` for it, taking every other block in the document with it (measured).
 * A start before year 0 does not throw but comes back `-000001-...`, which is no day either.
 */
const shifted = (day: string, n: number): string => {
  try {
    const d = addDays(day, n);
    return isDay(d) ? d : '';
  } catch {
    return '';
  }
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
    if (!drawable(end) || (start !== '' && (!isDay(start) || start > end))) skipped.push(row);
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

/* ── a task as a window, and a drop as a patch ────────────────────────────── */

/**
 * A day, in the seconds a `duration` is kept in.
 *
 * THE RECORD HOLDS SECONDS AND THE FIELD SAYS DAYS. `effort` is declared `unit: 'd'`, the seed writes
 * `days(1.5)` as 129,600, and the web's `display()` divides by this and prints `1.5 d`. So a fence reads
 * effort in days, as it is shown, and `dragPatch` answers in seconds, as it is written.
 */
export const DAY_SECONDS = 86_400;

/** The table's column heads, and the two sentences the block says instead of a drawing or under one. */
export const ROADMAP_WHAT = 'What';
export const ROADMAP_FROM = 'From';
export const ROADMAP_DUE = 'Due';
export const ROADMAP_NONE = 'Nothing here has a date that can be drawn.';
/* "THE DATE OR THE EFFORT", because a row is skipped for either. This said only the date, and `Glaze | 2026-09-20 |
   2 days` was told its good day did not read while the cell at fault was the effort. */
export const roadmapSkipped = (titles: readonly string[]): string => `Not drawn, because the date or the effort does not read: ${titles.join(', ')}.`;

/**
 * An effort as a person reads it, `10`, `1.5 d`, `3d`, `1,200 d`, `4 h` or `2 w`: a number in one of a duration's
 * units, days when none is written.
 *
 * EVERY UNIT A DURATION CAN BE DECLARED IN, AND THE COMMAS THAT GROUP IT. The web's `display()` writes a duration in
 * its field's own unit (`s`, `m`, `h`, `d` or `w`, where `m` is minutes) and groups the figure, so a task of 1,200
 * days, or one whose effort is declared in hours, reached this pattern as text it refused, and the row was skipped as
 * a date that does not read (defects P9). The commas are read only in groups of three, as `display()` writes them.
 */
const EFFORT = /^(-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*([smhdw])?$/u;

/** The days an effort `EFFORT` matched comes to, before it is rounded up. */
const effortDays = (m: RegExpExecArray): number => {
  const n = Number(m[1]!.replace(/,/gu, ''));
  const unit = m[2] ?? 'd';
  if (unit === 'w') return n * 7;
  if (unit === 'd') return n;
  /* A UNIT SHORTER THAN A DAY DIVIDES, and is never multiplied by a rounded fraction such as `1 / 24`, so a whole
     number of days written in hours comes out whole, and the rounding up below does not draw it a day longer. */
  return n / (unit === 'h' ? 24 : unit === 'm' ? 1_440 : DAY_SECONDS);
};

/** A day as `day()` in `format.ts` writes it: `10 Oct 2026`, and `15 Mar 950` for a year it does not pad. */
const WRITTEN = /^(\d{1,2}) ([A-Z][a-z]{2}) (\d{3,4})$/u;

/**
 * The due day as `YYYY-MM-DD`, from either spelling of it, or the text unchanged when it is neither.
 *
 * A ROADMAP BOUND TO A LIST DREW NOTHING. The web's page reader projects every cell through `display()`, and
 * `display()` writes a `day` field with this package's own `day()`, so a task due on the 10th reached this
 * function as `10 Oct 2026`. Only `2026-10-10` was read, so every row the record put on a page was skipped:
 * three tasks with a due day each drew `ROADMAP_NONE` and were named under it as dates that do not read
 * (measured through `blockOf` and `draw` over a record holding them). A kind has to read the day its own
 * package writes, and the test holds the two to a round trip over every month.
 *
 * NOTHING IS GUESSED ON THE WAY. The month is one of the twelve `day()` writes, spelt as it writes them, and the
 * day it names must exist: `30 Feb 2026` comes back as it was, is not a day, and is skipped like `2026-02-30`.
 */
const dayRead = (text: string): string => {
  const m = WRITTEN.exec(text);
  const month = m ? MONTHS.indexOf(m[2]!) + 1 : 0;
  if (!m || month === 0) return text;
  const iso = `${m[3]!.padStart(4, '0')}-${String(month).padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  return isDay(iso) ? iso : text;
};

/**
 * The window a task is drawn as: it ends on `by`, and is as many whole days long as `effort` in days,
 * rounded up.
 *
 * ROUNDED UP BECAUSE A FRACTION OF A DAY IS STILL WORKED ON A DAY. Fifteen of the seed's 27 tasks carry
 * 0.2, 0.3 or 0.5 of a day (counted in `work.ts`), and rounding to the nearest would have drawn more
 * than half the work as no work at all. An effort in hours or minutes is part of a day in the same way:
 * `3 h` is worked on one day, and `36 h` on two.
 *
 * NO EFFORT, OR NONE, IS A DATE: a task due on a day with no work declared is a deadline, and it is
 * drawn as the stem a deadline is. Anything else that does not read, a word or a minus, is handed to
 * the plan as a row it will skip by index: a word becomes a start that is not a day, and a negative
 * effort a start after the end, which is the backwards window the plan already refuses to draw.
 */
export function roadmapRow(title: string, by: string, effort: string, tone?: Tone): RoadmapRow {
  const end = dayRead(by.trim());
  const said = effort.trim();
  const toned = tone ? { tone } : {};
  if (!isDay(end)) return { start: '', end, title, ...toned };
  const m = EFFORT.exec(said);
  const days = m ? effortDays(m) : Number.NaN;
  if (said === '' || days === 0) return { start: '', end, title, ...toned };
  if (!m) return { start: said, end, title, ...toned };
  /* An effort too long for the calendar hands the plan its own text as the start, which is no day, so the
     row is skipped by index like any other that does not read. */
  return { start: shifted(end, 1 - Math.ceil(days)) || said, end, title, ...toned };
}

/** Which part of a bar was dragged: the whole of it, its first day, or its last. */
export type DragMode = 'move' | 'start' | 'end';

/** A task's two dated fields as the record keeps them: `effort` in seconds, absent or zero on a date. */
export type DragRow = { by: string; effort?: number | null };

/** The fields a drop changes, and only those, so the write is a patch and the undo is its `was`. */
export type DragPatch = { by?: string; effort?: number };

/**
 * The field patch a drop means, or `null` when the drop means no write.
 *
 * `move` shifts `by`, and the window goes with it. `start` moves the first day and holds the last, so
 * only `effort` changes. `end` moves the last day and holds the first, so `by` and `effort` change by
 * the same days.
 *
 * AN EDGE STOPS AT A WINDOW OF ONE DAY. Dragged past the other edge it would ask for an end before its
 * start, which the plan skips as unreadable: the bar would vanish under the pointer and the record would
 * hold a task nobody can see again. So the shift is clamped, as a handle pinned at the far edge.
 *
 * THE FRACTION OF A DAY IS KEPT. A resize adds or takes whole days of effort, so 1.5 d dragged a day
 * earlier is 2.5 d, and dragged as late as it goes is 0.5 d, one day drawn. Writing whole days back
 * would round away what somebody said about the work every time they touched its bar.
 *
 * NULL IS NOT AN ERROR, it is "nothing to write": no shift, a shift the clamp ate, an edge pulled on a
 * date, which has no edges, or a row the roadmap would not have drawn and so could not have been
 * dropped. The web's one-write undo would otherwise spend itself on a write that changed nothing.
 * `days` is whole: the drawer rounds the pointer to a day, and this does not round for it.
 */
export function dragPatch(row: DragRow, mode: DragMode, days: number): DragPatch | null {
  if (!Number.isInteger(days) || days === 0 || !drawable(row.by)) return null;
  const effort = row.effort ?? 0;
  if (!Number.isFinite(effort) || effort < 0) return null;
  /* A DROP OFF THE CALENDAR IS NO WRITE. A day after 9999-12-31 came back `+010000-01`, a `by` the plan then
     skipped, and a shift past what a `Date` holds threw; either way the bar would not be drawn again. */
  const due = (n: number): string | null => {
    const d = shifted(row.by, n);
    return drawable(d) ? d : null;
  };
  if (mode === 'move') {
    const by = due(days);
    return by === null ? null : { by };
  }
  if (effort === 0) return null;
  /* How many days are drawn, the same rounding `roadmapRow` makes, so one day drawn is the floor. */
  const span = Math.ceil(effort / DAY_SECONDS);
  if (mode === 'start') {
    const shift = Math.min(days, span - 1);
    return shift === 0 || !shifted(row.by, shift - span + 1) ? null : { effort: effort - shift * DAY_SECONDS };
  }
  const shift = Math.max(days, 1 - span);
  const by = due(shift);
  return shift === 0 || by === null ? null : { by, effort: effort + shift * DAY_SECONDS };
}

/** The chart's accessible name: the span, how many of each, and the most in hand on one day. */
export function roadmapSentence(plan: RoadmapPlan): string {
  const month = (m: string | undefined): string => (m ? `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}` : '');
  const count = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`;
  const first = month(plan.bands[0]?.month);
  const last = month(plan.bands.at(-1)?.month);
  const span = first === last ? first : `${first} to ${last}`;
  const most = plan.tracks > 1 ? `, at most ${plan.tracks} at once` : '';
  return `${span}: ${count(plan.bars.length, 'window')} and ${count(plan.stems.length, 'date')}${most}.`;
}

/* ── what both drawers draw the plan with ─────────────────────────────────── */

/**
 * Today, as the day the plan draws its line on: the host's clock when it passes one, else this machine's.
 *
 * A CLOCK THAT IS NOT A DATE THROWS IN `toISOString`, and one bad option would take the whole document down,
 * so it only loses the line. Here and not in a drawer because both drawers ask, and a roadmap whose line sat a
 * day apart in the app and in the mirror would be the two renderers disagreeing about one input.
 */
export function roadmapToday(now?: number): string {
  const t = now ?? Date.now();
  return Number.isFinite(t) && Math.abs(t) <= 8.64e15 ? new Date(t).toISOString().slice(0, 10) : '';
}

/**
 * A position in the box's thousand units as a share of the width, which is what `--at` means to every chart.
 *
 * FOUR PLACES, not the ticks' two: two is a hundredth of the width, ten pixels on a wide page, and a stem label
 * that far off its stem reads as the label of the day beside it.
 */
export const roadmapShare = (x: string): string => String(Math.round(Number(x) * 10) / 10_000);

/**
 * Where a track sits in the box's hundred vertical units: an equal band each, the bar in its middle seventy per
 * cent, so two tracks never touch. The plan answers the horizontal; how tall a track is depends on how many there
 * are, which only the drawing knows.
 */
export function roadmapLane(track: number, tracks: number): { y: string; height: string } {
  const tall = 100 / Math.max(1, tracks);
  return { y: at(track * tall + tall * 0.15), height: at(tall * 0.7) };
}

/**
 * How each mark is painted when the page has no rule for it: `currentColor` at a low opacity, or `none`.
 *
 * NO STYLESHEET DREW THIS KIND AT FIRST, and an SVG shape nobody paints is filled black: the box came out one
 * black slab with its stems and today's line black on black (read off the markup `toHTML` wrote), before
 * `blocks-charts.css` gained its `roadmap-` rules. Presentation attributes are the weakest thing in the cascade,
 * so any rule a host writes for a band, a bar or a tone still wins over them. `blocks-charts.css` now styles
 * every mark by class, and these paints are what a host with no stylesheet draws.
 *
 * CURRENT COLOUR, NEVER A COLOUR OF THIS KIND'S (05 §1): the ink the block is already drawn in, made quieter.
 * A bar is lighter than the ink so its title stays readable over it, and a band lighter still.
 */
export const ROADMAP_PAINT = {
  band: { fill: 'currentColor', 'fill-opacity': '0.05' },
  even: { fill: 'none' },
  bar: { fill: 'currentColor', 'fill-opacity': '0.25' },
  stem: { fill: 'none', stroke: 'currentColor', 'stroke-opacity': '0.6' },
  today: { fill: 'none', stroke: 'currentColor', 'stroke-width': '2' },
} as const satisfies Record<string, Readonly<Record<string, string>>>;

/** One placed row as the table under the drawing says it: its first day, or `—` on a date, and its due day. */
export type RoadmapLine = { row: number; title: string; tone?: Tone; from: string; due: string };

/**
 * Every placed row, in the order the rows came in, as the table a screen reader reads.
 *
 * THE ORDER IS THE AUTHOR'S. The plan hands back bars and then stems, so a table built in that order put every
 * window ahead of every date, and a date written first was read last.
 */
export function roadmapLines(plan: RoadmapPlan): RoadmapLine[] {
  const tone = (t?: Tone): { tone?: Tone } => (t ? { tone: t } : {});
  return [
    ...plan.bars.map((b) => ({ row: b.row, title: b.title, ...tone(b.tone), from: day(b.start), due: day(b.end) })),
    ...plan.stems.map((s) => ({ row: s.row, title: s.title, ...tone(s.tone), from: MISSING, due: day(s.day) })),
  ].sort((a, z) => a.row - z.row);
}
