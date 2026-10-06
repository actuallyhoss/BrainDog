/**
 * What a question card says without a DOM (`queue-answer.ts`): here, the one quiet line a question put off carries.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { laterLine, queueMergeOf } from './queue-answer.ts';

const now = Date.parse('2026-10-02T09:00:00Z');

test('A QUESTION PUT OFF SAYS WHEN IT COMES BACK, and why, and any other question says nothing', () => {
  const soon = laterLine({ until: '2026-10-05', until_why: 'Until the quote lands' }, now);
  assert.ok(soon?.startsWith('Comes back '), soon ?? 'no line');
  assert.ok(soon?.endsWith(' · Until the quote lands'), soon ?? 'no line');
  assert.equal(soon, 'Comes back in 3d · Until the quote lands', 'inside a week the day is said relative to today');

  assert.equal(laterLine({ until: '2026-11-20', until_why: '' }, now), 'Comes back on 20 Nov');
  assert.equal(laterLine({ until: '2026-11-20', until_why: '  ' }, now), 'Comes back on 20 Nov', 'a blank why is no why');
  assert.equal(laterLine({}, now), null, 'an open question carries no day');
  assert.equal(laterLine({ until: 'someday' }, now), null, 'a day that does not read draws no line');
});

test("THE RECORD'S OWN WHO-IS-WHO QUESTION IS DRAWN AS A MERGE ON THE QUEUE, and a rowset that is some other change is not", () => {
  const candidates = [
    { at: 'people#3', name: 'Rohan Mehta', seen: ['Encore'] },
    { at: 'people#1', name: 'Rohan', seen: [], kept: true },
    { at: 'people#7', name: 'people#7', seen: ['/Users/x/repo', 'GitHub'] },
  ];
  const merge = queueMergeOf({ kind: 'rowset', body_kind: 'rowset', candidates, held: 3 }, ['accept', 'reject']);
  assert.ok(merge, 'a cluster question from people.ts drew the two plain answers');
  assert.deepEqual(
    merge.candidates.map((c) => [c.key, c.name, c.kept, c.pick]),
    [
      ['people#1', 'Rohan', true, null],
      ['people#3', 'Rohan Mehta', false, null],
      ['people#7', '', false, null],
    ],
    'the kept one first, a handle never drawn as a name, and no Pick on a rowset',
  );
  assert.deepEqual(merge.candidates[2]?.seen, ['GitHub'], 'a file path is no place a person was seen');
  assert.deepEqual([merge.all, merge.apart], [{ option: 'accept' }, { option: 'reject' }]);

  assert.equal(queueMergeOf({ kind: 'rowset', candidates, held: 2 }, ['accept', 'reject'])?.all.option, 'accept', 'folds only, no patch on the kept row');
  assert.equal(queueMergeOf({ kind: 'rowset', candidates, held: 9 }, ['accept', 'reject']), null, 'nine changes is not a merge of three');
  assert.equal(queueMergeOf({ kind: 'rowset', candidates: candidates.map((c) => ({ ...c, kept: undefined })), held: 3 }, ['accept', 'reject']), null, 'none kept');
  assert.equal(queueMergeOf({ kind: 'rowset', held: 3 }, ['accept', 'reject']), null, 'a record that sends no candidates');
  assert.equal(queueMergeOf({ kind: 'patch', candidates, held: 3 }, ['accept', 'reject']), null);
});

test('A QUESTION OF OPTIONS OVER A CLUSTER IS READ AS ITS OWN PAGE READS IT', () => {
  const candidates = [
    { at: 'a', name: 'Ana', seen: [] },
    { at: 'b', name: 'Ana B', seen: [] },
  ];
  const merge = queueMergeOf({ kind: 'options', candidates }, ['merge', 'apart', 'pick:a']);
  assert.deepEqual([merge?.all.option, merge?.apart.option, merge?.candidates[0]?.pick?.option], ['merge', 'apart', 'pick:a']);
  assert.equal(queueMergeOf({ kind: 'options', candidates }, ['yes', 'no']), null, 'no Merge all among its answers');
});
