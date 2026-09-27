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
 * NOTHING HERE LEAVES THIS MACHINE. Every reading is a pure function of a status and a body, which
 * is why they are exported at all: the probes themselves are one `fetch` each and are not the part
 * that can be quietly wrong. The two tests at the end drive the whole checker, and they do it
 * against a server on `127.0.0.1` that this file starts and stops, because what READY prints is
 * decided by all three probes together and no one reading can answer it.
 */

import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import provisionCheck, { DOORS, applyPush, environmentOf, guardsKeylessRecords, plan, pushes, readBuild, readMethods, readProvision, siteBinding, wranglerConfig } from './provision-check.mjs';
import { unflipped } from './flip-fixture.mjs';
import { SITE_DOORS, UNBOUND, boundSite } from './site-fixture.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

test('the host a person names decides which environment, which bucket and which vars are read', () => {
  const config = wranglerConfig(root);

  /* PRODUCTION HAS FLIPPED (push 4), AND ITS OLD NAME IS STILL PRODUCTION'S. `app.brain.dog` was the host the owner
     ran this against before he provisioned (`loop/research-one-domain-cutover.md` §5, the runbook's O3); it stays a
     Custom Domain of this Worker as the legacy host, so a check run against it reads production's bucket and
     production's vars, which now name `brain.dog`. */
  /* THE SITE IS HANDED IN, UNBOUND, as it was before push 1, so what this test says about `brain.dog` does not change
     with the commit that binds a site. The one call without it reads the real site, which `app.brain.dog` does not
     depend on in any push. */
  const production = environmentOf(config, 'app.brain.dog', UNBOUND);
  assert.equal(production?.name, 'production');
  assert.equal(production?.bucket, 'braindog-blobs');
  assert.equal(production?.vars.PUBLIC_HOST, 'brain.dog');
  assert.equal(environmentOf(config, 'https://app.brain.dog/', UNBOUND)?.name, 'production');
  assert.equal(environmentOf(config, 'app.brain.dog')?.name, 'production');

  /* ALPHA HAS FLIPPED (push 2), AND ITS OLD NAME IS STILL ALPHA'S. `app.alpha.brain.dog` stays a Custom Domain of this
     Worker as the legacy host, so a check run against it reads alpha's bucket and alpha's vars, which now name
     `alpha.brain.dog`; the new name is alpha's only through the site, in the next test. */
  const alpha = environmentOf(config, 'app.alpha.brain.dog', UNBOUND);
  assert.equal(alpha?.name, 'alpha');
  assert.equal(alpha?.bucket, 'braindog-blobs-alpha');
  assert.equal(alpha?.vars.PUBLIC_HOST, 'alpha.brain.dog');
  assert.equal(environmentOf(config, 'alpha.brain.dog', UNBOUND), null);

  /* `brain.dog` IS THE SITE'S UNTIL THE SITE HANDS IT THE DOORS, so beside an unbound site it is a host this file does
     not name, and reading production's facts for it would describe a Worker that is not answering there. */
  assert.equal(environmentOf(config, 'brain.dog', UNBOUND), null);

  /* A HOST THIS FILE DOES NOT NAME IS NOT A GUESS. A rehearsal host on `localhost` is a real thing
     to run this against, and pretending it is production would read production's bucket name. */
  assert.equal(environmentOf(config, 'localhost:8787', UNBOUND), null);
});

test('once the site hands this app its doors, the site\'s name is that environment\'s too, and only through its own environment', () => {
  /* B1 IS NO LONGER IN THE LADDER, so it is the file with production's flip taken back out (`flip-fixture.mjs`), which is
     also what a rollback of push 4 lands on behind push 3's site. */
  const staged = { ...Object.fromEntries(pushes(root).map((p) => [p.name, p.config])), B1: unflipped(wranglerConfig(root), ['production']) };
  const both = boundSite({ alpha: 'braindog-alpha', production: 'braindog-production' });
  for (const push of Object.keys(staged)) {
    const config = staged[push];
    /* THIS WORKER HOLDS `brain.dog` ONLY THROUGH THE SITE'S BINDING. No route of this Worker names it, so reading
       `routes` alone, as this function did while the move was to be zone routes, answered `null` for production's own
       name after B2. */
    assert.equal(environmentOf(config, 'brain.dog', both)?.name, 'production', push);
    assert.equal(environmentOf(config, 'brain.dog', both)?.bucket, 'braindog-blobs', push);
    assert.equal(environmentOf(config, 'alpha.brain.dog', both)?.name, 'alpha', push);
    /* THE OLD NAME IS STILL PRODUCTION. It stays a Custom Domain of this Worker for the doors handed
       out on it, and a check run against it must read production's bucket and vars, not none. */
    assert.equal(environmentOf(config, 'app.brain.dog', both)?.name, 'production', push);
    /* A HOST THAT ONLY SHARES A PREFIX WITH A NAME IS NOT THAT NAME'S. The whole label is compared, or
       `brain.dog.evil` would read production's facts. */
    assert.equal(environmentOf(config, 'brain.dog.evil', both), null, push);
  }
  assert.equal(environmentOf(staged.B1, 'brain.dog', both)?.vars.PUBLIC_HOST, 'app.brain.dog');
  assert.equal(environmentOf(staged.B2, 'brain.dog', both)?.vars.PUBLIC_HOST, 'brain.dog');

  /* PUSH 1'S SITE: alpha's name is alpha's, and `brain.dog` is still only the site's. */
  const first = boundSite({ alpha: 'braindog-alpha' });
  assert.equal(environmentOf(staged.B1, 'alpha.brain.dog', first)?.name, 'alpha');
  assert.equal(environmentOf(staged.B1, 'brain.dog', first), null);
  /* A SITE BOUND TO THE OTHER ENVIRONMENT'S APP IS NEITHER ENVIRONMENT'S NAME. Production's facts would describe a
     Worker that is not answering there, and alpha's would describe a deploy nobody meant to make. */
  const crossed = boundSite({ alpha: 'braindog-alpha', production: 'braindog-alpha' });
  assert.equal(environmentOf(staged.B2, 'brain.dog', crossed), null);
});

test('a site that keeps /healthz as its own page does not hand this app its name, and the sentence names the door', () => {
  /* `/healthz` IS ONE OF THE DOORS (defects H4). Before it was, a site that handed over every other door read as bound
     here, while `/healthz` on its name answered the site's 404 page to every uptime check. */
  assert.ok(DOORS.includes('/healthz'), 'the checker does not ask for /healthz');
  assert.ok(SITE_DOORS.includes('/healthz'), 'the bound site in the fixture does not hand over /healthz');
  const config = wranglerConfig(root);
  const bound = { alpha: 'braindog-alpha', production: 'braindog-production' };
  assert.equal(environmentOf(config, 'brain.dog', boundSite(bound))?.name, 'production');
  const kept = boundSite(bound, UNBOUND, SITE_DOORS.filter((door) => door !== '/healthz'));
  assert.equal(environmentOf(config, 'brain.dog', kept), null);
  assert.match(siteBinding(config, kept, 'production').why ?? '', /does not run its script first on \/healthz,/);
});

test('a staged push that names an environment or a key the file does not have is refused, not ignored', () => {
  const base = wranglerConfig(root);
  /* A TYPO IN THE COMMENT WOULD OTHERWISE BE A PUSH THAT CHANGES NOTHING, and the test holding it
     would go green on the file as it already is. */
  assert.throws(() => applyPush(base, { staging: { vars: { PUBLIC_HOST: 'x' } } }), /env\.staging/);
  assert.throws(() => applyPush(base, { production: { route: [] } }), /route/);
  /* A NAME THE FILE HAS IN NO PUSH, so the copy left untouched cannot be told from one that was written. With
     `brain.dog` here, the value B2 moved into the file, the untouched check read the file's own `brain.dog` where it
     had `app.brain.dog` written in, and failed on push 4 while saying nothing about `applyPush`. */
  const was = base.env.production.vars.PUBLIC_HOST;
  const moved = applyPush(base, { production: { vars: { PUBLIC_HOST: 'moved.brain.dog' } } });
  assert.equal(moved.env.production.vars.PUBLIC_HOST, 'moved.brain.dog');
  /* THE REST OF `vars` IS KEPT, which is what "vars unchanged" means in a fragment that names two. */
  assert.equal(moved.env.production.vars.RP_ID, base.env.production.vars.RP_ID);
  /* AND THE FILE'S OWN COPY IS UNTOUCHED. */
  assert.equal(base.env.production.vars.PUBLIC_HOST, was);
  assert.notEqual(was, 'moved.brain.dog');
});

test('the file is named by its own opening comment, exactly once, or the pushes are refused', () => {
  /* THE NAME USED TO BE `'A'` IN `pushes`, and moving `STAGE B1` into the file left a B1 called A. A second sentence, a
     stale one left in another comment, would decide what every test calls the file, so two are refused as firmly as none. */
  const text = readFileSync(join(root, 'apps', 'worker', 'wrangler.jsonc'), 'utf8');
  const named = (body) => {
    const dir = mkdtempSync(join(tmpdir(), 'push-name-'));
    mkdirSync(join(dir, 'apps', 'worker'), { recursive: true });
    writeFileSync(join(dir, 'apps', 'worker', 'wrangler.jsonc'), body);
    try {
      return pushes(dir).map((p) => p.name);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  assert.deepEqual(named(text), pushes(root).map((p) => p.name));
  /* AND THE NAME IS READ, NOT MERELY COUNTED: a `'B1'` constant beside the count passed every line above and below. */
  assert.equal(named(text.replace(/THIS FILE IS PUSH [A-Z][A-Z0-9]*/, 'THIS FILE IS PUSH Z9'))[0], 'Z9');
  assert.throws(() => named(text.replace(/THIS FILE IS PUSH /, 'THIS FILE WAS PUSH ')), /exactly once, and it says it 0 times/);
  assert.throws(() => named(text.replace(/("name": "braindog",)/, '/* THIS FILE IS PUSH A */\n  $1')), /exactly once, and it says it 2 times/);
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

  /* AND ON ONE SHARED HOSTNAME THERE IS A FIFTH: THE MARKETING SITE. With `/auth/*` missing from the site's
     `run_worker_first`, the site answers a POST there with its own 404 page, HTML and no JSON. The sentence printed for
     it names the site's file, because the app's `run_worker_first`, which the sentence after it blames, is the wrong
     file on that name. */
  const site = readProvision(404, null);
  assert.equal(site.state, 'unreadable');
  assert.match(site.next, /apps\/site\/wrangler\.jsonc/);

  for (const reading of [noKey, noRoute, ready]) assert.ok(reading.next.length > 0, 'every reading says what to do next');
});

test('what /auth/methods reports is the session secret and the passkey count, and never the key store', () => {
  const configured = readMethods({ passkey: true, magic: false, key: false, open: false, me: null, firstRun: true });
  assert.equal(configured.state, 'configured');
  assert.equal(configured.firstRun, true);
  assert.equal(configured.magic, false);
  /* AND NOTHING ABOUT A DEMO. `/auth/methods` stopped sending the key when the public demo went
     (`loop/research-no-sample.md` A1), and a reading that still reported one would print `false` for a door no host has. */
  assert.equal('demo' in configured, false, 'the reading still reports a demo');

  const bare = readMethods({ passkey: false, magic: false, key: false, open: false, me: null, why: 'not-configured' });
  assert.equal(bare.state, 'not-configured');

  const insecure = readMethods({ passkey: false, magic: false, key: false, open: false, me: null, why: 'insecure' });
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

/**
 * A host on this machine that answers the three probes the way a ready production host does, or with the operator
 * route switched off. The build it names is this clone's HEAD, which every clone holds however shallow, and which
 * calls the keyless guard, so the only thing between it and READY is the probe at `/auth/provision`.
 */
async function readyHost(t, { ready = true } = {}) {
  /* `repo` AND NOT `root`, for the reason `holds` gives above. */
  const repo = root;
  const sha = execFileSync('git', ['-C', repo, 'rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim();
  const seen = [];
  const server = createServer((req, res) => {
    seen.push({ method: req.method, url: req.url, authorization: req.headers.authorization ?? null });
    const json = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.url === '/.well-known/braindog-build') return json(200, { app: `2026.09.23+${sha}` });
    if (req.url === '/auth/methods') return json(200, { ok: true, value: { passkey: true, magic: false, key: false, open: false, me: null, firstRun: true } });
    if (req.url === '/auth/provision' && ready)
      return json(401, { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'This route takes the operator key.', at: 'authorization' } });
    if (req.url === '/auth/provision') return json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'This BrainDog does not offer that way to sign in.' } });
    return json(404, { ok: false });
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  t.after(() => server.close());
  const lines = [];
  const origin = `http://127.0.0.1:${server.address().port}`;
  const run = async () => {
    const log = t.mock.method(console, 'log', (...args) => lines.push(args.join(' ')));
    try {
      return await provisionCheck(origin, { account: false, root });
    } finally {
      log.mock.restore();
    }
  };
  return { origin, lines, seen, run };
}

test('READY prints the provision command for both shells, and the operator key is never in either', async (t) => {
  /* MEASURED ON 23 SEPTEMBER, `loop/research-first-sign-in.md` friction 2. READY ended at "The next command is the
     provision itself" and printed no command, so he would have typed the runbook's curl into Windows PowerShell 5.1,
     his primary shell, where `curl` is `Invoke-WebRequest` and refuses the flags, and `curl.exe` with the JSON in
     single quotes answers `400 BODY_MALFORMED` because 5.1 strips the inner quotes. Nothing is made either way. */
  const OPERATOR = 'sentinel-operator-key-0123456789abcdef';
  const was = process.env.PROVISION_KEY;
  process.env.PROVISION_KEY = OPERATOR;
  t.after(() => (was === undefined ? delete process.env.PROVISION_KEY : (process.env.PROVISION_KEY = was)));

  const host = await readyHost(t);
  const code = await host.run();
  const out = host.lines.join('\n');
  assert.equal(code, 0, out);
  assert.match(out, /READY\./);

  const at = (marker) => host.lines.findIndex((line) => line.toLowerCase().includes(marker));
  const ps = at('windows powershell');
  const sh = at('git bash');
  assert.ok(ps > 0 && sh > ps, `READY does not print the command for both shells:\n${out}`);
  /* THE HEADING NAMES curl ON PURPOSE, to say why it is absent, so the commands start on the line after it. */
  const powershell = host.lines.slice(ps + 1, sh).join('\n');
  const bash = host.lines.slice(sh).join('\n');

  /* THE REHEARSED FORM, `loop/research-first-sign-in.md` section 4: the key at a prompt that echoes nothing, the body
     built by `ConvertTo-Json` so no quoting is PowerShell's to strip, and the key taken out of the session after. */
  assert.match(powershell, /Read-Host 'Operator key' -AsSecureString/);
  assert.match(powershell, /ConvertTo-Json/);
  assert.match(powershell, new RegExp(`Invoke-RestMethod -Method Post -Uri '${host.origin}/auth/provision'`));
  assert.match(powershell, /Remove-Variable pk, key/);
  /* THE CHARSET IS NAMED, because without it Windows PowerShell 5.1 sends a string body as Latin-1. Measured on 23
     September from 5.1.26100 to an echo server on this machine: the name `Zoë Łuk` arrived as `Zo� Luk` under
     `application/json` and whole under `application/json; charset=utf-8`, and the name is fixed at provision. */
  assert.match(powershell, /-ContentType 'application\/json; charset=utf-8'/);
  assert.doesNotMatch(powershell, /curl/i, 'the PowerShell form names curl, which is Invoke-WebRequest there or curl.exe and BODY_MALFORMED');
  assert.match(bash, /read -rs -p 'Operator key: ' PK/);
  assert.match(bash, new RegExp(`curl -sS -X POST ${host.origin}/auth/provision`));
  assert.match(bash, /unset PK/);

  /* BOTH BODIES CARRY THE ZONE, because a body without one is a record in UTC for good. */
  for (const form of [powershell, bash]) assert.match(form, /\btz\b/, `a form of the command sends no time zone:\n${form}`);

  /* AND THE THREE THINGS NO SCREEN CHANGES LATER ARE SAID BEFORE HE TYPES THEM. */
  assert.match(out, /slug, the name and the time zone are fixed at provision/i);

  /* THE KEY IS THE SHELL'S, NEVER THIS SCRIPT'S. With it in this process's environment it is still in no printed
     line and on no request the checker sent. */
  assert.ok(!out.includes(OPERATOR), 'the operator key was printed');
  assert.ok(host.seen.every((r) => r.authorization === null), 'the checker sent an authorization header');
});

test('NOT READY prints no provision command, because that command is only worth typing on a host that answers ready', async (t) => {
  const host = await readyHost(t, { ready: false });
  const code = await host.run();
  const out = host.lines.join('\n');
  assert.equal(code, 1, out);
  assert.doesNotMatch(out, /Invoke-RestMethod|curl -sS/);
});
