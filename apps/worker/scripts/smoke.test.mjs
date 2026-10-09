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
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { pushes, siteBinding, siteConfig, wranglerConfig } from './provision-check.mjs';
import { unflipped } from './flip-fixture.mjs';
import { UNBOUND, boundSite } from './site-fixture.mjs';
import { FIRST_DRAW } from '../../web/src/lib/record/first-draw.ts';
import smoke, { argsFor, canary, checks, judge, migrationCount, readCheck, refusals } from './smoke.mjs';

const html = { 'content-type': 'text/html; charset=utf-8' };
const json = { 'content-type': 'application/json' };
const answer = (status, headers = {}, text = '') => ({ status, headers: new Headers(headers), text });
const staged = (name) => {
  const push = pushes().find((p) => p.name === name);
  assert.ok(push, `no push ${name}`);
  return push.config;
};
const asked = (list) => list.map((c) => `${c.method} ${c.url}`);

/* THE SITE AFTER PUSH 1 (alpha bound) AND AFTER PUSH 3 (both). */
const ALPHA_BOUND = boundSite({ alpha: 'braindog-alpha' });
const BOTH_BOUND = boundSite({ alpha: 'braindog-alpha', production: 'braindog-production' });
/* B1: ALPHA FLIPPED AND PRODUCTION NOT, which the file was from push 2 to push 4 and a rollback of push 4 lands on. */
const B1 = unflipped(wranglerConfig(), ['production']);

test('production in push A\'s shape beside a site that does not bind it asks the app on its own name, and asks nothing of brain.dog, which is still only the site', () => {
  assert.deepEqual(asked(checks(B1, 'production', UNBOUND)), [
    'GET https://app.brain.dog/app/',
    'GET https://app.brain.dog/api/boot',
    'GET https://app.brain.dog/healthz',
    'GET https://app.brain.dog/r/x',
    'POST https://app.brain.dog/in/anything',
  ]);
  /* PUSH 1'S SITE BINDS ALPHA ALONE, and production is asked exactly what it was asked beside no binding at all. */
  assert.deepEqual(asked(checks(B1, 'production', ALPHA_BOUND)), asked(checks(B1, 'production', UNBOUND)));
});

test('once production\'s site binds production\'s app (push 3), production is asked the site and the doors on brain.dog as well, before its flip', () => {
  /* THE WINDOW ALPHA WAS IN BETWEEN PUSH 1 AND PUSH 2, and production is in it between push 3 and push 4: the app on
     both names, its own name still the public host, and `brain.dog` shared with the site, so `/pricing` is asked there
     first. */
  assert.deepEqual(asked(checks(B1, 'production', BOTH_BOUND)), [
    'GET https://app.brain.dog/app/',
    'GET https://app.brain.dog/api/boot',
    'GET https://app.brain.dog/healthz',
    'GET https://brain.dog/pricing',
    'GET https://brain.dog/app/',
    'GET https://brain.dog/api/boot',
    'GET https://brain.dog/healthz',
    'GET https://app.brain.dog/r/x',
    'POST https://app.brain.dog/in/anything',
  ]);
});

test('each flip is asked the five answers of the design and /healthz, on the two names it holds', () => {
  assert.deepEqual(asked(checks(B1, 'alpha', ALPHA_BOUND)), [
    'GET https://alpha.brain.dog/pricing',
    'GET https://alpha.brain.dog/app/',
    'GET https://alpha.brain.dog/api/boot',
    'GET https://alpha.brain.dog/healthz',
    'GET https://app.alpha.brain.dog/r/x',
    'POST https://app.alpha.brain.dog/in/anything',
  ]);
  assert.deepEqual(asked(checks(staged('B2'), 'production', BOTH_BOUND)), [
    'GET https://brain.dog/pricing',
    'GET https://brain.dog/app/',
    'GET https://brain.dog/api/boot',
    'GET https://brain.dog/healthz',
    'GET https://app.brain.dog/r/x',
    'POST https://app.brain.dog/in/anything',
  ]);
});

test('each check refuses the answer the wrong Worker would give', () => {
  const [pricing, shell, boot, , legacy, door] = checks(staged('B2'), 'production', BOTH_BOUND);

  assert.equal(judge(pricing, answer(200, html)), null);
  /* THE PRODUCT WORKER'S ANSWER AT A SITE PATH is JSON: the site's `run_worker_first` too wide, handing `/pricing` to
     the app. */
  assert.match(judge(pricing, answer(404, json)) ?? '', /run_worker_first/);

  assert.equal(judge(shell, answer(200, html)), null);
  /* THE SITE'S 404 PAGE AT `/app/` is the site keeping `/app/*`, or a Worker older than the shell. */
  assert.match(judge(shell, answer(404, html)) ?? '', /\/app/);

  assert.equal(judge(boot, answer(401, json)), null);
  /* A 404 PAGE AT `/api/boot` is the marketing site answering an API call. */
  assert.match(judge(boot, answer(404, html)) ?? '', /site .*does not hand \/api\/\*/);
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
  const [shell, boot, , front, door] = checks(B1, 'production', UNBOUND);
  assert.equal(front.headers?.accept, 'text/html', 'a page load says it wants a page, or the Worker rightly leaves it alone');
  assert.equal(judge(front, answer(308, { location: 'https://app.brain.dog/app/r/x' })), null);
  /* THE WORKER WITHOUT THE SAME-HOST REDIRECT answers `ROUTE_UNKNOWN` in JSON here, which is the site's "Open the app"
     and every mailed magic link landing on an error. Measured before the move. */
  assert.match(judge(front, answer(404, json)) ?? '', /ROUTE_UNKNOWN|same name/);
  /* AND A REDIRECT TO brain.dog IN PUSH A is the flip's vars deployed before the site hands that name the doors: the
     site's 404 for everyone. */
  assert.match(judge(front, answer(308, { location: 'https://brain.dog/app/r/x' })) ?? '', /brain\.dog/);

  /* ON A CUSTOM DOMAIN THE SITE IS NOT IN THE PATH, so a page at `/app/` is a Worker older than the shell, and the
     sentence must not send anybody to look at a site binding that has nothing to do with this name. */
  assert.equal(judge(shell, answer(200, html)), null);
  const old = judge(shell, answer(404, json)) ?? '';
  assert.ok(old.length > 0);
  assert.doesNotMatch(old, /site/);
  assert.equal(judge(boot, answer(401, json)), null);
  assert.doesNotMatch(judge(boot, answer(404, html)) ?? '', /site/);

  assert.equal(judge(door, answer(404, json)), null);
  assert.ok(judge(door, answer(308, { location: 'https://app.brain.dog/app/in/anything' })));
});

test('a public host nothing reaches is refused before anything is asked, and the sentence says which key is missing', () => {
  const config = structuredClone(B1);
  config.env.production.routes = [];
  assert.throws(() => checks(config, 'production', UNBOUND), /app\.brain\.dog/);
  /* B1 BESIDE A SITE THAT DOES NOT BIND ALPHA: push 2 landing before push 1, which is every door on `alpha.brain.dog`
     answering the alpha site's 404 page. */
  assert.throws(() => checks(wranglerConfig(), 'alpha', UNBOUND), /alpha\.brain\.dog .*env\.alpha has no main/);
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
    for (const on of binding.names.filter((n) => n !== host)) assert.ok(list.includes(`GET https://${on}/pricing`), `${name}: ${on} is the app's through the site and is not asked`);
    if (binding.names.length === 0) assert.ok(!list.some((c) => c.endsWith('/pricing')), `${name}: a site that does not bind this app is asked for /pricing`);
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
  assert.equal(check.url, 'https://brain.dog/app/ops/api/boot');
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
    assert.ok(list.every((c) => !c.canary && !/\/app\/[^/]+\/api\//.test(c.url)), `${name}: an unsigned check reaches a record's API`);
  }
});

/* THE SIGNED-IN HALF, RUN WHOLE AGAINST A STUB (LCH-C02). The stub answers the unsigned checks with whichever answer
   each one's own judge passes, so these tests say only what the canary's questions do. */
const TOKEN = 'rec_ops.s3cret';
const NOWHERE = 'nobody-0011223344556677';
const GOOD = [
  answer(200, html, '<!doctype html>'),
  answer(401, json, '{"code":"AUTH_REQUIRED"}'),
  answer(200, json, JSON.stringify({ ok: true, kernel: migrationCount() })),
  answer(308, { location: 'https://brain.dog/app/r/x' }),
  answer(404, json, '{"code":"INGEST_UNKNOWN"}'),
];
const HELD = {
  boot: { registers: [{ id: 'session', count: 1 }, { id: 'tasks', count: 3 }] },
  packs: [{ id: 'off', disabled_at: '2026-01-01' }, { id: 'money', disabled_at: null }],
  pages: [{ slug: 'home', title: 'Home', about: null }],
  list: { rows: [{ seq: 3, fields: {} }], cursor: null },
};

/** A stub host: `faults` maps a method to the answer it gives instead, `held` what the canary holds. */
function host({ faults = {}, held = HELD, stranger = null, elsewhere = null } = {}) {
  const sent = [];
  const unsigned = checks(staged('B2'), 'production', BOTH_BOUND);
  const io = async (url, init) => {
    const u = new URL(url);
    const bearer = init.headers?.authorization ?? null;
    sent.push({ method: init.method, url, bearer, body: init.body });
    const at = u.pathname.match(/^\/app\/([a-z0-9-]+)\/api\/(\w+)$/);
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

const run = async (opts = {}, signedIn = { token: TOKEN, slug: 'ops' }) => {
  const lines = [];
  const { sent, io } = host(opts);
  const code = await smoke('production', staged('B2'), BOTH_BOUND, signedIn, { fetch: io, log: (l) => lines.push(l), nowhere: NOWHERE });
  return { code, lines, sent, out: lines.join('\n') };
};

test('the canary is opened as a first draw opens it, every read of the list asked with the token, and none of it printed', async () => {
  const { code, out, sent } = await run();
  assert.equal(code, 0, out);
  const signed = sent.filter((s) => s.url.includes('/app/ops/api/'));
  for (const read of FIRST_DRAW) assert.ok(signed.some((s) => new URL(s.url).pathname === `/app/ops/api/${read.method}` && s.bearer), read.method);
  assert.ok(sent.some((s) => s.url === 'https://brain.dog/app/ops/api/version' && s.bearer === null), 'version is not asked without the bearer');
  assert.ok(sent.some((s) => s.url === `https://brain.dog/app/${NOWHERE}/api/boot` && s.bearer === `Bearer ${TOKEN}`));
  /* WHAT EACH IS ABOUT IS READ FROM THE BARE ANSWERS: the first list holding rows, the add-on switched on, the first page. */
  assert.ok(sent.some((s) => s.url === 'https://brain.dog/app/ops/api/list?register=tasks&limit=1'));
  assert.ok(sent.some((s) => s.url === 'https://brain.dog/app/ops/api/packConfig?id=money'));
  assert.ok(sent.some((s) => s.url === 'https://brain.dog/app/ops/api/page?slug=home'));
  assert.ok(sent.some((s) => s.url === 'https://brain.dog/app/ops/api/get?register=tasks&seq=3'));
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
  assert.match(out, /WRONG {2}GET https:\/\/brain\.dog\/app\/ops\/api\/pages[\s\S]*answered 500: Home, finding/);
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
  assert.match(out, /skip {3}packConfig: the canary has no add-on/);
  assert.match(out, /skip {3}get: the canary has no row to open/);
});

test('without the token nothing signed in is asked, and one line says the half was skipped', async () => {
  const { code, out, sent } = await run({}, {});
  assert.equal(code, 0, out);
  assert.ok(sent.every((s) => !s.url.includes('/app/ops/') && !s.bearer));
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
  assert.equal(post.url, 'https://brain.dog/app/ops/api/previewPage');
  assert.equal(post.body, '{"body":{"page":"p"}}');
});
