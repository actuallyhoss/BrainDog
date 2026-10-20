/**
 * What a `lanes` block decides, as functions both drawers call: the window of time it shows, where each row's span
 * sits in it, where now falls, and the names along the top.
 *
 * Kept out of the markup for the reason `calendar.ts` is: an answer here can be tested without a DOM, and two drawers
 * that each worked it out would be two answers.
 *
 * A ROW IS `title | start | end`, and a tone. Start and end are instants as the record writes them,
 * `2026-10-07T09:00:00Z` or with an offset, `2026-10-07T11:00:00+02:00`; a bare day reads as its midnight. An end
 * left off is a span still going: it runs to now, or to the end of the window when now is not in it.
 *
 * THE FIRST ROW MAY BE THE WINDOW, `window | from | to | now`, the three instants the record answered. It is told
 * from a row by its first cell being the bare word, so it is only ever read in first place, and a block with none
 * takes its window from its rows: the first start to the last end.
 *
 * NOTHING IS GUESSED ABOUT THE READER'S ZONE. A position is the instant itself, so it is the same wherever it is
 * drawn. A time is SAID in the offset the window was written in, because this package does not know where the reader
 * is and the host does: a host that wants `11:00` said writes `+02:00`, as a calendar's host writes the reader's day.
 * An instant with no offset is no instant here, since two machines would read it as two.
 */

const INSTANT = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2}))?$/u;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** The first cell of the row that is the window and not a span. */
export const LANES_WINDOW = 'window';

/** The words the drawers write that no author did, here because this package cannot import the app's copy. */
export const LANES_NONE = 'Nothing in this time.';
export const LANES_NOW = 'Now';
export const lanesSince = (when: string): string => `Since ${when}`;
export const lanesSkipped = (titles: readonly string[]): string => `Not shown, because the times do not read: ${titles.join(', ')}.`;
export const lanesOutside = (titles: readonly string[]): string => `Outside this time: ${titles.join(', ')}.`;
/** Under lanes the record drew the newest of: how many in the same time it left out, all of them started earlier. */
export const lanesMore = (n: number): string => `And ${n} more that started earlier.`;

/** The most names along the top, and how near now's line, as a share of the width, a name gives way to it. */
const TICKS_MOST = 8;
/** The most names along a window of a day or less. */
const TICKS_DAY = 4;
const NEAR = 0.06;
/** Past this long a window the names along the top are months, and years where months would crowd. */
const MONTHLY = 62 * DAY;

/** An instant a cell names, with the offset it was written in, in minutes. Null when it names none. */
export function lanesInstant(text: string): { at: number; offset: number } | null {
  const m = INSTANT.exec(text.trim());
  if (!m) return null;
  const at = Date.parse(m[4] === undefined ? `${m[1]}-${m[2]}-${m[3]}T00:00:00Z` : m[0]);
  if (!Number.isFinite(at)) return null;
  const zone = m[7];
  const offset = zone === undefined || zone === 'Z' ? 0 : (zone.startsWith('-') ? -1 : 1) * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4, 6)));
  /* THE SHAPE IS NOT THE CHECK, as `format.ts` says of a day: `Date.parse` rolls 30 February into March, so the day
     that comes back out has to be the day that went in. */
  const wall = new Date(at + offset * MINUTE);
  if (wall.getUTCDate() !== Number(m[3]) || wall.getUTCMonth() + 1 !== Number(m[2])) return null;
  return { at, offset };
}

/** Why a block's window row does not read, or null. The parser degrades on it, so the drawers never meet one. */
export function lanesFault(rows: readonly (readonly string[])[]): string | null {
  const first = rows[0];
  if (!first || first[0] !== LANES_WINDOW) return null;
  const from = lanesInstant(first[1] ?? '');
  const to = lanesInstant(first[2] ?? '');
  const now = (first[3] ?? '') === '' || lanesInstant(first[3]!) !== null;
  return from && to && from.at < to.at && now
    ? null
    : 'a window that does not read. Write "window | from | to | now", each an instant such as 2026-10-07T09:00:00Z, with from before to';
}

/** A share of the width as the percentage an inline style takes, to a hundredth of one. */
const percent = (share: number): string => `${Math.round(Math.min(1, Math.max(0, share)) * 10_000) / 100}%`;

const two = (n: number): string => String(n).padStart(2, '0');

type Wall = { year: number; month: number; date: number; minutes: number };
const wallOf = (at: number, offset: number): Wall => {
  const d = new Date(at + offset * MINUTE);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), date: d.getUTCDate(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
};
const timeOf = (w: Wall): string => `${two(Math.floor(w.minutes / 60))}:${two(w.minutes % 60)}`;
const dayOf = (w: Wall, year: boolean): string => `${w.date} ${MONTHS[w.month]!}${year ? ` ${w.year}` : ''}`;
const sameDay = (a: Wall, z: Wall): boolean => a.year === z.year && a.month === z.month && a.date === z.date;

/** One row placed in the window. `at` and `span` are percentages of the width, written as an inline style takes them. */
export type Lane<R> = {
  row: R;
  at: string;
  span: string;
  /** How its time is said: `09:00 to 10:30`, `Since 09:00`, or with its day where the window is longer than one. */
  when: string;
  /** No end was written, so it is still going. */
  open: boolean;
  /** It starts and ends at one instant, so it is a mark and not a bar. */
  point: boolean;
  /** It began before the window, or ends after it, and is cut at that edge. */
  before: boolean;
  after: boolean;
};

export type LanesTick = { at: string; label: string };

export type LanesPlan<R> = {
  lanes: Lane<R>[];
  ticks: LanesTick[];
  /** Where now's line stands, or null when now is not in the window or no clock was told. */
  now: string | null;
  /** The window as a sentence says it: `7 Oct 2026, 08:00 – 18:00`. */
  said: string;
  /** The rows whose times do not read, and the rows that fall outside the window, by index, named under the drawing. */
  skipped: number[];
  outside: number[];
  /** No row is placed, so there is nothing to draw but the sentence that says so. */
  empty: boolean;
};

/** The names along the top: hours across a window of two days or less, days across a longer one, months past two of them. */
function ticksOf(from: number, to: number, offset: number, now: number | null): LanesTick[] {
  const length = to - from;
  /* ON THE WALL CLOCK THE WINDOW WAS WRITTEN IN, so a name falls on the hour there and not on the hour in UTC. */
  const shift = offset * MINUTE;
  const out: LanesTick[] = [];
  /* A name under now's line gives way to it. */
  const name = (t: number, label: string): void => {
    const share = (t - from) / length;
    if (now === null || Math.abs(share - now) >= NEAR) out.push({ at: percent(share), label });
  };

  /* MONTHS ARE COUNTED ON THE CALENDAR, NOT IN DAYS: a step of thirty days drifts off the first of the month, and one
     of 365 names 31 December after the first leap year. The year is said on the first name and on each January. */
  if (length > MONTHLY) {
    const a = wallOf(from, offset);
    const z = wallOf(to, offset);
    const months = (z.year - a.year) * 12 + z.month - a.month;
    const step = [1, 2, 3, 6, 12, 24, 60, 120].find((m) => months / m <= TICKS_MOST) ?? Math.ceil(months / TICKS_MOST / 12) * 12;
    for (let index = Math.ceil((a.year * 12 + a.month) / step) * step; ; index += step) {
      const year = Math.floor(index / 12);
      const t = Date.UTC(year, index % 12, 1) - shift;
      if (t > to || out.length > TICKS_MOST + 1) break;
      if (t < from) continue;
      name(t, step >= 12 ? String(year) : `${MONTHS[index % 12]!}${a.year !== z.year && (index % 12 === 0 || out.length === 0) ? ` ${year}` : ''}`);
    }
    return out;
  }

  const days = wallOf(to - 1, offset).date !== wallOf(from, offset).date || length > DAY;
  const hourly = length <= 2 * DAY;
  /* A DAY OR LESS IS NAMED AT MOST FOUR TIMES, on the hours a day is read by (00:00, 06:00, 12:00, 18:00): eight names
     along a day's axis were a ruler, and the lanes under it are what is read (the UI pass of 20 October, agents F7). */
  const day = hourly && length <= DAY && length >= 6 * HOUR;
  const steps = hourly ? [5 * MINUTE, 10 * MINUTE, 15 * MINUTE, 30 * MINUTE, ...(day ? [1, 2, 3, 6, 12] : [1, 2, 3, 4, 6, 12]).map((h) => h * HOUR)] : [1, 2, 7, 14].map((d) => d * DAY);
  const most = day ? TICKS_DAY : TICKS_MOST;
  const step = steps.find((s) => length / s <= most) ?? steps[steps.length - 1]!;
  /* Hours fall on multiples of the step, so a window from 09:00 names 10:00 and 12:00; days are counted from the
     first midnight in the window, since a step of a week counted from 1970 would start every axis on a Thursday. */
  const grain = hourly ? step : DAY;
  for (let t = Math.ceil((from + shift) / grain) * grain - shift; t <= to && out.length <= TICKS_MOST + 1; t += step) {
    const w = wallOf(t, offset);
    name(t, hourly ? (days && w.minutes === 0 ? dayOf(w, false) : timeOf(w)) : dayOf(w, false));
  }
  return out;
}

/**
 * The window, the spans and now's line for these rows. `clock` is the host's now in milliseconds
 * (`RenderOptions.now`), read only when the window row names none.
 *
 * The rows keep the order they came in, which is the reader's: one row a lane, top to bottom.
 */
export function lanesPlan<R extends { cells: readonly string[] }>(rows: readonly R[], clock?: number): LanesPlan<R> {
  const head = rows[0]?.cells[0] === LANES_WINDOW ? rows[0]!.cells : null;
  const body = head ? rows.slice(1) : rows;
  const first = head ? 1 : 0;

  const read = body.map((row) => {
    const start = lanesInstant(row.cells[1] ?? '');
    const written = (row.cells[2] ?? '').trim();
    const end = written === '' ? null : lanesInstant(written);
    /* AN END BEFORE ITS START READS AS NO TIME AT ALL: drawn as a mark at its start it would say something happened
       then, which nobody wrote. */
    const reads = start !== null && (written === '' || (end !== null && end.at >= start.at));
    return { row, start, end, open: written === '', reads };
  });
  const skipped: number[] = [];
  read.forEach((r, i) => {
    if (!r.reads) skipped.push(i + first);
  });
  const good = read.flatMap((r, i) => (r.reads && r.start !== null ? [{ ...r, start: r.start, index: i + first }] : []));

  const wFrom = head ? lanesInstant(head[1] ?? '') : null;
  const wTo = head ? lanesInstant(head[2] ?? '') : null;
  const windowed = wFrom !== null && wTo !== null && wFrom.at < wTo.at;
  if (!windowed && good.length === 0) return { lanes: [], ticks: [], now: null, said: '', skipped, outside: [], empty: true };

  const offset = windowed ? wFrom.offset : good[0]!.start.offset;
  const from = windowed ? wFrom.at : Math.min(...good.map((r) => r.start.at));
  const last = windowed ? wTo.at : Math.max(...good.map((r) => Math.max(r.start.at, r.end?.at ?? r.start.at)));
  /* WITH NO WINDOW WRITTEN, A SPAN STILL GOING REACHES THE HOST'S NOW, or it would be drawn stopping where the last
     finished one did. */
  const going = !windowed && clock !== undefined && Number.isFinite(clock) && good.some((r) => r.open);
  const reach = going ? Math.max(last, clock) : last;
  /* A block of one instant has no width to place it in, so it is given an hour. */
  const to = reach > from ? reach : from + HOUR;
  const length = to - from;

  const told = head ? lanesInstant(head[3] ?? '')?.at : undefined;
  const at = told ?? (clock !== undefined && Number.isFinite(clock) ? clock : null);
  const now = at !== null && at >= from && at <= to ? at : null;

  const a = wallOf(from, offset);
  /* THE LAST MOMENT INSIDE, so a window that ends at midnight is the day before it, as a person says it. */
  const z = wallOf(to - 1, offset);
  const oneDay = sameDay(a, z);
  const years = a.year !== z.year;
  const say = (t: number, withDay: boolean): string => {
    const w = wallOf(t, offset);
    return withDay ? `${dayOf(w, years)}, ${timeOf(w)}` : timeOf(w);
  };

  const lanes: Lane<R>[] = [];
  const outside: number[] = [];
  for (const r of good) {
    const s = r.start.at;
    const e = Math.max(s, r.end ? r.end.at : now !== null && now > s ? now : to);
    if (e < from || s > to) {
      outside.push(r.index);
      continue;
    }
    const left = Math.max(s, from);
    const right = Math.min(e, to);
    const point = !r.open && e === s;
    const ws = wallOf(s, offset);
    const we = wallOf(e, offset);
    /* WHOLE DAYS ARE SAID AS DAYS: a span from one midnight to another over a longer window is `7 Oct – 9 Oct`, and
       the hour it would otherwise carry at each end is noise. */
    const whole = !oneDay && ws.minutes === 0 && (r.open || we.minutes === 0);
    const one = (t: number, w: Wall): string => (whole ? dayOf(w, years) : say(t, !oneDay));
    const when = r.open
      ? lanesSince(one(s, ws))
      : point
        ? one(s, ws)
        : whole || oneDay || !sameDay(ws, we)
          ? `${one(s, ws)} to ${one(e, we)}`
          : `${one(s, ws)} to ${timeOf(we)}`;
    lanes.push({
      row: r.row,
      at: percent((left - from) / length),
      span: percent((right - left) / length),
      when,
      open: r.open,
      point,
      before: s < from,
      after: e > to,
    });
  }

  const share = now === null ? null : (now - from) / length;
  const end = wallOf(to, offset);
  /* ONE WHOLE DAY IS ITS DAY, since `00:00 – 00:00` says nothing. */
  const said = !oneDay
    ? `${dayOf(a, true)}, ${timeOf(a)} – ${dayOf(end, true)}, ${timeOf(end)}`
    : a.minutes === 0 && end.minutes === 0
      ? dayOf(a, true)
      : `${dayOf(a, true)}, ${timeOf(a)} – ${timeOf(end)}`;
  return {
    lanes,
    ticks: ticksOf(from, to, offset, share),
    now: share === null ? null : percent(share),
    said,
    skipped,
    outside,
    empty: lanes.length === 0,
  };
}

/**
 * WHO A LANE IS, ITS FOURTH CELL, where the host wrote one: the agent of a run (`Claude`), drawn with its maker's mark
 * before the lane's words. `''` for a lane that names nobody, the window row's fourth cell, now, never being a lane.
 */
export const laneWho = (cells: readonly string[]): string => (cells[3] ?? '').trim();

/**
 * THE HUE A LANE AT WORK IS PAINTED IN, as the inline style's tail: its agent's maker colour (`--agent-claude`), and
 * nothing where the mark is drawn in ink or there is no mark, which leaves the sheet's own ink (SF9). Never red.
 */
export const laneHue = (tone: string | null | undefined): string =>
  tone && tone !== 'ink' && /^[a-z]+$/u.test(tone) ? `;--lane-c:var(--agent-${tone}, var(--ink))` : '';

/** The drawing as one sentence, which is the list's name: how many there are and the time they sit in. */
export const lanesSentence = (plan: { lanes: readonly unknown[]; said: string }): string => `${plan.lanes.length} on the timeline, ${plan.said}`;
