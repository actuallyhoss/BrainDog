/**
 * `printed`, the rule that reads what a settled screen prints, held without a browser.
 *   node --test tools/gates/test/printed.test.mjs
 *
 * `checkScreen` is read rule by rule over words written here, and every planted tree under `negative/printed-*` is run
 * the way `self-test` runs it (spawned, `BRAINDOG_GATE_ROOT` at the tree), so a tree that drifts from its `case.json`
 * is red here before the self-test ever reaches it.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { checkScreen, LINT_HELD, OWN, WORKER_LOST } from '../printed.mjs';

const GATES = join(import.meta.dirname, '..');
const WHERE = '/today @390';
const CLEAN = 'Today\nThursday 3 September 2026\nGBP 39.00, due in 4 days\nS731 Review the specimen page, beside its name';

const said = (text, errors = []) => checkScreen({ where: WHERE, text, errors });

test('a clean screen says nothing: a date in words, an amount, a run handle beside its name', () => {
  assert.deepEqual(said(CLEAN), []);
});

test('each of the words for a value that never arrived is one finding', () => {
  for (const [word, rule] of [
    ['Due undefined', 'undefined'],
    ['NaN open', 'nan'],
    ['Owner [object Object]', 'object'],
    ['Last run Invalid Date', 'invalid-date'],
  ]) {
    const out = said(`${CLEAN}\n${word}`);
    assert.equal(out.length, 1, `${rule}: ${out.join(' | ')}`);
    assert.ok(out[0].startsWith(`${WHERE}  `));
    assert.ok(OWN.some((o) => o.rule === rule && out[0].endsWith(o.said)));
  }
});

test('a word that only contains one of them is not a finding', () => {
  assert.deepEqual(said(`${CLEAN}\nNaNa came by\nundefinedness`), []);
});

test('braces: single and empty are this gate, double are the lint', () => {
  assert.equal(said('Hello {name}').length, 1);
  assert.equal(said('Settings {}').length, 1);
  const doubled = said('Revenue {{revenue.monthly}}');
  assert.equal(doubled.length, 1);
  assert.match(doubled[0], /\(braces\)$/);
});

test('braces and a key inside code are a sample and pass; the same braces in the prose round it still fail', () => {
  const sample = 'braindog.update({ id: "SG10", next_step: "{step}" })';
  assert.deepEqual(checkScreen({ where: WHERE, text: `Ask it like this\n${sample}\nand it answers.`, code: [sample] }), []);
  assert.deepEqual(checkScreen({ where: WHERE, text: 'Use {name}', code: ['{name}'] }), []);
  assert.equal(checkScreen({ where: WHERE, text: `Hello {name}\n${sample}`, code: [sample] }).length, 1);
  assert.equal(checkScreen({ where: WHERE, text: 'Hello {name}\nthen {name}', code: ['{name}'] }).length, 1);
  assert.equal(said('Hello {name}').length, 1);
});

test('a raw id, a raw time and a key are the lint, and the finding never quotes them', () => {
  const id = said('Used by tools#8');
  assert.match(id.join('\n'), /\(raw-id\)/);
  const time = said('Began 2026-09-01T00:00:00.000Z');
  assert.match(time.join('\n'), /\(raw-instant\)/);
  assert.equal(time.join('\n').includes('2026-09-01'), false);
  const key = said('Nightly export bdK9f2mQ7xLp3vR8sT1wZ4yH6');
  assert.equal(key.some((l) => /k9f2m/iu.test(l)), false, key.join(' | '));
  assert.ok(key.some((l) => l.endsWith('(raw-id)')));
});

test('the copy rules are not held here', () => {
  assert.equal(LINT_HELD.has('em-dash'), false);
  assert.equal(LINT_HELD.has('plain-words'), false);
  assert.deepEqual(said('One row \u2014 a list item'), []);
});

test('an uncaught error and a console error are findings, a log line is not, and only the first line is said', () => {
  const out = said(CLEAN, [
    { kind: 'uncaught', text: "TypeError: x is null\n    at Page.svelte:4" },
    { kind: 'console', text: 'Failed to load resource' },
    { kind: 'log', text: 'hello' },
  ]);
  assert.deepEqual(out, [`${WHERE}  threw an uncaught error: TypeError: x is null`, `${WHERE}  wrote an error to the console: Failed to load resource`]);
});

test("the self-host's own no is not a finding: its status and its path, and only while every answer of that status is one", () => {
  const line = (n, word) => ({ kind: 'console', text: `Failed to load resource: the server responded with a status of ${n} (${word})` });
  const notBuilt = line(501, 'Not Implemented');
  assert.deepEqual(checkScreen({ where: WHERE, text: CLEAN, errors: [notBuilt], failed: [{ status: 501, path: '/api/snapshots' }] }), []);
  /* THE SAME STATUS ON ANOTHER PATH IS STILL RED, and so is the allowed one beside it. */
  assert.equal(checkScreen({ where: WHERE, text: CLEAN, errors: [notBuilt], failed: [{ status: 501, path: '/api/snapshots' }, { status: 501, path: '/api/boot' }] }).length, 1);
  /* NO ANSWER SEEN IS NO EXCUSE: a planted line with nothing it answered stays red. */
  assert.equal(checkScreen({ where: WHERE, text: CLEAN, errors: [notBuilt] }).length, 1);
  /* NOT FOUND IS THE ANSWER ONLY ON AN ADDRESS DRAWN AS NOT FOUND ON PURPOSE. */
  const missing = { where: WHERE, text: CLEAN, errors: [line(422, 'Unprocessable Entity')], failed: [{ status: 422, path: '/api/jobEvents' }] };
  assert.equal(checkScreen(missing).length, 1);
  assert.deepEqual(checkScreen(missing, { missing: true }), []);
  /* AND A SERVER'S FAULT IS NEVER THE HOST'S WORD, missing or not. */
  assert.equal(checkScreen({ where: WHERE, text: CLEAN, errors: [line(500, 'Internal Server Error')], failed: [{ status: 500, path: '/api/jobEvents' }] }, { missing: true }).length, 1);
});

test("WebKit's lost request for the worker's script is not the screen's error; any other word about the worker still is", () => {
  const lost = { kind: 'uncaught', text: 'http://localhost:60021/service-worker.js due to access control checks.' };
  assert.ok(WORKER_LOST.test(lost.text));
  assert.deepEqual(said(CLEAN, [lost]), []);
  assert.deepEqual(said(CLEAN, [{ ...lost, kind: 'console' }]), []);
  /* THE SAME WORDS FOR ANY OTHER ADDRESS ARE STILL RED: a read the page asked for and lost is the page's to say. */
  assert.equal(said(CLEAN, [{ kind: 'uncaught', text: 'http://localhost:60021/api/stale due to access control checks.' }]).length, 1);
  /* AND A WORKER THAT LOADED AND WAS WRONG IS RED. */
  assert.equal(said(CLEAN, [{ kind: 'uncaught', text: 'A bad HTTP response code (404) was received when fetching the script.' }]).length, 1);
  assert.equal(said(CLEAN, [{ kind: 'uncaught', text: 'SyntaxError: Unexpected token in service-worker.js' }]).length, 1);
});

/* ── the planted trees, as the self-test runs them ── */

const trees = readdirSync(join(GATES, 'negative')).filter((n) => n.startsWith('printed-'));

test('every printed rule has a planted tree', () => {
  assert.ok(trees.length >= OWN.length + 3 + 2, `only ${trees.length} trees`);
});

for (const tree of trees) {
  test(`${tree} is red, names its screen as many times as its case says, and says what it expects`, () => {
    const dir = join(GATES, 'negative', tree);
    const c = JSON.parse(readFileSync(join(dir, 'case.json'), 'utf8'));
    const seeded = readFileSync(join(dir, 'expect.txt'), 'utf8').trim();
    assert.equal(c.gate, 'printed');
    const r = spawnSync(process.execPath, [join(GATES, 'printed.mjs')], { cwd: dir, encoding: 'utf8', env: { ...process.env, BRAINDOG_GATE_ROOT: dir } });
    const out = `${r.stdout}${r.stderr}`;
    assert.equal(r.status, 1, out);
    assert.match(out, new RegExp(c.expect, 'iu'));
    const lines = out.split('\n').filter((l) => l.includes(seeded));
    assert.equal(lines.length, c.findings, out);
    if (c.total !== undefined) assert.match(out, new RegExp(`${c.total} finding\\(s\\)`, 'u'));
  });
}
