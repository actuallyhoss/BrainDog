/**
 * `no-fixtures`, asked of seeded trees and of this one.
 *
 *   node --test "tools/gates/test/no-fixtures.test.mjs"
 *
 * THE GATE IS A GREP OVER IMPORTS, AND EVERY WAY A GREP IS WRONG IS A CASE HERE. A shipped file that imports the sample
 * by any of the four spellings a module can be named in (`import ... from`, a bare `import`, `export ... from`,
 * `import()`) is red; a test, a fixture, a comment, and a subpath of the seed are not. `self-test.mjs` runs the gate
 * over `negative/no-fixtures/` as it runs every gate over its own; this file holds the cases one fixture cannot.
 *
 * SPAWNED, NOT CALLED, for the cases that read the exit code, because the exit code is what `run.mjs` and CI read.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { WAITING, refused, specifiers, uncommented } from '../no-fixtures.mjs';

const gates = join(import.meta.dirname, '..');
const repo = join(gates, '..', '..');
const GATE = join(gates, 'no-fixtures.mjs');

const run = (root) => {
  const r = spawnSync(process.execPath, [GATE, root], { encoding: 'utf8' });
  return { status: r.status, said: `${r.stdout}${r.stderr}` };
};

/** A root holding these files under `apps/web/src`, removed when the test is done. */
function tree(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'braindog-no-fixtures-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [path, body] of Object.entries(files)) {
    const at = join(root, 'apps', 'web', 'src', path);
    mkdirSync(dirname(at), { recursive: true });
    writeFileSync(at, body);
  }
  return root;
}

test('the seeded negative is red, once, naming the file that imports the fixture', () => {
  const { status, said } = run(join(gates, 'negative', 'no-fixtures'));
  assert.equal(status, 1, said);
  assert.equal(said.split('\n').filter((l) => l.includes('seeded.ts')).length, 1, said);
  assert.match(said, /1 finding\(s\)/u);
});

test('this tree is green, and says which files still wait on a seed subpath', () => {
  const { status, said } = run(repo);
  assert.equal(status, 0, said);
  for (const p of Object.keys(WAITING)) assert.ok(said.includes(p), `${p} is not named as waiting:\n${said}`);
});

test('every spelling of an import is read, and a comment is not an import', () => {
  const code = uncommented(
    [
      "// import { ROWS } from './fixtures/sample.ts';",
      "/* import './fixtures/fill.ts'; */",
      /* A COMMENT MARKER INSIDE A STRING IS TEXT, and each of these hid the import after it until strings were stepped
         over: `//` in a URL blanked the rest of its line, and `/*` in a glob blanked the rest of the file, every import
         below it included. The URL that stood here alone proved nothing, because no import followed it. */
      "const url = 'https://example.com/fixtures/a-page'; import { h } from './fixtures/six.ts';",
      "const glob = 'lib/*.ts';",
      "import { a } from './fixtures/one.ts';",
      "import './fixtures/two.ts';",
      "export * from './fixtures/three.ts';",
      "const four = await import('../record/fixtures/four.ts');",
      "import {\n  b,\n  c,\n} from '$lib/record/fixtures/five.ts';",
    ].join('\n'),
  );
  assert.deepEqual(
    specifiers(code).map((s) => s.spec).sort(),
    ['$lib/record/fixtures/five.ts', '../record/fixtures/four.ts', './fixtures/one.ts', './fixtures/six.ts', './fixtures/three.ts', './fixtures/two.ts'],
  );
});

test("the seed's root is refused and its subpaths are not", () => {
  assert.notEqual(refused('@braindog/seed'), null);
  assert.equal(refused('@braindog/seed/usecases/names'), null);
  assert.equal(refused('@braindog/seeded'), null);
  assert.notEqual(refused('./fixtures/sample.ts'), null);
  assert.equal(refused('./fixture.ts'), null);
});

test('a shipped component importing the fixture in its script is red, and the same words in its markup comment are not', (t) => {
  const root = tree(t, {
    'routes/Thing.svelte': "<!-- import { ROWS } from '$lib/record/fixtures/sample.ts' -->\n<script lang=\"ts\">\n  import { ROWS } from '$lib/record/fixtures/sample.ts';\n</script>\n",
    'routes/Other.svelte': "<!-- import { ROWS } from '$lib/record/fixtures/sample.ts' -->\n<p>nothing</p>\n",
  });
  const { status, said } = run(root);
  assert.equal(status, 1, said);
  assert.match(said, /routes\/Thing\.svelte:3/u);
  assert.doesNotMatch(said, /Other\.svelte/u);
});

test("a shipped file importing the seed's root is red, and a test or a fixture importing it is not", (t) => {
  const root = tree(t, {
    'lib/names.ts': "import { REGISTERS } from '@braindog/seed';\nexport const n = Object.keys(REGISTERS).length;\n",
    'lib/names.test.ts': "import { REGISTERS } from '@braindog/seed';\nimport './record/fixtures/fill.ts';\n",
    'lib/record/fixtures/fill.ts': "import { ROWS } from '@braindog/seed';\n",
    'lib/usecase.ts': "import { useCaseName } from '@braindog/seed/usecases/names';\n",
  });
  const { status, said } = run(root);
  assert.equal(status, 1, said);
  assert.match(said, /lib\/names\.ts:1/u);
  assert.match(said, /1 finding\(s\)/u);
});

test('a file listed as waiting that no longer imports the root is a finding, so the list only shrinks', (t) => {
  const [waiting] = Object.keys(WAITING);
  const root = tree(t, { [waiting.replace('apps/web/src/', '')]: "import { METRICS } from '@braindog/seed/usecases';\n" });
  const { status, said } = run(root);
  assert.equal(status, 1, said);
  assert.match(said, /Take it out of WAITING/u);
});

test('a root with nothing under apps/web/src could not run, which is not a pass', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'braindog-no-fixtures-empty-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(run(root).status, 3);
});
