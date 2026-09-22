/**
 * The universal hooks. One of them: `reroute`.
 *
 * THE SLUG IS NOT `paths.base`, BECAUSE THE BASE IS STATIC. `brain.dog/app/acme/r/tasks` names acme, and SvelteKit is
 * handed `/app/r/tasks` to match, so the route tree stays where it is and `page.params` never carries the slug. The
 * address in the bar keeps it: `page.url` is the address as it came, and `lib/at.ts` reads the slug back from there.
 *
 * `lib/at.ts` IS LOADED, NOT IMPORTED. This file is part of Kit's entry, which has a recorded byte count
 * (`tools/gates/budgets.json`), and a static import put the whole of `at.ts` in it: measured at 675 brotli bytes over
 * a line whose noise band is 64. The root layout imports the same module, so the chunk is fetched once either way.
 *
 * RELATIVE, NOT `$lib`, so `hooks.test.ts` can load this file under `node --test` with no SvelteKit.
 */
import type { Reroute } from '@sveltejs/kit';

export const reroute: Reroute = async ({ url }) => (await import('./lib/at.ts')).rerouted(url.pathname);
