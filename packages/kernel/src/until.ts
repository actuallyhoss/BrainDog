/**
 * A WIDGET THAT LEAVES ON ITS OWN (widgets plan §7.1, Call 18): `until: 'YYYY-MM-DD'` on a block is the last day it is
 * drawn. A trip countdown leaves the day after the trip; nothing is deleted, the board just stops drawing it, and the
 * block stays in the page's body where an edit can take it away or move the day.
 *
 * The renderer holds the same rule as `stillShown` (`braindog-render` `widgets.ts`), for the reason `embed.ts` gives of
 * its providers: the kernel does not import the renderer. A rule changed is changed in both.
 */

/** A calendar day, written as the record writes days. */
const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/u;

/** Whether a string is a real calendar day (no 30 February). */
export function isDay(v: unknown): v is string {
  if (typeof v !== 'string' || !DAY.test(v)) return false;
  const t = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === v;
}

/** What is wrong with a block's `until`, in a sentence, or `null` when it has none or a real day. */
export function untilFault(block: Readonly<Record<string, unknown>>, who: string): { fix: string; at: string } | null {
  if (block.until === undefined || isDay(block.until)) return null;
  return { fix: `${who}'s until is the last day it shows, written as a day such as 2026-11-20.`, at: 'until' };
}

/** Whether a block is still drawn on `today` (`YYYY-MM-DD`): one with no `until`, or one whose last day has not passed. */
export const stillShown = (block: Readonly<Record<string, unknown>>, today: string): boolean => !isDay(block.until) || block.until >= today;
