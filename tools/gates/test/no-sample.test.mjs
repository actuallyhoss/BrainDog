/**
 * `no-sample`: the demo's setting outside a test, and a string of the test fixture in the built app, are each red.
 *
 *   node --test tools/gates/test/no-sample.test.mjs
 *
 * THE COMMITTED NEGATIVE SEEDS THE BUNDLE HALF (`negative/no-sample/`). The setting half is planted here in a temporary
 * tree, beside a copy of that one with its chunk made clean, so each fault is the only one in its tree.
 */

import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { DEMO, MARKERS, isTest, needs } from '../no-sample.mjs';
import { filesOf, textOf } from '../public-clean.mjs';

const gates = join(import.meta.dirname, '..');
const root = join(gates, '..', '..');
const planted = join(gates, 'negative', 'no-sample');
const CHUNK = 'apps/web/.svelte-kit/output/client/app/immutable/chunks/seeded.js';

function run(at) {
  const r = spawnSync(process.execPath, [join(gates, 'no-sample.mjs')], { encoding: 'utf8', env: { ...process.env, BRAINDOG_GATE_ROOT: at } });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

const findings = (out) => out.split('\n').filter((l) => /^ {2}(?!no-sample:)\S/u.test(l) && !/^ {2}(?:The sample|the built)/u.test(l));

/** The planted tree with its chunk made clean, plus whatever `files` adds. */
function tree(t, files = {}) {
  const at = mkdtempSync(join(tmpdir(), 'no-sample-'));
  t.after(() => rmSync(at, { recursive: true, force: true }));
  cpSync(planted, at, { recursive: true });
  rmSync(join(at, 'expect.txt'));
  writeFileSync(join(at, CHUNK), 'export const rows = [];\n');
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(at, rel)), { recursive: true });
    writeFileSync(join(at, rel), text);
  }
  return at;
}

test('the planted tree is red on its chunk, once', () => {
  const r = run(planted);
  assert.equal(r.status, 1, r.out);
  assert.deepEqual(findings(r.out).map((l) => l.trim().split('  ')[0]), [CHUNK]);
  assert.match(r.out, /a string of the test fixture/u);
});

test('the same tree with a clean chunk is green', (t) => {
  const r = run(tree(t));
  assert.equal(r.status, 0, r.out);
});

test('the demo setting is red in a config or a source file, and not in a test', (t) => {
  const at = tree(t, {
    'apps/worker/wrangler.jsonc': `{\n  "vars": {\n    "${DEMO}": "rec_x"\n  }\n}\n`,
    'apps/worker/src/env.ts': `export interface Env { ${DEMO}?: string }\n`,
    'apps/worker/test/slash-demo.test.ts': `const env = { ${DEMO}: 'rec_x' };\n`,
    'apps/worker/test/helpers.ts': `export const old = '${DEMO}';\n`,
    'apps/worker/src/other.ts': `export const NOT_${DEMO}S = 1;\n`,
  });
  const r = run(at);
  assert.equal(r.status, 1, r.out);
  assert.deepEqual(findings(r.out).map((l) => l.trim().split('  ')[0]).sort(), ['apps/worker/src/env.ts:1', 'apps/worker/wrangler.jsonc:3']);
});

test('a tree with no build could not run, and says so', (t) => {
  const at = tree(t);
  rmSync(join(at, 'apps/web/.svelte-kit'), { recursive: true });
  const r = run(at);
  assert.equal(r.status, 3, r.out);
  assert.match(r.out, /no web build/u);
});

test('what counts as a test', () => {
  assert.ok(isTest('apps/worker/test/slash-demo.test.ts'));
  assert.ok(isTest('apps/worker/scripts/smoke.test.mjs'));
  assert.ok(isTest('packages/kernel/test/helpers.ts'));
  assert.ok(!isTest('apps/worker/src/index.ts'));
  assert.ok(!isTest('apps/worker/wrangler.jsonc'));
});

test('it needs the web build, so the runner asks it in --built', () => {
  assert.deepEqual(needs, ['web-build']);
  assert.match(readFileSync(join(gates, 'no-sample.mjs'), 'utf8'), /^export const needs = \['web-build'\];$/mu);
});

/* WHEREVER THE FIXTURE HAS MOVED: LCH-A06 job 1 takes it out of the app's source tree, and the gate follows it the same way. */
test('every marker is in a tracked file under apps/web today', () => {
  const held = filesOf(root)
    .filter((rel) => rel.startsWith('apps/web/'))
    .map((rel) => textOf(root, rel) ?? '')
    .join('\n');
  for (const m of MARKERS) assert.ok(held.includes(m), `"${m}" is in no tracked file under apps/web`);
});
