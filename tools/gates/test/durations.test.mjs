/**
 * EVERY GATE SAYS HOW LONG IT TOOK, on a line of its own that a log can be grepped for.
 *
 *   node --test "tools/gates/test/*.test.mjs"
 *
 * WHY THIS EXISTS. Eight gates were once priced for `ci.yml` while the runner printed no duration
 * for any of them, so every figure in that table was the gap between one gate's
 * `▸` header and the next one's in a GitHub step log: a subtraction of two timestamps per gate, and
 * no figure at all for the last gate of a run. One line after each gate turns the next survey of that
 * kind into a read.
 *
 * THE LINE HAS ITS OWN MARKER, `◂`, AND NOT `▸`. Three tests next door prove a gate was asked by
 * matching `▸ <name>`, and the survey's own method matched the header too. A closing line that began
 * with the same glyph would count every gate twice to anybody reading the log that way.
 *
 * THE SAME COPIED TREE AS `dialect.test.mjs`, for its reason: only the gate under test is replaced,
 * and the runner in the copy is byte-identical to the shipped one. `bundle` stands in for a gate the
 * runner calls and `stack` for one it spawns, because `GATES` registers them that way.
 */

import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const gates = join(import.meta.dirname, '..');

/** How long each stub waits before passing. Long enough that a timer reading zero cannot pass. */
const WAIT_MS = 300;

function copy(stubs) {
  const root = mkdtempSync(join(tmpdir(), 'braindog-durations-'));
  const to = join(root, 'tools', 'gates');
  mkdirSync(to, { recursive: true });
  for (const file of readdirSync(gates))
    if (file.endsWith('.mjs') || file === 'budgets.json') cpSync(join(gates, file), join(to, file));
  for (const [name, body] of Object.entries(stubs)) writeFileSync(join(to, `${name}.mjs`), body);
  return root;
}

function run(root, only) {
  const r = spawnSync(process.execPath, [join(root, 'tools', 'gates', 'run.mjs'), '--only', only], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, CI: '' },
  });
  rmSync(root, { recursive: true, force: true });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

const CALLED =
  `export const needs = [];\n` +
  `export default async function bundle() {\n` +
  `  await new Promise((done) => setTimeout(done, ${WAIT_MS}));\n` +
  `}\n` +
  `if (import.meta.main) process.exitCode = (await bundle()) ?? 0;\n`;

const SPAWNED = `await new Promise((done) => setTimeout(done, ${WAIT_MS}));\n`;

/** The closing line, as a parser would read it: marker, name, seconds to one decimal place. */
const TOOK = /^ {2}◂ (\S+) · (\d+\.\d) s$/gmu;

test('a called gate and a spawned gate each print their own duration, and the summary is unchanged', () => {
  const { status, out } = run(copy({ bundle: CALLED, stack: SPAWNED }), 'bundle,stack');
  assert.equal(status, 0, out);
  const took = new Map([...out.matchAll(TOOK)].map(([, name, s]) => [name, Number(s)]));
  assert.deepEqual([...took.keys()].sort(), ['bundle', 'stack'], `not one duration line per gate:\n${out}`);
  for (const [name, s] of took)
    assert.ok(s >= WAIT_MS / 1000, `${name} reports ${s} s for a gate that waited ${WAIT_MS} ms:\n${out}`);
  assert.match(out, /2 of 2 gates passed\./u, `the summary line changed shape:\n${out}`);
  assert.equal(out.match(/▸ /gu)?.length, 2, `the \`▸\` header now appears more than once per gate:\n${out}`);
});

/* A GATE THAT THROWS STILL TOOK TIME, and the throw is the one path in the loop that leaves early. */
test('a gate that throws still reports how long it ran before it threw', () => {
  const THROWS = CALLED.replace('}\n', `  throw new Error('stub');\n}\n`);
  const { status, out } = run(copy({ bundle: THROWS }), 'bundle');
  assert.equal(status, 1, out);
  assert.match(out, /^ {2}◂ bundle · \d+\.\d s$/mu, `the failing gate printed no duration:\n${out}`);
});
