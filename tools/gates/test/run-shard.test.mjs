/**
 * `--shard N/M`: one run split into parts that several jobs can share, read off the runner itself.
 *
 *   node --test tools/gates/test/run-shard.test.mjs
 *
 * WHAT IS HELD HERE IS THE PROPERTY THE MATRIX IN `gates.yml` RESTS ON. The workflow names how many parts there
 * are and never which gates are in them, so the whole of "no gate goes unrun" is the runner's: every selected
 * gate in exactly one part, for any M, with the slow two apart. The plans are read with `--list` on the real
 * tree, which imports the gates and runs none, so the parts asserted are the parts CI gets.
 *
 * A GATE CUT INTO PARTS IS TESTED IN A COPIED TREE, for the reason `durations.test.mjs` gives: a stub over
 * `bundle` (a gate the runner calls) is the only way to see the part the runner hands it.
 */

import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const gates = join(import.meta.dirname, '..');
const runner = join(gates, 'run.mjs');

function run(args, at = runner) {
  const r = spawnSync(process.execPath, [at, ...args], { encoding: 'utf8', env: { ...process.env, CI: '' } });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

/** The parts a selection is cut into, as lists of names. */
function plan(of, only = []) {
  const all = run([...only, '--list']);
  assert.equal(all.status, 0, all.out);
  const parts = Array.from({ length: of }, (_, i) => {
    const r = run([...only, '--shard', `${i + 1}/${of}`, '--list']);
    assert.equal(r.status, 0, r.out);
    return r.out.trim().split('\n');
  });
  return { all: all.out.trim().split('\n'), parts };
}

for (const of of [2, 3]) {
  test(`every gate is in exactly one of ${of} parts, and each part keeps the registry order`, () => {
    const { all, parts } = plan(of);
    const whole = (unit) => unit.replace(/ \(part \d+ of \d+\)$/u, '');
    assert.equal(new Set(parts.flat()).size, parts.flat().length, 'a part of a gate is in two jobs');
    assert.deepEqual([...new Set(parts.flat().map(whole))].sort(), [...all].sort(), 'a gate is in no part');
    for (const part of parts) {
      assert.ok(part.length > 0, 'a part holds nothing');
      const names = part.map(whole);
      assert.deepEqual(names, all.filter((name) => names.includes(name)), `a part runs out of registry order: ${part}`);
    }
    if (of === 3) {
      const holding = (name) => parts.findIndex((part) => part.includes(name));
      const slow = ['layout (part 1 of 2)', 'layout (part 2 of 2)', 'a11y'].map(holding);
      assert.equal(new Set(slow).size, 3, 'two slow parts share a job, which is the run the split exists to avoid');
    }
  });
}

test("the push run's two gates are three parts, layout's two halves first", () => {
  assert.deepEqual(plan(3, ['--only', 'layout,a11y']).parts, [['layout (part 1 of 2)'], ['layout (part 2 of 2)'], ['a11y']]);
});

test('a part out of range, a malformed one, and a part with nothing in it are each exit 2', () => {
  for (const shard of ['0/2', '3/2', '1', 'one/two']) {
    const r = run(['--shard', shard, '--list']);
    assert.equal(r.status, 2, `--shard ${shard}: ${r.out}`);
    assert.match(r.out, /--shard takes N\/M/u);
  }
  const empty = run(['--only', 'theme', '--shard', '2/2']);
  assert.equal(empty.status, 2, empty.out);
  assert.match(empty.out, /part 2 of 2 holds no gate/u);
});

test('a part says what the other parts run, so its green line is not the whole run', () => {
  const r = run(['--only', 'stack,em-dash', '--shard', '1/2']);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /1 of 1 gates passed\./u);
  assert.match(r.out, /this is part 1 of 2, and the others run: (stack|em-dash)\./u);
});

/** A copy of this directory with `bundle` replaced by a stub that prints the part it was handed. */
function copy(slices) {
  const root = mkdtempSync(join(tmpdir(), 'braindog-shard-'));
  const to = join(root, 'tools', 'gates');
  mkdirSync(to, { recursive: true });
  for (const file of readdirSync(gates))
    if (file.endsWith('.mjs') || file === 'budgets.json') cpSync(join(gates, file), join(to, file));
  writeFileSync(
    join(to, 'bundle.mjs'),
    `export const needs = [];\n` +
      `export const slices = ${slices};\n` +
      `export default async function bundle(root, part) {\n` +
      `  console.log('HANDED ' + JSON.stringify(part ?? 'whole'));\n` +
      `}\n` +
      `if (import.meta.main) process.exitCode = (await bundle()) ?? 0;\n`,
  );
  return { root, at: join(to, 'run.mjs') };
}

test('a gate that can be cut is handed one part per job, and is called whole when the run is not split', () => {
  const { root, at } = copy(3);
  try {
    const handed = (args) => {
      const r = run(['--only', 'bundle', ...args], at);
      assert.equal(r.status, 0, r.out);
      return [...r.out.matchAll(/^HANDED (.+)$/gmu)].map((m) => JSON.parse(m[1]));
    };
    assert.deepEqual(handed([]), ['whole']);
    assert.deepEqual(handed(['--shard', '1/1']), ['whole']);
    /* CUT INTO THE SMALLER OF ITS THREE AND THE TWO JOBS, one part to each job. */
    assert.deepEqual(handed(['--shard', '1/2']), [{ part: 1, of: 2 }]);
    assert.deepEqual(handed(['--shard', '2/2']), [{ part: 2, of: 2 }]);
    const r = run(['--only', 'bundle', '--shard', '2/2'], at);
    assert.match(r.out, /▸ bundle · imported · part 2 of 2\n/u);
    assert.match(r.out, /this is part 2 of 2, and the others run: bundle \(part 1 of 2\)\./u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a slices that is not a whole number from 1 is a refusal naming the gate', () => {
  const { root, at } = copy("'two'");
  try {
    const r = run(['--only', 'bundle', '--shard', '1/2'], at);
    assert.equal(r.status, 2, r.out);
    assert.match(r.out, /bundle exports a `slices` of "two"/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
