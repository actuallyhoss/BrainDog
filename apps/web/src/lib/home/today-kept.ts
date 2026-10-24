/**
 * What Today last drew, for the tab, so Today opened again draws at once and asks the record quietly behind it.
 *
 * TODAY READ EVERYTHING AGAIN ON EVERY VISIT. Its body, the desk's cards, the briefing and the board's tiles were held by
 * the component, so leaving Today threw them away and coming back drew bars for 1.7 s at 140 ms a request (the visited
 * page's target is 0.1 s), and asked the board's tiles again at the same version: fifteen requests for nothing new.
 *
 * TWO RULES, as the tab's other kept reads (`data/kept.ts`):
 * - A DRAWN PART (the body, the desk, the briefing) is kept by its question (`key`) and drawn at once on the next open;
 *   the screen always asks again behind it and the answer replaces it. Never kept: a refusal, anything older than
 *   `TODAY_KEPT_MS`, anything from before the reader's midnight, since "today" moves with the clock.
 * - A TILE (`tileOnce`) is asked once a version of the record: the same version and this tab's writes as they were
 *   answers from what was kept, and a move of either asks again.
 * `forgetToday` drops it all where the app's `forget` runs: a record switch, a sign-out.
 *
 * PURE, AND NODE LOADS IT. No rune, no `$lib`.
 */

/** How long a kept part of Today may be drawn before it is not drawn at all. */
export const TODAY_KEPT_MS = 300_000;

type Part = { key: string; at: number; value: unknown };
const parts = new Map<string, Part>();
type Tile = { version: string; at: number; value: Promise<unknown> };
const tiles = new Map<string, Tile>();

const sameDay = (a: number, b: number): boolean => new Date(a).toDateString() === new Date(b).toDateString();
const young = (at: number, now: number): boolean => now >= at && now - at < TODAY_KEPT_MS && sameDay(at, now);

/** The part `name` as it was last drawn for `key`, or `null`. */
export function keptPart<T>(name: string, key: string, now: number = Date.now()): T | null {
  const was = parts.get(name);
  return was !== undefined && was.key === key && young(was.at, now) ? (was.value as T) : null;
}

/** Keep the part `name` as drawn for `key`. */
export function keepPart(name: string, key: string, value: unknown, now: number = Date.now()): void {
  parts.set(name, { key, at: now, value });
}

/**
 * The tile `name` on the record at `base`, asked once a `version`: kept while the version is the same, else `ask`ed. A
 * tile that threw is not kept.
 */
export function tileOnce<T>(name: string, base: string, version: string, ask: () => Promise<T>, now: number = Date.now()): Promise<T> {
  const at = `${base} ${name}`;
  const was = tiles.get(at);
  if (was !== undefined && was.version === version && now >= was.at && now - was.at < TODAY_KEPT_MS) return was.value as Promise<T>;
  const value = ask();
  const entry: Tile = { version, at: now, value };
  tiles.set(at, entry);
  void value.catch(() => {
    if (tiles.get(at) === entry) tiles.delete(at);
  });
  return value;
}

/** What else is dropped with Today: a module's own hold, told once it is loaded (`today-read.ts`). */
const others = new Set<() => void>();
export function onForgetToday(fn: () => void): void {
  others.add(fn);
}

/** Drop everything Today kept. */
export function forgetToday(): void {
  parts.clear();
  tiles.clear();
  for (const fn of others) fn();
}
