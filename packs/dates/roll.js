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
 * THE DAY IT REPEATS FROM IS KEPT. A 31st moved into February stands on the 28th, and counted from there it would be
 * the 28th for good. So the first time a date written past the 28th is moved, the day it was written with goes in
 * `repeats_from`, and every later turn is counted from that: the 31st is back in March, and 29 February in the next leap
 * year. A day somebody has since moved off its turn is the new word, and the kept day gives way to it.
 *
 * TODAY IS THE RECORD'S OWN DAY, `ctx.today()`, which the host works out in the record's zone, so a date moves when
 * the day turns where the person is. A host too old to say it gives the UTC day, as every host did before.
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

/** Whether `day` is a turn of `anchor`: its day of the month, or the last day of a month too short for it; every year, its month too. */
function turnOf(anchor, day, repeats) {
  const [, am, ad] = parts(anchor);
  const [y, m, d] = parts(day);
  if (repeats === 'yearly' && am !== m) return false;
  return d === Math.min(ad, new Date(Date.UTC(y, m, 0)).getUTCDate());
}

/** The day a row's turns are counted from: the kept one while the row still stands on a turn of it, and its own day otherwise. */
function baseOf(day, anchor, repeats) {
  if (repeats !== 'monthly' && repeats !== 'yearly') return day;
  return isDay(anchor) && turnOf(anchor, day, repeats) ? anchor : day;
}

/** The first turn of `base` after `day` whose last day, `days` after it, is today or later; `null` when there is none in reach. */
function next(day, base, repeats, days, today) {
  const from = msOf(day);
  const floor = msOf(today) - days * DAY_MS;
  /* A WEEKLY DATE YEARS BEHIND IS STEPPED TO IN ONE GO, not a week at a time. */
  const skip = repeats === 'weekly' ? Math.max(0, Math.floor((floor - from) / (7 * DAY_MS)) - 1) : 0;
  for (let n = skip; n < skip + MOST_TURNS; n++) {
    const at = turn(base, repeats, n);
    if (at > from && at >= floor) return at;
  }
  return null;
}

export default async function run(ctx) {
  const today = typeof ctx.today === 'function' ? ctx.today() : ctx.now().slice(0, 10);
  const passed = {
    all: [
      { field: 'comes_round', in: REPEATS },
      { any: [{ field: 'until', before: today }, { all: [{ field: 'until', empty: true }, { field: 'day', before: today }] }] },
    ],
  };
  const rows = await ctx.record.list('fixed_dates', passed);
  let moved = 0;
  for (const row of rows) {
    const { day, until, comes_round: repeats, repeats_from: anchor } = row.fields;
    if (!isDay(day) || !REPEATS.includes(repeats)) continue;
    /* A LAST DAY BEFORE THE FIRST IS NO WINDOW, so the row is rolled as the one day it names. */
    const days = isDay(until) && until > day ? Math.round((msOf(until) - msOf(day)) / DAY_MS) : 0;
    if (dayOf(msOf(day) + days * DAY_MS) >= today) continue;
    const base = baseOf(day, anchor, repeats);
    const at = next(day, base, repeats, days, today);
    if (at === null) continue;
    const patch = { day: dayOf(at) };
    /* ONLY A DAY PAST THE 28TH CAN BE CUT SHORT, so only that one is kept, and a kept day no longer counted from is taken off. */
    const kept = repeats === 'monthly' || repeats === 'yearly';
    const keep = kept && (base !== day || parts(base)[2] > 28) ? base : null;
    if (keep !== (isDay(anchor) ? anchor : null)) patch.repeats_from = keep;
    if (isDay(until) && until >= day) patch.until = dayOf(at + days * DAY_MS);
    ctx.update('fixed_dates#' + row.seq, patch, row.version);
    moved += 1;
  }
  if (moved > 0) ctx.log('Moved ' + moved + (moved === 1 ? ' date' : ' dates') + ' on to the next turn.');
}
