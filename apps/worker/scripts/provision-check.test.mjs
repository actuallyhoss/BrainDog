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
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { environmentOf, guardsKeylessRecords, plan, readBuild, readMethods, readProvision, wranglerConfig } from './provision-check.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

test('the host a person names decides which environment, which bucket and which vars are read', () => {
  const config = wranglerConfig(root);

  const production = environmentOf(config, 'app.brain.dog');
  assert.equal(production?.name, 'production');
  assert.equal(production?.bucket, 'braindog-blobs');
  assert.equal(production?.vars.PUBLIC_HOST, 'app.brain.dog');

  const alpha = environmentOf(config, 'app.alpha.brain.dog');
  assert.equal(alpha?.name, 'alpha');
  assert.equal(alpha?.bucket, 'braindog-blobs-alpha');

  /* A HOST THIS FILE DOES NOT NAME IS NOT A GUESS. A rehearsal host on `localhost` is a real thing
     to run this against, and pretending it is production would read production's bucket name. */
  assert.equal(environmentOf(config, 'localhost:8787'), null);
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

test('whether the serving commit refuses a keyless record is decided against the commit itself', () => {
  assert.equal(guardsKeylessRecords('77f82cc', root), 'yes');
  assert.equal(guardsKeylessRecords('aca6355', root), 'no');
  /* THE COMMIT THAT CARRIES THE GUARD AND CALLS IT FROM NOWHERE. `no` is the true answer for a host
     serving it, and a check that asked whether the file exists would have said `yes`. */
  assert.equal(guardsKeylessRecords('a2814b0', root), 'no');
  /* A SHA THIS CLONE HAS NEVER FETCHED IS NOT A `no`. Saying `no` about a commit nobody here has
     seen would report a host as dangerous on the strength of a `git fetch` somebody did not run. */
  assert.equal(guardsKeylessRecords('0000000', root), 'unknown');
});
