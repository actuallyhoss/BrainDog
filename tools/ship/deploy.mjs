#!/usr/bin/env node
/**
 * The production deploy from this machine: `deploy.yml`'s `deploy` job, its steps in its order, with its refusals.
 *
 *   node tools/ship/deploy.mjs              deploy HEAD, once ci.mjs has passed it
 *   node tools/ship/deploy.mjs --dry-run    every read and check, and each write printed rather than made
 *
 * THE STEPS ARE READ OUT OF `deploy.yml`, NOT COPIED HERE. Each `run:` is run as written, with the job's environment
 * filled from this machine: `vars.*` from the shell's environment or else `gh variable get`, `secrets.*` from the
 * shell's environment or else the macOS keychain, `github.event.workflow_run.head_sha` as HEAD. `$GITHUB_ENV` and
 * `$GITHUB_OUTPUT` are files here as on a runner, so `rollback.mjs record` and `decide` hand their answers on unchanged.
 * A step's `if:` is evaluated as GitHub does, so after a red Parity or Smoke the rollback steps run here as there.
 * An expression this file cannot fill is a refusal naming it, before anything runs.
 *
 * WHAT `deploy.yml`'s JOB GUARD AND CHECKOUT STOOD FOR IS REFUSED FIRST: a tree with changes, a HEAD that is not
 * origin/master (both the local ref and the remote's own answer), and a HEAD that `ci.mjs` has not passed
 * (`.ship/pass.json`). So are an unset `DEPLOY_HOST` or `CLOUDFLARE_ACCOUNT_ID`, which skip the job there, and a
 * missing secret. A second deploy while one runs is refused, as the workflow's `concurrency: deploy` queues it.
 *
 * NO SECRET IS PRINTED, LOGGED OR WRITTEN. Each is read into this process, handed only to the steps whose `env:` names
 * it, and cut out of every line of output before the terminal or the log sees it.
 *
 * WHAT WAS LIVE IS KEPT, as the workflow keeps it for the lane: `.ship/live-before.env`, and the end of the run prints
 * the `wrangler rollback` lines that put it back.
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { MARKER, ROOT, SHIP, baseEnv, expand, git, readWorkflow, runShell, secs, setupRuns, shouldRun, short, stamp } from './lib.mjs';

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  console.log('node tools/ship/deploy.mjs [--dry-run]');
  process.exit(0);
}
const bad = argv.filter((a) => a !== '--dry-run');
if (bad.length > 0) {
  console.error(`deploy.mjs takes --dry-run, and not ${bad.join(' ')}.`);
  process.exit(2);
}
const DRY = argv.includes('--dry-run');

const RUN_ID = `deploy-${DRY ? 'dry-' : ''}${stamp()}`;
const LOGS = join(SHIP, 'logs', RUN_ID);
const TMP = join(SHIP, 'tmp', RUN_ID);
const LOG = join(LOGS, 'deploy.log');
const LIVE_BEFORE = join(SHIP, 'live-before.env');
const LOCK = join(SHIP, 'deploy.lock');
mkdirSync(LOGS, { recursive: true });
mkdirSync(TMP, { recursive: true });

const say = (line = '') => {
  console.log(line);
  writeFileSync(LOG, `${line}\n`, { flag: 'a' });
};

/* ── WHAT THIS MACHINE HOLDS ────────────────────────────────────────────────────────────────────────────────────── */

/** A repository variable: the shell's environment first, then GitHub's own value (a read, no Actions minute). */
const varCache = new Map();
function variable(name) {
  if (varCache.has(name)) return varCache.get(name);
  let value = process.env[name];
  let from = 'env';
  if (value === undefined) {
    const r = spawnSync('gh', ['variable', 'get', name], { cwd: ROOT, encoding: 'utf8' });
    value = r.status === 0 ? r.stdout.trim() : '';
    from = r.status === 0 ? 'gh variable' : 'unset';
  }
  varCache.set(name, value);
  varFrom.set(name, from);
  return value;
}
const varFrom = new Map();

/** Where each secret comes from here, in place of the production environment's secrets. */
const KEYCHAIN = { PROVISION_KEY: 'braindog-provision-key', CLOUDFLARE_API_TOKEN: 'braindog-cloudflare-api-token', SMOKE_TOKEN: 'braindog-smoke-token' };
const secretCache = new Map();
const secretFrom = new Map();
function secret(name) {
  if (secretCache.has(name)) return secretCache.get(name);
  let value = process.env[name] ?? '';
  let from = value ? 'env' : 'none';
  if (!value && KEYCHAIN[name]) {
    const r = spawnSync('security', ['find-generic-password', '-s', KEYCHAIN[name], '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (r.status === 0 && r.stdout.trim()) {
      value = r.stdout.trim();
      from = `keychain ${KEYCHAIN[name]}`;
    }
  }
  secretCache.set(name, value);
  secretFrom.set(name, from);
  return value;
}
const SECRET_NAMES = Object.keys(KEYCHAIN);
const hidden = () => [...secretCache.values()].filter(Boolean);

const HEAD = git('rev-parse', 'HEAD').out;

/** What a `${{ }}` or an `if:` in deploy.yml may name, and nothing else. */
const state = { failed: false, outcomes: {}, outputs: {}, jobEnv: {} };
function lookup(path) {
  if (path.startsWith('vars.')) return variable(path.slice(5));
  if (path.startsWith('secrets.')) {
    const name = path.slice(8);
    if (!SECRET_NAMES.includes(name)) throw new Error(`deploy.yml asks for the secret ${name}, which deploy.mjs has no place for`);
    return secret(name);
  }
  if (path === 'github.event.workflow_run.head_sha' || path === 'github.sha') return HEAD;
  if (path === 'runner.temp') return TMP;
  const step = /^steps\.([\w-]+)\.(outcome|conclusion|outputs\.([\w-]+))$/.exec(path);
  if (step) return step[3] ? (state.outputs[step[1]]?.[step[3]] ?? '') : (state.outcomes[step[1]] ?? '');
  throw new Error(`deploy.yml names ${path}, which deploy.mjs does not fill`);
}

/* ── THE REFUSALS ───────────────────────────────────────────────────────────────────────────────────────────────── */

const refusals = [];
const okay = [];
const check = (good, yes, no) => (good ? okay.push(yes) : refusals.push(no));

const status = git('status', '--porcelain').out;
check(status === '', 'the tree is clean', `the tree has changes (${status.split('\n').length} path(s) in git status); commit or stash them`);

const originMaster = git('rev-parse', 'origin/master').out;
const remote = spawnSync('git', ['-C', ROOT, 'ls-remote', 'origin', 'refs/heads/master'], { encoding: 'utf8' });
const remoteMaster = remote.status === 0 ? remote.stdout.split(/\s+/)[0] : '';
check(HEAD === originMaster, `HEAD is origin/master (${HEAD.slice(0, 12)})`, `HEAD ${HEAD.slice(0, 12)} is not origin/master ${originMaster.slice(0, 12) || '(none)'}; push it first`);
check(
  remoteMaster !== '' && remoteMaster === HEAD,
  "HEAD is the remote's master too",
  remoteMaster === '' ? "the remote's master could not be read (git ls-remote origin)" : `the remote's master is ${remoteMaster.slice(0, 12)}, not HEAD; fetch, or push`,
);

let marker = null;
try {
  marker = JSON.parse(readFileSync(MARKER, 'utf8'));
} catch {}
check(
  marker?.sha === HEAD && marker?.clean === true,
  `ci.mjs passed HEAD (${relative(ROOT, MARKER)}, ${marker?.finished ?? ''})${marker?.excused?.length ? `, with ${marker.excused.join(', ')} excused by --allow` : ''}`,
  marker ? `the pass marker names ${String(marker.sha).slice(0, 12)}, not HEAD; run node tools/ship/ci.mjs` : 'there is no pass marker; run node tools/ship/ci.mjs',
);

/* The job runs only when both are set (its `if:`); here an unset one is a refusal naming it. */
for (const name of ['DEPLOY_HOST', 'CLOUDFLARE_ACCOUNT_ID'])
  check(variable(name) !== '', `${name} is set (from ${varFrom.get(name)})`, `${name} is not set: export it, or set the repository variable`);

/* THE CREDENTIALS. The Cloudflare token may also be wrangler's own sign-in on this machine, which stays in wrangler's
   config outside the repository. PROVISION_KEY is required: the restore point before a migration needs it. */
const cfToken = secret('CLOUDFLARE_API_TOKEN');
let wranglerLogin = false;
if (!cfToken) {
  const who = spawnSync('pnpm', ['exec', 'wrangler', 'whoami'], { cwd: join(ROOT, 'apps/worker'), encoding: 'utf8', env: baseEnv({ WRANGLER_SEND_METRICS: 'false' }, SECRET_NAMES) });
  const text = `${who.stdout}${who.stderr}`;
  wranglerLogin = /You are logged in/.test(text);
  const account = variable('CLOUDFLARE_ACCOUNT_ID');
  check(
    wranglerLogin && (!account || text.includes(account)),
    "Cloudflare: wrangler's own sign-in on this machine, on CLOUDFLARE_ACCOUNT_ID's account",
    !wranglerLogin
      ? 'CLOUDFLARE_API_TOKEN is missing: export it, put it in the keychain as braindog-cloudflare-api-token, or run wrangler login'
      : "wrangler is signed in, but not to CLOUDFLARE_ACCOUNT_ID's account",
  );
} else okay.push(`CLOUDFLARE_API_TOKEN from ${secretFrom.get('CLOUDFLARE_API_TOKEN')}`);
check(secret('PROVISION_KEY') !== '', `PROVISION_KEY from ${secretFrom.get('PROVISION_KEY')}`, 'PROVISION_KEY is missing: export it, or put it in the keychain as braindog-provision-key');

/* SMOKE_TOKEN AS THE WORKFLOW HAS IT: optional while no canary is named, since the smoke then skips its signed-in half
   and the sandbox smoke is skipped; required once SMOKE_SLUG or production's OPS_RECORD names one. */
const opsRecord = (() => {
  const r = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', "const { wranglerConfig } = await import('./apps/worker/scripts/provision-check.mjs'); console.log(String(wranglerConfig().env?.production?.vars?.OPS_RECORD ?? '').trim());"],
    { cwd: ROOT, encoding: 'utf8' },
  );
  return r.stdout.trim();
})();
const canary = variable('SMOKE_SLUG') !== '' || opsRecord !== '';
if (secret('SMOKE_TOKEN')) okay.push(`SMOKE_TOKEN from ${secretFrom.get('SMOKE_TOKEN')}`);
else if (canary) refusals.push(`SMOKE_TOKEN is missing and a canary is named (${variable('SMOKE_SLUG') ? 'SMOKE_SLUG' : 'OPS_RECORD'}): export it, or put it in the keychain as braindog-smoke-token`);
else okay.push('SMOKE_TOKEN: none, and no canary is named, so the smoke skips its signed-in half as the workflow does');

/* THE CLI'S RELEASE KEY, ASKED NOW AND NOT ONLY AT ITS STEP, so a Mac without it hears the one command to run with nothing begun.
   The value is not read here: `--check` asks only whether the item exists. */
const signing = spawnSync(process.execPath, [join(ROOT, 'tools/ship/cli-sign.mjs'), '--check'], { cwd: ROOT, encoding: 'utf8' });
check(signing.status === 0, signing.stdout.trim(), signing.stderr.trim().replace(/\s*\n\s*/gu, ' '));

/* ONE AT A TIME, as `concurrency: deploy` with `cancel-in-progress: false`. */
let lockHeld = false;
if (existsSync(LOCK)) {
  const pid = Number(readFileSync(LOCK, 'utf8').trim());
  let alive = false;
  try {
    process.kill(pid, 0);
    alive = true;
  } catch {}
  check(!alive, 'no other deploy is running', `another deploy is running (pid ${pid}, ${relative(ROOT, LOCK)})`);
} else okay.push('no other deploy is running');

/* EVERY EXPRESSION AND CONDITION THE JOB USES, FILLED ONCE NOW, so one this file cannot fill stops it before any step. */
const workflow = readWorkflow('.github/workflows/deploy.yml');
const job = workflow.jobs.get('deploy');
if (!job) throw new Error('deploy.yml has no deploy job');
for (const step of job.steps) {
  try {
    for (const v of Object.values(step.env)) expand(v, lookup, state);
    for (const v of Object.values(step.with)) expand(v, lookup, state);
    if (step.run) expand(step.run, lookup, state);
    shouldRun(step.if, lookup, { failed: true });
    shouldRun(step.if, lookup, { failed: false });
  } catch (e) {
    refusals.push(`deploy.yml line ${step.line}: ${e.message}`);
  }
}
if (variable('DEPLOY_ALPHA') === 'true') okay.push('DEPLOY_ALPHA is true: alpha deploys after production, as the workflow does');

/* ── THE PREFLIGHT, SAID ────────────────────────────────────────────────────────────────────────────────────────── */

say(`\n  deploy ${DRY ? '--dry-run ' : ''}of ${HEAD.slice(0, 12)} to ${variable('DEPLOY_HOST') || '(no host)'}; log ${relative(ROOT, LOG)}`);
for (const line of okay) say(`  ok      ${line}`);
for (const line of refusals) say(`  REFUSE  ${line}`);
if (refusals.length > 0 && !DRY) {
  say('\n  Nothing was deployed.\n');
  process.exit(1);
}
if (refusals.length > 0) say('  (a real run stops here with nothing deployed; this dry run goes on to show the rest)');
if (!DRY) {
  writeFileSync(LOCK, String(process.pid));
  lockHeld = true;
}

/* A DEPLOY IS NOT CUT IN HALF. A hand that stops it mid-step is heard after the step, never during `wrangler deploy`. */
let stopAsked = false;
process.on('SIGINT', () => {
  if (stopAsked) return;
  stopAsked = true;
  say('\n  Heard. The step in hand finishes first, as `cancel-in-progress: false` has it, and then the deploy stops.');
});

/* ── THE STEPS ──────────────────────────────────────────────────────────────────────────────────────────────────── */

const GITHUB_ENV = join(TMP, 'github-env');
const isWrite = (run) => /\bwrangler\s+(deploy|rollback)\b/.test(run) && !/--dry-run/.test(run);
const TAKE = 'node "$RUNNER_TEMP/restore-point.mjs" take "Take a restore point"';
const results = [];
const wouldWrite = [];
/* Vite's table of every chunk it wrote: in the log, not on the screen. */
const QUIET = /│ gzip:|^\s*\.svelte-kit\/output\//;
/* In a dry run nothing is deployed, so a check after the deploy step measures what is live, not HEAD. */
let pastDeploy = false;

const readKeyValues = (file) => {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const at = line.indexOf('=');
    if (at > 0) out[line.slice(0, at)] = line.slice(at + 1);
  }
  return out;
};

for (const [n, step] of job.steps.entries()) {
  const title = step.name ?? step.uses ?? short(step.run ?? '');
  const runIt = shouldRun(step.if, lookup, state) || (DRY && !step.if && state.failed);
  /* After a stop is asked, the steps a red would still run (the rollback, keeping what was live) still run. */
  if (!runIt || (stopAsked && !step.if)) {
    results.push({ title, mark: 'skip', ms: 0 });
    continue;
  }
  say(`\n  ▸ ${title}${DRY && state.failed && !step.if ? ' (after a red; a dry run goes on)' : ''}${DRY && pastDeploy && !step.if ? ' (measures what is live: nothing was deployed)' : ''}`);
  let r = { status: 0, ms: 0 };
  let note = '';
  let would = false;
  if (step.uses?.startsWith('actions/checkout')) {
    note = `this checkout at HEAD ${HEAD.slice(0, 12)}, with its whole history`;
    say(`    ${note}`);
  } else if (step.uses === './.github/actions/setup') {
    r = await runShell(setupRuns().join('\n'), { env: baseEnv({}, SECRET_NAMES), log: LOG, echo: true, quiet: QUIET, tmp: TMP });
  } else if (step.uses?.startsWith('actions/upload-artifact')) {
    const from = expand(step.with.path, lookup, state);
    if (DRY) {
      would = true;
      wouldWrite.push(`keep what was live: copy ${relative(ROOT, from)} to ${relative(ROOT, LIVE_BEFORE)}`);
      say(`    WOULD keep ${relative(ROOT, from)} as ${relative(ROOT, LIVE_BEFORE)}`);
    } else if (existsSync(from)) {
      copyFileSync(from, LIVE_BEFORE);
      copyFileSync(from, join(LOGS, 'live-before.env'));
      say(`    kept as ${relative(ROOT, LIVE_BEFORE)}`);
    } else r.status = 1;
  } else if (step.uses) {
    throw new Error(`deploy.yml line ${step.line} uses ${step.uses}, which deploy.mjs does not know`);
  } else {
    let script = expand(step.run, lookup, state);
    const env = { RUNNER_TEMP: TMP, GITHUB_ENV, GITHUB_OUTPUT: join(TMP, `output-${n}`), ...state.jobEnv };
    for (const [k, v] of Object.entries(step.env)) {
      const value = expand(v, lookup, state);
      /* An empty Cloudflare token is wrangler's own sign-in; an empty variable would override it with nothing. */
      if (value === '' && SECRET_NAMES.includes(k)) continue;
      env[k] = value;
    }
    let skipRun = false;
    /* A DRY RUN OPENS NO KEY: `--check` says whether it could sign, and signs nothing. A copy of a signature that is not there
       would stop the step, so the name is taken off that line for this one run. */
    if (DRY && step.run.includes('tools/ship/cli-sign.mjs')) {
      script = script.replace('node tools/ship/cli-sign.mjs', 'node tools/ship/cli-sign.mjs --check').replace(' apps/cli/dist/braindog.mjs.sig', '');
    }
    if (DRY && isWrite(script)) {
      const line = script.split('\n').find((l) => isWrite(l));
      would = true;
      if (/\bwrangler\s+deploy\b/.test(line)) pastDeploy = true;
      wouldWrite.push(`${title}: ${line.trim()}`);
      say(`    WOULD RUN  ${line.trim()}`);
      if (/\bwrangler\s+deploy\b/.test(line)) {
        script = script.replace(line, `${line} --dry-run --outdir "$RUNNER_TEMP/dry-${n}"`);
        say("    and runs wrangler's own --dry-run in its place: bundles and reads the config, uploads nothing");
      } else skipRun = true;
    }
    if (DRY && step.run.includes(TAKE)) {
      script = script.replace(TAKE, `echo "Take a restore point: WOULD take a before-deploy copy of every record in use (a migration changed since $LIVE_SHA)."`);
      wouldWrite.push('Take a restore point: a before-deploy copy, only when a migration changed since the live sha');
    } else if (DRY && step.name === 'Take a restore point') {
      throw new Error(`deploy.yml's "${step.name}" no longer has the line this dry run replaces: ${TAKE}`);
    }
    if (!skipRun) {
      r = await runShell(script, { env: baseEnv(env, SECRET_NAMES), log: LOG, echo: true, quiet: QUIET, tmp: TMP, hide: hidden(), timeoutMs: (job.timeout ?? 20) * 60_000 });
    }
    Object.assign(state.jobEnv, readKeyValues(GITHUB_ENV));
    if (step.id) state.outputs[step.id] = readKeyValues(env.GITHUB_OUTPUT);
  }
  const red = r.status !== 0;
  if (step.id) state.outcomes[step.id] = red ? 'failure' : 'success';
  if (red && !step.continueOnError) state.failed = true;
  let mark = red ? (step.continueOnError ? 'red, continued' : 'FAIL') : 'pass';
  if (DRY && would && !red) mark = /wrangler\s+deploy/.test(step.run ?? '') ? 'would (dry-run ok)' : 'would';
  if (DRY && red && pastDeploy && !would) mark = 'red vs live';
  results.push({ title, mark, ms: r.ms });
  say(`  ◂ ${mark} ${secs(r.ms)}`);
}

/* ── THE SUMMARY AND THE WAY BACK ───────────────────────────────────────────────────────────────────────────────── */

const live = state.jobEnv;
const liveVsHead = results.filter((r) => r.mark === 'red vs live').map((r) => r.title);
say(
  DRY
    ? `\n  deploy --dry-run of ${HEAD.slice(0, 12)}: ${refusals.length} refusal(s), ${results.filter((r) => r.mark === 'FAIL').length} red before the deploy step${liveVsHead.length > 0 ? `, and red against what is live (${state.jobEnv.LIVE_SHA || 'unknown'}, not HEAD, since nothing was deployed): ${liveVsHead.join(', ')}` : ''}`
    : `\n  deploy of ${HEAD.slice(0, 12)}: ${state.failed ? 'RED' : 'green'}`,
);
for (const r of results) say(`  ${r.mark.padEnd(18)} ${secs(r.ms).padStart(7)}  ${r.title}`);
if (refusals.length > 0) say(`  refused (a real run would have stopped before the first step): ${refusals.join('; ')}`);
if (DRY) {
  say('  the writes a real run would make, in order:');
  for (const w of wouldWrite) say(`    - ${w}`);
}
say('  what was live before:');
say(`    app version ${live.APP_PREVIOUS || 'unknown'}, site version ${live.SITE_PREVIOUS || 'unknown'}, built from ${live.LIVE_SHA || 'an unknown sha'}`);
say(`  to put it back by hand (${DRY ? 'nothing was deployed, so nothing needs it now' : `kept in ${relative(ROOT, LIVE_BEFORE)}`}):`);
say(
  `    APP_PREVIOUS=${live.APP_PREVIOUS || '<id>'} SITE_PREVIOUS=${live.SITE_PREVIOUS || '<id>'} LIVE_SHA=${live.LIVE_SHA || '<sha>'} HEAD_SHA=${HEAD} FAILED_AT=smoke node apps/worker/scripts/rollback.mjs decide`,
);
say('      (first: it holds when a migration, a Durable Object class or a store version shipped, and says why)');
say(`    (cd apps/worker && pnpm exec wrangler rollback ${live.APP_PREVIOUS || '<app version>'} --env production --message "Rolled back by hand" --yes)`);
say(`    (cd apps/site && pnpm exec wrangler rollback ${live.SITE_PREVIOUS || '<site version>'} --env production --message "Rolled back by hand" --yes)`);

/* THE AFTER-DEPLOY CHECK (`after-deploy.mjs`): health, the kernel, the sign-in page, the MCP door's metadata and the
   site, asked from outside with no record, so it needs no canary (`OPS_RECORD`). After a green deploy it holds the live
   build to HEAD; a dry run asks what is live and holds it to nothing. A red line is said and makes the exit 1, but rolls
   nothing back: the smoke above is what decides that. */
let afterRed = false;
if (refusals.length === 0 || DRY) {
  if (!DRY && state.failed) say('\n  after-deploy: not asked, since this deploy is not green');
  else {
    const { afterDeploy, linesOf } = await import('./after-deploy.mjs');
    say(`\n  after-deploy, from outside${DRY ? ' (what is live, since nothing was deployed)' : ''}:`);
    try {
      const checks = await afterDeploy({ sha: DRY ? null : HEAD });
      for (const line of linesOf(checks)) say(line);
      afterRed = !DRY && checks.some((c) => !c.ok);
    } catch (e) {
      say(`  after-deploy: could not be asked (${e instanceof Error ? e.message : String(e)})`);
      afterRed = !DRY;
    }
  }
}

/* THE STATUS GOES INTO BRAINDOG WITH EACH DEPLOY, so the loop folder on this Mac is not its only copy. The same title is
   the visual's next version (an unchanged page writes nothing), and a failed attach is said and never turns a deploy red. */
const STATUS_PAGE = process.env.BRAINDOG_STATUS_PAGE || join(ROOT, 'loop/status/index.html');
const STATUS_ON = process.env.BRAINDOG_STATUS_ON || 'things#21';
const attachStatus = ['attach', STATUS_PAGE, '--on', STATUS_ON, '--title', 'Status'];
if (!existsSync(STATUS_PAGE)) say(`  status: no page at ${relative(ROOT, STATUS_PAGE)}, so none was attached`);
else if (DRY) say(`  status: WOULD RUN braindog ${attachStatus.join(' ')}`);
else if (state.failed || refusals.length > 0) say('  status: not attached, since this deploy is not green');
else {
  const a = spawnSync('braindog', attachStatus, { cwd: ROOT, encoding: 'utf8', timeout: 120_000 });
  const said = `${a.stdout ?? ''}${a.stderr ?? ''}`.split('\n').filter((l) => l.trim() !== '' && !/ExperimentalWarning|trace-warnings/.test(l));
  say(`  status: ${a.status === 0 ? said.join(' ') : `not attached (${said.at(-1) ?? a.error?.message ?? `exit ${a.status}`})`}`);
}
say(`  log: ${relative(ROOT, LOG)}\n`);

/* THE CLI COPIES "Build the CLI for the site" PUT IN THE SITE. On a runner the next checkout's clean removes them; here
   nothing would, and gates that read the tree (`refusals`) then read a bundle as though it were source. */
for (const name of ['braindog.mjs', 'braindog.mjs.sha256', 'braindog.mjs.build', 'braindog.mjs.sig']) rmSync(join(ROOT, 'apps/site/static/cli', name), { force: true });
if (lockHeld) rmSync(LOCK, { force: true });
rmSync(TMP, { recursive: true, force: true });
process.exitCode = state.failed || refusals.length > 0 || afterRed ? 1 : 0;
