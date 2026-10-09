/**
 * `no-shape-files`, asked of its planted tree, of this tree, and of a small repository made for the purpose.
 *
 *   node --test tools/gates/test/no-shape-files.test.mjs
 *
 * SPAWNED, NOT CALLED, for the cases that read the exit code, because the exit code is what `run.mjs` and CI read. Each
 * red case fails by itself when the gate's `findings.push` line is taken out.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { SHAPE_MARK, markLine } from '../no-shape-files.mjs';

const gates = join(import.meta.dirname, '..');
const repo = join(gates, '..', '..');
const GATE = join(gates, 'no-shape-files.mjs');
const COPY = ['#dogl 1', SHAPE_MARK, '#table dog_meta key,value', '["shape","true"]', ''].join('\n');

const run = (root) => {
  const r = spawnSync(process.execPath, [GATE, root], { encoding: 'utf8' });
  return { status: r.status, said: `${r.stdout}${r.stderr}` };
};

test('the planted tree is red, once, naming the renamed copy and the line its mark is on', () => {
  const { status, said } = run(join(gates, 'negative', 'no-shape-files'));
  assert.equal(status, 1, said);
  assert.deepEqual(said.split('\n').filter((l) => /^\s+\S+:\d+\s/u.test(l)).map((l) => l.trim().split(/\s/u)[0]), ['docs/record-copy.txt:2'], said);
  assert.match(said, /1 finding\(s\)/u);
});

test('this tree is green, and its planted copy is left out of it', () => {
  const { status, said } = run(repo);
  assert.equal(status, 0, said);
  assert.match(said, /0 finding\(s\)/u);
});

test('the mark is read in the head only, as the import reads it', () => {
  const at = (text) => markLine(Buffer.from(text));
  assert.equal(at(COPY), 2);
  assert.equal(at(`﻿${COPY}`), 2, 'a byte order mark hid the mark');
  assert.equal(at(COPY.replaceAll('\n', '\r\n')), 2, 'a copy saved on Windows hid the mark');
  assert.equal(at(`  ${SHAPE_MARK}  \nrest`), 1);
  assert.equal(at(['a', 'b', 'c', 'd', SHAPE_MARK].join('\n')), null, 'a mark quoted below line four is not a copy');
  assert.equal(at(`const MARK = '${SHAPE_MARK}';`), null, 'code that names the mark is not a copy');
  assert.equal(at(`\0${SHAPE_MARK}`), null, 'a binary file is not read as text');
});

/* WHAT `git add` WOULD TAKE. A repository made here, with nothing added to it: an untracked copy git does not ignore is
   one command from being published, and one under the name `export --shape` writes is where it belongs. */
test('in a repository: a copy git would take is red, and one it ignores is not', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'braindog-no-shape-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root }).status, 0);
  writeFileSync(join(root, '.gitignore'), '*.shape.brainl\n');
  writeFileSync(join(root, 'marrowgate.shape.brainl'), COPY);
  writeFileSync(join(root, 'readme.md'), '# A repository\n');

  const kept = run(root);
  assert.equal(kept.status, 0, kept.said);

  writeFileSync(join(root, 'copy.json'), COPY);
  const leaked = run(root);
  assert.equal(leaked.status, 1, leaked.said);
  assert.match(leaked.said, /copy\.json:2/u);
  assert.doesNotMatch(leaked.said, /marrowgate/u, 'an ignored copy was read as one git would take');
});

test('a root with nothing in it could not run, and says so', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'braindog-no-shape-empty-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(run(root).status, 3);
});
