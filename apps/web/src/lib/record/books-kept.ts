/**
 * Whether a line of the log is a run keeping its own books.
 *
 * A RUN WRITES ON ITS OWN ROW AS IT WORKS: its state, its heartbeat, what it reported about itself. Those lines are
 * signed `system` or with the run's own handle (`S42` on run 42, see `actor` in `names.ts`), and a reader of what
 * changed lately would otherwise fill with six of them for every agent that opened. A person who edits that same run,
 * or an agent who writes on any other list, changed something, and is kept.
 *
 * PURE, so the palette imports it without the client.
 */

/**
 * THE KERNEL'S `SESSION` AND `SESSION_PREFIX` (`session.ts`), HELD HERE AS LITERALS because this app does not load the
 * kernel at run time, and kept equal to it by `books-kept.test.ts`.
 */
export const RUNS = 'session';
export const RUN_PREFIX = 'S';

/** The keys of a log line read here. A line with no `actor` is not known to be the run's own, so it is kept. */
export type Booked = { register: string | null; seq: number | null; actor?: string };

/** True for a line on the list of runs signed by the record or by the very run it is about. */
export function bookKept(e: Booked): boolean {
  if (e.register !== RUNS || e.seq === null || e.actor === undefined) return false;
  const by = e.actor.trim();
  return by === 'system' || by === `${RUN_PREFIX}${e.seq}`;
}
