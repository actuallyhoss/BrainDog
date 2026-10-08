/**
 * `GET /healthz` on the Cloud: `53 §13 #9`'s tuple, `{ app, format, kernel, primitives }`, with `ok: true` beside it,
 * from this isolate alone.
 *
 * ITS OWN FILE, AND FREE OF `cloudflare:`, for the reason `route.ts` is: `index.ts` cannot be loaded by `node --test`,
 * and a liveness answer is something a test should be able to call.
 *
 * IT TOUCHES NO DURABLE OBJECT AND READS NO CREDENTIAL. The question a monitor asks is whether this Worker answers, and
 * a probe that woke a record every minute would cost a storage read per probe and go red when one customer's object is
 * sick, which is a different question with its own answer in that record's `/api/version`. `test/healthz.test.ts`
 * hands the bundle bindings that throw on first touch, and every number below is a constant of the build.
 *
 * WHAT CHANGED, AND WHY `ok` STAYS. At 07ba6dbd this answered `{ ok: true, app }` and said, correctly, that the other
 * three keys "need a record's boot probe". They do not: `format`, `kernel` and `primitives` are what this build reads
 * and carries, the same three numbers every record's `/api/version` answers, and a build is one bundle. The record's
 * probe is what can REFUSE, which is the other half. `ok` was already being read by `deb5b703`'s tests and by the
 * self-host's answer, and taking it away to match the spec's four keys word for word would break the one reader there
 * is for no reader gained.
 *
 * AND THERE IS NO 503 HERE, BECAUSE THE CLOUD HAS NO MODULE TO REFUSE. `53 §13 #9`'s 503 `{ code }` is a self-host's
 * `SCHEMA_MISMATCH` or `SCHEMA_NEWER` (`33-CONTRACTS` Migrations row), which is one record's file against this build's
 * migrations. On the Cloud that refusal lives in one customer's object, is answered 503 by that record's own doors, and
 * cannot be seen from here without waking it. A 503 at `/healthz` for it would take the whole Worker out of a load
 * balancer for one record.
 *
 * WHERE THE SITE FRONTS THIS WORKER, `/healthz` HAS TO BE IN THE SITE'S `run_worker_first` (`apps/site/wrangler.jsonc`),
 * because the site's assets answer first and a path not on that list gets the site's 404 page and never arrives here.
 * `app.brain.dog`'s Custom Domain sends every path here.
 */

import { FORMAT_VERSION, KERNEL_MIGRATION } from '@braindog/kernel';

import type { LaunchState } from './launch.ts';

/**
 * `PRIMITIVES_VERSION` (`31 §6`, `packages/render/src/kinds.ts`), WRITTEN HERE BECAUSE THE WORKER CANNOT IMPORT IT.
 *
 * `braindog-render` is `@braindog/record`'s dependency and not this app's, pnpm's layout will not resolve an import the
 * package does not declare, and a relative path into `packages/render` is the cross-package import `graph` refuses. So
 * it is a copy, and `test/healthz.test.ts` compares it with the renderer's own on every run: the day the renderer moves,
 * that test is red and names the number. The repair is one line in `apps/worker/package.json`, which this change does
 * not own.
 */
export const PRIMITIVES = 1;

/**
 * `/healthz`, with the slashes every other door here forgives, and nothing below it.
 *
 * `(?:\/+)?` AND NOT THE SLASH-STAR SPELLING THE OTHER DOORS USE, because `test/nostore.test.ts` reads this file with its
 * comments blanked, and a slash then a star inside a regular expression opened a comment for it that ran to the end of
 * the next doc block and took the header list below with it: the 405 here was reported as built without `no-store`.
 * NAMED `HEALTHZ`, as it was in `index.ts`, because `test/site-binding.test.ts` knows the router's door by that name.
 */
export const HEALTHZ = /^\/+healthz(?:\/+)?$/;

const HEADERS: [string, string][] = [
  ['content-type', 'application/json; charset=utf-8'],
  ['cache-control', 'no-store'],
];

/**
 * The answer. `build` is `BRAINDOG_BUILD`, and an unset one is `null` and never `""`, as `/.well-known/braindog-build`
 * says it, so a monitor that sees a restart can also see which version came back.
 *
 * `launch` IS WHO MAY SIGN UP, WHETHER THE BOT CHECK RUNS AND BILLING'S MODE, with a sentence for each thing not yet as it
 * will be (`launchState` in `launch.ts`). Settings of this build, read with no object woken and no secret's value read
 * (only whether one is set), so a person checking the launch from a machine with no session can read it here.
 *
 * HEAD ANSWERS THE SAME STATUS AND HEADERS WITH NO BODY, and any other method is 405 with `Allow`, because a POST here is
 * a caller who has the wrong address.
 */
export function healthz(request: Request, build: string | undefined, launch?: LaunchState): Response {
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return new Response(JSON.stringify({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: '/healthz is read with GET or HEAD.' } }), {
      status: 405,
      headers: [...HEADERS, ['allow', 'GET, HEAD']],
    });
  const body = JSON.stringify({ ok: true, app: build || null, format: FORMAT_VERSION, kernel: KERNEL_MIGRATION, primitives: PRIMITIVES, ...(launch ? { launch } : {}) });
  return new Response(request.method === 'HEAD' ? null : body, { status: 200, headers: HEADERS });
}
