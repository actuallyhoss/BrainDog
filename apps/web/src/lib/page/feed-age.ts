/**
 * HOW OLD A PROJECT'S NUMBERS ARE, ONE RULE FOR EVERY SCREEN (live check of 30 October, 2): the Projects board said
 * "Crumb.gg has sent no numbers for 89 days", the age of its August revenue, while Crumb.gg's own page said 31, the age of
 * the newest reading of anything its feed sends. Both now ask here, with every measure the project's feed keeps.
 *
 * THE FEED'S AGE IS ITS NEWEST READING OF ANY MEASURE. IT HAS GONE QUIET when every measure is past twice how often it
 * usually arrives and the newest is at least a week old, so a daily number two days late is not a stopped feed.
 *
 * PURE, AND NODE LOADS IT.
 */

const DAY = 86_400_000;
const noonOf = (day: string): number => Date.parse(`${day.slice(0, 10)}T12:00:00Z`);
const daysBetween = (a: string, b: string): number => Math.round((noonOf(b) - noonOf(a)) / DAY);

/** How few days old the newest reading may be and the feed still never be said to have stopped. */
export const FEED_QUIET_DAYS = 7;

/** One measure a project's feed keeps: the day of its newest reading, and the usual days between its readings. */
export type FeedMeasure = { newest: string; every: number };
/** The feed as a whole: its newest reading's day, how many days ago that was, and whether it has gone quiet. */
export type FeedAge = { newest: string | null; age: number; quiet: boolean };

/** The usual days between readings: the middle of the gaps between the days that have one, a month under two days. */
export function cadenceOf(ats: readonly string[]): number {
  const days = [...new Set(ats.map((a) => a.slice(0, 10)))].sort();
  if (days.length < 2) return 31;
  const gaps = days
    .slice(1)
    .map((d, i) => Math.max(1, daysBetween(days[i]!, d)))
    .sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)]!;
}

/** Whether one measure is past twice how often it arrives. */
export const measureStale = (m: FeedMeasure, today: string): boolean => daysBetween(m.newest.slice(0, 10), today) > Math.max(2 * m.every, 2);

/** How old a project's feed is, from every measure it keeps. */
export function feedAgeOf(measures: readonly FeedMeasure[], today: string): FeedAge {
  const kept = measures.filter((m) => /^\d{4}-\d{2}-\d{2}/u.test(m.newest));
  const newest =
    kept
      .map((m) => m.newest.slice(0, 10))
      .sort()
      .at(-1) ?? null;
  const age = newest ? Math.max(0, daysBetween(newest, today)) : 0;
  const quiet = kept.length > 0 && kept.every((m) => measureStale(m, today)) && age >= FEED_QUIET_DAYS;
  return { newest, age, quiet };
}
