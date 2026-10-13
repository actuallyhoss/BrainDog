/**
 * Move a date that comes round on to its next turn, once its last day has passed.
 *
 * RUN ONCE A DAY, it reads the dates that repeat and whose last day is behind today, and writes each one's day as its
 * first turn on or after today. A window keeps its length: its last day moves by as many days as its first. A date
 * that does not repeat is never touched, and neither is one still to come or still running.
 *
 * THE TURNS. Every week is seven days on. Every month and every year keep the day of the month, and in a month too
 * short for it take that month's last day. First day of each month is the 1st, and last day of each month is the
 * month's last day whatever its length, the 28th or 29th in February.
 *
 * TODAY IS THE UTC DAY. A script is handed the instant and the zone's name and cannot turn them into a local day, so
 * for a record ahead of UTC a date moves a few hours into its own next day, and for one behind it, late by as much.
 *
 * FIFTY A RUN, the one page a script reads, and the rest the next day.
 */
const DAY_MS = 86400000;
const REPEATS = ['weekly', 'monthly', 'yearly', 'month_start', 'month_end'];
const MOST_TURNS = 6000;

const parts = (day) => day.split('-').map(Number);
const msOf = (day) => {
  const [y, m, d] = parts(day);
  return Date.UTC(y, m - 1, d);
};
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** The day `n` turns on from `day`, in milliseconds. Turn 0 of the last day of each month is the end of `day`'s own month. */
function turn(day, repeats, n) {
  const [y, m, d] = parts(day);
  if (repeats === 'weekly') return msOf(day) + n * 7 * DAY_MS;
  if (repeats === 'month_start') return Date.UTC(y, m - 1 + n, 1);
  if (repeats === 'month_end') return Date.UTC(y, m + n, 0);
  /* DAY 0 OF THE MONTH AFTER IS THE LAST DAY OF THIS ONE, so a 31st in a short month, or 29 February, lands on it. */
  const year = repeats === 'yearly' ? y + n : y;
  const month = repeats === 'yearly' ? m - 1 : m - 1 + n;
  return Date.UTC(year, month, Math.min(d, new Date(Date.UTC(year, month + 1, 0)).getUTCDate()));
}

/** The first turn after `day` whose last day, `days` after it, is today or later; `null` when there is none in reach. */
function next(day, repeats, days, today) {
  const from = msOf(day);
  const floor = msOf(today) - days * DAY_MS;
  /* A WEEKLY DATE YEARS BEHIND IS STEPPED TO IN ONE GO, not a week at a time. */
  const skip = repeats === 'weekly' ? Math.max(0, Math.floor((floor - from) / (7 * DAY_MS)) - 1) : 0;
  for (let n = skip; n < skip + MOST_TURNS; n++) {
    const at = turn(day, repeats, n);
    if (at > from && at >= floor) return at;
  }
  return null;
}

export default async function run(ctx) {
  const today = ctx.now().slice(0, 10);
  const passed = {
    all: [
      { field: 'comes_round', in: REPEATS },
      { any: [{ field: 'until', before: today }, { all: [{ field: 'until', empty: true }, { field: 'day', before: today }] }] },
    ],
  };
  const rows = await ctx.record.list('fixed_dates', passed);
  let moved = 0;
  for (const row of rows) {
    const { day, until, comes_round: repeats } = row.fields;
    if (!isDay(day) || !REPEATS.includes(repeats)) continue;
    /* A LAST DAY BEFORE THE FIRST IS NO WINDOW, so the row is rolled as the one day it names. */
    const days = isDay(until) && until > day ? Math.round((msOf(until) - msOf(day)) / DAY_MS) : 0;
    if (dayOf(msOf(day) + days * DAY_MS) >= today) continue;
    const at = next(day, repeats, days, today);
    if (at === null) continue;
    const patch = { day: dayOf(at) };
    if (isDay(until) && until >= day) patch.until = dayOf(at + days * DAY_MS);
    ctx.update('fixed_dates#' + row.seq, patch, row.version);
    moved += 1;
  }
  if (moved > 0) ctx.log('Moved ' + moved + (moved === 1 ? ' date' : ' dates') + ' on to the next turn.');
}
