/**
 * Slash's cap as Today's quiet line and the palette read it: whether the month's asks are metered, near or at the cap,
 * and the day the count resets, in words. The rest of Slash's row is `slash-asks.ts`'s, which re-exports these, so
 * Today's first load does not carry the Settings and `/usage` words beside them.
 */

import type { SlashStatus } from '@braindog/client';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/* ONLY THE INCLUDED MODEL IS METERED. `23 §8` says the meter "disappears entirely" on `byo`, the operator's endpoint, and
   on his own key the host answers `capped: false`. The package still answers `asks` on every tier, so `{ used: 0, cap: 80 }`
   arrives on a `byo` host and a row drawn from it would read `0 of 80`: a limit that nothing enforces, stated as a fact.
   The first version of `asksShown` below did exactly that, and the test that says `null` failed on `'0 of 80'`. A host a
   release behind says no `capped`, and there tier `a` alone is metered, as it always was. */
export const metered = (s: SlashStatus): boolean => (s.asks.capped === undefined ? s.tier === 'a' : s.asks.capped && s.tier !== 'byo');

/** On his own key: the count is his to see, and nothing stops at it. */
export const listed = (s: SlashStatus): boolean => s.asks.capped === false && (s.source === 'key' || s.tier === 'b');

/** The palette's one footer line, once a month (`23 §8`, 80 %). Settings draws nothing at this point. */
export const nearCap = (s: SlashStatus): boolean => metered(s) && s.asks.used >= s.asks.cap * 0.8;

/** The `warn` chip on the Settings row. A cap of zero is at the cap before the first ask, which is what zero means. */
export const atCap = (s: SlashStatus): boolean => metered(s) && s.asks.used >= s.asks.cap;

/* THE RESET IS MIDNIGHT UTC ON THE FIRST (`monthOf` in `packages/slash/src/call.ts` builds it with `Date.UTC`), so the day is
   read off the string and not through `new Date(...)`: in any zone west of Greenwich a local date says the last day of the
   month before, a day early for a count that resets on the first. */
/** `2026-10-01T00:00:00.000Z` as a person says it: 1 October 2026. Anything else is shown as it came. */
export const resetsWords = (resets: string): string => {
  const day = /^(\d{4})-(\d{2})-(\d{2})/u.exec(resets);
  return day ? `${Number(day[3])} ${MONTHS[Number(day[2]) - 1]} ${day[1]}` : resets;
};
