/**
 * Reads a part of a screen makes once it mounts, asked as soon as the screen knows it will draw that part (speed-e SE3).
 *
 * WHY. Who is working now, the page's suggestion and Money's chips each read the record after their part had drawn,
 * and the page had drawn after its own reads: on a cold phone over Slow 4G each step is a round trip of half a second
 * or more, so those parts filled in about a second after the screen. The page's early answer (`app.html`) says which
 * of them it will draw seconds before they mount, so the read is asked then, held here, and taken by the part.
 *
 * TAKEN ONCE, AND ONLY FRESH. A part reads again on its own after the first (a clock, a change, a press), and that read
 * is its own: an answer held here is handed once, and not at all once it is older than `EARLY_FRESH_MS`. Keyed with
 * the record's address, so one record's answer is never another's. A read that fails is no answer, and the part asks.
 *
 * ASKED AHEAD, SAID TO THE CLIENT (`createClient({ ahead: true })`). Each `read` here makes its calls through a client
 * made with `ahead`, so the frame's rest (`ui/screen.svelte.ts` `rested`) does not wait for them: they are on the wire
 * before the part mounts, and nothing the rest holds back could go in front of them. The quiet mark still counts them.
 *
 * PURE ENOUGH FOR NODE: no rune, no `$lib`.
 */

/** How long an answer asked ahead is still the part's first. */
export const EARLY_FRESH_MS = 15_000;

const held = new Map<string, { at: number; answer: Promise<unknown> }>();

const fresh = (at: number): boolean => Date.now() - at < EARLY_FRESH_MS;

/** Ask `read` now under `key`, unless a fresh answer for it is already on its way. */
export function askEarly(key: string, read: () => Promise<unknown>): void {
  const was = held.get(key);
  if (was && fresh(was.at)) return;
  let answer: Promise<unknown>;
  try {
    answer = read().catch(() => null);
  } catch {
    return;
  }
  held.set(key, { at: Date.now(), answer });
}

/** Whether a fresh answer is held under `key`, for a part deciding whether to read at once. */
export function heldEarly(key: string): boolean {
  const was = held.get(key);
  return was !== undefined && fresh(was.at);
}

/** The answer asked ahead under `key`, handed once while fresh: `null` when the part should read now. */
export function takeEarly<T>(key: string): Promise<T | null> | null {
  const was = held.get(key);
  held.delete(key);
  return was && fresh(was.at) ? (was.answer as Promise<T | null>) : null;
}
