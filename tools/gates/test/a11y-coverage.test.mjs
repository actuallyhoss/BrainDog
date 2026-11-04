/**
 * WHAT THE ACCESSIBILITY GATE COVERS, ASKED WITHOUT LAUNCHING A BROWSER.
 *
 *   node --test "tools/gates/test/*.test.mjs"
 *
 * WHY THIS IS A TEST AND NOT LEFT TO THE GATE ITSELF. `a11y.mjs` drives a browser over five builds,
 * and two full runs of it on this machine took 380s and 340s, so the question "does it look at every
 * route the app has" has always been answered by READING its source instead, and for two routes the
 * answer a reader got was wrong. `/legal` and `/404` were in `apps/site/src/routes`, in `shot.mjs`'s
 * photograph list, and in no audit: the gate's site entry was the literal
 * `['/', '/pricing', '/changelog']`. Measured against the gate before this file was written, the first
 * test below failed naming exactly those two addresses.
 *
 * AND NOBODY DELETED ANYTHING. That literal was correct on 4 September, when `29b22442` wrote it and
 * the site had three pages. `/legal` arrived on the 16th (`a3651896`) and `/404` on the 17th
 * (`cb68885b`), each in a commit that had no reason to open a gate file, and the gate's coverage
 * shrank by two fifths without one line of it changing. That is the failure mode a derivation ends and
 * a test keeps ended.
 *
 * IMPORTING THE GATE RUNS NOTHING, which is what makes the question cheap to put. Every line of
 * `a11y.mjs`'s work is inside its default-exported function, so the import opens no port, launches no
 * browser and reads no build. `surfaces()` reads two route directories off disk and returns.
 *
 * AND THE TREE IS BOTH SIDES OF THE FIRST TWO ASSERTIONS ON PURPOSE. The claim is not that the site
 * has five routes today, it is that the gate's list and the tree's cannot drift apart again, and a
 * number written into this file would have to be maintained by the same hand that forgot the list.
 */

import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { stray, surfaces } from '../a11y.mjs';
import { routesFor, routesOf } from '../routes.mjs';
import { HELD, held } from '../../../apps/site/src/lib/launch.ts';

const root = join(import.meta.dirname, '..', '..', '..');

test('every route the marketing site has is a route the gate audits', async () => {
  const { apps } = await surfaces(root);
  const site = apps.find((a) => a.name === 'site');
  const { routes } = await routesOf(join(root, 'apps', 'site'));
  const missing = routes.filter((r) => !site.routes.includes(r));
  assert.deepEqual(missing, [], `site routes in the tree and in no a11y pass: ${missing.join(', ')}`);
  /* A FLOOR AS WELL AS AN EQUALITY, because a derivation that came back empty would satisfy the line
     above and audit nothing. Five is what `apps/site/src/routes` holds and what `shot.mjs`
     photographs; a sixth route passes this and a route file deleted by accident does not. */
  assert.ok(site.routes.length >= 5, `the site has ${site.routes.length} audited route(s), and it has five pages`);
});

/* A HELD ADDRESS IS LEFT OUT AS THE SITE LEAVES IT OUT (`apps/site/src/lib/launch.ts`): while the site is not public the
   changelog answers not found and writes no file, so a pass over it waited ten seconds on nothing. Said, not dropped;
   and the day the flag flips it is audited again, which the second half holds. */
test('a site address the site holds from visitors is not audited, and is named as held', async () => {
  const { apps, held: said } = await surfaces(root);
  const site = apps.find((a) => a.name === 'site');
  const shut = held() ? [...HELD].filter((h) => !h.endsWith('.xml')) : [];
  for (const h of shut) assert.ok(!site.routes.includes(h), `${h} is held by the site and still audited`);
  /* A route under a held address is held with it: a plugin's own page and an author's while `/plugins` is (`routes.mjs`). */
  const under = held() ? ['/plugins/[id]', '/plugins/by/[who]'] : [];
  assert.ok(!site.routes.some((r) => r.startsWith('/plugins/')), 'a plugin page is audited while the plugins are held');
  assert.deepEqual([...said].sort(), [...shut, ...under].map((h) => `site: ${h}`).sort());
  const open = await routesFor(join(root, 'apps', 'site'));
  assert.deepEqual([...open.held].sort(), [...shut, ...under].sort());
});

test('every route the record app has is a route the gate audits', async () => {
  const { apps } = await surfaces(root);
  const web = apps.find((a) => a.name === 'web');
  const { routes } = await routesOf(join(root, 'apps', 'web'));
  const missing = routes.filter((r) => !web.routes.includes(r));
  assert.deepEqual(missing, [], `record routes in the tree and in no a11y pass: ${missing.join(', ')}`);
  assert.ok(web.routes.length >= 38, `the record app has ${web.routes.length} audited address(es)`);
});

test('no surface names a route its app does not have', async () => {
  const { strays } = await surfaces(root);
  assert.deepEqual(strays, []);
});

/* THE VARIANT LISTS ARE THE HOLE WEARING DIFFERENT CLOTHES, and this is the check that closes it. A
   variant names two or three routes by hand and `spa: true` serves the shell for any address at all,
   so a variant naming a route the app has since lost would have been audited as a not-found screen
   and counted as a page-run. These two cases drive `stray` directly, because seeding a dead route
   into the real surface list would mean editing the thing under test. */
test('a surface naming a route the app lost is a finding and not a quiet pass', () => {
  const derived = { web: { routes: ['/decide', '/search'] } };
  assert.deepEqual(stray([{ name: 'cloud', tree: 'web', routes: ['/decide'] }], derived), []);
  assert.match(
    stray([{ name: 'cloud', tree: 'web', routes: ['/settings/gone'] }], derived).join(''),
    /cloud names \/settings\/gone/u,
  );
});

/* A QUERY STRING IS A SECOND ADDRESS OF A ROUTE AND NOT A ROUTE, which `busy`'s `/search?q=renewal`
   is. Measured against a version of `stray` without the split, over the real derivation: it reported
   `busy names /search?q=renewal`, a route the app has. So this case is a false positive that happened
   rather than one somebody imagined. */
test('a query string is an address of a route and not a route of its own', () => {
  const derived = { web: { routes: ['/search'] } };
  assert.deepEqual(stray([{ name: 'busy', tree: 'web', routes: ['/search?q=renewal'] }], derived), []);
});
