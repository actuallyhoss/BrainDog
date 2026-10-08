/**
 * The outside watch (`tools/watch/launch.mjs`, LCH-C01) against a stub server: every question asked over real HTTP with
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

import watch, { STOPPING, allowedCommits, hostInput, namesOf } from './launch.mjs';
import { wranglerConfig } from '../../apps/worker/scripts/provision-check.mjs';
import { launchState } from '../../apps/worker/src/launch.ts';

const NOW = Date.parse('2026-10-09T12:00:00Z');
const HOUR = 3_600_000;
const iso = (ms) => new Date(ms).toISOString();
const API = 'https://api.github.test';
const NAMES = { host: 'brain.example.test', legacy: ['app.brain.example.test'], signup: 'open' };
const GITHUB = { api: API, repo: 'owner/repo', token: 'stub', runId: '99' };
const LIVE = 'abc1234';

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
    launch: { signup: 'open', botCheck: false, billing: 'off', why: ['Billing is off, so every new record is on Free.'] },
    night: { at: iso(NOW - 3 * HOUR), records: 3, backups: 3, backups_failed: 0, directory: 'ok', ran: true },
    ...over,
  });
const deploys = (runs) => json({ workflow_runs: runs });
const green = (sha, ago) => ({ status: 'completed', conclusion: 'success', head_sha: sha, updated_at: iso(NOW - ago) });

/** Production as it should be: seven right answers. */
const good = () => ({
  'http://brain.example.test/': { status: 308, headers: { location: 'https://brain.example.test/' } },
  'https://brain.example.test/healthz': healthz(),
  'https://brain.example.test/.well-known/braindog-build': json({ app: `2026.10.09+${LIVE}` }),
  'https://brain.example.test/.well-known/security.txt': { status: 200, body: `Contact: mailto:security@brain.example.test\nExpires: ${iso(NOW + 200 * 24 * HOUR)}\n` },
  'https://app.brain.example.test/': { status: 308, headers: { location: 'https://brain.example.test/app/' } },
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

test('SEVEN RIGHT ANSWERS ARE SEVEN ok LINES AND EXIT 0, with when the watch last ran', async () => {
  const { code, lines, oks, misses } = await run();
  assert.equal(code, 0, lines.join('\n'));
  assert.deepEqual(misses, []);
  assert.deepEqual(oks.map((l) => l.trim().split(/\s+/)[1]), ['1', '2', '3', '4', '5', '6', '7']);
  assert.ok(lines.some((l) => l.includes(`${LIVE}, the last green deploy`)), lines.join('\n'));
  assert.ok(lines.includes('  the watch before this one started 61 minutes ago'), lines.join('\n'));
  assert.equal(lines.at(-1), '  watch: brain.example.test, 0 missed');
});

test('EVERY MISS IS PRINTED, NEVER THE FIRST ONLY, each with what came back, and the exit is 1', async () => {
  const { code, misses, lines } = await run({
    'http://brain.example.test/': { status: 200, body: 'plain' },
    'https://brain.example.test/.well-known/security.txt': { status: 404 },
    'https://brain.example.test/healthz': healthz({
      night: { at: iso(NOW - 30 * HOUR), records: 3, backups: 3, backups_failed: 0, directory: 'ok', ran: false },
      launch: { signup: 'closed', botCheck: false, billing: 'off', why: ['Mail is not connected, so nobody gets the letter that finishes a sign-up.'] },
    }),
  });
  assert.equal(code, 1);
  assert.deepEqual(misses.map((l) => l.trim().split(/\s+/)[1]), ['1', '4', '6', '7'], lines.join('\n'));
  assert.ok(lines.includes('           answered 200'), lines.join('\n'));
  assert.ok(lines.includes('           answered 404'));
  assert.ok(lines.includes('           the last night closed 30 hours ago'));
  assert.ok(lines.includes('           /healthz says sign-up is closed'));
  assert.ok(lines.includes('           why: Mail is not connected, so nobody gets the letter that finishes a sign-up.'), 'the why went unprinted');
  assert.equal(lines.at(-1), '  watch: brain.example.test, 4 missed');
});

test('A NAME THAT DOES NOT ANSWER IN THE LIMIT IS A MISS, and the questions after it are still asked', async () => {
  const { code, misses, oks, lines } = await run({ 'https://brain.example.test/.well-known/braindog-build': 'hang' }, { ms: 300 });
  assert.equal(code, 1);
  assert.equal(misses.length, 1, lines.join('\n'));
  assert.ok(lines.includes('           did not answer: no answer in 0.3 seconds'), lines.join('\n'));
  assert.equal(oks.length, 6);
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
  assert.deepEqual(two.misses.map((l) => l.trim().split(/\s+/)[1]), ['5']);
});

test('QUESTION 6: a copy that failed, a night not told, and a build older than the watch are misses', async () => {
  const night = (n) => ({ 'https://brain.example.test/healthz': healthz({ night: n }) });
  const failed = await run(night({ at: iso(NOW - HOUR), records: 3, backups: 2, backups_failed: 1, directory: 'ok', ran: false }));
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
  const refused = 'The bot check has its secret and no site key, so the sign-up page cannot pass it and every sign-up is refused.';
  const { code, misses, lines } = await run({
    'https://brain.example.test/healthz': healthz({ launch: { signup: 'open', botCheck: true, billing: 'off', why: [refused, 'Billing is off, so every new record is on Free.'] } }),
  });
  assert.equal(code, 1);
  assert.deepEqual(misses.map((l) => l.trim().split(/\s+/)[1]), ['7'], lines.join('\n'));
  assert.ok(lines.includes('           /healthz says sign-up is open, and a reason below says nobody can finish it'), lines.join('\n'));
  assert.ok(lines.includes(`           why: ${refused}`));
});

test("STOPPING IS HELD TO launch.ts: every reason that closes an open switch matches it, and no other reason does", () => {
  const ready = { SESSION_SECRET: 's'.repeat(32), PUBLIC_HOST: 'brain.example.test', AUTH_MAIL_FROM: 'a@brain.example.test', EMAIL: {} };
  const calm = [{}, { ...ready, SIGNUP: 'open' }, { ...ready, SIGNUP: 'invite', BILLING: 'test' }, { ...ready, SIGNUP: 'open', TURNSTILE_SECRET: 's', TURNSTILE_SITE_KEY: 'k', BILLING: 'live' }];
  for (const env of calm) for (const w of launchState(env).why) assert.doesNotMatch(w, STOPPING);
  const stopped = [...Object.keys(ready).map((k) => ({ ...ready, SIGNUP: 'open', [k]: undefined })), { ...ready, SIGNUP: 'open', TURNSTILE_SECRET: 's' }];
  for (const env of stopped) {
    const state = launchState(env);
    assert.equal(state.signup, 'closed');
    assert.equal(state.why.filter((w) => STOPPING.test(w)).length, 1, state.why.join(' | '));
  }
});

test('THE NAMES COME FROM apps/worker/wrangler.jsonc: production is brain.dog, its old name app.brain.dog, sign-up open', () => {
  const names = namesOf(wranglerConfig());
  assert.equal(names.host, 'brain.dog');
  assert.ok(names.legacy.includes('app.brain.dog'), names.legacy.join(', '));
  assert.equal(names.signup, 'open');
  assert.equal(namesOf(wranglerConfig(), 'production', 'down.example.test').host, 'down.example.test');
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
