/**
 * THE LAYOUT GATE'S PLANTED FAULTS, ASKED WITHOUT LAUNCHING A BROWSER (PRF-B02 job 2).
 *
 *   node --test tools/gates/test/layout-seeds.test.mjs
 *
 * `layout.mjs` names each of its rules and the fault it is proved on in `RULES`, and `self-test` sends those names back
 * in `BRAINDOG_GATE_SEED`. Whether each seed is caught needs a browser over a build and is the self-test's to say. What
 * can be held here is the list itself: that every name is its own, so a red line tagged with one cannot be credited to
 * another, that the seven the scope names are all there, and that a name nothing answers to is refused before a port
 * is taken rather than run as a green real run under a name that promised a red one.
 *
 * IMPORTING THE GATE RUNS NOTHING: its work is inside the default-exported function.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import layout, { RULES, seedsOf } from '../layout.mjs';

test('every seed has a name of its own, a fault in words and the words its red line holds', () => {
  const ids = RULES.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, `a seed name used twice: ${ids.join(', ')}`);
  for (const r of RULES) {
    assert.match(r.id, /^layout-[a-z-]+$/u, `${r.id} is not named for its gate`);
    assert.ok(typeof r.seed === 'string' && r.seed.length > 0, `${r.id} says nothing of its fault`);
    assert.ok([r.expect].flat().length > 0 && [r.expect].flat().every((e) => typeof e === 'string' && e), `${r.id} has no words to be caught by`);
    assert.ok(r.passes.length > 0 && r.passes.every((p) => ['sweep', 'full', 'dock', 'variant'].includes(p)), `${r.id} is planted nowhere`);
  }
});

test('the seven seeds the scope names are all there', () => {
  assert.deepEqual(
    RULES.map((r) => r.id).sort(),
    ['layout-dock', 'layout-full', 'layout-overflow', 'layout-settle', 'layout-site', 'layout-target', 'layout-target-edge'],
  );
});

test('a real run plants nothing, and a list of names plants those', () => {
  assert.equal(seedsOf(undefined), null);
  assert.equal(seedsOf(''), null);
  assert.deepEqual(
    seedsOf('layout-target, layout-full').map((r) => r.id),
    ['layout-target', 'layout-full'],
  );
  assert.deepEqual(
    seedsOf(RULES.map((r) => r.id).join(',')).map((r) => r.id),
    RULES.map((r) => r.id),
  );
});

test("'1', what the self-test sends today, is the overflow seed", () => {
  assert.deepEqual(
    seedsOf('1').map((r) => r.id),
    ['layout-overflow'],
  );
  assert.deepEqual(
    seedsOf('1,layout-overflow').map((r) => r.id),
    ['layout-overflow'],
  );
});

test('a seed nothing answers to is refused, and named', () => {
  assert.throws(() => seedsOf('layout-nope'), /no seed is called "layout-nope"/u);
  assert.throws(() => seedsOf('layout-target,intent'), /"intent"/u);
  assert.throws(() => seedsOf(','), /no seed is called/u);
});

test('the gate refuses an unknown seed, red, before it reads a route or opens a browser', async () => {
  /* AN EMPTY ROOT: had the gate gone past the refusal it would have read routes from a tree with none, and said so. */
  const root = mkdtempSync(join(tmpdir(), 'layout-seeds-'));
  const was = process.env.BRAINDOG_GATE_SEED;
  const said = [];
  const error = console.error;
  console.error = (...a) => said.push(a.join(' '));
  try {
    process.env.BRAINDOG_GATE_SEED = 'layout-nope';
    assert.equal(await layout(root), 1);
  } finally {
    console.error = error;
    if (was === undefined) delete process.env.BRAINDOG_GATE_SEED;
    else process.env.BRAINDOG_GATE_SEED = was;
    rmSync(root, { recursive: true, force: true });
  }
  assert.equal(said.length, 1);
  assert.match(said[0], /no seed is called "layout-nope"\. The seeds are layout-overflow,/u);
});
