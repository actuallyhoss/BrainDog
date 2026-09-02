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

/** Measured at noon UTC of the day named, so a timezone cannot move a due date by one (36 §13 D15). */
function noon(iso: string): number | null {
  const m = DAY.exec(iso);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
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
    case 'pct':
      return Number.isNaN(Number(a)) ? null : pct(Number(a));
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
