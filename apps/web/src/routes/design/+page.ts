/**
 * The design book is a developer showcase, not the product: its samples ("Your plan lapsed") are made up, so a built
 * app sends anyone who reaches the address to Settings before anything is drawn, and the address is replaced so Back
 * does not bounce. It was sent there from the page once drawn, and the moment between was a page with no heading.
 *
 * Read in the record the address names (`at` keeps its slug), since `url` is the address as it came.
 */
import { redirect, type LoadEvent } from '@sveltejs/kit';

import { at } from '$lib/at.ts';

export function load({ url }: Pick<LoadEvent, 'url'>): void {
  if (!import.meta.env.DEV) redirect(307, at('/settings', url.pathname));
}
