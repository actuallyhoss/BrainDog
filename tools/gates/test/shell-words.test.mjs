/**
 * `shell-words` READS HOSTS AND GRAMMARS, READS WHERE EXAMPLES LIVED, EXEMPTS FILES RATHER THAN TREES,
 * AND READS A PRIVATE LIST WHEN ONE IS THERE.
 *
 *   node --test "tools/gates/test/*.test.mjs"
 *
 * WHY THIS FILE EXISTS. The gate was measured on 25 September and found green over everything it was
 * meant to catch. A host in a kernel file passed. It read only `*\/src`, so
 * `packages/mcp/grammars/script.ts`, which the MCP server hands every agent as `braindog:grammar/script`,
 * could say `api.goldapi.io` and pass. And it exempted `packages/seed` and `apps/web` whole, so a leak
 * in either was never looked at. Each case below is one of those, and each failed against the gate as it
 * stood before it read those places.
 *
 * SPAWNED, AT A SEEDED ROOT, for `packs-read.test.mjs`'s reason: what is asserted is the exit code and
 * the lines an operator reads, which is the gate as `run.mjs` and CI run it. Every spawn is handed a
 * private list of its own, or a path where none is, so a machine's own `private-words.local.json`
 * cannot change what these cases see.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { WORDS, wordsWith } from '../shell-words.mjs';

const gate = join(import.meta.dirname, '..', 'shell-words.mjs');

/** A root holding exactly `files`, each a path under it and its text. */
function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'braindog-shell-words-'));
  for (const [at, body] of Object.entries(files)) {
    const full = join(root, at);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, body);
  }
  return root;
}

/** The gate run as a script at a tree of `files`, with `words` as its private list, and what it printed. */
function run(files, words = null) {
  const root = tree(files);
  const list = join(root, 'private-words.json');
  if (words !== null) writeFileSync(list, JSON.stringify(words));
  try {
    const r = spawnSync(process.execPath, [gate], {
      env: { ...process.env, BRAINDOG_GATE_ROOT: root, BRAINDOG_PRIVATE_WORDS: list },
      encoding: 'utf8',
    });
    return { code: r.status, out: `${r.stdout}${r.stderr}`.split(String.fromCharCode(92)).join('/') };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const KERNEL = { 'packages/kernel/src/index.ts': 'export const k = 1;\n' };

test('a host in a kernel file is a finding', () => {
  const { code, out } = run({ 'packages/kernel/src/host.ts': "export const HOST = 'whois.registrar.example';\n" });
  assert.equal(code, 1, out);
  assert.match(out, /packages\/kernel\/src\/host\.ts:1\s+registrar, in whois\.registrar\.example/);
});

/* THE GRAMMAR IS NOT `src` AND IS SERVED ANYWAY. `packages/mcp/src/index.ts` imports it and answers it as
   a resource, so the example an agent copies is shipped code in every sense that matters here. The
   token is reported once, as `goldapi`: `gold` is a prefix of it at the same place, and one leak read as
   two findings would make every count in `self-test` a count of words rather than of places. */
test('a grammar is read, and names the longest word it holds', () => {
  const { code, out } = run({
    ...KERNEL,
    'packages/mcp/src/index.ts': "export { script } from '../grammars/script.ts';\n",
    'packages/mcp/grammars/script.ts': "export const example = { url: 'https://api.goldapi.io/api/XAU/USD' };\n",
  });
  assert.equal(code, 1, out);
  assert.match(out, /packages\/mcp\/grammars\/script\.ts:1\s+goldapi, in api\.goldapi\.io/);
  assert.equal(out.match(/grammars\/script\.ts:1/g)?.length, 1, out);
});

/* A SCRIPT SHIPS ITS WORDS TOO, and its test beside it quotes them for the reason `OUT` gives for tests. */
test('an app script is read, and the test beside it is not', () => {
  const { code, out } = run({
    ...KERNEL,
    'apps/cli/scripts/drill.mjs': "export const origin = 'https://api.mercury.com';\n",
    'apps/cli/scripts/drill.test.mjs': "const quoted = 'https://api.mercury.com';\n",
  });
  assert.equal(code, 1, out);
  assert.match(out, /apps\/cli\/scripts\/drill\.mjs:1\s+mercury, in api\.mercury\.com/);
  assert.doesNotMatch(out, /drill\.test\.mjs/);
});

test('packages/seed and apps/web are no longer exempt as trees', () => {
  const { code, out } = run({
    ...KERNEL,
    'packages/seed/src/modules/rates.ts': "export const pair = ['USD', 'EGP'];\n",
    'apps/web/src/lib/sample.ts': 'export const instaPay = true;\n',
  });
  assert.equal(code, 1, out);
  assert.match(out, /packages\/seed\/src\/modules\/rates\.ts:1\s+egp, in EGP/);
  assert.match(out, /apps\/web\/src\/lib\/sample\.ts:1\s+instapay, in instaPay/);
});

/* THE PRIVATE LIST IS READ WHEN IT IS THERE, AND ITS ABSENCE IS THE TRACKED LIST ALONE. A word nobody
   publishes is still kept out of the core on the machine that holds the list. */
test('a private word is a finding only where the private list names it', () => {
  const files = { 'packages/kernel/src/host.ts': "export const HOST = 'brain.acme.example';\n" };
  const without = run(files);
  assert.equal(without.code, 0, without.out);
  const withList = run(files, ['acme']);
  assert.equal(withList.code, 1, withList.out);
  assert.match(withList.out, /packages\/kernel\/src\/host\.ts:1\s+acme, in brain\.acme\.example/);
});

/* A BROKEN PRIVATE LIST IS NOT AN EMPTY ONE, or every word it was written to catch would pass. */
test('a private list that is not an array of words is refused', () => {
  const { code, out } = run(KERNEL, { word: 'acme' });
  assert.notEqual(code, 0, out);
  assert.match(out, /must hold a JSON array of words/);
});

/* A WORD THAT IS ALSO THE START OF ORDINARY ENGLISH IS MATCHED WHOLE. The first such word was measured
   on 25 September over the scope this gate reads: matched the way every other word is, its one hit in
   the tree was `'bakery'`, a signal the guide reads to know a person runs a shop. So a `whole` word must
   be a whole run of parts. `cook` stands in for it here: `cook.gg`, `cook-gg` and `cookGg` all are, and
   `cookery`, `cooker` and `cooked` are not. */
const COOK = wordsWith({ words: [...WORDS, 'cook'], whole: new Set(['cook']) });

test('a whole word is a finding in its own parts and not inside a longer word', () => {
  assert.deepEqual(['cookery', 'cooker', 'cooked', 'cooks'].flatMap(COOK), []);
  assert.deepEqual(['cook.gg', 'cook-gg', 'cookGg', 'COOK_GG'].map(COOK), [['cook'], ['cook'], ['cook'], ['cook']]);
  const green = run({ 'packages/kernel/src/kinds.ts': "export const signals = ['cookery', 'cafe'];\n" }, [{ word: 'cook', whole: true }]);
  assert.equal(green.code, 0, green.out);
  const red = run({ 'packages/kernel/src/host.ts': "export const origin = 'https://cook.gg';\n" }, [{ word: 'cook', whole: true }]);
  assert.equal(red.code, 1, red.out);
  assert.match(red.out, /cook, in cook\.gg/);
});

/* A LONG TOKEN IS READ IN THE TIME A SHORT ONE IS, TIMES ITS LENGTH, AND NOT CUBED. The first version of
   `WHOLE` built every run of parts from every part, so a token of n parts cost n cubed: measured on 25
   September, 800 parts took 868 ms, and the 2000-part token below (the shape of an SVG path or a long
   hyphenated slug in a string) took 31851 ms for its one line. The bound is loose on purpose; the cubic
   version misses it thirty times over. */
test('a token of thousands of parts is read in well under a second', () => {
  const started = performance.now();
  assert.deepEqual(COOK(`m${'-1'.repeat(2000)}-cook-gg`), ['cook']);
  assert.ok(performance.now() - started < 1000, `${Math.round(performance.now() - started)} ms`);
});

test('each word of the tracked list is read', () => {
  const read = wordsWith({ words: WORDS, whole: new Set() });
  const tokens = ['EGP', 'quartzCo', 'paydays', 'hsbcBank', 'instaPay', 'salaryBand', 'payrollRun', 'registrarName'];
  assert.deepEqual(tokens.map((t) => read(t).length), tokens.map(() => 1));
});
