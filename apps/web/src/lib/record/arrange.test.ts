/**
 * The arrange arithmetic, and the seed.
 *
 * `apps/web` has had a `test` script since the app existed. It ran `node --test src/**\/*.test.ts`
 * over a directory containing no test files, reported `pass 0 · fail 0`, and exited zero — a green
 * tick in CI standing over nothing. This is the first thing it actually runs.
 *
 * What is checked is what would be silently wrong: the list operations behind every drag, the width
 * floor per kind, and the fact that a seeded block comes out bound rather than blank. The reactive
 * class around them is four lines of assignment and is not worth a compiler.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { differs, moveAt, removeAt, setSpanAt, spanLabel, spanOf, stepsFor, type Slot } from './arrange.ts';
import { BINDABLE, seedBlock } from './seed.ts';
import { REGISTERS } from './data.ts';

const slots = (...spans: number[]): Slot[] => spans.map((span, i) => ({ i, span }));
const order = (s: Slot[]) => s.map((x) => x.i);

/* ── moving ───────────────────────────────────────────────────────────────── */

test('a move is a splice, and the rest keep their order', () => {
  const s = slots(12, 6, 6, 4);
  assert.deepEqual(order(moveAt(s, 0, 2)), [1, 2, 0, 3]);
  assert.deepEqual(order(moveAt(s, 3, 0)), [3, 0, 1, 2]);
});

test('a move carries the span with the block', () => {
  // The bug this catches: splicing an index list rather than the slots, so blocks change width
  // when they change place.
  const moved = moveAt(slots(12, 5, 7), 1, 0);
  assert.deepEqual(moved.map((x) => x.span), [5, 12, 7]);
});

test('a drag past the end lands last rather than doing nothing', () => {
  // Clamped, not refused: a pointer released below the last block means "put it last", and a
  // no-op there is a drag that silently fails.
  assert.deepEqual(order(moveAt(slots(12, 6, 6), 0, 99)), [1, 2, 0]);
  assert.deepEqual(order(moveAt(slots(12, 6, 6), 2, -5)), [2, 0, 1]);
});

test('moving a block onto itself changes nothing', () => {
  const s = slots(12, 6);
  assert.deepEqual(moveAt(s, 1, 1), s);
});

test('an out-of-range source is ignored, not thrown', () => {
  assert.deepEqual(order(moveAt(slots(12), 4, 0)), [0]);
});

/* ── resizing and removing ────────────────────────────────────────────────── */

test('setting a span touches one slot', () => {
  const next = setSpanAt(slots(12, 12, 12), 1, 6);
  assert.deepEqual(next.map((x) => x.span), [12, 6, 12]);
});

test('removing shortens the list and keeps declared indices', () => {
  assert.deepEqual(order(removeAt(slots(12, 6, 6), 1)), [0, 2]);
});

test('`differs` sees a reorder, a resize and a removal', () => {
  const base = slots(12, 6);
  assert.equal(differs(base, base), false);
  assert.equal(differs(base, moveAt(base, 0, 1)), true);
  assert.equal(differs(base, setSpanAt(base, 0, 6)), true);
  assert.equal(differs(base, removeAt(base, 0)), true);
});

/* ── the width floor, which is 13 §4.1 made enforceable ───────────────────── */

test('a kind with internal columns is never offered a third', () => {
  // A `table` at span 4 is eight columns in a third of a page: not a narrow table, an unreadable
  // one. The control REFUSES rather than clamping, so the button is absent.
  assert.deepEqual(stepsFor('table'), [12, 6]);
  assert.deepEqual(stepsFor('board'), [12, 6]);
  assert.deepEqual(stepsFor('comparison'), [12, 6]);
});

test('a short drawn kind is offered every step', () => {
  assert.deepEqual(stepsFor('chips'), [12, 6, 4]);
  assert.deepEqual(stepsFor('todo'), [12, 6, 4]);
});

test('an unknown kind gets the conservative floor rather than throwing', () => {
  // A pack a stranger wrote may name a kind this build has never heard of. The rail is not allowed
  // to fail to render because of it.
  assert.deepEqual(stepsFor('some-pack-kind'), [12, 6, 4]);
});

test('a declared span is clamped up to the kind floor, never down past 12', () => {
  assert.equal(spanOf('table', 2), 6);
  assert.equal(spanOf('table', 8), 8);
  assert.equal(spanOf('todo', 99), 12);
  assert.equal(spanOf('note', undefined), 12);
});

test('precise widths keep their own number instead of rounding to a button', () => {
  assert.equal(spanLabel(12), 'Full');
  assert.equal(spanLabel(6), 'Half');
  assert.equal(spanLabel(4), 'Third');
  assert.equal(spanLabel(5), '5/12');
});

/* ── seeding, which is 21 A5 ──────────────────────────────────────────────── */

test('every bindable kind seeds against every register without throwing', () => {
  for (const kind of BINDABLE)
    for (const register of Object.keys(REGISTERS))
      assert.ok(seedBlock(kind, register), `${kind} over ${register} produced nothing`);
});

test('a seed arrives bound, not blank', () => {
  const seed = seedBlock('todo', 'tasks');
  assert.equal(seed?.source, 'register.tasks');
  assert.ok((seed?.columns?.length ?? 0) > 0, 'a seeded block with no columns draws nothing');
  // Mandatory on every source-bound block (06 §1.1), and it renders on day one.
  assert.ok(seed?.empty, 'a source-bound block without an empty state is a dead end on day one');
});

test('a seed fills its cells by type and never reuses a field', () => {
  // 21 §3.4's rule one step earlier: a non-programmer cannot put text in a number slot because it
  // is not offered. Filling by type is why the seed is right rather than merely present.
  const bar = seedBlock('bar', 'obligations');
  const fields = bar?.columns?.map((c) => c.field) ?? [];
  assert.equal(new Set(fields).size, fields.length, 'a field was used in two cells');

  const timeline = seedBlock('timeline', 'services');
  assert.equal(timeline?.columns?.[0]?.field, 'renews', 'a timeline should lead with a date');
});

test('a seed starts at its kind floor, not full width', () => {
  // The common correction becomes "make it wider", which is the direction the control is better at.
  assert.equal(seedBlock('todo', 'tasks')?.span, 3);
  assert.equal(seedBlock('table', 'tasks')?.span, 6);
});

test('a secret field is never seeded into a block', () => {
  // A credential never goes in a row, so it never goes in a projection of one either.
  for (const register of Object.keys(REGISTERS)) {
    const secrets = new Set(
      (REGISTERS[register]?.fields ?? []).filter((f) => f.type === 'secret').map((f) => f.id),
    );
    if (secrets.size === 0) continue;
    for (const kind of BINDABLE)
      for (const column of seedBlock(kind, register)?.columns ?? [])
        assert.ok(!secrets.has(column.field), `${kind} over ${register} seeded the secret ${column.field}`);
  }
});

test('an unknown register or kind seeds nothing rather than half a block', () => {
  assert.equal(seedBlock('todo', 'nope'), null);
  assert.equal(seedBlock('nope', 'tasks'), null);
});
