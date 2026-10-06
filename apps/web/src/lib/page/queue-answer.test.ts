/**
 * What a question card says without a DOM (`queue-answer.ts`): here, the one quiet line a question put off carries.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { COMPACT_MOST, compactOf, laterLine, queueMergeOf, queueWords, waysOf } from './queue-answer.ts';

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

test('AN ANSWER, ITS REASON AND WHY A QUESTION WAS PUT OFF CARRY NO ADDRESS OR ID (audit 21 #4)', () => {
  const ways = waysOf({
    options: [
      { key: 'merge', label: 'Merge into rohan@x.com', because: 'Seen at https://github.com/x/y as 01ARZ3NDEKTSV4RRFFQ69G5FAV', recommended: true },
      { key: 'pick', label: 'tasks#8', because: '', recommended: false },
    ],
  });
  assert.deepEqual(
    ways.map((w) => [w.label, w.because]),
    [
      ['Merge into someone', 'Seen at github.com'],
      ['Answer 2', ''],
    ],
  );
  assert.equal(laterLine({ until: '2026-10-05', until_why: 'Waiting on ~/Developer/quotes.pdf from jo@x.io' }, now), 'Comes back in 3d · Waiting from someone');
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

test("THE RECORD'S OWN MERGE ON A ROWSET IS READ AS ITS OPTIONS: Merge all, Keep apart and a Pick for each one folded", () => {
  const merge = {
    candidates: [
      { name: 'Rohan Mehta', row: 'people#1', keeps: true, org: 'Encore', seen: ['3 commits in encore', 'mail'], known_by: ['email'], rows: [] },
      { name: 'rohanm', row: 'people#4', keeps: false, org: null, seen: ['a commit in portage'], known_by: ['github'], rows: [0] },
      { name: '', row: 'people#7', keeps: false, org: null, seen: [], known_by: [], rows: [1] },
    ],
    options: [
      { option: 'merge', says: 'Merge all', decide: { option: 'merge' } },
      { option: 'apart', says: 'Keep apart', decide: { option: 'apart' } },
      { option: 'pick:people#4', says: 'Pick rohanm', decide: { option: 'pick:people#4' } },
      { option: 'pick:people#7', says: 'Pick this one', decide: { option: 'pick:people#7' } },
    ],
  };
  const read = queueMergeOf({ kind: 'rowset', body_kind: 'rowset', held: 3, merge }, ['accept', 'reject']);
  assert.ok(read, 'a rowset carrying the record’s merge is a merge');
  assert.deepEqual([read.all.option, read.apart.option], ['merge', 'apart'], 'the record’s own answers, not Accept and Decline');
  assert.deepEqual(
    read.candidates.map((c) => [c.key, c.name, c.kept, c.pick?.option ?? null]),
    [
      ['people#1', 'Rohan Mehta', true, null],
      ['people#4', 'rohanm', false, 'pick:people#4'],
      ['people#7', '', false, 'pick:people#7'],
    ],
    'the kept one first and one Pick for each one folded',
  );
  assert.deepEqual(read.candidates[0]?.seen, ['3 commits in encore', 'mail'], 'where they were seen stays newest first');

  const two = { candidates: merge.candidates.slice(0, 2), options: merge.options.slice(0, 2) };
  assert.deepEqual(
    queueMergeOf({ kind: 'rowset', merge: two }, ['accept', 'reject'])?.candidates.map((c) => c.pick),
    [null, null],
    'two names have no Pick, since picking the one folded is Merge all',
  );
  assert.equal(queueMergeOf({ kind: 'rowset', merge: { candidates: merge.candidates, options: [{ says: 'Merge all' }] } }, ['accept', 'reject']), null, 'an option with no key is no merge');
  assert.equal(queueMergeOf({ kind: 'rowset', merge: { candidates: [{ name: 'Ana' }, { name: 'Ana B' }], options: merge.options } }, ['accept', 'reject']), null, 'a candidate with no handle is no merge');
});

test('A QUEUE OUTSIDE DECIDE SHOWS AT MOST THREE, and says how many more wait there', () => {
  assert.equal(COMPACT_MOST, 3);
  assert.deepEqual(compactOf(['a', 'b'], 2), { shown: ['a', 'b'], more: 0 });
  assert.deepEqual(compactOf(['a', 'b', 'c', 'd', 'e'], 5), { shown: ['a', 'b', 'c'], more: 2 });
  /* THE BLOCK'S COUNT OF WHAT IS OPEN may be more than it was handed, and is never read as less. */
  assert.deepEqual(compactOf(['a', 'b', 'c', 'd'], 9), { shown: ['a', 'b', 'c'], more: 6 });
  assert.deepEqual(compactOf(['a', 'b', 'c', 'd'], 1), { shown: ['a', 'b', 'c'], more: 1 });
  assert.equal(queueWords.moreOnDecide(5), '5 more on Decide');
  assert.equal(queueWords.moreOnDecide(1200), '1,200 more on Decide');
  for (const line of [queueWords.choose, queueWords.moreOnDecide(2), queueWords.hard('Chase it'), queueWords.suggestedSaid]) assert.doesNotMatch(line, /—|\b(row|rows|entity|list item)\b/iu);
});
