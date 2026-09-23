/**
 * Which of the app's doors the marketing site hands to this Worker, read from `apps/site/wrangler.jsonc` and held
 * against the doors the Worker's own router answers.
 *
 * THE SITE WORKER HANDS THE APP ITS DOORS, OR `brain.dog` NEVER REACHES THE APP. With a service binding in place of zone
 * routes (`loop/research-one-domain-binding.md`), the list that decides which Worker answers a path on the site's name is
 * the site's `assets.run_worker_first`, and the thing that decides which app answers is the site's `services` entry. A
 * door the app has built and the site does not list is answered by the site's 404 page, to a webhook sender or an MCP
 * client, and nothing fails at deploy time. A path the site lists and the app has not built takes a name away from that
 * 404 page. Both were measured locally on 23 September with `wrangler dev -c site -c app`: every listed door answered the
 * app's own bytes, and `/mcp/`, `/auth` and `/account`, which the survey's list did not carry and `src/route.ts` accepts,
 * answered the site's 404 page (sections 2.1 and 2.6).
 *
 * ALPHA IS BOUND FIRST AND PRODUCTION IS NOT, AND THAT IS HELD HERE RATHER THAN HOPED FOR. Push 1 binds alpha alone, so
 * the token, the binding and a version rollback are rehearsed on `alpha.brain.dog` before `brain.dog` changes at all
 * (section 4 of the research). `BOUND` names the environments this push binds; `loop/push-3.patch` adds production to it
 * in the same diff that binds production, so a production binding that arrives any other way fails the fourth test
 * below. `wrangler deploy --dry-run --env production` measured the shape this holds: production uploads the same
 * assets-only `no-op-worker.js` it uploads today and says "No bindings found", while alpha binds `env.APP (braindog-alpha)`.
 *
 * THE DOORS ARE THE ROUTER'S OWN BRANCHES, ENUMERATED, AND NOT A SAMPLE WRITTEN HERE. This file used to hold the site to
 * a hand-written `DOORS` and to a `served` built from six `serves*` predicates, and its header said a door the router
 * gained was not seen until somebody added it to both. `/healthz` (deb5b703) is that door: `route()` in `src/index.ts`
 * answers it ahead of every predicate, nobody added it, alpha's site answered it with its 404 page, and every test here
 * stayed green (`loop/research-batch-fifty-five-audit.md` section 3). So the branches are now read off `route()` itself,
 * every call it makes on `url.pathname`, and each one must have a door below or this file fails by the branch's name.
 * Whether a path is a door is then asked of the bundled Worker, with every binding a trap: a door is any path the
 * Worker answers otherwise than with its fallback, the 404 it gives a name no branch takes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { bundled } from './bundled-worker.ts';

type Assets = { not_found_handling?: string; run_worker_first?: string[] | boolean };
type Env = { main?: string; routes?: { pattern: string; custom_domain?: boolean }[]; services?: { binding: string; service: string }[]; assets?: Assets };
type Config = { name?: string; main?: string; assets?: Assets; env?: { [name: string]: Env } };

/* THE CHECKER'S READER, BY A WIDENED DYNAMIC IMPORT. A static import of the `.mjs` is TS7016 under `strict`, because it
   has no declaration beside it and this program has no `allowJs`; and a second comment scanner that disagrees with the
   checker about one comment is how a test goes green on a file the checker cannot parse. */
const checker = '../scripts/provision-check.mjs' as string;
const { stripJsonc } = (await import(checker)) as { stripJsonc: (text: string) => string };
const read = (path: string): Config => JSON.parse(stripJsonc(readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8'))) as Config;

const site = read('../../site/wrangler.jsonc');
const ENVIRONMENTS = ['production', 'alpha'] as const;
const BOUND: readonly string[] = ['alpha'];

/* EVERY BRANCH `route()` TAKES ON THE PATH, READ FROM ITS SOURCE. The function runs to the first line that is a lone
   closing brace, which is how the file writes the end of a top-level function, and a line may end in `\r\n`: an
   editor on this machine saved `index.ts` that way on 23 September, and a pattern of bare `\n` then found no `route()`
   at all and failed on it, which is the right failure but the wrong reason. What counts as a branch is a call on
   `url.pathname`, a predicate (`servesMcp(url.pathname)`) or a pattern (`HEALTHZ.test(url.pathname)`); `servesApi(app.rest)`
   is the `/app` branch's own second question and is not one. Measured: a line `if (servesHooks(url.pathname)) ...` put
   into `route()` failed the first test below with "src/index.ts's route() asks servesHooks(url.pathname), and this file
   has no door for it".

   AND A PATH READ ANY OTHER WAY IS REFUSED, NOT SKIPPED. Measured by the checker on 23 September: a line
   `if (url.pathname.startsWith('/hooks/')) return buildId(env);` put into `route()`, and another with
   `url.pathname === '/status'`, left all five tests green, because neither is a call on the path and so neither was a
   branch here. `BARE` is every line of `route()` that still names `url.pathname` once its calls are taken out, and the
   first test fails on the first of them, so a branch in another shape is written as a predicate or given a door here. */
const index = readFileSync(fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'utf8');
const routeSource = /\nasync function route\([^]*?\n\}\r?\n/.exec(index)?.[0] ?? '';
const CALL = /([A-Za-z_$][\w$]*(?:\.test)?)\(url\.pathname\)/g;
const ASKED = [...new Set([...routeSource.matchAll(CALL)].map((m) => m[1] ?? ''))];
const BARE = routeSource.replace(CALL, '').match(/[^\n]*url\.pathname[^\n]*/g) ?? [];

/* THE DOORS, ONE OR MORE SAMPLE PATHS PER BRANCH OF `route()`. `/mcp/` is here because an MCP client configured with the
   slash reached the site's 404 page in the survey (section 2.6), while `servesMcp` accepts it. `/healthz/` is not, as the
   bare `/auth` is not: the router forgives it, and nobody was measured asking it. `/a`, `/s` and `/ws` have no branch
   because they are not built, and the site keeps its 404 page for them. The vault's doors are under `/api/`, so the
   site's `/api/*` carries them. */
const DOOR_OF: { [asked: string]: string[] } = {
  'HEALTHZ.test': ['/healthz'],
  servesBuild: ['/.well-known/braindog-build'],
  servesAuth: ['/auth/methods'],
  servesAccount: ['/account/usage'],
  servesMcp: ['/mcp', '/mcp/'],
  servesIn: ['/in/abc'],
  servesVault: ['/api/vault/deposit'],
  appPath: ['/app', '/app/', '/app/acme/r/tasks', '/app/acme/api/boot'],
  servesApi: ['/api/boot'],
};

/* AND THE APP'S OWN FILES UNDER `/app`, which the app's assets answer before its script (`!/app/_app/*` in
   `apps/worker/wrangler.jsonc`), so the router's fallback is what the bundle says for them and they are still the app's. */
const APP_FILES = ['/app/_app/version.json'];
const DOORS = [...Object.values(DOOR_OF).flat(), ...APP_FILES];

/* THE WORKER AS IT SHIPS, ASKED WITH EVERY BINDING A TRAP. A branch that opens the Directory, a record or the assets
   throws on first touch, and the Worker's own catch answers that with a 500, which is not the fallback, so reaching a
   binding counts as reaching a door. `console.error` is quiet while it answers, because that catch logs every trap. */
const { default: app } = await bundled();
const trap = new Proxy({}, { get: () => { throw new Error('a door was reached'); } });
const answerOf = async (path: string): Promise<string> => {
  const env = { PUBLIC_HOST: 'brain.example.test', BRAINDOG_BUILD: '', RECORD: trap, DIRECTORY: trap, INGRESS: trap, ASSETS: trap };
  const loud = console.error;
  console.error = () => {};
  try {
    const out = await app.fetch(new Request(`https://brain.example.test${path}`), env, { waitUntil: () => {} });
    return `${out.status} ${await out.text()}`;
  } finally {
    console.error = loud;
  }
};
const FALLBACK = await answerOf('/no-branch-of-the-router-takes-this');
const isDoor = async (path: string): Promise<boolean> => (await answerOf(path)) !== FALLBACK;

/* `/app` AND EVERYTHING UNDER IT IS THE APP BY DEFINITION, its pages, its API and its files; everything else is the app's
   only when the router answers it. */
const served = async (path: string): Promise<boolean> => /^\/app(?:\/|$)/.test(path) || (await isDoor(path));

/* A STAR ENTRY IS SAMPLED WITH TWO TAILS, ONE A DOOR NAME AND ONE NOT, so `/.well-known/*` fails on `boot` while
   `/api/*` passes on it. Measured: widening the build id to `/.well-known/*` failed the third test with "the site
   forwards /.well-known/boot, which the app has not built". */
const TAILS = ['boot', 'braindog-build'];
const samples = (pattern: string): string[] => (pattern.endsWith('*') ? TAILS.map((tail) => pattern.slice(0, -1) + tail) : [pattern]);
const workerFirst = (entries: string[], path: string): boolean => {
  const glob = (p: string): boolean => (p.endsWith('*') ? path.startsWith(p.slice(0, -1)) : path === p);
  if (entries.some((e) => e.startsWith('!') && glob(e.slice(1)))) return false;
  return entries.some((e) => !e.startsWith('!') && glob(e));
};

/* AN `assets` KEY IN AN ENVIRONMENT REPLACES THE TOP-LEVEL ONE WHOLE, and `main` is inherited, so both are read the way
   wrangler resolves them rather than from one level. */
const assetsOf = (name: string): Assets | undefined => site.env?.[name]?.assets ?? site.assets;
const mainOf = (name: string): string | undefined => site.env?.[name]?.main ?? site.main;
const siteFirst = (name: string): string[] => {
  const list = assetsOf(name)?.run_worker_first;
  return Array.isArray(list) ? list : [];
};

test('every branch the router takes on a path has a door here, and each door is answered by that branch', async () => {
  /* NOT EMPTY, OR A RENAMED `url` OR A MOVED `route()` WOULD READ AS A ROUTER WITH NO BRANCHES AND PASS EVERYTHING. The
     stale half below also fails then, on every key of `DOOR_OF`. */
  assert.ok(routeSource.length > 0, 'src/index.ts has no `async function route(`, so this file reads no branches');
  assert.equal(BARE[0]?.trim(), undefined, "src/index.ts's route() reads url.pathname outside a call, so this file cannot tell which door that branch is");
  for (const asked of ASKED) assert.ok(asked in DOOR_OF, `src/index.ts's route() asks ${asked}(url.pathname), and this file has no door for it`);
  for (const asked of Object.keys(DOOR_OF)) assert.ok(ASKED.includes(asked), `route() no longer asks ${asked}(url.pathname), so its doors here are a guess`);
  for (const [asked, doors] of Object.entries(DOOR_OF))
    for (const door of doors) assert.ok(await isDoor(door), `${door}, the door written for ${asked}, got the router's fallback: ${FALLBACK.slice(0, 80)}`);
});

test('each bound environment of the site has a script and names the app script of its own environment', () => {
  for (const name of BOUND) {
    assert.equal(typeof mainOf(name), 'string', `${name}: the site has no main, so nothing can forward a door to the app`);
    const bound = (site.env?.[name]?.services ?? []).find((s) => s.binding === 'APP');
    assert.equal(bound?.service, `braindog-${name}`, `${name}: the site's APP binding names ${bound?.service ?? 'nothing'}`);
  }
});

test('every door the app has built is worker-first on the site, in every bound environment', async () => {
  for (const door of DOORS) assert.ok(await served(door), `${door} is not a door the app serves; the sample list is wrong`);
  for (const name of BOUND)
    for (const door of DOORS) assert.ok(workerFirst(siteFirst(name), door), `${name}: ${door} is the app's and the site answers it with its 404 page`);
});

test('the site hands the app nothing the app has not built, and keeps its own pages', async () => {
  for (const name of ENVIRONMENTS) {
    const first = siteFirst(name);
    for (const entry of first.filter((e) => !e.startsWith('!')))
      for (const path of samples(entry)) assert.ok(await served(path), `${name}: the site forwards ${path}, which the app has not built`);
    for (const page of ['/', '/pricing', '/changelog', '/a', '/ws', '/s/x', '/signin', '/.well-known/security.txt', '/nope/deep'])
      assert.ok(!workerFirst(first, page), `${name}: ${page} is the site's and would be forwarded`);
    assert.equal(assetsOf(name)?.not_found_handling, '404-page', `${name}: a miss must stay the site's 404 page`);
  }
  const [first, ...rest] = BOUND;
  for (const name of rest) assert.deepEqual(siteFirst(name), siteFirst(first ?? name), `${name} forwards other paths than ${first}, so one rehearses nothing for the other`);
});

test('an environment this push does not bind has no script, no binding and no worker-first list', () => {
  for (const name of ENVIRONMENTS.filter((e) => !BOUND.includes(e))) {
    assert.equal(mainOf(name), undefined, `${name}: the site has a main in a push that does not bind ${name}`);
    assert.deepEqual(site.env?.[name]?.services ?? [], [], `${name}: the site binds an app in a push that does not bind ${name}`);
    assert.equal(assetsOf(name)?.run_worker_first, undefined, `${name}: the site sends paths to a script in a push that does not bind ${name}`);
  }
});
