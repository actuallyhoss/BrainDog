/**
 * How long a screen took from open to its first paint, from the local copy, from memory or from the network, logged to
 * the console when `localStorage['braindog.timing']` is `1`, and silent otherwise.
 *
 * FOR MEASURING THE LOCAL COPY'S TARGETS LATER WITHOUT A CODE CHANGE: under 1 s from the network, under
 * 0.3 s from the copy, and a visited page (memory) under 0.1 s. It only logs: no hook on `window`, nothing it changes.
 *
 * PURE BUT FOR THE CLOCK AND THE STORAGE, which are read here and nowhere else, so `timing.test.ts` holds the rest.
 */

export type From = 'copy' | 'memory' | 'network';

/** The flag. Off unless set by hand in devtools: `localStorage.setItem('braindog.timing', '1')`. */
export const TIMING_FLAG = 'braindog.timing';

/** The target for each way in, in milliseconds. */
export const TARGET_MS: Readonly<Record<From, number>> = { network: 1_000, copy: 300, memory: 100 };

/** Whether the flag is on in `store`; a storage that throws is off. */
export function timingOn(store: Pick<Storage, 'getItem'> | null | undefined): boolean {
  try {
    return store?.getItem(TIMING_FLAG) === '1';
  } catch {
    return false;
  }
}

/** The line logged for one paint. */
export function timingLine(screen: string, path: string, from: From, ms: number): string {
  const over = ms > TARGET_MS[from];
  return `[timing] ${screen} ${path} from ${from}: ${Math.round(ms)} ms (${over ? 'over' : 'within'} ${TARGET_MS[from]} ms)`;
}

/**
 * Which paints are first for this open: one per screen and way in, so a re-ask or a later page is not logged as an open.
 */
export function firsts(): { first(screen: string, from: From): boolean; reset(): void } {
  let seen = new Set<string>();
  return {
    first(screen, from) {
      const k = `${screen} ${from}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    },
    reset: () => void (seen = new Set()),
  };
}

const now = (): number => globalThis.performance?.now() ?? 0;
/* THE FIRST OPEN IS THE PAGE LOAD, which `performance.now()` counts from. */
let openAt = 0;
const seen = firsts();
let on: boolean | null = null;
const enabled = (): boolean =>
  (on ??= (() => {
    try {
      return timingOn(globalThis.localStorage);
    } catch {
      return false;
    }
  })());

/** A navigation started: the next screen's paints are measured from now. */
export function timingOpened(): void {
  if (!enabled()) return;
  openAt = now();
  seen.reset();
}

/**
 * A screen drew what it got. Logged once the browser has painted it: the frame's callback runs before the paint, and a
 * task queued from it runs after.
 */
export function painted(screen: string, from: From): void {
  if (!enabled() || !seen.first(screen, from)) return;
  const since = openAt;
  const path = globalThis.location?.pathname ?? '';
  const log = () => console.info(timingLine(screen, path, from, now() - since));
  if (typeof globalThis.requestAnimationFrame === 'function') globalThis.requestAnimationFrame(() => setTimeout(log, 0));
  else setTimeout(log, 0);
}
