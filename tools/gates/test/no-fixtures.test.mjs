/**
 * `no-fixtures`, asked of seeded trees and of this one.
 *
 *   node --test "tools/gates/test/no-fixtures.test.mjs"
 *
 * THE GATE IS A GREP OVER IMPORTS, AND EVERY WAY A GREP IS WRONG IS A CASE HERE. A shipped file that imports the sample
 * by any of the five spellings a module can be named in (`import ... from`, a bare `import`, `export ... from`,
 * `import()`, `import.meta.glob`) is red; a test, a fixture, a comment, and a subpath of the seed are not. `self-test.mjs` runs the gate
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

import { refused, specifiers, uncommented } from '../no-fixtures.mjs';

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

/* NO FILE WAITS ANY MORE. Three shipped files read the seed's root for product declarations until `@braindog/seed/packs`
   gave them a door of their own; a pass that still printed a waiting list would be a pass with an exemption in it. */
test("this tree is green, and no shipped file reads the seed's root", () => {
  const { status, said } = run(repo);
  assert.equal(status, 0, said);
  assert.doesNotMatch(said, /waiting/u, said);
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
  assert.equal(refused('@braindog/seed/packs'), null);
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

/* THE THREE FILES THAT WAITED ARE HELD LIKE ANY OTHER NOW. Each read the root by name until 25 September, and an
   exemption that outlived its reason is the one place the sample could come back without a finding. */
test('the files that once waited on a seed subpath are red if they read the root again, and green through the subpath', (t) => {
  const once = {
    'lib/record/declared.ts': "import { METRICS as SEED_METRICS } from '@braindog/seed';\n",
    'lib/record/packs.ts': "export const load = async () => (await import('@braindog/seed')).firstPartyDocument('work');\n",
    'routes/settings/[area]/+page.svelte': "<script lang=\"ts\">\n  import { AGENTS_PACK } from '@braindog/seed';\n</script>\n",
  };
  const red = run(tree(t, once));
  assert.equal(red.status, 1, red.said);
  assert.match(red.said, /3 finding\(s\)/u);
  const through = Object.fromEntries(Object.entries(once).map(([p, body]) => [p, body.replaceAll("'@braindog/seed'", "'@braindog/seed/packs'")]));
  const green = run(tree(t, through));
  assert.equal(green.status, 0, green.said);
});

/* A WORD THAT ENDS IN `import` IS NOT AN IMPORT. The pattern opened on `\bimport`, and `\b` sits between `-` and `i`, so
   the words `legacy-import` in a component's markup, which no lexer blanks, read as a bare import of whatever string
   came next; a method called `import` on an object read as a dynamic one. */
test('an import keyword is not read out of a longer word, a method or a property', () => {
  const code = uncommented(
    [
      "<p>Run legacy-import './fixtures/sample.ts' to fill it.</p>",
      "loader.import('./fixtures/two.ts');",
      "const $import = (p) => p; $import('./fixtures/three.ts');",
      "const re-export = 1; re-export * from './fixtures/four.ts';",
      "import { real } from './fixtures/real.ts';",
    ].join('\n'),
    true,
  );
  assert.deepEqual(specifiers(code).map((s) => s.spec), ['./fixtures/real.ts']);
});

/* A GLOB IS AN IMPORT OF EVERY FILE IT MATCHES. `import.meta.glob('./fixtures/*.ts', { eager: true })` bundles the
   sample into the page as surely as a named import does, and none of the four spellings above reads it. A negated
   pattern (`!`) takes files out, so it is not a read of them. */
test('import.meta.glob of the fixtures is read, in either the one-string or the list form, and a negation is not', () => {
  const code = uncommented(
    [
      "const one = import.meta.glob('./fixtures/*.ts', { eager: true });",
      "const many = import.meta.glob<string>([\n  '$lib/record/fixtures/**/*.ts',\n  '!**/fixtures/skip.ts',\n  './own/*.ts',\n]);",
    ].join('\n'),
  );
  const found = specifiers(code);
  assert.deepEqual(found.map((s) => s.spec).sort(), ['$lib/record/fixtures/**/*.ts', './fixtures/*.ts', './own/*.ts']);
  assert.deepEqual(found.filter((s) => refused(s.spec) !== null).map((s) => s.line).sort(), [1, 3]);
});

/* A ROUTE'S DIRECTORY HAS A BRACKET IN ITS NAME, and this app's do (`routes/settings/[area]`). The list form was read
   up to the first `]`, so `['./routes/[area]/*.ts', './fixtures/*.ts']` ended inside the first string and neither
   pattern was seen: the fixture's glob passed. The list is read string by string now. */
test('a glob list whose pattern holds a bracket is read to its end', () => {
  const found = specifiers("const g = import.meta.glob(['./routes/[area]/*.ts', './fixtures/*.ts']);");
  assert.deepEqual(found.map((s) => s.spec), ['./routes/[area]/*.ts', './fixtures/*.ts']);
});

test('a root with nothing under apps/web/src could not run, which is not a pass', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'braindog-no-fixtures-empty-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(run(root).status, 3);
});
