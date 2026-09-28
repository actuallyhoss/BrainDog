/**
 * The changelog's entries, shaped for reading: each with its permalink, grouped by day, the newest
 * day on its own, and the rest folded by month.
 *
 * ONE FILE FOR THE PAGE AND THE FEED, so an entry's address on `/changelog` and its id in
 * `/changelog.xml` are the same string and a reader who follows one lands on the other. It stays
 * plain Node (no `$lib`, no runes), so a test can import it the way it imports `entries.ts`.
 *
 * NOTHING HERE SORTS. `entries.ts` is newest first with an editorial order inside a day, and
 * `scripts/changelog.mjs` holds it to that, so grouping consecutive runs keeps both.
 */
import { ENTRIES, type Entry } from './entries.ts';

export type Kind = Entry['kind'];

/** The order the filters and every tally draw in: new work, then repairs, then changes of course. */
export const KINDS: readonly Kind[] = ['shipped', 'fixed', 'changed'];

export type Item = Entry & { anchor: string };
export type Day = { date: string; entries: Item[] };
export type Tally = Record<Kind, number>;
export type Month = { key: string; year: number; month: number; days: Day[]; tally: Tally; total: number };

/**
 * A title as an address: lower case, runs of anything else as one hyphen, cut at a word.
 *
 * THE DATE LEADS THE ANCHOR, so an entry's link cannot collide with an id the layout draws (`main`,
 * the menu) and two days that each shipped "Search" still get two addresses.
 */
const slug = (title: string): string => {
  const flat = title
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (flat.length <= 60) return flat;
  const cut = flat.slice(0, 60);
  const at = cut.lastIndexOf('-');
  return at > 20 ? cut.slice(0, at) : cut;
};

const anchored = (entries: readonly Entry[]): Item[] => {
  const seen = new Set<string>();
  return entries.map((entry) => {
    const base = `${entry.date}-${slug(entry.title)}`;
    let anchor = base;
    for (let n = 2; seen.has(anchor); n += 1) anchor = `${base}-${n}`;
    seen.add(anchor);
    return { ...entry, anchor };
  });
};

/** Every entry, newest first, each with the id its permalink points at. */
export const ITEMS: readonly Item[] = anchored(ENTRIES);

export const tally = (entries: readonly Entry[]): Tally => {
  const count: Tally = { shipped: 0, fixed: 0, changed: 0 };
  for (const entry of entries) count[entry.kind] += 1;
  return count;
};

/** Consecutive entries that share a date, in the order `entries.ts` gives them. */
export const DAYS: readonly Day[] = (() => {
  const days: Day[] = [];
  for (const item of ITEMS) {
    const last = days.at(-1);
    if (last?.date === item.date) last.entries.push(item);
    else days.push({ date: item.date, entries: [item] });
  }
  return days;
})();

/** The newest day, which the page draws in full above the months. */
export const LATEST: Day | undefined = DAYS[0];

/**
 * Every day but the newest, by month, newest month first.
 *
 * THE NEWEST DAY IS NOT REPEATED HERE, because it is already open above as "Latest" and an entry
 * drawn twice would carry its permalink id twice. A month whose only day was the newest one simply
 * does not appear.
 */
export const MONTHS: readonly Month[] = (() => {
  const months: Month[] = [];
  for (const day of DAYS.slice(1)) {
    const key = day.date.slice(0, 7);
    let month = months.at(-1);
    if (month?.key !== key) {
      month = {
        key,
        year: Number.parseInt(key.slice(0, 4), 10),
        month: Number.parseInt(key.slice(5, 7), 10),
        days: [],
        tally: { shipped: 0, fixed: 0, changed: 0 },
        total: 0,
      };
      months.push(month);
    }
    month.days.push(day);
    for (const entry of day.entries) month.tally[entry.kind] += 1;
    month.total += day.entries.length;
  }
  return months;
})();

/** The day of the month and the month, as numbers, from an ISO date the checker already validated. */
export const parts = (date: string): { year: number; month: number; day: number } => ({
  year: Number.parseInt(date.slice(0, 4), 10),
  month: Number.parseInt(date.slice(5, 7), 10),
  day: Number.parseInt(date.slice(8, 10), 10),
});
