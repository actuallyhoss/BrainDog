/**
 * The spine: the places every bar carries before any page a record declares.
 *
 * DECIDE AND INBOX APPEAR WHEN THEY HAVE BEEN USED. On a young record both were rows over nothing, places the shell
 * called essential with nothing in them, so the first thing a new person learned from the
 * rail was that it points at empty rooms. Decide shows once a question has waited or been decided, Inbox once anything
 * has arrived, and Home always. Both stay reachable by address and by `g then d` / `g then i` while they are off.
 *
 * ONE PURE FUNCTION, WHICH THE RAIL, THE TAB BAR AND THE TOP BAR ALL READ, so the three never disagree about what the
 * spine holds. Before this each bar wrote its own spine rows, and a rule written once per bar is one rule per bar.
 *
 * SLASH AND AUTOMATIONS STAY IN IT. They went up from the rail's foot, and a spine rebuilt from the counts
 * alone would put them back down. The phone's tab bar and the top bar still carry only Home, Decide and Inbox (`BAR_SPINE`),
 * as they did: a new place there is a row in More, never a fifth tab.
 *
 * ITS OWN MODULE AND PURE, so the shell's entry chunk takes nothing with it and `node --test` reads it with no SvelteKit.
 */

export type SpineKey = 'home' | 'decide' | 'inbox' | 'slash' | 'automations';

/**
 * The record's counts as `boot` sends them (`Boot['counts']`).
 *
 * `inbox` IS `null` FOR A CALLER WHO MAY NOT BE TOLD IT, and only an owner is (`packages/record/src/index.ts`, `boot`'s
 * `counts`), so a colleague is never shown an Inbox. `decided` and `arrived` are absent from a host older than them.
 */
export type SpineCounts = { decide: number; inbox: number | null; decided?: number | undefined; arrived?: number | null | undefined };

/** What the tab bar and the top bar carry of the spine; the rail carries all of it. */
export const BAR_SPINE: ReadonlySet<SpineKey> = new Set<SpineKey>(['home', 'decide', 'inbox']);

/**
 * The spine for these counts, in the order it is drawn.
 *
 * A HOST OLDER THAN `decided` AND `arrived` IS READ FROM WHAT IT DID SEND: the open questions and the arrivals waiting.
 * That under-counts use, never over-counts it, so a row appears late on an old host rather than over nothing.
 * NO COUNTS AT ALL is a shell nobody answered, and it draws Home, Slash and Automations only.
 */
export function spineOf(counts: SpineCounts | null | undefined): SpineKey[] {
  if (!counts) return ['home', 'slash', 'automations'];
  const decide = counts.decide + (counts.decided ?? 0) > 0;
  const inbox = counts.inbox !== null && (counts.arrived === undefined ? counts.inbox : (counts.arrived ?? 0)) > 0;
  return ['home', ...(decide ? (['decide'] as const) : []), ...(inbox ? (['inbox'] as const) : []), 'slash', 'automations'];
}
