/** The changelog page's words. The entries themselves are `entries.ts`, which a script writes. */

/* Written out rather than asked of `Intl`, so the prerendered page and the hydrated one print the
   same month whatever locale the build machine or the reader's browser carries. */
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const monthName = (month: number): string => MONTHS[month - 1] ?? '';

const entries = (n: number): string => `${n} ${n === 1 ? 'entry' : 'entries'}`;

export const changelog = {
  changelog: {
    title: 'Changelog',
    lede: "What shipped and when, in the repository's own words.",
    count: (n: number, days: number) => `${entries(n)} over ${days} days`,

    /* The kind as a reader says it: the pills name it, and each entry and tally repeats it in lower
       case beside its dot, so the kind never rests on colour alone. */
    filter: { shipped: 'Shipped', fixed: 'Fixed', changed: 'Changed' },
    kind: { shipped: 'shipped', fixed: 'fixed', changed: 'changed' },
    filters: 'Show only',
    tally: (n: number, kind: string) => `${n} ${kind}`,

    /* THE CHART ON THE PAGE: every entry by the day it shipped, stacked by kind, and the one line that says what it
       shows. Every figure in it is counted from `entries.ts` when the page is built. */
    byDay: 'Entries by day',
    span: (from: string, to: string) => `${from} to ${to}`,
    chartLabel: (from: string, to: string, busiest: string, most: number) =>
      `Entries each day from ${from} to ${to}, stacked as shipped, fixed and changed. The busiest day is ${busiest}, with ${most}.`,
    reading: (busiest: string, most: number, shipped: number, fixed: number, quiet: number) =>
      `The busiest day was ${busiest}, with ${most} ${most === 1 ? 'entry' : 'entries'}` +
      (quiet > 0 ? `, and ${quiet} ${quiet === 1 ? 'day has' : 'days have'} none.` : '.') +
      ` Shipped ${shipped > fixed ? 'outnumbers' : 'trails'} fixed, ${shipped} to ${fixed}.`,
    dayEntries: (n: number) => entries(n),

    latest: 'Latest',
    /** A day heading inside its month: "25 September". */
    day: (day: number, month: number) => `${day} ${monthName(month)}`,
    /** A date that stands alone, as "Latest" and the feed's newest entry do: "25 September 2026". */
    date: (day: number, month: number, year: number) => `${day} ${monthName(month)} ${year}`,
    /** A month heading: "September 2026". */
    month: (month: number, year: number) => `${monthName(month)} ${year}`,
    entries,
    permalink: (title: string) => `Link to ${title}`,

    /* The Atom feed at FEED, prerendered from the same entries (`routes/changelog.xml/+server.ts`). */
    follow: 'Follow the feed',
    feedTitle: 'BrainDog changelog',
    feedAuthor: 'BrainDog',
  },
} as const;
