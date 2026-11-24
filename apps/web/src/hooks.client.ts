/**
 * The client hooks. One of them: `handleError`, the router's error path.
 *
 * A FILE OF THE APP'S OWN CODE THAT DID NOT ARRIVE IS MARKED `chunk` (`lib/data/chunk-fail.ts`), so `+error.svelte`
 * reloads onto it once rather than draw a failure the module map would keep. Anything else is said in the console as
 * SvelteKit's own handler said it.
 *
 * `chunk-fail.ts` IS LOADED, NOT IMPORTED, as `hooks.ts` loads `at.ts`: this file is part of Kit's entry, which has a
 * recorded byte count (`tools/gates/budgets.json`). The root layout imports the same module, so it is fetched once. If
 * it cannot be fetched either, the error is said and handed on unmarked.
 */
import type { HandleClientError } from '@sveltejs/kit';

export const handleError: HandleClientError = ({ error, message }) =>
  import('./lib/data/chunk-fail.ts').then(
    (m) => m.handled(error, message),
    () => (console.error(error), { message }),
  );
