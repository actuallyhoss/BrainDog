/**
 * `--unbuilt` and `--built`: the two selections a workflow makes by need, never by name (PRF-B01).
 *
 *   node --test tools/gates/test/select.test.mjs
 *
 * WHAT IS HELD HERE IS THE PROPERTY THE TWO CI JOBS REST ON. The job that builds nothing runs `--unbuilt`
 * and the job that builds the app runs `--built`, and neither names a gate, so "every gate runs somewhere"
 * is the runner's alone: every gate that needs nothing in the first, every gate a web build meets in the
 * second, a gate that needs a live host in neither, and no gate in both. The selections are read with
 * `--list` on the real tree, and the needs they are held to are read here from each gate's own text,
 * so a gate that gains a `needs` line moves job in this test the same push it moves in CI.
 *
 * THE FAILURES ARE TESTED IN A COPIED TREE, for the reason `needs.test.mjs` gives: a stub over one gate
 * is the only way to put a declaration in front of the runner that no shipped gate makes.
 */

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const gates = join(import.meta.dirname, '..');
const root = join(gates, '..', '..');

function run(args, at = join(gates, 'run.mjs')) {
  const r = spawnSync(process.execPath, [at, ...args], { encoding: 'utf8', env: { ...process.env, CI: '' } });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

const listed = (args) => {
  const r = run([...args, '--list']);
  assert.equal(r.status, 0, r.out);
  return r.out.trim().split('\n');
};

/** Which needs a web build meets, as `NEEDS` in `run.mjs` says. A need added there is added here. */
const MET_BY_A_BUILD = { 'web-build': true, builds: true, host: false };

/** A gate's declared needs, read from its file the way the runner reads a script's. */
function needsOf(name) {
  const file = name === 'theme' ? join(root, 'packages/skin/scripts/theme.mjs') : join(gates, `${name}.mjs`);
  if (!existsSync(file)) return [];
  const m = /^export const needs = \[([^\]]*)\];$/mu.exec(readFileSync(file, 'utf8'));
  return m === null ? [] : [...m[1].matchAll(/'([a-z-]+)'/gu)].map((n) => n[1]);
}

test('each selection is exactly the gates whose needs match, and together they are every gate but the live-host ones', () => {
  const all = listed([]);
  const unbuilt = listed(['--unbuilt']);
  const built = listed(['--built']);
  for (const need of all.flatMap(needsOf))
    assert.ok(Object.hasOwn(MET_BY_A_BUILD, need), `a gate declares ${need}, and this test does not know whether a build meets it`);
  const wantUnbuilt = all.filter((name) => needsOf(name).length === 0);
  const wantBuilt = all.filter((name) => needsOf(name).length > 0 && needsOf(name).every((n) => MET_BY_A_BUILD[n]));
  assert.deepEqual(unbuilt, wantUnbuilt);
  assert.deepEqual(built, wantBuilt);
  assert.deepEqual(unbuilt.filter((name) => built.includes(name)), [], 'a gate is in both jobs');
  const neither = all.filter((name) => !unbuilt.includes(name) && !built.includes(name));
  for (const name of neither) assert.ok(needsOf(name).includes('host'), `${name} is in neither job and needs no live host`);
  assert.deepEqual(listed(['--unbuilt', '--built']), all.filter((name) => !neither.includes(name)));
});

test('the gates the build job exists for are in --built, the scans are in --unbuilt, and deploy-parity is in neither', () => {
  const unbuilt = listed(['--unbuilt']);
  const built = listed(['--built']);
  for (const name of ['bundle', 'keys', 'layout', 'passkey', 'queue']) assert.ok(built.includes(name), `${name} is not in --built`);
  for (const name of ['typecheck', 'stack', 'em-dash', 'orphan-tests', 'theme'])
    assert.ok(unbuilt.includes(name), `${name} is not in --unbuilt`);
  assert.ok(!unbuilt.includes('deploy-parity') && !built.includes('deploy-parity'));
});

test('--except takes from a selection and --only narrows it, and a selection left empty is exit 2', () => {
  const built = listed(['--built']);
  assert.deepEqual(listed(['--built', '--except', 'layout,a11y']), built.filter((n) => n !== 'layout' && n !== 'a11y'));
  assert.deepEqual(listed(['--unbuilt', '--only', 'stack,bundle']), ['stack']);
  const empty = run(['--built', '--only', 'stack', '--list']);
  assert.equal(empty.status, 2, empty.out);
  assert.match(empty.out, /that selection is empty/u);
});

/** A repository root holding a copy of this directory, with one file replaced and `run.mjs` optionally edited. */
function copy({ file = null, body = null, edit = null }) {
  const at = mkdtempSync(join(tmpdir(), 'braindog-select-'));
  const to = join(at, 'tools', 'gates');
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(gates))
    if (name.endsWith('.mjs') || name === 'budgets.json') cpSync(join(gates, name), join(to, name));
  if (file !== null) writeFileSync(join(to, file), body);
  if (edit !== null) writeFileSync(join(to, 'run.mjs'), edit(readFileSync(join(to, 'run.mjs'), 'utf8')));
  return { at, runner: join(to, 'run.mjs') };
}

/** A script gate, which is how `stack` is registered, declaring what it is given. */
const script = (needs) => `export const needs = [${needs.map((n) => `'${n}'`).join(', ')}];\nconsole.log('stub');\n`;

test('a gate that declares a need NEEDS does not define is exit 2 naming it, before anything runs', () => {
  const { at, runner } = copy({ file: 'stack.mjs', body: script(['nonesuch']) });
  try {
    for (const flag of ['--unbuilt', '--built']) {
      const r = run([flag, '--list'], runner);
      assert.equal(r.status, 2, r.out);
      assert.match(r.out, /stack declares the prerequisite nonesuch/u);
    }
  } finally {
    rmSync(at, { recursive: true, force: true });
  }
});

test('a gate moves job with its declaration: web-build to --built, host to neither', () => {
  for (const [needs, inBuilt] of [[['web-build'], true], [['web-build', 'host'], false]]) {
    const { at, runner } = copy({ file: 'stack.mjs', body: script(needs) });
    try {
      assert.equal(run(['--built', '--only', 'stack', '--list'], runner).out.trim() === 'stack', inBuilt, needs.join());
      assert.equal(run(['--unbuilt', '--only', 'stack', '--list'], runner).status, 2, needs.join());
    } finally {
      rmSync(at, { recursive: true, force: true });
    }
  }
});

test('a need that does not say whether a build meets it is exit 2 once either selection is asked for', () => {
  const { at, runner } = copy({ edit: (src) => src.replace(/^ {4}built: false,\n/mu, '') });
  try {
    const r = run(['--built', '--list'], runner);
    assert.equal(r.status, 2, r.out);
    assert.match(r.out, /NEEDS says of host neither `built: true` nor `built: false`/u);
    assert.equal(run(['--only', 'stack', '--list'], runner).status, 0, 'a run that asks neither is refused for it');
  } finally {
    rmSync(at, { recursive: true, force: true });
  }
});

test('a called gate whose module needs something other than its text says is exit 2', () => {
  const body = [
    'export const needs = [];',
    "needs.push('web-build');",
    'export default function stub() {}',
    'if (import.meta.main) stub();',
    '',
  ].join('\n');
  const { at, runner } = copy({ file: 'em-dash.mjs', body });
  try {
    const r = run(['--unbuilt', '--only', 'em-dash', '--list'], runner);
    assert.equal(r.status, 2, r.out);
    assert.match(r.out, /em-dash needs web-build by its module and nothing by its text/u);
  } finally {
    rmSync(at, { recursive: true, force: true });
  }
});
