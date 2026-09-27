/**
 * The words a row's page leads with: how far off its deadline is, the day a finished row finished, and how old the row
 * is, and the one word its unset fields are offered with.
 *
 * THE LEAD SAID "Open" BESIDE A RED DOT, AND "8w ago" BESIDE A DUE DATE (design.md SYS-10). The dot meant overdue while
 * the word beside it said something else, and nobody could tell whether "8w ago" was the date or the row. So the tone is
 * said in words beside its dot ("Overdue by 38 days", "Paid 2 Sep"), and the age carries its own label ("added 8w ago").
 *
 * THE TONE IS NOT DECIDED HERE. Its colour is `toneOf`'s, the list's own rule (`lib/record/api.ts`), so a row drawn late
 * in its list is drawn late on its page; this file only says in words how many days away a date is, counted in calendar
 * days as `relative()` counts them. Out of the component so `node --test` can run it, as `lead.ts` beside it is.
 */

import { day, shortDay, since } from 'braindog-render';

/** The row page's own words, kept beside the functions that say them. */
export const rowWords = {
  overdue: (days: number): string => (days === 1 ? 'Overdue by 1 day' : `Overdue by ${days} days`),
  dueToday: 'Due today',
  dueTomorrow: 'Due tomorrow',
  dueIn: (days: number): string => `Due in ${days} days`,
  added: (age: string): string => `added ${age}`,
  /* What the plus on an unset field's chip is said as, so the chip reads "Add paid on" to a screen reader. */
  add: 'Add',
} as const;

/** A stored day: the only shape the record keeps a `day` field in. */
const DAY = /^\d{4}-\d{2}-\d{2}$/u;

const DAY_MS = 86_400_000;

/** Calendar days from `now` to a stored day, negative once it has passed, or `null` for anything that is not a day. */
export function daysTo(iso: string, now: number): number | null {
  if (!DAY.test(iso)) return null;
  const at = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(at)) return null;
  return Math.floor(at / DAY_MS) - Math.floor(now / DAY_MS);
}

/** How far off a deadline is, as a person says it, or `null` for a value that is not a day. */
export function dueSaid(iso: string, now: number): string | null {
  const days = daysTo(iso, now);
  if (days === null) return null;
  if (days < 0) return rowWords.overdue(-days);
  if (days === 0) return rowWords.dueToday;
  if (days === 1) return rowWords.dueTomorrow;
  return rowWords.dueIn(days);
}

/**
 * A day as a sentence says it: "2 Sep" inside the year it is read in, "2 Sep 2025" outside it. A value that is not a
 * day comes back as it was, because a formatter never invents a date it was not given.
 */
export function daySaid(iso: string, now: number): string {
  if (!DAY.test(iso)) return iso;
  return iso.slice(0, 4) === String(new Date(now).getUTCFullYear()) ? shortDay(iso) : day(iso);
}

/** The row's age with its label, so it is never read as the date beside it. */
export const addedSaid = (created: string, now: number): string => rowWords.added(since(created, now));
