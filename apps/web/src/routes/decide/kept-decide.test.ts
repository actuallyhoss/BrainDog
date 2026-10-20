/** `kept-decide.ts`: Decide's kept page says where its questions are, or nothing when a block over them is not a queue. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { QUESTIONS } from '../../lib/data/local.ts';
import { decideSpots } from './kept-decide.ts';

const page = (blocks: unknown[]) => ({ page: { blocks: blocks as never[] } });

test('ONE SPOT A QUEUE, its total and its waiting counts beside it; what was decided marks every one', () => {
  const spots = decideSpots(page([{ kind: 'note' }, { kind: 'queue', source: 'governance.open', queue: [] }, { kind: 'list', source: 'governance.decided' }]));
  assert.deepEqual(spots, [
    {
      list: QUESTIONS,
      at: ['got', 'page', 'blocks', 1, 'queue'],
      by: null,
      questions: { total: ['got', 'page', 'blocks', 1, 'total'], decided: true, drops: [['got', 'page', 'blocks', 1, 'waiting']] },
    },
  ]);
  assert.equal(decideSpots(page([{ kind: 'queue', source: 'governance.later', queue: [] }]))[0]?.questions?.decided, false);
});

test('A BLOCK OVER THE QUESTIONS THAT IS NOT A QUEUE leaves no spots, so every line about them drops the page', () => {
  assert.deepEqual(decideSpots(page([{ kind: 'queue', source: 'governance.open', queue: [] }, { kind: 'figure', source: 'governance.count' }])), []);
});
