/**
 * Why a block is blank, which is the half the product never said.
 *
 * `empty:` reached the screen for `table` and for nothing else, so fifteen of the sixteen kinds drew
 * a heading over a blank rectangle. Three different things look identical when they are drawn that
 * way — the filter was not understood, the declaration contradicts itself, and the honest answer was
 * nothing — and only the third is not a fault. A reader who cannot tell them apart learns to
 * distrust every empty block on the page, including the ones that are right.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { draw } from './blocks.ts';
import { page } from './api.ts';
import { KINDS } from 'braindog-render';
import type { BlockResult } from './api.ts';

/**
 * A block bound to a register, with whatever the test wants to change about it.
 *
 * `drop` rather than passing `undefined`: under `exactOptionalPropertyTypes` an optional property
 * set to `undefined` is not the same as an absent one, and it is the absent one being tested.
 */
const bound = (over: Partial<BlockResult> = {}, drop: (keyof BlockResult)[] = []): BlockResult => {
  // A table bound to a REGISTER: the money page's first one is the cash walk, which is bound to the
  // forecast and carries no register at all.
  const block = page('money')?.blocks.find((b) => b.kind === 'table' && b.register);
  assert.ok(block, 'the money page has no register-bound table to build on');
  const merged = { ...block, ...over } as Record<string, unknown>;
  for (const key of drop) delete merged[key as string];
  return merged as BlockResult;
};

/* ── a filter that was not understood ────────────────────────────────────── */

test('A BLOCK THAT COULD NOT READ ITS FILTER SAYS SO, AND QUOTES THE CLAUSE', () => {
  // `compile()` has always produced the sentence. Nothing carried it to the screen, so an agent
  // wrote `state is not done` against a register with no `done`, got a page that rendered, and had
  // no way to find out that every figure on it was about no rows at all.
  const { refusal } = draw(bound({ where: 'state is not done', refusals: ['state is not done — state has no value done'] }));
  assert.ok(refusal);
  assert.equal(refusal.kind, 'error', 'a broken filter is not the same state as an empty answer');
  assert.deepEqual(refusal.lines, ['state is not done — state has no value done']);
});

test('several bad clauses are several lines, because they are separate facts', () => {
  const { refusal } = draw(bound({ refusals: ['a — one', 'b — two'] }));
  assert.equal(refusal?.lines?.length, 2);
});

test('a filter that WAS understood and matched nothing is not an error', () => {
  const { refusal } = draw(bound({ rows: [], entries: [], matched: [], refusals: [], empty: 'You owe nobody anything.' }));
  assert.ok(refusal);
  assert.equal(refusal.kind, 'no-results');
  assert.equal(refusal.title, 'You owe nobody anything.', "the author's own sentence is the right words");
});

test('and a block with no `empty:` still says something rather than nothing', () => {
  const { refusal } = draw(bound({ rows: [], entries: [], matched: [], refusals: [] }, ['empty']));
  assert.ok(refusal?.title);
});

/* ── the contradiction ───────────────────────────────────────────────────── */

test('a source AND authored rows is refused out loud, not resolved quietly', () => {
  const { refusal, segments } = draw(bound({ authored: [{ cells: ['a', 'b'] }] }));
  assert.equal(refusal?.kind, 'error');
  assert.equal(segments.length, 0);
  assert.match(refusal?.body ?? '', /source|authored/);
});

/* ── all sixteen, not one ────────────────────────────────────────────────── */

test('EVERY KIND GETS THE SURFACE, which is the whole defect', () => {
  // `table` had it. The other fifteen drew a heading and a blank rectangle.
  for (const kind of Object.keys(KINDS)) {
    const { refusal } = draw(
      bound({ kind, rows: [], entries: [], matched: [], refusals: [], empty: 'Nothing matched.' }, ['authored', 'body', 'metrics']),
    );
    assert.ok(refusal, `${kind} drew nothing and said nothing`);
    assert.equal(refusal.kind, 'no-results', `${kind} reported an empty answer as a fault`);
  }
});

test('a block that HAS something to draw refuses nothing', () => {
  for (const block of page('money')?.blocks ?? []) {
    const { refusal, segments } = draw(block);
    if (refusal) continue;
    const drawn = block.kind === 'table' ? block.rows.length : segments.some((s) => s.type !== 'block' || s.rows.length > 0);
    assert.ok(drawn, `${block.heading} drew nothing and reported no reason`);
  }
});

test('the seeded pages refuse nothing at all, so no page ships a broken declaration', () => {
  for (const slug of ['money', 'estate', 'kiln']) {
    for (const block of page(slug)?.blocks ?? []) {
      assert.deepEqual(block.refusals, [], `${slug}: ${block.heading} has a filter the evaluator cannot read`);
      assert.notEqual(draw(block).refusal?.kind, 'error', `${slug}: ${block.heading} is a broken declaration`);
    }
  }
});
