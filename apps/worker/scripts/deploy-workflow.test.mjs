/**
 * The order of `deploy.yml`'s steps that make a red deploy undoable, read off the workflow file.
 *
 *   node --test apps/worker/scripts/deploy-workflow.test.mjs
 *
 * THE ORDER IS THE WHOLE MECHANISM. What was live can only be recorded before `wrangler deploy` replaces it; a rollback
 * step only runs after a red step when it sits after that step and carries `failure()`; and a step marked
 * `continue-on-error` never turns the run red, so a Parity or Smoke carrying it would make `failure()` false and the
 * rollback unreachable. None of that is visible to `rollback.test.mjs`, which holds the decision, so it is held here.
 *
 * THE FILE IS READ AS GITHUB'S STEP LIST, ONE STEP PER `- ` AT THE STEPS' INDENT. No YAML parser is a dependency of
 * this workspace, and the shape read here is the one the file is written in: a step's keys at eight spaces under a
 * dash at six.
 */

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

import { ROOT } from './provision-check.mjs';

const text = readFileSync(join(ROOT, '.github', 'workflows', 'deploy.yml'), 'utf8').replace(/\r\n/g, '\n');

/** Each step as `{ name, id, if, uses, body }`, in the order the job runs them. */
function steps(source) {
  const lines = source.split('\n');
  const start = lines.findIndex((line) => /^ {4}steps:\s*$/.test(line));
  assert.ok(start !== -1, 'deploy.yml has no steps list at four spaces');
  const blocks = [];
  for (const line of lines.slice(start + 1)) {
    /* A COMMENT BELONGS TO NO STEP: the one above a step would otherwise be read as the body of the step before it. */
    if (/^\s*#/.test(line) || line.trim() === '') continue;
    if (/^\S/.test(line)) break;
    if (/^ {6}- /.test(line)) blocks.push([line.replace(/^ {6}- /, '        ')]);
    else if (blocks.length > 0 && /^ {8}/.test(line)) blocks.at(-1).push(line);
  }
  const key = (block, name) => {
    const found = block.map((line) => new RegExp(`^ {8}${name}:\\s*(.*)$`).exec(line)).find((m) => m !== null);
    return found ? found[1].trim() : null;
  };
  return blocks.map((block) => ({ name: key(block, 'name'), id: key(block, 'id'), if: key(block, 'if'), uses: key(block, 'uses'), body: block.join('\n') }));
}

const all = steps(text);
const at = (name) => {
  const index = all.findIndex((step) => step.name === name);
  assert.ok(index !== -1, `deploy.yml has no step named "${name}"`);
  return index;
};
const step = (name) => all[at(name)];

test('what is live is recorded before Deploy, with the host its build id is read from', () => {
  assert.ok(at('Record what is live') < at('Deploy'), 'the record step runs after the deploy, when what was live is gone');
  const record = step('Record what is live');
  assert.match(record.body, /node apps\/worker\/scripts\/rollback\.mjs record /);
  assert.match(record.body, /wrangler deployments status --json --env production/);
  assert.match(record.body, /DEPLOY_HOST: \$\{\{ vars\.DEPLOY_HOST \}\}/);
});

test('the rollback follows Smoke under failure(), and reads which of Parity and Smoke went red', () => {
  assert.equal(step('Parity').id, 'parity');
  assert.equal(step('Smoke').id, 'smoke');
  const decide = step('Decide whether to roll back');
  assert.ok(at('Decide whether to roll back') > at('Smoke'), 'the rollback decision runs before Smoke has answered');
  assert.equal(decide.id, 'rollback');
  assert.match(decide.if ?? '', /^failure\(\) && \(steps\.parity\.outcome == 'failure' \|\| steps\.smoke\.outcome == 'failure'\)$/);
  assert.match(decide.body, /node apps\/worker\/scripts\/rollback\.mjs decide/);
  assert.match(decide.body, /HEAD_SHA: \$\{\{ github\.sha \}\}/);

  for (const [name, output] of [['Roll the app back', 'app'], ['Roll the site back', 'site']]) {
    const roll = step(name);
    assert.ok(at(name) > at('Decide whether to roll back'), `${name} runs before the decision`);
    assert.equal(roll.if, `failure() && steps.rollback.outputs.${output} != ''`);
    assert.match(roll.body, /wrangler rollback "\$VERSION" --env production/);
  }
});

test('Parity and Smoke can turn the run red, or failure() never fires', () => {
  for (const name of ['Deploy', 'Parity', 'Deploy the marketing site', 'Smoke']) assert.doesNotMatch(step(name).body, /continue-on-error/, `${name} is continue-on-error`);
});

test('the checkout holds the history the rollback diffs', () => {
  const checkout = all.find((s) => (s.uses ?? '').startsWith('actions/checkout@'));
  assert.ok(checkout, 'deploy.yml checks nothing out');
  assert.match(checkout.body, /fetch-depth: 0/);
  assert.ok(all.indexOf(checkout) < at('Record what is live'));
});

test('only production\'s smoke is handed the canary token', () => {
  assert.match(step('Smoke').body, /SMOKE_TOKEN: \$\{\{ secrets\.SMOKE_TOKEN \}\}/);
  assert.match(step('Smoke').body, /SMOKE_SLUG: \$\{\{ vars\.SMOKE_SLUG \}\}/);
  assert.doesNotMatch(step('Smoke alpha').body, /SMOKE_TOKEN/);
});

test('the Sandbox smoke follows Smoke, cannot go unnoticed, and reads its canary from wrangler.jsonc', () => {
  assert.ok(at('Sandbox smoke') > at('Smoke'), 'the sandbox smoke runs before Smoke has answered');
  const sandbox = step('Sandbox smoke');
  assert.doesNotMatch(sandbox.body, /continue-on-error/, 'Sandbox smoke is continue-on-error');
  assert.match(sandbox.body, /SMOKE_TOKEN: \$\{\{ secrets\.SMOKE_TOKEN \}\}/);
  assert.match(sandbox.body, /DEPLOY_HOST: \$\{\{ vars\.DEPLOY_HOST \}\}/);
  assert.match(sandbox.body, /wranglerConfig\(\)/);
  assert.match(sandbox.body, /OPS_RECORD/);
});

test('a restore point is asked before Deploy, after what is live is recorded, behind the operator key', () => {
  const point = step('Take a restore point');
  assert.ok(at('Record what is live') < at('Take a restore point'), 'the restore point runs before LIVE_SHA is known');
  assert.ok(at('Take a restore point') < at('Deploy'), 'the restore point is taken after the deploy, when it is too late');
  assert.doesNotMatch(point.body, /continue-on-error/, 'a failed copy cannot stop the deploy');
  assert.match(point.body, /PROVISION_KEY: \$\{\{ secrets\.PROVISION_KEY \}\}/);
  assert.match(point.body, /DEPLOY_HOST: \$\{\{ vars\.DEPLOY_HOST \}\}/);
  assert.match(point.body, /HEAD_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(point.body, /\/account\/ops\/restore-point/);
  assert.match(point.body, /not run: no key/, 'no key fails the deploy instead of saying it did not run');
});

test('the restore point always checks, and copies for real only when a migration changed since the live sha', () => {
  const body = step('Take a restore point').body;
  const check = body.indexOf('restore-point.mjs" check');
  const diff = body.indexOf(`git diff --name-only "$LIVE_SHA" HEAD -- 'packages/kernel/src/migrations/*.ts'`);
  const take = body.indexOf('restore-point.mjs" take');
  assert.ok(check !== -1 && diff !== -1 && take !== -1, 'the check, the migration diff or the real copy is missing');
  /* THE DIFF IS READ FIRST, because a missing key or a missing door is red only when it says a migration changed. */
  assert.ok(diff < check && check < take, 'the order is the diff, then the check, then the copy');
  assert.match(body, /no migration changed since \$LIVE_SHA, so nothing is copied\./);
  /* AN UNKNOWN LIVE SHA COPIES: the diff is guarded by it, and a guard that exited would skip the copy a deploy needs most. */
  assert.match(body, /if \[ -n "\$LIVE_SHA" \] && git cat-file -e/);
  /* A FAILED CHECK OF THE LIVE BUILD WARNS, and a failed copy is red: the take is the step's last command. */
  assert.match(body, /if ! RESTORE_POINT_NEEDED=no node "\$RUNNER_TEMP\/restore-point\.mjs" check [^\n]*; then\n\s*echo "::warning::/);
  assert.match(body.trimEnd().split('\n').filter((l) => !/^ {8}\S/.test(l) && !/^ {10}[A-Z_]+: /.test(l)).at(-1) ?? '', /restore-point\.mjs" take/);
});

test('after the deploy every record in use is opened once, and a red check is red', () => {
  const check = step('Check the records open');
  assert.ok(at('Check the records open') > at('Sandbox smoke'), 'the check runs before the deploy is smoked');
  assert.ok(at('Check the records open') < at('Decide whether to roll back'));
  assert.doesNotMatch(check.body, /continue-on-error/);
  assert.match(check.body, /node "\$RUNNER_TEMP\/restore-point\.mjs" check "Check the records open"/);
  assert.match(check.body, /PROVISION_KEY: \$\{\{ secrets\.PROVISION_KEY \}\}/);
  assert.match(check.body, /RECORDS_KNOWN: \$\{\{ vars\.SMOKE_SLUG \}\}/, 'the check cannot tell a host that holds the canary from an empty one');
});

/*
 * THE STEP ITSELF, RUN. Everything above reads the file; a sentence in a workflow can say "red" and exit 0, which is
 * what finding 1 of the 45-46 audit was. So the `run:` block of `Take a restore point` is lifted out of the file as
 * written and run with bash in a small repository of two commits, with `fetch` answered by a stub that `--import`
 * loads, and what is judged is the exit code GitHub would see.
 */

/** A step's `run: |` block as the shell gets it: its lines up to the step's next key, without their ten spaces. */
function script(name) {
  const lines = step(name).body.split('\n');
  const from = lines.findIndex((line) => /^ {8}run: \|\s*$/.test(line));
  assert.ok(from !== -1, `${name} has no run block`);
  const rest = lines.slice(from + 1);
  const to = rest.findIndex((line) => /^ {8}\S/.test(line));
  return (to === -1 ? rest : rest.slice(0, to)).map((line) => line.replace(/^ {10}/, '')).join('\n');
}

/** `fetch` for the step: every ask answered `STUB_STATUS` and `STUB_BODY`, and each body it was sent kept in `STUB_LOG`. */
const STUB = `
import { appendFileSync } from 'node:fs';
globalThis.fetch = async (url, init) => {
  appendFileSync(process.env.STUB_LOG, String(url) + ' ' + String(init?.body ?? '') + '\\n');
  return new Response(process.env.STUB_BODY ?? 'null', { status: Number(process.env.STUB_STATUS), headers: { 'content-type': 'application/json' } });
};
`;

/**
 * `Take a restore point` run once: `migration` says whether the second commit changed a migration file, `key` whether
 * the runner holds the operator key, and `status` and `said` what the host answers. The exit code, what it printed,
 * what it left in `$GITHUB_ENV` and what it asked.
 */
function takeRestorePoint({ migration, key = true, status = 200, said = null, canary = '', live = true }) {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-restore-point-'));
  try {
    const git = (...args) => {
      const run = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, encoding: 'utf8' });
      assert.equal(run.status, 0, `git ${args.join(' ')}: ${run.stderr}`);
      return run.stdout.trim();
    };
    mkdirSync(join(dir, 'packages', 'kernel', 'src', 'migrations'), { recursive: true });
    mkdirSync(join(dir, 'tmp'));
    writeFileSync(join(dir, 'packages', 'kernel', 'src', 'migrations', '0001_kernel.ts'), 'export const one = 1;\n');
    writeFileSync(join(dir, 'app.ts'), 'export const app = 1;\n');
    writeFileSync(join(dir, '.gitignore'), 'tmp/\n');
    git('init', '-q');
    git('add', 'packages', 'app.ts', '.gitignore');
    git('commit', '-q', '-m', 'one');
    const first = git('rev-parse', 'HEAD');
    if (migration) writeFileSync(join(dir, 'packages', 'kernel', 'src', 'migrations', '0002_more.ts'), 'export const two = 2;\n');
    else writeFileSync(join(dir, 'app.ts'), 'export const app = 2;\n');
    git('add', 'packages', 'app.ts');
    git('commit', '-q', '-m', 'two');
    writeFileSync(join(dir, 'tmp', 'stub.mjs'), STUB);
    writeFileSync(join(dir, 'tmp', 'asked.log'), '');
    writeFileSync(join(dir, 'tmp', 'github.env'), '');
    const run = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script('Take a restore point')], {
      cwd: dir,
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME ?? dir,
        RUNNER_TEMP: join(dir, 'tmp'),
        GITHUB_ENV: join(dir, 'tmp', 'github.env'),
        NODE_OPTIONS: `--import=${pathToFileURL(join(dir, 'tmp', 'stub.mjs')).href}`,
        STUB_LOG: join(dir, 'tmp', 'asked.log'),
        STUB_STATUS: String(status),
        STUB_BODY: JSON.stringify(said),
        DEPLOY_HOST: 'host.example',
        HEAD_SHA: 'abcdef1',
        LIVE_SHA: live ? first : '',
        PROVISION_KEY: key ? 'not-a-real-key' : '',
        RECORDS_KNOWN: canary,
      },
    });
    return { code: run.status, out: `${run.stdout}${run.stderr}`, env: readFileSync(join(dir, 'tmp', 'github.env'), 'utf8'), asked: readFileSync(join(dir, 'tmp', 'asked.log'), 'utf8') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** What the door answers a walk of `asked` records, none failed. */
const tallied = (asked) => ({ ok: true, value: { mode: 'take', asked, records: asked, opened: asked, copied: asked, failed: 0, said: `Restore point: ${asked} asked.` } });

test('a push that changes a migration goes on when the live build answers the door 404, and says plainly that no copy was taken', () => {
  /* THE DEPLOY THAT FIRST SHIPS THE DOOR: red here stopped the only job that can ship it. */
  const ran = takeRestorePoint({ migration: true, status: 404 });
  assert.equal(ran.code, 0, `a missing door stopped the deploy that would ship it:\n${ran.out}`);
  assert.match(ran.out, /::warning::Take a restore point: not run: the live build has no restore-point door, or no operator key of its own\. A migration changed in this deploy and no copy was taken before it\./);
  assert.doesNotMatch(ran.out, /::error::/);
  assert.match(ran.asked, /"check":false/, 'the copy was never asked for, so the 404 read was only the check\'s');
  assert.match(ran.env, /^RESTORE_POINT_NEEDED=yes$/m, 'the check after the deploy is not told a migration shipped');
});

test('a door that refuses or fails is still red when a migration changed: only its absence is "not run"', () => {
  for (const status of [401, 403, 500]) {
    const ran = takeRestorePoint({ migration: true, status, said: { ok: false, refusal: { code: 'X', fix: 'The door said no.' } } });
    assert.equal(ran.code, 1, `a ${status} from the door passed with no copy taken:\n${ran.out}`);
    assert.match(ran.out, /Take a restore point: The door said no\./);
  }
});

test('a push that changes a migration fails when the runner holds no operator key, and asks nothing', () => {
  const ran = takeRestorePoint({ migration: true, key: false });
  assert.equal(ran.code, 1, `the step passed with no key:\n${ran.out}`);
  assert.match(ran.out, /::error::Take a restore point: a migration changed since [0-9a-f]{40} and there is no key/);
  assert.equal(ran.asked, '');
});

test('with no migration changed, a 404 and a missing key are each "not run" with why, and the deploy goes on', () => {
  const door = takeRestorePoint({ migration: false, status: 404 });
  assert.equal(door.code, 0, door.out);
  assert.match(door.out, /Take a restore point \(check\): not run: the live build has no restore-point door, or no operator key of its own\./);
  assert.match(door.out, /no migration changed since [0-9a-f]{40}, so nothing is copied\./);
  assert.match(door.env, /^RESTORE_POINT_NEEDED=no$/m);
  const key = takeRestorePoint({ migration: false, key: false });
  assert.equal(key.code, 0, key.out);
  assert.match(key.out, /Take a restore point: not run: no key\. Set PROVISION_KEY/);
});

test('a live sha nobody could read copies when it can, and is "not run" with why when it cannot', () => {
  const taken = takeRestorePoint({ migration: false, live: false, said: tallied(4) });
  assert.equal(taken.code, 0, taken.out);
  assert.match(taken.asked, /"check":false/, 'an unknown live sha took no copy');
  const none = takeRestorePoint({ migration: true, live: false, status: 404 });
  assert.equal(none.code, 0, none.out);
  assert.match(none.out, /Take a restore point: not run: the live build has no restore-point door/);
  assert.match(none.env, /^RESTORE_POINT_NEEDED=unknown$/m);
});

test('a walk that asked nobody is red while the canary is named, and a warning while it is not', () => {
  const red = takeRestorePoint({ migration: true, said: tallied(0), canary: 'canary' });
  assert.equal(red.code, 1, `a restore point of nobody passed:\n${red.out}`);
  assert.match(red.out, /::error::Take a restore point: no open record was listed/);
  assert.match(red.asked, /"open":true/, 'the door is not told the host holds a record');
  const unknown = takeRestorePoint({ migration: true, said: tallied(0) });
  assert.equal(unknown.code, 0, unknown.out);
  assert.match(unknown.out, /::warning::Take a restore point: not checked: no open record was listed/);
  assert.doesNotMatch(unknown.asked, /"open"/);
  const green = takeRestorePoint({ migration: true, said: tallied(3), canary: 'canary' });
  assert.equal(green.code, 0, green.out);
});

test('the check after the deploy is the same script, told it runs after, so a 404 is red there once a migration shipped', () => {
  /* THE SCRIPT AS THE STEP WRITES IT, run as `Check the records open` runs it: the build then live has the door. */
  const lifted = /cat > "\$RUNNER_TEMP\/restore-point\.mjs" <<'JS'\n([\s\S]*?)\nJS\n/.exec(script('Take a restore point'));
  assert.ok(lifted, 'the restore-point script is no longer written by a heredoc named JS');
  assert.match(step('Check the records open').body, /restore-point\.mjs" check "Check the records open" after\n/);
  const dir = mkdtempSync(join(tmpdir(), 'braindog-check-after-'));
  try {
    writeFileSync(join(dir, 'restore-point.mjs'), lifted[1]);
    writeFileSync(join(dir, 'stub.mjs'), STUB);
    const after = (needed, when) =>
      spawnSync(process.execPath, [join(dir, 'restore-point.mjs'), 'check', 'Check the records open', ...when], {
        encoding: 'utf8',
        env: { PATH: process.env.PATH, NODE_OPTIONS: `--import=${pathToFileURL(join(dir, 'stub.mjs')).href}`, STUB_LOG: join(dir, 'asked.log'), STUB_STATUS: '404', STUB_BODY: 'null', DEPLOY_HOST: 'host.example', HEAD_SHA: 'abcdef1', PROVISION_KEY: 'not-a-real-key', RESTORE_POINT_NEEDED: needed },
      });
    const red = after('yes', ['after']);
    assert.equal(red.status, 1, `a Worker with no operator key passed the check after a migration shipped:\n${red.stdout}${red.stderr}`);
    assert.match(red.stderr, /::error::Check the records open: the live build has no restore-point door[^\n]*A migration changed in this deploy/);
    const quiet = after('no', ['after']);
    assert.equal(quiet.status, 0, quiet.stderr);
    assert.match(quiet.stdout, /Check the records open: not run: the live build has no restore-point door/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const body = step('Take a restore point').body;
  assert.match(body, /echo "RESTORE_POINT_NEEDED=\$needed" >> "\$GITHUB_ENV"/);
  assert.match(body, /const needed = process\.env\.RESTORE_POINT_NEEDED === 'yes';/);
  assert.doesNotMatch(step('Check the records open').body, /RESTORE_POINT_NEEDED/, 'the check sets its own answer over the one the diff gave');
});
