/**
 * The shared components' own words: what `Waiting` says while a screen waits on the record, and whatever a
 * component in `lib/ui` says the same way on every screen that draws it.
 *
 * AN AREA FILE OF THE COPY AGGREGATE (ARC-8). `lib/copy.ts` spreads this object into `copy`, and every screen reads a
 * key here as `copy.<key>`. The house voice is written once, at the top of `copy.ts`. A word a screen in another
 * area also draws is in `shell.ts`, so that rewording it is nobody's edit to another area's screen.
 *
 * Plain Node loads this file through the aggregate (`passkey.mjs`), so it imports only relative `.ts` files.
 */

export const design = {
  /* The one word a screen reader hears while a screen waits on the record (`Waiting.svelte`). */
  waiting: 'Loading',
} as const;
