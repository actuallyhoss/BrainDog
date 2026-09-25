/**
 * `shell-words` KNOWS HIS NAMES, READS WHERE HIS EXAMPLES LIVED, AND EXEMPTS FILES RATHER THAN TREES.
 *
 *   node --test "tools/gates/test/*.test.mjs"
 *
 * WHY THIS FILE EXISTS. `loop/research-legacy-parity.md` brief B10 measured the gate on 25 September
 * and found it green over everything the brief was about. It banned ten words and none of them was his
 * own name, so `brain.example.com` in a kernel file passed. It read only `*\/src`, so
 * `packages/mcp/grammars/script.ts`, which the MCP server hands every agent as `braindog:grammar/script`,
 * could say `api.goldapi.io` and pass. And it exempted `packages/seed` and `apps/web` whole, so a leak
 * in either was never looked at. Each case below is one of those, and each failed against the gate as it
 * stood before step 2: the first four exited 0 where they now exit 1.
 *
 * SPAWNED, AT A SEEDED ROOT, for `packs-read.test.mjs`'s reason: what is asserted is the exit code and
 * the lines an operator reads, which is the gate as `run.mjs` and CI run it.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { wordsIn } from '../shell-words.mjs';

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

/** The gate run as a script at a tree of `files`, with what it printed on both streams. */
function run(files) {
  const root = tree(files);
  try {
    const r = spawnSync(process.execPath, [gate], { env: { ...process.env, BRAINDOG_GATE_ROOT: root }, encoding: 'utf8' });
    return { code: r.status, out: `${r.stdout}${r.stderr}`.split(String.fromCharCode(92)).join('/') };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const KERNEL = { 'packages/kernel/src/index.ts': 'export const k = 1;\n' };

test('his host in a kernel file is a finding', () => {
  const { code, out } = run({ 'packages/kernel/src/host.ts': "export const HOST = 'brain.example.com';\n" });
  assert.equal(code, 1, out);
  assert.match(out, /packages\/kernel\/src\/host\.ts:1\s+sam, in brain\.sam\.link/);
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
    'apps/cli/scripts/drill.mjs': "export const origin = 'https://acme.example';\n",
    'apps/cli/scripts/drill.test.mjs': "const quoted = 'https://acme.example';\n",
  });
  assert.equal(code, 1, out);
  assert.match(out, /apps\/cli\/scripts\/drill\.mjs:1\s+bake, in bake\.gg/);
  assert.doesNotMatch(out, /drill\.test\.mjs/);
});

test('packages/seed and apps/web are no longer exempt as trees', () => {
  const { code, out } = run({
    ...KERNEL,
    'packages/seed/src/modules/rates.ts': "export const pair = ['USD', 'EGP'];\n",
    'apps/web/src/lib/sample.ts': 'export const legacyTool = true;\n',
  });
  assert.equal(code, 1, out);
  assert.match(out, /packages\/seed\/src\/modules\/rates\.ts:1\s+egp, in EGP/);
  assert.match(out, /apps\/web\/src\/lib\/sample\.ts:1\s+legacy, in legacyTool/);
});

/* `bake` IS THE ONE NEW WORD THAT IS ALSO THE START OF ORDINARY ENGLISH. Measured on 25 September over
   the scope this gate now reads, with `bake` matched the way every other word is: its one hit in the
   tree was `'bakery'`, a signal the guide reads to know a person runs a shop
   (`packages/seed/src/usecases/guide-kinds.ts:268`). So `bake` must be a whole run of parts, which
   `acme.example`, `acme-web` and `acmeweb` all are and `bakery`, `baker` and `baked` are not. */
test('bake is a whole word, so a bakery is not a finding and acme.example is', () => {
  assert.deepEqual(['bakery', 'baker', 'baked', 'bakes'].flatMap(wordsIn), []);
  assert.deepEqual(['acme.example', 'acme-web', 'acmeweb', 'ACME_WEB'].map(wordsIn), [['bake'], ['bake'], ['bake'], ['bake']]);
  const { code, out } = run({ 'packages/kernel/src/kinds.ts': "export const signals = ['bakery', 'cafe'];\n" });
  assert.equal(code, 0, out);
});

/* A LONG TOKEN IS READ IN THE TIME A SHORT ONE IS, TIMES ITS LENGTH, AND NOT CUBED. The first version of
   `WHOLE` built every run of parts from every part, so a token of n parts cost n cubed: measured on 25
   September by this change's checker, 800 parts took 868 ms, and the 2000-part token below (the shape
   of an SVG path or a long hyphenated slug in a string) took 31851 ms for its one line. The bound is
   loose on purpose; the cubic version misses it thirty times over. */
test('a token of thousands of parts is read in well under a second', () => {
  const started = performance.now();
  assert.deepEqual(wordsIn(`m${'-1'.repeat(2000)}-acme-web`), ['bake']);
  assert.ok(performance.now() - started < 1000, `${Math.round(performance.now() - started)} ms`);
});

test('the other words brief B10 adds are each read', () => {
  const tokens = ['EGP', 'quartzCo', 'acme', 'acme', 'realRecord', 'deltaWest', 'nileRealty', 'paydays', 'samLink'];
  assert.deepEqual(tokens.map((t) => wordsIn(t).length), tokens.map(() => 1));
});
