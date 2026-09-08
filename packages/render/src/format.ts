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
 * Banded: days to about two weeks, weeks to about two months, months to a year, then years. A band
 * is what a person actually holds — nobody plans around "in 47 days".
 */
export function relative(iso: string, now: number = Date.now()): string {
  const t = noon(iso);
  if (t === null) return iso;
  const days = Math.round((t - now) / 86_400_000);
  const n = Math.abs(days);
  const size =
    n === 0 ? 'today' : n <= 14 ? `${n}d` : n <= 60 ? `${Math.round(n / 7)}w` : n < 365 ? `${Math.round(n / 30)}mo` : `${(n / 365).toFixed(n < 730 ? 1 : 0)}y`;
  if (size === 'today') return 'today';
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
 * A string that is neither an instant nor a day comes back unchanged, which is `relative()`'s own
 * contract: a formatter must never invent a time it was not given.
 */
export function since(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return relative(iso, now);
  if (DAY.test(iso)) return relative(iso, now);
  const ms = t - now;
  const n = Math.abs(ms);
  if (n >= 86_400_000) return relative(new Date(t).toISOString().slice(0, 10), now);
  if (n < 60_000) return 'just now';
  const mins = Math.round(n / 60_000);
  const size = mins < 15 ? `${mins} min` : mins < 60 ? `${Math.round(mins / 5) * 5} min` : `${Math.round(mins / 60)}h`;
  return ms > 0 ? `in ${size}` : `${size} ago`;
}

/** `date:` links to the calendar and `day:` does not — a future date raises "what else is then". */
export const dateLong = (iso: string, now?: number): string => `${day(iso)} · ${relative(iso, now)}`;

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
