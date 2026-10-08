/**
 * What `watch.yml` runs, when, and with what it may touch, read off the workflow file (LCH-C01).
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

test('HOURLY AT MINUTE 7, AND BY HAND WITH A host INPUT', () => {
  const on = under(lines, 0, 'on');
  assert.deepEqual(under(on, 2, 'schedule'), ["    - cron: '7 * * * *'"]);
  const inputs = under(under(on, 2, 'workflow_dispatch'), 4, 'inputs');
  assert.ok(inputs.includes('      host:'), inputs.join('\n'));
  assert.ok(under(inputs, 6, 'host').includes('        required: false'));
});

test('IT MAY READ AND NOTHING ELSE: contents and actions, both read', () => {
  assert.deepEqual(under(lines, 0, 'permissions').map((l) => l.trim()).sort(), ['actions: read', 'contents: read']);
  assert.doesNotMatch(code, /:\s*write\b/);
  assert.doesNotMatch(code, /secrets\./, 'the watch needs no secret beyond the workflow token');
});

test("NODE ONLY, ON GITHUB'S MACHINES: a checkout, Node 24.13.0, and the one command, with no install", () => {
  assert.match(code, /^ {4}runs-on: ubuntu-latest$/m, 'a self-hosted runner is his machine, not outside');
  const uses = [...code.matchAll(/uses: (\S+)/g)].map((m) => m[1]);
  assert.deepEqual(uses, ['actions/checkout@v4', 'actions/setup-node@v4']);
  assert.match(code, /node-version: 24\.13\.0/);
  const runs = [...code.matchAll(/^\s+run: (.+)$/gm)].map((m) => m[1]);
  assert.deepEqual(runs, ['node tools/watch/launch.mjs']);
  assert.doesNotMatch(code, /pnpm|npm (ci|install)|corepack/);
  assert.ok(existsSync(join(ROOT, 'tools', 'watch', 'launch.mjs')), 'the script the workflow runs is not there');
});

test('THE INPUT REACHES THE SCRIPT THROUGH THE ENVIRONMENT, never pasted into the command', () => {
  assert.match(code, /^ {10}WATCH_HOST: \$\{\{ inputs\.host \}\}$/m);
  assert.match(code, /^ {10}GITHUB_TOKEN: \$\{\{ github\.token \}\}$/m);
  const runs = [...code.matchAll(/^\s+run: (.+)$/gm)].map((m) => m[1]);
  assert.ok(runs.every((r) => !r.includes('${{')), runs.join('\n'));
});

test('A RUN THAT HANGS IS STOPPED: one job with a limit of minutes, far under GitHub\'s six hours', () => {
  const limits = [...code.matchAll(/timeout-minutes: (\d+)/g)].map((m) => Number(m[1]));
  assert.equal(limits.length, 1);
  assert.ok(limits[0] <= 10, String(limits[0]));
});
