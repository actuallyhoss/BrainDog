/**
 * The outside watch (`tools/watch/launch.mjs`) against a stub server: every question asked over real HTTP with
 * `redirect: 'manual'`, the stub answering each URL the watch names as the test tells it.
 *
 * THE STUB IS ONE PLAIN-HTTP SERVER ON LOOPBACK, and the watch's `ask` sends each question to it with the URL the watch
 * meant in a header, so `http://`, `https://`, the old names and GitHub's API are all one table here.
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import watch, { allowedCommits, hostInput, namesOf, reasonsBeside, shipRuns } from './launch.mjs';
import { siteConfig, wranglerConfig } from '../../apps/worker/scripts/provision-check.mjs';
import { SIGNUP_STOPPED, STOPPING, launchDetail, launchState } from '../../apps/worker/src/launch.ts';

const NOW = Date.parse('2026-10-09T12:00:00Z');
const HOUR = 3_600_000;
const iso = (ms) => new Date(ms).toISOString();
const API = 'https://api.github.test';
const NAMES = { host: 'brain.example.test', legacy: ['app.brain.example.test'], signup: 'open' };
const GITHUB = { api: API, repo: 'owner/repo', token: 'stub', runId: '99' };
const LIVE = 'abc1234';
/** What `signUp()` needs before the switch is asked, all present (`READY` in `apps/worker/test/launch.test.ts`). */
const READY_ENV = { SESSION_SECRET: 's'.repeat(32), PUBLIC_HOST: 'brain.example.test', AUTH_MAIL_FROM: 'a@brain.example.test', EMAIL: {} };

/* WHAT THE STUB ANSWERS, by the URL the watch meant. A function is called with the request; `'hang'` never answers. */
let routes = {};
const server = createServer((req, res) => {
  const route = routes[req.headers['x-asked']];
  if (route === 'hang') return;
  const { status = 404, headers = {}, body = '' } = typeof route === 'function' ? route(req) : (route ?? {});
  res.writeHead(status, headers);
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
after(() => server.close());
const port = server.address().port;
const ask = (url, init) => fetch(`http://127.0.0.1:${port}/`, { ...init, headers: { ...init.headers, 'x-asked': url } });

const json = (body, status = 200) => ({ status, headers: { 'content-type': 'application/json' }, body });
const healthz = (over = {}) =>
  json({
    ok: true,
    app: `2026.10.09+${LIVE}`,
    launch: { signup: 'open', botCheck: false, billing: 'off', why: [] },
    night: { at: iso(NOW - 3 * HOUR), reached: true, backups_failed: 0, directory: 'ok', ran: true },
    ...over,
  });
const deploys = (runs) => json({ workflow_runs: runs });
const green = (sha, ago) => ({ status: 'completed', conclusion: 'success', head_sha: sha, updated_at: iso(NOW - ago) });

/** Production as it should be: eight right answers, the eighth asked of each name. */
const good = () => ({
  'http://brain.example.test/': { status: 308, headers: { location: 'https://brain.example.test/' } },
  'https://brain.example.test/healthz': healthz(),
  'https://brain.example.test/.well-known/braindog-build': json({ app: `2026.10.09+${LIVE}` }),
  'https://brain.example.test/.well-known/security.txt': { status: 200, body: `Contact: mailto:security@brain.example.test\nExpires: ${iso(NOW + 200 * 24 * HOUR)}\n` },
  'https://app.brain.example.test/': { status: 308, headers: { location: 'https://brain.example.test/' } },
  'https://brain.example.test/app/signin?x=1': { status: 308, headers: { location: 'https://brain.example.test/signin?x=1' } },
  'https://app.brain.example.test/app/signin?x=1': { status: 308, headers: { location: 'https://brain.example.test/signin?x=1' } },
  [`${API}/repos/owner/repo/actions/workflows/deploy.yml/runs?branch=master&per_page=30`]: (req) =>
    req.headers.authorization === 'Bearer stub' ? deploys([green(`${LIVE}5678`, 5 * HOUR), green('a1d0000', 30 * HOUR)]) : json({}, 401),
  [`${API}/repos/owner/repo/actions/workflows/watch.yml/runs?per_page=5`]: json({ workflow_runs: [{ id: 99, run_started_at: iso(NOW) }, { id: 98, run_started_at: iso(NOW - 61 * 60_000) }] }),
});

async function run(over = {}, opts = {}) {
  routes = { ...good(), ...over };
  const lines = [];
  const code = await watch({ names: NAMES, github: GITHUB, ask, now: NOW, log: (l) => lines.push(l), ...opts });
  return { code, lines, misses: lines.filter((l) => l.startsWith('  MISS')), oks: lines.filter((l) => l.startsWith('  ok  ')) };
}

test('EIGHT RIGHT ANSWERS ARE ok LINES, THE EIGHTH ONE A NAME, AND EXIT 0, with when the watch last ran', async () => {
  const { code, lines, oks, misses } = await run();
  assert.equal(code, 0, lines.join('\n'));
  assert.deepEqual(misses, []);
  assert.deepEqual(oks.map((l) => l.trim().split(/\s+/)[1]), ['1', '2', '3', '4', '5', '6', '7', '8', '8']);
  assert.ok(lines.some((l) => l.includes(`${LIVE}, the last green deploy`)), lines.join('\n'));
  assert.ok(lines.includes('  the watch before this one started 61 minutes ago'), lines.join('\n'));
  assert.equal(lines.at(-1), '  watch: brain.example.test, 0 missed');
});

test('EVERY MISS IS PRINTED, NEVER THE FIRST ONLY, each with what came back, and the exit is 1', async () => {
  const { code, misses, lines } = await run({
    'http://brain.example.test/': { status: 200, body: 'plain' },
    'https://brain.example.test/.well-known/security.txt': { status: 404 },
    'https://brain.example.test/healthz': healthz({
      night: { at: iso(NOW - 30 * HOUR), reached: true, backups_failed: 0, directory: 'ok', ran: false },
      launch: { signup: 'closed', botCheck: false, billing: 'off', why: [SIGNUP_STOPPED] },
    }),
  });
  assert.equal(code, 1);
  assert.deepEqual(misses.map((l) => l.trim().split(/\s+/)[1]), ['1', '4', '6', '7'], lines.join('\n'));
  assert.ok(lines.includes('           answered 200'), lines.join('\n'));
  assert.ok(lines.includes('           answered 404'));
  assert.ok(lines.includes('           the last night closed 30 hours ago'));
  assert.ok(lines.includes('           /healthz says sign-up is closed'));
  assert.ok(lines.includes(`           why: ${SIGNUP_STOPPED}`), 'the why went unprinted');
  assert.equal(lines.at(-1), '  watch: brain.example.test, 4 missed');
});

test('A NAME THAT DOES NOT ANSWER IN THE LIMIT IS A MISS, and the questions after it are still asked', async () => {
  const { code, misses, oks, lines } = await run({ 'https://brain.example.test/.well-known/braindog-build': 'hang' }, { ms: 300 });
  assert.equal(code, 1);
  assert.equal(misses.length, 1, lines.join('\n'));
  assert.ok(lines.includes('           did not answer: no answer in 0.3 seconds'), lines.join('\n'));
  assert.equal(oks.length, 8);
});

test('QUESTION 1: a redirect to http, or to https on another name, is a miss', async () => {
  for (const location of ['http://brain.example.test/', 'https://elsewhere.example.test/', 'https://brain.example.test.evil.test/']) {
    const { misses } = await run({ 'http://brain.example.test/': { status: 301, headers: { location } } });
    assert.equal(misses.length, 1, location);
    assert.match(misses[0], /^ {2}MISS {2}1 /);
  }
  assert.equal((await run({ 'http://brain.example.test/': { status: 301, headers: { location: 'https://brain.example.test/' } } })).code, 0);
});

test('QUESTION 3: the commit before the last green deploy passes for its first hour only, and a running deploy passes', async () => {
  const before = { 'https://brain.example.test/.well-known/braindog-build': json({ app: '2026.10.08+a1d0000' }) };
  const recent = `${API}/repos/owner/repo/actions/workflows/deploy.yml/runs?branch=master&per_page=30`;
  const fresh = await run({ ...before, [recent]: deploys([green(`${LIVE}5678`, 20 * 60_000), green('a1d0000', 30 * HOUR)]) });
  assert.equal(fresh.code, 0, fresh.lines.join('\n'));
  assert.ok(fresh.lines.some((l) => l.includes('a1d0000, the deploy before it, in its first hour')));
  const stale = await run({ ...before, [recent]: deploys([green(`${LIVE}5678`, 2 * HOUR), green('a1d0000', 30 * HOUR)]) });
  assert.equal(stale.code, 1);
  assert.ok(stale.lines.includes(`           the live build is a1d0000, where the last green deploy is ${LIVE}`), stale.lines.join('\n'));
  const running = await run({
    'https://brain.example.test/.well-known/braindog-build': json({ app: '2026.10.09+fee1234' }),
    [recent]: deploys([{ status: 'in_progress', conclusion: null, head_sha: 'fee1234aaaa' }, green(`${LIVE}5678`, 5 * HOUR)]),
  });
  assert.equal(running.code, 0, running.lines.join('\n'));
  assert.deepEqual(allowedCommits([], NOW), []);
});

test('QUESTION 3 WITHOUT A TOKEN IS A MISS THAT SAYS SO, never a shrug; and a build with no commit is one too', async () => {
  const bare = await run({}, { github: { api: API } });
  assert.equal(bare.code, 1);
  assert.ok(bare.lines.some((l) => l.includes('there is no GITHUB_TOKEN and GITHUB_REPOSITORY here, so GitHub cannot be read')), bare.lines.join('\n'));
  const unnamed = await run({ 'https://brain.example.test/.well-known/braindog-build': json({ app: null }) });
  assert.ok(unnamed.lines.includes('           names no commit, so this deploy was not told which build it is'), unnamed.lines.join('\n'));
});

test('ON HIS MAC, QUESTION 3 READS THE DEPLOYS deploy.mjs LOGGED, and GitHub is asked for nothing', async () => {
  const log = (sha, verdict) => `\n  deploy of ${sha} to brain.example.test; log x\n...\n  deploy of ${sha}: ${verdict}\n`;
  const files = {
    'deploy-2026-10-09T07-00-00Z': log(`${LIVE}56789a`, 'green'),
    'deploy-2026-10-08T07-00-00Z': log('a1d00001234b', 'green'),
    'deploy-2026-10-09T11-00-00Z': log('bad00001234c', 'RED'),
    'deploy-dry-2026-10-09T11-30-00Z': log('d1700001234d', 'green'),
    'deploy-2026-10-09T11-50-00Z': `\n  deploy of fee00001234e to brain.example.test; log x\n`,
  };
  const runs = shipRuns(files);
  assert.deepEqual(runs.map((r) => [r.head_sha, r.conclusion]), [[`${LIVE}56789a`, 'success'], ['a1d00001234b', 'success'], ['bad00001234c', 'failure']]);
  assert.equal(shipRuns(files, true).find((r) => r.status === 'in_progress')?.head_sha, 'fee00001234e');
  const offline = { [`${API}/repos/owner/repo/actions/workflows/deploy.yml/runs?branch=master&per_page=30`]: json({}, 500) };
  const mac = await run(offline, { github: { deploys: { runs }, lastWatch: iso(NOW - 3 * HOUR) } });
  assert.equal(mac.code, 0, mac.lines.join('\n'));
  assert.ok(mac.lines.includes('  the watch before this one started 180 minutes ago, a gap the Mac left asleep, not the product'), mac.lines.join('\n'));
  const first = await run(offline, { github: { deploys: { runs: shipRuns({ 'deploy-2026-10-09T07-00-00Z': log('a1d00001234b', 'green') }) }, lastWatch: null } });
  assert.equal(first.code, 1);
  assert.ok(first.lines.includes('           the live build is abc1234, where the last green deploy is a1d0000'), first.lines.join('\n'));
  assert.ok(first.lines.includes('  this is the first watch on this Mac'));
});

test('QUESTION 4: security.txt expiring within 30 days, or with no Expires, is a miss', async () => {
  const soon = await run({ 'https://brain.example.test/.well-known/security.txt': { status: 200, body: `Expires: ${iso(NOW + 10.5 * 24 * HOUR)}\n` } });
  assert.ok(soon.lines.includes('           it expires in 10 days'), soon.lines.join('\n'));
  const none = await run({ 'https://brain.example.test/.well-known/security.txt': { status: 200, body: 'Contact: mailto:x@example.test\n' } });
  assert.ok(none.lines.includes('           has no Expires line'));
});

test('QUESTION 5: an old name answering 5xx or not at all is a miss; a 404 still answers', async () => {
  assert.equal((await run({ 'https://app.brain.example.test/': { status: 522 } })).misses.length, 1);
  assert.equal((await run({ 'https://app.brain.example.test/': { status: 404 } })).code, 0);
  const many = { ...NAMES, legacy: ['app.brain.example.test', 'old.example.test'] };
  const two = await run({ 'https://old.example.test/': 'hang' }, { names: many, ms: 300 });
  /* The old name that does not answer is asked its old address too, and misses that as well. */
  assert.deepEqual(two.misses.map((l) => l.trim().split(/\s+/)[1]), ['5', '8']);
});

test('QUESTION 8: an old address must be one 308 straight to the new one, on the app\'s name and on every old name', async () => {
  const twice = await run({ 'https://app.brain.example.test/app/signin?x=1': { status: 308, headers: { location: 'https://brain.example.test/app/signin?x=1' } } });
  assert.deepEqual(twice.misses.map((l) => l.trim().split(/\s+/)[1]), ['8'], twice.lines.join('\n'));
  assert.ok(twice.lines.includes('           answered 308 to https://brain.example.test/app/signin?x=1'), twice.lines.join('\n'));
  const shell = await run({ 'https://brain.example.test/app/signin?x=1': { status: 200, body: '<!doctype html>' } });
  assert.deepEqual(shell.misses.map((l) => l.trim().split(/\s+/)[1]), ['8']);
  const lost = await run({ 'https://brain.example.test/app/signin?x=1': { status: 308, headers: { location: 'https://brain.example.test/signin' } } });
  assert.equal(lost.code, 1, 'a 308 that dropped the query passed');
});

test('QUESTION 6: a copy that failed, a night not told, and a build older than the watch are misses', async () => {
  const night = (n) => ({ 'https://brain.example.test/healthz': healthz({ night: n }) });
  const failed = await run(night({ at: iso(NOW - HOUR), reached: true, backups_failed: 1, directory: 'ok', ran: false }));
  assert.ok(failed.lines.includes("           1 of last night's copies failed"), failed.lines.join('\n'));
  assert.ok((await run(night(null))).lines.includes('           no night has been told yet, or the Directory did not answer'));
  const older = await run({ 'https://brain.example.test/healthz': json({ ok: true, launch: { signup: 'open', why: [] } }) });
  assert.ok(older.lines.includes('           /healthz carries no night, so this build is older than the watch'));
});

test('QUESTION 7: sign-up must be what wrangler.jsonc switches it to, and a /healthz that cannot be read misses 2, 6 and 7', async () => {
  const unsaid = await run({ 'https://brain.example.test/healthz': healthz({ launch: undefined }) });
  assert.ok(unsaid.lines.includes('           /healthz carries no launch'), unsaid.lines.join('\n'));
  const down = await run({ 'https://brain.example.test/healthz': { status: 503, body: 'no' } });
  assert.deepEqual(down.misses.map((l) => l.trim().split(/\s+/)[1]), ['2', '6', '7']);
  assert.equal((await run({}, { names: { ...NAMES, signup: 'invite' } })).misses.length, 1);
});

test('QUESTION 7: open beside a reason that stops sign-up is a miss, as a build from before the fix answered', async () => {
  const refused = STOPPING.mail;
  const { code, misses, lines } = await run({
    'https://brain.example.test/healthz': healthz({ launch: { signup: 'open', botCheck: true, billing: 'off', why: [refused, 'Billing is off, so every new record is on Free.'] } }),
  });
  assert.equal(code, 1);
  assert.deepEqual(misses.map((l) => l.trim().split(/\s+/)[1]), ['7'], lines.join('\n'));
  assert.ok(lines.includes('           /healthz says sign-up is open, and gives a reason below that it is not'), lines.join('\n'));
  assert.ok(lines.includes(`           why: ${refused}`));
});

/* THE WATCH IS HELD TO launch.ts'S EXPORTED STOPPING, and to a sentence nobody has written yet.
   The regex this replaced let a stop sentence through that did not end on its two phrases; the last case is one. */
test('QUESTION 7 MISSES EVERY STOPPING SENTENCE BESIDE open OR invite, AND A NEW ONE', async () => {
  const novel = 'The letter service refuses this host, so sign-up waits.';
  for (const signup of ['open', 'invite'])
    for (const w of [...Object.values(STOPPING), novel]) {
      const why = signup === 'invite' ? [launchState({ ...READY_ENV, SIGNUP: 'invite' }).why[0], w] : [w];
      const { misses, lines } = await run({ 'https://brain.example.test/healthz': healthz({ launch: { signup, botCheck: false, billing: 'off', why } }) }, { names: { ...NAMES, signup } });
      assert.deepEqual(misses.map((l) => l.trim().split(/\s+/)[1]), ['7'], `${signup} beside: ${w}\n${lines.join('\n')}`);
    }
});

/* WHAT launch.ts ANSWERS TODAY PASSES: every calm host's public why fits beside its mode, and every stopped one is closed. */
test("QUESTION 7'S COUNT IS HELD TO launch.ts: a calm host passes it, and every stopped one is closed", () => {
  const calm = [{ ...READY_ENV, SIGNUP: 'open' }, { ...READY_ENV, SIGNUP: 'invite', BILLING: 'test' }, { ...READY_ENV, SIGNUP: 'open', TURNSTILE_SECRET: 's', TURNSTILE_SITE_KEY: 'k', BILLING: 'live' }];
  for (const env of calm) {
    const state = launchState(env);
    assert.ok(state.why.length <= reasonsBeside(state.signup), state.why.join(' | '));
  }
  const stopped = Object.keys(READY_ENV).map((k) => ({ ...READY_ENV, SIGNUP: 'open', [k]: undefined }));
  for (const env of stopped) {
    assert.equal(launchState(env).signup, 'closed');
    assert.deepEqual(launchState(env).why, [SIGNUP_STOPPED]);
    assert.equal(launchDetail(env).why.filter((w) => Object.values(STOPPING).includes(w)).length, 1, launchDetail(env).why.join(' | '));
  }
});

test('THE NAMES COME FROM apps/worker/wrangler.jsonc: production is app.brain.dog, its old name brain.dog, sign-up by invitation', () => {
  const names = namesOf(wranglerConfig());
  assert.equal(names.host, 'app.brain.dog');
  assert.ok(names.legacy.includes('brain.dog'), names.legacy.join(', '));
  assert.equal(names.signup, 'invite');
  assert.equal(names.site, 'app.brain.dog', 'with no site config the app\'s name is asked');
  assert.equal(namesOf(wranglerConfig(), 'production', '', siteConfig()).site, 'brain.dog');
  assert.equal(namesOf(wranglerConfig(), 'production', 'down.example.test').host, 'down.example.test');
  assert.equal(namesOf(wranglerConfig(), 'production', 'down.example.test', siteConfig()).site, 'down.example.test');
  assert.throws(() => namesOf({ env: {} }), /no PUBLIC_HOST/);
});

test('A HOST TYPED INTO workflow_dispatch IS A HOST NAME OR NOTHING', () => {
  assert.equal(hostInput(''), '');
  assert.equal(hostInput(undefined), '');
  assert.equal(hostInput(' Down.Example.test '), 'down.example.test');
  assert.equal(hostInput('127.0.0.1:8443'), '127.0.0.1:8443');
  for (const bad of ['a b', 'x/y', 'https://x', 'x?y', '-x', 'x;rm']) assert.throws(() => hostInput(bad), /is not a host name/, bad);
  const cli = spawnSync(process.execPath, [fileURLToPath(new URL('./launch.mjs', import.meta.url)), '--host', 'a b'], { encoding: 'utf8' });
  assert.equal(cli.status, 1);
  assert.match(cli.stderr, /is not a host name/);
});
