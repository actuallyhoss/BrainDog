/**
 * The rulings gate, aimed at seeded trees: it fails on a page with no Rulings section (as master had), on a ruling with
 * no test, a missing file or a placeholder, on a todo the page does not own up to, and on a test that holds no ruling.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { judge, rulingOf, rulingsOf, testsIn } from '../rulings.mjs';

const gates = join(import.meta.dirname, '..');

function run(at) {
  const r = spawnSync(process.execPath, [join(gates, 'rulings.mjs')], { encoding: 'utf8', env: { ...process.env, BRAINDOG_GATE_ROOT: at } });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

const put = (root, f, text) => {
  mkdirSync(dirname(join(root, f)), { recursive: true });
  writeFileSync(join(root, f), text);
};

const HEAD = '| Ruling | The question | The ruling | Why | Taken | Whose | Meets | Held by |\n|---|---|---|---|---|---|---|---|\n';
const line = (id, held) => `| ${id} | Q? | R. | W. | 9 October 2026 | the loop's call | no | ${held} |\n`;
const page = (lines) => `# 04 · Packs\n\n## 8 · Before\n\ntext\n\n## 9 · Rulings\n\nWords.\n\n${HEAD}${lines.join('')}\n---\n\n*Next*\n`;

/** A tree whose page writes 438 and 441, each held by a passing test. */
function planted() {
  const root = mkdtempSync(join(tmpdir(), 'rulings-'));
  put(root, 'docs/04-PACKS.md', page([line(438, '`packages/extract/test/rulings.test.ts`'), line(441, '`packages/kernel/test/rulings.test.ts`')]));
  put(root, 'packages/extract/test/rulings.test.ts', "test('ruling 438: a bare \"$\" is asked', () => {});\n");
  put(root, 'packages/kernel/test/rulings.test.ts', "test('ruling 441: a money title is left out', async () => {});\n");
  return root;
}

test('a tree whose page and tests agree passes', () => {
  const root = planted();
  try {
    assert.deepEqual(judge(root), []);
    const r = run(root);
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /2 ruling\(s\), each held by a test, 0 finding/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a page with no Rulings section fails, which is master before SHL-A02', () => {
  const root = planted();
  try {
    put(root, 'docs/04-PACKS.md', '# 04 · Packs\n\n## 8 · Before\n\ntext\n');
    const r = run(root);
    assert.equal(r.status, 1);
    assert.match(r.out, /has no "## 9 · Rulings" section/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a ruling with no test, a test file that is not there, or a placeholder fails, each named', () => {
  const root = planted();
  try {
    put(root, 'docs/04-PACKS.md', page([line(285, 'to be written'), line(438, '`packages/extract/test/rulings.test.ts`'), line(441, '`packages/kernel/test/gone.test.ts`'), line(296, '`packages/kernel/test/rulings.test.ts`')]));
    const said = judge(root).join('\n');
    assert.match(said, /ruling 285 names no test/u);
    assert.match(said, /ruling 441 is held by packages\/kernel\/test\/gone\.test\.ts, which does not exist/u);
    assert.match(said, /ruling 296: packages\/kernel\/test\/rulings\.test\.ts holds no test named "ruling 296"/u);
    assert.equal(run(root).status, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a test holding a ruling the page does not write fails', () => {
  const root = planted();
  try {
    put(root, 'packages/extract/test/rulings.test.ts', "test('ruling 438: asked', () => {});\ntest('ruling 999: never written', () => {});\n");
    assert.deepEqual(judge(root), ['  packages/extract/test/rulings.test.ts: "ruling 999: never written" holds ruling 999, which the page does not write.']);
    assert.equal(run(root).status, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a todo test the page does not say waits fails, and so does "waits on" over tests that all run', () => {
  const root = planted();
  try {
    put(root, 'packages/kernel/test/rulings.test.ts', "test('ruling 441: a money title is left out', { todo: 'SHL-A04 builds it' }, () => {});\n");
    assert.match(judge(root).join('\n'), /ruling 441 has a test marked todo, and the page does not say what it waits on/u);
    put(root, 'docs/04-PACKS.md', page([line(438, '`packages/extract/test/rulings.test.ts`, waits on SHL-A04'), line(441, '`packages/kernel/test/rulings.test.ts`, waits on SHL-A04')]));
    const said = judge(root);
    assert.deepEqual(said, ['  ruling 438 says it waits, and every test of it runs. Take "waits on" off the page.']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a test in a rulings file that names no ruling fails, wherever the file lives', () => {
  const root = planted();
  try {
    put(root, 'apps/web/test/rulings.test.ts', "test('the preview reads $12 as unsure', () => {});\n");
    assert.match(judge(root).join('\n'), /apps\/web\/test\/rulings\.test\.ts: "the preview reads \$12 as unsure" names no ruling/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the readers: a ruling line, a test name with an escaped quote, a todo option, and a ruling number', () => {
  assert.deepEqual(rulingsOf(page([line(298, '`a/rulings.test.ts`, waits on the list line')])), [{ id: '298', files: ['a/rulings.test.ts'], waits: true }]);
  assert.equal(rulingsOf('# no section\n'), null);
  const found = testsIn("test('ruling 296: no live field\\'s scope', async () => {});\ntest(`ruling 302: shown`, { todo: 'SHL-A12 builds it' }, () => {});\n");
  assert.deepEqual(found, [
    { name: "ruling 296: no live field's scope", todo: false },
    { name: 'ruling 302: shown', todo: true },
  ]);
  assert.equal(rulingOf('ruling 438: a bare "$"'), '438');
  assert.equal(rulingOf('rulings in general'), null);
});
