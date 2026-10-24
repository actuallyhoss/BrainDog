/**
 * Which Work is drawn at `/?work`, with no network and no runes: the declared page, or the list of tasks itself.
 *
 * WORK IS A DECLARED PAGE, `page.work` from the work module, drawn by the one reader every page goes through
 * (`$lib/page/PageView.svelte`), so the person or an agent can reshape it as they can Money. The hand-written screen it
 * replaced is gone (C32, 24 October): the page narrows by whose work it is and folds what has not moved in three months,
 * which only that screen did. `/?work&classic` is an address somebody kept, and it opens the page.
 *
 * A RECORD THAT HOLDS TASKS AND NO WORK PAGE, which the nav still opens here (`WORK` in `lib/nav.ts`), is sent to its
 * tasks list's own page (`/r/tasks`), declared from the list as every list's is, where the old screen was drawn.
 *
 * PURE, so `page.test.ts` holds each rule.
 */

/** The declared page Work draws, by its slug. */
export const WORK_PAGE = 'work';

/**
 * The Work to draw: the declared page where the record holds one, else the tasks list's own page. `pages` is every page
 * slug the reader may open, as `boot` said (`Shell.pages`).
 */
export function workView(_params: URLSearchParams, pages: readonly string[]): 'page' | 'list' {
  return pages.includes(WORK_PAGE) ? 'page' : 'list';
}
