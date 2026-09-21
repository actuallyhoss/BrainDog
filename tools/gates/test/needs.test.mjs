/**
 * The runner's prerequisite check, driven against a runner in a tree with no build.
 *
 *   node --test "tools/gates/test/*.test.mjs"
 *
 * WHAT THIS IS FOR, AND IT IS A DEFECT THAT SHIPPED TWICE. `52 §5.1` step 2 says the runner reads
 * each gate's declared prerequisites and refuses to run a gate whose prerequisites are not met.
 * Before that existed, the runner spawned every gate and read the EXIT CODE, so a gate that found
 * no build and exited 0 was counted as a gate that passed. `passkey` and `queue` each did exactly
 * that, and each one's own header claimed it printed a skip while its exit code said the opposite.
 * The first test below is that gate: it declares `web-build`, there is no build, and it exits 0.
 * Against the old runner it printed `1 of 1 gates passed`.
 *
 * WHY A COPIED TREE RATHER THAN THE REPOSITORY. `run.mjs` takes the repository root from its own
 * location, and this repository has `apps/web/build` in it, so the one condition worth testing
 * cannot be reached in place. A copy of `tools/gates/*.mjs` and `budgets.json` into a temporary
 * root is a tree where `apps/web/build` is absent, and the runner in it is byte-identical to the
 * shipped one. Only the gate under test is replaced, and only `--only <that gate>` is asked for,
 * so nothing else in the copy is ever executed: the other files are there because the runner reads
 * the directory to check that every gate file is registered.
 *
 * `stack` IS THE STAND-IN, AND IT USED TO BE `bundle`, WHICH IS A FACT ABOUT THE RUNNER RATHER THAN
 * ABOUT THESE TESTS. Every case here is about the SPAWNED half of the runner: the declaration read
 * out of a gate's text before the gate is spawned. `52 §5.1` step 3 made `bundle` a gate the runner
 * CALLS, and a called gate's declaration is read off the module instead, so a script stub written
 * over `bundle.mjs` is now a disagreement the runner refuses rather than a prerequisite it reads.
 * `stack` is a gate that is still spawned, `--only stack` selects it alone, and the stub supplies
 * the declaration, which is the only thing these cases ever needed from the name.
 */

import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const gates = join(import.meta.dirname, '..');

/** The marker a spawned stub prints. Its presence in the output means the gate was RUN. */
const RAN = 'THE STUB GATE RAN';

/**
 * A repository root holding nothing but a copy of this directory, and optionally a web build.
 *
 * The directory is copied whole rather than file by file so that the runner's own check that every
 * `*.mjs` here is registered has the same answer in the copy as it has in the tree.
 */
function copy({ stub = null, build = false, drop = null }) {
  const root = mkdtempSync(join(tmpdir(), 'braindog-needs-'));
  const to = join(root, 'tools', 'gates');
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(gates)) {
    if (name.endsWith('.mjs') || name === 'budgets.json') cpSync(join(gates, name), join(to, name));
  }
  if (stub !== null) writeFileSync(join(to, 'stack.mjs'), stub);
  if (drop !== null) unlinkSync(join(to, drop));
  if (build) mkdirSync(join(root, 'apps', 'web', 'build'), { recursive: true });
  return root;
}

/**
 * `CI` IS CLEARED ON PURPOSE. A skip is red under `CI` and quiet without it, and what these tests
 * are about is whether the gate was RUN, not what a skip costs. Leaving the ambient variable in
 * would make the exit code mean two things at once and the suite pass or fail by where it ran.
 */
function run(root, args = ['--only', 'stack']) {
  const r = spawnSync(process.execPath, [join(root, 'tools', 'gates', 'run.mjs'), ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, CI: '' },
  });
  rmSync(root, { recursive: true, force: true });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

test('a gate that declares a prerequisite it does not have is never spawned', () => {
  const { status, out } = run(
    copy({ stub: `export const needs = ['web-build'];\nconsole.log('  stack: ${RAN}');\n` }),
  );
  assert.ok(!out.includes(RAN), `the gate was spawned although its prerequisite was unmet:\n${out}`);
  assert.match(out, /could not run: stack/u);
  assert.equal(status, 0);
});

test('the refusal names the prerequisite and the command that meets it', () => {
  const { out } = run(copy({ stub: `export const needs = ['web-build'];\nconsole.log('${RAN}');\n` }));
  assert.match(out, /apps\/web\/build/u);
  assert.match(out, /pnpm --filter @braindog\/web build/u);
});

test('a met prerequisite runs the gate as before', () => {
  const { status, out } = run(
    copy({ stub: `export const needs = ['web-build'];\nconsole.log('  stack: ${RAN}');\n`, build: true }),
  );
  assert.ok(out.includes(RAN), `the gate was not spawned although its prerequisite was met:\n${out}`);
  assert.match(out, /1 of 1 gates passed/u);
  assert.equal(status, 0);
});

test('a gate that declares nothing is spawned and its own exit 3 is still a skip', () => {
  const { status, out } = run(copy({ stub: `console.log('  stack: ${RAN}');\nprocess.exit(3);\n` }));
  assert.ok(out.includes(RAN), `a gate with no declaration must still run:\n${out}`);
  assert.match(out, /could not run: stack/u);
  assert.equal(status, 0);
});

/* A PREREQUISITE COMPUTED AT RUNTIME IS THE ONE SHAPE THAT CANNOT BE READ BEFORE THE GATE RUNS, by
   construction, so it is the shape worth seeding. A list written over several lines is readable and
   is read; the test that matters is that a declaration which is PRESENT and unreadable does not
   fall through to the same answer as no declaration at all, which would hand the gate back the
   verdict on itself without anybody noticing. */
test('a declaration the runner cannot read is the runner refusing, not an empty list', () => {
  const { status, out } = run(
    copy({ stub: `const needed = () => ['web-build'];\nexport const needs = needed();\nconsole.log('${RAN}');\n` }),
  );
  assert.ok(!out.includes(RAN), `an unreadable declaration was treated as no prerequisites:\n${out}`);
  assert.match(out, /stack/u);
  assert.equal(status, 2);
});

test('a declaration spelt over several lines is read rather than refused', () => {
  const { status, out } = run(
    copy({ stub: `export const needs = [\n  'web-build',\n];\nconsole.log('${RAN}');\n` }),
  );
  assert.ok(!out.includes(RAN), `the gate was spawned although its prerequisite was unmet:\n${out}`);
  assert.match(out, /could not run: stack/u);
  assert.equal(status, 0);
});

test('a prerequisite nobody defined is the runner refusing', () => {
  const { status, out } = run(copy({ stub: `export const needs = ['moon-phase'];\nconsole.log('${RAN}');\n` }));
  assert.ok(!out.includes(RAN), `an unknown prerequisite was treated as met:\n${out}`);
  assert.match(out, /moon-phase/u);
  assert.equal(status, 2);
});

/* READING A DECLARATION MEANS OPENING A FILE, AND A REGISTERED GATE'S FILE CAN BE ABSENT. Measured
   against the runner before this test was written: delete `bundle.mjs` and leave its `GATES` line,
   and `readFileSync` threw `ENOENT` out of `declaredNeeds`, so the run ended in a Node stack trace
   with NOT ONE of the other twenty-nine gates spawned. The runner it replaced printed
   `1 of 2 gates failed: bundle.` and ran `em-dash` beside it.

   THE DELETION IS THE CASE THE DIRECTORY SCAN CANNOT CATCH, which is why it is worth a test. A gate
   file RENAMED is loud already: the new name is in the directory and in no `GATES` entry, so the
   unregistered-gate check names it and exits 1 before any of this. A file deleted leaves nothing in
   the directory to notice, and the only reader left is this one.

   `--only stack,em-dash` BECAUSE THE FINDING IS ABOUT THE OTHER GATE. That one gate cannot run is
   a sentence; that the twenty-nine beside it were never spawned is the defect, and a selection of
   one could not tell the two apart. */
test('a registered gate whose file was deleted is named, and the gates beside it still run', () => {
  const { status, out } = run(copy({ drop: 'stack.mjs' }), ['--only', 'stack,em-dash']);
  assert.ok(!/at readFileSync/u.test(out), `the runner died reading a gate that was not there:\n${out}`);
  assert.match(out, /▸ em-dash/u, `a gate beside the missing one was never spawned:\n${out}`);
  assert.match(out, /gates failed: stack/u);
  assert.equal(status, 1);
});
