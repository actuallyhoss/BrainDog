/**
 * What `ci.yml` promises about itself, read off the workflow file.
 *
 *   node --test apps/worker/scripts/ci-workflow.test.mjs
 *
 * THE LEGS ARE THE WHOLE TREE OR THEY ARE A HOLE. `test` runs the suite in four legs, each over a list of folders, and a
 * workspace in no leg is a package whose tests CI never runs while every run is green. So the legs are read here against
 * `pnpm-workspace.yaml`, and this file runs in the `apps` leg, which puts the check on every push.
 *
 * AND EVERY GATE `gates` LEAVES OUT IS RUN SOMEWHERE ELSE. Its `--except` list is the other place a check can go quietly
 * missing: a name added there for a good reason in one commit is a gate nobody runs after the reason has gone. Each name
 * on it is accounted for below by the job or workflow that runs it instead.
 *
 * THE FILE IS READ AS LINES AT THE INDENTS IT IS WRITTEN IN. No YAML parser is a dependency of this workspace, and the
 * shape read here is the one the file is written in: a job at two spaces under `jobs:`, its steps at six under `steps:`,
 * and a step's keys at eight, as `deploy-workflow.test.mjs` reads `deploy.yml`.
 */

import { strict as assert } from 'node:assert';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { ROOT } from './provision-check.mjs';

const read = (...path) => readFileSync(join(ROOT, ...path), 'utf8').replace(/\r\n/g, '\n');
const ci = read('.github', 'workflows', 'ci.yml');

/* A COMMENT OR A BLANK LINE BELONGS TO NOTHING, so neither can end a block or be read as one of its keys. */
const meaningful = (line) => line.trim() !== '' && !/^\s*#/.test(line);

/* WHAT GITHUB RUNS, without the comments, which name `continue-on-error` and the Cloudflare variables to say why they are
   absent. */
const code = ci.split('\n').filter(meaningful).join('\n');

/** The names of the jobs, in the order the file writes them. */
function jobNames(source) {
  const lines = source.split('\n');
  const start = lines.indexOf('jobs:');
  assert.ok(start !== -1, 'the workflow has no jobs: block');
  return lines.slice(start + 1).map((line) => /^ {2}([\w-]+):\s*$/.exec(line)?.[1]).filter((name) => name !== undefined);
}

/** One job's lines, from the line after its name to the next job, without comments or blank lines. */
function job(source, name) {
  const lines = source.split('\n');
  const from = lines.indexOf('jobs:');
  const start = lines.findIndex((line, i) => i > from && line === `  ${name}:`);
  assert.ok(from !== -1 && start !== -1, `the workflow has no job named ${name}`);
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (!meaningful(line)) continue;
    if (!/^ {3}/.test(line)) break;
    body.push(line);
  }
  return body;
}

/** The value of a key at one indent in a block of lines, or null. */
function key(lines, indent, name) {
  const pattern = new RegExp(`^ {${indent}}${name}:\\s*(.*)$`);
  const found = lines.map((line) => pattern.exec(line)).find((m) => m !== null);
  return found ? found[1].trim() : null;
}

/** Each step of a job as `{ name, if, uses, run, body }`, in the order the job runs them. */
function steps(lines) {
  const start = lines.findIndex((line) => /^ {4}steps:\s*$/.test(line));
  assert.ok(start !== -1, 'the job has no steps list at four spaces');
  const blocks = [];
  for (const line of lines.slice(start + 1)) {
    if (/^ {6}- /.test(line)) blocks.push([line.replace(/^ {6}- /, '        ')]);
    else if (blocks.length > 0 && /^ {8}/.test(line)) blocks.at(-1).push(line);
    else break;
  }
  return blocks.map((block) => ({ name: key(block, 8, 'name'), if: key(block, 8, 'if'), uses: key(block, 8, 'uses'), run: key(block, 8, 'run'), body: block.join('\n') }));
}

/** The index of the first step whose body matches, asserted present. */
function at(all, pattern, what) {
  const index = all.findIndex((step) => pattern.test(step.body));
  assert.ok(index !== -1, `no step ${what}`);
  return index;
}

/** The comma-separated gate names after a flag in a line of text. */
function listAfter(text, flag) {
  const found = new RegExp(`${flag} ([\\w,-]+)`).exec(text);
  assert.ok(found, `nothing names ${flag}`);
  return found[1].split(',');
}

/** The matrix legs as `{ leg, dirs, browser, links }`, `dirs` as written. */
function legs() {
  const lines = job(ci, 'test');
  const start = lines.findIndex((line) => /^ {8}include:\s*$/.test(line));
  assert.ok(start !== -1, 'the test job has no matrix include list');
  const found = [];
  for (const line of lines.slice(start + 1)) {
    const opens = /^ {10}- leg: ([\w-]+)\s*$/.exec(line);
    const field = /^ {12}(\w+): (.*)$/.exec(line);
    if (opens) found.push({ leg: opens[1], dirs: '', browser: false, links: false });
    else if (field && found.length > 0) {
      const value = field[2].trim().replace(/^'(.*)'$/, '$1');
      found.at(-1)[field[1]] = value === 'true' ? true : value;
    } else break;
  }
  return found;
}

/* A FOLDER LIST AS WRITTEN, EXPANDED. `x/*`, with or without the trailing slash `ci.yml` writes, is every folder directly
   under `x`: what pnpm reads in `pnpm-workspace.yaml`, and what bash makes of the slashed form in the step. Anything else
   is the one folder it names. */
function expand(token) {
  const glob = /^(.+)\/\*\/?$/.exec(token);
  if (!glob) return [token.replace(/\/$/, '')];
  const parent = glob[1];
  return readdirSync(join(ROOT, parent))
    .filter((name) => statSync(join(ROOT, parent, name)).isDirectory())
    .map((name) => `${parent}/${name}`);
}

const legDirs = (leg) => leg.dirs.split(/\s+/).filter(Boolean).flatMap(expand).sort();

/** Every workspace folder, from `pnpm-workspace.yaml`'s own globs: a folder under one that holds a `package.json`. */
function workspaces() {
  const lines = read('pnpm-workspace.yaml').split('\n');
  const start = lines.indexOf('packages:');
  const globs = [];
  for (const line of lines.slice(start + 1)) {
    if (!meaningful(line)) continue;
    const entry = /^ {2}- (\S+)\s*$/.exec(line);
    if (!entry) break;
    globs.push(entry[1]);
  }
  assert.ok(globs.length > 0, 'pnpm-workspace.yaml lists no packages');
  return globs.flatMap(expand).filter((dir) => existsSync(join(ROOT, dir, 'package.json'))).sort();
}

/* THE THREE JOBS, IN THIS ORDER, AND NO `check` BESIDE THEM. Other jobs may follow them (`windows` is one), so the
   three are read out of the whole list rather than held equal to it: a job added later is its own file's to test, and pinning the list here would make every such addition red in a file that says nothing about it. */
test('the jobs are the four-leg test, the source gates and the build, and the single check job is gone', () => {
  const names = jobNames(ci);
  assert.deepEqual(names.filter((name) => ['test', 'gates', 'build'].includes(name)), ['test', 'gates', 'build']);
  assert.ok(!names.includes('check'), 'the single check job is back beside the legs, so every test runs twice');
  assert.doesNotMatch(code, /continue-on-error/, 'a step that cannot fail is a check that does not run');
});

test('every workspace is in exactly one leg, and every folder a leg names is a workspace', () => {
  const all = workspaces();
  const seen = new Map();
  for (const leg of legs()) {
    for (const dir of legDirs(leg)) {
      assert.ok(existsSync(join(ROOT, dir, 'package.json')), `the ${leg.leg} leg names ${dir}, which holds no package.json`);
      assert.ok(!seen.has(dir), `${dir} is in both the ${seen.get(dir)} and the ${leg.leg} legs, so its tests run twice`);
      seen.set(dir, leg.leg);
    }
  }
  const missing = all.filter((dir) => !seen.has(dir));
  assert.deepEqual(missing, [], `in no leg, so ci.yml never runs their tests: ${missing.join(', ')}`);
});

test('the legs are the four the workflow was drawn with', () => {
  const packs = expand('packs/*/').filter((dir) => existsSync(join(ROOT, dir, 'package.json')));
  const drawn = {
    kernel: ['ports', 'where', 'kernel', 'declare', 'extract', 'dog'].map((p) => `packages/${p}`),
    record: [...['record', 'host', 'mcp', 'client', 'slash', 'seed', 'script', 'connect'].map((p) => `packages/${p}`), ...packs],
    web: ['apps/web', ...['render', 'theme', 'skin'].map((p) => `packages/${p}`)],
    apps: ['worker', 'selfhost', 'cli', 'site'].map((a) => `apps/${a}`),
  };
  const found = legs();
  assert.deepEqual(found.map((leg) => leg.leg), Object.keys(drawn));
  for (const leg of found) assert.deepEqual(legDirs(leg), [...drawn[leg.leg]].sort(), `the ${leg.leg} leg`);
});

test('each leg typechecks and then tests its own workspaces, under its own 25-minute ceiling', () => {
  const lines = job(ci, 'test');
  assert.equal(key(lines, 4, 'timeout-minutes'), '25');
  assert.equal(key(lines, 6, 'fail-fast'), 'false', 'a red leg cancels the others and hides what they would have found');
  const all = steps(lines);

  const choose = at(all, /for dir in \$DIRS/, 'turns the leg\'s folders into filters');
  assert.match(all[choose].body, /DIRS: \$\{\{ matrix\.dirs \}\}/);
  assert.match(all[choose].body, /FILTERS=\$filters" >> "\$GITHUB_ENV"/);
  assert.match(all[choose].body, /package\.json.*exit 1/, 'a leg folder with no workspace in it is not refused');

  const typecheck = at(all, /run typecheck/, 'typechecks the leg');
  const tests = at(all, /run test$/m, 'tests the leg');
  assert.ok(choose < typecheck && typecheck < tests, 'the leg tests before it typechecks, or before it has chosen its workspaces');
  assert.equal(all[typecheck].run, 'pnpm -r $FILTERS run typecheck');
  assert.equal(all[tests].run, 'pnpm -r --workspace-concurrency=1 $FILTERS run test');
  assert.equal(all[typecheck].if, null);
  assert.equal(all[tests].if, null);

  const browser = at(all, /playwright install --with-deps chromium/, 'installs chromium');
  assert.equal(all[browser].if, 'matrix.browser');
  assert.ok(browser < tests, 'chromium is installed after the tests that launch it');
  assert.ok(legs().some((leg) => leg.leg === 'web' && leg.browser === true), 'the web leg, whose figure-fit test launches chromium, installs none');
});

test('the links test runs in exactly one leg, and the root pnpm test still runs everything', () => {
  const all = steps(job(ci, 'test'));
  const links = at(all, /node --test docs\/test\/links\.test\.mjs/, 'runs the links test');
  assert.equal(all[links].if, 'matrix.links');
  assert.deepEqual(legs().filter((leg) => leg.links === true).map((leg) => leg.leg), ['apps']);

  const scripts = JSON.parse(read('package.json')).scripts;
  assert.equal(scripts.test, 'pnpm -r --workspace-concurrency=1 run test && node --test docs/test/links.test.mjs');
  assert.equal(scripts.typecheck, 'pnpm -r run typecheck');
});

test('every gate the gates job leaves out is run by a job or a workflow that can', () => {
  const gatesJob = job(ci, 'gates');
  assert.equal(key(gatesJob, 4, 'timeout-minutes'), '25');
  const runs = steps(gatesJob).filter((step) => /pnpm gates|run\.mjs/.test(step.body));
  assert.equal(runs.length, 1, 'the gates job runs the gate runner more than once, or not at all');
  const except = listAfter(runs[0].body, '--except');

  const build = steps(job(ci, 'build')).find((step) => /tools\/gates\/run\.mjs --only/.test(step.body));
  assert.ok(build, 'the build job runs no gates');
  const afterBuild = listAfter(build.body, '--only');

  const gates = read('.github', 'workflows', 'gates.yml');
  const onPush = /if: github\.event_name == 'push'\n\s+run: pnpm gates -- --only ([\w,-]+)/.exec(gates);
  assert.ok(onPush, 'gates.yml runs no gate on a push to master');
  const browserGates = onPush[1].split(',');

  /* `typecheck` is every leg's first step, and `deploy-parity` needs a live host, which only `deploy.yml` has. */
  const accounted = ['typecheck', ...afterBuild, ...browserGates, 'deploy-parity'].sort();
  assert.deepEqual([...except].sort(), accounted, 'a gate is left out of the gates job and run nowhere else, or run twice');
});

test('build dry-runs both production deploys after both builds and the diff check, with no Cloudflare credential', () => {
  const all = steps(job(ci, 'build'));
  const web = at(all, /pnpm --filter @braindog\/web build/, 'builds the app');
  const site = at(all, /pnpm --filter @braindog\/site build/, 'builds the site');
  const diff = at(all, /git diff --exit-code/, 'checks the build changed no tracked file');
  const app = at(all, /--filter \.\/apps\/worker exec wrangler deploy --dry-run/, 'dry-runs the app deploy');
  const marketing = at(all, /--filter \.\/apps\/site exec wrangler deploy --dry-run/, 'dry-runs the site deploy');
  assert.ok(web < diff && site < diff, 'the diff check runs before a build it exists to check');
  assert.ok(diff < app && diff < marketing, 'a dry run comes before the builds it reads, or before the diff check');

  for (const [index, out] of [[app, 'worker'], [marketing, 'site']]) {
    const step = all[index];
    assert.match(step.body, new RegExp(`wrangler deploy --dry-run --env production --outdir "\\$RUNNER_TEMP/${out}"`));
    assert.match(step.body, /unset CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID/);
    assert.equal(step.if, null, `the ${out} dry run is conditional`);
    assert.doesNotMatch(step.body, /^ {8}env:/m, `the ${out} dry run is handed an environment`);
  }

  assert.doesNotMatch(code, /\bsecrets\./, 'ci.yml reads a secret');
  assert.doesNotMatch(code, /^\s*CLOUDFLARE_(API_TOKEN|ACCOUNT_ID)\s*:/m, 'ci.yml sets a Cloudflare credential');
});
