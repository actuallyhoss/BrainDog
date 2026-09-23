/**
 * Which of the app's doors the marketing site hands to this Worker, read from `apps/site/wrangler.jsonc` and held
 * against the doors `src/route.ts` says are built.
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
 * "BUILT" IS READ FROM `src/route.ts`, AND THE SAMPLE DOORS ARE WRITTEN HERE. Each `serves*` predicate is the Worker's
 * own answer to "is this path mine", so a site entry the router does not serve fails this file, and so does a `DOORS`
 * entry the router has stopped serving. A door the router gains is not seen until it is added to `served` and to `DOORS`
 * below: measured on 23 September, a `served` that also accepted `/hooks/*` left every test here green on a site that
 * does not list it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { servesAccount, servesApi, servesAuth, servesBuild, servesIn, servesMcp } from '../src/route.ts';

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

const served = (path: string): boolean =>
  /^\/app(?:\/|$)/.test(path) || servesApi(path) || servesAuth(path) || servesAccount(path) || servesMcp(path) || servesIn(path) || servesBuild(path);

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

/* THE DOORS THE APP HAS BUILT, one sample path each, with the shell. `/mcp/` is here because an MCP client configured
   with the slash reached the site's 404 page in the survey (section 2.6), while `servesMcp` accepts it. `/a`, `/s` and
   `/ws` are left out because they are not built, and the site keeps its 404 page for them. */
const DOORS = ['/app', '/app/', '/app/acme/r/tasks', '/app/acme/api/boot', '/app/_app/version.json', '/api/boot', '/auth/methods', '/account/usage', '/mcp', '/mcp/', '/in/abc', '/.well-known/braindog-build'];

test('each bound environment of the site has a script and names the app script of its own environment', () => {
  for (const name of BOUND) {
    assert.equal(typeof mainOf(name), 'string', `${name}: the site has no main, so nothing can forward a door to the app`);
    const bound = (site.env?.[name]?.services ?? []).find((s) => s.binding === 'APP');
    assert.equal(bound?.service, `braindog-${name}`, `${name}: the site's APP binding names ${bound?.service ?? 'nothing'}`);
  }
});

test('every door the app has built is worker-first on the site, in every bound environment', () => {
  for (const door of DOORS) assert.ok(served(door), `${door} is not a door the app serves; the sample list is wrong`);
  for (const name of BOUND)
    for (const door of DOORS) assert.ok(workerFirst(siteFirst(name), door), `${name}: ${door} is the app's and the site answers it with its 404 page`);
});

test('the site hands the app nothing the app has not built, and keeps its own pages', () => {
  for (const name of ENVIRONMENTS) {
    const first = siteFirst(name);
    for (const entry of first.filter((e) => !e.startsWith('!'))) {
      const unbuilt = samples(entry).find((p) => !served(p));
      assert.equal(unbuilt, undefined, `${name}: the site forwards ${unbuilt}, which the app has not built`);
    }
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
