/**
 * What a shared figure's trend says, out of the component so `node --test` can hold it (a Svelte page does not mount
 * there).
 *
 * A NUMBER TILE CARRIES A CHART AND A LINE SAYING WHAT IT MEANS (SYSTEM §6, §11), and the only series a shared page can
 * be handed is the one the record computed for a figure declared with `trend:` (`packages/kernel/src/pages.ts`
 * `trendOf`), one value a day, `null` on a day with no reading. The share keeps it (`shownBlock` copies `trend`), and
 * until the page's reader keeps it too (`share-write.ts` `readingOf`), no reading carries one and every figure is drawn
 * alone. Nothing here makes a number up: a series with fewer than two figures in it is no trend, and says nothing.
 */

/** The series a reading carries, oldest first, with a day that had no reading as `NaN` so the days keep their places. */
export function trendOf(reading: object): number[] | null {
  const raw = (reading as { trend?: unknown }).trend;
  if (!Array.isArray(raw)) return null;
  const values = raw.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : Number.NaN));
  return values.filter(Number.isFinite).length >= 2 ? values : null;
}

/** How long a series of days runs, in the unit a person counts it in. */
export function spanSaid(days: number): string {
  if (days >= 14 && days % 7 === 0) return `${days / 7} weeks`;
  return days === 1 ? '1 day' : `${days} days`;
}

/**
 * The one line under a trend: which way it went and by how much, from where to where, over how long.
 *
 * "Up 12% over the last 12 weeks, from 4,100 to 4,600." A figure that started at zero has no percentage to move by, so
 * that line says the two ends instead; a series that ended where it began says it held.
 */
export function trendSaid(values: readonly number[], format: (n: number) => string): string | null {
  const finite = values.filter(Number.isFinite);
  const first = finite[0];
  const last = finite.at(-1);
  if (first === undefined || last === undefined || finite.length < 2) return null;
  const over = `over the last ${spanSaid(values.length)}`;
  if (first === 0) return last === 0 ? `Held at ${format(0)} ${over}.` : `From ${format(0)} to ${format(last)} ${over}.`;
  const moved = Math.round((Math.abs(last - first) / Math.abs(first)) * 100);
  if (moved === 0) return `Held at ${format(last)} ${over}.`;
  return `${last > first ? 'Up' : 'Down'} ${moved}% ${over}, from ${format(first)} to ${format(last)}.`;
}
