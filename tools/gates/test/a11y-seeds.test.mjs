/**
 * THE ACCESSIBILITY GATE'S PLANTED FAULTS, ASKED WITHOUT LAUNCHING A BROWSER.
 *
 *   node --test tools/gates/test/a11y-seeds.test.mjs
 *
 * `self-test` proves each rule in `RULES` goes red by running the gate with its seed, and that run
 * needs a browser and a build. What can be asked for nothing is whether the list itself is sound: an id
 * twice would make two rules one line, two plants printing one mark would let one rule's red stand for
 * another's, and a seed the gate does not know must be refused rather than plant nothing and pass.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import a11y, { RULES, seedsOf } from '../a11y.mjs';

test('every rule has an id, its fault in words and what its red must print', () => {
  assert.ok(RULES.length >= 4, 'contrast, state, site and intent');
  for (const r of RULES) {
    assert.match(r.id, /^a11y-[a-z]+$/u);
    assert.ok(r.seed.length > 0, `${r.id} says its fault in words`);
    assert.ok(r.expect.length > 0 && r.expect.every((e) => e.length > 0), `${r.id} names what its red must print`);
  }
});

test('no two rules share an id, and no two plants print the same mark', () => {
  assert.equal(new Set(RULES.map((r) => r.id)).size, RULES.length);
  const marks = RULES.map((r) => r.expect.at(-1));
  assert.equal(new Set(marks).size, RULES.length, `each plant names its own element: ${marks.join(', ')}`);
});

test('the three planted faults the scope names are there, and intent stays a fourth', () => {
  const ids = RULES.map((r) => r.id);
  for (const id of ['a11y-contrast', 'a11y-state', 'a11y-site', 'a11y-intent']) assert.ok(ids.includes(id), id);
});

test('a real run plants nothing, and one seed or all of them are read as asked', () => {
  assert.equal(seedsOf(undefined), null);
  assert.equal(seedsOf(''), null);
  assert.deepEqual(seedsOf('a11y-state').map((r) => r.id), ['a11y-state']);
  assert.deepEqual(seedsOf(RULES.map((r) => r.id).join(',')), RULES);
});

test("'intent', the seed self-test sends today, is still a11y-intent", () => {
  assert.deepEqual(seedsOf('intent').map((r) => r.id), ['a11y-intent']);
});

test('a seed no rule declares is refused, naming it, even beside one that is known', () => {
  assert.throws(() => seedsOf('a11y-nope'), /no seed is called "a11y-nope"/u);
  assert.throws(() => seedsOf('a11y-intent, a11y-nope'), /"a11y-nope"/u);
  assert.throws(() => seedsOf(' , '), /no seed is called/u);
});

test('the gate refuses an unknown seed before it derives a route or launches a browser', async (t) => {
  const was = process.env.BRAINDOG_GATE_SEED;
  process.env.BRAINDOG_GATE_SEED = 'a11y-nope';
  const said = [];
  t.mock.method(console, 'error', (line) => said.push(String(line)));
  try {
    /* A root with nothing in it: a gate that got past the refusal would throw reading its routes. */
    assert.equal(await a11y('/nonexistent-braindog-root'), 1);
  } finally {
    if (was === undefined) delete process.env.BRAINDOG_GATE_SEED;
    else process.env.BRAINDOG_GATE_SEED = was;
  }
  assert.match(said.join('\n'), /no seed is called "a11y-nope"/u);
});
