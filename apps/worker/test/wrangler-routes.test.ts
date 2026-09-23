/**
 * Which names reach this Worker, and by what, in the file as it deploys next and in the two pushes after it, held
 * against the doors the Worker has built.
 *
 * THE MOVE TO ONE DOMAIN GOES THROUGH THE SITE'S SERVICE BINDING, AND THIS FILE HOLDS EVERY PUSH OF IT THAT TOUCHES
 * `wrangler.jsonc` (`loop/research-one-domain-binding.md` section 4). Push A is `wrangler.jsonc` as it stands: the app
 * under `/app`, the Worker on `app.brain.dog` alone, no zone route. B1 flips alpha's two vars and B2 production's. The
 * two pushes that bind the site (1 and 3) change `apps/site/wrangler.jsonc` and nothing here. B1 and B2 live as JSON in
 * the comment at the top of `wrangler.jsonc`, and `pushes` in `scripts/provision-check.mjs` applies them, so a fragment
 * that stops parsing, or flips a name nothing reaches, fails here, on a laptop, rather than on the morning of the push.
 *
 * A NAME THE APP ANSWERS IS REACHED IN ONE OF TWO WAYS, AND THAT IS THE WHOLE OF WHAT IS CHECKED. It is a Custom Domain
 * of this Worker, which carries every path ("Other parts (path, query parameters) of the URL are not considered",
 * developers.cloudflare.com/workers/configuration/routing/custom-domains); or it is a Custom Domain of the site whose
 * same environment runs its script first on every built door and binds `APP` to this Worker's script of that
 * environment. A built door the site does not run first on is answered by the site's 404 page, to a webhook sender or an
 * MCP client, and nothing fails at deploy time. A site bound to the other environment's app serves production's record
 * on alpha's name, or the reverse.
 *
 * THE SITE OF EACH STAGED PUSH IS WRITTEN IN MEMORY (`scripts/site-fixture.mjs`), because `apps/site/wrangler.jsonc`
 * changes between these pushes on purpose, and a test of B2 that read it would pass or fail with whichever commit is
 * checked out. The tests that read the real site say so in their names.
 *
 * "BUILT" IS READ FROM `src/route.ts`, NOT WRITTEN HERE. Each `serves*` predicate there is the Worker's own answer to "is
 * this path mine", so a door added to the router and to `run_worker_first` that the site does not hand over fails this
 * file, and nobody has to remember a third list.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { servesAccount, servesApi, servesAuth, servesBuild, servesIn, servesMcp } from '../src/route.ts';

type Route = { pattern: string; custom_domain?: boolean; zone_name?: string; zone_id?: string };
type Assets = { not_found_handling?: string; run_worker_first?: string[] | boolean };
type Env = {
  main?: string;
  routes?: Route[];
  vars?: { [name: string]: string };
  assets?: Assets;
  services?: { binding: string; service: string }[];
};
type Config = { name?: string; main?: string; assets?: Assets; services?: Env['services']; env?: { [name: string]: Env } };
type Push = { name: string; config: Config; change: { [env: string]: Env } | null };
type Binding = { names: string[]; why: string | null };

/**
 * `stripJsonc`, `pushes` and `siteBinding` from `scripts/provision-check.mjs`, and the in-memory sites, so the test, the
 * checker and the smoke step read the files, the staged pushes and the binding the same way.
 *
 * A DYNAMIC IMPORT WITH A WIDENED SPECIFIER, BECAUSE A STATIC ONE DOES NOT TYPECHECK. The script is plain JavaScript with
 * no declaration beside it and this program has no `allowJs`, so `import { stripJsonc } from
 * '../scripts/provision-check.mjs'` is TS7016 under `strict`. Measured with `tsc --noEmit -p tsconfig.test.json` on 23
 * September: "Could not find a declaration file for module", and the implicit `any` it names. The alternative was a
 * fourth copy of the comment-stripping scanner (`alarm.test.ts` holds a third), and a second reader that disagrees with
 * the checker about one comment is exactly how a test goes green on a file the checker cannot parse.
 */
const checker = '../scripts/provision-check.mjs' as string;
const { stripJsonc, pushes, siteBinding, DOORS } = (await import(checker)) as {
  stripJsonc: (text: string) => string;
  pushes: () => Push[];
  siteBinding: (config: Config, site: Config, env: string, doors?: string[]) => Binding;
  DOORS: string[];
};
const fixture = '../scripts/site-fixture.mjs' as string;
const { UNBOUND, boundSite, SITE_DOORS } = (await import(fixture)) as {
  UNBOUND: Config;
  boundSite: (bindings: { [env: string]: string }, site?: Config, doors?: string[]) => Config;
  SITE_DOORS: string[];
};

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
 * THE SITE EACH PUSH IS MADE BESIDE. B1 follows push 1, which binds alpha's site; B2 follows push 3, which binds
 * production's too. Push A is the file as it deploys and is checked against the real site, whatever it binds today.
 */
const SITE_AT: { [push: string]: Config } = {
  B1: boundSite({ alpha: 'braindog-alpha' }),
  B2: boundSite({ alpha: 'braindog-alpha', production: 'braindog-production' }),
};
const siteAt = (push: Push): Config => SITE_AT[push.name] ?? site;

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
const assetsOf = (config: Config, name: string): Assets => envOf(config, name).assets ?? config.assets ?? {};
const firstOf = (config: Config, name: string): string[] => {
  const list = assetsOf(config, name).run_worker_first;
  return Array.isArray(list) ? list : [];
};

/** Every door this Worker has built in one environment, one sample path each, with the shell. */
const builtDoors = (config: Config, name: string): string[] => [
  ...new Set([...firstOf(config, name).filter((e) => !e.startsWith('!')).flatMap(samples).filter(served), '/app', '/app/']),
];

const zoneRoutes = (block: Env): Route[] => (block.routes ?? []).filter((r) => !r.custom_domain);
const customDomains = (block: Env): string[] => (block.routes ?? []).filter((r) => r.custom_domain).map((r) => r.pattern.toLowerCase());
const hostsOf = (value: string | undefined): string[] => (value ?? '').split(/[\s,]+/).filter((h) => h.length > 0);
const siteHostsOf = (name: string): string[] => customDomains(envOf(site, name));

/**
 * The names an environment answers that nothing reaches, each with the reason, for one config beside one site. Empty is
 * the answer every push has to give.
 */
const unreached = (config: Config, siteConfig: Config, name: string): string[] => {
  const block = envOf(config, name);
  const own = customDomains(block);
  const binding = siteBinding(config, siteConfig, name, builtDoors(config, name));
  const names = [block.vars?.PUBLIC_HOST ?? '', ...hostsOf(block.vars?.LEGACY_HOSTS)].map((h) => h.toLowerCase());
  return names
    .filter((on) => !own.includes(on) && !binding.names.includes(on))
    .map((on) => `${on} is no Custom Domain of this Worker, and the site does not hand it the doors: ${binding.why ?? `${on} is not a Custom Domain of the site's env.${name}`}`);
};

test('THE FILE IS PUSH A: the Worker on its own name as a Custom Domain, no zone route, and the passkey already under the parent', () => {
  assert.deepEqual(PUSHES.map((p) => p.name), ['A', 'B1', 'B2']);
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
    assert.ok(customDomains(block).includes(host), `${name}: ${host} is not a Custom Domain of this Worker`);
    /* AND IT DOES NOT TAKE THE SITE'S NAME, which would be the flip before anything reaches it. */
    assert.ok(!siteHostsOf(name).includes(host), `${name}: PUBLIC_HOST ${host} is the site's own name in push A`);
    assert.equal(block.vars?.LEGACY_HOSTS, '', `${name}: nothing is legacy until the app has moved`);
    /* THE RP ID IS THE PARENT FROM THE FIRST DEPLOY, so a passkey made during push A is offered on the new name after the
       flip. */
    assert.equal(block.vars?.RP_ID, expected[name].rp, `${name}: RP_ID`);
  }
});

test('B1 FLIPS ALPHA AND B2 FLIPS PRODUCTION, EACH BY TWO VARS AND NO ROUTE, so each push needs only what it changes', () => {
  const a = pushNamed('A');
  const flips = [
    { push: pushNamed('B1'), env: 'alpha', host: 'alpha.brain.dog', old: 'app.alpha.brain.dog' },
    { push: pushNamed('B2'), env: 'production', host: 'brain.dog', old: 'app.brain.dog' },
  ];
  for (const { push, env, host, old } of flips) {
    /* ONE ENVIRONMENT PER PUSH, so alpha's flip is rehearsed through `deploy.yml` and the alpha smoke before production's
       exists (the research, section 4), and a fault in one is a rollback of one. */
    assert.deepEqual(Object.keys(push.change ?? {}), [env], `${push.name} changes ${Object.keys(push.change ?? {}).join(', ')}`);
    const change = push.change?.[env] ?? {};
    /* AND IT CHANGES NO ROUTE, so an Editor token is enough and no route write can fail under the flipped vars. */
    assert.deepEqual(Object.keys(change), ['vars'], `${push.name}: changes ${Object.keys(change).join(', ')}`);
    assert.deepEqual(Object.keys(change.vars ?? {}).sort(), ['LEGACY_HOSTS', 'PUBLIC_HOST'], push.name);
    assert.equal(envOf(push.config, env).vars?.PUBLIC_HOST, host, push.name);
    assert.deepEqual(hostsOf(envOf(push.config, env).vars?.LEGACY_HOSTS), [old], push.name);
    for (const name of ENVIRONMENTS) {
      assert.deepEqual(envOf(push.config, name).routes, envOf(a.config, name).routes, `${push.name} ${name}: a flip changes a route`);
      assert.equal(envOf(push.config, name).vars?.RP_ID, envOf(a.config, name).vars?.RP_ID, `${push.name} ${name}: the flip moves the RP ID, stranding a passkey made under A`);
    }
  }
});

test('in every push, every name the app answers is reached, beside the site that push is made next to', () => {
  for (const push of PUSHES) {
    for (const name of ENVIRONMENTS) {
      const built = builtDoors(push.config, name);
      assert.ok(built.length > 2, `${push.name} ${name}: run_worker_first names no door the Worker has built`);
      assert.deepEqual(unreached(push.config, siteAt(push), name), [], `${push.name} ${name}`);
    }
  }
});

test('a flip beside a site that does not bind that environment\'s own app is refused, which is what keeps B2 behind push 3', () => {
  const b2 = pushNamed('B2').config;
  /* PUSH 1'S SITE, ALPHA BOUND AND PRODUCTION NOT. B2 landing here would move production's sign-in to `brain.dog`, where
     every door is the site's 404 page. */
  assert.match(unreached(b2, boundSite({ alpha: 'braindog-alpha' }), 'production').join('\n'), /^brain\.dog .*env\.production/);
  /* PRODUCTION'S SITE BOUND TO ALPHA'S APP: every door answers, from the wrong record, and nothing else would notice. */
  const crossed = boundSite({ alpha: 'braindog-alpha', production: 'braindog-alpha' });
  assert.match(unreached(b2, crossed, 'production').join('\n'), /binds APP to braindog-alpha, and this app there is braindog-production/);
  /* A SITE THAT KEEPS ONE BUILT DOOR: `/mcp` is the site's 404 page to every MCP client. */
  const noMcp = boundSite({ alpha: 'braindog-alpha', production: 'braindog-production' }, UNBOUND, SITE_DOORS.filter((d) => d !== '/mcp'));
  assert.match(unreached(b2, noMcp, 'production').join('\n'), /does not run its script first on \/mcp/);
  /* A BINDING WITH NO SCRIPT TO CALL IT hands nothing to anyone. */
  const scriptless = boundSite({ alpha: 'braindog-alpha', production: 'braindog-production' });
  delete envOf(scriptless, 'production').main;
  assert.match(unreached(b2, scriptless, 'production').join('\n'), /no main/);
  /* A SCRIPT WITH NO `APP` TO CALL, AND THE SAME BINDING WRITTEN AT THE SITE'S TOP LEVEL, WHICH WRANGLER DOES NOT
     INHERIT. Neither case was held by anything here: with the `binds no APP` refusal taken out of `siteBinding`, or with
     `services` read from the top level as a fallback, every test in this file and in `scripts/*.test.mjs` stayed green
     (the checker's mutation run on 23 September). */
  const unbound = boundSite({ alpha: 'braindog-alpha', production: 'braindog-production' });
  delete envOf(unbound, 'production').services;
  assert.match(unreached(b2, unbound, 'production').join('\n'), /env\.production binds no APP/);
  unbound.services = [{ binding: 'APP', service: 'braindog-production' }];
  assert.match(unreached(b2, unbound, 'production').join('\n'), /env\.production binds no APP/);
});

test('the real site, whatever it binds today, binds each environment to that environment\'s own app and hands it every built door', () => {
  /* READS BOTH REAL FILES, AND HOLDS AT EVERY COMMIT OF THE MOVE. Before push 1 the site binds nothing and this is
     vacuous; from push 1 alpha's site is bound and B1's `alpha.brain.dog` has to be reached through it; from push 3
     production's too. The flip is taken from the last staged push, so it is always the one still to come, or the file
     itself once both flips have landed. */
  const flipped = PUSHES[PUSHES.length - 1]?.config ?? worker;
  for (const name of ENVIRONMENTS) {
    const bound = (envOf(site, name).services ?? []).some((s) => s.binding === 'APP');
    if (!bound) continue;
    assert.deepEqual(unreached(flipped, site, name), [], `${name}: the site binds APP, and the flip staged for it would not be reached`);
    assert.ok(siteHostsOf(name).includes(envOf(flipped, name).vars?.PUBLIC_HOST ?? ''), `${name}: the site's bound name is not where the flip puts the app`);
  }
});

test('the one-domain claim itself: after the flips the Worker is on the name the site holds', () => {
  const last = PUSHES[PUSHES.length - 1]?.config ?? worker;
  for (const name of ENVIRONMENTS) {
    const host = envOf(last, name).vars?.PUBLIC_HOST ?? '';
    assert.ok(siteHostsOf(name).includes(host), `${name}: PUBLIC_HOST after the flips is ${host}, and the site's Custom Domains are ${siteHostsOf(name).join(', ')}`);
  }
});

test('no push has a zone route: the site\'s binding carries the shared name, so no route is written and no Zone permission is needed', () => {
  for (const push of PUSHES) {
    for (const name of ENVIRONMENTS) {
      assert.deepEqual(zoneRoutes(envOf(push.config, name)), [], `${push.name} ${name}: a zone route is a permission the token may not have, and a part of the move no version rollback removes`);
    }
  }
});

test('the checker\'s own door list is the doors src/route.ts has built, so the smoke step and this file agree on what reaches the app', () => {
  /* `DOORS` IN THE CHECKER IS A LIST WRITTEN BY HAND, for the reason its comment gives, and this is what keeps it
     honest. Every entry has to be a path the Worker serves, and every door family the app's own `run_worker_first` has
     built (its first path segment) has to have an entry, so a door added to the router is a line here or a red test. */
  for (const door of DOORS) assert.ok(served(door), `${door} is in the checker's DOORS and is not a door the Worker serves`);
  const family = (path: string): string => path.split('/')[1] ?? '';
  for (const name of ENVIRONMENTS) {
    const missing = builtDoors(worker, name).filter((p) => !DOORS.some((d) => family(d) === family(p)));
    assert.deepEqual(missing, [], `${name}: built doors the checker's DOORS has no entry for`);
  }
  /* AND THE IN-MEMORY SITE HANDS OVER EVERY ONE OF THEM, or the staged pushes above are checked beside a site that could
     not exist. */
  for (const door of builtDoors(worker, 'production')) assert.ok(workerFirst(SITE_DOORS, door), `the fixture's site keeps ${door}`);
});

test('the app runs first under /app and its built chunks and catalogue are files', () => {
  for (const name of ENVIRONMENTS) {
    const assets = assetsOf(worker, name);
    const first = firstOf(worker, name);
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

test('the two environments run the Worker first on the same paths in every push, so alpha rehearses the production shape', () => {
  for (const push of PUSHES) assert.deepEqual(firstOf(push.config, 'alpha'), firstOf(push.config, 'production'), push.name);
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
        assert.ok(customDomains(block).includes(old), `${push.name} ${name}: ${old} is a legacy host with no Custom Domain`);
        assert.notEqual(old, host);
        /* WEBAUTHN OFFERS A CREDENTIAL WHERE ITS RP ID IS THE HOST OR A REGISTRABLE SUFFIX OF IT, so an RP ID of the
           new host is what lets a passkey made on the old one survive the move. */
        assert.ok(old.endsWith(`.${rp}`), `${push.name} ${name}: a passkey made on ${old} under RP ID ${rp} is never offered on ${host}`);
      }
      assert.ok(rp === host || host.endsWith(`.${rp}`), `${push.name} ${name}: RP_ID ${rp} is not ${host} or a suffix of it`);
    }
  }
});
