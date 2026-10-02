/**
 * Which Work is drawn at `/?work`, with no network and no runes: the declared page, or the screen it replaces.
 *
 * WORK IS A DECLARED PAGE NOW (DIRECTION §35), `page.work` from the work module, drawn by the one reader every page goes
 * through (`$lib/page/PageView.svelte`), so the person or an agent can reshape it as they can Money. The hand-written
 * screen it replaces is kept at `/?work&classic` (`WorkClassic.svelte`) until the page does all it did, and is drawn
 * as well on a record that holds tasks and no Work page, which the nav still opens here (`WORK` in `lib/nav.ts`).
 *
 * PURE, so `page.test.ts` holds each rule.
 */

/** The declared page Work draws, by its slug. */
export const WORK_PAGE = 'work';

/** The word in the address that asks for the screen as it was. */
export const CLASSIC = 'classic';

/**
 * The Work to draw: the declared page where the record holds one and the address does not ask for the old screen, else
 * the old screen. `pages` is every page slug the reader may open, as `boot` said (`Shell.pages`).
 */
export function workView(params: URLSearchParams, pages: readonly string[]): 'page' | 'classic' {
  return params.has(CLASSIC) || !pages.includes(WORK_PAGE) ? 'classic' : 'page';
}
