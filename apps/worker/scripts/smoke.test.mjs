/**
 * The answers `deploy.yml` asks for after a deploy, judged offline against the answers they could be, in each push of
 * the one-domain move.
 *
 *   node --test --experimental-strip-types "apps/worker/scripts/*.test.mjs"
 *
 * EACH CHECK HAS A WRONG ANSWER THAT LOOKS RIGHT, AND THAT IS WHAT THIS FILE PINS. Two Workers answer one hostname once
 * the site binds the app, and the site's 404 page is a perfectly healthy
 * response from the wrong Worker. A smoke step that reads "not 5xx" as green would pass a deploy where every `/api`
 * call reaches the marketing site. So each judgement below is held against the answer the other Worker would give, not
 * only against the one it should.
 *
 * THE SAME STEP RUNS AFTER EVERY PUSH, AND THE TWO FILES DECIDE WHAT IT ASKS. `wrangler.jsonc` as it stands is B2, both
 * environments flipped, and `pushes` names it so. B1, production still in push A's shape, is the file with production's
 * flip taken back out (`flip-fixture.mjs`), because that is what a rollback of push 4 deploys behind push 3's site, and
 * the smoke step still has to judge it. The site each push is made beside
 * is built in memory (`site-fixture.mjs`), so these tests say the same thing before and after the commit that binds a
 * site; the one test that reads the real site says so in its name. An earlier version of this step asked
 * `https://<PUBLIC_HOST>/pricing`, which in push A is `app.brain.dog/pricing`: the Worker's page, not the site, so a
 * good dark deploy would have gone red.
 *
 * NOTHING HERE TOUCHES THE NETWORK. `checks` and `judge` are pure; `smoke()` is one `fetch` per check.
 */

import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { pushes, siteBinding, siteConfig, wranglerConfig } from './provision-check.mjs';
import { flipped, unflipped } from './flip-fixture.mjs';
import { UNBOUND, boundSite } from './site-fixture.mjs';
import { FIRST_DRAW } from '../../web/src/lib/record/first-draw.ts';
import smoke, { argsFor, canary, checks, judge, migrationCount, readCheck, refusals } from './smoke.mjs';
import { ELSEWHERE, FILE_MOST, HELD as FENCE_HELD, PNG, PNG_SHA256, UNAUTHORIZED_BODY, fenceChecks, heldOf } from './fence.mjs';
import { FILE_HEADERS, FILE_MOST as WORKER_MOST, agrees, sniff } from '../src/files.ts';

const html = { 'content-type': 'text/html; charset=utf-8' };
const json = { 'content-type': 'application/json' };
const answer = (status, headers = {}, text = '') => ({ status, headers: new Headers(headers), text });
/* THE SHARED NAME PUBLIC, which is push B2's shape. The file is push C (the app on its own name) and these tests are about
   the checks' answers to the shared-name shape, so it is built from the file with that flip put in. */
const staged = () => flipped(wranglerConfig());
const asked = (list) => list.map((c) => `${c.method} ${c.url}`);

/* THE SITE AFTER PUSH 1 (alpha bound) AND AFTER PUSH 3 (both). */
const ALPHA_BOUND = boundSite({ alpha: 'braindog-alpha' });
const BOTH_BOUND = boundSite({ alpha: 'braindog-alpha', production: 'braindog-production' });
/* B1: ALPHA FLIPPED AND PRODUCTION NOT, which the file was from push 2 to push 4 and a rollback of push 4 lands on. */
const B1 = unflipped(flipped(wranglerConfig()), ['production']);

test('production in push A\'s shape beside a site that does not bind it asks the app on its own name, and asks nothing of brain.dog, which is still only the site', () => {
  assert.deepEqual(asked(checks(B1, 'production', UNBOUND)), [
    'GET https://app.brain.dog/app/signin?from=smoke',
    'GET https://app.brain.dog/',
    'GET https://app.brain.dog/signin',
    'GET https://app.brain.dog/api/boot',
    'GET https://app.brain.dog/healthz',
    'GET https://app.brain.dog/app/r/x',
    'POST https://app.brain.dog/in/anything',
  ]);
  /* PUSH 1'S SITE BINDS ALPHA ALONE, and production is asked exactly what it was asked beside no binding at all. */
  assert.deepEqual(asked(checks(B1, 'production', ALPHA_BOUND)), asked(checks(B1, 'production', UNBOUND)));
});

test('once production\'s site binds production\'s app (push 3), production is asked the site and the doors on brain.dog as well, before its flip', () => {
  /* THE WINDOW ALPHA WAS IN BETWEEN PUSH 1 AND PUSH 2, and production is in it between push 3 and push 4: the app on
     both names, its own name still the public host, and `brain.dog` shared with the site, so `/slash` is asked there
     first. The app is at the root of its own name, so the shared name is asked its doors and no page. */
  assert.deepEqual(asked(checks(B1, 'production', BOTH_BOUND)), [
    'GET https://app.brain.dog/app/signin?from=smoke',
    'GET https://app.brain.dog/',
    'GET https://app.brain.dog/signin',
    'GET https://app.brain.dog/api/boot',
    'GET https://app.brain.dog/healthz',
    'GET https://brain.dog/slash',
    'GET https://brain.dog/api/boot',
    'GET https://brain.dog/healthz',
    'GET https://app.brain.dog/app/r/x',
    'POST https://app.brain.dog/in/anything',
  ]);
});

test('each flip is asked the five answers of the design and /healthz, on the two names it holds', () => {
  assert.deepEqual(asked(checks(B1, 'alpha', ALPHA_BOUND)), [
    'GET https://alpha.brain.dog/slash',
    'GET https://alpha.brain.dog/app/signin?from=smoke',
    'GET https://alpha.brain.dog/',
    'GET https://alpha.brain.dog/signin',
    'GET https://alpha.brain.dog/api/boot',
    'GET https://alpha.brain.dog/healthz',
    'GET https://app.alpha.brain.dog/app/r/x',
    'POST https://app.alpha.brain.dog/in/anything',
  ]);
  assert.deepEqual(asked(checks(staged('B2'), 'production', BOTH_BOUND)), [
    'GET https://brain.dog/slash',
    'GET https://brain.dog/app/signin?from=smoke',
    'GET https://brain.dog/',
    'GET https://brain.dog/signin',
    'GET https://brain.dog/api/boot',
    'GET https://brain.dog/healthz',
    'GET https://app.brain.dog/app/r/x',
    'POST https://app.brain.dog/in/anything',
  ]);
});

test('the file as it deploys: the app at the root of its own name, and both old addresses asked for their one 308', () => {
  const config = wranglerConfig();
  assert.deepEqual(asked(checks(config, 'production', BOTH_BOUND)), [
    'GET https://app.brain.dog/app/signin?from=smoke',
    'GET https://app.brain.dog/',
    'GET https://app.brain.dog/signin',
    'GET https://app.brain.dog/api/boot',
    'GET https://app.brain.dog/healthz',
    'GET https://brain.dog/slash',
    'GET https://brain.dog/app/signin?from=smoke',
    'GET https://brain.dog/api/boot',
    'GET https://brain.dog/healthz',
    'GET https://brain.dog/app/r/x',
    'POST https://brain.dog/in/anything',
  ]);
  const list = checks(config, 'production', BOTH_BOUND);
  /* BOTH OLD ADDRESSES ARE ONE 308 TO THE ROOT OF THE APP'S NAME, QUERY KEPT: on the site's name, and on the app's own. */
  for (const url of ['https://brain.dog/app/signin?from=smoke', 'https://app.brain.dog/app/signin?from=smoke']) {
    const front = list.find((c) => c.url === url);
    assert.equal(front.headers?.accept, 'text/html', 'a page load says it wants a page, or the Worker rightly leaves it alone');
    assert.equal(judge(front, answer(308, { location: 'https://app.brain.dog/signin?from=smoke' })), null);
    /* A SECOND HOP, A QUERY DROPPED, OR THE SHELL STILL DRAWN UNDER `/app`, is not the move. */
    assert.match(judge(front, answer(308, { location: 'https://app.brain.dog/app/signin?from=smoke' })) ?? '', /second hop/);
    assert.ok(judge(front, answer(308, { location: 'https://app.brain.dog/signin' })));
    assert.match(judge(front, answer(200, html)) ?? '', /under \/app/);
  }
  assert.match(judge(list.find((c) => c.url === 'https://brain.dog/app/signin?from=smoke'), answer(404, html)) ?? '', /does not hand \/app\/\*/);
  /* THE APP'S OWN PAGES ARE THE SHELL AT THE ROOT, and a Worker that still sends them into `/app` is told apart. */
  for (const url of ['https://app.brain.dog/', 'https://app.brain.dog/signin']) {
    const page = list.find((c) => c.url === url);
    assert.equal(judge(page, answer(200, html)), null);
    assert.match(judge(page, answer(308, { location: 'https://app.brain.dog/app/' })) ?? '', /older than the app at the root/);
  }
  const moved = list.find((c) => c.url === 'https://brain.dog/app/r/x');
  assert.equal(judge(moved, answer(308, { location: 'https://app.brain.dog/r/x' })), null);
  assert.ok(judge(moved, answer(308, { location: 'https://app.brain.dog/app/r/x' })));
  assert.ok(judge(moved, answer(308, { location: 'https://brain.dog/r/x' })));
  const door = list.find((c) => c.url === 'https://brain.dog/in/anything');
  assert.equal(judge(door, answer(404, json)), null);
  assert.ok(judge(door, answer(308, { location: 'https://app.brain.dog/in/anything' })));
});

test('each check refuses the answer the wrong Worker would give', () => {
  const [pricing, , shell, , boot, , legacy, door] = checks(staged('B2'), 'production', BOTH_BOUND);

  assert.equal(judge(pricing, answer(200, html)), null);
  /* THE PRODUCT WORKER'S ANSWER AT A SITE PATH is JSON: the site's `run_worker_first` too wide, handing `/pricing` to
     the app. */
  assert.match(judge(pricing, answer(404, json)) ?? '', /run_worker_first/);

  assert.equal(judge(shell, answer(200, html)), null);
  /* THE SITE'S 404 PAGE AT `/` on a name the site hands over is the site keeping the page. */
  assert.match(judge(shell, answer(404, html)) ?? '', /does not hand \//);

  assert.equal(judge(boot, answer(401, json)), null);
  /* A 404 PAGE AT `/api/boot` is the marketing site answering an API call. */
  assert.match(judge(boot, answer(404, html)) ?? '', /site .*does not hand \/api\/\*/);
  /* AND A 401 THAT IS NOT JSON is something in front of the Worker, not the Worker refusing. */
  assert.ok(judge(boot, answer(401, html)));

  const moved = answer(308, { location: 'https://brain.dog/r/x' });
  assert.equal(judge(legacy, moved), null);
  /* A REDIRECT TO THE WRONG PLACE, or a temporary one, is not the move: a 302 is re-asked every time and a Location
     still under `/app` is a second hop. */
  assert.ok(judge(legacy, answer(308, { location: 'https://brain.dog/app/r/x' })));
  assert.ok(judge(legacy, answer(302, { location: 'https://brain.dog/r/x' })));
  /* AND THE SHELL WITH A 200 on the old name is a Worker that does not know the name is old. */
  assert.ok(judge(legacy, answer(200, html)));

  /* A DOOR ON THE OLD NAME IS SERVED, NEVER MOVED. `serveIngest` answers an unknown door 404, which is a served answer;
     any 3xx is a webhook sender's POST turned into a GET, or dropped. */
  assert.equal(judge(door, answer(404, json)), null);
  assert.match(judge(door, answer(308, { location: 'https://brain.dog/in/anything' })) ?? '', /redirect/);
});

test('with no old name, the app’s own /app is the one asked to move, and a Worker that does not move it is told apart', () => {
  const [, shell, , boot, , front, door] = checks(B1, 'production', UNBOUND);
  assert.equal(front.headers?.accept, 'text/html', 'a page load says it wants a page, or the Worker rightly leaves it alone');
  assert.equal(judge(front, answer(308, { location: 'https://app.brain.dog/r/x' })), null);
  /* THE WORKER WITHOUT THE MOVE draws the shell under `/app`, which is every link and magic link already mailed opening
     the old address. */
  assert.match(judge(front, answer(200, html)) ?? '', /same name/);
  /* AND A REDIRECT TO brain.dog IN PUSH A is the flip's vars deployed before the site hands that name the doors: the
     site's 404 for everyone. */
  assert.match(judge(front, answer(308, { location: 'https://brain.dog/r/x' })) ?? '', /brain\.dog/);

  /* ON A CUSTOM DOMAIN THE SITE IS NOT IN THE PATH, so a page at `/` that is not the shell is a Worker whose build has
     no root `index.html`, and the sentence must not send anybody to look at a site binding that has nothing to do with
     this name. */
  assert.equal(judge(shell, answer(200, html)), null);
  const old = judge(shell, answer(404, json)) ?? '';
  assert.ok(old.length > 0);
  assert.doesNotMatch(old, /site/);
  assert.equal(judge(boot, answer(401, json)), null);
  assert.doesNotMatch(judge(boot, answer(404, html)) ?? '', /site/);

  assert.equal(judge(door, answer(404, json)), null);
  assert.ok(judge(door, answer(308, { location: 'https://app.brain.dog/in/anything' })));
});

test('a public host nothing reaches is refused before anything is asked, and the sentence says which key is missing', () => {
  const config = structuredClone(B1);
  config.env.production.routes = [];
  assert.throws(() => checks(config, 'production', UNBOUND), /app\.brain\.dog/);
  /* B1 BESIDE A SITE THAT DOES NOT BIND ALPHA: push 2 landing before push 1, which is every door on `alpha.brain.dog`
     answering the alpha site's 404 page. */
  assert.throws(() => checks(flipped(wranglerConfig()), 'alpha', UNBOUND), /alpha\.brain\.dog .*env\.alpha has no main/);
  /* B2 BESIDE PUSH 1'S SITE: production's flip before production's site is bound, which is every door on `brain.dog`
     answering the site's 404 page. */
  assert.throws(() => checks(staged('B2'), 'production', ALPHA_BOUND), /brain\.dog .*env\.production has no main/);
  /* AND BESIDE A SITE THAT BINDS PRODUCTION'S NAME TO ALPHA'S APP. Every door would answer, from alpha's records. */
  const crossed = boundSite({ alpha: 'braindog-alpha', production: 'braindog-alpha' });
  assert.throws(() => checks(staged('B2'), 'production', crossed), /binds APP to braindog-alpha/);
});

/* THE PUBLIC DEMO IS GONE, and with it the one var that turned the anonymous boot into
   a 200. A file that still carries a well-formed `DEMO_RECORD` deploys a Worker that reads it nowhere, so the check has
   to expect the 401 whatever the file says: a 200 there is a Worker older than the removal, or a door nobody meant. */
test('the anonymous boot is 401 JSON whatever the file says, a leftover DEMO_RECORD included', () => {
  const pinned = structuredClone(staged('B2'));
  pinned.env.production.vars.DEMO_RECORD = 'rec_01J8ZK3Q7M0000000000000000';
  const boot = checks(pinned, 'production', BOTH_BOUND).find((c) => c.url.endsWith('/api/boot'));
  assert.ok(boot);
  assert.equal(boot.expects, '401 JSON');
  assert.equal(judge(boot, answer(401, json)), null);
  assert.ok(judge(boot, answer(200, json)), 'an anonymous boot answered 200 and the check passed it');
});

test('the real files: the deploy step reads the site by default, and asks a site name exactly when that site binds its own environment\'s app', () => {
  /* READS BOTH REAL FILES, AND HOLDS AT EVERY COMMIT OF THE MOVE: before push 1, when the site binds nothing, and after
     it, when alpha's does. A site that binds an environment to anything but that environment's app is a failure here
     whenever it lands. */
  const config = wranglerConfig();
  const site = siteConfig();
  for (const name of ['production', 'alpha']) {
    const binding = siteBinding(config, site, name);
    if ((site.env?.[name]?.services ?? []).some((s) => s.binding === 'APP')) assert.equal(binding.why, null, `${name}: the site binds APP and does not hand this app its doors`);
    const list = asked(checks(config, name));
    assert.deepEqual(list, asked(checks(config, name, site)), `${name}: checks() without a site is not the real site`);
    const host = config.env[name].vars.PUBLIC_HOST;
    for (const on of binding.names.filter((n) => n !== host)) assert.ok(list.includes(`GET https://${on}/slash`), `${name}: ${on} is the app's through the site and is not asked`);
    if (binding.names.length === 0) assert.ok(!list.some((c) => c.endsWith('/slash')), `${name}: a site that does not bind this app is asked for /pricing`);
  }
});

/* `/healthz` ON EVERY NAME THE APP IS ON, WITH ITS `kernel` HELD TO THE CHECKOUT. The wrong answers that look
   right are the site's 404 page on a shared name, which is every uptime monitor reading the marketing site, and a
   healthy 200 from a build that is not this one. */
test('/healthz passes only the liveness answer of this build, and names the site when the site keeps the door', () => {
  const list = checks(staged('B2'), 'production', BOTH_BOUND, 18);
  const health = list.find((c) => c.url === 'https://brain.dog/healthz');
  assert.ok(health, 'brain.dog is not asked /healthz');
  const live = (kernel) => answer(200, json, JSON.stringify({ ok: true, app: '2026.09.25+1a09462', format: 1, kernel, primitives: 1 }));

  assert.equal(judge(health, live(18)), null);
  assert.match(judge(health, live(16)) ?? '', /kernel 16.*18 migration files/);
  assert.match(judge(health, answer(404, html)) ?? '', /site on brain\.dog does not hand \/healthz/);
  assert.ok(judge(health, answer(404, json, '{"ok":false}')), 'a Worker older than /healthz passed');
  assert.ok(judge(health, answer(200, json, '{"ok":false,"kernel":18}')));
  assert.ok(judge(health, answer(200, html, '<!doctype html>')));

  /* ON THE WORKER'S OWN NAME THE SITE IS NOT IN THE PATH, so the sentence does not send anybody to a site binding. */
  const own = checks(B1, 'production', UNBOUND, 18).find((c) => c.url === 'https://app.brain.dog/healthz');
  assert.ok(own);
  assert.doesNotMatch(judge(own, answer(404, html)) ?? '', /site/);
});

test('the kernel count is the migration files, and nothing else in their folder', () => {
  const repo = mkdtempSync(join(tmpdir(), 'smoke-kernel-'));
  try {
    const folder = join(repo, 'packages', 'kernel', 'src', 'migrations');
    mkdirSync(folder, { recursive: true });
    for (const file of ['0001_kernel.ts', '0002_session.ts', '0017_automation_watch.ts', 'README.md', '0003_draft.test.ts', 'index.ts'])
      writeFileSync(join(folder, file), '');
    assert.equal(migrationCount(repo), 3);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
  /* AND THE REAL FOLDER NEVER HOLDS FEWER THAN PRODUCTION RAN BEFORE THE FINISH (contracts §1.2), because a migration
     is never taken away (contracts §1.1). */
  assert.ok(migrationCount() >= 16);
});

/* THE SIGNED-IN HALF. It is the only check that opens a record, so its wrong answers are the ones a migration on real
   rows or a revoked canary token give, and they have to read differently: one is the deploy, the other is not. */
test('the canary asks the record\'s boot on the public host and tells a refused token from a record that will not open', () => {
  const check = canary(staged('B2'), 'production', 'ops');
  assert.equal(check.url, 'https://brain.dog/ops/api/boot');
  assert.equal(check.method, 'GET');
  assert.equal(check.canary, true);
  assert.equal(check.headers, undefined, 'the check carries a header, and the token must be added only by smoke()');

  assert.equal(judge(check, answer(200, json, '{"ok":true}')), null);
  assert.match(judge(check, answer(401, json)) ?? '', /SMOKE_TOKEN/);
  assert.match(judge(check, answer(503, json)) ?? '', /did not open on this build/);
  assert.match(judge(check, answer(200, html)) ?? '', /shell/);
  assert.ok(judge(check, answer(404, html)));

  /* A SLUG THE DIRECTORY WOULD NOT HAND OUT is refused before anything is asked, and so is one that would reach a path. */
  for (const slug of ['', 'Ops', '../api', 'ops/x', '-ops', 'o']) assert.throws(() => canary(staged('B2'), 'production', slug), /SMOKE_SLUG/, slug);
});

test('without both SMOKE_TOKEN and SMOKE_SLUG no check opens a record', () => {
  for (const name of ['production', 'alpha']) {
    const list = checks(staged('B2'), name, BOTH_BOUND);
    assert.ok(list.every((c) => !c.canary && !/^https:\/\/[^/]+\/(?:app\/)?[a-z][a-z0-9-]*[a-z0-9]\/api\//.test(c.url)), `${name}: an unsigned check reaches a record's API`);
  }
});

/* THE SIGNED-IN HALF, RUN WHOLE AGAINST A STUB. The stub answers the unsigned checks with whichever answer
   each one's own judge passes, so these tests say only what the canary's questions do. */
const TOKEN = 'rec_ops.s3cret';
const NOWHERE = 'nobody-0011223344556677';
const GOOD = [
  answer(200, html, '<!doctype html>'),
  answer(401, json, '{"code":"AUTH_REQUIRED"}'),
  answer(200, json, JSON.stringify({ ok: true, kernel: migrationCount() })),
  answer(308, { location: 'https://brain.dog/signin?from=smoke' }),
  answer(308, { location: 'https://brain.dog/r/x' }),
  answer(404, json, '{"code":"INGEST_UNKNOWN"}'),
];
const HELD = {
  boot: { registers: [{ id: 'session', count: 1 }, { id: 'tasks', count: 3 }] },
  packs: [{ id: 'off', disabled_at: '2026-01-01' }, { id: 'money', disabled_at: null }],
  pages: [{ slug: 'home', title: 'Home', about: null }],
  list: { rows: [{ seq: 3, fields: {} }], cursor: null },
};

/** A stub host: `faults` maps a method to the answer it gives instead, `held` what the canary holds. */
function host({ faults = {}, held = HELD, stranger = null, elsewhere = null, fence = null } = {}) {
  const sent = [];
  const unsigned = checks(staged('B2'), 'production', BOTH_BOUND);
  const io = async (url, init) => {
    const u = new URL(url);
    const bearer = init.headers?.authorization ?? null;
    sent.push({ method: init.method, url, bearer, body: init.body, origin: init.headers?.origin ?? null });
    if (init.headers?.origin === ELSEWHERE) return fenceHost(url, init, fence);
    const at = u.pathname.match(/^\/(?!api\/)([a-z0-9-]+)\/api\/(\w+)$/);
    if (!at) {
      const check = unsigned.find((c) => c.url === url && c.method === init.method);
      assert.ok(check, `asked ${init.method} ${url}, which no check names`);
      const good = GOOD.find((a) => judge(check, a) === null);
      return new Response(good.status === 308 ? null : good.text, { status: good.status, headers: good.headers });
    }
    const [, slug, method] = at;
    /* IN THE HOST'S OWN ENVELOPE, `{ ok, value }` and `{ ok: false, refusal }`, as `packages/client` reads it: a stub
       answering bare bodies passed while the real host's answers named nothing for the reads after the bare four. */
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: json });
    const refuse = (status, code, fix) => reply(status, { ok: false, refusal: { code, fix } });
    if (slug !== 'ops') return elsewhere ?? refuse(404, 'RECORD_UNKNOWN', `There is no record called ${slug}.`);
    if (bearer !== `Bearer ${TOKEN}`) return stranger ?? refuse(401, 'AUTH_REQUIRED', 'Sign in.');
    if (faults[method]) return faults[method]();
    return reply(200, { ok: true, value: held[method] ?? {} });
  };
  return { sent, io };
}

const run = async (opts = {}, signedIn = { token: TOKEN, slug: 'ops' }, more = {}) => {
  const lines = [];
  const { sent, io } = host(opts);
  const code = await smoke('production', staged('B2'), BOTH_BOUND, signedIn, { fetch: io, log: (l) => lines.push(l), nowhere: NOWHERE, ...more });
  return { code, lines, sent, out: lines.join('\n') };
};

test('the canary is opened as a first draw opens it, every read of the list asked with the token, and none of it printed', async () => {
  const { code, out, sent } = await run();
  assert.equal(code, 0, out);
  const signed = sent.filter((s) => s.url.includes('/ops/api/'));
  for (const read of FIRST_DRAW) assert.ok(signed.some((s) => new URL(s.url).pathname === `/ops/api/${read.method}` && s.bearer), read.method);
  assert.ok(sent.some((s) => s.url === 'https://brain.dog/ops/api/version' && s.bearer === null), 'version is not asked without the bearer');
  assert.ok(sent.some((s) => s.url === `https://brain.dog/${NOWHERE}/api/boot` && s.bearer === `Bearer ${TOKEN}`));
  /* WHAT EACH IS ABOUT IS READ FROM THE BARE ANSWERS: the first list holding rows, the add-on switched on, the first page. */
  assert.ok(sent.some((s) => s.url === 'https://brain.dog/ops/api/list?register=tasks&limit=1'));
  assert.ok(sent.some((s) => s.url === 'https://brain.dog/ops/api/packConfig?id=money'));
  assert.ok(sent.some((s) => s.url === 'https://brain.dog/ops/api/page?slug=home'));
  assert.ok(sent.some((s) => s.url === 'https://brain.dog/ops/api/get?register=tasks&seq=3'));
  const preview = sent.find((s) => s.url.endsWith('/api/previewPage'));
  assert.equal(preview.method, 'POST');
  assert.equal(JSON.parse(preview.body).body.blocks[0].source, 'register.tasks');
  assert.ok(!out.includes('s3cret'), 'the token is printed');
  assert.match(out, /\/account\/usage is not asked/);
  assert.doesNotMatch(out, /Bearer /, 'a bearer is printed');
});

test('a first-draw read that answers 500 turns the step red by itself, and the line says which screen breaks', async () => {
  const { code, out } = await run({ faults: { pages: () => new Response('{"code":"INTERNAL"}', { status: 500, headers: json }) } });
  assert.equal(code, 1);
  assert.match(out, /WRONG {2}GET https:\/\/brain\.dog\/ops\/api\/pages[\s\S]*answered 500: Home, finding/);
  /* AND A READ NAMED FROM IT IS SAID, NOT GUESSED. */
  assert.match(out, /skip {3}page: the canary has no page/);
});

test('version told to a stranger is red', async () => {
  const { code, out } = await run({ stranger: new Response('{"version":9}', { status: 200, headers: json }) });
  assert.equal(code, 1);
  assert.match(out, /told to a stranger/);
});

test('the token at a second name must be refused, naming nothing of the canary', async () => {
  const opened = await run({ elsewhere: new Response('{"registers":[]}', { status: 200, headers: json }) });
  assert.equal(opened.code, 1);
  assert.match(opened.out, /opened a record it was not minted for/);
  const named = await run({ elsewhere: new Response('{"code":"FORBIDDEN","fix":"This token is for ops."}', { status: 403, headers: json }) });
  assert.equal(named.code, 1);
  assert.match(named.out, /names the canary's record/);
  const broke = await run({ elsewhere: new Response('oops', { status: 500 }) });
  assert.equal(broke.code, 1);
});

test('a canary that holds nothing to name skips those reads and says so, which is not a fault', async () => {
  const { code, out } = await run({ held: { boot: { registers: [{ id: 'session', count: 0 }] }, packs: [], pages: [] } });
  assert.equal(code, 0, out);
  for (const m of ['schema', 'list', 'previewPage']) assert.match(out, new RegExp(`skip {3}${m}: the canary holds no list`));
  assert.match(out, /skip {3}packConfig: the canary has no plugin/);
  assert.match(out, /skip {3}get: the canary has no row to open/);
});

test('without the token nothing signed in is asked, and one line says the half was skipped', async () => {
  const { code, out, sent } = await run({}, {});
  assert.equal(code, 0, out);
  assert.ok(sent.every((s) => !s.url.includes('/ops/') && !s.bearer));
  assert.match(out, /the signed-in half is skipped/);
});

test('the pure parts: names, the second name, and how a read is sent', () => {
  assert.throws(() => refusals(staged('B2'), 'production', 'ops', 'ops'), /second name/);
  assert.throws(() => refusals(staged('B2'), 'production', 'ops', '../x'), /second name/);
  const [version, elsewhere] = refusals(staged('B2'), 'production', 'ops', NOWHERE, TOKEN);
  assert.equal(version.canary, undefined);
  assert.equal(elsewhere.canary, true);
  assert.equal(judge(elsewhere, answer(404, json, `{"fix":"There is no record called ${NOWHERE}."}`)), null);
  assert.deepEqual(argsFor({ method: 'schema', ask: 'list' }, { boot: HELD.boot }), { args: { register: 'tasks' } });
  assert.ok(argsFor({ method: 'x', ask: 'other' }, {}).skip);
  const post = readCheck(staged('B2'), 'production', 'ops', { method: 'previewPage', ask: 'body', post: true, by: 'Home' }, { body: { page: 'p' } });
  assert.equal(post.url, 'https://brain.dog/ops/api/previewPage');
  assert.equal(post.body, '{"body":{"page":"p"}}');
});

/* THE FENCE, RUN WHOLE AGAINST ITS OWN STUB. `fenceHost` gives each of the fence's questions the
   answer the hosts give once LCH-C08 lands: the file door's own headers, sniff and type rule from `files.ts`, so the
   stub cannot drift from the door it stands in for. `wrong` is `{ check, answer }`, or a list of them: each question
   answered otherwise. */
const STORE = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const SHELL = { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'self'; script-src 'self' 'sha256-AAAA'; style-src-attr 'unsafe-inline'; frame-ancestors 'none'" };
const FENCE = fenceChecks(staged('B2'), 'production', 'ops', TOKEN);
const one = (key, n = 0) => FENCE.filter((c) => c.key === key)[n];
const sameAsk = (check, url, init) => check.method === init.method && check.url === url && (check.headers?.['content-type'] ?? null) === (init.headers?.['content-type'] ?? null);
const reply = (status, body, headers = STORE) => new Response(body === null ? null : JSON.stringify(body), { status, headers });
const refused = (status, code) => reply(status, { ok: false, refusal: { code, fix: 'unauthorized' } });

function fenceHost(url, init, wrong) {
  const instead = (wrong === null ? [] : [wrong].flat()).find((w) => sameAsk(w.check, url, init));
  if (instead) return instead.answer();
  const path = new URL(url).pathname;
  const signed = init.headers?.authorization === `Bearer ${TOKEN}`;
  if (init.method === 'OPTIONS') return new Response(null, { status: 204, headers: { allow: 'GET, POST' } });
  if (path === '/') return new Response('<!doctype html>', { status: 200, headers: SHELL });
  if (path === '/mcp') return new Response(null, { status: 405, headers: { allow: 'POST' } });
  if (!path.startsWith('/ops/')) return path === '/api/boot' || path === '/account/usage' ? reply(401, UNAUTHORIZED_BODY) : reply(200, { ok: true });
  if (!signed) return reply(401, UNAUTHORIZED_BODY);
  if (path === '/ops/api/boot') return reply(200, { ok: true, value: HELD.boot });
  if (path === '/ops/api/files/') return refused(405, 'ROUTE_UNKNOWN');
  if (init.method === 'GET')
    return path === `/ops/api/files/${PNG_SHA256}` ? new Response(PNG, { status: 200, headers: { ...FILE_HEADERS, 'content-type': 'image/png', 'content-length': String(PNG.length) } }) : refused(404, 'ROUTE_UNKNOWN');
  const bytes = typeof init.body === 'string' ? new TextEncoder().encode(init.body) : init.body;
  if (bytes.byteLength > WORKER_MOST) return refused(413, 'OUT_OF_BOUNDS');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const at = /\/files\/([0-9a-f]{64})$/.exec(path)?.[1];
  if (at && at !== sha256) return refused(422, 'CHECKSUM_MISMATCH');
  const mime = sniff(bytes);
  if (mime === null || !agrees(init.headers?.['content-type'] ?? '', mime)) return refused(415, 'BODY_MALFORMED');
  return reply(200, { sha256, mime, bytes: bytes.byteLength });
}

/** The lines one fence check printed: its own line and the sentence under it. */
const lineOf = (out, check) => {
  const lines = out.split('\n');
  const at = lines.findIndex((l) => l.endsWith(`  ${check.method} ${check.shown ?? check.url}  expects ${check.expects}`));
  if (at < 0) return '';
  let end = at + 1;
  while (end < lines.length && lines[end].startsWith('         ')) end += 1;
  return lines.slice(at, end).join('\n').trimStart();
};

test('the fence: every line green on a host that answers right, the picture put at its hash and read back from it', async () => {
  const { code, out, sent } = await run();
  assert.equal(code, 0, out);
  assert.equal(FILE_MOST, WORKER_MOST, "the fence's limit is the file door's");
  for (const check of FENCE) assert.match(lineOf(out, check), /^ok {5}/, `${check.key}: ${lineOf(out, check)}`);
  const fenced = sent.filter((s) => s.origin === ELSEWHERE);
  assert.equal(fenced.length, FENCE.length, 'every fence question carries the other site');
  assert.ok(fenced.filter((s) => s.method === 'GET' || s.method === 'OPTIONS').length >= 10, 'ten doors are asked from another site');
  const put = fenced.find((s) => s.method === 'PUT' && s.url.endsWith(PNG_SHA256));
  assert.equal(createHash('sha256').update(put.body).digest('hex'), PNG_SHA256);
  assert.ok(fenced.findIndex((s) => s === put) < fenced.findIndex((s) => s.method === 'GET' && s.url.endsWith(PNG_SHA256)), 'read back after the put');
  assert.ok(fenced.some((s) => s.method === 'PUT' && s.body?.byteLength === WORKER_MOST + 1), 'two MB and one byte is put');
  assert.ok(fenced.every((s) => s.method === 'GET' || s.method === 'OPTIONS' || new URL(s.url).pathname.startsWith('/ops/api/files')), 'it writes only files, on the canary');
});

const OPEN = { ...STORE, 'access-control-allow-origin': ELSEWHERE };
const { 'x-robots-tag': _robots, ...UNLISTED } = FILE_HEADERS;
/* EACH FENCE QUESTION, ANSWERED THE WAY A HOST THAT LOST THAT PART OF THE FENCE WOULD ANSWER IT. */
const BROKEN = [
  [one('wrong-bearer'), () => reply(200, { ok: true, value: { version: 9 } }), /opened to a guess/],
  [one('door', 0), () => reply(200, { ok: true }, OPEN), /access-control-allow-origin https:\/\/elsewhere\.example/],
  [one('door', 1), () => reply(401, UNAUTHORIZED_BODY, { 'content-type': 'application/json' }), /cache-control unset, where every JSON answer is no-store/],
  [one('door', 2), () => new Response('boom', { status: 500 }), /answered 500/],
  [one('door', 3), () => reply(200, {}, { ...STORE, 'cache-control': 'public, max-age=3600' }), /cache-control public, max-age=3600/],
  [one('door', 4), () => reply(200, {}, { ...STORE, 'access-control-allow-origin': '*' }), /access-control-allow-origin \*/],
  [one('door', 5), () => reply(401, UNAUTHORIZED_BODY, OPEN), /access-control-allow-origin/],
  [one('door', 6), () => new Response(null, { status: 405, headers: { 'access-control-allow-origin': '*' } }), /access-control-allow-origin/],
  [one('door', 7), () => reply(200, { ok: true, value: {} }, { ...OPEN, 'access-control-allow-credentials': 'true' }), /a page on another site may read it/],
  [one('door', 8), () => new Response(null, { status: 204, headers: { 'access-control-allow-origin': ELSEWHERE, 'access-control-allow-methods': 'POST' } }), /access-control-allow-origin/],
  [one('shell'), () => new Response('<!doctype html>', { status: 200, headers: { ...SHELL, 'content-security-policy': "default-src 'self'; script-src 'self' 'sha256-AAAA' 'unsafe-inline'" } }), /script-src carries 'unsafe-inline'/],
  [one('files-list'), () => reply(200, { ok: true, value: [] }), /the files can be listed/],
  [one('png-put'), () => reply(200, { sha256: '0'.repeat(64), mime: 'image/png', bytes: PNG.length }), /not its SHA-256/],
  [one('png-read'), () => new Response(PNG, { status: 200, headers: { ...UNLISTED, 'content-type': 'image/png' } }), /without noindex/],
  [one('svg-put'), () => reply(200, { sha256: '1'.repeat(64), mime: 'image/svg+xml', bytes: 90 }), /an SVG was kept/],
  [one('oversize-put'), () => reply(200, { sha256: '2'.repeat(64), mime: 'image/png', bytes: WORKER_MOST + 1 }), /over 2 MB was kept/],
  [one('false-type-put'), () => reply(200, { sha256: PNG_SHA256, mime: 'text/html', bytes: PNG.length }), /the header's word and not its bytes/],
];

test('the fence: each line goes red by itself on a host that answers that one question wrong', async () => {
  assert.equal(new Set(BROKEN.map(([check]) => check)).size, FENCE.length, 'a fence question has no wrong answer here');
  for (const [check, answer, says] of BROKEN) {
    const { code, out } = await run({ fence: { check, answer } });
    assert.equal(code, 1, `${check.key} ${check.url}: ${out}`);
    assert.match(lineOf(out, check), /^WRONG {2}/, `${check.key} ${check.url}`);
    assert.match(lineOf(out, check), says, `${check.key} ${check.url}`);
  }
  const noHash = { ...SHELL, 'content-security-policy': "default-src 'self'; script-src 'self'" };
  assert.match(judge(one('shell'), answer(200, noHash, '<!doctype html>')), /names no hash/);
  assert.match(judge(one('shell'), answer(200, { 'content-type': 'text/html' }, '<!doctype html>')), /has no script-src/);
});

/** Today's 401, as `apps/worker/src/index.ts` `unauthorized` answers it before job 2. */
const TODAY_401 = () =>
  reply(401, { ok: false, refusal: { code: 'UNAUTHORIZED', at: 'authorization', fix: 'This record takes a bearer token it already knows. If the record is yours, sign in and mint one in Settings.' } });

test('a 401 that says more than unauthorized is HELD while job 2 waits, said and not counted, and WRONG once HELD drops it', async () => {
  const check = one('wrong-bearer');
  assert.equal(heldOf(check, { status: 401, headers: new Headers(STORE), text: await TODAY_401().text() }), FENCE_HELD['unauthorized-body']);
  const held = await run({ fence: { check, answer: TODAY_401 } });
  assert.equal(held.code, 0, held.out);
  assert.match(lineOf(held.out, check), /^HELD {3}GET [\s\S]*a fix of \d+ word\(s\), and at[\s\S]*held: job 2 of LCH-C08/);
  assert.doesNotMatch(held.out, /WRONG/);
  const landed = await run({ fence: { check, answer: TODAY_401 } }, undefined, { held: {} });
  assert.equal(landed.code, 1);
  assert.match(lineOf(landed.out, check), /^WRONG {2}/);
  /* HELD NAMES A FAULT AND NOT A CHECK: the same line is red for an answer that is not the held one. */
  const opened = await run({ fence: { check, answer: () => reply(200, { ok: true, value: {} }) } });
  assert.equal(opened.code, 1);
  /* AND A HELD FAULT NEVER HIDES A FENCE-WIDE ONE: today's 401 opened to another site, or a scope refusal kept by a
     shared cache, is red for that. */
  const today = await TODAY_401().json();
  const crossed = await run({ fence: { check, answer: () => reply(401, today, OPEN) } });
  assert.equal(crossed.code, 1, crossed.out);
  assert.match(lineOf(crossed.out, check), /^WRONG {2}[\s\S]*access-control-allow-origin/);
  const put = one('png-put');
  const cached = await run({ fence: { check: put, answer: () => reply(403, { ok: false, refusal: { code: 'LEVEL_REQUIRED', fix: 'unauthorized' } }, { 'content-type': 'application/json' }) } });
  assert.equal(cached.code, 1, cached.out);
  assert.match(lineOf(cached.out, put), /^WRONG {2}[\s\S]*cache-control unset/);
});

test("a canary key that may not put a file: the five file lines are HELD and say why, and a lost picture is still red", async () => {
  const no = () => refused(403, 'LEVEL_REQUIRED');
  const puts = ['png-put', 'svg-put', 'oversize-put', 'false-type-put'].map((key) => ({ check: one(key), answer: no }));
  const read = { check: one('png-read'), answer: () => refused(404, 'ROUTE_UNKNOWN') };
  const { code, out } = await run({ fence: [...puts, read] });
  assert.equal(code, 0, out);
  for (const { check } of [...puts, read]) assert.match(lineOf(out, check), /^HELD [\s\S]*held: the canary's key may not put a file/, check.key);
  assert.equal((await run({ fence: [...puts, read] }, undefined, { held: {} })).code, 1);
  /* A 404 AFTER THE PICTURE WAS KEPT IS NO KEY'S FAULT. */
  const lost = await run({ fence: read });
  assert.equal(lost.code, 1);
  assert.match(lineOf(lost.out, read.check), /^WRONG {2}/);
});

test('no line holds the token, the wrong bearer, a cookie or the address of a file', async () => {
  const { out, sent } = await run({ fence: { check: one('wrong-bearer'), answer: TODAY_401 } });
  const wrong = sent.find((s) => s.origin === ELSEWHERE && s.url.endsWith('/api/version')).bearer;
  assert.ok(wrong && wrong !== `Bearer ${TOKEN}` && !wrong.includes('s3cret'), 'the wrong bearer is made from the token');
  for (const secret of [TOKEN, 's3cret', wrong.slice('Bearer '.length), wrong.split('.')[1], 'Bearer ', PNG_SHA256, 'set-cookie', '__Host-'])
    assert.ok(!out.includes(secret), `a line holds ${secret === PNG_SHA256 ? "the picture's address" : 'a credential'}`);
  assert.match(out, /api\/files\/<the 1x1 picture's SHA-256>/);
});

test('the fence asks the canary alone: a slug no record could have, or a key on a record that is not the canary, is refused before anything is asked', async () => {
  assert.throws(() => fenceChecks(staged('B2'), 'production', '../x', TOKEN), /not a record's name/);
  const named = structuredClone(staged('B2'));
  named.env.production.vars.OPS_RECORD = 'rec_canary';
  assert.throws(() => fenceChecks(named, 'production', 'ops', TOKEN), /not a key on production's canary/);
  assert.equal(fenceChecks(named, 'production', 'ops', 'rec_canary.k').length, FENCE.length);
  const lines = [];
  const { sent, io } = host();
  const code = await smoke('production', named, BOTH_BOUND, { token: TOKEN, slug: 'ops' }, { fetch: io, log: (l) => lines.push(l), nowhere: NOWHERE });
  assert.equal(code, 1);
  assert.match(lines.join('\n'), /WRONG {2}SMOKE_TOKEN is not a key on production's canary/);
  assert.ok(sent.every((s) => s.method !== 'PUT'), 'a file was put on a record that is not the canary');
});
