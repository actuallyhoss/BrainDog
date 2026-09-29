/**
 * How the Decide queue is grouped, read from the address and written back into it.
 *
 * IT WAS A LOCAL `$state` AND THAT WAS THE WHOLE DEFECT. Everything a screen is arranged by is a
 * query parameter, on the test *would you want to send this to somebody*, and the register list has passed it for a
 * while. `/decide` grouped by list in memory only, so the one arrangement of the queue worth sending was the one the
 * link did not carry, and a reload put it back to ranked.
 *
 * PURE, so `node --test` reads it without a browser. The screen reads `groupingOf(route.url)` as a derived value and
 * writes `groupedAddress` with `replaceState`: a grouping arranges the same queue rather than going somewhere, so Back
 * from a grouped queue goes to wherever the reader was before `/decide`, not to the queue ungrouped.
 *
 * THE PATH IS THE BROWSER'S, so it already carries `/app` and the record's slug, and the screen still hands it to
 * `at()`. That costs nothing, since `at()` gives back an address already under the app unchanged, and it is what lets
 * `at-sites.test.ts` read every `goto` in the app as going through it: the first version here did not, and that scan
 * named the line.
 */

/** The two arrangements. `none` is the queue ranked by the cost of being wrong, and it is the default. */
export type Grouping = 'none' | 'about';

/** The parameter it lives in. One word, because it is read in a link somebody pastes. */
const PARAM = 'group';

/**
 * The grouping an address asks for.
 *
 * ANYTHING BUT `about` IS THE DEFAULT, including a value a later build might write. A link that opens the queue ranked
 * is a worse link, and one that opens on an error is no link at all.
 */
export function groupingOf(url: URL): Grouping {
  return url.searchParams.get(PARAM) === 'about' ? 'about' : 'none';
}

/**
 * The same address, grouped the other way, as the path and query `goto` is handed.
 *
 * THE DEFAULT IS WRITTEN AS NO PARAMETER, so the ranked queue keeps the plain address it has always had, and the last
 * parameter going leaves the path alone rather than the bare `?` a relative `goto('?')` leaves behind. Every other
 * parameter is kept where it was.
 */
export function groupedAddress(url: URL, grouping: Grouping): string {
  const next = new URLSearchParams(url.searchParams);
  if (grouping === 'none') next.delete(PARAM);
  else next.set(PARAM, grouping);
  const query = next.toString();
  return query === '' ? url.pathname : `${url.pathname}?${query}`;
}
