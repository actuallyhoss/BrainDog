/**
 * `/add` goes Home with the palette open on what was shared (E45 of the 24 October scope).
 *
 * IN THE LOAD, AND NOT IN AN EFFECT OF THE PAGE. The page's effect called `goto` while the app was still starting, when
 * SvelteKit has not yet marked a move as under way (`navigating` stays empty until the router has started), so the
 * shell's own reread of a boot drawn from the kept copy (`invalidate('braindog:boot')`, `+layout.svelte`) could start
 * in the middle of it and cancel it: WebKit stayed on an empty `/add` with the palette open over nothing. A redirect
 * from the load is part of the opening itself, so the app opens at Home and nothing can come between.
 */
import { redirect, type LoadEvent } from '@sveltejs/kit';

import { at } from '$lib/at.ts';
import { openPaletteWith } from '$lib/palette/open.svelte.ts';

import { sharedSeed } from './seed.ts';

export function load({ url }: Pick<LoadEvent, 'url'>): void {
  openPaletteWith(sharedSeed(url.searchParams));
  redirect(307, at('/', url.pathname));
}
