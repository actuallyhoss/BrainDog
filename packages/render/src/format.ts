/**
 * How a value is drawn. Formatting is decided FOR the author, not by them: money as money, a rate
 * as a level, a status with its glyph, a day as a day (05 §7.1). A figure formatted differently in
 * two places is two figures as far as a reader is concerned.
 *
 * Numbers group in `en` — `,` for thousands, `.` for the decimal — the minus is U+2212, and there
 * is no locale option at stage 0 (36 §13 D2). Latin digits are pinned for every figure, because
 * Eastern Arabic digits break tabular alignment: prose may use the locale's digits, a ledger may not.
 */

const MINUS = '−';
const NUM = 'en-u-nu-latn';

/** Currencies whose minor unit is not two decimal places. Money is ALWAYS an integer in minor units. */
const EXPONENT: Record<string, number> = {
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0,
  PYG: 0, RWF: 0, UGX: 0, UYI: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
};

export const exponentOf = (currency: string): number => EXPONENT[currency.toUpperCase()] ?? 2;

/**
 * Code first, then the amount. `{{money:129900 EGP}}` is `EGP 1,299.00`; `{{money:1299 JPY}}` is
 * `JPY 1,299`. A negative amount reads `EGP −1,299.00` with a real minus sign, not a hyphen.
 */
export function money(minor: number, currency: string): string {
  const exp = exponentOf(currency);
  const negative = minor < 0;
  const amount = Math.abs(minor) / 10 ** exp;
  const body = amount.toLocaleString(NUM, { minimumFractionDigits: exp, maximumFractionDigits: exp });
  return `${currency.toUpperCase()} ${negative ? MINUS : ''}${body}`;
}

export const quantity = (value: number, unit: string): string =>
  `${value.toLocaleString(NUM, { maximumFractionDigits: 3 })}${unit ? ` ${unit}` : ''}`;

export const pct = (value: number): string =>
  `${value < 0 ? MINUS : ''}${Math.abs(value).toLocaleString(NUM, { maximumFractionDigits: 1 })}%`;

export const integer = (value: number): string => value.toLocaleString(NUM);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Measured at noon UTC of the day named, so a timezone cannot move a due date by one (36 §13 D15).
 *
 * THE SHAPE IS NOT THE CHECK. `Date.UTC` normalises rather than refusing, so `2026-02-30` matched
 * the pattern, rolled forward and rendered "2 Mar 2026" — a date that is not the one in the record
 * and not marked as anything, on a field somebody diaries against. The round trip is the check: a
 * day that does not come back out as the day that went in was never a day.
 */
function noon(iso: string): number | null {
  const m = DAY.exec(iso);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d, 12);
  const back = new Date(t);
  return back.getUTCFullYear() === y && back.getUTCMonth() === mo - 1 && back.getUTCDate() === d ? t : null;
}

/**
 * The number inside a formatted cell, for the one thing that has to read a string it just wrote:
 * the length of a bar.
 *
 * `String(cell).replace(/[^\d.-]/g, '')` was the version here and in the Svelte primitive, and it
 * threw the sign away, because `money()` writes a real minus (U+2212) and a hyphen is what that
 * class keeps. `GBP −1,299.00` came back as 1299 and drew a bar the length of the same amount owed
 * the other way. A magnitude that reads its own output has to read the WHOLE of it.
 *
 * NaN for a cell with no number in it, never 0: a bar at zero claims the value is zero.
 */
const NUMBER = /-?\d[\d,]*(?:\.\d+)?/;

export function magnitudeOf(cell: string): number {
  const m = NUMBER.exec(cell.replaceAll(MINUS, '-'));
  return m ? Number(m[0].replaceAll(',', '')) : NaN;
}

export function day(iso: string): string {
  const t = noon(iso);
  if (t === null) return iso;
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * How a number of whole days is said: days to about two weeks, weeks to about two months, months to
 * a year, then years. A band is what a person actually holds — nobody plans around "in 47 days".
 *
 * SHARED, because `since()` needs the same ladder past a day and the alternative is two band tables
 * that drift. `''` for zero days, which the callers turn into their own word.
 */
const band = (n: number): string =>
  n === 0 ? '' : n <= 14 ? `${n}d` : n <= 60 ? `${Math.round(n / 7)}w` : n < 365 ? `${Math.round(n / 30)}mo` : `${(n / 365).toFixed(n < 730 ? 1 : 0)}y`;

/**
 * WHICH CALENDAR DAY A MOMENT FALLS ON, counted from the epoch — the unit both functions band.
 *
 * `relative()` rounded the NOON-OFFSET: `Math.round((noon(day) - now) / 86_400_000)`. With `now` at
 * midday that gives the calendar answer, and it drifts by a whole band the further `now` sits from
 * noon — at midnight, yesterday's date read **"today"**. `since()` rounded ELAPSED time, so a moment
 * 36 hours old was "2d ago" beside a `day` cell for the same afternoon reading "1d ago". Two
 * functions, two units, one table.
 *
 * They count days now, both of them, and a day is a day rather than a distance from lunchtime.
 */
const dayIndex = (ms: number): number => Math.floor(ms / 86_400_000);

export function relative(iso: string, now: number = Date.now()): string {
  const t = noon(iso);
  if (t === null) return iso;
  const days = dayIndex(t) - dayIndex(now);
  const size = band(Math.abs(days));
  if (size === '') return 'today';
  return days > 0 ? `in ${size}` : `${size} ago`;
}

/**
 * AN INSTANT, SAID IN THE UNIT IT MATTERS IN — which nothing in this package could do.
 *
 * `relative()` takes a DAY. It is anchored on `/^\d{4}-\d{2}-\d{2}$/` and returns its argument
 * unchanged when the pattern misses, so an instant handed to it rendered as
 * `2026-09-03T11:57:00.000Z` on screen. Every caller in the app had learned to `.slice(0, 10)`
 * first, which hides the miss and throws the time away with it — so a device grant three minutes old
 * and one eleven hours old both read *today*, on the one table whose entire decision is whether ten
 * minutes have passed (`12 §6.1`, `49 §5.9`).
 *
 * BANDED, AND THE BAND TIGHTENS WHERE THE DECISION IS. `relative()`'s argument is that nobody plans
 * around "in 47 days", and the same holds for "44 minutes" — so this rounds to five below the hour.
 * Inside the first quarter of an hour it does NOT round, because that is the window a device grant
 * lives in: ten minutes (`49 §5.9`), and "10 min ago" rounded from twelve is the difference between
 * a request you can still approve and one that is over. A band is a kindness until it is the number
 * somebody is deciding on.
 *
 * Past a day it hands over to `relative()` rather than growing a second set of bands, so one date
 * cannot be said two ways by two functions.
 *
 * A string that is neither an instant nor a day comes back unchanged. That is `relative()`'s own
 * contract — a formatter must never invent a time it was not given — and it is weaker here than it
 * reads, because `Date.parse` accepts far more than an instant: `'2026'` and `'Sept 8'` both parse
 * to real dates. Nothing in this product hands it either, and the honest statement is that this
 * rejects what `Date.parse` rejects rather than what a person would call malformed.
 *
 * THREE BOUNDARIES A REVIEW MEASURED AND FOUND WRONG, each one comparison apart:
 *
 *   · `Math.round(mins / 5) * 5` is **60** at 58 and 59 minutes, so the ladder read
 *     *55 min → 60 min → 1h* — two spellings of an hour, one of them in the band that is supposed to
 *     stop below it.
 *   · `Math.round(1439 / 60)` is 24, so 23h59m read **"24h ago"** beside a real day.
 *   · The handover past a day threw the time of day away — `slice(0, 10)` and then `relative()`,
 *     which anchored at noon — so an instant exactly 24 hours old, read at midnight, said **"today"**.
 *     That is the failure this function exists to end, surviving one band further out.
 *
 * AND THEN IT COUNTED ELAPSED 24-HOUR PERIODS, which is a third unit. A moment 36 hours old came out
 * "2d ago" beside a `day` cell for the same afternoon reading "1d ago" — for twelve hours out of
 * every twenty-four, past a day, an `instant` column and a `day` column in one table disagreed by a
 * whole band. The comment here claimed they could not. Both count CALENDAR DAYS now, which is the
 * thing each was reaching for: `dayIndex` above, and `relative()`'s own ladder below it.
 */
export function since(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return relative(iso, now);
  if (DAY.test(iso)) return relative(iso, now);

  const ms = t - now;
  const n = Math.abs(ms);
  if (n < 60_000) return 'just now';

  const mins = Math.round(n / 60_000);
  /* Capped at the top of each range rather than rounded past it, so no band ever spells the one
     above it. `Math.round` alone gave `60 min` and `24h`. */
  const size =
    mins < 15
      ? `${mins} min`
      : mins < 60
        ? `${Math.min(55, Math.round(mins / 5) * 5)} min`
        : n < 86_400_000
          ? `${Math.min(23, Math.round(mins / 60))}h`
          : band(Math.abs(dayIndex(t) - dayIndex(now)));
  return ms > 0 ? `in ${size}` : `${size} ago`;
}

/** `date:` links to the calendar and `day:` does not — a future date raises "what else is then". */
export const dateLong = (iso: string, now?: number): string => `${day(iso)} · ${relative(iso, now)}`;

/**
 * A size, in the unit that tells one file from another.
 *
 * `(bytes / 1e6).toFixed(1) + ' MB'` was written inline on the backups screen, and over a record of
 * ninety-three rows every snapshot came out **"0.2 MB"** — four distinct copies, four identical
 * strings, on the one screen whose entire job is to say which copy is which. A formatter that cannot
 * distinguish the values it is given is not formatting them.
 *
 * NO DOCUMENT SPECIFIES THIS. `13-UI` has no rule for bytes; the specs use raw counts, `KiB` and
 * `MiB`. So it is a decision rather than a citation, and the decision is:
 *
 *   · **Decimal units**, because `53 §4`'s ceiling is written `40 MiB` and a person reading a file
 *     listing sees `MB`. One of the two has to be picked; the screen picks the one people read.
 *   · **Three significant figures**, so 157 kB and 160 kB are different strings and 1.24 MB and
 *     1.31 MB are too. A fixed decimal place is what collapsed them.
 *   · **Whole bytes below a kilobyte**, because `0.4 kB` is a number nobody wanted.
 *
 * AND THE UNIT IS CHOSEN AFTER THE ROUNDING, WHICH IS THE ONLY ORDER THAT WORKS. Choosing first gave
 * `999_500 → "1,000 kB"` — four significant figures, a thousands separator inside a kB reading, and
 * five hundred bytes later the same file is `"1.00 MB"`. The same at every boundary: `9_995` was
 * `"10.00 kB"` beside `10_000`'s `"10.0 kB"`, and `999_999_999` was `"1,000 MB"`. It is the same
 * capping `since()` needed twenty lines above, arrived at the same way: round, then look at what you
 * rounded to, and climb if it spilled.
 */
export function bytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return MISSING;
  /* ROUNDED BEFORE THE BAND IS CHOSEN, for the same reason as the loop below: `999.5` rounds to 1000
     and `1000 B` is a four-digit reading of a unit that stops at three. */
  const whole = Math.round(n);
  if (whole < 1_000) return `${whole} B`;

  const units = ['kB', 'MB', 'GB', 'TB'];
  let value = whole / 1_000;
  let i = 0;
  /* Three significant figures: 157 kB · 15.7 MB · 1.57 GB. `toPrecision` is not it — it would give
     `1.00e+3` for the very case this loop exists to catch. */
  const places = (v: number) => (v >= 100 ? 0 : v >= 10 ? 1 : 2);
  /**
   * ONE ROUNDING, AND IT IS THE RENDERER'S — the climb reads its own output.
   *
   * It rounded twice with two different rules: `toFixed` rounds the exact binary double,
   * `toLocaleString` rounds the shortest decimal. They disagree on every `.5` tie, so `1005` printed
   * `1.00 kB` where the renderer would have said `1.01`, and `9995` — the example this function was
   * fixed for — printed `9.99 kB` instead of `10.0 kB`. Wrong in the digit, which is worse than the
   * four-digit band it replaced. Doing the arithmetic by hand cannot help: `1.005 * 100` is
   * `100.49999999999999`.
   *
   * So the string is produced first and the climb asks whether THAT spilled. There is no second
   * opinion to disagree with.
   */
  const say = (v: number) => {
    const p = places(v);
    return v.toLocaleString(NUM, { minimumFractionDigits: p, maximumFractionDigits: p });
  };
  for (;;) {
    /* TWICE, BECAUSE ROUNDING MOVES THE BOUNDARY. `9.995` has two decimal places and rounds to
       `10.00`, which has one — four significant figures, the defect this loop exists to prevent,
       arriving through the rounding rather than through the unit. Saying the rounded number again
       settles it, and a second pass cannot move it further: `10.0` is already at its own precision. */
    const once = Number(say(value).replaceAll(',', ''));
    const text = say(once);
    if (once < 1_000 || i === units.length - 1) return `${text} ${units[i]}`;
    value /= 1_000;
    i += 1;
  }
}

export const yesno = (v: boolean): string => (v ? 'yes' : 'no');

/** A ref reads as its spoken id, which is the string a person says out loud. */
export const ref = (spoken: string): string => {
  const i = spoken.indexOf('#');
  return i === -1 ? spoken : spoken.slice(i);
};

/**
 * The typed interpolations: eight, counted. `date` `day` `until` `ago` `money` `quantity` `pct` `ref`.
 * An argument that does not parse renders as the author's text, MARKED — never vanishing, and never
 * inventing a day (05 §7.2).
 */
export const TYPED = ['date', 'day', 'until', 'ago', 'money', 'quantity', 'pct', 'ref'] as const;
export type TypedForm = (typeof TYPED)[number];

export function formatTyped(form: TypedForm, arg: string, now?: number): string | null {
  const a = arg.trim();
  switch (form) {
    case 'date':
    case 'day':
      return noon(a) === null ? null : form === 'date' ? dateLong(a, now) : `${day(a)} · ${relative(a, now)}`;
    case 'until':
    case 'ago':
      return noon(a) === null ? null : relative(a, now);
    case 'money': {
      const m = /^(-?\d+)\s+([A-Za-z]{3})$/.exec(a);
      return m ? money(Number(m[1]), m[2]!) : null;
    }
    case 'quantity': {
      const m = /^(-?[\d.]+)\s*(.*)$/.exec(a);
      return m && !Number.isNaN(Number(m[1])) ? quantity(Number(m[1]), m[2]!.trim()) : null;
    }
    /* `Number('')` is 0, so `{{pct:}}` rendered `0%` — a measurement, printed, of a thing nobody
       measured. That is this module's own rule in bold, broken by a falsy check. An empty argument
       and a non-finite one are both "not a percentage", and the caller draws the author's text. */
    case 'pct':
      return a === '' || !Number.isFinite(Number(a)) ? null : pct(Number(a));
    case 'ref':
      return /^[a-z][a-z0-9_]*#\d+$/.test(a) ? ref(a) : null;
  }
}

/**
 * A path that names nothing renders as the path, marked; a path whose value is MISSING renders an
 * em dash — never blank, never `undefined`, and NEVER A ZERO. A product that earns nothing and a
 * product nobody measured are not the same product (05 §7.1).
 */
export const MISSING = '—';
