/**
 * A day as the app says it: `2026-12-02` or `2026-12-02T09:00:00Z` is `2 Dec` inside this year and `2 Dec 2027`
 * outside it. The CLI printed the ISO date ("token expires 2026-12-02") where the app says "2 Dec" (audit 31 Oct).
 * Anything that is no date is said as it came.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function saidDay(day: string, now: number = Date.now()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/u.exec(day);
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  if (!m || !month) return day;
  return `${String(Number(m[3]))} ${month}${m[1] === String(new Date(now).getUTCFullYear()) ? '' : ` ${m[1]!}`}`;
}
