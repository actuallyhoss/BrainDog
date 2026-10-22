/**
 * The Slash page folds into the palette (batch 5d): "Ask or change anything" is the one way to ask, so the
 * old address opens the palette over Today and the address is replaced so Back does not bounce.
 *
 * `?history` IS THE PAGE ITSELF, kept as the palette's history: what Slash suggested, what was asked lately and what came
 * of it. The palette's "Slash history" row opens it.
 *
 * Read in the record the address names (`at` keeps its slug), since `url` is the address as it came.
 */
import { redirect, type LoadEvent } from '@sveltejs/kit';

import { at } from '$lib/at.ts';
import { openPalette } from '$lib/palette/open.svelte.ts';

export function load({ url }: Pick<LoadEvent, 'url'>): void {
  if (url.searchParams.has('history')) return;
  openPalette();
  redirect(307, at('/', url.pathname));
}
