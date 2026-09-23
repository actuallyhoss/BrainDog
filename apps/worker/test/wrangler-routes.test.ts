/**
 * Which names and paths reach this Worker, in the file as it deploys next and in the two pushes after it, held against
 * the doors the Worker has built.
 *
 * THE MOVE TO ONE DOMAIN GOES OUT IN THREE PUSHES, AND THIS FILE HOLDS ALL THREE (`loop/research-one-domain-cutover.md`
 * sections 2 and 5). Push A is `wrangler.jsonc` as it stands: the app under `/app`, the Worker still on `app.brain.dog`
 * alone, no zone route. Push A2 adds the zone routes on `brain.dog` with the vars unchanged, and push B changes the two
 * vars that move the app. A2 and B live as JSON in the comment at the top of `wrangler.jsonc`, and `pushes` in
 * `scripts/provision-check.mjs` applies them, so a fragment that stops parsing or stops routing a door fails here, on a
 * laptop, rather than on the morning of the push.
 *
 * WHY A IS SEPARATE FROM A2: `wrangler deploy` uploads the version, which is live at once, and only then writes the
 * routes, and the deploy token may not hold Zone > Workers Routes > Edit on `brain.dog`, which only the owner can grant.
 * So the push that needs that permission changes nothing else, and if it fails the Worker already serving is A's.
 *
 * TWO WORKERS ANSWER ONE HOSTNAME ONCE A2 LANDS, AND THE ROUTE LIST IS THE ONLY THING THAT DECIDES WHICH. The marketing
 * site holds `brain.dog` as its Custom Domain and answers everything; this Worker takes a handful of zone routes on the
 * same name, and Cloudflare runs a route before a Custom Domain on the same hostname: "Routes can `fetch()` Custom
 * Domains and take precedence if configured on the same hostname"
 * (developers.cloudflare.com/workers/configuration/routing/routes, read 23 September). So a door listed in
 * `run_worker_first` with no zone route beside it is a door the site answers, with its 404 page, to a webhook sender or
 * an MCP client. Nothing fails at deploy time; the first sign is a bank that stops resending.
 *
 * AND THE OTHER DIRECTION MATTERS AS MUCH. A zone route for a door the Worker has not built takes a path away from the
 * site's honest 404 and hands it to `ROUTE_UNKNOWN`, which is also true, but it spends one of the site's names on
 * nothing. `/a`, `/s` and `/ws` are in `run_worker_first` and unbuilt, and the design leaves them unrouted until the day
 * they are built.
 *
 * "BUILT" IS READ FROM `src/route.ts`, NOT WRITTEN HERE. Each `serves*` predicate there is the Worker's own answer to "is
 * this path mine", so a door added to the router and to `run_worker_first` without a route fails this file, and nobody
 * has to remember a third list.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { servesAccount, servesApi, servesAuth, servesBuild, servesIn, servesMcp } from '../src/route.ts';

type Route = { pattern: string; custom_domain?: boolean; zone_name?: string; zone_id?: string };
type Env = {
  routes?: Route[];
  vars?: { [name: string]: string };
  assets?: { not_found_handling?: string; run_worker_first?: string[] };
};
type Config = { assets?: Env['assets']; env?: { [name: string]: Env } };
type Push = { name: string; config: Config; change: { [env: string]: Env } | null };

/**
 * `stripJsonc` and `pushes` from `scripts/provision-check.mjs`, so the test, the checker and the smoke step read the file
 * and its staged pushes the same way.
 *
 * A DYNAMIC IMPORT WITH A WIDENED SPECIFIER, BECAUSE A STATIC ONE DOES NOT TYPECHECK. The script is plain JavaScript with
 * no declaration beside it and this program has no `allowJs`, so `import { stripJsonc } from
 * '../scripts/provision-check.mjs'` is TS7016 under `strict`. Measured with `tsc --noEmit -p tsconfig.test.json` on 23
 * September: "Could not find a declaration file for module", and the implicit `any` it names. The alternative was a
 * fourth copy of the comment-stripping scanner (`alarm.test.ts` holds a third), and a second reader that disagrees with
 * the checker about one comment is exactly how a test goes green on a file the checker cannot parse.
 */
const checker = '../scripts/provision-check.mjs' as string;
const { stripJsonc, pushes } = (await import(checker)) as { stripJsonc: (text: string) => string; pushes: () => Push[] };

const read = (path: string): Config => JSON.parse(stripJsonc(readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8'))) as Config;

const worker = read('../wrangler.jsonc');
const site = read('../../site/wrangler.jsonc');
const ENVIRONMENTS = ['production', 'alpha'] as const;
const PUSHES = pushes();
const pushNamed = (name: string): Push => {
  const found = PUSHES.find((p) => p.name === name);
  assert.ok(found, `no push ${name} in wrangler.jsonc; the file offers ${PUSHES.map((p) => p.name).join(', ')}`);
  return found;
};

const envOf = (config: Config, name: string): Env => {
  const block = config.env?.[name];
  assert.ok(block, `no env.${name} block`);
  return block;
};

/**
 * Whether the Worker answers a path itself.
 *
 * `/app` AND EVERYTHING UNDER IT IS THE APP, AND THE APP IS THIS WORKER'S BY DEFINITION. `appPath` in `src/route.ts`
 * answers `null` for `/app/_app/*`, which is a file and still the app's, so it is the wrong predicate here: this question
 * is "does a request here belong to this Worker", not "is it a navigation".
 */
const served = (path: string): boolean =>
  /^\/app(?:\/|$)/.test(path) || servesApi(path) || servesAuth(path) || servesAccount(path) || servesMcp(path) || servesIn(path) || servesBuild(path);

/**
 * The paths a `run_worker_first` entry stands for, with its star filled in.
 *
 * TWO TAILS, AND THE SECOND ONE IS THERE FOR ONE DOOR. `/.well-known/*` is worker-first as a whole, but the Worker
 * answers exactly one name under it (`servesBuild`), so `boot` alone would read the entry as unbuilt and the build route
 * would go unchecked. `boot` is an ordinary `/api` method.
 */
const TAILS = ['boot', 'braindog-build'];
const samples = (pattern: string): string[] => (pattern.endsWith('*') ? TAILS.map((tail) => pattern.slice(0, -1) + tail) : [pattern]);

/**
 * Cloudflare's own route matching, as far as these patterns use it.
 *
 * A trailing star is a prefix and anything else is exact, which is the whole of the grammar: "Route patterns may not
 * contain infix wildcards or query parameters" (the routes page above). A Custom Domain matches every path on its host,
 * "Other parts (path, query parameters) of the URL are not considered"
 * (developers.cloudflare.com/workers/configuration/routing/custom-domains).
 */
const hostOf = (route: Route): string => {
  const slash = route.pattern.indexOf('/');
  return (slash === -1 ? route.pattern : route.pattern.slice(0, slash)).toLowerCase();
};
const routes = (route: Route, host: string, path: string): boolean => {
  if (hostOf(route) !== host.toLowerCase()) return false;
  if (route.custom_domain) return true;
  const slash = route.pattern.indexOf('/');
  const want = slash === -1 ? '/' : route.pattern.slice(slash);
  return want.endsWith('*') ? path.startsWith(want.slice(0, -1)) : path === want;
};

/** `run_worker_first`'s glob, with negatives winning: "Negative patterns have precedence over non-negative patterns". */
const workerFirst = (entries: string[], path: string): boolean => {
  const glob = (p: string): boolean => (p.endsWith('*') ? path.startsWith(p.slice(0, -1)) : path === p);
  if (entries.some((e) => e.startsWith('!') && glob(e.slice(1)))) return false;
  return entries.some((e) => !e.startsWith('!') && glob(e));
};

/**
 * The `assets` an environment deploys with. INHERITABLE, AND REPLACED RATHER THAN MERGED: production has no block of its
 * own and deploys the top-level one, alpha declares its own for `build-alpha`. The first draft of this file read
 * `env.production.assets` and found an empty `run_worker_first`.
 */
const assetsOf = (config: Config, name: string): NonNullable<Env['assets']> => envOf(config, name).assets ?? config.assets ?? {};

const zoneRoutes = (block: Env): Route[] => (block.routes ?? []).filter((r) => !r.custom_domain);
const hostsOf = (value: string | undefined): string[] => (value ?? '').split(/[\s,]+/).filter((h) => h.length > 0);
const siteHostsOf = (name: string): string[] => (envOf(site, name).routes ?? []).filter((r) => r.custom_domain).map((r) => r.pattern);

test('THE FILE IS PUSH A: the Worker on its own name as a Custom Domain, no zone route, and the passkey already under the parent', () => {
  assert.deepEqual(PUSHES.map((p) => p.name), ['A', 'A2', 'B']);
  assert.deepEqual(pushNamed('A').config, worker, 'push A is not the file as it deploys');
  const expected = {
    production: { host: 'app.brain.dog', rp: 'brain.dog' },
    alpha: { host: 'app.alpha.brain.dog', rp: 'alpha.brain.dog' },
  };
  for (const name of ENVIRONMENTS) {
    const block = envOf(worker, name);
    const host = block.vars?.PUBLIC_HOST ?? '';
    assert.equal(host, expected[name].host, `${name}: PUBLIC_HOST`);
    /* THE WORKER HOLDS ITS NAME AS A CUSTOM DOMAIN, which carries every path, so the dark deploy needs no route it does
       not already have and no permission the token has not already used. */
    assert.ok((block.routes ?? []).some((r) => r.custom_domain && r.pattern === host), `${name}: ${host} is not a Custom Domain of this Worker`);
    assert.deepEqual(zoneRoutes(block), [], `${name}: a zone route in push A is a permission the token may not have, spent on the push that must not fail`);
    /* AND IT DOES NOT TAKE THE SITE'S NAME, which would be the flip without its routes. */
    assert.ok(!siteHostsOf(name).includes(host), `${name}: PUBLIC_HOST ${host} is the site's own name in push A`);
    assert.equal(block.vars?.LEGACY_HOSTS, '', `${name}: nothing is legacy until the app has moved`);
    /* THE RP ID IS THE PARENT FROM THE FIRST DEPLOY, so a passkey made during push A is offered on the new name after B. */
    assert.equal(block.vars?.RP_ID, expected[name].rp, `${name}: RP_ID`);
  }
});

test('A2 ADDS ROUTES AND REMOVES NONE, AND B CHANGES TWO VARS AND NO ROUTE, so each push needs only what it changes', () => {
  const [a, a2, b] = [pushNamed('A'), pushNamed('A2'), pushNamed('B')];
  for (const name of ENVIRONMENTS) {
    const change2 = a2.change?.[name] ?? {};
    assert.deepEqual(Object.keys(change2), ['routes'], `${name}: A2 changes ${Object.keys(change2).join(', ')}`);
    const before = envOf(a.config, name).routes ?? [];
    const after = envOf(a2.config, name).routes ?? [];
    for (const kept of before) assert.ok(after.some((r) => JSON.stringify(r) === JSON.stringify(kept)), `${name}: A2 drops ${kept.pattern}`);
    assert.ok(zoneRoutes(envOf(a2.config, name)).length > 0, `${name}: A2 adds no zone route`);
    assert.deepEqual(envOf(a2.config, name).vars, envOf(a.config, name).vars, `${name}: A2 changes a var`);

    /* B IS THE ONE THAT MOVES PEOPLE, AND IT CHANGES NO ROUTE, so an Editor token is enough and a failed route write
       cannot leave the flipped vars serving with nothing routed behind them (the cut-over's risk 1). */
    const changeB = b.change?.[name] ?? {};
    assert.deepEqual(Object.keys(changeB), ['vars'], `${name}: B changes ${Object.keys(changeB).join(', ')}`);
    assert.deepEqual(Object.keys(changeB.vars ?? {}).sort(), ['LEGACY_HOSTS', 'PUBLIC_HOST'], `${name}: B`);
    assert.deepEqual(envOf(b.config, name).routes, envOf(a2.config, name).routes, `${name}: B changes a route`);
    assert.equal(envOf(b.config, name).vars?.RP_ID, envOf(a.config, name).vars?.RP_ID, `${name}: B moves the RP ID, stranding a passkey made under A`);
  }
  assert.equal(envOf(b.config, 'production').vars?.PUBLIC_HOST, 'brain.dog');
  assert.deepEqual(hostsOf(envOf(b.config, 'production').vars?.LEGACY_HOSTS), ['app.brain.dog']);
});

test('in every push, every door the Worker has built is routed on every name the Worker is on', () => {
  for (const push of PUSHES) {
    for (const name of ENVIRONMENTS) {
      const block = envOf(push.config, name);
      const host = block.vars?.PUBLIC_HOST ?? '';
      /* EVERY NAME, NOT ONLY `PUBLIC_HOST`. In A2 the app is still `app.brain.dog`'s and already routed on `brain.dog`,
         and a door missing there is one the site answers from the moment A2 deploys. In push A the only name is a
         Custom Domain, which covers every path, and the check is still what fails if that domain is dropped. */
      const names = [...new Set([host, ...zoneRoutes(block).map(hostOf)])];
      const first = assetsOf(push.config, name).run_worker_first ?? [];
      const built = first.filter((e) => !e.startsWith('!')).flatMap(samples).filter(served);
      assert.ok(built.length > 0, `${push.name} ${name}: run_worker_first names no door the Worker has built`);
      for (const on of names) {
        for (const path of [...built, '/app']) {
          const by = (block.routes ?? []).filter((r) => routes(r, on, path));
          assert.ok(by.length > 0, `${push.name} ${name}: ${on}${path} is a door the Worker answers and no route sends it there, so the site's 404 page answers it`);
        }
      }
    }
  }
});

test('the one-domain claim itself: after B the Worker is on the name the site holds', () => {
  for (const name of ENVIRONMENTS) {
    const host = envOf(pushNamed('B').config, name).vars?.PUBLIC_HOST ?? '';
    assert.ok(siteHostsOf(name).includes(host), `${name}: PUBLIC_HOST after B is ${host}, and the site's Custom Domains are ${siteHostsOf(name).join(', ')}`);
  }
});

test('no zone route claims a path the Worker has not built, and each one names its zone', () => {
  for (const push of PUSHES.filter((p) => p.name !== 'A')) {
    for (const name of ENVIRONMENTS) {
      const block = envOf(push.config, name);
      const zoned = zoneRoutes(block);
      assert.ok(zoned.length > 0, `${push.name} ${name}: no zone routes at all, so nothing on the shared host reaches the Worker`);
      for (const route of zoned) {
        /* EVERY SAMPLE, NOT ANY. With `find(served)` a route of `brain.dog/.well-known/*` passed, because
           `braindog-build` is one of its tails, and it would take `security.txt` and every other name under
           `/.well-known/` from the site. Checked by mutating a copy of the config on 23 September: that route and its
           alpha twin left this file green. A star is a claim on every tail, so every tail has to be one the Worker
           has built. */
        const asked = samples(route.pattern.slice(route.pattern.indexOf('/')));
        const unbuilt = asked.find((p) => !served(p));
        assert.equal(unbuilt, undefined, `${push.name} ${name}: ${route.pattern} routes ${unbuilt}, a path the Worker has not built, which takes it away from the site's 404 page`);
        const path = asked[0] ?? '';
        /* A ROUTE THE WORKER TAKES BUT DOES NOT RUN FIRST ON is a request the asset layer answers before the Worker's
           code sees it, which for a door is a 404 from a file lookup. `/app/*` is the exception by design: its `_app`
           chunks are files. */
        assert.ok(path.startsWith('/app') || workerFirst(assetsOf(push.config, name).run_worker_first ?? [], path), `${push.name} ${name}: ${route.pattern} is routed and not in run_worker_first`);
        /* WRANGLER NEEDS ONE OF THE TWO ON A ZONE ROUTE: "Add the `zone_name` or `zone_id` option after each route"
           (the routes page). Without it the deploy stops and asks. */
        assert.ok(route.zone_name === 'brain.dog' || typeof route.zone_id === 'string', `${push.name} ${name}: ${route.pattern} names no zone`);
      }
    }
  }
});

test('the app runs first under /app and its built chunks and catalogue are files', () => {
  for (const name of ENVIRONMENTS) {
    const assets = assetsOf(worker, name);
    const first = assets.run_worker_first ?? [];
    for (const path of ['/app', '/app/acme/r/tasks', '/app/acme/api/boot']) assert.ok(workerFirst(first, path), `${name}: ${path} is not worker-first`);
    for (const path of ['/app/_app/immutable/entry.js', '/app/catalogue/index.json']) assert.ok(!workerFirst(first, path), `${name}: ${path} runs the Worker before the file`);
    /* NOT A SHELL FOR EVERY MISS. The Worker draws the shell for an app navigation itself, and a
       `single-page-application` fallback would answer `index.html` with a 200 to a POST under `/app/<slug>/api/` that
       the router has no method for. It is also what lets a page load at `app.brain.dog/` reach the Worker's 308 in
       push A: the build has no root `index.html` for a fallback to find. */
    assert.equal(assets.not_found_handling, 'none', `${name}: not_found_handling`);
    /* 100 IS CLOUDFLARE'S CEILING, counted in raw entries (developers.cloudflare.com/workers/static-assets/binding). */
    assert.ok(first.length <= 100);
  }
});

test('the two environments route the same paths in every push, so alpha rehearses the production shape', () => {
  for (const push of PUSHES) {
    const paths = (name: string): string[] =>
      zoneRoutes(envOf(push.config, name))
        .map((r) => r.pattern.slice(r.pattern.indexOf('/')))
        .sort();
    assert.deepEqual(paths('alpha'), paths('production'), push.name);
    assert.deepEqual(assetsOf(push.config, 'alpha').run_worker_first, assetsOf(push.config, 'production').run_worker_first, push.name);
  }
});

test('in every push a legacy host keeps its Custom Domain, and a passkey made on it is offered on the new one', () => {
  for (const push of PUSHES) {
    for (const name of ENVIRONMENTS) {
      const block = envOf(push.config, name);
      const host = block.vars?.PUBLIC_HOST ?? '';
      const rp = block.vars?.RP_ID ?? '';
      const legacy = hostsOf(block.vars?.LEGACY_HOSTS);
      assert.ok(typeof block.vars?.LEGACY_HOSTS === 'string', `${push.name} ${name}: LEGACY_HOSTS is not declared, and vars is not inheritable`);

      /* THE DOORS HANDED OUT ON THE OLD NAME. `/in/*` and `/api/*` there are served, never redirected, so the name has
         to stay bound to this Worker for as long as the var lists it. */
      for (const old of legacy) {
        assert.ok((block.routes ?? []).some((r) => r.custom_domain && r.pattern === old), `${push.name} ${name}: ${old} is a legacy host with no Custom Domain`);
        assert.notEqual(old, host);
        /* WEBAUTHN OFFERS A CREDENTIAL WHERE ITS RP ID IS THE HOST OR A REGISTRABLE SUFFIX OF IT, so an RP ID of the
           new host is what lets a passkey made on the old one survive the move. */
        assert.ok(old.endsWith(`.${rp}`), `${push.name} ${name}: a passkey made on ${old} under RP ID ${rp} is never offered on ${host}`);
      }
      assert.ok(rp === host || host.endsWith(`.${rp}`), `${push.name} ${name}: RP_ID ${rp} is not ${host} or a suffix of it`);
    }
  }
});
