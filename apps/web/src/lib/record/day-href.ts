/**
 * Where a date said in a note opens: `{{date:2026-11-03}}` on a declared page.
 *
 * THE CALENDAR, WHERE THE RECORD HAS ONE, AND NOWHERE WHERE IT HAS NONE. The renderer asks the host where a date goes
 * and draws the plain figure for `null` (`packages/render/src/html.ts`, `dayHref`): it was once hard-coded to an
 * address nobody served, and every date was an anchor to the error page. So this answers only from what `boot` said:
 * the pages this caller may open. A record whose modules declare no Calendar page, and a caller who may not open it,
 * get no link.
 *
 * THE PAGE IS A DECLARED PAGE, so its address is a declared page's (`/p/<slug>`, as `row-href.ts` writes a row's own
 * page), with the day as `?day=`, which the page marks. Record-relative, like every address the record writes: the
 * caller's `href` puts it under the app (`$lib/at.ts`).
 */

/** The slug the Calendar page is declared under. */
export const CALENDAR_PAGE = 'calendar';

/** A page as far as this file reads it: `boot`'s page, or its slug alone as the shell keeps it (`Shell.pages`). */
export type PageSlug = string | { slug: string };

/** A day as the renderer hands it, `2026-11-03`, and only a day the calendar holds: no thirtieth of February. */
export function isDay(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(iso);
  if (m === null) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const at = new Date(Date.UTC(y, mo - 1, d));
  return at.getUTCFullYear() === y && at.getUTCMonth() === mo - 1 && at.getUTCDate() === d;
}

/**
 * The address of a day on the record's calendar, or `null` where the record's pages hold no Calendar and for words
 * that are not a day, and the renderer draws those plain.
 */
export function dayHref(pages: readonly PageSlug[] | null | undefined, iso: string): string | null {
  const day = iso.trim();
  if (!isDay(day)) return null;
  const held = (pages ?? []).some((p) => (typeof p === 'string' ? p : p.slug) === CALENDAR_PAGE);
  return held ? `/p/${CALENDAR_PAGE}?day=${day}` : null;
}
