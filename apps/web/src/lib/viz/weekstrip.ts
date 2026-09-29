/**
 * The week strip's geometry: a column a day with its weekday, its date, and a dot for each thing that
 * day, today as an ink disc, and a hairline where one week meets the next.
 *
 * ONE ROW WHERE IT FITS, A WEEK A ROW WHERE IT DOES NOT. Thirteen or fourteen days need about 28px a
 * column (14 fit in 416); below that (a phone) the strip folds into a calendar, Monday to Sunday across, each week on
 * its own row with a hairline between, as a month's five weeks are drawn. Days are placed by their
 * own date, so a gap in the list is a gap on the strip, never a shifted week.
 *
 * DATES ARE CALENDAR DATES, `YYYY-MM-DD`, read in UTC so a timezone never moves a day.
 */

import { listed, r2, textWidth } from './shared.ts';

export interface WeekItem {
  /** The project's colour: the dot is drawn in it. */
  colour: string;
  /** Was it due that day and is still not done? Its dot is red. */
  late?: boolean | undefined;
  /** What it is, for the sentence a screen reader hears. */
  label?: string | undefined;
}

export interface WeekDay {
  /** `YYYY-MM-DD`. */
  date: string;
  items: readonly WeekItem[];
}

export interface DayDot {
  x: number;
  y: number;
  late: boolean;
  colour: string;
}

export interface DayCell {
  date: string;
  /** The column's centre. */
  x: number;
  /** Top of the date's disc. */
  top: number;
  /** Baseline of the date. */
  dateY: number;
  text: string;
  /** Width of today's disc (a disc for a short date, a pill for "1 Oct"). */
  discW: number;
  today: boolean;
  past: boolean;
  weekend: boolean;
  dots: DayDot[];
  /** Things that day beyond what the column can draw, said as "+n" under its dots. */
  more: number;
  moreY: number;
}

export interface WeekHead {
  x: number;
  text: string;
}

export interface Hairline {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface WeekStripGeometry {
  cells: DayCell[];
  heads: WeekHead[];
  /** Baseline of the weekday heads. */
  headY: number;
  rules: Hairline[];
  height: number;
  /** Folded into a week a row. */
  folded: boolean;
}

export const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** The narrowest a column may be before the strip folds. */
export const MIN_COLUMN = 28;
const HEAD_Y = 13;
const ROWS_TOP = 20;
const DISC = 28;
const DOT_PITCH = 8;
const DOT_ROWS = 2;
/** A folded week's row: the disc, the dots, and the air before the hairline. */
const WEEK_GAP = 10;

const MS_DAY = 86_400_000;

/** Days since 1970 of a `YYYY-MM-DD`, or NaN. */
export function dayNumber(date: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return Number.NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / MS_DAY;
}

/** Monday is 0 and Sunday is 6. */
export const weekdayOf = (date: string): number => (new Date(dayNumber(date) * MS_DAY).getUTCDay() + 6) % 7;

/** "Tue 29 Sep". */
export function dayName(date: string): string {
  const d = new Date(dayNumber(date) * MS_DAY);
  if (Number.isNaN(d.getTime())) return date;
  return `${DAY_NAMES[weekdayOf(date)]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** The dots a column draws, centred, rows of as many as fit, and how many were left over. */
export function dotsFor(items: readonly WeekItem[], cx: number, y0: number, colW: number): { dots: DayDot[]; more: number } {
  const perRow = Math.max(1, Math.floor((colW - 4) / DOT_PITCH));
  const room = perRow * DOT_ROWS;
  const shown = items.length > room ? room - 1 : items.length;
  const dots: DayDot[] = [];
  for (let k = 0; k < shown; k++) {
    const row = Math.floor(k / perRow);
    const inRow = Math.min(perRow, shown - row * perRow);
    const j = k - row * perRow;
    const item = items[k]!;
    dots.push({
      x: r2(cx + (j - (inRow - 1) / 2) * DOT_PITCH),
      y: y0 + row * DOT_PITCH,
      late: item.late === true,
      colour: item.colour,
    });
  }
  return { dots, more: items.length - shown };
}

export function weekstrip(days: readonly WeekDay[], today: string, width: number): WeekStripGeometry {
  const valid = days.filter((d) => Number.isFinite(dayNumber(d.date)));
  const first = valid[0];
  if (!first || width <= 0) return { cells: [], heads: [], headY: HEAD_Y, rules: [], height: 0, folded: false };

  const folded = valid.length > 7 && width / valid.length < MIN_COLUMN;
  const cols = folded ? 7 : valid.length;
  const colW = width / cols;
  const start = dayNumber(first.date);
  const offset = weekdayOf(first.date);

  /* Every row is as tall as the fullest column needs, so the strip does not jag. */
  const perRow = Math.max(1, Math.floor((colW - 4) / DOT_PITCH));
  const dotRows = Math.max(
    1,
    ...valid.map((d) => {
      const room = perRow * DOT_ROWS;
      return d.items.length > room ? DOT_ROWS + 1 : Math.ceil(d.items.length / perRow);
    }),
  );
  const rowH = DISC + 8 + (dotRows - 1) * DOT_PITCH + 3 + 5;
  const pitch = rowH + WEEK_GAP;

  const cells = valid.map((d, i): DayCell => {
    const n = dayNumber(d.date);
    const wd = weekdayOf(d.date);
    const col = folded ? wd : i;
    const row = folded ? Math.floor((offset + (n - start)) / 7) : 0;
    const x = r2((col + 0.5) * colW);
    const top = ROWS_TOP + row * pitch;
    const day = new Date(n * MS_DAY);
    const text = day.getUTCDate() === 1 && colW >= 52 ? `1 ${MONTHS[day.getUTCMonth()]}` : String(day.getUTCDate());
    const dotY = top + DISC + 8;
    const { dots, more } = dotsFor(d.items, x, dotY, colW);
    return {
      date: d.date,
      x,
      top,
      dateY: top + 20,
      text,
      discW: Math.max(DISC, textWidth(text, 17) + 12),
      today: d.date === today,
      past: d.date < today,
      weekend: wd >= 5,
      dots,
      more,
      moreY: dotY + DOT_ROWS * DOT_PITCH + 4,
    };
  });

  const weeks = folded ? Math.max(...cells.map((c) => Math.round((c.top - ROWS_TOP) / pitch))) + 1 : 1;
  const height = ROWS_TOP + weeks * pitch - WEEK_GAP;

  const heads: WeekHead[] = folded
    ? WEEKDAYS.map((text, k) => ({ x: r2((k + 0.5) * colW), text }))
    : cells.map((c) => ({ x: c.x, text: WEEKDAYS[weekdayOf(c.date)] ?? '' }));

  /* One row: a vertical hairline before each Monday. Folded: a horizontal one between weeks. */
  const rules: Hairline[] = folded
    ? Array.from({ length: weeks - 1 }, (_, k) => {
        const y = r2(ROWS_TOP + (k + 1) * pitch - WEEK_GAP / 2 - 0.5);
        return { x1: 0, y1: y, x2: width, y2: y };
      })
    : cells.flatMap((c, i) => {
        if (i === 0 || weekdayOf(c.date) !== 0) return [];
        const x = r2(i * colW + 0.5);
        return [{ x1: x, y1: 2, x2: x, y2: height - 2 }];
      });

  return { cells, heads, headY: HEAD_Y, rules, height, folded };
}

/**
 * "14 days from Tue 29 Sep; today is Tue 29 Sep. Tue 29 Sep: the Cat Yard commission. Wed 30 Sep:
 * the skin bundle import and a client's salary, late."
 */
export function describeWeek(days: readonly WeekDay[], today: string, subject?: string): string {
  const first = days[0];
  if (!first) return subject ? `${subject}: no days` : 'No days';
  const lead = subject ?? `${days.length} days from ${dayName(first.date)}`;
  const said = days
    .filter((d) => d.items.length > 0)
    .map((d) => {
      const named = d.items.filter((it) => it.label).map((it) => (it.late ? `${it.label}, late` : (it.label ?? '')));
      const bare = d.items.filter((it) => !it.label);
      const late = bare.filter((it) => it.late).length;
      if (bare.length > 0)
        named.push(`${bare.length} thing${bare.length === 1 ? '' : 's'}${late > 0 ? `, ${late} late` : ''}`);
      return `${dayName(d.date)}${d.date === today ? ', today' : ''}: ${listed(named)}`;
    });
  const tail = said.length > 0 ? ` ${said.join('. ')}.` : ' Nothing is dated.';
  return `${lead}; today is ${dayName(today)}.${tail}`;
}
