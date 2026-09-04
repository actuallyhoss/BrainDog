/**
 * The browser tab, which is the only part of this app a person reads while looking at something
 * else.
 *
 * It had none. Every tab said the URL, every bookmark saved as the URL, and every history entry
 * read the same as the last one — and a screen reader announces the document title on EVERY
 * navigation, so a client-side router with no title change tells its user nothing happened. That is
 * WCAG 2.4.2 at level A, and it is the failure people notice without being able to name.
 *
 * MOST SPECIFIC FIRST. A pinned tab shows about a dozen characters and a history search matches from
 * the front, so the product name is the part that gets truncated — which is right, because the
 * reader already knows which app they are in. `Invoice 2026-041 · Obligations · BrainDog`.
 *
 * A TITLE IS STABLE FOR A PAGE. The home surface heads itself with today's date, which is correct on
 * the page and wrong in a tab: a title that changes overnight breaks the pinned tab and the history
 * entry that used to find it. Pages whose heading is a date or a count title themselves with what
 * they ARE.
 */

/** One place, because it appears seventeen times and a typo in one of them is invisible. */
export const PRODUCT = 'BrainDog';

/**
 * `titleOf('Invoice 2026-041', 'Obligations')` → `Invoice 2026-041 · Obligations · BrainDog`.
 *
 * Falsy parts drop out, so a route can pass a value it may not have without a conditional at the
 * call site. With nothing to say it is just the product, which is the right answer for a shell.
 */
export const titleOf = (...parts: (string | false | null | undefined)[]): string =>
  [...parts.filter((p): p is string => Boolean(p && p.trim())), PRODUCT].join(' · ');
