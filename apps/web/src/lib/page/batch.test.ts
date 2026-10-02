/**
 * Several questions on a page answered at once (`batch.ts`): each with what it suggests, the ones that suggest nothing
 * left for their own press, and an arrangement never in the batch.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { batchOf, suggestedOf } from './batch.ts';

const option = (key: string, recommended = false) => ({ key, label: key, because: '', recommended });
const q = (id: string, kind: string, options: ReturnType<typeof option>[], body_kind?: string) => ({ id, kind, options, ...(body_kind ? { body_kind } : {}) });

test('A QUESTION IS ANSWERED WITH ITS SUGGESTION, or a change with accepting it', () => {
  assert.equal(suggestedOf({ options: [option('chase'), option('wait', true)] }), 'wait');
  assert.equal(suggestedOf({ options: [] }), 'accept', 'a change with no options of its own is accepted or rejected');
  assert.equal(suggestedOf({ options: [option('accept'), option('reject')] }), 'accept');
  assert.equal(suggestedOf({ options: [option('red'), option('blue')] }), null, 'a choice with nothing suggested is the reader’s');
});

test('ONE PRESS ANSWERS WHAT IT CAN, AND AN ARRANGEMENT IS NEVER AMONG THEM', () => {
  const plan = batchOf([
    q('SG1', 'change', []),
    q('SG2', 'options', [option('red'), option('blue')]),
    q('SG3', 'arrange', []),
    q('SG4', 'change', [], 'pack'),
    q('SG5', 'options', [option('now', true)]),
  ]);
  assert.deepEqual(
    plan.answers.map((a) => [a.q.id, a.option]),
    [
      ['SG1', 'accept'],
      ['SG5', 'now'],
    ],
  );
  assert.equal(plan.heldBack, true, 'the arrangement and the pack are left for their own reading');
  assert.equal(plan.unsuggested, true);
  assert.deepEqual(batchOf([q('SG1', 'change', [])]), { answers: [{ q: q('SG1', 'change', []), option: 'accept' }], heldBack: false, unsuggested: false });
});
