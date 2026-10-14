/**
 * `self-test`'s cases, read from the planted trees, and the two rules that read them.
 *
 *   node --test tools/gates/test/self-test-cases.test.mjs
 *
 * IMPORTED, NOT SPAWNED. `self-test.mjs` runs only when it is the program, so the reader, the
 * gate-has-a-case rule and the whole-path key check are asked here without running eighty gates.
 * The trees under test are written to a temporary directory; the real `negative/` is read only to
 * say that every one of its trees still has a case that names a registered gate.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { EXCUSED, GAPS, deadKeys, readCases, registeredGates, uncovered } from '../self-test.mjs';

const gates = join(import.meta.dirname, '..');
const REGISTERED = registeredGates(readFileSync(join(gates, 'run.mjs'), 'utf8'));

/** A `negative/` of the given trees, each a map of file name to body. */
function negatives(trees) {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-cases-'));
  for (const [tree, files] of Object.entries(trees)) {
    mkdirSync(join(dir, tree));
    for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, tree, name), body);
  }
  return dir;
}

const ok = { gate: 'em-dash', rule: 'an em dash as punctuation', expect: 'used as punctuation', findings: 1 };

test('a tree with no case.json is refused by name', () => {
  const dir = negatives({ planted: { 'expect.txt': 'seeded.ts\n' }, told: { 'case.json': JSON.stringify(ok) } });
  const { cases, refused } = readCases(dir, REGISTERED);
  rmSync(dir, { recursive: true, force: true });
  assert.deepEqual(cases.map((c) => c.tree), ['told']);
  assert.equal(refused.length, 1);
  assert.match(refused[0], /negative\/planted\/ is planted and has no case\.json/u);
});

test('a case.json naming no gate, or a gate nobody registers, is refused', () => {
  const { gate, ...nameless } = ok;
  const dir = negatives({
    nameless: { 'case.json': JSON.stringify(nameless) },
    stranger: { 'case.json': JSON.stringify({ ...ok, gate: 'no-such-gate' }) },
  });
  const { cases, refused } = readCases(dir, REGISTERED);
  rmSync(dir, { recursive: true, force: true });
  assert.equal(cases.length, 0);
  assert.ok(refused.some((l) => /negative\/nameless\/case\.json names no gate/u.test(l)), refused.join('\n'));
  assert.ok(refused.some((l) => /names no-such-gate, and run\.mjs registers no gate/u.test(l)), refused.join('\n'));
});

test('a case reads its pattern without regard to case, and its counts as given', () => {
  const dir = negatives({ told: { 'case.json': JSON.stringify({ ...ok, total: 1, 'skip': true }) } });
  const [c] = readCases(dir, REGISTERED).cases;
  rmSync(dir, { recursive: true, force: true });
  assert.ok(c.expect.test('USED AS PUNCTUATION'));
  assert.deepEqual([c.gate, c.findings, c.total, c.skip], ['em-dash', 1, 1, true]);
});

test('every tree in this repository has a case naming a registered gate', () => {
  const { cases, refused } = readCases(join(gates, 'negative'), REGISTERED);
  assert.deepEqual(refused, []);
  assert.ok(cases.length >= 83, `${cases.length} cases`);
});

test('a registered gate with no planted fault is named, and a gap that gained one must come off', () => {
  const registered = new Set(['self-test', 'em-dash', 'graph', 'rule-sheet', 'signin-live']);
  const { missing, closed, open } = uncovered(registered, new Set(['em-dash', 'signin-live']));
  assert.deepEqual(missing, ['graph']);
  assert.deepEqual(closed, ['signin-live']);
  assert.ok(open.includes('rule-sheet') && !open.includes('signin-live'));
});

test('the gaps are today\'s six at most, and the list only shrinks', () => {
  const TODAY = ['typecheck', 'theme', 'passkey', 'deploy-parity', 'rule-sheet', 'signin-live'];
  for (const g of GAPS.keys()) assert.ok(TODAY.includes(g), `${g} joined the gaps list`);
  assert.deepEqual([...EXCUSED], ['self-test']);
});

test('the key check compares the whole path, not its last word', () => {
  const gate = [
    "const L = budget('layout');",
    'if (w > L.widthTolerancePx) {}',
    "const ready = budget('ready').settleTimeoutMs;",
    "const { port } = budget('record');",
    'const PORT = server.address().port;',
  ].join('\n');
  const paths = ['layout.widthTolerancePx', 'layout.port', 'keys.port', 'ready.settleTimeoutMs', 'record.port'];
  assert.deepEqual(deadKeys(paths, [gate]), ['layout.port', 'keys.port']);
});

test('no port key is left in budgets.json for a gate that asks the system for one', () => {
  const b = JSON.parse(readFileSync(join(gates, 'budgets.json'), 'utf8'));
  for (const section of ['keys', 'prefs', 'layout', 'a11y']) assert.equal(b[section]?.port, undefined, `${section}.port`);
});

test('the row drawer has a planted fault: a browser negative in its neighbours\' words, spawned where the walk lives', async () => {
  const { BROWSER } = await import('../self-test.mjs');
  const c = BROWSER.find((b) => b.gate === 'row-drawer');
  assert.ok(c, 'no row-drawer case in BROWSER');
  assert.ok(REGISTERED.has('row-drawer'), 'run.mjs registers row-drawer');
  assert.equal(c.seed, 'row-drawer');
  for (const k of ['blind', 'red']) assert.ok(typeof c[k] === 'string' && c[k].trim(), `${k} is a sentence`);
  for (const n of [c.names].flat()) assert.ok(typeof n === 'string' && n.trim(), 'each name is a sentence');
  for (const b of BROWSER) {
    /* EVERY CASE IS THE SAME FIVE KEYS, and `file` only for a gate that is not `<gate>.mjs` beside self-test. */
    const keys = Object.keys(b).filter((k) => k !== 'file').sort();
    assert.deepEqual(keys, ['blind', 'gate', 'names', 'red', 'seed'], b.gate);
    const at = join(gates, b.file ?? `${b.gate}.mjs`);
    assert.ok(readFileSync(at, 'utf8').includes('BRAINDOG_GATE_SEED'), `${b.gate}'s file reads no seed`);
    for (const v of [b.blind, b.red, ...[b.names].flat()]) assert.doesNotMatch(v, /[—–]/u);
  }
  /* AND THE NAMES ARE THE WALK'S OWN SENTENCES, so the negative cannot drift from what the judge and the drive print. */
  const walk = readFileSync(join(gates, c.file), 'utf8');
  for (const n of [c.names].flat()) assert.ok(walk.includes(n), `the walk never says "${n}"`);
  assert.ok(!GAPS.has('row-drawer'));
});
