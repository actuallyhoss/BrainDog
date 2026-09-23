/**
 * The answers `deploy.yml` asks for after a deploy, judged offline against the answers they could be, in each of the
 * three pushes of the one-domain move.
 *
 *   node --test --experimental-strip-types "apps/worker/scripts/*.test.mjs"
 *
 * EACH CHECK HAS A WRONG ANSWER THAT LOOKS RIGHT, AND THAT IS WHAT THIS FILE PINS. Two Workers answer one hostname after
 * the zone routes land (`loop/research-one-domain.md` section 2.2), and the site's 404 page is a perfectly healthy
 * response from the wrong Worker. A smoke step that reads "not 5xx" as green would pass a deploy where every `/api`
 * call reaches the marketing site. So each judgement below is held against the answer the other Worker would give, not
 * only against the one it should.
 *
 * THE SAME STEP RUNS AFTER EVERY PUSH, AND THE FILE DECIDES WHAT IT ASKS. Push A is `wrangler.jsonc` as it stands, and
 * the two after it are the fragments in that file's opening comment, applied by `pushes`. The wave-thirty-nine version
 * of this step asked `https://<PUBLIC_HOST>/pricing`, which in push A is `app.brain.dog/pricing`: the Worker's page, not
 * the site, so a good dark deploy would have gone red (`loop/research-one-domain-cutover.md` §2.3).
 *
 * NOTHING HERE TOUCHES THE NETWORK. `checks` and `judge` are pure; `smoke()` is one `fetch` per check.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { pushes, wranglerConfig } from './provision-check.mjs';
import { checks, judge } from './smoke.mjs';

const html = { 'content-type': 'text/html; charset=utf-8' };
const json = { 'content-type': 'application/json' };
const answer = (status, headers = {}) => ({ status, headers: new Headers(headers) });
const staged = (name) => {
  const push = pushes().find((p) => p.name === name);
  assert.ok(push, `no push ${name}`);
  return push.config;
};
const asked = (list) => list.map((c) => `${c.method} ${c.url}`);

test('push A asks the app on its own name, and asks nothing of brain.dog, which is still only the site', () => {
  assert.deepEqual(asked(checks(wranglerConfig(), 'production')), [
    'GET https://app.brain.dog/app/',
    'GET https://app.brain.dog/api/boot',
    'GET https://app.brain.dog/r/x',
    'POST https://app.brain.dog/in/anything',
  ]);
  assert.deepEqual(asked(checks(wranglerConfig(), 'alpha')), [
    'GET https://app.alpha.brain.dog/app/',
    'GET https://app.alpha.brain.dog/api/boot',
    'GET https://app.alpha.brain.dog/r/x',
    'POST https://app.alpha.brain.dog/in/anything',
  ]);
});

test('push A2 asks the site and the routed doors on brain.dog as well, before anything depends on them', () => {
  assert.deepEqual(asked(checks(staged('A2'), 'production')), [
    'GET https://app.brain.dog/app/',
    'GET https://app.brain.dog/api/boot',
    'GET https://brain.dog/pricing',
    'GET https://brain.dog/app/',
    'GET https://brain.dog/api/boot',
    'GET https://app.brain.dog/r/x',
    'POST https://app.brain.dog/in/anything',
  ]);
});

test('push B is asked the five answers of the design, on the two names it holds', () => {
  assert.deepEqual(asked(checks(staged('B'), 'production')), [
    'GET https://brain.dog/pricing',
    'GET https://brain.dog/app/',
    'GET https://brain.dog/api/boot',
    'GET https://app.brain.dog/r/x',
    'POST https://app.brain.dog/in/anything',
  ]);
  assert.deepEqual(asked(checks(staged('B'), 'alpha')), [
    'GET https://alpha.brain.dog/pricing',
    'GET https://alpha.brain.dog/app/',
    'GET https://alpha.brain.dog/api/boot',
    'GET https://app.alpha.brain.dog/r/x',
    'POST https://app.alpha.brain.dog/in/anything',
  ]);
});

test('each check refuses the answer the wrong Worker would give', () => {
  const [pricing, shell, boot, legacy, door] = checks(staged('B'), 'production');

  assert.equal(judge(pricing, answer(200, html)), null);
  /* THE PRODUCT WORKER'S ANSWER AT A SITE PATH is JSON: a zone route too wide, taking `/pricing` from the site. */
  assert.match(judge(pricing, answer(404, json)) ?? '', /site/);

  assert.equal(judge(shell, answer(200, html)), null);
  /* THE SITE'S 404 PAGE AT `/app/` is the zone route for `/app/*` missing, or a Worker older than the shell. */
  assert.match(judge(shell, answer(404, html)) ?? '', /\/app/);

  assert.equal(judge(boot, answer(401, json)), null);
  /* A 404 PAGE AT `/api/boot` is the marketing site answering an API call. */
  assert.match(judge(boot, answer(404, html)) ?? '', /zone route/);
  /* AND A 401 THAT IS NOT JSON is something in front of the Worker, not the Worker refusing. */
  assert.ok(judge(boot, answer(401, html)));

  const moved = answer(308, { location: 'https://brain.dog/app/r/x' });
  assert.equal(judge(legacy, moved), null);
  /* A REDIRECT TO THE WRONG PLACE, or a temporary one, is not the move: a 302 is re-asked every time and a Location
     without `/app` lands on the site. */
  assert.ok(judge(legacy, answer(308, { location: 'https://brain.dog/r/x' })));
  assert.ok(judge(legacy, answer(302, { location: 'https://brain.dog/app/r/x' })));
  /* AND THE SHELL WITH A 200 on the old name is a Worker that does not know the name is old. */
  assert.ok(judge(legacy, answer(200, html)));

  /* A DOOR ON THE OLD NAME IS SERVED, NEVER MOVED. `serveIngest` answers an unknown door 404, which is a served answer;
     any 3xx is a webhook sender's POST turned into a GET, or dropped. */
  assert.equal(judge(door, answer(404, json)), null);
  assert.match(judge(door, answer(308, { location: 'https://brain.dog/app/in/anything' })) ?? '', /redirect/);
});

test('push A: the front door is a 308 into /app on the same name, and the Worker before that fix is told apart', () => {
  const [shell, boot, front, door] = checks(wranglerConfig(), 'production');
  assert.equal(front.headers?.accept, 'text/html', 'a page load says it wants a page, or the Worker rightly leaves it alone');
  assert.equal(judge(front, answer(308, { location: 'https://app.brain.dog/app/r/x' })), null);
  /* THE WORKER WITHOUT THE SAME-HOST REDIRECT answers `ROUTE_UNKNOWN` in JSON here, which is the site's "Open the app"
     and every mailed magic link landing on an error. Measured in the cut-over survey, §2.2. */
  assert.match(judge(front, answer(404, json)) ?? '', /ROUTE_UNKNOWN|same name/);
  /* AND A REDIRECT TO brain.dog IN PUSH A is the flip's vars deployed without its routes: the site's 404 for everyone. */
  assert.match(judge(front, answer(308, { location: 'https://brain.dog/app/r/x' })) ?? '', /brain\.dog/);

  /* ON A CUSTOM DOMAIN NO ROUTE CAN BE MISSING, so a page at `/app/` is a Worker older than the shell, and the sentence
     must not send anybody to look for a zone route that push A deliberately does not have. */
  assert.equal(judge(shell, answer(200, html)), null);
  const old = judge(shell, answer(404, json)) ?? '';
  assert.ok(old.length > 0);
  assert.doesNotMatch(old, /zone route/);
  assert.equal(judge(boot, answer(401, json)), null);
  assert.doesNotMatch(judge(boot, answer(404, html)) ?? '', /zone route/);

  assert.equal(judge(door, answer(404, json)), null);
  assert.ok(judge(door, answer(308, { location: 'https://app.brain.dog/app/in/anything' })));
});

test('a public host that is neither a Custom Domain nor a zone route of the Worker is refused before anything is asked', () => {
  const config = structuredClone(wranglerConfig());
  config.env.production.routes = [];
  assert.throws(() => checks(config, 'production'), /app\.brain\.dog/);
});

test('the pinned demo turns the anonymous boot into a 200, and the check follows the file', () => {
  const pinned = structuredClone(staged('B'));
  pinned.env.production.vars.DEMO_RECORD = 'rec_01J8ZK3Q7M0000000000000000';
  const boot = checks(pinned, 'production').find((c) => c.url.endsWith('/api/boot'));
  assert.ok(boot);
  assert.equal(judge(boot, answer(200, json)), null);
  assert.ok(judge(boot, answer(401, json)), 'a pinned demo that answers 401 is a deploy that lost its --var');
});
