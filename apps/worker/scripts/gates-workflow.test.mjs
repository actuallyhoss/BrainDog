/**
 * When `gates.yml` runs, and what its push to master is allowed to skip, read off the workflow file.
 *
 *   node --test apps/worker/scripts/gates-workflow.test.mjs
 *
 * A PATHS FILTER IS A LIST OF WHAT A CHECK DOES NOT NEED TO SEE, and it is right only while it matches what the check
 * reads. `layout` and `a11y` run on a push to master whose files touch their inputs, so the list is held here against
 * those inputs as the code states them: the two gates and every file they import, every folder they join onto the
 * repository root, the workspaces that names and every workspace those depend on, and whatever each one's `build` script
 * runs first. A file one of them starts reading tomorrow that no path covers is red here, before a push to it is the
 * one that skips the run.
 *
 * THE FILE IS READ AS LINES AT THE INDENTS IT IS WRITTEN IN, for the reason `ci-workflow.test.mjs` gives: no YAML parser
 * is a dependency of this workspace.
 */

import { strict as assert } from 'node:assert';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, posix } from 'node:path';
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
const push = under(on, 2, 'push');
const paths = under(push, 4, 'paths').map((line) => {
  const entry = /^ {6}- '([^']+)'$/.exec(line);
  assert.ok(entry, `a push path is not written as a quoted list entry: ${line.trim()}`);
  return entry[1];
});

/* EXACT FILES AND WHOLE FOLDERS ONLY, so the matcher below is GitHub's for every path the list holds. A `*` inside a
   segment, a `?` or a negation would each need a rule this does not have. */
const covers = (path) =>
  paths.some((p) => (p.endsWith('/**') ? path === p.slice(0, -3) || path.startsWith(p.slice(0, -2)) : path === p));

/* EVERY WORKSPACE BY ITS NAME, so a dependency, and a `--filter` in a build script, can be followed to its folder. */
const workspaceDirs = ['apps', 'packages', 'packs'].flatMap((parent) =>
  readdirSync(join(ROOT, parent), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(ROOT, parent, d.name, 'package.json')))
    .map((d) => `${parent}/${d.name}`),
);
const manifest = (dir) => JSON.parse(read(`${dir}/package.json`));
const byName = new Map(workspaceDirs.map((dir) => [manifest(dir).name, dir]));
const workspaceOf = (path) => {
  const [parent, name] = path.split('/');
  return name !== undefined && workspaceDirs.includes(`${parent}/${name}`) ? `${parent}/${name}` : null;
};

/** Every path `layout` and `a11y` read, as the code states it, walked from the two gate files. */
function inputs() {
  const needed = new Set();
  const files = ['tools/gates/layout.mjs', 'tools/gates/a11y.mjs'];
  const workspaces = [];
  const seen = new Set();

  const reach = (path) => {
    const workspace = workspaceOf(path);
    if (workspace) workspaces.push(workspace);
    else if (path.endsWith('.mjs') && existsSync(join(ROOT, path))) files.push(path);
    else needed.add(path);
  };

  while (files.length > 0 || workspaces.length > 0) {
    const file = files.pop();
    if (file !== undefined) {
      if (seen.has(file)) continue;
      seen.add(file);
      needed.add(file);
      const source = read(file);
      const dir = posix.dirname(file);
      /* A BARE IMPORT IS A DEPENDENCY, which the lockfile decides: `@playwright/test` is the browser both gates drive. */
      for (const m of source.matchAll(/(?:from |import\()'([^']+)'/g)) {
        const spec = m[1];
        if (spec.startsWith('.')) reach(posix.normalize(posix.join(dir, spec)));
        else if (!spec.startsWith('node:')) needed.add('pnpm-lock.yaml');
      }
      for (const m of source.matchAll(/join\(here, '([^']+)'\)/g)) reach(posix.join(dir, m[1]));
      for (const m of source.matchAll(/join\((?:root|ROOT), ((?:'[^']+'(?:, )?)+)/g)) {
        const segments = [...m[1].matchAll(/'([^']+)'/g)].map((s) => s[1]);
        /* WHAT SITS UNDER `node_modules` ARRIVES THROUGH THE LOCKFILE: `a11y` reads axe-core from there. */
        if (segments[0] === 'node_modules') needed.add('pnpm-lock.yaml');
        else reach(segments.join('/'));
      }
      continue;
    }
    const workspace = workspaces.pop();
    if (workspace === undefined || seen.has(workspace)) continue;
    seen.add(workspace);
    needed.add(workspace);
    const pkg = manifest(workspace);
    for (const [name, spec] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
      if (!String(spec).startsWith('workspace:')) continue;
      const dir = byName.get(name);
      assert.ok(dir, `${workspace} depends on ${name}, which is no workspace`);
      workspaces.push(dir);
    }
    /* AND WHAT ITS BUILD RUNS BEFORE `vite build`: the web build writes the catalogue from every pack first. */
    const build = pkg.scripts?.build ?? '';
    for (const m of build.matchAll(/(?:^|\s)((?:\.\.\/)+[^\s&|;]+)/g)) reach(posix.normalize(posix.join(workspace, m[1])));
    for (const m of build.matchAll(/--filter (\S+)/g)) {
      const dir = m[1].startsWith('./') ? m[1].slice(2) : byName.get(m[1]);
      assert.ok(dir, `${workspace}'s build filters on ${m[1]}, which is no workspace`);
      reach(dir);
    }
  }
  return [...needed].sort();
}

test('a push to master runs layout and a11y alone, and every other trigger runs every gate', () => {
  assert.equal(push.find((line) => /^ {4}branches:/.test(line))?.trim(), 'branches: [master]');
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

test('every input of layout and a11y is under a push path', () => {
  const reads = inputs();
  assert.ok(reads.includes('apps/web') && reads.includes('apps/site'), 'the walk did not reach the two builds the gates measure');
  const uncovered = reads.filter((path) => !covers(path));
  assert.deepEqual(uncovered, [], `layout or a11y reads these and a push to them skips the run: ${uncovered.join(', ')}`);
});

test('every push path is a whole folder or an exact file, and names something that exists', () => {
  for (const path of paths) {
    assert.match(path, /^[\w.-]+(\/[\w.-]+)*(\/\*\*)?$/, `${path} is a pattern this test cannot match as GitHub does`);
    const target = path.endsWith('/**') ? path.slice(0, -3) : path;
    assert.ok(existsSync(join(ROOT, ...target.split('/'))), `${path} names nothing in the tree`);
  }
});

test('a push run cancels an older push run and never the full run, and the label path is unchanged', () => {
  const group = lines.find((line) => /^ {2}group:/.test(line)) ?? '';
  assert.match(group, /\$\{\{ github\.event_name \}\}/, 'a push and the weekly run share a concurrency group, so a push cancels every gate');
  assert.ok(lines.includes('  cancel-in-progress: true'), 'a superseded push still runs to the end');

  const pullRequest = under(on, 2, 'pull_request');
  assert.match(pullRequest.join('\n'), /types: \[.*\blabeled\b.*\]/, 'adding the full-gates label no longer starts a run');
  assert.ok(
    lines.includes("    if: github.event_name != 'pull_request' || contains(github.event.pull_request.labels.*.name, 'full-gates')"),
    'a pull request runs the gates without the full-gates label, or not with it',
  );
});

test('deploy.yml follows ci alone, so a gates run never holds a deploy back', () => {
  const deploy = read('.github/workflows/deploy.yml');
  const watched = /^ {4}workflows: \[([^\]]*)\]\s*$/m.exec(deploy);
  assert.ok(watched, 'deploy.yml no longer follows a workflow by name');
  assert.deepEqual(watched[1].split(',').map((name) => name.trim()), ['ci']);
});
