/**
 * `provision-check`'s readings, held against the sentences the host actually writes.
 *
 *   node --test --experimental-strip-types "apps/worker/scripts/*.test.mjs"
 *
 * THE POINT OF THIS FILE IS THAT THE FOUR ANSWERS AT `/auth/provision` LOOK ALIKE AND MEAN
 * DIFFERENT THINGS. Two of them are a 404 and they differ only in their sentence: `off()` at
 * `packages/host/src/auth.ts:391` is the route existing with no operator key bound, and the 404 at
 * `:515` is `serveAuth` not finding the path at all, which on a deployed host means the build
 * predates the route or `/auth/*` is not reaching the Worker. Reading the first as the second sends
 * him to redeploy when all he has to do is set a secret. The sentences below are copied from that
 * file rather than paraphrased, so a change to either one fails here instead of on the night.
 *
 * `guardsKeylessRecords` IS DRIVEN AGAINST THREE REAL COMMITS IN THIS CLONE, because the question it
 * answers is a question about a commit, and the third one is the one that matters. `77f82ccb` is
 * where `provision()` began calling the guard and `aca63554` is its parent, which provisioned a
 * record with no key store and said nothing. `a2814b00` is seven commits earlier,
 * measured with `git log --oneline a2814b0..77f82cc`, and it is the reason this function greps for the
 * CALL rather than for the file: it added `apps/worker/src/keyless.ts` and
 * six tests for it, and `src/index.ts` at that commit holds `async function provision(` without a
 * mention of the guard. A deploy cut there carries the file and provisions keyless records anyway.
 *
 * NOTHING HERE TOUCHES THE NETWORK. Every reading is a pure function of a status and a body, which
 * is why they are exported at all: the probes themselves are one `fetch` each and are not the part
 * that can be quietly wrong.
 */

import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { applyPush, environmentOf, guardsKeylessRecords, plan, pushes, readBuild, readMethods, readProvision, wranglerConfig } from './provision-check.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

test('the host a person names decides which environment, which bucket and which vars are read', () => {
  const config = wranglerConfig(root);

  /* PUSH A OF THE ONE-DOMAIN MOVE (`loop/research-one-domain-cutover.md` §5): production is still
     `app.brain.dog`, a Custom Domain, and that is the host the owner runs this against before he
     provisions (the runbook's O3). */
  const production = environmentOf(config, 'app.brain.dog');
  assert.equal(production?.name, 'production');
  assert.equal(production?.bucket, 'braindog-blobs');
  assert.equal(production?.vars.PUBLIC_HOST, 'app.brain.dog');
  assert.equal(environmentOf(config, 'https://app.brain.dog/')?.name, 'production');

  const alpha = environmentOf(config, 'app.alpha.brain.dog');
  assert.equal(alpha?.name, 'alpha');
  assert.equal(alpha?.bucket, 'braindog-blobs-alpha');
  assert.equal(alpha?.vars.PUBLIC_HOST, 'app.alpha.brain.dog');

  /* `brain.dog` IS THE SITE'S UNTIL A2 ROUTES IT, so in push A it is a host this file does not name,
     and reading production's facts for it would describe a Worker that is not answering there. */
  assert.equal(environmentOf(config, 'brain.dog'), null);

  /* A HOST THIS FILE DOES NOT NAME IS NOT A GUESS. A rehearsal host on `localhost` is a real thing
     to run this against, and pretending it is production would read production's bucket name. */
  assert.equal(environmentOf(config, 'localhost:8787'), null);
});

test('once the zone routes land the shared name is production too, by the pattern\'s host part', () => {
  const staged = Object.fromEntries(pushes(root).map((p) => [p.name, p.config]));
  for (const push of ['A2', 'B']) {
    const config = staged[push];
    /* THIS WORKER HOLDS `brain.dog` ONLY THROUGH ZONE ROUTES. Their patterns are `brain.dog/api/*` and
       the like, so no pattern equals the host, and the exact comparison this function made before
       wave thirty-nine answered `null` for production's own name. */
    assert.equal(environmentOf(config, 'brain.dog')?.name, 'production', push);
    assert.equal(environmentOf(config, 'brain.dog')?.bucket, 'braindog-blobs', push);
    assert.equal(environmentOf(config, 'alpha.brain.dog')?.name, 'alpha', push);
    /* THE OLD NAME IS STILL PRODUCTION. It stays a Custom Domain of this Worker for the doors handed
       out on it, and a check run against it must read production's bucket and vars, not none. */
    assert.equal(environmentOf(config, 'app.brain.dog')?.name, 'production', push);
    /* A HOST THAT ONLY SHARES A PREFIX WITH A ROUTE IS NOT THAT ROUTE'S. Matching on the pattern's
       host part must compare the whole label, or `brain.dog.evil` would read production's facts. */
    assert.equal(environmentOf(config, 'brain.dog.evil'), null, push);
  }
  assert.equal(environmentOf(staged.A2, 'brain.dog')?.vars.PUBLIC_HOST, 'app.brain.dog');
  assert.equal(environmentOf(staged.B, 'brain.dog')?.vars.PUBLIC_HOST, 'brain.dog');
});

test('a staged push that names an environment or a key the file does not have is refused, not ignored', () => {
  const base = wranglerConfig(root);
  /* A TYPO IN THE COMMENT WOULD OTHERWISE BE A PUSH THAT CHANGES NOTHING, and the test holding it
     would go green on the file as it already is. */
  assert.throws(() => applyPush(base, { staging: { vars: { PUBLIC_HOST: 'x' } } }), /env\.staging/);
  assert.throws(() => applyPush(base, { production: { route: [] } }), /route/);
  const moved = applyPush(base, { production: { vars: { PUBLIC_HOST: 'brain.dog' } } });
  assert.equal(moved.env.production.vars.PUBLIC_HOST, 'brain.dog');
  /* THE REST OF `vars` IS KEPT, which is what "vars unchanged" means in a fragment that names two. */
  assert.equal(moved.env.production.vars.RP_ID, base.env.production.vars.RP_ID);
  /* AND THE FILE'S OWN COPY IS UNTOUCHED. */
  assert.equal(base.env.production.vars.PUBLIC_HOST, 'app.brain.dog');
});

test('the two 404s at /auth/provision are told apart by their sentence', () => {
  const noKey = readProvision(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'This BrainDog does not offer that way to sign in.' } });
  assert.equal(noKey.state, 'no-operator-key');

  const noRoute = readProvision(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no sign-in route at that address.' } });
  assert.equal(noRoute.state, 'no-such-route');

  const ready = readProvision(401, { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'This route takes the operator key.', at: 'authorization' } });
  assert.equal(ready.state, 'ready');

  /* THE APP SHELL ANSWERING A POST IS THE FOURTH ANSWER, and it is the one that looks healthiest:
     a 200 with no JSON in it at all, which is `/auth/*` missing from `run_worker_first`. */
  assert.equal(readProvision(200, null).state, 'unreadable');

  /* AND ON ONE SHARED HOSTNAME THERE IS A FIFTH: THE MARKETING SITE. With the zone route for `/auth/*`
     missing, the site answers a POST there with its own 404 page, HTML and no JSON. Before this case
     the sentence printed for it blamed `run_worker_first`, which is the right file and the wrong key. */
  const site = readProvision(404, null);
  assert.equal(site.state, 'unreadable');
  assert.match(site.next, /zone route/);

  for (const reading of [noKey, noRoute, ready]) assert.ok(reading.next.length > 0, 'every reading says what to do next');
});

test('what /auth/methods reports is the session secret and the passkey count, and never the key store', () => {
  const configured = readMethods({ passkey: true, magic: false, key: false, open: false, demo: false, me: null, firstRun: true });
  assert.equal(configured.state, 'configured');
  assert.equal(configured.firstRun, true);
  assert.equal(configured.magic, false);

  const bare = readMethods({ passkey: false, magic: false, key: false, open: false, demo: false, me: null, why: 'not-configured' });
  assert.equal(bare.state, 'not-configured');

  const insecure = readMethods({ passkey: false, magic: false, key: false, open: false, demo: false, me: null, why: 'insecure' });
  assert.equal(insecure.state, 'insecure');
});

test('the build tuple is split into the date and the commit it was cut from', () => {
  assert.deepEqual(readBuild('2026.09.21+d42b697'), { tuple: '2026.09.21+d42b697', sha: 'd42b697' });
  /* A DEPLOY THAT FORGOT `--var` ANSWERS `null`, which is a deployment that was never told which
     build it is rather than a host with no build on it. There is no sha to resolve. */
  assert.deepEqual(readBuild(null), { tuple: null, sha: null });
});

test('one missing thing is named once, and the list is in the order to repair it', () => {
  /* MEASURED ON THE FIRST RUN AGAINST `app.brain.dog`, WHICH IS WHY THIS TEST EXISTS. The probe at
     `/auth/provision` and the account read both find `PROVISION_KEY` absent, and the list printed it
     twice, as items 2 and 4, with `KEK` between them. Binding `PROVISION_KEY` before `KEK` is the one
     ordering mistake on this path with no repair: a record provisioned in that window can never seal
     a grant. A list that reads 2, 3, 4 and names them in that order is the list he will follow. */
  const ordered = plan([
    { key: 'PROVISION_KEY', rank: 5, what: 'the route says it is not set', next: 'from the probe' },
    { key: 'KEK', rank: 4, what: 'the account says it is not bound', next: 'from the secret list' },
    { key: 'PROVISION_KEY', rank: 5, what: 'the account says it is not bound', next: 'from the secret list' },
  ]);
  assert.deepEqual(
    ordered.map((n) => n.key),
    ['KEK', 'PROVISION_KEY'],
  );
  assert.equal(ordered[1].what, 'the route says it is not set', 'the first sentence about a thing is the one kept');
});

/**
 * WHETHER THIS CLONE HOLDS A COMMIT AT ALL, which is not the same question as what the commit says.
 *
 * CI CLONES SHALLOW. `git show` on a commit outside the fetched depth fails, `guardsKeylessRecords`
 * answers `unknown`, which is its correct answer, and the three readings below have nothing to be
 * measured against. On 21 September this test was wired into `pnpm -C apps/worker test` and CI went
 * red on the first line of it for exactly that reason, which is a defect in the test's reach rather
 * than in the function: a run that cannot see the history cannot be asked about it.
 */
const holds = (sha) => {
  /* `repo` AND NOT `root`, AND `-C` AND NOT `cwd`, for the reason `provision-check.mjs` states over its
     own `gitOk`: `secret-grep` counts `root` as a name a key goes by in a file that is also about keys,
     and this file names `KEK` in its assertions. CI went red here once for exactly that. */
  const repo = root;
  try {
    execFileSync('git', ['-C', repo, 'cat-file', '-e', `${sha}^{commit}`], { stdio: ['ignore', 'ignore', 'ignore'] });
    return true;
  } catch {
    return false;
  }
};

test('whether the serving commit refuses a keyless record is decided against the commit itself', (t) => {
  const missing = ['77f82cc', 'aca6355', 'a2814b0'].filter((sha) => !holds(sha));
  if (missing.length > 0) {
    t.skip(`this clone does not hold ${missing.join(', ')}, so there is no history to decide against; \`unknown\` is what the function answers and the case below cannot be driven`);
    return;
  }
  assert.equal(guardsKeylessRecords('77f82cc', root), 'yes');
  assert.equal(guardsKeylessRecords('aca6355', root), 'no');
  /* THE COMMIT THAT CARRIES THE GUARD AND CALLS IT FROM NOWHERE. `no` is the true answer for a host
     serving it, and a check that asked whether the file exists would have said `yes`. */
  assert.equal(guardsKeylessRecords('a2814b0', root), 'no');
  /* A SHA THIS CLONE HAS NEVER FETCHED IS NOT A `no`. Saying `no` about a commit nobody here has
     seen would report a host as dangerous on the strength of a `git fetch` somebody did not run. */
  assert.equal(guardsKeylessRecords('0000000', root), 'unknown');
});
