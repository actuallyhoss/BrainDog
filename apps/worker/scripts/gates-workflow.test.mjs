/**
 * When `gates.yml` runs, and what its steps still say, read off the workflow file.
 *
 *   node --test apps/worker/scripts/gates-workflow.test.mjs
 *
 * BY HAND ONLY SINCE 15 OCTOBER. The owner moved CI and the deploy onto his Mac (`tools/ship`), so nothing starts this
 * workflow but a dispatch. The push trigger and its `paths` list are gone, and with them the walk this file used to make
 * over what `layout` and `a11y` read: a paths filter only matters while a push can start the run. `tools/ship/ci.mjs`
 * runs every gate the runner lists, every time, so no input of either gate can go unmeasured by a filter.
 *
 * THE STEPS STAY THE REFERENCE `tools/ship/ci.mjs` READS, so the split between the push run and the full run is still
 * held here, and so is the build before either.
 *
 * THE FILE IS READ AS LINES AT THE INDENTS IT IS WRITTEN IN, for the reason `ci-workflow.test.mjs` gives: no YAML parser
 * is a dependency of this workspace.
 */

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { ROOT } from './provision-check.mjs';

const read = (path) => readFileSync(join(ROOT, ...path.split('/')), 'utf8').replace(/\r\n/g, '\n');
const gates = read('.github/workflows/gates.yml');
const lines = gates.split('\n').filter((line) => line.trim() !== '' && !/^\s*#/.test(line));
/* WHAT GITHUB RUNS, without the comments, which quote the build commands while explaining them. */
const code = lines.join('\n');

/** The lines under a key, from the line after it to the first line at its indent or shallower. */
function under(from, indent, name) {
  const start = from.findIndex((line) => line === `${' '.repeat(indent)}${name}:`);
  assert.ok(start !== -1, `gates.yml has no ${name}: at ${indent} spaces`);
  const body = [];
  for (const line of from.slice(start + 1)) {
    if (!line.startsWith(' '.repeat(indent + 1))) break;
    body.push(line);
  }
  return body;
}

const on = under(lines, 0, 'on');

test('nothing starts gates.yml but a hand', () => {
  assert.deepEqual(on, ['  workflow_dispatch:'], 'gates.yml has a trigger beside workflow_dispatch, which spends Actions minutes on its own');
});

test('the push run is layout and a11y alone, the full run is every gate, and both follow the build', () => {
  const pushRun = /- if: github\.event_name == 'push'\n\s+run: (.+)/.exec(code);
  const fullRun = /- if: github\.event_name != 'push'\n\s+run: (.+)/.exec(code);
  assert.ok(pushRun && fullRun, 'gates.yml does not split the push run from the full run');
  assert.equal(pushRun[1], 'pnpm gates -- --only layout,a11y --shard ${{ matrix.part }}/${{ strategy.job-total }}');
  /* AND rule-sheet, WHICH READS A PROOF RECORD THE INTERNET SERVES, as deploy-parity reads the live host (batch 40). */
  assert.equal(fullRun[1], 'pnpm gates -- --allow-skip deploy-parity,rule-sheet --shard ${{ matrix.part }}/${{ strategy.job-total }}');

  const build = code.indexOf('pnpm --filter @braindog/web build');
  const site = code.indexOf('pnpm --filter @braindog/site build');
  const diff = code.indexOf('git diff --exit-code');
  assert.ok(build !== -1 && site !== -1 && diff !== -1, 'gates.yml no longer builds what the browser gates measure');
  assert.ok(build < pushRun.index && site < pushRun.index && diff < pushRun.index, 'the push run measures a build it has not made');
});

test('a run cancels an older run of the same event, and the label clause is unchanged', () => {
  const group = lines.find((line) => /^ {2}group:/.test(line)) ?? '';
  assert.match(group, /\$\{\{ github\.event_name \}\}/, 'two events share a concurrency group, so one cancels the other');
  assert.ok(lines.includes('  cancel-in-progress: true'), 'a superseded run still runs to the end');
  assert.ok(
    lines.includes("    if: github.event_name != 'pull_request' || contains(github.event.pull_request.labels.*.name, 'full-gates')"),
    'a pull request runs the gates without the full-gates label, or not with it',
  );
});

test('deploy.yml follows no workflow, so a gates run never holds a deploy back', () => {
  const deploy = read('.github/workflows/deploy.yml');
  assert.doesNotMatch(deploy, /^ {2}workflow_run:/m, 'deploy.yml follows a workflow again');
});
