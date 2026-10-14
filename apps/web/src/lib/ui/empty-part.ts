/**
 * What one mounted `Empty` tells the screen (`Empty.svelte`'s effect, `screen.svelte.ts`'s `drew`).
 *
 * A WHOLE-SCREEN EMPTY IS THE SCREEN'S ANSWER, A COMPACT ONE IS A PART'S. Every mounted `Empty` used to count, so one
 * "Nothing matched." under a project page's money section set `data-screen="empty"` over a page that drew its name,
 * its notes and where it was seen, and the look read every project page as a page that drew nothing. A compact
 * `Empty` is one part inside a section: the screen around it has drawn, so it says nothing to the screen.
 *
 * A REFUSAL STILL COUNTS, compact or not. A part the record refused is a screen a gate must not measure as designed,
 * which is the reason `refused` is told apart from `empty` at all.
 *
 * PURE, AND NODE LOADS IT: no import, so it costs a few bytes inside the chunk `Empty` already lives in (a route's, not
 * the entry's) and nothing more.
 */

/** What the screen is told: `empty` or `refused`, or nothing at all. */
export function screenSays(kind: string, compact: boolean): 'empty' | 'refused' | null {
  if (kind === 'error') return 'refused';
  return compact ? null : 'empty';
}
