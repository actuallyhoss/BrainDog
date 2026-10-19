/**
 * The site Worker's only code: a request for one of the app's doors, handed to the app Worker whole.
 *
 * IT RUNS ONLY FOR THE PATHS `wrangler.jsonc` LISTS IN `run_worker_first`, AND ONLY WHERE THE SAME ENVIRONMENT BINDS
 * `APP`. Every other path is a file or the site's `404.html`, answered by the asset layer before this runs: through
 * `wrangler dev -c site -c app` on 23 September, `/pricing`, `/nope/deep/er`, a POST and a PUT to `/nope/deep/er` and a
 * POST to `/pricing` never reached this function, and every listed door did. So a 404 costs no invocation, and a miss is never a place for logic to run.
 *
 * NOTHING IS COPIED, ADDED OR REWRITTEN. The app reads its host from the URL, its CSRF check from `Origin` and its
 * session from `Cookie`, and a service binding carries the request as it arrived: the app saw the URL, method, body and
 * headers this function saw, `cf-connecting-ip` included, and its `Set-Cookie` headers and redirects came back as it sent
 * them (section 2.2). `test/forward.test.ts` holds the function to that by identity.
 *
 * THE UPTIME WATCHDOG IS NOT HERE ANY MORE: a check run by the Worker in front of brain.dog goes down with it, so it is
 * `apps/watchdog`, a Worker of its own.
 */

type Env = {
  APP: { fetch(request: Request): Promise<Response> };
};

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return env.APP.fetch(request);
  },
};
