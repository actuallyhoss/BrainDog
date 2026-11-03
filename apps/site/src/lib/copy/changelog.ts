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
    lede: 'What shipped, day by day.',
    count: (n: number, days: number) => `${entries(n)} over ${days} days`,

    /* THE KIND IS A WORD AND A SHAPE, NEVER A HUE: the control and each entry's tag name it beside its own
       glyph, and a month's tally says it in lower case. */
    filter: { shipped: 'Shipped', fixed: 'Fixed', changed: 'Changed' },
    kind: { shipped: 'shipped', fixed: 'fixed', changed: 'changed' },
    all: 'All',
    filters: 'Show',
    tally: (n: number, kind: string) => `${n} ${kind}`,

    /* THE CHART ON THE PAGE: how many entries each day holds, in one ink, and the one line that says what it shows.
       Every figure in it is counted from `entries.ts` when the page is built. */
    byDay: 'Entries by day',
    span: (from: string, to: string) => `${from} to ${to}`,
    chartLabel: (from: string, to: string, busiest: string, most: number) =>
      `Entries each day from ${from} to ${to}. The busiest day is ${busiest}, with ${most}.`,
    reading: (busiest: string, most: number, shipped: number, fixed: number, quiet: number) =>
      `The busiest day was ${busiest}, with ${most} ${most === 1 ? 'entry' : 'entries'}` +
      (quiet > 0 ? `, and ${quiet} ${quiet === 1 ? 'day has' : 'days have'} none.` : '.') +
      ` Shipped ${shipped > fixed ? 'outnumbers' : 'trails'} fixed, ${shipped} to ${fixed}.`,
    dayEntries: (n: number) => entries(n),

    /* The newest day's mark, beside its date inside its month. */
    latest: 'Latest',
    /** A day heading inside its month: "25 September". */
    day: (day: number, month: number) => `${day} ${monthName(month)}`,
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
