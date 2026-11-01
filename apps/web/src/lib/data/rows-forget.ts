/**
 * DROP THE TAB'S WALKS OF A LIST WITHOUT LOADING THE WALKER (`ref-rows.ts`), as `forget-read.ts` does for the readers.
 *
 * `boot-live.ts` forgets everything a tab read on a record switch and a sign-out, and the walks are a part of it. It
 * imported `ref-rows.ts` for that one call, which put the walker and the local copy under it on Today's first load. A
 * walker that has not loaded has walked nothing, so it is called only once it has.
 */

let walker: (() => void) | null = null;

/** Called by `ref-rows.ts` as it loads: from then on its `forgetRows` is what forgetting the walks calls. */
export function forgetRowsWith(forget: () => void): void {
  walker = forget;
}

/** Drop every walk, where any were made. */
export function forgetWalks(): void {
  walker?.();
}
