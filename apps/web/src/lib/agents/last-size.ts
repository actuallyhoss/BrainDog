/**
 * HOW MANY ROWS A CARD DREW LAST TIME, on this device, so its skeleton is drawn at that size while it reads again
 * (3 Nov, the owner: "proper skeleton loading, accurate layouts, cached"). Geometry only, never a word of the record: a count
 * per card, in one localStorage entry. Blocked storage answers nothing, and the card reads as it always did.
 *
 * The shell lane's `shape.ts` keeps every page's card sizes the same way; these cards can move to it once it lands.
 */

const KEY = 'bd.agents.sizes';
const MOST = 12;
const KEEP = 200;

function all(): Record<string, number> {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    const v: unknown = raw ? JSON.parse(raw) : {};
    return v !== null && typeof v === 'object' ? (v as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/** The rows `card` drew last time, or `null` when it has never been seen here. */
export function lastCount(card: string): number | null {
  const n = all()[card];
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 ? Math.min(n, MOST) : null;
}

/** Keeps how many rows `card` drew, for the next time it reads. */
export function keepCount(card: string, n: number): void {
  try {
    const sizes = all();
    if (sizes[card] === n) return;
    delete sizes[card];
    sizes[card] = Math.max(0, Math.min(MOST, Math.round(n)));
    /* A RUN'S PAGE KEEPS ONE A RUN, so the oldest go once there are more than a couple of hundred. */
    const keys = Object.keys(sizes);
    for (const old of keys.slice(0, Math.max(0, keys.length - KEEP))) delete sizes[old];
    globalThis.localStorage?.setItem(KEY, JSON.stringify(sizes));
  } catch {
    /* blocked storage: the next skeleton is the default size */
  }
}
