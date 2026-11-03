/**
 * Which names reach this Worker, and by what, in the file as it deploys next and in the two pushes after it, held
 * against the doors the Worker has built.
 *
 * THE MOVE TO ONE DOMAIN GOES THROUGH THE SITE'S SERVICE BINDING, AND THIS FILE HOLDS EVERY PUSH OF IT THAT TOUCHES
 * `wrangler.jsonc`. Push A put the app under `/app` with the Worker on
 * `app.brain.dog` alone and no zone route. B1 flipped alpha's two vars (push 2) and B2 production's (push 4), and push C
 * flipped both back, so `wrangler.jsonc` as it stands is C: both environments on the app's own names, the site's names
 * legacy, and since 29 Oct the app at the root of its name rather than under `/app`. The two pushes
 * that bind the site (1 and 3) change `apps/site/wrangler.jsonc` and nothing here. Nothing is staged in the comment at
 * the top of `wrangler.jsonc` now; `pushes` in `scripts/provision-check.mjs` reads the file's own name from that
 * comment and would apply a fragment staged there, so one that stops parsing, or flips a name nothing reaches, fails
 * here, on a laptop, rather than on the morning of the push.
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
 * checked out. THE FILE ITSELF IS HELD TO THE REAL SITE, because the two deploy together from the same commit. The tests
 * that read the real site say so in their names.
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
import { HEALTHZ } from '../src/health.ts';

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
 * `provision-check` and the smoke step read the files, the staged pushes and the binding the same way.
 *
 * A DYNAMIC IMPORT WITH A WIDENED SPECIFIER, BECAUSE A STATIC ONE DOES NOT TYPECHECK. The script is plain JavaScript with
 * no declaration beside it and this program has no `allowJs`, so `import { stripJsonc } from
 * '../scripts/provision-check.mjs'` is TS7016 under `strict`. Measured with `tsc --noEmit -p tsconfig.test.json`:
 * "Could not find a declaration file for module", and the implicit `any` it names. The alternative was a
 * fourth copy of the comment-stripping scanner (`alarm.test.ts` holds a third), and a second reader that disagrees with
 * `provision-check` about one comment is exactly how a test goes green on a file `provision-check` cannot parse.
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
 * production's too.
 *
 * THE FILE AS IT DEPLOYS IS CHECKED AGAINST THE REAL SITE, WHATEVER ITS PUSH IS CALLED. This was keyed by name alone,
 * which was harmless while the file was A and had no entry. Once the file is B1 it is checked beside the fixture and
 * never beside the site it deploys with. Measured in a clone of push 2, with `STAGE B2` also moved into
 * `env.production.vars` and `apps/site/wrangler.jsonc` left without push 3: keyed by name, the reachability test below
 * passed, and the only failure in this file was the one that names the file's push; read from the real site, it failed
 * on "brain.dog is no Custom Domain of this Worker, and the site does not hand it the doors: the site's env.production
 * has no main". That is the guard that push 4 cannot land before push 3, held against the files that deploy.
 */
const SITE_AT: { [push: string]: Config } = {
  B1: boundSite({ alpha: 'braindog-alpha' }),
  B2: boundSite({ alpha: 'braindog-alpha', production: 'braindog-production' }),
};
const siteAt = (push: Push): Config => (push.change === null ? site : SITE_AT[push.name] ?? site);

/**
 * Whether the Worker answers a path itself.
 *
 * `/app` AND EVERYTHING UNDER IT IS THE APP'S OLD ADDRESS, AND IT IS THIS WORKER'S BY DEFINITION: a page load there is
 * its 308 to the root, and a CLI's `/app/<slug>/api/*` is served where it stands, so the site has to hand all of it over.
 * `appPath` in `src/route.ts` answers `null` for `/app/_app/*`, which is a file and still the Worker's to send on, so
 * it is the wrong predicate here: this question is "does a request here belong to this Worker", not "is it a
 * navigation". The app's root is this Worker's too, on its own name, but no site hands that over, so it is not asked.
 */
const served = (path: string): boolean =>
  /^\/app(?:\/|$)/.test(path) || servesApi(path) || servesAuth(path) || servesAccount(path) || servesMcp(path) || servesIn(path) || servesBuild(path) || HEALTHZ.test(path);

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

/**
 * THE HOST'S PATHS, 33 §4'S LIST. The config said them in `run_worker_first` until the app moved to the root and the list
 * became `/*`, and wrangler refuses an entry `/*` makes redundant, so they are said here, where the router (`served`)
 * still decides which of them are built.
 */
const HOST_PATHS = ['/api/*', '/mcp', '/a', '/a/*', '/in/*', '/s/*', '/ws', '/ws/*', '/auth/*', '/account/*', '/.well-known/*'];

/** Every door this Worker has built in one environment, one sample path each, with the shell. */
const builtDoors = (config: Config, name: string): string[] => {
  const first = firstOf(config, name);
  const named = first.filter((e) => !e.startsWith('!'));
  const tried = named.includes('/*') ? [...named, ...HOST_PATHS] : named;
  return [...new Set([...tried.flatMap(samples).filter((p) => served(p) && workerFirst(first, p)), '/app', '/app/'])];
};

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

/**
 * Each flip of the move: the environment it moves, the name it moves the app to, and the name that stays as the legacy
 * host. The old name is also the one Custom Domain the Worker held in push A, so "no route changed" is "the Worker still
 * holds exactly its old name".
 */
const FLIPS: { [push: string]: { env: (typeof ENVIRONMENTS)[number]; host: string; old: string } } = {
  C1: { env: 'alpha', host: 'app.alpha.brain.dog', old: 'alpha.brain.dog' },
  C2: { env: 'production', host: 'app.brain.dog', old: 'brain.dog' },
};
const RP = { production: 'brain.dog', alpha: 'alpha.brain.dog' };

test('THE FILE IS PUSH C: both environments on the app\'s own name, the site\'s names legacy and reached through its binding, no route changed, and the passkey still under the parent', () => {
  assert.deepEqual(PUSHES.map((p) => p.name), ['C']);
  assert.deepEqual(pushNamed('C').config, worker, 'push C is not the file as it deploys');
  for (const name of ENVIRONMENTS) {
    const flip = Object.values(FLIPS).find((f) => f.env === name);
    assert.ok(flip, `${name}: no flip names this environment`);
    const block = envOf(worker, name);
    assert.equal(block.vars?.PUBLIC_HOST, flip.host, `${name}: PUBLIC_HOST`);
    assert.deepEqual(hostsOf(block.vars?.LEGACY_HOSTS), [flip.old], `${name}: LEGACY_HOSTS`);
    /* THE OLD NAME IS THE SITE'S, AND THE REAL SITE HANDS IT THE DOORS, so a page load there reaches this Worker's 308 and
       its API doors are served. Read from `apps/site/wrangler.jsonc` as it is at this commit, not from the fixture. */
    assert.deepEqual(siteBinding(worker, site, name, builtDoors(worker, name)), { names: [flip.old], why: null }, `${name}: the site does not hand ${flip.old} to this app`);
    /* THE WORKER HOLDS THE APP'S NAME AS A CUSTOM DOMAIN AND NOTHING ELSE, as it did through the one-domain move: the
       flip back writes no route either. The owner's admin is a page in the app (`/admin`), so there is no admin host. */
    assert.deepEqual(customDomains(block), [flip.host], `${name}: this Worker's Custom Domains`);
    /* THE RP ID IS THE PARENT FROM THE FIRST DEPLOY, and a flip does not move it, so a passkey made on the old name is
       offered on the new one. */
    assert.equal(block.vars?.RP_ID, RP[name], `${name}: RP_ID`);
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

test('a push beside a site that does not bind that environment\'s own app is refused, which keeps the old name reached', () => {
  const b2 = pushNamed('C').config;
  /* PUSH 1'S SITE, ALPHA BOUND AND PRODUCTION NOT. The old name `brain.dog` would then answer the site's 404 page at
     every door, so a token or an `/in/` address handed out there stops working. */
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
     (measured by mutation). */
  const unbound = boundSite({ alpha: 'braindog-alpha', production: 'braindog-production' });
  delete envOf(unbound, 'production').services;
  assert.match(unreached(b2, unbound, 'production').join('\n'), /env\.production binds no APP/);
  unbound.services = [{ binding: 'APP', service: 'braindog-production' }];
  assert.match(unreached(b2, unbound, 'production').join('\n'), /env\.production binds no APP/);
});

test('the real site, whatever it binds today, binds each environment to that environment\'s own app and hands it every built door', () => {
  /* READS BOTH REAL FILES. The site's bound name is the app's old name: the one place its page loads are sent on from. */
  for (const name of ENVIRONMENTS) {
    const bound = (envOf(site, name).services ?? []).some((s) => s.binding === 'APP');
    if (!bound) continue;
    assert.deepEqual(unreached(worker, site, name), [], `${name}: the site binds APP, and a name the app answers would not be reached`);
    assert.ok(siteHostsOf(name).some((h) => hostsOf(envOf(worker, name).vars?.LEGACY_HOSTS).includes(h)), `${name}: the site's bound name is not a legacy host of the app`);
  }
});

test('the app is on a name of its own, and the site keeps the shared name', () => {
  for (const name of ENVIRONMENTS) {
    const host = envOf(worker, name).vars?.PUBLIC_HOST ?? '';
    assert.ok(customDomains(envOf(worker, name)).includes(host), `${name}: PUBLIC_HOST ${host} is not a Custom Domain of this Worker`);
    assert.ok(!siteHostsOf(name).includes(host), `${name}: PUBLIC_HOST ${host} is a Custom Domain of the site too`);
  }
});

test('no push has a zone route: the site\'s binding carries the shared name, so no route is written and no Zone permission is needed', () => {
  for (const push of PUSHES) {
    for (const name of ENVIRONMENTS) {
      assert.deepEqual(zoneRoutes(envOf(push.config, name)), [], `${push.name} ${name}: a zone route is a permission the token may not have, and a part of the move no version rollback removes`);
    }
  }
});

test('provision-check\'s own door list is the doors src/route.ts has built, so the smoke step and this file agree on what reaches the app', () => {
  /* `DOORS` IN `provision-check` IS A LIST WRITTEN BY HAND, for the reason its comment gives, and this is what keeps it
     honest. Every entry has to be a path the Worker serves, and every door family the app's own `run_worker_first` has
     built (its first path segment) has to have an entry, so a door added to the router is a line here or a red test. */
  for (const door of DOORS) assert.ok(served(door), `${door} is in provision-check's DOORS and is not a door the Worker serves`);
  const family = (path: string): string => path.split('/')[1] ?? '';
  for (const name of ENVIRONMENTS) {
    const missing = builtDoors(worker, name).filter((p) => !DOORS.some((d) => family(d) === family(p)));
    assert.deepEqual(missing, [], `${name}: built doors provision-check's DOORS has no entry for`);
  }
  /* AND THE IN-MEMORY SITE HANDS OVER EVERY ONE OF THEM, or the staged pushes above are checked beside a site that could
     not exist. */
  for (const door of builtDoors(worker, 'production')) assert.ok(workerFirst(SITE_DOORS, door), `the fixture's site keeps ${door}`);
});

test('the app runs first at the root and under the old /app, and its built chunks and catalogue are files', () => {
  for (const name of ENVIRONMENTS) {
    const assets = assetsOf(worker, name);
    const first = firstOf(worker, name);
    /* EVERY PAGE OF THE APP, because a record's name in the path is checked by the Directory before any file answers it;
       and EVERY OLD ADDRESS, the old chunks included, because each is the Worker's 308 or a CLI's API. */
    for (const path of ['/', '/acme', '/acme/r/tasks', '/acme/api/boot', '/signin', '/app', '/app/acme/r/tasks', '/app/acme/api/boot', '/app/_app/version.json'])
      assert.ok(workerFirst(first, path), `${name}: ${path} is not worker-first`);
    for (const path of ['/_app/immutable/entry.js', '/_app/version.json', '/catalogue/index.json']) assert.ok(!workerFirst(first, path), `${name}: ${path} runs the Worker before the file`);
    /* NOT A SHELL FOR EVERY MISS. The Worker draws the shell for an app navigation itself, and a
       `single-page-application` fallback would answer `index.html` with a 200 to a POST under `/<slug>/api/` that
       the router has no method for. */
    assert.equal(assets.not_found_handling, 'none', `${name}: not_found_handling`);
    /* 100 IS CLOUDFLARE'S CEILING, counted in raw entries (developers.cloudflare.com/workers/static-assets/binding). */
    assert.ok(first.length <= 100);
  }
});

test('the two environments run the Worker first on the same paths in every push, so alpha rehearses the production shape', () => {
  for (const push of PUSHES) assert.deepEqual(firstOf(push.config, 'alpha'), firstOf(push.config, 'production'), push.name);
});

test('in every push a legacy host is declared, and a passkey made on it is offered on the new one', () => {
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
        assert.notEqual(old, host);
        /* WEBAUTHN OFFERS A CREDENTIAL WHERE ITS RP ID IS THE HOST OR A REGISTRABLE SUFFIX OF IT, so an RP ID of the
           new host is what lets a passkey made on the old one survive the move. */
        assert.ok(old === rp || old.endsWith(`.${rp}`), `${push.name} ${name}: a passkey made on ${old} under RP ID ${rp} is never offered on ${host}`);
      }
      assert.ok(rp === host || host.endsWith(`.${rp}`), `${push.name} ${name}: RP_ID ${rp} is not ${host} or a suffix of it`);
    }
  }
});
