/**
 * A MERGE, READ AS ONE QUESTION ABOUT WHO IS WHO (`merge.ts`): the record's rowset that folds rows into the one it keeps,
 * and a cluster asked as a question of options, each drawn as the names, where each was seen, and Merge all, Keep apart
 * and, where the record offers it, Pick.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { keptName, mergeOf, seenOf, SEEN_MOST, words } from './merge.ts';

const TWO = ['accept', 'reject'];

/** The rowset `kernel/people.ts` `nearMatch` files for two people who share a name. */
const pair = {
  register: 'people',
  rows: [
    { at: 'people#1', version: 3, patch: { handles: ['rohanmehta'], met: ['2026-09-20 · commit 4464966 in braindog', '2026-10-01 · mail from encore.example'] } },
    { at: 'people#4', version: 1, patch: { merged_into: 'people#1', deleted_at: '2026-10-06T10:00:00.000Z' } },
  ],
};
const held = [
  { seq: 1, fields: { name: 'Rohan Mehta', met: ['2026-09-20 · commit 4464966 in braindog'] } },
  { seq: 4, fields: { name: 'rohanmehta', met: ['2026-09-30 · agent run S740', '2026-10-01 · mail from encore.example', '2026-10-02 · /Users/sam/Developer/encore'] } },
];

test('the record’s merge is drawn as the names, where each was seen, and Merge all and Keep apart', () => {
  const m = mergeOf({ kind: 'rowset', body: pair }, TWO, held);
  assert.ok(m);
  assert.deepEqual(
    m.candidates.map((c) => [c.name, c.kept, c.seen]),
    [
      ['Rohan Mehta', true, ['commit 4464966 in braindog']],
      /* NEWEST FIRST, WITHOUT THE DAY, AND NEVER A FILE PATH. */
      ['rohanmehta', false, ['mail from encore.example', 'agent run S740']],
    ],
  );
  assert.deepEqual(m.all, { option: 'accept' });
  assert.deepEqual(m.apart, { option: 'reject' });
  /* A ROWSET IS ANSWERED WHOLE: its patch on the kept person carries every folded one's addresses at once. */
  assert.ok(m.candidates.every((c) => c.pick === null));
  assert.equal(keptName(m), 'Rohan Mehta');
});

test('a name is never a handle: a row the record would not give back is the one already here', () => {
  const m = mergeOf({ kind: 'rowset', body: pair }, TWO, []);
  assert.ok(m);
  assert.deepEqual(m.candidates.map((c) => c.name), ['', '']);
  assert.equal(keptName(m), '');
  assert.equal(words.mergedAll(keptName(m)), 'Merged them into one.');
  /* A NAME CARRIED ON THE BODY IS USED BEFORE THE ROW'S, and the record's handle is never one. */
  const named = mergeOf({ kind: 'rowset', body: { ...pair, candidates: [{ at: 'people#4', name: 'people#4' }, { at: 'people#1', name: 'Rohan', seen: ['Encore'] }] } }, TWO, []);
  assert.deepEqual(named?.candidates.map((c) => [c.name, c.seen]), [['Rohan', ['Encore']], ['', []]]);
});

test('three spellings fold into one in one question, and a rowset that does anything else is not a merge', () => {
  const three = {
    register: 'people',
    rows: [
      { at: 'people#2', version: 1, patch: { merged_into: 'people#1', deleted_at: 'x' } },
      { at: 'people#3', version: 1, patch: { merged_into: 'people#1', deleted_at: 'x' } },
    ],
  };
  assert.deepEqual(mergeOf({ kind: 'rowset', body: three }, TWO)?.candidates.map((c) => [c.key, c.kept]), [
    ['people#1', true],
    ['people#2', false],
    ['people#3', false],
  ]);
  /* INTO TWO DIFFERENT PEOPLE, a patch on someone else, a row added, a fold that deletes nothing, and no folds at all. */
  const into = { ...three, rows: [three.rows[0], { at: 'people#3', version: 1, patch: { merged_into: 'people#9', deleted_at: 'x' } }] };
  const other = { ...three, rows: [...three.rows, { at: 'people#7', version: 1, patch: { role: 'Design' } }] };
  const added = { ...three, rows: [...three.rows, { name: 'Ada' }] };
  const kept = { ...three, rows: [{ at: 'people#2', version: 1, patch: { merged_into: 'people#1' } }] };
  const none = { register: 'people', rows: [{ at: 'people#1', version: 1, patch: { role: 'Design' } }] };
  for (const body of [into, other, added, kept, none]) assert.equal(mergeOf({ kind: 'rowset', body }, TWO), null, JSON.stringify(body.rows));
  /* NOR ANY OTHER KIND, NOR A QUESTION WITHOUT ITS TWO ANSWERS. */
  assert.equal(mergeOf({ kind: 'change', body: three }, TWO), null);
  assert.equal(mergeOf({ kind: 'rowset', body: three }, ['accept']), null);
  assert.equal(mergeOf(undefined, TWO), null);
});

test('a cluster asked as options draws a Pick only on the names the record offers one for', () => {
  const body = {
    options: [],
    candidates: [
      { at: 'people#1', name: 'Rohan Mehta', seen: ['Encore', '6 commits'], kept: true },
      { at: 'people#4', name: 'rohanmehta', seen: 'github' },
      { at: 'people#6', name: 'jherrerastudio', seen: ['mail from herrera.studio'] },
    ],
  };
  const offered = ['merge', 'apart', 'pick:people#4', 'pick:jherrerastudio'];
  const m = mergeOf({ kind: 'options', body }, offered);
  assert.ok(m);
  assert.deepEqual(m.all, { option: 'merge' });
  assert.deepEqual(m.apart, { option: 'apart' });
  assert.deepEqual(
    m.candidates.map((c) => [c.name, c.kept, c.seen, c.pick?.option ?? null]),
    [
      ['Rohan Mehta', true, ['6 commits', 'Encore'], null],
      ['rohanmehta', false, ['github'], 'pick:people#4'],
      /* A PICK MAY NAME THE ONE IT IS FOR BY NAME as well as by its handle. */
      ['jherrerastudio', false, ['mail from herrera.studio'], 'pick:jherrerastudio'],
    ],
  );
  /* WITHOUT MERGE ALL OR KEEP APART, OR WITH ONE NAME, IT IS SOME OTHER QUESTION. */
  assert.equal(mergeOf({ kind: 'options', body }, ['merge', 'pick:people#4']), null);
  assert.equal(mergeOf({ kind: 'options', body: { candidates: body.candidates.slice(0, 1) } }, offered), null);
});

test('where one was seen is the record’s lines, newest first, each once, at most three', () => {
  assert.deepEqual(seenOf(['2026-01-01 · a', '2026-01-02 · b', '2026-01-03 · a', '2026-01-04 · c', '2026-01-05 · d']), ['d', 'c', 'a']);
  assert.equal(SEEN_MOST, 3);
  assert.deepEqual(seenOf('Encore'), ['Encore']);
  assert.deepEqual(seenOf(['~/code/x', 'C:\\Users\\h', '', 7]), []);
  assert.deepEqual(seenOf(undefined), []);
});

test('the card’s words are plain: no em dash, no word of the system’s, and no handle', () => {
  const said: string[] = [
    ...(Object.values(words) as unknown[]).filter((v): v is string => typeof v === 'string'),
    words.lead(2),
    words.lead(4),
    words.seen([]),
    words.seen(['Encore']),
    words.pickNamed('Rohan Mehta'),
    words.mergedAll('Rohan Mehta'),
    words.mergedAll(''),
    words.picked('Rohan Mehta'),
    words.picked(''),
  ];
  for (const line of said) {
    assert.doesNotMatch(line, /—/u, `"${line}" carries an em dash`);
    assert.doesNotMatch(line, /\b(row|rows|entity|list item|record)\b/iu, `"${line}" says a word of the system's`);
  }
  assert.equal(words.lead(3), 'These 3 may be the same.');
  assert.equal(words.seen(['Encore', 'github']), 'Seen in Encore, github');
  assert.equal(words.seen([]), '', 'a name seen nowhere gets a line saying so');
});
