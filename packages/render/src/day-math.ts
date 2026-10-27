/**
 * A day moved, two days apart, and a day or a month said short, as the forecast and the screens that only count days
 * both want them.
 *
 * ITS OWN MODULE, APART FROM `forecast.ts`, WHICH RE-EXPORTS ALL FOUR. A screen that only adds a day to a date reached
 * this file through the barrel, and a module shared between chunks is bundled whole, so the whole forecast was on
 * Today's first load for `addDays`.
 */

const DAY_MS = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/u;
/** A calendar month as the host writes one, `2026-07`. */
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/u;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const ms = (day: string): number => Date.parse(`${day}T12:00:00Z`);
export const addDays = (day: string, n: number): string => new Date(ms(day) + n * DAY_MS).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string): number => Math.round((ms(to) - ms(from)) / DAY_MS);
/**
 * `12 Nov`, the way a sentence over a chart says a day, and `12 Nov 2027` when `today` is given and the day is in
 * another year: a walk of a year said "Stays above zero to 14 Oct", which reads as this October, a year early.
 */
export const shortDay = (day: string, today?: string): string => {
  if (!ISO.test(day)) return day;
  const d = new Date(ms(day));
  const year = today !== undefined && ISO.test(today) && today.slice(0, 4) !== day.slice(0, 4) ? ` ${day.slice(0, 4)}` : '';
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${year}`;
};

/** `Jul`, a calendar month as a person says it, and `Nov 2025` when `today` is in another year. */
export const shortMonth = (month: string, today: string): string => {
  const m = MONTH.exec(month);
  if (!m) return month;
  return `${MONTHS[Number(m[2]) - 1]}${m[1] === today.slice(0, 4) ? '' : ` ${m[1]}`}`;
};
