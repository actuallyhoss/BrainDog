/**
 * The planted faults PRF-B02 jobs 4 to 6 add, each run against its gate the way `self-test` runs it, and each red.
 *
 *   node --test tools/gates/test/cases-planted-faults.test.mjs
 *
 * `negative/passkey-left/` is a seed over a real browser and a real build, so it is read and not run here: what is
 * run is the gate refusing a seed it does not know, which happens before any browser is launched.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { ELSEWHERE, GAPS, readCases, registeredGates, runCase } from '../self-test.mjs';

const gates = join(import.meta.dirname, '..');
const negatives = join(gates, 'negative');
const RUNNER = readFileSync(join(gates, 'run.mjs'), 'utf8');
const { cases, refused } = readCases(negatives, registeredGates(RUNNER));
const caseOf = (tree) => cases.find((c) => c.tree === tree);

/** What `self-test`'s `planted` asks of a tree: red, naming its seed the stated number of times, in its words. */
async function red(tree) {
  const c = caseOf(tree);
  assert.ok(c, `negative/${tree}/ has a case`);
  const { status, said } = await runCase(c);
  const seeded = readFileSync(join(negatives, tree, 'expect.txt'), 'utf8').trim();
  assert.notEqual(status, 0, `${tree} passed:\n${said}`);
  assert.equal(said.split('\n').filter((l) => l.includes(seeded)).length, c.findings, `${tree} named ${seeded}:\n${said}`);
  assert.match(said, c.expect);
  if (c.total !== undefined) assert.match(said, new RegExp(`\\b${c.total} finding\\(s\\)`, 'u'));
  return said;
}

test('the six new trees are read, each naming the gate it was planted for', () => {
  const want = {
    'bundle-over-budget': 'bundle',
    typecheck: 'typecheck',
    theme: 'theme',
    'deploy-parity': 'deploy-parity',
    'passkey-left': 'passkey',
    'self-test-missing': 'self-test',
  };
  /* ONLY THESE SIX ARE ASKED: another batch's tree may be mid-landing, and `self-test-cases.test.mjs` asks of all. */
  assert.deepEqual(refused.filter((l) => Object.keys(want).some((tree) => l.startsWith(`negative/${tree}/`))), []);
  for (const [tree, gate] of Object.entries(want)) assert.equal(caseOf(tree)?.gate, gate, tree);
  assert.equal(caseOf('passkey-left').seed, 'passkey-left');
  assert.equal(caseOf('deploy-parity').serve, 'host');
});

test('the four gaps the trees close are off GAPS', () => {
  for (const g of ['typecheck', 'theme', 'passkey', 'deploy-parity']) assert.equal(GAPS.has(g), false, g);
});

test('the gates that live elsewhere are run as run.mjs runs them', () => {
  assert.ok(RUNNER.includes("const PNPM = ['pnpm -r run typecheck', [], { shell: true }];"));
  assert.ok(RUNNER.includes("['typecheck', PNPM]"));
  assert.ok(RUNNER.includes("['theme', ['node', [join(root, 'packages/skin/scripts/theme.mjs'), '--check']]]"));
  assert.deepEqual(ELSEWHERE.get('typecheck')('x').slice(0, 2), ['pnpm -r run typecheck', []]);
  assert.deepEqual(ELSEWHERE.get('theme')('x')[1].slice(1), ['--check', '--tokens', join('x', 'tokens.json')]);
});

test('bundle is red on an entry chunk over the debt, and names that row alone', async () => {
  const said = await red('bundle-over-budget');
  assert.match(said, /FAIL {2}entry JS, brotli/u);
  assert.doesNotMatch(said, /FAIL {2}entry CSS|FAIL {2}index\.html|FAIL {2}UI face|FAIL {2}display face/u);
});

test('typecheck is red on one type error in a workspace of its own', async () => {
  await red('typecheck');
});

test('theme is red on one token pair under contrast, read with --tokens', async () => {
  const said = await red('theme');
  assert.match(said, /REFUSED S/u);
});

test('deploy-parity is red on a planted host whose Worker names another build', async () => {
  const said = await red('deploy-parity');
  assert.doesNotMatch(said, /live \/app\/ differs|live \/app\/_app\/version\.json differs/u);
});

test('self-test names the registered gate a tree of its own leaves without a fault', async () => {
  const said = await red('self-test-missing');
  assert.doesNotMatch(said, /em-dash|self-test:/u);
});

test('passkey refuses a seed it does not know before it starts anything', () => {
  const r = spawnSync(process.execPath, [join(gates, 'passkey.mjs')], {
    encoding: 'utf8',
    env: { ...process.env, BRAINDOG_GATE_SEED: 'passkey-gone' },
  });
  assert.equal(r.status, 1);
  assert.match(`${r.stdout}${r.stderr}`, /no seed is called "passkey-gone"\. The seeds are passkey-left\./u);
});

test('deploy-parity takes plain http only for a host on this machine', () => {
  const r = spawnSync(process.execPath, [join(gates, 'deploy-parity.mjs')], {
    encoding: 'utf8',
    env: { ...process.env, DEPLOY_HOST: 'http://example.com', BRAINDOG_GATE_ROOT: join(negatives, 'deploy-parity') },
  });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /plain http to a host that is not this machine/u);
});

test('theme refuses a token file naming no theme, or a token the theme does not have', () => {
  const theme = (file) =>
    spawnSync(process.execPath, [join(gates, '..', '..', 'packages', 'skin', 'scripts', 'theme.mjs'), '--check', '--tokens', file], { encoding: 'utf8' });
  const none = theme(join(gates, 'budgets.json'));
  assert.equal(none.status, 1);
  assert.match(none.stderr, /names the theme undefined/u);
  /* A MISSPELT ROLE IS REFUSED, NOT ADDED BESIDE THE REAL ONE, where it would validate nothing and pass. */
  const dir = mkdtempSync(join(tmpdir(), 'braindog-theme-tokens-'));
  try {
    writeFileSync(join(dir, 'tokens.json'), JSON.stringify({ theme: 'house', light: { 'on-acton': '#DDDDDD' } }));
    const typo = theme(join(dir, 'tokens.json'));
    assert.equal(typo.status, 1);
    assert.match(typo.stderr, /changes on-acton in light, and house has no token by that name/u);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the canary look forgives a self-host its snapshots 501, and nothing else', async () => {
  const { judge, productErrors } = await import('../../canary/lane.d/30-look.mjs');
  const E = 'Failed to load resource: the server responded with a status of 501 (Not Implemented)';
  const backups = { name: 'Backups', width: 390, settled: 'ok', consoleErrors: [E], failedRequests: ['POST /app/ops/api/snapshots: 501'], lint: null, raw: {} };
  assert.deepEqual(productErrors(backups, { selfHost: true }), []);
  assert.deepEqual(judge({ shots: [backups] }, { selfHost: true }), []);
  assert.deepEqual(productErrors(backups), [E], 'on the canary itself a 501 is still the product’s');
  assert.deepEqual(productErrors({ ...backups, failedRequests: ['POST /api/snapshots: 501', 'POST /api/boot: 501'] }, { selfHost: true }), [E]);
  assert.deepEqual(productErrors({ ...backups, consoleErrors: [E, 'TypeError: x'] }, { selfHost: true }), ['TypeError: x']);
});
