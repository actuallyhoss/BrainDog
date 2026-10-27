/**
 * `after-deploy.yml`, the lane after a deploy, read off the workflow file and its shell run for real.
 *
 *   node --test apps/worker/scripts/after-deploy-workflow.test.mjs
 *
 * THE GUARD IS THE ONE THIS UNIT WAS ASKED FOR: once `SMOKE_SLUG` is set, a missing secret is red and not a skip.
 * It is held by running the step's own shell under each mix of the three, not by matching its text, so a guard that
 * still reads right and stopped failing goes red here. The lane's runner is held the same way, over a folder of
 * made-up lane files in a scratch directory: name order, the red that rolls back, the red that opens a finding, the
 * skip and the "self-host only" that leave a deploy not proven, and a folder with no step being red.
 *
 * READ AS GITHUB'S STEP LIST, as `deploy-workflow.test.mjs` reads `deploy.yml`: one step per `- ` at six spaces, its
 * keys at eight, and a `run: |` block at ten.
 */

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { ROOT } from './provision-check.mjs';

const read = (name) => readFileSync(join(ROOT, '.github', 'workflows', name), 'utf8').replace(/\r\n/g, '\n');
const text = read('after-deploy.yml');

/** Each step as `{ name, id, if, uses, run, lines }`, in the order the job runs them; `run` is the shell, dedented. */
function steps(source) {
  const lines = source.split('\n');
  const start = lines.findIndex((line) => /^ {4}steps:\s*$/.test(line));
  assert.ok(start !== -1, 'the workflow has no steps list at four spaces');
  const blocks = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    if (/^ {6}- /.test(line)) blocks.push([line.replace(/^ {6}- /, '        ')]);
    else if (blocks.length > 0 && (/^ {8}/.test(line) || line.trim() === '')) blocks.at(-1).push(line);
  }
  return blocks.map((block) => {
    const keyed = block.filter((line) => !/^\s*#/.test(line));
    const key = (name) => keyed.map((line) => new RegExp(`^ {8}${name}:\\s*(.*)$`).exec(line)).find((m) => m !== null)?.[1].trim() ?? null;
    const at = keyed.findIndex((line) => /^ {8}run: \|\s*$/.test(line));
    let run = key('run');
    if (at !== -1) {
      const body = [];
      for (const line of keyed.slice(at + 1)) {
        if (line.trim() !== '' && !/^ {10}/.test(line)) break;
        body.push(line.slice(10));
      }
      run = body.join('\n').trimEnd();
    }
    return { name: key('name'), id: key('id'), if: key('if'), uses: key('uses'), run, body: keyed.join('\n') };
  });
}

const all = steps(text);
const step = (name) => {
  const found = all.find((s) => s.name === name);
  assert.ok(found, `after-deploy.yml has no step named "${name}"`);
  return found;
};
const at = (name) => all.indexOf(step(name));

/** One step's shell under bash, in `cwd`, with `env` over a bare PATH; its exit status, output and `$GITHUB_OUTPUT`. */
function runStep(name, env, cwd = ROOT) {
  const dir = mkdtempSync(join(tmpdir(), 'after-deploy-'));
  const output = join(dir, 'output');
  const summary = join(dir, 'summary');
  writeFileSync(output, '');
  try {
    const run = spawnSync('bash', ['-e', '-c', step(name).run], {
      cwd,
      encoding: 'utf8',
      env: { PATH: process.env.PATH, HOME: process.env.HOME, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary, ...env },
    });
    const outputs = Object.fromEntries(
      readFileSync(output, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
    );
    return { status: run.status, said: `${run.stdout}${run.stderr}`, outputs };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* BY HAND ONLY SINCE 15 OCTOBER: the owner moved CI and the deploy onto his Mac (`tools/ship`), so the lane no longer
   follows `deploy.yml` on its own. The job's guard below is unchanged and still lets a dispatch through. */
test('it runs by hand alone, from this repository only, and never on a pull request', () => {
  const on = text.slice(text.indexOf('\non:'), text.indexOf('\npermissions:'));
  assert.equal(on.split('\n').filter((line) => /^ {2}\S/.test(line)).join('\n'), '  workflow_dispatch:');
  assert.doesNotMatch(on, /pull_request|workflow_run|schedule|push/);
  const job = text.slice(text.indexOf('\n  lane:'), text.indexOf('\n    steps:'));
  assert.match(job, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(job, /github\.event\.workflow_run\.head_repository\.full_name == github\.repository/);
  assert.match(job, /environment: production/);
  assert.match(text, /concurrency:\n\s+group: after-deploy\n\s+cancel-in-progress: false/);
});

test('a commit that is not on master, from a fork or a branch run by hand, is refused before any secret or checked-out code runs', () => {
  const origin = step('Only master\'s own commits');
  assert.equal(origin.id, 'origin');
  assert.equal(origin.if, null, 'the refusal can be skipped');
  assert.doesNotMatch(origin.body, /continue-on-error|\$\{\{ secrets\./);
  assert.equal(at('Only master\'s own commits'), all.findIndex((s) => /^actions\/checkout@[0-9a-f]{40}\b/.test(s.uses ?? '')) + 1, 'something runs between the checkout and the refusal');
  for (const later of ['Whether the canary is set', 'The lane']) assert.ok(at(later) > at('Only master\'s own commits'), `${later} runs before the refusal`);
  assert.ok(all.findIndex((s) => s.uses === './.github/actions/setup') > at('Only master\'s own commits'), 'the checked-out setup action runs before the refusal');

  const cwd = mkdtempSync(join(tmpdir(), 'after-deploy-git-'));
  const git = (...args) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' });
  try {
    git('init', '-q', '-b', 'master');
    git('commit', '-q', '--allow-empty', '-m', 'one');
    git('update-ref', 'refs/remotes/origin/master', 'HEAD');
    assert.equal(runStep('Only master\'s own commits', {}, cwd).status, 0, 'master\'s own commit was refused');
    git('switch', '-q', '-c', 'side');
    git('commit', '-q', '--allow-empty', '-m', 'two');
    const refused = runStep('Only master\'s own commits', {}, cwd);
    assert.equal(refused.status, 1, 'a commit off master was let through');
    assert.match(refused.said, /not on master/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('once SMOKE_SLUG is set, a missing secret is red and not a skip', () => {
  const guard = step('Whether the canary is set');
  assert.ok(at('Whether the canary is set') < at('The lane'));
  assert.doesNotMatch(guard.body, /continue-on-error/);
  assert.match(guard.body, /SMOKE_SLUG: \$\{\{ vars\.SMOKE_SLUG \}\}/);
  assert.match(guard.body, /SMOKE_TOKEN: \$\{\{ secrets\.SMOKE_TOKEN \}\}/);
  assert.match(guard.body, /CANARY_PASSKEY: \$\{\{ secrets\.CANARY_PASSKEY \}\}/);

  for (const [missing, env] of [
    ['SMOKE_TOKEN', { SMOKE_SLUG: 'ops', CANARY_PASSKEY: '{}' }],
    ['CANARY_PASSKEY', { SMOKE_SLUG: 'ops', SMOKE_TOKEN: 'ops.made-up' }],
    ['SMOKE_TOKEN CANARY_PASSKEY', { SMOKE_SLUG: 'ops' }],
  ]) {
    const run = runStep('Whether the canary is set', env);
    assert.equal(run.status, 1, `SMOKE_SLUG set and ${missing} missing passed`);
    assert.match(run.said, new RegExp(`not set: ${missing}\\.`));
    assert.doesNotMatch(run.said, /self-host only/);
  }
  const live = runStep('Whether the canary is set', { SMOKE_SLUG: 'ops', SMOKE_TOKEN: 'ops.made-up', CANARY_PASSKEY: '{}' });
  assert.equal(live.status, 0);
  assert.equal(live.outputs.canary, 'live');
  assert.doesNotMatch(live.said, /made-up/, 'the guard printed a secret');
});

test('with no canary named, the lane runs on a self-host and says so', () => {
  const run = runStep('Whether the canary is set', {});
  assert.equal(run.status, 0);
  assert.equal(run.outputs.canary, 'self-host');
  assert.match(run.said, /self-host only/);
  assert.match(run.said, /brain\.dog is not proven/);
});

/** A scratch checkout holding `tools/canary/lane.d/` with `files` (name to source), and a log each file appends to. */
function scratchLane(files) {
  const cwd = mkdtempSync(join(tmpdir(), 'after-deploy-lane-'));
  const dir = join(cwd, 'tools', 'canary', 'lane.d');
  mkdirSync(dir, { recursive: true });
  for (const [name, source] of Object.entries(files)) writeFileSync(join(dir, name), source);
  return { cwd, order: () => readFileSync(join(cwd, 'order'), 'utf8').trim().split('\n'), done: () => rmSync(cwd, { recursive: true, force: true }) };
}
const lane = (name, { exit = 0, say = '', onRed = null } = {}) =>
  `${onRed ? `export const onRed = '${onRed}';\n` : ''}import { appendFileSync } from 'node:fs';\nappendFileSync('order', ${JSON.stringify(`${name}\n`)});\nconsole.log(${JSON.stringify(say)});\nprocess.exitCode = ${exit};\n`;

test('the lane runs every file of lane.d in name order, and a red smoke or sign-in is a rollback while a red look is a finding', () => {
  const scratch = scratchLane({
    '40-signs.mjs': lane('40-signs.mjs', { exit: 3 }),
    '10-smoke.mjs': lane('10-smoke.mjs', { say: 'smoke: self-host only, brain.dog not asked' }),
    '30-look.mjs': lane('30-look.mjs', { exit: 1 }),
    '20-signin-live.mjs': lane('20-signin-live.mjs', { exit: 1 }),
    '35-smoke-pictures.mjs': lane('35-smoke-pictures.mjs', { exit: 1, onRed: 'finding' }),
    'README.md': 'not a step',
  });
  try {
    const run = runStep('The lane', { LANE_OUT: join(scratch.cwd, 'out') }, scratch.cwd);
    assert.deepEqual(scratch.order(), ['10-smoke.mjs', '20-signin-live.mjs', '30-look.mjs', '35-smoke-pictures.mjs', '40-signs.mjs']);
    assert.equal(run.status, 1, 'a lane with red steps passed');
    assert.equal(run.outputs.rollback, 'true');
    assert.equal(run.outputs.finding, '30-look.mjs, 35-smoke-pictures.mjs', 'a declared onRed did not win over the name');
    assert.equal(run.outputs.unproven, '10-smoke.mjs self-host only, 40-signs.mjs skipped');
    assert.match(run.said, /20-signin-live\.mjs {2}red, which starts the rollback/);
  } finally {
    scratch.done();
  }
});

test('a lane that is all green rolls nothing back and opens nothing', () => {
  const scratch = scratchLane({ '10-smoke.mjs': lane('10-smoke.mjs'), '20-signin-live.mjs': lane('20-signin-live.mjs') });
  try {
    const run = runStep('The lane', { LANE_OUT: join(scratch.cwd, 'out') }, scratch.cwd);
    assert.equal(run.status, 0, run.said);
    assert.deepEqual(run.outputs, { rollback: 'false', finding: '', unproven: '' });
  } finally {
    scratch.done();
  }
});

test('a lane.d with no step is red, never a green that checked nothing', () => {
  const scratch = scratchLane({});
  try {
    const run = runStep('The lane', { LANE_OUT: join(scratch.cwd, 'out') }, scratch.cwd);
    assert.equal(run.status, 1);
    assert.match(run.said, /holds no step/);
    assert.deepEqual(run.outputs, { rollback: 'false', finding: '', unproven: 'the lane holds no step' }, 'an empty lane opened a finding about a look nobody took');
  } finally {
    scratch.done();
  }
});

test('a red smoke or sign-in starts the rollback that exists, with the same two commands deploy.yml has', () => {
  assert.doesNotMatch(step('The lane').body, /continue-on-error/, 'the lane is continue-on-error, so failure() never fires');
  const decide = step('Decide whether to roll back');
  assert.ok(at('Decide whether to roll back') > at('The lane'));
  assert.equal(decide.id, 'rollback');
  assert.equal(decide.if, "failure() && github.event_name == 'workflow_run' && steps.lane.outputs.rollback == 'true'");
  assert.match(decide.run, /node apps\/worker\/scripts\/rollback\.mjs decide/);
  assert.match(decide.body, /FAILED_AT: smoke/);
  assert.ok(at('Read what was live') < at('The lane'), 'what was live is read after the lane needed it');
  const deploy = read('deploy.yml');
  for (const [name, output, where] of [['Roll the app back', 'app', 'apps/worker'], ['Roll the site back', 'site', 'apps/site']]) {
    const roll = step(name);
    assert.ok(at(name) > at('Decide whether to roll back'), `${name} runs before the decision`);
    assert.equal(roll.if, `failure() && steps.rollback.outputs.${output} != ''`);
    assert.match(roll.run, new RegExp(`cd ${where} && pnpm exec wrangler rollback "\\$VERSION" --env production`));
    assert.match(deploy, new RegExp(`cd ${where} && pnpm exec wrangler rollback "\\$VERSION" --env production`), 'deploy.yml no longer rolls back this way');
  }
});

test('a red look opens a finding, and the deploy is marked proven only on a live canary that was all green', () => {
  const finding = step('Open a finding');
  assert.equal(finding.if, "failure() && steps.lane.outputs.finding != ''");
  assert.match(finding.run, /gh issue (?:create|comment)/);

  const bin = mkdtempSync(join(tmpdir(), 'after-deploy-gh-'));
  const calls = join(bin, 'calls');
  writeFileSync(join(bin, 'gh'), `#!/bin/sh\necho "$@" >> '${calls}'\n`);
  chmodSync(join(bin, 'gh'), 0o755);
  const base = { PATH: `${bin}:${process.env.PATH}`, REPO: 'owner/repo', DEPLOYED: 'abc1234', DEPLOY_HOST: 'brain.dog', RUN_URL: 'https://example.test/run', ORIGIN: 'success' };
  try {
    for (const [env, state, said] of [
      [{ ORIGIN: 'failure', GUARD: 'skipped', CANARY: '', LANE: 'skipped', UNPROVEN: '' }, 'failure', /Not proven on brain\.dog: this commit is not on master/],
      [{ GUARD: 'success', CANARY: 'live', LANE: 'skipped', UNPROVEN: '' }, 'failure', /Not proven on brain\.dog: the lane did not run/],
      [{ GUARD: 'success', CANARY: 'live', LANE: 'failure', UNPROVEN: 'the lane holds no step' }, 'failure', /Not proven on brain\.dog: the lane holds no step/],
      [{ GUARD: 'success', CANARY: 'self-host', LANE: 'success', UNPROVEN: '10-smoke.mjs self-host only' }, 'failure', /Not proven on brain\.dog: self-host only/],
      [{ GUARD: 'success', CANARY: 'live', LANE: 'success', UNPROVEN: '' }, 'success', /^Proven on brain\.dog/],
      [{ GUARD: 'success', CANARY: 'self-host', LANE: 'success', UNPROVEN: '' }, 'failure', /Not proven on brain\.dog: self-host only/],
      [{ GUARD: 'success', CANARY: 'live', LANE: 'success', UNPROVEN: '40-signs.mjs skipped' }, 'failure', /Not proven on brain\.dog: 40-signs\.mjs skipped/],
      [{ GUARD: 'success', CANARY: 'live', LANE: 'failure', UNPROVEN: '' }, 'failure', /Not proven on brain\.dog: a step of the lane went red/],
      [{ GUARD: 'failure', CANARY: '', LANE: 'skipped', UNPROVEN: '' }, 'failure', /Not proven on brain\.dog: the canary is named and a secret/],
    ]) {
      writeFileSync(calls, '');
      const run = runStep('Mark the deploy', { ...base, ...env });
      assert.equal(run.status, 0, run.said);
      assert.match(run.said, said);
      assert.match(readFileSync(calls, 'utf8'), new RegExp(`api repos/owner/repo/statuses/abc1234 -f state=${state} -f context=after-deploy`));
    }
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
  assert.equal(step('Mark the deploy').if, 'always() && !cancelled()');
});

test('no shell in the lane interpolates an expression, so nothing an event carries is run', () => {
  for (const s of all.filter((s) => s.run)) assert.doesNotMatch(s.run, /\$\{\{/, `${s.name ?? s.uses} puts an expression into its shell`);
});

test('the canary session signin-live keeps reaches the lane, never the sheet artefact, and is forgotten after', () => {
  const lane = step('The lane').body;
  const session = /^ {10}CANARY_SESSION: \$\{\{ runner\.temp \}\}\/(\S+)$/m.exec(lane)?.[1];
  assert.ok(session, 'the lane is handed no CANARY_SESSION under runner.temp');
  const out = /^ {10}LANE_OUT: \$\{\{ runner\.temp \}\}\/(\S+)$/m.exec(lane)?.[1];
  assert.ok(out && !session.startsWith(`${out}/`), 'the session sits inside the folder the sheet artefact uploads');
  assert.match(step('Keep the canary\'s sheet').body, /path: \$\{\{ runner\.temp \}\}\/lane\s*$/m);
  const forget = step('Forget the canary\'s session');
  assert.equal(forget.if, 'always()');
  assert.equal(forget.run, `rm -f "$RUNNER_TEMP/${session}"`);
  assert.ok(all.indexOf(forget) < all.indexOf(step('Keep the canary\'s sheet')), 'the session outlives the upload');
});
