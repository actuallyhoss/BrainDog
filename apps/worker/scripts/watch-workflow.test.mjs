/**
 * What `watch.yml` runs, when, and with what it may touch, read off the workflow file.
 *
 *   node --test apps/worker/scripts/watch-workflow.test.mjs
 *
 * THE WORKFLOW IS THE GUARD, so a quiet change to it is the watch gone quiet: a schedule dropped, a write permission
 * added, an install step that a broken lock file turns red, or the dispatch input pasted into the shell. Each is held
 * here. The script's own answers are held by `tools/watch/launch.test.mjs`.
 *
 * THE FILE IS READ AS LINES AT THE INDENTS IT IS WRITTEN IN, for the reason `ci-workflow.test.mjs` gives: no YAML parser
 * is a dependency of this workspace.
 */

import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { ROOT } from './provision-check.mjs';

const text = readFileSync(join(ROOT, '.github', 'workflows', 'watch.yml'), 'utf8').replace(/\r\n/g, '\n');
const lines = text.split('\n').filter((line) => line.trim() !== '' && !/^\s*#/.test(line));
/* WHAT GITHUB RUNS, without the comments, which name the steps while explaining them. */
const code = lines.join('\n');

/** The lines under a key, from the line after it to the first line at its indent or shallower. */
function under(from, indent, name) {
  const start = from.findIndex((line) => line === `${' '.repeat(indent)}${name}:`);
  assert.ok(start !== -1, `watch.yml has no ${name}: at ${indent} spaces`);
  const body = [];
  for (const line of from.slice(start + 1)) {
    if (!line.startsWith(' '.repeat(indent + 1))) break;
    body.push(line);
  }
  return body;
}

/* TWO JOBS, READ APART: the hourly watch, which stays Node only and holds no secret, and the monthly going back. */
const jobs = under(lines, 0, 'jobs');
const watch = under(jobs, 2, 'watch').join('\n');
const goBack = under(jobs, 2, 'go-back').join('\n');

/* BY HAND ONLY SINCE 15 OCTOBER: the owner stopped every schedule so the workflows spend no Actions minutes on their own.
   The steps that read `github.event.schedule` are kept as they were, for the day a schedule comes back. */
test('BY HAND ALONE, WITH A host INPUT', () => {
  const on = under(lines, 0, 'on');
  assert.deepEqual(on.filter((line) => /^ {2}\S/.test(line)), ['  workflow_dispatch:']);
  const inputs = under(under(on, 2, 'workflow_dispatch'), 4, 'inputs');
  assert.ok(inputs.includes('      host:'), inputs.join('\n'));
  assert.ok(under(inputs, 6, 'host').includes('        required: false'));
});

test('IT MAY READ AND NOTHING ELSE: contents and actions, both read', () => {
  assert.deepEqual(under(lines, 0, 'permissions').map((l) => l.trim()).sort(), ['actions: read', 'contents: read']);
  assert.doesNotMatch(code, /:\s*write\b/);
  /* ONE SECRET, AND ONLY FOR THE DAILY SETTINGS STEP: `WATCH_TOKEN`, the owner's read-only token for this one repository,
     since the workflow token cannot read its settings. The hourly ask from outside still holds none. */
  assert.deepEqual([...new Set([...watch.matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1]))], ['WATCH_TOKEN'], 'the watch holds a secret beyond the settings token');
  const launch = watch.slice(0, watch.indexOf('node tools/watch/launch.mjs'));
  assert.doesNotMatch(launch, /secrets\./, 'the hourly ask needs no secret beyond the workflow token');
  assert.deepEqual([...new Set([...goBack.matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1]))], ['CANARY_PASSKEY'], 'going back holds a secret beyond the canary passkey');
});

test("NODE ONLY, ON GITHUB'S MACHINES: a checkout, Node 24.13.0, and the one command, with no install", () => {
  assert.match(watch, /^ {4}runs-on: ubuntu-latest$/m, 'a self-hosted runner is his machine, not outside');
  const uses = [...watch.matchAll(/uses: (\S+)/g)].map((m) => m[1]);
  assert.deepEqual(uses.map((u) => u.split('@')[0]), ['actions/checkout', 'actions/setup-node']);
  for (const u of uses) assert.match(u, /@[0-9a-f]{40}$/, `${u} is not pinned to a commit`);
  assert.match(watch, /node-version: 24\.13\.0/);
  const runs = [...watch.matchAll(/^\s+run: (.+)$/gm)].map((m) => m[1]);
  assert.deepEqual(runs, ['node tools/watch/launch.mjs', 'node tools/watch/settings.mjs']);
  assert.doesNotMatch(watch, /pnpm|npm (ci|install)|corepack/);
  for (const script of ['launch.mjs', 'settings.mjs']) assert.ok(existsSync(join(ROOT, 'tools', 'watch', script)), `${script}, which the workflow runs, is not there`);
});

test('THE INPUT REACHES THE SCRIPT THROUGH THE ENVIRONMENT, never pasted into the command', () => {
  assert.match(code, /^ {10}WATCH_HOST: \$\{\{ inputs\.host \}\}$/m);
  assert.match(code, /^ {10}GITHUB_TOKEN: \$\{\{ github\.token \}\}$/m);
  const runs = [...code.matchAll(/^\s+run: (.+)$/gm)].map((m) => m[1]);
  assert.ok(runs.every((r) => !r.includes('${{')), runs.join('\n'));
});

test('A RUN THAT HANGS IS STOPPED: one job with a limit of minutes, far under GitHub\'s six hours', () => {
  const limits = [...watch.matchAll(/timeout-minutes: (\d+)/g)].map((m) => Number(m[1]));
  assert.equal(limits.length, 1);
  assert.ok(limits[0] <= 10, String(limits[0]));
  const monthly = [...goBack.matchAll(/timeout-minutes: (\d+)/g)].map((m) => Number(m[1]));
  assert.equal(monthly.length, 1);
  assert.ok(monthly[0] <= 45, String(monthly[0]));
});

test('ONCE A MONTH GOING BACK IS DONE ON THE CANARY, in a job of its own that the hourly watch shares nothing with', () => {
  assert.match(goBack, /^ {4}if: github\.event\.schedule == '23 4 1 \* \*' \|\| \(github\.event_name == 'workflow_dispatch' && inputs\.go_back\)$/m);
  assert.match(goBack, /^ {4}environment: production$/m);
  assert.match(goBack, /^ {8}run: node tools\/canary\/lane\.d\/20-signin-live\.mjs$/m);
  assert.match(goBack, /^ {8}run: node apps\/worker\/scripts\/go-back\.mjs$/m);
  assert.ok(goBack.indexOf('20-signin-live.mjs') < goBack.indexOf('scripts/go-back.mjs'), 'going back runs before anybody signed in');
  assert.match(goBack, /if: always\(\)\n {8}run: rm -f "\$RUNNER_TEMP\/go-back-session\.json"/, 'the kept session outlives the job');
  assert.match(goBack, /not run: SMOKE_SLUG and DEPLOY_HOST are not both set/);
  assert.ok(existsSync(join(ROOT, 'apps', 'worker', 'scripts', 'go-back.mjs')), 'the script the job runs is not there');
});
