/**
 * What `ci.yml` promises about itself, read off the workflow file.
 *
 *   node --test apps/worker/scripts/ci-workflow.test.mjs
 *
 * THE LEGS ARE THE WHOLE TREE OR THEY ARE A HOLE. `test` runs the suite in four legs, each over a list of folders, and a
 * workspace in no leg is a package whose tests CI never runs while every run is green. So the legs are read here against
 * `pnpm-workspace.yaml`, and this file runs in the `apps` leg, which puts the check on every push.
 *
 * AND THE GATES ARE CHOSEN BY WHAT THEY NEED, NOT BY NAME. A list of gate names is the other place a check can go
 * quietly missing: a name added for a good reason in one commit is a gate nobody runs after the reason has gone. So
 * `gates` runs `--unbuilt` and `build` runs `--built`, and the one name list left is the pair PRF-B10 moves. The site's
 * tests and the gate runner's own tests are held to a step that follows the build they read.
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
    apps: [...['worker', 'selfhost', 'cli', 'site'].map((a) => `apps/${a}`), 'tools/client-checks'],
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

test('the docs tests run by their glob in exactly one leg, and the root pnpm test still runs everything', () => {
  const all = steps(job(ci, 'test'));
  const docs = at(all, /node --test docs\/test\/\*\.test\.mjs/, 'runs the docs tests by their glob');
  assert.equal(all[docs].if, 'matrix.links');
  assert.deepEqual(legs().filter((leg) => leg.links === true).map((leg) => leg.leg), ['apps']);

  const scripts = JSON.parse(read('package.json')).scripts;
  assert.equal(scripts.test, 'pnpm -r --workspace-concurrency=1 run test && node --test docs/test/*.test.mjs');
  assert.equal(scripts.typecheck, 'pnpm -r run typecheck');
});

/* THE REGISTRY, READ AS TEXT. `run.mjs` runs its gates when it is imported, so the names are read off `GATES` the way
   this file reads the workflow: one entry per line at two spaces, `['name', ...`, between `const GATES = [` and `];`. */
function registry() {
  const lines = read('tools', 'gates', 'run.mjs').split('\n');
  const start = lines.indexOf('const GATES = [');
  assert.ok(start !== -1, 'tools/gates/run.mjs has no `const GATES = [` line to read the gate names from');
  const end = lines.indexOf('];', start);
  const names = lines.slice(start + 1, end).map((line) => /^ {2}\['([\w-]+)',/.exec(line)?.[1]).filter(Boolean);
  assert.ok(names.length > 20, `read ${names.length} gate names from run.mjs, so this is not reading the registry`);
  return names;
}

/** Every run of the gate runner in a block of workflow text, by its arguments. */
const runnerRuns = (text) => [...text.matchAll(/(?:node tools\/gates\/run\.mjs|pnpm gates --)([^\n]*)/g)].map((m) => m[1].trim());

/** Every gate a run line names, after `--only`, `--except` or `--allow-skip`. */
const named = (args) => [...args.matchAll(/--(?:only|except|allow-skip) ([\w,-]+)/g)].flatMap((m) => m[1].split(','));

/* EVERY NAME A WORKFLOW HANDS THE RUNNER IS A GATE. `run.mjs` is exit 2 on a misspelt one, but only in the run that
   reaches it, and `gates.yml`'s run is on a push to master alone: a renamed gate would be a red master rather than a
   red pull request. Read here, every workflow is held to the registry on every push. */
test('every gate a workflow names is one the registry knows', () => {
  const known = registry();
  const dir = join(ROOT, '.github', 'workflows');
  for (const file of readdirSync(dir).filter((name) => /\.ya?ml$/.test(name))) {
    const text = read('.github', 'workflows', file).split('\n').filter(meaningful).join('\n');
    for (const args of runnerRuns(text)) {
      const unknown = named(args).filter((name) => !known.includes(name));
      assert.deepEqual(unknown, [], `${file} hands the gate runner ${unknown.join(', ')}, which tools/gates/run.mjs does not register`);
    }
  }
});

/* SELECTION BY NEED, NOT BY NAME (PRF-B01). A list of names is a gate somebody adds tomorrow that runs nowhere, and
   the ten names the gates job once left out were each a place for that. So `gates` runs `--unbuilt`, `build` runs
   `--built`, and the one list left is the build job's `--except layout,a11y`, which PRF-B10 removes once a red screen
   check stops the deploy. Any other name in a run line of ci.yml is red here. */
test('the gates job runs every gate that needs nothing built, and names none', () => {
  const gatesJob = job(ci, 'gates');
  assert.equal(key(gatesJob, 4, 'timeout-minutes'), '25');
  const runs = steps(gatesJob).filter((step) => /pnpm gates|run\.mjs/.test(step.body));
  assert.equal(runs.length, 1, 'the gates job runs the gate runner more than once, or not at all');
  assert.equal(runs[0].run, 'node tools/gates/run.mjs --unbuilt');
});

test('the build job runs every gate a web build satisfies, and names only the two that wait for PRF-B10', () => {
  const all = steps(job(ci, 'build'));
  const runs = all.map((step, index) => [step, index]).filter(([step]) => /pnpm gates|run\.mjs/.test(step.body));
  assert.equal(runs.length, 1, 'the build job runs the gate runner more than once, or not at all');
  const [[step, index]] = runs;
  assert.match(step.run, /^node tools\/gates\/run\.mjs --built\b/, 'the build job does not select its gates by what they need');
  assert.deepEqual(named(step.run).sort(), ['a11y', 'layout'], 'the build job names a gate other than layout and a11y, the two PRF-B10 moves here');
  assert.match(step.run, /--except layout,a11y$/);
  assert.ok(at(all, /pnpm --filter @braindog\/web build/, 'builds the app') < index, 'the built gates run before the app is built');

  const everyName = runnerRuns(code).flatMap(named).sort();
  assert.deepEqual(everyName, ['a11y', 'layout'], `ci.yml names gates in its run lines beyond the PRF-B10 pair: ${everyName.join(', ')}`);
});

/* THE SITE'S TESTS READ THE SITE AS BUILT, AND THEY RAN NOWHERE THAT HAD ONE (LCH-B01). The `apps` leg builds no site,
   so they skipped there, and the job that builds it ran none of them. `SITE_BUILT=1` makes a missing build a failure
   instead of a skip (`apps/site/test/built.ts`), so this step without the flag would be the same green as before. */
test('the build job tests the site against its build, with a missing build a failure', () => {
  const all = steps(job(ci, 'build'));
  const build = at(all, /pnpm --filter @braindog\/site build/, 'builds the site');
  const tests = at(all, /pnpm --filter @braindog\/site test/, 'runs the site\'s tests after building it');
  const diff = at(all, /git diff --exit-code/, 'checks the build changed no tracked file');
  assert.ok(build < tests, 'the site\'s tests run before the build they read');
  assert.ok(tests < diff, 'the site\'s tests run after the diff check, so a file they write is never seen');
  assert.equal(all[tests].if, null, 'the site\'s tests are conditional');
  assert.equal(all[tests].run, 'pnpm --filter @braindog/site test');
  assert.match(all[tests].body, /^ {8}env:\n {10}SITE_BUILT: '1'$/m, 'the site\'s tests run without SITE_BUILT=1, so a missing build skips again');
});

/* AND THE RUNNER'S OWN TESTS RUN SOMEWHERE (PRF-B01). `tools` is no workspace, so no leg reaches `tools/gates/test`,
   and the tests that hold what a gate needs and how a run is cut had run on no runner. */
test('the build job runs the gate runner\'s own tests by their glob, after the builds', () => {
  const all = steps(job(ci, 'build'));
  const runner = at(all, /node --test tools\/gates\/test\/\*\.test\.mjs/, 'runs tools/gates/test');
  assert.equal(all[runner].run, 'node --test tools/gates/test/*.test.mjs');
  assert.equal(all[runner].if, null);
  assert.ok(at(all, /pnpm --filter @braindog\/web build/, 'builds the app') < runner, 'the runner\'s tests run before the app is built');
});

/* AND THE LOOK'S TESTS, WHICH NOTHING RAN: `tools/look` is no workspace, as `tools/gates` is not (batch 35). */
test('the build job runs the look\'s own tests by their glob', () => {
  const all = steps(job(ci, 'build'));
  const look = at(all, /node --test tools\/look\/test\/\*\.test\.mjs/, 'runs tools/look/test');
  assert.equal(all[look].run, 'node --test tools/look/test/*.test.mjs tools/look/*.test.mjs');
  assert.equal(all[look].if, null);
});

/* AND THE WATCH'S (LCH-C01): `tools/watch` is no workspace either, so the test of what launch watches ran nowhere. */
test('the build job runs the watch\'s own tests by their glob, beside the look\'s', () => {
  const all = steps(job(ci, 'build'));
  const watch = at(all, /node --test tools\/watch\/\*\.test\.mjs/, 'runs tools/watch');
  assert.equal(all[watch].run, 'node --test tools/watch/*.test.mjs');
  assert.equal(all[watch].if, null);
});

/* A REAL CLIENT'S HANDSHAKE, WITH THE BUNDLE THAT SHIPS (PRF-A06). After the command is built, so it greets what an agent
   app starts; before the diff check, so a file it wrote would be seen; and with `BRAINDOG_CLI_BUILT=1`, without which a
   missing bundle quietly falls back to the source the `apps` leg already ran. */
test('the build job greets the bundled command with real MCP clients, after building it', () => {
  const all = steps(job(ci, 'build'));
  const build = at(all, /pnpm --filter braindog-cli build/, 'bundles the command');
  const greet = at(all, /node --test tools\/client-checks\/sdk\.test\.mjs/, 'greets the agent door with real MCP clients');
  const diff = at(all, /git diff --exit-code/, 'checks the build changed no tracked file');
  assert.ok(build < greet, 'the clients greet the command before it is bundled');
  assert.ok(greet < diff, 'the clients greet the command after the diff check, so a file they write is never seen');
  assert.equal(all[greet].if, null, 'the handshake check is conditional');
  assert.equal(all[greet].run, 'node --test tools/client-checks/sdk.test.mjs');
  assert.match(all[greet].body, /^ {8}env:\n {10}BRAINDOG_CLI_BUILT: '1'$/m, 'the handshake runs without BRAINDOG_CLI_BUILT=1, so it greets the source and not the bundle');
});

/* THE SELF-HOST'S APP-PATH TEST SKIPS WITHOUT `apps/web/build`, so it runs only after the job builds the app (batch 35). */
test('the build job runs the self-host\'s app-path test after building the app', () => {
  const all = steps(job(ci, 'build'));
  const web = at(all, /pnpm --filter @braindog\/web build/, 'builds the app');
  const path = at(all, /node --test apps\/selfhost\/test\/app-path\.test\.ts/, 'runs the app-path test');
  assert.ok(web < path, 'the app-path test runs before the build it reads');
  assert.equal(all[path].if, null);
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
