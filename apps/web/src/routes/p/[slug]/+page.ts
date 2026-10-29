/**
 * THE PAGES THAT HAVE A SCREEN OF THEIR OWN, sent on before anything draws.
 *
 * `/p/activity` IS THE PAGE PEOPLE DECLARES FOR WHAT CHANGED, and Activity is one screen, `/audit`, which the rail opens.
 * Two drawings of one log read differently ("Handled decided Filed 2…" on one, sentences on the other), so the page's
 * address goes to the screen, with its filters, and the address is replaced so Back does not bounce.
 *
 * Read in the record the address names (`at` keeps its slug).
 */
import { redirect, type LoadEvent } from '@sveltejs/kit';

import { at } from '$lib/at.ts';

/**
 * Each page, and the screen it is drawn as.
 *
 * `/p/scripts` TOO: `/scripts` draws the People add-on's own `page.scripts` under a head of
 * its own, so the page's address was a second list of the same scripts, with a line in place of the count.
 */
const SCREENS: Readonly<Record<string, string>> = { activity: '/audit', scripts: '/scripts' };

export function load({ params, url }: Pick<LoadEvent, 'params' | 'url'>): void {
  const to = Object.hasOwn(SCREENS, params.slug ?? '') ? SCREENS[params.slug ?? ''] : undefined;
  if (to) redirect(307, at(`${to}${url.search}`, url.pathname));
}
