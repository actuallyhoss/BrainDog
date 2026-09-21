/**
 * WHICH DIALECT A GATE IS IN, AND THE TRAP THAT SAT BEHIND THE ANSWER.
 *
 *   node --test "tools/gates/test/*.test.mjs"
 *
 * `52 §5.1` step 3 makes some gates a function the runner CALLS and leaves the rest scripts it
 * spawns, so `run.mjs` has to decide which of the two a gate file is. The first half of that step
 * decided it with `EXPORTS_DEFAULT = /^export default\b/mu` over the file's TEXT, and a file it
 * matched was IMPORTED. A gate that is still a script does its work at module top level, so a script
 * that happened to match that pattern would have run its whole body during the import: outside the
 * runner's timing, outside its capture, and before the prerequisite check that exists to stop a gate
 * running without what it needs. It was not in the tree and it was one commit away from being in it,
 * and the next person to migrate a gate was the one who would have walked into it.
 *
 * SO THE DIALECT IS DECLARED IN `GATES` NOW AND NEVER GUESSED FROM THE TEXT, and the text is read
 * only to REFUSE: a call whose file cannot be imported safely, or a script whose file says it is a
 * gate somebody calls, ends the run with a sentence naming the file rather than with a guess. The
 * first test below is the trap itself, and against the runner before this it printed the stub's own
 * line above the gate's header, which is the body of a gate running inside an import.
 *
 * WHY A COPIED TREE, which is `needs.test.mjs`'s argument next door and holds here for the same
 * reason: `run.mjs` takes the root from its own location and only the gate under test is replaced,
 * so a stub can be any shape at all without a line of the shipped runner changing.
 *
 * `bundle` IS THE STAND-IN FOR A CALL and `stack` for a script, because `GATES` registers them that
 * way and `--only <name>` selects one of them alone.
 */

import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const gates = join(import.meta.dirname, '..');

/** The marker a stub prints. Its presence in the output means the stub's body was executed. */
const RAN = 'THE STUB GATE RAN';

/** A repository root holding nothing but a copy of this directory, with one gate file replaced. */
function copy(name, stub) {
  const root = mkdtempSync(join(tmpdir(), 'braindog-dialect-'));
  const to = join(root, 'tools', 'gates');
  mkdirSync(to, { recursive: true });
  for (const file of readdirSync(gates))
    if (file.endsWith('.mjs') || file === 'budgets.json') cpSync(join(gates, file), join(to, file));
  writeFileSync(join(to, `${name}.mjs`), stub);
  return root;
}

/** `CI` IS CLEARED because a skip is red under it, and none of these tests is about what a skip costs. */
function run(root, only) {
  const r = spawnSync(process.execPath, [join(root, 'tools', 'gates', 'run.mjs'), '--only', only], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, CI: '' },
  });
  rmSync(root, { recursive: true, force: true });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

/**
 * THE TRAP, SEEDED. This stub is a script: it does its work at module top level, the way twenty-two
 * gates in this directory still do, and it also carries a line that begins `export default`. Nothing
 * about it is contrived beyond being short.
 *
 * AGAINST THE FIRST HALF OF STEP 3 THIS RAN INSIDE THE IMPORT. The runner matched the text, imported
 * the file to read `mod.needs` off it, and the body ran there: before the gate's own header line was
 * printed, before the prerequisite check, and with no exit code anywhere for the runner to read.
 */
const TRAP = `console.log('  bundle: ${RAN}');\nexport default function alsoAFunction() {}\n`;

test('a script whose text happens to say `export default` is never imported', () => {
  const { status, out } = run(copy('bundle', TRAP), 'bundle');
  assert.ok(!out.includes(RAN), `a script gate's body ran inside the runner's import of it:\n${out}`);
  assert.equal(status, 2, `the runner did not refuse the file it cannot place:\n${out}`);
  assert.match(out, /bundle/u);
  assert.match(out, /import\.meta\.main/u, `the refusal does not say what the file is missing:\n${out}`);
});

/* AND THE REFUSAL IS THE WHOLE RUN, not that gate alone, because the answer is about the runner's own
   account of how to run a gate rather than about anything a gate measured. */
test('the refusal happens before the gate is imported, so nothing of it is executed', () => {
  const { out } = run(copy('bundle', TRAP), 'bundle,em-dash');
  assert.ok(!out.includes(RAN), `the stub was executed although the entry was refused:\n${out}`);
});

/**
 * THE SHAPE A MIGRATED GATE HAS, and every property the runner reads off it in one stub: the entry
 * guard that says importing it does nothing, a default export that is a function, a `needs` the
 * runner reads off the MODULE rather than out of the text, and a root handed in as an argument.
 */
const CALLED =
  `export const needs = [];\n` +
  `export default function bundle(root) {\n` +
  `  console.log('  bundle: ${RAN} with a root of ' + typeof root);\n` +
  `}\n` +
  `if (import.meta.main) process.exitCode = bundle() ?? 0;\n`;

test('a gate registered as a call is called, with the root, and passes by falling off the end', () => {
  const { status, out } = run(copy('bundle', CALLED), 'bundle');
  assert.ok(out.includes(`${RAN} with a root of string`), `the gate was not called with the root:\n${out}`);
  assert.match(out, /bundle · imported/u);
  assert.match(out, /1 of 1 gates passed/u);
  assert.equal(status, 0);
});

/* A CALL WHOSE FILE IS A SCRIPT IS THE SAME TRAP FROM THE OTHER SIDE. The registration says this one
   is imported and the file does its work at top level, so importing it to find out would be the very
   thing the check above exists to stop. It is refused on the text, before the import. */
test('a call whose file exports no default is refused rather than imported', () => {
  const { status, out } = run(copy('bundle', `console.log('  bundle: ${RAN}');\n`), 'bundle');
  assert.ok(!out.includes(RAN), `a file registered as a call was imported and ran:\n${out}`);
  assert.equal(status, 2);
  assert.match(out, /export default/u);
});

/* AND A DEFAULT EXPORT THAT IS NOT CALLABLE. The text agrees and the module does not, which is the
   one disagreement that can only be found after the import. */
test('a default export that is not a function is the runner refusing', () => {
  const stub = `export default { notAFunction: true };\nif (import.meta.main) process.exitCode = 0;\n`;
  const { status, out } = run(copy('bundle', stub), 'bundle');
  assert.equal(status, 2, `a gate that hands back an object was run anyway:\n${out}`);
  assert.match(out, /bundle/u);
});

/**
 * THE OTHER DIRECTION, AND IT IS THE ONE THAT WOULD HAVE BEEN SILENT. A half-migrated gate has its
 * work inside a function and its `GATES` line still saying `spawn`, so `node stack.mjs` defines the
 * function, calls nothing, and exits 0: a gate reporting a pass having measured nothing, which is the
 * failure this whole directory exists to catch. The two accounts have to agree, so it is refused.
 */
test('a gate registered as a script whose file declares a gate is refused, not spawned', () => {
  const stub = `export default function stack() {\n  console.log('  stack: ${RAN}');\n}\n`;
  const { status, out } = run(copy('stack', stub), 'stack');
  assert.ok(!out.includes(RAN), `the stub cannot have run, and saying it did means this test is wrong:\n${out}`);
  assert.equal(status, 2, `a gate that defines itself and never runs was spawned and counted:\n${out}`);
  assert.match(out, /stack/u);
});

/* AND THE TWENTY-TWO THAT ARE STILL SCRIPTS ARE SPAWNED EXACTLY AS THEY WERE, which is the control
   for every test above: the mechanism refuses two disagreements and changes nothing else. */
test('a script gate with no default export is spawned and its exit code is read', () => {
  const stub = `console.log('  stack: ${RAN}');\nprocess.exitCode = 1;\n`;
  const { status, out } = run(copy('stack', stub), 'stack');
  assert.ok(out.includes(RAN), `a script gate was not spawned:\n${out}`);
  assert.match(out, /stack · spawned/u);
  assert.match(out, /gates failed: stack/u);
  assert.equal(status, 1);
});
