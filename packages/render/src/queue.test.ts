/**
 * `queue`'s two answers: what is wrong with its rows, and what its rows say.
 *
 * The drawers are held to the tree in `parity.test.ts`. What is here is the decision underneath them,
 * which is the part a person can get wrong while both renderers agree perfectly about the wrong thing.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { QUEUE_CLEARED, queueFault, queueMore, queuePlan } from './queue.ts';

const rows = (...lines: string[][]) => lines.map((cells) => ({ cells }));

test('a question and its options come back together, in the order they were written', () => {
  const plan = queuePlan(
    rows(
      ['q', 's1', 'Claude', '3h ago', 'Raise the retainer?', 'Kiln has run over for two months.'],
      ['opt', 's1', 'raise', 'Raise it', 'Covers the overrun', 'true'],
      ['opt', 's1', 'leave', 'Leave it', '', ''],
      ['q', 's2', 'Late fees', '1d ago', 'Chase 2026-049?', ''],
      ['opt', 's2', 'accept', 'Chase it', '', ''],
      ['opt', 's2', 'reject', 'Leave it', '', ''],
    ),
  );
  assert.deepEqual(
    plan.items.map((i) => [i.id, i.who, i.question, i.why, i.options.map((o) => o.key)]),
    [
      ['s1', 'Claude', 'Raise the retainer?', 'Kiln has run over for two months.', ['raise', 'leave']],
      ['s2', 'Late fees', 'Chase 2026-049?', '', ['accept', 'reject']],
    ],
  );
});

/* THE RECOMMENDATION IS A FLAG AND NOTHING MORE. Nothing in the plan says "chosen", because the moment
   one option arrives chosen the question has been answered by whoever wrote the row. */
test('the recommended option is marked and no option is selected', () => {
  const plan = queuePlan(rows(['q', 's1', 'Claude', 'now', 'Which?', ''], ['opt', 's1', 'a', 'A', '', 'true'], ['opt', 's1', 'b', 'B', '', '']));
  assert.deepEqual(
    plan.items[0]?.options.map((o) => o.recommended),
    [true, false],
  );
  assert.ok(!Object.keys(plan.items[0]?.options[0] ?? {}).includes('selected'));
});

test('an option with no label is known by its key, so a way to answer is never nameless', () => {
  const plan = queuePlan(rows(['q', 's1', 'Claude', 'now', 'Which?', ''], ['opt', 's1', 'accept', '', '', '']));
  assert.equal(plan.items[0]?.options[0]?.label, 'accept');
});

test('an empty queue says so, and the sentence is the package’s own', () => {
  const plan = queuePlan(rows());
  assert.deepEqual(plan.items, []);
  assert.equal(plan.empty, QUEUE_CLEARED);
});

test('what is left is a count, and what is left of nothing is nothing', () => {
  assert.equal(queuePlan(rows(['q', 's1', 'a', 'now', 'Q', ''], ['opt', 's1', 'a', 'A', '', ''], ['more', '4'])).more, 4);
  assert.equal(queuePlan(rows(['q', 's1', 'a', 'now', 'Q', ''], ['opt', 's1', 'a', 'A', '', ''])).more, 0);
  assert.equal(queueMore(4), '4 more');
});

/* A ROW THE PLAN DROPS IS A ROW THE FAULT NAMES. `queuePlan` is lenient because `Block` is a public
   type a host builds by hand; `queueFault` is what makes the leniency visible instead of silent. */
test('an option before any question is a fault, and is left out rather than thrown', () => {
  assert.match(queueFault([['opt', 's1', 'a', 'A', '', '']]) ?? '', /before any question/);
  assert.deepEqual(queuePlan(rows(['opt', 's1', 'a', 'A', '', ''])).items, []);
});

test('a question with no way to answer it is a fault, wherever it sits', () => {
  assert.match(queueFault([['q', 's1', 'a', 'now', 'Q', '']]) ?? '', /no way to answer/);
  assert.match(queueFault([['q', 's1', 'a', 'now', 'Q', ''], ['q', 's2', 'a', 'now', 'Q2', ''], ['opt', 's2', 'a', 'A', '', '']]) ?? '', /no way to answer/);
});

test('a row under no kind is named, and so is a count that is not one', () => {
  assert.match(queueFault([['note', 'x']]) ?? '', /"note"/);
  assert.match(queueFault([['more', 'soon']]) ?? '', /whole number/);
});

test('the count of what is left is the last row there is', () => {
  const fault = queueFault([['more', '2'], ['q', 's1', 'a', 'now', 'Q', ''], ['opt', 's1', 'a', 'A', '', '']]);
  assert.match(fault ?? '', /after the count/);
});

test('a well-formed queue has no fault', () => {
  assert.equal(
    queueFault([
      ['q', 's1', 'Claude', 'now', 'Q', 'why'],
      ['opt', 's1', 'a', 'A', 'because', 'true'],
      ['opt', 's1', 'b', 'B', '', ''],
      ['more', '3'],
    ]),
    null,
  );
});
