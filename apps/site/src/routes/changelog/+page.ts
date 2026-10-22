/**
 * `/changelog`, held until the site is public (`HELD` in `launch.ts`, since W.170).
 *
 * PRERENDERED ON EVERY DAY, because the strict adapter refuses a route that is not (`svelte.config.js`). While
 * held it answers 404, so the build writes no `changelog.html` and the site's own 404 page answers the address;
 * `svelte.config.js` lets the prerender pass over a 404 on a held address and nowhere else. The entries stay in
 * `entries.ts`, so the day `LAUNCH.public` is flipped the page is drawn from the same source with nothing to restore.
 *
 * Imported by path and not through `$lib`, so a test can call `_load` under plain Node with a copy of the flags.
 */
import { error } from '@sveltejs/kit';
import { LAUNCH, held } from '../../lib/launch.ts';
import type { PageLoad } from './$types';

export const prerender = true;

/** The page's answer under these flags: nothing to add while it is shown, and not found while it is held. */
export const _load = (launch: { public: boolean }): Record<string, never> => {
  if (held(launch)) error(404, 'Not found');
  return {};
};

export const load: PageLoad = () => _load(LAUNCH);
