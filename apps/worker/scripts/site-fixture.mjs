/**
 * The marketing site's config as each push of the one-domain move leaves it, built in memory for the tests.
 *
 * IN MEMORY, NOT READ FROM `apps/site/wrangler.jsonc`, BECAUSE THAT FILE CHANGES UNDER THESE TESTS ON PURPOSE. Push 1
 * binds alpha's site to alpha's app and push 3 binds production's (`loop/research-one-domain-binding.md` section 4), and
 * each lands in a commit of its own. A test that asked what the smoke step does after push 3 by reading the real file
 * would pass or fail depending on which of those commits is checked out, and the one that failed would say nothing
 * about the code under test. So the site of a push is written here once, and the tests that read the real file say so
 * in their names.
 *
 * `UNBOUND` IS THE SITE AT `afb3b1b2`, reduced to the keys `siteBinding` reads: a Custom Domain per environment, alpha's
 * own `assets` block, and no `main`, `services` or `run_worker_first` anywhere.
 */

/** The doors the site runs its script first on once it is bound: the eight of the research's section 1.1, and `/mcp/`. */
export const SITE_DOORS = ['/app', '/app/*', '/api/*', '/auth/*', '/account/*', '/mcp', '/mcp/', '/in/*', '/.well-known/braindog-build'];

export const UNBOUND = Object.freeze({
  name: 'braindog-site',
  assets: { directory: 'build', not_found_handling: '404-page' },
  env: {
    production: { routes: [{ pattern: 'brain.dog', custom_domain: true }] },
    alpha: { routes: [{ pattern: 'alpha.brain.dog', custom_domain: true }], assets: { directory: 'build-alpha', not_found_handling: '404-page' } },
  },
});

/**
 * A copy of `site` with each environment named in `bindings` handing its doors to the app script named beside it, the
 * way push 1 does for alpha: a `main`, `run_worker_first` in that environment's own `assets`, and `APP` in `services`.
 * `{ production: 'braindog-alpha' }` is the mutation the reachability test has to fail on.
 */
export function boundSite(bindings, site = UNBOUND, doors = SITE_DOORS) {
  const next = structuredClone(site);
  for (const [env, service] of Object.entries(bindings)) {
    const block = next.env[env];
    block.main = 'src/worker.ts';
    block.assets = { ...(block.assets ?? next.assets ?? {}), run_worker_first: [...doors] };
    block.services = [{ binding: 'APP', service }];
  }
  return next;
}
