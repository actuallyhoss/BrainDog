/**
 * The one-segment addresses that name a screen by another word, sent on before anything draws.
 *
 * `/activity` IS WHAT THE RAIL CALLS `/audit`, so it is what a person types, and it landed here as an address that was
 * never an id: "Nothing answers", under a rail that had switched records. It goes where the word says, with its
 * filters, and the address is replaced so Back does not bounce.
 *
 * Read in the record the address names (`at` keeps its slug), since `url` is the address as it came.
 */
import { redirect, type LoadEvent } from '@sveltejs/kit';

import { at } from '$lib/at.ts';

/** Each word, and the screen it names. */
const NAMED: Readonly<Record<string, string>> = { activity: '/audit' };

export function load({ params, url }: Pick<LoadEvent, 'params' | 'url'>): void {
  const to = Object.hasOwn(NAMED, params.id ?? '') ? NAMED[params.id ?? ''] : undefined;
  if (to) redirect(307, at(`${to}${url.search}`, url.pathname));
}
