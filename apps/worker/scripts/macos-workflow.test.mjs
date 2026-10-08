/**
 * What `macos.yml` promises about itself, read off the workflow file, and on a Mac its run step, run.
 *
 *   node --test apps/worker/scripts/macos-workflow.test.mjs
 *
 * THE LEG IS ONLY WORTH ITS GREEN IF IT RUNS THE BASH FORM. `provision-ask.test.mjs` skips its one real run when there is
 * no bash with curl and node, so a Mac leg that ran the file and read only its exit code could be green having posted
 * nothing. This holds the leg to the things that make it a test: a Mac, the Node every other job pins, Apple's bash
 * first, the skip count read, and a name with a quote, an apostrophe and `ë` in the answers.
 *
 * READ AS LINES AT THE INDENTS THE FILE IS WRITTEN IN, as `ci-workflow.test.mjs` reads `ci.yml`: no YAML parser is a
 * dependency of this workspace.
 */

import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { ROOT } from './provision-check.mjs';

const read = (...path) => readFileSync(join(ROOT, ...path), 'utf8').replace(/\r\n/g, '\n');
const mac = read('.github', 'workflows', 'macos.yml');
const code = mac.split('\n').filter((line) => line.trim() !== '' && !/^\s*#/.test(line)).join('\n');

/** The lines of the `run: |` block under the step named `name`, without their indent. */
function runOf(name) {
  const lines = code.split('\n');
  const at = lines.findIndex((line) => line.trim() === `- name: ${name}`);
  assert.ok(at >= 0, `macos.yml has no step named ${name}`);
  const start = lines.indexOf('        run: |', at);
  assert.ok(start > at, `the step ${name} has no run block`);
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith('          ')) break;
    body.push(line.slice(10));
  }
  return body.join('\n');
}

test('THE LEG IS A MAC, ON THE NODE EVERY OTHER JOB PINS', () => {
  assert.match(code, /^name: macos$/m);
  assert.match(code, /runs-on: \$\{\{ vars\.MACOS_RUNNER \|\| 'macos-latest' \}\}/);
  const pinned = read('.github', 'actions', 'setup', 'action.yml').match(/^\s+node-version: (\d+\.\d+\.\d+)$/m)?.[1];
  assert.ok(pinned, 'the setup action pins no Node');
  assert.match(code, new RegExp(`node-version: ${pinned.replace(/\./g, '\\.')}$`, 'm'), `macos.yml runs another Node than ${pinned}`);
});

test('IT RUNS WHEN THE COMMAND OR ITS TEST CHANGES, weekly, and deploys nothing', () => {
  for (const path of ['apps/worker/scripts/provision-check.mjs', 'apps/worker/scripts/provision-ask.test.mjs', '.github/workflows/macos.yml'])
    assert.equal(code.split('\n').filter((line) => line.trim() === `- ${path}`).length, 2, `${path} does not start both the push and the pull request run`);
  assert.match(code, /- cron: '30 6 \* \* 1'/);
  assert.match(code, /^ {2}workflow_dispatch:$/m);
  /* `deploy.yml` follows a run of `ci`, so a workflow by any other name deploys nothing. */
  assert.match(read('.github', 'workflows', 'deploy.yml'), /workflows: \[ci\]/);
});

test('APPLE\'S BASH GOES FIRST ON THE PATH, AND THE SKIP COUNT IS READ', () => {
  const first = runOf("Put Apple's bash first");
  assert.match(first, /ln -sf \/bin\/bash "\$RUNNER_TEMP\/apple-bash\/bash"/);
  assert.match(first, />> "\$GITHUB_PATH"/);
  const run = runOf('Run the bash form with a quoted, accented name');
  assert.match(run, /apps\/worker\/scripts\/provision-ask\.test\.mjs/);
  assert.match(run, /grep -qx '# fail 0'/);
  assert.match(run, /grep -qx '# skipped 0'/);
});

test('THE NAME THE BASH FORM IS RUN WITH HOLDS A DOUBLE QUOTE, AN APOSTROPHE AND ë', () => {
  const ask = read('apps', 'worker', 'scripts', 'provision-ask.test.mjs');
  const typed = ask.match(/const answers = \[[^\]]*'([^']*"[^']*\\'[^']*)'/)?.[1];
  assert.ok(typed, 'the answers the bash form is run with hold no name with a quote and an apostrophe');
  assert.match(typed, /ë/);
});

/** Whether this is a Mac with Apple's bash, where the run step can be run as the leg runs it. */
const onMac = process.platform === 'darwin';

test('AND ON A MAC THE RUN STEP, RUN, IS GREEN AND SKIPS NOTHING', { skip: !onMac && 'not a Mac' }, async (t) => {
  const temp = mkdtempSync(join(tmpdir(), 'macos-leg-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  symlinkSync('/bin/bash', join(temp, 'bash'));
  /* WITHOUT `NODE_TEST_CONTEXT`, which this runner sets and which would make the inner `node --test` report to it. */
  const env = { ...process.env, RUNNER_TEMP: temp, PATH: `${temp}:${process.env.PATH}` };
  delete env.NODE_TEST_CONTEXT;
  const out = await new Promise((resolve, reject) =>
    execFile('/bin/bash', ['-e', '-c', runOf('Run the bash form with a quoted, accented name')], { cwd: ROOT, env }, (err, stdout, stderr) =>
      err ? reject(new Error(`${err.message}\n${stdout}\n${stderr}`)) : resolve(stdout),
    ),
  );
  assert.match(readFileSync(join(temp, 'provision-ask.tap'), 'utf8'), /^# pass [1-9]/m, out);
});
