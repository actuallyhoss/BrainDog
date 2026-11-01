/**
 * WHILE A BRAINDOG IS ASSEMBLING, AND ONLY THEN (1 Nov, after the onboard and motion merge): `data-assembling` on the
 * page's root is what lets `app.css` rise everything marked `data-forming` into place. The sign-up and `/start` hold it
 * for as long as they are open; Today holds it once, for the first Today after a sign-up in this tab, for a moment after
 * it draws (`ONCE_MS`), so a returning reader's project cards and Tell lines never rise in on an open, and an entry
 * added later is left to its own `in:` transition rather than animated twice.
 *
 * Plain DOM, no Svelte, so a test can hold it.
 */

const ATTR = 'data-assembling';
/** How long Today assembles for: the longest rise (320 ms) after the sixth sibling's start (5 × 40 ms), with room. */
export const ONCE_MS = 1_200;

let holders = 0;

/** Mark the page as assembling until the returned function is called, or for `ms` where it is given. */
export function assemble(ms?: number): () => void {
  if (typeof document === 'undefined') return () => {};
  holders += 1;
  document.documentElement.setAttribute(ATTR, '');
  let done = false;
  const end = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    holders = Math.max(0, holders - 1);
    if (holders === 0) document.documentElement.removeAttribute(ATTR);
  };
  const timer = ms === undefined ? undefined : setTimeout(end, ms);
  return end;
}

const TODAY_KEY = 'braindog.today.formed';

/** Whether Today has already assembled once in this tab for this BrainDog; and mark it so. */
export function todayFormedOnce(base: string): boolean {
  try {
    const s = globalThis.sessionStorage;
    if (s?.getItem(TODAY_KEY) === base) return true;
    s?.setItem(TODAY_KEY, base);
  } catch {
    /* Storage off: it assembles this once, and the next open is a reload that asks again. */
  }
  return false;
}
