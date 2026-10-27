/**
 * WHAT A PAGE DRAWS WHILE THE NEXT ONE READS ("no blank flash, no spinner where a skeleton or the old content
 * can stay"). Going from one page to another set the answer to nothing and drew bars for the whole read, so every move
 * had an empty frame in it, even one that answered in a tenth of a second.
 *
 * THREE ANSWERS, NEVER NOTHING. The next page as far as it is known (its answer, or what this tab kept of it), marked
 * busy while its read is out. Else the page being left, untouched and marked busy, for up to `HOLD_MS`, so a quick read
 * goes from one page straight to the other. After that the next page's head and bars, which is what `PageView` draws
 * for no answer (`Waiting`). A read of the same page again keeps what it had, however long it takes.
 *
 * PURE AND GENERIC, so `leaving.test.ts` holds each rule without a record; `/p/[slug]` is its one caller, and nothing
 * the shell loads imports it.
 */

/** How long the page being left stays while the next one reads, before the next page's bars. */
export const HOLD_MS = 400;

/** A page as it was answered: its slug, and the answer drawn for it. */
export type Shown<T> = { slug: string; got: T };

/** The page being opened: its slug, the answer it has so far (`null` while none), and whether a read is out for it. */
export type Opening<T> = { slug: string; got: T | null; reading: boolean };

/**
 * What to draw. `got` `null` is the next page's head and bars. `slug` is the page `got` belongs to, so the page being
 * left draws as itself and never under the next page's name. `held` says it is the page being left.
 */
export type Drawn<T> = { slug: string; got: T | null; busy: boolean; held: boolean };

/**
 * What to draw while `next` reads, `elapsedMs` after it was opened, with `prev` the last page answered (`null` on the
 * tab's first page).
 */
export function leaving<T>(prev: Shown<T> | null, next: Opening<T>, elapsedMs: number): Drawn<T> {
  if (next.got !== null) return { slug: next.slug, got: next.got, busy: next.reading, held: false };
  if (prev && prev.slug === next.slug) return { slug: prev.slug, got: prev.got, busy: next.reading, held: false };
  if (prev && next.reading && elapsedMs < HOLD_MS) return { slug: prev.slug, got: prev.got, busy: true, held: true };
  return { slug: next.slug, got: null, busy: true, held: false };
}
